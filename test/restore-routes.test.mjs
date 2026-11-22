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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-restore-'));
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
