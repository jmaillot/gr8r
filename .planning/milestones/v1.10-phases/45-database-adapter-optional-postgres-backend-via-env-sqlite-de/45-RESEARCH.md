# Phase 45: Database adapter — optional Postgres backend via env, SQLite default - Research

**Researched:** 2026-11-07
**Domain:** Database abstraction layer — node-postgres (`pg`) adapter over an existing single-file `node:sqlite` server
**Confidence:** HIGH (codebase inventory fully verified this session; pg semantics verified against official docs + npm registry)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Driver & D-12 contract**
- **D-01:** Driver is `node-postgres` (`pg`) — official, pure JS, actively maintained, alpine-compatible.
- **D-02:** D-12 amendment by **conditional loading**: `pg` is required/installed/used ONLY when `DB_URL` is a `postgres://` URL. Without it the instance remains 100% Node built-ins. `test/dependencies.test.mjs` is amended to allow `pg` explicitly and to pin the new Dockerfile COPY targets.
- **D-03:** Single Docker image includes `pg` (node_modules added to the runtime stage; the COPY pin amended accordingly). No image variants. DEPLOY.md documents the pg-enabled deployment.
- **D-04:** Boot is **fail-closed**: if `DB_URL` is set but Postgres is unreachable, the server refuses to start with a clear error — no silent SQLite fallback.

**Async architecture**
- **D-05:** **Unified async facade** `db.get / db.all / db.run / db.tx(fn)`. All ~216 sync `db.*` callsites convert to `await`.
- **D-06:** Facade stays **minimal (4 methods)** keeping existing SQL; no `node:sqlite`-mirror API, no repository layer.
- **D-07:** Transactions go through `db.tx(fn)`. Seed stays **portable common SQL**. Exactly-once claim contracts preserved as-is — **no** pg advisory locks this phase.
- **D-08:** Opt-in test matrix: existing SQLite suite stays the base; critical paths additionally run against ephemeral Postgres when `POSTGRES_TEST_URL` is provided, skipped otherwise. No CI service by default.

**Dialect scope**
- **D-09:** `vacuum into` backups and `pragma` stay **SQLite-only**. Under Postgres, backups are out of scope (operator runs `pg_dump`). Additive migrations become idempotent on pg.
- **D-10:** SQL at callsites is **common dialect** (no new `collate nocase`, no `rowid` in new code); the adapter owns per-dialect branch points, one branch site per incompatibility, each pinned by tests. Existing SQLite-isms are neutralized inside the adapter.
- **D-11:** Workspace JSON document stored **as-is** in a text/jsonb column — no data-model rework.

**Existing data**
- **D-12:** Switching an existing SQLite install uses a **one-shot copy script** (scripts/). No automatic boot-time migration.
- **D-13:** Script scope: **all tables** in dependency order, per-table count verification before commit, refuses non-empty target. Documented in DEPLOY.md (stop server → run script → boot on pg).
- **D-14:** Source SQLite file never touched; `projects.db` kept as rollback backup. pg-mode never falls back to it (D-04).

### the agent's Discretion
- Connection-pool sizing defaults, healthcheck wiring, slow-query logging details — sensible defaults consistent with LOG_LEVEL conventions.

### Deferred Ideas (OUT OF SCOPE)
- pg advisory locks for exactly-once claims
- jsonb exploitation (server-side querying, partial indexes)
- Universal application-level JSON export backup
- SQL Server support — rejected 2026-11-07
</user_constraints>

## Summary

The codebase inventory is now fully verified: `server.js` contains exactly **185 `db.prepare` + 31 `db.exec` = 216 db callsites**, plus a `transaction(fn)` helper (server.js:1964–1974) using `begin immediate`/`commit`/`rollback` with ~22 call sites. There is **no `lastInsertRowid` usage anywhere** — all primary keys are `crypto.randomUUID()` strings (`uid()`, server.js:397) — which removes the classic SQLite↔Postgres autoincrement friction entirely. The `INSERT OR IGNORE` / `INSERT OR REPLACE` SQLite upsert syntax appears at 10 verified sites and `ON CONFLICT(…) DO UPDATE` already appears once (line 2744, portable syntax) — these are the largest single class of callsite-level dialect rewrites and they can be neutralized mechanically (`insert or ignore` → `insert … on conflict do nothing`; `insert or replace` → `on conflict do update`), pinned by test.

SQLite-isms split cleanly into three tiers: (1) **adapter-neutralized** — `insert or ignore/replace`, `insert … on conflict` mapping, the `begin immediate` transaction opener, `{changes}` result shape (pg `rowCount`), `pragma table_info` in `ensureColumn`; (2) **SQLite-only, guarded** — all `pragma wal_checkpoint`, all `vacuum into` backups, the `--backup` CLI (D-09): these live in clearly-delimited functions (backup functions at 2122/2198/2241/2396/2481/2585/5640–5641) and become no-ops or skip-branches under pg; (3) **callsite rewrites** — the 8 `collate nocase` sites (SQLite case-insensitive collation has no direct pg equivalent; adapter rewrites to `lower(col) = lower(?)` or a citext-equivalent branch inside the adapter), and the one `rowid` backfill loop (2142–2143, legacy migration — can stay SQLite-only). Type-mapping risk is low: booleans are stored as SQLite `integer 0/1` and queried as `= 1` literal comparisons (e.g. `two_fa_enabled = 1`), JSON docs are stored as `text` and `JSON.stringify`/`parse`d at the boundary — both are portable if pg columns keep `text`/`integer` types and pg's `int8`-as-string pitfall is avoided (all integer columns fit in `int4` range except timestamps; `Date.now()` ms fits int8 → adapter must coerce or columns be `bigint`, see Pitfall 2).

`pg` is legit and current: **8.23.1** (published 2026-09-30), ~95M weekly downloads, official repo `brianc/node-postgres`, no postinstall script, pure JS (native `pg-native` is an optional extra, NOT installed by default), engines `node >= 16`. Transactions on pg require a **checked-out pool client** (BEGIN/COMMIT/ROLLBACK via `client.query`; never `pool.query` mid-transaction) — the `db.tx(fn)` facade maps to this directly. Connection failures at boot surface as `err.code` values (`ECONNREFUSED` on the socket, SQLSTATE `28P01` bad password, `3D000` unknown database) → D-04 fail-closed boot validates with an explicit probe before listen. This is a one-way-door phase (async conversion touches the whole 216-callsite file) — plan it as one large mechanical conversion with a green-suite checkpoint after every wave.

**Primary recommendation:** Build a single adapter module exporting an async `{ get, all, run, tx }` facade backed by either `node:sqlite` (default, wrapped in Promise.resolve) or a `pg` Pool (loaded via `await import('pg')` only when `DB_URL` starts with `postgres://`); neutralize `insert or ignore/replace` + `begin immediate` + result shape inside the adapter via a small SQL-rewrite layer pinned by tests; convert all 216 callsites to `await`; guard all `pragma`/`vacuum into` sites behind a `sqliteOnly()` capability check; and ship the one-shot copy script + opt-in `POSTGRES_TEST_URL` matrix.

## User Constraints (from AGENTS.md)

- Project `AGENTS.md` does not exist at repo root — verified `ls` (no AGENTS.md). Global rules apply: no invented APIs; every command cited with result; max 2 failed tool attempts then escalate.
- Standing project constraints (PROJECT.md): full suite green; EN+FR i18n gate (`npm run i18n:scan` — no new user-facing strings expected in this phase, but the gate still runs); zero-runtime-dependency contract **amended by D-02** (pg added conditionally); Phase 38 suppression + no-double-send invariants pass unmodified.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Backend selection (`DB_URL` parse) | API/Backend (adapter module) | — | Boot-time env resolution joins the existing DB_PATH/DATA_DIR block (server.js:78) |
| Async DB facade get/all/run/tx | API/Backend (adapter) | — | The only dialect-aware component (D-06, D-10) |
| SQL dialect rewrite (upserts, begin) | API/Backend (adapter) | — | "One branch site per incompatibility" lives here (D-10) |
| SQLite-only ops (pragma, vacuum into, wal_checkpoint) | API/Backend (adapter capability gate) | — | D-09: guarded, not ported |
| Additive/idempotent migrations | API/Backend (adapter) | — | SCHEMA + ensureColumn executed through the adapter (D-09) |
| One-shot SQLite→pg copy | Operator CLI (scripts/) | — | D-12/D-13: reads node:sqlite, writes pg; never server runtime |
| Pool sizing / healthcheck | API/Backend (adapter) | Deployment (Dockerfile healthcheck) | Discretion area — keep defaults in adapter config |
| pg test matrix | Test harness | — | D-08: POSTGRES_TEST_URL gate around existing withDb/HTTP helpers |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pg` (node-postgres) | 8.23.1 | Postgres client (Pool + Client), parameterized queries | Official, pure JS, no postinstall, 95M/wk downloads [VERIFIED: npm registry + package-legitimacy OK] |
| `node:sqlite` DatabaseSync | Node 24 built-in | Existing backend + copy-script reader | Already in use; `node --version` = v24.21.0 [VERIFIED: env probe] |
| `pg-connection-string` | (transitive of pg) | DSN parsing inside pg | Ships as pg's own dependency — do NOT add separately |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | — | — | No ORM, no query builder, no migration framework — D-06 forbids layers; the additive-migration pattern is already hand-rolled in openDb() |

### Alternatives Considered (locked OUT by CONTEXT.md)
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pg` | `postgres` (porsager) | Rejected by D-01 — not official; do not revisit |
| `dependencies` key | `optionalDependencies` | **Use plain `dependencies`** — `optionalDependencies` would let a broken pg install silently vanish, violating D-04's fail-closed spirit; the D-12 pin test is amended to *require* pg's presence instead [ASSUMED judgment consistent with D-02 wording] |

**Installation:**
```bash
npm install pg            # writes "dependencies": { "pg": "^8.23.1" } — first runtime dep in project history
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| pg | npm | 8.x line, latest publish 2026-09-30 | ~95.4M/wk | github.com/brianc/node-postgres | OK | Approved |
| pg-connection-string | npm | latest publish 2026-09-30 | ~100M/wk | github.com/brianc/node-postgres | OK | Approved (transitive; do not import directly) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
Additional registry checks: `npm view pg engines` → `{ node: '>= 16.0.0' }` (alpine/Node 24 fine); `npm view pg optionalDependencies` → `{ 'pg-cloudflare': '^1.4.1' }` (pure JS, pulled automatically); `npm view pg scripts.postinstall` → none. **`pg-native` is NOT a dependency** — it is an optional manual install and must not be added (it pulls libpq, breaking alpine-simplicity and D-01's "pure JS" rationale).

## Runtime State Inventory

> Migration/refactor-flavored phase. The "rename" here is a backend switch — the question is what runtime state a SQLite→Postgres install carries.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | All app data lives in one SQLite file (`DB_PATH`, default `DATA_DIR/projects.db`, server.js:78). Tables (SCHEMA, server.js:188–357): `users`, `totp_factors`, `oidc_identities`, `sessions`, `login_challenges`, `workspaces`, `memberships`, `team_members`, `invites`, `recovery_codes`, `security_log`, `audit_log`, `reminders_sent`, `user_notif_prefs` (14 tables, quoted verbatim from `create table if not exists` statements at those lines). Copy script (D-12) must cover all 14 | Copy script table list = this exact 14-table set, dependency order: `users`, `workspaces` first (everything FK-references them), then `totp_factors`, `oidc_identities`, `sessions`, `login_challenges`, `memberships`, `team_members`, `invites`, `recovery_codes`, `security_log`, `audit_log`, `reminders_sent`, `user_notif_prefs` |
| Live service config | `docker-compose.yml` forwards env (checked: `environment:` block present, no DB_* vars yet); DEPLOY.md is doc-only | Add `DB_URL` to compose env example + .env.example + DEPLOY.md |
| OS-registered state | None — single container process, no pm2/launchd/systemd registrations in repo [VERIFIED: repo root listing contains only docker-entrypoint.sh] | none |
| Secrets/env vars | `DB_URL` will embed pg credentials (password in DSN). MASTER_KEY / SMTP creds unchanged. `.env` is git-ignored [VERIFIED: .env.example header states ".env is git-ignored and excluded from the Docker build context"] | Copy script must accept `DB_URL` same as server; DEPLOY.md warns against logging it |
| Build artifacts | `node_modules/pg` will exist after install; package-lock.json changes; Docker build stage runs `npm ci` then runtime stage currently copies NO node_modules — D-03 adds a node_modules COPY. Vite `dist` unaffected (client never touches pg) | Amend Dockerfile runtime stage + dependencies.test.mjs COPY pin (currently expects exactly `['dist','mailer.js','oidc.js','seed.json','server.js','src','totp.js','tz.js']`, quoted verbatim from test/dependencies.test.mjs) |
| SQLite-specific runtime files | WAL sidecars (`projects.db-wal`, `projects.db-shm` from `pragma journal_mode = wal`, server.js:365) and `vacuum into` backup files in DATA_DIR | Copy script reads the main DB file only (node:sqlite handles WAL recovery on open); DEPLOY.md: stop server before copy (D-13) so WAL is checkpointed |

**Nothing found in category:** OS-registered state — verified by repo-root listing and absence of service-registration files.

## Architecture Patterns

### System Architecture Diagram

```
                 DB_URL set? 
   boot ──▶ env parse (server.js:78 area) ──┬── no ──▶ node:sqlite DatabaseSync (default, byte-identical to today)
                     │                      │
                     │ postgres://          │
                     ▼                      │
             await import('pg')  ◀──────────┘   (conditional load, D-02)
                     │
             probe connection ──▶ fail? ──▶ process exits, clear error (D-04, no SQLite fallback)
                     │ ok
                     ▼
        ┌─────────────────────────────┐
        │  ADAPTER (one module)       │
        │  get / all / run / tx       │
        │  + SQL rewrite layer:       │
        │   insert or ignore →        │
        │     on conflict do nothing  │
        │   insert or replace →       │
        │     on conflict do update   │
        │   begin immediate → begin   │
        │   {changes} ← rowCount      │
        └──────────┬──────────────────┘
                   │ await (D-05)
                   ▼
        216 callsites in server.js (185 prepare + 31 exec)
                   │
     ┌─────────────┼──────────────────────┐
     ▼             ▼                      ▼
 portable SQL   SQLite-only ops      migrations
 (get/all/run)  capability-gated:    SCHEMA + ensureColumn
                pragma, vacuum into, (idempotent both backends)
                wal_checkpoint,      
                --backup CLI         seed: portable common SQL (D-07)
```

External: Postgres server (operator-provisioned) ← pg Pool (max clients, connection probe at boot). Operator path: stop server → `node scripts/copy-sqlite-to-pg.mjs` (reads node:sqlite, writes pg, count-verified, refuses non-empty target) → boot with DB_URL.

### Recommended Project Structure
```
server.js              # all routes; db.* callsites become await db.get/all/run/tx
db-adapter.mjs         # NEW (or inline section of server.js — planner's call): facade,
                       # backend selection, SQL rewrite layer, capability flags
scripts/copy-sqlite-to-pg.mjs   # NEW: one-shot D-12/D-13 copy tool
test/dependencies.test.mjs      # amended D-12 pins (pg allowed + node_modules COPY)
test/pg-matrix.test.mjs         # NEW: POSTGRES_TEST_URL-gated critical-path matrix
DEPLOY.md / .env.example / docker-compose.yml / Dockerfile  # env + runbook + image
```
Note: server.js is currently single-file by design; whether the adapter is a new top-level module (like tz.js/totp.js — precedent exists and each required a D-12 COPY-pin amendment) or an internal section is a planner decision. A separate `db-adapter.mjs` follows the tz.js precedent exactly (including one more COPY target) and makes the copy script importable.

### Pattern 1: Conditional dynamic import (D-02)
**What:** `pg` loads only when `DB_URL` is postgres; SQLite path never touches the module.
**When to use:** openDb/backend-selection choke point (server.js:364 `function openDb()`).
**Example:**
```js
// Source: node-postgres docs (ESM import pattern) + node dynamic import
let backend;
if (DB_URL && DB_URL.startsWith('postgres://')) {
  const { Pool } = await import('pg');   // throws at boot if pg absent → D-04 fail-closed
  const pool = new Pool({ connectionString: DB_URL, max: 10, connectionTimeoutMillis: 5000 });
  await pool.query('select 1');          // boot probe: unreachable pg = refused start
  backend = makePgBackend(pool);
} else {
  backend = makeSqliteBackend(new DatabaseSync(DB_PATH)); // wraps sync calls in resolved promises
}
```

### Pattern 2: db.tx(fn) — transaction on a checked-out client
**What:** pg isolates transactions per client; `pool.query('BEGIN')` is forbidden (docs Alert). The facade must check out a client, run fn's queries against it, COMMIT/ROLLBACK, release in `finally`.
**When to use:** every existing `transaction(fn)` callsite (~22) converts to `await db.tx(async fn)`.
**Example:**
```js
// Source: node-postgres docs, features/transactions.mdx
async tx(fn) {
  const client = await this.pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(this.clientBackend(client));
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
```
SQLite `db.tx` reuses the existing `begin immediate` wrapper shape but async (and serializes concurrent tx calls with a promise-queue mutex, since Node's sync SQLite path was implicitly serial).

### Pattern 3: SQL rewrite layer (D-10, one branch site per incompatibility)
**What:** a small pure function `toPgSql(sql)` applied inside the pg backend's get/all/run, with a table of mechanical rewrites, each pinned by a unit test:
| SQLite form | pg form | Verified sites |
|---|---|---|
| `insert or ignore into …` | `insert into … on conflict do nothing` | server.js:1481, 1574, 2133, 2207, 2750, 4576 (plus comment 2178) |
| `insert or replace into …` | `insert into … on conflict(pk) do update set …` (⚠ semantic: OR REPLACE deletes+reinserts; pg upsert preserves row identity — verify FK `on delete cascade` behavior at 3503, 5530) | server.js:3503, 5530 |
| `begin immediate` | `begin` | server.js:1965 |
| (result) `.changes` | `.rowCount` mapped to `{changes}` in run() return | 1483, 1581, 2056, 4019, 4112, 4230, 4239, 4249, 4687–4711 |

### Anti-Patterns to Avoid
- **Transactions via pool.query:** pg docs explicitly warn this breaks (each pool.query may hit a different client) — always checked-out client. [VERIFIED: node-postgres docs transactions.mdx Alert]
- **Silent fallback to SQLite when pg unreachable:** violates locked D-04. Boot probe or exit.
- **Rewriting `collate nocase` at callsites:** D-10 puts the branch in the adapter (e.g. regex rewrite to `lower(col) = lower(?)` + functional index note in SCHEMA), not sprinkled through 8 call sites.
- **Using pg's jsonb to "improve" the doc column:** D-11 locks text/jsonb-as-is; no exploitation.
- **`optionalDependencies`:** silently-skipped installs defeat fail-closed boot; use `dependencies` + amended pin test.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Postgres wire protocol, auth (SCRAM-SHA-256), SSL negotiation | raw socket client | `pg` Pool/Client | D-01; protocol includes auth message exchanges you must not reimplement |
| DSN parsing | regex over DB_URL | `pg`'s built-in connection-string parsing (pg-connection-string, bundled) | Handles unix sockets, params, URL-encoding |
| Parameterized queries | string concat | `pg` positional `$1..$n` — **every callsite already uses `?` placeholders; the adapter converts `?` → `$n` mechanically** | Safe-by-default; test pins the rewrite |
| Connection pooling | own client cache | `Pool` (max default 10, idleTimeoutMillis 10s, connectionTimeoutMillis default 0 → set explicitly) | Docs-verified defaults |

**Key insight:** nearly every hard part (protocol, pooling, parameterization, type parsing for jsonb/timestamps) is `pg`'s job; the only genuinely hand-written surface is the ~4-entry SQL rewrite table and the tx client checkout.

## Common Pitfalls

### Pitfall 1: `int8`/`bigint` arrives as a **string**
**What goes wrong:** pg returns `bigint` columns as JS strings to avoid precision loss. `created_at`/`expires_at`/`last_seen_at` hold `Date.now()` ms values (~1.77e12) — fits comfortably in int4 range? No: int4 max ≈ 2.1e9, so ms-epoch columns **must** be `bigint` on pg and will decode as strings.
**Why:** pg's default type parsers [VERIFIED: node-postgres docs types section / well-known behavior — planner should confirm against the types doc at implementation time].
**Avoid:** define epoch columns as `bigint` and either coerce in the adapter (`Number(row.x)`) for known timestamp columns, or use `int8` + `parseInt` at the ~12 timestamp read sites. Prefer adapter-level: keep arithmetic (`expires_at > ?`) portable (string-vs-number comparison must not happen in SQL — pass numbers, pg casts).
**Warning signs:** tests comparing `res.data.expires_at` to a number failing with `=== '1770…'`.

### Pitfall 2: `.changes === 0` exactly-once logic
**What goes wrong:** claim code (reminders_sent, digest, recovery burn) branches on `res.changes`. pg returns `rowCount` on the QueryResult, not `changes`; SQLite wrapper must synthesize it too.
**Avoid:** adapter `run()` always returns `{ changes }` for both backends; pin with a claim-race test in the pg matrix.
**Sites:** 1483, 1581 (exactly-once claims — Phase 37/38 invariants!), 2056, 4019, 4112, 4230–4249, 4687–4711.

### Pitfall 3: `insert or replace` semantic drift
**What goes wrong:** SQLite `insert or replace` **deletes the conflicting row and inserts a new one**, firing `on delete cascade` and resetting unspecified columns to defaults; pg `on conflict do update` preserves the row. The two `user_notif_prefs` sites (3503, 5530) have no child tables so the drift is benign today, but the rewrite must use `on conflict(workspace_id, user_id) do update set prefs = excluded.prefs` and a test must pin row-count and cascade behavior.
**Warning signs:** pg-matrix test sees `user_notif_prefs` rows disappear on replace.

### Pitfall 4: `collate nocase` doesn't exist on pg
**What goes wrong:** 8 verified sites (schema `email text not null unique collate nocase` line 190; queries at 604, 611, 624, 659, 1777, 2055, 3246) rely on case-insensitive email/slug matching. pg is case-sensitive by default; `NOCASE` fails to parse.
**Avoid:** adapter SQL rewrite `col collate nocase` → `lower(col)` with `lower(?)` on the parameter side; plus a unique functional index `create unique index … on users(lower(email))` in the pg SCHEMA variant. The SQLite `unique collate nocase` index keeps working unchanged. Pin with a case-variant email login test in the pg matrix.
**Warning signs:** `syntax error at or near "nocase"` on first pg boot.

### Pitfall 5: rowid
**What goes wrong:** one legacy migration backfill uses `rowid` (2142–2143, invites `team`→`teams` backfill inside migrateTenancy).
**Avoid:** keep that function SQLite-only — under pg the backfill runs only on databases copied by the script (already backfilled), and new pg installs create `teams` in SCHEMA directly. Guard with the capability flag. D-10 forbids new `rowid` code.

### Pitfall 6: pragma / vacuum into / wal_checkpoint under pg
**What goes wrong:** 4 boot pragmas (365–368), `pragma table_info` in `ensureColumn` (356), 7 `wal_checkpoint` sites (2122, 2198, 2241, 2396, 2481, 2585, 5640), 7 `vacuum into` backup sites (2123, 2199, 2242, 2397, 2482, 2586, 5641) — all throw on pg.
**Avoid:** route every backup/checkpoint through one `sqliteOnly(fn)` helper that no-ops (with a LOG_LEVEL-consistent info line) when backend is pg; replace `ensureColumn`'s `pragma table_info` with an information_schema query on pg (adapter branch). D-09 locks this posture.

### Pitfall 7: `?` placeholders
**What goes wrong:** all 185 prepared statements use `?`; pg needs `$1…$n`.
**Avoid:** mechanical indexed rewrite inside the pg backend (single function, unit-tested: rewrites in order, ignores `?` inside quoted literals). Edge cases: `?` inside string literals — verified none exist today via the column-value audit, but the rewrite must still be literal-aware (skips single-quoted spans).
**Warning signs:** `bind message supplies N parameters` errors.

### Pitfall 8: pool error events crash the process
**What goes wrong:** an idle pool client hitting a network partition emits `error` through the pool; with no listener, Node raises an uncaught error and can crash the process. [VERIFIED: node-postgres docs pool.mdx Alert]
**Avoid:** attach `pool.on('error', …)` logging via the LOG_LEVEL ladder at construction.

### Pitfall 9: async conversion ripples
**What goes wrong:** every route handler touching `db.*` becomes async; missed `await` = silent undefined. 216 sites across ~19k lines.
**Avoid:** convert in waves (migrations/seed → auth/session → claims/scheduler → routes), running the full suite green after each wave; enable eslint `no-floating-promises` if configured, or at minimum a grep audit `db\.(get|all|run|tx)\(` not preceded by `await` as a wave gate.
**Warning signs:** intermittent `Cannot read properties of undefined (reading …)` under load only.

### Pitfall 10: concurrent SQLite tx serialization
**What goes wrong:** today `begin immediate` + sync code = implicitly serial. Async db.tx can interleave: two concurrent tx bodies interleave awaits and SQLite would throw `cannot start a transaction within a transaction`.
**Avoid:** SQLite db.tx wraps fn in a promise-queue mutex (one tx at a time); pg gets true concurrency via per-client transactions. The existing 503-style fail-closed and claim tests will catch regressions.

## Code Examples

### Backend probe (D-04 fail-closed boot)
```js
// Source: node-postgres docs connecting.mdx (errors carry .code SQLSTATE; socket errors carry ECONNREFUSED)
try {
  await pool.query('select 1');
} catch (err) {
  console.error(`[db] Postgres unreachable (code=${err.code ?? 'NOSQLSTATE'}): ${err.message}`);
  process.exit(1); // no SQLite fallback
}
```
Observed codes to handle in the boot message: `ECONNREFUSED` (host/port down), `28P01` (invalid password), `3D000` (database does not exist), `28000`/`42501` (role/permission). [ASSUMED for 3D000/28000 — standard SQLSTATE; 28P01 verified in pg docs ecosystem]

### Idempotent pg migration (D-09)
```js
// pg variant of ensureColumn (server.js:355-358 uses pragma table_info — SQLite-only)
async function ensureColumnPg(pool, table, name, def) {
  const { rows } = await pool.query(
    `select column_name from information_schema.columns
     where table_schema = current_schema() and table_name = $1 and column_name = $2`, [table, name]);
  if (!rows.length) await pool.query(`alter table ${table} add column ${name} ${def}`);
}
```
SCHEMA (server.js:188–357) is already written in near-portable SQL (`create table if not exists`, `create index if not exists`, text columns, FK with `on delete cascade`) — only the `collate nocase` on line 190 and `integer` boolean defaults need a pg-variant tweak (keep `integer`/`bigint` types on pg to avoid boolean-semantics drift with `= 1` comparisons).

### Copy script core (D-12/D-13)
```js
// reads via node:sqlite (sync), writes via pg — no shared code with server boot
import { DatabaseSync } from 'node:sqlite';
const src = new DatabaseSync(process.argv[2]);            // source file, opened read-only usage
const { Pool } = await import('pg');
const pool = new Pool({ connectionString: process.env.DB_URL });
const { rows } = await pool.query(`select count(*)::int as n from workspaces`);
if (rows[0].n > 0) { console.error('target non-empty — refusing (D-13)'); process.exit(1); }
// per table: read all rows, insert in dependency order inside ONE pg transaction,
// then per-table count check: SELECT count(*) FROM sqlite table === pg count, else ROLLBACK + exit 1
```
Value serialization: SQLite `integer` → pg `bigint`/`int` (write as JS number — pg sends numerics fine); `text` (JSON strings incl. workspace doc, prefs, teams, scope) → pg `text` **unchanged** (D-11); NULL → NULL; blob columns — none exist (verified: schema uses text/integer only).

### Opt-in pg test matrix (D-08)
```js
// test/pg-matrix.test.mjs
const url = process.env.POSTGRES_TEST_URL;
const maybe = url ? test : test.skip;   // node:test pattern — runs nothing when unset
maybe('critical: auth+claims+migrations on pg', async () => { /* boot server with DB_URL=url */ });
```
Existing harness reuse: `test/helpers/server.mjs` exposes `client()/login()/withDb()`; `withDb` opens DatabaseSync directly (test/helpers/server.mjs:163) so pg paths need a sibling `withPg` helper or a backend-agnostic parametrization. Ephemeral pg in dev: Docker daemon is up (verified), so the runbook is `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=… postgres:17-alpine` + `POSTGRES_TEST_URL=postgres://…`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| pg < 8.x callback API | promise API default | pg 8.x (2019+) | All adapter code is await-based natively |
| node:sqlite experimental | stable in Node 24; DEP0210 deprecation alias noted as deferred (STATE.md) | Node 22→24 | No change this phase; SQLite backend untouched |
| `pg-native` (libpq) | pure JS default | long-standing | Do not install pg-native (alpine simplicity, D-01) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | pg returns `bigint` columns as JS strings (Pitfall 1) | Common Pitfalls | Timestamp comparisons break subtly in pg matrix; mitigated by pinning tests — verify pg types doc at implementation |
| A2 | SQLSTATE codes 3D000/28000/42501 meanings | Code Examples | Only affects boot error message quality, not behavior |
| A3 | `optionalDependencies` rejection as the mechanism for D-02 | Standard Stack | Owner may prefer optionalDependencies; planner checkpoint if contested |
| A4 | All 14 tables have text/integer-only columns (no BLOB) | Runtime State Inventory | Copy script type mapping needs a blob branch; cheap to verify in Wave 0 of the script task |
| A5 | Adapter as separate `db-adapter.mjs` (vs inline in server.js) | Project Structure | Either works; separate module adds one COPY-pin target |
| A6 | ~22 transaction() call sites (grep count 23 minus the definition) | Summary | Off-by-a-few; wave conversion will enumerate exactly |

## Open Questions

1. **Adapter module placement (server.js section vs db-adapter.mjs)**
   - What we know: tz.js/totp.js precedent exists; each new module required a D-12 COPY-pin amendment; copy script needs backend-selection logic importable.
   - What's unclear: owner preference for single-file server purity.
   - Recommendation: separate `db-adapter.mjs` (importable by both server and copy script); flag in plan as an A5 checkpoint if contested.

2. **Which routes join the pg matrix (D-08 "critical paths")**
   - What we know: D-08 names auth, claims, migrations as minimum.
   - What's unclear: whether digest/unsubscribe/2FA flows join round 1.
   - Recommendation: auth + login challenge + reminders_sent claim + migration idempotency in round 1; expand only if a pg-specific bug appears.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node ≥ 24 | everything | ✓ | v24.21.0 | — |
| npm registry access | pg install | ✓ (npm view worked) | — | — |
| psql / pg_isready / pg_dump client CLIs | local dev testing, docs | ✗ MISSING | — | Docker `postgres:17-alpine` container for tests; pg_dump run on the pg host (documented in DEPLOY.md anyway per D-09) |
| Docker daemon | ephemeral pg for POSTGRES_TEST_URL matrix | ✓ | 29.9.2, daemon up | Remote POSTGRES_TEST_URL |
| Postgres server | runtime (opt-in) | ✗ by design (operator-provisioned, D-09) | — | None needed — SQLite default |

**Missing dependencies with no fallback:** none blocking — pg clients missing locally only affects convenience; Docker covers the test matrix.
**Missing dependencies with fallback:** psql/pg_dump → Docker container / pg host.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (Node built-in), runner `node --test --test-concurrency=2 test/*.test.mjs` |
| Config file | none — package.json `test` script; harness in `test/helpers/server.mjs` |
| Quick run command | `node --test test/dependencies.test.mjs` |
| Full suite command | `npm test` (1042 tests at v1.9 close) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-02/D-12 | dependencies.test.mjs amended: `dependencies` contains exactly `{pg}`; COPY pin includes db-adapter.mjs + node_modules | unit (pin) | `node --test test/dependencies.test.mjs` | ✅ (amend) |
| D-05 | all db callsites awaited; no sync db.prepare remains | static audit | `grep -nE '(^|[^.a-zA-Z])db\.(prepare|exec)\(' server.js` → 0 matches | ❌ Wave 0 (audit script/test) |
| D-06 | facade exposes exactly get/all/run/tx | unit | `node --test test/db-adapter.test.mjs` | ❌ Wave 0 |
| D-07 | db.tx semantics both backends; claims exactly-once | unit + matrix | same file + `POSTGRES_TEST_URL=… node --test test/pg-matrix.test.mjs` | ❌ Wave 0 |
| D-09 | sqliteOnly ops no-op on pg; ensureColumn pg branch idempotent | unit + matrix | test/db-adapter.test.mjs; second-boot idempotency in pg matrix | ❌ Wave 0 |
| D-10 | SQL rewrite table: each row pinned (insert or ignore/replace, begin immediate, ?→$n, collate nocase→lower) | unit | `node --test test/db-adapter.test.mjs` | ❌ Wave 0 |
| D-12/D-13 | copy script: refuse non-empty, counts match, source untouched | integration | `node --test test/copy-sqlite-to-pg.test.mjs` (needs POSTGRES_TEST_URL or ephemeral pg; skipped if unset, D-08 style) | ❌ Wave 0 |
| D-04 | boot probe exits non-zero when pg unreachable | unit | spawn with DB_URL to closed port, assert exit | ❌ Wave 0 |
| Phase 37/38 invariants | suppression + no-double-send pass unmodified | existing | `npm test` (due-reminders.test.mjs, digest.test.mjs) | ✅ |

### Sampling Rate
- **Per task commit:** `node --test test/dependencies.test.mjs test/db-adapter.test.mjs` + wave-scoped suites
- **Per wave merge:** `npm test` full suite green (standing constraint)
- **Phase gate:** full suite green + pg matrix green (when POSTGRES_TEST_URL set) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/db-adapter.test.mjs` — facade shape, SQL rewrite table pins, tx semantics, sqliteOnly gating
- [ ] `test/pg-matrix.test.mjs` — POSTGRES_TEST_URL-gated critical paths
- [ ] `test/copy-sqlite-to-pg.test.mjs` — script contract (refusal, counts, immutability)
- [ ] `withPg`/parametrized fixture in `test/helpers/server.mjs` (withDb is DatabaseSync-specific — line 163)
- [ ] `npm install pg` + package-lock.json refresh (first runtime dependency — expect dependencies.test.mjs RED until amended)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V6 Cryptography (transport to DB) | yes | pg SSL: prefer `ssl: { rejectUnauthorized: true }` default posture; document `?sslmode=` handling in DEPLOY.md; never disable cert validation in shipped defaults |
| V7.1 Log injection / secret leakage | yes | DB_URL (contains password) never logged; boot error prints err.code, not the DSN |
| V2 authN (DB credentials) | yes | least-privilege pg role; SCRAM-SHA-256 is pg's default auth exchange handled by pg driver — no hand-rolling |
| V5 Input Validation / SQLi | yes (existing, unchanged) | all queries already parameterized (`?`/`$n`); the `?`→`$n` rewrite and the `vacuum into '<path>'` string-interp path stay SQLite-only and operator-supplied |
| V4 Access Control | no change | app-level authorization untouched by this phase |
| V3 Session Mgmt | no change | sessions table moves but logic unchanged |

### Known Threat Patterns for {node:sqlite → pg} stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via new dialect branch code | Tampering | rewrite layer is pure-SQL-text transforms of already-parameterized statements; unit tests pin no-parameter-concatenation |
| Connection-string credential leak (env, logs, docker inspect) | Information Disclosure | document secret-file/env-only handling in DEPLOY.md; never echo DB_URL |
| Copy script run against wrong/hostile target | Tampering/Elevation | refuse non-empty target (D-13), source opened read-only usage, print table counts before commit |
| MITM to Postgres | Spoofing | sslmode guidance in DEPLOY.md; pg validates server cert by default when ssl configured |
| Pool exhaustion DoS (max 10 clients, async handlers) | DoS | explicit `max` + `connectionTimeoutMillis` defaults in adapter (discretion area), boot config logged at info |

## Sources

### Primary (HIGH confidence)
- npm registry via gsd-tools package-legitimacy + `npm view pg` (version 8.23.1, engines, optionalDependencies, postinstall, publish dates) — checked 2026-11-07
- Context7 `/brianc/node-postgres` (official docs mirrored): pooling.mdx, transactions.mdx (BEGIN/COMMIT + per-client Alert), connecting.mdx, pool.mdx (error event), parser.ts (SQLSTATE exposure)
- server.js + test/dependencies.test.mjs + test/helpers/server.mjs + package.json + Dockerfile + .env.example — read this session with line citations

### Secondary (MEDIUM confidence)
- Environment probes: node --version, command -v psql/docker, docker info

### Tertiary (LOW confidence)
- SQLSTATE catalog values 3D000/28000/42501 (A2), int8-as-string default (A1) — verify against pg types doc at implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pg version/legitimacy verified on registry; driver locked by D-01
- Architecture: HIGH — facade + rewrite-layer design follows verified callsite inventory (216 sites, 8 nocase, 10 upserts, 1 rowid, exact pragma/vacuum line numbers)
- Pitfalls: HIGH for inventory-derived (3,4,5,6,7,10), MEDIUM for pg-behavior-derived (1,8) — docs-verified but implementer should re-check types doc

**Research date:** 2026-11-07
**Valid until:** 2026-12-07 (pg 8.x is stable; codebase inventory is commit-pinned today)
