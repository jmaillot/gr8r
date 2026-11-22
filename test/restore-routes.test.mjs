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
