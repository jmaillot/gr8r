/* =====================================================================
   Backup scheduler suite (Phase 87, plan 87-02, BKBCK-03/BKBCK-04).

   Wave-2 file. The 87-02 tracer slice pins ONE path end-to-end —
   "due task fires via sweep → persisted run row" — plus the writer-seam
   coverage of the manual trigger:
   - the sweep: a task with next_run_at forced into the past fires exactly
     once through runBackupSchedulerPass (driven via the test-only
     /api/internal/backup-scheduler-pass route with an injectable { now }
     clock — the reminder-pass harness pattern), a backup_runs row is
     persisted with trigger='scheduled', task_id set, non-null started_at,
     and next_run_at advances from NOW (never iterates missed windows —
     that recompute IS the D-05 at-most-once catch-up);
   - the writer seam: a manual POST /api/backup/runs run persists its own
     backup_runs row (BKBCK-04 — both triggers produce history; 86-D-11
     hands persistence to this phase), with the frozen 86-D-14 manual
     naming while scheduled fires use the D-11 task-scoped name.
   Scheduler semantics (overlap skip, catch-up-once matrix, disabled skip,
   boot stale-row sweep, malformed-cron resilience) extend this file in
   the 87-02 semantics task; the history read endpoint lands in the
   87-02 history task.
   Pattern: test/backup-tasks-api.test.mjs harness (startServer-per-case,
   withDb for direct row inspection, makeBackupOp through the Phase 85
   grant route).
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ADMIN, login, signup, startServer, withDb } from './helpers/server.mjs';

const BACKUP_TOKEN = 'scheduler-test-token';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const userIdByEmail = (srv, email) => withDb(srv.dbPath, db => db.prepare('select id from users where email = ?').get(email).id);
const taskRow = (srv, id) => withDb(srv.dbPath, db => db.prepare('select * from backup_tasks where id = ?').get(id));
const runRows = (srv, taskId) =>
  withDb(srv.dbPath, db => db.prepare('select * from backup_runs where task_id = ? order by created_at, id').all(taskId));

/* A holder + the operator client, granted through the Phase 85 grant route. */
async function makeBackupOp(server, email) {
  const joined = await signup(server.base, { name: 'Backup Op', email });
  assert.equal(joined.status, 201, `signup ${email}: ${JSON.stringify(joined.data)}`);
  const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
  const grant = await operator.post('/api/auth/operator/instance-roles', { userId: userIdByEmail(server, email), role: 'backup_operator' });
  assert.equal(grant.status, 200, `grant: ${JSON.stringify(grant.data)}`);
  return (await login(server.base, email, 'password-1234')).client;
}

/* Drive the sweep through the test-only internal route with an injectable
   clock (exists ONLY while BACKUP_TEST_TOKEN is set — production 404s). */
const schedulerPass = (srv, nowMs) =>
  fetch(`${srv.base}/api/internal/backup-scheduler-pass`, {
    method: 'POST',
    headers: { 'x-backup-token': BACKUP_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({ now: new Date(nowMs).toISOString() }),
  }).then(async r => {
    assert.equal(r.status, 200, `scheduler pass: ${r.status}`);
    return r.json();
  });

/* Poll the frozen current-run surface until the run leaves the active
   stages (bounded — never a bare sleep). */
async function waitRunFinished(srv, op, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const cur = await op.get('/api/backup/runs/current');
    assert.equal(cur.status, 200, `current: ${JSON.stringify(cur.data)}`);
    const stage = cur.data.stage;
    if (stage === 'done' || stage === 'failed' || stage === 'idle') return cur.data;
    if (Date.now() > deadline) throw new Error(`run never finished (stage=${stage})`);
    await sleep(100);
  }
}

/* ---------- tracer slice: due task fires via sweep → persisted run row ---------- */

test('a due task fires through the sweep → persisted scheduled run row; next_run_at advances (D-05/D-11)', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
  try {
    const op = await makeBackupOp(server, 'op-sched@test.local');
    const created = await op.post('/api/backup/tasks', { name: 'Nightly', scope: { kind: 'instance' }, cron: '30 2 * * *' });
    assert.equal(created.status, 200, `create: ${JSON.stringify(created.data)}`);
    const id = created.data.task.id;

    /* Force the window into the past by direct write (the sweep is the only
       fire path — no API mints a due task). */
    const nowMs = Date.now();
    withDb(server.dbPath, db => db.prepare('update backup_tasks set next_run_at = ? where id = ?').run(nowMs - 60_000, id));

    const pass = await schedulerPass(server, nowMs);
    assert.equal(pass.fired, 1, 'exactly one due task');

    const rows = runRows(server, id);
    assert.equal(rows.length, 1, 'exactly one persisted run row');
    const row = rows[0];
    assert.equal(row.trigger, 'scheduled');
    assert.equal(row.task_id, id);
    assert.ok(Number.isInteger(row.started_at), 'non-null started_at');
    /* The instance-scope export of an empty data dir completes within the
       awaited pass — the writer seam already marked the outcome. */
    assert.equal(row.status, 'succeeded');
    /* D-11: the scheduled archive carries the task id — greppable on disk. */
    assert.match(row.filename, new RegExp(`^backup-task-${id}-\\d{8}-\\d{6}\\.tar\\.gz$`));
    assert.ok(row.sha256 && row.sha256.length === 64, 'whole-archive sha256 persisted');
    assert.ok(row.duration_ms >= 0, 'duration persisted');
    const archivePath = path.join(server.dataDir, 'backups', row.filename);
    assert.ok(fs.existsSync(archivePath), 'archive on disk in DATA_DIR/backups');
    assert.ok(fs.existsSync(`${archivePath}.sha256`), 'sidecar on disk');

    /* D-05: next_run_at recomputed from NOW — never from the missed window. */
    const after = taskRow(server, id);
    assert.ok(Number.isInteger(after.next_run_at) && after.next_run_at > nowMs, `next_run_at ${after.next_run_at} advanced past ${nowMs}`);
  } finally {
    await server.stop();
  }
});

test('a manual POST /api/backup/runs run persists a backup_runs row (writer seam covers the manual trigger, 86-D-14 naming frozen)', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
  try {
    const op = await makeBackupOp(server, 'op-manual@test.local');
    const started = await op.post('/api/backup/runs', { scope: { kind: 'instance' } });
    assert.equal(started.status, 200, `run now: ${JSON.stringify(started.data)}`);
    const runId = started.data.runId;
    assert.ok(runId, 'runId returned');

    await waitRunFinished(server, op);

    const row = withDb(server.dbPath, db => db.prepare('select * from backup_runs where id = ?').get(runId));
    assert.ok(row, 'manual run row persisted through the writer seam');
    assert.equal(row.trigger, 'manual');
    assert.equal(row.task_id, null, 'D-11: manual archives carry task_id NULL');
    assert.equal(row.status, 'succeeded');
    assert.match(row.filename, /^backup-instance-\d{8}-\d{6}\.tar\.gz$/, 'manual naming frozen per 86-D-14');
    assert.ok(row.sha256 && row.sha256.length === 64);
    assert.ok(Number.isInteger(row.size_bytes) && row.size_bytes > 0, 'size persisted');
    assert.ok(Number.isInteger(row.duration_ms), 'duration persisted');
    assert.ok(Number.isInteger(row.finished_at), 'finished_at persisted');
  } finally {
    await server.stop();
  }
});

test('the scheduler-pass route 404s without the test token (fail-closed like the reminder-pass pattern)', async () => {
  const server = await startServer({});
  try {
    const res = await fetch(`${server.base}/api/internal/backup-scheduler-pass`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 404, 'unset BACKUP_TEST_TOKEN → 404 like any unknown route');
  } finally {
    await server.stop();
  }
});
