/* Opt-in Postgres test matrix (Phase 45, D-08) — critical paths pinned
   against a LIVE Postgres, invisible (skipped, exit 0) when
   POSTGRES_TEST_URL is unset. No CI service by default.

   Runbook (local dev):
     docker run -d --name pg-matrix -p 127.0.0.1:5433:5432 \
       -e POSTGRES_PASSWORD=postgres postgres:17-alpine
     POSTGRES_TEST_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres \
       node --test test/pg-matrix.test.mjs

   Covers (Plan 45-07): boot + auth + second-boot no-op (tracer), D-04
   fail-closed boot (closed-port child process — no live pg needed),
   reminders_sent exactly-once (REM-03 on pg), case-variant email login
   (collate nocase rewrite end-to-end, Pitfall 4), bigint epoch typing
   (Pitfall 1), user_notif_prefs upsert drift (Pitfall 3), and a
   facade-level login_challenges round-trip (no external IdP).

   Secret hygiene (T-45-11): this file never prints DB_URL or
   POSTGRES_TEST_URL values, and the fail-closed test pins that the
   server's own output never carries the DSN either. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { startServer, client, login, signup, withPg, dropPgSchema, ROOT } from './helpers/server.mjs';

/* D-08 gate idiom — the whole matrix is opt-in. */
const url = process.env.POSTGRES_TEST_URL;
const maybe = url ? test : test.skip;

const GOOD = 'correct-horse-9';
const TOKEN = 'pg-matrix-reminder-token';
const TZ = '(GMT+00:00) London'; // UTC in winter — fixed-date clock math is trivial
const PG_ENV = { DB_URL: url, MASTER_KEY: 'pg-matrix-master-key', REMINDER_TEST_TOKEN: TOKEN };

/* The 14 server.js tables — full row-count snapshot for the second-boot
   no-op discipline (seed + migrations must never write twice). */
const COUNT_TABLES = Object.freeze([
  'users',
  'totp_factors',
  'oidc_identities',
  'sessions',
  'login_challenges',
  'workspaces',
  'memberships',
  'team_members',
  'invites',
  'recovery_codes',
  'security_log',
  'audit_log',
  'reminders_sent',
  'user_notif_prefs',
]);

async function tableCounts() {
  return withPg(url, async pool => {
    const counts = {};
    for (const table of COUNT_TABLES) {
      const { rows } = await pool.query(`select count(*)::int as n from ${table}`);
      counts[table] = rows[0].n;
    }
    return counts;
  });
}

/* Clean schema → boot a server on pg. Each scenario starts from a clean
   database (the reminder pass scans EVERY workspace). */
async function bootPg(extraEnv = {}) {
  await dropPgSchema(url);
  return startServer({ env: { ...PG_ENV, ...extraEnv } });
}

/* Register + login one account; returns the cookie-bearing client. */
async function makeOwner(srv, email) {
  const reg = await signup(srv.base, { name: 'Matrix', email, password: GOOD });
  assert.equal(reg.status, 201, `signup ${email}`);
  const { client: c, status } = await login(srv.base, email, GOOD);
  assert.equal(status, 200, `login ${email}`);
  return { c, email };
}

/* Create a workspace via the API and resolve its authority rows from pg. */
async function makeWorkspace(srv, owner, slug) {
  const created = await owner.c.post('/api/workspaces', { name: slug, slug });
  assert.equal(created.status, 201, `workspace ${slug}: ${created.status}`);
  const { rows } = await withPg(url, pool =>
    pool.query(
      'select w.id as ws_id, m.member_id, m.user_id from workspaces w join memberships m on m.workspace_id = w.id where w.slug = $1',
      [slug],
    ),
  );
  assert.equal(rows.length, 1, 'one owner membership row');
  return { wsId: rows[0].ws_id, memberId: rows[0].member_id, userId: rows[0].user_id };
}

const at8 = iso => new Date(`${iso}T08:00:00Z`).toISOString();

const trigger = async (srv, nowIso) => {
  const res = await fetch(`${srv.base}/api/internal/reminder-pass`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-reminder-token': TOKEN },
    body: JSON.stringify({ now: nowIso }),
  });
  assert.equal(res.status, 200, `trigger status ${res.status}`);
  return (await res.json()).emitted;
};

/* ==================== tracer: boot + auth + second boot (Plan 45-07 T1) ==================== */

maybe('pg matrix: boot + auth on live Postgres; second boot is a row-identical no-op (tracer)', async () => {
  const srv = await startServer({ env: PG_ENV });
  const owner = await makeOwner(srv, 'matrix-owner@test.local');
  const list = await owner.c.get('/api/workspaces');
  assert.equal(list.status, 200, 'authenticated request served on pg');
  assert.ok(Array.isArray(list.data.workspaces), 'workspace list shape');

  const before = await tableCounts();
  await srv.stop();

  /* Second boot against the same DB_URL: seed + migrations must write
     NOTHING (byte-identical second-boot discipline, on pg). */
  const srv2 = await startServer({ env: PG_ENV });
  const cfg = await fetch(`${srv2.base}/api/config`);
  assert.ok(cfg.ok, 'second boot serves');
  const after = await tableCounts();
  await srv2.stop();
  assert.deepEqual(after, before, 'no duplicate seed/migration effects on the second boot');
});

/* ==================== D-04: fail-closed boot (closed port — no live pg needed) ==================== */

maybe('pg matrix: fail-closed boot — unreachable Postgres refuses startup, DSN never printed (D-04)', async () => {
  /* A closed localhost port: connection refused immediately, no container. */
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const deadPort = probe.address().port;
  probe.close();

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-matrix-dead-'));
  const env = { ...process.env, PORT: '0', DATA_DIR: dir, DB_URL: `postgres://postgres:secret@127.0.0.1:${deadPort}/nodb` };
  delete env.DB_PATH; // pg backend — DB_PATH must be absent
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => (output += chunk));
  child.stderr.on('data', chunk => (output += chunk));

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`fail-closed child did not exit within 15s\n${output}`));
    }, 15_000);
    child.once('exit', exitCode => {
      clearTimeout(timer);
      resolve(exitCode);
    });
  });
  fs.rmSync(dir, { recursive: true, force: true });

  assert.notEqual(code, 0, 'server refuses to boot on an unreachable pg (no silent SQLite fallback)');
  assert.ok(output.includes('Postgres unreachable'), 'loud failure line present');
  assert.ok(output.includes('code='), 'carries the err.code');
  assert.ok(!output.includes('postgres://'), 'DSN never printed (T-45-11/D-04)');
});

/* T2 critical-path tests land in the next commit (Plan 45-07 Task 2). */
