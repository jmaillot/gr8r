/* Phase 2 membership lifecycle over HTTP: invites, roles, guards, removal
   cleanup, leave and workspace deletion, against an isolated server. */
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
const invite = async (emails, role) => {
  const res = await owner.post('/api/workspaces/acme/invites', { emails, role });
  assert.equal(res.status, 201, `invite ${emails.join(', ')}`);
  return res.data.invites;
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
  const [row] = await invite(['ghost@test.local'], 'viewer');
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
  const [row] = await invite(['revoked@test.local'], 'viewer');
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

test('the last owner cannot leave', async () => {
  const res = await owner.post('/api/workspaces/acme/leave');
  assert.equal(res.status, 409);
  assert.match(res.data.error, /owner/);
});

test('only an owner changes the plan', async () => {
  assert.equal((await bob.post('/api/workspaces/acme/plan', { plan: 'Business' })).status, 403, 'an admin cannot change the plan');
  assert.equal((await cara.post('/api/workspaces/acme/plan', { plan: 'Business' })).status, 403, 'a member cannot change the plan');
  assert.equal((await owner.post('/api/workspaces/acme/plan', { plan: 'Nope' })).status, 400);
  assert.equal((await owner.post('/api/workspaces/acme/plan', { plan: 'Free' })).status, 200);

  const served = (await owner.get('/api/workspaces/acme')).data;
  assert.equal(served.doc.data.plan, 'Free', 'the plan change is visible in the served document');
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
  assert.equal(after.doc.data.teams[0].members.includes(caraRow.memberId), false, 'the team roster is stripped');
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
  const gamma = (await eve.get('/api/workspaces/gamma')).data;
  const inviteRow = (await eve.post('/api/workspaces/gamma/invites', { emails: ['ghost@test.local'], role: 'viewer' })).data.invites[0];
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
