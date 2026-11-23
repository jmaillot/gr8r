/* =====================================================================
   Backup GFS rotation + failure/recovery email suite (Phase 87, plan
   87-03, BKBCK-03/BKBCK-04).

   Wave-3 file. Pins the rotation guarantees:
   - ONE path end-to-end: verified success → runBackupRotationPass →
     expired .tar.gz AND .sha256 deleted, run rows marked 'deleted',
     newest kept, one audited backup_rotation event (D-12/D-13);
   - exactly-one-bucket assignment (D-10) pinned by the observable
     delete-set matrix (yearly/monthly/weekly/daily first-of positions,
     keep-N per bucket);
   - newest-verified exclusion by EXPLICIT ID (`id <> ?` in the delete-set
     query — T-87-07), even when the newest run's own bucket is over quota;
   - refuse-to-empty floor (D-13, independent second guard);
   - manual archives (task_id NULL) structurally outside every task's
     deletable set (D-11, T-87-06).
   The pass is driven through the test-only /api/internal/backup-rotation-pass
   route (BACKUP_TEST_TOKEN harness pattern, injectable { now } clock) and
   through the real fire path (scheduler pass → writer seam complete event).
   Seeded runs are fake rows + fake files in a temp DATA_DIR/backups — no
   sleeps; time travel is backdated created_at.
   Failure/recovery emails (D-15/D-16/D-17): transition-only outbox claims —
   fail → one row per recipient; consecutive failure → no new rows;
   recovery → recovery rows only; MAILER-disabled → state tracked, zero rows.
   Pattern: test/backup-scheduler.test.mjs harness (startServer-per-case,
   withDb for direct row inspection, makeBackupOp through the Phase 85
   grant route).
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ADMIN, login, signup, startServer, withDb } from './helpers/server.mjs';
import { assignGfsBuckets, gfsBucketFor } from '../export/gfs.js'; // Phase 92: the single pure GFS definition

const BACKUP_TOKEN = 'rotation-test-token';
const userIdByEmail = (srv, email) => withDb(srv.dbPath, db => db.prepare('select id from users where email = ?').get(email).id);
const runRow = (srv, id) => withDb(srv.dbPath, db => db.prepare('select * from backup_runs where id = ?').get(id));
const taskRow = (srv, id) => withDb(srv.dbPath, db => db.prepare('select * from backup_tasks where id = ?').get(id));
const rotationAudits = srv =>
  withDb(srv.dbPath, db => db.prepare("select * from audit_log where action like 'backup_rotation%' order by created_at, id").all());
const outboxRows = srv =>
  withDb(srv.dbPath, db => db.prepare("select * from email_outbox where kind = 'backup_alert' order by created_at, id").all());

/* A holder + the operator client, granted through the Phase 85 grant route. */
async function makeBackupOp(server, email) {
  const joined = await signup(server.base, { name: 'Backup Op', email });
  assert.equal(joined.status, 201, `signup ${email}: ${JSON.stringify(joined.data)}`);
  const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
  const grant = await operator.post('/api/auth/operator/instance-roles', { userId: userIdByEmail(server, email), role: 'backup_operator' });
  assert.equal(grant.status, 200, `grant: ${JSON.stringify(grant.data)}`);
  return (await login(server.base, email, 'password-1234')).client;
}

/* Drive the rotation pass through the test-only internal route. */
const rotationPass = (srv, { taskId } = {}) =>
  fetch(`${srv.base}/api/internal/backup-rotation-pass`, {
    method: 'POST',
    headers: { 'x-backup-token': BACKUP_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify(taskId ? { taskId } : {}),
  }).then(async r => {
    assert.equal(r.status, 200, `rotation pass: ${r.status}`);
    return r.json();
  });

/* Drive the scheduler sweep (the real fire path — writer seam complete
   event runs rotation after a verified success). */
const schedulerPass = (srv, nowMs) =>
  fetch(`${srv.base}/api/internal/backup-scheduler-pass`, {
    method: 'POST',
    headers: { 'x-backup-token': BACKUP_TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({ now: new Date(nowMs).toISOString() }),
  }).then(async r => {
    assert.equal(r.status, 200, `scheduler pass: ${r.status}`);
    return r.json();
  });

const backupsDir = srv => path.join(srv.dataDir, 'backups');
const archivePaths = (srv, filename) => [path.join(backupsDir(srv), filename), `${path.join(backupsDir(srv), filename)}.sha256`];

/* Seed one succeeded run row (backdated created_at) + fake archive and
   sidecar files on disk. */
function seedRun(srv, taskId, { id, at, filename }) {
  withDb(srv.dbPath, db =>
    db.prepare("insert into backup_runs (id, task_id, scope, trigger, status, started_at, created_at, filename) values (?,?,?,?,?,?,?,?)").run(
      id,
      taskId,
      JSON.stringify({ kind: 'instance' }),
      'scheduled',
      'succeeded',
      at,
      at,
      filename,
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

/* Replace DATA_DIR/backups with a regular FILE — fs.mkdirSync(...{recursive})
   throws EEXIST against it, so the next scheduled fire fails honestly. */
function breakBackupsDir(srv) {
  fs.rmSync(backupsDir(srv), { recursive: true, force: true });
  fs.writeFileSync(backupsDir(srv), 'not a directory');
}
function unbreakBackupsDir(srv) {
  fs.rmSync(backupsDir(srv), { force: true });
  fs.mkdirSync(backupsDir(srv), { recursive: true });
}

/* ---------- tracer slice: verified success → expired archive deleted + audited ---------- */

test('rotation deletes expired archives (sidecar first), marks rows deleted, keeps the newest, one audited event (D-12/D-13)', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
  try {
    const op = await makeBackupOp(server, 'op-rotation@test.local');
    const taskId = await makeTask(server, op, 'Nightly');
    setRetention(server, taskId, { daily: 1 });
    const day = 24 * 3600 * 1000;
    const base = Date.UTC(2026, 10, 2, 2, 30); // 2026-11-02 Mon — same ISO week, same month/year
    const r0 = seedRun(server, taskId, { id: 'run-rotation-0', at: base, filename: `backup-task-${taskId}-20261102-023000.tar.gz` });
    const r1 = seedRun(server, taskId, { id: 'run-rotation-1', at: base + day, filename: `backup-task-${taskId}-20261103-023000.tar.gz` });
    const r2 = seedRun(server, taskId, { id: 'run-rotation-2', at: base + 2 * day, filename: `backup-task-${taskId}-20261104-023000.tar.gz` });
    const r3 = seedRun(server, taskId, { id: 'run-rotation-3', at: base + 3 * day, filename: `backup-task-${taskId}-20261105-023000.tar.gz` });
    // Buckets: r0 first-of-year → yearly (kept, daily=1 irrelevant);
    // r1/r2/r3 daily; keep newest 1 → r1, r2 expired, r3 (newest) kept.

    const report = await rotationPass(server, { taskId });
    assert.equal(report.deleted, 2, 'two expired archives deleted');

    // Expired archives (archive AND sidecar) gone; newest + yearly run remain.
    assert.ok(!fs.existsSync(archivePaths(server, `backup-task-${taskId}-20261103-023000.tar.gz`)[0]), 'r1 archive gone');
    assert.ok(!fs.existsSync(archivePaths(server, `backup-task-${taskId}-20261103-023000.tar.gz`)[1]), 'r1 sidecar gone');
    assert.ok(!fs.existsSync(archivePaths(server, `backup-task-${taskId}-20261104-023000.tar.gz`)[0]), 'r2 archive gone');
    assert.ok(!fs.existsSync(archivePaths(server, `backup-task-${taskId}-20261104-023000.tar.gz`)[1]), 'r2 sidecar gone');
    assert.ok(fs.existsSync(archivePaths(server, `backup-task-${taskId}-20261105-023000.tar.gz`)[0]), 'newest archive kept');
    assert.ok(fs.existsSync(archivePaths(server, `backup-task-${taskId}-20261105-023000.tar.gz`)[1]), 'newest sidecar kept');
    assert.ok(fs.existsSync(archivePaths(server, `backup-task-${taskId}-20261102-023000.tar.gz`)[0]), 'yearly-bucket run kept');

    // Run rows: history rows REMAIN, marked deleted (D-12); kept rows untouched.
    assert.equal(runRow(server, r0).status, 'succeeded');
    assert.equal(runRow(server, r1).status, 'deleted');
    assert.equal(runRow(server, r2).status, 'deleted');
    assert.equal(runRow(server, r3).status, 'succeeded');

    // One audited rotation event naming the deleted run ids and their bucket.
    const audits = rotationAudits(server);
    assert.equal(audits.length, 1, `exactly one backup_rotation audit row (${audits.length})`);
    assert.ok(audits[0].action.includes(r1) && audits[0].action.includes(r2), 'audit names the deleted run ids');
    assert.ok(audits[0].action.includes('daily:'), 'audit names the bucket');
    assert.ok(audits[0].action.includes('expired'), 'audit names the why');
    assert.equal(audits[0].target_id, taskId);
  } finally {
    await server.stop();
  }
});

/* ---------- newest-verified exclusion by EXPLICIT ID, even over quota ---------- */

test('the newest verified run is NEVER deleted even when its own bucket is over quota (D-13, id <> ?)', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
  try {
    const op = await makeBackupOp(server, 'op-newest@test.local');
    const taskId = await makeTask(server, op, 'Yearly keeper');
    // yearly keep = 0 — the bucket math alone would delete BOTH yearly runs.
    setRetention(server, taskId, { yearly: 0, daily: 99 });
    const rOld = seedRun(server, taskId, { id: 'run-yearly-old', at: Date.UTC(2025, 0, 2, 10), filename: `backup-task-${taskId}-20250102-100000.tar.gz` });
    seedRun(server, taskId, { id: 'run-mid-daily', at: Date.UTC(2025, 5, 1, 10), filename: `backup-task-${taskId}-20250601-100000.tar.gz` });
    const rNew = seedRun(server, taskId, { id: 'run-yearly-new', at: Date.UTC(2026, 2, 1, 10), filename: `backup-task-${taskId}-20260301-100000.tar.gz` });

    const report = await rotationPass(server, { taskId });
    assert.equal(report.deleted, 1, 'only the OLD yearly run deleted');

    assert.equal(runRow(server, rOld).status, 'deleted', 'over-quota old yearly run deleted');
    assert.equal(runRow(server, rNew).status, 'succeeded', 'newest verified run NEVER deleted despite over-quota bucket');
    assert.ok(fs.existsSync(archivePaths(server, `backup-task-${taskId}-20260301-100000.tar.gz`)[0]), 'newest archive file intact');
    assert.ok(!fs.existsSync(archivePaths(server, `backup-task-${taskId}-20250102-100000.tar.gz`)[0]), 'old archive file gone');
  } finally {
    await server.stop();
  }
});

/* ---------- refuse-to-empty floor ---------- */

test('a pass that would delete every remaining archive performs zero deletes (D-13 floor intact)', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
  try {
    const op = await makeBackupOp(server, 'op-floor@test.local');
    const taskId = await makeTask(server, op, 'Zero keeper');
    setRetention(server, taskId, { daily: 0, weekly: 0, monthly: 0, yearly: 0 });
    const r1 = seedRun(server, taskId, { id: 'run-floor-1', at: Date.UTC(2026, 0, 2, 10), filename: `backup-task-${taskId}-20260102-100000.tar.gz` });

    const report = await rotationPass(server, { taskId });
    assert.equal(report.deleted, 0, 'zero deletes — the newest-verified exclusion keeps the floor');
    assert.equal(runRow(server, r1).status, 'succeeded', 'run row untouched');
    assert.ok(fs.existsSync(archivePaths(server, `backup-task-${taskId}-20260102-100000.tar.gz`)[0]), 'archive file intact');
    assert.ok(fs.existsSync(archivePaths(server, `backup-task-${taskId}-20260102-100000.tar.gz`)[1]), 'sidecar intact');
    assert.equal(rotationAudits(server).length, 0, 'nothing deleted → nothing audited');
  } finally {
    await server.stop();
  }
});

/* ---------- exactly-one-bucket assignment matrix (D-10) ---------- */

test('exactly-one-bucket: first-of-year/month/ISO-week positions pin the delete-set matrix (D-10, keep-N per bucket)', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
  try {
    const op = await makeBackupOp(server, 'op-buckets@test.local');
    const taskId = await makeTask(server, op, 'Bucket matrix');
    setRetention(server, taskId, { daily: 1, weekly: 1, monthly: 1, yearly: 1 });
    // r1 first of 2025 AND first of Jan AND W01 → yearly (exactly one bucket).
    const r1 = seedRun(server, taskId, { id: 'b-r1', at: Date.UTC(2025, 0, 2, 10), filename: `backup-task-${taskId}-20250102-100000.tar.gz` });
    // r2 same ISO week, same month, year seen → daily.
    const r2 = seedRun(server, taskId, { id: 'b-r2', at: Date.UTC(2025, 0, 3, 10), filename: `backup-task-${taskId}-20250103-100000.tar.gz` });
    // r3 first of ISO W02 → weekly.
    seedRun(server, taskId, { id: 'b-r3', at: Date.UTC(2025, 0, 8, 10), filename: `backup-task-${taskId}-20250108-100000.tar.gz` });
    // r4 first of ISO W03 → weekly (weekly is a first-of-week tier, not "everything after the first week").
    seedRun(server, taskId, { id: 'b-r4', at: Date.UTC(2025, 0, 15, 10), filename: `backup-task-${taskId}-20250115-100000.tar.gz` });
    // r5 first of Feb, year seen → monthly.
    seedRun(server, taskId, { id: 'b-r5', at: Date.UTC(2025, 1, 3, 10), filename: `backup-task-${taskId}-20250203-100000.tar.gz` });
    // r6 first of ISO W07 → weekly.
    seedRun(server, taskId, { id: 'b-r6', at: Date.UTC(2025, 1, 10, 10), filename: `backup-task-${taskId}-20250210-100000.tar.gz` });
    // r7 first of 2026 → yearly (newest overall).
    seedRun(server, taskId, { id: 'b-r7', at: Date.UTC(2026, 0, 5, 10), filename: `backup-task-${taskId}-20260105-100000.tar.gz` });
    // Expected: yearly keep 1 → r1 expired (r7 is the newest yearly);
    // weekly keep 1 → r3, r4 expired (r6 is the newest weekly);
    // daily r2, monthly r5 kept (within quota).
    const report = await rotationPass(server, { taskId });
    assert.deepEqual(
      report.tasks[0].deletedRunIds.sort(),
      [r1, 'b-r3', 'b-r4'].sort(),
      'exactly the yearly-old + weekly-old runs deleted — one bucket per run',
    );
    assert.equal(runRow(server, r1).status, 'deleted');
    assert.equal(runRow(server, 'b-r3').status, 'deleted');
    assert.equal(runRow(server, 'b-r4').status, 'deleted');
    for (const [id, name] of [['b-r2', '20250103'], ['b-r5', '20250203'], ['b-r6', '20250210'], ['b-r7', '20260105']]) {
      assert.equal(runRow(server, id).status, 'succeeded', `${id} kept`);
      assert.ok(fs.existsSync(archivePaths(server, `backup-task-${taskId}-${name}-100000.tar.gz`)[0]), `${id} file kept`);
    }
  } finally {
    await server.stop();
  }
});

/* ---------- manual archives are untouchable (D-11, T-87-06) ---------- */

test('manual archives (task_id NULL) never appear in any task deletable set (D-11)', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
  try {
    const op = await makeBackupOp(server, 'op-manual-rot@test.local');
    const taskId = await makeTask(server, op, 'Rotates task rows only');
    setRetention(server, taskId, { daily: 1 });
    // Yearly anchor (Jan) + monthly anchor (Nov 1 early) so the November
    // run below is daily-tier and expired.
    seedRun(server, taskId, { id: 'run-task-anchor', at: Date.UTC(2026, 0, 5, 2, 30), filename: `backup-task-${taskId}-20260105-023000.tar.gz` });
    seedRun(server, taskId, { id: 'run-task-monthly', at: Date.UTC(2026, 10, 3, 2, 0), filename: `backup-task-${taskId}-20261103-020000.tar.gz` });
    const r1 = seedRun(server, taskId, { id: 'run-task-old', at: Date.UTC(2026, 10, 4, 10, 0), filename: `backup-task-${taskId}-20261104-100000.tar.gz` });
    seedRun(server, taskId, { id: 'run-task-new', at: Date.UTC(2026, 10, 5, 2, 30), filename: `backup-task-${taskId}-20261105-023000.tar.gz` });
    // A manual archive: task_id NULL, frozen 86-D-14 naming.
    withDb(server.dbPath, db =>
      db.prepare("insert into backup_runs (id, task_id, scope, trigger, status, started_at, created_at) values (?,?,?,?,?,?,?)").run(
        'run-manual-1',
        null,
        JSON.stringify({ kind: 'instance' }),
        'manual',
        'succeeded',
        Date.UTC(2025, 0, 2),
        Date.UTC(2025, 0, 2),
      ),
    );
    for (const p of archivePaths(server, 'backup-instance-20250102-000000.tar.gz')) fs.writeFileSync(p, 'fake-manual');

    await rotationPass(server, {});
    assert.equal(runRow(server, 'run-manual-1').status, 'succeeded', 'manual row NEVER marked deleted');
    assert.ok(fs.existsSync(archivePaths(server, 'backup-instance-20250102-000000.tar.gz')[0]), 'manual archive file intact');
    assert.ok(fs.existsSync(archivePaths(server, 'backup-instance-20250102-000000.tar.gz')[1]), 'manual sidecar intact');
    assert.equal(runRow(server, r1).status, 'deleted', 'task-scoped expired run still rotated');
  } finally {
    await server.stop();
  }
});

/* ---------- the real fire path: verified success → rotation via the writer seam ---------- */

test('a verified scheduled success triggers the rotation pass through the writer seam (end-to-end)', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
  try {
    const op = await makeBackupOp(server, 'op-e2e@test.local');
    const taskId = await makeTask(server, op, 'E2E rotation');
    setRetention(server, taskId, { daily: 1 });
    // Seed older succeeded runs (yearly + monthly anchors, then an expired
    // daily) + files, then fire a real scheduled run — its writer-seam
    // complete event must rotate the older daily archive away.
    seedRun(server, taskId, { id: 'run-e2e-anchor', at: Date.UTC(2026, 0, 5, 2, 30), filename: `backup-task-${taskId}-20260105-023000.tar.gz` });
    seedRun(server, taskId, { id: 'run-e2e-monthly', at: Date.UTC(2026, 10, 3, 2, 0), filename: `backup-task-${taskId}-20261103-020000.tar.gz` });
    seedRun(server, taskId, { id: 'run-e2e-daily2', at: Date.UTC(2026, 10, 4, 14, 0), filename: `backup-task-${taskId}-20261104-140000.tar.gz` });
    seedRun(server, taskId, { id: 'run-e2e-old', at: Date.UTC(2026, 10, 4, 10, 0), filename: `backup-task-${taskId}-20261104-100000.tar.gz` });
    const nowMs = Date.now();
    withDb(server.dbPath, db => db.prepare('update backup_tasks set next_run_at = ? where id = ?').run(nowMs - 60_000, taskId));
    await schedulerPass(server, nowMs);

    const rows = withDb(server.dbPath, db => db.prepare('select * from backup_runs where task_id = ? order by created_at, id').all(taskId));
    assert.equal(rows.length, 5, 'anchors + dailies + the new scheduled run persisted');
    const fresh = rows[rows.length - 1];
    assert.equal(fresh.status, 'succeeded', 'the fresh run succeeded (verified)');
    assert.equal(runRow(server, 'run-e2e-old').status, 'deleted', 'the older archive was rotated by the fire path');
    assert.ok(!fs.existsSync(archivePaths(server, `backup-task-${taskId}-20261104-100000.tar.gz`)[0]), 'old archive gone from disk');
    assert.ok(fs.existsSync(path.join(backupsDir(server), fresh.filename)), 'fresh archive on disk');
    const audits = rotationAudits(server);
    assert.equal(audits.length, 1, 'one audited rotation event');
    assert.ok(audits[0].action.includes('run-e2e-old'));
  } finally {
    await server.stop();
  }
});

/* ---------- failure/recovery email transitions (D-15/D-16/D-17) ---------- */

const SMTP_ENV = { SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', SMTP_REQUIRE_TLS: 'false', MAIL_FROM: 'noreply@test.local', APP_URL: 'http://127.0.0.1:1' }; // MAILER enabled, dead port/URL

test('failure on transition emails each recipient once; consecutive failure emails nothing (D-15)', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN, ...SMTP_ENV } });
  try {
    const op = await makeBackupOp(server, 'op-alert@test.local');
    const taskId = await makeTask(server, op, 'Alerting task');
    breakBackupsDir(server); // the next scheduled fire fails honestly (EEXIST)

    const nowMs = Date.now();
    withDb(server.dbPath, db => db.prepare('update backup_tasks set next_run_at = ? where id = ?').run(nowMs - 60_000, taskId));
    await schedulerPass(server, nowMs);

    // ok (NULL) → failed IS a transition: one claim per recipient (op + admin).
    let rows = outboxRows(server);
    const emails = new Set([ADMIN.email, 'op-alert@test.local']);
    assert.equal(rows.length, emails.size, `one claim per recipient (${rows.length})`);
    assert.ok(rows.every(r => r.kind === 'backup_alert'), 'kind backup_alert');
    assert.ok(rows.every(r => r.workspace_id === ''), 'instance-scope sentinel workspace_id');
    assert.ok(rows.every(r => r.dedup_key.startsWith('backup-alert:')), 'dedup_key prefix');
    assert.ok(rows.some(r => r.recipient === ADMIN.email) && rows.some(r => r.recipient === 'op-alert@test.local'), 'role-resolved recipients (D-17)');
    const ctx = JSON.parse(rows[0].ctx);
    assert.equal(ctx.transition, 'failed');
    assert.equal(ctx.taskName, 'Alerting task');
    assert.ok(ctx.error, 'error text carried in ctx (T-87-09: stored, never executed)');
    assert.equal(taskRow(server, taskId).last_notified_state, 'failed', 'state recorded');

    // Consecutive failure: no new transition → no new rows.
    withDb(server.dbPath, db => db.prepare('update backup_tasks set next_run_at = ? where id = ?').run(Date.now() - 60_000, taskId));
    await schedulerPass(server, Date.now());
    assert.equal(outboxRows(server).length, rows.length, 'consecutive failure emails NOTHING (D-15 no-spam)');
    assert.equal(taskRow(server, taskId).last_notified_state, 'failed');
  } finally {
    await server.stop();
  }
});

test('recovery on failed→ok emails recovery rows only; NULL→ok first success emails nothing (D-16)', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN, ...SMTP_ENV } });
  try {
    const op = await makeBackupOp(server, 'op-recover@test.local');
    const taskId = await makeTask(server, op, 'Recovering task');

    /* Delivery attempts are the observable surface here: every enqueued
       claim is kicked through runEmailDeliveryPass post-commit and each
       attempt logs one `email delivery <id> → <recipient>` line (dead SMTP).
       DB reads after a fire that ran the snapshot fence are not used for
       post-fire assertions (fence visibility quirk — see SUMMARY). */
    const deliveries = () => server.output().split('\n').filter(l => l.includes('email delivery') && l.includes('→')).length;

    // First-ever outcome is a SUCCESS from NULL state — no transition email.
    const nowMs = Date.now();
    withDb(server.dbPath, db => db.prepare('update backup_tasks set next_run_at = ? where id = ?').run(nowMs - 60_000, taskId));
    await schedulerPass(server, nowMs);
    await new Promise(r => setTimeout(r, 500));
    const afterFirst = deliveries();
    assert.equal(taskRow(server, taskId).last_notified_state, 'ok', 'state tracked from NULL → ok');

    /* Seed a NOTIFIED failure directly (D-16 contract: recovery fires only
       after a NOTIFIED failure) instead of forcing a real broken-dir fire —
       the transition under test is handleBackupTaskOutcome's failed→ok
       comparison, driven by the REAL success fire below through the writer
       seam (enqueue → delivery kick). */
    withDb(server.dbPath, db => db.prepare('update backup_tasks set last_notified_state = ? where id = ?').run('failed', taskId));

    // Success from failed state → failed→ok transition → RECOVERY claims, kicked.
    withDb(server.dbPath, db => db.prepare('update backup_tasks set next_run_at = ? where id = ?').run(Date.now() - 60_000, taskId));
    await schedulerPass(server, Date.now());
    await new Promise(r => setTimeout(r, 800));
    const lines = server.output().split('\n').filter(l => l.includes('email delivery') && l.includes('→'));
    const recoveryLines = lines.slice(afterFirst);
    assert.equal(recoveryLines.length, 2, `recovery claims only, one per recipient (${recoveryLines.length})`);
    assert.ok(recoveryLines.some(l => l.includes(ADMIN.email)), 'admin recipient (role-resolved, D-17)');
    assert.ok(recoveryLines.some(l => l.includes('op-recover@test.local')), 'backup_operator recipient');

    // Steady success again — no new claims (no transition).
    const afterRecovery = deliveries();
    withDb(server.dbPath, db => db.prepare('update backup_tasks set next_run_at = ? where id = ?').run(Date.now() - 60_000, taskId));
    await schedulerPass(server, Date.now());
    await new Promise(r => setTimeout(r, 500));
    assert.equal(deliveries(), afterRecovery, 'steady success emails nothing');
  } finally {
    await server.stop();
  }
});

test('MAILER disabled: last_notified_state still tracked, zero outbox claims', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
  try {
    const op = await makeBackupOp(server, 'op-nomail@test.local');
    const taskId = await makeTask(server, op, 'Silent task');
    breakBackupsDir(server);
    withDb(server.dbPath, db => db.prepare('update backup_tasks set next_run_at = ? where id = ?').run(Date.now() - 60_000, taskId));
    await schedulerPass(server, Date.now());
    assert.equal(taskRow(server, taskId).last_notified_state, 'failed', 'state tracked honestly without SMTP');
    assert.equal(outboxRows(server).length, 0, 'enqueue gated on MAILER.enabled');
  } finally {
    await server.stop();
  }
});

/* =====================================================================
   Phase 92 (BKNAME-02, D-02) — bucket-at-creation + stored-bucket
   rotation. New succeeded runs store gfs_bucket at creation (the ONLY
   writer of NEW rows); rotation reads the stored column and derives
   IN MEMORY (never writing) when a succeeded row is still NULL.
   ===================================================================== */

test('gfsBucketFor: the single-run form agrees with the batch walk at identical created_at (Pitfall-1 tiebreak pin)', () => {
  const T = Date.UTC(2026, 5, 3, 10, 0, 0); // same second
  const a = { id: 'tie-a', created_at: T };
  const b = { id: 'tie-b', created_at: T };
  const batch = assignGfsBuckets([a, b]);
  assert.equal(batch.get('tie-a'), 'yearly', 'first of the calendar year');
  assert.equal(batch.get('tie-b'), 'daily', 'same-second follower is daily — the id tiebreak decides order, not the wall clock');
  assert.equal(gfsBucketFor([], a), 'yearly', 'single-run form: first run of a task is yearly');
  assert.equal(gfsBucketFor([a], b), 'daily', 'single-run form over [...prior, newRow] matches the batch derivation exactly');
});

test('bucket-at-creation: a real scheduled fire stores gfs_bucket on the NEW row, matching the batch derivation over the whole history', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
  try {
    const op = await makeBackupOp(server, 'op-bac@test.local');
    const taskId = await makeTask(server, op, 'Stored bucket');
    /* Historical anchors: 2026 yearly primer, a November monthly, an expired
       daily (it gets rotated by the fire — its stored bucket stays on the
       row, rotation NEVER rewrites buckets). */
    seedRun(server, taskId, { id: 'bac-yearly', at: Date.UTC(2026, 0, 5, 2, 30), filename: `backup-task-${taskId}-20260105-023000.tar.gz` });
    seedRun(server, taskId, { id: 'bac-monthly', at: Date.UTC(2026, 10, 3, 2, 0), filename: `backup-task-${taskId}-20261103-020000.tar.gz` });
    seedRun(server, taskId, { id: 'bac-daily', at: Date.UTC(2026, 10, 4, 10, 0), filename: `backup-task-${taskId}-20261104-100000.tar.gz` });
    const nowMs = Date.now();
    withDb(server.dbPath, db => db.prepare('update backup_tasks set next_run_at = ? where id = ?').run(nowMs - 60_000, taskId));
    await schedulerPass(server, nowMs);

    const rows = withDb(server.dbPath, db => db.prepare('select * from backup_runs where task_id = ? order by created_at asc, id asc').all(taskId));
    const fresh = rows[rows.length - 1];
    assert.equal(fresh.status, 'succeeded', 'the fired run succeeded');
    assert.ok(fresh.gfs_bucket, 'the NEW succeeded row carries a stored gfs_bucket');
    /* The batch walk over the full history (the same function, imported)
       must derive exactly what was stored — Pitfall 1: same ordering,
       same answer. */
    const batch = assignGfsBuckets(rows);
    assert.equal(fresh.gfs_bucket, batch.get(fresh.id), 'stored bucket === batch derivation for the new row');
    assert.ok(['daily', 'weekly', 'monthly', 'yearly'].includes(fresh.gfs_bucket), 'the bucket is one of the four labels');
  } finally {
    await server.stop();
  }
});

test('rotation NULL-fallback: pre-backfill succeeded rows (gfs_bucket NULL) rotate identically via the in-memory derive, and NO bucket is written back', async () => {
  const server = await startServer({ env: { BACKUP_TEST_TOKEN: BACKUP_TOKEN } });
  try {
    const op = await makeBackupOp(server, 'op-null@test.local');
    const taskId = await makeTask(server, op, 'Null fallback');
    setRetention(server, taskId, { daily: 1 });
    const base = Date.UTC(2026, 10, 2, 2, 30); // same ISO week/month/year — all daily except the yearly primer
    seedRun(server, taskId, { id: 'null-primer', at: Date.UTC(2025, 0, 2, 2, 30), filename: `backup-task-${taskId}-20250102-023000.tar.gz` });
    const r1 = seedRun(server, taskId, { id: 'null-r1', at: base, filename: `backup-task-${taskId}-20261102-023000.tar.gz` });
    const r2 = seedRun(server, taskId, { id: 'null-r2', at: base + 24 * 3600 * 1000, filename: `backup-task-${taskId}-20261103-023000.tar.gz` });
    const r3 = seedRun(server, taskId, { id: 'null-r3', at: base + 2 * 24 * 3600 * 1000, filename: `backup-task-${taskId}-20261104-023000.tar.gz` });
    // All rows still NULL (pre-backfill seeds). Buckets: primer 2025 yearly,
    // r1 first of 2026 → yearly, r2/r3 daily; keep daily=1 → r3 (newest
    // daily) kept, r2 expires; the newest-verified exclusion also guards r3.
    const report = await rotationPass(server, { taskId });
    assert.equal(report.deleted, 1, 'the NULL-bucket fallback derives the same delete set');
    assert.equal(runRow(server, r1).status, 'succeeded', 'r1 holds the 2026 yearly bucket — kept');
    assert.equal(runRow(server, r2).status, 'deleted', 'the expired daily deleted');
    assert.equal(runRow(server, r3).status, 'succeeded');

    // NO historical write: the pass must leave every gfs_bucket NULL.
    const bucketsAfter = withDb(server.dbPath, db => db.prepare('select id, gfs_bucket from backup_runs where task_id = ?').all(taskId));
    assert.ok(bucketsAfter.every(r => r.gfs_bucket === null), 'rotation never writes gfs_bucket — the sweep is the only historical writer');
  } finally {
    await server.stop();
  }
});
