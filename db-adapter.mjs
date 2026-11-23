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
import { foldForSearch } from './search-terms.mjs';

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
/* Phase 86 (BKBCK-01): the backup exporter's snapshot fence checks out a
   dedicated REPEATABLE READ READ ONLY client (db-adapter.mjs pgTx pattern,
   never pool.query('BEGIN')). The pool itself stays module-private; this
   accessor is the sanctioned read-only seam. Null until pg connects. */
export function pgPoolRef() {
  return pool;
}

/* ---- SQL rewrite layer (D-10) — pure, literal-aware, unit-pinned ------
   Every rewrite is a mechanical SQL-TEXT transform of an already
   parameterized statement; parameter values are never concatenated
   (T-45-01). Single-quoted spans are skipped verbatim. */

// pg needs an explicit conflict target for ON CONFLICT DO UPDATE. The only
// `insert or replace` sites in server.js target user_notif_prefs, whose
// composite PK is (workspace_id, user_id) — server.js SCHEMA.
const PG_CONFLICT_TARGETS = {
  user_notif_prefs: '(workspace_id, user_id)',
  saved_views: '(workspace_id, user_id, key, name)',
  push_subscriptions: '(endpoint)',
  webhook_deliveries: '(dedup_key)',
};

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
  let n = 0; // GLOBAL ? → $n counter — must span literal parts, else a ?
  // placed after a quoted literal renumbers from $1 (bind-count mismatch).

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

    // SQLite null-safe `is not ?` → pg `is distinct from ?` (pg refuses
    // `is not $n`; IS [NOT] DISTINCT FROM is the exact null-safe semantics).
    out = out.replace(/\bis\s+not\s+\?/gi, 'is distinct from ?');
    out = out.replace(/\bis\s+\?/gi, 'is not distinct from ?');

    // col collate nocase = ?  →  lower(col) = lower(?)
    out = out.replace(/([A-Za-z_][\w.]*)\s+collate\s+nocase(\s*=\s*)\?/gi, (_m, col, op) => `lower(${col})${op}lower(?)`);
    // col = ? collate nocase → lower(col) = lower(?) — SQLite's post-parameter
    // collation form (uniqueSlug/wsBySlug/instance-admin stamp/pending invites).
    // Must run before the bare-nocase rule, and the ? → $n pass below runs
    // after so lower(?) keeps its parameter.
    out = out.replace(
      /([A-Za-z_][\w.]*)\s*=\s*\?\s+collate\s+nocase/gi,
      (_m, col) => `lower(${col}) = lower(?)`,
    );
    // remaining col collate nocase → lower(col) (order by / bare references)
    out = out.replace(/([A-Za-z_][\w.]*)\s+collate\s+nocase/gi, (_m, col) => `lower(${col})`);

    // ? → $1..$n in order (global across literal parts — see hoisted counter)
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
    /* D-13 (Phase 67): Entra AAD object id, persisted at OIDC login —
       server-only, never serialized to clients (mirrors server.js SCHEMA).
       Named aad_oid, NOT oid: SQLite 3.54+ refuses ADD COLUMN on reserved
       alias names (mirror of the server.js rename rationale). */
    aad_oid       text,
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
    updated_at integer not null,
    archived   integer not null default 0
  );
  create table if not exists memberships (
    workspace_id text not null references workspaces(id) on delete cascade,
    user_id      text not null references users(id) on delete cascade,
    role         text not null check (role in ('owner','admin','member','viewer')),
    member_id    text,
    /* Phase 81 (D-81-6): membership origin — group:<guid> | invite | manual | null(legacy). */
    provenance   text,
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
    role         text not null check (role in ('owner','admin','member','viewer')),
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
  /* Phase 59 (PUSH-01): browser push subscriptions, endpoint UNIQUE for the
     replace-on-resubscribe — mirrors server.js SCHEMA verbatim. */
  create table if not exists push_subscriptions (
    workspace_id text not null,
    user_id      text not null,
    endpoint     text not null unique,
    p256dh       text not null,
    auth         text not null,
    label        text not null default '',
    created_at   integer,
    last_seen_at integer
  );
  /* Phase 57 (D-05): per-user saved views + live column state, sentinel name ''
     for the live row — mirrors server.js SCHEMA verbatim. */
  create table if not exists saved_views (
    workspace_id   text not null,
    user_id        text not null,
    key            text not null,
    name           text not null,
    blob           text not null,
    schema_version integer not null,
    primary key (workspace_id, user_id, key, name)
  );
  /* Phase 46 (MCP): API keys for external clients. Mirrors server.js SCHEMA —
     hash-at-rest, prefix for display, mandatory expiry, read/write scope. */
  create table if not exists api_keys (
    id           text primary key,
    user_id      text not null references users(id) on delete cascade,
    workspace_id text not null references workspaces(id) on delete cascade,
    label        text not null,
    key_hash     text not null unique,
    prefix       text not null,
    scope        text not null check (scope in ('read','write')),
    created_at   integer not null,
    expires_at   integer not null,
    last_used_at integer,
    revoked_at   integer
  );
  create index if not exists api_keys_user on api_keys(user_id);
  create index if not exists api_keys_ws on api_keys(workspace_id);
  /* Phase 67 (WHK-05): webhook hook registry — mirrors server.js SCHEMA
     verbatim. Mirror tables only; hook config never enters the doc (D-10). */
  create table if not exists webhook_hooks (
    id           text primary key,
    workspace_id text not null,
    project_id   text not null,
    url          text not null,
    secret       text not null,
    format       text not null default 'teams-adaptive',
    events       text not null default '[]',
    status       text not null default 'active',
    created_by   text not null,
    created_at   integer not null
  );
  create index if not exists webhook_hooks_project on webhook_hooks(workspace_id, project_id);
  /* Phase 67 (WHK-03): exactly-once delivery claim — UNIQUE dedup_key IS the
     claim (INSERT OR IGNORE / on-conflict do nothing); mirrors server.js.
     'ctx' (67-02): diff-time event snapshot JSON, mirrors server.js SCHEMA. */
  create table if not exists webhook_deliveries (
    id               text primary key,
    workspace_id     text not null,
    hook_id          text not null,
    event            text not null,
    dedup_key        text not null unique,
    ctx              text not null default '',
    payload_hash     text not null default '',
    attempt          integer not null default 0,
    status           text not null default 'pending',
    next_attempt_at  integer,
    last_status_code integer,
    last_error       text not null default '',
    created_at       integer not null,
    delivered_at     integer
  );
  create index if not exists webhook_deliveries_due on webhook_deliveries(status, next_attempt_at);
  /* Phase 68 (POL-02, D-05): email transport claim — mirrors webhook_deliveries'
     exactly-once shape (UNIQUE dedup_key + INSERT OR IGNORE) with the SAME
     retry state columns; webhook-retry.js math is shared verbatim (D-06).
     'ctx' carries everything the email rebuild needs at delivery time. */
  create table if not exists email_outbox (
    id               text primary key,
    workspace_id     text not null,
    dedup_key        text not null unique,
    kind             text not null,
    recipient        text not null,
    ctx              text not null default '',
    attempt          integer not null default 0,
    status           text not null default 'pending',
    next_attempt_at  integer,
    last_status_code integer,
    last_error       text not null default '',
    created_at       integer not null,
    delivered_at     integer
  );
  create index if not exists email_outbox_due on email_outbox(status, next_attempt_at);
  /* GROUP-MAPPING (Phase 80, GM-01): mirrors server.js SCHEMA verbatim.
     workspace_id has NO on-delete-cascade on purpose (D-82-6 — dead
     mappings survive workspace deletion); role CHECK is the locked 3-token
     set; kind distinguishes the dedicated operator-mapping row kind. */
  create table if not exists group_mappings (
    id           text primary key,
    group_guid   text not null,
    workspace_id text not null,
    role         text not null check (role in ('owner','admin','member')),
    kind         text not null default 'workspace' check (kind in ('workspace','operator')),
    label        text,
    created_by   text references users(id) on delete set null,
    created_at   integer not null,
    updated_at   integer not null
  );
  create unique index if not exists group_mappings_pair on group_mappings(group_guid, workspace_id);
  create table if not exists instance_roles (
    id           text primary key,
    user_id      text not null references users(id) on delete cascade,
    role         text not null check (role in ('backup_operator','restore_operator')),
    granted_by   text not null references users(id) on delete set null,
    granted_at   integer not null
  );
  create unique index if not exists instance_roles_pair on instance_roles(user_id, role);
  /* BACKUP TASKS (Phase 87, 87-01, BKBCK-02/BKBCK-03): pg twin of server.js
     SCHEMA — mirror-sync pinned by test/db-adapter.test.mjs — runSchema
     splits statements on ';-newline', so comments here never end a line
     with a semicolon. cron is the raw 5-field string (D-04 one-way,
     ratified 2026-11-21) — next_run_at is a persisted cache (never
     re-parsed at tick, D-07 NULL while disabled) — tz defaults
     Europe/Paris (no users.tz column, 87-01 checkpoint) — retention
     defaults 7/4/12/5 (D-09). next_run_at/started_at/finished_at are
     registered in PG_EPOCH_COLUMNS below. */
  create table if not exists backup_tasks (
    id                  text primary key,
    name                text not null,
    scope               text not null default '{}',
    cron                text not null,
    tz                  text not null default 'Europe/Paris',
    enabled             integer not null default 1,
    retention_daily     integer not null default 7,
    retention_weekly    integer not null default 4,
    retention_monthly   integer not null default 12,
    retention_yearly    integer not null default 5,
    next_run_at         integer,
    last_notified_state text,
    s3_enabled          integer not null default 0,
    created_at          integer not null,
    updated_at          integer not null
  );
  create index if not exists backup_tasks_name on backup_tasks(name);
  /* BACKUP RUNS (Phase 87, 87-01): pg twin — task_id NULL = manual Run-now
     archive outside rotation (D-11, ratified 2026-11-21); CHECK-constrained
     trigger/status enums; run rows are history and never cascade on task
     delete ('deleted' status marks rotation-removed rows). Phase 88
     (D-88-2): 'upload_failed' joins the terminal status set ('uploading' is
     a stage inside 'running', not a status — the stage rides the D-19
     payload); pg tables are created fresh from this variant each boot. */
  create table if not exists backup_runs (
    id           text primary key,
    task_id      text,
    scope        text not null default '{}',
    trigger      text not null check (trigger in ('manual','scheduled')),
    status       text not null check (status in ('running','succeeded','failed','upload_failed','interrupted','skipped_overlap','deleted')),
    started_at   integer not null,
    finished_at  integer,
    duration_ms  integer,
    size_bytes   integer,
    sha256       text,
    filename     text,
    error        text,
    /* Phase 89 (D-89-15, 89-03): per-run upload truth — the restore list's
       honest S3 badge source; mirrors the server.js SCHEMA declaration
       byte-for-byte (pg tables are created fresh from this variant each
       boot; existing dbs get the additive ensureColumn twin). */
    uploaded     integer not null default 0,
    /* Phase 90 (D-90-11, 90-02): the verify-checksum result — nullable until
       the first verify lands (null = never checked, 1 = match, 0 = mismatch —
       a comment here must never end a line with a semicolon, runSchema splits
       statements on ';-newline'). checksum_checked_at is the SERVER ISO
       timestamp of that verify. Mirrors the server.js SCHEMA declaration
       byte-for-byte (pg tables are created fresh from this variant each
       boot; existing dbs get the additive ensureColumn twin). */
    checksum_ok          integer,
    checksum_checked_at  text,
    created_at   integer not null
  );
  create index if not exists backup_runs_task on backup_runs(task_id, created_at);
  /* RESTORE RUNS (Phase 89, 89-02, BKRST-02/D-89-2): pg twin of server.js
     SCHEMA — background restore run rows (created running → done|failed,
     D-89-2) with stage the D-89-29 coarse vocabulary CHECK-constrained —
     summary carries the D-89-7 skip report while snapshot_run_id/tag
     carry the D-89-5 pre-restore snapshot link. runSchema splits
     statements on ';-newline', so comments here never end a line with a
     semicolon. started_at/finished_at/created_at are registered in
     PG_EPOCH_COLUMNS below. */
  create table if not exists restore_runs (
    id               text primary key,
    scope            text not null default '{}',
    trigger          text not null check (trigger in ('import_new','overwrite','instance')),
    status           text not null check (status in ('running','done','failed','interrupted')),
    stage            text not null default 'fetching' check (stage in ('fetching','validating','restoring','verifying','done','failed')),
    final_name       text,
    summary          text,
    snapshot_run_id  text,
    snapshot_tag     text,
    error            text,
    started_at       integer not null,
    finished_at      integer,
    created_at       integer not null
  );
  create index if not exists restore_runs_created on restore_runs(created_at);
  /* RESTORE LOCK (Phase 89, 89-02, D-89-31): engine-neutral global restore
     claim, single-row CAS (claimed_by is null is the compare-and-set); seed
     idempotent via "on conflict do nothing" — valid on BOTH engines (SQLite
     3.24+ and pg 9.5+), so the pg variant passes it through verbatim. Must
     NOT use "insert or ignore": pgSchemaVariant is a DDL-only rewrite and
     sqlite-only DML here fails pg boot with 42601 (UAT-89 gap G-89-2).
     claimed_at is registered in PG_EPOCH_COLUMNS below. */
  create table if not exists restore_lock (
    id          integer primary key check (id = 1),
    claimed_by  text,
    claimed_at  integer
  );
  insert into restore_lock (id, claimed_by, claimed_at) values (1, null, null) on conflict do nothing;
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
  'next_attempt_at',
  'delivered_at',
  'next_run_at',
  'started_at',
  'finished_at',
  'claimed_at', // Phase 89 (89-02, D-89-31): restore_lock claim stamp
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

/* ---- full-text search seam (Phase 58, SEARCH-01/03/04, D-07/D-09/D-11/D-12)
   The shadow `task_fts` index is maintained EXPLICITLY by the adapter
   (D-09: no SQLite triggers — one code path for both backends, proven by
   test). Sync is called IN-TRANSACTION by both write sites (server.js
   doc-PUT funnel + mcp.js writeDoc, D-07/D-10) and receives the TX SCOPE
   as its first argument — on pg, module-level run() inside a tx body
   would land OUTSIDE the checked-out client (Pitfall 2), so every index
   write goes through `scope.run`.

   pg parity (58-02, D-12): a `task_search_projection` table carries the
   JS-folded plain text (foldForSearch — the SAME folding as the SQLite
   index, so accent parity holds by construction) plus a tsvector built
   with to_tsvector('simple', …) over a GIN index. NO dictionary/trigram
   extension anywhere — folding happens in JS before the projection is
   stored (D-12). fts_meta is the shared sweep marker on both backends. */

/* The HTML-strip idiom shared with src/core/searchall.js (D-06 snippet
   model) — one space per tag so adjacent words never fuse into one
   FTS token. */
const stripTags = s => String(s ?? '').replace(/<[^>]+>/g, ' ');

/* [Phase 65, 65-05 D-06] Subtask titles join the index text. Titles are
   walked in buildTree order — (position, arrayIndex) per parentId group,
   depth-first — by a local import-free walk (db-adapter mirrors the
   subtree.js comparator rule; byte-parity is pinned by the FTS suites). */
function orderedSubtaskTitles(t, fold) {
  const list = (Array.isArray(t?.subtasks) ? t.subtasks : []).filter(
    s => s && typeof s === 'object' && typeof s.title === 'string' && s.title,
  );
  const out = [];
  const walk = parentId => {
    const kids = [];
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if ((s.parentId ?? null) === parentId) kids.push({ s, i });
    }
    kids.sort((a, b) => (a.s.position - b.s.position) || (a.i - b.i));
    for (const { s } of kids) {
      out.push(fold ? foldForSearch(s.title).text : s.title);
      walk(s.id);
    }
  };
  walk(null);
  return out;
}

/* Cheap structure signature for the unchanged-check: RAW titles in tree
   order — a retitle or a delete changes it, so the row re-indexes on the
   task's next funnel write (D-08, no sweep). Empty subtree → '' — no
   special case. */
function subtaskTitleSignature(t) {
  return orderedSubtaskTitles(t, false).join('\u0000');
}

/* The folded subtask-title suffix appended to the index body text —
   computed ONCE per task and fed to BOTH dialects (symmetry rule:
   byte-identical SQLite/pg parity, pinned by test/copy-sqlite-to-pg.test.mjs).
   No hand-rolled normalization: the same foldForSearch the task title and
   desc go through. */
function foldedSubtaskSuffix(t) {
  const folded = orderedSubtaskTitles(t, true);
  return folded.length ? ' ' + folded.join(' ') : '';
}

/* D-11: the tokenizer is LOCKED at table-creation time (unicode61 +
   remove_diacritics 2 — "elodie" finds "Élodie"); changing it later
   requires dropping and rebuilding task_fts for every workspace.
   ws_id is an UNINDEXED column so per-workspace deletes/rebuilds
   (ftsSweep, D-08) and per-workspace queries can filter without
   touching the match layer. */
export async function ensureSearchIndex() {
  if (backendKind === 'pg') {
    // D-12: folded projection + 'simple' tsvector over GIN — no extension deps.
    await run(`create table if not exists task_search_projection (
    workspace_id text not null, task_id text not null, project_id text not null,
    folded text not null, projection tsvector not null,
    primary key (workspace_id, task_id)
  )`);
    await run('create index if not exists task_search_projection_ts on task_search_projection using gin (projection)');
    // fts_meta is the shared sweep marker on BOTH backends (one ftsSweep logic).
    await run('create table if not exists fts_meta (workspace_id text primary key, task_count integer not null default 0)');
    return;
  }
  await run(`create virtual table if not exists task_fts using fts5(
  ws_id UNINDEXED, task_id UNINDEXED, project_id UNINDEXED, title, body,
  tokenize = 'unicode61 remove_diacritics 2'
)`);
  await run('create table if not exists fts_meta (workspace_id text primary key, task_count integer not null default 0)');
}

/* In-tx diff sync (D-07): derives the index writes from the stored-vs-next
   task diff keyed by t.id — the same Set/Map shape as the funnel's
   storedFileIds diff. No-op when no task id/title/desc/project changed.
   The diff loop is shared; only the row write statements branch per
   dialect (D-09). Contentless-safe: plain FTS5 delete + insert per
   changed row. pg: every write goes through the passed tx scope
   (Pitfall 2) into task_search_projection via an on-conflict upsert. */
export async function syncTaskFts(scope, wsId, storedDoc, next) {
  if (!backendKind) return;
  const pg = backendKind === 'pg';
  const stored = new Map(
    (Array.isArray(storedDoc?.data?.tasks) ? storedDoc.data.tasks : [])
      .map(t => [t?.id, t])
      .filter(([id]) => id),
  );
  const upcoming = new Map(
    (Array.isArray(next?.data?.tasks) ? next.data.tasks : [])
      .map(t => [t?.id, t])
      .filter(([id]) => id),
  );
  const remove = (id) =>
    pg
      ? scope.run('delete from task_search_projection where workspace_id = ? and task_id = ?', [wsId, id])
      : scope.run('delete from task_fts where ws_id = ? and task_id = ?', [wsId, id]);
  const insert = (id, t) => {
    const foldedTitle = foldForSearch(t.title).text;
    /* 65-05 (D-06): the folded subtask-title suffix is computed once here
       and consumed by BOTH dialect branches below — one string, byte-identical
       parity. */
    const foldedBody = foldForSearch(stripTags(t.desc)).text + foldedSubtaskSuffix(t);
    return pg
      ? scope.run(
          `insert into task_search_projection (workspace_id, task_id, project_id, folded, projection)
           values (?, ?, ?, ?, to_tsvector('simple', ?))
           on conflict (workspace_id, task_id) do update set
             project_id = excluded.project_id, folded = excluded.folded,
             projection = to_tsvector('simple', excluded.folded)`,
          [wsId, id, String(t.project ?? ''), `${foldedTitle} ${foldedBody}`, `${foldedTitle} ${foldedBody}`],
        )
      : scope.run('insert into task_fts (ws_id, task_id, project_id, title, body) values (?,?,?,?,?)', [
          wsId,
          id,
          String(t.project ?? ''),
          foldedTitle,
          foldedBody,
        ]);
  };
  let moved = 0;
  for (const [id, t] of stored) {
    const nt = upcoming.get(id);
    /* 65-05 (D-06/D-08, Pitfall 4): the unchanged-check also compares the
       subtask-title signature — a retitle or delete of any subtask (at any
       depth) re-indexes the row on the task's next funnel write. */
    if (nt && nt.title === t.title && nt.desc === t.desc && nt.project === t.project && subtaskTitleSignature(nt) === subtaskTitleSignature(t)) continue; // unchanged → index untouched (SEARCH-03 empty edge)
    await remove(id);
    if (nt) await insert(id, nt);
    moved++;
  }
  for (const [id, t] of upcoming) {
    if (stored.has(id)) continue; // new task → insert
    await insert(id, t);
    moved++;
  }
  if (!moved) return;
  const counted = pg
    ? await scope.get('select count(*) as n from task_search_projection where workspace_id = ?', [wsId])
    : await scope.get('select count(*) as n from task_fts where ws_id = ?', [wsId]);
  await scope.run(
    'insert into fts_meta (workspace_id, task_count) values (?, ?) on conflict(workspace_id) do update set task_count = excluded.task_count',
    [wsId, counted.n],
  );
}

/* Terms arrive ALREADY SANITIZED (searchTerms output — [a-z0-9]+ tokens);
   the adapter is the only site that builds the match expression: implicit
   AND of prefix tokens (`tok* tok2*` on SQLite / `tok:* & tok2:*` on pg,
   D-13), ranked order with a task_id tiebreak for deterministic ordering.
   pg: ts_rank desc over the folded projection (A4 accepts ts_rank quality
   for this scale); parameterized only (T-58-04). */
export async function searchTasks(wsId, terms, limit = 30) {
  if (!Array.isArray(terms) || !terms.length) return [];
  if (backendKind === 'pg') {
    const tsq = terms.map(t => `${t}:*`).join(' & ');
    return all(
      `select task_id, project_id, folded from task_search_projection
       where workspace_id = ? and projection @@ to_tsquery('simple', ?)
       order by ts_rank(projection, to_tsquery('simple', ?)) desc, task_id limit ?`,
      [wsId, tsq, tsq, limit],
    );
  }
  const match = terms.map(t => `${t}*`).join(' ');
  return all('select task_id, project_id from task_fts where task_fts match ? and ws_id = ? order by rank, task_id limit ?', [
    match,
    wsId,
    limit,
  ]);
}

/* D-08 boot sweep: cheap staleness check (marker row + live count vs
   indexed count) — rebuild this workspace's rows only when stale,
   missing or empty. Boot runs OUTSIDE any tx, so module-level run/get
   here is correct (no scope threading) on both backends. pg rebuild is
   plain delete+insert runs (no explicit tx needed in boot's single
   process); copy-sqlite-to-pg.mjs compatibility is not required — the
   boot sweep heals a copied-but-empty projection table (RESEARCH A2).
   Returns the workspaces swept. */
export async function ftsSweep(wsId, doc) {
  if (!backendKind) return 0;
  const tasks = (Array.isArray(doc?.data?.tasks) ? doc.data.tasks : []).filter(t => t?.id);
  const pg = backendKind === 'pg';
  const marker = await get('select task_count as n from fts_meta where workspace_id = ?', [wsId]);
  const indexed = pg
    ? await get('select count(*) as n from task_search_projection where workspace_id = ?', [wsId])
    : await get('select count(*) as n from task_fts where ws_id = ?', [wsId]);
  if (marker && marker.n === tasks.length && indexed.n === tasks.length) return 0; // healthy — no rewrites
  if (pg) {
    await run('delete from task_search_projection where workspace_id = ?', [wsId]);
    for (const t of tasks) {
      const foldedTitle = foldForSearch(t.title).text;
      const foldedBody = foldForSearch(stripTags(t.desc)).text + foldedSubtaskSuffix(t); // 65-05: same suffix as syncTaskFts insert — sweep parity
      await run(
        `insert into task_search_projection (workspace_id, task_id, project_id, folded, projection)
         values (?, ?, ?, ?, to_tsvector('simple', ?))
         on conflict (workspace_id, task_id) do update set
           project_id = excluded.project_id, folded = excluded.folded,
           projection = to_tsvector('simple', excluded.folded)`,
        [wsId, t.id, String(t.project ?? ''), `${foldedTitle} ${foldedBody}`, `${foldedTitle} ${foldedBody}`],
      );
    }
    await run(
      'insert into fts_meta (workspace_id, task_count) values (?, ?) on conflict(workspace_id) do update set task_count = excluded.task_count',
      [wsId, tasks.length],
    );
    return tasks.length;
  }
  await run('begin immediate');
  try {
    await run('delete from task_fts where ws_id = ?', [wsId]);
    for (const t of tasks) {
      await run('insert into task_fts (ws_id, task_id, project_id, title, body) values (?,?,?,?,?)', [
        wsId,
        t.id,
        String(t.project ?? ''),
        foldForSearch(t.title).text,
        foldForSearch(stripTags(t.desc)).text + foldedSubtaskSuffix(t), // 65-05: same suffix as syncTaskFts insert — sweep parity
      ]);
    }
    await run(
      'insert into fts_meta (workspace_id, task_count) values (?, ?) on conflict(workspace_id) do update set task_count = excluded.task_count',
      [wsId, tasks.length],
    );
    await run('commit');
    return tasks.length;
  } catch (err) {
    await run('rollback');
    throw err;
  }
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
      /* Pitfall 1: pg decodes int8 (bigint) columns as JS strings to avoid
         precision loss. Every epoch-ms column is bigint in the pg variant,
         and the app contract carries epoch-ms as JS numbers (SQLite parity —
         client math and JSON payloads break on strings). Coerce in the
         adapter (one branch site, D-10): epoch values (Date.now() ≈ 1.7e12)
         sit far below Number.MAX_SAFE_INTEGER, so Number() is lossless. */
      const pgModule = mod.default ?? mod;
      pgModule.types.setTypeParser(20, v => (v === null || v === undefined ? v : Number(v)));
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
