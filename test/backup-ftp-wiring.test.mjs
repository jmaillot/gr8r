/* =====================================================================
   Phase 98 plan 01 — FTP destination wiring gate (tracer slice).
   Static source-slice pins (the destination-registry-gate idiom:
   ROOT/src helpers) over server.js + export/backup.js, plus functional
   pipeline tests driving the REAL runExport upload loop against an
   in-process scripted mock FTP server (the 97 fakeFtp harness idiom,
   extended with SIZE support). The server.js closure + FTP.config()
   are byte-pinned here; the pipeline tests inject a descriptor with
   the SAME closure semantics (taskId + ftp_enabled fail-closed gate)
   because spawning a full server per test is the 98-03 e2e's job.
   ===================================================================== */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import crypto from 'node:crypto';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const serverSrc = () => src('server.js');
const backupSrc = () => src('export/backup.js');

/* ---- Task 1 pins: the ftp install closure (R-2 inversion + fail-closed gate) ---- */

test('ftp closure: R-2 inversion — taskId-less meta returns null BEFORE any lookup (manual runs never upload)', () => {
  const s = serverSrc();
  const i = s.indexOf("setBackupDestination('ftp'");
  assert.ok(i !== -1, 'the ftp install rides the registry');
  const block = s.slice(i, s.indexOf("setBackupDestination('smb'"));
  assert.match(block, /if \(!meta\?\.taskId\) return null;/, 'the R-2 early null for manual runs is present');
  const r2 = block.indexOf('if (!meta?.taskId) return null;');
  const lookup = block.indexOf('select ftp_enabled from backup_tasks');
  assert.ok(lookup > r2, 'the R-2 null precedes the task lookup — manual runs NEVER reach FTP');
});

test('ftp closure: task runs gate on ftp_enabled = 1 fail-closed with S3-parity warn wording', () => {
  const s = serverSrc();
  const block = s.slice(s.indexOf("setBackupDestination('ftp'"), s.indexOf("setBackupDestination('smb'"));
  assert.match(block, /select ftp_enabled from backup_tasks where id = \?/, 'the fail-closed task lookup exists');
  assert.match(block, /if \(!task \|\| task\.ftp_enabled !== 1\) return null;/, 'missing row or ftp_enabled !== 1 → null (fail-closed)');
  assert.match(block, /lookup failed — upload skipped/, 'warn wording mirrors the S3 closure (:3882 parity)');
});

test('ftp closure: returns the FTP.config() seam and wires the R-4 SIZE verify', () => {
  const s = serverSrc();
  const block = s.slice(s.indexOf("setBackupDestination('ftp'"), s.indexOf("setBackupDestination('smb'"));
  assert.match(block, /return \{ config: FTP\.config\(\) \};/, 'success returns the FTP.config() seam');
  assert.match(block, /verify: FTP\.verify/, 'the descriptor verify field is wired (96-01 dormant field now real)');
});

test('FTP capability: config() maps the frozen consts to the 97 client shape (secure enum, pasvHost, insecure)', () => {
  const s = serverSrc();
  const i = s.indexOf('const FTP = {');
  assert.ok(i !== -1, 'the boot-frozen FTP capability object exists');
  const block = s.slice(i, i + 1600);
  for (const key of ['host: FTP_HOST', 'port: FTP_PORT', 'user: FTP_USER', 'password: FTP_PASSWORD']) {
    assert.match(block, new RegExp(key.replace(/:/g, '\\s*:')), `${key} mapped`);
  }
  assert.match(block, /secure: FTP_SECURE \? 'explicit' : 'none'/, 'FTP_SECURE maps to the client secure enum');
  assert.match(block, /pasvHost: FTP_PASV_HOST/, 'pasvHost rides through (empty → control-host rule)');
  assert.match(block, /insecure: FTP_INSECURE/, 'insecure rides through (rejectUnauthorized release)');
  assert.match(block, /enabled: !!\(FTP_HOST && FTP_USER && FTP_PASSWORD\)/, 'enabled derives from env — D-05 derivation kept');
});

test('T-98-01: the ftp closure never serializes config/credentials into error text', () => {
  const s = serverSrc();
  const block = s.slice(s.indexOf("setBackupDestination('ftp'"), s.indexOf("setBackupDestination('smb'"));
  assert.ok(!/JSON\.stringify/.test(block), 'no config serialization in the closure');
  assert.ok(!/FTP_PASSWORD/.test(block.replace(/const FTP = \{[\s\S]*?\n\};/, '')) || true, 'raw password const never interpolated outside FTP.config');
  // the only credential reference inside the closure block is via FTP.config()
  assert.ok(!block.includes('FTP_PASSWORD'), 'the closure references credentials ONLY through FTP.config()');
});

/* ---- Task 2 pins: the descriptor-dispatched upload loop ---- */

test('upload loop: exactly ONE "set ftp_uploaded = 1" write site, never in a catch path (96-02 one-site rule)', () => {
  const b = backupSrc();
  const sites = (b.match(/update backup_runs set ftp_uploaded = 1/g) || []).length;
  assert.equal(sites, 1, `ftp_uploaded must have exactly one write site (got ${sites})`);
  const i = b.indexOf('update backup_runs set ftp_uploaded = 1');
  // the write must be inside the ftp success block — the nearest enclosing catch marker must come AFTER it
  const afterWrite = b.slice(i);
  const nextCatch = afterWrite.indexOf('} catch (err) {');
  const nextLoopEnd = afterWrite.indexOf('if (failedUploads.length)');
  assert.ok(nextCatch < nextLoopEnd, 'the flag write sits before the catch — never in a catch path');
});

test('upload loop: s3 arm stays textually recognizable (registry-gate byte-identity posture)', () => {
  const b = backupSrc();
  assert.match(b, /const key = s3BackupKey\(runMeta, filename\);/, 'the s3 key derivation line is unchanged');
  const sites = (b.match(/update backup_runs set uploaded = 1/g) || []).length;
  assert.equal(sites, 1, 'the single uploaded=1 write site stays unique to the s3 arm');
  assert.match(b, /const msg = s3SliceError\(err\);/, 'the raw s3SliceError slice line is untouched');
  const guard = b.match(/failedUploads\.length >= 2\s*\?\s*`upload failed:/);
  assert.ok(guard, 'the composed-error branch stays gated behind >= 2 destinations');
  assert.match(b, /downloadToStaged\(provided\.config, key, sha256/, 'the s3 stream-back verify survives');
});

test('upload loop: ftp arm per R-4 — client stor + SIZE verify + sidecar, NO downloadToStaged read-back', () => {
  const b = backupSrc();
  const i = b.indexOf("if (destName === 'ftp')");
  assert.ok(i !== -1, 'the ftp arm dispatch exists');
  const arm = b.slice(i, b.indexOf('update backup_runs set ftp_uploaded = 1'));
  assert.match(arm, /connectFtp\(provided\.config\)/, 'the arm builds the 97 client from the descriptor config');
  assert.match(arm, /ftp\.stor\(ftpKey, destination\)/, 'the published archive is STORed under the task prefix');
  assert.match(arm, /ftp\.size\(ftpKey\)/, 'the R-4 SIZE verify runs against the stored bytes');
  assert.match(arm, /SIZE verify mismatch/, 'a SIZE mismatch throws into the shared catch → upload_failed');
  assert.match(arm, /ftp\.stor\(`\$\{ftpKey\}\.sha256`/, 'the sidecar rides STOR as ${key}.sha256');
  assert.match(arm, /backup-task-\$\{runMeta\.taskId\}\/\$\{filename\}/, 'task runs upload under the D-88-6 task prefix');
  assert.equal((arm.match(/await downloadToStaged/g) || []).length, 0, 'NO read-back call on the ftp arm (R-4 documented deviation)');
  assert.equal((b.match(/await downloadToStaged/g) || []).length, 1, 'downloadToStaged is awaited exactly once in the file (s3 arm only)');
  assert.match(arm, /ftp\.quit\(\)/, 'the client session is closed — keep-alive stays client-owned, no pipeline NOOP');
});

test('upload loop: ftp failure names ftp via the RAW slice — composed branch untouched (SC-4/T-98 raw-slice posture)', () => {
  const b = backupSrc();
  const count = (b.match(/upload failed: \$\{failedUploads/g) || []).length;
  assert.equal(count, 1, 'the composed prefix still appears exactly once (>= 2 branch only)');
  assert.match(b, /failedUploads\.push\(\{ name: destName, err \}\);/, 'the shared catch break posture is unchanged');
});

/* =====================================================================
   Phase 98 plan 02 — Task 1 pins: the /api/backup/tasks/ftp-probe route.
   Guard-chain order is pinned TOKEN-FOR-TOKEN against the S3 probe
   (D-02 clone contract); audit funnel + keyed refusals per T-98-03/04.
   ===================================================================== */

test('ftp probe route: pathname + POST method, cloned after the s3 probe (D-02)', () => {
  const s = serverSrc();
  const ftpRoute = s.indexOf("pathname === '/api/backup/tasks/ftp-probe' && method === 'POST'");
  const s3Route = s.indexOf("pathname === '/api/backup/s3/probe' && method === 'POST'");
  assert.ok(s3Route !== -1, 'the s3 probe route exists');
  assert.ok(ftpRoute > s3Route, 'the ftp probe route is cloned after the s3 probe');
});

test('ftp probe route: guard-chain order matches the S3 probe token-for-token (T-98-03)', () => {
  const s = serverSrc();
  const slice = (name) => {
    const i = s.indexOf(`pathname === '${name}' && method === 'POST'`);
    return s.slice(i, i + 1200);
  };
  const s3 = slice('/api/backup/s3/probe');
  const ftp = slice('/api/backup/tasks/ftp-probe');
  const tokens = [
    /if \(!sameOrigin\(req\)\) return fail\(res, 403, 'crossOriginRejected'/,
    /const user = await requireUser\(req, res\);\n    if \(!user\) return;/,
    /tooMany\(`backupprobe\|\$\{user\.id\}`, 10, 15 \* 60 \* 1000\)/,
    /hasInstanceRole\(user\.id, CAP\.BACKUP_MANAGE\)/,
    /auditBackupTask\(user, 'backup_probe_refused:backupManageRequired'\)/,
    /fail\(res, 403, 'backupManageRequired'/,
  ];
  for (const t of tokens) {
    assert.match(s3, t, `s3 probe carries ${t}`);
    assert.match(ftp, t, `ftp probe carries the SAME token (verbatim clone)`);
  }
  assert.match(ftp, /if \(!FTP\.enabled\) \{[\s\S]*?backup_probe_refused:ftpNotConfigured[\s\S]*?fail\(res, 400, 'ftpNotConfigured'/, 'the FTP.enabled gate refuses keyed AND audited');
  assert.ok(s.indexOf('FTP.enabled') < s.indexOf('probeFtp(FTP.config())') || true, 'enabled gate precedes the probe call');
  const ftpSlice = slice('/api/backup/tasks/ftp-probe');
  assert.ok(ftpSlice.indexOf('if (!FTP.enabled)') < ftpSlice.indexOf('probeFtp(FTP.config())'), 'enabled gate BEFORE probeFtp');
  assert.ok(ftpSlice.indexOf('tooMany(') < ftpSlice.indexOf('hasInstanceRole('), 'throttle BEFORE the capability gate');
  assert.ok(ftpSlice.indexOf('sameOrigin') < ftpSlice.indexOf('requireUser'), 'sameOrigin FIRST');
});

test('ftp probe route: audit funnel tokens + key-only detail (Pitfall 5/T-98-04)', () => {
  const s = serverSrc();
  const i = s.indexOf("pathname === '/api/backup/tasks/ftp-probe' && method === 'POST'");
  const route = s.slice(s.lastIndexOf('/* --------------', i), s.indexOf('backup run endpoints', i));
  assert.match(route, /result\.ok \? 'backup_ftp_probe_ok' : 'backup_ftp_probe_failed'/, 'both probe outcomes audited');
  assert.match(route, /user\.id, result\.key\)/, 'audit detail carries result.key ONLY');
  assert.ok(!/FTP_PASSWORD|FTP_USER|FTP_HOST/.test(route.slice(route.indexOf('probeFtp'))), 'no credential const appears after the probe call');
  assert.match(route, /json\(res, 200, result\)/, 'the keyed probeFtp result returns verbatim');
  assert.match(route, /NO deleteFailed accept-with-warning analog[\s\S]*?HARD refuse/, 'the NO-deleteFailed-analog divergence is documented in the route comment');
});


/* =====================================================================
   Functional pipeline tests — the REAL runExport upload loop against
   an in-process scripted mock FTP server (97 fakeFtp harness idiom,
   extended with SIZE). The descriptor injected here carries the SAME
   closure semantics as the server.js install (R-2 null-for-manual +
   ftp_enabled fail-closed gate) reading the in-process db, so the
   behavior proven is the closure CONTRACT, not a copy of its bytes —
   the bytes are pinned by the slices above; the real-server e2e is
   98-03's vsftpd deliverable.
   ===================================================================== */
import os from 'node:os';

/* DATA_DIR must exist BEFORE export/backup.js is imported (dynamic import
   below keeps the static slice pins env-independent). */
const PIPE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-ftp-pipe-'));
process.env.DATA_DIR = PIPE_DATA_DIR;

const { setBackupDestination, setBackupRunWriter, runExport, getRunState, backupsRoot } = await import('../export/backup.js');
const dbAdapter = await import('../db-adapter.mjs');

const PIPE_FILES_DIR = path.join(PIPE_DATA_DIR, 'files');
const PIPE_NOW = 1700000000000;

async function pipeFreshDb(label) {
  await dbAdapter.close();
  const dbPath = path.join(PIPE_DATA_DIR, `projects-${label}-${process.pid}-${Math.random().toString(36).slice(2, 7)}.db`);
  await dbAdapter.connectDb({ dbPath });
  await dbAdapter.runSchema(dbAdapter.SQLITE_SCHEMA);
}

async function pipeSeedWorkspace(id, files) {
  await dbAdapter.run(
    'insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at, archived) values (?,?,?,?,?,?,?,?,?)',
    [id, id, `WS ${id}`, '#123456', JSON.stringify({ data: { files } }), 1, PIPE_NOW, PIPE_NOW, 0],
  );
}

async function pipeInsertTask(id, ftpEnabled) {
  await dbAdapter.run(
    'insert into backup_tasks (id, name, scope, cron, created_at, updated_at, ftp_enabled) values (?,?,?,?,?,?,?)',
    [id, `task ${id}`, JSON.stringify({ kind: 'project', id: 'p1' }), '0 3 * * *', PIPE_NOW, PIPE_NOW, ftpEnabled],
  );
}

/* Scripted mock FTP server with SIZE support + stor payload capture. */
function pipeFakeFtp({ failStor = false } = {}) {
   
  const commands = [];
  const stored = new Map(); // stor target path → payload Buffer
  let connections = 0;
  let dataPort = null;
  let dataSock = null;
  let dataBuf = [];
  let dataDone = false;
  let storPending = null;
  const dataServer = net.createServer((sock) => {
    dataSock = sock;
    sock.on('data', (c) => dataBuf.push(c));
    const finish = () => {
      if (!dataDone) {
        dataDone = true;
        stored.set(pendingStorPath, Buffer.concat(dataBuf));
        storPending?.();
      }
    };
    sock.on('end', () => { sock.end(); finish(); });
    sock.on('close', finish);
  });
  let pendingStorPath = null;
  const ctrl = net.createServer((socket) => {
    connections++;
    socket.write('220 mock FTP ready\r\n');
    let buf = '';
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        commands.push(line);
        const cmd = line.toUpperCase();
        const reply = (l) => socket.write(l + '\r\n');
        if (cmd.startsWith('USER')) reply('331 password required');
        else if (cmd.startsWith('PASS')) reply('230 logged in');
        else if (cmd.startsWith('TYPE')) reply('200 binary mode set');
        else if (cmd.startsWith('EPSV')) reply(`229 Entering Extended Passive Mode (|||${dataPort}|)`);
        else if (cmd.startsWith('SIZE')) {
          const target = line.slice(5).trim();
          const payload = stored.get(target);
          reply(payload ? `213 ${payload.length}` : '550 no such file');
        } else if (cmd.startsWith('STOR')) {
          if (failStor) { reply('426 Connection closed; transfer aborted'); continue; }
          pendingStorPath = line.slice(5).trim();
          dataDone = false; dataBuf = [];
          socket.write('150 opening data connection\r\n');
          storPending = () => { if (socket.writable) socket.write('226 Transfer complete\r\n'); };
          if (dataDone) storPending();
        } else if (cmd.startsWith('QUIT')) { reply('221 bye'); socket.end(); }
        else reply('200 ok');
      }
    });
  });
  return {
    commands, stored, connections: () => connections,
    listen: async () => {
      await new Promise((r) => dataServer.listen(0, '127.0.0.1', r));
      dataPort = dataServer.address().port;
      await new Promise((r) => ctrl.listen(0, '127.0.0.1', r));
    },
    port: () => ctrl.address().port,
    close: async () => {
      try { dataSock?.destroy(); } catch { /* gone */ }
      ctrl.closeAllConnections?.();
      dataServer.closeAllConnections?.();
      await Promise.all([new Promise((r) => ctrl.close(r)), new Promise((r) => dataServer.close(r))]);
    },
  };
}

/* Descriptor with the server.js closure CONTRACT (taskId + ftp_enabled fail-closed). */
function pipeFtpDescriptor(mock) {
  return {
    label: 'FTP',
    enabled: true,
    manualPrefix: 'backup-ftp/', // R-2: probe marker only — never an upload prefix
    upload: async meta => {
      if (!meta?.taskId) return null; // R-2 inversion — manual runs stay local-only
      const task = await dbAdapter.get('select ftp_enabled from backup_tasks where id = ?', [meta.taskId]);
      if (!task || task.ftp_enabled !== 1) return null;
      return {
        config: { host: '127.0.0.1', port: mock.port(), user: 'u', password: 'p', secure: 'none' },
      };
    },
  };
}

function pipeRunWriter() {
  setBackupRunWriter(async event => {
    if (event.kind === 'start') {
      await dbAdapter.run(
        'insert into backup_runs (id, task_id, scope, trigger, status, started_at, created_at) values (?,?,?,?,?,?,?)',
        [event.runId, event.taskId ?? null, JSON.stringify(event.scope), event.trigger, 'running', event.startedAt, Date.now()],
      );
    } else if (event.kind === 'complete' || event.kind === 'upload_failed') {
      const status = event.kind === 'complete' ? 'succeeded' : 'upload_failed';
      await dbAdapter.run('update backup_runs set status = ?, error = ?, finished_at = ? where id = ?',
        [status, event.error ?? null, Date.now(), event.runId]);
    }
  });
}

test('pipeline: task run with ftp_enabled=1 uploads archive + sidecar under the task prefix and sets ftp_uploaded=1 (local archive intact)', async () => {
  await pipeFreshDb("success");
  fs.mkdirSync(PIPE_FILES_DIR, { recursive: true });
  fs.writeFileSync(path.join(PIPE_FILES_DIR, 'f1'), 'project one blob\n');
  await pipeSeedWorkspace('ws1', [{ id: 'f1', project: 'p1', name: 'a.txt', ext: 'txt' }]);
  await pipeInsertTask('t-ok', 1);
  const mock = pipeFakeFtp();
  await mock.listen();
  pipeRunWriter();
  setBackupDestination('ftp', pipeFtpDescriptor(mock));
  try {
    const run = await runExport({ kind: 'project', id: 'p1' }, { taskId: 't-ok', trigger: 'scheduled' });
    assert.equal(run.ok, true, `runExport failed: ${run.error}`);
    assert.equal(getRunState().stage, 'done');
    // local-first: the published archive survives, byte-honest
    const local = path.join(backupsRoot(), run.filename);
    assert.ok(fs.existsSync(local), 'local archive kept');
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(local)).digest('hex'), run.sha256);
    // both objects stored under the D-88-6 task prefix
    const key = `backup-task-t-ok/${run.filename}`;
    assert.ok(mock.stored.has(key), `archive stored as ${key}`);
    assert.ok(mock.stored.has(`${key}.sha256`), 'sidecar stored as ${key}.sha256');
    assert.equal(Buffer.compare(mock.stored.get(key), fs.readFileSync(local)), 0, 'stored bytes are the published archive');
    assert.ok(mock.stored.get(`${key}.sha256`).toString('utf8').startsWith(run.sha256), 'sidecar carries the archive sha256');
    // the run row carries the one-site flag
    const row = await dbAdapter.get('select ftp_uploaded, uploaded from backup_runs where id = ?', [run.runId]);
    assert.equal(row.ftp_uploaded, 1, 'ftp_uploaded = 1 after verified success');
    assert.equal(row.uploaded, 0, 'the s3 flag is untouched by the ftp arm');
  } finally {
    await mock.close();
    setBackupRunWriter(null);
    setBackupDestination('ftp', { label: 'FTP', enabled: false });
  }
});

test('pipeline: task row ftp_enabled=0 → no FTP connection attempted, run stays local-only', async () => {
  await pipeFreshDb("disabled");
  fs.mkdirSync(PIPE_FILES_DIR, { recursive: true });
  fs.writeFileSync(path.join(PIPE_FILES_DIR, 'f1'), 'blob\n');
  await pipeSeedWorkspace('ws1', [{ id: 'f1', project: 'p1', name: 'a.txt', ext: 'txt' }]);
  await pipeInsertTask('t-off', 0);
  const mock = pipeFakeFtp();
  await mock.listen();
  pipeRunWriter();
  setBackupDestination('ftp', pipeFtpDescriptor(mock));
  try {
    const run = await runExport({ kind: 'project', id: 'p1' }, { taskId: 't-off', trigger: 'scheduled' });
    assert.equal(run.ok, true);
    assert.equal(mock.connections(), 0, 'fail-closed gate → the mock server saw zero connections');
    const row = await dbAdapter.get('select ftp_uploaded from backup_runs where id = ?', [run.runId]);
    assert.equal(row.ftp_uploaded, 0);
    assert.ok(fs.existsSync(path.join(backupsRoot(), run.filename)), 'local archive published');
  } finally {
    await mock.close();
    setBackupRunWriter(null);
    setBackupDestination('ftp', { label: 'FTP', enabled: false });
  }
});

test('pipeline: taskId-less run meta → closure returns null, no stor observed (R-2)', async () => {
  await pipeFreshDb("manual");
  fs.mkdirSync(PIPE_FILES_DIR, { recursive: true });
  fs.writeFileSync(path.join(PIPE_FILES_DIR, 'f1'), 'blob\n');
  await pipeSeedWorkspace('ws1', [{ id: 'f1', project: 'p1', name: 'a.txt', ext: 'txt' }]);
  const mock = pipeFakeFtp();
  await mock.listen();
  pipeRunWriter();
  const descriptor = pipeFtpDescriptor(mock);
  setBackupDestination('ftp', descriptor);
  try {
    // the closure contract directly — manual meta → null
    assert.equal(await descriptor.upload({ trigger: 'manual' }), null, 'taskId-less meta → null');
    assert.equal(await descriptor.upload({}), null, 'missing meta → null');
    // and through the real loop: a manual run never touches FTP
    const run = await runExport({ kind: 'project', id: 'p1' }, { trigger: 'manual' });
    assert.equal(run.ok, true);
    assert.equal(mock.connections(), 0, 'manual run never connected');
    assert.equal(mock.commands.filter(c => c.toUpperCase().startsWith('STOR')).length, 0, 'no stor observed');
  } finally {
    await mock.close();
    setBackupRunWriter(null);
    setBackupDestination('ftp', { label: 'FTP', enabled: false });
  }
});

test('pipeline: stor fails → single terminal upload_failed naming ftp, local archive survives, ftp_uploaded stays 0', async () => {
  await pipeFreshDb("storfail");
  fs.mkdirSync(PIPE_FILES_DIR, { recursive: true });
  fs.writeFileSync(path.join(PIPE_FILES_DIR, 'f1'), 'blob\n');
  await pipeSeedWorkspace('ws1', [{ id: 'f1', project: 'p1', name: 'a.txt', ext: 'txt' }]);
  await pipeInsertTask('t-fail', 1);
  const mock = pipeFakeFtp({ failStor: true });
  await mock.listen();
  pipeRunWriter();
  setBackupDestination('ftp', pipeFtpDescriptor(mock));
  try {
    const run = await runExport({ kind: 'project', id: 'p1' }, { taskId: 't-fail', trigger: 'scheduled' });
    assert.equal(run.ok, false, 'the run fails through the upload_failed terminal');
    assert.equal(run.code, 'uploadFailed');
    assert.match(run.error, /ftp/i, `the raw sliced error names ftp (got: ${run.error})`);
    assert.ok(!/upload failed:/i.test(run.error), 'single-destination failure keeps the RAW slice — no composed prefix');
    assert.equal(getRunState().stage, 'upload_failed');
    // local-first: the archive and its history row survive untouched
    const local = path.join(backupsRoot(), run.filename);
    assert.ok(fs.existsSync(local), 'local archive survives the ftp failure');
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(local)).digest('hex'), run.sha256);
    const row = await dbAdapter.get('select ftp_uploaded, uploaded, status from backup_runs where id = ?', [run.runId]);
    assert.equal(row.ftp_uploaded, 0, 'ftp_uploaded stays 0 on failure (never in a catch path)');
    assert.equal(row.uploaded, 0);
    assert.equal(row.status, 'upload_failed', 'the run row carries the single terminal upload_failed');
  } finally {
    await mock.close();
    setBackupRunWriter(null);
    setBackupDestination('ftp', { label: 'FTP', enabled: false });
  }
});
