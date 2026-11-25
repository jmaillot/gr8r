/* =====================================================================
   S3 E2E (ENV-GATED MINIO) — Phase 88 (88-01)
   =====================================================================
   D-88-18 gate idiom (pg-matrix pattern, test/pg-matrix.test.mjs:30-32):
   the whole suite is opt-in via MINIO_TEST_URL; when the env is absent
   the tests SKIP — a skip on a machine without MinIO is the expected
   pass state, never silently counted as coverage.

   E2e target (user-ratified 2026-11-22): the pinned image is
   docker.io/pgsty/minio:latest (MinIO RELEASE.2026-08-04T00-00-00Z).
   Run it as:
     docker run -d --name projects-studio-minio-e2e -p 9000:9000 \
       -e MINIO_ROOT_USER=projects-studiotest -e MINIO_ROOT_PASSWORD=projects-studiotest-password \
       pgsty/minio:latest server /data
   then: MINIO_TEST_URL=http://127.0.0.1:9000 node --test test/backup-s3-e2e.test.mjs
   Credentials default to the projects-studiotest pair above and can be overridden
   with MINIO_TEST_ACCESS_KEY_ID / MINIO_TEST_SECRET_KEY.
   ===================================================================== */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBucket, putObject, getObject, probeS3, downloadToStaged, uploadArchive, S3_MULTIPART_THRESHOLD, S3_PART_SIZE } from '../export/s3.js';

/* D-08 gate idiom — the whole e2e is opt-in. */
const minioUrl = process.env.MINIO_TEST_URL;
const maybeMinio = minioUrl ? test : test.skip;

const CONFIG = {
  endpoint: minioUrl || 'http://127.0.0.1:9000',
  bucket: '',
  accessKeyId: process.env.MINIO_TEST_ACCESS_KEY_ID || 'projects-studiotest',
  secretAccessKey: process.env.MINIO_TEST_SECRET_KEY || 'projects-studiotest-password',
  region: 'us-east-1',
  pathStyle: true, // D-88-13: path-style default
};

maybeMinio('e2e: signed PUT → GET roundtrip is byte-identical (SC-2 tracer)', async () => {
  const bucket = `projects-studio-e2e-${crypto.randomUUID().slice(0, 8)}`;
  const config = { ...CONFIG, bucket };
  await createBucket(config);

  const bytes = crypto.randomBytes(1024);
  const expectedSha = crypto.createHash('sha256').update(bytes).digest('hex');
  const key = 'backup-task-t1/projects-studio e2e #1.tar.gz'; // spaces + '#' exercise S3 URI encoding (Pitfall 2)

  await putObject(config, key, bytes);
  const res = await getObject(config, key);
  const got = await res.body();
  assert.equal(res.status, 200);
  assert.equal(got.length, bytes.length);
  assert.equal(crypto.createHash('sha256').update(got).digest('hex'), expectedSha);
});

maybeMinio('e2e: probe returns success + download seam roundtrips from MinIO (D-88-15, SC-5)', async () => {
  const bucket = `projects-studio-e2e-${crypto.randomUUID().slice(0, 8)}`;
  const config = { ...CONFIG, bucket };
  await createBucket(config);

  const probe = await probeS3(config);
  assert.equal(probe.ok, true);
  assert.equal(probe.key, 'success');

  const bytes = crypto.randomBytes(2048);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  const key = 'backup-task-t1/download seam.tar.gz';
  await putObject(config, key, bytes);
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-s3-e2e-'));
  const result = await downloadToStaged(config, key, sha, stagingDir);
  assert.equal(result.sha256, sha);
  assert.equal(fs.readFileSync(result.tmpPath).length, bytes.length);
  fs.rmSync(result.tmpPath, { force: true });
});

/* =====================================================================
   88-03 additions: the FULL run path against real MinIO — probe →
   multipart upload crossing the threshold (via the opts overrides, the
   same seam runExport uses) → stream-back sha256 verify → sidecar.
   The real 512 MiB/64 MiB constants are covered by the unit tests in
   test/backup-s3-upload.test.mjs; here the overrides make the multipart
   path observable without a half-gigabyte fixture.
   ===================================================================== */

maybeMinio('e2e 88-03: multipart upload crosses the threshold → stream-back verify → sidecar (SC-2, T-88-11, D-88-8)', async () => {
  const bucket = `projects-studio-e2e-${crypto.randomUUID().slice(0, 8)}`;
  const config = { ...CONFIG, bucket };
  await createBucket(config);

  const probe = await probeS3(config);
  assert.equal(probe.ok, true, 'probe before upload');

  /* 14 MiB synthetic archive with 6 MiB parts → 3 multipart parts. S3's
     EntityTooSmall floor (5 MiB per part except the last) forbids smaller
     part sizes against real MinIO. */
  const bytes = crypto.randomBytes(14 * 1024 * 1024);
  const expectedSha = crypto.createHash('sha256').update(bytes).digest('hex');
  const staged = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-s3-e2e-')), 'archive.tar.gz');
  fs.writeFileSync(staged, bytes);
  const key = 'backup-task-e2e/projects-studio 88-03 multipart.tar.gz';

  const progress = [];
  const result = await uploadArchive(config, staged, key, expectedSha, (done, total) => progress.push({ done, total }), {
    thresholdBytes: 4 * 1024 * 1024, // below the fixture size → multipart path
    partSize: 6 * 1024 * 1024,
  });
  assert.equal(result.mode, 'multipart');
  assert.equal(result.partsTotal, 3);
  assert.ok(progress.length >= 1, 'progress callbacks fired for the D-19 payload');

  /* Stream-back verify: GET the object back and compare the whole-archive
     sha256 (T-88-11 — ETag is never trusted, D-88-8). */
  const res = await getObject(config, key);
  assert.equal(res.status, 200);
  const roundtrip = await res.body();
  assert.equal(crypto.createHash('sha256').update(roundtrip).digest('hex'), expectedSha, 'byte-identical roundtrip over real MinIO');

  /* The sidecar carries the stored hash verbatim (D-88-8). */
  const sidecarRes = await getObject(config, `${key}.sha256`);
  assert.equal(sidecarRes.status, 200);
  const sidecar = (await sidecarRes.body()).toString('utf8');
  assert.ok(sidecar.startsWith(expectedSha), `sidecar carries the run-row hash (got: ${sidecar.slice(0, 20)}…)`);

  /* Download seam roundtrips the FULL uploaded object (SC-5 for Phase 89). */
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-s3-e2e-'));
  const dl = await downloadToStaged(config, key, expectedSha, stagingDir);
  assert.equal(dl.sha256, expectedSha);
  fs.rmSync(dl.tmpPath, { force: true });
  fs.rmSync(path.dirname(staged), { recursive: true, force: true });
});

maybeMinio('e2e 88-03: single-PUT mode below the threshold still lands the sidecar (SC-2 small path)', async () => {
  const bucket = `projects-studio-e2e-${crypto.randomUUID().slice(0, 8)}`;
  const config = { ...CONFIG, bucket };
  await createBucket(config);

  const bytes = crypto.randomBytes(1024 * 1024);
  const expectedSha = crypto.createHash('sha256').update(bytes).digest('hex');
  const staged = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-s3-e2e-')), 'archive.tar.gz');
  fs.writeFileSync(staged, bytes);
  const key = 'backup-manual/projects-studio 88-03 small.tar.gz'; // D-88-9 manual prefix

  const result = await uploadArchive(config, staged, key, expectedSha, null);
  assert.equal(result.mode, 'single');
  const res = await getObject(config, key);
  assert.equal(res.status, 200);
  const sidecarRes = await getObject(config, `${key}.sha256`);
  assert.ok((await sidecarRes.body()).toString('utf8').startsWith(expectedSha), 'sidecar present on the small path');
  fs.rmSync(path.dirname(staged), { recursive: true, force: true });
});
