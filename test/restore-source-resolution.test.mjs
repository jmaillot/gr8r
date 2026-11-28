/* =====================================================================
   Phase 103 plan 01 — restore-source resolution GOLDEN (RSRC-01, R-5).
   Written against the UNMODIFIED pre-extraction tree: this file pins the
   CURRENT staged-fetch ladder behavior (six sites: preview / download /
   verify-checksum in server.js; restoreOverwriteUnit / runRestore /
   restoreInstanceUnit in export/restore.js) so plan 02's extraction of
   `resolveRestoreSource` must keep it passing UNCHANGED as its
   byte-identity reference (R-5: refactor before extension, golden-pinned).

   Checker W1 ruling applied: invariant pins assert call-boundary
   BEHAVIOR + verbatim string presence — NEVER per-site call counts
   (counts self-invalidate the moment plan 02 collapses the sites into
   the helper).

   What is pinned, and HOW it survives a faithful extraction:
   - Selection order (local-first, then s3 > ftp > smb) — pinned
     BEHAVIORALLY through the real preview route (server harness) and
     the real restoreOverwriteUnit engine (in-process db-adapter
     harness): the disabled-destination refusals make the order
     observable without any live destination, and the local-resolvable
     cases prove local-first beats all three flags set at once.
   - Per-site refusal ENVELOPES (audit tokens, "lives in X but no X
     destination is configured", "could not be fetched from X (...)",
     the units' keyed messages, the terminals) — pinned VERBATIM at
     each caller's slice: plan 02 keeps envelopes at callers, so these
     pins survive; if 02 moves a string, the golden breaks BY DESIGN.
   - mirrorMissing → clearMirrorFlag — pinned as mechanism BEHAVIOR
     (a real mirror-missing failure input clears EXACTLY that dest's
     flag + writes mirror_flag_cleared:<dest>, verified live through
     fake 404-NoSuchKey S3 and 550-RETR FTP seams) + string presence
     anywhere in each file — never per-site counts.
   - verify-checksum's sha-mismatch RESULT semantics: the ladder catch
     blocks route s3Class/ftpSha256Mismatch/smbSha256Mismatch to
     ok = false, never to a refusal — source-pinned + cross-referenced
     to test/backup-checksum.test.mjs's behavioral "RESULT never a 4xx"
     pin (live e2e is env-gated MinIO there; the mechanism golden here
     is unconditional).

   Zero new dependencies. No production-code changes (plan 02 owns
   those and must pass this file unchanged).
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ADMIN, login, signup, startServer, withDb } from './helpers/server.mjs';

/* ---------------------------------------------------------------------
   ENGINE HALF FIXTURE — temp DATA_DIR + in-process db-adapter (the
   restore-overwrite 89-05 precedent: DATA_DIR set BEFORE the module
   graph imports). The ROUTE half below spawns child servers with their
   own DATA_DIRs; the parent env only feeds the in-process engine.
   --------------------------------------------------------------------- */
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-src-resolution-'));
process.env.DATA_DIR = DATA_DIR;
delete process.env.BACKUPS_DIR; // default: DATA_DIR/backups — never inherit an override
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

let sourceRun = null; // the REAL local archive (filename + sha256) the unit cases resolve against

/* Minimal proven world: one operator, source + target workspaces, the
   source blob pair, one REAL 86-written archive. */
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
restore.setRestoreRunEmitter(async () => { /* events collector — best-effort discipline */ });
await resetWorld();

/* overwriteUnit driver — the 89-05 idiom verbatim (shapes: routes read
   row.task_id/row.id; units read backupRun.taskId + runId param). */
function overwriteUnit(overrides = {}) {
  return restore.restoreOverwriteUnit({
    runId: 'ovw-src-resolution-1',
    backupRun: {
      filename: sourceRun.filename,
      sha256: sourceRun.sha256,
      taskId: 'task-fixture',
      uploaded: 0,
      ftp_uploaded: 0,
      smb_uploaded: 0,
    },
    scope: { kind: 'workspace', id: 'ws-src' },
    targetWorkspaceId: 'ws-target',
    operator: OP,
    ...overrides,
  });
}

const runRow = id => db.get('select id, uploaded, ftp_uploaded, smb_uploaded from backup_runs where id = ?', [id]);
async function plantRun(id, flags, taskId = 'task-fixture') {
  await db.run(
    `insert into backup_runs (id, task_id, scope, trigger, status, started_at, finished_at, duration_ms, size_bytes, sha256, filename, error, created_at, uploaded, ftp_uploaded, smb_uploaded)
     values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, taskId, JSON.stringify({ kind: 'workspace', id: 'ws-src' }), 'manual', 'deleted',
      T, T, 0, 1, sourceRun.sha256, `backup-gone-local-${id}.tar.gz`, null, T,
      flags.uploaded ?? 0, flags.ftp_uploaded ?? 0, flags.smb_uploaded ?? 0,
    ],
  );
}

/* ---------------------------------------------------------------------
   Fake seams for the mirror-truth behavioral pins. A REAL seam failure
   input that mirrorMissing() classifies (s3 404-NoSuchKey, ftp 550 on
   RETR) is the only honest way to prove "failure input for a dest →
   exactly one flag clear for that dest" at the call boundary.
   --------------------------------------------------------------------- */
function fakeS3NotFound() {
  const server = http.createServer((_req, res) => {
    res.writeHead(404, { 'content-type': 'application/xml' });
    res.end('<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>');
  });
  return {
    listen: () => new Promise(r => server.listen(0, '127.0.0.1', r)),
    port: () => server.address().port,
    close: () => new Promise(r => { server.closeAllConnections?.(); server.close(r); }),
  };
}

function fakeFtpNotFound() {
  const dataServer = net.createServer(sock => { sock.end(); }); // 0-byte data stream; RETR's 550 is the verdict
  let dataPort = null;
  const server = net.createServer(sock => {
    sock.write('220 fake ftp ready\r\n');
    let buf = '';
    sock.on('data', chunk => {
      buf += chunk.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\r\n')) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (line.startsWith('USER')) sock.write('331 ok\r\n');
        else if (line.startsWith('PASS')) sock.write('230 ok\r\n');
        else if (line.startsWith('TYPE')) sock.write('200 ok\r\n');
        else if (line.startsWith('EPSV')) sock.write(`229 Entering Extended Passive Mode (|||${dataPort}|)\r\n`);
        else if (line.startsWith('RETR')) sock.write('550 no such file\r\n');
        else if (line.startsWith('QUIT')) { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('200 ok\r\n');
      }
    });
  });
  return {
    listen: async () => {
      await new Promise(r => server.listen(0, '127.0.0.1', r));
      await new Promise(r => dataServer.listen(0, '127.0.0.1', r));
      dataPort = dataServer.address().port;
    },
    port: () => server.address().port,
    close: async () => {
      server.closeAllConnections?.(); dataServer.closeAllConnections?.();
      await new Promise(r => server.close(r));
      await new Promise(r => dataServer.close(r));
    },
  };
}

/* =====================================================================
   PART A — SELECTION-ORDER BEHAVIORAL GOLDEN THROUGH THE REAL ROUTES
   (site 1: preview; site 2: download). Disabled destinations make the
   registry order observable: with no local file, the FIRST flag-set
   leg in s3 > ftp > smb order is the one whose enablement refusal
   answers. Default harness env has S3/FTP/SMB unset → all disabled.
   ===================================================================== */

/* Audit rows are only visible to an external handle AFTER the child
   server exits (post-export wal_checkpoint + writer-close race the raw
   handle — the harness WAL quirk noted in test/helpers/server.mjs).
   Route tests therefore run against an explicit, self-owned dataDir and
   verify audit tokens AFTER server.stop(), when the WAL is durably
   checkpointed. */
const makeAuditReader = dataDir => () =>
  withDb(path.join(dataDir, 'projects.db'), db2 =>
    db2.prepare("select * from audit_log where action like '%restoreArchiveMissing%' order by created_at, id").all());

async function makeRestoreOp(server, email) {
  const joined = await signup(server.base, { name: 'Restore Op', email });
  assert.equal(joined.status, 201, `signup ${email}: ${JSON.stringify(joined.data)}`);
  const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
  const userId = withDb(server.dbPath, db2 => db2.prepare('select id from users where email = ?').get(email).id);
  const grant = await operator.post('/api/auth/operator/instance-roles', { userId, role: 'restore_operator' });
  assert.equal(grant.status, 200, `grant: ${JSON.stringify(grant.data)}`);
  return (await login(server.base, email, 'password-1234')).client;
}

/* A real completed local backup — the only honest way to earn a
   resolvable local archive through the route shape. */
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

const LIVES_IN = {
  s3: 'That backup archive lives in S3 but no S3 destination is configured',
  ftp: 'That backup archive lives in FTP but no FTP destination is configured',
  smb: 'That backup archive lives in SMB but no SMB destination is configured',
};
const GONE_ALL = 'That backup archive is gone from all destinations';

test('103-01 route golden: preview selection order — local-first beats all three flags; disabled-destination refusals expose s3 > ftp > smb; no flags → gone-all (site 1, RSRC-01 core)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-src-route1-'));
  const server = await startServer({ dataDir });
  try {
    const restoreOp = await makeRestoreOp(server, 'rop-src-route@test.local');
    const realRun = await makeBackupOpAndRun(server, 'bop-src-route@test.local', restoreOp);

    /* ALL direct-db access BEFORE/AFTER the real run is done — planted
       rows are data; the ROUTE is the subject under test. */
    withDb(server.dbPath, db2 => {
      const ins = db2.prepare(
        `insert into backup_runs (id, task_id, scope, trigger, status, started_at, finished_at, duration_ms, size_bytes, sha256, filename, error, created_at, uploaded, ftp_uploaded, smb_uploaded)
         values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      );
      const plant = (id, flags) => ins.run(
        id, 'task-matrix', JSON.stringify({ kind: 'workspace', id: 'ws-1' }), 'manual', 'deleted',
        T, T, 0, 1, 'a'.repeat(64), 'backup-gone-local.tar.gz', null, T,
        flags.uploaded ?? 0, flags.ftp_uploaded ?? 0, flags.smb_uploaded ?? 0,
      );
      plant('run-up-only', { uploaded: 1 });
      plant('run-ftp-only', { ftp_uploaded: 1 });
      plant('run-smb-only', { smb_uploaded: 1 });
      plant('run-s3ftp', { uploaded: 1, ftp_uploaded: 1 });
      plant('run-all-flags', { uploaded: 1, ftp_uploaded: 1, smb_uploaded: 1 });
      plant('run-none', {});
      /* The local-first pin: a CLONE of the real run (same filename +
         sha256 → same resolvable local file) wearing ALL THREE flags.
         The ladder must never run — the local archive wins. */
      ins.run(
        'run-clone-flags', realRun.taskId ?? 'task-matrix', JSON.stringify({ kind: 'instance', id: null }), 'manual', 'deleted',
        T, T, 0, 1, realRun.sha256, realRun.filename, null, T, 1, 1, 1,
      );
    });

    /* Flag matrix through the REAL preview route. */
    const expectPreview = async (runId, status, code, message) => {
      const res = await restoreOp.get(`/api/backup/restore/preview?runId=${runId}`);
      assert.equal(res.status, status, `${runId}: ${JSON.stringify(res.data)}`);
      assert.equal(res.data.code, code, `${runId}: ${JSON.stringify(res.data)}`);
      assert.equal(res.data.error, message, `${runId}: ${JSON.stringify(res.data)}`);
      return res;
    };
    await expectPreview('run-up-only', 404, 'restoreArchiveMissing', LIVES_IN.s3);
    await expectPreview('run-ftp-only', 404, 'restoreArchiveMissing', LIVES_IN.ftp);
    await expectPreview('run-smb-only', 404, 'restoreArchiveMissing', LIVES_IN.smb);
    await expectPreview('run-s3ftp', 404, 'restoreArchiveMissing', LIVES_IN.s3, 's3 wins over ftp');
    await expectPreview('run-all-flags', 404, 'restoreArchiveMissing', LIVES_IN.s3, 's3 wins over ftp+smb');
    await expectPreview('run-none', 404, 'restoreArchiveMissing', GONE_ALL);

    /* Local-first: the clone resolves the REAL archive (200), proving
       the ladder was skipped even with s3+ftp+smb flags all set. */
    const clonePreview = await restoreOp.get('/api/backup/restore/preview?runId=run-clone-flags');
    assert.equal(clonePreview.status, 200, `clone preview (local must win): ${JSON.stringify(clonePreview.data)}`);
    assert.equal(clonePreview.data.checksum, realRun.sha256, 'the streamed checksum equals the run sha256 — the LOCAL archive was verified');

    /* Route envelope tokens: every ladder refusal audited with the
       preview prefix (read AFTER stop — see the WAL note above). */
  } finally {
    await server.stop();
  }
  const audits = makeAuditReader(dataDir)();
  assert.ok(audits.some(a => a.action === 'restore_refused:restoreArchiveMissing'), 'preview refusals audit restore_refused:restoreArchiveMissing');
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('103-01 route golden: download selection order — same matrix, backup_download_refused token, local-first streams the real archive (site 2)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-src-route2-'));
  const server = await startServer({ dataDir });
  try {
    const restoreOp = await makeRestoreOp(server, 'rop-src-dl@test.local');
    const realRun = await makeBackupOpAndRun(server, 'bop-src-dl@test.local', restoreOp);
    /* Download of the real (instance-scope) run needs the Super Admin
       tier; the matrix rows are workspace scope so the restore op
       covers them. */
    const admin = (await login(server.base, ADMIN.email, ADMIN.password)).client;

    withDb(server.dbPath, db2 => {
      const ins = db2.prepare(
        `insert into backup_runs (id, task_id, scope, trigger, status, started_at, finished_at, duration_ms, size_bytes, sha256, filename, error, created_at, uploaded, ftp_uploaded, smb_uploaded)
         values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      );
      const plant = (id, flags) => ins.run(
        id, 'task-matrix', JSON.stringify({ kind: 'workspace', id: 'ws-1' }), 'manual', 'deleted',
        T, T, 0, 1, 'a'.repeat(64), 'backup-gone-local.tar.gz', null, T,
        flags.uploaded ?? 0, flags.ftp_uploaded ?? 0, flags.smb_uploaded ?? 0,
      );
      plant('dl-up-only', { uploaded: 1 });
      plant('dl-ftp-only', { ftp_uploaded: 1 });
      plant('dl-smb-only', { smb_uploaded: 1 });
      plant('dl-s3ftp', { uploaded: 1, ftp_uploaded: 1 });
      plant('dl-all-flags', { uploaded: 1, ftp_uploaded: 1, smb_uploaded: 1 });
      plant('dl-none', {});
      ins.run(
        'dl-clone-flags', realRun.taskId ?? 'task-matrix', JSON.stringify({ kind: 'workspace', id: null }), 'manual', 'deleted',
        T, T, 0, 1, realRun.sha256, realRun.filename, null, T, 1, 1, 1,
      );
    });

    const expectDownload = async (runId, status, code, message) => {
      const res = await restoreOp.get(`/api/backup/download?runId=${runId}`);
      assert.equal(res.status, status, `${runId}: ${JSON.stringify(res.data)}`);
      assert.equal(res.data.code, code, `${runId}: ${JSON.stringify(res.data)}`);
      assert.equal(res.data.error, message, `${runId}: ${JSON.stringify(res.data)}`);
      return res;
    };
    await expectDownload('dl-up-only', 404, 'restoreArchiveMissing', LIVES_IN.s3);
    await expectDownload('dl-ftp-only', 404, 'restoreArchiveMissing', LIVES_IN.ftp);
    await expectDownload('dl-smb-only', 404, 'restoreArchiveMissing', LIVES_IN.smb);
    await expectDownload('dl-s3ftp', 404, 'restoreArchiveMissing', LIVES_IN.s3, 's3 wins over ftp');
    await expectDownload('dl-all-flags', 404, 'restoreArchiveMissing', LIVES_IN.s3, 's3 wins over ftp+smb');
    await expectDownload('dl-none', 404, 'restoreArchiveMissing', GONE_ALL);

    /* Local-first through download: the workspace-scope clone streams
       the REAL local archive — the ladder was skipped. */
    const cloneDl = await restoreOp.get('/api/backup/download?runId=dl-clone-flags');
    assert.equal(cloneDl.status, 200, `clone download (local must win): ${JSON.stringify(cloneDl.data)}`);

    /* Super Admin streaming the original instance run — same local
       resolution through the download route shape. */
    const adminDl = await admin.get(`/api/backup/download?runId=${realRun.runId}`);
    assert.equal(adminDl.status, 200, `admin download of the real run: ${JSON.stringify(adminDl.data)}`);
  } finally {
    await server.stop();
  }
  const audits = makeAuditReader(dataDir)();
  assert.ok(audits.some(a => a.action === 'backup_download_refused:restoreArchiveMissing'), 'download refusals audit backup_download_refused:restoreArchiveMissing');
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/* =====================================================================
   PART B — SELECTION-ORDER BEHAVIORAL GOLDEN THROUGH THE UNITS
   (sites 4/5: restoreOverwriteUnit + runRestore). Units receive
   opts.s3Config/ftpConfig/smbConfig from the boot-frozen
   `<Dest>.enabled ? <Dest>.config() : null` seam — null config means
   the leg is SILENTLY SKIPPED (the documented disabled-destination
   divergence from the routes' keyed 404, kept byte-identical in 103).
   ===================================================================== */

test('103-01 unit golden: restoreOverwriteUnit local-first — all three flags + all three bogus configs still resolve the REAL local archive (site 4)', async () => {
  await resetWorld();
  const result = await overwriteUnit({
    backupRun: { filename: sourceRun.filename, sha256: sourceRun.sha256, taskId: 'task-fixture', uploaded: 1, ftp_uploaded: 1, smb_uploaded: 1 },
    s3Config: { endpoint: 'http://127.0.0.1:1', bucket: 'b', accessKeyId: 'a', secretAccessKey: 's', region: 'r', pathStyle: true },
    ftpConfig: { host: '127.0.0.1', port: 1, user: 'u', password: 'p', secure: 'none' },
    smbConfig: { host: '127.0.0.1', port: 1, share: 's', user: 'u', password: 'p' },
  });
  assert.equal(result.ok, true, `local-first overwrite (ladder must be skipped): ${JSON.stringify(result)}`);
});

test('103-01 unit golden: restoreOverwriteUnit disabled-destination silent skip — flags set, no configs → keyed terminal "not found at the resolved path" (site 4, documented divergence)', async () => {
  await resetWorld();
  const result = await overwriteUnit({
    backupRun: { filename: 'backup-gone-local.tar.gz', sha256: 'a'.repeat(64), taskId: 'task-fixture', uploaded: 1, ftp_uploaded: 1, smb_uploaded: 1 },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'restoreArchiveMissing');
  assert.equal(result.error, 'restoreArchiveMissing: restore: archive not found at the resolved path');
});

test('103-01 unit golden: restoreOverwriteUnit seam order — s3 config ahead of ftp config → the S3 seam failure answers first (site 4, s3 > ftp)', async () => {
  await resetWorld();
  const result = await overwriteUnit({
    backupRun: { filename: 'backup-gone-local.tar.gz', sha256: 'a'.repeat(64), taskId: 'task-fixture', uploaded: 1, ftp_uploaded: 1 },
    s3Config: { endpoint: 'http://127.0.0.1:1', bucket: 'b', accessKeyId: 'a', secretAccessKey: 's', region: 'r', pathStyle: true },
    ftpConfig: { host: '127.0.0.1', port: 1, user: 'u', password: 'p', secure: 'none' },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'restoreArchiveMissing');
  assert.match(result.error, /restore: archive not retrievable — local missing and the S3 seam failed \(/, 's3 is the FIRST resolvable leg — its failure answers');
});

test('103-01 unit golden: runRestore disabled-destination silent skip → keyed terminal "not found at either destination" (site 5)', async () => {
  await resetWorld();
  const result = await restore.runRestore({
    runId: 'runrestore-src-resolution-1',
    backupRun: { filename: 'backup-gone-local.tar.gz', sha256: 'a'.repeat(64), taskId: 'task-fixture', uploaded: 1, ftp_uploaded: 1, smb_uploaded: 1 },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'restoreArchiveMissing');
  assert.equal(result.error, 'restore: archive not found at either destination');
});

/* =====================================================================
   PART C — MIRROR-TRUTH BEHAVIORAL PIN (UAT 2026-11-27 invariant).
   A real seam failure the mirrorMissing() classifier accepts clears
   EXACTLY that leg's flag and writes mirror_flag_cleared:<dest> —
   proven live through fake seams (s3 404 NoSuchKey; ftp 550 RETR).
   SMB is pinned at the mechanism boundary (classifier + clear + flag
   isolation) — its live-seam shape is exercised by the 99/100 suites.
   ===================================================================== */

test('103-01 mirror-truth golden: s3 seam 404-NoSuchKey → clearMirrorFlag clears ONLY uploaded + writes mirror_flag_cleared:s3 (site 4 call boundary)', async () => {
  await resetWorld();
  const fake = fakeS3NotFound();
  await fake.listen();
  try {
    await plantRun('mirror-s3-run', { uploaded: 1, ftp_uploaded: 1, smb_uploaded: 1 });
    const before = await runRow('mirror-s3-run');
    assert.equal(before.uploaded, 1, 'fixture: flag set before the failure input');

    const result = await overwriteUnit({
      runId: 'mirror-s3-run',
      backupRun: { filename: 'backup-gone-local.tar.gz', sha256: 'a'.repeat(64), taskId: 'task-fixture', uploaded: 1 },
      s3Config: { endpoint: `http://127.0.0.1:${fake.port()}`, bucket: 'b', accessKeyId: 'a', secretAccessKey: 's', region: 'r', pathStyle: true },
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'restoreArchiveMissing');
    assert.match(result.error, /restore: archive not retrievable — local missing and the S3 seam failed \(/);

    const after = await runRow('mirror-s3-run');
    assert.equal(after.uploaded, 0, 'the s3 mirror flag is cleared BY the verified failure');
    assert.equal(after.ftp_uploaded, 1, 'the ftp flag untouched — exactly ONE flag per failure input');
    assert.equal(after.smb_uploaded, 1, 'the smb flag untouched');

    const audits = await db.all("select * from audit_log where action = 'mirror_flag_cleared:s3' and target_id = 'mirror-s3-run'");
    assert.equal(audits.length, 1, 'exactly one mirror_flag_cleared:s3 audit row');
  } finally {
    await fake.close();
  }
});

test('103-01 mirror-truth golden: ftp seam 550-RETR → clearMirrorFlag clears ONLY ftp_uploaded + writes mirror_flag_cleared:ftp (site 4 call boundary)', async () => {
  await resetWorld();
  const fake = fakeFtpNotFound();
  await fake.listen();
  try {
    await plantRun('mirror-ftp-run', { uploaded: 1, ftp_uploaded: 1, smb_uploaded: 1 });

    const result = await overwriteUnit({
      runId: 'mirror-ftp-run',
      backupRun: { filename: 'backup-gone-local.tar.gz', sha256: 'a'.repeat(64), taskId: 'task-fixture', ftp_uploaded: 1 },
      ftpConfig: { host: '127.0.0.1', port: fake.port(), user: 'u', password: 'p', secure: 'none' },
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'restoreArchiveMissing');
    assert.match(result.error, /restore: archive not retrievable — local missing and the FTP seam failed \(/);

    const after = await runRow('mirror-ftp-run');
    assert.equal(after.ftp_uploaded, 0, 'the ftp mirror flag is cleared BY the verified failure');
    assert.equal(after.uploaded, 1, 'the s3 flag untouched');
    assert.equal(after.smb_uploaded, 1, 'the smb flag untouched');

    const audits = await db.all("select * from audit_log where action = 'mirror_flag_cleared:ftp' and target_id = 'mirror-ftp-run'");
    assert.equal(audits.length, 1, 'exactly one mirror_flag_cleared:ftp audit row');
  } finally {
    await fake.close();
  }
});

test('103-01 mirror-truth golden: smb mechanism boundary — classifier accepts smbClass pathNotFound; clearMirrorFlag(runId, "smb") clears ONLY smb_uploaded', async () => {
  await resetWorld();
  assert.equal(restore.mirrorMissing({ smbClass: 'pathNotFound' }), true, 'the classifier accepts the smb 99-shape failure');
  assert.equal(restore.mirrorMissing({ code: 'ftpPathNotFound' }), true, 'the classifier accepts the ftp 97-shape failure');
  assert.equal(restore.mirrorMissing({ s3Status: 404 }), true, 'the classifier accepts the s3 88-shape failure');
  assert.equal(restore.mirrorMissing(new Error('transport garbage')), false, 'non-mirror transport failures NEVER clear a flag');

  await plantRun('mirror-smb-run', { uploaded: 1, ftp_uploaded: 1, smb_uploaded: 1 });
  await restore.clearMirrorFlag('mirror-smb-run', 'smb');
  const after = await runRow('mirror-smb-run');
  assert.equal(after.smb_uploaded, 0, 'the smb mirror flag cleared');
  assert.equal(after.uploaded, 1, 'the s3 flag untouched');
  assert.equal(after.ftp_uploaded, 1, 'the ftp flag untouched');
  const audits = await db.all("select * from audit_log where action = 'mirror_flag_cleared:smb' and target_id = 'mirror-smb-run'");
  assert.equal(audits.length, 1, 'exactly one mirror_flag_cleared:smb audit row');
});

/* =====================================================================
   PART D — BYTE-IDENTITY STRING CAPTURES (verbatim, per caller slice).
   The envelope strings STAY AT CALLERS in the extraction shape
   (research drift verdict: helper owns selection + fetch +
   mirror-truth; callers keep audit tokens, refusal codes/messages,
   sha-mismatch twist). These pins are plan 02's fixed reference — a
   string that moves breaks the golden BY DESIGN. Mechanism strings
   (mirrorMissing → clearMirrorFlag) are pinned file-wide only —
   checker W1: no per-site call counts.
   ===================================================================== */

const serverSrc = () => fs.readFileSync(path.join(process.cwd(), 'server.js'), 'utf8');
const restoreSrc = () => fs.readFileSync(path.join(process.cwd(), 'export', 'restore.js'), 'utf8');

function routeSlice(s, startMarker, endMarker) {
  const start = s.indexOf(startMarker);
  assert.ok(start !== -1, `route marker found: ${startMarker}`);
  const end = endMarker ? s.indexOf(endMarker, start) : s.length;
  assert.ok(end !== -1, `route end marker found after ${startMarker}: ${endMarker}`);
  return s.slice(start, end);
}

const FETCHED_FROM = {
  s3: 'That backup archive could not be fetched from S3 (',
  ftp: 'That backup archive could not be fetched from FTP (',
  smb: 'That backup archive could not be fetched from SMB (',
};

test('103-01 byte-identity: preview route envelope strings verbatim (site 1)', () => {
  const slice = routeSlice(serverSrc(), "'/api/backup/restore/preview'", "'/api/backup/download'");
  assert.ok(slice.includes('restore_refused:restoreArchiveMissing'), 'preview audit token prefix');
  assert.ok(slice.includes(LIVES_IN.s3), 'lives-in S3 enablement refusal');
  assert.ok(slice.includes(LIVES_IN.ftp), 'lives-in FTP enablement refusal');
  assert.ok(slice.includes(LIVES_IN.smb), 'lives-in SMB enablement refusal');
  assert.ok(slice.includes(GONE_ALL), 'no-flags terminal: gone from all destinations');
  assert.ok(slice.includes(FETCHED_FROM.s3), 's3 transport-failure template (err?.code || err?.message || unknown)');
  assert.ok(slice.includes(FETCHED_FROM.ftp), 'ftp transport-failure template');
  assert.ok(slice.includes(FETCHED_FROM.smb), 'smb transport-failure template');
});

test('103-01 byte-identity: download route envelope strings verbatim (site 2)', () => {
  const slice = routeSlice(serverSrc(), "'/api/backup/download'", "'/api/backup/verify-checksum'");
  assert.ok(slice.includes('backup_download_refused:restoreArchiveMissing'), 'download audit token prefix');
  assert.ok(slice.includes(LIVES_IN.s3));
  assert.ok(slice.includes(LIVES_IN.ftp));
  assert.ok(slice.includes(LIVES_IN.smb));
  assert.ok(slice.includes(GONE_ALL));
  assert.ok(slice.includes(FETCHED_FROM.s3));
  assert.ok(slice.includes(FETCHED_FROM.ftp));
  assert.ok(slice.includes(FETCHED_FROM.smb));
});

test('103-01 byte-identity: verify-checksum envelope + sha-mismatch RESULT semantics (site 3)', () => {
  const s = serverSrc();
  const slice = routeSlice(s, "'/api/backup/verify-checksum'", "'/api/auth/signup'");
  assert.ok(slice.includes('backup_verify_refused:restoreArchiveMissing'), 'verify audit token prefix');
  assert.ok(slice.includes(LIVES_IN.s3));
  assert.ok(slice.includes(LIVES_IN.ftp));
  assert.ok(slice.includes(LIVES_IN.smb));
  assert.ok(slice.includes(GONE_ALL));
  assert.ok(slice.includes(FETCHED_FROM.s3));
  assert.ok(slice.includes(FETCHED_FROM.ftp));
  assert.ok(slice.includes(FETCHED_FROM.smb));

  /* The sha-mismatch twist: a digest mismatch is a RESULT (ok = false),
     NEVER routed to a refusal — the one real route divergence plan 02
     must parameterize, not flatten. */
  assert.ok(slice.includes("err?.s3Class === 'sha256Mismatch'") && slice.includes('ok = false;'), 's3 mismatch → ok = false');
  assert.ok(slice.includes("err?.code === 'ftpSha256Mismatch'"), 'ftp mismatch → ok = false');
  assert.ok(slice.includes("err?.code === 'smbSha256Mismatch'"), 'smb mismatch → ok = false');
  assert.ok(slice.includes('if (mirrorMissing(err))'), 'the verify catch still routes mirrorMissing to the keyed 404 — only the mismatch classes go to ok=false');
  assert.ok(slice.includes('update backup_runs set checksum_ok = ?'), 'both outcomes persist checksum_ok (the 200 result, never a 4xx)');

  /* Cross-reference: the behavioral RESULT pin lives in
     test/backup-checksum.test.mjs ("a RESULT, never a 4xx/5xx") — the
     two files jointly own site 3's semantics (the live mismatch e2e
     there is env-gated MinIO; this source pin is unconditional). */
  const checksumTest = fs.readFileSync(path.join(process.cwd(), 'test', 'backup-checksum.test.mjs'), 'utf8');
  assert.ok(checksumTest.includes('never a 4xx/5xx'), 'backup-checksum behavioral RESULT pin present (cross-reference)');
});

function unitSlice(s, startMarker, endMarker) {
  const start = s.indexOf(startMarker);
  assert.ok(start !== -1, `unit marker found: ${startMarker}`);
  const end = endMarker ? s.indexOf(endMarker, start) : s.length;
  assert.ok(end !== -1, `unit end marker found after ${startMarker}: ${endMarker}`);
  return s.slice(start, end);
}

const SEAM_FAILED = {
  s3: 'restore: archive not retrievable — local missing and the S3 seam failed (',
  ftp: 'restore: archive not retrievable — local missing and the FTP seam failed (',
  smb: 'restore: archive not retrievable — local missing and the SMB seam failed (',
};
const UNIT_TERMINAL = 'restore: archive not found at the resolved path';
const RUNRESTORE_TERMINAL = 'restore: archive not found at either destination';

test('103-01 byte-identity: restoreOverwriteUnit keyed envelopes verbatim (site 4)', () => {
  const slice = unitSlice(restoreSrc(), 'export async function restoreOverwriteUnit(', 'export async function runRestore(');
  assert.ok(slice.includes(SEAM_FAILED.s3));
  assert.ok(slice.includes(SEAM_FAILED.ftp));
  assert.ok(slice.includes(SEAM_FAILED.smb));
  assert.ok(slice.includes(UNIT_TERMINAL));
  assert.ok(slice.includes('failWith(keyed(\'restoreArchiveMissing\''), 'overwrite routes failures through failWith (lock-release funnel, 89-05 CR)');
});

test('103-01 byte-identity: runRestore keyed envelopes verbatim (site 5)', () => {
  const slice = unitSlice(restoreSrc(), 'export async function runRestore(', 'export async function restoreInstanceUnit(');
  assert.ok(slice.includes(SEAM_FAILED.s3));
  assert.ok(slice.includes(SEAM_FAILED.ftp));
  assert.ok(slice.includes(SEAM_FAILED.smb));
  assert.ok(slice.includes(RUNRESTORE_TERMINAL));
  assert.ok(slice.includes('throw keyed(\'restoreArchiveMissing\''), 'import_new throws keyed (no failWith in this unit — today\'s shape)');
});

test('103-01 byte-identity: restoreInstanceUnit keyed envelopes verbatim (site 6)', () => {
  const slice = unitSlice(restoreSrc(), 'export async function restoreInstanceUnit(', null);
  assert.ok(slice.includes(SEAM_FAILED.s3));
  assert.ok(slice.includes(SEAM_FAILED.ftp));
  assert.ok(slice.includes(SEAM_FAILED.smb));
  assert.ok(slice.includes(UNIT_TERMINAL));
  assert.ok(slice.includes('failWith(keyed(\'restoreArchiveMissing\''), 'DR routes failures through failWith (lock-release funnel)');
});

test('103-01 byte-identity: mirror-truth mechanism present in both files (file-wide string presence — checker W1: no per-site counts)', () => {
  const r = restoreSrc();
  assert.ok(r.includes('export function mirrorMissing('), 'the classifier is defined in the engine (UAT 2026-11-27 doctrine home)');
  assert.ok(r.includes('export async function clearMirrorFlag('), 'the flag-clear primitive is defined in the engine');
  assert.ok(r.includes('if (mirrorMissing(err)) await clearMirrorFlag('), 'the ladder catch shape exists in restore.js');
  const s = serverSrc();
  assert.ok(s.includes('mirrorMissing') && s.includes('clearMirrorFlag'), 'server.js references the mirror-truth pair (imported from the engine)');
});
