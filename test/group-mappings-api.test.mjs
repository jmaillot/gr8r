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
import { isUniqueViolation } from '../db-adapter.mjs';

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

/* ---------- T7: the dialect-parity duplicate classifier (D-14, MAP-03) ---------- */

test('isUniqueViolation: true for SQLite and pg unique-violation shapes, false for anything else', () => {
  assert.equal(isUniqueViolation(new Error('UNIQUE constraint failed: group_mappings.group_guid, group_mappings.workspace_id')), true, 'SQLite shape (node:sqlite, proven db-adapter.test.mjs:327)');
  assert.equal(isUniqueViolation(Object.assign(new Error('duplicate key value violates unique constraint "group_mappings_pair"'), { code: '23505' })), true, 'pg unique_violation by code');
  assert.equal(isUniqueViolation(new Error('duplicate key value violates unique constraint "group_mappings_pair"')), true, 'pg message shape matched even without err.code (A1 widening)');
  assert.equal(isUniqueViolation(null), false, 'null error is not a duplicate');
  assert.equal(isUniqueViolation(new Error('CHECK constraint failed: role')), false, 'CHECK violations are NOT duplicates — must rethrow');
  assert.equal(isUniqueViolation(new Error('no such table: group_mappings')), false);
  assert.equal(isUniqueViolation(Object.assign(new Error('syntax error'), { code: '42601' })), false);
});

/* ---------- T8: TEAM-07 — the dead-mappings route reports team-deleted orphans ---------- */

test('dead-mappings route: a mapping whose team vanished from the doc is an orphan with deadReason team-deleted; workspace reasons still render', async () => {
  const server = await startServer({});
  try {
    const ws = acmeId(server);
    withDb(server.dbPath, db =>
      db.prepare('insert into group_mappings (id, group_guid, workspace_id, role, kind, team_id, created_at, updated_at) values (?,?,?,?,?,?,?,?)').run(
        'gm-teamdead', GUID_OK.toLowerCase(), ws.id, 'member', 'workspace', 'team-gone', Date.now(), Date.now(),
      ));
    insertMapping(server, { guid: GUID_B, wsId: 'missing-workspace-id' }); // the pre-existing workspace-deleted class
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const res = await operator.get('/api/auth/operator/dead-mappings');
    assert.equal(res.status, 200);
    const byGuid = Object.fromEntries(res.data.orphans.map(o => [o.group_guid, o]));
    assert.deepEqual({ deadReason: byGuid[GUID_OK.toLowerCase()].deadReason, teamId: byGuid[GUID_OK.toLowerCase()].team_id }, { deadReason: 'team-deleted', teamId: 'team-gone' });
    assert.equal(byGuid[GUID_B].deadReason, 'workspace-deleted', 'the pre-existing workspace class still renders');
  } finally {
    await server.stop();
  }
});

/* =====================================================================
   Phase 106 (EDIT-01/02): the PATCH sibling — guard ladder cloned from
   DELETE (D-03), throttle-before-gate with key group-mapping-edit,
   uniform 404, GUID immutability (R-8), partial role/label update with a
   same-tx group_mapping_updated audit row (AUD-01).
   ===================================================================== */

const patchRow = (srv, id) =>
  withDb(srv.dbPath, db => db.prepare('select * from group_mappings where id = ?').get(id));
const updatedAudits = srv =>
  withDb(srv.dbPath, db => db.prepare("select * from audit_log where action = 'group_mapping_updated'").all());

test('PATCH happy path: role + label partially updated, EXACTLY one group_mapping_updated audit row, memberships/team_members byte-identical', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const ws = acmeId(server);
    insertMapping(server, { guid: GUID_OK.toLowerCase(), wsId: ws.id, role: 'admin', label: 'Old Label' });
    const joinedA = await signup(server.base, { name: 'Member A', email: 'member-a@test.local' });
    assert.equal(joinedA.status, 201);
    seedMembership(server, { wsId: ws.id, email: 'member-a@test.local', provenance: 'group:' + GUID_OK.toLowerCase() });
    const operatorId = withDb(server.dbPath, db => db.prepare('select id from users where email = ?').get(ADMIN.email).id);
    const before = withDb(server.dbPath, db => ({
      memberships: db.prepare('select * from memberships order by workspace_id, user_id').all(),
      teamMembers: db.prepare('select * from team_members').all(),
    }));

    const res = await operator.patch('/api/governance/group-mappings/gm-a1b2c3d4', { role: 'member', label: 'New Label' });
    assert.equal(res.status, 200, `PATCH must succeed: ${JSON.stringify(res.data)}`);
    assert.deepEqual(res.data.mapping, { id: 'gm-a1b2c3d4', groupGuid: GUID_OK.toLowerCase(), workspaceId: ws.id, role: 'member', kind: 'workspace', teamId: null, label: 'New Label' });

    const row = patchRow(server, 'gm-a1b2c3d4');
    assert.equal(row.role, 'member');
    assert.equal(row.label, 'New Label');
    const after = withDb(server.dbPath, db => ({
      memberships: db.prepare('select * from memberships order by workspace_id, user_id').all(),
      teamMembers: db.prepare('select * from team_members').all(),
    }));
    assert.deepEqual(after.memberships, before.memberships, 'the edit never touches memberships (R-3 lazy revocation)');
    assert.deepEqual(after.teamMembers, before.teamMembers, 'the edit never touches team_members');

    const audits = updatedAudits(server);
    assert.equal(audits.length, 1, 'exactly one group_mapping_updated audit row');
    assert.equal(audits[0].actor_id, operatorId, 'operator actor attribution (D-11)');
    assert.equal(audits[0].workspace_id, ws.id, 'audit carries the workspace id (D-10)');
    assert.match(audits[0].target_email || '', new RegExp(GUID_OK.toLowerCase()), 'audit carries the GUID (D-10)');
    assert.match(audits[0].target_email || '', /admin→member/, 'audit carries the role before→after');
    assert.ok((audits[0].target_email || '').includes('label "Old Label"→"New Label"'), 'audit carries the label before→after');
  } finally {
    await server.stop();
  }
});

test('PATCH ladder: 401 without a user; 403 crossOriginRejected with origin; 403 operatorOnly consumes nothing extra', async () => {
  const server = await startServer({});
  try {
    const res401 = await fetch(`${server.base}/api/governance/group-mappings/gm-x`, { method: 'PATCH' });
    assert.equal(res401.status, 401);

    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const resCross = await fetch(`${server.base}/api/governance/group-mappings/gm-x`, {
      method: 'PATCH',
      headers: { cookie: operator.cookie(), origin: 'https://evil.example' },
    });
    assert.equal(resCross.status, 403);
    assert.equal((await resCross.json()).code, 'crossOriginRejected');

    const joined = await signup(server.base, { name: 'Plain User', email: 'plain@test.local' });
    assert.equal(joined.status, 201);
    const res403 = await joined.client.patch('/api/governance/group-mappings/gm-x', { role: 'member' });
    assert.equal(res403.status, 403);
    assert.equal(res403.data.code, 'operatorOnly');
  } finally {
    await server.stop();
  }
});

test('PATCH throttle-before-gate: each 403 consumes a try → the 6th attempt is 429 (T-85-04, key group-mapping-edit)', async () => {
  const server = await startServer({});
  try {
    const joined = await signup(server.base, { name: 'Plain User', email: 'plain2@test.local' });
    assert.equal(joined.status, 201);
    for (let i = 1; i <= 5; i++) {
      const res = await joined.client.patch('/api/governance/group-mappings/gm-whatever', { role: 'member' });
      assert.equal(res.status, 403, `attempt ${i} must be the operator-gate 403, got ${res.status}`);
      assert.equal(res.data.code, 'operatorOnly');
    }
    const sixth = await joined.client.patch('/api/governance/group-mappings/gm-whatever', { role: 'member' });
    assert.equal(sixth.status, 429, `the 6th attempt must be throttled, got ${sixth.status}`);
    assert.equal(sixth.data.code, 'tooManyAttempts');
  } finally {
    await server.stop();
  }
});

test('PATCH unknown id → uniform generic 404 notFound (D-01)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const empty = await operator.patch('/api/governance/group-mappings/gm-unknown-id', { role: 'member' });
    assert.equal(empty.status, 404);
    assert.equal(empty.data.code, 'notFound');
    insertMapping(server, { guid: GUID_OK.toLowerCase(), wsId: acmeId(server).id });
    const populated = await operator.patch('/api/governance/group-mappings/gm-different-id', { role: 'member' });
    assert.deepEqual({ status: populated.status, code: populated.data.code }, { status: empty.status, code: empty.data.code }, 'identical refusal with and without rows — no oracle');
  } finally {
    await server.stop();
  }
});

test('PATCH body carrying groupGuid → 400 groupMappingImmutable, row untouched (R-8, no silent ignore)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    insertMapping(server, { guid: GUID_OK.toLowerCase(), wsId: acmeId(server).id, role: 'admin' });
    const res = await operator.patch('/api/governance/group-mappings/gm-a1b2c3d4', { groupGuid: GUID_B, role: 'member' });
    assert.equal(res.status, 400);
    assert.equal(res.data.code, 'groupMappingImmutable');
    assert.equal(patchRow(server, 'gm-a1b2c3d4').role, 'admin', 'the row is untouched when the body tries to retarget the GUID');
    assert.equal(updatedAudits(server).length, 0, 'no audit row for a refused edit');
  } finally {
    await server.stop();
  }
});

test('PATCH bad role → 400 groupMappingBadRole via the POST funnel; empty-string label normalizes to null', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    insertMapping(server, { guid: GUID_OK.toLowerCase(), wsId: acmeId(server).id, role: 'admin', label: 'Keep' });
    const badRole = await operator.patch('/api/governance/group-mappings/gm-a1b2c3d4', { role: 'viewer' });
    assert.equal(badRole.status, 400);
    assert.equal(badRole.data.code, 'groupMappingBadRole');
    const cleared = await operator.patch('/api/governance/group-mappings/gm-a1b2c3d4', { label: '   ' });
    assert.equal(cleared.status, 200);
    assert.equal(patchRow(server, 'gm-a1b2c3d4').label, null, 'whitespace-only label → null (POST idiom verbatim)');
  } finally {
    await server.stop();
  }
});

/* ---------- Phase 106 Task 2: workspace/team fields, live-only, dead-row refusal, POST team slots ---------- */

const setDocTeams = (srv, wsId, teams) =>
  withDb(srv.dbPath, db => {
    const row = db.prepare('select doc from workspaces where id = ?').get(wsId);
    const doc = JSON.parse(row.doc);
    doc.data.teams = teams;
    db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), wsId);
  });

test('PATCH workspaceId to a live workspace moves the row; audit detail shows the ws change (no dup)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const ws = acmeId(server);
    const joined = await signup(server.base, { name: 'Second Owner', email: 'second@test.local' });
    const created = await joined.client.post('/api/workspaces', { name: 'Second Co' });
    assert.equal(created.status, 201);
    const ws2 = created.data.workspace.id;
    insertMapping(server, { guid: GUID_OK.toLowerCase(), wsId: ws.id, role: 'admin' });

    const res = await operator.patch('/api/governance/group-mappings/gm-a1b2c3d4', { workspaceId: ws2 });
    assert.equal(res.status, 200, `retarget must succeed: ${JSON.stringify(res.data)}`);
    assert.equal(patchRow(server, 'gm-a1b2c3d4').workspace_id, ws2, 'the row moved to the new workspace');
    const audit = updatedAudits(server)[0];
    assert.ok((audit.target_email || '').includes(`ws ${ws.id}→${ws2}`), 'audit carries the ws before→after');
    assert.equal(audit.workspace_id, ws2, 'audit carries the NEW workspace id');
  } finally {
    await server.stop();
  }
});

test('PATCH retarget onto a workspace already holding the same group → 400 groupMappingDuplicate pre-check', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const ws = acmeId(server);
    const joined = await signup(server.base, { name: 'Third Owner', email: 'third@test.local' });
    const ws2 = (await joined.client.post('/api/workspaces', { name: 'Third Co' })).data.workspace.id;
    insertMapping(server, { guid: GUID_OK.toLowerCase(), wsId: ws.id });
    insertMapping(server, { guid: GUID_B, wsId: ws.id }); // noise, different guid
    // the COLLIDING row: same guid, target workspace — inserted before the PATCH
    withDb(server.dbPath, db =>
      db.prepare('insert into group_mappings (id, group_guid, workspace_id, role, kind, created_at, updated_at) values (?,?,?,?,?,?,?)').run(
        'gm-collide', GUID_OK.toLowerCase(), ws2, 'member', 'workspace', Date.now(), Date.now(),
      ));
    const res = await operator.patch('/api/governance/group-mappings/gm-a1b2c3d4', { workspaceId: ws2 });
    assert.equal(res.status, 400);
    assert.equal(res.data.code, 'groupMappingDuplicate', 'the (guid, workspace) pair pre-check refuses before any write');
    assert.equal(patchRow(server, 'gm-a1b2c3d4').workspace_id, ws.id, 'the row did not move');
  } finally {
    await server.stop();
  }
});

test('PATCH retarget to an ARCHIVED workspace → 400 (live-only, no manufactured dead rows)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const ws = acmeId(server);
    const joined = await signup(server.base, { name: 'Archived Owner', email: 'archived-owner@test.local' });
    const ws2 = (await joined.client.post('/api/workspaces', { name: 'Archived Co' })).data.workspace.id;
    withDb(server.dbPath, db => db.prepare('update workspaces set archived = 1 where id = ?').run(ws2));
    insertMapping(server, { guid: GUID_OK.toLowerCase(), wsId: ws.id });
    const res = await operator.patch('/api/governance/group-mappings/gm-a1b2c3d4', { workspaceId: ws2 });
    assert.equal(res.status, 400);
    assert.equal(res.data.code, 'groupMappingUnknownWorkspace');
    assert.equal(patchRow(server, 'gm-a1b2c3d4').workspace_id, ws.id);
  } finally {
    await server.stop();
  }
});

test('PATCH teamId: valid team on the CURRENT workspace lands; unknown team → groupMappingTeamUnknown; null clears (nullable TEAM-01)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const ws = acmeId(server);
    setDocTeams(server, ws.id, [{ id: 'team-alpha', name: 'Alpha' }]);
    insertMapping(server, { guid: GUID_OK.toLowerCase(), wsId: ws.id });

    const ok = await operator.patch('/api/governance/group-mappings/gm-a1b2c3d4', { teamId: 'team-alpha' });
    assert.equal(ok.status, 200, `valid team must land: ${JSON.stringify(ok.data)}`);
    assert.equal(patchRow(server, 'gm-a1b2c3d4').team_id, 'team-alpha');
    assert.ok((updatedAudits(server)[0].target_email || '').includes('team none→team-alpha'), 'audit carries the team before→after');

    const unknown = await operator.patch('/api/governance/group-mappings/gm-a1b2c3d4', { teamId: 'team-ghost' });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.data.code, 'groupMappingTeamUnknown');
    assert.equal(patchRow(server, 'gm-a1b2c3d4').team_id, 'team-alpha', 'a refused team edit leaves the row untouched');

    const cleared = await operator.patch('/api/governance/group-mappings/gm-a1b2c3d4', { teamId: null });
    assert.equal(cleared.status, 200);
    assert.equal(patchRow(server, 'gm-a1b2c3d4').team_id, null, 'null clears the team (nullable per TEAM-01)');
  } finally {
    await server.stop();
  }
});

test('PATCH team validated against the EFFECTIVE workspace when retargeting in the same PATCH', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const ws = acmeId(server); // NO teams in its doc
    const joined = await signup(server.base, { name: 'Fourth Owner', email: 'fourth@test.local' });
    const ws2 = (await joined.client.post('/api/workspaces', { name: 'Fourth Co' })).data.workspace.id;
    setDocTeams(server, ws2, [{ id: 'team-beta', name: 'Beta' }]);
    insertMapping(server, { guid: GUID_OK.toLowerCase(), wsId: ws.id });

    // team-beta exists ONLY in the target workspace doc — must be accepted
    const ok = await operator.patch('/api/governance/group-mappings/gm-a1b2c3d4', { workspaceId: ws2, teamId: 'team-beta' });
    assert.equal(ok.status, 200, `effective-workspace whitelist must accept: ${JSON.stringify(ok.data)}`);
    const row = patchRow(server, 'gm-a1b2c3d4');
    assert.equal(row.workspace_id, ws2);
    assert.equal(row.team_id, 'team-beta');

    // team-beta lives only in Fourth Co's doc — retargeting BACK to acme
    // must validate the team against ACME's doc (the effective workspace),
    // not the row's current one
    const bad = await operator.patch('/api/governance/group-mappings/gm-a1b2c3d4', { workspaceId: ws.id, teamId: 'team-beta' });
    assert.equal(bad.status, 400);
    assert.equal(bad.data.code, 'groupMappingTeamUnknown', 'the CURRENT workspace doc is not consulted when retargeting');
  } finally {
    await server.stop();
  }
});

test('dead rows refuse edit → 400 groupMappingDead; retargeting the SAME dead row to a live workspace is the sanctioned repair', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const ws = acmeId(server);
    const joined = await signup(server.base, { name: 'Fifth Owner', email: 'fifth@test.local' });
    const doomed = (await joined.client.post('/api/workspaces', { name: 'Doomed Co' })).data.workspace.id;
    insertMapping(server, { guid: GUID_OK.toLowerCase(), wsId: doomed, role: 'admin' });
    withDb(server.dbPath, db => db.prepare('update workspaces set archived = 1 where id = ?').run(doomed));

    const deadEdit = await operator.patch('/api/governance/group-mappings/gm-a1b2c3d4', { role: 'member' });
    assert.equal(deadEdit.status, 400);
    assert.equal(deadEdit.data.code, 'groupMappingDead', 'EDIT-02: dead rows are display-only (targeted refusal, not 404)');
    assert.equal(updatedAudits(server).length, 0);

    const repair = await operator.patch('/api/governance/group-mappings/gm-a1b2c3d4', { workspaceId: ws.id });
    assert.equal(repair.status, 200, `retarget to a live workspace repairs the dead row: ${JSON.stringify(repair.data)}`);
    assert.equal(patchRow(server, 'gm-a1b2c3d4').workspace_id, ws.id);

    // a workspace-DELETED row (purged workspace) is dead the same way
    insertMapping(server, { guid: GUID_B, wsId: 'no-such-workspace' });
    const goneEdit = await operator.patch('/api/governance/group-mappings/gm-22222222', { role: 'member' });
    assert.equal(goneEdit.status, 400);
    assert.equal(goneEdit.data.code, 'groupMappingDead');
  } finally {
    await server.stop();
  }
});

test('POST teamId: valid team lands; unknown team → groupMappingTeamUnknown; team on an ARCHIVED workspace → same key; no team keeps v3.6 behavior', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const ws = acmeId(server);
    setDocTeams(server, ws.id, [{ id: 'team-alpha', name: 'Alpha' }]);

    const ok = await operator.post('/api/governance/group-mappings', { groupGuid: GUID_BRACED, workspaceId: ws.id, role: 'admin', teamId: 'team-alpha' });
    assert.equal(ok.status, 200, `POST with team must succeed: ${JSON.stringify(ok.data)}`);
    assert.equal(ok.data.mapping.teamId, 'team-alpha');
    assert.equal(patchRow(server, ok.data.mapping.id).team_id, 'team-alpha');

    const unknown = await operator.post('/api/governance/group-mappings', { groupGuid: GUID_B, workspaceId: ws.id, role: 'member', teamId: 'team-ghost' });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.data.code, 'groupMappingTeamUnknown');

    const joined = await signup(server.base, { name: 'Arch Owner 2', email: 'arch2@test.local' });
    const ws2 = (await joined.client.post('/api/workspaces', { name: 'Arch Co 2' })).data.workspace.id;
    setDocTeams(server, ws2, [{ id: 'team-arch', name: 'Arch' }]);
    withDb(server.dbPath, db => db.prepare('update workspaces set archived = 1 where id = ?').run(ws2));
    const archived = await operator.post('/api/governance/group-mappings', { groupGuid: '33333333-3333-3333-3333-333333333333', workspaceId: ws2, role: 'member', teamId: 'team-arch' });
    assert.equal(archived.status, 400);
    assert.equal(archived.data.code, 'groupMappingTeamUnknown', 'a team on an archived (non-live) workspace refuses live-only');

    const plain = await operator.post('/api/governance/group-mappings', { groupGuid: '44444444-4444-4444-4444-444444444444', workspaceId: ws.id, role: 'member' });
    assert.equal(plain.status, 200, 'no team slot = exactly v3.6 behavior');
    assert.equal(plain.data.mapping.teamId, null);
    assert.equal(patchRow(server, plain.data.mapping.id).team_id, null);
  } finally {
    await server.stop();
  }
});

/* ---------- Phase 106 Task 3: GET team payload (TEAM-08 data contract for 107) ---------- */

test('GET payload carries teamId/teamName/teamMissing: live-team row resolves the name, dead-team row flags missing, unset team stays null', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const ws = acmeId(server);
    setDocTeams(server, ws.id, [{ id: 'team-alpha', name: 'Alpha Team' }]);
    const t = Date.now();
    const ins = (id, guid, teamId) =>
      withDb(server.dbPath, db =>
        db.prepare('insert into group_mappings (id, group_guid, workspace_id, role, kind, team_id, created_at, updated_at) values (?,?,?,?,?,?,?,?)').run(
          id, guid, ws.id, 'member', 'workspace', teamId, t, t,
        ));
    ins('gm-live-team', GUID_OK.toLowerCase(), 'team-alpha');   // live team → resolved name
    ins('gm-dead-team', GUID_B, 'team-ghost');                  // team left the doc → teamMissing
    ins('gm-no-team', '44444444-4444-4444-4444-444444444444', null); // unset → null/false

    const res = await operator.get('/api/governance/group-mappings');
    assert.equal(res.status, 200);
    const byId = Object.fromEntries(res.data.mappings.map(r => [r.id, r]));
    assert.deepEqual({ teamId: byId['gm-live-team'].teamId, teamName: byId['gm-live-team'].teamName, teamMissing: byId['gm-live-team'].teamMissing },
      { teamId: 'team-alpha', teamName: 'Alpha Team', teamMissing: false }, 'live team resolves its server-side name');
    assert.deepEqual({ teamId: byId['gm-dead-team'].teamId, teamName: byId['gm-dead-team'].teamName, teamMissing: byId['gm-dead-team'].teamMissing },
      { teamId: 'team-ghost', teamName: null, teamMissing: true }, 'a doc-deleted team flags teamMissing with a null name');
    assert.deepEqual({ teamId: byId['gm-no-team'].teamId, teamName: byId['gm-no-team'].teamName, teamMissing: byId['gm-no-team'].teamMissing },
      { teamId: null, teamName: null, teamMissing: false }, 'unset team is null across the board');
  } finally {
    await server.stop();
  }
});

/* ---------- Phase 107 Task 1: operatorWorkspaces teams feed (SPA-05) ---------- */

test('GET /api/auth/operator/workspaces carries teams per workspace from the doc (SPA-05 feed)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const ws = acmeId(server);
    setDocTeams(server, ws.id, [{ id: 'team-alpha', name: 'Alpha Team' }, { id: 'team-beta', name: null }]);

    const res = await operator.get('/api/auth/operator/workspaces');
    assert.equal(res.status, 200);
    const row = res.data.workspaces.find(w => w.id === ws.id);
    assert.ok(row, 'the workspace row is missing');
    assert.deepEqual(row.teams, [{ id: 'team-alpha', name: 'Alpha Team' }, { id: 'team-beta', name: null }], 'the doc.teams do not ride the payload as {id,name} pairs');
    /* a workspace with NO doc teams carries an empty array (never undefined) */
    const joined = await signup(server.base, { name: 'Teams Feed 2', email: 'teamsfeed2@test.local' });
    await joined.client.post('/api/workspaces', { name: 'Teams Feed Co' });
    const res2 = await operator.get('/api/auth/operator/workspaces');
    const other = res2.data.workspaces.find(w => w.id !== ws.id);
    assert.ok(other && Array.isArray(other.teams) && other.teams.length === 0, 'a team-less workspace must carry an empty teams array');
  } finally {
    await server.stop();
  }
});

/* ---------- Phase 107 Task 3: the dead-mappings GET usage slice (SPA-04) ---------- */

test('dead-mappings GET returns {orphans, trail, usage}: usage rows camelCase with targetName, team verbs included, group_mapping_saved excluded (WR-83-03)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const ws = acmeId(server);
    const t = Date.now();
    insertTrail(server, { action: 'group_granted:group:d16b5a5b-1234-4abc-9d2e-abcdef012345', wsId: ws.id, createdAt: t - 3000 });
    insertTrail(server, { action: 'group_team_granted:group:22222222-2222-2222-2222-222222222222', wsId: ws.id, createdAt: t - 2000 });
    insertTrail(server, { action: 'group_membership_skipped:group:d16b5a5b-1234-4abc-9d2e-abcdef012345:guard-refused', wsId: ws.id, createdAt: t - 1000 });
    // a configuration row the escaped LIKE must NEVER pull in (Pitfall 3)
    insertTrail(server, { action: 'group_mapping_saved', wsId: ws.id, createdAt: t - 500 });

    const res = await operator.get('/api/auth/operator/dead-mappings');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.orphans) && Array.isArray(res.data.trail), 'orphans/trail shape broken');
    const usage = res.data.usage;
    assert.ok(Array.isArray(usage), 'the usage slice is missing');
    assert.equal(usage.length, 3, 'group_mapping_saved must NOT match the escaped LIKE');
    assert.equal(usage[0].action, 'group_membership_skipped:group:d16b5a5b-1234-4abc-9d2e-abcdef012345:guard-refused', 'usage is newest-first raw (no server transform, D-08)');
    for (const u of usage) {
      assert.ok('workspaceId' in u && 'targetName' in u && 'createdAt' in u, `the usage row is not camelCased: ${JSON.stringify(u)}`);
    }
    assert.equal(usage[0].targetName, 'sys', 'targetName populated from the audit row');
    assert.ok(usage.some(u => u.action.startsWith('group_team_granted:')), 'the 106-01 team verb must ride the usage slice');
    /* the trail SELECT carries the Who columns too (the dead-trail extension) */
    // the trail shape is untouched; usage is the new consumer
  } finally {
    await server.stop();
  }
});

test('locale parity: the three Phase 106 refusal keys exist in ALL 5 catalogues (GD-7 same-commit rule)', () => {
  const files = ['en', 'de', 'es', 'fr', 'nl'];
  const keys = ['err.groupMappingImmutable', 'err.groupMappingTeamUnknown', 'err.groupMappingDead'];
  for (const f of files) {
    const cat = JSON.parse(fs.readFileSync(new URL(`../src/locales/${f}.json`, import.meta.url), 'utf8'));
    for (const k of keys) {
      assert.ok(typeof cat[k] === 'string' && cat[k].length > 0, `${f}.json carries ${k}`);
    }
  }
});
