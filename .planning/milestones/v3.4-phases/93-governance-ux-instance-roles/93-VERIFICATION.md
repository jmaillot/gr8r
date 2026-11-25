---
phase: 93-governance-ux-instance-roles
verified: 2026-11-24T12:00:00Z
status: passed
score: 4/4 SCs verified
covered_files: [".planning/phases/93-governance-ux-instance-roles", "src/pages/governance.js", "src/actions/actions.js", "src/locales/en.json", "src/locales/de.json", "src/locales/es.json", "src/locales/fr.json", "src/locales/nl.json", "test/governance-tabs-client.test.mjs", "test/governance-console.test.mjs", "test/i18n-shell.test.mjs", "test/i18n-toast.test.mjs", "src/core/api.js"]
covered_digest: "v2:sha256:daf457a30bb91bd1988d97eaf63e9d4583bf59a13d6a6cef07151519fb709702"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 93: Governance UX — Instance Roles Verification Report

**Phase Goal:** Operators manage instance roles through a role-tabbed "Instance Roles" view where one row per user shows cumulative grants and the Grant dialog picker actually works.
**Verified:** 2026-11-24
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### SC1 — Renamed "Instance Roles", 3 tabs, multi-role users per-tab with stacked grants

**Command/evidence:**
- `sed -n 120,300p src/pages/governance.js` — `superAdminsView()` renders `page.governance.superTitle` with a `.seg` control over exactly three values `admins/backup/restore` (data-v, aria-pressed), bodies via `superRosterView()` (admins) / `roleTabView(role)` (backup_operator | restore_operator).
- i18n ×5 same commit (dcd198f4): `superTitle` = "Instance Roles" / "Instanz-Rollen" / "Roles de la instancia" / "Rôles de l'instance" / "Instantierollen" — all five locales edited in the single commit (verified via `git show dcd198f4 -- src/locales/*.json`, 11-line diffs each). Static pin (b) in `test/governance-tabs-client.test.mjs` asserts the ×5 rename + old wording absent.
- Stacked grants: `roleTabView` groups rows `byUser` (Map userId→grants), one `<tr>` per user with `grants.map(...)` stacked badges — role badge + `t('page.governance.rolesColGranted') esc(ago(r.grantedAt))` + `esc(r.grantedByName)`. Columns: User / Grants / Actions (`rolesColUser`/`rolesColGrants` headers).
**Result:** ✓ VERIFIED

### SC2 — Selectable pickers + working Grant-dialog search

**Command/evidence:**
- `src/actions/actions.js:5611` — `IN.govRoleQ = el => { ...; S.ui.govRoleMod.q = el.value; render(); }` — the dead-search fix: writes the staged query AND re-renders (the exact bug class at the old :5604 handler, pinned by test (f)).
- `govPickerList` filters candidates with `foldForSearch(q).text.includes(foldForSearch(name+email).text)` (diacritic-insensitive), options carry `role="option"` + `aria-selected` + `data-a="govRolePick" data-v` toggle (mteamToggle idiom, `A.govRolePick` at :5620). `govPickerInput`/`govPickerList` shared by tab pickers AND the Grant dialog — dialog inherits the tab's staged draft.
- `test/team-pick-client.test.mjs` + `test/governance-tabs-client.test.mjs` (pins f, g) green; keyboard/aria contract per D-03 pinned.
- Zero user-creation paths: no `createUser`/`invite` references in governance.js (grep empty); pin (g) asserts it.
**Result:** ✓ VERIFIED

### SC3 — Re-skin only: frozen endpoints, implicit SA visible, last-SA revoke guard verbatim ×5

**Command/evidence:**
- `grep -n "instance-roles" src/core/api.js` → exactly 3 frozen paths (GET :549, POST :552, DELETE :555). `git log 7f6f672a..f05a1e9a -- server.js` = empty; `git diff 7f6f672a..f05a1e9a --stat -- server.js` = empty. Pin (i): actions.js touches no new endpoint URL.
- Implicit SA membership: `roleTabView` does NO `is_instance_admin` filtering (grep over the tab code — only `rows.filter(r => r.role === role)`); the SA roster renders `is_instance_admin` rows from server ground truth with the owner badge. The comment block records the server-side refusal (D-05/D-12).
- Last-SA revoke guard: SA roster revoke rides `A.operatorRevokeConfirm` (:2828) → `tErr(code, ...)` — server 409 `lastOperator` surfaces verbatim; `err.lastOperator` present 5/5 locales; owner-immune hint `err.ownerImmune` 5/5.
**Result:** ✓ VERIFIED

### SC4 — Zero new mutation endpoints; audit funnel untouched

**Command/evidence:**
- server.js untouched by the phase commits (0 commits in range, empty diff). The only `instance-roles` mutations anywhere are the 2 frozen routes in api.js. Audit trail (`recentHtml`) renders the server-supplied `recent` payload verbatim — never reconstructed client-side.
- `npm run build` → i18n-scan 0 violations (prebuild gate), chunk 361.60 kB < 500 kB gate, built in 313ms.
**Result:** ✓ VERIFIED

## Gate Results

| Gate | Command | Result |
|---|---|---|
| Pinned suites | `node --test test/governance-tabs-client.test.mjs test/governance-client.test.mjs test/team-pick-client.test.mjs test/governance-rename.test.mjs test/governance-console.test.mjs` | 65 pass / 0 fail |
| Build + i18n-scan + chunk gate | `npm run build` | GREEN (0 i18n violations, 361.60 kB) |
| Full suite | `npm test` | 2401/2430 pass, 4 fail — all out of scope (below) |
| server.js purity | `git diff 7f6f672a..f05a1e9a --stat -- server.js` | empty |

**Full-suite failures (4 vs 3 documented — reconciled):** french-typography D-05, due.reminder double-fire flake, webhook-routes GET list D-06 are the documented pre-existing trio. The 4th, `test/backup-scheduler.test.mjs 'a sweep fire during an active run records skipped_overlap'` (Phase-87, blob-hold timing flake per 87-02), is also out of scope: `git log 7f6f672a..f05a1e9a -- test/backup-scheduler.test.mjs export/backup.js server.js` = 0 commits — no phase file touched its subject. The phase diff touches only governance.js, actions.js, locales, and 4 test files.

## i18n Audit (×5: en/de/es/fr/nl)

- New/renamed keys ×5: `page.governance.superTitle` ("Instance Roles"), `superSegBackup`, `superSegRestore`, `rolesColGrants` — 5/5 locales each.
- Retired keys ×5 absent: `rolesTitle`, `rolesLead`, `rolesColRole`, `rolesColGrantedBy` — 0/5 locales (grep).
- Guard keys ×5 + surfaced via `tErr`/`t`: `err.ownerImmune`, `err.instanceRoleAdminImplicit`, `err.instanceRoleDuplicate`, `err.lastOperator` — 5/5 each; all consumed through the keyed `tErr(code, ...)` pipeline (A.govRoleGrantConfirm, A.govRoleRevokeConfirm, A.operatorRevokeConfirm) — no client-side re-wording.

## T3-Fold Deviation (verified forced, not convenience)

The fold (T2+T3 in dcd198f4) is structurally forced by the i18n-scan dead-key gate (`scripts/i18n-scan.mjs:1261+` — the dead-key family runs as `prebuild`, failing the build on catalogue keys absent from source). Adding `rolesColGrants` ×5 in T2 without consuming it fails `npm run build`; pin (h) forces retiring `rolesColRole`, which is only possible once the columns reshape. Therefore key-add + columns-reshape must land in one commit — the fold was forced. Documented in SUMMARY "Deviations, item 1" with the same-commit i18n hard rule cited.

## Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| ROLE-01 | ✓ SATISFIED | 3-tab seg + ×5 rename (SC1) |
| ROLE-02 | ✓ SATISFIED | byUser grouping + stacked grant badges on shared User/Grants/Actions columns (SC1) |
| ROLE-03 | ✓ SATISFIED | shared selectable picker + `IN.govRoleQ` render() fix (SC2) |

No orphaned requirements: REQUIREMENTS.md maps exactly ROLE-01..03 to Phase 93; all claimed.

## Human Verification Required

None — all SCs are statically verifiable and pinned; no runtime-only behavior remains (picker interaction covered by the D-03 keyboard/aria pins + the render()-call pin).

---

_Verified: 2026-11-24_
_Verifier: the agent (gsd-verifier)_
