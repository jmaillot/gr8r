/* Audit-log suite (phase 24 plan 01, AUD-01): real server, real SQLite.
   Wave 0: the operator revoke route writes exactly one complete audit_log row
   in the SAME transaction as the session DELETE (fields + dual-write), forced
   audit failure rolls back the whole revocation, and server.js stays
   append-only against audit_log. No mocks. */
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

const auditRows = (srv = server) => withDb(srv.dbPath, db => db.prepare('select * from audit_log order by created_at, id').all());

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-audit-log-'));
  server = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'projects-audit-log-key' } });
});

after(async () => {
  await server?.stop();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    assert.equal(fs.existsSync(tempDir), false, 'temp data dir removed');
  }
});

/* --------------------- criterion 1: the complete audit row --------------------- */

test('AUD-01: operator revoke writes exactly one complete audit_log row in the same transaction', async () => {
  const operator = (await login(server.base, ADMIN_EMAIL, ADMIN_PASSWORD)).client;
  await signup(server.base, { name: 'audit victim', email: 'auditvictim@test.local', password: GOOD });
  await login(server.base, 'auditvictim@test.local', GOOD);

  const opRow = withDb(server.dbPath, db => db.prepare('select * from users where email = ?').get(ADMIN_EMAIL));
  const targetRow = withDb(server.dbPath, db => db.prepare('select * from users where email = ?').get('auditvictim@test.local'));

  const res = await revoke(operator.cookie(), targetRow.id);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { revoked: 2, remaining: 0 });

  const rows = auditRows();
  assert.equal(rows.length, 1, 'exactly one audit row per revocation');
  const row = rows[0];
  assert.equal(row.actor_id, opRow.id, 'actor_id = operator id');
  assert.equal(row.target_id, targetRow.id, 'target_id = target id');
  assert.equal(row.action, 'sessions_revoked_by_operator');
  assert.equal(row.session_count, 2);
  assert.ok(row.ip, 'non-empty ip');
  assert.equal(row.workspace_id, null, 'operator-tier rows are workspace-less (D-T3)');
  assert.equal(row.actor_name, opRow.name);
  assert.equal(row.actor_email, opRow.email);
  assert.equal(row.target_name, targetRow.name);
  assert.equal(row.target_email, targetRow.email);
  assert.ok(row.actor_name && row.actor_email && row.target_name && row.target_email, 'non-empty name/email snapshots');
  assert.equal(Number.isInteger(row.created_at), true, 'integer epoch-ms created_at');
  assert.equal(typeof row.id, 'string');
});

test('D-A5: the security_log dual-write survives — the verb row still exists for the target', async () => {
  const targetRow = withDb(server.dbPath, db => db.prepare('select * from users where email = ?').get('auditvictim@test.local'));
  const logs = withDb(server.dbPath, db =>
    db.prepare('select verb from security_log where user_id = ? order by created_at').all(targetRow.id),
  );
  assert.ok(logs.some(l => l.verb === 'sessions_revoked_by_operator'), 'security verb still recorded');
});

/* --------------------- criterion 3: rollback atomicity --------------------- */

test('AUD-01 criterion 3: forced audit-write failure rolls back the entire revocation', async () => {
  const operator = (await login(server.base, ADMIN_EMAIL, ADMIN_PASSWORD)).client;
  await signup(server.base, { name: 'rollback victim', email: 'rollbackvictim@test.local', password: GOOD });

  const targetRow = withDb(server.dbPath, db => db.prepare('select * from users where email = ?').get('rollbackvictim@test.local'));
  const countBefore = withDb(server.dbPath, db => db.prepare('select count(*) as n from sessions where user_id = ?').get(targetRow.id).n);
  assert.equal(countBefore, 1, 'target holds one session');
  const auditsBefore = auditRows().length;

  // Force the audit INSERT to throw: drop the table. The DELETE succeeds first,
  // but the whole transaction must roll back — zero sessions deleted.
  withDb(server.dbPath, db => db.exec('drop table audit_log'));
  const res = await revoke(operator.cookie(), targetRow.id);
  assert.ok(res.status >= 500, `audit failure surfaces as 5xx (got ${res.status})`);

  const countAfter = withDb(server.dbPath, db => db.prepare('select count(*) as n from sessions where user_id = ?').get(targetRow.id).n);
  assert.equal(countAfter, countBefore, 'session count UNCHANGED — the DELETE was rolled back');

  // Recreate the table so later fixtures are unaffected.
  withDb(server.dbPath, db => {
    db.exec(`create table if not exists audit_log (
      id            text primary key,
      actor_id      text,
      target_id     text,
      action        text not null,
      session_count integer not null,
      ip            text,
      workspace_id  text,
      actor_name    text not null,
      actor_email   text not null,
      target_name   text not null,
      target_email  text not null,
      created_at    integer not null
    )`);
  });
  assert.equal(auditRows().length, 0, 'zero audit rows in the freshly recreated table — the failed attempt wrote nothing');
});

/* --------------------- criterion 5 groundwork: append-only scan --------------------- */

/* ==================== AUD-02: the workspace-admin revoke tier ==================== */

/* A workspace-admin fixture group: an owner-created workspace whose members are
   invited through the real API. boss/boss2 = admin-tier members, mate = an
   ordinary member, outsider = a member whose account never acts beyond the
   gate test. The bootstrap operator (ADMIN_EMAIL) is invited in as a plain
   member so the ownerImmune path is reachable AFTER the notAMember gate.
   Throttle budgets: the admin revoke throttle keys on the caller (5 per 15min,
   every attempt consumes a try), so refusals are split across boss and boss2 —
   boss spends 4 tries (success, ownerImmune, self, zero-row), boss2 spends 2. */
let ws; // { id, slug, bossUserId, boss2UserId, mateUserId, outsiderUserId, operatorUserId }

async function seedAdminTierFixtures() {
  const ownerClient = (await login(server.base, ADMIN_EMAIL, ADMIN_PASSWORD)).client;
  const slug = `admws-${Date.now().toString(36)}`;
  const created = await ownerClient.post('/api/workspaces', { name: 'Admin Tier', slug });
  assert.equal(created.status, 201, `workspace create failed: ${JSON.stringify(created.data)}`);
  const wsRow = withDb(server.dbPath, db => db.prepare('select * from workspaces where slug = ?').get(slug));
  ws = { id: wsRow.id, slug };

  const mkMember = async (name, email, role, { exists = false } = {}) => {
    if (!exists) await signup(server.base, { name, email, password: GOOD });
    const invite = await ownerClient.post(`/api/workspaces/${slug}/invites`, { emails: [email], role });
    assert.equal(invite.status, 201, `invite ${email} failed: ${JSON.stringify(invite.data)}`);
    const url = invite.data.invites[0].url;
    const token = url.slice(url.lastIndexOf('/join/') + '/join/'.length);
    const joiner = (await login(server.base, email, GOOD)).client;
    const accepted = await joiner.post(`/api/invites/${token}/accept`, {});
    assert.ok([200, 201].includes(accepted.status), `accept ${email} failed: ${JSON.stringify(accepted.data)}`);
    return withDb(server.dbPath, db => db.prepare('select id from users where email = ?').get(email)).id;
  };

  ws.bossUserId = await mkMember('tier boss', 'tierboss@test.local', 'admin');
  ws.boss2UserId = await mkMember('tier boss two', 'tierbosstwo@test.local', 'admin');
  // The signup throttle allows 5/hour/IP and the AUD-01 tests above already
  // spent two, so the member and outsider roles reuse the AUD-01 victim
  // accounts (exists: true) instead of signing up fresh ones.
  ws.mateUserId = await mkMember('rollback victim', 'rollbackvictim@test.local', 'member', { exists: true });
  ws.outsiderUserId = (await signup(server.base, { name: 'non member', email: 'nonmember@test.local', password: GOOD })).data?.user?.id
    || withDb(server.dbPath, db => db.prepare('select id from users where email = ?').get('nonmember@test.local')).id; // no invite: a true non-member
  // The instance operator is ALREADY a member of this workspace: the workspace
  // creator (ADMIN_EMAIL) becomes its owner, so no invite is needed — the
  // ownerImmune path must be reachable BEFORE the rank rule for this target.
  ws.operatorUserId = withDb(server.dbPath, db => db.prepare('select id from users where email = ?').get(ADMIN_EMAIL)).id;
}

/* The admin-tier revoke call: POST /api/w/<slug>/members/<id>/revoke-sessions. */
const adminRevoke = (cookie, userId, slug = ws.slug) =>
  fetch(`${server.base}/api/w/${slug}/members/${userId}/revoke-sessions`, {
    method: 'POST',
    headers: { cookie },
  });

const bossLogin = async () => (await login(server.base, 'tierboss@test.local', GOOD)).client;
const boss2Login = async () => (await login(server.base, 'tierbosstwo@test.local', GOOD)).client;

test('AUD-02: workspace admin revokes a member — one audited row with workspace_id and the admin verb', async () => {
  if (!ws) await seedAdminTierFixtures();
  const boss = await bossLogin();
  const mateRow = withDb(server.dbPath, db => db.prepare('select * from users where email = ?').get('rollbackvictim@test.local'));
  const bossRow = withDb(server.dbPath, db => db.prepare('select * from users where email = ?').get('tierboss@test.local'));

  const res = await adminRevoke(boss.cookie(), ws.mateUserId);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.revoked, 2, 'member holds signup + login sessions');
  assert.equal(body.remaining, 0, 'live post-delete count');

  const rows = auditRows().filter(r => r.action === 'sessions_revoked_by_workspace_admin');
  assert.equal(rows.length, 1, 'exactly one admin-tier audit row');
  const row = rows[0];
  assert.equal(row.actor_id, bossRow.id);
  assert.equal(row.target_id, mateRow.id);
  assert.equal(row.session_count, 2);
  assert.equal(row.workspace_id, ws.id, 'workspace-tier rows carry workspace_id');
  assert.ok(row.ip, 'non-empty ip');
  assert.equal(row.actor_name, bossRow.name);
  assert.equal(row.actor_email, bossRow.email);
  assert.equal(row.target_name, mateRow.name);
  assert.equal(row.target_email, mateRow.email);

  const logs = withDb(server.dbPath, db =>
    db.prepare('select verb from security_log where user_id = ?').all(mateRow.id),
  );
  assert.ok(logs.some(l => l.verb === 'sessions_revoked_by_workspace_admin'), 'security_log dual-write for the target');
});

test('AUD-02: admin targets a PEER ADMIN — 403 adminOnly, nothing deleted, nothing written', async () => {
  const boss2 = (await login(server.base, 'tierbosstwo@test.local', GOOD)).client;
  const auditsBefore = auditRows().length;
  const sessionsBefore = withDb(server.dbPath, db =>
    db.prepare('select count(*) as n from sessions where user_id = ?').get(ws.bossUserId).n,
  );

  const res = await adminRevoke(boss2.cookie(), ws.bossUserId); // self-tier: role exactly 'admin' is refused (strict <)
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, 'adminOnly');
  assert.equal(auditRows().length, auditsBefore, 'no audit row on refusal');
  assert.equal(
    withDb(server.dbPath, db => db.prepare('select count(*) as n from sessions where user_id = ?').get(ws.bossUserId).n),
    sessionsBefore,
    'zero sessions deleted',
  );
});

test('AUD-02: admin targets an instance operator — 403 ownerImmune (defense in depth)', async () => {
  const boss2 = await boss2Login(); // boss2's budget: peer-admin + ownerImmune + notAMember + zero-row pair
  const auditsBefore = auditRows().length;
  const res = await adminRevoke(boss2.cookie(), ws.operatorUserId);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, 'ownerImmune');
  assert.equal(auditRows().length, auditsBefore, 'no audit row on refusal');
});

test('AUD-02: admin targets a non-member — 404 notAMember', async () => {
  const boss2 = await boss2Login();
  const auditsBefore = auditRows().length;
  const res = await adminRevoke(boss2.cookie(), ws.outsiderUserId);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).code, 'notAMember');
  assert.equal(auditRows().length, auditsBefore, 'no audit row on refusal');
});

test('AUD-02: admin self-target — 200, current session survives, others revoked, audit row written', async () => {
  const first = await bossLogin(); // session A (the device that keeps acting)
  await bossLogin(); // session B (the device that gets revoked)
  const bossRow = withDb(server.dbPath, db => db.prepare('select * from users where email = ?').get('tierboss@test.local'));
  const before = withDb(server.dbPath, db => db.prepare('select count(*) as n from sessions where user_id = ?').get(bossRow.id).n);
  assert.ok(before >= 2, 'boss holds at least the two fresh sessions');

  const res = await adminRevoke(first.cookie(), bossRow.id);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.revoked, before - 1, 'every OTHER session went');
  assert.equal(body.remaining, 1, 'the current session survives (keep-current, P-H)');

  const rows = auditRows().filter(r => r.action === 'sessions_revoked_by_workspace_admin' && r.target_id === bossRow.id);
  assert.equal(rows.length, 1, 'self-target still writes the audit row');
});

test('AUD-02: member and viewer callers are refused by requireWorkspace — 403 adminOnly', async () => {
  const mate = (await login(server.base, 'rollbackvictim@test.local', GOOD)).client;
  const res = await adminRevoke(mate.cookie(), ws.outsiderUserId);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, 'adminOnly');
});

test('AUD-02: zero active sessions — 200 {revoked: 0}, no audit row, no security row (D-117)', async () => {
  const boss2 = await boss2Login(); // boss2's 5th and final throttle try
  const mateRow = withDb(server.dbPath, db => db.prepare('select * from users where email = ?').get('rollbackvictim@test.local'));
  const secBefore = withDb(server.dbPath, db =>
    db.prepare('select count(*) as n from security_log where user_id = ?').get(mateRow.id).n,
  );
  const auditsBefore = auditRows().filter(r => r.action === 'sessions_revoked_by_workspace_admin').length;

  // The member-caller gate test above re-logged mate in, so this first revoke
  // consumes that one live session (a fresh audit row) and the SECOND call
  // proves the zero-row no-op: 200 {revoked: 0} and NOTHING written (D-117).
  const first = await adminRevoke(boss2.cookie(), ws.mateUserId);
  assert.equal(first.status, 200);
  assert.equal((await first.json()).revoked, 1);

  const res = await adminRevoke(boss2.cookie(), ws.mateUserId);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { revoked: 0, remaining: 0 });
  assert.equal(
    auditRows().filter(r => r.action === 'sessions_revoked_by_workspace_admin').length,
    auditsBefore + 1,
    'exactly the one new row from the first call — the zero-row call wrote nothing',
  );
  assert.equal(
    withDb(server.dbPath, db => db.prepare('select count(*) as n from security_log where user_id = ?').get(mateRow.id).n),
    secBefore + 1,
    'security_log: one row from the first call, none from the zero-row call',
  );
});

/* ==================== AUD-03: the tier-scoped audit trail read ==================== */

/* The audit read: GET /api/audit-log?verb=&before=&beforeId= → { rows, nextBefore }. */
const auditGet = (cookie, query = '') =>
  fetch(`${server.base}/api/audit-log${query}`, { headers: { cookie } });

test('AUD-03: instance operator reads the whole trail — both verbs, workspace-less rows included', async () => {
  const operator = (await login(server.base, ADMIN_EMAIL, ADMIN_PASSWORD)).client;
  const res = await auditGet(operator.cookie());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.rows), 'rows array');
  const actions = new Set(body.rows.map(r => r.action));
  assert.ok(actions.has('sessions_revoked_by_operator'), 'operator-tier rows served');
  assert.ok(actions.has('sessions_revoked_by_workspace_admin'), 'admin-tier rows served');
  assert.ok(body.rows.some(r => r.workspace_id === null), 'workspace_id null rows visible to the operator');
});

test('AUD-03: workspace admin reads only their workspace rows — null-workspace rows NEVER served', async () => {
  if (!ws) await seedAdminTierFixtures();
  const boss = await bossLogin();
  const res = await auditGet(boss.cookie());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.rows.length > 0, 'admin sees their own workspace rows');
  assert.ok(body.rows.every(r => r.workspace_id === ws.id), 'every row scoped to the admin workspace');
  assert.ok(body.rows.some(r => r.action === 'sessions_revoked_by_workspace_admin'), 'admin verb row present');
});

test('AUD-03: plain member is refused — 403 adminOnly (honest gate, D-V1)', async () => {
  const mate = (await login(server.base, 'rollbackvictim@test.local', GOOD)).client;
  const res = await auditGet(mate.cookie());
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, 'adminOnly');
});

test('AUD-03: verb filter — exactly one verb per query, unknown verbs match nothing (not a 400)', async () => {
  const operator = (await login(server.base, ADMIN_EMAIL, ADMIN_PASSWORD)).client;
  const c = operator.cookie();
  const opRes = await auditGet(c, '?verb=sessions_revoked_by_operator');
  assert.equal(opRes.status, 200);
  const opBody = await opRes.json();
  assert.ok(opBody.rows.length > 0, 'operator-verb rows exist');
  assert.ok(opBody.rows.every(r => r.action === 'sessions_revoked_by_operator'), 'only operator rows');

  const adRes = await auditGet(c, '?verb=sessions_revoked_by_workspace_admin');
  assert.equal(adRes.status, 200);
  const adBody = await adRes.json();
  assert.ok(adBody.rows.length > 0, 'admin-verb rows exist');
  assert.ok(adBody.rows.every(r => r.action === 'sessions_revoked_by_workspace_admin'), 'only admin rows');

  const unRes = await auditGet(c, '?verb=some_unknown_verb');
  assert.equal(unRes.status, 200, 'unknown verb is a filter, not a 400 (flagged assumption)');
  assert.deepEqual(await unRes.json(), { rows: [], nextBefore: null });
});

test('AUD-03: keyset pagination — 100 per page, no duplicates, terminates with null nextBefore', async () => {
  const operator = (await login(server.base, ADMIN_EMAIL, ADMIN_PASSWORD)).client;
  const c = operator.cookie();
  // Seed 105 synthetic rows with strictly decreasing created_at (unique ts → id tie-break never decides).
  const base = Date.now() + 100000;
  withDb(server.dbPath, db => {
    const ins = db.prepare(
      'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
    );
    for (let i = 0; i < 105; i++) {
      ins.run(`pg-${String(i).padStart(5, '0')}`, 'pg-actor', 'pg-target', 'sessions_revoked_by_operator', 1, '127.0.0.1', null, 'Pagination Actor', 'actor@pg.test', 'Pagination Target', 'target@pg.test', base - i * 1000);
    }
  });

  const seen = [];
  let before = null;
  let beforeId = null;
  let pages = 0;
  for (;;) {
    const q = before == null ? '' : `?before=${before}&beforeId=${encodeURIComponent(beforeId)}`;
    const res = await auditGet(c, q);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.rows.length <= 100, 'page capped at 100');
    for (const r of body.rows) seen.push(r.id);
    pages++;
    if (!body.nextBefore) break;
    assert.equal(body.rows.length, 100, 'non-final pages are full');
    before = body.nextBefore.created_at;
    beforeId = body.nextBefore.id;
    assert.ok(pages < 10, 'pagination terminates (guard against infinite loop)');
  }
  assert.equal(new Set(seen).size, seen.length, 'no row appears twice across pages');
  assert.ok(seen.length >= 105, 'every seeded row was walked');
  assert.ok(seen.includes('pg-00000'), 'the oldest seeded row is on the final page');
});

test('AUD-03: deleted-user survival — trail rows render from snapshot columns after target deletion', async () => {
  const operator = (await login(server.base, ADMIN_EMAIL, ADMIN_PASSWORD)).client;
  const victim = withDb(server.dbPath, db => db.prepare('select * from users where email = ?').get('auditvictim@test.local'));
  // No FK on audit_log (D-A2): deleting the user leaves the trail row intact.
  withDb(server.dbPath, db => db.prepare('delete from users where id = ?').run(victim.id));

  const res = await auditGet(operator.cookie(), '?verb=sessions_revoked_by_operator');
  assert.equal(res.status, 200);
  const row = (await res.json()).rows.find(r => r.target_id === victim.id);
  assert.ok(row, 'the trail row survives the target deletion');
  assert.equal(row.target_name, 'audit victim', 'target name snapshot still readable');
  assert.equal(row.target_email, 'auditvictim@test.local', 'target email snapshot still readable');
  assert.ok(row.actor_name && row.actor_email, 'actor snapshots still readable');
});

test('D-A4: server.js contains no UPDATE or DELETE against audit_log', async () => {
  const text = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'server.js'), 'utf8');
  assert.ok(!/update\s+audit_log/i.test(text), 'no UPDATE audit_log anywhere in server.js');
  assert.ok(!/delete\s+from\s+audit_log/i.test(text), 'no DELETE FROM audit_log anywhere in server.js');
});
