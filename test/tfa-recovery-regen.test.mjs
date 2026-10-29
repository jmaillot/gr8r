/* Recovery-code regeneration suite (phase 20 plan 01): real server, real SQLite.
   Covers REGEN-01 (password + live-TOTP step-up, D-85 structural gate),
   REGEN-02 (atomic burn-and-replace D-88/D-97), SC-4 (no-store), D-89
   (fail-closed 503) and the D-93/D-94 throttle. No mocks. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { totpAt, recoveryHash, normalizeRecoveryCode } from '../totp.js';
import { signup, startServer, withDb } from './helpers/server.mjs';

let server;
let tempDir;

/* Track each user's stored secret at enable time so tests can derive live codes. */
const enabledSecrets = new Map();

/* Reset the D-04 baseline (test-side DB access) so a current-window code verifies. */
function resetLastStep(email) {
  withDb(server.dbPath, db => db.prepare('update users set two_fa_last_step = 0 where email = ?').run(email));
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-tfa-regen-'));
  // D-10: a throwaway MASTER_KEY so production and tests exercise the same envelope path.
  server = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'projects-tfa-suite-key' } });
});

after(async () => {
  await server?.stop();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    assert.equal(fs.existsSync(tempDir), false, 'temp data dir removed');
  }
});

const GOOD = 'correct-horse-9';

/* Signup itself is IP-throttled at 5/hour — the suite stays within 5 signups
   per server; each test family uses its own user so throttle keys never bleed. */
async function makeUser(name) {
  const s = await signup(server.base, { name, email: `${name}@test.local`, password: GOOD });
  assert.equal(s.status, 201, `signup of ${name} succeeded`);
  return s.client;
}

function userRow(email) {
  return withDb(server.dbPath, db => db.prepare('select * from users where email = ?').get(email));
}

const recoveryRows = email =>
  withDb(server.dbPath, db => db.prepare('select rc.* from recovery_codes rc join users u on u.id = rc.user_id where u.email = ?').all(email));

const securityRows = email =>
  withDb(server.dbPath, db =>
    db.prepare('select sl.* from security_log sl join users u on u.id = sl.user_id where u.email = ? order by sl.created_at').all(email),
  );

const liveCode = secret => totpAt(secret, Date.now() / 1000);

const regen = (cookie, body) =>
  fetch(`${server.base}/api/auth/tfa/recovery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });

/* Enable 2FA for a user and return [secret, plaintext enable codes]. */
async function enableTfa(c, name) {
  const { secret } = (await c.post('/api/auth/tfa/enroll', { currentPassword: GOOD })).data;
  const res = await c.post('/api/auth/tfa/enable', { code: liveCode(secret) });
  assert.equal(res.status, 200, `2FA enabled for ${name}`);
  enabledSecrets.set(`${name}@test.local`, secret);
  return [secret, res.data.recoveryCodes];
}

test('REGEN-01/REGEN-02: password + live TOTP regenerates 10 hashed codes atomically', async () => {
  const a = await makeUser('regenmain');
  const [secret, oldCodes] = await enableTfa(a, 'regenmain');
  assert.equal(oldCodes.length, 10);

  resetLastStep('regenmain@test.local');
  const res = await regen(a.cookie(), { currentPassword: GOOD, code: liveCode(secret) });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store', 'SC-4: no-store on the plaintext-code response');
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.recoveryCodes.length, 10);
  for (const code of body.recoveryCodes) {
    assert.match(code, /^[0-9a-f]{4}-[0-9a-f]{4}$/, 'D-51: lowercase hex xxxx-xxxx');
  }
  assert.equal(new Set(body.recoveryCodes).size, 10, 'codes are distinct');

  const rows = recoveryRows('regenmain@test.local');
  assert.equal(rows.length, 10, 'exactly 10 rows — atomic replace, not append');
  const newHashes = new Set(rows.map(r => r.code_hash));
  const oldHashes = oldCodes.map(c => recoveryHash(normalizeRecoveryCode(c)));
  for (const oh of oldHashes) assert.equal(newHashes.has(oh), false, 'the old enable set is burned');
  for (const code of body.recoveryCodes) {
    assert.ok(newHashes.has(recoveryHash(normalizeRecoveryCode(code))), 'every new code is stored by its hash');
  }
  for (const r of rows) assert.equal(r.used_at, null, 'all new rows are unburned');

  const row = userRow('regenmain@test.local');
  assert.equal(row.two_fa_enabled, 1);
  assert.ok(row.two_fa_last_step > 0, 'D-87: the replay-guard baseline advanced');

  const logs = securityRows('regenmain@test.local');
  assert.equal(logs.length, 1, 'D-99: exactly one security_log row');
  assert.equal(logs[0].verb, 'tfa_recovery_regenerated');
});

test('D-85 headline regression: a recovery code can never satisfy the step-up', async () => {
  const a = await makeUser('regenRegress');
  const [, oldCodes] = await enableTfa(a, 'regenRegress');

  const before = recoveryRows('regenRegress@test.local');
  assert.equal(before.length, 10);

  // Post a captured plaintext recovery code verbatim as `code`.
  const res = await regen(a.cookie(), { currentPassword: GOOD, code: oldCodes[0] });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'codeRejected');

  const after = recoveryRows('regenRegress@test.local');
  assert.deepEqual(
    after.map(r => r.code_hash).sort(),
    before.map(r => r.code_hash).sort(),
    'the code set is byte-unchanged',
  );
  for (const r of after) assert.equal(r.used_at, null, 'no code was burned');

  // SC-4 kept explicit on a second success path (this user's tfa-regen budget
  // has 4 tries left): a correct regen still answers 200 + no-store.
  resetLastStep('regenRegress@test.local');
  const ok = await regen(a.cookie(), { currentPassword: GOOD, code: liveCode(enabledSecrets.get('regenRegress@test.local')) });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'no-store', 'SC-4/D-100: no-store survives route refactors');
  const okBody = await ok.json();
  assert.equal(okBody.ok, true);
  assert.equal(okBody.recoveryCodes.length, 10);
  assert.equal(securityRows('regenRegress@test.local').length, 1, 'success-only logging: still exactly one row');
});

test('D-95: a 2FA-disabled user gets 409 tfaNotEnabled before any factor check', async () => {
  const a = await makeUser('regenNoTfa');
  const res = await regen(a.cookie(), { currentPassword: GOOD, code: '123456' });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, 'tfaNotEnabled');
  assert.equal(recoveryRows('regenNoTfa@test.local').length, 0, 'zero mutation');
  assert.equal(securityRows('regenNoTfa@test.local').length, 0, 'no security_log row on failure');
});

test('D-93/D-94: wrong passwords burn tries and the 6th attempt locks out', async () => {
  const a = await makeUser('regenWrongPw');
  const [secret] = await enableTfa(a, 'regenWrongPw');
  const before = recoveryRows('regenWrongPw@test.local');

  // Five wrong-password attempts stay inside the 5-attempt band; every one
  // burns a try (D-94) and leaves the code set untouched.
  for (let i = 0; i < 5; i++) {
    const res = await regen(a.cookie(), { currentPassword: `wrong-${i}-x`, code: liveCode(secret) });
    assert.equal(res.status, 403, `attempt ${i + 1} is verified (not locked out yet)`);
    assert.equal((await res.json()).code, 'wrongCurrentPassword');
  }
  const mid = recoveryRows('regenWrongPw@test.local');
  assert.deepEqual(mid.map(r => r.code_hash).sort(), before.map(r => r.code_hash).sort(), 'code set unchanged by failures');

  // The 6th tfa-regen attempt hits the generic lockout — a budget independent
  // of the enroll/disable budgets (D-93).
  const locked = await regen(a.cookie(), { currentPassword: GOOD, code: liveCode(secret) });
  assert.equal(locked.status, 429);
  assert.equal((await locked.json()).code, 'tooManyAttempts');

  // The failed attempts never touched state: no burned codes, no log row.
  assert.equal(securityRows('regenWrongPw@test.local').length, 0);
});

test('a stale-window code is rejected (±1 window) and the 503 path fails closed', async () => {
  const a = await makeUser('regenWindow');
  const [secret] = await enableTfa(a, 'regenWindow');

  // A code from a window an hour ahead cannot verify (±1 window), even with a
  // fresh baseline.
  resetLastStep('regenWindow@test.local');
  const stale = await regen(a.cookie(), { currentPassword: GOOD, code: totpAt(secret, Date.now() / 1000 + 3600) });
  assert.equal(stale.status, 400);
  assert.equal((await stale.json()).code, 'codeRejected');
  const before = recoveryRows('regenWindow@test.local');
  const stepBefore = userRow('regenWindow@test.local').two_fa_last_step;
  assert.equal(before.length, 10, 'code set untouched by the rejected attempt');

  // T-20-05/D-89: corrupt the stored envelope → requireTotpSecret fails →
  // fail-closed 503 BEFORE any mutation (no usable-MASTER_KEY boot needed —
  // the corrupted envelope exercises the identical decrypt-failure branch).
  withDb(server.dbPath, db =>
    db
      .prepare(
        "update users set two_fa_secret = 'v1:AAAAAAAAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBBBBBBBB:CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' where email = ?",
      )
      .run('regenWindow@test.local'),
  );
  const res = await regen(a.cookie(), { currentPassword: GOOD, code: liveCode(secret) });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, 'masterKeyMissing');

  const afterRows = recoveryRows('regenWindow@test.local');
  assert.deepEqual(afterRows.map(r => r.code_hash).sort(), before.map(r => r.code_hash).sort(), 'zero mutation to recovery_codes');
  assert.equal(userRow('regenWindow@test.local').two_fa_last_step, stepBefore, 'zero mutation to two_fa_last_step');
  assert.equal(securityRows('regenWindow@test.local').length, 0, 'no security_log row on failure');
});
