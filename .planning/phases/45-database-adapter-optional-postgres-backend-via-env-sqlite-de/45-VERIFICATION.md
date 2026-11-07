---
phase: 45-database-adapter-optional-postgres-backend-via-env-sqlite-de
verified: 2026-11-07T19:10:00Z
status: passed
must_haves_hold: true
score: 8/8 must-haves verified
covered_files:
  - db-adapter.mjs
  - server.js
  - mcp.js
  - package.json
  - Dockerfile
  - docker-compose.yml
  - .env.example
  - DEPLOY.md
  - scripts/copy-sqlite-to-pg.mjs
  - test/db-adapter.test.mjs
  - test/pg-matrix.test.mjs
  - test/copy-sqlite-to-pg.test.mjs
  - test/static-db-audit.test.mjs
  - test/dependencies.test.mjs
  - test/helpers/server.mjs
covered_digest: "v2:sha256:f74aa0f9edae5b770d8ba402a5f3063075ae7721837ba3c3aca4901657c3e79c"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 8/8
  gaps_closed:
    - "Human verification item 1 (real external Postgres deploy) — resolved by UAT Test 1: pass, owner-accepted on local Docker evidence (boot+serve on DB_URL, fail-closed on unreachable DSN with no DSN leak; sslmode guidance documented in DEPLOY.md §15)"
    - "Human verification item 2 (operator migration of a real install) — resolved by UAT Test 2: pass, production-shaped SQLite db migrated to live pg 17 (15 tables incl. api_keys), pg boot serves traffic, rollback path (SQLite, DB_URL unset) intact"
  gaps_remaining: []
  regressions: []
---

# Phase 45: Database adapter — optional Postgres backend via env, SQLite default — Verification Report (re-verification)

**Phase Goal:** A deployer can point Projects Studio at Postgres purely through environment configuration; without that config the app keeps its current embedded-SQLite behavior unchanged.
**Verified:** 2026-11-07T19:10:00Z
**Status:** passed
**Re-verification:** Yes — after post-merge reconciliation commits `16c6bf4` (async facade reconciliation: mcp.js full async conversion, server.js /api/keys awaits + mcpDb forwarding stub, db-adapter.mjs api_keys SCHEMA mirror) and `67edc7b` (copy script carries 15 tables incl. api_keys), plus UAT closure of the two prior human-verification items (45-UAT.md 2/2 pass).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | With DB_URL unset, adapter serves get/all/run/tx against node:sqlite; suite stays green | ✓ VERIFIED | Full suite on main: 1126 tests, 1112 pass, 0 fail (24 skipped, pg matrix opt-in skips cleanly). SQLite default is byte-identical behavior; zero regressions |
| 2 | With DB_URL=postgres://…, pg loads via dynamic import only | ✓ VERIFIED | `db-adapter.mjs:458` single `await import('pg')`; 0 static `from 'pg'` in db-adapter.mjs, server.js, mcp.js, scripts/copy-sqlite-to-pg.mjs |
| 3 | run() returns { changes } on both backends; pg rowCount mapped | ✓ VERIFIED | Unit-pinned in test/db-adapter.test.mjs (26/26 against live pg); REM-03 exactly-once claim semantics pass |
| 4 | db.tx serializes on SQLite (mutex), checked-out pool client on pg | ✓ VERIFIED | tx serialize/rollback pins pass; matrix exercises tx end-to-end |
| 5 | Fail-closed boot: unreachable pg exits non-zero with err.code, never the DSN | ✓ VERIFIED | exit(1), code= only in db-adapter.mjs; UAT Test 1 confirmed live (unreachable DSN → fail-closed, DSN never printed) |
| 6 | Zero db.prepare/db.exec anywhere in the facade surface; every callsite awaited | ✓ VERIFIED post-reconciliation | Re-checked after `16c6bf4`: `grep -c "db\.(prepare|exec)("` = 0 in server.js AND mcp.js (mcp.js fully converted to awaited facade — authenticate, audit, loadDoc, writeDoc, roster/resolve/task paths all awaited; `{ ...await taskOut(...) }` spreads fixed); static-db-audit.test.mjs 4/4 pass |
| 7 | Copy script: all tables, dependency order, refuses non-empty target, count verification, source immutable | ✓ VERIFIED post-reconciliation | After `67edc7b`: TABLES contract now 15 tables incl. `api_keys` (line 44 block, comment documents Phase 46 drift); script + contract-test mirror both 15; contract tests 4/4 against live pg; UAT Test 2 planted api_keys row migrated with parity |
| 8 | Opt-in pg matrix (D-08): green with POSTGRES_TEST_URL, cleanly skipped without | ✓ VERIFIED | db-adapter.test.mjs 26/26 pass against container `pg45verify` (127.0.0.1:5432) this run; copy contract 4/4 sequential; unset → skipped, exit 0 |

**Score:** 8/8 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `db-adapter.mjs` | async facade + rewrite + probe | ✓ VERIFIED | get/all/run/tx/sqliteOnly/toPgSql/pgSchemaVariant/connectDb/ensureColumn/runSchema/close/backendKind; api_keys table now in SQLITE_SCHEMA mirror (lines 275–289) per `16c6bf4` |
| `server.js` | async facade callsites + mcp wiring | ✓ VERIFIED post-reconciliation | /api/keys routes awaited; `mcpDb` forwarding stub (line 5748) resolves live db per call — fixes the prior top-level `db: null` bug; `createMcp` wired at line 5762 |
| `mcp.js` | full async facade (merged Phase 46 code) | ✓ VERIFIED post-reconciliation | Zero sync db.prepare/exec; all db.* calls awaited incl. awaited edit callbacks (no more fire-and-forget stale-doc commits) |
| `package.json` | pg as sole runtime dep | ✓ VERIFIED | `pg` pinned ^8.x; dependencies.test.mjs pin (D-12 as amended) passes |
| `Dockerfile` | runtime stage carries pg | ✓ VERIFIED | dated Phase 45/D-03 comment + COPY node_modules + db-adapter.mjs; Dockerfile pin passes |
| `.env.example` | DB_URL documented, empty default | ✓ VERIFIED | optional Database backend block, empty `DB_URL=` |
| `docker-compose.yml` | DB_URL passthrough | ✓ VERIFIED | `DB_URL: ${DB_URL:-}` |
| `DEPLOY.md` | §15 pg operator runbook | ✓ VERIFIED | §15 (line 1107+): fail-closed boot, DSN-as-secret, sslmode guidance, stop→copy→boot, projects.db rollback (D-14), pg_dump (D-09) |
| `scripts/copy-sqlite-to-pg.mjs` | one-shot copy tool, all tables | ✓ VERIFIED post-reconciliation | 15-table TABLES contract (`67edc7b`); imports pgSchemaVariant (no duplication); exercised live in UAT Test 2 |
| `test/copy-sqlite-to-pg.test.mjs` | contract pins incl. api_keys | ✓ VERIFIED | mirror updated to 15 tables (`67edc7b`); 4/4 pass live |
| `test/db-adapter.test.mjs` | Wave-0 contract pins | ✓ VERIFIED | 26/26 against live pg this run |
| `test/pg-matrix.test.mjs` | opt-in critical-path matrix | ✓ VERIFIED | 7/7 live (prior run + documented); skipped exit 0 unset |
| `test/static-db-audit.test.mjs` | permanent D-05/D-10 gates | ✓ VERIFIED | 4/4 pass this run — pins the post-reconciliation state |
| `test/dependencies.test.mjs` | amended deps + COPY pins | ✓ VERIFIED | runtime deps exactly { pg } (D-12 amended), passes |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| server.js boot | db-adapter.mjs | `connectDb({dbPath, dbUrl})` | ✓ WIRED | import + sqliteOnly gates intact after merge |
| server.js → MCP | mcp.js | `createMcp({ db: mcpDb, ... })` (line 5762) | ✓ WIRED post-reconciliation | mcpDb forwarding stub defers to live `db` per call; `/mcp` calls no longer crash on sync API |
| db-adapter selectBackend | DB_URL parse | postgres:// prefix | ✓ WIRED | non-postgres:// refused; pinned |
| pgSchemaVariant | server.js SCHEMA mirror | mirror-sync pin | ✓ WIRED | pin passes incl. api_keys |
| copy script | pgSchemaVariant export | import (not duplicated) | ✓ WIRED | contract tests pass |
| Dockerfile runtime COPY | dependencies.test.mjs pin | deepEqual array | ✓ WIRED | pin passes |
| pg-matrix | helpers/server.mjs | withPg + startServer env | ✓ WIRED | matrix runs through the same harness |
| run() {changes} | exactly-once claim sites | `r.changes === 0` gates | ✓ WIRED | REM-03 claim semantics pass on both backends |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite (fresh, post-reconciliation) | `npm test` on main | 1126 tests, 1112 pass, 0 fail, 24 skipped | ✓ PASS |
| Adapter contract pins vs live pg | `POSTGRES_TEST_URL=… node --test test/db-adapter.test.mjs` | 26 pass / 0 fail | ✓ PASS |
| Copy contract vs live pg | `POSTGRES_TEST_URL=… node --test --test-concurrency=1 test/copy-sqlite-to-pg.test.mjs` | 4 pass / 0 fail | ✓ PASS |
| Static audit (D-05) | `node --test test/static-db-audit.test.mjs` | 4 pass / 0 fail | ✓ PASS |
| Static grep | `grep -c "db\.(prepare\|exec)("` on server.js + mcp.js | 0 / 0 | ✓ PASS |
| pg matrix + copy unset | same files without POSTGRES_TEST_URL | skipped, exit 0 | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` declared or conventional — skipped.

### Requirements Coverage

Requirement IDs of record: **DBA-01..04** (REQUIREMENTS.md) and CONTEXT decision IDs D-01..D-14 (per ROADMAP.md). Every PLAN `requirements:` ID accounted for (45-01: D-01,02,04,05,06,09,10; 45-02: D-02,03; 45-03: D-05,07,09; 45-04: D-05,06,10; 45-05: D-07,09,10,11; 45-06: D-12,13,14; 45-07: D-04,08) — none orphaned.

| Requirement | Source Plan(s) | Decision | Status | Evidence |
|-------------|----------------|----------|--------|----------|
| DBA-01 env-selected Postgres backend | 45-01, 45-07 | D-01, D-02, D-04 | ✓ SATISFIED | DB_URL selects pg via dynamic import; fail-closed boot; live matrix green |
| DBA-02 no divergence between backends | 45-03, 45-04, 45-05 | D-05, D-06, D-07, D-10, D-11 | ✓ SATISFIED | Full suite 1126/0-fail on SQLite default; pg matrix passes same semantics (claims, tx, epochs, prefs) |
| DBA-03 D-12 constraint amendment decided + documented + test updated | 45-01, 45-02 | D-02 | ✓ SATISFIED | pg is the first (and sole) runtime dependency; test/dependencies.test.mjs pins exactly { pg } ("D-12 as amended by Phase 45 D-02"); DEPLOY.md documents the carve-out |
| DBA-04 DEPLOY.md env matrix + fail-fast docs | 45-06, 45-07 | D-13, D-14 | ✓ SATISFIED | DEPLOY.md §15: fail-closed, DSN-as-secret, sslmode, stop→copy→boot, rollback |
| D-01..D-14 (all) | all plans | — | ✓ SATISFIED | See prior report table, re-confirmed post-reconciliation; D-13 now 15-table contract |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | No TBD/FIXME/XXX/TODO/PLACEHOLDER markers in any phase-modified file (re-scanned incl. mcp.js and copy script post-reconciliation) |

### Human Verification Required

None. Both prior items were resolved by UAT (45-UAT.md, status: complete, 2/2 pass):
1. **Real external Postgres deploy** — pass, owner-accepted on local Docker evidence: pg container + DB_URL boots and serves traffic; unreachable DSN fail-closes with clear error, DSN never printed; sslmode choice documented (DEPLOY.md §15 / README).
2. **Operator migration of a real install** — pass: production-shaped SQLite db (15 tables, planted api_keys row) migrated to live pg 17; pg boot serves traffic with row parity; rollback path (SQLite, DB_URL unset) intact. This test surfaced and fixed the api_keys migration drift (`67edc7b`).

### Gaps Summary

None. The reconciliation commits are fully absorbed: `16c6bf4` converted the merged MCP-era sync code to the awaited async facade (zero db.prepare/exec remain in server.js or mcp.js; static audit pin enforces this permanently) and mirrored api_keys into the adapter SCHEMA; `67edc7b` carried api_keys into the copy-script TABLES contract so a real migration never silently drops API keys. Full suite is green (0 fail). All roadmap success criteria hold: env-selected Postgres (SC1), unmodified suites on both backends (SC2), D-12 amendment decided/documented/test-pinned (SC3), DEPLOY.md env matrix + fail-fast (SC4). Phase goal achieved; both human-verification items closed via UAT.

---

_Verified: 2026-11-07T19:10:00Z_
_Verifier: the agent (gsd-verifier)_
