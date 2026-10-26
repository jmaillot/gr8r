/* The server error contract (D-04): every HTTP error the server builds carries a stable
   machine code beside its unchanged English message, and every emitted code has a non-empty
   err.<code> entry in BOTH catalogues. server.js cannot be imported by a test (it boots on
   load), so the static half reads the source as text — the house extraction pattern. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };
import { ADMIN, ROOT, login, signup, startServer, client, inviteToken } from './helpers/server.mjs';

const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

/* ---------- D-04: the static parity — every emitted code is catalogued ---------- */

/* A code is always a static camelCase literal passed positionally: fail(res, status, 'code',
   …) and the optional third argument of httpError(status, 'message', 'code'). */
const codes = new Set();
for (const m of serverSource.matchAll(/fail\(res,\s*\d+,\s*'([A-Za-z][A-Za-z0-9]*)'/g)) codes.add(m[1]);
for (const m of serverSource.matchAll(/httpError\(\s*\d+,\s*'[^']*',\s*'([A-Za-z][A-Za-z0-9]*)'/g)) codes.add(m[1]);

test('every error code the server emits has a non-empty err.<code> entry in both catalogues', () => {
  assert.ok(codes.size > 0, 'the extraction found no error codes — the fail()/httpError sites moved');
  for (const code of codes) {
    assert.ok(typeof en[`err.${code}`] === 'string' && en[`err.${code}`] !== '', `en missing err.${code}`);
    assert.ok(typeof fr[`err.${code}`] === 'string' && fr[`err.${code}`] !== '', `fr missing err.${code}`);
  }
});

/* ---------- anti-regression: the conversion is complete and pinned ---------- */

test('no inline error payload survived the fail() conversion', () => {
  assert.ok(!/json\(res,\s*\d+,\s*\{\s*error:/.test(serverSource), 'an inline error payload survived the fail() conversion');
});

test('the three catch sites transfer err.code and the emailSendFailed row carries its code', () => {
  assert.equal((serverSource.match(/code: err\.code/g) || []).length, 3, 'the three catch sites must transfer err.code');
  assert.equal((serverSource.match(/row\.code = 'emailSendFailed'/g) || []).length, 1, 'the emailSendFailed row must carry its code');
});

/* ---------- the payload shape, proved on a real server ---------- */

test('a failed login keeps the English message byte-for-byte and carries the machine code', async () => {
  const server = await startServer();
  try {
    const res = await login(server.base, ADMIN.email, 'not-the-password');
    assert.equal(res.status, 401);
    assert.equal(res.data.error, 'Email or password is incorrect');
    assert.equal(res.data.code, 'invalidCredentials');
    /* the payload shape did not grow anything else beside error and code */
    assert.deepEqual(Object.keys(res.data).sort(), ['code', 'error']);
  } finally {
    await server.stop();
  }
});

test('a weak signup password returns the passwordTooWeak code beside the unchanged message', async () => {
  const server = await startServer();
  try {
    const res = await signup(server.base, { name: 'Weak', email: 'weak@test.local', password: 'short' });
    assert.equal(res.status, 400);
    assert.equal(res.data.error, 'Use at least 10 characters, including a number or symbol');
    assert.equal(res.data.code, 'passwordTooWeak');
    assert.deepEqual(Object.keys(res.data).sort(), ['code', 'error']);
  } finally {
    await server.stop();
  }
});

/* ---------- ERR-02: the client half — has()/tErr() at the api.js boundary ---------- */

/* D-01: the catalogue key is the server code verbatim. D-03: an unknown code falls back to the
   raw server message — never a toast, never the literal err.<code> key (t() returns the key
   itself on a miss, so tErr must gate through has()). i18n.js is a leaf module over the JSON
   catalogues, importable by plain Node. The French catalogue is registered explicitly: the
   bundler glob is absent in plain Node, so the loader map is empty by design. */
import { has, tErr, primeLocale, registerCatalogue, BASE_LOCALE } from '../src/core/i18n.js';

registerCatalogue('fr', fr);

test('tErr resolves a known code with interpolated params in the active locale', async () => {
  await primeLocale('en');
  assert.equal(tErr('alreadyMember', { email: 'a@b.test', name: 'Studio' }, 'raw'), 'a@b.test is already a member of Studio');
  await primeLocale('fr');
  assert.equal(tErr('alreadyMember', { email: 'a@b.test', name: 'Studio' }, 'raw'), 'a@b.test est déjà membre de Studio');
  await primeLocale(BASE_LOCALE);
});

test('an unknown code falls back to the raw server message (D-03), or to undefined when raw is absent', () => {
  const raw = 'Something unexpected broke';
  assert.equal(tErr('noSuchCodeAnywhere', undefined, raw), raw);
  /* the consumers' existing `|| t('err.fallback')` default takes the relay when raw is missing */
  assert.equal(tErr('noSuchCodeAnywhere', undefined, undefined), undefined);
  assert.equal(tErr('noSuchCodeAnywhere'), undefined);
});

test('tErr never echoes the literal err.<code> key (Pitfall 2)', () => {
  for (const code of ['alreadyMember', 'invalidCredentials', 'neverHeardOfThisOne']) {
    const out = tErr(code, { email: 'x@y.test', name: 'N' }, 'raw server message');
    assert.ok(!/^err\.[a-z]/.test(out), `tErr echoed the literal key for ${code}: ${out}`);
  }
});

test('has() gates on the exact key against the active then base locale, no folding or normalisation', async () => {
  await primeLocale('en');
  assert.equal(has('err.alreadyMember'), true);
  assert.equal(has('err.alreadymember'), false);
  assert.equal(has('err.alreadyMember '), false);
  assert.equal(has('not.an.err.key'), false);
  await primeLocale(BASE_LOCALE);
});

/* ---------- CR-02 / IN-03: the whole-payload transport, proved on a real server ---------- */

test('alreadyMember ships its flat payload and renders in French without braces', async () => {
  const server = await startServer();
  try {
    const admin = client(server.base, 'admin');
    const auth = await admin.post('/api/auth/login', { email: ADMIN.email, password: ADMIN.password });
    assert.equal(auth.status, 200);

    /* the second account becomes a member through a first invite, so the second
       invite for the same address hits the alreadyMember branch */
    const first = await admin.post('/api/workspaces/acme/invites', { emails: ['member@test.local'], role: 'Member' });
    assert.equal(first.status, 201);
    const accepted = await client(server.base, 'member').post(`/api/invites/${encodeURIComponent(inviteToken(first.data.invites[0].url))}/accept`, {
      name: 'Member',
      email: 'member@test.local',
      password: 'password-1234',
    });
    assert.equal(accepted.status, 201);

    /* the admin re-invites the existing member's address → 409 alreadyMember */
    const res = await admin.post('/api/workspaces/acme/invites', { emails: ['member@test.local'], role: 'Member' });
    assert.equal(res.status, 409);
    assert.equal(res.data.code, 'alreadyMember');
    assert.equal(res.data.error, 'member@test.local is already a member of Acme');
    /* the interpolation params arrive flat in the payload — never behind a params field */
    assert.equal(res.data.email, 'member@test.local');
    assert.equal(res.data.name, 'Acme');

    /* the whole payload passed as vars renders the fr phrase with no literal { or } */
    await primeLocale('fr');
    const rendered = tErr(res.data.code, res.data, res.data.error);
    assert.ok(!rendered.includes('{') && !rendered.includes('}'), `the fr render leaked a placeholder: ${rendered}`);
    assert.ok(rendered.includes('member@test.local'), `the fr render lost the email: ${rendered}`);
    assert.ok(rendered.includes('Acme'), `the fr render lost the workspace name: ${rendered}`);

    /* IN-03: an invite row consumed the same flat transport (modals.js path) */
    const row = { code: 'emailSendFailed', error: 'raw', email: 'x@y.test' };
    assert.equal(tErr('emailSendFailed', row, row.error), fr['err.emailSendFailed']);
    await primeLocale(BASE_LOCALE);
  } finally {
    await server.stop();
  }
});

test('inviteForOtherEmail carries its email in the payload on the join flow', async () => {
  const server = await startServer();
  try {
    const admin = client(server.base, 'admin');
    const auth = await admin.post('/api/auth/login', { email: ADMIN.email, password: ADMIN.password });
    assert.equal(auth.status, 200);

    /* invite a fresh address, then accept the link with a DIFFERENT one */
    const created = await admin.post('/api/workspaces/acme/invites', { emails: ['newbie@test.local'], role: 'Member' });
    assert.equal(created.status, 201);
    const url = created.data.invites?.find(i => i.email === 'newbie@test.local')?.url;
    const token = inviteToken(url);
    assert.ok(token, 'the invite response did not carry a join url');

    const res = await client(server.base, 'other').post(`/api/invites/${encodeURIComponent(token)}/accept`, {
      name: 'Other',
      email: 'other@test.local',
      password: 'password-1234',
    });
    assert.equal(res.status, 400);
    assert.equal(res.data.code, 'inviteForOtherEmail');
    assert.equal(res.data.email, 'newbie@test.local');
    assert.equal(res.data.error, 'This invite is for newbie@test.local');
  } finally {
    await server.stop();
  }
});

/* ---------- IN-01: reverse parity, reserved placeholders, pinned payload shape ---------- */

/* Reverse parity allowlist: err.* catalogue codes that are composed CLIENT-side only, never
   emitted by server.js. Derived by diffing the en.json err.* namespace against the server
   source; a catalogued code absent from server.js AND absent here fails the suite. */
const CLIENT_ONLY_ERR_CODES = [
  'changeRole', // toast composed in actions.js after a successful PATCH
  'taskAccess', // toast composed in actions.js after a successful task write
  'uploadOffline', // demo/offline branch in actions.js — no server call made
  'cannotChangeAccess', // permission toast composed in actions.js before the call
  'inviteFirst', // guard toast in actions.js — nothing to revoke yet
  'lastMember', // guard toast in actions.js — leave blocked before the call
  'inviteLink', // toast composed in actions.js from the created invite row
  'newInvite', // toast composed in actions.js from the created invite row
  'revokeInvite', // toast composed in api.js after a successful DELETE of an invite
  'removeMember', // toast composed in api.js after a successful member DELETE
  'deleteWorkspace', // toast composed in api.js after a successful workspace DELETE
  'leaveWorkspace', // toast composed in actions.js after a successful leave
  'noAccountYet', // guard toast in actions.js — onboarding state, not a server error
  'noAccountToRemove', // guard toast in actions.js before the DELETE
  'switchWorkspace', // toast composed in actions.js after a successful switch
  'offlineMode', // demo/offline branch in actions.js — no server call made
  'changesNotSaved', // demo/offline branch in actions.js — no server call made
  'wsColor', // validation toast composed in actions.js before PATCH
  'wsNameEmpty', // validation toast composed in actions.js before PATCH
  'wsSettings', // toast composed in actions.js after a successful PATCH
  'projectName', // toast composed in actions.js after a project rename
  'notValidEmail', // validation toast composed in actions.js before the invite call
  'wsCreatedNotLoaded', // toast composed in actions.js when create succeeded but load failed
  'sendInvites', // toast composed in actions.js after a successful invite batch
  'taskNameRequired', // validation toast composed in actions.js before the write
  'projectNameRequired', // validation toast composed in actions.js before the write
  'enterEmails', // validation toast composed in actions.js before the invite call
  'invitesCreateFailed', // toast composed in actions.js when the batch call fails
  'wsNameRequired', // validation toast composed in actions.js before the call
  'enterEmail', // form validation toast composed in actions.js
  'emailInvalidExample', // form validation toast composed in actions.js
  'emailInvalid', // form validation toast composed in actions.js
  'workEmailInvalid', // form validation toast composed in actions.js
  'forgotEmailInvalid', // form validation toast composed in actions.js
  'enterPassword', // form validation toast composed in actions.js
  'enterCurrentPassword', // form validation toast composed in actions.js
  'passwordWeak', // form validation toast composed in actions.js
  'passwordMismatch', // form validation toast composed in actions.js
  'enterName', // form validation toast composed in actions.js
  'signinFailed', // toast composed in actions.js when login fails
  'inviteAcceptFailed', // toast composed in actions.js when accept fails
  'workspaceLoadFailed', // toast composed in actions.js when load fails
  'joinFailed', // toast composed in actions.js when join fails
  'accountCreatedLoadFailed', // toast composed in actions.js when post-signup load fails
  'accountCreateFailed', // toast composed in actions.js when create fails
  'tfaCode', // form validation toast composed in actions.js
  'teamNameRequired', // validation toast composed in actions/teams.js
  'serverUnreachable', // built by the offline branch of api.js call() (fetch threw)
  'noWorkspaceLoaded', // built by api.js guards when no workspace slug is selected
  'projectNotFound', // toast composed in overlays/modals.js for a missing project
  'signedOutElsewhere', // built by the central mid-session 401 teardown registered in actions.js (D-28)
  'saveNotSynced', // built by main.js from the sync-state signal, not a server payload
  'wsLoadFailed', // toast composed in main.js when the document load fails
  'code404', // static error-page copy in pages/errors.js
  'code403', // static error-page copy in pages/errors.js
];

test('reverse parity: every catalogued err.* code is emitted by server.js or allowlisted as client-side', () => {
  const catalogueCodes = Object.keys(en)
    .filter(k => k.startsWith('err.'))
    .map(k => k.slice(4));
  assert.ok(catalogueCodes.length > 40, 'the err.* namespace looks empty — the extraction moved');
  for (const code of catalogueCodes) {
    if (serverSource.includes(code)) continue;
    assert.ok(CLIENT_ONLY_ERR_CODES.includes(code), `err.${code} is catalogued but emitted nowhere: not in server.js and not in the client-side allowlist`);
  }
});

test('reserved placeholder guard: no err.* value interpolates a control field of the payload', () => {
  /* Control fields that call()/the server put flat on the error payload — a catalogue
     placeholder with one of these names would interpolate the control value itself. */
  const reserved = ['error', 'code', 'status', 'ok', 'data', 'needsSignIn', 'suggestion', 'revision'];
  for (const [locale, catalogue] of [
    ['en', en],
    ['fr', fr],
  ]) {
    for (const [key, value] of Object.entries(catalogue)) {
      if (!key.startsWith('err.') || typeof value !== 'string') continue;
      for (const name of reserved) {
        assert.ok(!value.includes(`{${name}}`), `${locale} err value ${key} interpolates the reserved control field {${name}}`);
      }
    }
  }
});

test('payload shape: the alreadyMember error payload is flat error/code/email/name with no params field', async () => {
  const server = await startServer();
  try {
    const admin = client(server.base, 'admin');
    assert.equal((await admin.post('/api/auth/login', { email: ADMIN.email, password: ADMIN.password })).status, 200);
    const inv = await admin.post('/api/workspaces/acme/invites', { emails: ['member@test.local'], role: 'Member' });
    await client(server.base, 'member').post(`/api/invites/${encodeURIComponent(inviteToken(inv.data.invites[0].url))}/accept`, {
      name: 'Member',
      email: 'member@test.local',
      password: 'password-1234',
    });
    const res = await admin.post('/api/workspaces/acme/invites', { emails: ['member@test.local'], role: 'Member' });
    assert.equal(res.status, 409);
    assert.deepEqual(Object.keys(res.data).sort(), ['code', 'email', 'error', 'name']);
    assert.equal(res.data.code, 'alreadyMember');
    /* the whole-payload transport never grew a params field — its presence would signal a
       silent regression back to the params-bag option without the client following */
    assert.equal('params' in res.data, false);
  } finally {
    await server.stop();
  }
});

/* ---------- CR-01 / WR-05 / WR-06: every thrown site carries its catalogued code ---------- */

test('lastPrivateMember returns 409 with its code when the removal would strand a private project', async () => {
  const server = await startServer();
  try {
    const admin = client(server.base, 'admin');
    assert.equal((await admin.post('/api/auth/login', { email: ADMIN.email, password: ADMIN.password })).status, 200);

    /* the second member joins through an invite, then lands in the document roster */
    const inv = await admin.post('/api/workspaces/acme/invites', { emails: ['member@test.local'], role: 'Member' });
    assert.equal(inv.status, 201);
    const joined = await client(server.base, 'member').post(`/api/invites/${encodeURIComponent(inviteToken(inv.data.invites[0].url))}/accept`, {
      name: 'Member',
      email: 'member@test.local',
      password: 'password-1234',
    });
    assert.equal(joined.status, 201);

    /* craft a private project whose ONLY member is the target */
    const ws = await admin.get('/api/workspaces/acme');
    const members = await admin.get('/api/workspaces/acme/members');
    const target = members.data.members.find(m => m.email === 'member@test.local');
    assert.ok(target, 'the second member is missing from the roster');
    const put = await admin.put('/api/workspaces/acme', {
      revision: ws.data.revision,
      doc: { data: { projects: [{ id: 'p_priv', name: 'Secret', private: true, members: [target.memberId] }] } },
    });
    assert.equal(put.status, 200, JSON.stringify(put.data));

    const res = await admin.del(`/api/workspaces/acme/members/${encodeURIComponent(target.userId)}`);
    assert.equal(res.status, 409);
    assert.equal(res.data.code, 'lastPrivateMember');
    assert.equal(res.data.error, 'Promote someone before removing the last member of a private project');
  } finally {
    await server.stop();
  }
});

test('bodyTooLarge reaches the client as a full 413 response, the socket never resets', async () => {
  const server = await startServer({ env: { MAX_BODY_BYTES: '64' } });
  try {
    /* a 4 kB JSON body against a 64-byte limit */
    const big = JSON.stringify({ email: 'x'.repeat(4096) + '@test.local', password: 'password-1234' });
    assert.ok(Buffer.byteLength(big) > 4096);
    const res = await fetch(`${server.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: big,
    });
    assert.equal(res.status, 413);
    const data = await res.json();
    assert.equal(data.code, 'bodyTooLarge');
    assert.equal(data.error, 'Request body too large');
    /* the server is still alive and answering on the same port */
    const alive = await fetch(`${server.base}/api/health`);
    assert.ok(alive.ok);
  } finally {
    await server.stop();
  }
});

test('invalidJson returns 400 with its code', async () => {
  const server = await startServer();
  try {
    const res = await fetch(`${server.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'this is { not json',
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.code, 'invalidJson');
    assert.equal(data.error, 'Invalid JSON body');
  } finally {
    await server.stop();
  }
});

test('workspaceNotFound is returned for a document save to a nonexistent workspace slug', async () => {
  const server = await startServer();
  try {
    const admin = client(server.base, 'admin');
    assert.equal((await admin.post('/api/auth/login', { email: ADMIN.email, password: ADMIN.password })).status, 200);
    const res = await admin.put('/api/workspaces/does-not-exist', { revision: 1, doc: { data: {} } });
    assert.equal(res.status, 404);
    assert.equal(res.data.code, 'workspaceNotFound');
  } finally {
    await server.stop();
  }
});

test('accountExists stays on the duplicate signup after the pre-check', async () => {
  const server = await startServer();
  try {
    const first = await signup(server.base, { name: 'First', email: 'dupe@test.local' });
    assert.equal(first.status, 201);
    const second = await signup(server.base, { name: 'Second', email: 'dupe@test.local' });
    assert.equal(second.status, 409);
    assert.equal(second.data.code, 'accountExists');
    assert.equal(second.data.error, 'An account with that email already exists');
  } finally {
    await server.stop();
  }
});

/* WR-06 static half: the insert inside createUser maps the UNIQUE violation to the same
   message and code as the pre-check (the pre-check itself is the other occurrence). */
test('accountExists maps the signup race: createUser wraps its insert in the TOCTOU guard', () => {
  const matches = serverSource.match(/httpError\(409, 'An account with that email already exists', 'accountExists'\)/g) || [];
  assert.equal(matches.length, 2, 'createUser must keep both the pre-check and the insert catch mapped to accountExists');
  const body = serverSource.slice(serverSource.indexOf('function createUser'), serverSource.indexOf('function createWorkspace'));
  assert.match(body, /try \{[\s\S]*insert into users[\s\S]*\} catch \(err\) \{[\s\S]*accountExists/);
});

/* ---------- WR-03: the TRUST_PROXY opt-in — header rotation cannot escape the throttle ---------- */

/* The login throttle keys on clientIp(); without the opt-in that is the socket address,
   so rotating X-Forwarded-For per request changes nothing — the 11th attempt is 429.
   With the opt-in (the documented behind-proxy posture), each rotated header is a
   different key and the throttle never trips in 11 attempts. */
test('without the TRUST_PROXY opt-in, rotating X-Forwarded-For no longer escapes the login throttle (WR-03)', async () => {
  const server = await startServer({ env: { TRUST_PROXY: 'false' } });
  try {
    let last;
    for (let attempt = 1; attempt <= 11; attempt++) {
      last = await fetch(`${server.base}/api/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': `10.0.${Math.floor(attempt / 256)}.${attempt % 256}`,
        },
        body: JSON.stringify({ email: ADMIN.email, password: 'not-the-password' }),
      });
    }
    assert.equal(last.status, 429);
    const data = await last.json();
    assert.equal(data.code, 'tooManyLoginAttempts');
    assert.equal(data.error, 'Too many attempts. Try again in 15 minutes.');
  } finally {
    await server.stop();
  }
});

test('with TRUST_PROXY=true the documented behind-proxy behaviour is preserved: rotated X-Forwarded-For does not trip the throttle', async () => {
  const server = await startServer({ env: { TRUST_PROXY: 'true' } });
  try {
    let last;
    for (let attempt = 1; attempt <= 11; attempt++) {
      last = await fetch(`${server.base}/api/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': `10.1.${Math.floor(attempt / 256)}.${attempt % 256}`,
        },
        body: JSON.stringify({ email: ADMIN.email, password: 'not-the-password' }),
      });
      assert.equal(last.status, 401, `attempt ${attempt} must be a plain bad-credential 401, not throttled`);
    }
    const data = await last.json();
    assert.equal(data.code, 'invalidCredentials');
  } finally {
    await server.stop();
  }
});

/* ---------- WR-07: the two session-establishing endpoints carry the sameOrigin guard ---------- */

/* A hostile Origin on /api/auth/login or /api/auth/signup is the login-CSRF hole the
   other mutations already close; the guard runs before the body read and before the
   throttle, so the cross-origin POST cannot consume the victim IP's attempt budget. */
test('a hostile Origin is rejected on login and signup with the standard crossOriginRejected 403 (WR-07)', async () => {
  const server = await startServer();
  try {
    for (const pathname of ['/api/auth/login', '/api/auth/signup']) {
      const res = await fetch(`${server.base}${pathname}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password, name: 'Evil' }),
      });
      assert.equal(res.status, 403, `${pathname} must reject a hostile Origin`);
      const data = await res.json();
      assert.equal(data.code, 'crossOriginRejected');
      assert.equal(data.error, 'Cross-origin request rejected', 'the message is byte-identical to the other guard sites');
      assert.deepEqual(Object.keys(data).sort(), ['code', 'error']);
    }
  } finally {
    await server.stop();
  }
});

test('positive control: the harness login without an Origin header still succeeds (WR-07 guard is browser-scoped)', async () => {
  const server = await startServer();
  try {
    const res = await login(server.base, ADMIN.email, ADMIN.password);
    assert.equal(res.status, 200);
    const res2 = await signup(server.base, { name: 'Curl', email: 'curl@test.local' });
    assert.equal(res2.status, 201);
  } finally {
    await server.stop();
  }
});
