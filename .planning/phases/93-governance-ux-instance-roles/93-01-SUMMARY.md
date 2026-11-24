---
phase: 93-governance-ux-instance-roles
plan: 01
subsystem: governance-client
tags: [governance, instance-roles, i18n, picker, re-skin]
requires: [frozen GET/POST/DELETE /api/auth/operator/instance-roles, GET /api/auth/operator/users, team-pick contract]
provides: [role-tabbed Instance Roles surface, shared selectable govRole picker, IN.govRoleQ live-search fix]
affects: [test/governance-console.test.mjs, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs count pins]
tech-stack:
  added: []
  patterns: [seg value extension, shared picker body (team-pick contract), static source-assertion pins]
key-files:
  created: [test/governance-tabs-client.test.mjs]
  modified: [src/pages/governance.js, src/actions/actions.js, src/locales/en.json, src/locales/de.json, src/locales/es.json, src/locales/fr.json, src/locales/nl.json, test/governance-console.test.mjs, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs]
decisions:
  - govSuperSeg extended to 3 values (admins/backup/restore); tab switch nulls govRoleMod (per-tab isolation)
  - shared picker body (govCandidates/govPickerList/govPickerInput) used by tab pickers AND Grant dialog; single-select draft in S.ui.govRoleMod, govRolePick toggles on data-v
  - superTitle renamed "Instance Roles"; new keys superSegBackup/superSegRestore/rolesColGrants; retired rolesLead, rolesColRole, rolesTitle, rolesColGrantedBy ×5
  - recent trail renders under the SA roster whenever the `recent` payload exists (hasRows gate dropped, D-04)
metrics:
  duration: ~35 min
  completed: 2026-11-24
  tasks: 5
  commits: 4
  plan_head_before: 6e78fcd9
  plan_head_after: 56f41c0a
actuals:
  tokens: 17300
  tasks: 5
  commits: 4
status: complete
---

# Phase 93 Plan 01: Governance UX — Instance Roles Summary

**One-liner:** Role-tabbed "Instance Roles" re-skin — 3-value seg (Super Admin / Backup / Restore), roster-as-SA-tab with the audit trail, User/Grants/Actions columns with stacked per-grant badges, selectable Edit-team pickers, and the Grant-dialog dead-search fixed (`IN.govRoleQ` now calls `render()`).

## What Was Built

- **T1 (8fe65b52):** `test/governance-tabs-client.test.mjs` — pins (a)–(i) over governance.js/actions.js/locales, RED first, per the static source-assertion precedent.
- **T2+T3 (dcd198f4):** seg extended to admins/backup/restore (D-01); `superRosterView` = SA tab body; `recentHtml()` moved under the SA roster with the `hasRows` gate dropped (D-04); `rolesCard` dissolved into `roleTabView(role)` rendering User / Grants / Actions columns — one row per user per tab, stacked per-grant badges (role + `esc(ago(grantedAt))` + `esc(grantedByName)`), revoke per GRANT riding the frozen DELETE; i18n ×5 in the same commit.
- **T4 (dbed9115):** shared selectable picker (`govCandidates`/`govPickerList`/`govPickerInput`) used by both tab pickers and the Grant dialog — `role="option"` + `aria-selected`, `data-a="govRolePick" data-v` toggle (mteamToggle idiom), `foldForSearch` over name+email, honest `popover.noMatches`, zero user-creation paths. **The dead-search fix:** `IN.govRoleQ` writes `govRoleMod.q` AND calls `render()`. Dialog inherits the tab's staged draft; per-tab state isolation via seg-switch reset.
- **T5 (56f41c0a):** full gates + SC-4 endpoint sweep + guard-key verbatim sweep; tree-wide data-v count pin 94→95 in i18n-shell/i18n-toast.

## Deviations from Plan

**1. [Rule 3 - Blocking] Task 3 folded into Task 2's commit (dcd198f4).**
- **Issue:** the i18n-scan gate fails on "dead" keys — adding `rolesColGrants` in T2 without using it fails the build, and retiring `rolesColRole` (required by pin (h), green at T2) forces the columns reshape into the same commit. `rolesTitle`/`rolesColGrantedBy` also became dead once the wrapper dissolved and were retired ×5.
- **Fix:** columns/stacked-badges/revoke-per-grant implemented in the T2 commit; T3 has no separate commit.
- **Files:** governance.js + locales (same commit as the key changes — the D-01 hard rule).

**2. [Rule 1 - Superseded pins] Phase-90/`i18n-*` static pins updated, not added:**
- `test/governance-console.test.mjs` pinned the old 2-value seg (`segV === 'roles' ? rolesCard() : superRosterView()`) — updated to the 93-01 three-tab contract.
- `test/i18n-shell.test.mjs` / `test/i18n-toast.test.mjs` tree-wide `data-v` count 94→95 (`govRolePick` options now carry `data-v`), with ledger notes per the count-pin convention.

## Auth Gates

None.

## Known Stubs

None.

## Pre-existing Failures (documented, OUT of scope — not fixed)

- `npm test`: 2402/2430 pass. 3 failures, all on the pre-existing list: webhook scheduler flake (`due.reminder` double-fire), Phase-88 `every French catalogue value passes the D-05 typography rules`, webhook-routes health (`GET list: ... D-06`). (`webhook-events` and `export/backup.js:666` did not fail this run.)
- `npm run lint`: 49 pre-existing errors (export/*, server.js, backup.js, various tests — none in files/lines touched by this plan).
- `npm run build`: GREEN — chunk 361.60 kB < 500 kB gate; i18n-scan 0 violations.

## Security (threat model)

- T-93-01 mitigated: every payload string in the new tab bodies/badges/pickers renders through `esc()` (pinned by (d)).
- T-93-02 mitigated: zero server.js diffs (verified `git diff --stat server.js` empty); SC-4 grep shows exactly the 3 frozen `instance-roles` paths in api.js and the 2 mutation routes in server.js; guard refusals (`err.ownerImmune` / `err.instanceRoleAdminImplicit` / `err.instanceRoleDuplicate`) surface verbatim via keyed `t()`/`tErr` — no client-side re-wording, ×5 locales intact.
- T-93-03/T-93-04: accepted by design (audited funnel untouched; pool = operator-gated payload).

## Self-Check: PASSED

- 4 task commits verified in `git log 6e78fcd9..HEAD`.
- All modified/created files exist on disk; governance-tabs + governance-client + team-pick + governance-rename + governance-console suites green (65/65).
