# Phase 45: Database adapter — optional Postgres backend via env, SQLite default - Context

**Gathered:** 2026-11-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Add an environment-driven database backend layer to `server.js`: when `DB_URL` is a
`postgres://` URL the server runs on Postgres (via the `pg` driver); when unset, behavior
is byte-identical to today (SQLite via `node:sqlite`). SQL Server is explicitly OUT
(owner decision 2026-11-07, confirming the 2026-11-05 exploration on Kanzo task
projectsstudio#5). The SQLite path stays the default and the zero-dependency path.

In scope: DB adapter facade, async conversion of all `db.*` callsites, dialect branch
points, pg-conditional dependency & D-12 amendment, Docker image update, DEPLOY.md,
one-shot SQLite→Postgres copy script, opt-in Postgres test matrix.
Out of scope: SQL Server, data-model rework (jsonb exploitation, normalization), automatic
boot-time SQLite→Postgres migration, pg server provisioning/ops.
</domain>

<decisions>
## Implementation Decisions

### Driver & D-12 contract
- **D-01:** Driver is `node-postgres` (`pg`) — official, pure JS, actively maintained,
  alpine-compatible. — **Reversibility:** costly — the adapter API shape and every
  callsite convention assume pg's parameter/query semantics; swapping drivers later
  reopens the whole facade.
- **D-02:** D-12 amendment by **conditional loading**: `pg` is required/installed/used
  ONLY when `DB_URL` is a `postgres://` URL. Without it the instance remains 100% Node
  built-ins. `test/dependencies.test.mjs` (D-12 pins) is amended to allow `pg`
  explicitly and to pin the new Dockerfile COPY targets.
- **D-03:** Single Docker image includes `pg` (node_modules added to the runtime stage;
  the 5-COPY pin in dependencies.test.mjs is amended accordingly). No image variants.
  DEPLOY.md documents the pg-enabled deployment.
- **D-04:** Boot is **fail-closed**: if `DB_URL` is set but Postgres is unreachable
  (bad credentials, host down), the server refuses to start with a clear error —
  no silent SQLite fallback. Matches the project's fail-closed style
  (e.g. 503 `masterKeyMissing`).

### Async architecture
- **D-05:** **Unified async facade** `db.get / db.all / db.run / db.tx(fn)`. All ~216
  sync `db.*` callsites in `server.js` convert to `await`. One API shape for both
  backends, zero dialect branches at callsites. — **Reversibility:** one-way — every
  call site becomes async; reverting to the sync API means re-touching the whole file.
- **D-06:** Facade stays **minimal (4 methods)** keeping existing SQL; no
  `node:sqlite`-mirror API (async `prepare`/`iterate` don't map to pg) and no
  repository layer.
- **D-07:** Transactions go through `db.tx(fn)` (BEGIN/COMMIT on pg, existing semantics
  on SQLite). The initial seed stays **portable common SQL** shared by both backends.
  Exactly-once claim contracts (`reminders_sent`, digest claim) are preserved as-is —
  **no** pg advisory locks in this phase.
- **D-08:** Test strategy: **opt-in matrix**. The existing SQLite fixture suite (withDb)
  remains the base; critical paths (auth, claims, migrations) additionally run against
  an ephemeral Postgres when `POSTGRES_TEST_URL` is provided, skipped otherwise. No CI
  service by default.

### Dialect scope
- **D-09:** `vacuum into` backups and `pragma` stay **SQLite-only**. Under Postgres,
  backups are out of scope — DEPLOY.md documents that the operator runs `pg_dump`.
  Additive migrations become idempotent on pg (`CREATE TABLE IF NOT EXISTS`,
  `ALTER TABLE … ADD COLUMN`).
- **D-10:** SQL at callsites is written in **common dialect** (no new `collate nocase`,
  no direct `rowid` in new code); the adapter owns the small per-dialect branch points,
  one branch site per incompatibility, each pinned by tests (D-12 style). Existing
  SQLite-isms are catalogued during research and neutralized inside the adapter.
- **D-11:** The workspace JSON document is stored **as-is** in a text/jsonb column on
  pg — no data-model rework. jsonb exploitation deferred. — **Reversibility:** one-way —
  switching the document column shape later requires a data migration.

### Existing data
- **D-12:** Switching an existing SQLite install to `DB_URL` uses a **one-shot copy
  script** (scripts/, reads via `node:sqlite`, writes via `pg`, same table set). No
  automatic boot-time migration.
- **D-13:** Script scope: **all tables** (workspaces, users, sessions, notif_prefs,
  totp_factors, oidc_identities, reminders_sent, …) in dependency order, per-table count
  verification before commit, refuses to run if the target is non-empty. Documented in
  DEPLOY.md as an operator step: stop server → run script → boot on pg.
- **D-14:** The source SQLite file is never touched; DEPLOY.md instructs keeping
  `projects.db` on disk as the rollback backup. The pg-mode server never falls back to it
  (D-04 fail-closed boot).

### Agent's Discretion
- Connection-pool sizing defaults, healthcheck wiring, slow-query logging details —
  planner/researcher may choose sensible defaults consistent with LOG_LEVEL conventions.

### Folded Todos
(None — no pending todos matched this phase.)
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Frozen contracts this phase amends
- `test/dependencies.test.mjs` — the D-12 zero-runtime-dependency contract (package.json
  pins, node:24-alpine runtime stage, 5-COPY pin). D-02/D-03 amend it explicitly.
- `.planning/PROJECT.md` — standing constraints (zero runtime deps, zero migrations,
  full suite green, EN+FR i18n gate) and D-12 context.

### Behavior contracts to preserve unmodified
- `server.js` — ground truth: `openDb()` (~line 364), `DB_PATH`/`DATA_DIR` env resolution
  (~lines 72–82), `migrateTenancy`/pre-migration `vacuum into` backup pattern
  (~lines 2097–2126), `SEED_DATA` seed path (~line 1998).
- `.planning/PROJECT.md` §Decisions Phase 34 — notif prefs are STORED sparse rows;
  consumers read via `getStoredNotifPrefs` (relevant to table-copy script).
- `.env.example` and `DEPLOY.md` — env surface to extend with `DB_URL`;
  DEPLOY.md gains the pg deployment + copy-script runbook.

### Prior exploration (feasibility)
- Kanzo task `projectsstudio#5` comments (2026-11-05) — exploration conclusion: 216
  callsites, dialect inventory, Postgres-only recommendation, D-12 amendment estimate.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `openDb()` single choke point (server.js:364) — the natural place to branch
  SQLite vs Postgres backend construction.
- Migration machinery (`migrateTenancy`, pre-migration `vacuum into` backup,
  byte-identical second-boot discipline) — pg migrations mirror the idempotent pattern.
- `withDb` test fixture + `test/helpers` — the base the opt-in pg matrix extends.
- Env resolution block (server.js:72–82, `DB_PATH`/`DATA_DIR`) — where `DB_URL` joins.

### Established Patterns
- Fail-closed boot validation (loud D-K2 keyring checks, 503 masterKeyMissing) — D-04
  follows it.
- Pin-by-test discipline (dependencies.test.mjs, compose-config.test.mjs) — D-12/D-13
  guardrails should get compose/dependency pins the same way.
- D-12-style "one branch site per incompatibility" — governs D-10 dialect branch points.

### Integration Points
- Boot sequence: env parse → openDb → migrations → seed → scheduler → listen.
- Every `db.prepare/get/all/exec/run` callsite (~216) and the `--backup` CLI path
  (SQLite-only, stays SQLite-only per D-09).
- Dockerfile runtime stage COPY pin + docker-entrypoint.sh; docker-compose env example.
</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Owner accepted all
recommendations across the four areas (driver/D-12, async, dialects, data migration),
except D-12/D-13 where the owner chose the full-table one-shot copy script over the
empty-seed default.
</specifics>

<deferred>
## Deferred Ideas

- pg advisory locks for exactly-once claims (alternative to the transactional claim
  tables) — revisit if a pg-specific race shows up in the opt-in matrix.
- jsonb exploitation (server-side querying, partial indexes on the workspace document).
- Universal application-level JSON export backup (both backends) — new capability,
  candidate for a future Reliability milestone.
- SQL Server support — rejected 2026-11-07 (double dialect cost), revisit only on
  confirmed demand.
</deferred>

---

*Phase: 45-database-adapter-optional-postgres-backend-via-env-sqlite-de*
*Context gathered: 2026-11-07*
