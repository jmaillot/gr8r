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

test('GET /api/backup/scopes: 401 unauthenticated; 403 fail-closed for a roleless user', async () => {
  const server = await startServer({});
  try {
    const anon = await fetch(`${server.base}/api/backup/scopes`);
    assert.equal(anon.status, 401, `unauthenticated → 401, got ${anon.status}`);
    const joined = await signup(server.base, { name: 'Plain', email: 'plain-scopes@test.local' });
    assert.equal(joined.status, 201);
    const plain = (await login(server.base, 'plain-scopes@test.local', 'password-1234')).client;
    const res = await plain.get('/api/backup/scopes');
    assert.equal(res.status, 403, `roleless → 403, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'backupRoleRequired');
  } finally {
    await server.stop();
  }
});

for (const role of ['backup_operator', 'restore_operator']) {
  test(`GET /api/backup/scopes: ${role} gets 200 with the exact minimal payload { workspaces: [{id,name,slug,projects}] }`, async () => {
    const server = await startServer({});
    try {
      const op = await grantRole(server, `op-scopes-${role}@test.local`, role);
      const ws = withDb(server.dbPath, db => db.prepare('select id, name, slug from workspaces limit 1').get());
      // an archived workspace must be excluded
      withDb(server.dbPath, db => db.prepare('insert into workspaces (id, slug, name, doc, revision, created_at, updated_at, archived) values (?,?,?,?,?,?,?,1)').run('ws-arch', 'arch', 'Archived', '{}', 1, Date.now(), Date.now()));
      const res = await op.get('/api/backup/scopes');
      assert.equal(res.status, 200, `${role}: ${JSON.stringify(res.data)}`);
      assert.ok(Array.isArray(res.data.workspaces), 'workspaces array');
      assert.equal(res.data.workspaces.length, 1, 'the archived workspace is excluded');
      const entry = res.data.workspaces[0];
      // 95-05: STRICT shape grows additively — only id/name/slug/projects keys
      assert.deepEqual(Object.keys(entry).sort(), ['id', 'name', 'projects', 'slug'], 'STRICT shape: only id/name/slug/projects keys');
      assert.ok(Array.isArray(entry.projects), 'projects array present');
      assert.deepEqual(Object.keys(res.data).sort(), ['workspaces'], 'no role echo, no extras');
    } finally {
      await server.stop();
    }
  });
}

test('GET /api/backup/scopes: projects entries carry exactly {id, name} from the live doc', async () => {
  const server = await startServer({});
  try {
    const op = await grantRole(server, `op-scopes-proj@test.local`, 'backup_operator');
    const ws = withDb(server.dbPath, db => db.prepare('select id from workspaces limit 1').get());
    withDb(server.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify({ data: { projects: [{ id: 'p1', name: 'Alpha', extra: 'drop-me' }, { id: 'p2' }] } }), ws.id));
    const res = await op.get('/api/backup/scopes');
    assert.equal(res.status, 200);
    const entry = res.data.workspaces.find(w => w.id === ws.id);
    assert.deepEqual(entry.projects, [{ id: 'p1', name: 'Alpha' }, { id: 'p2', name: 'p2' }], 'live doc projects, name falls back to id, extra keys dropped');
  } finally {
    await server.stop();
  }
});

test('GET /api/backup/scopes: a workspace with zero projects carries projects: []', async () => {
  const server = await startServer({});
  try {
    const op = await grantRole(server, `op-scopes-empty@test.local`, 'backup_operator');
    const res = await op.get('/api/backup/scopes');
    assert.equal(res.status, 200);
    for (const w of res.data.workspaces) assert.deepEqual(w.projects, [], 'empty projects array, never undefined');
  } finally {
    await server.stop();
  }
});

test('GET /api/backup/scopes: Super Admin passes the gate too', async () => {
  const server = await startServer({});
  try {
    const admin = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const res = await admin.get('/api/backup/scopes');
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.ok(Array.isArray(res.data.workspaces) && res.data.workspaces.length >= 1);
    assert.deepEqual(Object.keys(res.data.workspaces[0]).sort(), ['id', 'name', 'projects', 'slug']);
  } finally {
    await server.stop();
  }
});
