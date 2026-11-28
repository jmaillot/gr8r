/* =====================================================================
   Phase 108 plan 01 — CARRY-01: per-run archive stat (RSRC-05).
   NEW file: POST /api/backup/restore/stat — a SEPARATE route beside the
   Phase-104 probe route (CARRIED-ITEMS.md:35: the probe contract stays
   byte-identical to T-104 docs). Harness mirrors restore-source-param:
   unit half (fake S3 sink / fake FTP / fakeSmb frame server) + route
   half (child servers with their own dataDirs, audits read AFTER
   server.stop() — the WAL-checkpoint note).

   What is pinned here:
   - restoreRemoteKey: the ONE shared derivation (export/restore.js,
     extracted from resolveRestoreSource :1482) — s3 → s3BackupKey,
     ftp/smb → `backup-task-${taskId}/${filename}` UNCONDITIONALLY;
   - statS3 / statFtp / statSmb: read-only, three-state keyed results
     ({ present: true | false } | { unreachable: <class> });
   - statSmb's CREATE frame = read()'s minus the READ — FILE_RIGHTS_R +
     FILE_OPEN_IF, NO createOptions, NEVER rm()'s delete-on-close frame
     (Pitfall 2: a delete-on-close stat would DELETE the archive);
   - the route's honest three-state contract + refusal clones (NO new
     err.* keys) + dedicated `restorestat|<uid>` throttle (10/15min,
     SEPARATE from `restoreprobe|` — key separation pinned);
   - the stat NEVER mutates run state (mirror flags byte-identical).
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ADMIN, login, signup, startServer, withDb } from './helpers/server.mjs';
import { headObject, statS3 } from '../export/s3.js';
import { statFtp } from '../export/ftp.js';
import { statSmb } from '../export/smb.js';
import { restoreRemoteKey } from '../export/restore.js';
import { fakeSmb } from './helpers/smb-mock.mjs';

/* ---------------------------------------------------------------------
   UNIT HALF — fake S3 sink (the backup-s3-upload idiom).
   --------------------------------------------------------------------- */
function startSink(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function sinkConfig(port, bucket = 'projects-studio') {
  return {
    endpoint: `http://127.0.0.1:${port}`,
    bucket,
    accessKeyId: 'test',
    secretAccessKey: 'test-secret',
    region: 'us-east-1',
    pathStyle: true,
  };
}

/* Minimal scripted FTP server: USER/PASS/TYPE/SIZE/QUIT only. sizeFor
   maps a path → '213 <n>' | '550' | custom code. */
function fakeFtpStat(sizeFor) {
  const commands = [];
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
        else if (cmd.startsWith('SIZE')) {
          const target = line.slice(5).trim();
          reply(sizeFor(target));
        } else if (cmd.startsWith('QUIT')) { reply('221 bye'); socket.end(); }
        else reply('200 ok');
      }
    });
  });
  return {
    commands,
    listen: async () => { await new Promise(r => ctrl.listen(0, '127.0.0.1', r)); },
    port: () => ctrl.address().port,
    close: async () => {
      for (const s of ctrlSocks) { try { s.destroy(); } catch { /* gone */ } }
      ctrl.closeAllConnections?.();
      await new Promise(r => ctrl.close(r));
    },
  };
}

function ftpConfig(port) {
  return { host: '127.0.0.1', port, user: 'stat-user-secret', password: 'stat-pass-secret', secure: 'none' };
}

const KEY = 'backup-task-task-42/arch.tar.gz';

/* ---- restoreRemoteKey: the ONE shared derivation ---- */

test('108-01 restoreRemoteKey: s3 rides s3BackupKey; ftp/smb are UNCONDITIONAL backup-task- (no backup-manual fallback off S3)', () => {
  assert.equal(restoreRemoteKey('s3', { taskId: 'task-42', filename: 'arch.tar.gz' }), 'backup-task-task-42/arch.tar.gz');
  assert.equal(restoreRemoteKey('s3', { task_id: 'task-42', filename: 'arch.tar.gz' }), 'backup-task-task-42/arch.tar.gz');
  /* ftp/smb never fall back to backup-manual — the S3-only ladder stays
     frozen exactly as resolveRestoreSource computed it at :1482. */
  assert.equal(restoreRemoteKey('ftp', { taskId: 'task-42', filename: 'arch.tar.gz' }), 'backup-task-task-42/arch.tar.gz');
  assert.equal(restoreRemoteKey('smb', { task_id: 'task-42', filename: 'arch.tar.gz' }), 'backup-task-task-42/arch.tar.gz');
  /* taskId normalization: row-shape acceptance (task_id from db rows,
     taskId from units) — explicit, never guessed. */
  assert.equal(restoreRemoteKey('ftp', { taskId: 't9', filename: 'b.tar.gz' }), 'backup-task-t9/b.tar.gz');
});

/* ---- statS3: HEAD via the sink; 404 is the ONLY missing signal (Pitfall 1) ---- */

test('108-01 statS3: HEAD 200 → present; HEAD 404 → missing (s3Status first — HEAD has no XML body, Pitfall 1); 403 → unreachable badCreds; closed port → unreachable', async () => {
  const { server, port } = await startSink((req, res) => {
    if (req.method === 'HEAD' && req.url.endsWith(KEY)) return res.writeHead(200).end();
    res.writeHead(404).end();
  });
  try {
    assert.deepEqual(await statS3(sinkConfig(port), KEY), { present: true });
    assert.deepEqual(await statS3(sinkConfig(port), 'backup-task-task-42/gone.tar.gz'), { present: false });
  } finally {
    server.close();
  }
  const denied = await startSink((req, res) => {
    res.writeHead(403, { 'x-amz-error-code': 'InvalidAccessKeyId', 'content-type': 'application/xml' }).end('<?xml version="1.0"?><Error><Code>InvalidAccessKeyId</Code></Error>');
  });
  try {
    assert.deepEqual(await statS3(sinkConfig(denied.port), KEY), { unreachable: 'badCreds' });
  } finally {
    denied.server.close();
  }
  assert.deepEqual(await statS3(sinkConfig(59999), KEY), { unreachable: 'unreachable' });
});

test('108-01 headObject: 200 → true; 404 → false; other statuses rethrow for the caller to map', async () => {
  const { server, port } = await startSink((req, res) => {
    if (req.method === 'HEAD' && req.url.endsWith('gone.tar.gz')) return res.writeHead(404).end();
    if (req.method === 'HEAD') return res.writeHead(200).end();
    res.writeHead(500).end();
  });
  try {
    assert.equal(await headObject(sinkConfig(port), KEY), true);
    assert.equal(await headObject(sinkConfig(port), 'backup-task-task-42/gone.tar.gz'), false);
  } finally {
    server.close();
  }
});

/* ---- statFtp: SIZE wrapped; 550 → missing; keyed classes verbatim ---- */

test('108-01 statFtp: 213 finite size → present; 550 → missing; 421 → unreachable ftpUnreachable; connect refused → unreachable', async () => {
  const ok = fakeFtpStat(() => '213 12345');
  await ok.listen();
  try {
    assert.deepEqual(await statFtp(ftpConfig(ok.port()), KEY), { present: true });
    assert.ok(ok.commands.some(c => c.startsWith(`SIZE ${KEY}`)), 'the stat issued SIZE against the run key');
  } finally {
    await ok.close();
  }
  const gone = fakeFtpStat(() => '550 file not found');
  await gone.listen();
  try {
    assert.deepEqual(await statFtp(ftpConfig(gone.port()), KEY), { present: false });
  } finally {
    await gone.close();
  }
  const down = fakeFtpStat(() => '421 service not available');
  await down.listen();
  try {
    assert.deepEqual(await statFtp(ftpConfig(down.port()), KEY), { unreachable: 'ftpUnreachable' });
  } finally {
    await down.close();
  }
  assert.deepEqual(await statFtp(ftpConfig(59999), KEY), { unreachable: 'ftpUnreachable' });
});

/* ---- statSmb: read()'s CREATE frame minus the READ — NEVER rm()'s delete-on-close ---- */

function smbConfig(port) {
  return {
    host: '127.0.0.1',
    port,
    user: 'projects-studio',
    domain: 'DOMAIN',
    password: 'projects-studio-secret',
    share: '\\\\127.0.0.1\\projects-studio',
  };
}

test('108-01 statSmb: CREATE(FILE_RIGHTS_R + FILE_OPEN_IF, NO createOptions) + immediate CLOSE → present; NO READ frame, NO delete-on-close (Pitfall 2)', async () => {
  const server = fakeSmb();
  await server.listen();
  try {
    assert.deepEqual(await statSmb(smbConfig(server.port()), KEY), { present: true });
    /* The stat frame = read()'s CREATE verbatim minus the READ. */
    assert.equal(server.creates.length, 1, 'exactly one CREATE issued');
    assert.equal(server.creates[0].name, KEY);
    assert.equal(server.creates[0].access, 0x00120089, 'DesiredAccess = FILE_RIGHTS_R (read-data/attrs + traverse + READ_CONTROL)');
    assert.equal(server.creates[0].disposition, 0x00000001, 'CreateDisposition = FILE_OPEN_IF');
    assert.equal(server.creates[0].createOptions, 0, 'CreateOptions = 0 — NO FILE_DELETE_ON_CLOSE (the rm() frame would DELETE the archive on stat)');
    assert.ok(!server.commands.some(c => c.command === 'read'), 'no READ command — the stat carries no data phase');
    assert.ok(!server.commands.some(c => c.command === 'write'), 'no WRITE command — a stat never writes');
  } finally {
    await server.close();
  }
});

test('108-01 statSmb: 0xc0000034 on CREATE → missing; auth refusal → unreachable authFailed — keyed classes verbatim', async () => {
  const gone = fakeSmb({ createStatus: 0xc0000034 });
  await gone.listen();
  try {
    assert.deepEqual(await statSmb(smbConfig(gone.port()), KEY), { present: false });
  } finally {
    await gone.close();
  }
  const denied = fakeSmb({ sessionSetupStatus: 0xc000006d });
  await denied.listen();
  try {
    assert.deepEqual(await statSmb(smbConfig(denied.port()), KEY), { unreachable: 'authFailed' });
  } finally {
    await denied.close();
  }
  assert.deepEqual(await statSmb({ host: '127.0.0.1', port: 1, user: 'u', domain: 'D', password: 'p', share: '\\\\h\\s' }, KEY), { unreachable: 'unreachable' });
});

/* ---------------------------------------------------------------------
   ROUTE HALF — child servers (mirrors restore-source-param).
   --------------------------------------------------------------------- */

const T = 1700000000000;

async function makeRestoreOp(server, email) {
  const joined = await signup(server.base, { name: 'Restore Op', email });
  assert.equal(joined.status, 201, `signup ${email}: ${JSON.stringify(joined.data)}`);
  const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
  const userId = withDb(server.dbPath, db2 => db2.prepare('select id from users where email = ?').get(email).id);
  const grant = await operator.post('/api/auth/operator/instance-roles', { userId, role: 'restore_operator' });
  assert.equal(grant.status, 200, `grant: ${JSON.stringify(grant.data)}`);
  return (await login(server.base, email, 'password-1234')).client;
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

const STAT_AUDITS = dataDir => () =>
  withDb(path.join(dataDir, 'projects.db'), db2 =>
    db2.prepare("select * from audit_log where action like 'restore_stat%' order by created_at, id").all());

const flagsOf = (server, runId) =>
  withDb(server.dbPath, db2 => db2.prepare('select uploaded, ftp_uploaded, smb_uploaded from backup_runs where id = ?').get(runId));

const NOT_RECOGNIZED = 'That restore source is not recognized';
const NO_SURVIVING_COPY = 'That backup archive has no surviving copy at the requested source';

test('108-01 stat route: ftp present/missing through a LIVE fake ftp seam — three-state contract VERBATIM, restore_stat audits with key-only detail, flags byte-identical', async () => {
  const ftp = fakeFtpStat(target => (target === 'backup-task-task-matrix/backup-gone-local.tar.gz' ? '213 4096' : '550'));
  await ftp.listen();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-stat-ftp-ok-'));
  const server = await startServer({
    dataDir,
    env: { FTP_HOST: '127.0.0.1', FTP_PORT: String(ftp.port()), FTP_USER: 'stat-user-secret', FTP_PASSWORD: 'stat-pass-secret' },
  });
  try {
    const restoreOp = await makeRestoreOp(server, 'rop-stat-ok@test.local');
    plantRows(server, [{ id: 'stat-ftp-ok', uploaded: 0, ftp_uploaded: 1, smb_uploaded: 0 }, { id: 'stat-ftp-gone', uploaded: 0, ftp_uploaded: 1, smb_uploaded: 0, filename: 'backup-gone-ftp.tar.gz' }]);
    const ok = await restoreOp.post('/api/backup/restore/stat', { runId: 'stat-ftp-ok', source: 'ftp' });
    assert.equal(ok.status, 200, `ftp stat present: ${JSON.stringify(ok.data)}`);
    assert.deepEqual(ok.data, { ok: true, present: true, key: 'archivePresent' }, 'present returns the three-state contract verbatim');
    const gone = await restoreOp.post('/api/backup/restore/stat', { runId: 'stat-ftp-gone', source: 'ftp' });
    assert.equal(gone.status, 200, `ftp stat missing: ${JSON.stringify(gone.data)}`);
    assert.deepEqual(gone.data, { ok: false, present: false, key: 'archiveMissing' }, 'reachable+missing is the honest third state');
    /* T-104-06 parity: zero run-state mutation from a stat. */
    for (const id of ['stat-ftp-ok', 'stat-ftp-gone']) {
      const f = flagsOf(server, id);
      assert.deepEqual({ uploaded: f.uploaded, ftp_uploaded: f.ftp_uploaded, smb_uploaded: f.smb_uploaded }, { uploaded: 0, ftp_uploaded: 1, smb_uploaded: 0 }, `mirror flags byte-identical after stat (${id})`);
    }
    /* SIZE against the derived key (single-source ladder — Pitfall 4). */
    assert.ok(ftp.commands.some(c => c.startsWith('SIZE backup-task-task-matrix/backup-gone-local.tar.gz')), 'the route hit the REAL seam at the restoreRemoteKey path');
  } finally {
    await server.stop();
    await ftp.close();
  }
  const audits = STAT_AUDITS(dataDir)();
  const okAudit = audits.find(a => a.action === 'restore_stat_ok');
  assert.ok(okAudit, 'restore_stat_ok audited');
  assert.equal(okAudit.target_name, 'archivePresent', 'audit detail = result.key ONLY');
  const failedAudit = audits.find(a => a.action === 'restore_stat_failed:ftp');
  assert.ok(failedAudit, 'restore_stat_failed:ftp audited');
  assert.equal(failedAudit.target_name, 'archiveMissing', 'failed audit detail = result.key ONLY — never config');
  const auditBlob = JSON.stringify({ actor_name: okAudit.actor_name, target_name: okAudit.target_name });
  assert.ok(!auditBlob.includes('stat-user-secret') && !auditBlob.includes('stat-pass-secret'), 'no credential text in the audit row (T-98-04)');
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('108-01 stat route: keyed refusals reuse the probe code family verbatim — NO new err.* keys', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-stat-ref-'));
  const server = await startServer({ dataDir });
  try {
    const restoreOp = await makeRestoreOp(server, 'rop-stat-ref@test.local');
    plantRows(server, [{ id: 'stat-ref-nm', uploaded: 1, ftp_uploaded: 0, smb_uploaded: 0 }]);
    const nm = await restoreOp.post('/api/backup/restore/stat', { runId: 'stat-ref-nm', source: 'ftp' });
    assert.equal(nm.status, 400, `not-mirrored stat: ${JSON.stringify(nm.data)}`);
    assert.equal(nm.data.code, 'restoreSourceNotMirrored');
    assert.equal(nm.data.error, NO_SURVIVING_COPY);
    const bad = await restoreOp.post('/api/backup/restore/stat', { runId: 'stat-ref-nm', source: 'bogus' });
    assert.equal(bad.status, 400, `invalid source stat: ${JSON.stringify(bad.data)}`);
    assert.equal(bad.data.code, 'restoreSourceInvalid');
    assert.equal(bad.data.error, NOT_RECOGNIZED);
    const local = await restoreOp.post('/api/backup/restore/stat', { runId: 'stat-ref-nm', source: 'local' });
    assert.equal(local.status, 400, `local stat: ${JSON.stringify(local.data)}`);
    assert.equal(local.data.code, 'restoreSourceInvalid', 'GD-4: local is a keyed refusal — a remote stat of local is meaningless');
    const badId = await restoreOp.post('/api/backup/restore/stat', { runId: 'bad id!', source: 'ftp' });
    assert.equal(badId.status, 400, `invalid runId: ${JSON.stringify(badId.data)}`);
    assert.equal(badId.data.code, 'restoreInvalidRunId');
    const missing = await restoreOp.post('/api/backup/restore/stat', { runId: 'stat-no-such-run', source: 'ftp' });
    assert.equal(missing.status, 404, `missing run: ${JSON.stringify(missing.data)}`);
    assert.equal(missing.data.code, 'restoreArchiveMissing');
  } finally {
    await server.stop();
  }
  const audits = STAT_AUDITS(dataDir)();
  for (const action of ['restore_stat_refused:restoreSourceNotMirrored', 'restore_stat_refused:restoreSourceInvalid', 'restore_stat_refused:restoreArchiveMissing']) {
    assert.ok(audits.some(a => a.action === action), `${action} audited`);
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('108-01 stat route: role gate refuses non-operators with backupRoleRequired + restore_stat_refused:restoreRoleRequired', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-stat-role-'));
  const server = await startServer({ dataDir });
  try {
    const joined = await signup(server.base, { name: 'Plain User', email: 'plain-stat@test.local' });
    assert.equal(joined.status, 201);
    const plain = (await login(server.base, 'plain-stat@test.local', 'password-1234')).client;
    const res = await plain.post('/api/backup/restore/stat', { runId: 'stat-role-x', source: 'ftp' });
    assert.equal(res.status, 403, `role refusal: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'backupRoleRequired');
  } finally {
    await server.stop();
  }
  const audits = STAT_AUDITS(dataDir)();
  assert.ok(audits.some(a => a.action === 'restore_stat_refused:restoreRoleRequired'), 'restore_stat_refused:restoreRoleRequired audited');
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('108-01 stat route: dedicated restorestat|<uid> throttle 10/15min — SEPARATE budget from restoreprobe| (key separation)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-stat-throttle-'));
  const server = await startServer({ dataDir });
  try {
    const restoreOp = await makeRestoreOp(server, 'rop-stat-thr@test.local');
    plantRows(server, [{ id: 'stat-thr', uploaded: 1, ftp_uploaded: 0, smb_uploaded: 0 }]);
    /* Exhaust restorestat with 10 refusal-shaped stats (the throttle is
       consumed BEFORE the guards — D-89-22). */
    for (let i = 0; i < 10; i++) {
      const r = await restoreOp.post('/api/backup/restore/stat', { runId: 'stat-thr', source: 'ftp' });
      assert.equal(r.status, 400, `stat #${i + 1} still within budget`);
    }
    const blocked = await restoreOp.post('/api/backup/restore/stat', { runId: 'stat-thr', source: 'ftp' });
    assert.equal(blocked.status, 429, `11th stat blocked: ${JSON.stringify(blocked.data)}`);
    assert.equal(blocked.data.code, 'tooManyAttempts');
    /* Key separation: the probe budget is untouched by the stat drain —
       a probe-shaped request still gets a GUARD answer (400), not 429. */
    const probe = await restoreOp.post('/api/backup/restore/probe', { runId: 'stat-thr', source: 'ftp' });
    assert.equal(probe.status, 400, `probe NOT throttled by the stat drain (restoreprobe| key separate): ${JSON.stringify(probe.data)}`);
    assert.equal(probe.data.code, 'restoreSourceNotMirrored');
  } finally {
    await server.stop();
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
});
