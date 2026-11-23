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
import os from 'node:os';
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
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN, GR8R_INSTANCE_NAME: 'testsuite' } });
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
    /* Phase 92 (BKNAME-01): the scheduled archive carries the instance name,
       scope token and stored GFS marker (id-based rotation needs no taskId
       in the name). GR8R_INSTANCE_NAME pinned in this server's env. */
    assert.match(row.filename, /^testsuite-instance-[a-z]+-\d{4}-\d{2}-\d{2}\.tar\.gz$/, 'scheduled shape: instance-scope-gfs-date');
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
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN, GR8R_INSTANCE_NAME: 'testsuite' } });
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
    assert.match(row.filename, /^testsuite-instance-\d{4}-\d{2}-\d{2}\.tar\.gz$/, 'Phase 92 manual shape: instance segment + UTC date, NO GFS marker (D-01/BKNAME-01)');
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

/* ---------- semantics matrix (87-02 semantics task, D-05/D-06/D-07/T-87-04) ---------- */

test('a sweep fire during an active run records skipped_overlap and never starts a second export (D-06, 86-D-10)', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
  try {
    const op = await makeBackupOp(server, 'op-overlap@test.local');
    /* A large incompressible blob holds the manual export open long enough
       to observe the overlap deterministically (no sleeps-as-logic). */
    fs.writeFileSync(path.join(server.dataDir, 'blob.bin'), (await import('node:crypto')).randomBytes(48 * 1024 * 1024));

    const started = await op.post('/api/backup/runs', { scope: { kind: 'instance' } });
    assert.equal(started.status, 200, `run now: ${JSON.stringify(started.data)}`);

    /* Wait until the run reaches an active stage, then trigger the sweep. */
    let active = false;
    for (let i = 0; i < 200 && !active; i++) {
      const cur = await op.get('/api/backup/runs/current');
      if (['collecting', 'archiving', 'verifying'].includes(cur.data.stage)) active = true;
      else if (cur.data.stage === 'done' || cur.data.stage === 'failed') break;
      else await sleep(25);
    }
    assert.ok(active, 'manual run reached an active stage before the sweep fired');

    const created = await op.post('/api/backup/tasks', { name: 'Overlapped', scope: { kind: 'instance' }, cron: '0 3 * * *' });
    const id = created.data.task.id;
    const nowMs = Date.now();
    withDb(server.dbPath, db => db.prepare('update backup_tasks set next_run_at = ? where id = ?').run(nowMs - 60_000, id));

    await schedulerPass(server, nowMs);

    const rows = runRows(server, id);
    assert.equal(rows.length, 1, 'exactly one row for the refused fire');
    assert.equal(rows[0].status, 'skipped_overlap', 'overlap attempt recorded — never silent (D-06)');
    assert.equal(rows[0].trigger, 'scheduled');
    /* The in-memory single-run invariant held: only the manual run produced
       an archive (no second export started). */
    const current = await waitRunFinished(server, op);
    assert.equal(current.stage, 'done');

    /* D-06: next_run_at is STILL recomputed despite the skip. */
    const after = taskRow(server, id);
    assert.ok(Number.isInteger(after.next_run_at) && after.next_run_at > nowMs, 'next_run_at recomputed past now');
  } finally {
    await server.stop();
  }
});

test('next_run_at three windows in the past fires exactly ONCE — no per-window loop (D-05)', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
  try {
    const op = await makeBackupOp(server, 'op-catchup@test.local');
    const created = await op.post('/api/backup/tasks', { name: 'Daily', scope: { kind: 'instance' }, cron: '0 3 * * *' });
    const id = created.data.task.id;
    const nowMs = Date.now();
    /* Three daily windows missed while "the server was down". */
    withDb(server.dbPath, db => db.prepare('update backup_tasks set next_run_at = ? where id = ?').run(nowMs - 3 * 86_400_000, id));

    await schedulerPass(server, nowMs);

    const rows = runRows(server, id);
    assert.equal(rows.length, 1, 'exactly ONE new run row — missed windows collapse into one firing');
    assert.equal(rows[0].status, 'succeeded');
    assert.ok(!rows.some(r => r.status === 'skipped_overlap'), 'no spurious overlap rows either');
    const after = taskRow(server, id);
    assert.ok(Number.isInteger(after.next_run_at) && after.next_run_at > nowMs, 'recomputed from NOW, never per-window');
  } finally {
    await server.stop();
  }
});

test('a disabled task with a stale past next_run_at fires nothing (D-07)', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
  try {
    const op = await makeBackupOp(server, 'op-disabled@test.local');
    const created = await op.post('/api/backup/tasks', { name: 'Paused', scope: { kind: 'instance' }, cron: '0 3 * * *' });
    const id = created.data.task.id;
    const disabled = await op.put(`/api/backup/tasks/${id}`, { enabled: false });
    assert.equal(disabled.status, 200);
    /* Stale past cache while disabled (as if it were disabled while down). */
    const nowMs = Date.now();
    withDb(server.dbPath, db => db.prepare('update backup_tasks set enabled = 0, next_run_at = ? where id = ?').run(nowMs - 86_400_000, id));

    const pass = await schedulerPass(server, nowMs);
    assert.equal(pass.fired, 0, 'enabled=1 filter excludes the task');
    assert.equal(runRows(server, id).length, 0, 'disabled tasks never fire and never catch up (D-07)');
  } finally {
    await server.stop();
  }
});

test('re-enable recomputes next_run_at from now in the same write — never the stale value (D-07)', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
  try {
    const op = await makeBackupOp(server, 'op-reenable@test.local');
    const created = await op.post('/api/backup/tasks', { name: 'Hourly', scope: { kind: 'instance' }, cron: '15 * * * *' });
    const id = created.data.task.id;
    await op.put(`/api/backup/tasks/${id}`, { enabled: false });
    /* Plant a STALE past value while disabled — the surprise-catch-up trap
       (research Pitfall 2). */
    withDb(server.dbPath, db => db.prepare('update backup_tasks set next_run_at = ? where id = ?').run(Date.now() - 7 * 3_600_000, id));

    const beforeEnable = Date.now();
    const enabled = await op.put(`/api/backup/tasks/${id}`, { enabled: true });
    assert.equal(enabled.status, 200);
    const row = taskRow(server, id);
    assert.equal(row.enabled, 1);
    assert.ok(row.next_run_at > beforeEnable, `re-enabled value ${row.next_run_at} is a fresh future instant, not the stale past one`);
  } finally {
    await server.stop();
  }
});

test('boot marks stale status=running run rows interrupted (BKBCK-03)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-boot-'));
  const server1 = await startServer({ dataDir: dir });
  try {
    withDb(server1.dbPath, db =>
      db.prepare(
        "insert into backup_runs (id, task_id, scope, trigger, status, started_at, created_at) values ('run-boot-1', null, '{}', 'scheduled', 'running', ?, ?)",
      ).run(Date.now(), Date.now()),
    );
    const before = withDb(server1.dbPath, db => db.prepare('select status from backup_runs where id = ?').get('run-boot-1'));
    assert.equal(before.status, 'running');
  } finally {
    await server1.stop(); // owned=false — the dataDir survives for the reboot
  }

  const server2 = await startServer({ dataDir: dir });
  try {
    const row = withDb(server2.dbPath, db => db.prepare('select status from backup_runs where id = ?').get('run-boot-1'));
    assert.equal(row.status, 'interrupted', 'boot sweep turns stale running rows into interrupted');
  } finally {
    await server2.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a malformed stored cron logs, clears its cache, and never starves the other tasks in the same tick (T-87-04)', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
  try {
    const op = await makeBackupOp(server, 'op-badtas@test.local');
    const created = await op.post('/api/backup/tasks', { name: 'Healthy', scope: { kind: 'instance' }, cron: '0 3 * * *' });
    const healthyId = created.data.task.id;
    const nowMs = Date.now();
    /* The malformed row bypasses the API's write-time validation (a direct
       write, as a corrupted row would be) — the sweep must survive it. */
    withDb(server.dbPath, db =>
      db.prepare(
        "insert into backup_tasks (id, name, scope, cron, tz, enabled, retention_daily, retention_weekly, retention_monthly, retention_yearly, next_run_at, last_notified_state, created_at, updated_at) values ('task-bad','Corrupted','{\"kind\":\"instance\"}','not a cron !!','Europe/Paris',1,7,4,12,5,?,null,?,?)",
      ).run(nowMs - 60_000, nowMs, nowMs),
    );
    withDb(server.dbPath, db => db.prepare('update backup_tasks set next_run_at = ? where id = ?').run(nowMs - 60_000, healthyId));

    const pass = await schedulerPass(server, nowMs);
    assert.equal(pass.fired, 2, 'both due tasks were seen');

    const healthyRows = runRows(server, healthyId);
    assert.equal(healthyRows.length, 1, 'the healthy task still fired — one bad task never starves the others');
    assert.equal(healthyRows[0].status, 'succeeded');
    const badRow = taskRow(server, 'task-bad');
    assert.equal(badRow.next_run_at, null, 'malformed cron → cache cleared honestly, no fire');
    assert.equal(runRows(server, 'task-bad').length, 0, 'the malformed task fired nothing');

    const listed = await op.get('/api/backup/tasks');
    assert.equal(listed.status, 200, 'server alive after the malformed task (no process kill)');
  } finally {
    await server.stop();
  }
});

/* ---------- history read endpoint (87-02 history task, BKBCK-04/D-14) ---------- */

/* A Restore Operator + client, granted through the Phase 85 grant route. */
async function makeRestoreOp(server, email) {
  const joined = await signup(server.base, { name: 'Restore Op', email });
  assert.equal(joined.status, 201, `signup ${email}: ${JSON.stringify(joined.data)}`);
  const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
  const grant = await operator.post('/api/auth/operator/instance-roles', { userId: userIdByEmail(server, email), role: 'restore_operator' });
  assert.equal(grant.status, 200, `grant: ${JSON.stringify(grant.data)}`);
  return (await login(server.base, email, 'password-1234')).client;
}

const seedRun = (srv, { id, taskId, trigger = 'scheduled', status = 'succeeded', createdAt }) =>
  withDb(srv.dbPath, db =>
    db.prepare(
      'insert into backup_runs (id, task_id, scope, trigger, status, started_at, created_at) values (?,?,?,?,?,?,?)',
    ).run(id, taskId, '{}', trigger, status, createdAt, createdAt),
  );

test('GET /api/backup/runs?taskId= returns the task runs newest-first capped at 50 (D-14)', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
  try {
    const op = await makeBackupOp(server, 'op-history@test.local');
    const created = await op.post('/api/backup/tasks', { name: 'History', scope: { kind: 'instance' }, cron: '0 3 * * *' });
    const id = created.data.task.id;
    const base = 1_700_000_000_000;
    /* Seed 55 rows with DISTINCT descending created_at values (deterministic
       order + cap math). */
    for (let i = 0; i < 55; i++) seedRun(server, { id: `hist-${i}`, taskId: id, createdAt: base + i * 1000 });

    const res = await op.get(`/api/backup/runs?taskId=${id}`);
    assert.equal(res.status, 200);
    const runs = res.data.runs;
    assert.equal(runs.length, 50, 'capped at exactly 50 (D-14)');
    for (let i = 1; i < runs.length; i++) {
      assert.ok(runs[i - 1].created_at >= runs[i].created_at, 'newest first (created_at desc)');
    }
    assert.equal(runs[0].id, 'hist-54', 'the newest row leads');
    /* Field projection carries the history-card contract (D-14). */
    const row = runs[0];
    for (const field of ['id', 'trigger', 'status', 'started_at', 'finished_at', 'duration_ms', 'size_bytes', 'sha256', 'filename', 'error', 'task_id']) {
      assert.ok(field in row, `field ${field} present`);
    }
    assert.equal(row.task_id, id);
    assert.ok(!('scope' in row), 'internal scope JSON is not projected');
  } finally {
    await server.stop();
  }
});

test('history read gate: RESTORE_USE-only holder reads; non-holder gets keyed 403 backupManageRequired (T-86-06: taskNotFound only after the gate)', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
  try {
    const op = await makeBackupOp(server, 'op-gate@test.local');
    const created = await op.post('/api/backup/tasks', { name: 'Gated', scope: { kind: 'instance' }, cron: '0 3 * * *' });
    const id = created.data.task.id;
    seedRun(server, { id: 'hist-gate-1', taskId: id, createdAt: Date.now() });

    const ro = await makeRestoreOp(server, 'ro-history@test.local');
    const ok = await ro.get(`/api/backup/runs?taskId=${id}`);
    assert.equal(ok.status, 200, 'RESTORE_USE-only holder may read (D-33-7)');
    assert.equal(ok.data.runs.length, 1);

    const plain = (await signup(server.base, { name: 'Nobody', email: 'plain-history@test.local' })).client;
    const refused = await plain.get(`/api/backup/runs?taskId=${id}`);
    assert.equal(refused.status, 403);
    assert.equal(refused.data.code, 'backupManageRequired');

    const missing = await op.get('/api/backup/runs?taskId=does-not-exist');
    assert.equal(missing.status, 404);
    assert.equal(missing.data.code, 'taskNotFound');
    const malformed = await op.get('/api/backup/runs?taskId=..%2Fetc');
    assert.equal(malformed.status, 404);
    assert.equal(malformed.data.code, 'taskNotFound', 'same keyed refusal — no which-part oracle');
  } finally {
    await server.stop();
  }
});

test('taskId=manual lists the manual Run-now archives (task_id NULL, D-11); the frozen current GET is untouched', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
  try {
    const op = await makeBackupOp(server, 'op-manualq@test.local');
    seedRun(server, { id: 'man-1', taskId: null, trigger: 'manual', createdAt: 1_700_000_000_000 });
    seedRun(server, { id: 'man-2', taskId: null, trigger: 'manual', createdAt: 1_700_000_050_000 });

    const res = await op.get('/api/backup/runs?taskId=manual');
    assert.equal(res.status, 200);
    assert.equal(res.data.runs.length, 2);
    assert.ok(res.data.runs.every(r => r.task_id === null && r.trigger === 'manual'));
    assert.equal(res.data.runs[0].id, 'man-2', 'newest first');

    /* The frozen Phase 86 surface still answers byte-compatibly. */
    const cur = await op.get('/api/backup/runs/current');
    assert.equal(cur.status, 200);
    assert.equal(cur.data.stage, 'idle');
  } finally {
    await server.stop();
  }
});

/* ---------- 89-02: mutual exclusion export-side half (D-89-1) ---------- */

test('a sweep fire while a restore lock is held records skipped_overlap with reason restore_in_progress and never starts an export (D-89-1, 89-02)', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
  try {
    const op = await makeBackupOp(server, 'op-restore-overlap@test.local');
    const created = await op.post('/api/backup/tasks', { name: 'RestoreHeld', scope: { kind: 'instance' }, cron: '0 4 * * *' });
    assert.equal(created.status, 200, `create: ${JSON.stringify(created.data)}`);
    const id = created.data.task.id;

    /* Plant the restore claim directly — the restore trigger routes land in
       plan 04; the lock row is the only state the scheduler must honor. */
    withDb(server.dbPath, db => db.prepare('update restore_lock set claimed_by = ?, claimed_at = ? where id = 1').run('restorer-2', Date.now()));

    const nowMs = Date.now();
    withDb(server.dbPath, db => db.prepare('update backup_tasks set next_run_at = ? where id = ?').run(nowMs - 60_000, id));

    const pass = await schedulerPass(server, nowMs);
    assert.equal(pass.fired, 1, 'the due task entered the pass');

    const rows = runRows(server, id);
    assert.equal(rows.length, 1, 'exactly one row for the refused fire');
    assert.equal(rows[0].status, 'skipped_overlap', 'the refusal is recorded — never silent (D-06)');
    assert.equal(rows[0].error, 'restore_in_progress', 'the skip reason names the restore lock');
    assert.equal(rows[0].trigger, 'scheduled');
    /* No archive started: only the manual-free path below may add rows. */
    assert.ok(!fs.existsSync(path.join(server.dataDir, 'backups')) || fs.readdirSync(path.join(server.dataDir, 'backups')).length === 0, 'no export artifacts under the lock');

    /* Free the lock → the same task fires exactly as before (regression control). */
    withDb(server.dbPath, db => db.prepare('update restore_lock set claimed_by = null, claimed_at = null where id = 1').run());
    const now2 = Date.now();
    withDb(server.dbPath, db => db.prepare('update backup_tasks set next_run_at = ? where id = ?').run(now2 - 60_000, id));
    await schedulerPass(server, now2);
    const rows2 = runRows(server, id);
    assert.ok(rows2.some(r => r.status === 'succeeded'), 'free-lock fire behaves exactly as before');
  } finally {
    await server.stop();
  }
});
