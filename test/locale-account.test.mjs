/* Phase 8 server contracts: the account owns the interface language.
   PATCH /api/auth/me writes users.locale only — gated, whitelisted, and never
   touching the workspace row. Real server, real SQLite, nothing mocked. */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, inviteToken, login, signup, startServer, withDb } from './helpers/server.mjs';

const PASSWORD = 'locale-password-1';

let server;
let owner;
let bob;
let bobId;

const localeOf = email => withDb(server.dbPath, db => db.prepare('select locale from users where email = ?').get(email).locale);
const workspaceRow = () =>
  withDb(server.dbPath, db => db.prepare('select doc, revision, updated_at from workspaces order by created_at limit 1').get());

before(async () => {
  server = await startServer();
  const signedIn = await login(server.base, ADMIN.email, ADMIN.password);
  assert.equal(signedIn.status, 200, 'bootstrap owner signs in');
  owner = signedIn.client;
  const joined = await signup(server.base, { name: 'Bob', email: 'bob@test.local', password: PASSWORD });
  assert.equal(joined.status, 201, 'bob signs up');
  bob = joined.client;
  const invited = await owner.post('/api/workspaces/acme/invites', { emails: ['bob@test.local'], role: 'member' });
  assert.equal(invited.status, 201, 'owner invites bob into the shared workspace');
  const accepted = await bob.post(`/api/invites/${inviteToken(invited.data.invites[0].url)}/accept`);
  assert.equal(accepted.status, 200, 'bob accepts');
  bobId = joined.data.user.id;
  const roster = await owner.get('/api/workspaces/acme/members');
  assert.ok(roster.data.members.some(m => m.email === 'bob@test.local'), 'bob shares the workspace');
});

after(async () => {
  await server?.stop();
});

test('a fresh account has a null locale', async () => {
  const me = await bob.get('/api/auth/me');
  assert.equal(me.data.user.locale, null);
  assert.equal(localeOf('bob@test.local'), null);
});

test('PATCH round-trips every supported code through the users table and the payload', async () => {
  for (const code of ['fr', 'en']) {
    const res = await bob.patch('/api/auth/me', { locale: code });
    assert.equal(res.status, 200, `patch ${code}`);
    assert.equal(res.data.user.locale, code, 'response carries the code');
    assert.equal(localeOf('bob@test.local'), code, 'users row carries the code');
    const me = await bob.get('/api/auth/me');
    assert.equal(me.data.user.locale, code, 'GET me carries the code');
  }
});

test('an unknown code is rejected with 400 and nothing is written', async () => {
  await bob.patch('/api/auth/me', { locale: 'fr' });
  for (const bad of ['de', '', 'Français', 'FR', null, 42]) {
    const res = await bob.patch('/api/auth/me', { locale: bad });
    assert.equal(res.status, 400, `rejects ${JSON.stringify(bad)}`);
  }
  assert.equal((await bob.patch('/api/auth/me', {})).status, 400, 'missing locale is rejected');
  assert.equal(localeOf('bob@test.local'), 'fr', 'stored value unchanged');
});

test('only body.locale is read — extra fields are ignored', async () => {
  const before = withDb(server.dbPath, db => db.prepare('select * from users where id = ?').get(bobId));
  const res = await bob.patch('/api/auth/me', { locale: 'en', name: 'Mallory', email: 'x@evil.test', id: 'other' });
  assert.equal(res.status, 200);
  const after = withDb(server.dbPath, db => db.prepare('select * from users where id = ?').get(bobId));
  assert.deepEqual({ ...after, locale: null }, { ...before, locale: null }, 'every other column is untouched');
  assert.equal(after.locale, 'en');
});

test('a signed-out PATCH is 401', async () => {
  const res = await fetch(`${server.base}/api/auth/me`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ locale: 'fr' }),
  });
  assert.equal(res.status, 401);
});

test('a cross-origin PATCH is 403 and writes nothing', async () => {
  const before = localeOf('bob@test.local');
  const res = await fetch(`${server.base}/api/auth/me`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: bob.cookie(), origin: 'https://evil.example' },
    body: JSON.stringify({ locale: before === 'fr' ? 'en' : 'fr' }),
  });
  assert.equal(res.status, 403);
  assert.equal(localeOf('bob@test.local'), before, 'stored row unchanged');
});

test('a language change leaves the workspaces row byte-identical (LOC-04)', async () => {
  const before = workspaceRow();
  assert.equal((await bob.patch('/api/auth/me', { locale: 'fr' })).status, 200);
  assert.equal((await owner.patch('/api/auth/me', { locale: 'en' })).status, 200);
  assert.deepEqual(workspaceRow(), before, 'doc, revision and updated_at are unchanged');
});

test('two accounts in one workspace hold different locales (LOC-03)', async () => {
  assert.equal((await owner.patch('/api/auth/me', { locale: 'en' })).status, 200);
  assert.equal((await bob.patch('/api/auth/me', { locale: 'fr' })).status, 200);
  assert.equal(localeOf(ADMIN.email), 'en');
  assert.equal(localeOf('bob@test.local'), 'fr');
  assert.equal((await owner.get('/api/auth/me')).data.user.locale, 'en');
  assert.equal((await bob.get('/api/auth/me')).data.user.locale, 'fr');
});
