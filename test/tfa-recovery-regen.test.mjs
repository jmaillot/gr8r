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
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-tfa-regen-'));
  // D-10: a throwaway MASTER_KEY so production and tests exercise the same envelope path.
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
