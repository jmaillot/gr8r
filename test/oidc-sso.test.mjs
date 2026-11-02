/* SSO-01/SSO-08 (Phase 30): the mock-Entra integration suite. A node:http IdP
   serves discovery, JWKS (test-generated RSA key) and a table-driven token
   endpoint; the REAL server.js boots pointed at it via the test-only
   OIDC_ISSUER_OVERRIDE knob and the full authorize → callback → session flow
   runs end-to-end with no mocks inside server.js itself. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { after, before, test } from 'node:test';
import { startServer, withDb } from './helpers/server.mjs';

/* ------------------------------ mock IdP ------------------------------ */

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'mock-key-1';
const PUBLIC_JWK = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };

const b64u = buf => Buffer.from(buf).toString('base64url');

/* The per-test token behavior: the token endpoint mints exactly one id_token
   per call from this row (claims overrides, sign on/off). Later plans extend
   this row into the SSO-08 fail-closed matrix. */
const idp = {
  base: null,
  issuer: null,
  tokenConfig: { code: 'auth-code-1', claims: {}, sign: true },
  mintIdToken(nonce) {
    const { claims, sign } = this.tokenConfig;
    const header = b64u(JSON.stringify({ alg: 'RS256', kid: KID, typ: 'JWT' }));
    const payload = b64u(
      JSON.stringify({
        iss: this.issuer,
        aud: 'cid',
        sub: 'sub-1',
        email: 'sso.user@example.com',
        name: 'SSO User',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
        nonce,
        ...claims,
      }),
    );
    const unsigned = `${header}.${payload}`;
    if (!sign) return `${unsigned}.`;
    const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), privateKey);
    return `${unsigned}.${b64u(sig)}`;
  },
};

function startMockIdp() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === '/v2.0/.well-known/openid-configuration') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ issuer: idp.issuer, jwks_uri: `${idp.base}/jwks`, token_endpoint: `${idp.base}/token` }));
        return;
      }
      if (url.pathname === '/jwks') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ keys: [PUBLIC_JWK] }));
        return;
      }
      if (url.pathname === '/token' && req.method === 'POST') {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
          const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
          const ok =
            form.get('grant_type') === 'authorization_code' &&
            form.get('code') === idp.tokenConfig.code &&
            (form.get('code_verifier') || '').length >= 43 &&
            form.get('client_secret') === 'sec';
          if (!ok) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid_grant' }));
            return;
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id_token: idp.mintIdToken(form.get('nonce')), token_type: 'Bearer' }));
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      idp.base = `http://127.0.0.1:${port}`;
      idp.issuer = `${idp.base}/v2.0`;
      resolve(server);
    });
  });
}

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

/* ------------------------------ suite ------------------------------ */

let mockIdp;
let server;
let email = 'sso.user@example.com';

before(async () => {
  mockIdp = await startMockIdp();
  server = await startServer({
    env: {
      OIDC_ENABLED: 'true',
      OIDC_TENANT_ID: 't-1',
      OIDC_CLIENT_ID: 'cid',
      OIDC_CLIENT_SECRET: 'sec',
      OIDC_ISSUER_OVERRIDE: idp.issuer,
    },
  });
});

after(async () => {
  await server?.stop();
  await new Promise(resolve => mockIdp.close(resolve));
});

test('the config exposes the server ground truth when fully configured', async () => {
  const res = await fetch(`${server.base}/api/config`);
  const body = await res.json();
  assert.equal(body.oidcEnabled, true);
  assert.equal(body.oidcSsoOnly, false);
});

test('the happy path: start → authorize URL → callback → session (SSO-01)', async () => {
  /* 1. start: 302 to the authorize URL carrying the full D-01 shape. */
  const start = await nav(server.base, '/api/auth/oidc/start');
  assert.equal(start.status, 302);
  const location = start.location;
  assert.ok(location.startsWith(`${idp.base}/oauth2/v2.0/authorize`), 'authorize URL points at the mock IdP');
  const q = queryOf(location);
  assert.equal(q.get('client_id'), 'cid');
  assert.equal(q.get('response_type'), 'code');
  assert.equal(q.get('redirect_uri'), `${server.base}/api/auth/oidc/callback`);
  assert.equal(q.get('response_mode'), 'query');
  assert.equal(q.get('scope'), 'openid profile email');
  assert.equal(q.get('code_challenge_method'), 'S256');
  assert.equal(q.get('prompt'), 'select_account');
  assert.ok(q.get('code_challenge'));
  assert.ok(q.get('state'));
  assert.ok(q.get('nonce'));
  const flowCookie = flowCookieOf(start.cookies);
  assert.ok(flowCookie, 'start set the transient flow cookie');
  /* Raw state/nonce/verifier never ride a cookie — only the opaque key. */
  assert.ok(!flowCookie.includes(q.get('state')), 'flow cookie carries no raw state');

  /* 2. the mock IdP binds the authorize-time nonce (as Entra does at the
     authorize step) and mints a valid id_token for the configured identity. */
  idp.tokenConfig = { code: 'auth-code-1', claims: { nonce: q.get('nonce') }, sign: true };

  /* 3. callback: state matches, code exchanges, id_token verifies. */
  const callback = await nav(server.base, `/api/auth/oidc/callback?code=auth-code-1&state=${encodeURIComponent(q.get("state"))}`, flowCookie);
  if (callback.location !== "/") console.log("SERVER OUT:", server.output());
  assert.equal(callback.status, 302);
  assert.equal(callback.location, '/', 'the callback redirects into the SPA root');
  const sessionCookie = sessionCookieOf(callback.cookies);
  assert.ok(sessionCookie, 'the callback minted a session cookie');

  /* 4. the database holds the ordinary session + identity + JIT bare account. */
  withDb(server.dbPath, db => {
    const user = db.prepare('select * from users where email = ?').get(email);
    assert.ok(user, 'the JIT bare account exists');
    const session = db.prepare('select * from sessions where user_id = ?').all(user.id);
    assert.equal(session.length, 1, 'exactly one sessions row — the ordinary login recipe');
    const identity = db.prepare('select * from oidc_identities where user_id = ?').all(user.id);
    assert.equal(identity.length, 1);
    assert.equal(identity[0].issuer, idp.issuer);
    assert.equal(identity[0].subject, 'sub-1');
    assert.ok(identity[0].last_login_at, 'last_login_at stamped on first login');
    const membership = db.prepare('select count(*) as n from memberships where user_id = ?').get(user.id).n;
    assert.equal(membership, 0, 'bare JIT account: no workspace membership (D-05)');
    const log = db.prepare('select * from security_log where user_id = ? and verb = ?').all(user.id, 'sso_login');
    assert.equal(log.length, 1, 'the sso_login security verb was recorded');
  });

  /* 5. replay: the same callback again finds the consumed flow entry gone —
     no second session (state delete-on-use, Pitfall 4). */
  const replay = await nav(server.base, `/api/auth/oidc/callback?code=auth-code-1&state=${encodeURIComponent(q.get('state'))}`, flowCookie);
  assert.equal(replay.status, 302);
  assert.equal(replay.location, '/login?sso=error', 'replay fails closed to the generic error marker');
  assert.equal(sessionCookieOf(replay.cookies), null, 'the replay mints no session');
  withDb(server.dbPath, db => {
    const user = db.prepare('select id from users where email = ?').get(email);
    assert.equal(db.prepare('select count(*) as n from sessions where user_id = ?').get(user.id).n, 1);
  });
});

/* SSO-02 / D-02: the env-gating matrix. Each row boots its own server —
   partial config NEVER half-enables SSO, and every gate is the same
   generic 404 notFound (no-oracle: the response never reveals which var
   is missing). */
const GATING_ROWS = [
  ['fully unconfigured', {}],
  ['flag on but every var missing', { OIDC_ENABLED: 'true' }],
  ['flag on, tenant only', { OIDC_ENABLED: 'true', OIDC_TENANT_ID: 't-1' }],
  ['flag on, tenant + client id, EMPTY secret', { OIDC_ENABLED: 'true', OIDC_TENANT_ID: 't-1', OIDC_CLIENT_ID: 'cid', OIDC_CLIENT_SECRET: '' }],
  ['flag on, empty-string tenant', { OIDC_ENABLED: 'true', OIDC_TENANT_ID: '' }],
  ['all vars present, flag OFF', { OIDC_ENABLED: 'false', OIDC_TENANT_ID: 't-1', OIDC_CLIENT_ID: 'cid', OIDC_CLIENT_SECRET: 'sec' }],
];

for (const [label, env] of GATING_ROWS) {
  test(`gating: ${label} → honest 404s and oidcEnabled:false`, async () => {
    const gated = await startServer({ env });
    try {
      const start = await nav(gated.base, '/api/auth/oidc/start');
      assert.equal(start.status, 404);
      assert.equal(start.location, null);
      const startBody = await fetch(gated.base + '/api/auth/oidc/start').then(r => r.json());
      assert.equal(startBody.code, 'notFound', 'the start gate is the generic notFound');

      const callback = await nav(gated.base, '/api/auth/oidc/callback?code=x&state=y');
      assert.equal(callback.status, 404);
      const callbackBody = await fetch(gated.base + '/api/auth/oidc/callback?code=x&state=y').then(r => r.json());
      assert.equal(callbackBody.code, 'notFound', 'the callback gate is the same generic notFound');

      const config = await fetch(gated.base + '/api/config').then(r => r.json());
      assert.equal(config.oidcEnabled, false);
      assert.equal(config.oidcSsoOnly, false);
    } finally {
      await gated.stop();
    }
  });
}
