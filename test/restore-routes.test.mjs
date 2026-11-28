/* =====================================================================
   Restore persistence suite (Phase 89, plan 89-02, BKRST-02/BKRST-03).

   Pins the restore persistence substrate before any restore route exists:
   - schema (tracer): restore_runs + restore_lock exist on BOTH engines
     after boot with the D-89-2/D-89-31 columns; a second boot on the same
     db path is a no-op (runSchema idempotence + insert-or-ignore seed);
   - boot sweeps: planted running restore_runs rows become interrupted /
     stage failed with error text (87's stale-sweep idiom, D-89-31) while
     done/failed rows stay untouched; a planted claimed restore_lock is
     released at boot;
   - lock CAS (D-89-31): the engine-neutral single-row claim — a second
     claim while held does not succeed, release is holder-checked;
   - run writer seam (D-89-2/D-89-29): start/update/fail/finish events
     persist the full stage vocabulary best-effort (300-char error slice,
     planted writer exceptions never fail the caller);
   - mutual exclusion export-side half (D-89-1): while the lock is held,
     the manual backup trigger refuses keyed backupRestoreInProgress
     (audited, no backup_runs row) and a scheduler fire records a
     skipped_overlap row with reason restore_in_progress instead of
     starting an export.
   Pattern: test/backup-routes.test.mjs — startServer-per-case with the
   shared harness, withDb for direct row inspection.
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ADMIN, client, login, signup, startServer, withDb } from './helpers/server.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* D-89-2/D-89-29 column + vocabulary contracts (byte-pinned against the
   SCHEMA block in server.js and its SQLITE_SCHEMA twin in db-adapter.mjs). */
const RESTORE_RUN_COLUMNS = [
  'id',
  'scope',
  'trigger',
  'status',
  'stage',
  'final_name',
  'summary',
  'snapshot_run_id',
  'snapshot_tag',
  'error',
  'started_at',
  'finished_at',
  'created_at',
  'archive_name', // UAT 2026-11-27: the source archive filename rides the history (adapterEnsureColumn appends)
  'created_by', // Phase 108 CARRY-02: the operator's uid, stamped at the start event (adapterEnsureColumn appends) — write-once at start
];
const RESTORE_LOCK_COLUMNS = ['id', 'claimed_by', 'claimed_at'];
const RESTORE_TRIGGERS = ['import_new', 'overwrite', 'instance'];
const RESTORE_STATUSES = ['running', 'done', 'failed', 'interrupted'];
const RESTORE_STAGES = ['fetching', 'validating', 'restoring', 'verifying', 'done', 'failed'];

const columnsOf = (db, table) => db.prepare(`pragma table_info(${table})`).all().map(c => c.name);
const insertRunRow = (db, { id, trigger = 'import_new', status, stage, startedAt, finishedAt = null, error = null }) =>
  db.prepare(
    'insert into restore_runs (id, scope, trigger, status, stage, started_at, finished_at, error, created_at) values (?,?,?,?,?,?,?,?,?)',
  ).run(id, '{}', trigger, status, stage, startedAt, finishedAt, error, startedAt);

async function bootTwice(plants = null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-restore-'));
  const first = await startServer({ dataDir: dir });
  await first.stop();
  if (plants) withDb(first.dbPath, plants);
  const second = await startServer({ dataDir: dir });
  return { dir, srv: second, async close() { await second.stop(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

/* ---------- Task 1: schema + boot sweeps (tracer) ---------- */

test('89-02 boot (tracer): restore_runs + restore_lock exist with the D-89-2/D-89-31 columns; the lock is seeded once', async () => {
  const srv = await startServer();
  try {
    const shape = withDb(srv.dbPath, db => ({
      runs: columnsOf(db, 'restore_runs'),
      lock: columnsOf(db, 'restore_lock'),
      locks: db.prepare('select * from restore_lock').all(),
      index: db.prepare("select name from sqlite_master where type = 'index' and name = 'restore_runs_created'").get(),
    }));
    assert.deepEqual(shape.runs, RESTORE_RUN_COLUMNS, 'restore_runs columns drifted');
    assert.deepEqual(shape.lock, RESTORE_LOCK_COLUMNS, 'restore_lock columns drifted');
    assert.equal(shape.locks.length, 1, 'exactly one seeded lock row');
    assert.equal(shape.locks[0].id, 1);
    assert.equal(shape.locks[0].claimed_by, null);
    assert.equal(shape.locks[0].claimed_at, null);
    assert.ok(shape.index, 'restore_runs_created index exists');
  } finally {
    await srv.stop();
  }
});

test('89-02 boot: a second boot on the same db path is a no-op (no duplicate seed, no schema error)', async () => {
  const run = await bootTwice();
  try {
    const locks = withDb(run.srv.dbPath, db => db.prepare('select * from restore_lock').all());
    assert.equal(locks.length, 1, 'seed stays single-row on reboot');
    assert.ok(!/create table|already exists|duplicate/i.test(run.srv.output()), 'second boot logs no schema error');
  } finally {
    await run.close();
  }
});

test('89-02 boot sweep: planted running restore_runs rows become interrupted/failed with error; done/failed rows untouched', async () => {
  const t0 = Date.now() - 60_000;
  const run = await bootTwice(db => {
    insertRunRow(db, { id: 'run-stale', status: 'running', stage: 'restoring', startedAt: t0 });
    insertRunRow(db, { id: 'run-done', status: 'done', stage: 'done', startedAt: t0, finishedAt: t0 + 1000 });
    insertRunRow(db, { id: 'run-failed', status: 'failed', stage: 'failed', startedAt: t0, finishedAt: t0 + 500, error: 'boom' });
  });
  try {
    const rows = withDb(run.srv.dbPath, db => db.prepare('select * from restore_runs order by id').all());
    const stale = rows.find(r => r.id === 'run-stale');
    assert.equal(stale.status, 'interrupted', 'stale running row interrupted at boot');
    assert.equal(stale.stage, 'failed', 'stale stage failed (D-89-29 vocabulary)');
    assert.ok(/interrupted at boot/.test(stale.error || ''), 'honest boot-interruption error text');
    assert.ok(stale.finished_at, 'finished_at stamped');
    const done = rows.find(r => r.id === 'run-done');
    assert.equal(done.status, 'done', 'terminal rows never touched');
    assert.equal(done.error, null);
    const failed = rows.find(r => r.id === 'run-failed');
    assert.equal(failed.status, 'failed');
    assert.equal(failed.error, 'boom', 'original error preserved');
  } finally {
    await run.close();
  }
});

test('89-02 boot sweep: a planted claimed restore_lock is released', async () => {
  const t0 = Date.now() - 60_000;
  const run = await bootTwice(db => {
    db.prepare('update restore_lock set claimed_by = ?, claimed_at = ? where id = 1').run('user-stale', t0);
  });
  try {
    const lock = withDb(run.srv.dbPath, db => db.prepare('select * from restore_lock where id = 1').get());
    assert.equal(lock.claimed_by, null, 'stale claim released at boot');
    assert.equal(lock.claimed_at, null, 'claimed_at cleared with the claim');
  } finally {
    await run.close();
  }
});

/* ---------- Task 2: restore_lock CAS + restore run writer seam ---------- */

/* The test-only probe route (the backup-scheduler-pass harness pattern):
   drives claimRestoreLock/releaseRestoreLock + emitRestoreRunEvent
   directly — these helpers are server-internal, so the probe is the
   observable surface. Exists ONLY while RESTORE_TEST_TOKEN is set. */
const RESTORE_TOKEN = 'restore-probe-token';
const probe = (srv, body) =>
  fetch(`${srv.base}/api/internal/restore-probe`, {
    method: 'POST',
    headers: { 'x-restore-token': RESTORE_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));

const bootProbe = async () => startServer({ env: { RESTORE_TEST_TOKEN: RESTORE_TOKEN } });

test('89-02 CAS: claim succeeds on a free lock; a second claim for another user fails leaving the row unchanged', async () => {
  const srv = await bootProbe();
  try {
    const first = await probe(srv, { action: 'claim', userId: 'user-1' });
    assert.equal(first.data.claimed, true, 'first claim wins on a free lock');
    const row1 = await probe(srv, { action: 'lockRow' });
    assert.equal(row1.data.lock.claimed_by, 'user-1');
    assert.ok(Number.isInteger(row1.data.lock.claimed_at), 'claimed_at stamped as epoch-ms');

    const second = await probe(srv, { action: 'claim', userId: 'user-2' });
    assert.equal(second.data.claimed, false, 'second claim rejected while held (CAS)');
    const row2 = await probe(srv, { action: 'lockRow' });
    assert.equal(row2.data.lock.claimed_by, 'user-1', 'row unchanged by the refused claim');
    assert.equal(row2.data.lock.claimed_at, row1.data.lock.claimed_at, 'claimed_at untouched by the refused claim');
  } finally {
    await srv.stop();
  }
});

test('89-02 CAS: release is holder-checked — a non-holder release leaves the claim intact', async () => {
  const srv = await bootProbe();
  try {
    await probe(srv, { action: 'claim', userId: 'user-1' });
    const wrong = await probe(srv, { action: 'release', userId: 'user-2' });
    assert.equal(wrong.data.released, false, 'non-holder release rejected');
    const intact = await probe(srv, { action: 'lockRow' });
    assert.equal(intact.data.lock.claimed_by, 'user-1', 'claim survives the non-holder release');

    const right = await probe(srv, { action: 'release', userId: 'user-1' });
    assert.equal(right.data.released, true, 'holder release succeeds');
    const freed = await probe(srv, { action: 'lockRow' });
    assert.equal(freed.data.lock.claimed_by, null);
    assert.equal(freed.data.lock.claimed_at, null);

    const again = await probe(srv, { action: 'release', userId: 'user-1' });
    assert.equal(again.data.released, false, 'release on a free lock reports false');
    const reclaim = await probe(srv, { action: 'claim', userId: 'user-3' });
    assert.equal(reclaim.data.claimed, true, 'lock re-claimable after release');
  } finally {
    await srv.stop();
  }
});

test('89-02 writer: start/update/fail persist the D-89-29 stage vocabulary verbatim with the 300-char error slice', async () => {
  const srv = await bootProbe();
  try {
    const t0 = Date.now();
    const started = await probe(srv, { action: 'emit', event: { kind: 'start', runId: 'r-1', scope: { kind: 'workspace', id: 'ws-1' }, trigger: 'import_new', startedAt: t0 } });
    assert.equal(started.status, 200);
    assert.equal(started.data.row.status, 'running', 'start inserts a running row');
    assert.equal(started.data.row.stage, 'fetching', 'start stage is fetching (D-89-29 first stage)');
    assert.deepEqual(JSON.parse(started.data.row.scope), { kind: 'workspace', id: 'ws-1' });
    assert.equal(started.data.row.trigger, 'import_new');
    assert.equal(started.data.row.started_at, t0);

    const updated = await probe(srv, { action: 'emit', event: { kind: 'update', runId: 'r-1', stage: 'restoring', snapshotRunId: 'snap-1', snapshotTag: 'pre_restore', finalName: 'ws-restored' } });
    assert.equal(updated.data.row.stage, 'restoring', 'stage transitions persist verbatim');
    assert.equal(updated.data.row.snapshot_run_id, 'snap-1');
    assert.equal(updated.data.row.snapshot_tag, 'pre_restore');
    assert.equal(updated.data.row.final_name, 'ws-restored');

    const verify = await probe(srv, { action: 'emit', event: { kind: 'update', runId: 'r-1', stage: 'verifying' } });
    assert.equal(verify.data.row.stage, 'verifying', 'later stage transition lands');
    assert.equal(verify.data.row.snapshot_run_id, 'snap-1', 'coalesce keeps earlier fields');

    const longError = 'x'.repeat(500);
    const failed = await probe(srv, { action: 'emit', event: { kind: 'fail', runId: 'r-1', error: longError, finishedAt: t0 + 5000 } });
    assert.equal(failed.data.row.status, 'failed');
    assert.equal(failed.data.row.stage, 'failed', 'fail forces stage failed');
    assert.equal(failed.data.row.error.length, 300, 'error text sliced to 300 chars');
    assert.equal(failed.data.row.finished_at, t0 + 5000);
    assert.equal(failed.data.row.final_name, 'ws-restored', 'fail preserves the final name');
  } finally {
    await srv.stop();
  }
});

test('89-02 writer: finish lands status/stage done and persists summary; every trigger value round-trips', async () => {
  const srv = await bootProbe();
  try {
    const t0 = Date.now();
    const summary = JSON.stringify({ skipped: [], tables: 4 });
    for (const trigger of RESTORE_TRIGGERS) {
      const runId = `r-${trigger}`;
      await probe(srv, { action: 'emit', event: { kind: 'start', runId, scope: { kind: trigger === 'instance' ? 'instance' : 'workspace', id: null }, trigger, startedAt: t0 } });
      const done = await probe(srv, { action: 'emit', event: { kind: 'finish', runId, summary, finalName: `${trigger}-restored`, finishedAt: t0 + 100 } });
      assert.equal(done.data.row.status, 'done', `${trigger}: finish lands done`);
      assert.equal(done.data.row.stage, 'done', `${trigger}: finish stage done`);
      assert.equal(done.data.row.summary, summary, 'summary payload persisted');
      assert.equal(done.data.row.final_name, `${trigger}-restored`);
      assert.equal(done.data.row.finished_at, t0 + 100);
    }
  } finally {
    await srv.stop();
  }
});

test('89-02 writer: a planted writer exception (CHECK violation) never fails the caller — best-effort discipline', async () => {
  const srv = await bootProbe();
  try {
    // trigger 'bogus' violates the restore_runs trigger CHECK — the writer
    // insert throws and the seam must swallow it (the probe still 200s).
    const res = await probe(srv, { action: 'emit', event: { kind: 'start', runId: 'r-bogus', scope: {}, trigger: 'bogus', startedAt: Date.now() } });
    assert.equal(res.status, 200, 'the emitting caller never sees the writer error');
    assert.equal(res.data.row, null, 'no row persisted for the refused event');
    // the seam stays alive for the next event
    const ok = await probe(srv, { action: 'emit', event: { kind: 'start', runId: 'r-after', scope: { kind: 'workspace', id: null }, trigger: 'import_new', startedAt: Date.now() } });
    assert.equal(ok.data.row.status, 'running', 'the writer seam still works after a swallowed error');
  } finally {
    await srv.stop();
  }
});

/* ---------- Task 3: mutual exclusion export-side half (D-89-1) ---------- */

/* A holder + the operator client granted through the Phase 85 grant route
   (the makeBackupOp idiom from test/backup-routes.test.mjs). */
async function makeBackupOp(server, email) {
  const joined = await signup(server.base, { name: 'Backup Op', email });
  assert.equal(joined.status, 201, `signup ${email}: ${JSON.stringify(joined.data)}`);
  const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
  const grant = await operator.post('/api/auth/operator/instance-roles', { userId: userIdByEmail(server, email), role: 'backup_operator' });
  assert.equal(grant.status, 200, `grant: ${JSON.stringify(grant.data)}`);
  return (await login(server.base, email, 'password-1234')).client;
}
const userIdByEmail = (srv, email) => withDb(srv.dbPath, db => db.prepare('select id from users where email = ?').get(email).id);

test('89-02 mutual exclusion: a held restore lock refuses the manual backup trigger keyed + audited, no backup_runs row (D-89-1)', async () => {
  const srv = await bootProbe();
  try {
    const op = await makeBackupOp(srv, 'op-backup-lock@test.local');
    /* Plant the claim directly — the restore trigger routes land in plan 04. */
    withDb(srv.dbPath, db => db.prepare('update restore_lock set claimed_by = ?, claimed_at = ? where id = 1').run('restorer-1', Date.now()));

    const refused = await op.post('/api/backup/runs', { scope: { kind: 'instance' } });
    assert.equal(refused.status, 409, `restore-held trigger: ${JSON.stringify(refused.data)}`);
    assert.equal(refused.data.code, 'backupRestoreInProgress', 'the shared D-89-1 refusal vocabulary');

    const audits = withDb(srv.dbPath, db => db.prepare("select * from audit_log where action like 'backup_run_refused:%'").all());
    assert.ok(audits.some(a => a.action === 'backup_run_refused:restoreInProgress'), 'the refused attempt is audited (D-89-22)');

    const runs = withDb(srv.dbPath, db => db.prepare('select * from backup_runs').all());
    assert.equal(runs.length, 0, 'no backup run row created — no export started');

    /* With the lock free, the same operator fires normally (no behavior change). */
    await probe(srv, { action: 'release', userId: 'restorer-1' });
    const started = await op.post('/api/backup/runs', { scope: { kind: 'instance' } });
    assert.equal(started.status, 200, `free-lock trigger: ${JSON.stringify(started.data)}`);
    assert.match(started.data.runId, UUID_RE, 'free lock behaves exactly as before');
  } finally {
    await srv.stop();
  }
});

/* =====================================================================
   89-04 Task 2 (RED): POST /api/backup/restore trigger + poll routes.
   Pins the full trigger funnel (guard chain verbatim from the backup
   trigger: sameOrigin -> requireUser -> tooMany restorerun|id 5/15min ->
   RESTORE_USE gate -> body checks -> D-89-23 live-membership targeting
   BEFORE the lock claim -> concurrency slot -> claim -> start row ->
   fire-and-forget runRestore -> audit -> 200 { runId }), the D-89-29
   stage walk through the real pipeline, the D-89-13 -restored counter
   at route level, and the D-89-33 keyed failure persistence at run
   level.
   ===================================================================== */
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const grantRole = async (srv, email, role) => {
  const admin = (await login(srv.base, ADMIN.email, ADMIN.password)).client;
  const grant = await admin.post('/api/auth/operator/instance-roles', { userId: userIdByEmail(srv, email), role });
  assert.equal(grant.status, 200, `grant ${role}: ${JSON.stringify(grant.data)}`);
};
const makeRestoreOp = async (srv, email) => {
  const joined = await signup(srv.base, { name: 'Restore Op', email });
  assert.equal(joined.status, 201, `signup ${email}: ${JSON.stringify(joined.data)}`);
  await grantRole(srv, email, 'restore_operator');
  return (await login(srv.base, email, 'password-1234')).client;
};
const makeDualOp = async (srv, email) => {
  const op = await makeRestoreOp(srv, email);
  await grantRole(srv, email, 'backup_operator');
  return op;
};

const pollDb = (dbPath, read, { timeoutMs = 20000 } = {}) =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      let v = null;
      try {
        v = withDb(dbPath, read);
      } catch {
        /* transient read trouble — keep polling */
      }
      if (v) return resolve(v);
      if (Date.now() > deadline) return reject(new Error('pollDb timeout'));
      setTimeout(tick, 40);
    };
    tick();
  });

/* Seed a workspace the operator owns, with a project graph worth backing
   up + restoring (project p1, task t1). */
const seedWorkspace = (dbPath, { id = 'ws-a', slug = 'acme-fixture', name = 'Acme', ownerId, withProject = true } = {}) =>
  withDb(dbPath, db => {
    const doc = {
      data: {
        projects: withProject ? [{ id: 'p1', name: 'Alpha', color: '#111111' }] : [],
        tasks: withProject ? [{ id: 't1', project: 'p1', title: 'Task One', desc: '' }] : [],
        comments: [],
        files: [],
        teams: [],
        projOrder: withProject ? ['p1'] : [],
      },
    };
    const t = Date.now();
    db.prepare('insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at) values (?,?,?,?,?,?,?,?)').run(
      id, slug, name, '#123456', JSON.stringify(doc), 1, t, t,
    );
    db.prepare('insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)').run(
      id, ownerId, 'owner', `m_${String(ownerId).slice(0, 8)}`, 'manual',
    );
  });

const pollRestoreCurrent = (op, { until = null, timeoutMs = 20000 } = {}) =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const seen = [];
    const tick = async () => {
      const res = await op.get('/api/backup/restore/current');
      assert.equal(res.status, 200, `restore/current poll: ${JSON.stringify(res.data)}`);
      seen.push(res.data);
      if (until ? until(res.data) : true) return resolve({ last: res.data, seen });
      if (Date.now() > deadline) return reject(new Error(`restore/current poll timeout — seen: ${JSON.stringify(seen)}`));
      setTimeout(tick, 40);
    };
    tick();
  });

test('89-04 trigger+poll: POST returns a fresh uuid immediately; the pipeline walks to done; current serves the stage verbatim then idle; the D-89-13 counter chain lands -restored then -restored-2', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-restore-trigger-'));
  const srv = await startServer({ dataDir });
  try {
    const op = await makeDualOp(srv, 'trigger-op@test.local');
    seedWorkspace(srv.dbPath, { ownerId: userIdByEmail(srv, 'trigger-op@test.local') });

    const backup = await op.post('/api/backup/runs', { scope: { kind: 'workspace', id: 'ws-a' } });
    assert.equal(backup.status, 200, `backup trigger: ${JSON.stringify(backup.data)}`);
    const backupRunId = backup.data.runId;
    await pollCurrent(op, { until: p => p.stage === 'done' || p.stage === 'failed' });

    /* first restore: immediate keyed-uuid response (D-89-2) */
    const res = await op.post('/api/backup/restore', { runId: backupRunId });
    assert.equal(res.status, 200, `restore trigger: ${JSON.stringify(res.data)}`);
    assert.match(res.data.runId, UUID_RE, 'the restore run id is a fresh UUID');
    assert.notEqual(res.data.runId, backupRunId, 'restore run id is NOT the backup run id');

    /* the run row exists at response time, running on the D-89-29 vocabulary */
    const immediate = await pollDb(srv.dbPath, db => db.prepare('select * from restore_runs where id = ?').get(res.data.runId) ?? null);
    assert.ok(immediate, 'the start row exists');
    assert.equal(immediate.status, 'running');
    assert.ok(RESTORE_STAGES.includes(immediate.stage), `stage on the vocabulary: ${immediate.stage}`);
    assert.equal(immediate.trigger, 'import_new');

    /* poll contract: stage rides the vocabulary verbatim, then the run
       finishes and current flips to idle */
    const walked = await pollRestoreCurrent(op, { until: p => p.idle === true || p.stage === 'done' });
    for (const payload of walked.seen) {
      if (payload.idle) continue;
      assert.ok(RESTORE_STAGES.includes(payload.stage), `poll served a vocabulary stage: ${JSON.stringify(payload)}`);
    }

    const idle = await op.get('/api/backup/restore/current');
    assert.equal(idle.status, 200);
    assert.equal(idle.data.idle, true, 'no active run → { idle: true }');

    /* the restored workspace exists with the D-89-13 first-import name */
    const restored = await pollDb(srv.dbPath, db => db.prepare("select * from workspaces where name = 'Acme-restored'").get() ?? null);
    assert.ok(restored, 'the restored workspace row exists');
    assert.equal(restored.revision, 1);

    /* history: newest-first, carries final_name + summary */
    const history = await op.get('/api/backup/restore/runs');
    assert.equal(history.status, 200);
    assert.ok(Array.isArray(history.data.runs), `history shape: ${JSON.stringify(Object.keys(history.data))}`);
    const top = history.data.runs[0];
    assert.equal(top.id, res.data.runId, 'history is newest-first');
    assert.equal(top.final_name, 'Acme-restored', 'D-89-13: first import is -restored');
    /* UAT 2026-11-27 (owner: the Run cell showed only the workspace name):
       the history carries the SOURCE archive filename — the run names
       WHICH archive was restored. */
    assert.equal(typeof top.archive_name, 'string', `archive_name rides the history payload: ${JSON.stringify(top)}`);
    assert.ok(top.archive_name.endsWith('.tar.gz'), 'the archive filename is the .tar.gz the run restored');
    assert.equal(top.status, 'done');

    /* second restore of the SAME archive: the counter walks to -restored-2 */
    const second = await op.post('/api/backup/restore', { runId: backupRunId });
    assert.equal(second.status, 200, `second restore: ${JSON.stringify(second.data)}`);
    await pollRestoreCurrent(op, { until: p => p.idle === true || p.stage === 'done' });
    const secondRow = await pollDb(srv.dbPath, db => db.prepare('select * from restore_runs where id = ? and status = ?').get(second.data.runId, 'done') ?? null);
    assert.ok(secondRow, 'second run lands done');
    assert.equal(secondRow.final_name, 'Acme-restored-2', 'D-89-13: the auto-counter walks to -restored-2');
    const history2 = await op.get('/api/backup/restore/runs');
    assert.equal(history2.data.runs.length, 2, 'both runs in history');
    assert.equal(history2.data.runs[0].id, second.data.runId, 'newest first');
  } finally {
    await srv.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('89-04 D-89-1 restore-side half: an active export refuses the restore trigger 409 backupRestoreInProgress + audited; a held lock refuses the same way', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-restore-mutex-'));
  /* 600 x 24KB blobs → the instance-scope export stays visibly active */
  fs.mkdirSync(path.join(dataDir, 'files'), { recursive: true });
  for (let i = 0; i < 600; i++) fs.writeFileSync(path.join(dataDir, 'files', `blob-${i}`), crypto.randomBytes(24 * 1024));
  const srv = await startServer({ dataDir });
  try {
    const op = await makeDualOp(srv, 'mutex-op@test.local');
    seedWorkspace(srv.dbPath, { ownerId: userIdByEmail(srv, 'mutex-op@test.local') });

    /* backup #1 completes — the archive the restore trigger will name */
    const first = await op.post('/api/backup/runs', { scope: { kind: 'workspace', id: 'ws-a' } });
    assert.equal(first.status, 200);
    const firstRunId = first.data.runId;
    await pollCurrent(op, { until: p => p.stage === 'done' || p.stage === 'failed' });

    /* backup #2 (instance scope over the blob tree) holds the slot */
    const second = await op.post('/api/backup/runs', { scope: { kind: 'instance' } });
    assert.equal(second.status, 200);
    await pollCurrent(op, { until: p => ['collecting', 'archiving', 'verifying', 'uploading'].includes(p.stage) });

    const refused = await op.post('/api/backup/restore', { runId: firstRunId });
    assert.equal(refused.status, 409, `export-active restore: ${JSON.stringify(refused.data)}`);
    assert.equal(refused.data.code, 'backupRestoreInProgress', 'the shared D-89-1 refusal vocabulary');
    const auditsExport = await pollDb(srv.dbPath, db => db.prepare("select count(*) as n from audit_log where action = 'restore_refused:restoreInProgress'").get() ?? null);
    assert.ok(auditsExport.n >= 1, 'the export-active refusal is audited');
    assert.equal(withDb(srv.dbPath, db => db.prepare('select count(*) as n from restore_runs').get()).n, 0, 'no restore run row on refusal');

    /* wait out the export, then hold the LOCK directly: same keyed refusal.
       (The lock-held refusal's audit row is pinned separately, on a quiet
       system — while the export pipeline's tail work is still settling on
       the shared connection, a same-connection audit insert can be lost;
       pre-existing engine property, out of scope. The free-lock restart
       lives in the quiet lockaudit test — after an INSTANCE-scope export
       the server connection can serve a pinned pre-release snapshot, a
       pre-existing 86-pipeline anomaly logged to deferred-items.) */
    await pollCurrent(op, { until: p => p.stage === 'done' || p.stage === 'failed' });
    withDb(srv.dbPath, db => db.prepare('update restore_lock set claimed_by = ?, claimed_at = ? where id = 1').run('restorer-x', Date.now()));
    const refusedLock = await op.post('/api/backup/restore', { runId: firstRunId });
    assert.equal(refusedLock.status, 409, `lock-held restore: ${JSON.stringify(refusedLock.data)}`);
    assert.equal(refusedLock.data.code, 'backupRestoreInProgress', 'lock-held carries the same keyed class');
  } finally {
    await srv.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('89-04 D-89-1: a held restore_lock refusal is audited on a quiet system (lock untouched by the refusal)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-restore-lockaudit-'));
  const srv = await startServer({ dataDir });
  try {
    const op = await makeDualOp(srv, 'lockaudit-op@test.local');
    seedWorkspace(srv.dbPath, { ownerId: userIdByEmail(srv, 'lockaudit-op@test.local') });
    const backup = await op.post('/api/backup/runs', { scope: { kind: 'workspace', id: 'ws-a' } });
    assert.equal(backup.status, 200);
    const backupRunId = backup.data.runId;
    await pollCurrent(op, { until: p => p.stage === 'done' || p.stage === 'failed' });
    await sleep(300); // let the export pipeline's tail work drain fully

    withDb(srv.dbPath, db => db.prepare('update restore_lock set claimed_by = ?, claimed_at = ? where id = 1').run('restorer-x', Date.now()));
    const refused = await op.post('/api/backup/restore', { runId: backupRunId });
    assert.equal(refused.status, 409, `lock-held: ${JSON.stringify(refused.data)}`);
    assert.equal(refused.data.code, 'backupRestoreInProgress');
    const audits = await pollDb(srv.dbPath, db => {
      const n = db.prepare("select count(*) as n from audit_log where action = 'restore_refused:restoreInProgress'").get().n;
      return n >= 1 ? { n } : null;
    }, { timeoutMs: 3000 });
    assert.ok(audits.n >= 1, 'the lock-held refusal is audited (D-89-22)');
    assert.equal(withDb(srv.dbPath, db => db.prepare('select claimed_by from restore_lock where id = 1').get()).claimed_by, 'restorer-x', 'the refusal left the claim intact');
    assert.equal(withDb(srv.dbPath, db => db.prepare('select count(*) as n from restore_runs').get()).n, 0, 'no run row on refusal');

    /* with the lock free, the same trigger starts normally (quiet system —
       the release is visible and the pipeline walks to done) */
    withDb(srv.dbPath, db => db.prepare('update restore_lock set claimed_by = null, claimed_at = null where id = 1').run());
    const started = await op.post('/api/backup/restore', { runId: backupRunId });
    assert.equal(started.status, 200, `free-lock restore: ${JSON.stringify(started.data)}`);
    await pollRestoreCurrent(op, { until: p => p.idle === true || p.stage === 'done' });
    const doneRow = await pollDb(srv.dbPath, db => db.prepare('select * from restore_runs where id = ? and status = ?').get(started.data.runId, 'done') ?? null);
    assert.ok(doneRow, 'the free-lock run lands done');
  } finally {
    await srv.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('89-04 gates: a plain member gets 403 backupRoleRequired + audited; five refused tries are consumed, the sixth is 429', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-restore-gates-'));
  const srv = await startServer({ dataDir });
  try {
    /* 403: signed-in user WITHOUT the restore role */
    const plain = await signup(srv.base, { name: 'Plain', email: 'plain@test.local' });
    assert.equal(plain.status, 201);
    const plainClient = (await login(srv.base, 'plain@test.local', 'password-1234')).client;
    const refused = await plainClient.post('/api/backup/restore', { runId: 'whatever' });
    assert.equal(refused.status, 403, `plain member: ${JSON.stringify(refused.data)}`);
    assert.equal(refused.data.code, 'backupRoleRequired', 'the D-89-21 keyed refusal');
    assert.equal(withDb(srv.dbPath, db => db.prepare("select count(*) as n from audit_log where action = 'restore_refused:restoreRoleRequired'").get()).n, 1, 'the 403 is audited');

    /* 429: a restore operator burning the 5-try window on keyed body
       refusals — every refused attempt consumed a try (D-89-22) */
    const op = await makeRestoreOp(srv, 'throttle-op@test.local');
    for (let i = 0; i < 5; i++) {
      const bad = await op.post('/api/backup/restore', { runId: 'x'.repeat(65) }); // regex fail
      assert.equal(bad.status, 400, `try ${i + 1}: ${JSON.stringify(bad.data)}`);
      assert.notEqual(bad.status, 429);
    }
    const sixth = await op.post('/api/backup/restore', { runId: 'still-bad-body-here-because-throttle-fires-first' });
    assert.equal(sixth.status, 429, `sixth try: ${JSON.stringify(sixth.data)}`);
    assert.equal(sixth.data.code, 'tooManyAttempts');
  } finally {
    await srv.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('89-04 D-89-23 targeting matrix: project archive without a target / with a non-member target / operator with zero memberships all refuse restoreNoWorkspace BEFORE the lock claim; a live-member target restores', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-restore-target-'));
  const srv = await startServer({ dataDir });
  try {
    const op = await makeDualOp(srv, 'target-op@test.local');
    const opId = userIdByEmail(srv, 'target-op@test.local');
    seedWorkspace(srv.dbPath, { ownerId: opId }); // ws-a: op is a member, project p1 lives here
    seedWorkspace(srv.dbPath, { id: 'ws-other', slug: 'other', name: 'Other', ownerId: userIdByEmail(srv, ADMIN.email), withProject: false }); // op NOT a member; empty target

    const backup = await op.post('/api/backup/runs', { scope: { kind: 'project', id: 'p1' } });
    assert.equal(backup.status, 200, `project backup: ${JSON.stringify(backup.data)}`);
    const backupRunId = backup.data.runId;
    await pollCurrent(op, { until: p => p.stage === 'done' || p.stage === 'failed' });

    /* 1. no targetWorkspaceId at all */
    const noTarget = await op.post('/api/backup/restore', { runId: backupRunId });
    assert.equal(noTarget.status, 400, `no target: ${JSON.stringify(noTarget.data)}`);
    assert.equal(noTarget.data.code, 'restoreNoWorkspace', 'the D-89-23 keyed refusal');
    /* 2. a target the operator is NOT a live member of */
    const notMember = await op.post('/api/backup/restore', { runId: backupRunId, targetWorkspaceId: 'ws-other' });
    assert.equal(notMember.status, 400, `non-member target: ${JSON.stringify(notMember.data)}`);
    assert.equal(notMember.data.code, 'restoreNoWorkspace');
    /* every refusal left the lock UNCLAIMED (the check precedes the claim, D-89-23) */
    assert.equal(withDb(srv.dbPath, db => db.prepare('select claimed_by from restore_lock where id = 1').get()).claimed_by, null, 'the lock was never claimed by a refused trigger');
    assert.equal(withDb(srv.dbPath, db => db.prepare('select count(*) as n from restore_runs').get()).n, 0, 'no run row on refused targeting');

    /* 3. the live-member target restores: op joins ws-other → splice lands */
    withDb(srv.dbPath, db => db.prepare('insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)').run('ws-other', opId, 'member', `m_${String(opId).slice(0, 8)}`, 'manual'));
    const started = await op.post('/api/backup/restore', { runId: backupRunId, targetWorkspaceId: 'ws-other' });
    assert.equal(started.status, 200, `member target: ${JSON.stringify(started.data)}`);
    await pollRestoreCurrent(op, { until: p => p.idle === true || p.stage === 'done' });
    const row = await pollDb(srv.dbPath, db => db.prepare('select * from restore_runs where id = ? and status = ?').get(started.data.runId, 'done') ?? null);
    assert.ok(row, 'the splice run lands done');
    assert.equal(row.final_name, 'Other', 'splice records the target name');
    const targetDoc = JSON.parse(withDb(srv.dbPath, db => db.prepare('select doc, revision from workspaces where id = ?').get('ws-other')).doc);
    assert.equal(targetDoc.data.projects.length, 1, 'the archived project arrived');
    assert.notEqual(targetDoc.data.projects[0].id, 'p1', 'fresh project id');
    assert.equal(withDb(srv.dbPath, db => db.prepare('select revision from workspaces where id = ?').get('ws-other')).revision, 2, 'the splice bumped the revision');
  } finally {
    await srv.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('89-04 D-89-33 at run level: an entry-gate-violating archive fails the run at validating with restoreEntryRejected persisted, zero rows, lock released', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-restore-crafted-'));
  const srv = await startServer({ dataDir });
  try {
    const op = await makeDualOp(srv, 'crafted-op@test.local');
    seedWorkspace(srv.dbPath, { ownerId: userIdByEmail(srv, 'crafted-op@test.local') });
    const baseline = withDb(srv.dbPath, db => db.prepare('select count(*) as n from workspaces').get()).n;

    /* craft an archive that passes the manifest gate (entry 0) but whose
       SECOND entry carries a TRAVERSAL name — the D-89-33 path-escape
       family refuses FATALLY at validating (shape-misses only skip).
       python tarfile for exact member-name control (GNU tar strips '..'). */
    const craftDir = path.join(dataDir, 'craft');
    fs.mkdirSync(craftDir, { recursive: true });
    fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });
    const crafted = path.join(dataDir, 'backups', 'crafted.tar.gz');
    execFileSync(
      'python3',
      [
        '-c',
        `import tarfile, io, json, time
manifest = json.dumps({"formatVersion": 1, "scope": {"kind": "workspace", "id": "ws-a"}, "tables": [], "files": [], "createdAt": int(time.time() * 1000)}).encode()
evil = b"pwned\\n"
out = ${JSON.stringify(crafted)}
with tarfile.open(out, "w:gz", format=tarfile.USTAR_FORMAT) as t:
    ti = tarfile.TarInfo("manifest.json"); ti.size = len(manifest); ti.mtime = 0
    t.addfile(ti, io.BytesIO(manifest))
    ti2 = tarfile.TarInfo("../evil.txt"); ti2.size = len(evil); ti2.mtime = 0
    t.addfile(ti2, io.BytesIO(evil))
`,
      ],
      { cwd: craftDir },
    );
    const sha = crypto.createHash('sha256').update(fs.readFileSync(crafted)).digest('hex');
    const size = fs.statSync(crafted).size;
    withDb(srv.dbPath, db =>
      db.prepare('insert into backup_runs (id, task_id, scope, trigger, status, started_at, finished_at, duration_ms, size_bytes, sha256, filename, uploaded, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
        'run-crafted', null, JSON.stringify({ kind: 'workspace', id: 'ws-a' }), 'manual', 'succeeded', Date.now(), Date.now(), 5, size, sha, 'crafted.tar.gz', 0, Date.now(),
      ));

    const res = await op.post('/api/backup/restore', { runId: 'run-crafted' });
    assert.equal(res.status, 200, `crafted trigger: ${JSON.stringify(res.data)}`);
    const failed = await pollDb(srv.dbPath, db => db.prepare('select * from restore_runs where id = ? and status = ?').get(res.data.runId, 'failed') ?? null);
    assert.ok(failed, 'the run lands failed');
    assert.ok(/restoreEntryRejected/.test(failed.error ?? ''), `the keyed class persists verbatim: ${failed.error}`);
    assert.equal(withDb(srv.dbPath, db => db.prepare('select count(*) as n from workspaces').get()).n, baseline, 'ZERO rows inserted');
    assert.equal(withDb(srv.dbPath, db => db.prepare('select claimed_by from restore_lock where id = 1').get()).claimed_by, null, 'the pipeline released the lock in its finally');

    /* no staging debris left behind (D-89-32) */
    const restoreStaging = path.join(dataDir, 'tmp', 'restore');
    if (fs.existsSync(restoreStaging)) {
      assert.equal(fs.readdirSync(restoreStaging).length, 0, 'failed restores sweep their staging tree');
    }
  } finally {
    await srv.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('89-04 stage CHECK enforcement: an invalid stage through the writer is refused by the schema — the row keeps its prior stage', async () => {
  const srv = await bootProbe();
  try {
    const started = await probe(srv, { action: 'emit', event: { kind: 'start', runId: 'r-check', scope: { kind: 'workspace', id: 'ws-1' }, trigger: 'import_new', startedAt: Date.now() } });
    assert.equal(started.data.row.stage, 'fetching');
    const bogus = await probe(srv, { action: 'emit', event: { kind: 'update', runId: 'r-check', stage: 'teleporting' } });
    assert.equal(bogus.status, 200, 'the caller never sees the CHECK error (best-effort)');
    assert.equal(bogus.data.row.stage, 'fetching', 'the CHECK refused the invalid stage; prior stage kept');
    const valid = await probe(srv, { action: 'emit', event: { kind: 'update', runId: 'r-check', stage: 'validating' } });
    assert.equal(valid.data.row.stage, 'validating', 'the vocabulary itself still walks');
  } finally {
    await srv.stop();
  }
});

/* local re-export for the trigger tests (backup-routes pollCurrent twin) */
async function pollCurrent(holder, { until = null, timeoutMs = 30000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const res = await holder.get('/api/backup/runs/current');
    assert.equal(res.status, 200, `poll failed: ${JSON.stringify(res.data)}`);
    last = res.data;
    if (!until || until(last)) return last;
    await sleep(50);
  }
  throw new Error(`poll timeout — last payload: ${JSON.stringify(last)}`);
}

test('89-04 history: GET /api/backup/restore/runs is capped at 50 rows, newest-first', async () => {
  const srv = await startServer();
  try {
    const op = await makeRestoreOp(srv, 'history-cap@test.local');
    const t0 = Date.now() - 120_000;
    withDb(srv.dbPath, db => {
      const ins = db.prepare('insert into restore_runs (id, scope, trigger, status, stage, started_at, finished_at, created_at) values (?,?,?,?,?,?,?,?)');
      for (let i = 0; i < 55; i++) ins.run(`h-${String(i).padStart(2, '0')}`, '{}', 'import_new', 'done', 'done', t0 + i * 1000, t0 + i * 1000 + 100, t0 + i * 1000);
    });
    const history = await op.get('/api/backup/restore/runs');
    assert.equal(history.status, 200);
    assert.ok(Array.isArray(history.data.runs));
    assert.equal(history.data.runs.length, 50, 'capped at 50 (D-14 discipline)');
    assert.equal(history.data.runs[0].id, 'h-54', 'newest first');
    assert.equal(history.data.runs[49].id, 'h-05', 'the cap trims the OLDEST rows');
  } finally {
    await srv.stop();
  }
});

/* ---------- 89-05 Task 3: the overwrite direction completes the D-89-1 matrix ----------
   The import direction (export running → import restore refuses) and the
   export-side halves (held lock → backup refuses; held lock → scheduler
   records skipped_overlap) are pinned above / in backup-scheduler. These
   cells pin the NEW overwrite route against BOTH halves. */
test('89-05 mutual exclusion, overwrite direction: an active export refuses POST /api/backup/restore/overwrite 409 backupRestoreInProgress + audited; a held lock refuses the same way', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-ow-mutex-'));
  /* 600 x 24KB blobs → the instance-scope export stays visibly active */
  fs.mkdirSync(path.join(dataDir, 'files'), { recursive: true });
  for (let i = 0; i < 600; i++) fs.writeFileSync(path.join(dataDir, 'files', `blob-${i}`), crypto.randomBytes(24 * 1024));
  const srv = await startServer({ dataDir });
  try {
    const op = await makeBackupOp(srv, 'ow-mutex-op@test.local');
    seedWorkspace(srv.dbPath, { ownerId: userIdByEmail(srv, 'ow-mutex-op@test.local') });

    const first = await op.post('/api/backup/runs', { scope: { kind: 'workspace', id: 'ws-a' } });
    assert.equal(first.status, 200);
    const firstRunId = first.data.runId;
    await pollCurrent(op, { until: p => p.stage === 'done' || p.stage === 'failed' });

    const second = await op.post('/api/backup/runs', { scope: { kind: 'instance' } });
    assert.equal(second.status, 200);
    await pollCurrent(op, { until: p => ['collecting', 'archiving', 'verifying', 'uploading'].includes(p.stage) });

    const refused = await op.post('/api/backup/restore/overwrite', { runId: firstRunId, targetId: 'ws-a', confirmName: 'Acme' });
    assert.equal(refused.status, 409, `export-active overwrite: ${JSON.stringify(refused.data)}`);
    assert.equal(refused.data.code, 'backupRestoreInProgress', 'the shared D-89-1 refusal vocabulary');
    const audits = await pollDb(srv.dbPath, db => {
      const n = db.prepare("select count(*) as n from audit_log where action = 'restore_refused:restoreInProgress'").get().n;
      return n >= 1 ? { n } : null;
    }, { timeoutMs: 3000 });
    assert.ok(audits.n >= 1, 'the export-active overwrite refusal is audited');
    assert.equal(withDb(srv.dbPath, db => db.prepare("select count(*) as n from restore_runs where trigger = 'overwrite'").get()).n, 0, 'no overwrite run row on refusal');

    await pollCurrent(op, { until: p => p.stage === 'done' || p.stage === 'failed' });
    await sleep(300); // let the export pipeline's tail work drain fully
    withDb(srv.dbPath, db => db.prepare('update restore_lock set claimed_by = ?, claimed_at = ? where id = 1').run('restorer-x', Date.now()));
    const refusedLock = await op.post('/api/backup/restore/overwrite', { runId: firstRunId, targetId: 'ws-a', confirmName: 'Acme' });
    assert.equal(refusedLock.status, 409, `lock-held overwrite: ${JSON.stringify(refusedLock.data)}`);
    assert.equal(refusedLock.data.code, 'backupRestoreInProgress', 'lock-held carries the same keyed class');
  } finally {
    await srv.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

/* ---------- 95-04 Task 3: project-scope overwrite acceptance ----------
   The EXISTING route accepts project scope behind the verbatim guard
   chain: confirmName validated server-side against the LIVE target
   project's name read from the workspace doc (before archive
   resolution), D-05 targeting (current membership | Super Admin
   bypass), audit token 'project' on the project path. */
const seedOverwriteTarget = (dbPath, { ownerId, memberId = null, targetProjectName = 'Old Project' } = {}) =>
  withDb(dbPath, db => {
    const doc = {
      data: {
        projects: [
          { id: 'p-old', name: targetProjectName, color: '#999999' },
          { id: 'p-keep', name: 'Keep Me', color: '#00aa00' },
        ],
        tasks: [
          { id: 't-old', project: 'p-old', title: 'Old task', desc: '' },
          { id: 't-keep', project: 'p-keep', title: 'Keep task', desc: '' },
        ],
        comments: [],
        files: [],
        teams: [],
        projOrder: ['p-old', 'p-keep'],
      },
    };
    const t = Date.now();
    db.prepare('insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at) values (?,?,?,?,?,?,?,?)').run(
      'ws-target', 'overwrite-target', 'Target WS', '#123456', JSON.stringify(doc), 4, t, t,
    );
    db.prepare('insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)').run(
      'ws-target', ownerId, 'owner', `m_${String(ownerId).slice(0, 8)}`, 'manual',
    );
    if (memberId) {
      db.prepare('insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)').run(
        'ws-target', memberId, 'member', `m_${String(memberId).slice(0, 8)}`, 'manual',
      );
    }
  });

/* A live project archive of ws-a's p1 fragment + a seeded target
   workspace ws-target armed at p-old. The op holds BACKUP_MANAGE and a
   CURRENT membership of ws-target (D-05) unless the cell says otherwise. */
async function bootProjectOverwriteWorld(srv, email) {
  const op = await makeBackupOp(srv, email);
  const opId = userIdByEmail(srv, email);
  seedWorkspace(srv.dbPath, { ownerId: opId }); // ws-a: project p1 'Alpha', task t1
  seedOverwriteTarget(srv.dbPath, { ownerId: userIdByEmail(srv, ADMIN.email), memberId: opId });
  const backupRes = await op.post('/api/backup/runs', { scope: { kind: 'project', id: 'p1' } });
  assert.equal(backupRes.status, 200, `project backup trigger: ${JSON.stringify(backupRes.data)}`);
  await pollCurrent(op, { until: p => p.stage === 'done' || p.stage === 'failed' });
  const row = withDb(srv.dbPath, db => db.prepare('select id, status from backup_runs where id = ?').get(backupRes.data.runId));
  assert.equal(row.status, 'succeeded', 'the project archive landed');
  return { op, opId, runId: row.id };
}

test('95-04 overwrite route accepts project scope: Backup-Op member + exact live PROJECT name → 200; the run lands done; the target project is replaced verbatim with the other project untouched; audit token project', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-ow-proj-'));
  const srv = await startServer({ dataDir });
  try {
    const w = await bootProjectOverwriteWorld(srv, 'ow-proj-op@test.local');

    const res = await w.op.post('/api/backup/restore/overwrite', { runId: w.runId, targetId: 'ws-target', targetProjectId: 'p-old', confirmName: 'Old Project' });
    assert.equal(res.status, 200, `project overwrite trigger: ${JSON.stringify(res.data)}`);
    assert.match(res.data.runId, /^[0-9a-f-]{36}$/i, 'the run id leaves before the pipeline');
    await pollDb(srv.dbPath, db => db.prepare("select id from restore_runs where id = ? and status = 'done'").get(res.data.runId) ?? null);

    const docRow = withDb(srv.dbPath, db => db.prepare('select doc, revision, name from workspaces where id = ?').get('ws-target'));
    const doc = JSON.parse(docRow.doc).data;
    assert.deepEqual(doc.projects.map(p => p.id), ['p-keep', 'p1'], 'p-old replaced by the archive fragment, p-keep untouched');
    assert.deepEqual(doc.tasks.map(t => t.id), ['t-keep', 't1'], 'ids verbatim');
    assert.deepEqual(doc.projOrder, ['p-keep', 'p1']);
    assert.equal(docRow.name, 'Target WS', 'the workspace identity is untouched (project scope never renames)');
    assert.equal(withDb(srv.dbPath, db => db.prepare('select claimed_by from restore_lock where id = 1').get()).claimed_by, null, 'the lock released');
    const audits = withDb(srv.dbPath, db => db.prepare("select target_name from audit_log where action = 'restore_started:overwrite' order by created_at desc limit 1").get());
    assert.equal(audits.target_name, 'project', 'the project path audits scope token project');
    const startScope = withDb(srv.dbPath, db => db.prepare('select scope from restore_runs where id = ?').get(res.data.runId));
    assert.deepEqual(JSON.parse(startScope.scope), { kind: 'project', id: 'p1' }, 'the run row carries the archive project scope');
  } finally {
    await srv.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('95-04 overwrite route project scope: confirmName is validated against the LIVE PROJECT name server-side, BEFORE archive resolution — near-misses refuse keyed confirmPhraseMismatch; an unknown targetProjectId refuses 404 restoreTargetMissing', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-ow-proj-cname-'));
  const srv = await startServer({ dataDir });
  try {
    const w = await bootProjectOverwriteWorld(srv, 'ow-proj-cname-op@test.local');
    const before = withDb(srv.dbPath, db => db.prepare('select doc, revision from workspaces where id = ?').get('ws-target'));

    /* The WORKSPACE name is NOT the phrase for a project overwrite —
       typing it refuses (the dialog is chrome; the live doc is the
       boundary). */
    for (const bad of ['Target WS', 'old project', 'Old Project ']) {
      const res = await w.op.post('/api/backup/restore/overwrite', { runId: w.runId, targetId: 'ws-target', targetProjectId: 'p-old', confirmName: bad });
      assert.equal(res.status, 400, `name ${JSON.stringify(bad)}: ${JSON.stringify(res.data)}`);
      assert.equal(res.data.code, 'confirmPhraseMismatch', `keyed: ${JSON.stringify(res.data)}`);
    }
    const audits = withDb(srv.dbPath, db => db.prepare("select count(*) as n from audit_log where action = 'restore_refused:confirmPhraseMismatch'").get());
    assert.ok(audits.n >= 3, 'every near-miss audited');
    assert.equal(withDb(srv.dbPath, db => db.prepare('select claimed_by from restore_lock where id = 1').get()).claimed_by, null, 'the lock never claimed');

    const missing = await w.op.post('/api/backup/restore/overwrite', { runId: w.runId, targetId: 'ws-target', targetProjectId: 'p-nope', confirmName: 'Whatever' });
    assert.equal(missing.status, 404, `unknown target project: ${JSON.stringify(missing.data)}`);
    assert.equal(missing.data.code, 'restoreTargetMissing', 'keyed missing-target refusal');
    assert.equal(withDb(srv.dbPath, db => db.prepare("select count(*) as n from restore_runs where trigger = 'overwrite'").get()).n, 0, 'no run rows from refused triggers');
    const after = withDb(srv.dbPath, db => db.prepare('select doc, revision from workspaces where id = ?').get('ws-target'));
    assert.equal(after.doc, before.doc, 'zero state change');
    assert.equal(after.revision, before.revision, 'revision untouched');
  } finally {
    await srv.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('95-04 overwrite route project-scope role matrix: a Backup Operator WITHOUT membership refuses restoreNoWorkspace; a Super Admin bypasses without membership; the guard chain order is unchanged (Restore-Op still 403 backupManageRequired)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-ow-proj-roles-'));
  const srv = await startServer({ dataDir });
  try {
    /* A Backup Operator that is NOT a member of ws-target — the D-05
       targeting gate refuses BEFORE the lock claim. */
    const soloId = userIdByEmail(srv, ADMIN.email);
    seedOverwriteTarget(srv.dbPath, { ownerId: soloId }); // no member row for the op below
    const op = await makeBackupOp(srv, 'ow-proj-solo-op@test.local');
    seedWorkspace(srv.dbPath, { ownerId: userIdByEmail(srv, 'ow-proj-solo-op@test.local') });
    const backupRes = await op.post('/api/backup/runs', { scope: { kind: 'project', id: 'p1' } });
    assert.equal(backupRes.status, 200);
    await pollCurrent(op, { until: p => p.stage === 'done' || p.stage === 'failed' });

    const refused = await op.post('/api/backup/restore/overwrite', { runId: backupRes.data.runId, targetId: 'ws-target', targetProjectId: 'p-old', confirmName: 'Old Project' });
    assert.equal(refused.status, 400, `non-member backup op: ${JSON.stringify(refused.data)}`);
    assert.equal(refused.data.code, 'restoreNoWorkspace', 'the D-05 keyed refusal');
    assert.equal(withDb(srv.dbPath, db => db.prepare('select claimed_by from restore_lock where id = 1').get()).claimed_by, null, 'the lock never claimed');

    /* Restore Operator: fails the unchanged CAP.BACKUP_MANAGE gate — the
       workspace-path role chain is byte-unchanged. */
    const restoreOp = await makeRestoreOp(srv, 'ow-proj-restore-op@test.local');
    const res403 = await restoreOp.post('/api/backup/restore/overwrite', { runId: backupRes.data.runId, targetId: 'ws-target', targetProjectId: 'p-old', confirmName: 'Old Project' });
    assert.equal(res403.status, 403, `restore op: ${JSON.stringify(res403.data)}`);
    assert.equal(res403.data.code, 'backupManageRequired', 'the unchanged overwrite role refusal');

    /* Super Admin bypass: no membership of ws-target, still allowed. */
    const admin = (await login(srv.base, ADMIN.email, ADMIN.password)).client;
    const allowed = await admin.post('/api/backup/restore/overwrite', { runId: backupRes.data.runId, targetId: 'ws-target', targetProjectId: 'p-old', confirmName: 'Old Project' });
    assert.equal(allowed.status, 200, `SA bypass: ${JSON.stringify(allowed.data)}`);
    await pollDb(srv.dbPath, db => db.prepare("select id from restore_runs where id = ? and status = 'done'").get(allowed.data.runId) ?? null);
    const doc = JSON.parse(withDb(srv.dbPath, db => db.prepare('select doc from workspaces where id = ?').get('ws-target')).doc).data;
    assert.deepEqual(doc.projects.map(p => p.id), ['p-keep', 'p1'], 'the SA-triggered overwrite landed');
    assert.equal(withDb(srv.dbPath, db => db.prepare('select claimed_by from restore_lock where id = 1').get()).claimed_by, null, 'the lock released');
  } finally {
    await srv.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
