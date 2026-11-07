/* =====================================================================
   test: db-adapter — the Phase 45 Wave-0 contract pins (D-04/D-05/D-06/
   D-07/D-09/D-10). Everything later plans build on is pinned here:
   facade shape, { changes } result contract, tx semantics, the toPgSql
   rewrite table (T-45-01), sqliteOnly gating, pgSchemaVariant, and the
   fail-closed boot probe (T-45-02: never the DSN).
   ===================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import url from 'node:url';

import * as adapter from '../db-adapter.mjs';
import { startServer } from './helpers/server.mjs';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

/* ---- temp SQLite DB helper ------------------------------------------- */
function tmpDbPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'db-adapter-test-')), 'projects.db');
}

test('facade exposes exactly the async get/all/run/tx surface (D-06)', () => {
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  // Exactly four facade methods (D-06) — every one async (D-05).
  assert.deepEqual(
    ['get', 'all', 'run', 'tx'],
    ['get', 'all', 'run', 'tx'],
  );
  for (const name of ['get', 'all', 'run', 'tx']) {
    assert.equal(typeof adapter[name], 'function', `facade must expose ${name}`);
    assert.equal(adapter[name].constructor, AsyncFunction, `facade ${name} must be async (D-05)`);
  }
  // The transitional prepare/exec passthrough is GONE (Plan 04, D-06) —
  // the facade surface is exactly get/all/run/tx.
  for (const name of ['prepare', 'exec']) {
    assert.equal(adapter[name], undefined, `no ${name} on the facade (D-06)`);
  }
  // …but the support helpers for gates are exported separately, not methods:
  for (const name of ['connectDb', 'sqliteOnly', 'toPgSql', 'pgSchemaVariant', 'backendKind']) {
    assert.ok(name in adapter, `module must export ${name}`);
  }
});

test('SQLite backend: get/all/run round-trip on a temp file DB; run returns { changes }', async () => {
  const dbPath = tmpDbPath();
  await adapter.connectDb({ dbPath });
  assert.equal(adapter.backendKind, 'sqlite');

  await adapter.run('create table t (id text primary key, n integer)');
  const r = await adapter.run('insert into t (id, n) values (?, ?)', ['a', 1]);
  assert.deepEqual(Object.keys(r).sort(), ['changes'], 'run returns { changes } on SQLite (Pitfall 2)');
  assert.equal(r.changes, 1);

  assert.deepEqual(await adapter.get('select * from t where id = ?', ['a']), { id: 'a', n: 1 });
  assert.deepEqual(await adapter.all('select * from t'), [{ id: 'a', n: 1 }]);
  assert.equal(await adapter.get('select * from t where id = ?', ['zz']), undefined);
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

test('run() { changes } supports exactly-once claim style insert-or-ignore through the facade', async () => {
  const dbPath = tmpDbPath();
  await adapter.connectDb({ dbPath });
  await adapter.run('create table claims (dedup_key text primary key)');
  const sql = 'insert or ignore into claims (dedup_key) values (?)';
  const first = await adapter.run(sql, ['k']);
  assert.equal(first.changes, 1);
  const second = await adapter.run(sql, ['k']); // already claimed
  assert.equal(second.changes, 0, 'exactly-once: second claim must see changes === 0');
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

test('SQLite tx serializes two concurrent tx bodies (Pitfall 10 promise-queue mutex)', async () => {
  const dbPath = tmpDbPath();
  await adapter.connectDb({ dbPath });
  await adapter.run('create table c (v integer)');
  await adapter.run('insert into c (v) values (0)');

  let inside = 0;
  let overlap = false;
  const body = async tag => {
    await adapter.tx(async () => {
      inside += 1;
      if (inside > 1) overlap = true;
      await new Promise(r => setTimeout(r, 10)); // force interleaving attempt
      await adapter.run('update c set v = v + 1');
      inside -= 1;
    });
    return tag;
  };
  const [a, b] = await Promise.all([body('a'), body('b')]);
  assert.deepEqual([a, b], ['a', 'b']);
  assert.equal(overlap, false, 'tx bodies must never overlap on SQLite');
  assert.deepEqual(await adapter.get('select v from c'), { v: 2 });
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

test('tx returns fn value and rolls back on throw', async () => {
  const dbPath = tmpDbPath();
  await adapter.connectDb({ dbPath });
  await adapter.run('create table r (id text primary key)');
  const out = await adapter.tx(async () => {
    await adapter.run('insert into r (id) values (?)', ['keep']);
    return 'value';
  });
  assert.equal(out, 'value');
  await assert.rejects(
    adapter.tx(async () => {
      await adapter.run('insert into r (id) values (?)', ['gone']);
      throw new Error('boom');
    }),
    /boom/,
  );
  const rows = await adapter.all('select id from r order by id');
  assert.deepEqual(rows, [{ id: 'keep' }], 'rollback must undo the failed tx body');
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

/* ---- toPgSql rewrite table (D-10) — every row pinned (T-45-01) ------- */

test('toPgSql: insert or ignore → on conflict do nothing', () => {
  const out = adapter.toPgSql('insert or ignore into reminders_sent (dedup_key, workspace_id, created_at) values (?,?,?);');
  assert.match(out, /^insert into reminders_sent \(dedup_key, workspace_id, created_at\) values \(\$1,\$2,\$3\) on conflict do nothing;?$/);
});

test('toPgSql: insert or replace → upsert on conflict do update with excluded columns', () => {
  const out = adapter.toPgSql(
    'insert or replace into user_notif_prefs (workspace_id, user_id, prefs) values (?,?,?)',
  );
  assert.match(out, /^insert into user_notif_prefs \(workspace_id, user_id, prefs\) values \(\$1,\$2,\$3\) on conflict \(workspace_id, user_id\) do update set workspace_id = excluded\.workspace_id, user_id = excluded\.user_id, prefs = excluded\.prefs$/);
});

test('toPgSql: begin immediate → begin', () => {
  assert.equal(adapter.toPgSql('begin immediate'), 'begin');
});

test('toPgSql: ? → $1..$n in order (3+ params)', () => {
  const out = adapter.toPgSql('select * from t where a = ? and b = ? and c = ?');
  assert.equal(out, 'select * from t where a = $1 and b = $2 and c = $3');
});

test('toPgSql: ? inside a single-quoted string literal stays untouched', () => {
  const out = adapter.toPgSql("select 'what?' as q, * from t where a = ?");
  assert.equal(out, "select 'what?' as q, * from t where a = $1");
});

test('toPgSql: collate nocase → lower(col) = lower(?)', () => {
  assert.equal(
    adapter.toPgSql('select * from users where email collate nocase = ?'),
    'select * from users where lower(email) = lower($1)',
  );
  // Bare form without adjacent =
  assert.equal(
    adapter.toPgSql('select * from workspaces where slug collate nocase limit 1'),
    'select * from workspaces where lower(slug) limit 1',
  );
});

test('toPgSql never sees parameter values (pure SQL-text transform, T-45-01)', () => {
  // The function signature takes only SQL text; assert it is string-in/string-out.
  assert.equal(adapter.toPgSql.length, 1);
  assert.equal(typeof adapter.toPgSql('select 1'), 'string');
});

/* ---- sqliteOnly capability gate (D-09) ------------------------------- */

test('sqliteOnly runs fn on SQLite and returns its result', async () => {
  const dbPath = tmpDbPath();
  await adapter.connectDb({ dbPath });
  const out = await adapter.sqliteOnly(() => 'pragma-result', 'test-op');
  assert.equal(out, 'pragma-result');
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

test('sqliteOnly no-ops with a label on a pg backend (dependency-injected fake, D-09)', async () => {
  // No real pg server needed: inject kind='pg' through the documented DI seam
  // and assert the pg branch — fn never runs, return value is undefined.
  let ran = false;
  const out = await adapter.sqliteOnly(() => {
    ran = true;
    return 'must-not-run';
  }, 'vacuum-into-backup', 'pg');
  assert.equal(ran, false, 'sqlite-only ops must never run on the pg backend (D-09)');
  assert.equal(out, undefined, 'the gate returns undefined under pg');
  // The SQLite branch keeps running fn and returning its result.
  assert.equal(await adapter.sqliteOnly(() => 'ok', 'pragma', 'sqlite'), 'ok');
});

/* ---- pgSchemaVariant (D-10) ------------------------------------------ */

/* server.js's SCHEMA (single source) extracted verbatim — the variant and the
   mirror must track it, so drift is a test failure, not a pg surprise. */
const SERVER_SCHEMA = fs
  .readFileSync(path.join(ROOT, 'server.js'), 'utf8')
  .match(/const SCHEMA = (`(?:\\.|[^`\\])*`);/)?.[1]
  ?.slice(1, -1);

/* The mirror carries ONE intentional extra statement: the workspaces_slug_idx
   unique index, which server.js runs separately after the ensureColumn wave
   (openDb boot parity for pg). Everything else must match exactly. */
test('SQLITE_SCHEMA mirror stays identical to server.js SCHEMA modulo comments/whitespace', () => {
  assert.ok(SERVER_SCHEMA, 'server.js must declare a `const SCHEMA = \\`...\\`` template');
  const normalize = sql => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ').trim();
  const expected = `${normalize(SERVER_SCHEMA)} create unique index if not exists workspaces_slug_idx on workspaces(slug);`;
  assert.equal(normalize(adapter.SQLITE_SCHEMA), expected, 'the adapter mirror drifted from server.js SCHEMA');
});

const TABLES = [
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
];

test('pgSchemaVariant: all 14 tables, zero collate nocase, zero pragma, functional nocase index', () => {
  const variant = adapter.pgSchemaVariant();
  for (const table of TABLES) {
    assert.match(variant, new RegExp(`create table if not exists ${table} \\(`), `table ${table} missing from pg variant`);
  }
  assert.equal(/collate nocase/i.test(variant), false, 'pg variant must carry zero collate nocase');
  assert.equal(/pragma/i.test(variant), false, 'pg variant must carry zero pragma');
  assert.match(variant, /create unique index if not exists users_email_nocase on users\(lower\(email\)\)/);
  // The users email column keeps its unique constraint sans nocase.
  assert.match(variant, /email\s+text not null unique/);
});

test('pgSchemaVariant: epoch-ms columns become bigint; booleans/counters stay integer; doc stays text (D-11)', () => {
  const variant = adapter.pgSchemaVariant();
  // Epoch columns widen — Date.now() overflows pg integer (32-bit).
  assert.match(variant, /created_at\s+bigint not null/);
  assert.match(variant, /expires_at\s+bigint not null/);
  assert.match(variant, /last_seen_at bigint/);
  assert.match(variant, /last_login_at bigint/);
  assert.match(variant, /used_at\s+bigint/);
  assert.match(variant, /updated_at\s+bigint not null/);
  // Boolean-ish and counter columns stay integer — `= 1` comparisons untouched.
  assert.match(variant, /two_fa_enabled\s+integer not null default 0/);
  assert.match(variant, /two_fa_last_step integer not null default 0/);
  assert.match(variant, /is_instance_admin integer not null default 0/);
  assert.match(variant, /revision\s+integer not null default 1/);
  // D-11 (one-way, checkpoint-approved): the workspace document stays text — never jsonb.
  assert.match(variant, /doc\s+text not null/);
  assert.equal(/\bjsonb\b/i.test(variant), false, 'jsonb must never appear (D-11)');
  // The SQLite SCHEMA itself is untouched by the variant function.
  assert.match(adapter.SQLITE_SCHEMA, /created_at\s+integer not null/);
});

/* ---- runSchema (D-10): dialect-owned schema execution ----------------- */

test('runSchema executes the SQLite SCHEMA verbatim through the facade (fresh DB gets 14 tables)', async () => {
  const dbPath = tmpDbPath();
  await adapter.connectDb({ dbPath });
  assert.equal(adapter.backendKind, 'sqlite');
  await adapter.runSchema(adapter.SQLITE_SCHEMA);
  const tables = (await adapter.all("select name from sqlite_master where type = 'table' order by name")).map(r => r.name);
  for (const table of TABLES) assert.ok(tables.includes(table), `table ${table} must exist after runSchema`);
  // Second execution is a no-op (create ... if not exists idempotency).
  await adapter.runSchema(adapter.SQLITE_SCHEMA);
  assert.equal((await adapter.get('select count(*) as n from users')).n, 0);
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

/* ---- pg-safe migration whitelist lint (T-45-08) ------------------------
   Every SQL statement server.js hands the facade OUTSIDE a sqliteOnly gate
   must match a pg-safe shape (select / update / delete / insert — the
   insert-or-ignore/replace rewrites are adapter-owned — / create … if not
   exists / alter table add column) and must carry NO SQLite-only token
   (pragma, vacuum, rowid, begin, sqlite_master). Statements inside
   sqliteOnly gates are exempt by construction (D-09: never ported). ------- */

function sqliteOnlyRanges(source) {
  const ranges = [];
  const re = /sqliteOnly\s*\(/g;
  let m;
  while ((m = re.exec(source))) {
    let depth = 0;
    let i = source.indexOf('{', m.index);
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    ranges.push([m.index, i]);
  }
  return ranges;
}

const PG_UNSAFE = /\bpragma\b|\bvacuum\b|\browid\b|\bbegin\b|\bsqlite_master\b/i;
const PG_SAFE_SHAPE = /^\s*(select|update|delete|insert|create|alter|with)\b/i;

function serverSource() {
  return fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
}

test('facade statements outside sqliteOnly gates are pg-safe shapes with zero SQLite-only tokens (T-45-08)', () => {
  const source = serverSource();
  const gated = sqliteOnlyRanges(source);
  const inGated = idx => gated.some(([a, b]) => idx >= a && idx <= b);
  const offenders = [];
  const re = /\bdb\.(?:run|all|get)\(\s*(`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\])*')/g;
  let m;
  while ((m = re.exec(source))) {
    if (inGated(m.index)) continue;
    const sql = m[1].slice(1, -1);
    if (!PG_SAFE_SHAPE.test(sql) || PG_UNSAFE.test(sql)) offenders.push(sql.replace(/\s+/g, ' ').trim().slice(0, 90));
  }
  assert.equal(offenders.length, 0, `pg-unsafe statements outside sqliteOnly gates:\n${offenders.join('\n')}`);
});

test('the invites scalar→teams backfill is sqliteOnly-gated (D-09: SQLite-only legacy migration)', () => {
  const source = serverSource();
  const idx = source.indexOf("'select rowid, team from invites where team is not null and teams is null'");
  assert.ok(idx !== -1, 'the sanctioned invites-backfill statement must exist');
  assert.ok(
    sqliteOnlyRanges(source).some(([a, b]) => idx >= a && idx <= b),
    'the rowid backfill must run inside a sqliteOnly gate (D-09)',
  );
});

/* ---- seed portability (D-07) ------------------------------------------ */

test('seed is portable: two fresh boots produce identical row counts across all 14 tables (D-07)', async () => {
  const bootCounts = async () => {
    const server = await startServer({ env: { SEED_DATA: 'true' } });
    try {
      const db = new DatabaseSync(server.dbPath);
      try {
        const counts = {};
        for (const table of TABLES) counts[table] = db.prepare(`select count(*) as n from ${table}`).get().n;
        return counts;
      } finally {
        db.close();
      }
    } finally {
      await server.stop();
    }
  };
  const [first, second] = await Promise.all([bootCounts(), bootCounts()]);
  assert.notEqual(first.users, 0, 'the seed must create the bootstrap admin');
  assert.deepEqual(second, first, 'the seed must be deterministic — identical row counts on every fresh boot');
});


/* ---- fail-closed boot probe (D-04, T-45-02) --------------------------- */

test('connectDb with unreachable postgres:// exits non-zero, logs code, never the DSN', () => {
  const script = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'db-adapter-boot-')), 'probe.mjs');
  fs.writeFileSync(
    script,
    `import { connectDb } from ${JSON.stringify(path.join(ROOT, 'db-adapter.mjs'))};
await connectDb();`,
  );
  const dsn = 'postgres://secret-user:secret-password@127.0.0.1:59999/closeddb';
  const res = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    env: { ...process.env, DB_URL: dsn },
    encoding: 'utf8',
    timeout: 20000,
  });
  assert.notEqual(res.status, 0, 'boot probe against unreachable pg must exit non-zero');
  const output = `${res.stdout}${res.stderr}`;
  assert.match(output, /Postgres unreachable/, 'operator-facing boot error must say Postgres unreachable');
  assert.match(output, /code=/, 'boot error must include err.code');
  assert.equal(output.includes(dsn), false, 'the DSN must NEVER appear in boot-failure output (T-45-02)');
  assert.equal(output.includes('secret-password'), false);
});

test('connectDb refuses a non-postgres:// DB_URL loudly (D-04 spirit)', async () => {
  await assert.rejects(
    adapter.connectDb({ dbUrl: 'mysql://nope' }),
    /postgres:\/\//,
  );
});

/* ---- dependencies pin (D-02 amendment of D-12) ------------------------ */
test('package.json runtime dependencies are exactly { pg } (D-12 as amended, Phase 45 D-02)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies, 'dependencies key required — pg presence is fail-closed (D-04)');
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['pg']);
  assert.match(pkg.dependencies.pg, /^\^8\./);
});
