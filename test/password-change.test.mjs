/* Password-change suite (phase 15 plan 01): real server, real SQLite.
   Covers PASS-01 (verify current password, rehash, login legs), PASS-02
   (two cookies: keep-current revocation inside one transaction), the D-38
   validation map, the D-35 cross-origin guard, and the D-40/D-41/D-42
   user-keyed throttle lockout. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { login, signup, startServer, withDb } from './helpers/server.mjs';

let server;
let tempDir;

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-pwchange-'));
  server = await startServer({ dataDir: tempDir });
});

after(async () => {
  await server?.stop();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    assert.equal(fs.existsSync(tempDir), false, 'temp data dir removed');
  }
});

const GOOD = 'correct-horse-9';
const NEW = 'newer-battery-42';

/* A fresh signup per group keeps the pwchange|user_id throttle keys isolated
   (D-40) without restarting the server. Signup itself is IP-throttled at
   5/hour, so the suite signs up at most four accounts. */
async function makeUser(name) {
  const s = await signup(server.base, { name, email: `${name}@test.local`, password: GOOD });
  assert.equal(s.status, 201, `signup of ${name} succeeded`);
  return s.client;
}

const patch = (c, body) => c.patch('/api/auth/password', body);

function storedHash(email) {
  return withDb(server.dbPath, db => db.prepare('select password_hash from users where email = ?').get(email)?.password_hash);
}

test('PASS-01: wrong current password → 403 wrongCurrentPassword, hash and sessions untouched', async () => {
  const a = await makeUser('wrongpw');
  const b = await login(server.base, 'wrongpw@test.local', GOOD);
  assert.equal(b.status, 200);

  const before = storedHash('wrongpw@test.local');
  const res = await patch(a, { currentPassword: 'not-it-123456', newPassword: NEW });
  assert.equal(res.status, 403);
  assert.equal(res.data.code, 'wrongCurrentPassword');

  assert.equal(storedHash('wrongpw@test.local'), before, 'the scrypt hash is byte-unchanged');

  // Both cookies still authenticate — a failed verify must revoke nothing.
  // (The auth-probe endpoint mirrors sessions.test.mjs: /api/auth/me is 200
  // with user:null for anonymous, so authorization is probed on a workspace.)
  assert.equal((await a.get('/api/auth/sessions')).status, 200);
  assert.equal((await b.client.get('/api/auth/sessions')).status, 200);
});

test('PASS-02: change with cookie A revokes cookie B; old password fails login, new one succeeds', async () => {
  const a = await makeUser('changer');
  const b = await login(server.base, 'changer@test.local', GOOD);
  assert.equal(b.status, 200);

  const res = await patch(a, { currentPassword: GOOD, newPassword: NEW });
  assert.equal(res.status, 200);
  // D-37: minimal success payload — { ok: true } only, no revokedCount.
  assert.deepEqual(res.data, { ok: true });

  // PASS-02: the other browser is dead on its next authenticated request…
  const bProbe = await b.client.get('/api/auth/sessions');
  assert.equal(bProbe.status, 401);
  assert.equal(bProbe.data.code, 'signInRequired', 'the code the central 401 intercept consumes (D-44)');
  // …while the changing session survives (keep-current SQL, Pitfall 9).
  assert.equal((await a.get('/api/auth/sessions')).status, 200);

  // PASS-01 login legs.
  const oldLogin = await login(server.base, 'changer@test.local', GOOD);
  assert.equal(oldLogin.status, 401, 'the old password no longer logs in');
  const newLogin = await login(server.base, 'changer@test.local', NEW);
  assert.equal(newLogin.status, 200, 'the new password logs in');
});

test('D-38 validation map: empty fields → passwordRequired, weak new → passwordTooWeak', async () => {
  const a = (await login(server.base, 'changer@test.local', NEW)).client;
  assert.ok(a.cookie(), 'changer re-authenticated');

  const emptyCur = await patch(a, { currentPassword: '', newPassword: NEW });
  assert.equal(emptyCur.status, 400);
  assert.equal(emptyCur.data.code, 'passwordRequired');

  const emptyNew = await patch(a, { currentPassword: NEW, newPassword: '' });
  assert.equal(emptyNew.status, 400);
  assert.equal(emptyNew.data.code, 'passwordRequired');

  const tooShort = await patch(a, { currentPassword: NEW, newPassword: 'short-9-x' });
  assert.equal(tooShort.status, 400);
  assert.equal(tooShort.data.code, 'passwordTooWeak');

  const noDigitOrSymbol = await patch(a, { currentPassword: NEW, newPassword: 'onlyletters' });
  assert.equal(noDigitOrSymbol.status, 400);
  assert.equal(noDigitOrSymbol.data.code, 'passwordTooWeak');
});

test('D-35: a cross-origin PATCH is rejected before any body processing', async () => {
  const a = (await login(server.base, 'changer@test.local', NEW)).client;
  assert.ok(a.cookie(), 'changer re-authenticated');

  const res = await fetch(`${server.base}/api/auth/password`, {
    method: 'PATCH',
    headers: {
      origin: 'http://evil.local',
      'content-type': 'application/json',
      cookie: a.cookie(),
    },
    body: JSON.stringify({ currentPassword: NEW, newPassword: NEW }),
  });
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.code, 'crossOriginRejected');
});

test('D-40/D-41/D-42: the 11th attempt inside the window locks out generically, per user', async () => {
  const victim = await makeUser('locked');
  const other = await makeUser('other');

  // Ten wrong-current-password attempts consume the whole D-40 budget…
  for (let i = 0; i < 10; i++) {
    const res = await patch(victim, { currentPassword: `wrong-${i}-x`, newPassword: NEW });
    assert.equal(res.status, 403, `attempt ${i + 1} is verified (not locked out yet)`);
    assert.equal(res.data.code, 'wrongCurrentPassword');
  }

  // …the 11th hits the generic lockout, with no Retry-After (D-42). Raw fetch
  // here because the harness client does not surface response headers.
  const locked = await fetch(`${server.base}/api/auth/password`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: victim.cookie() },
    body: JSON.stringify({ currentPassword: GOOD, newPassword: NEW }),
  });
  assert.equal(locked.status, 429);
  const lockedBody = await locked.json();
  assert.equal(lockedBody.code, 'tooManyAttempts');
  assert.equal(lockedBody.error, 'Too many attempts. Try again later.', 'generic English copy, no timing detail');
  assert.equal(locked.headers.get('retry-after'), null, 'no Retry-After header');

  // The budget is keyed pwchange|user_id (D-40): a second user is unaffected.
  const unaffected = await patch(other, { currentPassword: GOOD, newPassword: NEW });
  assert.equal(unaffected.status, 200);
  assert.deepEqual(unaffected.data, { ok: true });

  // PASS-01 recovery boundary after lockout: the other user's change stuck.
  assert.equal((await login(server.base, 'other@test.local', NEW)).status, 200);
});
