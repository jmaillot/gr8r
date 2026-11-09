/* Phase 2 membership lifecycle over HTTP: invites, roles, guards, removal
   cleanup, leave and workspace deletion, against an isolated server.

   The server throttles invite accepts to five per IP per hour. This suite spends
   exactly five attempts (Bob, Cara, Eve's needsSignIn refusal, Eve's accept and
   the expired link), so a sixth accept would need its own server instance. */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, client, inviteToken, login, signup, startServer, withDb } from './helpers/server.mjs';

const PASSWORD = 'member-password-1';
const ACCOUNT = (name, email) => ({ name, email, password: PASSWORD });

let server;
let owner;
let bob;
let cara;
let eve;

const roster = async who => {
  const res = await who.get('/api/workspaces/acme/members');
  assert.equal(res.status, 200, 'members roster is readable');
  return res.data;
};
const find = (rows, email) => rows.find(row => row.email === email);
const invite = async (emails, role, extra = {}) => {
  const res = await owner.post('/api/workspaces/acme/invites', { emails, role, ...extra });
  assert.equal(res.status, 201, `invite ${emails.join(', ')}`);
  return res.data.invites;
};

/* [2026-11-09 53-02] A guest (viewer) invite must carry exactly one real
   project (T-53-05 invariant). This idempotently adds the fixture project
   to the workspace doc and returns its id. */
const ensureProject = async (who, slug, id = 'p_guest_fixture') => {
  const got = await who.get(`/api/workspaces/${slug}`);
  assert.equal(got.status, 200, `workspace ${slug} readable`);
  const doc = got.data.doc;
  if (!(doc.data.projects || []).some(p => p.id === id)) {
    doc.data.projects = [...(doc.data.projects || []), { id, key: id, name: 'Guest fixture', private: false, members: [], perms: {}, team: null, status: 'active', allowInviteGuests: true }];
    doc.data.projOrder = [...(doc.data.projOrder || []), id];
    const put = await who.put(`/api/workspaces/${slug}`, { revision: got.data.revision, doc });
    assert.equal(put.status, 200, `fixture project ${id} created in ${slug}`);
  }
  return id;
};

before(async () => {
  server = await startServer();
  const signedIn = await login(server.base, ADMIN.email, ADMIN.password);
  assert.equal(signedIn.status, 200, 'bootstrap owner signs in');
  owner = signedIn.client;

  bob = (await signup(server.base, ACCOUNT('Bob', 'bob@test.local'))).client;
  cara = (await signup(server.base, ACCOUNT('Cara', 'cara@test.local'))).client;
  eve = (await signup(server.base, ACCOUNT('Eve', 'eve@test.local'))).client;
});

after(async () => {
  await server?.stop();
});

test('an invited address joins the roster with the invited role', async () => {
  const [row] = await invite(['bob@test.local'], 'admin');
  assert.equal(row.email, 'bob@test.local');
  assert.equal(row.role, 'admin');
  assert.ok(inviteToken(row.url), 'the invite payload carries a join link');
  assert.ok(row.expiresAt > Date.now(), 'the invite has a future expiry');

  const preview = await client(server.base, 'anonymous').get(`/api/invites/${inviteToken(row.url)}`);
  assert.equal(preview.status, 200);
  assert.equal(preview.data.workspace.slug, 'acme');
  assert.equal(preview.data.workspace.name, 'Acme');
  assert.equal(preview.data.email, 'bob@test.local');
  assert.equal(preview.data.role, 'admin');
  assert.equal(preview.data.existing, true, 'the address already has an account');

  const joined = await bob.post(`/api/invites/${inviteToken(row.url)}/accept`);
  assert.equal(joined.status, 200);
  assert.equal(joined.data.workspace.slug, 'acme');

  const members = await roster(owner);
  const bobRow = find(members.members, 'bob@test.local');
  assert.equal(bobRow.role, 'admin');
  assert.equal(bobRow.roleLabel, 'Admin');
  assert.equal(typeof bobRow.memberId, 'string');
  assert.ok(bobRow.memberId, 'the roster exposes the document member id');
  assert.equal(find(members.members, ADMIN.email).isSelf, true);
  assert.equal(find(members.members, ADMIN.email).role, 'owner');
  assert.equal(members.invites.length, 0, 'the invite becomes a membership');
});

test('pending invites are listed for admins only', async () => {
  const projectId = await ensureProject(owner, 'acme');
  const [row] = await invite(['ghost@test.local'], 'viewer', { project: projectId });
  assert.ok(inviteToken(row.url));

  const asOwner = await roster(owner);
  assert.equal(asOwner.invites.length, 1);
  assert.equal(asOwner.invites[0].email, 'ghost@test.local');
  assert.equal(asOwner.invites[0].role, 'viewer');

  const asAdmin = await roster(bob);
  assert.equal(asAdmin.invites.length, 1, 'an admin also sees pending invites');

  const [caraRow] = await invite(['cara@test.local'], 'member');
  assert.equal((await cara.post(`/api/invites/${inviteToken(caraRow.url)}/accept`)).status, 200);

  const asMember = await roster(cara);
  assert.equal(asMember.members.length, 3);
  assert.equal(find(asMember.members, 'cara@test.local').role, 'member');
  assert.equal(find(asMember.members, 'cara@test.local').roleLabel, 'Member');
  assert.deepEqual(asMember.invites, [], 'a member never receives the invite list');
});

test('ALLOW_SIGNUP=false closes signup and creation but invites still onboard', async () => {
  const locked = await startServer({ env: { ALLOW_SIGNUP: 'false' } });
  try {
    const anonymous = client(locked.base, 'anonymous');
    const config = await anonymous.get('/api/config');
    assert.equal(config.status, 200);
    assert.equal(config.data.signup, false);
    assert.equal(config.data.workspaceCreation, 'admins');

    const blocked = await anonymous.post('/api/auth/signup', ACCOUNT('Blocked', 'blocked@test.local'));
    assert.equal(blocked.status, 403, 'signup is closed');

    const lockedOwner = (await login(locked.base, ADMIN.email, ADMIN.password)).client;
    const [row] = (await lockedOwner.post('/api/workspaces/acme/invites', { emails: ['locked@test.local'], role: 'member' })).data.invites;
    const guest = client(locked.base, 'locked-guest');
    const joined = await guest.post(`/api/invites/${inviteToken(row.url)}/accept`, ACCOUNT('Locked', 'locked@test.local'));
    assert.equal(joined.status, 201, 'a workspace invite still creates the account');
    assert.equal(joined.data.workspace.slug, 'acme');
    assert.equal((await guest.get('/api/workspaces/acme')).status, 200);

    const refused = await guest.post('/api/workspaces', { name: 'Guest Co' });
    assert.equal(refused.status, 403, 'a plain member cannot create a workspace when signup is closed');
    assert.equal((await lockedOwner.post('/api/workspaces', { name: 'Owner Co' })).status, 201, 'an owner still can');

    const openConfig = await client(server.base, 'anonymous').get('/api/config');
    assert.equal(openConfig.data.signup, true);
    assert.equal(openConfig.data.workspaceCreation, 'open');
  } finally {
    await locked.stop();
  }
});

test('an invite for an existing account needs that account signed in', async () => {
  const [row] = await invite(['eve@test.local'], 'member');
  const token = inviteToken(row.url);
  assert.equal((await client(server.base, 'anonymous').get(`/api/invites/${token}`)).data.existing, true);

  const anonymous = await client(server.base, 'anonymous').post(`/api/invites/${token}/accept`, ACCOUNT('Eve', 'eve@test.local'));
  assert.equal(anonymous.status, 409);
  assert.equal(anonymous.data.needsSignIn, true);

  assert.equal((await eve.post(`/api/invites/${token}/accept`)).status, 200);
  assert.equal(find((await roster(owner)).members, 'eve@test.local').role, 'member');

  const used = await client(server.base, 'anonymous').get(`/api/invites/${token}`);
  assert.equal(used.status, 410, 'a used link reports 410');
});

test('an existing member cannot be invited again', async () => {
  const duplicate = await owner.post('/api/workspaces/acme/invites', { emails: ['cara@test.local'], role: 'member' });
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.data.error, /already a member/);
});

test('a pending invite can be revoked once', async () => {
  const projectId = await ensureProject(owner, 'acme');
  const [row] = await invite(['revoked@test.local'], 'viewer', { project: projectId });
  const token = inviteToken(row.url);
  const pending = (await owner.get('/api/workspaces/acme/invites')).data.invites;
  const target = pending.find(entry => entry.email === 'revoked@test.local');
  assert.ok(target, 'the pending invite is listed by token hash');

  assert.equal((await owner.del(`/api/workspaces/acme/invites/${target.id}`)).status, 200);
  assert.equal((await owner.del(`/api/workspaces/acme/invites/${target.id}`)).status, 404, 'a second revoke finds nothing');
  assert.equal((await client(server.base, 'anonymous').get(`/api/invites/${token}`)).status, 404, 'the link is dead');
  assert.equal(
    (await owner.get('/api/workspaces/acme/invites')).data.invites.some(i => i.email === 'revoked@test.local'),
    false,
  );
});

test('an expired invite answers 410', async () => {
  const [row] = await invite(['stale@test.local'], 'member');
  const token = inviteToken(row.url);
  withDb(server.dbPath, db => db.prepare('update invites set expires_at = ? where email = ?').run(Date.now() - 1000, 'stale@test.local'));

  assert.equal((await client(server.base, 'anonymous').get(`/api/invites/${token}`)).status, 410);
  const accept = await client(server.base, 'anonymous').post(`/api/invites/${token}/accept`, ACCOUNT('Stale', 'stale@test.local'));
  assert.equal(accept.status, 410);
});

test('roles move between member, admin and owner under owner control', async () => {
  const members = await roster(owner);
  const caraId = find(members.members, 'cara@test.local').userId;
  const eveId = find(members.members, 'eve@test.local').userId;
  const ownerId = find(members.members, ADMIN.email).userId;
  const selfId = find(members.members, 'bob@test.local').userId;

  const promoted = await owner.patch(`/api/workspaces/acme/members/${caraId}`, { role: 'admin' });
  assert.equal(promoted.status, 200);
  assert.equal(promoted.data.member.role, 'admin');
  assert.equal((await roster(owner)).members.find(m => m.userId === caraId).role, 'admin');

  assert.equal((await bob.patch(`/api/workspaces/acme/members/${caraId}`, { role: 'member' })).status, 403, 'an admin cannot manage another admin');
  assert.equal((await bob.patch(`/api/workspaces/acme/members/${ownerId}`, { role: 'member' })).status, 403, 'an admin cannot manage an owner');
  assert.equal((await bob.patch(`/api/workspaces/acme/members/${eveId}`, { role: 'owner' })).status, 403, 'only an owner transfers ownership');
  assert.equal((await bob.patch(`/api/workspaces/acme/members/${selfId}`, { role: 'member' })).status, 409, 'self-management points at leave');

  assert.equal((await owner.patch(`/api/workspaces/acme/members/${eveId}`, { role: 'owner' })).status, 200, 'an owner can grant ownership');
  assert.equal((await owner.patch(`/api/workspaces/acme/members/${eveId}`, { role: 'member' })).status, 200, 'an owner can revoke it again');
  assert.equal((await owner.patch(`/api/workspaces/acme/members/${caraId}`, { role: 'member' })).status, 200, 'promotion is reversible');

  const demoted = (await roster(owner)).members.find(m => m.userId === caraId);
  assert.equal(demoted.role, 'member');
  assert.equal(demoted.roleLabel, 'Member');
  assert.equal((await owner.patch(`/api/workspaces/acme/members/${caraId}`, { role: 'wizard' })).status, 400, 'unknown roles are refused');
  assert.equal((await owner.patch('/api/workspaces/acme/members/not-a-user', { role: 'member' })).status, 404);
});

test('a server-side change reports the new revision so the next write is accepted', async () => {
  const live = (await owner.get('/api/workspaces/acme')).data;
  const caraId = find((await roster(owner)).members, 'cara@test.local').userId;

  /* A role change edits the document, so it moves the revision. The client
     has to be told, or its next write is rejected with 409 and the edit is
     silently lost. */
  const changed = await owner.patch(`/api/workspaces/acme/members/${caraId}`, { role: 'admin' });
  assert.equal(changed.status, 200);
  assert.equal(typeof changed.data.revision, 'number', 'the role change reports the new revision');
  assert.ok(changed.data.revision > live.revision, 'the revision moved forward');

  const doc = structuredClone(live.doc);
  const saved = await owner.put('/api/workspaces/acme', { revision: changed.data.revision, doc });
  assert.equal(saved.status, 200, 'the client can keep writing with the revision it was given');

  const back = await owner.patch(`/api/workspaces/acme/members/${caraId}`, { role: 'member' });
  assert.equal(back.status, 200);
  assert.ok(back.data.revision > changed.data.revision, 'the next change moves the revision again');

  const plan = await owner.post('/api/workspaces/acme/plan', { plan: 'Team' });
  assert.equal(plan.status, 404, 'the plan endpoint is gone');
});

test('the last owner cannot leave', async () => {
  const res = await owner.post('/api/workspaces/acme/leave');
  assert.equal(res.status, 409);
  assert.match(res.data.error, /owner/);
});

test('the plan endpoint is gone for every role', async () => {
  assert.equal((await bob.post('/api/workspaces/acme/plan', { plan: 'Business' })).status, 404, 'an admin gets 404');
  assert.equal((await cara.post('/api/workspaces/acme/plan', { plan: 'Business' })).status, 404, 'a member gets 404');
  assert.equal((await owner.post('/api/workspaces/acme/plan', { plan: 'Free' })).status, 404, 'even an owner gets 404');

  const served = (await owner.get('/api/workspaces/acme')).data;
  assert.equal(served.doc.data.plan, undefined, 'the plan change is not stored');
});

test('removing a member cleans up their assignments and access', async () => {
  const members = (await roster(owner)).members;
  const caraRow = members.find(m => m.email === 'cara@test.local');
  const ownerId = members.find(m => m.email === ADMIN.email).memberId;

  const live = (await owner.get('/api/workspaces/acme')).data;
  const doc = structuredClone(live.doc);
  doc.data.projects = [
    {
      id: 'p_cleanup',
      key: 'cleanup',
      name: 'Cleanup',
      private: false,
      members: [caraRow.memberId, ownerId],
      lead: ownerId,
      perms: { [caraRow.memberId]: 'Full access' },
      team: 'core',
      status: 'active',
    },
  ];
  doc.data.projOrder = ['p_cleanup'];
  doc.data.tasks = [
    {
      id: 't_cleanup',
      project: 'p_cleanup',
      title: 'Assigned to Cara',
      status: 'todo',
      assignee: caraRow.memberId,
      labels: [],
      subtasks: [{ id: 's_cleanup', title: 'Subtask', done: false, assignee: caraRow.memberId }],
    },
  ];
  doc.data.teams = [{ id: 'team_core', name: 'Core', members: [caraRow.memberId, ownerId] }];
  assert.equal((await owner.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);
  const before = (await owner.get('/api/workspaces/acme')).data;
  const removed = await owner.del(`/api/workspaces/acme/members/${caraRow.userId}`);
  assert.equal(removed.status, 200);
  assert.equal(removed.data.removed, true);

  const after = (await owner.get('/api/workspaces/acme')).data;
  assert.equal(after.revision, before.revision + 1, 'removal bumps the document revision');
  assert.equal(removed.data.revision, after.revision, 'the removal reports the new revision');
  assert.equal(
    after.doc.data.members.some(m => m.email === 'cara@test.local'),
    false,
    'the profile is gone',
  );
  const task = after.doc.data.tasks.find(t => t.id === 't_cleanup');
  assert.equal(task.assignee, null, 'the task is unassigned');
  assert.equal(task.subtasks[0].assignee, null, 'the subtask is unassigned');
  const project = after.doc.data.projects.find(p => p.id === 'p_cleanup');
  assert.equal(project.members.includes(caraRow.memberId), false, 'the project roster is stripped');
  assert.equal(caraRow.memberId in project.perms, false, 'the project permissions are stripped');
  assert.equal(after.doc.data.teams[0].members, undefined, 'the team carries no member roster (TEAM-05: membership left the doc)');
  assert.equal((await cara.get('/api/workspaces/acme')).status, 404, 'the removed account loses access');
});

test('leave reports the next workspace and needs another owner', async () => {
  assert.equal((await bob.del('/api/workspaces/acme')).status, 403, 'only an owner deletes a workspace');

  const gamma = await eve.post('/api/workspaces', { name: 'Gamma', slug: 'gamma' });
  assert.equal(gamma.status, 201, 'a signed-in account creates its own workspace');
  assert.equal(gamma.data.workspace.slug, 'gamma');

  const left = await eve.post('/api/workspaces/acme/leave');
  assert.equal(left.status, 200);
  assert.equal(left.data.left, true);
  assert.equal(left.data.nextSlug, 'gamma', 'leave points at the remaining workspace');
  assert.equal((await eve.get('/api/workspaces/acme')).status, 404);

  const bobLeft = await bob.post('/api/workspaces/acme/leave');
  assert.equal(bobLeft.status, 200);
  assert.equal(bobLeft.data.nextSlug, null, 'no other workspace means no next slug');
  assert.equal((await bob.get('/api/workspaces/acme')).status, 404);
});

test('deleting a workspace cascades memberships and invites', async () => {
  const gammaProjectId = await ensureProject(eve, 'gamma');
  const gamma = (await eve.get('/api/workspaces/gamma')).data;
  const inviteRow = (await eve.post('/api/workspaces/gamma/invites', { emails: ['ghost@test.local'], role: 'viewer', project: gammaProjectId })).data.invites[0];
  const token = inviteToken(inviteRow.url);

  const deleted = await eve.del('/api/workspaces/gamma');
  assert.equal(deleted.status, 200);
  assert.equal(deleted.data.deleted, true);
  assert.equal(deleted.data.nextSlug, null, 'eve has no workspace left');

  assert.equal((await eve.get('/api/workspaces/gamma')).status, 404);
  assert.equal((await client(server.base, 'anonymous').get(`/api/invites/${token}`)).status, 404, 'the pending invite is cascaded');

  withDb(server.dbPath, db => {
    assert.equal(db.prepare('select count(*) as n from memberships where workspace_id = ?').get(gamma.id).n, 0);
    assert.equal(db.prepare('select count(*) as n from invites where workspace_id = ?').get(gamma.id).n, 0);
    assert.equal(db.prepare('select count(*) as n from workspaces where id = ?').get(gamma.id).n, 0);
  });

  assert.equal((await owner.get('/api/workspaces/acme')).status, 200, 'the other workspace is untouched');
});

/* TEAM-01/TEAM-02 (Phase 28): the team_members authority path over HTTP.
   Runs on its own server instance — the shared suite above has already spent
   the shared server's invite-accept throttle budget. */
test('PUT member teams writes authority rows, projects teams[] and gates on admin', async () => {
  const s = await startServer();
  try {
    const signedIn = await login(s.base, ADMIN.email, ADMIN.password);
    assert.equal(signedIn.status, 200);
    const boss = signedIn.client;

    // Define two teams in the workspace document (definitions stay in the doc, D-02).
    const live = (await boss.get('/api/workspaces/acme')).data;
    const doc = structuredClone(live.doc);
    doc.data.teams = [
      { id: 'team_a', name: 'Alpha', members: [] },
      { id: 'team_b', name: 'Beta', members: [] },
    ];
    assert.equal((await boss.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);

    // Invite and accept a member on the fresh server's throttle budget.
    const [inv] = (await boss.post('/api/workspaces/acme/invites', { emails: ['tm@test.local'], role: 'member' })).data.invites;
    const memberAccount = (await signup(s.base, ACCOUNT('Tm', 'tm@test.local'))).client;
    assert.equal((await memberAccount.post(`/api/invites/${inviteToken(inv.url)}/accept`)).status, 200);

    const members = (await boss.get('/api/workspaces/acme/members')).data.members;
    const target = members.find(m => m.email === 'tm@test.local');
    assert.ok(target, 'the member joined');
    assert.deepEqual(target.teams, [], 'a freshly invited member starts teamless');

    // A plain member gets the admin gate; an unknown team id is whitelisted out.
    assert.equal((await memberAccount.put(`/api/workspaces/acme/members/${target.userId}/teams`, { teams: ['team_a'] })).status, 403);
    assert.equal((await boss.put(`/api/workspaces/acme/members/${target.userId}/teams`, { teams: ['team_nope'] })).status, 400);
    assert.equal((await boss.put(`/api/workspaces/acme/members/${target.userId}/teams`, { teams: 'team_a' })).status, 400);
    assert.equal((await boss.put('/api/workspaces/acme/members/not-a-user/teams', { teams: ['team_a'] })).status, 404);

    // The one-call set: two teams at once.
    const set = await boss.put(`/api/workspaces/acme/members/${target.userId}/teams`, { teams: ['team_b', 'team_a', 'team_a'] });
    assert.equal(set.status, 200);
    assert.equal('revision' in set.data, false, 'a membership route never claims a doc revision (TEAM-05 precondition)');
    assert.deepEqual(set.data.member.teams, ['team_a', 'team_b'], 'the payload projects the full set');

    const wsId = (await boss.get('/api/workspaces/acme')).data.id;
    assert.ok(wsId, 'the workspace id is resolvable for authority-row checks');

    // The join table is the authority: two rows, deduped and sorted.
    withDb(s.dbPath, db => {
      assert.deepEqual(
        db
          .prepare('select team_id from team_members where workspace_id = ? and user_id = ? order by team_id')
          .all(wsId, target.userId)
          .map(r => r.team_id),
        ['team_a', 'team_b'],
      );
    });

    // The roster projection reads the same authority.
    const rostered = (await boss.get('/api/workspaces/acme/members')).data.members.find(m => m.email === 'tm@test.local');
    assert.deepEqual(rostered.teams, ['team_a', 'team_b'], 'both teams appear in the member payload');

    // Teamless is a valid state: setting zero teams leaves zero rows (D-03).
    assert.equal((await boss.put(`/api/workspaces/acme/members/${target.userId}/teams`, { teams: [] })).status, 200);
    withDb(s.dbPath, db => {
      assert.equal(db.prepare('select count(*) as n from team_members where user_id = ?').get(target.userId).n, 0, 'no rows for a teamless member');
    });
    assert.deepEqual((await boss.get('/api/workspaces/acme/members')).data.members.find(m => m.email === 'tm@test.local').teams, []);
  } finally {
    await s.stop();
  }
});

/* TEAM-05 (Phase 28, D-02) server-side pin: a doc PUT carrying teams[].members
   can neither carry membership into the authority rows nor store it in the doc. */
test('a doc PUT carrying teams[].members leaves the authority rows untouched and the doc clean', async () => {
  const s = await startServer();
  try {
    const signedIn = await login(s.base, ADMIN.email, ADMIN.password);
    const boss = signedIn.client;

    const live = (await boss.get('/api/workspaces/acme')).data;
    const doc = structuredClone(live.doc);
    doc.data.teams = [{ id: 'team_x', name: 'X', members: ['m_someone', 'm_other'] }];
    assert.equal((await boss.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);

    const after = (await boss.get('/api/workspaces/acme')).data;
    assert.equal('members' in after.doc.data.teams[0], false, 'the served document carries no members array on teams');

    const stored = JSON.parse(withDb(s.dbPath, db => db.prepare('select doc from workspaces where slug = ?').get('acme').doc));
    assert.equal('members' in stored.data.teams[0], false, 'the STORED document is stripped too (write path, D-30 precedent)');

    assert.equal(withDb(s.dbPath, db => db.prepare('select count(*) as n from team_members').get()).n, 0, 'no team_members row was created by the doc PUT');
  } finally {
    await s.stop();
  }
});

/* TEAM-05 (Phase 28, client half): interleaving a doc PUT with a membership
   PUT must not clobber either side — the doc write carries no membership and
   the membership route never claims a revision. */
test('a doc PUT and a setMemberTeams call interleave without clobbering (TEAM-05)', async () => {
  const s = await startServer();
  try {
    const signedIn = await login(s.base, ADMIN.email, ADMIN.password);
    const boss = signedIn.client;

    const live = (await boss.get('/api/workspaces/acme')).data;
    const doc = structuredClone(live.doc);
    doc.data.teams = [{ id: 'team_m', name: 'Mix', members: [] }];
    doc.data.tasks = doc.data.tasks || [];
    doc.data.tasks.push({ id: 't_mix', project: doc.data.projects?.[0]?.id || 'p0', title: 'Racy', status: 'todo', labels: [], subtasks: [] });
    assert.equal((await boss.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);

    const [inv] = (await boss.post('/api/workspaces/acme/invites', { emails: ['racy@test.local'], role: 'member' })).data.invites;
    const account = (await signup(s.base, ACCOUNT('Racy', 'racy@test.local'))).client;
    assert.equal((await account.post(`/api/invites/${inviteToken(inv.url)}/accept`)).status, 200);
    const uid2 = (await boss.get('/api/workspaces/acme/members')).data.members.find(m => m.email === 'racy@test.local').userId;

    // Client A PUTs the doc while client B changes the member's team set.
    const mid = (await boss.get('/api/workspaces/acme')).data;
    const docA = structuredClone(mid.doc);
    docA.data.tasks.find(t => t.id === 't_mix').title = 'Renamed by A';
    const putA = boss.put('/api/workspaces/acme', { revision: mid.revision, doc: docA });
    const setB = boss.put(`/api/workspaces/acme/members/${uid2}/teams`, { teams: ['team_m'] });
    const [ra, rb] = await Promise.all([putA, setB]);
    assert.equal(ra.status, 200, 'the doc PUT survives the concurrent membership write');
    assert.equal(rb.status, 200, 'the membership PUT survives the concurrent doc write');

    const after = (await boss.get('/api/workspaces/acme')).data;
    assert.equal(after.doc.data.tasks.find(t => t.id === 't_mix').title, 'Renamed by A', 'the doc edit is intact');
    assert.deepEqual(
      (await boss.get('/api/workspaces/acme/members')).data.members.find(m => m.email === 'racy@test.local').teams,
      ['team_m'],
      'the membership change is intact',
    );
    const wsId = after.id;
    withDb(s.dbPath, db => {
      assert.equal(
        db.prepare('select count(*) as n from team_members where workspace_id = ? and user_id = ?').get(wsId, uid2).n,
        1,
        'the authority row survived',
      );
    });
  } finally {
    await s.stop();
  }
});

/* D-07 (Phase 28): multi-team invites over HTTP — the POST carries the full
   team set, the payload serializes teams[], and acceptance lands one
   team_members row per team. Each test boots its own server instance so the
   shared suite's five-accept throttle budget stays untouched. */
test('a multi-team invite lands one team_members row per team at acceptance', async () => {
  const s = await startServer();
  try {
    const boss = (await login(s.base, ADMIN.email, ADMIN.password)).client;

    // Define two teams in the workspace document (definitions stay in the doc, D-02).
    const live = (await boss.get('/api/workspaces/acme')).data;
    const doc = structuredClone(live.doc);
    doc.data.teams = [
      { id: 'team_a', name: 'Alpha', members: [] },
      { id: 'team_b', name: 'Beta', members: [] },
    ];
    assert.equal((await boss.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);

    // Dedup + order stability: a repeated id collapses in the payload.
    const [row] = (await boss.post('/api/workspaces/acme/invites', { emails: ['mt@test.local'], role: 'member', teams: ['team_b', 'team_a', 'team_b'] })).data
      .invites;
    assert.deepEqual(row.teams, ['team_b', 'team_a'], 'the invite payload serializes the deduped team set');
    const listed = (await boss.get('/api/workspaces/acme/invites')).data.invites.find(i => i.id === row.id);
    assert.deepEqual(listed.teams, ['team_b', 'team_a'], 'the pending-invites list serializes teams[]');
    assert.equal('team' in listed, false, 'the scalar team is gone from the payload (D-04)');

    const account = (await signup(s.base, ACCOUNT('Mt', 'mt@test.local'))).client;
    const joined = await account.post(`/api/invites/${inviteToken(row.url)}/accept`);
    assert.ok([200, 201].includes(joined.status), 'the invite is accepted');

    const member = (await boss.get('/api/workspaces/acme/members')).data.members.find(m => m.email === 'mt@test.local');
    assert.deepEqual(member.teams, ['team_a', 'team_b'], 'both teams appear in the member payload');
    withDb(s.dbPath, db => {
      const userId = db.prepare('select user_id from memberships m join users u on u.id = m.user_id where u.email = ?').get('mt@test.local').user_id;
      assert.deepEqual(
        db
          .prepare('select team_id from team_members where user_id = ? order by team_id')
          .all(userId)
          .map(r => r.team_id),
        ['team_a', 'team_b'],
        'acceptance inserted one team_members row per invited team',
      );
    });
  } finally {
    await s.stop();
  }
});

test('a teamless invite inserts zero team_members rows and invalid team sets are rejected', async () => {
  const s = await startServer();
  try {
    const boss = (await login(s.base, ADMIN.email, ADMIN.password)).client;
    const base = '/api/workspaces/acme/invites';

    assert.equal((await boss.post(base, { emails: ['a@x.local'], role: 'member', teams: 'team_a' })).status, 400, 'non-array teams → teamsRequired');
    assert.equal((await boss.post(base, { emails: ['a@x.local'], role: 'member', teams: ['nope'] })).status, 400, 'unknown team id → unknownTeam');
    assert.equal(
      (await boss.post(base, { emails: ['a@x.local'], role: 'member', teams: Array.from({ length: 26 }, (_, i) => `t${i}`) })).status,
      400,
      'over the cap → tooManyTeams',
    );

    // A teamless invite is a valid state (D-03): accept → zero authority rows.
    const live = (await boss.get('/api/workspaces/acme')).data;
    const doc = structuredClone(live.doc);
    doc.data.teams = [{ id: 'team_a', name: 'Alpha', members: [] }];
    assert.equal((await boss.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);
    const [row] = (await boss.post(base, { emails: ['solo@test.local'], role: 'member', teams: [] })).data.invites;
    assert.deepEqual(row.teams, [], 'the payload carries the empty set');
    const account = (await signup(s.base, ACCOUNT('Solo', 'solo@test.local'))).client;
    const joined = await account.post(`/api/invites/${inviteToken(row.url)}/accept`);
    assert.ok([200, 201].includes(joined.status), 'the invite is accepted');
    const member = (await boss.get('/api/workspaces/acme/members')).data.members.find(m => m.email === 'solo@test.local');
    assert.deepEqual(member.teams, [], 'the member is teamless');
    withDb(s.dbPath, db =>
      assert.equal(db.prepare('select count(*) as n from team_members where user_id = ?').get(member.userId).n, 0, 'zero rows for a teamless invite'),
    );
  } finally {
    await s.stop();
  }
});

/* TEAM-03/TEAM-04 (Phase 28): the client-side predicates, unit-level.
   The browser modules read `document`, `navigator` and `localStorage` while
   they load, so the globals are stubbed before the store and actions are
   imported dynamically — the same pattern as test/creator-watcher.test.mjs. */
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

const { applyDoc, D, memberInProjectTeams, memberTeams, assignableInProject } = await import('../src/core/store.js');
const { emitMentions } = await import('../src/actions/actions.js');

function memberDoc(members, teams, projects = []) {
  applyDoc(
    {
      data: {
        me: 'boss',
        members: members.map(m => ({ ...m })),
        teams: teams.map(t => ({ ...t })),
        projects,
        projOrder: projects.map(p => p.id),
        tasks: [],
        comments: [],
        notifs: [],
        activity: [],
      },
    },
    1,
  );
}

test('TEAM-03: a member in two mentioned teams is targeted exactly once', () => {
  memberDoc(
    [
      { id: 'm1', name: 'Ada Lovelace', status: 'active', teams: ['t1', 't2'] },
      { id: 'm2', name: 'Bob Chen', status: 'active', teams: ['t2'] },
      { id: 'm3', name: 'Cara Diaz', status: 'active', teams: [] },
    ],
    [
      { id: 't1', name: 'Alpha' },
      { id: 't2', name: 'Beta' },
    ],
  );
  D().notifPrefs = {};
  const targets = emitMentions('@Alpha @Beta ship it', null);
  assert.deepEqual([...targets].sort(), ['m1', 'm2'], 'Ada is in both teams but lands in the Set once');
  assert.equal((D().notifs || []).filter(n => n.to === 'm1' && n.type === 'mention').length, 1, 'exactly one notification row for the double-mentioned member');
  assert.equal([...targets].includes('m3'), false, 'a teamless member is not targeted');
});

test('TEAM-03: a member not in the mentioned team is not targeted', () => {
  memberDoc(
    [
      { id: 'm1', name: 'Ada Lovelace', status: 'active', teams: ['t1'] },
      { id: 'm2', name: 'Bob Chen', status: 'active', teams: ['t2'] },
    ],
    [{ id: 't1', name: 'Alpha' }],
  );
  D().notifPrefs = {};
  const targets = emitMentions('ping @Alpha', null);
  assert.deepEqual([...targets], ['m1']);
  assert.equal([...targets].includes('m2'), false, 'Bob (t2 only) is excluded');
});

test('TEAM-04: the assignment-picker intersection excludes members outside the project teams', () => {
  const project = { id: 'p1', teams: ['t1'] };
  const dual = { id: 'm1', teams: ['t1', 't2'] };
  const other = { id: 'm2', teams: ['t2'] };
  assert.equal(memberInProjectTeams(dual, project), true, 'a member whose set intersects is assignable');
  assert.equal(memberInProjectTeams(other, project), false, 'a member outside every project team is excluded');
  /* Legacy tolerance mirrors projTeams: scalar member shapes still read. */
  assert.equal(memberInProjectTeams({ id: 'm3', team: 't1' }, { id: 'p1', teams: ['t1'] }), true);
  assert.deepEqual(memberTeams(null), [], 'the accessor tolerates a null member');
});

test('TEAM-04: the picker predicate assignableInProject filters picker options', () => {
  const scoped = { id: 'p1', teams: ['t1'] };
  const inSet = { id: 'm1', teams: ['t1'] };
  const outOfSet = { id: 'm2', teams: ['t2'] };
  assert.equal(assignableInProject(inSet, scoped, null), true, 'an intersecting member is offered');
  assert.equal(assignableInProject(outOfSet, scoped, null), false, 'an out-of-set member is excluded (fails_when case)');
  assert.equal(assignableInProject(outOfSet, scoped, 'm2'), true, 'the currently-assigned out-of-set member stays visible');
  assert.equal(assignableInProject({ id: 'm3', teams: [] }, scoped, null), false, 'a teamless member is excluded from a scoped project');
  assert.equal(assignableInProject(inSet, { id: 'p1', teams: [] }, null), true, 'an unscoped project (empty teams[]) keeps everyone assignable');
  assert.equal(assignableInProject({ id: 'm1', team: 't1' }, scoped, null), true, 'legacy scalar member shape tolerated');
  assert.equal(assignableInProject(null, scoped, null), false, 'a null member is tolerated');
});

/* TEAM-02..05 composite (Phase 28 close-out): one member, one team set — the
   invite path lands it, the admin API extends it, @team mentions target it,
   and a concurrent doc PUT never clobbers it. */
test('TEAM composite: the team set survives invites, edits, mentions and concurrent doc writes', async () => {
  const s = await startServer();
  try {
    const boss = (await login(s.base, ADMIN.email, ADMIN.password)).client;

    // Two team definitions live in the doc (D-02); the doc also carries a task
    // so the concurrent PUT below has something real to change.
    const live = (await boss.get('/api/workspaces/acme')).data;
    const doc = structuredClone(live.doc);
    doc.data.teams = [
      { id: 'team_a', name: 'Alpha', members: [] },
      { id: 'team_b', name: 'Beta', members: [] },
    ];
    doc.data.tasks = doc.data.tasks || [];
    doc.data.tasks.push({ id: 't_comp', project: doc.data.projects?.[0]?.id || 'p0', title: 'Composite', status: 'todo', labels: [], subtasks: [] });
    assert.equal((await boss.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);

    // The multi-team invite path lands the member in BOTH rosters at once.
    const [inv] = (await boss.post('/api/workspaces/acme/invites', { emails: ['duo@test.local'], role: 'member', teams: ['team_a', 'team_b'] })).data.invites;
    const duo = (await signup(s.base, ACCOUNT('Duo', 'duo@test.local'))).client;
    const accepted = await duo.post(`/api/invites/${inviteToken(inv.url)}/accept`);
    assert.ok([200, 201].includes(accepted.status), 'the multi-team invite is accepted');
    let row = (await boss.get('/api/workspaces/acme/members')).data.members.find(m => m.email === 'duo@test.local');
    assert.deepEqual(row.teams, ['team_a', 'team_b'], 'the member appears in both rosters (teams[] projection)');

    // The admin API reads and rewrites the same authority set.
    assert.equal((await boss.put(`/api/workspaces/acme/members/${row.userId}/teams`, { teams: ['team_b', 'team_a', 'team_a'] })).status, 200);
    row = (await boss.get('/api/workspaces/acme/members')).data.members.find(m => m.email === 'duo@test.local');
    assert.deepEqual(row.teams, ['team_a', 'team_b'], 'the set is deduped and stable across the round-trip');

    // A concurrent doc PUT does not clobber the membership set (TEAM-05).
    const mid = (await boss.get('/api/workspaces/acme')).data;
    const docA = structuredClone(mid.doc);
    docA.data.tasks.find(t => t.id === 't_comp').title = 'Renamed';
    const [ra, rb] = await Promise.all([
      boss.put('/api/workspaces/acme', { revision: mid.revision, doc: docA }),
      boss.put(`/api/workspaces/acme/members/${row.userId}/teams`, { teams: ['team_a', 'team_b'] }),
    ]);
    assert.equal(ra.status, 200, 'the doc PUT survives');
    assert.equal(rb.status, 200, 'the membership PUT survives');
    const after = (await boss.get('/api/workspaces/acme')).data;
    assert.equal(after.doc.data.tasks.find(t => t.id === 't_comp').title, 'Renamed', 'the doc edit is intact');
    assert.deepEqual(
      (await boss.get('/api/workspaces/acme/members')).data.members.find(m => m.email === 'duo@test.local').teams,
      ['team_a', 'team_b'],
      'the team set is intact',
    );

    // @team mentions target the member through either team, exactly once (TEAM-03).
    memberDoc(
      [{ id: row.memberId, name: 'Duo', status: 'active', teams: row.teams }],
      [
        { id: 'team_a', name: 'Alpha' },
        { id: 'team_b', name: 'Beta' },
      ],
    );
    D().notifPrefs = {};
    const targets = emitMentions('@Alpha @Beta wrap the phase', null);
    assert.deepEqual([...targets], [row.memberId], 'the member is targeted once through either team');
    assert.equal((D().notifs || []).filter(n => n.to === row.memberId && n.type === 'mention').length, 1, 'exactly one notification row');
  } finally {
    await s.stop();
  }
});

/* Phase 50 (50-03, D-50-3): a role edit takes effect on the VERY next request
   with the same session — requireWorkspace re-resolves the membership row per
   request, so the demoted account hits the role gate without re-login.
   Runs on its own server instance: by this point in the suite the main
   workspace has no editable plain member left (cara removed, eve and bob
   left), and the main server's accept throttle is spent. */
test('a role change is enforced on the very next request (D-50-3 immediate effect)', async () => {
  const s = await startServer();
  try {
    const boss = (await login(s.base, ADMIN.email, ADMIN.password)).client;
    const plain = (await signup(s.base, ACCOUNT('Pat', 'pat@test.local'))).client;
    // Pat joins as a plain member through an owner invite.
    const [inv] = (await boss.post('/api/workspaces/acme/invites', { emails: ['pat@test.local'], role: 'member' })).data.invites;
    assert.equal((await plain.post(`/api/invites/${inviteToken(inv.url)}/accept`)).status, 200);

    // Baseline: the member can push the doc today.
    const live = await (await plain.get('/api/workspaces/acme')).data;
    assert.equal((await plain.put('/api/workspaces/acme', { revision: live.revision, doc: live.doc })).status, 200);

    // Owner demotes member → viewer.
    const uid = (await roster(boss)).members.find(m => m.email === 'pat@test.local').userId;
    assert.equal((await boss.patch(`/api/workspaces/acme/members/${uid}`, { role: 'viewer' })).status, 200);

    // Same session, next request: the write surface is already closed.
    const after = await plain.get('/api/workspaces/acme');
    assert.equal(after.status, 200, 'a viewer still reads');
    const refused = await plain.put('/api/workspaces/acme', { revision: after.data.revision, doc: after.data.doc });
    assert.equal(refused.status, 403);
    assert.equal(refused.data.code, 'readOnlyAccess');
    const label = (await roster(boss)).members.find(m => m.email === 'pat@test.local');
    assert.equal(label.role, 'viewer');
    assert.equal(label.roleLabel, 'Guest', 'the roster reflects the demotion with no re-login');
  } finally {
    await s.stop();
  }
});

/* Phase 50 (50-03, INV-02 / D-50-1/2/3/4): the project-membership edit
   surface — scope/status are p.members operations ONLY, immediate on the very
   next request, guarded by the stricter D-50-4 hierarchy, coexisting with
   live team-linked access. Runs on its own server instance (the main suite
   has no editable members left and the accept throttle is spent). */
test('project membership edits: immediate effect, hierarchy guard, team-term coexistence', async () => {
  const s = await startServer();
  try {
    const boss = (await login(s.base, ADMIN.email, ADMIN.password)).client;
    const join = async (name, email) => {
      const who = (await signup(s.base, ACCOUNT(name, email))).client;
      const [inv] = (await boss.post('/api/workspaces/acme/invites', { emails: [email], role: 'member' })).data.invites;
      assert.equal((await who.post(`/api/invites/${inviteToken(inv.url)}/accept`)).status, 200, `${email} joins`);
      return who;
    };
    const pat = await join('Pat', 'pat@test.local');
    const quinn = await join('Quinn', 'quinn@test.local');
    const remy = await join('Remy', 'remy@test.local');
    const rosterOf = async () => (await boss.get('/api/workspaces/acme/members')).data.members;
    const uidOf = async email => (await rosterOf()).find(m => m.email === email).userId;

    // A private project (owner-managed) and a team-linked private project.
    const live = await (await boss.get('/api/workspaces/acme')).data;
    const doc = structuredClone(live.doc);
    const ownerId = (await rosterOf()).find(m => m.role === 'owner').memberId;
    doc.data.teams = [{ id: 'tA', name: 'Alpha', members: [] }];
    doc.data.projects.push({ id: 'p_priv', key: 'priv', name: 'Private', private: true, members: [ownerId], lead: ownerId, teams: [], status: 'active', perms: {} });
    doc.data.projects.push({ id: 'p_team', key: 'team', name: 'Team Private', private: true, members: [ownerId], lead: ownerId, teams: ['tA'], status: 'active', perms: {} });
    assert.equal((await boss.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);

    // 1) Admin adds U to p.members → the very next request reads P (same session).
    const patId = await uidOf('pat@test.local');
    assert.equal((await boss.post('/api/workspaces/acme/projects/p_priv/members', { userId: patId })).status, 200);
    const patDoc = await pat.get('/api/workspaces/acme');
    assert.ok(
      (patDoc.data?.doc?.data?.projects || []).some(p => p.id === 'p_priv'),
      'the added member reads the private project on the request immediately after the edit',
    );

    // 2) Admin removes U → the very next request no longer serves P.
    assert.equal((await boss.del(`/api/workspaces/acme/projects/p_priv/members/${patId}`)).status, 200);
    const afterRemoval = await pat.get('/api/workspaces/acme');
    assert.equal(
      (afterRemoval.data?.doc?.data?.projects || []).some(p => p.id === 'p_priv'),
      false,
      'the removed member loses access on the request immediately after the edit',
    );

    // 3) Cross-admin refusal (D-50-4): an admin cannot edit another admin's
    //    project access; the owner can.
    assert.equal((await boss.patch(`/api/workspaces/acme/members/${patId}`, { role: 'admin' })).status, 200);
    const quinnId = await uidOf('quinn@test.local');
    assert.equal((await boss.patch(`/api/workspaces/acme/members/${quinnId}`, { role: 'admin' })).status, 200);
    const crossAdmin = await quinn.post('/api/workspaces/acme/projects/p_priv/members', { userId: patId });
    assert.equal(crossAdmin.status, 403);
    assert.equal(crossAdmin.data.code, 'ownerManagedRoles');
    assert.equal((await boss.post('/api/workspaces/acme/projects/p_priv/members', { userId: patId })).status, 200, 'the owner edits the admin');

    // 4) Team-linked access coexists: removing Remy from p_team.members keeps
    //    Remy's live tA link in force (D-50-5 predicate on the next request).
    const remyId = await uidOf('remy@test.local');
    assert.equal((await boss.put(`/api/workspaces/acme/members/${remyId}/teams`, { teams: ['tA'] })).status, 200);
    assert.equal((await boss.post('/api/workspaces/acme/projects/p_team/members', { userId: remyId })).status, 200);
    assert.ok(
      (await (await remy.get('/api/workspaces/acme')).data.doc.data.projects).some(p => p.id === 'p_team'),
      'the team-linked member reads the project',
    );
    assert.equal((await boss.del(`/api/workspaces/acme/projects/p_team/members/${remyId}`)).status, 200);
    assert.ok(
      (await (await remy.get('/api/workspaces/acme')).data.doc.data.projects).some(p => p.id === 'p_team'),
      'the access-list removal does not touch the team term — access retained',
    );
    assert.deepEqual((await rosterOf()).find(m => m.userId === remyId).teams, ['tA'], 'the team authority rows are untouched by the project edit');
  } finally {
    await s.stop();
  }
});
