---
phase: 85
plan: 02
subsystem: client-shell, governance, backup
tags: [backup, instance-roles, governance, i18n, route]
requires: [85-01 (server contract: GET /api/auth/operator/instance-roles, GET /api/backup/tasks, err keys)]
provides: [Backup page + flag-gated top-level nav (BKROLE-02 UI), Instance Roles tab (BKROLE-01 UI), canBackup/canRestore client getters, backupTasks/instanceRoles api methods]
affects: [86-backup-engine, 87-restore-engine (task list slots ready)]
tech-stack:
  added: []
  patterns: [lazy page loader (governance precedent), fill-loop with monotonic seq + in-flight abort, D-90 inline-confirm stage, Phase 84 picker modal via generic custom host, payload-flag verbatim chrome (T-78-05)]
key-files:
  created: [src/pages/backup.js]
  modified: [src/shell/render.js, src/shell/layout.js, src/core/api.js, src/actions/actions.js, src/pages/governance.js, server.js, src/locales/en.json, src/locales/fr.json, src/locales/nl.json, src/locales/de.json, src/locales/es.json, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs, test/i18n-core-features.test.mjs, test/build-locales.test.mjs, test/fixtures/icons-baseline.json, test/instance-roles-api.test.mjs]
decisions:
  - Backup nav entry is TOP-LEVEL (not in the instance group), gated on api.user canBackup||canRestore — UX gate only, server 403 is the control (D-21/D-23)
  - Backup page renders only from GET /api/backup/tasks payload flags; D-20 empty state IS the page body until Phases 86/87 (D-24)
  - Deep-link 403 surfaces err.backupRoleRequired fullstate with home way out (D-26); no auto-poll on the Backup page (D-27)
  - Instance Roles tab reuses page.backup.flagBackup/flagRestore labels for role badges (D-15 — no duplicate role vocabulary)
  - Grant modal = Phase 84 picker pattern over the operator user list, Super Admins excluded client-side (server refuses anyway, D-05/D-07/D-30)
  - Duplicate-grant refusal closes the modal, toasts err.instanceRoleDuplicate, amber-highlights the existing row until route exit or next mutation (D-08/D-31)
  - Recent-activity trail lives server-side: audit actions are role-suffixed (instance_role_granted:<role>) and the GET returns `recent` (newest-first, cap 8) — client never reconstructs history (D-32)
  - Backup route glyph is hard-drive (database-backup's ellipse-first markup breaks the build's ICON_ENTRY contract)
metrics:
  duration: ~2h
  completed: 2026-11-21
status: complete
requirements-completed: [BKROLE-01, BKROLE-02]
commits: 3
plan_head_before: 1ec44d9d
plan_head_after: 4d18f196
actuals:
  tokens: 42000
  tasks: 3
  commits: 3
---

# Phase 85 Plan 02: Backup Surface & Instance Roles Tab Summary

Gated top-level Backup page (route/nav/403 fullstate/i18n ×5 locales) plus the Instance Roles tab on /governance — membership table, picker-style grant modal, D-90 inline-confirm revoke, duplicate-grant highlight, server-supplied recent-activity trail.

## Coverage

| Requirement | Evidence |
|---|---|
| BKROLE-01 (Instance Roles tab) | governance.js rolesCard + govRoleBody modal + actions refreshInstanceRoles/grant/revoke handlers; server contract consumed verbatim (85-01) |
| BKROLE-02 (gated Backup page) | backup.js lazy page + top-level flag-gated nav + deep-link backupRoleRequired fullstate; server 403 contract consumed verbatim |

## Tasks

| # | Task | Commit | Key files |
|---|------|--------|-----------|
| 1 | Tracer: Backup route/nav/page/403 end-to-end | 1ebe4851 | render.js, layout.js, backup.js, api.js, actions.js, locales ×5 |
| 2 | Instance Roles tab (table + grant modal + revoke) | aadc663a | governance.js, actions.js, api.js, locales ×5 |
| 3 | Recent-activity trail + locale sweep + full gate | 4d18f196 | server.js, governance.js, locales ×5, test pins |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Server GET lacked the D-32 `recent` payload**
- **Found during:** Task 3
- **Issue:** 85-01-SUMMARY documented `{rows, recent}` with granted_by resolved, but the committed GET /api/auth/operator/instance-roles returned `{roles}` only — the recent-activity section had no data source, and the client never reconstructs history.
- **Fix:** server.js GET now returns `recent` (audit_log instance_role_*, newest-first, capped at 8); audit actions became role-suffixed (`instance_role_granted:<role>`) so the trail carries the role without a client-side join; the two instance-roles-api.test.mjs audit assertions were updated in the same commit.
- **Files modified:** server.js, test/instance-roles-api.test.mjs
- **Commit:** 4d18f196

**2. [Rule 1 - Bug] `database-backup` icon broke the build icon contract**
- **Found during:** Task 3 (full-suite gate)
- **Issue:** the icon's markup starts with `<ellipse`, which the build-locales ICON_ENTRY regex (path/rect/circle/line/polyline/polygon first tag) does not match — the shipped-bundle assertion failed 182 vs 183.
- **Fix:** switched the route glyph to `hard-drive` (path-first markup) in render.js/layout.js/backup.js; baseline fixture +1 = hard-drive.
- **Files modified:** src/shell/render.js, src/shell/layout.js, src/pages/backup.js, test/fixtures/icons-baseline.json, test/i18n-core-features.test.mjs
- **Commit:** 4d18f196

**3. [Rule 1 - Bug] French D-05 typography violations in new keys**
- **Found during:** Task 3 (full-suite gate)
- **Issue:** straight apostrophes in page.backup.subtitle/emptyBody and a plain space before `?` in rolesRevokeConfirm failed the fr typography gate.
- **Fix:** ’ apostrophes + U+202F narrow no-break space across all new fr values.
- **Commit:** 4d18f196

**4. [Rule 1 - Bug] misplaced indentation in api.js getters (self-caught, pre-commit)**
- **Found during:** Task 1
- **Issue:** canBackup/canRestore getters landed at column 0 inside the object literal.
- **Fix:** re-indented before any commit.
- **Commit:** 1ebe4851

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| GET /api/backup/tasks returns `tasks: []` by design | server.js (85-01) | Phase 86/87 own the backup/restore engine contract; the D-20 empty state IS the intended page body until then |
| `POST /api/backup/tasks` refuses with backupManageRequired | server.js (85-01) | Same phase boundary — refuse-live-before-logic doctrine |

## Verification

- `node --test test/client-surfaces.test.mjs test/build-chunk-size.test.mjs` → 20/20 pass (Task 1 tracer verify)
- `node --test test/client-surfaces.test.mjs test/error-codes.test.mjs` → 32/32 pass (Task 2)
- `node --test test/instance-roles-api.test.mjs` → 16/16 pass (Task 3 server change)
- `npm test` (full suite) → 2091 tests, 0 fail (webhook-events carve-out not needed this run)
- eslint clean on all touched src files

## Self-Check: PASSED

- src/pages/backup.js exists; all three commits (1ebe4851, aadc663a, 4d18f196) present in git log; `git rev-list --count 1ec44d9d..HEAD` = 3 matches commits frontmatter.
