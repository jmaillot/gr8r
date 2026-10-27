/* TFA enrollment suite (phase 16 plan 02): real server, real SQLite.
   Covers TFA-03 (enroll step-up D-49, pending secret memory-only D-46,
   verify-before-enable), TFA-04 (10 hashed recovery codes D-50/D-51/D-52,
   D-53 rotation), and the D-11 '2fa-verify' throttle. No mocks. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { totpAt } from '../totp.js';
import { login, signup, startServer, withDb } from './helpers/server.mjs';

let server;
let tempDir;

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-tfa-'));
  // D-10: a throwaway MASTER_KEY so production and tests exercise the same
  // encrypt path; the fail-closed no-key path is covered separately.
  server = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'gr8r-tfa-suite-key' } });
});

after(async () => {
  await server?.stop();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    assert.equal(fs.existsSync(tempDir), false, 'temp data dir removed');
  }
});

const GOOD = 'correct-horse-9';

/* At most five signups: signup itself is IP-throttled at 5/hour, so each
   group shares a user where state allows. The tfa-enroll|user_id and
   2fa-verify|ip|email throttle keys (D-11) stay isolated per user. */
async function makeUser(name) {
  const s = await signup(server.base, { name, email: `${name}@test.local`, password: GOOD });
  assert.equal(s.status, 201, `signup of ${name} succeeded`);
  return s.client;
}

const enroll = (c, body) => c.post('/api/auth/tfa/enroll', body);
const enable = (c, body) => c.post('/api/auth/tfa/enable', body);

function userRow(email) {
  return withDb(server.dbPath, db => db.prepare('select * from users where email = ?').get(email));
}

const recoveryRows = email =>
  withDb(server.dbPath, db =>
    db
      .prepare('select rc.* from recovery_codes rc join users u on u.id = rc.user_id where u.email = ?')
      .all(email),
  );

/* Live 6-digit code derived from the pending secret via the totp.js helpers. */
const liveCode = secret => totpAt(secret, Date.now() / 1000);

test('D-49 step-up + D-46: enroll returns the secret and server-built URI, nothing is persisted', async () => {
  const a = await makeUser('main');
  const res = await enroll(a, { currentPassword: GOOD });
  assert.equal(res.status, 200);
  assert.match(res.data.secret, /^[A-Z2-7]{32}$/, 'unpadded uppercase Base32 secret');
  assert.ok(res.data.otpauth.startsWith('otpauth://totp/Gr8r:main%40test.local?secret='), 'D-54 URI shape');
  for (const param of ['issuer=Gr8r', 'algorithm=SHA1', 'digits=6', 'period=30']) {
    assert.ok(res.data.otpauth.includes(param), `URI carries ${param}`);
  }

  const wrong = await enroll(a, { currentPassword: 'not-it-123456' });
  assert.equal(wrong.status, 403);
  assert.equal(wrong.data.code, 'wrongCurrentPassword');
  assert.equal(wrong.data.secret, undefined, 'no secret leaks on the wrong-password path');

  const row = userRow('main@test.local');
  assert.equal(row.two_fa_enabled, 0);
  assert.ok(!row.two_fa_secret, 'two_fa_secret is still empty (pending secret is memory-only)');
});

test('TFA-03/TFA-04: enable with a live code flips 2FA on and issues 10 hashed recovery codes', async () => {
  const a = await makeUser('enableme');
  const { secret, otpauth } = (await enroll(a, { currentPassword: GOOD })).data;
  assert.ok(secret && otpauth);

  const res = await enable(a, { code: liveCode(secret) });
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
  assert.equal(res.data.recoveryCodes.length, 10, 'D-50: exactly 10 codes');
  for (const code of res.data.recoveryCodes) {
    assert.match(code, /^[0-9a-f]{4}-[0-9a-f]{4}$/, 'D-51: lowercase hex xxxx-xxxx');
  }
  assert.equal(new Set(res.data.recoveryCodes).size, 10, 'codes are distinct');

  const row = userRow('enableme@test.local');
  assert.equal(row.two_fa_enabled, 1);
  assert.ok(row.two_fa_secret.startsWith('v1:'), 'D-05 AES-256-GCM envelope stored');
  assert.equal(typeof row.two_fa_last_step, 'number');
  assert.ok(row.two_fa_last_step > 0, 'the D-04 replay-guard baseline is the matched step');

  const rows = recoveryRows('enableme@test.local');
  assert.equal(rows.length, 10);
  for (const r of rows) {
    assert.match(r.code_hash, /^[0-9a-f]{64}$/, 'sha256 hex hash only — never plaintext or ciphertext');
    assert.equal(r.used_at, null);
  }
});

test('D-53 rotation: re-enroll + enable deletes the old 10 rows and issues a fresh set', async () => {
  const a = await makeUser('rotator');
  const first = (await enroll(a, { currentPassword: GOOD })).data;
  await enable(a, { code: liveCode(first.secret) });
  const oldRows = recoveryRows('rotator@test.local');
  assert.equal(oldRows.length, 10);

  const second = (await enroll(a, { currentPassword: GOOD })).data;
  // The next 30s window: the D-04 guard correctly rejects a same-step replay,
  // so the fresh enrollment verifies against the following step.
  const res = await enable(a, { code: totpAt(second.secret, Date.now() / 1000 + 30) });
  assert.equal(res.status, 200);
  const fresh = recoveryRows('rotator@test.local');
  assert.equal(fresh.length, 10, 'fresh set, not 20');
  const oldIds = new Set(oldRows.map(r => r.id));
  for (const r of fresh) assert.equal(oldIds.has(r.id), false, 'every old row was deleted');
});

test('TFA-03: enable with no pending enrollment → noPendingEnrollment, no state change', async () => {
  const a = await makeUser('nopending');
  const res = await enable(a, { code: '123456' });
  assert.equal(res.status, 409);
  assert.equal(res.data.code, 'noPendingEnrollment');
  assert.equal(userRow('nopending@test.local').two_fa_enabled, 0);
});

test('D-11/TFA-03: wrong codes are rejected (state untouched) and the 6th attempt locks out', async () => {
  const a = await makeUser('throttled');
  const { secret } = (await enroll(a, { currentPassword: GOOD })).data;
  assert.ok(secret);
  // Five wrong codes under budget return codeRejected with no state change…
  for (let i = 0; i < 5; i++) {
    const res = await enable(a, { code: '000000' });
    assert.equal(res.status, 400, `attempt ${i + 1} is verified (not locked out yet)`);
    assert.equal(res.data.code, 'codeRejected');
  }
  const row = userRow('throttled@test.local');
  assert.equal(row.two_fa_enabled, 0);
  assert.ok(!row.two_fa_secret);
  assert.equal(recoveryRows('throttled@test.local').length, 0);

  // …the 6th consumes the band limit and locks out generically.
  const locked = await fetch(`${server.base}/api/auth/tfa/enable`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: a.cookie() },
    body: JSON.stringify({ code: '000000' }),
  });
  assert.equal(locked.status, 429);
  const body = await locked.json();
  assert.equal(body.code, 'tooManyAttempts');
});
