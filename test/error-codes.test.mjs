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
    const accepted = await client(server.base, 'member').post(
      `/api/invites/${encodeURIComponent(inviteToken(first.data.invites[0].url))}/accept`,
      { name: 'Member', email: 'member@test.local', password: 'password-1234' },
    );
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
