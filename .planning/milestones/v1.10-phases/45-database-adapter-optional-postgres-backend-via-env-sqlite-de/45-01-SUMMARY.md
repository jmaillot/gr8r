---
phase: 45
plan: 01
subsystem: database-adapter
tags: [postgres, sqlite, adapter, dialect-rewrite, fail-closed, d-02, d-12-amendment]
requires:
  - server.js SCHEMA + openDb choke point (untouched)
  - node:sqlite DatabaseSync (Node 24)
provides:
  - db-adapter.mjs — async facade get/all/run/tx + sqliteOnly + toPgSql + backendKind + pgSchemaVariant + connectDb (fail-closed boot)
  - DB_URL env surface (postgres:// only; non-postgres:// refused)
  - test/helpers/server.mjs withPg/dropPgSchema fixtures + DB_URL pass-through
  - pg@^8.23.1 as the sole runtime dependency (D-02 amended pins)
affects:
  - server.js boot path (Plan 03 swaps to connectDb)
  - test/pg-matrix.test.mjs (Plan 07 binds to withPg)
tech-stack:
  added: [pg@^8.23.1]
  patterns: [conditional-dynamic-import, promise-queue-tx-mutex, checked-out-client-pg-tx, literal-aware-sql-rewrite, fail-closed-boot-probe]
key-files:
  created: [db-adapter.mjs, test/db-adapter.test.mjs]
  modified: [package.json, package-lock.json, test/dependencies.test.mjs, test/catalogue.test.mjs, test/helpers/server.mjs]
key-decisions:
  - rows normalized to plain objects in the adapter so SQLite and pg return identical row shapes
  - run() synthesizes exactly { changes } on both backends (drops node:sqlite's lastInsertRowid from the contract)
  - sqliteOnly carries a kind DI seam so the pg branch is pinned without a real pg server
  - insert-or-replace upsert rewrite uses a known conflict-target map (user_notif_prefs composite PK)
  - pgSchemaVariant embeds a transitional copy of SCHEMA until Plan 05 finalizes the single source
requirements-completed: [D-01, D-02, D-04, D-05, D-06, D-09, D-10]
commits: 3
plan_head_before: e7be348
plan_head_after: 53c4e07
actuals:
  tokens: 22600   # chars/4 over the 904-insertion diff — plan estimated 90000
  tasks: 3
  commits: 3
duration: 24 min
completed: 2026-11-07
status: complete
---

# Phase 45 Plan 01: Database adapter facade Summary

**One-liner:** Async dual-backend `db-adapter.mjs` — node:sqlite default with pg loaded via dynamic import only under `DB_URL=postgres://`, fail-closed boot probe that never leaks the DSN, and a test-pinned literal-aware SQL rewrite table neutralizing every SQLite-ism (D-02/D-04/D-05/D-06/D-09/D-10).

## Accomplishments

- `db-adapter.mjs` (new): async facade `get/all/run/tx` over SQLite (default, pragmas moved from server.js openDb) and pg (Pool max 10, timeouts explicit, pool error listener); `run()` returns `{ changes }` on both; `tx` serializes concurrent SQLite bodies via a promise-queue mutex and uses a checked-out pool client on pg (never `pool.query('BEGIN')`); `sqliteOnly` capability gate (D-09); transitional `prepare`/`exec` passthrough for the Plan 03–04 callsite waves.
- `toPgSql` rewrite layer: `insert or ignore` → `on conflict do nothing`, `insert or replace` → `on conflict(workspace_id, user_id) do update set … = excluded.*`, `begin immediate` → `begin`, `?` → `$1..$n` (skips single-quoted spans), `col collate nocase = ?` → `lower(col) = lower(?)` — one branch site per incompatibility, every row unit-pinned (T-45-01).
- Fail-closed boot (D-04/T-45-02): unreachable pg → `process.exit(1)` logging `err.code` + message only; child-process test asserts the DSN never appears in output; non-postgres:// `DB_URL` refused loudly.
- `pg@^8.23.1` installed as the first runtime dependency (plain `dependencies`, never optionalDependencies); dependency pins amended in `test/dependencies.test.mjs` (header + first test rewritten with dated D-02 comment).
- `test/helpers/server.mjs`: `withPg` (open→fn→pool.end discipline), `dropPgSchema` (14 tables, reverse dependency order), `DB_URL` env pass-through in `startServer` (DB_PATH stripped when set).
- 20-test `test/db-adapter.test.mjs` Wave 0 backbone: facade shape (async, exactly 4 methods), `{changes}` exactly-once claim, tx rollback + serialization, all rewrite rows, sqliteOnly gating via DI, pgSchemaVariant nocase-free + `users(lower(email))` unique index, fail-closed boot shape.

## Verification

- `node --test test/db-adapter.test.mjs test/dependencies.test.mjs test/migration.test.mjs` → 57 pass, 0 fail (adapter suite: 20/20, 0.24s wall — well under the 120s budget)
- `npm test` full suite → 1060 tests, 1052 pass, 5 fail — the 5 are byte-identical to the pre-existing baseline failures verified against a HEAD throwaway worktree (D-74 backup, i18n catalogue ×3, SPA deep-link); zero regressions introduced
- `grep -c "from 'pg'" db-adapter.mjs` → 0; `await import('pg')` → 1 (conditional load only, D-02)
- Export surface check lists all 9+2 required exports
- `pgSchemaVariant()` → 0 `collate nocase` occurrences, contains `users_email_nocase on users(lower(email))`

## Coverage

```yaml
coverage:
  - deliverable: SQLite-default facade round-trip (get/all/run/{changes}/tx)
    verification: [{ kind: tests, ref: "test/db-adapter.test.mjs#SQLite backend round-trip", status: pass }]
    human_judgment: false
  - deliverable: tx serialization + rollback on SQLite
    verification: [{ kind: tests, ref: "test/db-adapter.test.mjs#tx serializes/rollback", status: pass }]
    human_judgment: false
  - deliverable: toPgSql rewrite table rows (T-45-01)
    verification: [{ kind: tests, ref: "test/db-adapter.test.mjs#toPgSql rows", status: pass }]
    human_judgment: false
  - deliverable: sqliteOnly pg gating (D-09)
    verification: [{ kind: tests, ref: "test/db-adapter.test.mjs#sqliteOnly pg-branch DI pin", status: pass }]
    human_judgment: false
  - deliverable: fail-closed boot probe, no DSN leak (D-04/T-45-02)
    verification: [{ kind: tests, ref: "test/db-adapter.test.mjs#connectDb unreachable postgres child-process", status: pass }]
    human_judgment: false
  - deliverable: pg path end-to-end against a live Postgres (adapter queries, claims, pool behavior)
    verification: []
    human_judgment: true
    rationale: needs POSTGRES_TEST_URL matrix (Plan 07); no live pg server was available during this plan
  - deliverable: withPg/dropPgSchema fixtures usable by the matrix
    verification: [{ kind: command, ref: "node -e import check → function/function/function", status: pass }]
    human_judgment: false
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Duplicate zero-dependency pin in test/catalogue.test.mjs**
- **Found during:** Task 1 (full suite run)
- **Issue:** `test/catalogue.test.mjs` carries a second "no runtime dependency" assertion — installing pg broke it; the plan's file list only named dependencies.test.mjs
- **Fix:** Amended to require exactly `{ pg }` with a dated D-02 comment, matching the dependencies.test.mjs amendment
- **Files modified:** test/catalogue.test.mjs
- **Commit:** 52506c0

**2. [Rule 1 - Bug] node:sqlite row shape leaked null-prototype objects**
- **Found during:** Task 1 (round-trip test)
- **Issue:** DatabaseSync rows are null-prototype and run() carried extra `lastInsertRowid`; pg rows are plain — facade would diverge per backend
- **Fix:** Adapter normalizes rows to plain objects and `run()` returns exactly `{ changes }` on both backends
- **Files modified:** db-adapter.mjs
- **Commit:** 53c4e07

**Pre-existing failures (out of scope, logged not fixed):** D-74 backup test, i18n catalogue pins ×3, SPA deep-link test fail identically at HEAD baseline (verified in a throwaway worktree at e7be348). One workspace-logo failure observed once was a flaky async-unlink race — passes consistently.

**Total deviations:** 2 auto-fixed (Rule 3 ×1, Rule 1 ×1). **Impact:** minor — one extra test file amended; adapter row-shape normalization makes the facade backend-identical.

## Known Stubs

- `db-adapter.mjs` SQLITE_SCHEMA constant is a transitional verbatim copy of server.js SCHEMA (marked in-source); Plan 05 finalizes the single pg schema body — deliberate per plan ("full body finalized in Plan 05").
- `sqliteOnly` info-line on real pg backend exercised only via DI in unit tests; live-pg observation deferred to the Plan 07 matrix.

## Authentication Gates

None.

## Threat Model Compliance

- T-45-01: toPgSql is a pure SQL-text transform, literal-aware; every row pinned. ✓
- T-45-02: boot error emits err.code + message only; DSN-leak asserted absent by test. ✓
- T-45-03: Pool max 10 / 5s connect timeout / 10s idle timeout; `pool.on('error')` attached. ✓
- T-45-SC: pg 8.23.1 legitimacy pre-audited OK in 45-RESEARCH.md; installed at pinned ^8.23.1. ✓

## Next

Ready for 45-02 (callsite conversion waves / boot-path swap per phase roadmap).

## Self-Check: PASSED

- [x] db-adapter.mjs, test/db-adapter.test.mjs exist on disk (git ls-files OK)
- [x] Commits 52506c0, 18866cc, 53c4e07 present on feat/sql
- [x] All task acceptance criteria re-run and passing
- [x] Plan-level verification re-run: adapter/dependencies/migration suites green; npm test at baseline parity
