/* Disable-2FA suite (phase 21 plan 01): real server, real SQLite.
   Covers DIS-01/DIS-02: the D-101 strict 6-digit gate (a recovery code can
   never disable 2FA — D-102), one-transaction teardown (D-59/D-103/D-105),
   the success-only tfa_disabled verb (D-107) and the verified throttle/503
   band (D-108). No mocks. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { totpAt } from '../totp.js';
import { login, signup, startServer, withDb } from './helpers/server.mjs';

let server;
let tempDir;
/* Second instance: signup is IP-throttled 5/hour and the suite needs more
   than 5 users, so the remaining families live on their own server. */
let server2;
let tempDir2;

/* Track each user's stored secret at enable time so tests can derive live codes. */
const enabledSecrets = new Map();

/* Reset the D-04 baseline (test-side DB access) so a current-window code verifies. */
function resetLastStep(email, srv = server) {
  withDb(srv.dbPath, db => db.prepare('update users set two_fa_last_step = 0 where email = ?').run(email));
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-tfa-disable-'));
  // D-10: a throwaway MASTER_KEY so production and tests exercise the same envelope path.
  server = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'gr8r-tfa-disable-key' } });
  tempDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-tfa-disable2-'));
  server2 = await startServer({ dataDir: tempDir2, env: { MASTER_KEY: 'gr8r-tfa-disable-key-2' } });
});

after(async () => {
  await server?.stop();
  await server2?.stop();
  for (const dir of [tempDir, tempDir2]) {
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
      assert.equal(fs.existsSync(dir), false, 'temp data dir removed');
    }
  }
});

const GOOD = 'correct-horse-9';

/* Signup itself is IP-throttled at 5/hour — the suite stays within 5 signups
   per server (a second instance hosts the later families); each test family
   uses its own user so throttle keys never bleed. */
async function makeUser(name, srv = server) {
  const s = await signup(srv.base, { name, email: `${name}@test.local`, password: GOOD });
  assert.equal(s.status, 201, `signup of ${name} succeeded`);
  return s.client;
}

function userRow(email, srv = server) {
  return withDb(srv.dbPath, db => db.prepare('select * from users where email = ?').get(email));
}

const recoveryRows = (email, srv = server) =>
  withDb(srv.dbPath, db => db.prepare('select rc.* from recovery_codes rc join users u on u.id = rc.user_id where u.email = ?').all(email));

const challengeRows = (email, srv = server) =>
  withDb(srv.dbPath, db => db.prepare('select lc.* from login_challenges lc join users u on u.id = lc.user_id where u.email = ?').all(email));

const securityRows = (email, srv = server) =>
  withDb(srv.dbPath, db =>
    db.prepare('select sl.* from security_log sl join users u on u.id = sl.user_id where u.email = ? order by sl.created_at').all(email),
  );

const liveCode = secret => totpAt(secret, Date.now() / 1000);

const disable = (cookie, body, srv = server) =>
  fetch(`${srv.base}/api/auth/tfa/disable`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });

/* Raw pending-2FA login step with an explicit challenge cookie (D-104 proof). */
const challengeLogin = (srv, cookie, body) =>
  fetch(`${srv.base}/api/auth/tfa/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });

/* Mint a pending login_challenges row exactly like the server's own insert
   (server.js:1501–1505 shape) and return its plaintext token. */
function mintChallenge(srv, email) {
  const token = createHash('sha256')
    .update(email + Date.now() + Math.random())
    .digest('hex');
  const userId = userRow(email, srv).id;
  withDb(srv.dbPath, db =>
    db.prepare('insert into login_challenges (challenge_token_hash, user_id, expires_at, attempts) values (?,?,?,0)').run(
      createHash('sha256').update(token).digest('hex'),
      userId,
      Date.now() + 5 * 60 * 1000,
    ),
  );
  return token;
}

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

test('D-103/D-104: disable tears down the pending login challenge — the token can no longer complete login', async () => {
  const a = await makeUser('disChallenge');
  const [secret] = await enableTfa(a, 'disChallenge');
  const token = mintChallenge(server, 'disChallenge@test.local');
  assert.equal(challengeRows('disChallenge@test.local').length, 1, 'challenge minted');

  resetLastStep('disChallenge@test.local');
  const res = await disable(a.cookie(), { currentPassword: GOOD, code: liveCode(secret) });
  assert.equal(res.status, 200);

  assert.equal(challengeRows('disChallenge@test.local').length, 0, 'D-103: the pending challenge row is gone');
  // D-104: the ghost token is dead — a user with two_fa_enabled = 0 kills the
  // challenge and answers 401 challengeExpired (server.js:1772, 1798–1800).
  const dead = await challengeLogin(server, `gr8r_tfa_challenge=${token}`, { code: '123456' });
  assert.equal(dead.status, 401);
  assert.equal((await dead.json()).code, 'challengeExpired');
});

test('D-105: disable revokes every other session and keeps the caller signed in', async () => {
  const a = await makeUser('disSessions');
  const [secret] = await enableTfa(a, 'disSessions');

  // Mint a second session for the same account: full pending-2FA login.
  const second = await login(server.base, 'disSessions@test.local', GOOD);
  assert.equal(second.data?.pending2fa, true, 'the second login is a pending 2FA challenge');
  resetLastStep('disSessions@test.local');
  const done = await second.client.post('/api/auth/tfa/login', { code: liveCode(enabledSecrets.get('disSessions@test.local')) });
  assert.equal(done.status, 200, 'the second session completes the 2FA login');
  const me = await second.client.get('/api/auth/me');
  assert.equal(me.status, 200, 'the second session is live before disable');

  resetLastStep('disSessions@test.local');
  const res = await disable(a.cookie(), { currentPassword: GOOD, code: liveCode(secret) });
  assert.equal(res.status, 200);

  const meA = await a.get('/api/auth/sessions');
  assert.equal(meA.status, 200, 'D-105: the caller keeps its session');
  const meB = await second.client.get('/api/auth/sessions');
  assert.equal(meB.status, 401, 'D-105: every other session is revoked');
});

test('Pitfall 5: a different user\'s pending challenge survives another user\'s disable', async () => {
  const a = await makeUser('disCrossA', server2);
  const b = await makeUser('disCrossB', server2);
  const [secret] = await enableTfa(a, 'disCrossA', server2);
  const [bSecret] = await enableTfa(b, 'disCrossB', server2);
  const bToken = mintChallenge(server2, 'disCrossB@test.local');
  assert.equal(challengeRows('disCrossB@test.local', server2).length, 1, 'B has a pending challenge');

  resetLastStep('disCrossA@test.local', server2);
  const res = await disable(a.cookie(), { currentPassword: GOOD, code: liveCode(secret) }, server2);
  assert.equal(res.status, 200);

  const bRows = challengeRows('disCrossB@test.local', server2);
  assert.equal(bRows.length, 1, 'Pitfall 5: B\'s challenge is untouched by A\'s disable');
  // B's own challenge still completes a real 2FA login — the delete is
  // user-scoped, never unscoped.
  resetLastStep('disCrossB@test.local', server2);
  const bLogin = await challengeLogin(server2, `gr8r_tfa_challenge=${bToken}`, { code: liveCode(bSecret) });
  assert.equal(bLogin.status, 200, 'B\'s challenge is alive and still completes the sign-in');
});

test('D-107: exactly one tfa_disabled row on success and zero rows on the wrong-password path', async () => {
  const a = await makeUser('disVerb', server2);
  const [secret] = await enableTfa(a, 'disVerb', server2);

  const wrong = await disable(a.cookie(), { currentPassword: 'not-my-password-1', code: liveCode(secret) }, server2);
  assert.equal(wrong.status, 403);
  assert.equal((await wrong.json()).code, 'wrongCurrentPassword');
  assert.equal(securityRows('disVerb@test.local', server2).length, 0, 'success-only logging: zero rows on failure');

  resetLastStep('disVerb@test.local', server2);
  const ok = await disable(a.cookie(), { currentPassword: GOOD, code: liveCode(secret) }, server2);
  assert.equal(ok.status, 200);
  const logs = securityRows('disVerb@test.local', server2);
  assert.equal(logs.length, 1, 'exactly one security_log row');
  assert.equal(logs[0].verb, 'tfa_disabled');
});

test('D-108: wrong passwords consume tries and the 6th disable attempt locks out (429)', async () => {
  const a = await makeUser('disThrottle', server2);
  const [secret] = await enableTfa(a, 'disThrottle', server2);

  for (let i = 0; i < 5; i++) {
    const res = await disable(a.cookie(), { currentPassword: `wrong-${i}-x`, code: liveCode(secret) }, server2);
    assert.equal(res.status, 403, `attempt ${i + 1} is verified (not locked out yet)`);
    assert.equal((await res.json()).code, 'wrongCurrentPassword');
  }
  const locked = await disable(a.cookie(), { currentPassword: GOOD, code: liveCode(secret) }, server2);
  assert.equal(locked.status, 429);
  assert.equal((await locked.json()).code, 'tooManyAttempts');
  assert.equal(userRow('disThrottle@test.local', server2).two_fa_enabled, 1, '2FA is still enabled — nothing got through');
  assert.equal(securityRows('disThrottle@test.local', server2).length, 0, 'no security_log row on any failure');
});

test('D-108/T-21-06: a corrupted secret envelope fails closed 503 masterKeyMissing with zero mutation', async () => {
  const a = await makeUser('disCorrupt', server2);
  const [secret] = await enableTfa(a, 'disCorrupt', server2);

  withDb(server2.dbPath, db =>
    db
      .prepare(
        "update users set two_fa_secret = 'v1:AAAAAAAAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBBBBBBBB:CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC' where email = ?",
      )
      .run('disCorrupt@test.local'),
  );
  resetLastStep('disCorrupt@test.local', server2);
  const res = await disable(a.cookie(), { currentPassword: GOOD, code: liveCode(secret) }, server2);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, 'masterKeyMissing');

  const row = userRow('disCorrupt@test.local', server2);
  assert.equal(row.two_fa_enabled, 1, 'zero mutation: 2FA is still enabled');
  assert.equal(recoveryRows('disCorrupt@test.local', server2).length, 10, 'zero mutation: recovery codes intact');
  assert.equal(securityRows('disCorrupt@test.local', server2).length, 0, 'no security_log row on failure');
});
