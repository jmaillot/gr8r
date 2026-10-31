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

test('D-A4: server.js contains no UPDATE or DELETE against audit_log', async () => {
  const text = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'server.js'), 'utf8');
  assert.ok(!/update\s+audit_log/i.test(text), 'no UPDATE audit_log anywhere in server.js');
  assert.ok(!/delete\s+from\s+audit_log/i.test(text), 'no DELETE FROM audit_log anywhere in server.js');
});
