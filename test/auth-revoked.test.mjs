/* D-28 client teardown wiring: a revoked browser's mid-session 401 carrying the
   server's `signInRequired` code must route through the ONE registered teardown —
   honest "signed out elsewhere" toast, full sign-out, login screen — exactly once
   per revocation. Not-signed-in is not signed-out-elsewhere: a boot-time 401 on
   /api/auth/me with no account stays silent, and the latch re-arms after a
   successful re-auth so a second revocation in the same tab is still torn down.

   The client is exercised against the real src/core/api.js with globalThis.fetch
   stubbed per-call (the client-side analog of the server tests' own-HTTP harness —
   no gr8r code is mocked). api.js is a module singleton, so the test() blocks form
   one ordered sequence sharing state (node:test runs them in file order). The
   cross-module wiring (actions.js registers signOutRevoked as the teardown) is
   pinned source-as-text — the house extraction pattern from test/error-codes.test.mjs. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

globalThis.location = { origin: 'http://test.local' };

const { api, registerAuthRevokedHandler } = await import('../src/core/api.js');

/* Count how many times the registered teardown fired. */
let fired = 0;
registerAuthRevokedHandler(() => {
  fired += 1;
});

/* Controlled fetch: every request gets the canned response. */
function stubFetch(status, data) {
  globalThis.fetch = async () => ({
    ok: status < 400,
    status,
    text: async () => JSON.stringify(data),
  });
}

const CONFIG = { app: 'gr8r', url: 'http://test.local', signup: false, mail: false };
const REVOKED = { status: 401, error: 'Sign in to continue', code: 'signInRequired' };

test('boot guard: a 401 with no signed-in account does not invoke the teardown', async () => {
  stubFetch(200, CONFIG);
  await api.init();
  assert.equal(api.enabled, true, 'the server mode is on');

  stubFetch(401, REVOKED);
  await api.sessions(); // boot-time 401 — not-signed-in is not signed-out-elsewhere
  assert.equal(fired, 0, 'the teardown must stay silent at boot with no account');
});

test('arm: api.me() success sets the signed-in state', async () => {
  stubFetch(200, { user: { id: 'u1' } });
  await api.me();
  assert.ok(api.user, 'the account is signed in');
});

test('fire: a mid-session 401 signInRequired invokes the teardown exactly once', async () => {
  stubFetch(401, REVOKED);
  await api.sessions();
  assert.equal(fired, 1, 'the registered teardown fired on the revocation 401');
});

test('latch: an immediate second 401 does not invoke the teardown again', async () => {
  stubFetch(401, REVOKED);
  await api.sessions();
  await api.sessions();
  assert.equal(fired, 1, 'still exactly once — the latch absorbs the teardown\u2019s own logout 401 and concurrent 401s');
});

test('re-arm: a successful re-auth clears the latch', async () => {
  stubFetch(200, { user: { id: 'u1' } });
  await api.me();
  stubFetch(401, REVOKED);
  await api.sessions();
  assert.equal(fired, 2, 'the second revocation in the same tab is torn down honestly too');
});

test('D-44: the revoked second browser reaches the intercept via api.changePassword too', async () => {
  stubFetch(200, { user: { id: 'u1' } });
  await api.me(); // re-arm the latch with a fresh signed-in account
  stubFetch(401, REVOKED);
  const res = await api.changePassword('cur-pw', 'new-pw-1a');
  assert.equal(fired, 3, 'the teardown fired through the central intercept, not a local branch');
  assert.equal(res.ok, false, 'the change itself failed honestly');
  assert.equal(res.status, 401, 'the caller still sees the 401');
});

test('source pins: the wiring is where the contract says it lives', () => {
  const actions = fs.readFileSync(path.join(ROOT, 'src/actions/actions.js'), 'utf8');
  const apiSrc = fs.readFileSync(path.join(ROOT, 'src/core/api.js'), 'utf8');

  assert.match(
    actions,
    /registerAuthRevokedHandler\(signOutRevoked\)/,
    'actions.js registers signOutRevoked as the central teardown at module scope'
  );
  assert.match(
    apiSrc,
    /code\s*===\s*'signInRequired'/,
    'api.js gates the intercept on the mid-session signInRequired discriminator'
  );
  assert.match(
    apiSrc,
    /revokedHandled\s*=\s*false/,
    'api.js re-arms the latch inside applyUser when a user payload is applied'
  );

  /* D-44: A.savePassword adds NO local 401 branch — its whole block is free of
     a status-401 special case, so the second browser's teardown is entirely the
     central intercept (T-15-08, single teardown, no double toast). */
  const savePw = actions.slice(actions.indexOf('A.savePassword'), actions.indexOf('A.revokeSession'));
  assert.ok(savePw.includes('api.changePassword'), 'savePassword calls the real api.changePassword');
  assert.doesNotMatch(savePw, /status\s*===?\s*401/, 'no local 401 branch inside savePassword');
});
