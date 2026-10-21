/* Phase 1 tenancy contract over HTTP: many workspaces per account, slug-scoped
   access, server-side role enforcement and strict cross-tenant isolation. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, client, inviteToken, login, signup, startServer } from './helpers/server.mjs';

const PASSWORD = 'member-password-1';
const project = (doc, id) => (doc.data.projects || []).find(p => p.id === id);

let server;
let owner;
let bob;
let cara;
let dan;

/* Invite an account that already signed up, then accept while signed in. */
async function join(actor, slug, account, email, role) {
  const invited = await actor.post(`/api/workspaces/${slug}/invites`, { emails: [email], role });
  assert.equal(invited.status, 201, `invite ${email} to ${slug}`);
  const accepted = await account.post(`/api/invites/${inviteToken(invited.data.invites[0].url)}/accept`);
  assert.equal(accepted.status, 200, `${email} accepts the ${slug} invite`);
}

before(async () => {
  server = await startServer();
  const signedIn = await login(server.base, ADMIN.email, ADMIN.password);
  assert.equal(signedIn.status, 200, 'bootstrap owner signs in');
  owner = signedIn.client;

  bob = (await signup(server.base, { name: 'Bob', email: 'bob@test.local', password: PASSWORD })).client;
  cara = (await signup(server.base, { name: 'Cara', email: 'cara@test.local', password: PASSWORD })).client;
  dan = (await signup(server.base, { name: 'Dan', email: 'dan@test.local', password: PASSWORD })).client;
});

after(async () => {
  await server?.stop();
});

test('the bootstrap owner lists acme with the owner role', async () => {
  const me = await owner.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, ADMIN.email);
  assert.equal(me.data.user.workspaces.length, 1);

  const [acme] = me.data.user.workspaces;
  assert.equal(acme.slug, 'acme');
  assert.equal(acme.role, 'owner');
  assert.equal(typeof acme.memberId, 'string');
  assert.ok(acme.memberId.length > 0);
});

test('a signed-in account creates a second workspace and owns it', async () => {
  const created = await owner.post('/api/workspaces', { name: 'Beta', slug: 'beta' });
  assert.equal(created.status, 201);
  assert.equal(created.data.workspace.slug, 'beta');
  assert.equal(created.data.workspace.role, 'owner');

  const list = await owner.get('/api/workspaces');
  assert.equal(list.status, 200);
  assert.deepEqual(
    list.data.workspaces.map(w => w.slug),
    ['acme', 'beta'],
  );
  assert.deepEqual(
    list.data.workspaces.map(w => w.role),
    ['owner', 'owner'],
  );
});

test('each workspace serves its own document', async () => {
  const before = await owner.get('/api/workspaces/acme');
  assert.equal(before.status, 200);
  const doc = structuredClone(before.data.doc);
  doc.data.projects = [{ id: 'p_acme', key: 'acme', name: 'Acme project', private: false, members: [], perms: {}, team: null, status: 'active' }];
  doc.data.projOrder = ['p_acme'];
  assert.equal((await owner.put('/api/workspaces/acme', { revision: before.data.revision, doc })).status, 200);

  const acme = (await owner.get('/api/workspaces/acme')).data;
  const beta = (await owner.get('/api/workspaces/beta')).data;
  assert.notEqual(acme.id, beta.id, 'workspace rows have distinct ids');
  assert.equal(project(acme.doc, 'p_acme').name, 'Acme project');
  assert.equal(project(beta.doc, 'p_acme'), undefined, 'acme project is absent from the beta document');
  assert.deepEqual(beta.doc.data.projects, []);
});

test('tenancy fields are derived from the workspace row, never from the document', async () => {
  const live = (await owner.get('/api/workspaces/acme')).data;
  const doc = structuredClone(live.doc);
  doc.data.workspaces = [{ name: 'Fake Co', url: 'fake' }];
  doc.data.me = { id: 'm_fake', name: 'Somebody Else' };
  doc.data.ws = { name: 'Hacked', url: 'hacked', c: '#000000' };
  assert.equal((await owner.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);

  const served = (await owner.get('/api/workspaces/acme')).data;
  assert.equal(served.doc.data.ws.name, 'Acme');
  assert.equal(served.doc.data.ws.url, 'acme');
  assert.equal(served.doc.data.ws.c, served.color);
  assert.equal(served.doc.data.me, null, 'data.me is not shared through the document');
  assert.equal(served.doc.data.workspaces, undefined, 'the demo workspace array is dropped');

  assert.equal((await owner.patch('/api/workspaces/acme', { name: 'Acme Studio' })).status, 200);
  const renamed = (await owner.get('/api/workspaces/acme')).data;
  assert.equal(renamed.name, 'Acme Studio');
  assert.equal(renamed.doc.data.ws.name, 'Acme Studio', 'data.ws follows the workspace row');
  assert.equal(renamed.doc.data.ws.url, 'acme');

  assert.equal((await owner.patch('/api/workspaces/acme', { name: 'Acme' })).status, 200);
  assert.equal((await owner.get('/api/workspaces/acme')).data.doc.data.ws.name, 'Acme');
});

test('an account that only belongs to beta cannot read or write acme', async () => {
  await join(owner, 'beta', bob, 'bob@test.local', 'member');

  const beta = await bob.get('/api/workspaces/beta');
  assert.equal(beta.status, 200, 'bob reads his own workspace');
  assert.equal(beta.data.slug, 'beta');
  assert.equal(beta.data.role, 'member');
  assert.equal(project(beta.data.doc, 'p_acme'), undefined, 'bob never receives the acme document');

  assert.equal((await bob.get('/api/workspaces/acme')).status, 404, 'cross-tenant read is a 404');
  const live = (await owner.get('/api/workspaces/acme')).data;
  assert.equal((await bob.put('/api/workspaces/acme', { revision: live.revision, doc: live.doc })).status, 404, 'cross-tenant write is a 404');
  assert.equal((await bob.patch('/api/workspaces/acme', { name: 'Stolen' })).status, 404, 'cross-tenant rename is a 404');
  assert.equal((await owner.get('/api/workspaces/acme')).data.name, 'Acme', 'the failed rename changed nothing');
});

test('a viewer reads but cannot write', async () => {
  await join(owner, 'acme', cara, 'cara@test.local', 'viewer');

  const read = await cara.get('/api/workspaces/acme');
  assert.equal(read.status, 200);
  assert.equal(read.data.role, 'viewer');
  assert.ok(project(read.data.doc, 'p_acme'), 'a viewer still receives workspace-wide projects');

  const live = await cara.get('/api/workspaces/acme');
  assert.equal((await cara.put('/api/workspaces/acme', { revision: live.data.revision, doc: live.data.doc })).status, 403);
  assert.equal((await cara.post('/api/workspaces/acme/invites', { emails: ['viewer-test@test.local'] })).status, 403);
});

test('a member cannot rename the workspace, edit the roster or change the plan', async () => {
  await join(owner, 'acme', dan, 'dan@test.local', 'member');

  assert.equal((await dan.patch('/api/workspaces/acme', { name: 'Dan Co' })).status, 403, 'PATCH is admin-only');

  const live = (await dan.get('/api/workspaces/acme')).data;
  assert.equal(live.role, 'member');
  const doc = structuredClone(live.doc);
  doc.data.members = [];
  doc.data.plan = 'Business';
  doc.data.ws = { name: 'Dan Co', url: 'dan-co', c: '#FFFFFF' };
  doc.data.me = { id: 'm_dan', name: 'Dan' };
  project(doc, 'p_acme').name = 'Renamed by a member';
  assert.equal((await dan.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200, 'a member keeps write access to the document');

  const served = (await owner.get('/api/workspaces/acme')).data;
  assert.equal(served.doc.data.plan, 'Team', 'the plan is not set through the document');
  assert.equal(served.doc.data.ws.name, 'Acme', 'data.ws is not set through the document');
  assert.equal(served.doc.data.ws.url, 'acme');
  assert.equal(served.doc.data.me, null);
  assert.equal(served.doc.data.members.length, 3, 'the roster is restored from storage');
  assert.deepEqual(served.doc.data.members.map(m => m.email).sort(), ['cara@test.local', 'dan@test.local', 'owner@test.local']);
  assert.equal(served.doc.data.members.find(m => m.email === ADMIN.email).role, 'Owner');
  assert.equal(project(served.doc, 'p_acme').name, 'Renamed by a member', 'visible edits still persist');
});

test('slugs are validated and uniqueness is enforced with a suggestion', async () => {
  const duplicate = await owner.post('/api/workspaces', { name: 'Duplicate', slug: 'acme' });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.data.suggestion, 'acme-2');

  assert.equal((await owner.post('/api/workspaces', { name: 'Too short', slug: 'x' })).status, 400);
  assert.equal((await owner.post('/api/workspaces', { name: 'Blank', slug: '---' })).status, 400);
  assert.equal((await owner.post('/api/workspaces', { name: 'Reserved', slug: 'api' })).status, 400);
  assert.equal((await owner.post('/api/workspaces', { name: 'Reserved', slug: 'join' })).status, 400);
  assert.equal((await owner.post('/api/workspaces', { name: '   ' })).status, 400, 'a workspace needs a name');
});

test('a stale revision is rejected', async () => {
  const live = (await owner.get('/api/workspaces/acme')).data;
  const stale = await owner.put('/api/workspaces/acme', { revision: live.revision - 1, doc: live.doc });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.revision, live.revision);
});

test('signed-out callers get 401 on the API and null on the probe', async () => {
  const anonymous = client(server.base, 'anonymous');
  assert.equal((await anonymous.get('/api/workspaces/acme')).status, 401);
  assert.equal((await anonymous.put('/api/workspaces/acme', { revision: 1, doc: {} })).status, 401);
  assert.equal((await anonymous.post('/api/workspaces', { name: 'Anon' })).status, 401);

  const probe = await anonymous.get('/api/auth/me');
  assert.equal(probe.status, 200);
  assert.equal(probe.data.user, null);
});
