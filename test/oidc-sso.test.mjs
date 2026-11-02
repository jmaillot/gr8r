/* SSO-01/SSO-08 (Phase 30): the mock-Entra integration suite. A node:http IdP
   serves discovery, JWKS (test-generated RSA key) and a table-driven token
   endpoint; the REAL server.js boots pointed at it via the test-only
   OIDC_ISSUER_OVERRIDE knob and the full authorize → callback → session flow
   runs end-to-end with no mocks inside server.js itself. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { signup, startServer, withDb } from './helpers/server.mjs';

/* ------------------------------ mock IdP ------------------------------ */

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
/* A second RSA key the real IdP does not publish — signatures from it are
   the SSO-08 "valid shape, wrong key" vector. */
const { privateKey: foreignPrivateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'mock-key-1';
const PUBLIC_JWK = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };

const b64u = buf => Buffer.from(buf).toString('base64url');

/* The per-test token behavior: the token endpoint mints exactly one id_token
   per call from this row (claims overrides, sign on/off). Later plans extend
   this row into the SSO-08 fail-closed matrix. */
const idp = {
  base: null,
  issuer: null,
  tokenConfig: { code: 'auth-code-1', claims: {} },
  /* Mint one id_token per token-endpoint call. Row knobs:
     claims     — claim overrides spread over the defaults (tid: 't-1' is the
                  pinned tenant, present on every honest managed-user token)
     alg        — 'RS256' (default) | 'none' | 'HS256' (SSO-08 confusion vectors)
     kid        — header kid override (unknown kid → JWKS miss)
     signKey    — 'own' (default) | 'foreign' (a key the JWKS never published) */
  mintIdToken(nonce) {
    const { claims, alg = 'RS256', kid = KID, signKey = 'own' } = this.tokenConfig;
    const header = b64u(JSON.stringify({ alg, kid, typ: 'JWT' }));
    const payload = b64u(
      JSON.stringify({
        iss: this.issuer,
        aud: 'cid',
        sub: 'sub-1',
        email: 'sso.user@example.com',
        name: 'SSO User',
        tid: 't-1',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
        nonce,
        ...claims,
      }),
    );
    const unsigned = `${header}.${payload}`;
    if (alg === 'none') return `${unsigned}.`;
    if (alg === 'HS256') {
      const sig = crypto.createHmac('sha256', 'symmetric-secret-shared').update(unsigned).digest();
      return `${unsigned}.${b64u(sig)}`;
    }
    const key = signKey === 'foreign' ? foreignPrivateKey : privateKey;
    const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), key);
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
          /* demandVerifier (SSO-08 wrong-verifier row): the mock insists on an
             exact verifier it was handed — the server's real PKCE verifier can
             never match, so the exchange 400s and the callback fails closed. */
          const verifierOk = idp.tokenConfig.demandVerifier
            ? form.get('code_verifier') === idp.tokenConfig.demandVerifier
            : (form.get('code_verifier') || '').length >= 43;
          const ok =
            form.get('grant_type') === 'authorization_code' &&
            form.get('code') === idp.tokenConfig.code &&
            verifierOk &&
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
  await matrixServer?.stop();
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
  idp.tokenConfig = { code: 'auth-code-1', claims: { nonce: q.get('nonce') } };

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

/* SSO-03 helpers: a full start → callback flow against the shared mock IdP,
   plus direct users-row creation for the "existing account" side of the
   link policy. */
/* The matrix gives EACH row a fresh server instance: a fresh throttle map
   (the start route allows 10 attempts per IP per 15 min — 13 rows would trip
   it on a shared instance) and a fresh database, so sessions-count assertions
   are isolated. */
let matrixServer = null;
async function freshMatrixServer() {
  if (matrixServer) await matrixServer.stop();
  matrixServer = await startServer({
    env: { OIDC_ENABLED: 'true', OIDC_TENANT_ID: 't-1', OIDC_CLIENT_ID: 'cid', OIDC_CLIENT_SECRET: 'sec', OIDC_ISSUER_OVERRIDE: idp.issuer },
  });
  return matrixServer;
}

async function runFlow({ srv, claims = {}, alg, kid, signKey, demandVerifier, code = 'auth-code-1', callbackPath = null } = {}) {
  const target = srv || server;
  const start = await nav(target.base, '/api/auth/oidc/start');
  assert.equal(start.status, 302);
  const q = queryOf(start.location);
  const flowCookie = flowCookieOf(start.cookies);
  idp.tokenConfig = {
    code,
    claims: { nonce: q.get('nonce'), ...claims },
    ...(alg && { alg }),
    ...(kid && { kid }),
    ...(signKey && { signKey }),
    ...(demandVerifier && { demandVerifier }),
  };
  const path =
    callbackPath || `/api/auth/oidc/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(q.get('state'))}`;
  const callback = await nav(target.base, path, flowCookie);
  return { start, callback, flowCookie, q };
}

function createExistingUser(db, email) {
  db.prepare('insert into users (id, email, name, password_hash, created_at) values (?,?,?,?,?)').run(
    `u_${email.replace(/[^a-z0-9]/gi, '_')}`,
    email,
    'Existing User',
    'not-a-real-scrypt-hash',
    Date.now(),
  );
}

/* SSO-03 (Phase 30 plan 02): pinned-tenant verified-email linking. A managed-
   user token (pinned iss + tid match + non-guest shape + non-empty email)
   links to the existing users row; ANY guest shape or tenant mismatch never
   links — the existing account is never signed into. */

test('a pinned-tenant member token links to the existing account by email (SSO-03)', async () => {
  const linkEmail = 'link.me@example.com';
  withDb(server.dbPath, db => createExistingUser(db, linkEmail));

  const { callback } = await runFlow({ claims: { sub: 'sub-link', email: '  LINK.ME@example.com ' } });
  assert.equal(callback.status, 302);
  assert.equal(callback.location, '/', 'the member token signed into the linked account');
  assert.ok(sessionCookieOf(callback.cookies), 'a session was minted');

  withDb(server.dbPath, db => {
    const linked = db.prepare('select id from users where email = ?').get(linkEmail);
    const identity = db.prepare('select * from oidc_identities where subject = ?').get('sub-link');
    assert.ok(identity, 'an oidc_identities row exists for the identity');
    assert.equal(identity.user_id, linked.id, 'the identity links to the EXISTING account, not a new one');
    assert.equal(db.prepare('select count(*) as n from oidc_identities where subject = ?').get('sub-link').n, 1);
  });
});

for (const [label, guestClaims] of [
  ['idp claim differing from iss (guest)', { idp: 'live.com' }],
  ['acct === 1 (guest)', { acct: '1' }],
  ['tid !== OIDC_TENANT_ID (foreign tenant)', { tid: 'other-tenant' }],
]) {
  test(`a guest-shaped token NEVER links: ${label} (SSO-03)`, async () => {
    const victimEmail = `victim.${Math.random().toString(36).slice(2, 8)}@example.com`;
    withDb(server.dbPath, db => createExistingUser(db, victimEmail));

    const { callback } = await runFlow({ claims: { ...guestClaims, sub: `sub-guest-${guestClaims.idp ?? guestClaims.acct ?? guestClaims.tid}`, email: victimEmail } });
    assert.equal(callback.status, 302);
    assert.equal(callback.location, '/login?sso=error', 'the guest token fails closed to the generic error marker');
    assert.equal(sessionCookieOf(callback.cookies), null, 'the existing account is never signed into');

    withDb(server.dbPath, db => {
      const victim = db.prepare('select id from users where email = ?').get(victimEmail);
      assert.equal(db.prepare('select count(*) as n from sessions where user_id = ?').get(victim.id).n, 0, 'no session row for the existing account');
      assert.equal(db.prepare('select count(*) as n from oidc_identities where user_id = ?').get(victim.id).n, 0, 'no identity row ever links the guest to the existing account');
    });
  });
}

test('a guest token with a fresh email provisions a SEPARATE account, never a link (SSO-03)', async () => {
  const freshGuest = 'fresh.guest@example.com';
  const { callback } = await runFlow({ claims: { sub: 'sub-guest-fresh', email: freshGuest, idp: 'live.com' } });
  assert.equal(callback.status, 302);
  assert.equal(callback.location, '/', 'a fresh guest identity still gets its own bare account');
  withDb(server.dbPath, db => {
    const created = db.prepare('select id from users where email = ?').get(freshGuest);
    assert.ok(created, 'the separate JIT account exists');
    assert.equal(db.prepare('select count(*) as n from memberships where user_id = ?').get(created.id).n, 0, 'separate bare account: no membership');
  });
});

test('a token with a missing/empty email claim never links nor provisions (SSO-03)', async () => {
  const { callback } = await runFlow({ claims: { sub: 'sub-noemail', email: '' } });
  assert.equal(callback.status, 302);
  assert.equal(callback.location, '/login?sso=error', 'no email → fail closed');
  withDb(server.dbPath, db => {
    assert.equal(db.prepare('select count(*) as n from oidc_identities where subject = ?').get('sub-noemail').n, 0);
  });
});

test('repeated SSO logins with the same (issuer, subject) resolve to the same user row (SSO-03 idempotency)', async () => {
  const before = withDb(server.dbPath, db => {
    const identity = db.prepare('select * from oidc_identities where subject = ?').get('sub-1');
    return { identity, userId: identity?.user_id ?? null };
  });
  assert.ok(before.identity, 'precondition: the happy path created the sub-1 identity');

  const { callback } = await runFlow({ code: 'auth-code-2' });
  assert.equal(callback.status, 302);
  assert.equal(callback.location, '/');
  withDb(server.dbPath, db => {
    const identities = db.prepare('select * from oidc_identities where subject = ?').all('sub-1');
    assert.equal(identities.length, 1, 'still exactly ONE identity row for (issuer, sub-1)');
    assert.equal(identities[0].user_id, before.userId, 'same user row as the first login');
  });
});

/* SSO-04 / Pitfall 5: the JIT account's password_hash is a fresh RANDOM
   scrypt hash per account (never a shared constant) — a password sign-in
   against any JIT account must fail closed. */

test('a password sign-in against a JIT account fails closed (SSO-04)', async () => {
  const res = await fetch(`${server.base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'sso.user@example.com', password: 'any-guessable-password' }),
  });
  assert.equal(res.status, 401, 'no password works against the JIT account');
});

test('two JIT accounts carry DIFFERENT random password hashes (never a shared constant)', async () => {
  await runFlow({ claims: { sub: 'sub-jit-a', email: 'jit.a@example.com' } });
  await runFlow({ claims: { sub: 'sub-jit-b', email: 'jit.b@example.com' } });
  withDb(server.dbPath, db => {
    const a = db.prepare('select password_hash from users where email = ?').get('jit.a@example.com');
    const b = db.prepare('select password_hash from users where email = ?').get('jit.b@example.com');
    assert.ok(a?.password_hash && b?.password_hash, 'both JIT accounts have a password_hash (NOT NULL honored)');
    assert.notEqual(a.password_hash, b.password_hash, 'hashes are per-account random, not a shared constant');
    assert.notEqual(a.password_hash, 'x', 'not a placeholder');
  });
});

/* SSO-08: the fail-closed validation matrix (Pitfall 2). Every row drives a
   full start → callback flow and must NOT mint a session: generic error
   redirect, no session cookie, zero new sessions rows. No order-dependent
   acceptance — each malformed vector is rejected by the fixed verification
   chain (shape → alg → kid → signature → iss → aud → exp → nonce), and
   verification runs fully on every callback (Pitfall 5b). */
const sessionsTotal = (srv = server) => withDb(srv.dbPath, db => db.prepare('select count(*) as n from sessions').get().n);

const MATRIX_ROWS = [
  ['alg none (unsigned JWT)', { alg: 'none' }],
  ['HS256 symmetric signature', { alg: 'HS256' }],
  ['valid header but kid absent from JWKS', { kid: 'no-such-kid' }],
  ['payload signed by a key the JWKS never published', { signKey: 'foreign', claims: { sub: 'sub-mx-foreign' } }],
  ['wrong iss (foreign tenant issuer)', { claims: { iss: 'https://login.microsoftonline.com/other-tenant/v2.0', sub: 'sub-mx-iss' } }],
  ['wrong aud', { claims: { aud: 'other-audience', sub: 'sub-mx-aud' } }],
  ['exp in the past', { claims: { exp: Math.floor(Date.now() / 1000) - 100, sub: 'sub-mx-exp' } }],
  ['nonce mismatched', { claims: { nonce: 'wrong-nonce', sub: 'sub-mx-nonce' } }],
  ['sub claim missing/empty', { claims: { sub: '' } }],
  ['email claim missing on a linking attempt', { claims: { email: '', sub: 'sub-mx-email' } }],
];

let matrixIndex = 0;
for (const [label, row] of MATRIX_ROWS) {
  matrixIndex += 1;
  test(`SSO-08 matrix: ${label} → no session`, async () => {
    const srv = await freshMatrixServer();
    const before = sessionsTotal(srv);
    const { callback } = await runFlow({ srv, code: `mx-code-${matrixIndex}`, ...row });
    assert.equal(callback.status, 302);
    assert.equal(callback.location, '/login?sso=error', 'generic error redirect — no cause leakage in the target');
    assert.equal(sessionCookieOf(callback.cookies), null, 'no session cookie minted');
    assert.equal(sessionsTotal(srv), before, 'zero new sessions rows');
  });
}

test('SSO-08 matrix: state mismatched → no session', async () => {
  const srv = await freshMatrixServer();
  const before = sessionsTotal(srv);
  const { callback } = await runFlow({ srv, code: 'mx-code-state', callbackPath: '/api/auth/oidc/callback?code=mx-code-state&state=tampered-state' });
  assert.equal(callback.status, 302);
  assert.equal(callback.location, '/login?sso=error');
  assert.equal(sessionCookieOf(callback.cookies), null);
  assert.equal(sessionsTotal(srv), before);
});

test('SSO-08 matrix: state replayed (same callback URL twice) → no second session', async () => {
  const srv = await freshMatrixServer();
  const before = sessionsTotal(srv);
  const { callback: first, q, flowCookie } = await runFlow({ srv, code: 'mx-code-replay', claims: { sub: 'sub-mx-replay', email: 'replay.user@example.com' } });
  assert.equal(first.location, '/', 'the first callback legitimately signs in');
  const afterFirst = sessionsTotal(srv);
  assert.equal(afterFirst, before + 1, 'exactly one session from the first callback');

  const replayPath = `/api/auth/oidc/callback?code=mx-code-replay&state=${encodeURIComponent(q.get('state'))}`;
  const second = await nav(srv.base, replayPath, flowCookie);
  assert.equal(second.status, 302);
  assert.equal(second.location, '/login?sso=error', 'the replayed callback fails closed (delete-on-use flow state)');
  assert.equal(sessionCookieOf(second.cookies), null, 'the replay mints no session cookie');
  assert.equal(sessionsTotal(srv), afterFirst, 'no second sessions row for the replayed state');
});

test('SSO-08 matrix: wrong PKCE verifier at token exchange → no session', async () => {
  const srv = await freshMatrixServer();
  const before = sessionsTotal(srv);
  const { callback } = await runFlow({ srv, code: 'mx-code-pkce', demandVerifier: 'A'.repeat(64) });
  assert.equal(callback.status, 302);
  assert.equal(callback.location, '/login?sso=error', 'the rejected exchange lands on the generic error redirect');
  assert.equal(sessionCookieOf(callback.cookies), null);
  assert.equal(sessionsTotal(srv), before);
});

test('the matrix carries every required fail-closed row (no skips/todos)', () => {
  assert.equal(MATRIX_ROWS.length + 3, 13, '10 claim/token rows + state mismatch + replay + wrong verifier = 13');
});

/* ---------------- SSO-05 (Phase 30 plan 03): SSO × 2FA ---------------- */

import { totpAt } from '../totp.js';

const challengeCookieOf = cookies => cookies.find(c => c.startsWith('projects_tfa_challenge='))?.split(';')[0] || null;
const liveCode = secret => totpAt(secret, Date.now() / 1000 + 30);

/* Enroll + enable 2FA for a password account through the real API (the same
   recipe test/tfa-login.test.mjs uses), so the SSO callback meets a genuinely
   TOTP-enrolled user. */
async function enrollTfa(srv, email, password) {
  const s = await signup(srv.base, { name: 'Two Fa', email, password });
  assert.equal(s.status, 201, `signup of ${email} succeeded`);
  const { secret } = (await s.client.post('/api/auth/tfa/enroll', { currentPassword: password })).data;
  const enabled = await s.client.post('/api/auth/tfa/enable', { code: totpAt(secret, Date.now() / 1000) });
  assert.equal(enabled.status, 200, `2FA enabled for ${email}`);
  return secret;
}

let tfaServer;
let inviteServer;
after(async () => {
  await tfaServer?.stop();
  await inviteServer?.stop();
});

test('SSO-05: a TOTP-enrolled account authenticating via SSO gets the challenge, NEVER a session', async () => {
  tfaServer = await startServer({
    env: { OIDC_ENABLED: 'true', OIDC_TENANT_ID: 't-1', OIDC_CLIENT_ID: 'cid', OIDC_CLIENT_SECRET: 'sec', OIDC_ISSUER_OVERRIDE: idp.issuer, MASTER_KEY: 'projects-oidc-tfa-suite' },
  });
  const EMAIL = '2fa.sso@example.com';
  const secret = await enrollTfa(tfaServer, EMAIL, 'correct-horse-9');
  const id = withDb(tfaServer.dbPath, db => db.prepare('select id from users where email = ?').get(EMAIL).id);
  /* The signup API auto-mints a session — capture the baseline so the SSO
     callback's own session delta is what gets asserted. */
  const sessionsBeforeSso = withDb(tfaServer.dbPath, db => db.prepare('select count(*) as n from sessions where user_id = ?').get(id).n);

  const flow = await runFlow({ srv: tfaServer, code: 'tfa-code-1', claims: { sub: 'sub-2fa', email: EMAIL } });
  const callback = flow.callback;
  assert.equal(callback.status, 302);
  assert.equal(callback.location, '/#tfa', 'the callback 302s to the pending-2FA SPA state (Pitfall 9 hash fragment)');
  const challengeCookie = challengeCookieOf(callback.cookies);
  assert.ok(challengeCookie, 'the challenge cookie was set');
  assert.equal(sessionCookieOf(callback.cookies), null, 'NO session cookie — SSO never bypasses 2FA');

  withDb(tfaServer.dbPath, db => {
    assert.equal(db.prepare('select count(*) as n from sessions where user_id = ?').get(id).n, sessionsBeforeSso, 'zero NEW sessions rows before TOTP verification');
    const rows = db.prepare('select * from login_challenges where user_id = ?').all(id);
    assert.equal(rows.length, 1, 'exactly one login_challenges row for the user');
    const ttl = rows[0].expires_at - Date.now();
    assert.ok(ttl > 4 * 60 * 1000 && ttl <= 5 * 60 * 1000, `the challenge carries the D-66 5-minute TTL (got ${Math.round(ttl / 1000)}s)`);
  });

  /* /api/auth/tfa/login needs ZERO changes — the challenge is user-scoped. */
  const verify = await fetch(`${tfaServer.base}/api/auth/tfa/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: challengeCookie },
    body: JSON.stringify({ code: liveCode(secret) }),
  });
  assert.equal(verify.status, 200, 'a valid TOTP code completes the SSO-initiated pending-2FA login');
  const verifyCookies = verify.headers.getSetCookie?.() || [];
  assert.ok(sessionCookieOf(verifyCookies), 'the session cookie was minted by the UNCHANGED route');
  assert.ok(verifyCookies.some(c => c.startsWith('projects_tfa_challenge=') && c.includes('Max-Age=0')), 'the challenge cookie was cleared');
  withDb(tfaServer.dbPath, db => {
    assert.equal(db.prepare('select count(*) as n from sessions where user_id = ?').get(id).n, sessionsBeforeSso + 1, 'exactly one NEW session after TOTP');
    assert.equal(db.prepare('select count(*) as n from login_challenges where user_id = ?').get(id).n, 0, 'the challenge row was consumed');
  });

  /* SSO sessions are ordinary sessions rows: the existing revocation path
     teardown applies identically (SSO-05). */
  const tokenHash = withDb(tfaServer.dbPath, db =>
    db.prepare('select token_hash from sessions where user_id = ? order by created_at desc limit 1').get(id).token_hash,
  );
  const revoke = await fetch(`${tfaServer.base}/api/auth/sessions/${tokenHash.slice(0, 12)}`, {
    method: 'DELETE',
    headers: { cookie: sessionCookieOf(verifyCookies) },
  });
  assert.equal(revoke.status, 204, 'the existing revoke route accepted the SSO session');
  const afterRevoke = await fetch(`${tfaServer.base}/api/auth/sessions`, {
    headers: { cookie: sessionCookieOf(verifyCookies) },
  });
  assert.equal(afterRevoke.status, 401, 'a subsequent authenticated request 401s after revocation');

  /* Idempotency: replaying the consumed callback URL cannot mint a second
     challenge or a second session (T-30-10). */
  const replay = await nav(tfaServer.base, `/api/auth/oidc/callback?code=tfa-code-1&state=${encodeURIComponent(flow.q.get('state'))}`, flow.flowCookie);
  assert.equal(replay.status, 302);
  assert.equal(replay.location, '/login?sso=error', 'the replayed callback fails closed (delete-on-use flow state)');
  assert.equal(challengeCookieOf(replay.cookies), null, 'the replay mints no second challenge cookie');
  withDb(tfaServer.dbPath, db => {
    const user = db.prepare('select id from users where email = ?').get(EMAIL);
    assert.equal(db.prepare('select count(*) as n from login_challenges where user_id = ?').get(user.id).n, 0, 'no second challenge row');
    assert.equal(db.prepare('select count(*) as n from sessions where user_id = ?').get(user.id).n, sessionsBeforeSso, 'no second session (the revoked SSO session was not resurrected)');
  });
});

test('SSO-05: parallel logins for the same user produce per-attempt challenge rows (never shared/overwritten)', async () => {
  const EMAIL2 = '2fa.sso.two@example.com';
  await enrollTfa(tfaServer, EMAIL2, 'correct-horse-9');
  const first = await runFlow({ srv: tfaServer, code: 'tfa-code-2', claims: { sub: 'sub-2fa-two', email: EMAIL2 } });
  const second = await runFlow({ srv: tfaServer, code: 'tfa-code-3', claims: { sub: 'sub-2fa-two', email: EMAIL2 } });
  assert.equal(first.callback.location, '/#tfa');
  assert.equal(second.callback.location, '/#tfa');
  const c1 = challengeCookieOf(first.callback.cookies);
  const c2 = challengeCookieOf(second.callback.cookies);
  assert.ok(c1 && c2, 'both attempts set a challenge cookie');
  assert.notEqual(c1, c2, 'each login attempt carries its OWN challenge token');
  withDb(tfaServer.dbPath, db => {
    const user = db.prepare('select id from users where email = ?').get(EMAIL2);
    const rows = db.prepare('select challenge_token_hash from login_challenges where user_id = ?').all(user.id);
    assert.equal(rows.length, 2, 'two distinct challenge rows — per-attempt, never overwritten');
    assert.notEqual(rows[0].challenge_token_hash, rows[1].challenge_token_hash);
  });
});

/* Source assertion (plan acceptance): the callback's two_fa_enabled branch
   reuses the D-68 recipe verbatim — same login_challenges insert column list
   and the same setChallengeCookie call as the login route. */
test('SSO-05 source pin: the callback challenge branch carries the verbatim D-68 recipe', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const callbackStart = src.indexOf("pathname === '/api/auth/oidc/callback'");
  const loginStart = src.indexOf("pathname === '/api/auth/login'");
  const callbackBlock = src.slice(callbackStart, loginStart);
  const loginBlock = src.slice(loginStart);
  const INSERT = 'insert into login_challenges (challenge_token_hash, user_id, expires_at, attempts) values (?,?,?,0)';
  assert.ok(callbackBlock.includes(INSERT), 'the callback uses the SAME login_challenges insert column list as the login route');
  assert.ok(callbackBlock.includes('setChallengeCookie(req, res, challengeToken)'), 'the callback sets the SAME challenge cookie via setChallengeCookie');
  assert.ok(callbackBlock.includes('CHALLENGE_TTL_MS'), 'the callback uses the SAME CHALLENGE_TTL_MS');
  assert.ok(loginBlock.includes(INSERT) && loginBlock.includes('setChallengeCookie(req, res, challengeToken)'), 'the login-route recipe itself is untouched');
});

/* ---------------- SSO-07 (Phase 30 plan 03): invite reconciliation ---------------- */

const sha256hex = s => crypto.createHash('sha256').update(s).digest('hex');

function seedInvite(db, email, role, { expired = false, teams = null, scope = null } = {}) {
  const ws = db.prepare('select id from workspaces order by rowid limit 1').get();
  const owner = db.prepare('select id from users where email = ?').get('owner@test.local');
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('insert into invites (token_hash, email, role, teams, scope, workspace_id, created_by, created_at, expires_at) values (?,?,?,?,?,?,?,?,?)').run(
    sha256hex(token),
    email,
    role,
    teams,
    scope,
    ws.id,
    owner.id,
    Date.now(),
    expired ? Date.now() - 1000 : Date.now() + 86400000,
  );
  return token;
}

test('SSO-07/D-06: a first-login SSO user with exactly one pending invite gets it auto-accepted', async () => {
  inviteServer = await startServer({
    env: { OIDC_ENABLED: 'true', OIDC_TENANT_ID: 't-1', OIDC_CLIENT_ID: 'cid', OIDC_CLIENT_SECRET: 'sec', OIDC_ISSUER_OVERRIDE: idp.issuer },
  });
  withDb(inviteServer.dbPath, db => seedInvite(db, 'invite.one@example.com', 'viewer', { teams: '["t-1"]', scope: '{"projects":["p-1"]}' }));

  const { callback } = await runFlow({ srv: inviteServer, code: 'inv-code-1', claims: { sub: 'sub-inv-one', email: 'INVITE.ONE@example.com' } });
  assert.equal(callback.status, 302);
  assert.equal(callback.location, '/', 'the auto-accepted user lands in the app');
  assert.ok(sessionCookieOf(callback.cookies), 'a session was minted');

  withDb(inviteServer.dbPath, db => {
    const user = db.prepare('select id from users where email = ?').get('invite.one@example.com');
    assert.ok(user, 'the JIT account exists');
    const memberships = db.prepare('select * from memberships where user_id = ?').all(user.id);
    assert.equal(memberships.length, 1, 'exactly one membership row');
    assert.equal(memberships[0].role, 'viewer', 'the membership carries the INVITE role via the acceptance recipe');
    assert.equal(memberships[0].scope, '{"projects":["p-1"]}', 'the invite-carried scope landed on the membership (verbatim addMembership)');
    const teams = db.prepare('select * from team_members where user_id = ?').all(user.id);
    assert.equal(teams.length, 1, 'the invite-carried team landed as an authority row');
    const invites = db.prepare('select * from invites where lower(email) = ?').all('invite.one@example.com');
    assert.equal(invites.length, 1);
    assert.ok(invites[0].used_at, 'the invite was cleared (used_at stamped) — never stranded');
    assert.equal(invites[0].used_by, user.id);
    const log = db.prepare('select * from security_log where user_id = ? and verb = ?').all(user.id, 'sso_invite_accepted');
    assert.equal(log.length, 1, 'the auto-accept was security-logged');
  });
});

test('SSO-07: a first-login SSO user with MULTIPLE pending invites is surfaced, not mass-accepted', async () => {
  withDb(inviteServer.dbPath, db => {
    seedInvite(db, 'invite.multi@example.com', 'member');
    seedInvite(db, 'invite.multi@example.com', 'viewer');
  });
  const { callback } = await runFlow({ srv: inviteServer, code: 'inv-code-2', claims: { sub: 'sub-inv-multi', email: 'invite.multi@example.com' } });
  assert.equal(callback.status, 302);
  assert.equal(callback.location, '/#invitations', 'the callback redirects to the invitations landing');
  withDb(inviteServer.dbPath, db => {
    const user = db.prepare('select id from users where email = ?').get('invite.multi@example.com');
    assert.equal(db.prepare('select count(*) as n from memberships where user_id = ?').get(user.id).n, 0, 'no silent mass-accept: no membership row');
    assert.equal(db.prepare('select count(*) as n from invites where email = ? and used_at is null').get('invite.multi@example.com').n, 2, 'BOTH invites remain pending — never stranded');
  });
});

test('SSO-07: expired invites are ignored — not accepted, not blocking', async () => {
  withDb(inviteServer.dbPath, db => seedInvite(db, 'invite.expired@example.com', 'admin', { expired: true }));
  const { callback } = await runFlow({ srv: inviteServer, code: 'inv-code-3', claims: { sub: 'sub-inv-exp', email: 'invite.expired@example.com' } });
  assert.equal(callback.status, 302);
  assert.equal(callback.location, '/', 'the expired invite neither blocks nor elevates');
  withDb(inviteServer.dbPath, db => {
    const user = db.prepare('select id from users where email = ?').get('invite.expired@example.com');
    assert.equal(db.prepare('select count(*) as n from memberships where user_id = ?').get(user.id).n, 0, 'no membership from an expired invite');
    assert.equal(db.prepare('select used_at from invites where email = ?').get('invite.expired@example.com').used_at, null, 'the expired invite stays untouched');
  });
});

test('SSO-07: a repeat SSO login after acceptance creates no duplicate membership', async () => {
  const { callback } = await runFlow({ srv: inviteServer, code: 'inv-code-4', claims: { sub: 'sub-inv-one', email: 'invite.one@example.com' } });
  assert.equal(callback.status, 302);
  assert.equal(callback.location, '/', 'the repeat login signs in normally');
  withDb(inviteServer.dbPath, db => {
    const user = db.prepare('select id from users where email = ?').get('invite.one@example.com');
    assert.equal(db.prepare('select count(*) as n from memberships where user_id = ?').get(user.id).n, 1, 'still exactly ONE membership row');
    assert.equal(db.prepare('select count(*) as n from oidc_identities where subject = ?').get('sub-inv-one').n, 1, 'still exactly one identity row');
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

/* ---------------- SSO-06 (Phase 30 plan 04): SSO-only mode — D-07/D-08 ----------------
   With OIDC_SSO_ONLY=true the password door is a bare 404 (no-oracle, never
   403-with-message), the REST of the auth family stays functional (Pitfall 6
   coherence matrix), and clearing the flag reverses everything with no data
   loss (password_hash intact — D-08). Each row below drives a real server. */

test('SSO-06 config row: oidcSsoOnly tracks the env when SSO is enabled', async () => {
  const sso = await startServer({
    env: { OIDC_ENABLED: 'true', OIDC_TENANT_ID: 't-1', OIDC_CLIENT_ID: 'cid', OIDC_CLIENT_SECRET: 'sec', OIDC_ISSUER_OVERRIDE: idp.issuer, OIDC_SSO_ONLY: 'true' },
  });
  try {
    const config = await fetch(`${sso.base}/api/config`).then(r => r.json());
    assert.equal(config.oidcEnabled, true);
    assert.equal(config.oidcSsoOnly, true);
  } finally {
    await sso.stop();
  }
});

test('SSO-06/D-07: /api/auth/login under SSO-only answers a bare 404 notFound — never 403-with-message', async () => {
  const sso = await startServer({
    env: { OIDC_ENABLED: 'true', OIDC_TENANT_ID: 't-1', OIDC_CLIENT_ID: 'cid', OIDC_CLIENT_SECRET: 'sec', OIDC_ISSUER_OVERRIDE: idp.issuer, OIDC_SSO_ONLY: 'true' },
  });
  try {
    const res = await fetch(`${sso.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@test.local', password: 'owner-password-1' }),
    });
    assert.equal(res.status, 404);
    assert.notEqual(res.status, 403, 'no 403 oracle under SSO-only');
    const body = await res.json();
    assert.equal(body.code, 'notFound', 'the exact generic notFound shape');
    // Even a cross-origin POST (Origin header present, mismatched) gets the same
    // 404 — the gate sits BEFORE the sameOrigin guard, so no 403 leaks either.
    const cors = await fetch(`${sso.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ email: 'owner@test.local', password: 'owner-password-1' }),
    });
    assert.equal(cors.status, 404, 'cross-origin POST is equally a bare 404');
  } finally {
    await sso.stop();
  }
});

test('SSO-06/Pitfall-6 coherence: tfa/login, logout and me stay functional under SSO-only', async () => {
  const sso = await startServer({
    env: { OIDC_ENABLED: 'true', OIDC_TENANT_ID: 't-1', OIDC_CLIENT_ID: 'cid', OIDC_CLIENT_SECRET: 'sec', OIDC_ISSUER_OVERRIDE: idp.issuer, OIDC_SSO_ONLY: 'true' },
  });
  try {
    // tfa/login: NO challenge cookie → 401 challengeExpired — the route RAN (not 404).
    const tfa = await fetch(`${sso.base}/api/auth/tfa/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '123456' }),
    });
    assert.equal(tfa.status, 401);
    assert.equal((await tfa.json()).code, 'challengeExpired', 'the 2FA route is alive under SSO-only (SSO users need it)');

    // logout: 204 — functional.
    const logout = await fetch(`${sso.base}/api/auth/logout`, { method: 'POST' });
    assert.equal(logout.status, 204, 'logout stays functional under SSO-only');

    // me: 200 {user:null} — the probe endpoint is alive.
    const me = await fetch(`${sso.base}/api/auth/me`).then(r => r.json());
    assert.deepEqual(me, { user: null }, '/api/auth/me stays functional under SSO-only');
  } finally {
    await sso.stop();
  }
});

test('SSO-06: signup remains governed by the existing ALLOW_SIGNUP flag (no new behavior)', async () => {
  const sso = await startServer({
    env: { OIDC_ENABLED: 'true', OIDC_TENANT_ID: 't-1', OIDC_CLIENT_ID: 'cid', OIDC_CLIENT_SECRET: 'sec', OIDC_ISSUER_OVERRIDE: idp.issuer, OIDC_SSO_ONLY: 'true' },
  });
  try {
    const s = await signup(sso.base, { name: 'Still Open', email: 'signup.ssoonly@example.com', password: 'password-1234' });
    assert.equal(s.status, 201, 'signup works under SSO-only while ALLOW_SIGNUP=true (default BASE_ENV)');
  } finally {
    await sso.stop();
  }
});

test('SSO-06/D-08: SSO-only is REVERSIBLE — clearing the flag reopens password sign-in, password_hash intact', async () => {
  const os = await import('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-sso-rev-'));
  const boot = extra =>
    startServer({
      dataDir: dir,
      env: { OIDC_ENABLED: 'true', OIDC_TENANT_ID: 't-1', OIDC_CLIENT_ID: 'cid', OIDC_CLIENT_SECRET: 'sec', OIDC_ISSUER_OVERRIDE: idp.issuer, ...extra },
    });
  const first = await boot({ OIDC_SSO_ONLY: 'true' });
  try {
    // A real password account exists under SSO-only (signup route unaffected).
    const acc = await signup(first.base, { name: 'Revive Me', email: 'revive.me@example.com', password: 'correct-horse-9' });
    assert.equal(acc.status, 201);
    // ...but its password sign-in is a 404.
    const locked = await fetch(`${first.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'revive.me@example.com', password: 'correct-horse-9' }),
    });
    assert.equal(locked.status, 404, 'the password door is closed under SSO-only');
    // The credential material was never touched.
    const hash = withDb(first.dbPath, db => db.prepare('select password_hash from users where email = ?').get('revive.me@example.com').password_hash);
    assert.ok(hash && hash !== '', 'password_hash retained while SSO-only is on');
  } finally {
    await first.stop();
  }
  // Reboot the SAME database WITHOUT the flag: the door reopens, no data wipe.
  const second = await boot({});
  try {
    const res = await fetch(`${second.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'revive.me@example.com', password: 'correct-horse-9' }),
    });
    assert.equal(res.status, 200, 'removing OIDC_SSO_ONLY restores password sign-in for the same account');
    assert.ok(res.headers.getSetCookie?.().some(c => c.startsWith('projects_session=')), 'a session was minted');
  } finally {
    await second.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
