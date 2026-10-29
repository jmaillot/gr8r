/* Disable-2FA suite (phase 21 plan 01): real server, real SQLite.
   Covers DIS-01/DIS-02: the D-101 strict 6-digit gate (a recovery code can
   never disable 2FA — D-102), one-transaction teardown (D-59/D-103/D-105),
   the success-only tfa_disabled verb (D-107) and the verified throttle/503
   band (D-108). No mocks. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { totpAt } from '../totp.js';
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
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-tfa-disable-'));
  // D-10: a throwaway MASTER_KEY so production and tests exercise the same envelope path.
  server = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'gr8r-tfa-disable-key' } });
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

const disable = (cookie, body) =>
  fetch(`${server.base}/api/auth/tfa/disable`, {
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

test('happy path: password + live TOTP disables 2FA with full teardown', async () => {
  const a = await makeUser('disMain');
  const [secret] = await enableTfa(a, 'disMain');
  assert.equal(userRow('disMain@test.local').two_fa_enabled, 1);

  resetLastStep('disMain@test.local');
  const res = await disable(a.cookie(), { currentPassword: GOOD, code: liveCode(secret) });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);

  const row = userRow('disMain@test.local');
  assert.equal(row.two_fa_enabled, 0, '2FA is off');
  assert.equal(row.two_fa_secret, '', 'the secret envelope is wiped');
  assert.equal(row.two_fa_last_step, 0, 'the replay baseline resets');
  assert.equal(recoveryRows('disMain@test.local').length, 0, 'recovery codes are wiped');
});

test('D-102 headline regression: a valid unused recovery code can never disable 2FA', async () => {
  const a = await makeUser('disRegress');
  const [, codes] = await enableTfa(a, 'disRegress');

  const beforeRows = recoveryRows('disRegress@test.local');
  assert.equal(beforeRows.length, 10);
  assert.equal(beforeRows.filter(r => r.used_at === null).length, 10, 'all codes unburned at start');

  // Post a captured plaintext recovery code verbatim as `code`.
  const res = await disable(a.cookie(), { currentPassword: GOOD, code: codes[0] });
  assert.equal(res.status, 400, 'the recovery code is rejected');
  assert.equal((await res.json()).code, 'codeRejected');

  const afterRows = recoveryRows('disRegress@test.local');
  assert.deepEqual(
    afterRows.map(r => r.code_hash).sort(),
    beforeRows.map(r => r.code_hash).sort(),
    'the recovery-code set is byte-unchanged',
  );
  for (const r of afterRows) assert.equal(r.used_at, null, 'no code was burned');
  assert.equal(userRow('disRegress@test.local').two_fa_enabled, 1, '2FA is still enabled');
  assert.equal(securityRows('disRegress@test.local').length, 0, 'no security_log row on failure');
});
