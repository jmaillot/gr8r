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

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = ['en', 'fr', 'es', 'de', 'nl'];
const readLocale = loc => JSON.parse(fs.readFileSync(path.join(REPO, 'src/locales', loc + '.json'), 'utf8'));

const taskAuditRows = srv =>
  withDb(srv.dbPath, db => db.prepare("select * from audit_log where action like 'backup_task%' order by created_at, id").all());
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
