/* =====================================================================
   FULL-CYCLE PG-PARITY E2E (ENV-GATED) — Phase 90, plan 90-04, SC-4
   (D-90-17) — test/backup-restore-fullcycle-e2e.test.mjs
   =====================================================================
   ONE scenario end-to-end against the LIVE test containers — the whole
   milestone's backup→S3→DR flow survives a real Postgres round-trip:

     backup task (instance scope, S3-enabled — probe-at-save) →
     manual run riding the task's scope (POST /api/backup/runs, the
     per-task Run-now seam) → poll to terminal succeeded with the S3
     upload landed (uploaded = 1) → DELETE the local archive →
     history badge reads 's3' from run-row truth (never live probing,
     D-89-14) → restore preview resolves the archive through the 88-01
     downloadToStaged stream-back seam → DR restore ON PG (instance
     restore as Super Admin, type-to-confirm phrase D-89-27) →
     assertions: restore run reaches terminal done with its summary
     populated, the backup run report carries size_bytes + sha256, and
     EVERY session row is revoked post-commit (D-89-25 — the re-login
     wall IS the notification, including the initiator's).

   Scope note (deviation, Rule 3 — documented in 90-04-SUMMARY.md): the
   plan text said "task (project/workspace scope)", but the DR route
   refuses any non-instance archive (server.js restoreTargetMismatch,
   "An instance restore needs an instance-scope archive"), so the task
   and the run ride the INSTANCE scope — the only scope that lets the
   single scenario complete through the DR leg.

   T-90-07 discipline (cross-suite contamination):
   - dropPgSchema(POSTGRES_TEST_URL) BEFORE startServer — the pg-matrix
     idiom; each scenario starts from a clean database;
   - PER-FILE execution ONLY: this file is run as its own `node --test`
     invocation, NEVER under --test-concurrency=2 on the shared live DB
     (89-UAT lesson);
   - env-gated clean skip: without BOTH env vars the file exits 0 with
     everything skipped (D-90-19 — no CI wiring, manual pre-ship run).

   Run it as (both containers LIVE):
     docker start projects-studio-pg-test projects-studio-minio-e2e   (if not already up)
     POSTGRES_TEST_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres \
       MINIO_TEST_URL=http://127.0.0.1:9001 \
       node --test test/backup-restore-fullcycle-e2e.test.mjs
   MinIO credentials default to the projects-studiotest pair (MINIO_TEST_ACCESS_KEY_ID
   / MINIO_TEST_SECRET_KEY override). Never prints DSN values (T-45-11).
   ===================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBucket } from '../export/s3.js';
import { ADMIN, login, startServer, withPg, dropPgSchema } from './helpers/server.mjs';

/* D-08/D-90-19 gate idiom — the whole e2e is opt-in on BOTH envs. */
const pgUrl = process.env.POSTGRES_TEST_URL;
const minioUrl = process.env.MINIO_TEST_URL;
const maybe = pgUrl && minioUrl ? test : test.skip;

const S3_ENV = () => ({
  S3_ENDPOINT: minioUrl,
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: process.env.MINIO_TEST_ACCESS_KEY_ID || 'projects-studiotest',
  S3_SECRET_KEY: process.env.MINIO_TEST_SECRET_KEY || 'projects-studiotest-password',
  S3_PATH_STYLE: 'true',
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Poll the D-19 status payload until the run reaches a terminal stage. */
async function pollBackupCurrent(holder, { timeoutMs = 90_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const res = await holder.get('/api/backup/runs/current');
    assert.equal(res.status, 200, `poll failed: ${JSON.stringify(res.data)}`);
    last = res.data;
    if (last.stage === 'done' || last.stage === 'failed' || last.stage === 'idle') return last;
    await sleep(100);
  }
  throw new Error(`backup run poll timeout — last: ${JSON.stringify(last)}`);
}

/* Poll one restore_runs row (direct PG read — after the DR commit every
   session is revoked, so the API is no longer reachable with the old
   cookie; the persisted row is the terminal authority anyway). */
async function pollRestoreRun(runId, { timeoutMs = 120_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  let terminal = null;
  await withPg(pgUrl, async pool => {
    while (Date.now() < deadline) {
      const { rows } = await pool.query('select * from restore_runs where id = $1', [runId]);
      last = rows[0] ?? null;
      if (last && (last.status === 'done' || last.status === 'failed')) { terminal = last; return; }
      await sleep(150);
    }
  });
  if (!terminal) throw new Error(`restore run poll timeout — last: ${JSON.stringify(last)}`);
  return terminal;
}

maybe('e2e 90-04 full cycle on PG: task → run → S3 upload → local delete → s3 badge → preview via downloadToStaged → DR restore on PG → run report + zero sessions (D-90-17)', async () => {
  const bucket = `projects-studio-fullcycle-${crypto.randomUUID().slice(0, 8)}`;
  await createBucket({ endpoint: minioUrl, bucket, accessKeyId: S3_ENV().S3_ACCESS_KEY_ID, secretAccessKey: S3_ENV().S3_SECRET_KEY, region: 'us-east-1', pathStyle: true });

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-fullcycle-e2e-'));
  /* T-90-07: clean schema BEFORE boot (pg-matrix idiom) — one shared live
     DB, per-file execution only. DB_URL selects the pg backend (the
     harness strips DB_PATH when DB_URL is present). */
  await dropPgSchema(pgUrl);
  const server = await startServer({
    dataDir,
    env: { DB_URL: pgUrl, MASTER_KEY: 'fullcycle-e2e-master-key', ...S3_ENV(), S3_BUCKET: bucket },
  });
  try {
    /* The Super Admin holds every capability (roles.js D-12 short-circuit):
       task CRUD, run trigger, history, preview AND the DR trigger. */    const admin = (await login(server.base, ADMIN.email, ADMIN.password)).client;

    /* (1) The backup task — instance scope, S3-enabled: the D-88-15
       probe-at-save writes+deletes a marker against live MinIO BEFORE the
       row lands (unreachable/badCreds would refuse the save keyed). */
    const task = await admin.post('/api/backup/tasks', {
      name: 'Full-cycle e2e task',
      cron: '30 2 * * *',
      scope: { kind: 'instance' },
      s3Enabled: true,
    });
    assert.equal(task.status, 200, `task create: ${JSON.stringify(task.data)}`);
    assert.ok(task.data.task?.id, 'the task row exists');
    assert.ok(task.data.s3Probe?.ok !== false || task.data.s3Probe?.key === 'deleteFailed',
      `the S3 probe proved the write path: ${JSON.stringify(task.data.s3Probe)}`);

    /* (2) Trigger the run riding the task's scope (the 87-04 per-task
       Run-now seam) and poll to terminal succeeded. */
    const post = await admin.post('/api/backup/runs', { scope: { kind: 'instance' } });
    assert.equal(post.status, 200, `run trigger: ${JSON.stringify(post.data)}`);
    const runId = post.data.runId;
    assert.match(runId, UUID_RE, 'a D-18 UUID leaves before the pipeline finishes');
    const done = await pollBackupCurrent(admin);
    assert.equal(done.stage, 'done', `run reached terminal: ${JSON.stringify(done)}`);
    assert.ok(done.filename && /^[0-9a-f]{64}$/.test(done.sha256), 'done payload carries filename + whole-archive sha256');

    /* (3) The local archive is GONE — survival-in-S3 posture: only the S3
       object (uploaded after full D-88-8 stream-back verification) remains. */
    const localArchive = path.join(dataDir, 'backups', done.filename);
    assert.ok(fs.existsSync(localArchive), 'fixture sanity: the run really published locally first');
    fs.rmSync(localArchive, { force: true });
    fs.rmSync(`${localArchive}.sha256`, { force: true });

    /* (4) History badge = run-row truth ONLY: no local file + uploaded = 1
       → 's3', without a single ListObjectsV2 (D-89-14). The run report
       fields ride the same row (D-14 projection). */
    const history = await admin.get('/api/backup/runs?taskId=manual');
    assert.equal(history.status, 200, `history: ${JSON.stringify(history.data)}`);
    const row = history.data.runs.find(r => r.id === runId);
    assert.ok(row, 'the run is listed under the manual Run-now history');
    assert.equal(row.location, 's3', 'the honest s3 badge after local deletion');
    assert.equal(row.uploaded, 1, 'uploaded = 1 — the 88 writer seam landed the object');
    assert.equal(row.status, 'succeeded', 'the run row is terminal succeeded');
    assert.equal(row.task_id, null, 'manual Run-now rides the task scope, outside rotation (D-11)');
    assert.equal(row.sha256, done.sha256, 'the row sha256 equals the done-payload digest');
    assert.ok(Number.isInteger(row.size_bytes) && row.size_bytes > 0, `size_bytes populated: ${row.size_bytes}`);
    assert.equal(row.missing_blob_count, 0, 'no missing blobs — DR will accept this archive (D-90-23)');

    /* (5) Preview resolves the archive through the 88-01 downloadToStaged
       stream-back seam, re-verifying sha256 on the streaming pass. */
    const preview = await admin.get(`/api/backup/restore/preview?runId=${runId}`);
    assert.equal(preview.status, 200, `preview: ${JSON.stringify(preview.data)}`);
    assert.equal(preview.data.checksum, done.sha256, 'the streamed digest equals the run-row sha256 (D-89-18)');
    assert.equal(preview.data.runId, runId);
    assert.ok(Array.isArray(preview.data.tables) && preview.data.tables.length >= 1, 'manifest-derived tables present');
    assert.equal(preview.data.missingBlobCount, 0);
    /* rm-finally discipline (D-89-16): the staged temp never outlives the
       response. */
    const stagingDir = path.join(dataDir, 'backups', 'restore-staging');
    assert.deepEqual(fs.existsSync(stagingDir) ? fs.readdirSync(stagingDir) : [], [], 'restore-staging is empty after the preview');
    assert.ok(!fs.existsSync(localArchive), 'previewing an S3-located archive does not resurrect the local file');

    /* (6) DR restore ON PG — instance restore as Super Admin with the
       type-to-confirm phrase (server re-validates it exactly, D-89-27). */
    const dr = await admin.post('/api/backup/restore/instance', { runId, confirmPhrase: 'RESTORE-INSTANCE' });
    assert.equal(dr.status, 200, `DR trigger: ${JSON.stringify(dr.data)}`);
    assert.match(dr.data.runId, UUID_RE, 'a fresh restore run id');

    /* (7) The restore run reaches terminal done on PG with its summary
       populated (the skip report + replaced/skipped counters). */
    const restoreRow = await pollRestoreRun(dr.data.runId);
    assert.equal(restoreRow.status, 'done', `DR run terminal: ${restoreRow?.status} ${restoreRow?.error ?? ''}`);
    assert.equal(restoreRow.final_name, 'instance');
    const summary = JSON.parse(restoreRow.summary);
    assert.ok(Array.isArray(summary.skipped), 'the operational skip report is an array (D-89-7/OQ4)');
    assert.ok(summary.instanceRoles && summary.memberships && summary.files && 'apiKeys' in summary,
      `the run report counters are populated: ${JSON.stringify(Object.keys(summary))}`);

    /* The backup run report is the persisted DB truth on PG: size_bytes +
       sha256 populated on the row the history API projected above. */
    await withPg(pgUrl, async pool => {
      const { rows } = await pool.query('select size_bytes, sha256, status, uploaded from backup_runs where id = $1', [runId]);
      const dbRow = rows[0];
      assert.ok(dbRow, 'the backup run row persisted on PG');
      assert.equal(dbRow.status, 'succeeded');
      assert.equal(dbRow.uploaded, 1);
      assert.equal(dbRow.sha256, done.sha256);
      assert.ok(Number(dbRow.size_bytes) > 0, `size_bytes on the live row: ${dbRow.size_bytes}`);
    });

    /* Post-commit GLOBAL session revocation (D-89-25): EVERY session row is
       gone — including the initiator's; the re-login wall IS the
       notification (D-89-28 — no email claims for trigger='instance'). */
    await withPg(pgUrl, async pool => {
      const { rows } = await pool.query('select count(*)::int as n from sessions');
      assert.equal(rows[0].n, 0, 'zero session rows remain after the DR commit');
    });
    const revoked = await admin.get('/api/backup/restore/runs');
    assert.equal(revoked.status, 401, 'the initiator cookie is dead — the next request re-authenticates (live proof of the revocation)');
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
