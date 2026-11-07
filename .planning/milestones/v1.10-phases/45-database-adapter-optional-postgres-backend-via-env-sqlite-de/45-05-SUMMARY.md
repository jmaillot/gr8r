---
phase: 45
plan: 05
subsystem: database
tags: [postgres, sqlite, schema, migrations, seed, dialect-adapter]
requires: ["45-01 (db-adapter facade)", "45-03 (ensureColumn branch)", "45-04 (callsite conversion)"]
provides: ["runSchema() dialect-owned schema execution", "pgSchemaVariant() complete (bigint epochs, functional nocase index, text doc column)", "pg-safe migration whitelist lint", "seed determinism pin"]
affects: ["45-06 (DEPLOY.md)", "45-07 (pg matrix)"]
tech-stack:
  added: []
  patterns: ["one-branch-site dialect ownership (D-10)", "sqliteOnly capability gating (D-09)", "mirror-sync static pin"]
key-files:
  created: []
  modified:
    - db-adapter.mjs
    - server.js
    - test/db-adapter.test.mjs
    - test/totp-rewrap.test.mjs
decisions:
  - D-11 locked as text (user "confirm") — workspaces.doc stays a plain text column on pg; jsonb out of scope
  - epoch-ms columns widen to bigint in the pg variant only (Date.now() overflows pg integer); booleans/counters stay integer
  - invites scalar→teams rowid backfill gated sqliteOnly inside its tx; portable team_members insert runs on both backends
metrics:
  duration: ~50 min
  completed: 2026-11-07
status: complete
actuals:
  tokens: 60000
  tasks: 3
  commits: 5
  plan_head_before: 9abd6fd
  plan_head_after: f5cef28
commits: 5
---

# Phase 45 Plan 05: Dialect-owned schema, migrations, seed Summary

pg-legal SCHEMA variant (bigint epoch columns, functional lower(email) unique index, text doc column), schema/migrations/seed all dialect-owned by db-adapter.mjs (runSchema, sqliteOnly gates), pinned by a pg-safe whitelist lint and a seed-determinism test — second boot is a no-op on both backends.

## Checkpoint: D-11 one-way workspace doc column shape — APPROVED

**Type:** decision (Task 0) · **Gate:** blocking · **Status:** RESOLVED before any schema change

The checkpoint question — "Plan 05 locks the pg storage shape for the workspace document as a plain text column (D-11, one-way). jsonb stays unused. Confirm?" — was presented to the user, who replied **"confirm"**.

- Locked: `workspaces.doc` stays a plain `text` column in the pg schema variant; no `jsonb` anywhere in the variant.
- Consequence (one-way): changing the pg doc-column shape later requires a data migration; jsonb exploitation is deferred out of scope by D-11.
- Recorded and committed (64760a8) BEFORE the first `db-adapter.mjs` schema edit, per the Task 0 done criterion.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 0 | Checkpoint: D-11 doc column shape | 64760a8 (approval record) | 45-05-SUMMARY.md |
| 1 (tracer) | pg SCHEMA variant — dialect-owned schema end-to-end | 4117987 | db-adapter.mjs, server.js, test/db-adapter.test.mjs |
| 2 | Idempotent pg migrations + portable seed | f5cef28 | server.js, test/db-adapter.test.mjs |

Tracer gate: automated verify re-run green after Task 1 (adapter/audit/migration suites 62 pass / 0 fail) — expanded to Task 2.

## What Shipped

- **db-adapter.mjs**: `pgSchemaVariant()` complete — `collate nocase` stripped everywhere, epoch-ms columns (`created_at`, `updated_at`, `expires_at`, `last_seen_at`, `last_login_at`, `used_at`) widened to `bigint`, booleans/counters kept `integer` (`= 1` comparisons preserved), `workspaces.doc` kept `text` (D-11), plus the `users_email_nocase` functional unique index on `lower(email)`. New `runSchema()` export: one branch site (D-10) — SQLite executes SCHEMA verbatim, pg executes the variant. `SQLITE_SCHEMA` exported as the pinned mirror.
- **server.js**: initDb routes SCHEMA through `adapterRunSchema(SCHEMA)`; the invites scalar→teams backfill loop is now `sqliteOnly`-gated inside its transaction (D-09/D-10) — the pg path runs guard → portable migrations → no backup.
- **test/db-adapter.test.mjs**: mirror-sync pin (adapter mirror ↔ server.js SCHEMA modulo comments), 14-table / nocase-free / pragma-free / bigint / doc-text pins, fresh-DB runSchema idempotency pin, pg-safe whitelist lint over every facade statement outside sqliteOnly gates (no pragma/vacuum/rowid/begin/sqlite_master), backfill-gating pin, and seed determinism (two fresh boots → identical row counts across all 14 tables, D-07).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] totp-rewrap backup-failure fixture missed the Phase-43 logos dir**
- **Found during:** Task 1 verify (full suite)
- **Issue:** The D-74 test pre-created only `DATA_DIR/files`; since Phase 43 boot also mints `DATA_DIR/logos`, the unwritable-DATA_DIR boot died on `mkdir EACCES` before reaching the migration under test. Failed deterministically at HEAD before any 45-05 change.
- **Fix:** Pre-create `logos/` in the fixture (commit 266cbdc).
- **Files modified:** test/totp-rewrap.test.mjs

**2. [Rule 1 - Bug] Task-1 comment reintroduced the pinned `collate nocase` literal**
- **Found during:** Task 1 verify (static audit)
- **Issue:** The initDb comment mentioned the literal, tripping the frozen-count audit (7 sanctioned sites).
- **Fix:** Reworded the comment; count restored (commit 349e11a).
- **Files modified:** server.js

### Out-of-Scope Discoveries (deferred, not fixed)

Full-suite parallel-run failures in `test/catalogue.test.mjs` (3 assertions) and `test/file-route-ordering.test.mjs` (SPA deep-link) — verified failing at baseline 64760a8 before any 45-05 change; pass standalone; unrelated to the DB layer. Recorded in `deferred-items.md`. Also noted: ensureColumn defs stay `integer` on pg (harmless — fresh pg boots create bigint columns via the variant; no legacy pg DBs exist).

## Verification

- `node --test test/db-adapter.test.mjs` → 24 pass / 0 fail; with `test/migration.test.mjs` → 61 pass / 0 fail
- `node --test test/static-db-audit.test.mjs` → green (frozen 7-site count, rowid gating intact)
- Full `npm test`: 1070 tests, 1063 pass / 4 fail — all 4 are the pre-existing catalogue/SPA parallel-run flakes present at baseline (see deferred-items.md). No new failures from 45-05.
- `grep -in advisory db-adapter.mjs server.js` → only an unrelated comment about the client emit filter; no pg advisory locks (D-07)

## Threat Model Notes

- T-45-08 (migration idempotence on pg): mitigated by the whitelist lint test, information_schema-guarded ensureColumn (Plan 03), and the runSchema `if not exists` idempotency pin.
- T-45-07 (pg transport): untouched — adapter defaults never ship `ssl: { rejectUnauthorized: false }`; operator guidance lands in Plan 06.

## Known Stubs

None.

## Self-Check: PASSED

- 45-05-SUMMARY.md exists; commits 64760a8, 266cbdc, 4117987, 349e11a, f5cef28 verified in `git log`.
