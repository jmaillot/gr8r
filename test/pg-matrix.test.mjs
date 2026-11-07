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

/* ==================== T2a: reminders_sent exactly-once (REM-03 on pg) ==================== */

maybe('pg matrix: reminders_sent exactly-once — the {changes: 0} branch suppresses the duplicate (REM-03)', async () => {
  const srv = await bootPg();
  try {
    const owner = await makeOwner(srv, 'claim-owner@test.local');
    const ws = await makeWorkspace(srv, owner, 'pg-claims');
    const doc = {
      data: {
        members: [{ id: ws.memberId, name: 'Claim', email: owner.email, userId: null, tz: TZ }],
        projects: [{ id: 'p1', name: 'P1' }],
        tasks: [{ id: 't1', key: 'P1-1', title: 'Ship it', status: 'todo', assignee: ws.memberId, project: 'p1', due: '2026-01-15' }],
        comments: [],
        activity: [],
        notifs: [],
        files: [],
      },
    };
    await withPg(url, pool => pool.query('update workspaces set doc = $1 where id = $2', [JSON.stringify(doc), ws.wsId]));

    const first = (await trigger(srv, at8('2026-01-15'))).filter(n => n.task === 't1');
    assert.equal(first.length, 1, 'morning_of fires exactly once on pg');
    const again = (await trigger(srv, at8('2026-01-15'))).filter(n => n.task === 't1');
    assert.equal(again.length, 0, 'second pass suppressed — claim row exists, {changes: 0} branch (REM-03 on pg)');

    const { rows } = await withPg(url, pool =>
      pool.query('select count(*)::int as n from reminders_sent where workspace_id = $1', [ws.wsId]),
    );
    assert.equal(rows[0].n, 1, 'exactly one claim row on pg');
  } finally {
    await srv.stop();
  }
});

/* ==================== T2b: case-variant email login (Pitfall 4) ==================== */

maybe('pg matrix: case-variant email login — collate nocase rewrite end-to-end (Pitfall 4)', async () => {
  const srv = await bootPg();
  try {
    await signup(srv.base, { name: 'Case', email: 'casevariant@test.local', password: GOOD });
    const { status, data } = await login(srv.base, 'CaseVariant@Test.LOCAL', GOOD);
    assert.equal(status, 200, `upper-case login resolves the lower-case pg account (got ${status} ${JSON.stringify(data)})`);
  } finally {
    await srv.stop();
  }
});

/* ==================== T2c: bigint epoch typing (Pitfall 1) ==================== */

maybe('pg matrix: bigint epoch columns decode as NUMBERS at the API boundary (Pitfall 1)', async () => {
  const srv = await bootPg();
  try {
    const owner = await makeOwner(srv, 'epoch-owner@test.local');
    await makeWorkspace(srv, owner, 'pg-epoch');

    const inv = await owner.c.post('/api/workspaces/pg-epoch/invites', { emails: ['epoch-invitee@test.local'], role: 'member' });
    assert.equal(inv.status, 201, 'invite created');
    const listed = await owner.c.get('/api/workspaces/pg-epoch/invites');
    assert.equal(listed.status, 200);
    const row = listed.data.invites[0];
    assert.equal(typeof row.createdAt, 'number', `invites.created_at decodes as a number (got ${typeof row.createdAt})`);
    assert.equal(typeof row.expiresAt, 'number', `invites.expires_at decodes as a number (got ${typeof row.expiresAt})`);

    const sessions = await owner.c.get('/api/auth/sessions');
    assert.equal(sessions.status, 200);
    const s = sessions.data.sessions[0];
    assert.equal(typeof s.createdAt, 'number', `sessions.created_at decodes as a number (got ${typeof s.createdAt})`);
    assert.equal(typeof s.lastSeenAt, 'number', `sessions.last_seen_at decodes as a number (got ${typeof s.lastSeenAt})`);
  } finally {
    await srv.stop();
  }
});

/* ==================== T2d: user_notif_prefs upsert drift (Pitfall 3) ==================== */

maybe('pg matrix: user_notif_prefs upsert keeps ONE row with the last write (Pitfall 3)', async () => {
  const srv = await bootPg();
  try {
    const owner = await makeOwner(srv, 'prefs-owner@test.local');
    const ws = await makeWorkspace(srv, owner, 'pg-prefs');

    const p1 = await owner.c.put('/api/me/notif-prefs', { workspace: ws.wsId, prefs: { email_reminder: false } });
    assert.equal(p1.status, 200, 'first prefs PUT');
    const p2 = await owner.c.put('/api/me/notif-prefs', { workspace: ws.wsId, prefs: { email_reminder: true, past_due: false } });
    assert.equal(p2.status, 200, 'second prefs PUT');

    const { rows } = await withPg(url, pool =>
      pool.query('select workspace_id, user_id, prefs from user_notif_prefs where workspace_id = $1', [ws.wsId]),
    );
    assert.equal(rows.length, 1, 'upsert never deletes-and-reinserts — still exactly one row');
    const stored = JSON.parse(rows[0].prefs);
    assert.equal(stored.email_reminder, true, 'last write wins');
    assert.equal(stored.past_due, false, 'merged keys survive');
    assert.equal(p2.data.prefs.email_reminder, true, 'API echoes the last write');
  } finally {
    await srv.stop();
  }
});

/* ==================== T2e: login_challenges round-trip (no IdP) ==================== */

maybe('pg matrix: login_challenges round-trip — facade-level insert/read, no external IdP', async () => {
  const srv = await bootPg();
  try {
    const owner = await makeOwner(srv, 'challenge-owner@test.local');
    const ws = await makeWorkspace(srv, owner, 'pg-challenges');
    await withPg(url, async pool => {
      const expires = Date.now() + 60_000;
      await pool.query(
        'insert into login_challenges (challenge_token_hash, user_id, expires_at, attempts) values ($1,$2,$3,$4)',
        ['a'.repeat(64), ws.userId, expires, 0],
      );
      const { rows } = await pool.query(
        'select challenge_token_hash, user_id, expires_at, attempts from login_challenges where user_id = $1',
        [ws.userId],
      );
      assert.equal(rows.length, 1, 'challenge row round-trips on pg');
      assert.equal(typeof rows[0].expires_at, 'number', `bigint expires_at decodes as a number (got ${typeof rows[0].expires_at})`);
      assert.equal(rows[0].attempts, 0, 'integer counter stays integer');
    });
  } finally {
    await srv.stop();
  }
});
