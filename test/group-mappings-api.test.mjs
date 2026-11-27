/* =====================================================================
   Group-mappings API suite (Phase 101 — plan 101-01).

   Pins the operator-gated GET list and DELETE-by-id routes on
   /api/governance/group-mappings, colocated with the Phase 80 POST
   sibling:
   - GET (T1/T2/T3): the D-02 no-throttle read route (sameOrigin →
     requireUser → isInstanceAdmin BEFORE any lookup — no existence
     oracle), flat rows with server-resolved workspace name/slug,
     canonical GUID, created_at DESC ordering, and the structured
     dead/deadReason/liveMembers hints (D-05/D-06: exact-equality
     `provenance = 'group:' || group_guid` count — never a prefix LIKE).
   - The SC-4 mismatch signal (R-1 narrowing): `liveMembers === 0` on a
     live mapping is the only derivable label/GUID-mismatch signal.
   - DELETE (T4/T5/T6): throttle-BEFORE-gate (a 403 consumes a try —
     D-02/T-85-04), uniform generic 404 on unknown id (D-01, no oracle),
     same-tx `group_mapping_deleted` audit row, memberships/team_members
     byte-identical before/after (R-3 lazy revocation), and the WR-83-03
     pin: `group_mapping_deleted` never matches the dead-mappings trail
     LIKE 'group\_%:group:%'.
   - Backstop classifier (T7): the dialect-parity unique-violation
     classifier unit-tested against both shapes (D-14).
   Pattern: test/groups-config-api.test.mjs + governance-rename fixtures.
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { ADMIN, login, signup, startServer, withDb } from './helpers/server.mjs';

const GUID_OK = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
const GUID_BRACED = '{a1b2c3d4-e5f6-7890-abcd-ef1234567890}'; // paste variant of the SAME group
const GUID_B = '22222222-2222-2222-2222-222222222222';

const acmeId = srv => withDb(srv.dbPath, db => db.prepare('select id, name, slug from workspaces where slug = ?').get('acme'));

/* governance-rename fixtures, extended with createdAt for ordering pins */
const insertMapping = (srv, { guid, wsId, kind = 'workspace', label = null, role = 'member', createdAt = Date.now() }) =>
  withDb(srv.dbPath, db =>
    db.prepare('insert into group_mappings (id, group_guid, workspace_id, role, kind, label, created_at, updated_at) values (?,?,?,?,?,?,?,?)').run(
      'gm-' + guid.slice(0, 8),
      guid,
      wsId,
      role,
      kind,
      label,
      createdAt,
      createdAt,
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
const seedMembership = (srv, { wsId, email, provenance }) =>
  withDb(srv.dbPath, db => {
    const u = db.prepare('select id from users where email = ?').get(email);
    return db.prepare('insert into memberships (workspace_id, user_id, role, provenance) values (?,?,?,?)').run(wsId, u.id, 'member', provenance);
  });

/* ---------- T1: the GET gate (T-80-04 family posture) ---------- */

test('unauthenticated GET → 401 before any data read', async () => {
  const server = await startServer({});
  try {
    const res = await fetch(`${server.base}/api/governance/group-mappings`);
    assert.equal(res.status, 401, `expected 401, got ${res.status}`);
  } finally {
    await server.stop();
  }
});

test('cross-origin GET with a valid session → 403 crossOriginRejected (sameOrigin runs FIRST)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const res = await fetch(`${server.base}/api/governance/group-mappings`, {
      headers: { cookie: operator.cookie(), origin: 'https://evil.example' },
    });
    assert.equal(res.status, 403, `expected 403, got ${res.status}`);
    assert.equal((await res.json()).code, 'crossOriginRejected');
  } finally {
    await server.stop();
  }
});

test('non-operator authenticated GET → EXACT 403 operatorOnly regardless of DB state (no oracle)', async () => {
  const server = await startServer({});
  try {
    insertMapping(server, { guid: GUID_OK.toLowerCase(), wsId: 'missing-workspace-id' }); // data exists; the gate must not care
    const joined = await signup(server.base, { name: 'Plain User', email: 'plain@test.local' });
    assert.equal(joined.status, 201);
    const res = await joined.client.get('/api/governance/group-mappings');
    assert.equal(res.status, 403, `expected 403, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'operatorOnly');
    assert.deepEqual(Object.keys(res.data).sort(), ['code', 'error']);
  } finally {
    await server.stop();
  }
});

/* ---------- T2: GET success — flat rows, canonical GUID, server-resolved name, ordering ---------- */

test('operator GET → flat rows with canonical GUID, server-resolved workspace name/slug, created_at DESC ordering', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const ws = acmeId(server);
    const saved = await operator.post('/api/governance/group-mappings', { groupGuid: GUID_BRACED, workspaceId: ws.id, role: 'admin', label: 'Platform Team' });
    assert.equal(saved.status, 200, `save must succeed: ${JSON.stringify(saved.data)}`);
    // an older fixture row must sort AFTER the fresh POST row (created_at desc)
    insertMapping(server, { guid: GUID_B, wsId: ws.id, createdAt: Date.now() - 5000 });

    const res = await operator.get('/api/governance/group-mappings');
    assert.equal(res.status, 200, `GET must succeed: ${JSON.stringify(res.data)}`);
    const rows = res.data.mappings;
    assert.equal(rows.length, 2);
    const [first, second] = rows;
    // newest first
    assert.equal(first.groupGuid, GUID_OK.toLowerCase(), 'the canonical lowercase-hyphenated GUID — never the braced paste');
    assert.equal(first.id, saved.data.mapping.id, 'the opaque row id is the uid PK (D-08)');
    assert.equal(first.workspaceId, ws.id);
    assert.equal(first.workspaceName, ws.name, 'workspace name resolved server-side — the client never names workspaces');
    assert.equal(first.workspaceSlug, ws.slug, 'slug carried for Phase 102 linking');
    assert.equal(first.role, 'admin');
    assert.equal(first.kind, 'workspace');
    assert.equal(first.label, 'Platform Team');
    assert.equal(first.dead, false);
    assert.equal(first.deadReason, null);
    assert.equal(first.liveMembers, 0, 'SC-4 mismatch signal: no group:<guid> provenance rows → liveMembers 0');
    assert.equal(typeof first.createdAt, 'number');
    assert.equal(first.updatedAt, first.createdAt);
    assert.equal(second.groupGuid, GUID_B, 'older fixture row sorts second (created_at desc)');
    assert.ok(first.createdAt >= second.createdAt);
  } finally {
    await server.stop();
  }
});

/* ---------- T3: dead-mapping hints (D-05/D-06) ---------- */

test('hints: archived workspace → dead:true workspace-archived; missing workspace → dead:true workspace-deleted with null name/slug', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const ws = acmeId(server);
    // a doomed workspace, then archived + deleted variants
    const joined = await signup(server.base, { name: 'Doomed Owner', email: 'doomed@test.local' });
    const created = await joined.client.post('/api/workspaces', { name: 'Doomed Co' });
    assert.equal(created.status, 201);
    const doomedId = created.data.workspace.id;
    insertMapping(server, { guid: GUID_OK.toLowerCase(), wsId: ws.id, createdAt: Date.now() - 3000 });
    insertMapping(server, { guid: GUID_B, wsId: doomedId, createdAt: Date.now() - 2000 });
    insertMapping(server, { guid: '33333333-3333-3333-3333-333333333333', wsId: 'no-such-workspace', createdAt: Date.now() - 1000 });
    // archive ws, DELETE doomed workspace via the operator route (row purge — non-cascading FK keeps the mapping alive)
    withDb(server.dbPath, db => db.prepare('update workspaces set archived = 1 where id = ?').run(ws.id));
    const ownerId = withDb(server.dbPath, db => db.prepare('select id from users where email = ?').get('doomed@test.local').id);
    const del = await operator.post(`/api/auth/operator/workspaces/${doomedId}/delete`, { dispositions: [{ userId: ownerId, type: 'release' }] });
    assert.equal(del.status, 200, `operator delete must succeed: ${JSON.stringify(del.data)}`);

    const res = await operator.get('/api/governance/group-mappings');
    assert.equal(res.status, 200);
    const byWs = Object.fromEntries(res.data.mappings.map(r => [r.workspaceId, r]));
    const archivedRow = byWs[ws.id];
    assert.deepEqual({ dead: archivedRow.dead, deadReason: archivedRow.deadReason }, { dead: true, deadReason: 'workspace-archived' });
    assert.equal(archivedRow.workspaceName, ws.name, 'an archived workspace still HAS a name — never nulled');
    const deadRow = byWs[doomedId];
    assert.deepEqual({ dead: deadRow.dead, deadReason: deadRow.deadReason }, { dead: true, deadReason: 'workspace-deleted' });
    assert.equal(deadRow.workspaceName, null, 'no invented placeholder name for a purged workspace (Pitfall 4)');
    assert.equal(deadRow.workspaceSlug, null);
    const goneRow = byWs['no-such-workspace'];
    assert.deepEqual({ dead: goneRow.dead, deadReason: goneRow.deadReason }, { dead: true, deadReason: 'workspace-deleted' });
    assert.equal(goneRow.liveMembers, 0);
  } finally {
    await server.stop();
  }
});

test('liveMembers counts by EXACT provenance equality — two groups in one workspace never cross-count (Pitfall 3)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const ws = acmeId(server);
    const joinedA = await signup(server.base, { name: 'Member A', email: 'member-a@test.local' });
    const joinedB = await signup(server.base, { name: 'Member B', email: 'member-b@test.local' });
    assert.equal(joinedA.status, 201);
    assert.equal(joinedB.status, 201);
    insertMapping(server, { guid: GUID_OK.toLowerCase(), wsId: ws.id });
    insertMapping(server, { guid: GUID_B, wsId: ws.id });
    seedMembership(server, { wsId: ws.id, email: 'member-a@test.local', provenance: 'group:' + GUID_OK.toLowerCase() });
    seedMembership(server, { wsId: ws.id, email: 'member-b@test.local', provenance: 'group:' + GUID_B });
    const joinedC = await signup(server.base, { name: 'Member C', email: 'member-c@test.local' });
    assert.equal(joinedC.status, 201);
    seedMembership(server, { wsId: ws.id, email: 'member-c@test.local', provenance: 'invite' }); // noise: must never count

    const res = await operator.get('/api/governance/group-mappings');
    const byGuid = Object.fromEntries(res.data.mappings.map(r => [r.groupGuid, r]));
    assert.equal(byGuid[GUID_OK.toLowerCase()].liveMembers, 1, 'exact group:<guid> equality — only that group’s rows count');
    assert.equal(byGuid[GUID_B].liveMembers, 1, 'no prefix-LIKE adjacency: each mapping sees only its own group');
    assert.equal(byGuid[GUID_OK.toLowerCase()].dead, false);
    assert.equal(byGuid[GUID_OK.toLowerCase()].deadReason, null);
  } finally {
    await server.stop();
  }
});

/* ---------- T4: DELETE gates — throttle BEFORE the operator gate (Pitfall 1, D-02) ---------- */

test('non-operator DELETE: each 403 consumes a throttle try → the 6th attempt is 429 (throttle-before-gate)', async () => {
  const server = await startServer({});
  try {
    const joined = await signup(server.base, { name: 'Plain User', email: 'plain@test.local' });
    assert.equal(joined.status, 201);
    for (let i = 1; i <= 5; i++) {
      const res = await joined.client.del('/api/governance/group-mappings/gm-whatever');
      assert.equal(res.status, 403, `attempt ${i} must be the operator-gate 403, got ${res.status}`);
      assert.equal(res.data.code, 'operatorOnly');
    }
    const sixth = await joined.client.del('/api/governance/group-mappings/gm-whatever');
    assert.equal(sixth.status, 429, `the 6th attempt must be throttled, got ${sixth.status}: ${JSON.stringify(sixth.data)}`);
    assert.equal(sixth.data.code, 'tooManyAttempts');
  } finally {
    await server.stop();
  }
});

test('unknown mapping id DELETE → uniform generic 404 notFound for the operator (D-01: no existence oracle)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    // zero mappings exist vs one exists — the SAME generic 404 either way
    const empty = await operator.del('/api/governance/group-mappings/gm-unknown-id');
    assert.equal(empty.status, 404);
    assert.equal(empty.data.code, 'notFound');
    insertMapping(server, { guid: GUID_OK.toLowerCase(), wsId: acmeId(server).id });
    const populated = await operator.del('/api/governance/group-mappings/gm-different-id');
    assert.deepEqual({ status: populated.status, code: populated.data.code }, { status: empty.status, code: empty.data.code }, 'identical refusal with and without rows — no oracle');
  } finally {
    await server.stop();
  }
});

/* ---------- T5: DELETE success — same-tx audit, R-3 lazy revocation ---------- */

test('operator DELETE success: row gone, EXACTLY one group_mapping_deleted audit row, memberships + team_members byte-identical (R-3)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const ws = acmeId(server);
    insertMapping(server, { guid: GUID_OK.toLowerCase(), wsId: ws.id, label: 'Platform Team' });
    const joinedA = await signup(server.base, { name: 'Member A', email: 'member-a@test.local' });
    const joinedB = await signup(server.base, { name: 'Member B', email: 'member-b@test.local' });
    assert.equal(joinedA.status, 201);
    assert.equal(joinedB.status, 201);
    seedMembership(server, { wsId: ws.id, email: 'member-a@test.local', provenance: 'group:' + GUID_OK.toLowerCase() });
    seedMembership(server, { wsId: ws.id, email: 'member-b@test.local', provenance: 'invite' });
    const operatorId = withDb(server.dbPath, db => db.prepare('select id from users where email = ?').get(ADMIN.email).id);
    const before = withDb(server.dbPath, db => ({
      memberships: db.prepare('select * from memberships order by workspace_id, user_id').all(),
      teamMembers: db.prepare('select * from team_members').all(),
      mappings: db.prepare('select * from group_mappings').all(),
    }));

    const res = await operator.del('/api/governance/group-mappings/gm-a1b2c3d4');
    assert.equal(res.status, 200, `DELETE must succeed: ${JSON.stringify(res.data)}`);
    assert.deepEqual(res.data, { deleted: true });

    const after = withDb(server.dbPath, db => ({
      memberships: db.prepare('select * from memberships order by workspace_id, user_id').all(),
      teamMembers: db.prepare('select * from team_members').all(),
      mappings: db.prepare('select * from group_mappings').all(),
      audits: db.prepare("select * from audit_log where action = 'group_mapping_deleted'").all(),
    }));
    assert.equal(after.mappings.length, 0, 'the mapping row is gone');
    assert.deepEqual(after.memberships, before.memberships, 'memberships byte-identical — lazy revocation only (R-3)');
    assert.deepEqual(after.teamMembers, before.teamMembers, 'team_members byte-identical (R-3)');
    assert.equal(after.audits.length, 1, 'exactly one group_mapping_deleted audit row');
    assert.equal(after.audits[0].actor_id, operatorId, 'operator actor attribution (D-11)');
    assert.match(after.audits[0].target_email || '', new RegExp(GUID_OK.toLowerCase()), 'audit carries the GUID (D-10)');
    assert.match(after.audits[0].target_email || '', /Platform Team/, 'audit carries the label (D-10)');
    assert.equal(after.audits[0].workspace_id, ws.id, 'audit carries the workspace id (D-10)');
  } finally {
    await server.stop();
  }
});

/* ---------- T6: WR-83-03 pin — group_mapping_deleted never matches the dead-mappings trail LIKE ---------- */

test('dead-mappings trail returns ONLY encoded guard rows — group_mapping_saved/deleted never leak into the trail (WR-83-03 SAFE pin)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const guid = GUID_OK.toLowerCase();
    insertTrail(server, { action: 'group_mapping_saved' });
    insertTrail(server, { action: 'group_mapping_deleted' });
    insertTrail(server, { action: `group_membership_removed:group:${guid}:lost-claim` }); // the ONLY trail-shaped row
    const res = await operator.get('/api/auth/operator/dead-mappings');
    assert.equal(res.status, 200);
    const actions = res.data.trail.map(t => t.action);
    assert.deepEqual(actions, [`group_membership_removed:group:${guid}:lost-claim`], 'the LIKE group\\_%:group:% must not over-match group_mapping_* rows');
  } finally {
    await server.stop();
  }
});
