---
phase: 45
plan: 07
subsystem: database
tags: [postgres, sqlite, test-matrix, dialect-adapter, fail-closed, opt-in]
requires: ["45-01 (db-adapter facade + withPg/dropPgSchema helpers)", "45-04 (callsite conversion)", "45-05 (pg schema variant)", "45-06 (POSTGRES_TEST_URL gate precedent)"]
provides: ["test/pg-matrix.test.mjs — 7-test POSTGRES_TEST_URL-gated critical-path matrix (boot+auth+second-boot, D-04 fail-closed, REM-03 claims, case-variant login, epoch typing, prefs upsert, login_challenges round-trip)", "toPgSql rewrite fixes: post-parameter `col = ? collate nocase` and null-safe `is [not] ?` → IS [NOT] DISTINCT FROM", "int8 type-parser coercion in db-adapter + withPg mirror (Pitfall 1 closed)"]
affects: ["phase gate (/gsd-verify-work): matrix green with live pg, invisible without", "operators: DEPLOY.md §15 runbook proven end-to-end"]
tech-stack:
  added: []
  patterns: ["POSTGRES_TEST_URL gate idiom (const url = process.env…; const maybe = url ? test : test.skip)", "second-boot no-op proven by full 14-table row-count snapshot", "typeParser(20) mirror — adapter and test harness coerce int8 identically"]
key-files:
  created:
    - test/pg-matrix.test.mjs
  modified:
    - db-adapter.mjs
    - test/db-adapter.test.mjs
    - test/helpers/server.mjs
decisions:
  - "fail-closed test stays inside the maybe gate (skipped when unset) — the matrix is one opt-in unit; it needs no live pg (closed port)"
  - "login_challenges round-trip pinned facade-level via withPg (no external IdP) — plan's explicit fallback"
  - "int8→number coercion lives in BOTH db-adapter boot and the withPg helper (separate processes/instances) so matrix assertions observe the same shapes the API boundary produces"
  - "epoch typing pinned through three API surfaces (invites createdAt/expiresAt, sessions createdAt/lastSeenAt) rather than one"
metrics:
  duration: ~13 min
  completed: 2026-11-07
status: complete
actuals:
  tokens: 46000
  tasks: 2
  commits: 2
  plan_head_before: ef0cfc3
  plan_head_after: c309746
commits: 2
---

# Phase 45 Plan 07: Opt-in Postgres test matrix Summary

**One-liner:** A 7-test POSTGRES_TEST_URL-gated matrix proves every critical path on live Postgres — boot+auth, second-boot row-identical no-op, D-04 fail-closed boot (closed-port child, DSN never printed), reminders_sent exactly-once, case-variant login, bigint epoch typing, prefs upsert, login_challenges round-trip — invisible (all skipped, exit 0) when the env is unset; the matrix immediately exposed and closed three real pg-only bugs (two SQL rewrites + int8 typing).

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (tracer) | boot-on-pg tracer + fail-closed + two pg-legal rewrite fixes | c1909ee | test/pg-matrix.test.mjs, db-adapter.mjs, test/db-adapter.test.mjs |
| 2 | critical-path matrix (claims/case-login/epoch/prefs/challenges) + int8 coercion | c309746 | test/pg-matrix.test.mjs, db-adapter.mjs, test/helpers/server.mjs |

Tracer gate: automated verify re-run green after Task 1 (2 pass against live pg, 2 skipped unset) — expanded to Task 2.

## What Shipped

- **test/pg-matrix.test.mjs**: the D-08 opt-in matrix, `const maybe = url ? test : test.skip` gate, ~5s wall time against a local Docker pg. Tracer pair: boot + signup/login/GET /api/workspaces on pg, then a second boot against the same DB_URL verified by a full 14-table row-count snapshot (deepEqual before/after — no duplicate seed/migration effects). Fail-closed (D-04): child process pointed at a closed localhost port — non-zero exit, `Postgres unreachable` + `code=` present, `postgres://` absent from output (T-45-11 pinned). Critical paths: reminders_sent exactly-once through the real `/api/internal/reminder-pass` trigger (second pass suppressed, exactly one claim row), case-variant email login end-to-end, epoch typing pinned through invites AND sessions payloads (`typeof === 'number'`), user_notif_prefs double-PUT leaves one row with the merged last write, and a facade-level login_challenges insert/read round-trip (no IdP).
- **db-adapter.mjs — three pg-only bugs the matrix caught, fixed at the one branch site (D-10)**:
  1. SQLite's post-parameter collation form `slug = ? collate nocase` (uniqueSlug, wsBySlug, instance-admin stamp, pending invites) was never rewritten → pg boot died with `syntax error at or near "$2"`. Now rewrites to `lower(col) = lower(?)` (plus unit pins in the toPgSql rewrite table).
  2. Null-safe `is not ?` (uniqueSlug, ownerCount) is illegal in pg (`is not $n`); rewritten to `is distinct from ?` (and the `is ?` mirror) — identical null-safe semantics.
  3. Pitfall 1 live: pg decodes int8 as strings; the adapter now sets the int8 type parser to coerce to number (Date.now() ≈ 1.7e12 ≪ MAX_SAFE_INTEGER, lossless) — before the fix, invites/sessions payloads carried string timestamps.
- **test/helpers/server.mjs**: `withPg` mirrors the int8 coercion (separate process/instance) so matrix assertions read the same shapes the server boundary produces.

## Verification

- `POSTGRES_TEST_URL=… node --test test/pg-matrix.test.mjs` → **7 tests / 7 pass / 0 fail** against Docker postgres:17-alpine, wall ~5s (< 60s)
- Unset gate: 7 skipped, exit 0
- `node --test test/db-adapter.test.mjs` → 26 pass / 0 fail (incl. the two new toPgSql rewrite pins)
- Full `npm test`: **1083 tests, 1065 pass / 4 fail / 14 skipped** — the 4 are the pre-existing catalogue/SPA parallel-run flakes recorded in 45-05's deferred-items.md (identical set at baseline); skips grew 7→14 (+7 matrix unset)
- Secret hygiene: the file never prints DB_URL/POSTGRES_TEST_URL; the fail-closed test asserts the server output carries no `postgres://`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `col = ? collate nocase` broke pg boot**
- **Found during:** Task 1 tracer verify (server refused to boot on pg)
- **Issue:** the rewrite layer only handled `col collate nocase = ?`; the four post-parameter sites passed through verbatim and pg raised a syntax error.
- **Fix:** new toPgSql rule → `lower(col) = lower(?)`; pinned in the rewrite table.
- **Files modified:** db-adapter.mjs, test/db-adapter.test.mjs · **Commit:** c1909ee

**2. [Rule 1 - Bug] `is not ?` illegal on pg**
- **Found during:** Task 1 tracer verify (next boot failure after fix 1)
- **Issue:** pg rejects `is not $n` — IS/IS NOT only take NULL there.
- **Fix:** rewrite to `is distinct from ?` (`is ?` → `is not distinct from ?`); pinned.
- **Files modified:** db-adapter.mjs, test/db-adapter.test.mjs · **Commit:** c1909ee

**3. [Rule 1 - Bug] Pitfall 1 fired — bigint epochs decoded as strings**
- **Found during:** Task 2 verify (epoch-typing tests failed with `typeof === 'string'`)
- **Issue:** no int8 coercion existed in the adapter; RESEARCH's recommended adapter-level parser was never added in Plan 05.
- **Fix:** `setTypeParser(20, … → Number)` at pg load in the adapter, mirrored in withPg.
- **Files modified:** db-adapter.mjs, test/helpers/server.mjs · **Commit:** c309746

### Out-of-Scope Discoveries (deferred, not fixed)

None new — the 4 full-suite failures are the documented pre-existing baseline flakes; a cosmetic pre-migration-backup log line still prints on pg boots (the sqliteOnly skip logs separately) — noted here, not fixed.

## Known Stubs

None.

## Threat Flags

None — the matrix adds no production surface; it pins the existing T-45-11 hygiene (DSN never printed) as a permanent test.

## Self-Check: PASSED

- test/pg-matrix.test.mjs exists; commits c1909ee + c309746 verified in `git log ef0cfc3..HEAD` (2 commits).
- Matrix re-run green both modes after the final commit; adapter units 26/26; full suite at the documented baseline.
