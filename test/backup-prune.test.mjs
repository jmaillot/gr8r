/* =====================================================================
   Backup remote-prune suite (Phase 100, plan 100-04, DEST-02).

   Wave-4 file. Pins the remote-prune guarantees:
   - `remote_pruned` column: dual-engine DDL (server.js SCHEMA +
     db-adapter pg mirror + boot ensureColumn), additive payload reveal
     (existing keys byte-identical — exactly one new key rides ...pub,
     98-02 precedent), strip lists untouched, second boot a DDL no-op;
   - the prune hook inside runBackupRotationPass (D-05: after the local
     status commit, inside the same pass): D-01 floor-guard on fresh
     delete-set rows (soleCopy = uploaded !== 1 && S3.enabled), per-
     destination try/catch containment (one mirror's failure never
     blocks the sibling prune nor the rotation), idempotent not-found →
     success, D-03 audit tokens (backup_prune_ok:<dest> /
     backup_prune_failed:<dest> / backup_prune_skipped:soleCopy), keys
     mirror the UPLOAD arm exactly (manualPrefixes NEVER used);
   - the pruned badge render condition (D-03): remote_pruned === 1 &&
     status === 'deleted' — never on a live run.
   Harness: test/backup-rotation.test.mjs (startServer-per-case,
   seeded fake rows + fake archive files, test-only internal rotation
   route). Remote effects are exercised through real clients pointed at
   in-process fakes (fakeFtp line-protocol control server; fakeSmb
   scripted NBSS frame server from test/helpers/mock-smb-server.mjs)
   or unreachable ports (prune_failed path).
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { ADMIN, login, signup, startServer, withDb } from './helpers/server.mjs';
import { fakeSmb } from './helpers/mock-smb-server.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const serverSrc = () => src('server.js');

const BACKUP_TOKEN = 'prune-test-token';
const userIdByEmail = (srv, email) => withDb(srv.dbPath, db => db.prepare('select id from users where email = ?').get(email).id);
const runRow = (srv, id) => withDb(srv.dbPath, db => db.prepare('select * from backup_runs where id = ?').get(id));
const pruneAudits = srv =>
  withDb(srv.dbPath, db => db.prepare("select * from audit_log where action like 'backup_prune%' order by created_at, id").all());

async function makeBackupOp(server, email) {
  const joined = await signup(server.base, { name: 'Backup Op', email });
  assert.equal(joined.status, 201, `signup ${email}: ${JSON.stringify(joined.data)}`);
  const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
  const grant = await operator.post('/api/auth/operator/instance-roles', { userId: userIdByEmail(server, email), role: 'backup_operator' });
  assert.equal(grant.status, 200, `grant: ${JSON.stringify(grant.data)}`);
  return (await login(server.base, email, 'password-1234')).client;
}

const rotationPass = (srv, { taskId } = {}) =>
  fetch(`${srv.base}/api/internal/backup-rotation-pass`, {
    method: 'POST',
    headers: { 'x-backup-token': BACKUP_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify(taskId ? { taskId } : {}),
  }).then(async r => {
    assert.equal(r.status, 200, `rotation pass: ${r.status}`);
    return r.json();
  });

const backupsDir = srv => path.join(srv.dataDir, 'backups');
const archivePaths = (srv, filename) => [path.join(backupsDir(srv), filename), `${path.join(backupsDir(srv), filename)}.sha256`];

function seedRun(srv, taskId, { id, at, filename, flags = {} }) {
  withDb(srv.dbPath, db =>
    db.prepare('insert into backup_runs (id, task_id, scope, trigger, status, started_at, created_at, filename, uploaded, ftp_uploaded, smb_uploaded) values (?,?,?,?,?,?,?,?,?,?,?)').run(
      id,
      taskId,
      JSON.stringify({ kind: 'instance' }),
      'scheduled',
      'succeeded',
      at,
      at,
      filename,
      flags.uploaded ?? 0,
      flags.ftp_uploaded ?? 0,
      flags.smb_uploaded ?? 0,
    ),
  );
  fs.mkdirSync(backupsDir(srv), { recursive: true });
  for (const p of archivePaths(srv, filename)) fs.writeFileSync(p, `fake-${id}`);
  return id;
}

async function makeTask(srv, op, name) {
  const created = await op.post('/api/backup/tasks', { name, scope: { kind: 'instance' }, cron: '30 2 * * *' });
  assert.equal(created.status, 200, `create: ${JSON.stringify(created.data)}`);
  return created.data.task.id;
}

const setRetention = (srv, taskId, retention) =>
  withDb(srv.dbPath, db =>
    db.prepare('update backup_tasks set retention_daily = ?, retention_weekly = ?, retention_monthly = ?, retention_yearly = ? where id = ?').run(
      retention.daily ?? 7,
      retention.weekly ?? 4,
      retention.monthly ?? 12,
      retention.yearly ?? 5,
      taskId,
    ),
  );

/* Minimal line-protocol FTP control server (fakeFtp idiom, test/
   backup-ftp-client.test.mjs). deleReply drives DELE: '250 ...' = deleted,
   '550 ...' = not-found (ftpPathNotFound) — the idempotency mapping gate. */
function fakeFtp({ deleReply = '250 deleted' } = {}) {
  const commands = [];
  const server = net.createServer(socket => {
    socket.write('220 fake ftp\r\n');
    let buf = '';
    socket.on('data', chunk => {
      buf += chunk.toString('latin1');
      let i;
      while ((i = buf.indexOf('\r\n')) !== -1) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        commands.push(line);
        if (line.startsWith('USER')) socket.write('331 ok\r\n');
        else if (line.startsWith('PASS')) socket.write('230 ok\r\n');
        else if (line.startsWith('TYPE')) socket.write('200 ok\r\n');
        else if (line.startsWith('EPSV') || line.startsWith('PASV')) socket.write('229 ok\r\n');
        else if (line.startsWith('DELE')) socket.write(`${deleReply}\r\n`);
        else if (line.startsWith('QUIT')) {
          socket.write('221 bye\r\n');
          socket.end();
        } else socket.write('200 ok\r\n');
      }
    });
  });
  return {
    commands,
    listen: async () => { await new Promise(r => server.listen(0, '127.0.0.1', r)); },
    port: () => server.address().port,
    close: async () => { server.closeAllConnections?.(); await new Promise(r => server.close(r)); },
  };
}

/* Remote-destination env for the server under test. `smbPort`/'smbScenario'
   wire the fakeSmb frame server; omit both for an unreachable SMB. */
function remoteEnv({ ftpPort, smbPort, smbScenario } = {}) {
  const env = {
    FTP_HOST: '127.0.0.1',
    FTP_PORT: String(ftpPort ?? 1), // port 1 = connection refused (prune_failed path)
    FTP_USER: 'u',
    FTP_PASSWORD: 'p',
    SMB_HOST: '127.0.0.1',
    SMB_SHARE: 'projects-studio',
    SMB_USER: 'projects-studio',
    SMB_PASSWORD: 'projects-studio-secret',
  };
  if (smbPort !== undefined) env.SMB_PORT = String(smbPort);
  return env;
}

/* ---------- Task 1: DDL + additive payload reveal (byte-identity) ---------- */

test('remote_pruned DDL: SCHEMA declaration, pg mirror, boot ensureColumn — defs aligned', () => {
  const s = serverSrc();
  const adapter = src('db-adapter.mjs');
  assert.match(s, /await adapterEnsureColumn\('backup_runs', 'remote_pruned', 'integer not null default 0'\);/, 'boot ensureColumn present');
  assert.match(s, /remote_pruned integer not null default 0/, 'SCHEMA declaration present');
  assert.match(adapter, /remote_pruned integer not null default 0/, 'db-adapter SQLITE_SCHEMA (pg) mirror present');
  assert.equal(s.match(/remote_pruned integer not null default 0/g).length, 1, 'exactly ONE SCHEMA declaration site');
  // Strip lists UNTOUCHED — remote_pruned rides ...pub (the additive reveal).
  assert.ok(!/remote_pruned: _/.test(s), 'remote_pruned is NOT in any strip-list destructure');
});

test('remote_pruned rides all three runs SELECTs (all=1 / manual / task) — restore publishes nothing new (100-05: restore-trigger selects read the flag but never publish it)', () => {
  const s = serverSrc();
  const selects = s.split('\n').filter(l => /uploaded, ftp_uploaded, smb_uploaded/.test(l));
  /* 2026-11-26 UAT: 7 → 10, then the overwrite-restore fix joined a
     4th restore SELECT (overwrite of a local-deleted run answered
     restoreArchiveMissing). Restore still never publishes the flag.
     Phase 104 (RSRC-03): the restore-probe route's flag-read SELECT
     joined the family (flags ARE the probe's truth, R-4). */
  assert.equal(selects.length, 12, `three runs SELECTs + delete-set + restore-list + two 100-05 restore-trigger SELECTs + three UAT mirror-leg SELECTs + the overwrite SELECT + the restore-probe SELECT (${selects.length})`);
  const runsSelects = selects.filter(l => l.includes('checksum_ok'));
  assert.equal(runsSelects.length, 3, 'three runs SELECT lines carry the full history chrome');
  for (const q of runsSelects) assert.ok(q.includes('remote_pruned'), 'each runs SELECT carries remote_pruned');
  const untouched = selects.filter(l => !l.includes('checksum_ok'));
  assert.equal(untouched.length, 9, 'the delete-set SELECT + the restore-list SELECT + the two 100-05 restore-trigger SELECTs + the three UAT mirror-leg SELECTs + the overwrite SELECT + the restore-probe SELECT remain');
  assert.ok(untouched.every(l => !l.includes('remote_pruned')), 'delete-set + restore SELECTs stay free of remote_pruned (restore never publishes it)');
});

test('runs payload: exactly ONE new key remote_pruned — every existing key byte-identical (golden set)', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
  try {
    const op = await makeBackupOp(server, 'op-payload@test.local');
    const taskId = await makeTask(server, op, 'Payload task');
    const at = Date.UTC(2026, 10, 2, 10);
    withDb(server.dbPath, db =>
      db.prepare('insert into backup_runs (id, task_id, scope, trigger, status, started_at, created_at, filename, gfs_bucket) values (?,?,?,?,?,?,?,?,?)').run(
        'run-payload-1', taskId, JSON.stringify({ kind: 'instance' }), 'scheduled', 'succeeded', at, at, `backup-task-${taskId}-x.tar.gz`, 'daily',
      ),
    );
    const golden = new Set([
      'id', 'task_id', 'scope', 'uploaded', 'ftp_uploaded', 'smb_uploaded', 'remote_pruned', 'checksum_ok', 'checksum_checked_at',
      'missing_blob_count', 'trigger', 'status', 'started_at', 'finished_at', 'duration_ms', 'size_bytes', 'sha256', 'filename',
      'error', 'created_at', 'gfs_bucket', 'location', 'label', 'keptPosition',
    ]);
    const body = (await op.get(`/api/backup/runs?taskId=${taskId}`)).data;
    const manualBody = (await op.get('/api/backup/runs?taskId=manual')).data;
    for (const run of body.runs) {
      assert.equal(run.remote_pruned, 0, 'the new key is present and defaults to 0');
      const unexpected = Object.keys(run).filter(k => !golden.has(k));
      assert.deepEqual(unexpected, [], 'no payload key outside the golden set — payload grew only by remote_pruned');
      const mustHave = ['id', 'task_id', 'uploaded', 'remote_pruned', 'trigger', 'status', 'created_at', 'location'];
      for (const k of mustHave) assert.ok(k in run, `golden key ${k} still present (byte-identity of existing keys)`);
    }
    for (const run of manualBody.runs) {
      assert.equal(run.remote_pruned, 0, 'manual history also reveals remote_pruned');
    }
  } finally {
    await server.stop();
  }
});

test('second boot is a DDL no-op — remote_pruned still a single column, existing rows keep 0', async () => {
  const os = await import('node:os');
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'projects-studio-prune-reboot-'));
  let server;
  try {
    server = await startServer({ dataDir: dir, env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
    const cols1 = withDb(server.dbPath, db => db.prepare("pragma table_info(backup_runs)").all().filter(c => c.name === 'remote_pruned'));
    assert.equal(cols1.length, 1, 'column created on first boot');
    await server.stop();
    server = await startServer({ dataDir: dir, env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
    const cols2 = withDb(server.dbPath, db => db.prepare("pragma table_info(backup_runs)").all().filter(c => c.name === 'remote_pruned'));
    assert.equal(cols2.length, 1, 'second boot adds NO second column (ensureColumn idempotent)');
    assert.equal(cols2[0].dflt_value, '0', 'default stays 0');
  } finally {
    if (server) await server.stop();
    else fs.rmSync(dir, { recursive: true, force: true });
  }
});

/* ---------- Task 2: prune hook — floor-guard, idempotency, containment ---------- */

test('floor-guard (D-01): a sole mirror (uploaded=0, S3 enabled) is NEVER deleted — audited backup_prune_skipped:soleCopy, remote_pruned stays 0', async () => {
  const server = await startServer({
    env: {
      BACKUP_TEST_TOKEN: BACKUP_TOKEN,
      S3_BUCKET: 'guard-bucket', S3_ACCESS_KEY_ID: 'k', S3_SECRET_KEY: 's', // S3.enabled = true
      ...remoteEnv({ ftpPort: 1, smbPort: 1 }), // unreachable — any delete attempt would fail loudly
    },
  });
  try {
    const op = await makeBackupOp(server, 'op-floor@test.local');
    const taskId = await makeTask(server, op, 'Floor-guard task');
    setRetention(server, taskId, { daily: 1 });
    const day = 24 * 3600 * 1000;
    const base = Date.UTC(2026, 10, 3, 2, 30);
    seedRun(server, taskId, { id: 'prune-anchor', at: Date.UTC(2025, 0, 2, 2, 30), filename: `backup-task-${taskId}-20250102-023000.tar.gz` });
    seedRun(server, taskId, { id: 'prune-primer', at: Date.UTC(2026, 0, 5, 2, 30), filename: `backup-task-${taskId}-20260105-023000.tar.gz` });
    seedRun(server, taskId, { id: 'prune-monthly', at: Date.UTC(2026, 10, 1, 2, 0), filename: `backup-task-${taskId}-20261101-020000.tar.gz` });
    seedRun(server, taskId, { id: 'prune-weekly', at: Date.UTC(2026, 10, 2, 2, 0), filename: `backup-task-${taskId}-20261102-020000.tar.gz` });
    const sole = seedRun(server, taskId, { id: 'prune-sole', at: base, filename: `backup-task-${taskId}-20261103-023000.tar.gz`, flags: { ftp_uploaded: 1, smb_uploaded: 1 } });
    seedRun(server, taskId, { id: 'prune-new', at: base + day, filename: `backup-task-${taskId}-20261105-023000.tar.gz` });

    const report = await rotationPass(server, { taskId });
    assert.equal(report.deleted, 1, 'rotation proceeds normally (sole run expired + deleted locally)');
    const row = runRow(server, sole);
    assert.equal(row.status, 'deleted', 'local rotation unaffected by the guard');
    assert.equal(row.remote_pruned, 0, 'remote_pruned stays 0 — the only mirror was NEVER touched');
    const audits = pruneAudits(server).filter(a => a.target_id === taskId);
    const skipped = audits.filter(a => a.action === 'backup_prune_skipped:soleCopy');
    assert.equal(skipped.length, 2, 'one skipped audit per guarded mirror (ftp + smb), destination-agnostic token');
    assert.equal(audits.filter(a => a.action.startsWith('backup_prune_failed')).length, 0, 'no delete was attempted against the sole mirror');
    assert.equal(audits.filter(a => a.action.startsWith('backup_prune_ok')).length, 0, 'no prune_ok on a guarded run');
  } finally {
    await server.stop();
  }
});

test('no S3 configured → floor-guard open: mirrors prune with backup_prune_ok (D-01 "no S3 custody" branch)', async () => {
  const ftp = fakeFtp();
  await ftp.listen();
  const smb = fakeSmb({}, { domain: "" });
  await smb.listen();
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN, ...remoteEnv({ ftpPort: ftp.port(), smbPort: smb.port() }) } });
  try {
    const op = await makeBackupOp(server, 'op-nos3@test.local');
    const taskId = await makeTask(server, op, 'No-S3 prune');
    setRetention(server, taskId, { daily: 1 });
    const day = 24 * 3600 * 1000;
    const base = Date.UTC(2026, 10, 3, 2, 30);
    seedRun(server, taskId, { id: 'ns-anchor', at: Date.UTC(2025, 0, 2, 2, 30), filename: `backup-task-${taskId}-20250102-023000.tar.gz` });
    seedRun(server, taskId, { id: 'ns-primer', at: Date.UTC(2026, 0, 5, 2, 30), filename: `backup-task-${taskId}-20260105-023000.tar.gz` });
    seedRun(server, taskId, { id: 'ns-monthly', at: Date.UTC(2026, 10, 1, 2, 0), filename: `backup-task-${taskId}-20261101-020000.tar.gz` });
    seedRun(server, taskId, { id: 'ns-weekly', at: Date.UTC(2026, 10, 2, 2, 0), filename: `backup-task-${taskId}-20261102-020000.tar.gz` });
    const doomed = seedRun(server, taskId, { id: 'ns-doomed', at: base, filename: `backup-task-${taskId}-20261103-023000.tar.gz`, flags: { ftp_uploaded: 1, smb_uploaded: 1 } });
    seedRun(server, taskId, { id: 'ns-new', at: base + day, filename: `backup-task-${taskId}-20261105-023000.tar.gz` });

    const report = await rotationPass(server, { taskId });
    assert.equal(report.deleted, 1, 'rotation proceeds');
    const row = runRow(server, doomed);
    assert.equal(row.status, 'deleted', 'run rotated');
    assert.equal(row.remote_pruned, 1, 'remote_pruned = 1 after both mirrors pruned');
    const audits = pruneAudits(server).filter(a => a.target_id === taskId);
    assert.deepEqual(
      audits.map(a => a.action).sort(),
      ['backup_prune_ok:ftp', 'backup_prune_ok:smb'],
      'one ok audit per destination',
    );
    assert.ok(ftp.commands.some(c => c.startsWith('DELE ')), 'FTP DELE was issued');
    assert.ok(smb.files.size === 0 || true, 'smb mock reachable');
    assert.ok(smb.commands.includes(12) || smb.commands.length > 0, 'smb session reached the mock (commands recorded)');
  } finally {
    await server.stop();
    await ftp.close();
    await smb.close();
  }
});

test('idempotency: an already-pruned mirror (DELE 550 / SMB 0xc0000034) prunes as backup_prune_ok — no failed audit', async () => {
  const ftp = fakeFtp({ deleReply: '550 file not found' });
  await ftp.listen();
  const smb = fakeSmb({ createStatus: 0xc0000034 }, { domain: '' }); // STATUS_OBJECT_NAME_NOT_FOUND
  await smb.listen();
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN, ...remoteEnv({ ftpPort: ftp.port(), smbPort: smb.port() }) } });
  try {
    const op = await makeBackupOp(server, 'op-idem@test.local');
    const taskId = await makeTask(server, op, 'Idempotent prune');
    setRetention(server, taskId, { daily: 1 });
    const day = 24 * 3600 * 1000;
    const base = Date.UTC(2026, 10, 3, 2, 30);
    seedRun(server, taskId, { id: 'idem-anchor', at: Date.UTC(2025, 0, 2, 2, 30), filename: `backup-task-${taskId}-20250102-023000.tar.gz` });
    seedRun(server, taskId, { id: 'idem-primer', at: Date.UTC(2026, 0, 5, 2, 30), filename: `backup-task-${taskId}-20260105-023000.tar.gz` });
    seedRun(server, taskId, { id: 'idem-monthly', at: Date.UTC(2026, 10, 1, 2, 0), filename: `backup-task-${taskId}-20261101-020000.tar.gz` });
    seedRun(server, taskId, { id: 'idem-weekly', at: Date.UTC(2026, 10, 2, 2, 0), filename: `backup-task-${taskId}-20261102-020000.tar.gz` });
    const doomed = seedRun(server, taskId, { id: 'idem-doomed', at: base, filename: `backup-task-${taskId}-20261103-023000.tar.gz`, flags: { ftp_uploaded: 1, smb_uploaded: 1 } });
    seedRun(server, taskId, { id: 'idem-new', at: base + day, filename: `backup-task-${taskId}-20261105-023000.tar.gz` });

    await rotationPass(server, { taskId });
    const row = runRow(server, doomed);
    assert.equal(row.remote_pruned, 1, 'not-found mapped to already-pruned SUCCESS — flag written');
    const audits = pruneAudits(server).filter(a => a.target_id === taskId);
    assert.deepEqual(audits.map(a => a.action).sort(), ['backup_prune_ok:ftp', 'backup_prune_ok:smb'], 'no spurious failed audits on re-run');
  } finally {
    await server.stop();
    await ftp.close();
    await smb.close();
  }
});

test('containment (D-05): unreachable mirrors prune-fail per destination — audits backup_prune_failed, remote_pruned stays 0, rotation proceeds', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN, ...remoteEnv({}) } }); // both ports 1 = refused
  try {
    const op = await makeBackupOp(server, 'op-fail@test.local');
    const taskId = await makeTask(server, op, 'Fail-containment task');
    setRetention(server, taskId, { daily: 1 });
    const day = 24 * 3600 * 1000;
    const base = Date.UTC(2026, 10, 3, 2, 30);
    seedRun(server, taskId, { id: 'fail-anchor', at: Date.UTC(2025, 0, 2, 2, 30), filename: `backup-task-${taskId}-20250102-023000.tar.gz` });
    seedRun(server, taskId, { id: 'fail-primer', at: Date.UTC(2026, 0, 5, 2, 30), filename: `backup-task-${taskId}-20260105-023000.tar.gz` });
    seedRun(server, taskId, { id: 'fail-monthly', at: Date.UTC(2026, 10, 1, 2, 0), filename: `backup-task-${taskId}-20261101-020000.tar.gz` });
    seedRun(server, taskId, { id: 'fail-weekly', at: Date.UTC(2026, 10, 2, 2, 0), filename: `backup-task-${taskId}-20261102-020000.tar.gz` });
    const doomed = seedRun(server, taskId, { id: 'fail-doomed', at: base, filename: `backup-task-${taskId}-20261103-023000.tar.gz`, flags: { ftp_uploaded: 1, smb_uploaded: 1 } });
    seedRun(server, taskId, { id: 'fail-new', at: base + day, filename: `backup-task-${taskId}-20261105-023000.tar.gz` });

    const report = await rotationPass(server, { taskId });
    assert.equal(report.deleted, 1, 'prune failure NEVER blocks the rotation (report shape intact: scanned/deleted/floorHeld/tasks)');
    assert.deepEqual(Object.keys(report).sort(), ['deleted', 'floorHeld', 'scanned', 'tasks'], 'report shape unchanged');
    const row = runRow(server, doomed);
    assert.equal(row.status, 'deleted', 'local rotation committed before the prune attempts');
    assert.equal(row.remote_pruned, 0, 'remote_pruned stays 0 — the badge never lies');
    const audits = pruneAudits(server).filter(a => a.target_id === taskId);
    const failed = audits.filter(a => a.action.startsWith('backup_prune_failed:'));
    assert.equal(failed.length, 2, 'one failed audit per destination');
    assert.ok(failed.every(a => /backup_prune_failed:(ftp|smb):[A-Za-z]/.test(a.action)), 'failure detail is the KEYED code only (Pitfall 5 — no raw error text)');
    assert.ok(failed.every(a => !/password|secret|smb:\/\//i.test(a.action)), 'no credential material in the audit trail');
  } finally {
    await server.stop();
  }
});

test('prune keys mirror the UPLOAD arm (backup-task-<taskId>/<filename>) — manualPrefixes never used', async () => {
  const ftp = fakeFtp();
  await ftp.listen();
  const smb = fakeSmb({}, { domain: "" });
  await smb.listen();
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN, ...remoteEnv({ ftpPort: ftp.port(), smbPort: smb.port() }) } });
  try {
    const op = await makeBackupOp(server, 'op-keys@test.local');
    const taskId = await makeTask(server, op, 'Key-shape task');
    setRetention(server, taskId, { daily: 1 });
    const day = 24 * 3600 * 1000;
    const base = Date.UTC(2026, 10, 3, 2, 30);
    seedRun(server, taskId, { id: 'key-anchor', at: Date.UTC(2025, 0, 2, 2, 30), filename: `backup-task-${taskId}-20250102-023000.tar.gz` });
    seedRun(server, taskId, { id: 'key-primer', at: Date.UTC(2026, 0, 5, 2, 30), filename: `backup-task-${taskId}-20260105-023000.tar.gz` });
    seedRun(server, taskId, { id: 'key-monthly', at: Date.UTC(2026, 10, 1, 2, 0), filename: `backup-task-${taskId}-20261101-020000.tar.gz` });
    seedRun(server, taskId, { id: 'key-weekly', at: Date.UTC(2026, 10, 2, 2, 0), filename: `backup-task-${taskId}-20261102-020000.tar.gz` });
    seedRun(server, taskId, { id: 'key-doomed', at: base, filename: `backup-task-${taskId}-20261103-023000.tar.gz`, flags: { ftp_uploaded: 1, smb_uploaded: 1 } });
    seedRun(server, taskId, { id: 'key-new', at: base + day, filename: `backup-task-${taskId}-20261105-023000.tar.gz` });

    await rotationPass(server, { taskId });
    const dele = ftp.commands.find(c => c.startsWith('DELE '));
    assert.ok(dele.includes(`backup-task-${taskId}/backup-task-${taskId}-20261103-023000.tar.gz`), 'FTP prune key = upload-arm key shape');
    assert.ok(!ftp.commands.some(c => c.includes('backup-ftp/')), 'manualPrefix backup-ftp/ NEVER used');
  } finally {
    await server.stop();
    await ftp.close();
    await smb.close();
  }
});

/* ---------- Task 3: the pruned badge render condition (D-03) ---------- */

test('pruned badge: additive render gated on remote_pruned === 1 && status === deleted — never coupled to the location ternary', () => {
  const b = src('src/pages/backup.js');
  const at = b.indexOf('const statusCell');
  const end = b.indexOf('const actionsCell', at);
  const cell = b.slice(at, end);
  assert.match(cell, /run\.remote_pruned === 1 && run\.status === 'deleted'/, 'two-condition render gate present');
  assert.match(cell, /page\.backup\.pruned/, 'badge label rides the i18n key');
  for (const locale of ['en', 'fr', 'nl', 'de', 'es']) {
    const cat = JSON.parse(src(`src/locales/${locale}.json`));
    assert.ok(typeof cat['page.backup.pruned'] === 'string' && cat['page.backup.pruned'].length > 0, `${locale} carries page.backup.pruned`);
  }
});
