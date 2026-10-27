/* TFA login second-factor suite (phase 17 plan 01, TFA-05): real server, real SQLite.
   Covers D-68 (inert pending challenge), D-69 (dedicated verify route), D-04
   (replay guard), D-65 (one generic error code), D-66 (challenge death), D-03
   (budget carry-over), D-71 (401 matrix), D-13 (generic lockout copy). No mocks.
   Two servers: signup is IP-throttled at 5/hour, so suites needing more than
   five accounts split across two processes (each with its own throttle map). */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { totpAt } from '../totp.js';
import { signup, startServer, withDb } from './helpers/server.mjs';

const GOOD = 'correct-horse-9';
let A; // main suite server
let B; // second server for accounts beyond A's 5-signup IP budget
let dirA;
let dirB;

before(async () => {
  dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-tfa-login-a-'));
  A = await startServer({ dataDir: dirA, env: { MASTER_KEY: 'gr8r-tfa-suite-key' } });
  dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-tfa-login-b-'));
  B = await startServer({ dataDir: dirB, env: { MASTER_KEY: 'gr8r-tfa-suite-key' } });
});

after(async () => {
  await A?.stop();
  await B?.stop();
  for (const dir of [dirA, dirB]) {
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
      assert.equal(fs.existsSync(dir), false, 'temp data dir removed');
    }
  }
});

/* ------------------------------ HTTP helpers ------------------------------ */

async function raw(base, method, pathname, body, cookie, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(base + pathname, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, data, cookies: res.headers.getSetCookie?.() || [] };
}

const challengeCookieOf = cookies => cookies.find(c => c.startsWith('gr8r_tfa_challenge='))?.split(';')[0] || null;
const hasSessionCookie = cookies => cookies.some(c => c.startsWith('gr8r_session='));

/* Correct-password login on a 2FA-enabled account → the held challenge cookie. */
async function pending(base, email, password = GOOD) {
  const res = await raw(base, 'POST', '/api/auth/login', { email, password });
  assert.equal(res.status, 200, 'login yielded a pending challenge');
  const challenge = challengeCookieOf(res.cookies);
  assert.ok(challenge, 'pending response set the challenge cookie');
  return challenge;
}

/* Enroll + enable 2FA (Phase 16 helpers); returns the secret and any plaintext
   recovery codes from the one-time enable response (D-53). Signup is memoized:
   signup is IP-throttled at 5/hour, so a user is created exactly once. */
const accounts = new Map();
async function setupTfa(base, name) {
  if (!accounts.has(name)) {
    const s = await signup(base, { name, email: `${name}@test.local`, password: GOOD });
    assert.equal(s.status, 201, `signup of ${name} succeeded`);
    const { secret } = (await s.client.post('/api/auth/tfa/enroll', { currentPassword: GOOD })).data;
    const enabled = await s.client.post('/api/auth/tfa/enable', { code: totpAt(secret, Date.now() / 1000) });
    assert.equal(enabled.status, 200, `2FA enabled for ${name}`);
    accounts.set(name, { secret, recoveryCodes: enabled.data.recoveryCodes || [] });
  }
  return accounts.get(name);
}

const userId = (srv, email) => withDb(srv.dbPath, db => db.prepare('select id from users where email = ?').get(email).id);

/* Live code one window ahead: robust against the enable-time D-04 baseline. */
const liveCode = secret => totpAt(secret, Date.now() / 1000 + 30);

/* ------------------- TFA-05-1: the pending shape (D-68) ------------------- */

test('D-68: correct password on an enrolled account returns an inert pending challenge', async () => {
  const EMAIL = 'shape@test.local';
  await setupTfa(A.base, 'shape');

  const res = await raw(A.base, 'POST', '/api/auth/login', { email: EMAIL, password: GOOD });
  assert.equal(res.status, 200);
  assert.equal(res.data.pending2fa, true, 'pending2fa flag set');
  assert.equal(res.data.maskedEmail, 's***@t***', 'D-62/D-63: first-char masking, nothing TLD-preserving');
  assert.equal('user' in res.data, false, 'no user payload leaks in the pending body');

  const cookieLine = res.cookies.find(c => c.startsWith('gr8r_tfa_challenge='));
  assert.ok(cookieLine, 'challenge cookie set');
  assert.match(cookieLine, /Max-Age=300/, 'challenge Max-Age is ~5 minutes, never SESSION_DAYS');
  assert.equal(cookieLine.includes('HttpOnly'), true, 'challenge cookie is HttpOnly');
  assert.equal(hasSessionCookie(res.cookies), false, 'no session cookie on the pending response');

  const row = withDb(A.dbPath, db => db.prepare('select lc.* from login_challenges lc join users u on u.id = lc.user_id where u.email = ?').get(EMAIL));
  assert.ok(row, 'a login_challenges row exists');
  assert.equal(row.attempts, 0);
  const ttl = row.expires_at - Date.now();
  assert.ok(ttl > 295_000 && ttl <= 300_000, `expires_at is ~5 minutes out (got ${ttl}ms)`);
});

/* ---------------- TFA-05-2/3: verify route + replay (D-69/D-04) ---------------- */

test('D-69: a live TOTP code on /api/auth/tfa/login mints the session and deletes the challenge', async () => {
  const EMAIL = 'totp@test.local';
  const { secret } = await setupTfa(A.base, 'totp');
  const id = userId(A, EMAIL);

  const sessionsBefore = withDb(A.dbPath, db => db.prepare('select count(*) as c from sessions where user_id = ?').get(id).c);
  const challenge = await pending(A.base, EMAIL);
  const res = await raw(A.base, 'POST', '/api/auth/tfa/login', { code: liveCode(secret) }, challenge);
  assert.equal(res.status, 200, 'verify succeeded');
  assert.equal(res.data.user?.email, EMAIL, 'the real user payload is returned');
  assert.equal('recoveryRemaining' in res.data, false, 'the TOTP path omits the recovery count');
  assert.ok(hasSessionCookie(res.cookies), 'a real session cookie is set');

  const dbState = withDb(A.dbPath, db => ({
    challenges: db.prepare('select count(*) as c from login_challenges where user_id = ?').get(id).c,
    sessions: db.prepare('select count(*) as c from sessions where user_id = ?').get(id).c,
    lastStep: db.prepare('select two_fa_last_step from users where id = ?').get(id).two_fa_last_step,
  }));
  assert.equal(dbState.challenges, 0, 'the challenge row is deleted on success');
  assert.equal(dbState.sessions, sessionsBefore + 1, 'a live sessions row was minted');
  assert.ok(dbState.lastStep > 0, 'the D-04 matched step was persisted');
});

test('D-04: replaying the same code on a fresh challenge is rejected with the generic error', async () => {
  const EMAIL = 'replay@test.local';
  const { secret } = await setupTfa(B.base, 'replay'); // fresh enrollment: baseline is enable-time

  const code = liveCode(secret);
  const first = await pending(B.base, EMAIL);
  const ok = await raw(B.base, 'POST', '/api/auth/tfa/login', { code }, first);
  assert.equal(ok.status, 200, 'first use succeeds');

  const challenge = await pending(B.base, EMAIL);
  const replay = await raw(B.base, 'POST', '/api/auth/tfa/login', { code }, challenge);
  assert.equal(replay.status, 400);
  assert.equal(replay.data.code, 'invalidTfaCode', 'D-65: the one generic code');
  assert.ok(!hasSessionCookie(replay.cookies), 'no session minted on replay');
});

test('D-65: a wrong code and an empty code both return invalidTfaCode; empty consumes nothing', async () => {
  const EMAIL = 'totp@test.local';
  await setupTfa(A.base, 'totp'); // fresh enrollment; the code shape is all that matters here

  const challenge = await pending(A.base, EMAIL);
  const wrong = await raw(A.base, 'POST', '/api/auth/tfa/login', { code: '000000' }, challenge);
  assert.equal(wrong.status, 400);
  assert.equal(wrong.data.code, 'invalidTfaCode');

  const id = userId(A, EMAIL);
  const beforeEmpty = withDb(A.dbPath, db => db.prepare('select * from login_challenges where user_id = ?').get(id));
  assert.ok(beforeEmpty, 'challenge still alive after a wrong code');

  const empty = await raw(A.base, 'POST', '/api/auth/tfa/login', { code: '   ' }, challenge);
  assert.equal(empty.status, 400);
  assert.equal(empty.data.code, 'invalidTfaCode');
  const afterEmpty = withDb(A.dbPath, db => db.prepare('select * from login_challenges where user_id = ?').get(id));
  assert.ok(afterEmpty, 'the challenge survives an empty submission');
  assert.equal(afterEmpty.attempts, beforeEmpty.attempts, 'an empty code consumes no attempt');
});

/* --------- TFA-05-4: recovery burn-once + challenge death (D-64/D-66/D-72) --------- */

test('D-72: a recovery code authenticates exactly once and reports the remaining count', async () => {
  const EMAIL = 'recovery@test.local';
  const { recoveryCodes } = await setupTfa(A.base, 'recovery');
  assert.equal(recoveryCodes.length, 10);
  const id = userId(A, EMAIL);

  const challenge = await pending(A.base, EMAIL);
  const res = await raw(A.base, 'POST', '/api/auth/tfa/login', { code: recoveryCodes[0] }, challenge);
  assert.equal(res.status, 200, 'the burned code is the authentication event');
  assert.equal(res.data.recoveryRemaining, 9, 'D-73: remaining unused count reported');
  assert.ok(hasSessionCookie(res.cookies), 'a session was minted');

  const burn = withDb(A.dbPath, db =>
    db
      .prepare(
        'select used_at from recovery_codes rc join users u on u.id = rc.user_id where u.email = ? and rc.code_hash = (select code_hash from recovery_codes where used_at is not null and user_id = ? limit 1)',
      )
      .get(EMAIL, id),
  );
  assert.ok(burn && burn.used_at, 'the used code row has used_at set');

  const sessionsAfterBurn = withDb(A.dbPath, db => db.prepare('select count(*) as c from sessions where user_id = ?').get(id).c);
  const reuse = await pending(A.base, EMAIL).then(c => raw(A.base, 'POST', '/api/auth/tfa/login', { code: recoveryCodes[0] }, c));
  assert.equal(reuse.status, 400, 'D-64: the same code never verifies twice');
  assert.equal(reuse.data.code, 'invalidTfaCode');
  assert.equal(
    withDb(A.dbPath, db => db.prepare('select count(*) as c from sessions where user_id = ?').get(id).c),
    sessionsAfterBurn,
    'no second session minted',
  );
});

test('D-66: three wrong codes kill the challenge; the next attempt must restart from the password', async () => {
  const EMAIL = 'death@test.local';
  const { secret } = await setupTfa(A.base, 'death');
  const id = userId(A, EMAIL);

  const challenge = await pending(A.base, EMAIL);
  for (let i = 0; i < 3; i++) {
    const wrong = await raw(A.base, 'POST', '/api/auth/tfa/login', { code: `10${i}999` }, challenge);
    assert.equal(wrong.status, 400, `wrong attempt ${i + 1} verified normally`);
    assert.equal(wrong.data.code, 'invalidTfaCode');
  }
  // The 4th submission — even with a correct code — finds a dead challenge.
  const dead = await raw(A.base, 'POST', '/api/auth/tfa/login', { code: liveCode(secret) }, challenge);
  assert.equal(dead.status, 401);
  assert.equal(dead.data.code, 'challengeExpired');
  assert.equal(
    withDb(A.dbPath, db => db.prepare('select count(*) as c from login_challenges where user_id = ?').get(id).c),
    0,
    'the dead row is gone',
  );
  assert.ok(!hasSessionCookie(dead.cookies), 'a dead challenge never mints a session');

  // Restart from the password step: a fresh full login works.
  const freshChallenge = await pending(A.base, EMAIL);
  const fresh = await raw(A.base, 'POST', '/api/auth/tfa/login', { code: liveCode(secret) }, freshChallenge);
  assert.equal(fresh.status, 200, 'a new challenge after death is fully functional');
});

test('D-66: an expired challenge returns 401 challengeExpired and is deleted on the next verify', async () => {
  const EMAIL = 'expiry@test.local';
  const { secret } = await setupTfa(B.base, 'expiry');
  const id = userId(B, EMAIL);

  const challenge = await pending(B.base, EMAIL);
  withDb(B.dbPath, db => db.prepare('update login_challenges set expires_at = ? where user_id = ?').run(Date.now() - 1000, id));

  const res = await raw(B.base, 'POST', '/api/auth/tfa/login', { code: liveCode(secret) }, challenge);
  assert.equal(res.status, 401);
  assert.equal(res.data.code, 'challengeExpired');
  assert.equal(
    withDb(B.dbPath, db => db.prepare('select count(*) as c from login_challenges where user_id = ?').get(id).c),
    0,
    'the expired row was deleted by the verify attempt',
  );
});

/* ---------------- TFA-05-6: budget carry-over (D-03/Pitfall 18) ---------------- */

test('D-03: one logical login = one throttle budget — pending successes never reset it', async () => {
  const EMAIL = 'carry@test.local';
  await setupTfa(B.base, 'carry');

  // Five wrong passwords consume the shared login budget (max 10 / 15min).
  for (let i = 0; i < 5; i++) {
    const res = await raw(B.base, 'POST', '/api/auth/login', { email: EMAIL, password: `wrong-${i}-pass` });
    assert.equal(res.status, 401, `wrong password ${i + 1} rejected`);
  }
  // Five correct-password logins reach the pending state WITHOUT resetting the
  // budget (the old attempts.delete() success-clear would have wiped it here).
  for (let i = 0; i < 5; i++) {
    const challenge = await pending(B.base, EMAIL);
    assert.ok(challenge, `pending login ${i + 1} still inside the shared budget`);
  }
  // The 11th submission on the same budget — a 429, not a fresh budget.
  const locked = await raw(B.base, 'POST', '/api/auth/login', { email: EMAIL, password: GOOD });
  assert.equal(locked.status, 429, 'the budget carried across password and pending steps');
  assert.equal(locked.data.code, 'tooManyAttempts', 'D-13: the catalogued generic code');
  assert.equal(/15/.test(locked.data.error || ''), false, 'D-13: no lockout window disclosed');
});

/* ------------------- TFA-05-7: the D-71 401 matrix + logout ------------------- */

test('D-71: with only a challenge cookie held, every identity endpoint treats the caller as anonymous', async () => {
  const EMAIL = 'matrix@test.local';
  await setupTfa(A.base, 'matrix');
  const id = userId(A, EMAIL);

  // A real invite addressed to the pending user exercises the session-fallback consumer.
  const token = 'A'.repeat(20);
  withDb(A.dbPath, db =>
    db
      .prepare('insert into invites (token_hash, email, workspace_id, role, expires_at, used_at, created_at, created_by) values (?,?,?,?,?,null,?,?)')
      .run(
        crypto.createHash('sha256').update(token).digest('hex'),
        EMAIL,
        db.prepare('select id from workspaces limit 1').get().id,
        'member',
        Date.now() + 86_400_000,
        Date.now(),
        id,
      ),
  );

  const challenge = await pending(A.base, EMAIL);
  const h = challenge; // the ONLY credential held

  const sessions = await raw(A.base, 'GET', '/api/auth/sessions', undefined, h);
  assert.equal(sessions.status, 401, 'requireUser() API route: 401');

  // A fetch-style destination (the preview modal's iframe/fetch contract) keeps
  // the JSON 401 signInRequired from requireWorkspace → requireUser.
  const file = await raw(A.base, 'GET', '/w/acme/file/whatever', undefined, h, { 'sec-fetch-dest': 'empty' });
  assert.equal(file.status, 401, 'GET /w/:slug/file/:id: 401');

  const mePatch = await raw(A.base, 'PATCH', '/api/auth/me', { locale: 'en' }, h);
  assert.equal(mePatch.status, 401, 'PATCH /api/auth/me: 401');

  const invite = await raw(A.base, 'POST', `/api/invites/${token}/accept`, {}, h);
  assert.equal(invite.status, 409, 'invite accept falls back to sign-in-required, never the pending identity');
  assert.equal(invite.data.code, 'accountExistsSignIn');
  assert.equal(hasSessionCookie(invite.cookies), false, 'no session minted from the challenge cookie');

  const me = await raw(A.base, 'GET', '/api/auth/me', undefined, h);
  assert.equal(me.status, 200);
  assert.deepEqual(me.data, { user: null }, 'the probe endpoint answers user: null');

  // Logout from the pending state clears the challenge row and the cookie.
  const out = await raw(A.base, 'POST', '/api/auth/logout', undefined, h);
  assert.equal(out.status, 204);
  const cleared = out.cookies.find(c => c.startsWith('gr8r_tfa_challenge='));
  assert.ok(cleared && /Max-Age=0/.test(cleared), 'the challenge cookie is expired');
  assert.equal(
    withDb(A.dbPath, db => db.prepare('select count(*) as c from login_challenges where user_id = ?').get(id).c),
    0,
    'the challenge row is deleted',
  );
});
