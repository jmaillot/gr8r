/* Accepting an invite happens in another session, so it must not move the
   document's revision: the inviter's browser still holds the revision it
   loaded, and every write it makes afterwards would be rejected with 409 and
   dropped. The membership row is the source of truth and the roster is
   repaired on read, so joining leaves the document alone.

   This file owns its own server, because the invite-accept throttle allows
   five accepts per IP per hour and the membership suite already spends them. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, inviteToken, login, signup, startServer } from './helpers/server.mjs';

let server;
let owner;

before(async () => {
  server = await startServer();
  owner = (await login(server.base, ADMIN.email, ADMIN.password)).client;
});

after(async () => {
  await server?.stop();
});

test('accepting an invite does not move the revision and keeps the roster complete', async () => {
  const before = (await owner.get('/api/workspaces/acme')).data;

  const signedUp = await signup(server.base, { name: 'Bob Two', email: 'bob-two@test.local', password: 'member-password-1' });
  const bob = signedUp.client;
  const bobId = signedUp.data.user.id;
  const invited = await owner.post('/api/workspaces/acme/invites', { emails: ['bob-two@test.local'], role: 'member' });
  assert.equal(invited.status, 201);
  const accepted = await bob.post(`/api/invites/${inviteToken(invited.data.invites[0].url)}/accept`, {});
  assert.equal(accepted.status, 200);

  /* The join happened in another session: the revision must not have moved. */
  const after = (await owner.get('/api/workspaces/acme')).data;
  assert.equal(after.revision, before.revision, 'accepting an invite must not move the revision');

  /* The inviter can keep writing with the revision it loaded. */
  const doc = structuredClone(before.doc);
  doc.data.projects = [
    ...(doc.data.projects || []),
    { id: 'p_after_join', key: 'after-join', name: 'After join', private: false, members: [], perms: {}, team: null, status: 'active' },
  ];
  doc.data.projOrder = [...(doc.data.projOrder || []), 'p_after_join'];
  const saved = await owner.put('/api/workspaces/acme', { revision: before.revision, doc });
  assert.equal(saved.status, 200, 'the inviter keeps writing after an invite is accepted');

  /* The roster is complete for everyone, even though the join never wrote the
     document: the membership table is the source of truth. */
  const roster = await owner.get('/api/workspaces/acme/members');
  assert.equal(roster.status, 200);
  assert.ok(
    roster.data.members.some(m => m.email === 'bob-two@test.local'),
    'the new member is on the roster',
  );

  const served = (await owner.get('/api/workspaces/acme')).data;
  const profile = served.doc.data.members.find(m => m.email === 'bob-two@test.local');
  assert.ok(profile, 'the served document carries the new member');
  assert.equal(profile.role, 'Member');
  assert.equal(profile.status, 'active');
  assert.equal(profile.userId, bobId, 'the profile is linked to the account');

  /* The joiner sees themselves too. */
  const mine = (await bob.get('/api/workspaces/acme')).data;
  assert.ok(
    mine.doc.data.members.some(m => m.email === 'bob-two@test.local'),
    'the joiner is on their own roster',
  );
  assert.equal(mine.memberId, profile.id, 'the joiner resolves to the same member id');
});
