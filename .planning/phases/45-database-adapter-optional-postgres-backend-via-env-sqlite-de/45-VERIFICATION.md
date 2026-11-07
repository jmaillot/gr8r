---
phase: 45-database-adapter-optional-postgres-backend-via-env-sqlite-de
verified: 2026-11-07T15:20:00Z
status: human_needed
score: 8/8 must-haves verified
covered_files:
  - db-adapter.mjs
  - server.js
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
covered_digest: "manual:sha256:0b3a276c25a01368ab1d168028125ae0a9c84c40b7b5f28e3d7bfdad4616a83b"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Deploy the pg-built Docker image against a REAL external Postgres (managed or TLS endpoint) with DB_URL set, including sslmode=verify-full"
    expected: "Server boots, serves authenticated traffic on pg; boot refuses with a clear error and no DSN leak if credentials are wrong"
    why_human: "The matrix proves the code against a local Docker pg; a real managed endpoint exercises TLS/sslmode, network auth and the packaged image itself — not verifiable from this checkout"
  - test: "Run scripts/copy-sqlite-to-pg.mjs against a production-shaped real install (existing projects.db with legacy ensureColumn columns), then boot the server on pg and keep projects.db as rollback"
    expected: "Copy commits with per-table counts, server boots on pg with all data, rollback path intact"
    why_human: "The contract tests use synthetic fixtures; a real operator migration validates legacy-column intersection and data fidelity on genuine data — an operational judgment"
---

# Phase 45: Database adapter — optional Postgres backend via env, SQLite default — Verification Report

**Phase Goal:** A deployer can point Projects Studio at Postgres purely through environment configuration; without that config the app keeps its current embedded-SQLite behavior unchanged.
**Verified:** 2026-11-07T15:20:00Z
**Status:** human_needed (deployment-level checks only — all code truths verified, zero gaps)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | With DB_URL unset, adapter serves get/all/run/tx against node:sqlite; suite stays green | ✓ VERIFIED | 69/69 pass: db-adapter + dependencies + static-db-audit + migration suites; full suite 1065 pass (SQLite path = default), zero regressions vs documented baseline |
| 2 | With DB_URL=postgres://…, pg loads via dynamic import only | ✓ VERIFIED | `db-adapter.mjs:441` single `await import('pg')`, 0 static `from 'pg'`; live pg-matrix boot+auth test passed against real Postgres |
| 3 | run() returns { changes } on both backends; pg rowCount mapped | ✓ VERIFIED | Unit-pinned in test/db-adapter.test.mjs; REM-03 exactly-once claim test passed on live pg |
| 4 | db.tx serializes on SQLite (mutex), checked-out pool client on pg | ✓ VERIFIED | tx serialize/rollback unit pins pass; matrix exercises tx paths end-to-end on pg |
| 5 | Fail-closed boot: unreachable pg exits non-zero with err.code, never the DSN | ✓ VERIFIED | `db-adapter.mjs:451-466` (exit(1), code= only); live matrix test: closed-port child, non-zero exit, `postgres://` absent from output — PASSED against real pg |
| 6 | Zero db.prepare/db.exec in server.js; facade surface exactly get/all/run/tx | ✓ VERIFIED | grep count = 0; static-db-audit.test.mjs permanent pins all pass (4/4) |
| 7 | Copy script: 14 tables, dependency order, refuses non-empty target, count verification, source immutable | ✓ VERIFIED | All 4 contract tests PASSED against live Postgres (fresh container): happy path with per-table parity + doc verbatim, refusal exit 1 + D-13 string, SHA-256 source immutability, no DSN in output |
| 8 | Opt-in pg matrix (D-08): green with POSTGRES_TEST_URL, cleanly skipped without | ✓ VERIFIED | 7/7 pass against Docker postgres:17-alpine (~5s); unset → 11 tests skipped, exit 0 (both matrix + copy files) |

**Score:** 8/8 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `db-adapter.mjs` | async facade + rewrite + probe | ✓ VERIFIED | exports get/all/run/tx/sqliteOnly/toPgSql/pgSchemaVariant/connectDb/ensureColumn/runSchema/close/backendKind |
| `package.json` | pg as sole runtime dep | ✓ VERIFIED | `"pg": "^8.23.1"` at line 37 (dependencies, D-02 amended pin passes) |
| `test/db-adapter.test.mjs` | Wave-0 contract pins | ✓ VERIFIED | 26 tests pass |
| `test/dependencies.test.mjs` | amended deps + COPY pins | ✓ VERIFIED | runtime COPY array includes db-adapter.mjs + node_modules (D-03), passes |
| `Dockerfile` | runtime stage carries pg | ✓ VERIFIED | lines 20–22: dated Phase 45/D-03 comment + COPY node_modules + db-adapter.mjs |
| `.env.example` | DB_URL documented, empty default | ✓ VERIFIED | lines 111–116: optional Database backend block, empty `DB_URL=`, example commented |
| `docker-compose.yml` | DB_URL passthrough | ✓ VERIFIED | `DB_URL: ${DB_URL:-}` line 49 |
| `DEPLOY.md` | §15 pg operator runbook | ✓ VERIFIED | §15 at line 1107: fail-closed, DSN-as-secret, sslmode guidance, stop→copy→boot, projects.db rollback (D-14), pg_dump (D-09) |
| `scripts/copy-sqlite-to-pg.mjs` | one-shot copy tool | ✓ VERIFIED | exercised end-to-end against live pg; imports pgSchemaVariant (no duplication) |
| `test/copy-sqlite-to-pg.test.mjs` | contract pins | ✓ VERIFIED | 4/4 pass live; skipped exit 0 unset |
| `test/pg-matrix.test.mjs` | opt-in critical-path matrix | ✓ VERIFIED | 7/7 pass live (boot+auth+second-boot, fail-closed, claims, case-login, epoch typing, prefs upsert, challenges) |
| `test/static-db-audit.test.mjs` | permanent D-05/D-10 gates | ✓ VERIFIED | 4 pins pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| server.js boot | db-adapter.mjs | `connectDb({dbPath, dbUrl})` (line 374) | ✓ WIRED | imports at line 64; sqliteOnly gates at 10+ sites |
| db-adapter selectBackend | DB_URL parse | postgres:// prefix | ✓ WIRED | non-postgres:// refused; pinned |
| pgSchemaVariant | server.js SCHEMA | mirror-sync pin | ✓ WIRED | test/db-adapter.test.mjs mirror pin passes |
| copy script | pgSchemaVariant export | import (not duplicated) | ✓ WIRED | contract tests pass |
| Dockerfile runtime COPY | dependencies.test.mjs pin | deepEqual array | ✓ WIRED | pin passes |
| pg-matrix | helpers/server.mjs | withPg + startServer env | ✓ WIRED | matrix runs through the same harness |
| run() {changes} | exactly-once claim sites | `r.changes === 0` gates | ✓ WIRED | REM-03 claim test passed on live pg |

### Data-Flow Trace (Level 4)

No rendered-dynamic-data artifacts in this phase (backend-only). Data flow verified at the API boundary instead: matrix asserts real pg-sourced payloads (epoch timestamps as numbers, workspace doc verbatim, counts parity).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Adapter/audit/migration/dependency pins | `node --test test/db-adapter.test.mjs test/dependencies.test.mjs test/static-db-audit.test.mjs test/migration.test.mjs` | 69 pass / 0 fail | ✓ PASS |
| pg matrix, live Postgres | `POSTGRES_TEST_URL=… node --test test/pg-matrix.test.mjs` | 7 pass / 0 fail (~5s) | ✓ PASS |
| Copy script contract, live Postgres | `POSTGRES_TEST_URL=… node --test --test-concurrency=1 test/copy-sqlite-to-pg.test.mjs` | 4 pass / 0 fail | ✓ PASS |
| Opt-in gates unset | same files without env | 11 skipped, exit 0 | ✓ PASS |
| Full suite | `npm test` | 1083 tests, 1065 pass, 4 fail, 14 skipped | ✓ PASS (4 fails = pre-existing baseline: i18n catalogue ×3, SPA deep-link — documented in 45-05/45-07 summaries, unrelated to this phase) |

Note: the two pg suite files must not be run in one concurrent `node --test` invocation — they share one Postgres schema and interfere (verified: concurrent run produced spurious cross-file failures; sequential runs are green). This is a test-invocation property, not a code defect; both files pass in isolation and in the documented `POSTGRES_TEST_URL=… node --test` per-file invocation.

### Probe Execution

No `scripts/*/tests/probe-*.sh` declared or conventional — skipped.

### Requirements Coverage

Requirement IDs of record are the CONTEXT.md decision IDs D-01..D-14 (per ROADMAP.md; no separate REQUIREMENTS.md exists for this milestone — no orphaned IDs possible).

| Requirement | Source Plan(s) | Decision | Status | Evidence |
|-------------|----------------|----------|--------|----------|
| D-01 pg driver | 45-01 | node-postgres | ✓ SATISFIED | pg@^8.23.1 in dependencies; import shape pinned |
| D-02 conditional load + pin amendment | 45-01, 45-02 | dynamic import only | ✓ SATISFIED | 0 static pg imports; dependencies.test.mjs amended, passes |
| D-03 single Docker image | 45-02 | node_modules in runtime stage | ✓ SATISFIED | Dockerfile lines 20–22; COPY pin passes |
| D-04 fail-closed boot | 45-01, 45-07 | exit(1), no DSN | ✓ SATISFIED | code at db-adapter.mjs:451/465; live test passed |
| D-05 unified async facade | 45-01, 45-03, 45-04 | all callsites awaited | ✓ SATISFIED | grep db.(prepare\|exec) == 0; static audit pin |
| D-06 minimal facade (4 methods) | 45-01, 45-04 | no shim | ✓ SATISFIED | TRANSITIONAL removed; shim-absence pinned |
| D-07 portable seed / db.tx | 45-03, 45-05 | common SQL seed | ✓ SATISFIED | seed-determinism pin; matrix second-boot no-op live |
| D-08 opt-in test matrix | 45-07 | POSTGRES_TEST_URL gate | ✓ SATISFIED | 7/7 live, skipped exit 0 unset |
| D-09 SQLite-only ops gated | 45-01, 45-03, 45-05 | sqliteOnly, pg_dump docs | ✓ SATISFIED | 10+ gates; whitelist lint; DEPLOY.md §15 |
| D-10 dialect branch points in adapter | 45-01, 45-04, 45-05 | one branch per incompatibility | ✓ SATISFIED | toPgSql rewrite table unit-pinned (incl. Plan 07's post-param collate + IS DISTINCT FROM fixes) |
| D-11 doc as text column | 45-05 | no jsonb | ✓ SATISFIED | variant text column pinned; copy test asserts verbatim doc |
| D-12 one-shot copy script | 45-06 | scripts/, no boot migration | ✓ SATISFIED | script exists, exercised live |
| D-13 all tables, refuse non-empty, count verify | 45-06 | dependency order | ✓ SATISFIED | refusal + parity tests passed live |
| D-14 source immutable, rollback docs | 45-06 | readOnly handle | ✓ SATISFIED | SHA-256 test passed; DEPLOY.md runbook |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | No TBD/FIXME/XXX/stub markers in any phase-modified file |

### Human Verification Required

See frontmatter `human_verification`: (1) real external/managed Postgres deployment with TLS via the packaged Docker image; (2) operator migration of a production-shaped real install via the copy script. Both are external-service/operational checks not reproducible from this checkout.

### Gaps Summary

None. All 8 must-have truths verified with behavioral evidence — the critical paths were exercised against a live Postgres (Docker postgres:17-alpine) during this verification, not just claimed: boot+auth, second-boot idempotency, fail-closed DSN-free boot, exactly-once claims, case-variant login, epoch typing, prefs upsert, and the full copy-script contract (transfer parity, refusal, source immutability, secret hygiene). The SQLite-default path is regression-clean: the full suite's only failures are the 4 documented pre-existing baseline flakes (i18n catalogue ×3, SPA deep-link), byte-identical to the set recorded before this phase's work. Phase goal achieved at the code level; deployment-level confirmation routed to human verification.

---

_Verified: 2026-11-07T15:20:00Z_
_Verifier: the agent (gsd-verifier)_
