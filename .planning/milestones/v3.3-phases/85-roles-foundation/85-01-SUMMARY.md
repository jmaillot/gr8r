---
phase: 85-roles-foundation
plan: 01
subsystem: server-auth-roles
tags: [rbac, instance-roles, capability-funnel, audit, backup-stub]
requires: [group-mapping-template (v3.2 groups.js pattern), audit_log same-tx discipline (AUD-01), operator guard ladder (83-D-05)]
provides: [instance_roles table, roles.js capability funnel, hasInstanceRole wiring, GET/POST/DELETE /api/auth/operator/instance-roles, GET/POST /api/backup/tasks stubs, userPayload canBackup/canRestore, 6 err.* keys ×5 locales]
affects: [86-backup-tasks, 87-task-crud, 89-restore, 90-download-tiering]
tech-stack:
  added: []
  patterns: [pure domain module + refusal funnel (groups.js verbatim), dual-mirror DDL + pin test, same-tx audit db.tx, operator guard ladder, keyed 5-locale refusals]
key-files:
  created: [roles.js, test/roles-core.test.mjs, test/instance-roles-api.test.mjs]
  modified: [server.js, db-adapter.mjs, test/db-adapter.test.mjs, test/helpers/server.mjs, src/locales/en.json, src/locales/fr.json, src/locales/nl.json, src/locales/de.json, src/locales/es.json]
decisions:
  - ARCHIVE_READ defined but mapped to no role; INSTANCE_ROLES_MANAGE reachable only via the D-12 short-circuit (one-way per D-11, pinned by D-35a tests)
  - capability flags named canBackup/canRestore in userPayload and in the GET /api/backup/tasks stub body (D-23/D-24)
  - POST /api/backup/tasks holder path answers fail(400, 'backupNotConfigured') until Phase 87 owns the contract
  - unknown grant/revoke target answers the existing generic 404 notFound (no new key, no oracle change)
metrics:
  duration: ~40 min
  completed: 2026-11-21
  commits: 3
  plan_head_before: a32e54d5~1
  plan_head_after: fe827392
status: complete
actuals:
  tokens: 115000
  tasks: 3
  commits: 3
---

# Phase 85 Plan 01: Server-Side Roles Core Summary

**One-liner:** `instance_roles` table + pure `roles.js` capability funnel (ARCHIVE_READ reserved, Super-Admin short-circuit inside) behind Super-Admin-only audited grant/revoke routes and gated `/api/backup/tasks` stubs, with payload `canBackup`/`canRestore` flags and 55 pinned tests green.

## What Was Built

- **roles.js** (repo root, pure module beside groups.js — same no-Vite/no-env/injected-DB header): `CAP` constants (BACKUP_MANAGE, RESTORE_USE, ARCHIVE_READ, INSTANCE_ROLES_MANAGE), the D-11 `ROLE_CAPS` map, D-12 `capabilitiesFor(isInstanceAdmin, roles)` short-circuit, `roleTokenRefusal` funnel, `ALL_CAPS`.
- **server.js**: `instance_roles` dual-mirror DDL (CHECK enum `('backup_operator','restore_operator')`, unique `(user_id, role)`, `user_id … on delete cascade`, `granted_by … on delete set null`); `userCapabilities`/`hasInstanceRole` wiring (direct per-call queries, no caching, D-14); D-16 guard-order route family — GET list (granted_by resolved server-side per D-33), POST grant, DELETE revoke — each writing the mutation + `audit_log` row (`instance_role_granted`/`instance_role_revoked`) inside ONE `db.tx`; `GET /api/backup/tasks` stub (`{ tasks: [], canBackup, canRestore }`, keyed 403 `backupRoleRequired`); `POST /api/backup/tasks` task-edit stub (`backupManageRequired` refusal, `backupNotConfigured` 400 for holders); `userPayload` gains `canBackup`/`canRestore` recomputed per load.
- **db-adapter.mjs**: `instance_roles` DDL mirrored into SQLITE_SCHEMA (mirror test enforces byte-parity with server.js SCHEMA).
- **i18n**: 6 new `err.*` keys (instanceRoleBadRole, instanceRoleAdminImplicit, instanceRoleDuplicate, backupRoleRequired, backupManageRequired, backupNotConfigured) in all 5 locales, same commits (D-28).
- **Tests**: `test/roles-core.test.mjs` (D-35a/b pins: restore_operator never ARCHIVE_READ, INSTANCE_ROLES_MANAGE in no map, admin-with-zero-rows implicit, fail-closed resolution), `test/db-adapter.test.mjs` instance_roles DDL pin (+17-table counts), `test/instance-roles-api.test.mjs` (16 e2e cases: gate order/no-oracle, keyed refusals, audited grant/revoke, forced-audit-failure rollback both directions, flags/revoke-on-next-load, D-36 set).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added instance_roles to db-adapter.mjs SQLITE_SCHEMA**
- **Found during:** Task 1
- **Issue:** The plan's `files_modified` omitted db-adapter.mjs, but the mirror-sync pin test (`SQLITE_SCHEMA mirror stays identical to server.js SCHEMA`) and the DDL pin test (`db.exec(adapter.SQLITE_SCHEMA)`) both fail unless the adapter carries the new table.
- **Fix:** Mirrored the DDL verbatim (comments aside) into db-adapter.mjs; updated TABLES list/17-table test titles; added the table to the pg drop list in test/helpers/server.mjs.
- **Files modified:** db-adapter.mjs, test/db-adapter.test.mjs, test/helpers/server.mjs
- **Commit:** a32e54d5 / 84021905

**2. [Deviation] nav.route.backup deferred to Plan 02**
- **Found during:** Task 1
- **Issue:** The plan asked for the `nav.route.backup` i18n key now ("for later plans"), but the i18n-scan dead-key gate fails on any catalogue key no source references — and no src/ call site exists until the Backup UI plan lands.
- **Fix:** Deferred the key to Plan 02, which must add the key together with its shell/layout call site in the same commit. All 6 refusal keys this plan actually emits are present in 5 locales.
- **Files modified:** none (deliberate omission)

**3. [Deviation] Task 1 tracer slice included the DELETE revoke route and POST task-edit stub**
- **Found during:** Task 1
- **Issue:** The plan scoped the full route family to Task 2, but the route family shares one guard ladder and one db.tx shape — implementing them once in the tracer slice avoided a partial ladder in the interim commit; Task 2 then added their tests/pins as planned.
- **Fix:** server.js carries GET/POST/DELETE instance-roles + both backup stubs from commit a32e54d5; commit 84021905 adds the revoke/task-edit test coverage and pins; commit fe827392 adds the D-36 audit-rollback set.
- **Files modified:** server.js (in a32e54d5), test files (84021905, fe827392)

## Threat Model Mitigations Applied

- **T-85-01:** D-05 keyed `instanceRoleAdminImplicit` refusal on Super-Admin targets + D-12 short-circuit before any row consideration — pinned by roles-core D-35a/b.
- **T-85-02:** isInstanceAdmin gate BEFORE any target lookup on all three routes; e2e proves invalid and valid bodies get the identical 403 `operatorOnly` (no existence oracle).
- **T-85-03:** `sameOrigin(req)` FIRST on every new route; cross-origin-first e2e probe pinned.
- **T-85-04:** operator-keyed `tooMany` (5/15min) consuming a try even on 403, on grant and revoke.
- **T-85-05:** same-tx `db.tx` audit row with actor/target snapshot columns; forced audit failure (dropped audit_log table) rolls back grant AND revoke — pinned both directions.
- **T-85-06:** every backup endpoint re-checks via `hasInstanceRole` server-side; payload flags are render-only.

## Verification

- `node --test test/roles-core.test.mjs test/db-adapter.test.mjs test/instance-roles-api.test.mjs` — 56 tests, 0 fail
- `npm test` — 2091 tests, **0 fail**, 13 skipped (pg matrix skips)
- `test/error-codes.test.mjs` + `test/i18n-scan.test.mjs` — green (5-locale discipline, D-28)

## Known Stubs

| Stub | File | Reason | Resolves in |
|------|------|--------|-------------|
| `GET /api/backup/tasks` returns `[]` (no task data) | server.js | D-19: intentional — the gate is exercised end-to-end; task content arrives later | Phase 86/87 |
| `POST /api/backup/tasks` answers `backupNotConfigured` 400 for holders | server.js | D-19 (open-question 2): refusal path real, task logic out of scope | Phase 87 |

## Self-Check: PASSED

- roles.js, test/roles-core.test.mjs, test/instance-roles-api.test.mjs exist on disk.
- Commits a32e54d5, 84021905, fe827392 present in git log.
- `git rev-list --count a32e54d5~1..HEAD` = 3 = commits reported above.
