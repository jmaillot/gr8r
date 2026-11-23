/* =====================================================================
   Phase 92 Wave-0 scaffold (D-06) — GET /api/backup/scopes.

   Wave-0: the route does not exist yet, so this suite pins its ABSENCE
   (404, fail-closed) and carries the operator-grant harness the Task-8
   assertions will flip onto: the three gate roles (Super Admin /
   Backup Operator / Restore Operator) via the Phase 85 grant route, in
   the backup-rotation.test.mjs makeBackupOp idiom.
   ===================================================================== */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADMIN, login, signup, startServer, withDb } from './helpers/server.mjs';

const userIdByEmail = (srv, email) => withDb(srv.dbPath, db => db.prepare('select id from users where email = ?').get(email).id);

async function grantRole(server, email, role) {
  const joined = await signup(server.base, { name: 'Op', email });
  assert.equal(joined.status, 201, `signup ${email}: ${JSON.stringify(joined.data)}`);
  const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
  const grant = await operator.post('/api/auth/operator/instance-roles', { userId: userIdByEmail(server, email), role });
  assert.equal(grant.status, 200, `grant ${role}: ${JSON.stringify(grant.data)}`);
  return (await login(server.base, email, 'password-1234')).client;
}

const makeBackupOp = (server, email) => grantRole(server, email, 'backup_operator');

test('scaffold: GET /api/backup/scopes is not mounted yet (404 — flips to real assertions when the route lands)', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-scopes@test.local');
    const res = await op.get('/api/backup/scopes');
    assert.equal(res.status, 404, `expected 404 pre-implementation, got ${res.status}: ${JSON.stringify(res.data)}`);
  } finally {
    await server.stop();
  }
});
