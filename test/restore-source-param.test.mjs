/* =====================================================================
   Phase 104 plan 01 — explicit restore `source` param (RSRC-02).
   NEW file: the golden contract (test/restore-source-resolution.test.mjs)
   must pass UNCHANGED — its 16 cases pin the DEFAULT (omitted-source)
   registry path; every case here exercises the EXPLICIT path behind the
   helper's `opts.source !== undefined` guard.

   Harness mirrors the golden (server harness via helpers/server.mjs +
   in-process engine harness): DATA_DIR set BEFORE the module graph
   imports; route tests spawn child servers with their own dataDirs and
   read audits AFTER server.stop() (WAL checkpoint — the golden's note).

   What is pinned here (per 104-RESEARCH.md Golden Impact + plan tasks):
   - preview ?source=local on a real local run → 200 through the local leg;
   - preview ?source=<valid> whose flag ≠ 1 → keyed restoreSourceNotMirrored
     (400) + restore_refused audit;
   - preview ?source=bogus → keyed restoreSourceInvalid (400);
   - omitted source → registry order re-assert (golden covers it too);
   - helper explicit-source semantics: single-leg selection (no registry
     walk, no fall-through), explicit 'local' missing → 'missing' DIRECTLY,
     explicit+disabled destination refuses in BOTH disabledBehavior modes
     (GD-5), success through the REQUESTED leg only (fake S3 seam);
   - units map the helper's structured reasons through their OWN keyed
     funnels (restoreSourceInvalid / restoreSourceNotMirrored codes);
   - both err.* keys present ×5 locales (GD-7 same-commit rule).

   Zero new dependencies. Refusal ENVELOPE strings stay at callers —
   the helper returns structured reasons only (golden contract).
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ADMIN, login, signup, startServer, withDb } from './helpers/server.mjs';

/* ---------------------------------------------------------------------
   ENGINE HALF FIXTURE — identical shape to the golden's (temp DATA_DIR
   before imports; child servers carry their own DATA_DIRs).
   --------------------------------------------------------------------- */
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-src-param-'));
process.env.DATA_DIR = DATA_DIR;
delete process.env.BACKUPS_DIR;
const FILES_DIR = path.join(DATA_DIR, 'files');
const LOGOS_DIR = path.join(DATA_DIR, 'logos');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

const db = await import('../db-adapter.mjs');
const backup = await import('../export/backup.js');
const restore = await import('../export/restore.js');

const T = 1700000000000;
const OP = { id: 'user-op-000000000000', email: 'op@test.local', name: 'Operator' };

async function freshDb() {
  await db.close();
  await db.connectDb({ dbPath: path.join(DATA_DIR, 'projects.db') });
  await db.runSchema(db.SQLITE_SCHEMA);
}

function wsDoc(id, name) {
  return JSON.stringify({
    data: {
      members: [{ id: 'm1', name: 'Owner', email: 'owner@example.com' }],
      projects: [{ id: 'p1', name: 'Project One', color: '#33aa55' }],
      tasks: [{ id: 't1', project: 'p1', title: 'Task one', status: 'open' }],
      comments: [{ id: 'c1', task: 't1', body: 'hello restore' }],
      files: [{ id: 'f1', project: 'p1', name: 'new.txt', ext: 'txt' }],
      teams: [],
      projOrder: ['p1'],
      logo: 'lg1',
      notifs: [],
      events: [],
      savedViews: [],
      recentSearches: [],
      activity: [],
      ...(id ? {} : {}),
    },
    _meta: { workspaceName: name },
  });
}

let sourceRun = null;

async function resetWorld() {
  for (const t of ['memberships', 'audit_log', 'backup_runs', 'restore_runs', 'workspaces', 'users']) {
    await db.run(`delete from ${t}`);
  }
  fs.rmSync(FILES_DIR, { recursive: true, force: true });
  fs.rmSync(LOGOS_DIR, { recursive: true, force: true });
  fs.rmSync(BACKUPS_DIR, { recursive: true, force: true });
  fs.mkdirSync(FILES_DIR, { recursive: true });
  fs.mkdirSync(LOGOS_DIR, { recursive: true });

  await db.run('insert into users (id, email, name, password_hash, created_at) values (?,?,?,?,?)', [OP.id, OP.email, OP.name, 'x', T]);
  const src = { id: 'ws-src', slug: 'src-fixture', name: 'Source WS' };
  await db.run(
    'insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at, archived) values (?,?,?,?,?,?,?,?,?)',
    [src.id, src.slug, src.name, '#123456', wsDoc(src.id, src.name), 1, T, T, 0],
  );
  const tgt = { id: 'ws-target', slug: 'target-fixture', name: 'Target WS' };
  await db.run(
    'insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at, archived) values (?,?,?,?,?,?,?,?,?)',
    [tgt.id, tgt.slug, tgt.name, '#654321', wsDoc(tgt.id, tgt.name), 1, T, T, 0],
  );
  await db.run('insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)', [src.id, OP.id, 'owner', 'm_op-src', 'manual']);
  await db.run('insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)', [tgt.id, OP.id, 'owner', 'm_op-tgt', 'manual']);

  fs.writeFileSync(path.join(FILES_DIR, 'f1'), 'source new blob\n');
  fs.writeFileSync(path.join(LOGOS_DIR, 'lg1'), 'source new logo');

  sourceRun = await backup.runExport({ kind: 'workspace', id: 'ws-src' });
  assert.equal(sourceRun.ok, true, `fixture export failed: ${sourceRun.error}`);
}

await freshDb();
await db.ensureSearchIndex();
restore.setRestoreRunEmitter(async () => { /* best-effort discipline */ });
await resetWorld();

/* ---------------------------------------------------------------------
   ROUTE HALF — child-server idioms copied from the golden (signup →
   grant restore_operator role → login; plant rows via withDb).
   --------------------------------------------------------------------- */
const makeAuditReader = dataDir => () =>
  withDb(path.join(dataDir, 'projects.db'), db2 =>
    db2.prepare("select * from audit_log where action like 'restore_refused:restoreSource%' order by created_at, id").all());

async function makeRestoreOp(server, email) {
  const joined = await signup(server.base, { name: 'Restore Op', email });
  assert.equal(joined.status, 201, `signup ${email}: ${JSON.stringify(joined.data)}`);
  const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
  const userId = withDb(server.dbPath, db2 => db2.prepare('select id from users where email = ?').get(email).id);
  const grant = await operator.post('/api/auth/operator/instance-roles', { userId, role: 'restore_operator' });
  assert.equal(grant.status, 200, `grant: ${JSON.stringify(grant.data)}`);
  return (await login(server.base, email, 'password-1234')).client;
}

async function makeBackupOpAndRun(server, email, restoreOp) {
  const joined = await signup(server.base, { name: 'Backup Op', email });
  assert.equal(joined.status, 201);
  const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
  const userId = withDb(server.dbPath, db2 => db2.prepare('select id from users where email = ?').get(email).id);
  const grant = await operator.post('/api/auth/operator/instance-roles', { userId, role: 'backup_operator' });
  assert.equal(grant.status, 200, `grant: ${JSON.stringify(grant.data)}`);
  const backupOp = (await login(server.base, email, 'password-1234')).client;
  const post = await backupOp.post('/api/backup/runs', { scope: { kind: 'instance' } });
  assert.equal(post.status, 200, `trigger: ${JSON.stringify(post.data)}`);
  const deadline = Date.now() + 30000;
  for (;;) {
    const poll = await backupOp.get('/api/backup/runs/current');
    assert.equal(poll.status, 200, `poll failed: ${JSON.stringify(poll.data)}`);
    if (poll.data.stage === 'done') break;
    if (poll.data.stage === 'failed') throw new Error(`run failed: ${JSON.stringify(poll.data)}`);
    if (Date.now() > deadline) throw new Error('run poll timeout');
    await new Promise(r => setTimeout(r, 50));
  }
  const list = await restoreOp.get('/api/backup/restore/backups');
  assert.equal(list.status, 200, `list: ${JSON.stringify(list.data)}`);
  const run = list.data.runs.find(r => r.runId === post.data.runId);
  assert.ok(run, 'the completed run appears in the restore list with its filename + sha256');
  return run;
}

function plantRows(server, rows) {
  withDb(server.dbPath, db2 => {
    const ins = db2.prepare(
      `insert into backup_runs (id, task_id, scope, trigger, status, started_at, finished_at, duration_ms, size_bytes, sha256, filename, error, created_at, uploaded, ftp_uploaded, smb_uploaded)
       values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const r of rows) {
      ins.run(
        r.id, r.taskId ?? 'task-matrix', JSON.stringify(r.scope ?? { kind: 'workspace', id: 'ws-1' }), 'manual', 'deleted',
        T, T, 0, 1, r.sha256 ?? 'a'.repeat(64), r.filename ?? 'backup-gone-local.tar.gz', null, T,
        r.uploaded ?? 0, r.ftp_uploaded ?? 0, r.smb_uploaded ?? 0,
      );
    }
  });
}

const LIVES_IN_S3 = 'That backup archive lives in S3 but no S3 destination is configured';
const NOT_RECOGNIZED = 'That restore source is not recognized';
const NO_SURVIVING_COPY = 'That backup archive has no surviving copy at the requested source';

test('104-01 route: preview ?source=local on a real local run resolves the LOCAL archive (200, checksum = run sha256)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-src-param-r1-'));
  const server = await startServer({ dataDir });
  try {
    const restoreOp = await makeRestoreOp(server, 'rop-param-r1@test.local');
    const realRun = await makeBackupOpAndRun(server, 'bop-param-r1@test.local', restoreOp);
    const res = await restoreOp.get(`/api/backup/restore/preview?runId=${realRun.runId}&source=local`);
    assert.equal(res.status, 200, `explicit local preview: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.checksum, realRun.sha256, 'the streamed checksum equals the run sha256 — the LOCAL archive was verified');
  } finally {
    await server.stop();
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('104-01 route: preview ?source=<valid> on a flag-0 run → 400 restoreSourceNotMirrored (no registry fall-through)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-src-param-r2-'));
  const server = await startServer({ dataDir });
  try {
    const restoreOp = await makeRestoreOp(server, 'rop-param-r2@test.local');
    await makeBackupOpAndRun(server, 'bop-param-r2@test.local', restoreOp);
    /* ftp flag = 0 but s3 flag = 1: an explicit ftp request must refuse —
       NEVER fall through to the s3 leg despite its flag being set. */
    plantRows(server, [{ id: 'param-ftp-not-mirrored', uploaded: 1, ftp_uploaded: 0 }]);
    const res = await restoreOp.get('/api/backup/restore/preview?runId=param-ftp-not-mirrored&source=ftp');
    assert.equal(res.status, 400, `flag-0 explicit source: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'restoreSourceNotMirrored');
    assert.equal(res.data.error, NO_SURVIVING_COPY);
  } finally {
    await server.stop();
  }
  const audits = makeAuditReader(dataDir)();
  assert.ok(audits.some(a => a.action === 'restore_refused:restoreSourceNotMirrored'), 'preview not-mirrored refusal audits restore_refused:restoreSourceNotMirrored');
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('104-01 route: preview ?source=bogus → 400 restoreSourceInvalid (never a raw 500)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-src-param-r3-'));
  const server = await startServer({ dataDir });
  try {
    const restoreOp = await makeRestoreOp(server, 'rop-param-r3@test.local');
    await makeBackupOpAndRun(server, 'bop-param-r3@test.local', restoreOp);
    plantRows(server, [{ id: 'param-invalid', uploaded: 1 }]);
    const res = await restoreOp.get('/api/backup/restore/preview?runId=param-invalid&source=bogus');
    assert.equal(res.status, 400, `invalid enum: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'restoreSourceInvalid');
    assert.equal(res.data.error, NOT_RECOGNIZED);
  } finally {
    await server.stop();
  }
  const audits = makeAuditReader(dataDir)();
  assert.ok(audits.some(a => a.action === 'restore_refused:restoreSourceInvalid'), 'preview invalid-source refusal audits restore_refused:restoreSourceInvalid');
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('104-01 route: preview OMITTED source → registry order re-assert (s3 wins over ftp+smb; default path unchanged)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-src-param-r4-'));
  const server = await startServer({ dataDir });
  try {
    const restoreOp = await makeRestoreOp(server, 'rop-param-r4@test.local');
    await makeBackupOpAndRun(server, 'bop-param-r4@test.local', restoreOp);
    plantRows(server, [
      { id: 'param-omit-all-flags', uploaded: 1, ftp_uploaded: 1, smb_uploaded: 1 },
      { id: 'param-omit-ftp-only', ftp_uploaded: 1 },
    ]);
    const all = await restoreOp.get('/api/backup/restore/preview?runId=param-omit-all-flags');
    assert.equal(all.status, 404, `omitted all-flags: ${JSON.stringify(all.data)}`);
    assert.equal(all.data.code, 'restoreArchiveMissing');
    assert.equal(all.data.error, LIVES_IN_S3, 'the s3 enablement refusal answers first — registry order intact');

    const ftpOnly = await restoreOp.get('/api/backup/restore/preview?runId=param-omit-ftp-only&source=');
    assert.equal(ftpOnly.status, 404, `empty-string source counts as omitted: ${JSON.stringify(ftpOnly.data)}`);
    assert.equal(ftpOnly.data.error, 'That backup archive lives in FTP but no FTP destination is configured');
  } finally {
    await server.stop();
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/* ---------------------------------------------------------------------
   ENGINE HALF — resolveRestoreSource explicit-source semantics at the
   helper boundary (structured results; callers own envelope text).
   --------------------------------------------------------------------- */

const deadS3 = { endpoint: 'http://127.0.0.1:1', bucket: 'b', accessKeyId: 'a', secretAccessKey: 's', region: 'r', pathStyle: true };
const deadFtp = { host: '127.0.0.1', port: 1, user: 'u', password: 'p', secure: 'none' };
const deadSmb = { host: '127.0.0.1', port: 1, share: 's', user: 'u', password: 'p' };
const GONE_ROW = { taskId: 'task-fixture', filename: 'backup-gone-local.tar.gz', sha256: 'a'.repeat(64) };

test('104-01 engine: helper explicit invalid enum → sourceInvalid (structured, no throw)', async () => {
  const src = await restore.resolveRestoreSource({ ...GONE_ROW, uploaded: 1 }, { s3: deadS3 }, { source: 'bogus' });
  assert.equal(src.ok, false);
  assert.equal(src.reason, 'sourceInvalid');
  assert.equal(src.err.code, 'restoreArchiveMissing', 'err.code stays the existing family — the golden contract');
});

test('104-01 engine: helper explicit source visits ONLY the requested leg — ftp flag-0 with s3 flag+config → sourceNotMirrored, NO s3 fetch attempted', async () => {
  const src = await restore.resolveRestoreSource({ ...GONE_ROW, uploaded: 1, ftp_uploaded: 0 }, { s3: deadS3 }, { source: 'ftp' });
  assert.equal(src.ok, false);
  assert.equal(src.reason, 'sourceNotMirrored');
  assert.equal(src.dest, 'ftp');
  /* deadS3 points at port 1 — a fetch attempt would surface as fetchFailed.
     sourceNotMirrored proves the registry walk never ran. */
});

test('104-01 engine: helper explicit local with a missing local file → reason missing DIRECTLY (no mirror fall-through, GD-2)', async () => {
  const src = await restore.resolveRestoreSource({ ...GONE_ROW, uploaded: 1, ftp_uploaded: 1, smb_uploaded: 1 }, { s3: deadS3, ftp: deadFtp, smb: deadSmb }, { source: 'local' });
  assert.equal(src.ok, false);
  assert.equal(src.reason, 'missing');
  assert.equal(src.dest, 'local');
  /* dead mirror configs — any registry walk would surface fetchFailed. */
});

test('104-01 engine: helper explicit+disabled destination refuses in BOTH disabledBehavior modes (GD-5 divergence resolved for explicit source)', async () => {
  for (const disabledBehavior of ['refuse', 'skip']) {
    const src = await restore.resolveRestoreSource({ ...GONE_ROW, ftp_uploaded: 1 }, { ftp: null }, { source: 'ftp', disabledBehavior });
    assert.equal(src.ok, false, `disabledBehavior=${disabledBehavior}`);
    assert.equal(src.reason, 'sourceNotMirrored', `disabledBehavior=${disabledBehavior} — explicit+disabled NEVER silent-skips`);
    assert.equal(src.dest, 'ftp');
  }
  /* The DEFAULT path keeps the skip semantics — covered by the golden's
     unit cases (silent skip → "not found at either destination"). */
});

test('104-01 engine: helper explicit source fetches through the REQUESTED leg only (fake S3 serves the real archive)', async () => {
  /* Fake S3: a GET for the requested key streams the REAL fixture archive
     bytes — downloadToStaged's on-pipe sha256 re-verify must pass. */
  const archivePath = path.join(BACKUPS_DIR, sourceRun.filename);
  const fake = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url.includes(encodeURIComponent(sourceRun.filename))) {
      const bytes = fs.readFileSync(archivePath);
      res.writeHead(200, { 'content-length': bytes.length });
      res.end(bytes);
    } else {
      res.writeHead(404, { 'content-type': 'application/xml' });
      res.end('<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code></Error>');
    }
  });
  await new Promise(r => fake.listen(0, '127.0.0.1', r));
  try {
    const rowLike = { ...GONE_ROW, taskId: 'task-fixture', filename: sourceRun.filename, sha256: sourceRun.sha256, uploaded: 1 };
    const src = await restore.resolveRestoreSource(rowLike, { s3: { endpoint: `http://127.0.0.1:${fake.address().port}`, bucket: 'b', accessKeyId: 'a', secretAccessKey: 's', region: 'r', pathStyle: true } }, { source: 's3', runId: 'param-s3-success-run', /* the REAL archive exists locally — override the local derivation so the explicit MIRROR leg is what answers */ archivePath: path.join(BACKUPS_DIR, 'gone-local.tar.gz') });
    assert.equal(src.ok, true, `explicit s3 fetch: ${JSON.stringify({ ...src, err: undefined })}`);
    assert.equal(src.dest, 's3', 'the REQUESTED leg answered');
    assert.equal(src.sha256, sourceRun.sha256, 'the staged fetch re-verified the digest');
    assert.ok(src.stagedPath && fs.existsSync(src.stagedPath), 'a staged temp exists at the seam contract');
    fs.rmSync(src.stagedPath, { force: true }); // caller owns cleanup (D-89-16 parity)
  } finally {
    fake.closeAllConnections?.();
    await new Promise(r => fake.close(r));
  }
});

test('104-01 engine: helper explicit ftp with a LIVE-configured ftp leg but dead endpoint → fetchFailed dest ftp (only that leg visited)', async () => {
  const src = await restore.resolveRestoreSource({ ...GONE_ROW, ftp_uploaded: 1, uploaded: 1 }, { s3: deadS3, ftp: deadFtp }, { source: 'ftp' });
  assert.equal(src.ok, false);
  assert.equal(src.reason, 'fetchFailed');
  assert.equal(src.dest, 'ftp', 'the failure names the REQUESTED leg — the s3 leg (flag set, config present) was never visited');
});

/* ---------------------------------------------------------------------
   UNITS — the structured reasons map through each unit's OWN keyed
   funnel (failWith / throw keyed — never a raw throw past the funnel,
   89-05). Codes ride the new keyed family; envelope text is caller-owned.
   --------------------------------------------------------------------- */

test('104-02 unit: restoreOverwriteUnit explicit source on a flag-0 run → keyed restoreSourceNotMirrored through failWith', async () => {
  await resetWorld();
  const result = await restore.restoreOverwriteUnit({
    runId: 'ovw-param-not-mirrored-1',
    backupRun: { filename: 'backup-gone-local.tar.gz', sha256: 'a'.repeat(64), taskId: 'task-fixture', uploaded: 1, ftp_uploaded: 0, smb_uploaded: 0 },
    scope: { kind: 'workspace', id: 'ws-src' },
    targetWorkspaceId: 'ws-target',
    operator: OP,
    source: 'ftp',
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'restoreSourceNotMirrored');
  assert.ok(result.error.includes('restore:'), 'the envelope text stays caller-owned');
});

test('104-02 unit: runRestore explicit bogus source → keyed restoreSourceInvalid (throw keyed — resolve-by-design)', async () => {
  await resetWorld();
  const result = await restore.runRestore({
    runId: 'runrestore-param-invalid-1',
    backupRun: { filename: 'backup-gone-local.tar.gz', sha256: 'a'.repeat(64), taskId: 'task-fixture', uploaded: 1, ftp_uploaded: 0, smb_uploaded: 0 },
    source: 'bogus',
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'restoreSourceInvalid');
});

test('104-02 unit: restoreInstanceUnit explicit source on a flag-0 run → keyed restoreSourceNotMirrored through failWith', async () => {
  await resetWorld();
  const result = await restore.restoreInstanceUnit({
    runId: 'dr-param-not-mirrored-1',
    backupRun: { filename: 'backup-gone-local.tar.gz', sha256: 'a'.repeat(64), taskId: 'task-fixture', uploaded: 1, ftp_uploaded: 0, smb_uploaded: 0 },
    operator: OP,
    source: 'smb',
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'restoreSourceNotMirrored');
});

/* ---------------------------------------------------------------------
   ROUTE FAMILIES (Task 2): download + verify-checksum refusals, and the
   three trigger POSTs refusing SYNCHRONOUSLY BEFORE the lock claim —
   the same refused trigger re-issued right after gets the SAME keyed
   refusal (never a 409 backupRestoreInProgress), proving the lock row
   was never touched (D-89-23 position, 89-05 CR).
   --------------------------------------------------------------------- */

const BACKUP_VERIFY_REFUSED = dataDir => () =>
  withDb(path.join(dataDir, 'projects.db'), db2 =>
    db2.prepare("select * from audit_log where action like 'backup_%_refused:restoreSource%' order by created_at, id").all());

test('104-02 route: download ?source= — bogus → 400 restoreSourceInvalid; flag-0 valid → 400 restoreSourceNotMirrored (backup_download_refused tokens)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-src-param-dl-'));
  const server = await startServer({ dataDir });
  try {
    const restoreOp = await makeRestoreOp(server, 'rop-param-dl@test.local');
    await makeBackupOpAndRun(server, 'bop-param-dl@test.local', restoreOp);
    plantRows(server, [{ id: 'param-dl-invalid', uploaded: 1 }, { id: 'param-dl-flag0', uploaded: 1, ftp_uploaded: 0 }]);
    const bad = await restoreOp.get('/api/backup/download?runId=param-dl-invalid&source=bogus');
    assert.equal(bad.status, 400, `download bogus: ${JSON.stringify(bad.data)}`);
    assert.equal(bad.data.code, 'restoreSourceInvalid');
    const flag0 = await restoreOp.get('/api/backup/download?runId=param-dl-flag0&source=ftp');
    assert.equal(flag0.status, 400, `download flag-0: ${JSON.stringify(flag0.data)}`);
    assert.equal(flag0.data.code, 'restoreSourceNotMirrored');
  } finally {
    await server.stop();
  }
  const audits = BACKUP_VERIFY_REFUSED(dataDir)();
  assert.ok(audits.some(a => a.action === 'backup_download_refused:restoreSourceInvalid'), 'download audits backup_download_refused:restoreSourceInvalid');
  assert.ok(audits.some(a => a.action === 'backup_download_refused:restoreSourceNotMirrored'), 'download audits backup_download_refused:restoreSourceNotMirrored');
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('104-02 route: verify-checksum body.source — bogus → 400 restoreSourceInvalid; flag-0 valid → 400 restoreSourceNotMirrored (backup_verify_refused tokens)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-src-param-vf-'));
  const server = await startServer({ dataDir });
  try {
    const restoreOp = await makeRestoreOp(server, 'rop-param-vf@test.local');
    await makeBackupOpAndRun(server, 'bop-param-vf@test.local', restoreOp);
    plantRows(server, [{ id: 'param-vf-invalid', uploaded: 1 }, { id: 'param-vf-flag0', uploaded: 1, smb_uploaded: 0 }]);
    const bad = await restoreOp.post('/api/backup/verify-checksum', { runId: 'param-vf-invalid', source: 'bogus' });
    assert.equal(bad.status, 400, `verify bogus: ${JSON.stringify(bad.data)}`);
    assert.equal(bad.data.code, 'restoreSourceInvalid');
    const flag0 = await restoreOp.post('/api/backup/verify-checksum', { runId: 'param-vf-flag0', source: 'smb' });
    assert.equal(flag0.status, 400, `verify flag-0: ${JSON.stringify(flag0.data)}`);
    assert.equal(flag0.data.code, 'restoreSourceNotMirrored');
  } finally {
    await server.stop();
  }
  const audits = BACKUP_VERIFY_REFUSED(dataDir)();
  assert.ok(audits.some(a => a.action === 'backup_verify_refused:restoreSourceInvalid'), 'verify audits backup_verify_refused:restoreSourceInvalid');
  assert.ok(audits.some(a => a.action === 'backup_verify_refused:restoreSourceNotMirrored'), 'verify audits backup_verify_refused:restoreSourceNotMirrored');
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('104-02 route: POST /api/backup/restore trigger refuses source BEFORE the lock claim — re-issued refusal, never 409 (lock still free)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-src-param-tr-'));
  const server = await startServer({ dataDir });
  try {
    const restoreOp = await makeRestoreOp(server, 'rop-param-tr@test.local');
    await makeBackupOpAndRun(server, 'bop-param-tr@test.local', restoreOp);
    plantRows(server, [{ id: 'param-tr-flag0', uploaded: 1, ftp_uploaded: 0 }, { id: 'param-tr-invalid', uploaded: 1 }]);
    const first = await restoreOp.post('/api/backup/restore', { runId: 'param-tr-flag0', source: 'ftp' });
    assert.equal(first.status, 400, `trigger flag-0: ${JSON.stringify(first.data)}`);
    assert.equal(first.data.code, 'restoreSourceNotMirrored');
    /* The lock was never claimed: the SAME refused trigger re-issued
       immediately answers with the SAME 400 — a consumed lock would 409. */
    const again = await restoreOp.post('/api/backup/restore', { runId: 'param-tr-flag0', source: 'ftp' });
    assert.equal(again.status, 400, `re-issued trigger (lock must still be free): ${JSON.stringify(again.data)}`);
    assert.equal(again.data.code, 'restoreSourceNotMirrored');
    const bad = await restoreOp.post('/api/backup/restore', { runId: 'param-tr-invalid', source: 'bogus' });
    assert.equal(bad.status, 400, `trigger bogus: ${JSON.stringify(bad.data)}`);
    assert.equal(bad.data.code, 'restoreSourceInvalid');
  } finally {
    await server.stop();
  }
  const audits = makeAuditReader(dataDir)();
  assert.ok(audits.some(a => a.action === 'restore_refused:restoreSourceNotMirrored'), 'trigger audits restore_refused:restoreSourceNotMirrored');
  assert.ok(audits.some(a => a.action === 'restore_refused:restoreSourceInvalid'), 'trigger audits restore_refused:restoreSourceInvalid');
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('104-02 route: instance + overwrite triggers refuse source (restore_refused tokens; Super Admin / Backup Operator tiers)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-src-param-dr-'));
  const server = await startServer({ dataDir });
  try {
    const backupOpJoined = await signup(server.base, { name: 'Backup Op DR', email: 'bop-param-dr@test.local' });
    assert.equal(backupOpJoined.status, 201);
    const admin = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const userId = withDb(server.dbPath, db2 => db2.prepare("select id from users where email = 'bop-param-dr@test.local'").get().id);
    const grant = await admin.post('/api/auth/operator/instance-roles', { userId, role: 'backup_operator' });
    assert.equal(grant.status, 200, `grant: ${JSON.stringify(grant.data)}`);
    const backupOp = (await login(server.base, 'bop-param-dr@test.local', 'password-1234')).client;
    plantRows(server, [
      { id: 'param-dr-invalid', scope: { kind: 'instance', id: null }, uploaded: 1 },
      { id: 'param-ovw-invalid', scope: { kind: 'workspace', id: 'ws-1' }, uploaded: 1 },
    ]);
    /* the overwrite route gates targetId/confirmName BEFORE the run-row read —
       plant a live target so the source refusal (post-row position) answers. */
    withDb(server.dbPath, db2 => {
      db2.prepare('insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at, archived) values (?,?,?,?,?,?,?,?,?)')
        .run('ws-tgt-param', 'tgt-param-fixture', 'Param Target', '#999999', JSON.stringify({ data: { members: [], projects: [], tasks: [], comments: [], files: [], teams: [], projOrder: [], logo: null, notifs: [], events: [], savedViews: [], recentSearches: [], activity: [] }, _meta: { workspaceName: 'Param Target' } }), 1, T, T, 0);
    });
    const dr = await admin.post('/api/backup/restore/instance', { runId: 'param-dr-invalid', confirmPhrase: 'RESTORE-INSTANCE', source: 'bogus' });
    assert.equal(dr.status, 400, `instance trigger: ${JSON.stringify(dr.data)}`);
    assert.equal(dr.data.code, 'restoreSourceInvalid');
    const owv = await backupOp.post('/api/backup/restore/overwrite', { runId: 'param-ovw-invalid', targetId: 'ws-tgt-param', confirmName: 'Param Target', source: 'nope' });
    assert.equal(owv.status, 400, `overwrite trigger: ${JSON.stringify(owv.data)}`);
    assert.equal(owv.data.code, 'restoreSourceInvalid');
  } finally {
    await server.stop();
  }
  const audits = makeAuditReader(dataDir)();
  assert.ok(audits.filter(a => a.action === 'restore_refused:restoreSourceInvalid').length >= 2, 'both triggers audited restore_refused:restoreSourceInvalid');
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/* ---------------------------------------------------------------------
   TASK 3 MATRIX — the helper-side GD-5 answer (flag = 1, destination
   disabled) surfaces as the SAME keyed family through every sync route;
   explicit local missing surfaces honestly without any mirror fetch.
   --------------------------------------------------------------------- */

test('104-03 matrix: explicit s3 (flag=1, destination disabled) → keyed restoreSourceNotMirrored through preview/download/verify (GD-5, helper-side answer)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-src-param-mx-'));
  const server = await startServer({ dataDir });
  try {
    const restoreOp = await makeRestoreOp(server, 'rop-param-mx@test.local');
    await makeBackupOpAndRun(server, 'bop-param-mx@test.local', restoreOp);
    /* Harness has no S3/FTP/SMB destinations — flag=1 + disabled dest is
       the GD-5 case; the route gate (flags only) passes and the HELPER
       refuses. Never the default-path GONE_ALL envelope. */
    plantRows(server, [{ id: 'param-mx-flag1-disabled', uploaded: 1, ftp_uploaded: 1, smb_uploaded: 1 }]);
    const pv = await restoreOp.get('/api/backup/restore/preview?runId=param-mx-flag1-disabled&source=s3');
    assert.equal(pv.status, 400, `preview GD-5: ${JSON.stringify(pv.data)}`);
    assert.equal(pv.data.code, 'restoreSourceNotMirrored');
    assert.equal(pv.data.error, NO_SURVIVING_COPY);
    const dl = await restoreOp.get('/api/backup/download?runId=param-mx-flag1-disabled&source=ftp');
    assert.equal(dl.status, 400, `download GD-5: ${JSON.stringify(dl.data)}`);
    assert.equal(dl.data.code, 'restoreSourceNotMirrored');
    const vf = await restoreOp.post('/api/backup/verify-checksum', { runId: 'param-mx-flag1-disabled', source: 'smb' });
    assert.equal(vf.status, 400, `verify GD-5: ${JSON.stringify(vf.data)}`);
    assert.equal(vf.data.code, 'restoreSourceNotMirrored');
    /* Explicit LOCAL missing: the refusal surfaces honestly — no mirror
       fetch is attempted (the ladder's explicit-local branch never walks
       the registry; a fall-through would answer fetchFailed). */
    plantRows(server, [{ id: 'param-mx-local-gone', uploaded: 1 }]);
    const loc = await restoreOp.get('/api/backup/restore/preview?runId=param-mx-local-gone&source=local');
    assert.equal(loc.status, 404, `explicit local missing: ${JSON.stringify(loc.data)}`);
    assert.equal(loc.data.code, 'restoreArchiveMissing');
  } finally {
    await server.stop();
  }
  const audits = withDb(path.join(dataDir, 'projects.db'), db2 =>
    db2.prepare("select action, count(*) as n from audit_log where action like '%restoreSource%' or action = 'restore_refused:restoreArchiveMissing' group by action").all());
  const byAction = Object.fromEntries(audits.map(a => [a.action, a.n]));
  assert.ok(byAction['restore_refused:restoreSourceNotMirrored'] >= 1, 'preview GD-5 audited');
  assert.ok(byAction['backup_download_refused:restoreSourceNotMirrored'] >= 1, 'download GD-5 audited');
  assert.ok(byAction['backup_verify_refused:restoreSourceNotMirrored'] >= 1, 'verify GD-5 audited');
  assert.ok(byAction['restore_refused:restoreArchiveMissing'] >= 1, 'explicit-local missing refusal audited');
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/* ---------------------------------------------------------------------

/* ---------------------------------------------------------------------
   LOCALES (GD-7): both keys present ×5 in the SAME commit as the first
   emitting fail() codes.
   --------------------------------------------------------------------- */

test('104-01 locales: err.restoreSourceInvalid + err.restoreSourceNotMirrored present in all five locale files', () => {
  for (const lang of ['en', 'de', 'es', 'fr', 'nl']) {
    const catalog = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src', 'locales', `${lang}.json`), 'utf8'));
    assert.equal(typeof catalog['err.restoreSourceInvalid'], 'string', `${lang}: err.restoreSourceInvalid present`);
    assert.ok(catalog['err.restoreSourceInvalid'].length > 0, `${lang}: err.restoreSourceInvalid non-empty`);
    assert.equal(typeof catalog['err.restoreSourceNotMirrored'], 'string', `${lang}: err.restoreSourceNotMirrored present`);
    assert.ok(catalog['err.restoreSourceNotMirrored'].length > 0, `${lang}: err.restoreSourceNotMirrored non-empty`);
  }
});

/* =====================================================================
   Phase 104 plan 02 — POST /api/backup/restore/probe (RSRC-03).
   Clones the ftp-probe route funnel; dedicated restoreprobe|<uid>
   throttle; NEVER mutates run state; result returned VERBATIM from the
   seam. The ftp "ok" case rides a minimal scripted mock FTP server (the
   same shape as test/backup-ftp-client.test.mjs's fakeFtp, stripped to
   the probe transcript: USER/PASS/TYPE/EPSV/STOR/DELE/QUIT).
   ===================================================================== */

import net from 'node:net';

function fakeFtpProbe() {
  const commands = [];
  const dataReceived = [];
  let dataPort = null;
  let dataDone = false;
  let storPending = null;
  const dataServer = net.createServer(sock => {
    sock.on('data', c => dataReceived.push(c));
    sock.on('end', () => sock.end());
    sock.on('end', () => { dataDone = true; storPending?.(); });
    sock.on('close', () => { dataDone = true; storPending?.(); });
  });
  const ctrlSocks = new Set();
  const ctrl = net.createServer(socket => {
    ctrlSocks.add(socket);
    socket.write('220 mock FTP ready\r\n');
    let buf = '';
    const reply = line => { if (socket.writable) socket.write(line + '\r\n'); };
    socket.on('data', chunk => {
      buf += chunk.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        commands.push(line);
        const cmd = line.toUpperCase();
        if (cmd.startsWith('USER')) reply('331 password required');
        else if (cmd.startsWith('PASS')) reply('230 logged in');
        else if (cmd.startsWith('TYPE')) reply('200 binary mode set');
        else if (cmd.startsWith('EPSV')) reply(`229 Entering Extended Passive Mode (|||${dataPort}|)`);
        else if (cmd.startsWith('PASV')) reply(`227 Entering Passive Mode (127,0,0,1,${dataPort >> 8},${dataPort & 255})`);
        else if (cmd.startsWith('STOR')) {
          storPending = () => { if (socket.writable) socket.write('226 Transfer complete\r\n'); };
          socket.write('150 opening data connection\r\n');
          if (dataDone) storPending();
        } else if (cmd.startsWith('DELE')) reply('250 deleted');
        else if (cmd.startsWith('QUIT')) { reply('221 bye'); socket.end(); }
        else reply('200 ok');
      }
    });
  });
  return {
    commands,
    dataReceived,
    listen: async () => {
      await new Promise(r => ctrl.listen(0, '127.0.0.1', r));
      await new Promise(r => dataServer.listen(0, '127.0.0.1', r));
      dataPort = dataServer.address().port;
    },
    port: () => ctrl.address().port,
    close: async () => {
      for (const s of ctrlSocks) { try { s.destroy(); } catch { /* gone */ } }
      ctrl.closeAllConnections?.();
      dataServer.closeAllConnections?.();
      await Promise.all([new Promise(r => ctrl.close(r)), new Promise(r => dataServer.close(r))]);
    },
  };
}

const PROBE_AUDITS = dataDir => () =>
  withDb(path.join(dataDir, 'projects.db'), db2 =>
    db2.prepare("select * from audit_log where action like 'restore_probe%' order by created_at, id").all());

const flagsOf = (server, runId) =>
  withDb(server.dbPath, db2 => db2.prepare('select uploaded, ftp_uploaded, smb_uploaded from backup_runs where id = ?').get(runId));

test('104-02 probe route: ftp probe through a LIVE fake ftp seam → 200 { ok, key success } VERBATIM, audit restore_probe_ok with key-only detail, flags unchanged', async () => {
  const ftp = fakeFtpProbe();
  await ftp.listen();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-probe-ftp-ok-'));
  const server = await startServer({
    dataDir,
    env: { FTP_HOST: '127.0.0.1', FTP_PORT: String(ftp.port()), FTP_USER: 'probe-user-secret', FTP_PASSWORD: 'probe-pass-secret' },
  });
  try {
    const restoreOp = await makeRestoreOp(server, 'rop-probe-ok@test.local');
    await makeBackupOpAndRun(server, 'bop-probe-ok@test.local', restoreOp);
    plantRows(server, [{ id: 'probe-ftp-ok', uploaded: 0, ftp_uploaded: 1, smb_uploaded: 0 }]);
    const res = await restoreOp.post('/api/backup/restore/probe', { runId: 'probe-ftp-ok', source: 'ftp' });
    assert.equal(res.status, 200, `ftp probe: ${JSON.stringify(res.data)}`);
    assert.deepEqual(
      { ok: res.data.ok, key: res.data.key, warning: res.data.warning, httpWarning: res.data.httpWarning },
      { ok: true, key: 'success', warning: false, httpWarning: true },
      'the seam result returns VERBATIM (secure none → httpWarning true)',
    );
    assert.ok(ftp.commands.some(c => c.startsWith('STOR projects-studio-probe/probe-')), 'the probe marker was STORed — the route hit the REAL seam');
    assert.ok(ftp.commands.some(c => c.startsWith('DELE projects-studio-probe/probe-')), 'the probe marker was DELEted');
    /* T-104-06: zero run-state mutation. */
    const f = flagsOf(server, 'probe-ftp-ok'); assert.deepEqual({ uploaded: f.uploaded, ftp_uploaded: f.ftp_uploaded, smb_uploaded: f.smb_uploaded }, { uploaded: 0, ftp_uploaded: 1, smb_uploaded: 0 }, 'mirror flags byte-identical after the probe');
    /* T-104-05: audit token + result.key-only detail, never config —
       read AFTER stop() (WAL checkpoint, the golden's note). */
  } finally {
    await server.stop();
    await ftp.close();
  }
  const audits = PROBE_AUDITS(dataDir)();
  const ok = audits.find(a => a.action === 'restore_probe_ok');
  assert.ok(ok, 'restore_probe_ok audited');
  assert.equal(ok.target_name, 'success', 'audit detail = result.key ONLY');
  /* the `ip` column legitimately carries the client's loopback — only the
     config-bearing text fields must stay scrubbed. */
  const auditBlob = JSON.stringify({ action: ok.action, target_id: ok.target_id, actor_name: ok.actor_name, actor_email: ok.actor_email, target_name: ok.target_name, target_email: ok.target_email });
  assert.ok(!auditBlob.includes('probe-user-secret') && !auditBlob.includes('probe-pass-secret') && !auditBlob.includes('127.0.0.1'), 'no config/credential text in the audit row (Pitfall 5 / T-98-04)');
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('104-02 probe route: keyed refusals — not-mirrored, invalid enum (incl. local, GD-4), missing run', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-probe-ref-'));
  const server = await startServer({ dataDir });
  try {
    const restoreOp = await makeRestoreOp(server, 'rop-probe-ref@test.local');
    await makeBackupOpAndRun(server, 'bop-probe-ref@test.local', restoreOp);
    plantRows(server, [{ id: 'probe-ref-nm', uploaded: 1, ftp_uploaded: 0, smb_uploaded: 1 }]);
    const nm = await restoreOp.post('/api/backup/restore/probe', { runId: 'probe-ref-nm', source: 'ftp' });
    assert.equal(nm.status, 400, `not-mirrored probe: ${JSON.stringify(nm.data)}`);
    assert.equal(nm.data.code, 'restoreSourceNotMirrored');
    assert.equal(nm.data.error, NO_SURVIVING_COPY);
    const bad = await restoreOp.post('/api/backup/restore/probe', { runId: 'probe-ref-nm', source: 'bogus' });
    assert.equal(bad.status, 400, `invalid probe: ${JSON.stringify(bad.data)}`);
    assert.equal(bad.data.code, 'restoreSourceInvalid');
    assert.equal(bad.data.error, NOT_RECOGNIZED);
    const local = await restoreOp.post('/api/backup/restore/probe', { runId: 'probe-ref-nm', source: 'local' });
    assert.equal(local.status, 400, 'local is NOT probeable (GD-4 — fs.existsSync owns local availability)');
    assert.equal(local.data.code, 'restoreSourceInvalid');
    const missing = await restoreOp.post('/api/backup/restore/probe', { runId: 'probe-ref-gone', source: 'smb' });
    assert.equal(missing.status, 404, `missing run: ${JSON.stringify(missing.data)}`);
    assert.equal(missing.data.code, 'restoreArchiveMissing');
    const f = flagsOf(server, 'probe-ref-nm'); assert.deepEqual({ uploaded: f.uploaded, ftp_uploaded: f.ftp_uploaded, smb_uploaded: f.smb_uploaded }, { uploaded: 1, ftp_uploaded: 0, smb_uploaded: 1 }, 'flags unchanged through every refusal');
  } finally {
    await server.stop();
  }
  const audits = PROBE_AUDITS(dataDir)();
  assert.ok(audits.some(a => a.action === 'restore_probe_refused:restoreSourceNotMirrored'), 'not-mirrored refusal audited');
  assert.ok(audits.some(a => a.action === 'restore_probe_refused:restoreSourceInvalid'), 'invalid-source refusal audited');
  assert.ok(audits.some(a => a.action === 'restore_probe_refused:restoreArchiveMissing'), 'missing-run refusal audited');
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('104-02 probe route: dedicated restoreprobe throttle (10/15min) SEPARATE from the backupprobe budget — 11th probe 429, destination probe route does NOT 429', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-probe-thr-'));
  const server = await startServer({ dataDir });
  try {
    const restoreOp = await makeRestoreOp(server, 'rop-probe-thr@test.local');
    await makeBackupOpAndRun(server, 'bop-probe-thr@test.local', restoreOp);
    plantRows(server, [{ id: 'probe-thr', uploaded: 1, ftp_uploaded: 0 }]);
    /* refused probes consume the restoreprobe budget too (D-89-22) —
       cheap (no seam ever runs on a refusal). */
    for (let i = 0; i < 10; i++) {
      const r = await restoreOp.post('/api/backup/restore/probe', { runId: 'probe-thr', source: 'bogus' });
      assert.equal(r.status, 400, `probe ${i + 1} must be refused (not throttled): ${JSON.stringify(r.data)}`);
    }
    const eleventh = await restoreOp.post('/api/backup/restore/probe', { runId: 'probe-thr', source: 'bogus' });
    assert.equal(eleventh.status, 429, `11th restore probe: ${JSON.stringify(eleventh.data)}`);
    /* Separation: the DESTINATION probe budget (backupprobe|) is a
       different key — the restore-only operator's ftp-probe request
       passes the throttle step and answers its OWN capability 403 (never
       the 429 that a shared budget would return). */
    const dest = await restoreOp.post('/api/backup/tasks/ftp-probe', {});
    assert.equal(dest.status, 403, `destination probe after restoreprobe exhaustion: ${JSON.stringify(dest.data)}`);
    assert.equal(dest.data.code, 'backupManageRequired');
  } finally {
    await server.stop();
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('104-02 probe route: ftp probe of a flag-1 row against a DEAD ftp endpoint → 200 { ok:false, key unreachable } verbatim, audit restore_probe_failed:ftp (key-only detail), flags unchanged', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-probe-dead-'));
  const server = await startServer({
    dataDir,
    env: { FTP_HOST: '127.0.0.1', FTP_PORT: '1', FTP_USER: 'u', FTP_PASSWORD: 'p' },
  });
  try {
    const restoreOp = await makeRestoreOp(server, 'rop-probe-dead@test.local');
    await makeBackupOpAndRun(server, 'bop-probe-dead@test.local', restoreOp);
    plantRows(server, [{ id: 'probe-dead-ftp', uploaded: 0, ftp_uploaded: 1 }]);
    const res = await restoreOp.post('/api/backup/restore/probe', { runId: 'probe-dead-ftp', source: 'ftp' });
    assert.equal(res.status, 200, `dead ftp probe: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.ok, false);
    assert.equal(res.data.key, 'unreachable');
    assert.ok(res.data.error, 'the seam carries its own sliced error text — verbatim');
    const f = flagsOf(server, 'probe-dead-ftp'); assert.deepEqual({ uploaded: f.uploaded, ftp_uploaded: f.ftp_uploaded, smb_uploaded: f.smb_uploaded }, { uploaded: 0, ftp_uploaded: 1, smb_uploaded: 0 }, 'a FAILED probe never mutates run state either');
  } finally {
    await server.stop();
  }
  const audits = PROBE_AUDITS(dataDir)();
  const failed = audits.find(a => a.action === 'restore_probe_failed:ftp');
  assert.ok(failed, 'restore_probe_failed:ftp audited');
  assert.equal(failed.target_name, 'unreachable', 'audit detail = result.key ONLY');
  assert.ok(!JSON.stringify({ action: failed.action, target_id: failed.target_id, target_name: failed.target_name }).includes('127.0.0.1'), 'no endpoint text in the config-bearing audit fields (T-104-05)');
  fs.rmSync(dataDir, { recursive: true, force: true });
});
