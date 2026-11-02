/* Phase 29 SCOPE-01: the membership scope substrate, proven end-to-end over
   HTTP on its own isolated server (the shared membership suite spends its own
   invite-accept throttle budget; this suite spends exactly one accept).

   Tracer slice: admin sets a scope on a member-role account → the member's
   doc GET omits out-of-scope projects and every dependent list rides the same
   funnel → a stale doc PUT cannot resurrect out-of-scope rows → admin targets
   are refused (D-04) and scope details are never projected (D-05). */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { after, before, test } from 'node:test';
import { ADMIN, inviteToken, login, signup, startServer, withDb } from './helpers/server.mjs';

const PASSWORD = 'scope-password-1';
const ACCOUNT = (name, email) => ({ name, email, password: PASSWORD });
/* Test token for the internal reminder-pass route (family-5 matrix probes). */
const SCOPE_TOKEN = 'scope-reminder-token';

let server;
let owner;
let scoped;
let scopedUserId;
let ownerId;

const storedDoc = () => JSON.parse(withDb(server.dbPath, db => db.prepare('select doc from workspaces where slug = ?').get('acme').doc));
const scopeOf = userId =>
  withDb(server.dbPath, db => db.prepare('select scope from memberships where workspace_id = ? and user_id = ?').get(server.wsId, userId).scope);

before(async () => {
  // REMINDER_TEST_TOKEN enables the test-only reminder-pass route — the
  // family-5 matrix probes drive it (see the SCOPE-04 block below).
  server = await startServer({ env: { REMINDER_TEST_TOKEN: SCOPE_TOKEN } });
  const signedIn = await login(server.base, ADMIN.email, ADMIN.password);
  assert.equal(signedIn.status, 200, 'bootstrap owner signs in');
  owner = signedIn.client;

  // Shape the workspace: 2 public + 2 private projects, 2 team definitions,
  // one task in each public project.
  const live = (await owner.get('/api/workspaces/acme')).data;
  server.wsId = live.id;
  const ownerIdRow = (await owner.get('/api/workspaces/acme/members')).data.members.find(m => m.email === ADMIN.email);
  ownerId = ownerIdRow.userId;
  const doc = structuredClone(live.doc);
  doc.data.projects = [
    { id: 'p_in', key: 'in', name: 'In Scope', private: false, members: [], teams: [] },
    { id: 'p_out', key: 'out', name: 'Out of Scope', private: false, members: [], teams: [] },
    { id: 'p_priv1', key: 'prv1', name: 'Private One', private: true, members: [ownerIdRow.memberId], lead: ownerIdRow.memberId, teams: [] },
    { id: 'p_priv2', key: 'prv2', name: 'Private Two', private: true, members: [ownerIdRow.memberId], lead: ownerIdRow.memberId, teams: ['team_a'] },
  ];
  doc.data.projOrder = ['p_in', 'p_out', 'p_priv1', 'p_priv2'];
  doc.data.teams = [
    { id: 'team_a', name: 'Alpha', members: [] },
    { id: 'team_b', name: 'Beta', members: [] },
  ];
  doc.data.tasks = [
    { id: 't_in', project: 'p_in', title: 'Visible task', status: 'todo', labels: [], subtasks: [] },
    { id: 't_out', project: 'p_out', title: 'Hidden task', status: 'todo', labels: [], subtasks: [] },
  ];
  assert.equal((await owner.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);

  // One member-role membership, joined via invite (1 of 5 accept budget).
  const [inv] = (await owner.post('/api/workspaces/acme/invites', { emails: ['scoped@test.local'], role: 'member' })).data.invites;
  scoped = (await signup(server.base, ACCOUNT('Scoped', 'scoped@test.local'))).client;
  const joined = await scoped.post(`/api/invites/${inviteToken(inv.url)}/accept`);
  assert.ok([200, 201].includes(joined.status), 'the member joined');
  scopedUserId = (await owner.get('/api/workspaces/acme/members')).data.members.find(m => m.email === 'scoped@test.local').userId;
});

after(async () => {
  await server?.stop();
});

test('the scope columns exist on memberships and invites', () => {
  for (const table of ['memberships', 'invites']) {
    const cols = withDb(server.dbPath, db => db.prepare(`pragma table_info(${table})`).all().map(c => c.name));
    assert.ok(cols.includes('scope'), `${table}.scope exists after boot`);
  }
});

test('the admin can set a project scope on a member and it lands in the authority row', async () => {
  const res = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: { projects: ['p_in'], teams: [] } });
  assert.equal(res.status, 200);
  assert.equal('revision' in res.data, false, 'a membership route never claims a doc revision (TEAM-05 precondition)');
  assert.equal('scope' in res.data.member, false, 'the payload never projects scope details (D-05)');
  assert.deepEqual(JSON.parse(scopeOf(scopedUserId)), { teams: [], projects: ['p_in'] }, 'the scope JSON is stored');
});

test('the workspace document is byte-unchanged by a scope write', async () => {
  // The scope route never touches the doc: its revision stayed where the
  // fixture PUT left it, and the stored doc still lists every project.
  const doc = storedDoc();
  assert.deepEqual(
    doc.data.projects.map(p => p.id),
    ['p_in', 'p_out', 'p_priv1', 'p_priv2'],
    'no project row was moved or removed',
  );
  assert.equal(doc.data.tasks.some(t => t.id === 't_out'), true, 'the stored task set is intact');
});

test("a scoped member's doc GET omits out-of-scope projects and every dependent list", async () => {
  const view = (await scoped.get('/api/workspaces/acme')).data;
  assert.deepEqual(
    view.doc.data.projects.map(p => p.id),
    ['p_in'],
    'only the in-scope project survives the read',
  );
  assert.deepEqual(
    view.doc.data.tasks.map(t => t.id),
    ['t_in'],
    'out-of-scope tasks ride the same funnel',
  );
  assert.equal(view.doc.data.projOrder.includes('p_out'), false, 'projOrder is redacted too');
});

test('a scoped doc PUT cannot resurrect out-of-scope rows', async () => {
  const live = (await scoped.get('/api/workspaces/acme')).data;
  const doc = structuredClone(live.doc);
  doc.data.tasks.push({ id: 't_evil', project: 'p_out', title: 'Resurrected', status: 'todo', labels: [], subtasks: [] });
  doc.data.projects.push({ id: 'p_out', key: 'out', name: 'Out of Scope', private: false, members: [], teams: [] });
  const saved = await scoped.put('/api/workspaces/acme', { revision: live.revision, doc });
    assert.equal(saved.status, 200, "the merge is silent, not an error");

  const stored = storedDoc();
  assert.equal(stored.data.tasks.some(t => t.id === 't_evil'), false, 'the out-of-scope task never landed');
  assert.equal(stored.data.tasks.some(t => t.id === 't_out'), true, 'the reserved task is held by the merge');
});

test('a scope write to an admin or owner target is rejected (D-04)', async () => {
  const res = await owner.put(`/api/workspaces/acme/members/${ownerId}/scope`, { scope: { projects: ['p_in'], teams: [] } });
  assert.equal(res.status, 400);
  assert.equal(res.data.code, 'scopeNotAllowed');
  assert.equal(scopeOf(ownerId), null, 'the admin row stays untouched');
});

test('stored scope JSON can never blind an admin (D-04, server-side predicate)', async () => {
  // Plant the scope directly — the route refuses this shape, proving the
  // defense is the projectScope() predicate itself, not just the route gate.
  withDb(server.dbPath, db =>
    db.prepare('update memberships set scope = ? where workspace_id = ? and user_id = ?').run('{"projects":["p_out"]}', server.wsId, ownerId),
  );
  const view = (await owner.get('/api/workspaces/acme')).data;
  assert.equal(
    view.doc.data.projects.some(p => p.id === 'p_out'),
    true,
    'the owner still sees the project the planted scope would hide',
  );
  assert.equal(
    view.doc.data.projects.some(p => p.id === 'p_priv1'),
    true,
    'the owner still sees private projects',
  );
  withDb(server.dbPath, db => db.prepare('update memberships set scope = null where workspace_id = ? and user_id = ?').run(server.wsId, ownerId));
});

test('non-array teams and projects are refused with the shape errors', async () => {
  assert.equal((await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: { teams: 'x', projects: [] } })).status, 400, 'teamsRequired');
  assert.equal(
    (await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: { teams: [], projects: 'p_in' } })).status,
    400,
    'projectsRequired',
  );
  assert.equal((await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: 'p_in' })).status, 400, 'scopeRequired');
  assert.equal((await owner.put('/api/workspaces/acme/members/not-a-user/scope', { scope: null })).status, 404, 'notAMember');
  // The refused writes stored nothing.
  assert.deepEqual(JSON.parse(scopeOf(scopedUserId)), { teams: [], projects: ['p_in'] });
});

test('an explicit null scope restores workspace-wide reach', async () => {
  const res = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: null });
  assert.equal(res.status, 200);
  assert.equal(scopeOf(scopedUserId), null, 'null is stored, not an empty JSON object');
  const view = (await scoped.get('/api/workspaces/acme')).data;
  assert.equal(view.doc.data.projects.some(p => p.id === 'p_out'), true, 'the member sees the whole workspace again');
});

test('a member cannot edit scopes at all', async () => {
  const res = await scoped.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: { projects: ['p_out'], teams: [] } });
  assert.equal(res.status, 403, 'requireWorkspace(admin) gates the route');
});

/* ---- Phase 29 task 2: full validation — whitelists, caps, D-04 promotion ---- */

test('scope ids are whitelisted against the workspace document (T-29-01)', async () => {
  // Known baseline, so "nothing stored" below is provable.
  assert.equal((await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: { teams: ['team_a'], projects: ['p_in'] } })).status, 200);

  const ghostTeam = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: { teams: ['ghost-team'], projects: ['p_in'] } });
  assert.equal(ghostTeam.status, 400);
  assert.equal(ghostTeam.data.code, 'unknownTeam');

  const ghostProject = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: { teams: ['team_a'], projects: ['ghost-project'] } });
  assert.equal(ghostProject.status, 400);
  assert.equal(ghostProject.data.code, 'unknownProject');

  // The refused writes stored nothing.
  assert.deepEqual(JSON.parse(scopeOf(scopedUserId)), { teams: ['team_a'], projects: ['p_in'] });
});

test('scope caps mirror the teams cap (25 per list)', async () => {
  const tooManyProjects = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, {
    scope: { teams: [], projects: Array.from({ length: 26 }, (_, i) => `p_${i}`) },
  });
  assert.equal(tooManyProjects.status, 400);
  assert.equal(tooManyProjects.data.code, 'tooManyProjects');

  const tooManyTeams = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, {
    scope: { teams: Array.from({ length: 26 }, (_, i) => `t_${i}`), projects: [] },
  });
  assert.equal(tooManyTeams.status, 400);
  assert.equal(tooManyTeams.data.code, 'tooManyTeams');
  assert.deepEqual(JSON.parse(scopeOf(scopedUserId)), { teams: ['team_a'], projects: ['p_in'] }, 'still nothing stored');
});

test('scope lists are trimmed, sliced and deduped like the teams route', async () => {
  const res = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, {
    scope: { teams: [' team_a ', 'team_a', 'x'.repeat(60)], projects: [' p_in ', 'p_in'] },
  });
  assert.equal(res.status, 400, "a 60-char team id slices to 40 and misses the whitelist");
  const trimmed = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, {
    scope: { teams: [' team_a ', 'team_a'], projects: [' p_in ', 'p_in'] },
  });
  assert.equal(trimmed.status, 200);
  assert.deepEqual(JSON.parse(scopeOf(scopedUserId)), { teams: ['team_a'], projects: ['p_in'] }, 'trimmed and deduped before the whitelist');
});

test('the route is scope-explicit: an absent scope field is a 400', async () => {
  const res = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, {});
  assert.equal(res.status, 400);
  assert.equal(res.data.code, 'scopeRequired');
});

test('promoting a scoped member to admin clears the scope in the same transaction (D-04)', async () => {
  assert.deepEqual(JSON.parse(scopeOf(scopedUserId)), { teams: ['team_a'], projects: ['p_in'] }, 'precondition: a scope is stored');

  const promoted = await owner.patch(`/api/workspaces/acme/members/${scopedUserId}`, { role: 'admin' });
  assert.equal(promoted.status, 200);
  assert.equal(scopeOf(scopedUserId), null, 'promotion nulled the scope transactionally');

  // And the now-admin target can carry no scope either way (D-04).
  const rescope = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: { projects: ['p_in'], teams: [] } });
  assert.equal(rescope.status, 400);
  assert.equal(rescope.data.code, 'scopeNotAllowed');

  const demoted = await owner.patch(`/api/workspaces/acme/members/${scopedUserId}`, { role: 'member' });
  assert.equal(demoted.status, 200, 'back to member for the suite');
});

/* ---- Phase 29 Plan 02 task 1: the D-03 grant truth table ----

   For a scoped member, the scope OPENS projects inside its reach — the grant
   terms short-circuit the private check (D-03), and a team scope reaches the
   scoped teams' projects including private team-linked ones (A1 union read).
   Workspace-wide (null scope) members keep the pre-phase canSeeProject path. */

let scopedMemberId;

test('truth-table fixture: the scoped member joins a private project access list', async () => {
  scopedMemberId = (await owner.get('/api/workspaces/acme/members')).data.members.find(m => m.email === 'scoped@test.local').memberId;
  const live = (await owner.get('/api/workspaces/acme')).data;
  const doc = structuredClone(live.doc);
  doc.data.projects.find(p => p.id === 'p_priv1').members.push(scopedMemberId);
  assert.equal((await owner.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);
});

const truthTable = [
  { name: 'public + in-scope', scope: { projects: ['p_in'], teams: [] }, expected: ['p_in'] },
  { name: 'public + out-of-scope', scope: { projects: ['p_out'], teams: [] }, expected: ['p_out'] },
  {
    name: 'private + in-scope + on the access list',
    scope: { projects: ['p_priv1'], teams: [] },
    expected: ['p_priv1'],
  },
  {
    name: 'private + in-scope + OFF the access list (D-03 grant, guest-critical)',
    scope: { projects: ['p_priv2'], teams: [] },
    expected: ['p_priv2'],
  },
  {
    name: 'private + out-of-scope + on the access list (out-of-scope still wins)',
    scope: { projects: ['p_in'], teams: [] },
    expected: ['p_in'],
  },
  {
    name: 'team scope covering a private team-linked project (A1 union read)',
    scope: { projects: [], teams: ['team_a'] },
    expected: ['p_priv2'],
  },
];

for (const cell of truthTable) {
  test(`D-03 truth table: ${cell.name} → [${cell.expected.join(', ')}]`, async () => {
    const res = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: cell.scope });
    assert.equal(res.status, 200, 'the scope lands');
    const view = (await scoped.get('/api/workspaces/acme')).data;
    assert.deepEqual(
      view.doc.data.projects.map(p => p.id),
      cell.expected,
      `${cell.name}: visibility must be exactly the expected set`,
    );
  });
}

/* ---- Phase 29 Plan 04 task 1: invite-carried scope (SCOPE-05, D-04, D-13) ----

   The invite POST accepts body.scope with validation identical to the member
   scope route; a viewer invite carrying a projects scope is the guest path and
   must carry exactly one project; admin/owner invites never carry scope. The
   scope lands on the membership at acceptance — the guest's first doc GET is
   already filtered. This block spends the second accept of this server's
   invite budget (5/IP/hour). */

let guest;
let guestUserId;

test('an invite carrying a multi-project viewer scope is refused (D-13 guestSingleProject)', async () => {
  const res = await owner.post('/api/workspaces/acme/invites', {
    emails: ['guest@test.local'],
    role: 'viewer',
    scope: { projects: ['p_in', 'p_out'], teams: [] },
  });
  assert.equal(res.status, 400);
  assert.equal(res.data.code, 'guestSingleProject');
});

test('invite scope ids are whitelisted and shaped like the member scope route', async () => {
  const ghost = await owner.post('/api/workspaces/acme/invites', { emails: ['guest@test.local'], role: 'member', scope: { projects: ['p_ghost'], teams: [] } });
  assert.equal(ghost.status, 400);
  assert.equal(ghost.data.code, 'unknownProject');
  const ghostTeam = await owner.post('/api/workspaces/acme/invites', { emails: ['guest@test.local'], role: 'member', scope: { projects: ['p_in'], teams: ['ghost-team'] } });
  assert.equal(ghostTeam.status, 400);
  assert.equal(ghostTeam.data.code, 'unknownTeam');
  const malformed = await owner.post('/api/workspaces/acme/invites', { emails: ['guest@test.local'], role: 'member', scope: 'p_in' });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.data.code, 'scopeRequired');
  const missingTeams = await owner.post('/api/workspaces/acme/invites', { emails: ['guest@test.local'], role: 'member', scope: { projects: [] } });
  assert.equal(missingTeams.status, 400);
  assert.equal(missingTeams.data.code, 'teamsRequired');
  const missingProjects = await owner.post('/api/workspaces/acme/invites', { emails: ['guest@test.local'], role: 'member', scope: { teams: [] } });
  assert.equal(missingProjects.status, 400);
  assert.equal(missingProjects.data.code, 'projectsRequired');
  const capped = await owner.post('/api/workspaces/acme/invites', {
    emails: ['guest@test.local'],
    role: 'member',
    scope: { teams: [], projects: Array.from({ length: 26 }, (_, i) => `p_${i}`) },
  });
  assert.equal(capped.status, 400);
  assert.equal(capped.data.code, 'tooManyProjects');
});

test('an admin or owner invite never carries scope (D-04 scopeNotAllowed)', async () => {
  // inviteRole() has no owner tier — 'owner' degrades to member — so the admin
  // invite is the expressible elevation path; the server gate covers both ranks.
  const res = await owner.post('/api/workspaces/acme/invites', { emails: ['guest@test.local'], role: 'admin', scope: { projects: ['p_in'], teams: [] } });
  assert.equal(res.status, 400, 'admin + scope refused');
  assert.equal(res.data.code, 'scopeNotAllowed');
});

test('invite fixture: a guest invite (viewer + exactly one PRIVATE project) is created and accepted', async () => {
  const [inv] = (
    await owner.post('/api/workspaces/acme/invites', {
      emails: ['guest@test.local'],
      role: 'viewer',
      scope: { projects: ['p_priv2'], teams: [] },
    })
  ).data.invites;
  assert.equal(inv.role, 'viewer', 'the guest is a viewer (D-13: no new role)');
  const storedScope = withDb(server.dbPath, db =>
    db.prepare('select scope from invites where token_hash = ?').get(createHash('sha256').update(inviteToken(inv.url)).digest('hex')),
  );
  assert.deepEqual(JSON.parse(storedScope.scope), { teams: [], projects: ['p_priv2'] }, 'the scope JSON is stored on the invite row');
  guest = (await signup(server.base, ACCOUNT('Guest', 'guest@test.local'))).client;
  const joined = await guest.post(`/api/invites/${inviteToken(inv.url)}/accept`);
  assert.ok([200, 201].includes(joined.status), 'the guest joined');
  guestUserId = (await owner.get('/api/workspaces/acme/members')).data.members.find(m => m.email === 'guest@test.local').userId;
});

test('acceptance lands the invite scope on the membership (SCOPE-05)', async () => {
  assert.deepEqual(JSON.parse(scopeOf(guestUserId)), { teams: [], projects: ['p_priv2'] }, 'the membership row carries the invite scope');
});

test('CR-01: the invites payload projects scope and a resend preserves it (no silent strip)', async () => {
  const scope = { teams: [], projects: ['p_in'] };
  const [inv] = (await owner.post('/api/workspaces/acme/invites', { emails: ['resend-scope@test.local'], role: 'member', scope })).data.invites;
  // The projection the admin UI's resend echoes back must carry the scope.
  const listed = (await owner.get('/api/workspaces/acme/invites')).data.invites.find(i => i.id === inv.id);
  assert.deepEqual(listed?.scope, scope, 'GET /invites projects the stored scope');
  // Resend = a fresh POST for the same address (one live invite replaces the previous one).
  const [resent] = (await owner.post('/api/workspaces/acme/invites', { emails: ['resend-scope@test.local'], role: 'member', scope: listed.scope })).data.invites;
  assert.notEqual(resent.id, inv.id, 'the resend replaced the original invite');
  const stored = withDb(server.dbPath, db =>
    db.prepare('select scope from invites where token_hash = ?').get(createHash('sha256').update(inviteToken(resent.url)).digest('hex')),
  );
  assert.deepEqual(JSON.parse(stored.scope), scope, 'the resent invite row still carries the scope');
});

test('the guest sees exactly their one private project and nothing else (D-03 grant, D-14)', async () => {
  const view = (await guest.get('/api/workspaces/acme')).data;
  assert.deepEqual(view.doc.data.projects.map(p => p.id), ['p_priv2'], 'exactly one project survives the read — the private grant included');
  assert.deepEqual(view.doc.data.tasks, [], 'no out-of-scope tasks ride along');
  // D-14: the guest is a viewer — writes are refused by the existing role gate.
  const live = (await guest.get('/api/workspaces/acme')).data;
  const doc = structuredClone(live.doc);
  doc.data.tasks.push({ id: 't_guest', project: 'p_priv2', title: 'Guest write', status: 'todo', labels: [], subtasks: [] });
  const put = await guest.put('/api/workspaces/acme', { revision: live.revision, doc });
  assert.equal(put.status, 403, 'viewer semantics reject the write');
  assert.equal(put.data.code, 'readOnlyAccess');
});

test('an invite without a scope field leaves memberships.scope null (unscooped regression)', async () => {
  // A dedicated unscooped invite+accept (3rd accept of this server's budget):
  // the membership must land workspace-wide when the invite carried no scope.
  const [inv] = (await owner.post('/api/workspaces/acme/invites', { emails: ['plain@test.local'], role: 'member' })).data.invites;
  const plain = (await signup(server.base, ACCOUNT('Plain', 'plain@test.local'))).client;
  const joined = await plain.post(`/api/invites/${inviteToken(inv.url)}/accept`);
  assert.ok([200, 201].includes(joined.status), 'the member joined');
  const plainUserId = (await owner.get('/api/workspaces/acme/members')).data.members.find(m => m.email === 'plain@test.local').userId;
  assert.equal(scopeOf(plainUserId), null, 'no scope stored for an unscooped invite');
  const view = (await plain.get('/api/workspaces/acme')).data;
  assert.equal(view.doc.data.projects.some(p => p.id === 'p_out'), true, 'unscooped member keeps the workspace-wide view');
});

test('a workspace document is byte-unchanged by an invite carrying scope', () => {
  assert.equal(storedDoc().data.projects.length, 4, 'the scope never enters the workspace document');
});

test('null-scope membership keeps the pre-phase workspace-wide view (regression)', async () => {
  assert.equal((await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: null })).status, 200);
  const view = (await scoped.get('/api/workspaces/acme')).data;
  // Pre-phase semantics: everything except private projects the member is not
  // on the access list of. The fixture put them on p_priv1's list only.
  assert.deepEqual(view.doc.data.projects.map(p => p.id), ['p_in', 'p_out', 'p_priv1']);
});

/* ---- Phase 29 Plan 02 task 2: the file-serve side door ----

   File binaries ride /w/:slug/file/:id OUTSIDE the doc funnel, so the
   record.project visibility check has to happen in serveFileBinary itself
   (T-29-05) — unknown, foreign and out-of-scope ids must answer the same
   byte-identical 404 fileNotFound (no existence oracle). */

/* Plant a file record (metadata rides the doc channel) and its binary. */
async function plantScopedFile(id, projectId) {
  const bytes = Buffer.from(`${id}:${projectId}:gr8r-scope-matrix`, 'utf8');
  fs.writeFileSync(path.join(server.dataDir, 'files', id), bytes);
  const live = (await owner.get('/api/workspaces/acme')).data;
  const doc = structuredClone(live.doc);
  doc.data.files = Array.isArray(doc.data.files) ? doc.data.files : [];
  doc.data.files.push({ id, name: `${id}.txt`, size: bytes.length, type: 'txt', project: projectId });
  const res = await owner.put('/api/workspaces/acme', { revision: live.revision, doc });
  assert.equal(res.status, 200, `plant ${id} on ${projectId}`);
  return bytes;
}

/* The harness client is JSON-only; file GETs are plain fetch with the cookie. */
const fileGet = (cl, id) => fetch(`${server.base}/w/acme/file/${id}`, { headers: { cookie: cl.cookie() } });

test('file-serve fixture: records planted on in-scope, out-of-scope and private projects', async () => {
  await plantScopedFile('f_in', 'p_in');
  await plantScopedFile('f_out', 'p_out');
  await plantScopedFile('f_priv1', 'p_priv1');
  await plantScopedFile('f_priv2', 'p_priv2');
});

test('a scoped member downloads an in-scope file (200 with the exact bytes)', async () => {
  assert.equal(
    (await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: { projects: ['p_in'], teams: [] } })).status,
    200,
  );
  const res = await fileGet(scoped, 'f_in');
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'f_in:p_in:gr8r-scope-matrix');
});

test('an out-of-scope file answers the byte-identical unknown-id 404 (no oracle)', async () => {
  const out = await fileGet(scoped, 'f_out');
  const unknown = await fileGet(scoped, 'f_missing');
  assert.equal(out.status, 404);
  assert.equal(unknown.status, 404);
  const outBody = await out.json();
  const unknownBody = await unknown.json();
  assert.equal(outBody.code, 'fileNotFound');
  assert.equal(unknownBody.code, 'fileNotFound');
  assert.equal(outBody.error, unknownBody.error, 'status AND code AND message are identical');
});

test('an in-scope private project file is visible to the scoped member (D-03 rides the side door too)', async () => {
  // scope = { projects: ['p_in'] } from the previous cell: p_priv1 is
  // out-of-scope here, so flip to the grant scope first.
  assert.equal(
    (await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: { projects: ['p_priv1'], teams: [] } })).status,
    200,
  );
  const res = await fileGet(scoped, 'f_priv1');
  assert.equal(res.status, 200, 'the grant opens the private project and its files');
  assert.equal(await res.text(), 'f_priv1:p_priv1:gr8r-scope-matrix');
});

test('a workspace-wide outsider hits the closed gap: private-project file now 404s (pre-existing hole)', async () => {
  // Restore the pre-phase reach: null scope. The member is on p_priv1's
  // access list, so use p_priv2 (private, off-list) — previously this served
  // bytes to ANY member with the id.
  assert.equal((await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: null })).status, 200);
  const res = await fileGet(scoped, 'f_priv2');
  assert.equal(res.status, 404);
  assert.equal((await res.json()).code, 'fileNotFound');
});

/* ---- Phase 29 Plan 02 task 3: the named 404-matrix (SCOPE-03) ----

   Table-driven sweep: family → probe (in-scope id / out-of-scope known id /
   unknown id) → expected outcome, all driven by one fixture member holding
   scope { projects: ['p_in'], teams: [] }. Unknown ≡ out-of-scope must be
   byte-identical wherever a status exists (no existence oracle, T-29-06).

   Checked, NOT affected (no probe needed):
   - family 3 (file upload): metadata rides the doc channel — family 2's
     write guard covers what a caller can attach;
   - family 7 (members roster): D-05 keeps it unfiltered; the full roster is
     shown and scope details are never projected — scope edits are
     admin-gated authority writes;
   - family 8 (workspace meta): D-08 untouched — no project surface.

   Family 6 is live below (Plan 29-04): the invite-carried scope probes. A
   new project-touching family added later must visibly extend this table. */

const MATRIX = [
  {
    family: 1,
    name: 'doc GET omission (the 404-equivalent is absence from the payload)',
    kind: 'doc-get',
    expected: { inScope: 'present', outOfScope: 'absent', unknown: 'absent' },
  },
  {
    family: 2,
    name: 'doc PUT rejection/rollback (out-of-scope rows never land)',
    kind: 'doc-put',
    expected: { inScope: 'lands', outOfScope: 'reserved', unknown: null },
  },
  {
    family: 4,
    name: 'file serve (byte-identical 404 fileNotFound)',
    kind: 'file',
    expected: { inScope: 200, outOfScope: 404, unknown: 404 },
  },
  {
    family: 5,
    name: 'reminder pass (server send-time skip, SCOPE-04)',
    kind: 'reminder',
    expected: { inScope: 'reminded', outOfScope: 'skipped', unknown: null },
    skipUnknown: 'reminders address tasks, not raw project ids — no unknown probe exists',
  },
  {
    family: 5,
    name: 'notification fan-out (client emit pre-filter, A4)',
    kind: 'fanout',
    expected: { inScope: 'present', outOfScope: 'absent', unknown: null },
    skipUnknown: 'notifications address members and tasks, not raw project ids — no unknown probe exists',
  },
  {
    family: 6,
    name: 'invite-carried scope (SCOPE-05: invites.scope stored; unknown id refused, T-29-12)',
    kind: 'invite',
    expected: { inScope: 'stored', outOfScope: 'stored', unknown: 'refused' },
  },
];

const MATRIX_SCOPE = { projects: ['p_in'], teams: [] };
const MATRIX_OUT_ID = 'p_out';
const MATRIX_UNKNOWN_ID = 'p_ghost';
const MATRIX_FILES = { inScope: 'f_in', outOfScope: 'f_out', unknown: 'f_missing' };
const MATRIX_PROJECTS = { inScope: 'p_in', outOfScope: MATRIX_OUT_ID, unknown: MATRIX_UNKNOWN_ID };

/* One helper drives every family with the same fixture member. */
const matrixProbe = {
  'doc-get': async probe => {
    const view = (await scoped.get('/api/workspaces/acme')).data;
    const present = view.doc.data.projects.some(p => p.id === MATRIX_PROJECTS[probe])
      || view.doc.data.tasks.some(t => t.project === MATRIX_PROJECTS[probe])
      || view.doc.data.files.some(f => f.project === MATRIX_PROJECTS[probe]);
    return present ? 'present' : 'absent';
  },
  'doc-put': async probe => {
    if (probe === 'unknown') return null; // dangling-project write semantics pre-date this phase; not a scope hole
    const tid = `t_matrix_${probe}`;
    const live = (await scoped.get('/api/workspaces/acme')).data;
    const doc = structuredClone(live.doc);
    doc.data.tasks.push({ id: tid, project: MATRIX_PROJECTS[probe], title: 'matrix probe', status: 'todo', labels: [], subtasks: [] });
    const saved = await scoped.put('/api/workspaces/acme', { revision: live.revision, doc });
    assert.equal(saved.status, 200, "the merge is silent, not an error");
    const landed = storedDoc().data.tasks.some(t => t.id === tid);
    return landed ? 'lands' : 'reserved';
  },
  file: async probe => {
    const res = await fileGet(scoped, MATRIX_FILES[probe]);
    const body = res.status === 200 ? null : await res.json();
    return { status: res.status, code: body?.code ?? null, error: body?.error ?? null };
  },
  reminder: async probe => {
    if (probe === 'unknown') return null;
    plantReminderProbes();
    const emitted = await triggerReminders(server, at9('2027-04-20'));
    const rows = emitted.filter(n => n.type === 'due_reminder');
    const tid = probe === 'inScope' ? 't_m_rem_in' : 't_m_rem_out';
    return rows.some(n => n.task === tid) ? 'reminded' : 'skipped';
  },
  fanout: async probe => {
    if (probe === 'unknown') return null;
    clientDoc();
    const targets = clientEmitMentions('@Ann Marker @Bill Plain', { id: 't_matrix_fan', project: MATRIX_PROJECTS[probe] });
    assert.ok(targets.has('m_plain'), 'the default-allow (underivable) target is never dropped');
    return targets.has('m_marked') ? 'present' : 'absent';
  },
  /* Family 6 (29-04): the invite POST is not caller-scope-gated — any doc
     project id is a valid invite scope for an admin (T-29-14: the stored
     scope is what the admin validated). The unknown id stays refused. */
  invite: async probe => {
    const scope = { teams: [], projects: [MATRIX_PROJECTS[probe]] };
    const res = await owner.post('/api/workspaces/acme/invites', { emails: [`matrix-${probe}@test.local`], role: 'member', scope });
    if (probe === 'unknown') {
      assert.equal(res.status, 400);
      assert.equal(res.data.code, 'unknownProject');
      return 'refused';
    }
    assert.equal(res.status, 201);
    const [row] = res.data.invites;
    const stored = withDb(server.dbPath, db =>
      db.prepare('select scope from invites where token_hash = ?').get(createHash('sha256').update(inviteToken(row.url)).digest('hex')),
    );
    assert.deepEqual(JSON.parse(stored.scope), scope, 'the invite scope JSON is stored verbatim');
    return 'stored';
  },
};

test('404-matrix fixture: the fixture member holds scope { projects: [p_in], teams: [] }', async () => {
  const res = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: MATRIX_SCOPE });
  assert.equal(res.status, 200);
});

for (const row of MATRIX) {
  if (row.skip) {
    test(`404-matrix [family ${row.family}] ${row.name}`, { skip: row.skip }, () => {});
    continue;
  }
  for (const probe of ['inScope', 'outOfScope', 'unknown']) {
    if (row.expected[probe] === null) {
      test(`404-matrix [family ${row.family}] ${row.name} — ${probe}`, { skip: row.skipUnknown || 'dangling-project writes are pre-phase semantics, not a scope hole' }, () => {});
      continue;
    }
    test(`404-matrix [family ${row.family}] ${row.name} — ${probe} → ${JSON.stringify(row.expected[probe])}`, async () => {
      const got = await matrixProbe[row.kind](probe);
      if (row.kind === 'file') {
        assert.equal(got.status, row.expected[probe]);
        if (row.expected[probe] === 404) {
          assert.equal(got.code, 'fileNotFound');
          const cross = await matrixProbe.file(probe === 'unknown' ? 'outOfScope' : 'unknown');
          assert.deepEqual(got, cross, 'unknown ≡ out-of-scope: identical status, code AND message (no oracle)');
        }
      } else {
        assert.equal(got, row.expected[probe]);
      }
    });
  }
}

/* ---- Phase 32 (VIS-01): team-derived project visibility — tracer slice ----

   A second probe member rides the null-scope branch: one member ON team_a
   (via the authority route), one member with ZERO team rows (the JIT-shaped
   zero-team probe). A private project carrying teams:[team_a] (p_teamX) opens
   for the on-team member and answers the byte-identical 404 for the
   zero-team member; a private teams:[] project (p_priv3) stays access-list
   gated (D-06); the public teams:[team_a] project (p_pubA) stays
   workspace-wide for everyone (A1 widening-only). */

let teamOn; // the on-team probe client (null scope, team_a via the authority route)
let teamOnUserId;
let teamOnMid;
let ownerMid;
let zeroteamMid; // dedicated null-scope, zero-team member (the JIT/doc-only probe)

test('team fixture: probe members resolved and team-linked projects planted', async () => {
  const members = (await owner.get('/api/workspaces/acme/members')).data.members;
  teamOnUserId = members.find(m => m.email === 'plain@test.local').userId;
  teamOnMid = members.find(m => m.email === 'plain@test.local').memberId;
  ownerMid = members.find(m => m.email === ADMIN.email).memberId;
  teamOn = (await login(server.base, 'plain@test.local', PASSWORD)).client;

  // On-team membership lives in the team_members authority rows, edited only
  // through the dedicated route (D-01) — never the doc roster.
  assert.equal((await owner.put(`/api/workspaces/acme/members/${teamOnUserId}/teams`, { teams: ['team_a'] })).status, 200);

  // The zero-team probe reads workspace-wide (null scope, no team rows).
  assert.equal((await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: null })).status, 200);

  // A dedicated null-scope zero-team member (4th accept of this server's
  // invite budget) — the reminder off-probe assignee. The Phase-29 assignee
  // write-guard runs over the MERGED task list, so a stored self-assignment
  // on a project outside the caller's scope would 400 any later doc PUT by
  // that caller; the off-probe assignee must be someone whose assignments
  // never trip it (null scope passes the guard unconditionally).
  const [ztInv] = (await owner.post('/api/workspaces/acme/invites', { emails: ['zeroteam@test.local'], role: 'member' })).data.invites;
  const ztClient = (await signup(server.base, ACCOUNT('ZeroTeam', 'zeroteam@test.local'))).client;
  const ztJoined = await ztClient.post(`/api/invites/${inviteToken(ztInv.url)}/accept`);
  assert.ok([200, 201].includes(ztJoined.status), 'the zero-team member joined');
  const ztRow = (await owner.get('/api/workspaces/acme/members')).data.members.find(m => m.email === 'zeroteam@test.local');
  zeroteamMid = ztRow.memberId;

  const live = (await owner.get('/api/workspaces/acme')).data;
  const doc = structuredClone(live.doc);
  doc.data.projects.push(
    { id: 'p_teamX', key: 'tmx', name: 'Team X Private', private: true, members: [ownerMid], lead: ownerMid, teams: ['team_a'] },
    { id: 'p_pubA', key: 'pba', name: 'Public Team A', private: false, members: [], teams: ['team_a'] },
    { id: 'p_priv3', key: 'prv3', name: 'Private No Teams', private: true, members: [scopedMemberId], lead: ownerMid, teams: [] },
    // Reminder-probe project: team-linked AND the on-team assignee is on its
    // access list — remindable()'s pre-existing canSeeProject gate composes
    // with the pass-level team check (RESEARCH Pitfall 4), so the on-team
    // reminder can only flow for a member the OLD predicate already saw.
    { id: 'p_teamL', key: 'tml', name: 'Team Listed', private: true, members: [teamOnMid], lead: teamOnMid, teams: ['team_a'] },
  );
  doc.data.projOrder.push('p_teamX', 'p_pubA', 'p_priv3', 'p_teamL');
  assert.equal((await owner.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);
});

test('team cell [doc-get]: the on-team member reads the private team-linked project (VIS-01)', async () => {
  const view = (await teamOn.get('/api/workspaces/acme')).data;
  const ids = view.doc.data.projects.map(p => p.id);
  assert.ok(ids.includes('p_teamX'), 'the team intersection opens the private team-linked project');
  assert.ok(!ids.includes('p_priv3'), 'D-06: a private teams:[] project is NOT leaked workspace-wide');
  assert.ok(!ids.includes('p_priv1'), 'the access list of an unshared private project still gates');
});

test('team cell [doc-get]: the zero-team member keeps the pre-phase view — additive only (SC 2, D-02)', async () => {
  const view = (await scoped.get('/api/workspaces/acme')).data;
  const ids = view.doc.data.projects.map(p => p.id);
  assert.ok(!ids.includes('p_teamX'), 'no team intersection: the private team-linked project stays hidden (JIT zero-team)');
  assert.ok(ids.includes('p_pubA'), 'A1: a public teams:[X] project stays workspace-wide (widening-only)');
  assert.ok(ids.includes('p_priv1') && ids.includes('p_priv3'), 'D-02: the access-list disjunct is untouched');
});

test('team cell [file]: the on-team member downloads the team-linked project file (D-08 side door)', async () => {
  await plantScopedFile('f_teamX', 'p_teamX');
  const res = await fileGet(teamOn, 'f_teamX');
  assert.equal(res.status, 200, 'the file side door agrees with the doc read for team reach');
  assert.equal(await res.text(), 'f_teamX:p_teamX:gr8r-scope-matrix');
});

test('team cell [file]: the zero-team member answers the byte-identical unknown-id 404 (no oracle, D-08)', async () => {
  const off = await fileGet(scoped, 'f_teamX');
  const unknown = await fileGet(scoped, 'f_missing');
  assert.equal(off.status, 404);
  const offBody = await off.json();
  assert.equal(offBody.code, 'fileNotFound');
  assert.deepEqual(offBody, await unknown.json(), 'team-hidden ≡ unknown: identical status, code AND message');
});

/* ---- Phase 32 (VIS-04): send-time adoption — reminder pass + fanout ---- */

test('team cell [reminder]: the on-team assignee is reminded, the zero-team assignee is skipped (VIS-04)', async () => {
  const doc = storedDoc();
  doc.data.tasks.push(
    { id: 't_team_rem_on', key: 'TMX-1', title: 'Team reminder on-team', status: 'todo', assignee: teamOnMid, project: 'p_teamL', due: '2027-05-18', labels: [], subtasks: [] },
    { id: 't_team_rem_off', key: 'TMX-2', title: 'Team reminder off-team', status: 'todo', assignee: zeroteamMid, project: 'p_teamX', due: '2027-05-18', labels: [], subtasks: [] },
  );
  withDb(server.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), server.wsId));
  const emitted = await triggerReminders(server, at9('2027-05-18'));
  const rows = emitted.filter(n => n.type === 'due_reminder');
  assert.ok(rows.some(n => n.task === 't_team_rem_on' && n.to === teamOnMid), 'on-team assignee reminded');
  assert.ok(!rows.some(n => n.task === 't_team_rem_off'), 'zero-team assignee never reminded (empty-teams branch, Pitfall 3)');
});

function clientDocTeam() {
  applyClientDoc(
    {
      data: {
        me: 'm_actor',
        members: [
          { id: 'm_actor', name: 'Actor', status: 'active', role: 'Owner' },
          { id: 'm_teamon', name: 'Tia Team', status: 'active', role: 'member' },
          { id: 'm_teamoff', name: 'Ollie Offteam', status: 'active', role: 'member', scope: { projects: ['p_in'], teams: [] } },
        ],
        projOrder: ['p_in', 'p_teamX'],
        projects: [
          { id: 'p_in', key: 'IN', seq: 1, name: 'In', teams: [] },
          { id: 'p_teamX', key: 'TMX', seq: 3, name: 'Team X Private', private: true, teams: ['team_a'] },
        ],
        tasks: [],
        comments: [],
        notifs: [],
        activity: [],
      },
    },
    1,
  );
}

test('team cell [fanout]: the on-team target is present, the off-team scoped target is absent (VIS-04)', () => {
  clientDocTeam();
  const targets = clientEmitMentions('@Tia Team @Ollie Offteam', { id: 't_fan_team', project: 'p_teamX' });
  assert.ok(targets.has('m_teamon'), 'the on-team target is never dropped');
  assert.ok(!targets.has('m_teamoff'), 'the off-team scoped target is filtered from the emit Set');
});

/* Family-5 reminder probes are planted lazily (first reminder probe), AFTER
   the doc-put matrix families: they carry an out-of-scope assignment
   (t_m_rem_out) that the SCOPE-04 assignee write-guard correctly refuses to
   round-trip on any doc write — the fixture bypasses the write path on
   purpose (direct DB plant), so no probe PUT may precede it. */
function plantReminderProbes() {
  const existing = storedDoc().data.tasks.some(t => t.id === 't_m_rem_in');
  if (existing) return;
  const scopedMid = withDb(server.dbPath, db =>
    db
      .prepare('select m.member_id from memberships m join users u on u.id = m.user_id where m.workspace_id = ? and u.email = ?')
      .get(server.wsId, 'scoped@test.local'),
  ).member_id;
  const doc = storedDoc();
  doc.data.tasks.push(
    { id: 't_m_rem_in', key: 'IN-9', title: 'Matrix in-scope reminder', status: 'todo', assignee: scopedMid, project: 'p_in', due: '2027-04-20', labels: [], subtasks: [] },
    { id: 't_m_rem_out', key: 'OUT-9', title: 'Matrix out-of-scope reminder', status: 'todo', assignee: scopedMid, project: 'p_out', due: '2027-04-20', labels: [], subtasks: [] },
  );
  withDb(server.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), server.wsId));
}

/* ---- Phase 29 Plan 03: SCOPE-04 — send-time notification enforcement ----

   A scoped member is never assigned, mentioned, reminded or emailed about
   content outside their scope. Three server guards (reminder pass, email
   mirror, assignee write-guard) are the AUTHORITY; the client emit filter is
   advisory (A4). The guards run on their own SMTP-enabled server instance so
   the email mirror is exercised for real (the same fakeSmtp pattern as
   test/due-reminders.test.mjs). */

const at9 = iso => new Date(`${iso}T09:00:00Z`).toISOString();

function fakeSmtp() {
  const messages = [];
  const srv = net.createServer(sock => {
    sock.on('error', () => {}); // the server under test may reset mid-teardown
    sock.write('220 test ESMTP\r\n');
    let buffer = '';
    let inData = false;
    let current = null;
    sock.on('data', chunk => {
      buffer += chunk.toString();
      let idx;
      while ((idx = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            messages.push(current.join('\n'));
            current = null;
            sock.write('250 OK\r\n');
          } else if (current) {
            current.push(line.startsWith('..') ? line.slice(1) : line);
          }
        } else if (/^EHLO/i.test(line)) {
          sock.write('250-test\r\n250 OK\r\n');
        } else if (/^DATA/i.test(line)) {
          inData = true;
          current = [];
          sock.write('354 go\r\n');
        } else if (/^QUIT/i.test(line)) {
          sock.write('221 bye\r\n');
          sock.end();
        } else {
          sock.write('250 OK\r\n');
        }
      }
    });
  });
  return new Promise(resolve => {
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port, messages }));
  });
}

function textPart(raw) {
  const lines = raw.split('\n');
  const i = lines.indexOf('Content-Type: text/plain; charset=UTF-8');
  assert.ok(i !== -1, 'message has a text/plain part');
  const body = [];
  for (let j = i + 2; j < lines.length && !lines[j].startsWith('--'); j++) body.push(lines[j]);
  return Buffer.from(body.join(''), 'base64').toString('utf8');
}

const triggerReminders = (srv, nowIso) =>
  fetch(`${srv.base}/api/internal/reminder-pass`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-reminder-token': SCOPE_TOKEN },
    body: JSON.stringify({ now: nowIso }),
  }).then(async r => {
    assert.equal(r.status, 200, 'reminder trigger status');
    return (await r.json()).emitted;
  });

test('SCOPE-04: the send-time server guards never reach an out-of-scope member', async t => {
  const smtp = await fakeSmtp();
  const mail = await startServer({
    env: {
      REMINDER_TEST_TOKEN: SCOPE_TOKEN,
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtp.port),
      SMTP_REQUIRE_TLS: 'false',
      MAIL_FROM: 'noreply@test.local',
      APP_URL: 'http://app.test',
    },
  });
  try {
    const signedIn = await login(mail.base, ADMIN.email, ADMIN.password);
    assert.equal(signedIn.status, 200, 'owner signs in on the mail server');
    const ownerMail = signedIn.client;

    // One member-role membership (this server spends its own invite budget).
    const [inv] = (await ownerMail.post('/api/workspaces/acme/invites', { emails: ['guard@test.local'], role: 'member' })).data.invites;
    const memberClient = (await signup(mail.base, ACCOUNT('Guard', 'guard@test.local'))).client;
    const joined = await memberClient.post(`/api/invites/${inviteToken(inv.url)}/accept`);
    assert.ok([200, 201].includes(joined.status), 'the member joined');

    const wsRow = withDb(mail.dbPath, db => db.prepare('select id from workspaces where slug = ?').get('acme'));
    const memberIds = withDb(mail.dbPath, db =>
      db
        .prepare(
          'select m.member_id, u.email from memberships m join users u on u.id = m.user_id where m.workspace_id = ?',
        )
        .all(wsRow.id),
    );
    const scopedMid = memberIds.find(r => r.email === 'guard@test.local').member_id;
    const ownerMid = memberIds.find(r => r.email === ADMIN.email).member_id;
    const guardUserId = (await ownerMail.get('/api/workspaces/acme/members')).data.members.find(
      m => m.email === 'guard@test.local',
    ).userId;

    // Shape the workspace: two public projects, all due inside the same
    // injected 09:00 window. The reminder tasks are planted later, AFTER the
    // write-guard probes — t_s_out carries an out-of-scope assignment the
    // SCOPE-04 write-guard correctly refuses to round-trip (direct DB plant).
    const doc = {
      data: {
        members: [{ id: ownerMid, name: 'Owner' }],
        projects: [
          { id: 'p_in', key: 'in', name: 'In Scope', private: false, members: [], teams: [] },
          { id: 'p_out', key: 'out', name: 'Out of Scope', private: false, members: [], teams: [] },
        ],
        tasks: [],
        comments: [],
        activity: [],
        notifs: [],
        files: [],
        notifPrefs: {},
      },
    };
    withDb(mail.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), wsRow.id));

    // The member is scoped to p_in only.
    const scopedRes = await ownerMail.put(`/api/workspaces/acme/members/${guardUserId}/scope`, {
      scope: { projects: ['p_in'], teams: [] },
    });
    assert.equal(scopedRes.status, 200, 'scope lands on the mail server');

    await t.test('a doc PUT cannot assign an out-of-scope member to an out-of-scope task', async () => {
      const live = (await ownerMail.get('/api/workspaces/acme')).data;
      const next = structuredClone(live.doc);
      next.data.tasks.push({ id: 't_guard_out', key: 'OUT-3', title: 'Guard probe', status: 'todo', assignee: scopedMid, project: 'p_out', labels: [], subtasks: [] });
      const res = await ownerMail.put('/api/workspaces/acme', { revision: live.revision, doc: next });
      assert.equal(res.status, 400, 'the write is rejected');
      assert.equal(res.data?.code, 'assigneeOutOfScope');
      const stored = withDb(mail.dbPath, db => JSON.parse(db.prepare('select doc from workspaces where slug = ?').get('acme').doc));
      assert.ok(!stored.data.tasks.some(x => x.id === 't_guard_out'), 'the stored doc is unchanged');
    });

    await t.test('workspace-wide (null-scope) assignees are never rejected', async () => {
      const live = (await ownerMail.get('/api/workspaces/acme')).data;
      const next = structuredClone(live.doc);
      next.data.tasks.push({ id: 't_guard_admin', key: 'OUT-4', title: 'Admin assignee probe', status: 'todo', assignee: ownerMid, project: 'p_out', labels: [], subtasks: [] });
      const res = await ownerMail.put('/api/workspaces/acme', { revision: live.revision, doc: next });
      assert.equal(res.status, 200, 'a null-scope assignee lands');
      const stored = withDb(mail.dbPath, db => JSON.parse(db.prepare('select doc from workspaces where slug = ?').get('acme').doc));
      assert.ok(stored.data.tasks.some(x => x.id === 't_guard_admin'), 'the task is stored');
    });

    // Reminder fixtures planted after the write-guard probes (see note above).
    withDb(mail.dbPath, db => {
      const row = db.prepare('select doc from workspaces where id = ?').get(wsRow.id);
      const live = JSON.parse(row.doc);
      live.data.tasks.push(
        { id: 't_s_in', key: 'IN-1', title: 'In-scope reminder task', status: 'todo', assignee: scopedMid, project: 'p_in', due: '2027-03-15', labels: [], subtasks: [] },
        { id: 't_s_out', key: 'OUT-1', title: 'Out-of-scope reminder task', status: 'todo', assignee: scopedMid, project: 'p_out', due: '2027-03-15', labels: [], subtasks: [] },
        { id: 't_s_admin', key: 'OUT-2', title: 'Admin reminder task', status: 'todo', assignee: ownerMid, project: 'p_out', due: '2027-03-15', labels: [], subtasks: [] },
      );
      db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(live), wsRow.id);
    });

    await t.test('the reminder pass skips an out-of-scope assignee, delivers the in-scope one', async () => {
      const emitted = await triggerReminders(mail, at9('2027-03-15'));
      const reminders = emitted.filter(n => n.type === 'due_reminder');
      assert.ok(reminders.some(n => n.task === 't_s_in' && n.to === scopedMid), 'in-scope reminder delivered');
      assert.ok(!reminders.some(n => n.task === 't_s_out'), 'no reminder row for the out-of-scope task');
      assert.ok(reminders.some(n => n.task === 't_s_admin' && n.to === ownerMid), 'null-scope (admin) assignee still reminded');
    });

    await t.test('the email mirror never queues an out-of-scope reminder email', async () => {
      // The invite email may arrive first — wait for the in-scope reminder itself.
      const deadline = Date.now() + 5000;
      while (!smtp.messages.some(raw => textPart(raw).includes('In-scope reminder task')) && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 50));
      }
      assert.ok(smtp.messages.some(raw => textPart(raw).includes('In-scope reminder task')), 'the in-scope reminder email arrived');
      assert.ok(!smtp.messages.some(raw => textPart(raw).includes('Out-of-scope reminder task')), 'no out-of-scope email');
    });
  } finally {
    await mail.stop();
    smtp.srv.close();
  }
});

/* ---- Phase 29 Plan 03 task 2: the client emit pre-filter (SCOPE-04, A4) ----

   The browser modules read `document`, `navigator` and `localStorage` while
   they load, so those globals are stubbed before the store and the actions
   are imported dynamically — the same pattern as test/creator-watcher.test.mjs.
   A4: the server guards are the authority; the client filter is advisory and
   DEFAULTS TO ELIGIBLE whenever the projection cannot determine scope (D-05
   forbids projecting scope details, so a marker is the only forward-compat
   signal — never a raw scope read for UI). */

globalThis.document = {
  querySelectorAll: () => [],
  documentElement: { lang: 'en' },
  addEventListener: () => {},
  removeEventListener: () => {},
  body: { appendChild: () => {}, classList: { add: () => {}, remove: () => {} } },
  createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} }, appendChild: () => {} }),
};
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, matchMedia: () => ({ addEventListener: () => {} }), dispatchEvent: () => {} };
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.matchMedia = () => ({ addEventListener: () => {} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
Object.defineProperty(globalThis, 'navigator', {
  value: { platform: 'Linux', userAgent: 'node' },
  configurable: true,
  writable: true,
});

const { register } = await import('node:module');
register(new URL('./virtual-icons-loader.mjs', import.meta.url), import.meta.url);

const { applyDoc: applyClientDoc, D: CD, memberScopeEligible } = await import('../src/core/store.js');
const { createTask: clientCreateTask, emitMentions: clientEmitMentions, taskWatchers: clientTaskWatchers } = await import('../src/actions/actions.js');
const { searchAll: clientSearchAll } = await import('../src/pages/search.js');

function clientDoc() {
  applyClientDoc(
    {
      data: {
        me: 'm_actor',
        members: [
          { id: 'm_actor', name: 'Actor', status: 'active', role: 'Owner' },
          { id: 'm_marked', name: 'Ann Marker', status: 'active', role: 'member', scope: { projects: ['p_in'], teams: [] } },
          { id: 'm_plain', name: 'Bill Plain', status: 'active', role: 'member' },
          { id: 'm_admin', name: 'Cara Admin', status: 'active', role: 'Admin' },
        ],
        projOrder: ['p_in', 'p_out'],
        projects: [
          { id: 'p_in', key: 'IN', seq: 1, name: 'In', teams: [] },
          { id: 'p_out', key: 'OUT', seq: 2, name: 'Out', teams: [] },
        ],
        tasks: [],
        comments: [],
        notifs: [],
        activity: [],
      },
    },
    1,
  );
}

test('SCOPE-04: memberScopeEligible defaults to eligible when the projection cannot determine scope (A4)', () => {
  clientDoc();
  const plain = CD().members.find(m => m.id === 'm_plain');
  assert.equal(memberScopeEligible(plain, 'p_in'), true, 'unmarked member: eligible (default-allow)');
  assert.equal(memberScopeEligible(plain, 'p_out'), true, 'unmarked member stays eligible on any project');
  assert.equal(memberScopeEligible(null, 'p_in'), false, 'an unknown target is not eligible');
  assert.equal(memberScopeEligible(plain, null), true, 'workspace-level content: eligible');
  const admin = CD().members.find(m => m.id === 'm_admin');
  assert.equal(memberScopeEligible(admin, 'p_out'), true, 'admin/owner is workspace-wide (D-04)');
});

test('SCOPE-04: the projection-marked out-of-scope target never lands in the mention fan-out', () => {
  clientDoc();
  const marked = CD().members.find(m => m.id === 'm_marked');
  assert.equal(memberScopeEligible(marked, 'p_in'), true, 'in scope: eligible');
  assert.equal(memberScopeEligible(marked, 'p_out'), false, 'out of scope: filtered');
  const targetsOut = clientEmitMentions('@Ann Marker @Bill Plain', { id: 't1', project: 'p_out' });
  assert.ok(!targetsOut.has('m_marked'), 'out-of-scope target filtered from the emit Set');
  assert.ok(targetsOut.has('m_plain'), 'default-allow target NOT dropped (guards over-filtering)');
  const targetsIn = clientEmitMentions('@Ann Marker', { id: 't2', project: 'p_in' });
  assert.ok(targetsIn.has('m_marked'), 'the same target is eligible inside their scope');
});

test('SCOPE-04: the assign notify and the watcher set ride the same eligibility filter', () => {
  clientDoc();
  clientCreateTask({ title: 'Out of scope assign', project: 'p_out', assignee: 'm_marked' });
  assert.ok(!CD().notifs.some(n => n.to === 'm_marked' && n.type === 'assign'), 'no assign notify to an out-of-scope assignee');
  clientCreateTask({ title: 'In scope assign', project: 'p_in', assignee: 'm_marked' });
  assert.ok(CD().notifs.some(n => n.to === 'm_marked' && n.type === 'assign'), 'in-scope assignee still notified');
  const tOut = { id: 't3', project: 'p_out', assignee: 'm_plain', creator: 'm_marked' };
  const watchers = clientTaskWatchers(tOut);
  assert.ok(!watchers.includes('m_marked'), 'out-of-scope watcher filtered');
  assert.ok(watchers.includes('m_plain'), 'default-allow watcher kept');
});

/* ---- Phase 29 Plan 04 task 3: the D-06 workspace-level matrix rows ----

   For the scoped fixture member, the workspace-level surfaces ride the same
   redactDoc funnel: the activity feed lists no event referencing an
   out-of-scope project, recent-search terms naming one are scrubbed, and a
   cross-project search over the client-visible payload (the redacted doc IS
   the client's whole world) returns no out-of-scope hits. */

test('404-matrix fixture [D-06]: activity rows and recent-search terms planted on both projects', () => {
  const doc = storedDoc();
  doc.data.activity = [
    { id: 'act_in', project: 'p_in', text: 'In-scope activity', at: 1 },
    { id: 'act_out', project: 'p_out', text: 'Out-of-scope activity', at: 2 },
  ];
  doc.data.recentSearches = ['Out of Scope sprint', 'In Scope planning', 'generic term'];
  /* The client search folds t.desc — the API fixture tasks predate the field. */
  for (const t of doc.data.tasks || []) if (t.desc === undefined) t.desc = '';
  withDb(server.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), server.wsId));
});

test('404-matrix [D-06] the scoped member\u2019s activity feed and recent searches carry zero out-of-scope references', async () => {
  assert.equal((await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: MATRIX_SCOPE })).status, 200);
  const view = (await scoped.get('/api/workspaces/acme')).data;
  assert.deepEqual(view.doc.data.activity.map(a => a.id), ['act_in'], 'the activity feed lists no out-of-scope event');
  assert.deepEqual(view.doc.data.recentSearches, ['In Scope planning', 'generic term'], 'recent-search terms naming an out-of-scope project are scrubbed');
});

test('404-matrix [D-06] a cross-project search over the client-visible payload returns no out-of-scope hits', async () => {
  const view = (await scoped.get('/api/workspaces/acme')).data;
  applyClientDoc(view.doc, 1); // the redacted doc is the client's whole world
  assert.deepEqual(clientSearchAll('Hidden task').tasks, [], 'the out-of-scope task is unfindable');
  assert.equal(clientSearchAll('Out of Scope').projects.length, 0, 'the out-of-scope project is unfindable');
  assert.equal(clientSearchAll('Visible task').tasks.length, 1, 'the in-scope task is still findable');
  assert.equal(clientSearchAll('In Scope').projects.length, 1, 'the in-scope project is still findable');
});

/* ---- Phase 32 (VIS-02/VIS-05, D-05..D-08): full MATRIX team extension ---- */

test('team cell [A1 widening]: a PUBLIC project carrying teams:[X] stays visible to a non-X member (widening-only)', async () => {
  assert.equal((await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: null })).status, 200);
  const view = (await scoped.get('/api/workspaces/acme')).data;
  assert.equal(view.doc.data.projects.some(p => p.id === 'p_pubA'), true, 'public is an independent disjunct in D-01 — nobody loses access');
});

test('team cell [VIS-02 D-03 inversion]: a scope grant still opens a team-hidden project the member does not intersect', async () => {
  assert.equal((await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: { projects: ['p_teamX'], teams: [] } })).status, 200);
  const view = (await scoped.get('/api/workspaces/acme')).data;
  assert.equal(view.doc.data.projects.some(p => p.id === 'p_teamX'), true, 'the grant inverts the private check — additive composition survives');
  assert.equal((await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: null })).status, 200);
});

test('team cell [VIS-02]: the admin/owner exemption survives — the plain hiddenProjectIds path (D-06)', async () => {
  const view = (await owner.get('/api/workspaces/acme')).data;
  assert.equal(view.doc.data.projects.some(p => p.id === 'p_teamX'), true, 'admin sees the team-hidden private project');
  assert.equal(view.doc.data.projects.some(p => p.id === 'p_priv3'), true, 'admin sees the empty-teams private project');
});

test('team cell [doc-put]: a team-hidden row PUT by a scoped caller lands as reserved (Pitfall 5)', async () => {
  // The caller scope covers p_out so the stored t_m_rem_out self-assignment
  // (restored by the merge) never trips the untouched Phase-29 assignee
  // write-guard — p_teamX stays out of reach, which is what this cell pins.
  assert.equal((await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: { projects: ['p_in', 'p_out'], teams: [] } })).status, 200);
  const live = (await scoped.get('/api/workspaces/acme')).data;
  const doc = structuredClone(live.doc);
  doc.data.tasks.push({ id: 't_team_put', project: 'p_teamX', title: 'Team-hidden put probe', status: 'todo', labels: [], subtasks: [] });
  const saved = await scoped.put('/api/workspaces/acme', { revision: live.revision, doc });
  assert.equal(saved.status, 200, 'the merge is silent, not an error');
  assert.equal(storedDoc().data.tasks.some(t => t.id === 't_team_put'), false, 'the team-hidden row is reserved, never merged');
  assert.equal((await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: null })).status, 200);
});

test('team cell [D-08]: a legacy scalar-team project rides the same reach on the file side door', async () => {
  // Craft directly into the stored doc — the doc write path normalizes the
  // scalar `team` away (normalizeProjects), so only a crafted fixture can
  // exercise the raw stored shape both read paths must normalize.
  const doc = storedDoc();
  doc.data.projects.push({ id: 'p_legacy', key: 'lgy', name: 'Legacy Scalar', private: true, members: [ownerMid], lead: ownerMid, team: 'team_a' });
  doc.data.files.push({ id: 'f_legacy', name: 'f_legacy.txt', size: 5, type: 'txt', project: 'p_legacy' });
  withDb(server.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), server.wsId));
  fs.writeFileSync(path.join(server.dataDir, 'files', 'f_legacy'), Buffer.from('f_legacy:p_legacy:gr8r-scope-matrix', 'utf8'));
  const on = await fileGet(teamOn, 'f_legacy');
  assert.equal(on.status, 200, 'the on-team member reads the legacy scalar-team file (side door ≡ doc read)');
  const off = await fileGet(scoped, 'f_legacy');
  const unknown = await fileGet(scoped, 'f_missing');
  assert.equal(off.status, 404);
  assert.deepEqual(await off.json(), await unknown.json(), 'legacy team-hidden ≡ unknown: identical status, code AND message');
});

test('team cell [D-05 live read]: the team set is read live — reach flips on the next request after a roster edit', async () => {
  const before = (await scoped.get('/api/workspaces/acme')).data;
  assert.equal(before.doc.data.projects.some(p => p.id === 'p_teamX'), false, 'precondition: zero-team probe is off p_teamX');
  withDb(server.dbPath, db =>
    db.prepare('insert or ignore into team_members (workspace_id, team_id, member_id, user_id) values (?,?,?,?)').run(server.wsId, 'team_a', scopedMemberId, scopedUserId),
  );
  const after = (await scoped.get('/api/workspaces/acme')).data;
  assert.equal(after.doc.data.projects.some(p => p.id === 'p_teamX'), true, 'no caching (D-05): the roster edit takes effect immediately');
  withDb(server.dbPath, db =>
    db.prepare('delete from team_members where workspace_id = ? and team_id = ? and user_id = ?').run(server.wsId, 'team_a', scopedUserId),
  );
  const restored = (await scoped.get('/api/workspaces/acme')).data;
  assert.equal(restored.doc.data.projects.some(p => p.id === 'p_teamX'), false, 'the removal also takes effect immediately');
});

test('team cell [SC 2 JIT]: a zero-team account reads teams:[] projects per their public/access-list state and never teams:[X] private ones', async () => {
  assert.equal((await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: null })).status, 200);
  assert.equal(scopeOf(scopedUserId), null, 'the zero-team probe carries no scope (JIT-shaped)');
  assert.equal(withDb(server.dbPath, db => db.prepare('select count(*) n from team_members where workspace_id = ? and user_id = ?').get(server.wsId, scopedUserId).n), 0, 'zero team_members rows');
  const view = (await scoped.get('/api/workspaces/acme')).data;
  const ids = view.doc.data.projects.map(p => p.id);
  assert.equal(ids.includes('p_pubA'), true, 'teams:[] public project: workspace-wide (empty-teams first branch, D-06)');
  assert.equal(ids.includes('p_priv3'), true, 'teams:[] private project: gated by its access list, NOT leaked, NOT sealed');
  assert.equal(ids.includes('p_teamX'), false, 'teams:[X] private project stays 404 for the zero-team account');
});
