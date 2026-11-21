/* =====================================================================
   Instance-roles API suite (Phase 85, plans 85-01).

   Pins the Super-Admin-only POST /api/auth/operator/instance-roles grant
   route over the roles.js core, the D-19/D-24 /api/backup/tasks stub GET,
   and the D-23/D-25 userPayload capability flags:
   - the MANDATE gate order (sameOrigin → requireUser → throttle →
     isInstanceAdmin BEFORE any target lookup — T-85-02/T-80-04: no
     403-vs-400 existence oracle);
   - the keyed refusals (bad role / Super-Admin target / duplicate) with
     NOTHING stored on any refusal;
   - the audited success path (grant row + audit_log row, D-18);
   - the gated stub GET (holder flags + [], non-holder keyed 403).
   Pattern: test/groups-config-api.test.mjs — startServer-per-case with the
   shared harness, withDb for direct row inspection, BASE_ENV stamps the
   operator (ADMIN_EMAIL). Task 3 (85-01) extends this file with the full
   D-36 e2e set; it stays the phase's regression harness.
   ===================================================================== */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADMIN, client, login, signup, startServer, withDb } from './helpers/server.mjs';

const roleRows = srv => withDb(srv.dbPath, db => db.prepare('select * from instance_roles order by granted_at, id').all());
const auditRows = srv => withDb(srv.dbPath, db => db.prepare("select * from audit_log where action like 'instance_role_%' order by created_at, id").all());
const userIdByEmail = (srv, email) => withDb(srv.dbPath, db => db.prepare('select id from users where email = ?').get(email).id);

async function makeUser(srv, name, email) {
  const joined = await signup(srv.base, { name, email });
  assert.equal(joined.status, 201, `signup ${email}: ${JSON.stringify(joined.data)}`);
  return joined.client;
}

/* ---------- the operator gate (T-85-02, D-16) ---------- */

test('unauthenticated POST → 401 before any probing (no oracle)', async () => {
  const server = await startServer({});
  try {
    const anon = client(server.base, 'anon');
    // an invalid body and a fully valid body must be indistinguishable to a
    // caller the gate has not passed — same status, same keyed refusal.
    const badRole = await anon.post('/api/auth/operator/instance-roles', { userId: 'whatever', role: 'not-a-role' });
    const valid = await anon.post('/api/auth/operator/instance-roles', { userId: '00000000-0000-0000-0000-000000000000', role: 'backup_operator' });
    assert.equal(badRole.status, 401, `expected 401, got ${badRole.status}: ${JSON.stringify(badRole.data)}`);
    assert.equal(valid.status, 401);
    assert.deepEqual({ status: valid.status, code: valid.data.code }, { status: badRole.status, code: badRole.data.code });
    assert.equal(roleRows(server).length, 0);
  } finally {
    await server.stop();
  }
});

test('cross-origin POST with a valid session → 403 crossOriginRejected (sameOrigin runs FIRST)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const cookie = operator.cookie();
    assert.ok(cookie, 'the operator session cookie is present');
    const res = await fetch(`${server.base}/api/auth/operator/instance-roles`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ userId: '00000000-0000-0000-0000-000000000000', role: 'backup_operator' }),
    });
    assert.equal(res.status, 403, `expected 403, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.code, 'crossOriginRejected');
    assert.equal(roleRows(server).length, 0);
  } finally {
    await server.stop();
  }
});

test('non-operator authenticated POST → EXACT 403 operatorOnly regardless of body validity (no 403-vs-400 oracle)', async () => {
  const server = await startServer({});
  try {
    const joined = await makeUser(server, 'Plain User', 'plain@test.local');
    for (const body of [
      { userId: 'whatever', role: 'not-a-role' }, // invalid body
      { userId: '00000000-0000-0000-0000-000000000000', role: 'backup_operator' }, // fully valid shape
    ]) {
      const res = await joined.post('/api/auth/operator/instance-roles', body);
      assert.equal(res.status, 403, `expected 403, got ${res.status}: ${JSON.stringify(res.data)}`);
      assert.equal(res.data.code, 'operatorOnly', 'the same keyed refusal for an invalid and a valid body — validity is never probed');
      assert.deepEqual(Object.keys(res.data).sort(), ['code', 'error']);
    }
    assert.equal(roleRows(server).length, 0);
  } finally {
    await server.stop();
  }
});

/* ---------- the keyed refusals (D-01/D-05/D-08) ---------- */

test('operator refusal: bad role tokens ride the roles.js funnel — nothing stored (D-01)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    for (const role of ['Backup_Operator', 'restore', '', 'owner', null]) {
      const res = await operator.post('/api/auth/operator/instance-roles', { userId: '00000000-0000-0000-0000-000000000000', role });
      assert.equal(res.status, 400, `role ${JSON.stringify(role)} must refuse`);
      assert.equal(res.data.code, 'instanceRoleBadRole', `role ${JSON.stringify(role)} carries the role code`);
    }
    assert.equal(roleRows(server).length, 0);
  } finally {
    await server.stop();
  }
});

test('operator refusals: unknown target, Super-Admin target (D-05), duplicate (D-08) — nothing extra stored', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    await makeUser(server, 'Grantee', 'grantee@test.local');
    const granteeId = userIdByEmail(server, 'grantee@test.local');

    const unknown = await operator.post('/api/auth/operator/instance-roles', { userId: '00000000-0000-0000-0000-000000000000', role: 'backup_operator' });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.data.code, 'notFound');

    // D-05: the operator IS a Super Admin — granting to them is refused.
    const selfGrant = await operator.post('/api/auth/operator/instance-roles', { userId: userIdByEmail(server, ADMIN.email), role: 'backup_operator' });
    assert.equal(selfGrant.status, 400);
    assert.equal(selfGrant.data.code, 'instanceRoleAdminImplicit');

    const first = await operator.post('/api/auth/operator/instance-roles', { userId: granteeId, role: 'backup_operator' });
    assert.equal(first.status, 200, `first grant must succeed: ${JSON.stringify(first.data)}`);
    const duplicate = await operator.post('/api/auth/operator/instance-roles', { userId: granteeId, role: 'backup_operator' });
    assert.equal(duplicate.status, 400);
    assert.equal(duplicate.data.code, 'instanceRoleDuplicate');

    // exactly ONE row (the successful first grant), nothing from the refusals
    assert.equal(roleRows(server).length, 1);
  } finally {
    await server.stop();
  }
});

/* ---------- the audited success path (D-18, BKROLE-03) ---------- */

test('grant writes the instance_roles row (granted_by/granted_at) and the audit_log row in the same commit', async () => {
  const server = await startServer({});
  try {
    await makeUser(server, 'Grantee', 'grantee@test.local');
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const granteeId = userIdByEmail(server, 'grantee@test.local');
    const res = await operator.post('/api/auth/operator/instance-roles', { userId: granteeId, role: 'restore_operator' });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.role.role, 'restore_operator');

    const rows = roleRows(server);
    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.deepEqual(
      { user_id: row.user_id, role: row.role, granted_by: row.granted_by },
      { user_id: granteeId, role: 'restore_operator', granted_by: userIdByEmail(server, ADMIN.email) },
    );
    assert.ok(typeof row.granted_at === 'number' && row.granted_at > 0, 'granted_at is a real epoch-ms stamp');

    const audits = auditRows(server);
    assert.equal(audits.length, 1, 'exactly one audit row for the grant (BKROLE-03)');
    assert.equal(audits[0].action, 'instance_role_granted:restore_operator');
    assert.equal(audits[0].actor_id, userIdByEmail(server, ADMIN.email));
    assert.equal(audits[0].target_id, granteeId);
    assert.equal(audits[0].target_email, 'grantee@test.local');
  } finally {
    await server.stop();
  }
});

test('a user may hold BOTH roles as two rows (D-02); the other role stays grantable after a duplicate', async () => {
  const server = await startServer({});
  try {
    await makeUser(server, 'Grantee', 'grantee@test.local');
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const granteeId = userIdByEmail(server, 'grantee@test.local');
    assert.equal((await operator.post('/api/auth/operator/instance-roles', { userId: granteeId, role: 'backup_operator' })).status, 200);
    const dup = await operator.post('/api/auth/operator/instance-roles', { userId: granteeId, role: 'backup_operator' });
    assert.equal(dup.status, 400);
    assert.equal(dup.data.code, 'instanceRoleDuplicate');
    const second = await operator.post('/api/auth/operator/instance-roles', { userId: granteeId, role: 'restore_operator' });
    assert.equal(second.status, 200, 'the other role is grantable beside the duplicate refusal');
    assert.equal(roleRows(server).length, 2);
  } finally {
    await server.stop();
  }
});

/* ---------- the gated stub GET /api/backup/tasks (D-19/D-24/D-26) ---------- */

test('GET /api/backup/tasks: unauthenticated 401; non-holder keyed 403; Backup Operator gets flags + []', async () => {
  const server = await startServer({});
  try {
    const anon = client(server.base, 'anon');
    assert.equal((await anon.get('/api/backup/tasks')).status, 401);

    await makeUser(server, 'Plain', 'plain@test.local');
    await makeUser(server, 'Backup Op', 'backupop@test.local');
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const backupOpId = userIdByEmail(server, 'backupop@test.local');
    assert.equal((await operator.post('/api/auth/operator/instance-roles', { userId: backupOpId, role: 'backup_operator' })).status, 200);

    const plain = (await login(server.base, 'plain@test.local', 'password-1234')).client;
    const refused = await plain.get('/api/backup/tasks');
    assert.equal(refused.status, 403);
    assert.equal(refused.data.code, 'backupRoleRequired');
    assert.deepEqual(Object.keys(refused.data).sort(), ['code', 'error']);

    const holder = (await login(server.base, 'backupop@test.local', 'password-1234')).client;
    const ok = await holder.get('/api/backup/tasks');
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.data, { tasks: [], canBackup: true, canRestore: false });
  } finally {
    await server.stop();
  }
});

test('GET /api/backup/tasks: Restore Operator sees the ONE shared surface with canRestore only (D-22)', async () => {
  const server = await startServer({});
  try {
    await makeUser(server, 'Restore Op', 'restoreop@test.local');
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    assert.equal((await operator.post('/api/auth/operator/instance-roles', { userId: userIdByEmail(server, 'restoreop@test.local'), role: 'restore_operator' })).status, 200);
    const holder = (await login(server.base, 'restoreop@test.local', 'password-1234')).client;
    const ok = await holder.get('/api/backup/tasks');
    assert.deepEqual(ok.data, { tasks: [], canBackup: false, canRestore: true });
  } finally {
    await server.stop();
  }
});

test('GET /api/backup/tasks: Super Admin holds both flags implicitly with ZERO rows (D-12)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const ok = await operator.get('/api/backup/tasks');
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.data, { tasks: [], canBackup: true, canRestore: true });
    assert.equal(roleRows(server).length, 0, 'no instance_roles row for the implicit Super Admin');
  } finally {
    await server.stop();
  }
});

/* ---------- revoke + the task-edit stub refusal (D-17/D-18/D-19) ---------- */

test('revoke: DELETE removes the row and writes the instance_role_revoked audit row (BKROLE-03)', async () => {
  const server = await startServer({});
  try {
    await makeUser(server, 'Grantee', 'grantee@test.local');
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const granteeId = userIdByEmail(server, 'grantee@test.local');
    assert.equal((await operator.post('/api/auth/operator/instance-roles', { userId: granteeId, role: 'restore_operator' })).status, 200);
    const row = roleRows(server).find(r => r.user_id === granteeId);
    assert.ok(row, 'the grantee row exists');

    // revoke is Super-Admin-only: a Backup Operator cannot revoke (D-17).
    await makeUser(server, 'Backup Op', 'backupop@test.local');
    await operator.post('/api/auth/operator/instance-roles', { userId: userIdByEmail(server, 'backupop@test.local'), role: 'backup_operator' });
    const backupOp = (await login(server.base, 'backupop@test.local', 'password-1234')).client;
    const denied = await backupOp.del(`/api/auth/operator/instance-roles/${row.id}`);
    assert.equal(denied.status, 403);
    assert.equal(denied.data.code, 'operatorOnly', 'Backup Operators can never grant or revoke roles (D-17)');

    const del = await operator.del(`/api/auth/operator/instance-roles/${row.id}`);
    assert.equal(del.status, 200, JSON.stringify(del.data));
    const remaining = roleRows(server);
    assert.equal(remaining.length, 1, 'only the revoked row is gone (the backup-op grant stays)');
    assert.equal(remaining[0].user_id, userIdByEmail(server, 'backupop@test.local'));
    const audits = auditRows(server);
    assert.equal(audits.length, 3, 'two grants + one revoke audit row');
    assert.equal(audits[2].action, 'instance_role_revoked:restore_operator');
    assert.equal(audits[2].target_id, granteeId);

    const gone = await operator.del(`/api/auth/operator/instance-roles/${row.id}`);
    assert.equal(gone.status, 404, 'revoking an already-revoked id is a plain 404');
  } finally {
    await server.stop();
  }
});

test('POST /api/backup/tasks: Restore Operator gets the keyed backupManageRequired refusal; holder creates a task (D-19, live since 87-01)', async () => {
  const server = await startServer({});
  try {
    await makeUser(server, 'Restore Op', 'restoreop@test.local');
    await makeUser(server, 'Backup Op', 'backupop@test.local');
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    await operator.post('/api/auth/operator/instance-roles', { userId: userIdByEmail(server, 'restoreop@test.local'), role: 'restore_operator' });
    await operator.post('/api/auth/operator/instance-roles', { userId: userIdByEmail(server, 'backupop@test.local'), role: 'backup_operator' });

    const restoreOp = (await login(server.base, 'restoreop@test.local', 'password-1234')).client;
    const refused = await restoreOp.post('/api/backup/tasks', { name: 'nightly' });
    assert.equal(refused.status, 403, `expected 403, got ${refused.status}: ${JSON.stringify(refused.data)}`);
    assert.equal(refused.data.code, 'backupManageRequired', 'the task-edit refusal path is REAL (BKROLE-02, D-19)');

    const backupOp = (await login(server.base, 'backupop@test.local', 'password-1234')).client;
    /* Superseded by 87-01: the holder path creates a real task now (the old
       backupNotConfigured stub pin is inverted — see test/backup-routes.test.mjs).
       An invalid body still refuses keyed, proving the refusal path stays
       real without leaking role existence. */
    const invalid = await backupOp.post('/api/backup/tasks', { name: 'nightly' });
    assert.equal(invalid.status, 400, 'the holder reaches the real task validation');
    assert.equal(invalid.data.code, 'invalidSchedule', 'missing cron → keyed invalidSchedule (87-01)');
    assert.equal(roleRows(server).length, 2, 'no task logic ran — no side effects');
  } finally {
    await server.stop();
  }
});

/* ---------- D-36 e2e set: audit rollback + no-oracle discipline ---------- */

test('D-36: Backup Operator POST /api/auth/operator/instance-roles → 403 operatorOnly regardless of body (D-17)', async () => {
  const server = await startServer({});
  try {
    await makeUser(server, 'Backup Op', 'backupop@test.local');
    await makeUser(server, 'Target', 'target@test.local');
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    assert.equal((await operator.post('/api/auth/operator/instance-roles', { userId: userIdByEmail(server, 'backupop@test.local'), role: 'backup_operator' })).status, 200);
    const backupOp = (await login(server.base, 'backupop@test.local', 'password-1234')).client;
    for (const body of [
      { userId: 'whatever', role: 'not-a-role' },
      { userId: userIdByEmail(server, 'target@test.local'), role: 'restore_operator' },
    ]) {
      const res = await backupOp.post('/api/auth/operator/instance-roles', body);
      assert.equal(res.status, 403, `expected 403, got ${res.status}: ${JSON.stringify(res.data)}`);
      assert.equal(res.data.code, 'operatorOnly');
    }
    assert.equal(roleRows(server).length, 1, 'the operator grant stays; nothing from the refusals');
  } finally {
    await server.stop();
  }
});

test('D-36/BKROLE-03: forced audit failure rolls back the GRANT — no instance_roles row lands un-logged', async () => {
  const server = await startServer({});
  try {
    await makeUser(server, 'Grantee', 'grantee@test.local');
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const granteeId = userIdByEmail(server, 'grantee@test.local');
    withDb(server.dbPath, db => db.exec('drop table audit_log'));
    const res = await operator.post('/api/auth/operator/instance-roles', { userId: granteeId, role: 'backup_operator' });
    assert.ok(res.status >= 500, `audit failure surfaces as 5xx (got ${res.status})`);
    assert.equal(roleRows(server).length, 0, 'the grant INSERT was rolled back with the failed audit');
    withDb(server.dbPath, db => {
      db.exec(`create table if not exists audit_log (
        id            text primary key,
        actor_id      text,
        target_id     text,
        action        text not null,
        session_count integer not null,
        ip            text,
        workspace_id  text,
        actor_name    text not null,
        actor_email   text not null,
        target_name   text not null,
        target_email  text not null,
        created_at    integer not null
      )`);
    });
    const retry = await operator.post('/api/auth/operator/instance-roles', { userId: granteeId, role: 'backup_operator' });
    assert.equal(retry.status, 200, 'the grant succeeds once the audit funnel works again');
    assert.equal(auditRows(server).length, 1, 'the retried grant IS audited');
  } finally {
    await server.stop();
  }
});

test('D-36/BKROLE-03: forced audit failure rolls back the REVOKE — the row survives un-logged removal', async () => {
  const server = await startServer({});
  try {
    await makeUser(server, 'Grantee', 'grantee@test.local');
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const granteeId = userIdByEmail(server, 'grantee@test.local');
    assert.equal((await operator.post('/api/auth/operator/instance-roles', { userId: granteeId, role: 'restore_operator' })).status, 200);
    const row = roleRows(server).find(r => r.user_id === granteeId);
    withDb(server.dbPath, db => db.exec('drop table audit_log'));
    const res = await operator.del(`/api/auth/operator/instance-roles/${row.id}`);
    assert.ok(res.status >= 500, `audit failure surfaces as 5xx (got ${res.status})`);
    assert.equal(roleRows(server).length, 1, 'the DELETE was rolled back — the role row survives');
    withDb(server.dbPath, db => {
      db.exec(`create table if not exists audit_log (
        id            text primary key,
        actor_id      text,
        target_id     text,
        action        text not null,
        session_count integer not null,
        ip            text,
        workspace_id  text,
        actor_name    text not null,
        actor_email   text not null,
        target_name   text not null,
        target_email  text not null,
        created_at    integer not null
      )`);
    });
    const retry = await operator.del(`/api/auth/operator/instance-roles/${row.id}`);
    assert.equal(retry.status, 200, 'the revoke succeeds once the audit funnel works again');
    assert.equal(roleRows(server).length, 0, 'the retried revoke removed the row');
    assert.equal(auditRows(server).length, 1, 'the retried revoke IS audited');
  } finally {
    await server.stop();
  }
});

/* ---------- the payload capability flags (D-23/D-25) ---------- */


test('userPayload carries canBackup/canRestore computed per load (D-23); revocation drops the flag on next load (D-25)', async () => {
  const server = await startServer({});
  try {
    await makeUser(server, 'Grantee', 'grantee@test.local');
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const granteeId = userIdByEmail(server, 'grantee@test.local');

    const before = (await login(server.base, 'grantee@test.local', 'password-1234')).client;
    assert.equal((await before.get('/api/auth/me')).status, 200);
    let me = await before.get('/api/auth/me');
    assert.equal(me.data.user.canBackup, false, 'no flags before the grant');

    await operator.post('/api/auth/operator/instance-roles', { userId: granteeId, role: 'backup_operator' });
    me = await before.get('/api/auth/me');
    assert.equal(me.data.user.canBackup, true, 'the flag appears on the next payload load');
    assert.equal(me.data.user.canRestore, false);

    // Revoke via the DELETE route (D-25): the flag drops on the next load.
    const rows = roleRows(server);
    const del = await operator.del(`/api/auth/operator/instance-roles/${rows[0].id}`);
    assert.equal(del.status, 200, `revoke must succeed: ${JSON.stringify(del.data)}`);
    me = await before.get('/api/auth/me');
    assert.equal(me.data.user.canBackup, false, 'revocation applies on the next load — no cache (D-14/D-25)');
  } finally {
    await server.stop();
  }
});
