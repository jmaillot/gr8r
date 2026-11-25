/* =====================================================================
   RESTORE PREVIEW S3 E2E (ENV-GATED MINIO) — Phase 89 (89-03, BKRST-01)
   =====================================================================
   The D-89-16 full path against real MinIO: a run uploaded to S3 (the
   D-88-8 verified upload that sets backup_runs.uploaded = 1), the LOCAL
   archive deleted, and the restore surface still honest —
   - the list badges the row 's3' from run-row truth alone (no live S3
     probing, D-89-14/15);
   - preview fetches the archive through the 88-01 downloadToStaged seam
     into restore-staging, re-verifies the whole-archive sha256 on the
     same streaming pass (D-89-18), and serves manifest-derived counts;
   - the staged temp is removed when the response lands (D-89-16).

   D-88-18 gate idiom (pg-matrix pattern, test/pg-matrix.test.mjs:30-32):
   the whole suite is opt-in via MINIO_TEST_URL; when the env is absent
   the tests SKIP — a skip on a machine without MinIO is the expected
   pass state, never silently counted as coverage.

   Run it as (the pinned image, user-ratified 2026-11-22):
     docker run -d --name projects-studio-minio-e2e -p 9001:9000 \
       -e MINIO_ROOT_USER=projects-studiotest -e MINIO_ROOT_PASSWORD=projects-studiotest-password \
       pgsty/minio:latest server /data
   then: MINIO_TEST_URL=http://127.0.0.1:9001 node --test test/restore-s3-e2e.test.mjs
   Credentials default to the projects-studiotest pair and can be overridden with
   MINIO_TEST_ACCESS_KEY_ID / MINIO_TEST_SECRET_KEY.
   ===================================================================== */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBucket } from '../export/s3.js';
import { ADMIN, login, signup, startServer, withDb } from './helpers/server.mjs';

/* D-08 gate idiom — the whole e2e is opt-in. */
const minioUrl = process.env.MINIO_TEST_URL;
const maybeMinio = minioUrl ? test : test.skip;

const S3_ENV = () => ({
  S3_ENDPOINT: minioUrl,
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: process.env.MINIO_TEST_ACCESS_KEY_ID || 'projects-studiotest',
  S3_SECRET_KEY: process.env.MINIO_TEST_SECRET_KEY || 'projects-studiotest-password',
  S3_PATH_STYLE: 'true',
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* The 89-03 route-suite helpers, mirrored locally (the e2e boots its own
   server with S3 env — different fixture family from the offline suite). */
const userIdByEmail = (srv, email) =>
  withDb(srv.dbPath, db => db.prepare('select id from users where email = ?').get(email).id);

async function makeOp(server, email, role) {
  const joined = await signup(server.base, { name: 'Op', email });
  assert.equal(joined.status, 201, `signup ${email}: ${JSON.stringify(joined.data)}`);
  const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
  const grant = await operator.post('/api/auth/operator/instance-roles', {
    userId: userIdByEmail(server, email),
    role,
  });
  assert.equal(grant.status, 200, `grant ${role}: ${JSON.stringify(grant.data)}`);
  return (await login(server.base, email, 'password-1234')).client;
}

async function runManualBackup(backupOp) {
  const post = await backupOp.post('/api/backup/runs', { scope: { kind: 'instance' } });
  assert.equal(post.status, 200, `trigger: ${JSON.stringify(post.data)}`);
  const runId = post.data.runId;
  const deadline = Date.now() + 60000; // real MinIO upload + stream-back verify takes longer than the offline suites
  for (;;) {
    const poll = await backupOp.get('/api/backup/runs/current');
    assert.equal(poll.status, 200, `poll failed: ${JSON.stringify(poll.data)}`);
    if (poll.data.stage === 'done') return { runId, filename: poll.data.filename, sha256: poll.data.sha256 };
    if (poll.data.stage === 'failed') throw new Error(`run failed: ${JSON.stringify(poll.data)}`);
    if (Date.now() > deadline) throw new Error(`run poll timeout: ${JSON.stringify(poll.data)}`);
    await sleep(100);
  }
}

maybeMinio('e2e 89-03: S3-located archive — list badge s3 → preview via downloadToStaged → sha256 verified → staged temp cleaned (D-89-14/16/18)', async () => {
  const bucket = `projects-studio-restore-e2e-${crypto.randomUUID().slice(0, 8)}`;
  await createBucket({ endpoint: minioUrl, bucket, accessKeyId: S3_ENV().S3_ACCESS_KEY_ID, secretAccessKey: S3_ENV().S3_SECRET_KEY, region: 'us-east-1', pathStyle: true });

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-restore-e2e-'));
  const server = await startServer({ dataDir, env: { ...S3_ENV(), S3_BUCKET: bucket } });
  try {
    const restoreOp = await makeOp(server, 'rop-e2e@test.local', 'restore_operator');
    const backupOp = await makeOp(server, 'bop-e2e@test.local', 'backup_operator');
    const done = await runManualBackup(backupOp);
    assert.ok(done.sha256 && done.filename, 'fixture sanity: completed + uploaded run');

    /* The local archive is GONE — rotation-style survival: only the S3
       object (uploaded only after the full D-88-8 verification) remains. */
    const localArchive = path.join(dataDir, 'backups', done.filename);
    assert.ok(fs.existsSync(localArchive), 'fixture sanity: the run really published locally first');
    fs.rmSync(localArchive, { force: true });
    fs.rmSync(`${localArchive}.sha256`, { force: true });

    /* The list badge reads run-row truth ONLY: no local file + uploaded=1 → 's3'
       — without a single ListObjectsV2 round-trip (D-89-14). */
    const list = await restoreOp.get('/api/backup/restore/backups');
    assert.equal(list.status, 200, `list: ${JSON.stringify(list.data)}`);
    const row = list.data.runs.find(r => r.runId === done.runId);
    assert.ok(row, 'the uploaded run is listed');
    assert.equal(row.location, 's3', 'the honest s3 badge after local deletion');
    assert.equal(row.sha256, done.sha256);

    /* Preview: fetched via downloadToStaged into restore-staging, sha256
       re-verified on the streaming pass, manifest-derived payload only. */
    const preview = await restoreOp.get(`/api/backup/restore/preview?runId=${done.runId}`);
    assert.equal(preview.status, 200, `preview: ${JSON.stringify(preview.data)}`);
    assert.equal(preview.data.checksum, done.sha256, 'the streamed digest equals the run-row sha256 (D-89-18)');
    assert.equal(preview.data.runId, done.runId);
    assert.ok(Array.isArray(preview.data.tables) && preview.data.tables.length >= 1);
    assert.equal(preview.data.missingBlobCount, 0);

    /* D-89-16: the staged temp never outlives the response. */
    const stagingDir = path.join(dataDir, 'backups', 'restore-staging');
    const leftovers = fs.existsSync(stagingDir) ? fs.readdirSync(stagingDir) : [];
    assert.deepEqual(leftovers, [], 'restore-staging is empty after the preview — no staged temp left behind');

    /* The local archive stays gone: the preview never "restored" it —
       the prohibition probe: no restore route streams archive bytes. */
    assert.ok(!fs.existsSync(localArchive), 'previewing an S3-located archive does not resurrect the local file');
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
