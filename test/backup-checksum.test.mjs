/* =====================================================================
   Backup VERIFY-CHECKSUM API suite (Phase 90, plan 90-02, D-90-11).

   Pins the POST /api/backup/verify-checksum surface:
   - the funnel (sameOrigin → requireUser → throttle verifychecksum 10/15min
     BEFORE the capability gate, refused attempt consumes a try (D-89-22) →
     capability BACKUP_MANAGE||RESTORE_USE at the preview tier, D-89-21
     parity, NO scope-kind restriction → runId regex → row lookup);
   - a matching local archive → 200 { ok: true, checkedAt } with BOTH
     outcomes persisted on the run row (checksum_ok 1/0 + the server
     checksum_checked_at) — a mismatch is a RESULT (200, ok: false), never
     a refusal (the durable keyed badge is the feedback, UI-SPEC);
   - refusals keyed + audited backup_verify_refused:<code>;
   - the S3 leg rides the 88-01 downloadToStaged seam (env-gated MinIO) —
     the stream-back re-hash that mismatches lands as ok: false.

   Pattern: test/backup-routes.test.mjs — startServer-per-case with the
   shared harness, withDb for direct row inspection.
   ===================================================================== */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createBucket } from '../export/s3.js';
import { ADMIN, login, signup, startServer, withDb } from './helpers/server.mjs';

/* D-88-18 gate idiom — the S3 e2e leg is opt-in via MINIO_TEST_URL. */
const minioUrl = process.env.MINIO_TEST_URL;
const maybeMinio = minioUrl ? test : test.skip;

const S3_ENV = () => ({
  S3_ENDPOINT: minioUrl,
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: process.env.MINIO_TEST_ACCESS_KEY_ID || 'gr8rtest',
  S3_SECRET_KEY: process.env.MINIO_TEST_SECRET_KEY || 'gr8rtest-password',
  S3_PATH_STYLE: 'true',
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
const RUN_FILE = 'backup-workspace-20261123-130000.tar.gz';
const shaOf = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

const verifyAuditRows = srv =>
  withDb(srv.dbPath, db => db.prepare("select * from audit_log where action like 'backup_verify%' order by created_at, id").all());
const userIdByEmail = (srv, email) => withDb(srv.dbPath, db => db.prepare('select id from users where email = ?').get(email).id);
const runRowById = (srv, id) =>
  withDb(srv.dbPath, db => db.prepare('select checksum_ok, checksum_checked_at, sha256, filename, uploaded from backup_runs where id = ?').get(id));

async function makeBackupOp(server, email) {
  const joined = await signup(server.base, { name: 'Backup Op', email });
  assert.equal(joined.status, 201, `signup ${email}: ${JSON.stringify(joined.data)}`);
  const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
  const grant = await operator.post('/api/auth/operator/instance-roles', { userId: userIdByEmail(server, email), role: 'backup_operator' });
  assert.equal(grant.status, 200, `grant: ${JSON.stringify(grant.data)}`);
  return (await login(server.base, email, 'password-1234')).client;
}

function insertRun(server, { scope = { kind: 'workspace', id: 'w1' }, uploaded = 0, filename = RUN_FILE, sha = null } = {}) {
  const id = crypto.randomUUID();
  withDb(server.dbPath, db =>
    db.prepare(
      'insert into backup_runs (id, task_id, scope, trigger, status, started_at, finished_at, duration_ms, size_bytes, sha256, filename, uploaded, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run(id, null, JSON.stringify(scope), 'manual', 'succeeded', Date.now() - 60000, Date.now(), 1234, 2048, sha || '0'.repeat(64), filename, uploaded, Date.now()),
  );
  return id;
}

function writeArchive(dataDir, filename = RUN_FILE, bytes = crypto.randomBytes(2048)) {
  fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'backups', filename), bytes);
  return bytes;
}

/* ---------- the gates ---------- */

test('non-operator → 403 backupRoleRequired + audit row (the throttle sits before the gate but a refused try is still consumed, D-89-22)', async () => {
  const server = await startServer({});
  try {
    const joined = await signup(server.base, { name: 'Plain', email: 'plain-v@test.local' });
    assert.equal(joined.status, 201);
    const plain = (await login(server.base, 'plain-v@test.local', 'password-1234')).client;
    const refused = await plain.post('/api/backup/verify-checksum', { runId: 'somerunid' });
    assert.equal(refused.status, 403);
    assert.equal(refused.data.code, 'backupRoleRequired');
    const audits = verifyAuditRows(server);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, 'backup_verify_refused:backupRoleRequired');
  } finally {
    await server.stop();
  }
});

test('bad runId → 404 taskNotFound (regex gate before any row read, T-86-06 shape)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-backup-verify-'));
  const server = await startServer({ dataDir });
  try {
    const op = await makeBackupOp(server, 'op-v1@test.local');
    const bad = await op.post('/api/backup/verify-checksum', { runId: '../etc/passwd' });
    assert.equal(bad.status, 404);
    assert.equal(bad.data.code, 'taskNotFound');
    assert.equal(verifyAuditRows(server).length, 0, 'the regex gate is not an audited refusal — no row read happened');
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('missing run (no local file, uploaded=0) → 404 restoreArchiveMissing + audit row', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-backup-verify-'));
  const server = await startServer({ dataDir });
  try {
    const op = await makeBackupOp(server, 'op-v2@test.local');
    const gone = insertRun(server, { uploaded: 0, filename: 'backup-workspace-vanished.tar.gz' });
    const refused = await op.post('/api/backup/verify-checksum', { runId: gone });
    assert.equal(refused.status, 404);
    assert.equal(refused.data.code, 'restoreArchiveMissing');
    const audits = verifyAuditRows(server);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, 'backup_verify_refused:restoreArchiveMissing');
    assert.equal(runRowById(server, gone).checksum_ok, null, 'a refusal persists no result');
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

/* ---------- the RESULT semantics (D-90-11: a mismatch is a 200, not a refusal) ---------- */

test('unmodified local archive → 200 { ok: true, checkedAt } with checksum_ok=1 + the server timestamp persisted', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-backup-verify-'));
  const server = await startServer({ dataDir });
  try {
    const op = await makeBackupOp(server, 'op-v3@test.local');
    const bytes = writeArchive(dataDir);
    const runId = insertRun(server, { uploaded: 0, sha: shaOf(bytes) });
    const res = await op.post('/api/backup/verify-checksum', { runId });
    assert.equal(res.status, 200, `verify: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.ok, true);
    assert.ok(typeof res.data.checkedAt === 'string' && !Number.isNaN(Date.parse(res.data.checkedAt)), 'checkedAt is a server ISO timestamp');
    const row = runRowById(server, runId);
    assert.equal(row.checksum_ok, 1, 'the match persisted');
    assert.ok(row.checksum_checked_at && !Number.isNaN(Date.parse(row.checksum_checked_at)), 'the timestamp persisted');
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('tampered local archive → 200 { ok: false } with checksum_ok=0 persisted — a RESULT, never a 4xx/5xx', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-backup-verify-'));
  const server = await startServer({ dataDir });
  try {
    const op = await makeBackupOp(server, 'op-v4@test.local');
    writeArchive(dataDir, RUN_FILE, crypto.randomBytes(2048)); // disk bytes differ from the row digest
    const runId = insertRun(server, { uploaded: 0, sha: shaOf(crypto.randomBytes(2048)) });
    const res = await op.post('/api/backup/verify-checksum', { runId });
    assert.equal(res.status, 200);
    assert.equal(res.data.ok, false);
    assert.ok(res.data.checkedAt, 'the timestamp still lands on a mismatch');
    const row = runRowById(server, runId);
    assert.equal(row.checksum_ok, 0, 'the mismatch persisted');
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

/* ---------- the throttle (D-89-22) ---------- */

test('the throttle: ten attempts consume the budget — the 11th is 429 tooManyAttempts', async () => {
  const server = await startServer({});
  try {
    const joined = await signup(server.base, { name: 'Plain', email: 'plain-vt@test.local' });
    assert.equal(joined.status, 201);
    const plain = (await login(server.base, 'plain-vt@test.local', 'password-1234')).client;
    for (let i = 0; i < 10; i++) {
      const r = await plain.post('/api/backup/verify-checksum', { runId: 'x' });
      assert.equal(r.status, 403, `call ${i + 1} refused with the capability gate`);
    }
    const eleventh = await plain.post('/api/backup/verify-checksum', { runId: 'x' });
    assert.equal(eleventh.status, 429);
    assert.equal(eleventh.data.code, 'tooManyAttempts');
  } finally {
    await server.stop();
  }
});

/* ---------- the S3 leg (88-01 seam, env-gated MinIO) ---------- */

maybeMinio('90-02 e2e: S3-located archive verifies through downloadToStaged — 200 { ok: true } with the row persisted', async () => {
  const bucket = `gr8r-verify-e2e-${crypto.randomUUID().slice(0, 8)}`;
  await createBucket({ endpoint: minioUrl, bucket, accessKeyId: S3_ENV().S3_ACCESS_KEY_ID, secretAccessKey: S3_ENV().S3_SECRET_KEY, region: 'us-east-1', pathStyle: true });

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-verify-e2e-'));
  const server = await startServer({ dataDir, env: { ...S3_ENV(), S3_BUCKET: bucket } });
  try {
    const op = await makeBackupOp(server, 'op-verify-e2e@test.local');
    const wsId = withDb(server.dbPath, db => db.prepare('select id from workspaces limit 1').get()).id;
    const post = await op.post('/api/backup/runs', { scope: { kind: 'workspace', id: wsId } });
    assert.equal(post.status, 200, `trigger: ${JSON.stringify(post.data)}`);
    const runId = post.data.runId;
    let done = null;
    const deadline = Date.now() + 60000;
    for (;;) {
      const poll = await op.get('/api/backup/runs/current');
      assert.equal(poll.status, 200, `poll failed: ${JSON.stringify(poll.data)}`);
      if (poll.data.stage === 'done') {
        done = poll.data;
        break;
      }
      if (poll.data.stage === 'failed') throw new Error(`run failed: ${JSON.stringify(poll.data)}`);
      if (Date.now() > deadline) throw new Error(`run poll timeout: ${JSON.stringify(poll.data)}`);
      await sleep(100);
    }
    assert.ok(done.sha256 && done.filename, 'fixture sanity: completed + uploaded run');

    /* rotation-style survival: only the S3 object remains */
    const localArchive = path.join(dataDir, 'backups', done.filename);
    assert.ok(fs.existsSync(localArchive), 'fixture sanity: the run really published locally first');
    fs.rmSync(localArchive, { force: true });
    fs.rmSync(`${localArchive}.sha256`, { force: true });

    const res = await op.post('/api/backup/verify-checksum', { runId });
    assert.equal(res.status, 200, `verify: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.ok, true, 'the S3 stream-back re-hash matches the run-row digest');
    const row = runRowById(server, runId);
    assert.equal(row.checksum_ok, 1, 'the match persisted');
    assert.ok(row.checksum_checked_at, 'the timestamp persisted');

    /* D-89-16: the staged temp never outlives the response. */
    const stagingDir = path.join(dataDir, 'backups', 'restore-staging');
    const leftovers = fs.existsSync(stagingDir) ? fs.readdirSync(stagingDir) : [];
    assert.deepEqual(leftovers, [], 'restore-staging is empty after the verify — no staged temp left behind');
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
