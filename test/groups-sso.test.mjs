/* SSO groups-claim grant suite (Phase 81, GW-01/GW-03 tracer + D-81 pins). The
   REAL authorize → callback flow runs against the shared mock-Entra IdP with a
   `groups` claim injected per test; the callback grants workspace memberships
   with provenance `group:<guid>` per D-81-6. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, test } from 'node:test';
import { idp, startMockIdp } from './helpers/oidc-idp.mjs';
import { ADMIN, login, startServer, withDb } from './helpers/server.mjs';

/* ------------------------------ helpers ------------------------------ */

/* Browser-navigation fetch: manual redirects, raw Set-Cookie access. */
async function nav(base, pathname, cookie) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  const res = await fetch(base + pathname, { redirect: 'manual', headers });
  return { status: res.status, location: res.headers.get('location'), cookies: res.headers.getSetCookie?.() || [] };
}

const flowCookieOf = cookies => cookies.find(c => c.startsWith('projects_oidc_flow='))?.split(';')[0] || null;
const sessionCookieOf = cookies => cookies.find(c => c.startsWith('projects_session=') && !c.includes('Max-Age=0')) || null;
const queryOf = location => new URL(location, 'http://x').searchParams;

let mockIdp;

before(async () => {
  mockIdp = await startMockIdp();
});

after(async () => {
  await new Promise(resolve => mockIdp.close(resolve));
});

const oidcEnv = () => ({ OIDC_ENABLED: 'true', OIDC_TENANT_ID: 't-1', OIDC_CLIENT_ID: 'cid', OIDC_CLIENT_SECRET: 'sec', OIDC_ISSUER_OVERRIDE: idp.issuer });

/* One full start → authorize → callback flow (twin of test/oidc-sso.test.mjs
   runFlow). `claims` spread over the default token payload. */
async function runFlow(srv, claims = {}, code = 'auth-code-1') {
  const start = await nav(srv.base, '/api/auth/oidc/start');
  assert.equal(start.status, 302);
  const q = queryOf(start.location);
  const flowCookie = flowCookieOf(start.cookies);
  idp.tokenConfig = { code, claims: { nonce: q.get('nonce'), ...claims } };
  const callback = await nav(srv.base, `/api/auth/oidc/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(q.get('state'))}`, flowCookie);
  return { start, callback, flowCookie, q };
}

/* Seed one active workspace row (direct insert — the fixture only needs the
   memberships FK target). */
function seedWorkspace(db, { id, slug, name }) {
  const t = Date.now();
  db.prepare('insert into workspaces (id, slug, name, doc, created_at, updated_at) values (?,?,?,?,?,?)').run(id, slug, name, '{}', t, t);
}

function seedMapping(db, { guid, workspaceId, role = 'member', kind = 'workspace' }) {
  const t = Date.now();
  db.prepare('insert into group_mappings (id, group_guid, workspace_id, role, kind, created_at, updated_at) values (?,?,?,?,?,?,?)').run(
    `gm_${guid.slice(0, 8)}_${workspaceId}`,
    guid,
    workspaceId,
    role,
    kind,
    t,
    t,
  );
}

/* Seed one pending invite through the real API — a harness-owner login creates
   the workspace, then invites the future SSO user (house idiom from the DP-5
   suite; invites need a real created_by users row). */
async function ownerInvite(base, { email, role = 'member' }) {
  const owner = (await login(base, ADMIN.email, ADMIN.password)).client;
  const slug = (await owner.get('/api/workspaces')).data.workspaces[0].slug;
  const inv = await owner.post(`/api/workspaces/${slug}/invites`, { emails: [email], role });
  assert.equal(inv.status, 201, `invite creation must succeed, got ${inv.status}: ${JSON.stringify(inv.data)}`);
  return slug;
}

/* Phase 81 (GW-03/D-81-1): the provenance-filtered DP-5 guard counts only
   non-group memberships — a group-mapped user with a pending invite still
   auto-accepts (the grant landed first, the invite reconciles on top); an
   unmapped user's rows carry no group provenance so the path is byte-identical. */
test('unmapped user with a pending invite still auto-accepts with provenance invite (Pin B)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    const slug = await ownerInvite(server.base, { email: 'pinb-user@example.com', role: 'member' });
    const { callback } = await runFlow(server, { sub: 'sub-pinb', email: 'pinb-user@example.com', email_verified: true }, 'code-pinb');
    assert.equal(callback.location, '/', 'unmapped invite login lands on /');
    withDb(server.dbPath, db => {
      const ws = db.prepare('select * from workspaces where slug = ?').get(slug);
      const user = db.prepare('select * from users where email = ?').get('pinb-user@example.com');
      const rows = db.prepare('select * from memberships where user_id = ?').all(user.id);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].workspace_id, ws.id);
      assert.equal(rows[0].role, 'member');
      assert.equal(rows[0].provenance, 'invite', 'the auto-accepted invite carries provenance invite');
      assert.equal(db.prepare('select count(*) as n from invites where used_at is not null').get().n, 1, 'the invite was consumed');
    });
  } finally {
    await server.stop();
  }
});

test('group-mapped user with a pending invite ALSO auto-accepts — provenance stays group:<guid> (Pin C, D-81-1/D-81-7)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    const slug = await ownerInvite(server.base, { email: 'pinc-user@example.com', role: 'member' });
    withDb(server.dbPath, db => {
      const ws = db.prepare('select * from workspaces where slug = ?').get(slug);
      seedMapping(db, { guid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', workspaceId: ws.id, role: 'member' });
    });
    const { callback } = await runFlow(server, {
      sub: 'sub-pinc',
      email: 'pinc-user@example.com',
      email_verified: true,
      groups: ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'],
    }, 'code-pinc');
    assert.equal(callback.location, '/', 'the mapped + invited login lands on /');
    withDb(server.dbPath, db => {
      const user = db.prepare('select * from users where email = ?').get('pinc-user@example.com');
      const rows = db.prepare('select * from memberships where user_id = ?').all(user.id);
      assert.equal(rows.length, 1, 'grant + invite reconcile onto ONE row');
      assert.equal(rows[0].role, 'member');
      assert.equal(rows[0].provenance, 'group:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'creation origin survives the invite reconcile (D-81-7 — no clobber to invite)');
      assert.equal(db.prepare('select count(*) as n from invites where used_at is not null and email = ?').get('pinc-user@example.com').n, 1, 'the invite was reconciled');
    });
  } finally {
    await server.stop();
  }
});

test('empty/absent groups claim and zero mappings write nothing — login proceeds (edge pins)', async () => {
  for (const [name, claims] of [
    ['no groups key', { sub: 'sub-empty-1', email: 'empty1@example.com', email_verified: true }],
    ['empty groups array', { sub: 'sub-empty-2', email: 'empty2@example.com', email_verified: true, groups: [] }],
    ['groups claim, zero mappings', { sub: 'sub-empty-3', email: 'empty3@example.com', email_verified: true, groups: ['11111111-2222-3333-4444-555555555555'] }],
  ]) {
    const server = await startServer({ env: oidcEnv() });
    try {
      withDb(server.dbPath, db => seedWorkspace(db, { id: 'ws-empty', slug: 'empty', name: 'Empty WS' }));
      const { callback } = await runFlow(server, claims, `code-${name.replace(/\W+/g, '')}`);
      assert.equal(callback.location, '/', `${name}: login proceeds`);
      withDb(server.dbPath, db => {
        const user = db.prepare('select * from users where email = ?').get(claims.email);
        assert.ok(user);
        assert.equal(db.prepare('select count(*) as n from memberships where user_id = ?').get(user.id).n, 0, `${name}: zero grant writes`);
      });
    } finally {
      await server.stop();
    }
  }
});

/* ------------------------------ tests ------------------------------ */

test('tracer: a mapped groups claim grants membership end-to-end with provenance group:<guid> (GW-01/GW-03, D-81-9)', async () => {
  const server = await startServer({ env: oidcEnv() });
  try {
    withDb(server.dbPath, db => {
      seedWorkspace(db, { id: 'ws-grant', slug: 'grantws', name: 'Grant WS' });
      seedMapping(db, { guid: '11111111-2222-3333-4444-555555555555', workspaceId: 'ws-grant', role: 'member' });
    });

    const { callback } = await runFlow(server, {
      sub: 'sub-grant-tracer',
      email: 'tracer@example.com',
      email_verified: true,
      groups: ['11111111-2222-3333-4444-555555555555'],
    });
    if (callback.location !== '/') console.log('SERVER OUT:', server.output());
    assert.equal(callback.status, 302);
    assert.equal(callback.location, '/', 'the mapped login lands on the SPA root');
    const sessionCookie = sessionCookieOf(callback.cookies);
    assert.ok(sessionCookie, 'the callback minted a session cookie');

    withDb(server.dbPath, db => {
      const user = db.prepare('select * from users where email = ?').get('tracer@example.com');
      assert.ok(user, 'the JIT account exists');
      const rows = db.prepare('select * from memberships where user_id = ?').all(user.id);
      assert.equal(rows.length, 1, 'exactly one membership row');
      assert.equal(rows[0].workspace_id, 'ws-grant');
      assert.equal(rows[0].role, 'member', 'the mapped role was applied');
      assert.equal(rows[0].provenance, 'group:11111111-2222-3333-4444-555555555555', 'provenance carries the group origin');
    });

    /* D-81-9: grants commit before the session mint — /api/auth/me reflects
       the granted membership with no client changes. */
    const me = await fetch(`${server.base}/api/auth/me`, { headers: { cookie: sessionCookie } });
    assert.equal(me.status, 200);
    const body = await me.json();
    const granted = (body.user?.workspaces || []).find(w => w.id === 'ws-grant' || w.slug === 'grantws');
    assert.ok(granted, 'the granted workspace appears in the session payload');
    assert.equal(granted.role, 'member');
  } finally {
    await server.stop();
  }
});
