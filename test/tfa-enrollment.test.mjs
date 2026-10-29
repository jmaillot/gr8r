/* TFA enrollment suite (phase 16 plan 02): real server, real SQLite.
   Covers TFA-03 (enroll step-up D-49, pending secret memory-only D-46,
   verify-before-enable), TFA-04 (10 hashed recovery codes D-50/D-51/D-52,
   D-53 rotation), and the D-11 '2fa-verify' throttle. No mocks. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { totpAt, recoveryHash } from '../totp.js';
import { login, loginTfa, signup, startServer, withDb } from './helpers/server.mjs';

let server;
let tempDir;
/* Plaintext recovery codes from the enable response (D-53: shown exactly once) —
   the disable tests reuse the captured set. */
let enablemeCodes = [];

/* TFA-05: 2FA-enabled accounts no longer get a session from the password alone.
   Track each user's stored secret at enable time so tests can complete the
   second step via loginTfa. */
const enabledSecrets = new Map();

/* Deterministic 2FA sign-in: reset the D-04 baseline (test-side DB access) so
   a current-window code verifies, then complete the login challenge. */
async function signIn2fa(email) {
  withDb(server.dbPath, db => db.prepare('update users set two_fa_last_step = 0 where email = ?').run(email));
  const secret = enabledSecrets.get(email);
  assert.ok(secret, `a tracked 2FA secret for ${email}`);
  const a = await loginTfa(server.base, email, GOOD, totpAt(secret, Date.now() / 1000));
  assert.equal(a.status, 200, `2FA sign-in of ${email} completed`);
  return a;
}

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
  withDb(server.dbPath, db => db.prepare('select rc.* from recovery_codes rc join users u on u.id = rc.user_id where u.email = ?').all(email));

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
  enablemeCodes = res.data.recoveryCodes;
  enabledSecrets.set('enableme@test.local', secret);
  assert.equal(enablemeCodes.length, 10, 'D-50: exactly 10 codes');
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
  enabledSecrets.set('rotator@test.local', second.secret);
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

/* ---------------------------- D-57/D-59 disable ---------------------------- */

const disable = (c, body) => c.post('/api/auth/tfa/disable', body);

test('D-57: disable with the wrong current password → 403, 2FA stays on', async () => {
  const a = await signIn2fa('rotator@test.local');

  const res = await disable(a.client, { currentPassword: 'not-it-123456', code: '123456' });
  assert.equal(res.status, 403);
  assert.equal(res.data.code, 'wrongCurrentPassword');
  assert.equal(userRow('rotator@test.local').two_fa_enabled, 1, 'no state change');
});

test('D-57: valid password but no valid code → codeRejected, 2FA stays on', async () => {
  const a = await signIn2fa('rotator@test.local');
  const badLive = await disable(a.client, { currentPassword: GOOD, code: '000000' });
  assert.equal(badLive.status, 400);
  assert.equal(badLive.data.code, 'codeRejected');
  const badRecovery = await disable(a.client, { currentPassword: GOOD, code: 'deadbeef' });
  assert.equal(badRecovery.status, 400);
  assert.equal(badRecovery.data.code, 'codeRejected');
  assert.equal(userRow('rotator@test.local').two_fa_enabled, 1);
});

test('D-59: disable with a live code tears everything down in one transaction', async () => {
  const a = await signIn2fa('rotator@test.local');
  // The rotation test verified a future-window code, so the D-04 baseline sits
  // one step ahead; reset it (as a later real-world window would) so this
  // test's fresh enrollment can verify on the current step.
  withDb(server.dbPath, db => db.prepare('update users set two_fa_last_step = 0 where email = ?').run('rotator@test.local'));
  // Re-enroll: the test needs the pending secret to derive live codes. Enable
  // consumes the current step; the disable code comes from the NEXT window,
  // which the D-04 guard correctly permits (> matchedStep) and ±1 covers.
  const { secret } = (await enroll(a.client, { currentPassword: GOOD })).data;
  const enabled = await enable(a.client, { code: liveCode(secret) });
  assert.equal(enabled.status, 200);
  assert.equal(recoveryRows('rotator@test.local').length, 10);

  const ok = await disable(a.client, { currentPassword: GOOD, code: totpAt(secret, Date.now() / 1000 + 30) });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.data, { ok: true });
  const row = userRow('rotator@test.local');
  assert.equal(row.two_fa_enabled, 0);
  assert.equal(row.two_fa_secret, '', 'the ciphertext is cleared');
  assert.equal(row.two_fa_last_step, 0, 'the D-04 baseline resets to the no-baseline sentinel');
  assert.equal(recoveryRows('rotator@test.local').length, 0, 'zero recovery rows after teardown');

  // A fresh enroll afterwards is indistinguishable from a first one.
  const again = (await enroll(a.client, { currentPassword: GOOD })).data;
  assert.match(again.secret, /^[A-Z2-7]{32}$/);
});

test('D-101/D-102 (supersedes D-57): a printed recovery code can never disable 2FA', async () => {
  const a = await signIn2fa('enableme@test.local');
  const printed = enablemeCodes[0];
  assert.ok(printed, 'the enable response codes were captured');

  // Phase 21 (D-101) removed the D-57 recovery shape: ANY non-6-digit code —
  // including this printed code in any normalization (Pitfall 6) — is
  // rejected by the strict gate before any recovery_codes access.
  const ok = await disable(a.client, { currentPassword: GOOD, code: printed.toUpperCase() });
  assert.equal(ok.status, 400);
  assert.equal(ok.data.code, 'codeRejected');
  const row = userRow('enableme@test.local');
  assert.equal(row.two_fa_enabled, 1, '2FA is still enabled');
  assert.equal(recoveryRows('enableme@test.local').length, 10, 'no code was burned or deleted');
});

test('D-57/T-16-14: an already-burned recovery code is rejected', async () => {
  // nopending still has 2FA OFF here — a plain password login mints the session.
  const a = await login(server.base, 'nopending@test.local', GOOD);
  assert.equal(a.status, 200);
  // Enable first (fresh 2fa-verify budget), then simulate a burn the way the
  // Phase 17 login path will: used_at set on the matched hash.
  const { secret } = (await enroll(a.client, { currentPassword: GOOD })).data;
  const enabled = await enable(a.client, { code: totpAt(secret, Date.now() / 1000 + 30) });
  assert.equal(enabled.status, 200);
  enabledSecrets.set('nopending@test.local', secret);

  const KNOWN = 'a3f19b02';
  withDb(server.dbPath, db =>
    db
      .prepare('insert into recovery_codes (id, user_id, code_hash, used_at, created_at) values (?, (select id from users where email = ?), ?, ?, ?)')
      .run('rc-burned-fixture', 'nopending@test.local', recoveryHash(KNOWN), Date.now(), Date.now()),
  );

  const res = await disable(a.client, { currentPassword: GOOD, code: 'A3F1-9B02' });
  assert.equal(res.status, 400, 'a burned row matches the hash but is not eligible');
  assert.equal(res.data.code, 'codeRejected');
  assert.equal(userRow('nopending@test.local').two_fa_enabled, 1, '2FA still on');
});

test('T-16-14: the disable throttle is a distinct budget — the 6th attempt locks out', async () => {
  const a = await signIn2fa('nopending@test.local');
  // Four more wrong-password attempts stay inside the 5-attempt band…
  for (let i = 0; i < 4; i++) {
    const res = await disable(a.client, { currentPassword: `wrong-${i}-x`, code: '123456' });
    assert.equal(res.status, 403, `attempt ${i + 1} is verified (not locked out yet)`);
  }
  // …the 6th tfa-disable attempt hits the generic lockout.
  const locked = await fetch(`${server.base}/api/auth/tfa/disable`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: a.client.cookie() },
    body: JSON.stringify({ currentPassword: GOOD, code: '123456' }),
  });
  assert.equal(locked.status, 429);
  assert.equal((await locked.json()).code, 'tooManyAttempts');
});

/* T-16-09/D-06: the enable path fails closed when MASTER_KEY is absent — a
   dedicated server without the key exercises the identical production path. */
test('D-06: enable without MASTER_KEY → fail-closed 503 naming MASTER_KEY, no state change', async () => {
  const noKeyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-tfa-nokey-'));
  const noKeyServer = await startServer({ dataDir: noKeyDir }); // no MASTER_KEY env
  try {
    const s = await signup(noKeyServer.base, { name: 'nokey', email: 'nokey@test.local', password: GOOD });
    assert.equal(s.status, 201);
    const enrolled = await s.client.post('/api/auth/tfa/enroll', { currentPassword: GOOD });
    assert.equal(enrolled.status, 200, 'enroll itself does not need the key (memory-only secret)');

    const res = await s.client.post('/api/auth/tfa/enable', { code: liveCode(enrolled.data.secret) });
    assert.equal(res.status, 503);
    assert.equal(res.data.code, 'masterKeyMissing');
    assert.ok(/MASTER_KEY/.test(res.data.error || ''), 'the admin-facing body names MASTER_KEY');

    const db = new (await import('node:sqlite')).DatabaseSync(noKeyServer.dbPath);
    try {
      const row = db.prepare('select two_fa_enabled, two_fa_secret from users where email = ?').get('nokey@test.local');
      assert.equal(row.two_fa_enabled, 0, 'no state mutation happened');
      assert.ok(!row.two_fa_secret);
    } finally {
      db.close();
    }
  } finally {
    await noKeyServer.stop();
    fs.rmSync(noKeyDir, { recursive: true, force: true });
  }
});
