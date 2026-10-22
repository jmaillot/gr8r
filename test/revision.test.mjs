/* The revision handshake between the server and the client.
   A server-side document change (member role, member removal, plan) moves the
   workspace revision. If the client keeps the old revision, its next write is
   rejected with 409, the session flips into conflict mode and every later edit
   is dropped — the workspace silently stops accepting writes. So every such
   endpoint must report the new revision, and the client must adopt it.

   The client is exercised here against a stubbed fetch: the server half of the
   contract is covered by test/membership.test.mjs. */
import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.location = { origin: 'http://localhost:8080' };

const { api } = await import('../src/core/api.js');

/* Answer every request with a canned body and remember what was asked. */
function stubFetch(routes) {
  const calls = [];
  globalThis.fetch = async (path, init) => {
    calls.push({ path, body: init?.body ? JSON.parse(init.body) : undefined });
    const body = routes[path] ?? {};
    return {
      ok: (body.status ?? 200) < 400,
      status: body.status ?? 200,
      text: async () => JSON.stringify(body.data ?? {}),
    };
  };
  return calls;
}

const ROUTES = {
  '/api/workspaces/acme': { data: { id: 'w1', name: 'Acme', slug: 'acme', color: '#1D1C1A', role: 'owner', revision: 7 } },
  '/api/workspaces/acme/members/u2': { data: { revision: 8, member: { userId: 'u2', role: 'admin' } } },
  '/api/workspaces/acme/plan': { data: { plan: 'Team', revision: 10 } },
};

test('a role change moves the client onto the revision the server reported', async () => {
  stubFetch(ROUTES);
  await api.loadWorkspace('acme');
  assert.equal(api.revision, 7, 'the client starts on the revision it loaded');

  const res = await api.setMember('u2', { role: 'admin' });
  assert.equal(res.ok, true);
  assert.equal(api.revision, 8, 'the client must follow the revision the server reported');
});

test('a plan change moves the client onto the revision the server reported', async () => {
  stubFetch(ROUTES);
  await api.loadWorkspace('acme');
  const res = await api.setPlan('Team');
  assert.equal(res.ok, true);
  assert.equal(api.revision, 10, 'the client must follow the revision the server reported');
});

test('a failed change leaves the client revision untouched', async () => {
  stubFetch({ ...ROUTES, '/api/workspaces/acme/members/u2': { status: 403, data: { error: 'Only an owner can manage admins' } } });
  await api.loadWorkspace('acme');
  const res = await api.setMember('u2', { role: 'admin' });
  assert.equal(res.ok, false);
  assert.equal(api.revision, 7, 'a refused change must not invent a revision');
});
