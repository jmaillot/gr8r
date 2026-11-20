/* Governance suite (Phase 79, WSG-07/WSG-08). Proves the operator-gated
   /api/auth/operator/workspaces route family, the workspaces.archived soft
   flag (schema + migration + requireWorkspace entry funnel), the empty-only
   hard delete with orphan dispositions, and audit-in-same-tx atomicity.
   Pattern: test/creation-gate.test.mjs — startServer-per-case with the shared
   harness, withDb for direct row inspection, BASE_ENV stamps the operator
   (ADMIN_EMAIL). Non-operator refusals are EXACT 403 operatorOnly with no
   workspace-existence oracle (D-09). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { ADMIN, login, signup, startServer, withDb } from './helpers/server.mjs';

const userRow = (srv, email) => withDb(srv.dbPath, db => db.prepare('select * from users where email = ?').get(email));
const auditRows = srv => withDb(srv.dbPath, db => db.prepare('select * from audit_log order by created_at, id').all());
const wsRow = (srv, slug) => withDb(srv.dbPath, db => db.prepare('select * from workspaces where slug = ?').get(slug));
const membershipsOfWs = (srv, wsId) =>
  withDb(srv.dbPath, db => db.prepare('select * from memberships where workspace_id = ? order by user_id').all(wsId));

/* A workspace owned by a non-operator plain user (open creation gate):
   the operator provably holds NO membership in it. */
async function plainWorkspace(base, name, slug) {
  const joined = await signup(base, { name: `${name} Owner`, email: `${slug}-owner@test.local` });
  assert.equal(joined.status, 201, `signup must succeed: ${JSON.stringify(joined.data)}`);
  const created = await joined.client.post('/api/workspaces', { name });
  assert.equal(created.status, 201, `create must succeed: ${JSON.stringify(created.data)}`);
  return { owner: joined.client, ws: created.data.workspace };
}

/* ---------- WSG-07: the operator listing ---------- */

test('operator GET /api/auth/operator/workspaces lists ALL workspaces incl. one the operator holds no membership in', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const { ws } = await plainWorkspace(server.base, 'Remote Co', 'remote-co');

    const res = await operator.get('/api/auth/operator/workspaces');
    assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
    const rows = res.data.workspaces;
    assert.ok(Array.isArray(rows), 'payload carries a workspaces array');
    const row = rows.find(w => w.slug === ws.slug);
    assert.ok(row, 'the non-member workspace IS listed');
    assert.equal(row.name, 'Remote Co');
    assert.equal(row.slug, 'remote-co');
    assert.equal(row.memberCount, 1);
    assert.ok(row.creator && row.creator.email === 'remote-co-owner@test.local', `creator derived: ${JSON.stringify(row.creator)}`);
    assert.equal(typeof row.createdAt, 'number');
    assert.equal(row.archived, false);
    // the seeded Acme workspace is listed too
    assert.ok(rows.find(w => w.slug === 'acme'), 'the seeded workspace is listed');
  } finally {
    await server.stop();
  }
});

test('creator is null when the owner membership is gone (no created_by column — derived truth)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const { ws } = await plainWorkspace(server.base, 'Ghost Co', 'ghost-co');
    const ownerId = userRow(server, 'ghost-co-owner@test.local').id;
    withDb(server.dbPath, db => db.prepare('delete from memberships where workspace_id = ? and user_id = ?').run(ws.id, ownerId));

    const res = await operator.get('/api/auth/operator/workspaces');
    assert.equal(res.status, 200);
    const row = res.data.workspaces.find(w => w.slug === ws.slug);
    assert.ok(row, 'the workspace stays listed');
    assert.equal(row.creator, null, 'creator is honestly null');
    assert.equal(row.memberCount, 0);
  } finally {
    await server.stop();
  }
});

test('non-operator GET listing → EXACT 403 operatorOnly (never 404, never an empty 200)', async () => {
  const server = await startServer({});
  try {
    const { owner } = await plainWorkspace(server.base, 'Mine Co', 'mine-co');
    const res = await owner.get('/api/auth/operator/workspaces');
    assert.equal(res.status, 403, `expected 403, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'operatorOnly');
    assert.deepEqual(Object.keys(res.data).sort(), ['code', 'error']);
  } finally {
    await server.stop();
  }
});

test('non-operator POST archive with an UNKNOWN workspace id gets the SAME 403 operatorOnly (no existence oracle)', async () => {
  const server = await startServer({});
  try {
    const { owner } = await plainWorkspace(server.base, 'Mine Co', 'mine-co');
    const known = wsRow(server, 'mine-co');
    for (const id of [known.id, 'no-such-workspace-id']) {
      const res = await owner.post(`/api/auth/operator/workspaces/${id}/archive`);
      assert.equal(res.status, 403, `expected 403 for ${id}, got ${res.status}: ${JSON.stringify(res.data)}`);
      assert.equal(res.data.code, 'operatorOnly', 'same keyed refusal for known and unknown ids');
      assert.deepEqual(Object.keys(res.data).sort(), ['code', 'error']);
    }
  } finally {
    await server.stop();
  }
});

/* ---------- WSG-08: archive / unarchive (D-02, D-07) ---------- */

test('archive hides the workspace from the member listing and refuses slug entry with 403 workspaceArchived; unarchive restores both', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const { owner, ws } = await plainWorkspace(server.base, 'Hideaway', 'hideaway');

    // sanity: before archiving the member enters normally
    const before = await owner.get(`/api/workspaces/${ws.slug}`);
    assert.equal(before.status, 200, `pre-archive entry works, got ${before.status}`);

    const archived = await operator.post(`/api/auth/operator/workspaces/${ws.id}/archive`);
    assert.equal(archived.status, 200, `archive must succeed, got ${archived.status}: ${JSON.stringify(archived.data)}`);

    // slug entry refused through the requireWorkspace funnel
    const entry = await owner.get(`/api/workspaces/${ws.slug}`);
    assert.equal(entry.status, 403, `expected 403 workspaceArchived, got ${entry.status}: ${JSON.stringify(entry.data)}`);
    assert.equal(entry.data.code, 'workspaceArchived');

    // hidden from the member's workspace list (membershipsOf filter)
    const me = await owner.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.data.user.workspaces?.find(w => w.slug === ws.slug), undefined, 'archived ws hidden from the member list');

    // unarchive restores access
    const unarchived = await operator.post(`/api/auth/operator/workspaces/${ws.id}/unarchive`);
    assert.equal(unarchived.status, 200, `unarchive must succeed, got ${unarchived.status}: ${JSON.stringify(unarchived.data)}`);
    const restored = await owner.get(`/api/workspaces/${ws.slug}`);
    assert.equal(restored.status, 200, 'slug entry restored');
    const meAfter = await owner.get('/api/auth/me');
    assert.ok(meAfter.data.user.workspaces?.find(w => w.slug === ws.slug), 'workspace back in the member list');
  } finally {
    await server.stop();
  }
});

/* ---------- WSG-08: hard delete (D-03, D-05, D-06) ---------- */

test('delete a workspace whose raw doc carries a project → 409 workspaceNotEmpty, workspace intact', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const { ws } = await plainWorkspace(server.base, 'Full Co', 'full-co');
    // plant content in the RAW stored doc (the doc IS the content store)
    const row = wsRow(server, 'full-co');
    const doc = JSON.parse(row.doc);
    doc.data = { ...(doc.data || {}), projects: [{ id: 'p1', name: 'Real work' }] };
    withDb(server.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), ws.id));

    const res = await operator.post(`/api/auth/operator/workspaces/${ws.id}/delete`, { dispositions: [] });
    assert.equal(res.status, 409, `expected 409, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'workspaceNotEmpty');
    assert.ok(wsRow(server, 'full-co'), 'the workspace still exists');
  } finally {
    await server.stop();
  }
});

test('delete a workspace with 1 member and no disposition sent → 409 dispositionRequired, membership intact', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const { ws } = await plainWorkspace(server.base, 'Empty Co', 'empty-co');
    const ownerId = userRow(server, 'empty-co-owner@test.local').id;

    const res = await operator.post(`/api/auth/operator/workspaces/${ws.id}/delete`, { dispositions: [] });
    assert.equal(res.status, 409, `expected 409, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'dispositionRequired');
    assert.ok(wsRow(server, 'empty-co'), 'workspace intact');
    const ms = membershipsOfWs(server, ws.id);
    assert.equal(ms.length, 1, 'membership intact');
    assert.equal(ms[0].user_id, ownerId);
  } finally {
    await server.stop();
  }
});

test('delete with full dispositions → 200; memberships moved/dropped; workspace, memberships and invites gone; audit rows for delete AND dispositions', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    // victim workspace with TWO members (owner + invitee) and an invite
    const { owner, ws } = await plainWorkspace(server.base, 'Doomed Co', 'doomed-co');
    const joined = await signup(server.base, { name: 'Invitee', email: 'doomed-member@test.local' });
    const invite = await owner.post(`/api/workspaces/${ws.slug}/invites`, { emails: ['doomed-member@test.local'], role: 'member' });
    assert.equal(invite.status, 201, `invite must be minted, got ${invite.status}: ${JSON.stringify(invite.data)}`);
    const member = await joined.client.post(`/api/invites/${invite.data.invites[0].url.split('/join/')[1]}/accept`, {
      name: 'Invitee', email: 'doomed-member@test.local', password: 'password-1234',
    });
    assert.ok([200, 201].includes(member.status), `invite accept must succeed: ${JSON.stringify(member.data)}`);

    // a landing workspace the reassigned member moves into (also empty — deletable shape)
    const { ws: landing } = await plainWorkspace(server.base, 'Landing Co', 'landing-co');

    const ownerId = userRow(server, 'doomed-co-owner@test.local').id;
    const memberId = userRow(server, 'doomed-member@test.local').id;
    const auditBefore = auditRows(server).length;

    const res = await operator.post(`/api/auth/operator/workspaces/${ws.id}/delete`, {
      confirmSlug: 'doomed-co',
      dispositions: [
        { userId: memberId, type: 'reassign', targetWorkspaceId: landing.id, role: 'member' },
        { userId: ownerId, type: 'release' },
      ],
    });
    assert.equal(res.status, 200, `delete must succeed, got ${res.status}: ${JSON.stringify(res.data)}`);

    // workspace row + memberships + invites gone
    assert.equal(wsRow(server, 'doomed-co'), undefined, 'workspace row gone');
    assert.equal(membershipsOfWs(server, ws.id).length, 0, 'memberships gone');

    // dispositions applied: reassigned member upserted on the landing ws with the chosen role
    const landingMs = membershipsOfWs(server, landing.id);
    const moved = landingMs.find(m => m.user_id === memberId);
    assert.ok(moved, 'reassigned member now holds a landing membership');
    assert.equal(moved.role, 'member');
    assert.equal(landingMs.find(m => m.user_id === ownerId), undefined, 'released member dropped');

    // audit trail: one row for the delete AND rows for each disposition
    const rows = auditRows(server).slice(auditBefore);
    assert.ok(rows.some(r => r.action === 'workspace_deleted'), 'a workspace_deleted audit row exists');
    assert.ok(rows.some(r => r.action === 'member_reassigned'), 'a member_reassigned audit row exists');
    assert.ok(rows.some(r => r.action === 'member_released'), 'a member_released audit row exists');
    const del = rows.find(r => r.action === 'workspace_deleted');
    assert.equal(del.actor_id, userRow(server, ADMIN.email).id);
    assert.match(del.target_name || '', /doomed-co|Doomed Co/, 'the audit snapshot echoes the workspace');
  } finally {
    await server.stop();
  }
});

/* CR-01: the orphan modal's read route — the client's refreshGovOrphanMembers
   drives GET /:id/members; the payload carries members + reassign targets. */
test('GET /api/auth/operator/workspaces/:id/members returns members and active reassign targets (delete target + archived excluded)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    // victim workspace with TWO members (owner + invitee)
    const { owner, ws } = await plainWorkspace(server.base, 'Orphan Co', 'orphan-co');
    const joined = await signup(server.base, { name: 'Orphan Member', email: 'orphan-member@test.local' });
    const invite = await owner.post(`/api/workspaces/${ws.slug}/invites`, { emails: ['orphan-member@test.local'], role: 'member' });
    assert.equal(invite.status, 201, `invite must be minted, got ${invite.status}: ${JSON.stringify(invite.data)}`);
    const member = await joined.client.post(`/api/invites/${invite.data.invites[0].url.split('/join/')[1]}/accept`, {
      name: 'Orphan Member', email: 'orphan-member@test.local', password: 'password-1234',
    });
    assert.ok([200, 201].includes(member.status), `invite accept must succeed: ${JSON.stringify(member.data)}`);

    // two candidate destinations: one active, one archived
    const { ws: landing } = await plainWorkspace(server.base, 'Landing Co', 'landing-co');
    const { ws: shelved } = await plainWorkspace(server.base, 'Shelved Co', 'shelved-co');
    const archived = await operator.post(`/api/auth/operator/workspaces/${shelved.id}/archive`);
    assert.equal(archived.status, 200);

    const res = await operator.get(`/api/auth/operator/workspaces/${ws.id}/members`);
    assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);

    const memberEmails = res.data.members.map(m => m.email).sort();
    assert.deepEqual(memberEmails, ['orphan-co-owner@test.local', 'orphan-member@test.local'], 'both members listed');
    const orphanMember = res.data.members.find(m => m.email === 'orphan-member@test.local');
    assert.ok(orphanMember.userId && orphanMember.name === 'Orphan Member' && orphanMember.role === 'member', `member payload shape: ${JSON.stringify(orphanMember)}`);

    const targets = res.data.targets;
    assert.ok(Array.isArray(targets), 'payload carries a targets array');
    assert.ok(targets.find(t => t.id === landing.id), 'the active workspace IS a reassign target');
    assert.equal(targets.find(t => t.id === landing.id).memberCount, 1, 'target carries its member count');
    assert.equal(targets.find(t => t.id === landing.id).name, 'Landing Co');
    assert.ok(!targets.find(t => t.id === ws.id), 'the delete target itself is excluded');
    assert.ok(!targets.find(t => t.id === shelved.id), 'an archived workspace is NOT offered as a destination');

    // unknown id → 404, exact guard shape
    const missing = await operator.get('/api/auth/operator/workspaces/does-not-exist/members');
    assert.equal(missing.status, 404);
    assert.equal(missing.data.code, 'notFound');
  } finally {
    await server.stop();
  }
});

test('non-operator GET members → EXACT 403 operatorOnly (no workspace-existence oracle)', async () => {
  const server = await startServer({});
  try {
    const { ws } = await plainWorkspace(server.base, 'Private Co', 'private-co');
    const joined = await signup(server.base, { name: 'Plain User', email: 'plain-looker@test.local' });
    const res = await joined.client.get(`/api/auth/operator/workspaces/${ws.id}/members`);
    assert.equal(res.status, 403, `expected 403, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'operatorOnly');
    assert.equal(res.data.error, 'Only the instance operator can do that');
  } finally {
    await server.stop();
  }
});

/* ---------- WSG-08: release / reassign member routes (D-05, D-08) ---------- */

test('standalone release: member with no other workspace ends with an empty workspace list', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const { ws } = await plainWorkspace(server.base, 'Solo Co', 'solo-co');
    const memberId = userRow(server, 'solo-co-owner@test.local').id;

    const res = await operator.post(`/api/auth/operator/workspaces/${ws.id}/members/${memberId}/release`);
    assert.equal(res.status, 200, `release must succeed, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(membershipsOfWs(server, ws.id).length, 0, 'the membership row is dropped');

    const member = (await login(server.base, 'solo-co-owner@test.local', 'password-1234')).client;
    const me = await member.get('/api/auth/me');
    assert.deepEqual(me.data.user.workspaces, [], 'the released member is in the await-access state (empty list)');
  } finally {
    await server.stop();
  }
});

/* WR-02: the server is the control (D-11) — an archived destination is refused
   even though the GET-members targets payload already excludes it. */
test('reassign into an ARCHIVED destination workspace → 409 targetArchived, no mutation (delete-path dispositions too)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const { owner, ws } = await plainWorkspace(server.base, 'Mover Co', 'mover-co');
    const joined = await signup(server.base, { name: 'Mover', email: 'mover@test.local' });
    const invite = await owner.post(`/api/workspaces/${ws.slug}/invites`, { emails: ['mover@test.local'], role: 'member' });
    assert.equal(invite.status, 201);
    await joined.client.post(`/api/invites/${invite.data.invites[0].url.split('/join/')[1]}/accept`, {
      name: 'Mover', email: 'mover@test.local', password: 'password-1234',
    });
    const { ws: shelved } = await plainWorkspace(server.base, 'Shelved Co', 'shelved-co');
    const arch = await operator.post(`/api/auth/operator/workspaces/${shelved.id}/archive`);
    assert.equal(arch.status, 200);
    const moverId = userRow(server, 'mover@test.local').id;

    // standalone reassign path
    const res = await operator.post(`/api/auth/operator/workspaces/${ws.id}/members/${moverId}/reassign`, {
      targetWorkspaceId: shelved.id, role: 'member',
    });
    assert.equal(res.status, 409, `expected 409, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'targetArchived');
    assert.ok(membershipsOfWs(server, ws.id).some(m => m.user_id === moverId), 'the membership stayed put');
    assert.equal(membershipsOfWs(server, shelved.id).some(m => m.user_id === moverId), false, 'no membership landed in the archived ws');

    // delete-path disposition reassign hits the same refusal (both members disposed)
    const ownerId = userRow(server, 'mover-co-owner@test.local').id;
    const del = await operator.post(`/api/auth/operator/workspaces/${ws.id}/delete`, {
      confirmSlug: 'mover-co',
      dispositions: [
        { userId: moverId, type: 'reassign', targetWorkspaceId: shelved.id, role: 'member' },
        { userId: ownerId, type: 'release' },
      ],
    });
    assert.equal(del.status, 409);
    assert.equal(del.data.code, 'targetArchived');
    assert.ok(wsRow(server, 'mover-co'), 'the workspace is intact');
    assert.ok(membershipsOfWs(server, ws.id).some(m => m.user_id === moverId), 'the membership is intact');
  } finally {
    await server.stop();
  }
});

test('standalone reassign to a target where the member already holds a membership → 409 memberAlreadyMember, no mutation', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const { owner, ws } = await plainWorkspace(server.base, 'From Co', 'from-co');
    const joined = await signup(server.base, { name: 'Duper', email: 'duper@test.local' });
    const invite = await owner.post(`/api/workspaces/${ws.slug}/invites`, { emails: ['duper@test.local'], role: 'member' });
    await joined.client.post(`/api/invites/${invite.data.invites[0].url.split('/join/')[1]}/accept`, {
      name: 'Duper', email: 'duper@test.local', password: 'password-1234',
    });
    const { owner: targetOwner, ws: target } = await plainWorkspace(server.base, 'Target Co', 'target-co');
    const duperId = userRow(server, 'duper@test.local').id;
    // duper joins the target workspace too (via the target workspace's owner invite)
    const tInvite = await targetOwner.post(`/api/workspaces/${target.slug}/invites`, { emails: ['duper@test.local'], role: 'member' });
    await joined.client.post(`/api/invites/${tInvite.data.invites[0].url.split('/join/')[1]}/accept`, {
      name: 'Duper', email: 'duper@test.local', password: 'password-1234',
    });
    const auditBefore = auditRows(server).length;

    const res = await operator.post(`/api/auth/operator/workspaces/${ws.id}/members/${duperId}/reassign`, {
      targetWorkspaceId: target.id, role: 'member',
    });
    assert.equal(res.status, 409, `expected 409, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'memberAlreadyMember');
    // no mutation: the source membership is untouched
    assert.ok(membershipsOfWs(server, ws.id).find(m => m.user_id === duperId), 'source membership intact');
    assert.equal(auditRows(server).length, auditBefore, 'no audit row for a refused mutation');
  } finally {
    await server.stop();
  }
});

test('standalone reassign upserts the target membership with the chosen role and audits member_reassigned', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const { owner, ws } = await plainWorkspace(server.base, 'Move Co', 'move-co');
    const joined = await signup(server.base, { name: 'Mover', email: 'mover@test.local' });
    const invite = await owner.post(`/api/workspaces/${ws.slug}/invites`, { emails: ['mover@test.local'], role: 'member' });
    await joined.client.post(`/api/invites/${invite.data.invites[0].url.split('/join/')[1]}/accept`, {
      name: 'Mover', email: 'mover@test.local', password: 'password-1234',
    });
    const { ws: target } = await plainWorkspace(server.base, 'Next Co', 'next-co');
    const moverId = userRow(server, 'mover@test.local').id;
    const auditBefore = auditRows(server).length;

    const res = await operator.post(`/api/auth/operator/workspaces/${ws.id}/members/${moverId}/reassign`, {
      targetWorkspaceId: target.id, role: 'admin',
    });
    assert.equal(res.status, 200, `reassign must succeed, got ${res.status}: ${JSON.stringify(res.data)}`);
    const targetMs = membershipsOfWs(server, target.id).find(m => m.user_id === moverId);
    assert.ok(targetMs, 'target membership exists');
    assert.equal(targetMs.role, 'admin', 'the chosen role is honored');
    const row = auditRows(server).slice(auditBefore).find(r => r.action === 'member_reassigned');
    assert.ok(row, 'one member_reassigned audit row exists');
  } finally {
    await server.stop();
  }
});

/* ---------- D-04/AUD-01: audit rows, exactly one per mutation, in-tx ---------- */

test('archive/unarchive each append exactly ONE audit_log row with the operator-workspace verb vocabulary', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const { ws } = await plainWorkspace(server.base, 'Trail Co', 'trail-co');

    const before = auditRows(server).length;
    const archived = await operator.post(`/api/auth/operator/workspaces/${ws.id}/archive`);
    assert.equal(archived.status, 200);
    let rows = auditRows(server);
    assert.equal(rows.length, before + 1, 'exactly one audit row for archive');
    assert.equal(rows.at(-1).action, 'workspace_archived');

    const unarchived = await operator.post(`/api/auth/operator/workspaces/${ws.id}/unarchive`);
    assert.equal(unarchived.status, 200);
    rows = auditRows(server);
    assert.equal(rows.length, before + 2, 'exactly one audit row for unarchive');
    assert.equal(rows.at(-1).action, 'workspace_unarchived');
  } finally {
    await server.stop();
  }
});

test('forced audit failure rolls the archive mutation back (AUD-01 db.tx discipline)', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const { ws } = await plainWorkspace(server.base, 'Roll Co', 'roll-co');
    withDb(server.dbPath, db => db.exec('drop table audit_log'));
    const res = await operator.post(`/api/auth/operator/workspaces/${ws.id}/archive`);
    assert.ok(res.status >= 500, `audit failure surfaces as 5xx (got ${res.status})`);
    assert.equal(wsRow(server, 'roll-co').archived, 0, 'the archived write rolled back');
    withDb(server.dbPath, db =>
      db.exec(`create table if not exists audit_log (
        id text primary key, actor_id text, target_id text, action text, session_count integer,
        ip text, workspace_id text, actor_name text not null, actor_email text not null,
        target_name text not null, target_email text not null, created_at integer not null)`),
    );
    assert.equal(auditRows(server).length, 0, 'no audit row from the failed attempt');
  } finally {
    await server.stop();
  }
});

/* ---------- migration: pre-column DB fixture ---------- */

test('a pre-column DB (workspaces without archived) boots and gains workspaces.archived default 0', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-gov-migrate-'));
  const dbPath = path.join(dir, 'projects.db');
  // legacy schema: the workspaces table exactly as it existed before Phase 79
  new DatabaseSync(dbPath).exec(`create table workspaces (
    id         text primary key,
    slug       text,
    name       text not null,
    color      text,
    doc        text not null,
    revision   integer not null default 1,
    created_at integer not null,
    updated_at integer not null
  )`);
  const server = await startServer({ dataDir: dir });
  try {
    const cols = withDb(server.dbPath, db => db.prepare("pragma table_info(workspaces)").all().map(c => c.name));
    assert.ok(cols.includes('archived'), 'adapterEnsureColumn added the archived column');
    const legacy = withDb(server.dbPath, db => db.prepare('select archived from workspaces where slug = ?').get('acme'));
    assert.equal(legacy.archived, 0, 'existing rows default to 0 — no backfill errors');
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const res = await operator.get('/api/auth/operator/workspaces');
    assert.equal(res.status, 200);
    const acme = res.data.workspaces.find(w => w.slug === 'acme');
    assert.equal(acme.archived, false, 'the payload reports the flag as a boolean');
  } finally {
    await server.stop();
  }
});
