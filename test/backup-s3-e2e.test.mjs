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
     docker run -d --name gr8r-minio-e2e -p 9000:9000 \
       -e MINIO_ROOT_USER=gr8rtest -e MINIO_ROOT_PASSWORD=gr8rtest-password \
       pgsty/minio:latest server /data
   then: MINIO_TEST_URL=http://127.0.0.1:9000 node --test test/backup-s3-e2e.test.mjs
   Credentials default to the gr8rtest pair above and can be overridden
   with MINIO_TEST_ACCESS_KEY_ID / MINIO_TEST_SECRET_KEY.
   ===================================================================== */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createBucket, putObject, getObject } from '../export/s3.js';

/* D-08 gate idiom — the whole e2e is opt-in. */
const minioUrl = process.env.MINIO_TEST_URL;
const maybeMinio = minioUrl ? test : test.skip;

const CONFIG = {
  endpoint: minioUrl || 'http://127.0.0.1:9000',
  bucket: '',
  accessKeyId: process.env.MINIO_TEST_ACCESS_KEY_ID || 'gr8rtest',
  secretAccessKey: process.env.MINIO_TEST_SECRET_KEY || 'gr8rtest-password',
  region: 'us-east-1',
  pathStyle: true, // D-88-13: path-style default
};

maybeMinio('e2e: signed PUT → GET roundtrip is byte-identical (SC-2 tracer)', async () => {
  const bucket = `gr8r-e2e-${crypto.randomUUID().slice(0, 8)}`;
  const config = { ...CONFIG, bucket };
  await createBucket(config);

  const bytes = crypto.randomBytes(1024);
  const expectedSha = crypto.createHash('sha256').update(bytes).digest('hex');
  const key = 'backup-task-t1/gr8r e2e #1.tar.gz'; // spaces + '#' exercise S3 URI encoding (Pitfall 2)

  await putObject(config, key, bytes);
  const res = await getObject(config, key);
  const got = await res.body();
  assert.equal(res.status, 200);
  assert.equal(got.length, bytes.length);
  assert.equal(crypto.createHash('sha256').update(got).digest('hex'), expectedSha);
});
