/* Phase 29 SCOPE-01: the membership scope substrate, proven end-to-end over
   HTTP on its own isolated server (the shared membership suite spends its own
   invite-accept throttle budget; this suite spends exactly one accept).

   Tracer slice: admin sets a scope on a member-role account → the member's
   doc GET omits out-of-scope projects and every dependent list rides the same
   funnel → a stale doc PUT cannot resurrect out-of-scope rows → admin targets
   are refused (D-04) and scope details are never projected (D-05). */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, inviteToken, login, signup, startServer, withDb } from './helpers/server.mjs';

const PASSWORD = 'scope-password-1';
const ACCOUNT = (name, email) => ({ name, email, password: PASSWORD });

let server;
let owner;
let scoped;
let scopedUserId;
let ownerId;

const storedDoc = () => JSON.parse(withDb(server.dbPath, db => db.prepare('select doc from workspaces where slug = ?').get('acme').doc));
const scopeOf = userId =>
  withDb(server.dbPath, db => db.prepare('select scope from memberships where workspace_id = ? and user_id = ?').get(server.wsId, userId).scope);

before(async () => {
  server = await startServer();
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
  assert.equal(saved.status, 200, 'the merge is silent, not an error');

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
