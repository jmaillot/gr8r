/* =====================================================================
   Phase 100 plan 02 — SMB destination wiring gate (tracer slice).
   Static source-slice pins (the ftp-wiring idiom) over server.js +
   export/backup.js, plus functional pipeline tests driving the REAL
   runExport upload loop against an in-process scripted mock SMB server
   (the 99 fakeSmb harness idiom). The server.js closure + SMB.config()
   are byte-pinned here; the pipeline tests inject a descriptor with
   the SAME closure semantics (taskId + smb_enabled fail-closed gate)
   because spawning a full server per test is the e2e wave's job.
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

/* ---- Task 1 pins: the SMB capability object (99-client config shape) ---- */

test('SMB capability: config() maps the frozen consts to the 99 client shape (host/share/port/user/password, domain omitted)', () => {
  const s = serverSrc();
  const i = s.indexOf('const SMB = {');
  assert.ok(i !== -1, 'the boot-frozen SMB capability object exists');
  const block = s.slice(i, i + 1200);
  for (const key of ['host: SMB_HOST', 'share: SMB_SHARE', 'user: SMB_USER', 'password: SMB_PASSWORD']) {
    assert.match(block, new RegExp(key.replace(/:/g, '\\s*:')), `${key} mapped`);
  }
  assert.match(block, /port:\s*SMB_PORT/, 'port rides the boot-frozen SMB_PORT const (default 445, 100-04 additive seam)');
  assert.ok(!/domain:\s*SMB_/.test(block), 'no domain const mapping — domain rides absent when unset');
  assert.match(block, /enabled: !!\(SMB_HOST && SMB_SHARE && SMB_USER && SMB_PASSWORD\)/, 'enabled derives from env — the all-four conjunction kept (D-05)');
});

test('SMB capability: credentials ride only through config() — no serialization (V14)', () => {
  const s = serverSrc();
  const i = s.indexOf('const SMB = {');
  const block = s.slice(i, s.indexOf('const LOCALE_CODES'));
  assert.ok(!/JSON\.stringify/.test(block), 'no config serialization in the capability object');
});

/* ---- Task 2 pins: the smb install closure (R-2 inversion + fail-closed gate) ---- */

function smbClosure() {
  const s = serverSrc();
  const i = s.indexOf("setBackupDestination('smb'");
  assert.ok(i !== -1, 'the smb install rides the registry');
  return s.slice(i, s.indexOf('/* Phase 96 (96-02, D-04/OQ-2)'));
}

test('smb closure: R-2 inversion — taskId-less meta returns null BEFORE any lookup (manual runs never upload)', () => {
  const block = smbClosure();
  assert.match(block, /if \(!meta\?\.taskId\) return null;/, 'the R-2 early null for manual runs is present');
  const r2 = block.indexOf('if (!meta?.taskId) return null;');
  const lookup = block.indexOf('select smb_enabled from backup_tasks');
  assert.ok(lookup > r2, 'the R-2 null precedes the task lookup — manual runs NEVER reach SMB');
});

test('smb closure: task runs gate on smb_enabled = 1 fail-closed with S3-parity warn wording', () => {
  const block = smbClosure();
  assert.match(block, /select smb_enabled from backup_tasks where id = \?/, 'the fail-closed task lookup exists');
  assert.match(block, /if \(!task \|\| task\.smb_enabled !== 1\) return null;/, 'missing row or smb_enabled !== 1 → null (fail-closed)');
  assert.match(block, /lookup failed — upload skipped/, 'warn wording mirrors the S3 closure');
});

test('smb closure: returns the SMB.config() seam and carries NO verify field (R-4 = sidecar + read-back, 100-05)', () => {
  const block = smbClosure();
  assert.match(block, /return \{ config: SMB\.config\(\) \};/, 'success returns the SMB.config() seam');
  assert.ok(!/verify:/.test(block), 'NO verify field on the smb descriptor — no SMB.verify exists (R-4 divergence)');
  assert.match(block, /label: 'SMB'/, 'label is SMB (ftp clone posture)');
  assert.match(block, /enabled: SMB\.enabled/, 'enabled reads the capability object');
  assert.match(block, /manualPrefix: 'backup-smb\/'/, 'the manual prefix is the probe marker only (D-01)');
});

test('smb closure: never serializes config/credentials into error text (T-100-03 posture)', () => {
  const block = smbClosure();
  assert.ok(!/JSON\.stringify/.test(block), 'no config serialization in the closure');
  assert.ok(!block.includes('SMB_PASSWORD'), 'the closure references credentials ONLY through SMB.config()');
});

/* ---- Task 3 pins: the descriptor-dispatched smb upload arm ---- */

test('upload loop: exactly ONE "set smb_uploaded = 1" write site, never in a catch path (one-site rule)', () => {
  const b = backupSrc();
  const sites = (b.match(/update backup_runs set smb_uploaded = 1/g) || []).length;
  assert.equal(sites, 1, `smb_uploaded must have exactly one write site (got ${sites})`);
  const i = b.indexOf('update backup_runs set smb_uploaded = 1');
  const afterWrite = b.slice(i);
  const nextCatch = afterWrite.indexOf('} catch (err) {');
  const nextLoopEnd = afterWrite.indexOf('if (failedUploads.length)');
  assert.ok(nextCatch < nextLoopEnd, 'the flag write sits before the catch — never in a catch path');
});

test('upload loop: smb arm per R-4 — client write + sidecar write, NO SIZE verify (documented divergence)', () => {
  const b = backupSrc();
  const i = b.indexOf("else if (destName === 'smb')");
  assert.ok(i !== -1, 'the smb arm dispatch exists beside the ftp arm');
  const arm = b.slice(i, b.indexOf('update backup_runs set smb_uploaded = 1'));
  assert.match(arm, /connectSmb\(provided\.config\)/, 'the arm builds the 99 client from the descriptor config');
  assert.match(arm, /smb\.connect\(\)/, 'the session is established before the writes');
  assert.match(arm, /smb\.write\(smbKey, destination\)/, 'the published archive is written under the task prefix');
  assert.match(arm, /smb\.write\(`\$\{smbKey\}\.sha256`/, 'the sidecar rides write as ${key}.sha256');
  assert.match(arm, /backup-task-\$\{runMeta\.taskId\}\/\$\{filename\}/, 'task runs upload under the D-88-6 task prefix (SAME key shape as ftp)');
  assert.match(arm, /sha256\}  \$\{filename\}\\n/, 'the sidecar carries the exact "<hash>  <name>\\n" byte format');
  assert.equal((arm.match(/\.size\(/g) || []).length, 0, 'NO SIZE verify on the smb arm (R-4 documented deviation — SMB2 exposes no size query)');
  assert.match(arm, /smb\.close\(\)/, 'the client session is closed best-effort in finally (ftp quit analog)');
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
  assert.equal((b.match(/await downloadToStaged/g) || []).length, 1, 'downloadToStaged is awaited exactly once in the file (s3 arm only)');
});

test('upload loop: smb failure names smb via the RAW slice — composed branch untouched (raw-slice posture)', () => {
  const b = backupSrc();
  const count = (b.match(/upload failed: \$\{failedUploads/g) || []).length;
  assert.equal(count, 1, 'the composed prefix still appears exactly once (>= 2 branch only)');
  assert.match(b, /failedUploads\.push\(\{ name: destName, err \}\);/, 'the shared catch break posture is unchanged');
});

test('backup.js wires the 99 client via a single smb import (zero new dependencies)', () => {
  const b = backupSrc();
  assert.match(b, /import \{ connectSmb \} from '\.\/smb\.js';/, 'connectSmb imported beside connectFtp');
  const deps = src('package.json');
  assert.equal(JSON.parse(deps).dependencies?.smb2, undefined, 'no smb2 npm package — the 99 zero-dep client only');
});

/* =====================================================================
   Functional pipeline tests — the REAL runExport upload loop against
   an in-process scripted mock SMB server (99 fakeSmb harness idiom).
   ===================================================================== */
import { fakeSmb, SMB2_COM } from './helpers/mock-smb-server.mjs'; // 100-04: extracted to a shared helper (reused by the remote-prune suite)
import os from 'node:os';

/* DATA_DIR must exist BEFORE export/backup.js is imported (dynamic import
   keeps the static slice pins env-independent). */
const PIPE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-studio-smb-pipe-'));
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

async function pipeInsertTask(id, smbEnabled) {
  await dbAdapter.run(
    'insert into backup_tasks (id, name, scope, cron, created_at, updated_at, smb_enabled) values (?,?,?,?,?,?,?)',
    [id, `task ${id}`, JSON.stringify({ kind: 'project', id: 'p1' }), '0 3 * * *', PIPE_NOW, PIPE_NOW, smbEnabled],
  );
}

function mockSmbConfig(mock) {
  return { host: '127.0.0.1', share: '\\\\127.0.0.1\\projects-studio', port: mock.port(), user: 'projects-studio', domain: 'DOMAIN', password: 'projects-studio-secret' };
}

/* Descriptor with the server.js closure CONTRACT (taskId + smb_enabled fail-closed). */
function pipeSmbDescriptor(mock) {
  return {
    label: 'SMB',
    enabled: true,
    manualPrefix: 'backup-smb/', // R-2: probe marker only — never an upload prefix
    upload: async meta => {
      if (!meta?.taskId) return null; // R-2 inversion — manual runs stay local-only
      const task = await dbAdapter.get('select smb_enabled from backup_tasks where id = ?', [meta.taskId]);
      if (!task || task.smb_enabled !== 1) return null;
      return { config: mockSmbConfig(mock) };
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

test('pipeline: task run with smb_enabled=1 uploads archive + sidecar under the task prefix and sets smb_uploaded=1', async () => {
  await pipeFreshDb("success");
  fs.mkdirSync(PIPE_FILES_DIR, { recursive: true });
  fs.writeFileSync(path.join(PIPE_FILES_DIR, 'f1'), 'project one blob\n');
  await pipeSeedWorkspace('ws1', [{ id: 'f1', project: 'p1', name: 'a.txt', ext: 'txt' }]);
  await pipeInsertTask('t-ok', 1);
  const mock = fakeSmb();
  await mock.listen();
  pipeRunWriter();
  setBackupDestination('smb', pipeSmbDescriptor(mock));
  try {
    const run = await runExport({ kind: 'project', id: 'p1' }, { taskId: 't-ok', trigger: 'scheduled' });
    assert.equal(run.ok, true, `runExport failed: ${run.error}`);
    assert.equal(getRunState().stage, 'done');
    // local-first: the published archive survives, byte-honest
    const local = path.join(backupsRoot(), run.filename);
    assert.ok(fs.existsSync(local), 'local archive kept');
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(local)).digest('hex'), run.sha256);
    // both files stored under the D-88-6 task prefix (SAME key shape as ftp)
    const key = `backup-task-t-ok/${run.filename}`;
    assert.ok(mock.files.has(key), `archive stored as ${key}`);
    assert.ok(mock.files.has(`${key}.sha256`), 'sidecar stored as ${key}.sha256');
    const storedArchive = Buffer.concat([...mock.files.entries()].filter(([k]) => k === key).map(([, v]) => v));
    assert.equal(storedArchive.length > 0, true, 'archive bytes landed');
    assert.equal(mock.files.get(`${key}.sha256`).toString('utf8'), `${run.sha256}  ${run.filename}\n`, 'sidecar carries the exact "<hash>  <name>\\n" byte format');
    // the run row carries the one-site flag
    const row = await dbAdapter.get('select smb_uploaded, uploaded, ftp_uploaded from backup_runs where id = ?', [run.runId]);
    assert.equal(row.smb_uploaded, 1, 'smb_uploaded = 1 after success');
    assert.equal(row.uploaded, 0, 'the s3 flag is untouched by the smb arm');
    assert.equal(row.ftp_uploaded, 0, 'the ftp flag is untouched by the smb arm');
    // session hygiene: TREE_DISCONNECT then LOGOFF (smb.close in finally)
    const cmds = mock.commands.map(c => c.command);
    const disIdx = cmds.indexOf(SMB2_COM.TREE_DISCONNECT);
    const logIdx = cmds.indexOf(SMB2_COM.LOGOFF);
    assert.ok(disIdx > -1 && logIdx > disIdx, 'close() sends TREE_DISCONNECT then LOGOFF');
  } finally {
    await mock.close();
    setBackupRunWriter(null);
    setBackupDestination('smb', { label: 'SMB', enabled: false });
  }
});

test('pipeline: task row smb_enabled=0 → no SMB connection attempted, run stays local-only', async () => {
  await pipeFreshDb("disabled");
  fs.mkdirSync(PIPE_FILES_DIR, { recursive: true });
  fs.writeFileSync(path.join(PIPE_FILES_DIR, 'f1'), 'blob\n');
  await pipeSeedWorkspace('ws1', [{ id: 'f1', project: 'p1', name: 'a.txt', ext: 'txt' }]);
  await pipeInsertTask('t-off', 0);
  const mock = fakeSmb();
  await mock.listen();
  pipeRunWriter();
  setBackupDestination('smb', pipeSmbDescriptor(mock));
  try {
    const run = await runExport({ kind: 'project', id: 'p1' }, { taskId: 't-off', trigger: 'scheduled' });
    assert.equal(run.ok, true);
    assert.equal(mock.commands.length, 0, 'fail-closed gate → the mock server saw zero commands');
    const row = await dbAdapter.get('select smb_uploaded from backup_runs where id = ?', [run.runId]);
    assert.equal(row.smb_uploaded, 0);
    assert.ok(fs.existsSync(path.join(backupsRoot(), run.filename)), 'local archive published');
  } finally {
    await mock.close();
    setBackupRunWriter(null);
    setBackupDestination('smb', { label: 'SMB', enabled: false });
  }
});

test('pipeline: manual run (taskId-less) → closure returns null, nothing written to the mock (R-2)', async () => {
  await pipeFreshDb("manual");
  fs.mkdirSync(PIPE_FILES_DIR, { recursive: true });
  fs.writeFileSync(path.join(PIPE_FILES_DIR, 'f1'), 'blob\n');
  await pipeSeedWorkspace('ws1', [{ id: 'f1', project: 'p1', name: 'a.txt', ext: 'txt' }]);
  const mock = fakeSmb();
  await mock.listen();
  pipeRunWriter();
  const descriptor = pipeSmbDescriptor(mock);
  setBackupDestination('smb', descriptor);
  try {
    assert.equal(await descriptor.upload({ trigger: 'manual' }), null, 'taskId-less meta → null');
    assert.equal(await descriptor.upload({}), null, 'missing meta → null');
    const run = await runExport({ kind: 'project', id: 'p1' }, { trigger: 'manual' });
    assert.equal(run.ok, true);
    assert.equal(mock.commands.length, 0, 'manual run never connected');
    const row = await dbAdapter.get('select smb_uploaded from backup_runs where id = ?', [run.runId]);
    assert.equal(row.smb_uploaded, 0, 'smb_uploaded stays 0');
  } finally {
    await mock.close();
    setBackupRunWriter(null);
    setBackupDestination('smb', { label: 'SMB', enabled: false });
  }
});

test('pipeline: smb write fails → single terminal upload_failed naming smb, local archive survives, smb_uploaded stays 0', async () => {
  await pipeFreshDb("writefail");
  fs.mkdirSync(PIPE_FILES_DIR, { recursive: true });
  fs.writeFileSync(path.join(PIPE_FILES_DIR, 'f1'), 'blob\n');
  await pipeSeedWorkspace('ws1', [{ id: 'f1', project: 'p1', name: 'a.txt', ext: 'txt' }]);
  await pipeInsertTask('t-fail', 1);
  const mock = fakeSmb({ writeStatus: 0xc0000022 }); // ACCESS_DENIED on WRITE
  await mock.listen();
  pipeRunWriter();
  setBackupDestination('smb', pipeSmbDescriptor(mock));
  try {
    const run = await runExport({ kind: 'project', id: 'p1' }, { taskId: 't-fail', trigger: 'scheduled' });
    assert.equal(run.ok, false, 'the run fails through the upload_failed terminal');
    assert.equal(run.code, 'uploadFailed');
    assert.match(run.error, /smb/i, `the raw sliced error names smb (got: ${run.error})`);
    assert.ok(!/upload failed:/i.test(run.error), 'single-destination failure keeps the RAW slice — no composed prefix');
    assert.equal(getRunState().stage, 'upload_failed');
    const local = path.join(backupsRoot(), run.filename);
    assert.ok(fs.existsSync(local), 'local archive survives the smb failure');
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(local)).digest('hex'), run.sha256);
    const row = await dbAdapter.get('select smb_uploaded, uploaded, status from backup_runs where id = ?', [run.runId]);
    assert.equal(row.smb_uploaded, 0, 'smb_uploaded stays 0 on failure (never in a catch path)');
    assert.equal(row.uploaded, 0);
    assert.equal(row.status, 'upload_failed', 'the run row carries the single terminal upload_failed');
  } finally {
    await mock.close();
    setBackupRunWriter(null);
    setBackupDestination('smb', { label: 'SMB', enabled: false });
  }
});

/* =====================================================================
   100-03 pins: smb-probe route + probe-at-save CREATE/EDIT twins.
   Static source-slice pins over server.js — guard chain order, refusal
   keys, audit key-only detail, and the hard-refuse (no deleteFailed
   exemption) posture, sliced against the ftp analogs.
   ===================================================================== */

test('smb-probe route: path exists with the ftp-probe guard chain order VERBATIM', () => {
  const s = serverSrc();
  const i = s.indexOf("pathname === '/api/backup/tasks/smb-probe'");
  assert.ok(i !== -1, 'the smb-probe route exists');
  const block = s.slice(i, i + 1400);
  const order = [
    ['sameOrigin', block.indexOf("if (!sameOrigin(req))")],
    ['requireUser', block.indexOf('await requireUser(req, res)')],
    ['tooMany', block.indexOf("tooMany(`backupprobe|")],
    ['CAP.BACKUP_MANAGE', block.indexOf('CAP.BACKUP_MANAGE')],
    ['SMB.enabled', block.indexOf('if (!SMB.enabled)')],
    ['probeSmb', block.indexOf('await probeSmb(SMB.config(),')],
  ];
  for (const [name, pos] of order) assert.ok(pos !== -1, `guard present: ${name}`);
  for (let k = 1; k < order.length; k++) {
    assert.ok(order[k][1] > order[k - 1][1], `guard order: ${order[k - 1][0]} precedes ${order[k][0]}`);
  }
});

test('smb-probe route: refusals keyed + audited, probe audits key-only detail (Pitfall 5)', () => {
  const s = serverSrc();
  const i = s.indexOf("pathname === '/api/backup/tasks/smb-probe'");
  const block = s.slice(i, i + 1400);
  assert.match(block, /backup_probe_refused:backupManageRequired/);
  assert.match(block, /backup_probe_refused:smbNotConfigured/);
  assert.match(block, /fail\(res, 400, 'smbNotConfigured'/, 'the SMB.enabled miss refuses keyed smbNotConfigured');
  assert.match(block, /result\.ok \? 'backup_smb_probe_ok' : 'backup_smb_probe_failed', user\.id, result\.key\)/, 'probe audit detail = result.key ONLY');
  assert.ok(!/httpWarning/.test(block), 'R-3: NO httpWarning anywhere in the smb-probe route');
  assert.ok(!/JSON\.stringify\(SMB/.test(block), 'never serializes config into the audit/result (T-100-06)');
});

test('probe-at-save CREATE twin: gate, hard refuse, smb_enabled in task + INSERT, response ride', () => {
  const s = serverSrc();
  const i = s.indexOf('let smbProbe = null;');
  assert.ok(i !== -1, 'the CREATE smbProbe twin exists');
  const block = s.slice(i, i + 700);
  assert.match(block, /body\?\.smbEnabled === true && SMB\.enabled/, 'CREATE gates on body flag AND destination enabled');
  assert.match(block, /backup_task_refused:smbProbe:\$\{smbProbe\.key\}/, 'refusal audit keyed with the probe key');
  assert.match(block, /fail\(res, 400, smbProbe\.key, 'SMB destination probe failed — the task was not saved'\)/, 'hard 400 refusal — task NOT saved');
  assert.ok(!/deleteFailed/.test(block), 'NO deleteFailed exemption — hard refuse on ANY !ok (98-02 precedent)');
  const taskBlock = s.slice(s.indexOf('const task = {', i), s.indexOf("await db.run(\n      'insert into backup_tasks", i));
  assert.match(taskBlock, /smb_enabled: body\?\.smbEnabled === true \? 1 : 0/, 'smb_enabled lands in the task object');
  const insert = s.slice(s.indexOf("'insert into backup_tasks", i), s.indexOf("await auditBackupTask(user, 'backup_task_created'", i));
  assert.match(insert, /smb_enabled/, 'smb_enabled is in the INSERT column list and params');
  const ride = s.slice(s.indexOf('backup_task_created', i), s.indexOf('const backupTaskMatch', i));
  assert.match(ride, /smbProbe \? \{ smbProbe \}/, 'the probe rides the response (SC-1 symmetry)');
  assert.match(ride, /backup_smb_probe_ok/, 'probe outcome audited at save (MIN-07 symmetry)');
});

test('probe-at-save EDIT twin: resolved smbEnabled read/keep, hard refuse, UPDATE, ride with id', () => {
  const s = serverSrc();
  const i = s.indexOf('let smbEnabled = row.smb_enabled === 1;');
  assert.ok(i !== -1, 'the EDIT resolved smbEnabled read/keep exists');
  const keep = s.slice(i, s.indexOf('let smbProbe = null;', i));
  assert.match(keep, /body\?\.smbEnabled !== undefined/, 'absent flag keeps the stored value');
  assert.match(keep, /backup_task_refused:invalidSmbEnabled', id/, 'boolean-only refusal audited with id');
  assert.match(keep, /backup_task_refused:smbNotConfigured', id/, 'not-configured refusal audited with id');
  const block = s.slice(s.indexOf('let smbProbe = null;', i), s.indexOf('const cronChanged', i));
  assert.match(block, /smbEnabled && SMB\.enabled/, 'EDIT probes the RESOLVED resulting smbEnabled (not body)');
  assert.match(block, /backup_task_refused:smbProbe:\$\{smbProbe\.key\}`, id/, 'refusal audit carries id');
  assert.match(block, /fail\(res, 400, smbProbe\.key, 'SMB destination probe failed — the task was not saved'\)/, 'hard 400 refusal on edit too');
  assert.ok(!/deleteFailed/.test(block), 'NO deleteFailed exemption on edit');
  const updated = s.slice(s.indexOf('const updated = {', i), s.indexOf("'update backup_tasks set", i));
  assert.match(updated, /smb_enabled: smbEnabled \? 1 : 0/, 'smb_enabled lands in the updated object');
  const updateSql = s.slice(s.indexOf("'update backup_tasks set", i), s.indexOf('await auditBackupTask(user, \'backup_task_updated\'', i));
  assert.match(updateSql, /smb_enabled = \?/, 'smb_enabled in the UPDATE set list');
  const ride = s.slice(s.indexOf('backup_task_updated', i), s.indexOf('S3 probe-at-save', i));
  assert.match(ride, /backup_smb_probe_ok/, 'probe outcome audited on edit');
  assert.match(ride, /smbProbe \? \{ smbProbe \}/, 'the probe rides the edit response');
});

/* =====================================================================
   100-03 pins: client trio — api trio, toggle row, actions ×5, toast chain.
   ===================================================================== */

test('api.js trio: smbEnabled state default (fail-closed), getter, strict-boolean config read', () => {
  const a = src('src/core/api.js');
  assert.match(a, /smbEnabled: false,/, 'state default false — fail-closed');
  assert.match(a, /get smbEnabled\(\) \{\n    return state\.smbEnabled;\n  \}/, 'the getter exists');
  assert.match(a, /state\.smbEnabled = !!r\.data\?\.smbEnabled;/, 'V5 strict-boolean config read');
});

test('backup.js toggle row: smb row clones the ftp row, render-gated on api.smbEnabled', () => {
  const p = src('src/pages/backup.js');
  const i = p.indexOf('data-in="backupTaskSmb"');
  assert.ok(i !== -1, 'the smb toggle row exists');
  const ftp = p.indexOf('data-in="backupTaskFtp"');
  assert.ok(i > ftp, 'the smb row renders AFTER the ftp row');
  const start = p.lastIndexOf('${api.smbEnabled', i);
  assert.ok(start !== -1 && p.slice(start, i).length < 200, 'the row is render-gated on api.smbEnabled');
  const row = p.slice(start, p.indexOf('` : \'\'', i));
  assert.match(row, /form\.smbEnabled \? ' checked' : ''/, 'checked state rides form.smbEnabled');
  assert.match(row, /t\('page\.backup\.smbToggle'\)/, 'the label is the smbToggle key');
});

test('actions.js ×5: smb twins at every ftp site', () => {
  const a = src('src/actions/actions.js');
  assert.match(a, /smbEnabled: false,\n\}\);/, 'site 1: backupTaskFormDefaults smbEnabled default');
  assert.match(a, /IN\.backupTaskSmb = el => \{\n  if \(S\.ui\.backupTaskForm\) S\.ui\.backupTaskForm\.smbEnabled = el\.checked;\n\};/, 'site 2: checkbox handler, no re-render');
  assert.match(a, /smbEnabled: task\.smb_enabled === 1,/, 'site 3: edit prefill from smb_enabled');
  assert.match(a, /if \(api\.smbEnabled\) body\.smbEnabled = form\.smbEnabled === true;/, 'site 4: body gate serializes displayed state');
  assert.match(a, /const sprobe = res\.data\?\.smbProbe;/, 'site 5: probe toast chain reads res.data.smbProbe');
});

test('actions.js smb toast chain: keyed classes, guest INFO branch, NO httpWarning (R-3)', () => {
  const a = src('src/actions/actions.js');
  const i = a.indexOf('const sprobe = res.data?.smbProbe;');
  const block = a.slice(i, a.indexOf('toast(t(form.editing', i));
  assert.match(block, /sprobe\.key === 'success'\) toast\(t\('toast\.smbProbeSuccess'\)\)/, 'success branch keyed');
  for (const k of ['smbAuthFailed', 'smbShareNotFound', 'smbTreeConnectFailed', 'smbSigningRequired', 'smbNoSpace', 'smbNameConflict', 'smbSessionExpired', 'smbGeneric', 'smbDialectUnsupported']) {
    assert.match(block, new RegExp(`tErr\\('${k}'`), `the ${k} err branch exists`);
  }
  assert.match(block, /sprobe\.guest === true\) toast\(t\('toast\.smbGuestAccess'\), \{ kind: 'info' \}\)/, 'guest → keyed INFO toast (SC-2)');
  assert.ok(!/httpWarning/.test(block), 'R-3: NO httpWarning branch in the smb toast chain');
});
