---
phase: 45
plan: 06
subsystem: database
tags: [postgres, sqlite, copy-script, migration, deploy-docs]
requires: ["45-05 (pgSchemaVariant export — the script imports it to create the target schema)", "45-01 (db-adapter facade)"]
provides: ["scripts/copy-sqlite-to-pg.mjs — one-shot SQLite→pg operator migration tool (D-12/D-13/D-14)", "test/copy-sqlite-to-pg.test.mjs — 4 POSTGRES_TEST_URL-gated contract tests", "DEPLOY.md §15 — pg backend operator runbook"]
affects: ["45-07 (pg matrix reuses the POSTGRES_TEST_URL gate + ephemeral pg runbook)", "operators migrating existing installs"]
tech-stack:
  added: []
  patterns: ["read-only DatabaseSync({ readOnly: true }) for structural source immutability", "source∩target column intersection for legacy-column tolerance", "checked-out-client tx with release-before-pool.end()"]
key-files:
  created:
    - scripts/copy-sqlite-to-pg.mjs
    - test/copy-sqlite-to-pg.test.mjs
  modified:
    - DEPLOY.md
decisions:
  - source opened DatabaseSync(path, { readOnly: true }) — D-14 immutability enforced at the driver, not by discipline
  - copy uses the INTERSECTION of source and target columns — boot-migration columns (memberships.team/scope) absent from the pg variant are skipped, keeping legacy DBs migrable
  - target schema created via imported pgSchemaVariant() — never duplicated (Plan 05 single-owner contract)
  - client.release() must precede pool.end() (end() waits on checked-out clients) — failure paths exit promptly
requirements-completed: [D-12, D-13, D-14]
metrics:
  duration: ~21 min
  completed: 2026-11-07
status: complete
actuals:
  tokens: 22000
  tasks: 2
  commits: 2
  plan_head_before: a714587
  plan_head_after: 9b2d0f8
commits: 2
---

# Phase 45 Plan 06: One-shot SQLite→Postgres copy script + DEPLOY.md runbook Summary

One-shot operator tool that moves a real SQLite install to Postgres — refuses a non-empty target with per-table counts, transfers all 14 tables in dependency order inside one transaction with per-table count verification before commit, structurally never writes the source (readOnly handle), never prints the DSN — pinned by 4 POSTGRES_TEST_URL-gated contract tests and documented as the DEPLOY.md §15 stop→copy→boot runbook.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (tracer) | copy script — full source→target transfer path | 0f792e2 | scripts/copy-sqlite-to-pg.mjs |
| 2 | script contract tests + DEPLOY.md runbook | 9b2d0f8 | test/copy-sqlite-to-pg.test.mjs, DEPLOY.md, scripts/copy-sqlite-to-pg.mjs |

Tracer gate: automated verify re-run green — the script was exercised end-to-end against a real ephemeral Postgres (postgres:17-alpine in Docker) before expansion: full copy commits with per-table counts, second run refuses with exit 1 + D-13 string, source SHA-256 unchanged.

## What Shipped

- **scripts/copy-sqlite-to-pg.mjs**: CLI (source arg + `DB_URL` postgres:// target, usage text with no DSN fragment); source opened `DatabaseSync(path, { readOnly: true })` (D-14 structural); target schema via imported `pgSchemaVariant()` from db-adapter.mjs; refuses non-empty target with per-table counts (D-13); 14 tables in dependency order (users, workspaces → user_notif_prefs) inserted with `$n` parameters inside ONE transaction on a checked-out client; value map integer→number / text verbatim (D-11) / null→null, anything else refuses loudly; per-table pg-vs-SQLite count verification before COMMIT with full rollback on mismatch; completion summary carries table names + counts only (T-45-09); source∩target column intersection tolerates legacy boot-migration columns (`memberships.team`/`scope`) the pg variant does not create.
- **test/copy-sqlite-to-pg.test.mjs**: 4 contract tests, POSTGRES_TEST_URL-gated (unset → all skipped, exit 0 — D-08): (a) happy path against a REAL server-booted SQLite file with per-table count parity, workspace doc verbatim, sparse stored user_notif_prefs row; (b) refuse-non-empty — second run exits 1 with the D-13 string and prints occupied-table counts; (c) source immutability — SHA-256 byte-identical across copy AND refusal runs; (d) no-secret-leak — child output contains no connection string.
- **DEPLOY.md §15 "Postgres backend (optional)"**: why/when + fail-closed boot, DB_URL-as-secret handling, sslmode guidance (require vs verify-full, T-45-07), the stop→copy→boot runbook with projects.db kept as rollback (D-14) and pg mode never falling back to it (D-04), pg_dump backups (D-09).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Legacy boot-migration columns broke the transfer**
- **Found during:** Task 2 verify (happy-path test against a real server-booted source)
- **Issue:** server boot adds `memberships.team`/`scope` via ensureColumn; the pg variant does not create them, so copying the source column list verbatim failed the insert (`column "team" of relation "memberships" does not exist`).
- **Fix:** intersect source columns with the target's information_schema column set before building the insert.
- **Files modified:** scripts/copy-sqlite-to-pg.mjs · **Commit:** 9b2d0f8

**2. [Rule 1 - Bug] Failure path hung the child process**
- **Found during:** Task 2 verify (child never exited after the failed copy)
- **Issue:** `pool.end()` ran inside `catch` while the checked-out client was only released in `finally` — `end()` waits on checked-out clients, so the child never exited.
- **Fix:** restructured to `failure` flag: release in `finally`, then `pool.end()` → close → conditional `process.exit(1)`.
- **Files modified:** scripts/copy-sqlite-to-pg.mjs · **Commit:** 9b2d0f8

**3. [Rule 1 - Bug] Test compared objects by reference**
- **Found during:** Task 2 verify
- **Issue:** with `node:assert/strict`, `assert.equal` is `strictEqual` — compared the two count objects by reference, failing despite identical content.
- **Fix:** `assert.deepEqual` for the count map.
- **Files modified:** test/copy-sqlite-to-pg.test.mjs · **Commit:** 9b2d0f8 (pre-commit fix)

### Out-of-Scope Discoveries (deferred, not fixed)

None new — the 4 full-suite failures are the same pre-existing catalogue/SPA flakes recorded in 45-05's deferred-items.md (verified identical set at baseline).

## Verification

- `node scripts/copy-sqlite-to-pg.mjs` (no args) → exit 1, usage text, zero `postgres://` occurrences
- Script with source but no `DB_URL` → exit 1; source path missing → exit 1
- End-to-end against ephemeral pg (Docker postgres:17-alpine): copy committed (14 tables, exit 0); re-run refused (exit 1, D-13 string)
- `POSTGRES_TEST_URL=… node --test test/copy-sqlite-to-pg.test.mjs` → 4 pass / 0 fail
- Unset gate: 4 skipped, exit 0
- Full `npm test`: 1074 tests, 1063 pass / 4 fail — all 4 are the pre-existing 45-05 baseline flakes; 7 skipped include the 4 new pg-gated tests
- DEPLOY.md grep: runbook, rollback, pg_dump, sslmode, secret warning all present

## Threat Model Notes

- T-45-09 (destructive tool): mitigated — refusal gate with per-table counts, single transaction, count verification before commit, no DSN in any output path (test-pinned).
- T-45-10 (source mutation): mitigated structurally — `readOnly: true` handle; hash-immutability test covers copy and refusal runs (D-14).
- T-45-SC (npm installs): no new installs this plan; `pg` audited in Plan 01.

## Known Stubs

None.

## Self-Check: PASSED

- scripts/copy-sqlite-to-pg.mjs, test/copy-sqlite-to-pg.test.mjs exist on disk; DEPLOY.md §15 present.
- Commits 0f792e2, 9b2d0f8 verified in `git log a714587..HEAD` (2 commits).
- All 4 contract tests re-run green against ephemeral pg; unset-gate run skipped cleanly.
