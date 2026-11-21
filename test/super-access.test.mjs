/* [2026-11-20, owner quick-task] Instance-admin super-access: the operator
   enters ANY workspace without a membership and acts as owner inside it
   (owner ratification "operator = owner inside"), with no memberships row —
   the member list stays honest. Entry points: governance Open action +
   workspace switcher (membershipsOf union). Archived workspaces admit the
   operator READ-ONLY (79-D-02 members stay locked out). */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, client, inviteToken, login, signup, startServer } from './helpers/server.mjs';

const PASSWORD = 'super-password-1';
const ACCOUNT = (name, email) => ({ name, email, password: PASSWORD });

let server;
let operator; // bootstrap owner = instance admin (real owner membership in acme)
let member; // real member of acme; owns the FOREIGN workspace
let outsider; // no memberships at all, NOT an operator (until invited in test 2)
const foreignSlug = 'foreign-ws'; // workspace owned by member — the operator has NO membership there

before(async () => {
  server = await startServer();
  const signedIn = await login(server.base, ADMIN.email, ADMIN.password);
  assert.equal(signedIn.status, 200, 'bootstrap owner (instance admin) signs in');
  operator = signedIn.client;

  member = (await signup(server.base, ACCOUNT('Member', 'super-member@test.local'))).client;
  outsider = (await signup(server.base, ACCOUNT('Outsider', 'super-out@test.local'))).client;

  // member joins acme via the invite accept route
  const inv = await operator.post('/api/workspaces/acme/invites', { emails: ['super-member@test.local'], role: 'member' });
  assert.equal(inv.status, 201, 'member invited');
  const token = inviteToken(inv.data.invites?.[0]?.url);
  assert.ok(token, 'invite payload carries the join link');
  const accept = await member.post(`/api/invites/${token}/accept`);
  assert.equal(accept.status, 200, 'member accepted invite');

  // member creates a FOREIGN workspace — the operator gets NO membership there
  const ws2 = await member.post('/api/workspaces', { name: 'Foreign WS', slug: 'foreign-ws' });
  assert.ok([200, 201].includes(ws2.status), 'member creates foreign workspace');
});

after(async () => {
  try { server.stop?.(); } catch { /* teardown best-effort */ }
});

test('super-access: the operator reads a workspace they have NO membership in', async () => {
  const res = await operator.get(`/api/workspaces/${foreignSlug}`);
  assert.equal(res.status, 200, 'operator enters foreign workspace');
  assert.equal(res.data.role, 'owner', 'synthetic owner role');
  assert.equal(res.data.memberId, null, 'no fake membership id');
});

test('super-access: the operator sees PRIVATE projects in the visibility list', async () => {
  const got = await operator.get(`/api/workspaces/${foreignSlug}`);
  assert.equal(got.status, 200);
  const doc = got.data.doc;
  doc.data.projects = [...(doc.data.projects || []), { id: 'p_super_private', key: 'p_super_private', name: 'Super private', private: true, members: [], perms: {}, team: null, status: 'active', allowInviteGuests: false }];
  const put = await operator.put(`/api/workspaces/${foreignSlug}`, { revision: got.data.revision, doc });
  assert.equal(put.status, 200, 'operator (owner rank) writes the doc');
  const vis = await operator.get(`/api/workspaces/${foreignSlug}/me/visibility`);
  assert.equal(vis.status, 200);
  assert.ok((vis.data.projects || []).some(p => p.id === 'p_super_private'), 'private project visible to super-owner');
  // the honest member-lockout control: a plain member of foreign-ws (invited
  // here, no operator flag, no project access) must NOT see the private project
  const inv = await member.post(`/api/workspaces/${foreignSlug}/invites`, { emails: ['super-out@test.local'], role: 'member' });
  assert.equal(inv.status, 201, 'outsider invited to foreign ws');
  const accept = await outsider.post(`/api/invites/${inviteToken(inv.data.invites?.[0]?.url)}/accept`);
  assert.equal(accept.status, 200);
  const visMember = await outsider.get(`/api/workspaces/${foreignSlug}/me/visibility`);
  assert.equal(visMember.status, 200);
  assert.ok(!(visMember.data.projects || []).some(p => p.id === 'p_super_private'), 'plain member still locked out of the private project');
});

test('super-access: no memberships row is created (member list stays honest)', async () => {
  const roster = await operator.get(`/api/workspaces/${foreignSlug}/members`);
  assert.equal(roster.status, 200);
  const rows = roster.data.members || [];
  assert.ok(rows.length > 0, 'roster readable');
  assert.ok(!rows.some(m => m.email === ADMIN.email), 'operator NOT listed as member');
});

test('super-access: switcher lists every workspace for the operator only', async () => {
  const me = await operator.get('/api/auth/me');
  assert.equal(me.status, 200);
  const slugs = (me.data.user?.workspaces || []).map(w => w.slug);
  assert.ok(slugs.includes('acme') && slugs.includes(foreignSlug), 'operator sees ALL workspaces (real + foreign)');
  // outsider: only their real membership (foreign-ws, accepted in test 2)
  const meOut = await outsider.get('/api/auth/me');
  assert.deepEqual((meOut.data.user?.workspaces || []).map(w => w.slug).sort(), [foreignSlug], 'outsider sees only their membership');
  // member: acme + their own foreign ws, nothing more
  const meMember = await member.get('/api/auth/me');
  assert.deepEqual((meMember.data.user?.workspaces || []).map(w => w.slug).sort(), ['acme', foreignSlug].sort(), 'member sees only their memberships');
});

test('super-access: a non-operator without membership still gets 404', async () => {
  // outsider has no membership in ACME and is not an operator
  const res = await outsider.get('/api/workspaces/acme');
  assert.equal(res.status, 404, 'no bypass for regular users');
});

test('super-access: archived workspace — operator enters read-only, member stays out', async () => {
  // archive the FOREIGN ws via the governance route
  const list = await operator.get('/api/auth/operator/workspaces');
  assert.equal(list.status, 200);
  const row = (list.data.workspaces || []).find(w => w.slug === foreignSlug);
  assert.ok(row, 'foreign ws in governance list');
  const arch = await operator.post(`/api/auth/operator/workspaces/${row.id}/archive`);
  assert.ok([200, 201].includes(arch.status), 'archived');

  const opEntry = await operator.get(`/api/workspaces/${foreignSlug}`);
  assert.equal(opEntry.status, 200, 'operator enters archived workspace');
  assert.equal(opEntry.data.role, 'viewer', 'read-only role inside archived');

  const memberEntry = await operator.get('/api/workspaces/acme'); // control: operator still fine
  assert.equal(memberEntry.status, 200);
  // the foreign owner (real member) is now LOCKED OUT of their own archived ws
  const locked = await member.get(`/api/workspaces/${foreignSlug}`);
  assert.equal(locked.status, 403, 'archived workspace refuses members (79-D-02)');
});

test('super-access: operator write inside archived workspace is refused (viewer rank)', async () => {
  const got = await operator.get(`/api/workspaces/${foreignSlug}`);
  const doc = got.data.doc;
  const put = await operator.put(`/api/workspaces/${foreignSlug}`, { revision: got.data.revision, doc });
  assert.equal(put.status, 403, 'viewer rank blocks content writes');
});

/* SUPER_ACCESS=false: the opt-out gate — a second server instance with the
   flag off. The admin keeps instance powers (governance) but can no longer
   enter a foreign workspace (no synthetic membership; membership-only
   switcher). Token discipline: an invalid token boot-refuses (WSG-01 mold). */
test('super-access off: SUPER_ACCESS=false closes foreign entry, governance keeps working', async t => {
  const server2 = await startServer({ env: { SUPER_ACCESS: 'false', ADMIN_EMAIL: 'saoff@test.local', ADMIN_PASSWORD: 'sa-off-pass-1', ADMIN_NAME: 'SA Off Admin' } });
  t.after(() => server2.stop?.());
  const helpers = await import('./helpers/server.mjs');
  const ops = (await helpers.login(server2.base, 'saoff@test.local', 'sa-off-pass-1')).client;
  const m = (await helpers.signup(server2.base, { name: 'M', email: 'saoff-m@test.local', password: 'sa-off-m-1' })).client;

  const cfg = await ops.get('/api/config');
  assert.equal(cfg.data.superAccess, false, 'config carries superAccess=false');

  const ws2 = await m.post('/api/workspaces', { name: 'F', slug: 'foreign-off' });
  assert.ok([200, 201].includes(ws2.status), 'member creates foreign ws');

  const entry = await ops.get('/api/workspaces/foreign-off');
  assert.equal(entry.status, 404, 'super-access off: foreign workspace is 404 for the admin');

  const own = await ops.get('/api/workspaces/acme');
  assert.equal(own.status, 200, 'own workspace still accessible');
  const list = await ops.get('/api/auth/operator/workspaces');
  assert.equal(list.status, 200, 'governance powers intact');
  const me = await ops.get('/api/auth/me');
  assert.deepEqual((me.data.user.workspaces || []).map(w => w.slug), ['acme'], 'switcher lists only real memberships');
});
