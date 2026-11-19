/* Domain admission SSO suite (Phase 76, D-12 contract). The two remaining
   doors of the Phase 75 door matrix wired into the SSO surface: DP-4 gates
   OIDC JIT provisioning by ALLOW_SIGNUP_DOMAINS (fresh-provision branch only,
   after the email_verified gate), DP-5 silently filters refused invites out
   of the SSO-07 reconciliation before its branching, and the boot log shows
   one combined five-door matrix line (D-11). All rows drive the REAL
   authorize → callback 302 flow through the shared fake IdP harness. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { idp, startMockIdp } from './helpers/oidc-idp.mjs';
import { startServer, withDb } from './helpers/server.mjs';

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

/* One full start → authorize → callback flow against a per-test server.
   `claims` spread over the default token payload — every allow-flow row
   passes email_verified: true explicitly (G-30-1 fixture discipline). */
async function runFlow(srv, claims = {}, code = 'auth-code-1') {
  const start = await nav(srv.base, '/api/auth/oidc/start');
  assert.equal(start.status, 302);
  const q = queryOf(start.location);
  const flowCookie = flowCookieOf(start.cookies);
  idp.tokenConfig = { code, claims: { nonce: q.get('nonce'), ...claims } };
  const callback = await nav(srv.base, `/api/auth/oidc/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(q.get('state'))}`, flowCookie);
  return { start, callback, flowCookie, q };
}

const oidcEnv = () => ({ OIDC_ENABLED: 'true', OIDC_TENANT_ID: 't-1', OIDC_CLIENT_ID: 'cid', OIDC_CLIENT_SECRET: 'sec', OIDC_ISSUER_OVERRIDE: idp.issuer });

/* A direct users-row insert for the "existing account" side of the link
   policy (same shape as test/oidc-sso.test.mjs createExistingUser). */
function createExistingUser(db, email) {
  db.prepare('insert into users (id, email, name, password_hash, created_at) values (?,?,?,?,?)').run(
    `u_${email.replace(/[^a-z0-9]/gi, '_')}`,
    email,
    'Existing User',
    'not-a-real-scrypt-hash',
    Date.now(),
  );
}

/* ---------- DP-4: the SSO JIT-provisioning door (DOM-06, D-09) ---------- */

test('DP-4: an out-of-list SSO email is refused after email_verified — generic redirect, no session, no rows (SC1)', async () => {
  const server = await startServer({ env: { ...oidcEnv(), ALLOW_SIGNUP_DOMAINS: 'a.com' } });
  try {
    const { callback } = await runFlow(server, { sub: 'sub-dp4-out', email: 'outsider@b.com', email_verified: true });
    assert.equal(callback.status, 302);
    assert.equal(callback.location, '/login?sso=error', 'the refusal lands on the ONE generic error surface');
    /* Anti-oracle: no additional query param may reveal the policy. */
    assert.equal(new URL(callback.location, 'http://x').search, '?sso=error', 'no domain-revealing query param');
    assert.equal(sessionCookieOf(callback.cookies), null, 'no session minted');

    withDb(server.dbPath, db => {
      assert.equal(db.prepare('select count(*) as n from users where email = ?').get('outsider@b.com').n, 0, 'no users row');
      assert.equal(db.prepare('select count(*) as n from oidc_identities').get().n, 0, 'no oidc_identities row');
    });

    /* D-09 PII pin: the refusal log carries the domain only, never the local part. */
    const line = server.output().split('\n').find(l => l.includes('sso signup domain refused'));
    assert.ok(line, 'the DP-4 refusal log line is missing');
    assert.ok(line.includes('b.com'), `the refusal line must carry the domain, got: ${line}`);
    assert.ok(!line.includes('outsider'), `the refusal line must NEVER carry the email local part, got: ${line}`);
  } finally {
    await server.stop();
  }
});

test('DP-4: an in-list SSO email provisions normally — user + identity rows, lands on /', async () => {
  const server = await startServer({ env: { ...oidcEnv(), ALLOW_SIGNUP_DOMAINS: 'a.com' } });
  try {
    const { callback } = await runFlow(server, { sub: 'sub-dp4-in', email: 'insider@a.com', email_verified: true });
    assert.equal(callback.status, 302);
    assert.equal(callback.location, '/', 'provisioning lands on the SPA root like the existing JIT shape');
    assert.ok(sessionCookieOf(callback.cookies), 'a session was minted');

    withDb(server.dbPath, db => {
      const user = db.prepare('select * from users where email = ?').get('insider@a.com');
      assert.ok(user, 'the JIT bare account exists');
      const identity = db.prepare('select * from oidc_identities where user_id = ?').all(user.id);
      assert.equal(identity.length, 1, 'the oidc_identities row exists');
      assert.equal(identity[0].subject, 'sub-dp4-in');
    });
  } finally {
    await server.stop();
  }
});

test("DP-4: ALLOW_SIGNUP_DOMAINS='*' provisions every domain — wildcard handled inside the shared funnel (Pitfall 3)", async () => {
  const server = await startServer({ env: { ...oidcEnv(), ALLOW_SIGNUP_DOMAINS: '*' } });
  try {
    const { callback } = await runFlow(server, { sub: 'sub-dp4-wild', email: 'anyone@wild.example', email_verified: true });
    assert.equal(callback.status, 302);
    assert.equal(callback.location, '/', 'wildcard allow-all provisions like DP-1');
    withDb(server.dbPath, db => {
      assert.ok(db.prepare('select * from users where email = ?').get('anyone@wild.example'), 'the user row exists');
    });
  } finally {
    await server.stop();
  }
});

test('DP-4: unset ALLOW_SIGNUP_DOMAINS stays byte-identical fail-open (D-01 tri-state consumed as-is)', async () => {
  const server = await startServer({ env: { ...oidcEnv(), ALLOW_SIGNUP_DOMAINS: undefined, ALLOW_INVITE_DOMAINS: undefined } });
  try {
    const { callback } = await runFlow(server, { sub: 'sub-dp4-unset', email: 'anyone@unset.example', email_verified: true });
    assert.equal(callback.status, 302);
    assert.equal(callback.location, '/', 'door off → provisioning unchanged');
    withDb(server.dbPath, db => {
      assert.ok(db.prepare('select * from users where email = ?').get('anyone@unset.example'), 'the user row exists');
    });
  } finally {
    await server.stop();
  }
});

test('DP-4 placement guard: an EXISTING user with a verified email still LINKS with the list tightened — the gate is fresh-provision-only (Pitfall 1)', async () => {
  const server = await startServer({ env: { ...oidcEnv(), ALLOW_SIGNUP_DOMAINS: 'a.com' } });
  try {
    /* The account pre-dates the tightening: its domain is out-of-list. */
    withDb(server.dbPath, db => createExistingUser(db, 'legacy@b.com'));
    const { callback } = await runFlow(server, { sub: 'sub-dp4-link', email: 'legacy@b.com', email_verified: true });
    assert.equal(callback.status, 302);
    assert.equal(callback.location, '/', 'an existing verified-email account links — DP-4 never gates the link arm');
    assert.ok(sessionCookieOf(callback.cookies), 'a session was minted');

    withDb(server.dbPath, db => {
      const user = db.prepare('select * from users where email = ?').get('legacy@b.com');
      const identity = db.prepare('select * from oidc_identities where subject = ?').get('sub-dp4-link');
      assert.ok(identity, 'the identity row exists');
      assert.equal(identity.user_id, user.id, 'the identity links to the EXISTING account — no refusal, no second user');
    });
    assert.ok(!server.output().includes('sso signup domain refused'), 'no DP-4 refusal logged for the link path');
  } finally {
    await server.stop();
  }
});
