/* Governance rename suite (Phase 83, GV-01/02/03). Proves the operator
   rename route POST /api/auth/operator/workspaces/:id/rename, the on-read
   dead-mappings route GET /api/auth/operator/dead-mappings, and the D-15
   no-redirect pin for the old slug. Pattern: test/governance.test.mjs —
   startServer-per-case with the shared harness, withDb for direct row
   inspection, ADMIN stamps the operator (ADMIN_EMAIL). Non-operator
   refusals are EXACT 403 operatorOnly with no existence oracle. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADMIN, login, signup, startServer, withDb } from './helpers/server.mjs';

const wsRow = (srv, slug) => withDb(srv.dbPath, db => db.prepare('select * from workspaces where slug = ?').get(slug));

async function plainWorkspace(base, name, slug) {
  const joined = await signup(base, { name: `${name} Owner`, email: `${slug}-owner@test.local` });
  assert.equal(joined.status, 201, `signup must succeed: ${JSON.stringify(joined.data)}`);
  const created = await joined.client.post('/api/workspaces', { name });
  assert.equal(created.status, 201, `create must succeed: ${JSON.stringify(created.data)}`);
  return { owner: joined.client, ws: created.data.workspace };
}

/* ---------- GV-01: operator rename route ---------- */

test('operator rename with valid {name, slug} → 200, workspace payload, DB row updated', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const { ws } = await plainWorkspace(server.base, 'Old Name Co', 'old-name-co');

    const res = await operator.post(`/api/auth/operator/workspaces/${ws.id}/rename`, { name: 'New Name Co', slug: 'new-name-co' });
    assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.deepEqual(res.data.workspace, { id: ws.id, slug: 'new-name-co', name: 'New Name Co' });

    const row = wsRow(server, 'new-name-co');
    assert.ok(row, 'the DB row carries the new slug');
    assert.equal(row.name, 'New Name Co');
    assert.ok(!wsRow(server, 'old-name-co'), 'the old slug row is gone');
  } finally {
    await server.stop();
  }
});

test('empty/blank name → 400 workspaceNameRequired', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const { ws } = await plainWorkspace(server.base, 'Blank Co', 'blank-co');
    for (const name of ['', '   ']) {
      const res = await operator.post(`/api/auth/operator/workspaces/${ws.id}/rename`, { name, slug: ws.slug });
      assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(name)}, got ${res.status}`);
      assert.equal(res.data.code, 'workspaceNameRequired');
    }
  } finally {
    await server.stop();
  }
});

test('rule-violating slug → 400 invalidSlug', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const { ws } = await plainWorkspace(server.base, 'Bad Slug Co', 'bad-slug-co');
    for (const slug of ['x', '!!!']) {
      const res = await operator.post(`/api/auth/operator/workspaces/${ws.id}/rename`, { name: 'Bad Slug Co', slug });
      assert.equal(res.status, 400, `expected 400 for ${slug}, got ${res.status}: ${JSON.stringify(res.data)}`);
      assert.equal(res.data.code, 'invalidSlug');
    }
  } finally {
    await server.stop();
  }
});

test('reserved slug (api, login) → 400 invalidSlug', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const { ws } = await plainWorkspace(server.base, 'Reserved Co', 'reserved-co');
    for (const slug of ['api', 'login']) {
      const res = await operator.post(`/api/auth/operator/workspaces/${ws.id}/rename`, { name: 'Reserved Co', slug });
      assert.equal(res.status, 400, `expected 400 for ${slug}, got ${res.status}`);
      assert.equal(res.data.code, 'invalidSlug');
    }
  } finally {
    await server.stop();
  }
});

test('slug colliding with ANOTHER workspace case-insensitively → 409 slugTaken with a free suggestion', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    await plainWorkspace(server.base, 'Team A', 'team-a');
    const { ws: other } = await plainWorkspace(server.base, 'Other Co', 'other-co');

    const res = await operator.post(`/api/auth/operator/workspaces/${other.id}/rename`, { name: 'Other Co', slug: 'Team-A' });
    assert.equal(res.status, 409, `expected 409, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'slugTaken');
    const suggestion = res.data.data?.suggestion ?? res.data.suggestion;
    assert.ok(typeof suggestion === 'string' && suggestion.startsWith('team-a'), `suggestion present: ${JSON.stringify(res.data)}`);
    assert.ok(!wsRow(server, suggestion) || wsRow(server, suggestion).id === other.id, 'suggested slug is free');
  } finally {
    await server.stop();
  }
});

test("submitting the workspace's OWN current slug → 200 (self-collision excluded)", async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const { ws } = await plainWorkspace(server.base, 'Self Co', 'self-co');

    const res = await operator.post(`/api/auth/operator/workspaces/${ws.id}/rename`, { name: 'Self Co Renamed', slug: 'self-co' });
    assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.workspace.name, 'Self Co Renamed');
    assert.equal(res.data.workspace.slug, 'self-co');
  } finally {
    await server.stop();
  }
});

test('non-operator POST → exact 403 operatorOnly on a real id AND a fake id (no existence oracle)', async () => {
  const server = await startServer({});
  try {
    const joined = await signup(server.base, { name: 'Plain User', email: 'plain@test.local' });
    assert.equal(joined.status, 201);
    const { ws } = await plainWorkspace(server.base, 'Secret Co', 'secret-co');
    const fakeId = 'nonexistent0000000000000000000000';

    for (const id of [ws.id, fakeId]) {
      const res = await joined.client.post(`/api/auth/operator/workspaces/${id}/rename`, { name: 'X', slug: 'x-co' });
      assert.equal(res.status, 403, `expected 403 for ${id}, got ${res.status}`);
      assert.equal(res.data.code, 'operatorOnly');
    }
  } finally {
    await server.stop();
  }
});

test('cross-origin rename POST → 403 crossOriginRejected (sameOrigin runs FIRST, before body read/throttle)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const cookie = operator.cookie();
    const res = await fetch(`${server.base}/api/auth/operator/workspaces/whatever-id/rename`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ name: 'X', slug: 'x-co' }),
    });
    assert.equal(res.status, 403, `expected 403, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.code, 'crossOriginRejected');
  } finally {
    await server.stop();
  }
});

test('unauthenticated rename POST → auth refusal, no target information returned', async () => {
  const server = await startServer({});
  try {
    const { ws } = await plainWorkspace(server.base, 'Ghost Co', 'ghost-co');
    const res = await fetch(`${server.base}/api/auth/operator/workspaces/${ws.id}/rename`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: server.base },
      body: JSON.stringify({ name: 'Hijack', slug: 'hijack' }),
    });
    assert.equal(res.status, 401, `expected 401, got ${res.status}`);
    const data = await res.json();
    assert.ok(!JSON.stringify(data).includes(ws.id), 'no workspace id leaks to the unauthenticated caller');
    assert.ok(!JSON.stringify(data).includes('ghost-co'), 'no workspace slug leaks to the unauthenticated caller');
  } finally {
    await server.stop();
  }
});

test('rename does NOT write an audit_log row (D-06: logInfo only)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const { ws } = await plainWorkspace(server.base, 'Auditless Co', 'auditless-co');
    const before = withDb(server.dbPath, db => db.prepare('select count(*) as n from audit_log').get().n);
    const res = await operator.post(`/api/auth/operator/workspaces/${ws.id}/rename`, { name: 'Auditless Co 2', slug: 'auditless-co-2' });
    assert.equal(res.status, 200);
    const after = withDb(server.dbPath, db => db.prepare('select count(*) as n from audit_log').get().n);
    assert.equal(after, before, 'no audit_log row was written by the rename');
  } finally {
    await server.stop();
  }
});

/* ---------- GV-03: dead-mappings on-read route ---------- */

const insertMapping = (srv, { guid, wsId, kind = 'workspace', label = null }) =>
  withDb(srv.dbPath, db =>
    db.prepare('insert into group_mappings (id, group_guid, workspace_id, role, kind, label, created_at, updated_at) values (?,?,?,?,?,?,?,?)').run(
      'gm-' + guid.slice(0, 8),
      guid,
      wsId,
      'member',
      kind,
      label,
      Date.now(),
      Date.now(),
    ));
const insertTrail = (srv, { action, wsId = null, createdAt = Date.now() }) =>
  withDb(srv.dbPath, db =>
    db.prepare('insert into audit_log (id, action, session_count, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?)').run(
      'al-' + Math.random().toString(36).slice(2, 10),
      action,
      0,
      wsId,
      'sys',
      'sys@test.local',
      'sys',
      'sys@test.local',
      createdAt,
    ));

test('operator GET dead-mappings surfaces orphaned group_mappings rows with their fields', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const { ws } = await plainWorkspace(server.base, 'Alive Co', 'alive-co');
    insertMapping(server, { guid: '11111111-1111-1111-1111-111111111111', wsId: 'missing-workspace-id' });
    insertMapping(server, { guid: '22222222-2222-2222-2222-222222222222', wsId: ws.id, kind: 'operator', label: 'Team <b>x</b>' });

    const res = await operator.get('/api/auth/operator/dead-mappings');
    assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
    const orphans = res.data.orphans;
    assert.equal(orphans.length, 1, `exactly one orphan: ${JSON.stringify(orphans)}`);
    assert.equal(orphans[0].group_guid, '11111111-1111-1111-1111-111111111111');
    assert.equal(orphans[0].workspace_id, 'missing-workspace-id');
    assert.equal(orphans[0].kind, 'workspace');
  } finally {
    await server.stop();
  }
});

test('a mapping whose workspace_id matches an existing workspace EXACTLY is alive (adjacency probe)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const { ws } = await plainWorkspace(server.base, 'Exact Co', 'exact-co');
    insertMapping(server, { guid: '33333333-3333-3333-3333-333333333333', wsId: ws.id });

    const res = await operator.get('/api/auth/operator/dead-mappings');
    assert.equal(res.status, 200);
    assert.equal(res.data.orphans.length, 0, 'the live mapping must not appear');
  } finally {
    await server.stop();
  }
});

test('trail rows from the encoded audit format are surfaced; delta split is a CLIENT concern (raw strings returned)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    insertTrail(server, { action: 'group_membership_removed:group:44444444-4444-4444-4444-444444444444:guard-refused' });

    const res = await operator.get('/api/auth/operator/dead-mappings');
    assert.equal(res.status, 200);
    const trail = res.data.trail;
    assert.equal(trail.length, 1, `one trail row: ${JSON.stringify(trail)}`);
    assert.equal(trail[0].action, 'group_membership_removed:group:44444444-4444-4444-4444-444444444444:guard-refused');
  } finally {
    await server.stop();
  }
});

test('zero dead items → both lists empty (D-10 hiding is client-side)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const res = await operator.get('/api/auth/operator/dead-mappings');
    assert.equal(res.status, 200);
    assert.deepEqual(res.data, { orphans: [], trail: [] });
  } finally {
    await server.stop();
  }
});

test('dead-mappings route guarding: non-operator → 403 operatorOnly, unauthenticated → 401', async () => {
  const server = await startServer({});
  try {
    const joined = await signup(server.base, { name: 'Plain User', email: 'plain2@test.local' });
    assert.equal(joined.status, 201);
    const noAuth = await fetch(`${server.base}/api/auth/operator/dead-mappings`);
    assert.equal(noAuth.status, 401, `expected 401, got ${noAuth.status}`);
    const res = await joined.client.get('/api/auth/operator/dead-mappings');
    assert.equal(res.status, 403, `expected 403, got ${res.status}`);
    assert.equal(res.data.code, 'operatorOnly');
  } finally {
    await server.stop();
  }
});

test('trail list is ordered created_at desc', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const base = Date.now();
    insertTrail(server, { action: 'group_x:group:aaa:guard-refused', createdAt: base - 5000 });
    insertTrail(server, { action: 'group_y:group:bbb:guard-refused', createdAt: base - 1000 });
    const res = await operator.get('/api/auth/operator/dead-mappings');
    assert.equal(res.status, 200);
    assert.deepEqual(res.data.trail.map(r => r.action), ['group_y:group:bbb:guard-refused', 'group_x:group:aaa:guard-refused']);
  } finally {
    await server.stop();
  }
});

/* ---------- GV-02 / D-15: old slug answers exact 404 with NO redirect ---------- */

test('after a rename, the OLD slug URL → exact 404 with no Location header; the NEW slug → 200 (D-15/D-82-5 pin)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const { owner, ws } = await plainWorkspace(server.base, 'Movable Co', 'team-old');
    const res = await operator.post(`/api/auth/operator/workspaces/${ws.id}/rename`, { name: 'Movable Co', slug: 'team-new' });
    assert.equal(res.status, 200, `rename must succeed: ${JSON.stringify(res.data)}`);

    const oldRes = await owner.get('/api/workspaces/team-old');
    assert.equal(oldRes.status, 404, `old slug must 404, got ${oldRes.status}`);
    const rawOld = await fetch(`${server.base}/api/workspaces/team-old`, { headers: { cookie: owner.cookie() }, redirect: 'manual' });
    assert.ok(!('location' in rawOld.headers) || !rawOld.headers.get('location'), `no Location header on the old slug: ${rawOld.headers.get('location')}`);

    const newRes = await owner.get('/api/workspaces/team-new');
    assert.equal(newRes.status, 200, `new slug must resolve, got ${newRes.status}`);
  } finally {
    await server.stop();
  }
});
