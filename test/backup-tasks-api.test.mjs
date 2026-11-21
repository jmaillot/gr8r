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

/* ---------- 5-locale refusal catalogue (T-86-06 house rule) ---------- */

test('every 87-01 refusal key emitted by POST exists in all five locale catalogues', () => {
  const keys = ['invalidSchedule', 'invalidTimezone', 'invalidScope', 'invalidRetention', 'taskNameRequired'];
  for (const loc of LOCALES) {
    const cat = readLocale(loc);
    for (const key of keys) {
      assert.ok(cat['err.' + key] && typeof cat['err.' + key] === 'string' && cat['err.' + key].length > 0, `${loc}.err.${key}`);
    }
  }
});
