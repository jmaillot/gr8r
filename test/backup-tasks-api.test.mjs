/* =====================================================================
   Backup-task API suite (Phase 87, plan 87-01, BKBCK-02/BKBCK-03).

   Wave-0 file. The 87-01 tracer slice pins ONE path end-to-end —
   "create task → stored cron → next_run_at → list":
   - the happy path: a Backup Operator POSTs a task; the row stores the RAW
     5-field cron string (D-04, owner-ratified 2026-11-21 — one-way) and a
     next_run_at computed by export/cron.js nextRunAt() in the same write
     (persisted cache, never re-parsed at tick); GET lists the task beside
     the D-24 capability flags;
   - the D-09 retention defaults applied when omitted;
   - the 5-locale keyed refusal catalogue POST can emit.
   CRUD completeness (PUT/DELETE, enable/disable recompute, refusal matrix,
   taskNotFound) extends this file in the 87-01 CRUD task.
   Pattern: test/backup-routes.test.mjs harness (startServer-per-case,
   withDb for direct row inspection); expected next_run_at values are
   computed with nextRunAt directly (the evaluator is pure — no clock
   injection needed at the route layer).
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ADMIN, login, signup, startServer, withDb } from './helpers/server.mjs';
import { nextRunAt } from '../export/cron.js';
import net from 'node:net';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = ['en', 'fr', 'es', 'de', 'nl'];
const readLocale = loc => JSON.parse(fs.readFileSync(path.join(REPO, 'src/locales', loc + '.json'), 'utf8'));

const taskAuditRows = srv =>
  withDb(srv.dbPath, db => db.prepare("select * from audit_log where action like 'backup_%' order by created_at, id").all());
const userIdByEmail = (srv, email) => withDb(srv.dbPath, db => db.prepare('select id from users where email = ?').get(email).id);

/* A holder + the operator client, granted through the Phase 85 grant route. */
async function makeBackupOp(server, email) {
  const joined = await signup(server.base, { name: 'Backup Op', email });
  assert.equal(joined.status, 201, `signup ${email}: ${JSON.stringify(joined.data)}`);
  const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
  const grant = await operator.post('/api/auth/operator/instance-roles', { userId: userIdByEmail(server, email), role: 'backup_operator' });
  assert.equal(grant.status, 200, `grant: ${JSON.stringify(grant.data)}`);
  return (await login(server.base, email, 'password-1234')).client;
}

const taskRow = (srv, id) => withDb(srv.dbPath, db => db.prepare('select * from backup_tasks where id = ?').get(id));

/* 88-03 helpers (declared up top so hoisting order is stable). */
const S3_RIDE_TOKEN = 'tasks-api-s3-ride-token';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const schedulerPass = (srv, nowMs) =>
  fetch(`${srv.base}/api/internal/backup-scheduler-pass`, {
    method: 'POST',
    headers: { 'x-backup-token': S3_RIDE_TOKEN, 'content-type': 'application/json', connection: 'close' },
    body: JSON.stringify({ now: new Date(nowMs).toISOString() }),
  }).then(async r => {
    assert.equal(r.status, 200, `scheduler pass: ${r.status}`);
    return r.json();
  });

/* ---------- tracer slice: create → stored cron → next_run_at → list ---------- */

test('POST /api/backup/tasks stores the raw cron string (D-04) and a computed next_run_at; GET lists it', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-create@test.local');
    const before = Date.now();
    const created = await op.post('/api/backup/tasks', { name: 'Nightly', scope: { kind: 'instance' }, cron: '30 2 * * *' });
    assert.equal(created.status, 200, `create: ${JSON.stringify(created.data)}`);
    const task = created.data.task;
    assert.ok(task?.id, 'task id in response');
    assert.equal(task.cron, '30 2 * * *', 'raw 5-field string round-trips verbatim (D-04)');

    const row = taskRow(server, task.id);
    assert.ok(row, 'row persisted');
    assert.equal(row.cron, '30 2 * * *', 'withDb: stored cron equals the posted raw string');
    assert.equal(Number.isInteger(row.next_run_at) && row.next_run_at !== null, true, 'next_run_at is a non-null integer');
    /* The evaluator is pure: the persisted cache must equal nextRunAt from a
       timestamp inside the create window (minute-aligned, so the bounds
       normally agree; accept either bound across a minute roll). */
    const expected = [nextRunAt('30 2 * * *', 'Europe/Paris', before), nextRunAt('30 2 * * *', 'Europe/Paris', Date.now())];
    assert.ok(expected.includes(row.next_run_at), `next_run_at ${row.next_run_at} ∈ ${JSON.stringify(expected)}`);
    assert.equal(row.tz, 'Europe/Paris', 'default tz is Europe/Paris (ratified 87-01 checkpoint)');
    assert.equal(row.enabled, 1);
    assert.equal(row.retention_daily, 7, 'D-09 default daily=7');
    assert.equal(row.retention_weekly, 4, 'D-09 default weekly=4');
    assert.equal(row.retention_monthly, 12, 'D-09 default monthly=12');
    assert.equal(row.retention_yearly, 5, 'D-09 default yearly=5');
    assert.equal(row.last_notified_state, null, 'D-15 column starts NULL');

    const listed = await op.get('/api/backup/tasks');
    assert.equal(listed.status, 200);
    assert.equal(listed.data.canBackup, true);
    assert.equal(listed.data.canRestore, false);
    const found = listed.data.tasks.find(t => t.id === task.id);
    assert.ok(found, 'GET lists the created task');
    assert.equal(found.cron, '30 2 * * *');
    assert.equal(found.scope.kind, 'instance', 'scope parsed back to object form');

    const audited = taskAuditRows(server).filter(r => r.action === 'backup_task_created');
    assert.equal(audited.length, 1, 'creation audited');
  } finally {
    await server.stop();
  }
});

/* ---------- keyed refusal matrix (T-87-02/T-87-03) ---------- */

test('non-operator POST → 403 backupManageRequired, audited, before any body probing', async () => {
  const server = await startServer({});
  try {
    const plain = (await signup(server.base, { name: 'Nobody', email: 'plain-tasks@test.local' })).client;
    const refused = await plain.post('/api/backup/tasks', {});
    assert.equal(refused.status, 403);
    assert.equal(refused.data.code, 'backupManageRequired');
    const audited = taskAuditRows(server).filter(r => r.action === 'backup_task_refused:backupManageRequired');
    assert.equal(audited.length, 1, 'refusal audited');
  } finally {
    await server.stop();
  }
});

test('invalid cron → 400 invalidSchedule (audited)', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-badcron@test.local');
    for (const bad of ['61 * * * *', '* 24 * * *', 'a b c d e', '* * * *', 'not a cron']) {
      const refused = await op.post('/api/backup/tasks', { name: 'X', scope: { kind: 'instance' }, cron: bad });
      assert.equal(refused.status, 400, bad);
      assert.equal(refused.data.code, 'invalidSchedule', bad);
    }
    const audited = taskAuditRows(server).filter(r => r.action === 'backup_task_refused:invalidSchedule');
    assert.equal(audited.length, 5, 'every invalid cron refusal audited');
  } finally {
    await server.stop();
  }
});

test('invalid retention → 400 invalidRetention; omitted retention → D-09 defaults', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-retention@test.local');
    const refused = await op.post('/api/backup/tasks', {
      name: 'X', scope: { kind: 'instance' }, cron: '30 2 * * *', retention: { daily: -1 },
    });
    assert.equal(refused.status, 400);
    assert.equal(refused.data.code, 'invalidRetention');
    const ok = await op.post('/api/backup/tasks', { name: 'Defaults', scope: { kind: 'instance' }, cron: '0 3 * * *' });
    assert.equal(ok.status, 200);
    const row = taskRow(server, ok.data.task.id);
    assert.deepEqual(
      { d: row.retention_daily, w: row.retention_weekly, m: row.retention_monthly, y: row.retention_yearly },
      { d: 7, w: 4, m: 12, y: 5 },
      'omitted buckets land on the D-09 defaults',
    );
  } finally {
    await server.stop();
  }
});

test('invalid scope → 400 backupInvalidScope; invalid tz → 400 invalidTimezone (both audited, one key per field kind)', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-scope-tz@test.local');
    const badScope = await op.post('/api/backup/tasks', { name: 'X', scope: { kind: 'workspace', id: 'nope' }, cron: '30 2 * * *' });
    assert.equal(badScope.status, 400);
    /* backupInvalidScope, NOT the pre-existing err.invalidScope (project-perms
       "Scope must be read or write") — the keyed refusal contract needs a
       distinct code, else the client renders the perms message (87-01 fix). */
    assert.equal(badScope.data.code, 'backupInvalidScope');
    const badTz = await op.post('/api/backup/tasks', { name: 'X', scope: { kind: 'instance' }, cron: '30 2 * * *', tz: 'Mars/Olympus' });
    assert.equal(badTz.status, 400);
    assert.equal(badTz.data.code, 'invalidTimezone');
    const auditActions = taskAuditRows(server).map(r => r.action);
    assert.ok(auditActions.includes('backup_task_refused:backupInvalidScope'));
    assert.ok(auditActions.includes('backup_task_refused:invalidTimezone'));
  } finally {
    await server.stop();
  }
});

test('missing name → 400 taskNameRequired (audited; the pre-existing generic key, no duplicate added)', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-name@test.local');
    const refused = await op.post('/api/backup/tasks', { name: '   ', scope: { kind: 'instance' }, cron: '30 2 * * *' });
    assert.equal(refused.status, 400);
    assert.equal(refused.data.code, 'taskNameRequired');
    assert.ok(taskAuditRows(server).some(r => r.action === 'backup_task_refused:taskNameRequired'));
  } finally {
    await server.stop();
  }
});

/* ---------- PUT: recompute semantics (D-07 / roadmap schema decision) ---------- */

test('PUT re-schedule recomputes next_run_at from now in the same write (expected value computed via nextRunAt)', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-put@test.local');
    const created = await op.post('/api/backup/tasks', { name: 'Nightly', scope: { kind: 'instance' }, cron: '30 2 * * *' });
    const id = created.data.task.id;
    const before = Date.now();
    const updated = await op.put(`/api/backup/tasks/${id}`, { cron: '15 3 * * *' });
    assert.equal(updated.status, 200, `PUT: ${JSON.stringify(updated.data)}`);
    const row = taskRow(server, id);
    assert.equal(row.cron, '15 3 * * *', 'raw string replaced verbatim');
    const expected = [nextRunAt('15 3 * * *', 'Europe/Paris', before), nextRunAt('15 3 * * *', 'Europe/Paris', Date.now())];
    assert.ok(expected.includes(row.next_run_at), `recomputed ${row.next_run_at} ∈ ${JSON.stringify(expected)}`);
    assert.ok(taskAuditRows(server).some(r => r.action === 'backup_task_updated'));
  } finally {
    await server.stop();
  }
});

test('disable → next_run_at NULL; re-enable → recomputed from now, never a stale value (D-07)', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-toggle@test.local');
    const created = await op.post('/api/backup/tasks', { name: 'Hourly', scope: { kind: 'instance' }, cron: '15 * * * *' });
    const id = created.data.task.id;
    assert.ok(taskRow(server, id).next_run_at !== null, 'created enabled → next_run_at set');

    const disabled = await op.put(`/api/backup/tasks/${id}`, { enabled: false });
    assert.equal(disabled.status, 200);
    const afterDisable = taskRow(server, id);
    assert.equal(afterDisable.enabled, 0);
    assert.equal(afterDisable.next_run_at, null, 'disable stores NULL next_run_at (D-07)');

    const beforeEnable = Date.now();
    const enabled = await op.put(`/api/backup/tasks/${id}`, { enabled: true });
    assert.equal(enabled.status, 200);
    const afterEnable = taskRow(server, id);
    assert.equal(afterEnable.enabled, 1);
    assert.ok(afterEnable.next_run_at !== null, 're-enable recomputes — never leaves NULL/stale');
    const expected = [nextRunAt('15 * * * *', 'Europe/Paris', beforeEnable), nextRunAt('15 * * * *', 'Europe/Paris', Date.now())];
    assert.ok(expected.includes(afterEnable.next_run_at), `re-enabled value ${afterEnable.next_run_at} ∈ ${JSON.stringify(expected)}`);
    assert.ok(afterEnable.next_run_at > beforeEnable - 60_000, 'strictly a fresh future instant, not a stale past one');
  } finally {
    await server.stop();
  }
});

test('PUT on an unknown id → 404 taskNotFound (audited)', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-put404@test.local');
    const refused = await op.put('/api/backup/tasks/does-not-exist', { name: 'Renamed' });
    assert.equal(refused.status, 404);
    assert.equal(refused.data.code, 'taskNotFound');
    assert.ok(taskAuditRows(server).some(r => r.action === 'backup_task_refused:taskNotFound'));
  } finally {
    await server.stop();
  }
});

/* ---------- DELETE: history persists (D-11) ---------- */

test('DELETE removes the task row while its backup_runs rows persist as history', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-delete@test.local');
    const created = await op.post('/api/backup/tasks', { name: 'Doomed', scope: { kind: 'instance' }, cron: '0 4 * * *' });
    const id = created.data.task.id;
    /* Plant a run row directly — history is written by later plans; the pin
       is that DELETE cascades NOTHING. */
    withDb(server.dbPath, db =>
      db.prepare(
        "insert into backup_runs (id, task_id, scope, trigger, status, started_at, created_at) values ('run-hist-1', ?, '{}', 'scheduled', 'succeeded', 111, 111)",
      ).run(id),
    );

    const deleted = await op.del(`/api/backup/tasks/${id}`);
    assert.equal(deleted.status, 200, `DELETE: ${JSON.stringify(deleted.data)}`);
    assert.equal(taskRow(server, id), undefined, 'task row gone');
    const runs = withDb(server.dbPath, db => db.prepare('select * from backup_runs where task_id = ?').all(id));
    assert.equal(runs.length, 1, 'run row persists as history (no cascade)');
    assert.ok(taskAuditRows(server).some(r => r.action === 'backup_task_deleted'));

    const gone = await op.del(`/api/backup/tasks/${id}`);
    assert.equal(gone.status, 404);
    assert.equal(gone.data.code, 'taskNotFound');
  } finally {
    await server.stop();
  }
});

/* ---------- 5-locale refusal catalogue (T-86-06 house rule) ---------- */

test('every 87-01 refusal key exists in all five locale catalogues (no duplicate keys introduced)', () => {
  const keys = ['invalidSchedule', 'invalidTimezone', 'backupInvalidScope', 'invalidRetention', 'taskNameRequired', 'taskNotFound'];
  for (const loc of LOCALES) {
    const cat = readLocale(loc);
    for (const key of keys) {
      assert.ok(cat['err.' + key] && typeof cat['err.' + key] === 'string' && cat['err.' + key].length > 0, `${loc}.err.${key}`);
    }
  }
});

/* ---------- Phase 88 (88-02): additive S3 migration (BKBCK-05, D-88-2/12) ---------- */

const runsDdl = srv =>
  withDb(srv.dbPath, db => db.prepare("select sql from sqlite_master where type = 'table' and name = 'backup_runs'").get()?.sql);

test('fresh boot: backup_tasks.s3_enabled exists defaulting false; backup_runs status CHECK carries upload_failed', async () => {
  const server = await startServer({});
  try {
    const cols = withDb(server.dbPath, db => db.prepare('pragma table_info(backup_tasks)').all().map(c => c.name));
    assert.ok(cols.includes('s3_enabled'), 's3_enabled column present on a fresh install');
    const def = withDb(server.dbPath, db => db.prepare("pragma table_info(backup_tasks)").all().find(c => c.name === 's3_enabled'));
    assert.equal(String(def.dflt_value), '0', 'defaults to 0 (D-88-12)');

    /* The widened CHECK accepts upload_failed and still rejects typos. */
    withDb(server.dbPath, db =>
      db.prepare("insert into backup_runs (id, task_id, scope, trigger, status, started_at, created_at) values ('run-upf', NULL, '{}', 'manual', 'upload_failed', 1, 1)").run(),
    );
    assert.throws(
      () =>
        withDb(server.dbPath, db =>
          db.prepare("insert into backup_runs (id, task_id, scope, trigger, status, started_at, created_at) values ('run-typo', NULL, '{}', 'manual', 'uploaded', 1, 1)").run(),
        ),
      'a typo status is still refused by the CHECK',
    );
    /* 'uploading' is a STAGE, not a status (D-88-2): it must NOT be accepted. */
    assert.throws(
      () =>
        withDb(server.dbPath, db =>
          db.prepare("insert into backup_runs (id, task_id, scope, trigger, status, started_at, created_at) values ('run-stg', NULL, '{}', 'manual', 'uploading', 1, 1)").run(),
        ),
      "'uploading' stays out of the status enum (stage rides the D-19 payload)",
    );
    const row = withDb(server.dbPath, db => db.prepare("select * from backup_tasks where id = 'none'").get());
    assert.equal(row, undefined);
  } finally {
    await server.stop();
  }
});

test('legacy DB reboot: s3_enabled added additively and the status CHECK rebuilt carrying every row verbatim (T-88-08)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-s3-mig-'));
  try {
    const server = await startServer({ dataDir: dir });
    await server.stop();

    /* Rewind the two S3-era changes to their Phase 87 shapes: the legacy
       backup_tasks without s3_enabled and the legacy backup_runs CHECK.
       Real rows are planted to prove the rebuild carries them verbatim. */
    withDb(server.dbPath, db => {
      db.exec('drop table backup_tasks');
      db.exec(`create table backup_tasks (
    id                  text primary key,
    name                text not null,
    scope               text not null default '{}',
    cron                text not null,
    tz                  text not null default 'Europe/Paris',
    enabled             integer not null default 1,
    retention_daily     integer not null default 7,
    retention_weekly    integer not null default 4,
    retention_monthly   integer not null default 12,
    retention_yearly    integer not null default 5,
    next_run_at         integer,
    last_notified_state text,
    created_at          integer not null,
    updated_at          integer not null
  )`);
      db.prepare(
        "insert into backup_tasks (id, name, scope, cron, enabled, next_run_at, created_at, updated_at) values ('t-legacy', 'Legacy', '{}', '30 2 * * *', 0, NULL, 1, 1)",
      ).run();
      db.exec('drop table backup_runs');
      db.exec(`create table backup_runs (
    id           text primary key,
    task_id      text,
    scope        text not null default '{}',
    trigger      text not null check (trigger in ('manual','scheduled')),
    status       text not null check (status in ('running','succeeded','failed','interrupted','skipped_overlap','deleted')),
    started_at   integer not null,
    finished_at  integer,
    duration_ms  integer,
    size_bytes   integer,
    sha256       text,
    filename     text,
    error        text,
    created_at   integer not null
  )`);
      db.prepare(
        "insert into backup_runs (id, task_id, scope, trigger, status, started_at, finished_at, duration_ms, size_bytes, sha256, filename, error, created_at) values ('run-old-1', 't-legacy', '{}', 'scheduled', 'succeeded', 10, 20, 10, 123, 'abc', 'backup-task-t-legacy.tar.gz', NULL, 10)",
      ).run();
    });

    const rebooted = await startServer({ dataDir: dir });
    try {
      const cols = withDb(rebooted.dbPath, db => db.prepare('pragma table_info(backup_tasks)').all().map(c => c.name));
      assert.ok(cols.includes('s3_enabled'), 'ensureColumn added s3_enabled to the legacy table');
      const legacyTask = withDb(rebooted.dbPath, db => db.prepare('select * from backup_tasks where id = ?').get('t-legacy'));
      assert.equal(legacyTask?.s3_enabled, 0, 'the carried row defaults to 0 (D-88-12)');
      assert.ok(runsDdl(rebooted).includes("'upload_failed'"), 'status CHECK widened by the rebuild');

      /* Every legacy row carried verbatim across the drop/recreate. */
      const old = withDb(rebooted.dbPath, db => db.prepare('select * from backup_runs where id = ?').get('run-old-1'));
      assert.equal(old.status, 'succeeded');
      assert.equal(old.task_id, 't-legacy');
      assert.equal(old.sha256, 'abc');
      assert.equal(old.size_bytes, 123);
      assert.equal(old.filename, 'backup-task-t-legacy.tar.gz');
      assert.equal(withDb(rebooted.dbPath, db => db.prepare('select count(*) as n from backup_runs').get()).n, 1, 'exactly the planted rows survived');

      /* The rebuilt CHECK accepts the new terminal state. */
      withDb(rebooted.dbPath, db =>
        db.prepare("insert into backup_runs (id, task_id, scope, trigger, status, started_at, created_at) values ('run-old-2', 't-legacy', '{}', 'manual', 'upload_failed', 11, 11)").run(),
      );
    } finally {
      await rebooted.stop();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dual-engine lockstep: the adapter mirror carries s3_enabled and the widened CHECK (pg gets it from pgSchemaVariant each boot)', async () => {
  const { SQLITE_SCHEMA } = await import('../db-adapter.mjs');
  assert.match(SQLITE_SCHEMA, /create table if not exists backup_tasks \([\s\S]*?s3_enabled\s+integer not null default 0/);
  assert.match(SQLITE_SCHEMA, /status\s+text not null check \(status in \('running','succeeded','failed','upload_failed'/);
  assert.doesNotMatch(
    SQLITE_SCHEMA.match(/status\s+text not null check \(status in \([^)]*\)\)/)?.[0] || '',
    /'uploading'/,
    "'uploading' never becomes a status in the mirror either (comments may mention it)",
  );
});

/* ---------- Phase 88 (88-02): S3 config surface + probe route (SC-1, D-88-11..17) ---------- */

/* A switchable in-process HTTP sink the probe route's SigV4 client hits.
   `behavior` maps request method → { status, body, headers }. */
function startSink(behavior) {
  const hits = [];
  const server = http.createServer((req, res) => {
    let chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      hits.push({ method: req.method, url: req.url });
      const spec = behavior()[req.method] || { status: 200 };
      res.writeHead(spec.status, spec.headers || {});
      res.end(spec.body || '');
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, hits, port: server.address().port })));
}

const S3_ENV = (endpoint, extra = {}) => ({
  S3_ENDPOINT: endpoint,
  S3_BUCKET: 'projects-studio-test-bucket',
  S3_ACCESS_KEY_ID: 'projects-studio-test-key',
  S3_SECRET_KEY: 'projects-studio-test-secret',
  ...extra,
});

test('S3 env unset: config exposes s3Enabled:false, create/edit refuse s3Enabled keyed+audited, probe route is a no-oracle refusal', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-s3-unset@test.local');

    const cfg = await op.get('/api/config');
    assert.equal(cfg.status, 200);
    assert.equal(cfg.data.s3Enabled, false, 'boolean ground truth (toggle hidden client-side)');

    const created = await op.post('/api/backup/tasks', { name: 'X', scope: { kind: 'instance' }, cron: '30 2 * * *', s3Enabled: true });
    assert.equal(created.status, 400);
    assert.equal(created.data.code, 's3NotConfigured');
    const nonBool = await op.post('/api/backup/tasks', { name: 'X', scope: { kind: 'instance' }, cron: '30 2 * * *', s3Enabled: 'yes' });
    assert.equal(nonBool.status, 400);
    assert.equal(nonBool.data.code, 'invalidS3Enabled', 'boolean-only (V5)');

    const existing = await op.post('/api/backup/tasks', { name: 'Plain', scope: { kind: 'instance' }, cron: '30 2 * * *' });
    const edited = await op.put(`/api/backup/tasks/${existing.data.task.id}`, { s3Enabled: true });
    assert.equal(edited.status, 400);
    assert.equal(edited.data.code, 's3NotConfigured');

    const probe = await op.post('/api/backup/s3/probe', {});
    assert.equal(probe.status, 400);
    assert.equal(probe.data.code, 's3NotConfigured', 'no-oracle refusal — no probe runs without the env pair');

    const auditActions = taskAuditRows(server).map(r => r.action);
    assert.ok(auditActions.includes('backup_task_refused:s3NotConfigured'));
    assert.ok(auditActions.includes('backup_task_refused:invalidS3Enabled'));
    assert.ok(auditActions.includes('backup_probe_refused:s3NotConfigured'));

    /* The default (no s3Enabled) row persists 0 — the column exists everywhere. */
    assert.equal(taskRow(server, existing.data.task.id).s3_enabled, 0);
  } finally {
    await server.stop();
  }
});

test('S3 env set: boolean exposure carries no identifiers (T-88-05); gate accepts and persists s3_enabled; PUT flips it', async () => {
  const sink = await startSink(() => ({}));
  const server = await startServer({ env: S3_ENV(`http://127.0.0.1:${sink.port}`) });
  try {
    const op = await makeBackupOp(server, 'op-s3-set@test.local');

    const cfg = await op.get('/api/config');
    assert.equal(cfg.status, 200);
    assert.equal(cfg.data.s3Enabled, true);
    const raw = JSON.stringify(cfg.data);
    assert.ok(!raw.includes('projects-studio-test-bucket') && !raw.includes(sink.port.toString()) && !raw.includes('projects-studio-test-key'),
      'the config payload never carries the bucket/endpoint/key (T-88-05/D-88-11)');

    const created = await op.post('/api/backup/tasks', { name: 'S3 task', scope: { kind: 'instance' }, cron: '30 2 * * *', s3Enabled: true });
    assert.equal(created.status, 200, `create: ${JSON.stringify(created.data)}`);
    assert.equal(taskRow(server, created.data.task.id).s3_enabled, 1, 'accepted value persists to the s3_enabled column');

    const off = await op.put(`/api/backup/tasks/${created.data.task.id}`, { s3Enabled: false });
    assert.equal(off.status, 200);
    assert.equal(taskRow(server, created.data.task.id).s3_enabled, 0, 'PUT flips it back off');

    const on = await op.put(`/api/backup/tasks/${created.data.task.id}`, { s3Enabled: true });
    assert.equal(on.status, 200);
    assert.equal(taskRow(server, created.data.task.id).s3_enabled, 1);

    const nonBool = await op.put(`/api/backup/tasks/${created.data.task.id}`, { s3Enabled: 1 });
    assert.equal(nonBool.status, 400);
    assert.equal(nonBool.data.code, 'invalidS3Enabled');
  } finally {
    await server.stop();
    sink.server.close();
  }
});

test('probe route maps keyed results: success (+httpWarning), s3ClockSkew, badCreds; refusal for non-operators (T-88-06)', async () => {
  /* Success sink: HEAD 200, PUT 200, DELETE 200 — plain http:// endpoint so
     httpWarning rides true (D-88-14). */
  const okSink = await startSink(() => ({}));
  const okServer = await startServer({ env: S3_ENV(`http://127.0.0.1:${okSink.port}`) });
  try {
    const op = await makeBackupOp(okServer, 'op-probe-ok@test.local');
    const probe = await op.post('/api/backup/s3/probe', {});
    assert.equal(probe.status, 200, `probe: ${JSON.stringify(probe.data)}`);
    assert.equal(probe.data.ok, true);
    assert.equal(probe.data.key, 'success');
    assert.equal(probe.data.httpWarning, true, 'plain-http endpoint warns the operator (D-88-14)');
    assert.ok(okSink.hits.filter(h => h.method === 'HEAD').length >= 1, 'HeadBucket ran');
    assert.ok(okSink.hits.some(h => h.method === 'PUT' && h.url.includes('projects-studio-probe/')), 'marker PUT ran (D-88-15 write+delete)');
    assert.ok(okSink.hits.some(h => h.method === 'DELETE' && h.url.includes('projects-studio-probe/')), 'marker DELETE ran');
    assert.ok(taskAuditRows(okServer).some(r => r.action === 'backup_s3_probe_ok'), 'probe audited');
  } finally {
    await okServer.stop();
    okSink.server.close();
  }

  /* Clock-skew sink: HEAD → 403 RequestTimeTooSkewed. HEAD bodies are empty
     on the wire — the code must ride the x-amz-error-code header (the 88-01
     keyed-HEAD contract, SC-3/D-88-17). */
  const skewSink = await startSink(() => ({
    HEAD: { status: 403, headers: { 'x-amz-error-code': 'RequestTimeTooSkewed' } },
  }));
  const skewServer = await startServer({ env: S3_ENV(`http://127.0.0.1:${skewSink.port}`) });
  try {
    const op = await makeBackupOp(skewServer, 'op-probe-skew@test.local');
    const probe = await op.post('/api/backup/s3/probe', {});
    assert.equal(probe.status, 200);
    assert.equal(probe.data.key, 's3ClockSkew', 'D-88-17: the self-host trap is named');
    assert.equal(probe.data.ok, false);
    assert.ok(taskAuditRows(skewServer).some(r => r.action === 'backup_s3_probe_failed'));
  } finally {
    await skewServer.stop();
    skewSink.server.close();
  }

  /* Bad-creds sink: HEAD → 403 InvalidAccessKeyId (via the HEAD header). */
  const badSink = await startSink(() => ({
    HEAD: { status: 403, headers: { 'x-amz-error-code': 'InvalidAccessKeyId' } },
  }));
  const badServer = await startServer({ env: S3_ENV(`http://127.0.0.1:${badSink.port}`) });
  try {
    const op = await makeBackupOp(badServer, 'op-probe-bad@test.local');
    const probe = await op.post('/api/backup/s3/probe', {});
    assert.equal(probe.status, 200);
    assert.equal(probe.data.key, 'badCreds');
  } finally {
    await badServer.stop();
    badSink.server.close();
  }

  /* Funnel discipline: a non-operator gets the audited 403 BEFORE any probe. */
  const gateSink = await startSink(() => ({}));
  const gateServer = await startServer({ env: S3_ENV(`http://127.0.0.1:${gateSink.port}`) });
  try {
    const plain = (await signup(gateServer.base, { name: 'Nobody', email: 'plain-probe@test.local' })).client;
    const refused = await plain.post('/api/backup/s3/probe', {});
    assert.equal(refused.status, 403);
    assert.equal(refused.data.code, 'backupManageRequired');
    assert.equal(gateSink.hits.length, 0, 'no bucket operation ran for a non-operator (T-88-06)');
    assert.ok(taskAuditRows(gateServer).some(r => r.action === 'backup_probe_refused:backupManageRequired'));
  } finally {
    await gateServer.stop();
    gateSink.server.close();
  }
});

test('5-locale parity: every 88-02 S3 key exists in all five catalogues', () => {
  const keys = [
    'err.s3NotConfigured',
    'err.invalidS3Enabled',
    'err.s3ClockSkew',
    'toast.s3ProbeSuccess',
    'toast.s3ProbeDeleteFailed',
    'toast.s3ProbeUnreachable',
    'toast.s3ProbeBadCreds',
    'toast.s3ProbeHttpWarning',
    'page.backup.statusUploadFailed',
    'page.backup.stageUploading',
    'page.backup.partsProgress',
  ];
  for (const loc of LOCALES) {
    const cat = readLocale(loc);
    for (const key of keys) {
      assert.ok(typeof cat[key] === 'string' && cat[key].length > 0, `${loc}.${key}`);
    }
  }
});

/* ---------- Phase 88 post-merge gate fix: probe-at-save wiring (SC-1) ----------
   The save path itself probes: create AND update with s3Enabled run the
   marker probe BEFORE the write. unreachable / badCreds / s3ClockSkew
   refuse keyed + audited; deleteFailed accepts with warning:true (D-88-15);
   ok accepts and the s3Probe result rides the JSON response. */
test('probe-at-save (SC-1): unreachable/badCreds/s3ClockSkew refuse the save keyed+audited, deleteFailed accepts with warning, ok accepts with s3Probe', async () => {
  /* Clock-skew sink: HEAD → 403 RequestTimeTooSkewed (SC-3/D-88-17). */
  const skewSink = await startSink(() => ({
    HEAD: { status: 403, headers: { 'x-amz-error-code': 'RequestTimeTooSkewed' } },
  }));
  const skewServer = await startServer({ env: S3_ENV(`http://127.0.0.1:${skewSink.port}`) });
  try {
    const op = await makeBackupOp(skewServer, 'op-save-skew@test.local');
    const created = await op.post('/api/backup/tasks', { name: 'Skew task', scope: { kind: 'instance' }, cron: '30 2 * * *', s3Enabled: true });
    assert.equal(created.status, 400, `create: ${JSON.stringify(created.data)}`);
    assert.equal(created.data.code, 's3ClockSkew', 'D-88-17: the self-host trap names the refusal');
    assert.ok(taskAuditRows(skewServer).some(r => r.action === 'backup_task_refused:s3Probe:s3ClockSkew'), 'refusal audited');
    const listed = await op.get('/api/backup/tasks');
    assert.ok(!listed.data.tasks.some(t => t.name === 'Skew task'), 'the refused create wrote no row');

    /* Edit path: the same refusal keyed the same way. */
    const plain = await op.post('/api/backup/tasks', { name: 'Skew edit', scope: { kind: 'instance' }, cron: '30 2 * * *' });
    assert.equal(plain.status, 200);
    const edited = await op.put(`/api/backup/tasks/${plain.data.task.id}`, { s3Enabled: true });
    assert.equal(edited.status, 400);
    assert.equal(edited.data.code, 's3ClockSkew');
    const after = await op.get('/api/backup/tasks');
    assert.equal(after.data.tasks.find(t => t.id === plain.data.task.id).s3_enabled, 0, 'the refused edit kept the stored opt-in');
  } finally {
    await skewServer.stop();
    skewSink.server.close();
  }

  /* Bad-creds sink: the same funnel, a different key. */
  const badSink = await startSink(() => ({
    HEAD: { status: 403, headers: { 'x-amz-error-code': 'InvalidAccessKeyId' } },
  }));
  const badServer = await startServer({ env: S3_ENV(`http://127.0.0.1:${badSink.port}`) });
  try {
    const op = await makeBackupOp(badServer, 'op-save-bad@test.local');
    const created = await op.post('/api/backup/tasks', { name: 'Bad task', scope: { kind: 'instance' }, cron: '30 2 * * *', s3Enabled: true });
    assert.equal(created.status, 400);
    assert.equal(created.data.code, 'badCreds');
    assert.ok(taskAuditRows(badServer).some(r => r.action === 'backup_task_refused:s3Probe:badCreds'));
  } finally {
    await badServer.stop();
    badSink.server.close();
  }

  /* Unreachable sink: a CLOSED port — probeS3 reports `unreachable` with the
     sliced error text (never the refusal message the save would carry). */
  const deadSink = await startSink(() => ({}));
  const deadPort = deadSink.port;
  deadSink.server.close();
  const deadServer = await startServer({ env: S3_ENV(`http://127.0.0.1:${deadPort}`) });
  try {
    const op = await makeBackupOp(deadServer, 'op-save-unreach@test.local');
    const created = await op.post('/api/backup/tasks', { name: 'Unreach task', scope: { kind: 'instance' }, cron: '30 2 * * *', s3Enabled: true });
    assert.equal(created.status, 400);
    assert.equal(created.data.code, 'unreachable');
    assert.ok(taskAuditRows(deadServer).some(r => r.action === 'backup_task_refused:s3Probe:unreachable'));
  } finally {
    await deadServer.stop();
  }

  /* deleteFailed sink: HEAD 200, PUT 200, DELETE 403 — D-88-15: the WRITE
     path (the one uploads use) is proven, so the save ACCEPTS with the
     warning-carrying probe result in the response. */
  const delSink = await startSink(() => ({
    DELETE: { status: 403, headers: { 'x-amz-error-code': 'AccessDenied' } },
  }));
  const delServer = await startServer({ env: S3_ENV(`http://127.0.0.1:${delSink.port}`) });
  try {
    const op = await makeBackupOp(delServer, 'op-save-delfail@test.local');
    const created = await op.post('/api/backup/tasks', { name: 'DelFail task', scope: { kind: 'instance' }, cron: '30 2 * * *', s3Enabled: true });
    assert.equal(created.status, 200, `create: ${JSON.stringify(created.data)}`);
    assert.equal(created.data.s3Probe.key, 'deleteFailed');
    assert.equal(created.data.s3Probe.warning, true, 'deleteFailed carries warning:true (D-88-15)');
    assert.equal(created.data.s3Probe.ok, false);
    assert.equal(created.data.task.s3_enabled, 1, 'the warned save persisted the opt-in');

    /* The ok path on edit: HEAD/PUT/DELETE all 200 → s3Probe.key 'success'. */
    const edited = await op.put(`/api/backup/tasks/${created.data.task.id}`, { s3Enabled: false });
    assert.equal(edited.status, 200);
    assert.ok(!edited.data.s3Probe, 'a save that leaves S3 off does not probe');
  } finally {
    await delServer.stop();
    delSink.server.close();
  }

  /* Full success sink: both create and edit carry the success probe. */
  const okSink = await startSink(() => ({}));
  const okServer = await startServer({ env: S3_ENV(`http://127.0.0.1:${okSink.port}`) });
  try {
    const op = await makeBackupOp(okServer, 'op-save-ok@test.local');
    const created = await op.post('/api/backup/tasks', { name: 'Ok task', scope: { kind: 'instance' }, cron: '30 2 * * *', s3Enabled: true });
    assert.equal(created.status, 200);
    assert.equal(created.data.s3Probe.ok, true);
    assert.equal(created.data.s3Probe.key, 'success');
    const edited = await op.put(`/api/backup/tasks/${created.data.task.id}`, { s3Enabled: true });
    assert.equal(edited.status, 200);
    assert.equal(edited.data.s3Probe.key, 'success');
  } finally {
    await okServer.stop();
    okSink.server.close();
  }
});

/* =====================================================================
   88-03: upload_failed rides the D-15/D-17 transition-email gate (D-88-3).
   A real spawned server with the S3_* env pair pointed at a failing sink:
   fire 1 → upload_failed row + failure email; fire 2 (sink heals) →
   succeeded + recovery email. handleBackupTaskOutcome itself is UNTOUCHED
   — this pins the ride end-to-end. ---- */

function startS3RideSink() {
  const state = { objects: new Map(), fail: true };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://sink');
    req.socket.on('error', () => {}); // RST when the child dies at teardown must not crash the test process
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      if (req.method === 'POST' && url.searchParams.has('uploads')) return res.writeHead(200).end('<InitiateMultipartUploadResult><UploadId>u1</UploadId></InitiateMultipartUploadResult>');
      if (req.method === 'POST' && url.searchParams.has('uploadId')) return res.writeHead(200).end('<CompleteMultipartUploadResult></CompleteMultipartUploadResult>');
      if (req.method === 'PUT' && url.searchParams.has('uploadId')) return res.writeHead(200, { etag: '"p"' }).end();
      if (req.method === 'PUT') {
        /* The SC-1 marker probe (projects-studio-probe/) must SUCCEED at save time —
           the `fail` gate simulates upload-PUT failures only. */
        if (url.pathname.includes('projects-studio-probe/')) return res.writeHead(200).end();
        if (state.fail) return res.writeHead(503, { 'content-type': 'application/xml' }).end('<?xml version="1.0"?><Error><Code>ServiceUnavailable</Code></Error>');
        state.objects.set(decodeURIComponent(url.pathname.replace(/^\/projects-studio\/?/, '')), Buffer.concat(chunks));
        return res.writeHead(200).end();
      }
      if (req.method === 'GET') {
        const key = decodeURIComponent(url.pathname.replace(/^\/projects-studio\/?/, ''));
        const obj = state.objects.get(key) || (state.fail ? null : Buffer.from('unverified-stub'));
        if (!obj) return res.writeHead(404).end();
        return res.writeHead(200).end(obj);
      }
      if (req.method === 'HEAD') return res.writeHead(200, { etag: '"h"' }).end();
      if (req.method === 'DELETE') return res.writeHead(204).end();
      res.writeHead(400).end();
    });
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, state }));
  });
}

/* Minimal SMTP catcher — every delivery is recorded as raw DATA text.
   Assertions ride SMTP delivery (not outbox rows) because the delivery
   pass runs inside the child server's DB universe, immune to the
   withDb/live-server WAL divergence documented below. */
function startSmtpCatcher() {
  const msgs = [];
  const state = { next: null };
  const server = net.createServer(socket => {
    socket.on('error', () => {}); // child-side RST at teardown is teardown noise
    let phase = 'cmd';
    let data = '';
    socket.on('data', chunk => {
      data += chunk.toString('utf8');
      for (;;) {
        if (phase === 'cmd') {
          const nl = data.indexOf('\r\n');
          if (nl < 0) return;
          const line = data.slice(0, nl);
          data = data.slice(nl + 2);
          if (/^DATA$/i.test(line)) { phase = 'data'; socket.write('354 go\r\n'); }
          else if (/^QUIT/i.test(line)) { socket.write('221 bye\r\n'); socket.end(); return; }
          else socket.write('250 ok\r\n');
        } else {
          const end = data.indexOf('\r\n.\r\n');
          if (end < 0) return;
          msgs.push(data.slice(0, end).replaceAll('\r\n..', '\r\n.'));
          data = data.slice(end + 5);
          phase = 'cmd';
          socket.write('250 queued\r\n');
        }
      }
    });
    socket.write('220 catcher\r\n');
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, msgs, state })));
}
async function waitForSmtp(msgs, count, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (msgs.length < count) {
    if (Date.now() > deadline) throw new Error(`smtp catcher got ${msgs.length}/${count} messages`);
    await sleep(100);
  }
  return msgs;
}

const S3_RIDE_ENV = (s3Port, smtpPort) => ({
  BACKUP_TEST_TOKEN: S3_RIDE_TOKEN,
  S3_ENDPOINT: `http://127.0.0.1:${s3Port}`,
  S3_BUCKET: 'projects-studio',
  S3_ACCESS_KEY_ID: 'projects-studiotest',
  S3_SECRET_KEY: 'projects-studiotest-secret',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: String(smtpPort), // SMTP catcher — delivery itself is the D-17/D-88-3 assertion
  SMTP_REQUIRE_TLS: 'false',
  MAIL_FROM: 'noreply@test.local',
  APP_URL: 'http://127.0.0.1:1',
});

/* Run-status polling goes through the API (the CHILD's authoritative view).
   Direct withDb reads against a live WAL server diverge: the test-side
   connection's close deletes the server's -wal (SQLite's last-connection
   heuristic is per-file-lock, and the server's idle connection holds none),
   so the server's post-close commits land in an orphaned -wal until the
   next run's snapshot fence (wal_checkpoint truncate) flushes them back.
   The API view never diverges. */
async function waitApiRun(op, taskId, status, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await op.get(`/api/backup/runs?taskId=${taskId}`);
    assert.equal(res.status, 200, `runs api: ${res.status}`);
    const row = res.data.runs.find(r => r.status === status);
    if (row) return row;
    if (Date.now() > deadline) throw new Error(`no ${status} run appeared (statuses: ${res.data.runs.map(r => r.status).join(',')})`);
    await sleep(100);
  }
}
/* Force the task due via direct write, then fire exactly one sweep pass. */
const fireNow = (srv, taskId) => {
  const nowMs = Date.now();
  withDb(srv.dbPath, db => db.prepare('update backup_tasks set next_run_at = ? where id = ?').run(nowMs - 60_000, taskId));
  return schedulerPass(srv, nowMs);
};

test('88-03: upload_failed enters as a FAILED outcome (failure email), later success recovers (recovery email) — D-88-3', async () => {
  const sink = await startS3RideSink();
  const smtp = await startSmtpCatcher();
  const server = await startServer({ env: { ...S3_RIDE_ENV(sink.port, smtp.port) } });
  try {
    const op = await makeBackupOp(server, 'op-s3ride@test.local');
    const created = await op.post('/api/backup/tasks', { name: 'S3 ride', scope: { kind: 'instance' }, cron: '30 2 * * *', s3Enabled: true });
    assert.equal(created.status, 200, `create: ${JSON.stringify(created.data)}`);
    const taskId = created.data.task.id;
    assert.equal(taskRow(server, taskId).s3_enabled, 1, 'task opted into S3');

    // FIRE 1 — sink 503s every object PUT → local publish ok, upload fails
    await fireNow(server, taskId);
    const failedRow = await waitApiRun(op, taskId, 'upload_failed');
    assert.ok(failedRow.filename, 'upload_failed row carries the local filename (archive kept)');
    assert.ok(failedRow.sha256, 'upload_failed row carries the archive hash');
    assert.ok(failedRow.error && failedRow.error.length <= 300, 'sliced upload error in the row');

    // FIRE 2 — sink heals → succeeded; recovery transition
    sink.state.fail = false;
    await fireNow(server, taskId);
    const okRow = await waitApiRun(op, taskId, 'succeeded');

    /* FIRE 3+ — none: the email gate is asserted via SMTP DELIVERY (immune
       to the withDb/live-server WAL divergence — the delivery pass runs in
       the child server's universe). The D-88-3 ride: failure email on
       entering upload_failed, recovery email on the later success. */
    const deliveries = await waitForSmtp(smtp.msgs, 4, 30_000); // one failure + one recovery email per recipient (2 recipients)
    const subjects = deliveries.map(d => {
      const m = d.match(/^Subject: (.*)$/m);
      return m ? m[1] : '';
    });
    assert.ok(subjects.some(s => s.startsWith('Backup failed:')), `failure email delivered (got: ${JSON.stringify(subjects)})`);
    assert.ok(subjects.some(s => s.startsWith('Backup recovered:')), `recovery email delivered (got: ${JSON.stringify(subjects)})`);
    assert.ok(deliveries.some(d => d.includes('S3 ride')), 'alert names the task');
    // the uploaded object exists in the sink and its sidecar matches the row hash
    const keys = [...sink.state.objects.keys()];
    const objKey = keys.find(k => k.startsWith(`backup-task-${taskId}/`) && !k.endsWith('.sha256'));
    assert.ok(objKey, 'task-run object uploaded under the D-88-6 prefix');
    assert.ok(sink.state.objects.get(`${objKey}.sha256`).toString('utf8').startsWith(okRow.sha256), 'sidecar hash matches the run row (D-88-8)');
  } finally {
    await server.stop();
    for (const s of [sink.server, smtp.server]) {
      s.closeAllConnections?.();
      await new Promise(res => s.close(res));
    }
  }
});