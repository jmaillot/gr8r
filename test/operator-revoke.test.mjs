/* Operator session revocation suite (phase 22 plan 01): real server, real SQLite.
   Covers OPREV-01/OPREV-02: the D-112 is_instance_admin gate, the D-115 revoke
   route with the D-117 { revoked, remaining } envelope and success-only
   security verb, the D-118 one-statement revoke (self-target = revoke-others),
   and D-119 owner immunity before any session lookup. No mocks. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { login, signup, startServer, withDb } from './helpers/server.mjs';

let server;
let tempDir;

const ADMIN_EMAIL = 'owner@test.local';
const ADMIN_PASSWORD = 'owner-password-1';
const GOOD = 'correct-horse-9';

const revoke = (cookie, userId, srv = server) =>
  fetch(`${srv.base}/api/auth/operator/users/${userId}/revoke-sessions`, {
    method: 'POST',
    headers: { cookie },
  });

const authedGet = (cookie, srv = server) =>
  fetch(`${srv.base}/api/auth/sessions`, { headers: { cookie } });

function userRow(email, srv = server) {
  return withDb(srv.dbPath, db => db.prepare('select * from users where email = ?').get(email));
}

const sessionCount = (email, srv = server) =>
  withDb(srv.dbPath, db =>
    db.prepare('select count(*) as n from sessions s join users u on u.id = s.user_id where u.email = ?').get(email).n,
  );

const securityRows = (email, srv = server) =>
  withDb(srv.dbPath, db =>
    db.prepare('select sl.* from security_log sl join users u on u.id = sl.user_id where u.email = ? order by sl.created_at').all(email),
  );

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-op-revoke-'));
  // D-10: a throwaway MASTER_KEY so production and tests exercise the same envelope path.
  server = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'gr8r-op-revoke-key' } });
});

after(async () => {
  await server?.stop();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    assert.equal(fs.existsSync(tempDir), false, 'temp data dir removed');
  }
});

/* --------------------- tracer: the proven end-to-end slice --------------------- */

test('tracer (a/b/d): bootstrap operator revokes a non-owner target end-to-end', async () => {
  // The D-113 boot stamp flagged the ADMIN_EMAIL bootstrap account.
  assert.equal(userRow(ADMIN_EMAIL).is_instance_admin, 1, 'bootstrap operator is flagged');

  const operator = (await login(server.base, ADMIN_EMAIL, ADMIN_PASSWORD)).client;
  const target = await signup(server.base, { name: 'victim', email: 'victim@test.local', password: GOOD });
  assert.equal(target.status, 201, 'victim signed up');
  // A second session for the target (signup already minted one).
  await login(server.base, 'victim@test.local', GOOD);
  assert.equal(sessionCount('victim@test.local'), 2, 'target holds 2 sessions');

  const victimCookie = target.client.cookie();
  const res = await revoke(operator.cookie(), userRow('victim@test.local').id);
  assert.equal(res.status, 200);
  const body = await res.json();
  // The operator's token_hash differs from every target row: both sessions go.
  assert.deepEqual(body, { revoked: 2, remaining: 0 });
  assert.equal(sessionCount('victim@test.local'), 0, 'withDb: zero remaining target session rows');

  // (b) The honest-teardown premise: the revoked cookie 401s on the next call.
  const next = await authedGet(victimCookie);
  assert.equal(next.status, 401);
  assert.equal((await next.json()).code, 'signInRequired');

  // (d) Exactly one success-only security verb for the target (D-117).
  const logs = securityRows('victim@test.local');
  assert.equal(logs.length, 1, 'exactly one security_log row');
  assert.equal(logs[0].verb, 'sessions_revoked_by_operator');
  assert.equal(logs[0].user_id, userRow('victim@test.local').id);
});

test('D-118 self-target is allowed and revokes others only — the current session survives', async () => {
  const operator = (await login(server.base, ADMIN_EMAIL, ADMIN_PASSWORD)).client;
  assert.equal(sessionCount(ADMIN_EMAIL), 2, 'operator holds 2 sessions');

  const res = await revoke(operator.cookie(), userRow(ADMIN_EMAIL).id);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { revoked: 1, remaining: 1 }, 'revoked = own sessions − 1, remaining = 1');

  // The operator's current cookie still authenticates (success criterion 2).
  const still = await authedGet(operator.cookie());
  assert.equal(still.status, 200, 'operator session survived the self-target revoke');
});

test('D-119 owner immunity: another flagged owner is refused before any session lookup', async () => {
  const operator = (await login(server.base, ADMIN_EMAIL, ADMIN_PASSWORD)).client;
  await signup(server.base, { name: 'otherOwner', email: 'otherowner@test.local', password: GOOD });
  await login(server.base, 'otherowner@test.local', GOOD);
  withDb(server.dbPath, db => db.prepare('update users set is_instance_admin = 1 where email = ?').run('otherowner@test.local'));
  const before = sessionCount('otherowner@test.local');
  assert.equal(before, 2);

  const res = await revoke(operator.cookie(), userRow('otherowner@test.local').id);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, 'ownerImmune');
  assert.equal(sessionCount('otherowner@test.local'), before, 'owner sessions untouched');
  assert.equal(securityRows('otherowner@test.local').length, 0, 'refused attempt logs nothing (D-117)');
});

test('unknown :userId is a 404 and records no security row', async () => {
  const operator = (await login(server.base, ADMIN_EMAIL, ADMIN_PASSWORD)).client;
  const logsBefore = withDb(server.dbPath, db => db.prepare('select count(*) as n from security_log').get().n);
  const res = await revoke(operator.cookie(), 'u'.repeat(36));
  assert.equal(res.status, 404);
  assert.equal((await res.json()).code, 'notFound');
  const logsAfter = withDb(server.dbPath, db => db.prepare('select count(*) as n from security_log').get().n);
  assert.equal(logsAfter, logsBefore, 'the 404 refusal recorded nothing');
});

/* --------------------- D-113 provisioning paths (plan task 2) --------------------- */

test('D-113 fresh install: the ADMIN_EMAIL bootstrap account is flagged', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-op-fresh-'));
  const srv = await startServer({ dataDir: dir, env: { MASTER_KEY: 'gr8r-op-fresh-key' } });
  try {
    const row = withDb(srv.dbPath, db => db.prepare('select is_instance_admin from users where email = ?').get(ADMIN_EMAIL));
    assert.equal(row?.is_instance_admin, 1, 'fresh bootstrap operator flagged');
  } finally {
    await srv.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('D-113 pre-v1.4 database: the boot stamp flags the ADMIN_EMAIL account and is idempotent', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-op-legacy-'));
  const first = await startServer({ dataDir: dir, env: { MASTER_KEY: 'gr8r-op-legacy-key' } });
  // Build a pre-v1.4-shaped database: users exist, none flagged.
  await signup(first.base, { name: 'legacyUser', email: 'legacy@test.local', password: GOOD });
  withDb(first.dbPath, db => db.prepare('update users set is_instance_admin = 0').run());
  await first.stop();

  const second = await startServer({ dataDir: dir, env: { MASTER_KEY: 'gr8r-op-legacy-key' } });
  const flagOf = email =>
    withDb(second.dbPath, db => db.prepare('select is_instance_admin as f from users where email = ?').get(email)?.f);
  assert.equal(flagOf(ADMIN_EMAIL), 1, 'the ADMIN_EMAIL-matching account is now flagged');
  assert.equal(flagOf('legacy@test.local'), 0, 'other accounts remain unflagged');
  await second.stop();

  // Idempotence: a second boot with a flagged user present changes nothing.
  const third = await startServer({ dataDir: dir, env: { MASTER_KEY: 'gr8r-op-legacy-key' } });
  assert.equal(flagOf(ADMIN_EMAIL), 1, 'flag unchanged after another boot');
  assert.equal(flagOf('legacy@test.local'), 0, 'no other row changed');
  await third.stop();
  fs.rmSync(dir, { recursive: true, force: true });
});

/* --------------------- privilege-matrix expansion (plan task 3) --------------------- */

let server2;
let tempDir2;

before(async () => {
  /* Second instance: signup is IP-throttled 5/hour and the matrix needs more
     users, so the remaining families live on their own server. */
  tempDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-op-revoke2-'));
  server2 = await startServer({ dataDir: tempDir2, env: { MASTER_KEY: 'gr8r-op-revoke-key-2' } });
});

after(async () => {
  await server2?.stop();
  if (tempDir2) {
    fs.rmSync(tempDir2, { recursive: true, force: true });
    assert.equal(fs.existsSync(tempDir2), false, 'temp data dir 2 removed');
  }
});

test('workspace owner membership WITHOUT the flag is refused — the gate reads the column only', async () => {
  const wsAdmin = await signup(server2.base, { name: 'wsAdmin', email: 'wsadmin@test.local', password: GOOD });
  assert.equal(wsAdmin.status, 201, 'wsAdmin signed up');
  // Pitfall 4 fixture: a real workspace 'owner' membership row on Acme, with
  // is_instance_admin = 0. The two flags are independent by construction
  // (memberships vs the users column); the gate must read the column only.
  withDb(server2.dbPath, db =>
    db
      .prepare('insert into memberships (workspace_id, user_id, role) select id, ?, \'owner\' from workspaces where slug = \'acme\'')
      .run(userRow('wsadmin@test.local', server2).id),
  );
  await signup(server2.base, { name: 'wsVictim', email: 'wsvictim@test.local', password: GOOD });
  const before = sessionCount('wsvictim@test.local', server2);

  const res = await revoke(wsAdmin.client.cookie(), userRow('wsvictim@test.local', server2).id, server2);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, 'operatorOnly', 'D-112: workspace role never substitutes for the flag');
  assert.equal(sessionCount('wsvictim@test.local', server2), before, 'target sessions intact');
  assert.equal(securityRows('wsvictim@test.local', server2).length, 0, 'refused attempt logs nothing');
});

test('D-116 throttle band: every attempt consumes a try — 403 refusals included; the 6th is throttled', async () => {
  const operator = (await login(server2.base, ADMIN_EMAIL, ADMIN_PASSWORD)).client;
  await signup(server2.base, { name: 'flagOwner', email: 'flagowner@test.local', password: GOOD });
  await login(server2.base, 'flagowner@test.local', GOOD);
  withDb(server2.dbPath, db => db.prepare('update users set is_instance_admin = 1 where email = ?').run('flagowner@test.local'));
  const targetId = userRow('wsvictim@test.local', server2).id;
  const flaggedId = userRow('flagowner@test.local', server2).id;

  // 5 attempts inside the window: a valid revoke, an owner-immune refusal,
  // then three more valid revokes.
  assert.equal((await revoke(operator.cookie(), targetId, server2)).status, 200);
  const refused = await revoke(operator.cookie(), flaggedId, server2);
  assert.equal(refused.status, 403, 'the owner-immune refusal also consumed a try');
  assert.equal((await revoke(operator.cookie(), targetId, server2)).status, 200);
  assert.equal((await revoke(operator.cookie(), targetId, server2)).status, 200);
  assert.equal((await revoke(operator.cookie(), targetId, server2)).status, 200);

  const sixth = await revoke(operator.cookie(), targetId, server2);
  assert.equal(sixth.status, 429, 'the 6th attempt is throttled');
  assert.equal((await sixth.json()).code, 'tooManyAttempts');

  // D-117: rows exist only for committed successes.
  const targetLogs = securityRows('wsvictim@test.local', server2);
  assert.equal(targetLogs.length, 4, 'four successful revokes logged');
  assert.equal(securityRows('flagowner@test.local', server2).length, 0, 'the 403 refusal logged nothing');
});
