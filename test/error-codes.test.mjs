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
import { ADMIN, ROOT, login, signup, startServer } from './helpers/server.mjs';

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
