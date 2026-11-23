/* =====================================================================
   Backup DOWNLOAD API suite (Phase 90, plan 90-02, SC-2 / D-90-7..10).

   Pins the tiered GET /api/backup/download surface:
   - the guard funnel copied VERBATIM from the preview route in the house
     order (sameOrigin → requireUser → throttle → capability → runId regex
     → row lookup → scope parse → instance tier → location resolution) —
     the order itself is pinned from source below (Shared Pattern 1);
   - instance-scope archives download for Super Admins ONLY —
     backupDownloadAdminOnly, the ONLY new refusal code of the phase
     (D-90-7 / T-90-02);
   - a permitted run streams 200 with Content-Disposition: attachment
     carrying the stored archive name, byte-identical to the archive on
     disk (D-90-8, zero staging leg for the local side);
   - a missing run (no local file, uploaded=0) refuses keyed
     restoreArchiveMissing + audit — the fail-closed double with the CTA
     the client hides (D-90-9);
   - success-only audit backup_download:<runId>, refusals audited
     backup_download_refused:<code> (D-90-10);
   - the operator-keyed throttle consumes a try even on refusal (D-89-22).
   Env-gated MinIO case: the S3 leg rides the 88-01 downloadToStaged seam.

   Pattern: test/backup-routes.test.mjs — startServer-per-case with the
   shared harness, withDb for direct row inspection.
   ===================================================================== */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createBucket } from '../export/s3.js';
import { ADMIN, login, signup, startServer, withDb } from './helpers/server.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUN_FILE = 'backup-workspace-20261123-120000.tar.gz';
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

const downloadAuditRows = srv =>
  withDb(srv.dbPath, db => db.prepare("select * from audit_log where action like 'backup_download%' order by created_at, id").all());
const userIdByEmail = (srv, email) => withDb(srv.dbPath, db => db.prepare('select id from users where email = ?').get(email).id);

/* A Backup Operator + the Super Admin client (the ADMIN seed is stamped
   is_instance_admin=1 at boot — the D-114 bootstrap). The instance-scope
   tiering (T-90-02) needs both. */
async function makeBackupOp(server, email) {
  const joined = await signup(server.base, { name: 'Backup Op', email });
  assert.equal(joined.status, 201, `signup ${email}: ${JSON.stringify(joined.data)}`);
  const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
  const grant = await operator.post('/api/auth/operator/instance-roles', { userId: userIdByEmail(server, email), role: 'backup_operator' });
  assert.equal(grant.status, 200, `grant: ${JSON.stringify(grant.data)}`);
  return (await login(server.base, email, 'password-1234')).client;
}

const adminClient = async server => (await login(server.base, ADMIN.email, ADMIN.password)).client;

/* The binary download needs the RAW response (headers + bytes) — the harness
   client JSON-parses, which is wrong for an archive body. Same-origin is not
   required for non-browser clients (sameOrigin passes without an Origin
   header), so the session cookie alone is the auth. */
const rawGet = (server, cookie, runId) => fetch(`${server.base}/api/backup/download?runId=${encodeURIComponent(runId)}`, { headers: { cookie } });

/* Plant a run row exactly the way the 86-01 pipeline leaves one (plus, when
   asked, the archive file in DATA_DIR/backups). */
const shaOf = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

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

/* ---------- the gate (T-86-07 order: capability BEFORE any row probing) ---------- */

test('non-operator → 403 backupRoleRequired + audit row; no archive probing happened', async () => {
  const server = await startServer({});
  try {
    const joined = await signup(server.base, { name: 'Plain', email: 'plain@test.local' });
    assert.equal(joined.status, 201);
    const plain = (await login(server.base, 'plain@test.local', 'password-1234')).client;
    const refused = await plain.get('/api/backup/download?runId=somerunid');
    assert.equal(refused.status, 403);
    assert.equal(refused.data.code, 'backupRoleRequired');
    const audits = downloadAuditRows(server);
    assert.equal(audits.length, 1, 'exactly the refusal audit row');
    assert.equal(audits[0].action, 'backup_download_refused:backupRoleRequired');
  } finally {
    await server.stop();
  }
});

/* ---------- the happy path (D-90-8: local leg, zero staging) ---------- */

test('operator + workspace run → 200 stream with the stored filename, byte-identical; success-only audit; history rows carry location + scope server-derived', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-backup-download-'));
  const server = await startServer({ dataDir });
  try {
    const op = await makeBackupOp(server, 'op-dl@test.local');
    const bytes = writeArchive(dataDir);
    const runId = insertRun(server, { scope: { kind: 'workspace', id: 'w1' }, uploaded: 0, sha: shaOf(bytes) });

    const res = await rawGet(server, op.cookie(), runId);
    assert.equal(res.status, 200, `download failed: ${res.status}`);
    const disp = res.headers.get('content-disposition');
    assert.match(disp, /^attachment;/, 'the archive downloads as an attachment (D-90-8)');
    assert.ok(disp.includes(RUN_FILE), `the stored archive name rides the header: ${disp}`);
    const body = Buffer.from(await res.arrayBuffer());
    assert.deepEqual(body, bytes, 'the streamed bytes are the stored archive');

    const audits = downloadAuditRows(server);
    assert.equal(audits.length, 1, 'exactly the success audit row (D-90-10)');
    assert.equal(audits[0].action, `backup_download:${runId}`);

    /* the payload-flag chrome inputs the client gates the CTA on */
    const history = await op.get('/api/backup/runs?taskId=manual');
    assert.equal(history.status, 200, `history: ${JSON.stringify(history.data)}`);
    const row = history.data.runs.find(r => r.id === runId);
    assert.ok(row, 'the run is in the manual history');
    assert.equal(row.location, 'local', 'the server derived location from run-row truth + fs membership (D-89-14)');
    assert.ok(!('scope' in row), 'the raw scope JSON stays unprojected (D-14 projection contract — the instance tier is enforced server-side)');
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

/* ---------- the tier (T-90-02: the ONLY new refusal code of the phase) ---------- */

test('instance-scope run as a Backup Operator → 403 backupDownloadAdminOnly + audit; as the Super Admin → 200', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-backup-download-'));
  const server = await startServer({ dataDir });
  try {
    const op = await makeBackupOp(server, 'op-inst@test.local');
    const bytes = writeArchive(dataDir);
    const runId = insertRun(server, { scope: { kind: 'instance' }, sha: shaOf(bytes) });

    const refused = await rawGet(server, op.cookie(), runId);
    assert.equal(refused.status, 403);
    assert.equal((await refused.json()).code, 'backupDownloadAdminOnly');
    const audits = downloadAuditRows(server);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, 'backup_download_refused:backupDownloadAdminOnly');

    const admin = await adminClient(server);
    const ok = await rawGet(server, admin.cookie(), runId);
    assert.equal(ok.status, 200, `admin download failed: ${ok.status}`);
    assert.deepEqual(Buffer.from(await ok.arrayBuffer()), bytes);
    const audits2 = downloadAuditRows(server);
    assert.equal(audits2.length, 2, 'refusal + success both audited');
    assert.equal(audits2[1].action, `backup_download:${runId}`);
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

/* ---------- the missing run (D-90-9: fail-closed double with the hidden CTA) ---------- */

test('missing run (no local file, uploaded=0) → 404 restoreArchiveMissing + audit; a null-filename row answers the SAME 404', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-backup-download-'));
  const server = await startServer({ dataDir });
  try {
    const op = await makeBackupOp(server, 'op-gone@test.local');
    const gone = insertRun(server, { uploaded: 0, filename: 'backup-workspace-gone.tar.gz' });
    const refused = await rawGet(server, op.cookie(), gone);
    assert.equal(refused.status, 404);
    assert.equal((await refused.json()).code, 'restoreArchiveMissing');

    const nameless = insertRun(server, { uploaded: 0, filename: null });
    const refused2 = await rawGet(server, op.cookie(), nameless);
    assert.equal(refused2.status, 404, 'no filename → the same keyed 404 (no oracle)');
    assert.equal((await refused2.json()).code, 'restoreArchiveMissing');

    const audits = downloadAuditRows(server);
    assert.equal(audits.length, 2, 'both refusals audited');
    for (const a of audits) assert.equal(a.action, 'backup_download_refused:restoreArchiveMissing');
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

/* ---------- the throttle (D-89-22: a refused attempt still consumed a try) ---------- */

test('the throttle: ten refused attempts consume the budget — the 11th call is 429 tooManyAttempts', async () => {
  const server = await startServer({});
  try {
    const joined = await signup(server.base, { name: 'Plain', email: 'plain-throttle@test.local' });
    assert.equal(joined.status, 201);
    const plain = (await login(server.base, 'plain-throttle@test.local', 'password-1234')).client;
    for (let i = 0; i < 10; i++) {
      const r = await plain.get('/api/backup/download?runId=x');
      assert.equal(r.status, 403, `call ${i + 1} refused with the capability gate`);
    }
    const eleventh = await plain.get('/api/backup/download?runId=x');
    assert.equal(eleventh.status, 429);
    assert.equal(eleventh.data.code, 'tooManyAttempts');
  } finally {
    await server.stop();
  }
});

/* ---------- the funnel order pinned from source (Shared Pattern 1) ---------- */

test('funnel order pinned in source: sameOrigin → requireUser → throttle → capability → runId regex → row lookup → scope parse → instance tier → location resolution', () => {
  const src = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  const start = src.indexOf("pathname === '/api/backup/download'");
  assert.ok(start > 0, 'the download route exists');
  const route = src.slice(start, src.indexOf("pathname === '/api/auth/signup'", start));
  const seq = [
    ['sameOrigin', 'if (!sameOrigin(req))'],
    ['requireUser', 'const user = await requireUser(req, res)'],
    ['throttle', 'tooMany(`backupdownload|${user.id}`'],
    ['capability', 'hasInstanceRole(user.id, CAP.BACKUP_MANAGE)'],
    ['runId regex', '/^[A-Za-z0-9_-]{1,64}$/.test(runId)'],
    ['row lookup', 'from backup_runs where id = ?'],
    ['scope parse', 'JSON.parse(row.scope)'],
    ['instance tier', "scope?.kind === 'instance' && !isInstanceAdmin(user)"],
    ['location resolution', 'fs.existsSync(localPath)'],
  ];
  let cursor = 0;
  for (const [name, needle] of seq) {
    const at = route.indexOf(needle, cursor);
    assert.ok(at > -1, `the ${name} gate is missing from the download route`);
    cursor = at; // strictly non-decreasing = the house funnel order, never reordered
  }
  /* the keyed vocabulary + the one Content-Disposition escaping path */
  assert.ok(route.includes("'backup_download_refused:backupDownloadAdminOnly'"), 'the tier refusal is audited');
  assert.ok(route.includes('fileDisposition(row.filename, false)'), 'the header rides fileDisposition (D-90-8)');
});

/* ---------- the S3 leg (88-01 seam, env-gated MinIO) ---------- */

maybeMinio('90-02 e2e: S3-located archive downloads through downloadToStaged — 200 with the uploaded bytes, staged temp cleaned (D-89-16)', async () => {
  const bucket = `gr8r-dl-e2e-${crypto.randomUUID().slice(0, 8)}`;
  await createBucket({ endpoint: minioUrl, bucket, accessKeyId: S3_ENV().S3_ACCESS_KEY_ID, secretAccessKey: S3_ENV().S3_SECRET_KEY, region: 'us-east-1', pathStyle: true });

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-backup-dl-e2e-'));
  const server = await startServer({ dataDir, env: { ...S3_ENV(), S3_BUCKET: bucket } });
  try {
    const op = await makeBackupOp(server, 'op-dl-e2e@test.local');
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

    const res = await rawGet(server, op.cookie(), runId);
    if (res.status !== 200) throw new Error(`S3 download failed: ${res.status} ${await res.text()}`);
    const body = Buffer.from(await res.arrayBuffer());
    assert.equal(shaOf(body), done.sha256, 'the streamed bytes re-hash to the run-row digest');
    assert.ok((res.headers.get('content-disposition') || '').includes(done.filename), 'the stored name rides the header');

    /* D-89-16: the staged temp never outlives the response. */
    const stagingDir = path.join(dataDir, 'backups', 'restore-staging');
    const leftovers = fs.existsSync(stagingDir) ? fs.readdirSync(stagingDir) : [];
    assert.deepEqual(leftovers, [], 'restore-staging is empty after the download — no staged temp left behind');
    assert.ok(!fs.existsSync(localArchive), 'downloading an S3-located archive does not resurrect the local file');
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
