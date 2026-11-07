/* =====================================================================
   Database adapter (Phase 45, D-01/D-02/D-04/D-05/D-06/D-09/D-10) —
   the async dual-backend facade every db callsite goes through.

   Default backend is node:sqlite (DatabaseSync) — byte-identical to the
   pre-45 server, zero runtime modules loaded. When DB_URL is a
   postgres:// URL, the pg driver loads via dynamic import ONLY (D-02)
   and the same facade serves it. Boot is fail-closed (D-04): an
   unreachable Postgres refuses startup — never a silent SQLite
   fallback, and never the DSN in the error output.

   The facade is minimal (D-06): get / all / run / tx. Dialect
   differences are neutralized HERE, one branch site per
   incompatibility, each pinned by test/db-adapter.test.mjs (D-10) —
   callsites stay in portable common SQL.
   ===================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/* ---- LOG_LEVEL ladder — mirrors server.js conventions (debug|info|warn|error) ---- */
const LOG_LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const LOG_LEVEL_RAW = String(process.env.LOG_LEVEL || '');
const LOG_LEVEL = LOG_LEVEL_RAW in LOG_LEVELS ? LOG_LEVEL_RAW : 'info';
function logLine(level, msg) {
  if (LOG_LEVELS[level] < LOG_LEVELS[LOG_LEVEL]) return;
  console[level === 'debug' ? 'log' : level](msg);
}

/* ---- backend state --------------------------------------------------- */
export let backendKind = null; // 'sqlite' | 'pg' once connectDb has run (live binding)
let sqlite = null; // raw DatabaseSync handle (SQLite backend)
let pool = null; // pg Pool (pg backend)

/* ---- SQL rewrite layer (D-10) — pure, literal-aware, unit-pinned ------
   Every rewrite is a mechanical SQL-TEXT transform of an already
   parameterized statement; parameter values are never concatenated
   (T-45-01). Single-quoted spans are skipped verbatim. */

// pg needs an explicit conflict target for ON CONFLICT DO UPDATE. The only
// `insert or replace` sites in server.js target user_notif_prefs, whose
// composite PK is (workspace_id, user_id) — server.js SCHEMA.
const PG_CONFLICT_TARGETS = { user_notif_prefs: '(workspace_id, user_id)' };

// Split `sql` into literal (single-quoted) and rewriteable spans.
function splitLiterals(sql) {
  const parts = [];
  let rest = sql;
  while (rest.length) {
    const at = rest.indexOf("'");
    if (at === -1) {
      parts.push({ lit: false, text: rest });
      break;
    }
    if (at > 0) parts.push({ lit: false, text: rest.slice(0, at) });
    let end = at + 1;
    while (end < rest.length) {
      if (rest[end] === "'") {
        if (rest[end + 1] === "'") { end += 2; continue; } // escaped ''
        break;
      }
      end += 1;
    }
    parts.push({ lit: true, text: rest.slice(at, end + 1) });
    rest = rest.slice(end + 1);
  }
  return parts;
}

export function toPgSql(sql) {
  const parts = splitLiterals(sql);
  let pgConflict = null; // 'nothing' | { target, sets: [col, ...] }

  const rewritten = parts.map(({ lit, text }) => {
    if (lit) return text;
    let out = text;

    // insert or ignore → plain insert (suffix on conflict do nothing)
    out = out.replace(/\binsert\s+or\s+ignore\s+into\b/gi, () => {
      pgConflict = pgConflict ?? 'nothing';
      return 'insert into';
    });

    // insert or replace → plain insert (suffix on conflict do update … excluded)
    out = out.replace(/\binsert\s+or\s+replace\s+into\s+([A-Za-z_][\w]*)\b/gi, (_m, table) => {
      pgConflict = { table: table.toLowerCase() };
      return `insert into ${table}`;
    });

    // begin immediate → begin
    out = out.replace(/\bbegin\s+immediate\b/gi, 'begin');

    // col collate nocase = ?  →  lower(col) = lower(?)
    out = out.replace(/([A-Za-z_][\w.]*)\s+collate\s+nocase(\s*=\s*)\?/gi, (_m, col, op) => `lower(${col})${op}lower(?)`);
    // remaining col collate nocase → lower(col)
    out = out.replace(/([A-Za-z_][\w.]*)\s+collate\s+nocase/gi, (_m, col) => `lower(${col})`);

    // ? → $1..$n in order
    let n = 0;
    out = out.replace(/\?/g, () => `$${++n}`);
    return out;
  });

  let result = rewritten.join('');

  if (pgConflict === 'nothing') {
    result = result.replace(/\s*;\s*$/, '');
    result += ' on conflict do nothing';
  } else if (pgConflict) {
    // Parse the column list from the (rewritten) insert to build the update set.
    const m = result.match(/\binsert\s+into\s+[A-Za-z_][\w]*\s*\(([^)]*)\)/i);
    const cols = m ? m[1].split(',').map(c => c.trim().replace(/^"|"$/g, '')).filter(Boolean) : [];
    const target = PG_CONFLICT_TARGETS[pgConflict.table];
    const sets = cols.map(c => `${c} = excluded.${c}`).join(', ');
    result = result.replace(/\s*;\s*$/, '');
    result += ` on conflict ${target ?? '(?)'} do update set ${sets}`;
  }
  return result;
}

/* ---- pg schema variant (D-10): nocase stripped + functional unique index.
   SQLITE_SCHEMA mirrors server.js SCHEMA verbatim (the mirror-sync test pins
   the pair so neither can drift); runSchema() routes the server's SCHEMA
   here on a pg boot. D-11 (one-way, checkpoint-approved): the workspace
   document stays a plain `text` column — jsonb is never introduced. ------ */
export const SQLITE_SCHEMA = `
  create table if not exists users (
    id            text primary key,
    email         text not null unique collate nocase,
    name          text not null,
    password_hash text not null,
    member_id     text,
    created_at    integer not null,
    last_login_at integer,
    locale        text,
    two_fa_enabled   integer not null default 0,
    two_fa_secret    text,
    two_fa_last_step integer not null default 0,
    is_instance_admin integer not null default 0
  );
  create table if not exists totp_factors (
    id         text primary key,
    user_id    text not null references users(id) on delete cascade,
    name       text not null,
    secret     text not null,
    last_step  integer not null default 0,
    created_at integer not null
  );
  create index if not exists totp_factors_user on totp_factors(user_id);
  create table if not exists oidc_identities (
    id            text primary key,
    user_id       text not null references users(id) on delete cascade,
    issuer        text not null,
    subject       text not null,
    created_at    integer not null,
    last_login_at integer
  );
  create unique index if not exists oidc_identities_subject on oidc_identities(issuer, subject);
  create index if not exists oidc_identities_user on oidc_identities(user_id);
  create table if not exists sessions (
    token_hash text primary key,
    user_id    text not null references users(id) on delete cascade,
    created_at integer not null,
    expires_at integer not null,
    label      text,
    ip         text,
    last_seen_at integer,
    user_agent text
  );
  create index if not exists sessions_expiry on sessions(expires_at);
  create table if not exists login_challenges (
    challenge_token_hash text primary key,
    user_id              text not null references users(id) on delete cascade,
    expires_at           integer not null,
    attempts             integer not null default 0
  );
  create index if not exists login_challenges_expiry on login_challenges(expires_at);
  create table if not exists workspaces (
    id         text primary key,
    slug       text,
    name       text not null,
    color      text,
    doc        text not null,
    revision   integer not null default 1,
    created_at integer not null,
    updated_at integer not null
  );
  create table if not exists memberships (
    workspace_id text not null references workspaces(id) on delete cascade,
    user_id      text not null references users(id) on delete cascade,
    role         text not null check (role in ('owner','admin','member','viewer')),
    member_id    text,
    primary key (workspace_id, user_id)
  );
  create table if not exists team_members (
    workspace_id text not null references workspaces(id) on delete cascade,
    team_id      text not null,
    member_id    text,
    user_id      text not null references users(id) on delete cascade,
    primary key (workspace_id, team_id, user_id)
  );
  create index if not exists team_members_user on team_members(workspace_id, user_id);
  create table if not exists invites (
    token_hash   text primary key,
    email        text,
    role         text not null check (role in ('admin','member','viewer')),
    team         text,
    teams        text,
    workspace_id text references workspaces(id) on delete cascade,
    created_by   text not null references users(id) on delete cascade,
    created_at   integer not null,
    expires_at   integer not null,
    used_at      integer,
    used_by      text
  );
  create index if not exists invites_expiry on invites(expires_at);
  create table if not exists recovery_codes (
    id         text primary key,
    user_id    text not null references users(id) on delete cascade,
    code_hash  text not null,
    used_at    integer,
    created_at integer not null
  );
  create index if not exists recovery_codes_user on recovery_codes(user_id);
  create table if not exists security_log (
    id         text primary key,
    user_id    text not null references users(id) on delete cascade,
    verb       text not null,
    created_at integer not null
  );
  create index if not exists security_log_user on security_log(user_id);
  create table if not exists audit_log (
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
  );
  create index if not exists audit_log_created on audit_log(created_at desc);
  create index if not exists audit_log_workspace on audit_log(workspace_id, created_at desc);
  create table if not exists reminders_sent (
    dedup_key    text primary key,
    workspace_id text not null,
    created_at   integer not null
  );
  create index if not exists reminders_sent_ws on reminders_sent(workspace_id, created_at);
  create table if not exists user_notif_prefs (
    workspace_id text not null,
    user_id      text not null,
    prefs        text not null,
    primary key (workspace_id, user_id)
  );
  /* openDb() adds this after the ensureColumn additive migrations
     (server.js:401) — carried here so the pg variant matches boot. */
  create unique index if not exists workspaces_slug_idx on workspaces(slug);
`;

/* Epoch-ms columns (Date.now() values) overflow pg's 32-bit integer, so the
   pg variant widens exactly these named columns to bigint. Boolean-ish and
   counter columns stay integer — that preserves server.js's `= 1`
   comparisons verbatim on pg (Pitfall: bigint≠int comparison churn). */
const PG_EPOCH_COLUMNS = new Set([
  'created_at',
  'updated_at',
  'expires_at',
  'last_seen_at',
  'last_login_at',
  'used_at',
]);

export function pgSchemaVariant(schema = SQLITE_SCHEMA) {
  // Line-scoped rewrite: `collate nocase` stripped everywhere; a column-def
  // line whose column name is an epoch column gets integer→bigint. DDL text
  // only — no literals carry either pattern (single-quoted spans are safe).
  const stripped = schema
    .split('\n')
    .map(line => {
      let out = line.replace(/\s+collate\s+nocase/gi, '');
      const col = out.match(/^\s*([A-Za-z_]\w*)\s+integer\b/);
      if (col && PG_EPOCH_COLUMNS.has(col[1].toLowerCase())) out = out.replace(/\binteger\b/, 'bigint');
      return out;
    })
    .join('\n');
  /* SQLite's `email … unique collate nocase` column constraint becomes, on
     pg, a plain unique column + this functional unique index (Pitfall: pg has
     no nocase collation — lower(email) IS the nocase semantics, D-10). */
  return `${stripped}
  create unique index if not exists users_email_nocase on users(lower(email));
`;
}

/* ---- runSchema (D-10): schema creation is dialect-owned, one branch site.
   server.js passes its SCHEMA; SQLite executes it verbatim, pg executes
   pgSchemaVariant(SCHEMA). Statement-per-facade-call split (node:sqlite
   prepare is single-statement; pg rewrites through run()). ---------------- */
export async function runSchema(schemaSql) {
  const sql = backendKind === 'pg' ? pgSchemaVariant(schemaSql) : schemaSql;
  for (const stmt of sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean)) await run(stmt);
}

/* ---- SQLite backend ---------------------------------------------------- */
const pgRewrite = sql => toPgSql(sql);

function sqliteRows(row) {
  // node:sqlite returns null-prototype rows; spread into plain objects so
  // both backends surface identical row shapes.
  return row ? { ...row } : undefined;
}
async function pgGet(sql, params) {
  const { rows } = await pool.query(pgRewrite(sql), params);
  return rows[0];
}
async function pgAll(sql, params) {
  const { rows } = await pool.query(pgRewrite(sql), params);
  return rows;
}
async function pgRun(sql, params) {
  const res = await pool.query(pgRewrite(sql), params);
  return { changes: res.rowCount }; // Pitfall 2: { changes } contract on BOTH backends
}
function sqliteRun(sql, params) {
  const { changes } = sqlite.prepare(sql).run(...params);
  return { changes }; // synthesize the exact { changes } shape (Pitfall 2)
}

/* Pitfall 10: the old sync path was implicitly serial. Async tx bodies can
   interleave awaits, so concurrent SQLite tx calls serialize on a
   promise-queue mutex — one tx at a time, exactly the begin-immediate
   discipline server.js transaction() had (server.js:1964–1974). */
let sqliteTxTail = Promise.resolve();
function sqliteTx(fn) {
  const run = sqliteTxTail.then(async () => {
    sqlite.exec('begin immediate');
    try {
      const out = await fn();
      sqlite.exec('commit');
      return out;
    } catch (err) {
      sqlite.exec('rollback');
      throw err;
    }
  });
  sqliteTxTail = run.then(() => {}, () => {}); // settled, never poisoned
  return run;
}

/* Pattern 2 (RESEARCH): pg transactions run on a CHECKED-OUT pool client —
   never pool.query('BEGIN') (pg docs Alert). Release happens in finally. */
async function pgTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    try {
      const scope = {
        get: async (sql, params) => (await client.query(pgRewrite(sql), params)).rows[0],
        all: async (sql, params) => (await client.query(pgRewrite(sql), params)).rows,
        run: async (sql, params) => ({ changes: (await client.query(pgRewrite(sql), params)).rowCount }),
      };
      const out = await fn(scope);
      await client.query('commit');
      return out;
    } catch (err) {
      await client.query('rollback');
      throw err;
    }
  } finally {
    client.release();
  }
}

function sqliteTxScope(fn) {
  const scope = {
    get: (sql, params) => sqliteRows(sqlite.prepare(sql).get(...params)),
    all: (sql, params) => sqlite.prepare(sql).all(...params).map(sqliteRows),
    run: (sql, params) => sqliteRun(sql, params),
  };
  return fn(scope);
}

/* ---- facade (D-05/D-06): async get / all / run / tx ------------------- */
export async function get(sql, params = []) {
  return backendKind === 'pg' ? pgGet(sql, params) : sqliteRows(sqlite.prepare(sql).get(...params));
}
export async function all(sql, params = []) {
  return backendKind === 'pg' ? pgAll(sql, params) : sqlite.prepare(sql).all(...params).map(sqliteRows);
}
export async function run(sql, params = []) {
  return backendKind === 'pg' ? pgRun(sql, params) : sqliteRun(sql, params);
}
export async function tx(fn) {
  if (backendKind === 'pg') return pgTx(fn);
  return sqliteTx(() => sqliteTxScope(fn));
}

/* ---- capability gate (D-09): pragma / wal_checkpoint / vacuum into are
   SQLite-only. On pg they no-op with one info line — never ported. ------ */
export async function sqliteOnly(fn, label, kind) {
  // `kind` is a dependency-injection seam for tests (no real pg server needed);
  // production always passes two args and reads the live backendKind.
  const effective = kind ?? backendKind;
  if (effective !== 'pg') return fn();
  logLine('info', `[db] sqlite-only op skipped (pg): ${label}`);
  return undefined;
}

/* ---- connectDb — backend selection + fail-closed boot probe (D-04) ---- */
function sqlitePath(opts = {}) {
  return (
    opts.dbPath ||
    process.env.DB_PATH ||
    path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'projects.db')
  );
}

export async function connectDb(opts = {}) {
  const dbUrl = opts.dbUrl !== undefined ? opts.dbUrl : process.env.DB_URL;

  if (dbUrl && dbUrl.startsWith('postgres://')) {
    let mod;
    try {
      mod = await import('pg'); // conditional load — D-02: SQLite path never touches pg
    } catch (err) {
      console.error(`[db] Postgres unreachable (code=${err.code ?? 'NOSQLSTATE'}): ${err.message}`);
      process.exit(1); // fail-closed: no SQLite fallback (D-04)
    }
    pool = new mod.Pool({
      connectionString: dbUrl,
      max: 10,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000,
    });
    // Pitfall 8: an idle-client network failure must log, not crash the process.
    pool.on('error', err => logLine('error', `[db] pool error: ${err.message}`));
    try {
      await pool.query('select 1'); // boot probe
    } catch (err) {
      console.error(`[db] Postgres unreachable (code=${err.code ?? 'NOSQLSTATE'}): ${err.message}`);
      process.exit(1); // err.code only — NEVER the DSN (T-45-02, D-04)
    }
    backendKind = 'pg';
    return;
  }

  if (dbUrl) {
    // Refuse ambiguous config loudly — a non-postgres:// DB_URL is a typo,
    // not a reason to guess (D-04 spirit).
    throw new Error(`[db] unsupported DB_URL scheme — only postgres:// URLs are supported (got a non-postgres:// value; D-04)`);
  }

  fs.mkdirSync(path.dirname(sqlitePath(opts)), { recursive: true });
  sqlite = new DatabaseSync(sqlitePath(opts));
  // The four pragmas move here from server.js openDb() (server.js:365–368).
  sqlite.exec('pragma journal_mode = wal');
  sqlite.exec('pragma foreign_keys = on');
  sqlite.exec('pragma busy_timeout = 5000');
  sqlite.exec('pragma synchronous = normal');
  backendKind = 'sqlite';
}

/* ---- ensureColumn (D-10): one branch site per incompatibility. The pragma
   table_info probe is SQLite-only; pg asks information_schema. Defs are
   byte-identical to the SCHEMA declarations on both backends (Pitfall P-B). */
export async function ensureColumn(table, name, def) {
  if (backendKind === 'pg') {
    const { rows } = await pool.query(
      `select column_name from information_schema.columns
       where table_schema = current_schema() and table_name = $1 and column_name = $2`,
      [table, name],
    );
    if (!rows.length) await pool.query(`alter table ${table} add column ${name} ${def}`);
    return;
  }
  const cols = sqlite.prepare(`pragma table_info(${table})`).all();
  if (!cols.some(c => c.name === name)) sqlite.exec(`alter table ${table} add column ${name} ${def}`);
}
/* Rule 3 deviation (Plan 03 Task 1): server.js shutdown + CLI paths call
   db.close(); the adapter owns the handle, so it owns close(). pg branch
   ends the pool; sqlite closes synchronously. */
export async function close() {
  if (backendKind === 'pg' && pool) {
    await pool.end();
    pool = null;
  } else if (sqlite) {
    sqlite.close();
    sqlite = null;
  }
  backendKind = null;
}
