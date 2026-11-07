# Phase 45: Database adapter — optional Postgres backend via env, SQLite default - Pattern Map

**Mapped:** 2026-11-07
**Files analyzed:** 12 (3 new, 9 modified)
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `db-adapter.mjs` (NEW) | service (DB facade) | request-response (async CRUD) | `tz.js` (top-level module shape) + `server.js` transaction(fn) | role-match (no facade exists — this is the first) |
| `server.js` (MOD, ~216 db.* sites) | controller/route monolith | CRUD + event-driven | itself (convert in place; patterns below) | exact (self) |
| `scripts/copy-sqlite-to-pg.mjs` (NEW) | utility (operator CLI) | batch (read SQLite → write pg) | `scripts/i18n-scan.mjs`, `scripts/export-seed.mjs` | role-match |
| `test/db-adapter.test.mjs` (NEW) | test (unit) | — | `test/dependencies.test.mjs` | role-match |
| `test/pg-matrix.test.mjs` (NEW) | test (integration, env-gated) | — | `test/helpers/server.mjs` harness + skip-when-unset pattern | role-match |
| `test/helpers/server.mjs` (MOD — withPg/parametrize) | test fixture | — | `withDb` (lines 162–170) | exact |
| `test/dependencies.test.mjs` (MOD) | test (pin) | — | itself (amend pins) | exact |
| `package.json` (MOD — `pg` dep) | config | — | devDependencies block | role-match |
| `Dockerfile` (MOD — runtime COPY + node_modules) | config (build) | file-I/O | itself (runtime stage, lines 12–25) | exact |
| `docker-entrypoint.sh` (MOD — pass-through env) | config (runtime) | — | itself | exact |
| `.env.example` (MOD — DB_URL) | config (docs) | — | SMTP optional-block pattern (lines 55–81) | exact |
| `DEPLOY.md` (MOD — pg runbook) | doc | — | existing optional-feature sections (OIDC in .env.example is the style anchor) | role-match |

## Pattern Assignments

### `db-adapter.mjs` (service, async CRUD facade)

**Analog:** `tz.js` — the established "extracted top-level module so tests can import without booting the server" precedent.

**Module header pattern** (`tz.js` lines 1–4):
```js
/* Timezone resolution funnel (Phase 44, D-05/D-06/D-07) — the single
   label→zone choke point every resolution site calls. Extracted from
   server.js so tests can import the funnel without booting the server
   (server.js opens its DB and listens on import). Zero runtime deps. */
```
Copy this shape: a dense decision-comment header citing the phase + D-numbers (here D-01…D-06), then pure exports. **Exception to "zero runtime deps":** `pg` is conditionally `await import('pg')` (D-02), never a static import — the SQLite path must not touch the module.

**Backend selection + fail-closed probe (D-04)** — new code, anchored at the existing choke point `server.js` `openDb()` (lines 360–401, excerpt 360–369):
```js
function openDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec('pragma journal_mode = wal');
  db.exec('pragma foreign_keys = on');
  db.exec('pragma busy_timeout = 5000');
  db.exec('pragma synchronous = normal');
  db.exec(SCHEMA);
```
Note: the four pragmas (365–368) are SQLite-only — they move inside the SQLite backend constructor. The `const db = openDb();` call at line 403 becomes the awaited boot branch.

**Transaction pattern — the shape db.tx must preserve** (`server.js` lines 1964–1974):
```js
function transaction(fn) {
  db.exec('begin immediate');
  try {
    const out = fn();
    db.exec('commit');
    return out;
  } catch (err) {
    db.exec('rollback');
    throw err;
  }
}
```
~22 callsites like line 1479 `transaction(() => {…})` convert to `await db.tx(async () => {…})`. SQLite tx = this shape + `begin` (or keep `begin immediate`) + a promise-queue mutex (async interleaving is new); pg tx = checked-out pool client per RESEARCH Pattern 2. **Anti-pattern (pg docs Alert): never `pool.query('BEGIN')`.**

**Result-shape contract to synthesize** (`server.js` lines 1480–1483 — exactly-once claim, Phase 37/38 invariant):
```js
const r = db
  .prepare('insert or ignore into reminders_sent (dedup_key, workspace_id, created_at) values (?,?,?)')
  .run(`${ws.id}:${t.id}:${t.assignee}:${offset}:${due}`, ws.id, now());
if (r.changes === 0) return; // already sent — exactly-once (REM-03)
```
`run()` MUST return `{ changes }` on both backends (pg: `rowCount`). Pin with a claim-race test.

**SQLite-only capability gate (D-09)** — the vacuum-into backup pattern at `server.js` lines 2118–2128 (inside `migrateTeamMembership`, 2102–2150):
```js
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(DATA_DIR, `projects-pre-team-members-${stamp}.db`);
try {
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  conn.exec('pragma wal_checkpoint(truncate)');
  conn.exec(`vacuum into '${backup.replaceAll("'", "''")}'`);
  logInfo(`  pre-migration backup: ${backup}`);
} catch (err) {
  logError(`  pre-migration backup failed: ${err.message}`);
  return;
}
```
Every `pragma`/`wal_checkpoint`/`vacuum into` site (7 each) routes through one `sqliteOnly(fn)` helper that no-ops under pg. `ensureColumn` (lines 355–358):
```js
function ensureColumn(conn, table, name, def) {
  const cols = conn.prepare(`pragma table_info(${table})`).all();
  if (!cols.some(c => c.name === name)) conn.exec(`alter table ${table} add column ${name} ${def}`);
}
```
pg branch: `information_schema.columns` query (RESEARCH Code Example "Idempotent pg migration").

**Dialect rewrites to centralize (D-10):** `insert or ignore` (line 1481 shown; 6+ sites) → `on conflict do nothing`; `insert or replace` (3503, 5530) → `on conflict(...) do update`; `begin immediate` → `begin`; `?` → `$1..$n` (literal-aware, quoted spans skipped); `collate nocase` (8 sites, schema line 190 + queries at 604/611/624/659/1777/2055/3246) → `lower(col) = lower(?)`. One pure function per rewrite, each unit-pinned. `rowid` (2142–2143) stays SQLite-only — never port.

---

### `server.js` conversion (controller, in-place)

**Env block pattern** (lines 72–78) — where `DB_URL` joins:
```js
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(DATA_DIR_ROOT, 'data'));
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(DATA_DIR, 'projects.db'));
```
Add `const DB_URL = process.env.DB_URL?.startsWith('postgres://') ? process.env.DB_URL : '';` adjacent (fail or ignore non-postgres DB_URL values loudly, D-04 style).

**Callsite conversion:** 185 `db.prepare(...).get/all/run` + 31 `db.exec` → `await db.get/all/run` via the facade. Convert in waves with `npm test` green after each (RESEARCH Pitfall 9); wave gate: `grep -nE '(^|[^.a-zA-Z])db\.(prepare|exec)\(' server.js` → 0 matches.

---

### `scripts/copy-sqlite-to-pg.mjs` (utility, batch)

**Analog:** `scripts/i18n-scan.mjs` lines 1–33 — the house style for operator/dev scripts:
```js
/* =====================================================================
   scripts: i18n-scan — the static source scan of the interface literals.
   ...
    Plain Node, no dependency. Only node:fs, node:path and node:url.
   ===================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
```
Copy: `scripts: <name>` banner comment stating scope + guarantees, plain Node imports, REPO_ROOT derivation. This script additionally `await import('pg')` (only external import in scripts/ — acceptable per D-02).

**Core contract (D-13)** per RESEARCH: open source `DatabaseSync` (handles WAL on open), `Pool({ connectionString: process.env.DB_URL })`, refuse non-empty target (`select count(*)` per table → exit 1), insert all 14 tables in dependency order (`users`, `workspaces` first; then `totp_factors`, `oidc_identities`, `sessions`, `login_challenges`, `memberships`, `team_members`, `invites`, `recovery_codes`, `security_log`, `audit_log`, `reminders_sent`, `user_notif_prefs`) inside ONE pg transaction, per-table count verification before commit. Source file never written (D-14). Table list = SCHEMA (`server.js` lines 188–357). Never log DB_URL (contains the password).

---

### `test/helpers/server.mjs` — withPg fixture (test fixture)

**Analog:** `withDb` (lines 162–170, verbatim):
```js
/* Open the suite's database read/write, and always close it. */
export function withDb(dbPath, fn) {
  const db = new DatabaseSync(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}
```
`withPg` must mirror the open→fn→close discipline around a pg Pool/Client. Also note `startServer` (lines 43–94): env override merge (line 50) already accepts arbitrary `env` — the pg matrix passes `{ env: { DB_URL: url } }`; the harness's default `DB_PATH` injection at line 50 is harmless when DB_URL is set, but the `undefined`-stripping idiom (lines 51–54) is the pattern for keys that must be absent.

---

### `test/pg-matrix.test.mjs` (test, env-gated)

**Analog:** harness usage + node:test skip pattern (RESEARCH):
```js
const url = process.env.POSTGRES_TEST_URL;
const maybe = url ? test : test.skip;   // runs nothing when unset (D-08)
```
Reuse `client()/login()/startServer()` unchanged; cover auth, login challenge, reminders_sent claim, migration idempotency (round 1).

---

### `test/dependencies.test.mjs` amendment (test pin)

**Analog:** itself. Current pins (lines 20–26 and 46–59, verbatim excerpts):
```js
test('package.json carries no runtime dependencies (D-12)', () => {
  assert.equal('dependencies' in pkg, false, '...forbidden (D-12)...');
});
```
and the COPY pin:
```js
assert.deepEqual(
  copyTargets.sort(),
  ['dist', 'mailer.js', 'oidc.js', 'seed.json', 'server.js', 'src', 'totp.js', 'tz.js'],
  `the runtime stage must copy exactly ... (D-12)`,
);
```
Amend both: `dependencies` must equal exactly `{ pg: <pin> }` (D-02 — presence REQUIRED, not forbidden); COPY pin gains `db-adapter.mjs` (if separate module, per tz.js precedent comment chain lines 51–54) and a `node_modules` target (D-03). Follow the existing comment-per-amendment convention (each phase added one dated comment line).

---

### `Dockerfile` (config, build/runtime)

**Analog:** itself, runtime stage (lines 12–25, verbatim):
```dockerfile
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data

COPY --from=build /app/server.js ./server.js
COPY --from=build /app/tz.js ./tz.js
...
COPY --from=build /app/dist ./dist
```
Changes: build stage `npm ci` already installs pg (package.json); runtime stage adds `COPY --from=build /app/node_modules ./node_modules` (scoped to pg's tree if the planner prefers, but the pin test must match whatever ships); add `db-adapter.mjs` COPY if a separate module. `docker-entrypoint.sh` passes env through already — verify only (no DB_* vars referenced today). Healthcheck (line 37–38) hits `/api/health` — pg-mode healthcheck wiring is the discretion area (CONTEXT).

---

### `.env.example` (config docs)

**Analog:** the optional-SMTP block style (lines 55–64, verbatim excerpt):
```bash
# ---- Email invitations (optional) ----
# Set SMTP_HOST to email each address-bound invite automatically. Generic
# "Copy invite link" links are still created for you to share yourself.
```
Add a `# ---- Database backend (optional) ----` block: `DB_URL=` empty default, commented `postgres://` example, warnings (password lives here — .env is git-ignored, header lines 1–2; leave empty for SQLite default). Point to the DEPLOY.md runbook section, matching the OIDC block's cross-reference style (lines 109–113).

---

### `DEPLOY.md` (doc)

**Analog:** existing optional-feature walkthroughs (the OIDC section structure referenced at `.env.example` lines 109–113). Add: pg deployment section + operator runbook per D-13/D-14/D-09 — stop server → `node scripts/copy-sqlite-to-pg.mjs` → boot with `DB_URL`; keep `projects.db` on disk as rollback (D-14); backups via `pg_dump` under pg (D-09); never log DB_URL.

---

### `package.json` (config)

**Analog:** existing `devDependencies` block. Add plain `dependencies: { "pg": "^8.23.1" }` — NOT `optionalDependencies` (RESEARCH: silently-skipped installs defeat D-04 fail-closed). Refresh package-lock.json.

---

## Shared Patterns

### Fail-closed boot
**Source:** `.env.example` APP_URL comment (lines 16–19, "The server refuses to start in that configuration") + RESEARCH probe example; applied in `db-adapter.mjs` boot path (D-04): probe `select 1`, on failure `process.exit(1)` printing `err.code` — never the DSN.

### Pin-by-test discipline
**Source:** `test/dependencies.test.mjs` (lines 28–59), `compose-config.test.mjs` pattern. Apply to: dependency pin, COPY pin, SQL-rewrite table rows, facade shape, copy-script contract, boot-probe exit.

### Decision-comment headers
**Source:** `tz.js` (lines 1–9), `scripts/i18n-scan.mjs` (lines 1–28), inline D-number comments throughout `server.js` migrations (lines 370–398). Apply to every new file and every amendment (each gets a dated phase/D reference, matching the Dockerfile-adjacent comment chain in dependencies.test.mjs lines 51–54).

### Migration safety
**Source:** `server.js` `migrateTeamMembership` (lines 2090–2150): guard → pre-migration backup → begin/commit/rollback, "No backup = no mutation". pg additive migrations mirror: idempotent (`if not exists` / information_schema guard), second boot byte-identical no-op (pinned by `test/migration.test.mjs` discipline).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `db-adapter.mjs` core (pg backend, SQL rewrite layer) | service | — | First abstraction layer in a deliberately flat codebase; use RESEARCH.md Patterns 1–3 + pitfalls, but copy the *module* conventions from tz.js |
| `test/pg-matrix.test.mjs` | test | — | First env-gated skip suite; copy harness usage from existing suites, skip pattern from node:test |

## Metadata

**Analog search scope:** repo root (server.js, tz.js, Dockerfile, .env.example), scripts/, test/, test/helpers/
**Files scanned:** 13 (all analogs read directly; server.js read in 4 non-overlapping targeted ranges)
**Tracked-source gate:** all named analogs verified `git ls-files` (10/10 tracked paths)
**Pattern extraction date:** 2026-11-07
