---
phase: 51-client-surfaces-permissions-page-removal-project-creation
verified: 2026-11-08T13:20:00Z
status: passed
score: 6/7 must-haves verified
behavior_unverified: 1
overrides_applied: 0
covered_files:
  - .planning/phases/51-client-surfaces-permissions-page-removal-project-creation/51-01-PLAN.md
  - .planning/phases/51-client-surfaces-permissions-page-removal-project-creation/51-02-PLAN.md
  - .planning/phases/51-client-surfaces-permissions-page-removal-project-creation/51-03-PLAN.md
  - .planning/phases/51-client-surfaces-permissions-page-removal-project-creation/51-04-PLAN.md
  - .planning/phases/51-client-surfaces-permissions-page-removal-project-creation/51-01-SUMMARY.md
  - .planning/phases/51-client-surfaces-permissions-page-removal-project-creation/51-02-SUMMARY.md
  - .planning/phases/51-client-surfaces-permissions-page-removal-project-creation/51-03-SUMMARY.md
  - .planning/phases/51-client-surfaces-permissions-page-removal-project-creation/51-04-SUMMARY.md
  - server.js
  - src/overlays/modals.js
  - src/actions/actions.js
  - src/core/store.js
  - src/pages/projects.js
  - src/pages/settings.js
  - src/pages/members.js
  - src/pages/errors.js
  - src/locales/en.json
  - src/locales/fr.json
  - scripts/i18n-scan.mjs
  - test/client-surfaces.test.mjs
  - test/project-creation.test.mjs
  - test/visibility-team.test.mjs
  - test/catalogue.test.mjs
  - docs/ProjectPermissions.md
  - docs/WorkspacePermissions.md

covered_digest: v2:sha256:ade65d60d8e8bfdafe5b30fb369d24274db13fac7e1a8fd8fbbe3730bf1246d0
requirements_covered: [VIS-01, CRT-01, CRT-02, UX-01]
behavior_unverified_items:
  - truth: "Criterion 4 client half — with the workspace restriction on, a member sees the create affordance disabled with a localized tooltip (D-51-14: never hidden)"
    test: "As a Member with prefs.permCreate === true, load the Projects page in the running app, then try the other create entry points (command palette, command popover, Overview header, Home header, sidebar layout button, keyboard shortcut P)"
    expected: "Projects-page button is disabled with tooltip 'Project creation is restricted to admins'; submitting from any other entry point yields the localized projectCreateForbidden toast with no project created (server gate)"
    why_human: "SPA rendering + tooltip display are browser-only; no browser harness in this repo. Known partial coverage: only the Projects-page button is disabled-gated (WR-02); the other 6 entry points rely on the server refusal + toast."
---

# Phase 51: Client surfaces, permissions-page removal & project creation — Verification Report

**Phase Goal:** Every permission decision is visible and operable from clean client surfaces — the private/public toggle replaces the dropdown, share invites whole teams, the Settings > Permissions page is gone, and project creation is open by default with an admin restriction setting.
**Verified:** 2026-11-08T13:20:00Z
**Status:** human_needed (automated checks all green; SPA-visual behaviors need human spot-check; known client findings CR-01/WR-01/WR-02/WR-03 already recorded in 51-REVIEW-DISPOSITION.md)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Criterion 1 — single per-project toggle; authority matrix (owner ✓/admin ✓/lead ✓/member ✗); epoch refetch; honest localized not-found | ✓ VERIFIED | `src/overlays/modals.js:286` checkbox `data-in="shareAccess"` replaces the select, `canManage`-gated; `IN.shareAccess` (actions.js:1854) with snapshot/revert; server pinning at server.js:1036-1078; tests pass: authority-matrix cells, `applyDoc records the visibility epoch`, `admin privatizes p_open → member's served doc no longer carries it`, `err.projectNotFound` stateNotFound in errors.js:17/project.js |
| 2 | Criterion 2 — share-modal team invite with copy reflecting LIVE team semantics (D-51-8 supersedes the roadmap's snapshot wording) | ✓ VERIFIED | Teams section modals.js:240-266 (invite list excludes linked teams, linked-note with remove, no role choice); `modal.teamsLiveHint` EN "access follows team membership" / FR "l'accès suit l'appartenance à l'équipe" — live semantics shipped, snapshot wording not used; write side tested (link/unlink, whole-team revocation guard, live-link grant) |
| 3 | Criterion 3 — Settings > Permissions page removed end-to-end, no orphaned routes/actions/keys | ✓ VERIFIED | grep `case 'permissions'`/`permGuests`/`permPublic` in settings.js → no match; `settings.nav.permissions`, `settings.perms.guests`, `settings.perms.public` absent from BOTH catalogues; stale `?sec=` falls back to first tab (settings.js:266-268, T-51-08); permCreate relocated to General (settings.js:299, `=== true` polarity); permsTable on Members page; docs updated (WorkspacePermissions.md has zero permGuests/permPublic mentions) |
| 4 | Criterion 4 — default-open creation; member-created project → creator is lead; restriction ON → server refuses with keyed error; client shows disabled affordance with tooltip | ✓ VERIFIED (server half) / ⚠️ client half below | server.js:1036 (stored-prefs-only read), :1061 (`projectCreateForbidden` refusal riding 200), :1069 (server-side `p.lead = memberId`); projects.js:30-32 disabled+tooltip affordance with `page.projects.createRestricted` EN+FR; 49/49 tests pass across client-surfaces/project-creation/visibility-team/catalogue. **Client half scored separately as #5.** |
| 5 | D-51-14 client clause — restriction disables the create affordance with localized tooltip, never hidden, across create entry points | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Present and wired on the Projects page (projects.js:30-32); no test exercises the rendered disabled state, and WR-02 (recorded) shows only 1 of 7 `newProject` entry points is gated — the rest rely on the server refusal + localized toast. See Human Verification #1. |
| 6 | Criterion 5 — `npm run i18n:scan` passes with all new strings EN+FR, dead-key check catches removed keys | ✓ VERIFIED | Ran `npm run i18n:scan`: 0 literals, 0 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch, **0 dead**, exit 0. `findDeadKeys`/`collectReferencedKeys`/`DEAD_KEY_ALLOWLIST` live in scripts/i18n-scan.mjs (gated into scan/prebuild); removed-key leak assertions in test/catalogue.test.mjs pass. All new keys present in BOTH catalogues (`modal.teamsSection`, `modal.teamsLiveHint`, `a11y.inviteTeam`, `err.projectCreateForbidden`, `err.projectNotFound`, `page.projects.createRestricted`) |
| 7 | Docs match shipped model (lead role D-51-17, toggle, Teams section, permCreate relocation) | ✓ VERIFIED | ProjectPermissions.md: 7 D-51-17 references; WorkspacePermissions.md: zero permGuests/permPublic mentions, "état actuel (Phase 51)" section |

**Score:** 6/7 truths verified (1 present, behavior-unverified)

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| VIS-01 | 51-01, 51-02 | Owner/admin switch any project between private and public | ✓ SATISFIED | Truth 1; authority matrix + epoch tests |
| CRT-01 | 51-01, 51-02 | All members can create projects and become members | ✓ SATISFIED | Truth 4; lead-on-create enforced server-side (server.js:1069); restriction default OFF (`permCreate === true` = restricted; undefined = open) |
| CRT-02 | 51-03 | Settings > Permissions page removed; relevant pieces relocated | ✓ SATISFIED | Truth 3 |
| UX-01 | 51-03, 51-04 | Every user-facing string catalogued EN+FR; removed-key leak check | ✓ SATISFIED | Truth 6; i18n:scan exit 0 with 0 dead |

No orphaned requirements: all four phase requirement IDs are claimed across plans and accounted for. REQUIREMENTS.md maps exactly these IDs to Phase 51.

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| IN.shareAccess (actions.js:1854) | doc-sync PUT → mergeClientDoc pinning (server.js:1036-1078) | mutate + pushNow, snapshot revert | WIRED | toggle handler present with snapshot/restore + localized error toast |
| server permCreate guard | stored doc.prefs.permCreate | `stored?.prefs?.permCreate === true` (server.js:1036) | WIRED | never reads the incoming doc; member PUTs cannot rewrite the pref (T-51-01 test) |
| projectCreateForbidden refusal (server.js:1061/4686) | client toast + revert (actions.js:1619-1622) | `refused` array on 200 PUT response | WIRED | maps key to `err.projectCreateForbidden` toast |
| Teams invite list | teamsList minus p.teams | `filter(tm => !linkedTeams.includes(tm.id))` (modals.js:250) | WIRED | matches D-51-9 |
| permCreate row | IN.prefToggle persistence | `tog('permCreate', P.permCreate === true)` (settings.js:299) | WIRED | see CR-01 warning below |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| share-modal toggle | `p.private` | server-stored doc via mergeClientDoc pinning | Yes | ✓ FLOWING |
| Teams section | `teamsList()`, `p.teams` | workspace doc | Yes | ✓ FLOWING |
| not-found state | `S.ui.lostProjects` | applyDoc epoch detection on poll hydration (store.js:244-281) | Yes | ✓ FLOWING |
| create gating | `S.prefs.permCreate` | stored workspace prefs | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Authority matrix + team-link + catalogue suites | `node --test --test-concurrency=2 test/client-surfaces.test.mjs test/project-creation.test.mjs test/visibility-team.test.mjs test/catalogue.test.mjs` | 49 pass / 0 fail | ✓ PASS |
| i18n gate incl. dead-key check | `npm run i18n:scan` | 0 dead, exit 0 | ✓ PASS |
| Removed keys absent | `grep permGuests\|permPublic src/pages/settings.js docs/WorkspacePermissions.md` | no match (exit 1) | ✓ PASS |

### Probe Execution

None declared — no `probe-*.sh` scripts referenced by the plans.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX` debt markers introduced. Known findings carried from 51-REVIEW.md (do not re-litigate; recorded in 51-REVIEW-DISPOSITION.md):

| File | Finding | Severity | Impact |
|------|---------|----------|--------|
| src/pages/settings.js:299 | CR-01 — permCreate toggle: label says "Members can create projects" while `checked = permCreate === true` (restriction ON); renders for all roles, not role-gated | critical (client-only) | The toggle's state is functionally correct (server reads stored `=== true`), but the label copy is inverted relative to the checked state — an admin reading the label sets the opposite of intent. Server enforcement unaffected. |
| src/actions/actions.js | WR-01 — share-modal handlers revert+error-toast in local (no-API) mode (`pushNow()` returns `{ok:false,status:0}`) | warning | local-mode UX only |
| src/ multiple | WR-02 — only 1 of 7 `newProject` entry points disabled-gated (projects.js); palette/popover/overview/home/layout/keyboard render active buttons for restricted members (server refusal + toast still catch attempts) | warning | see behavior_unverified_items |
| src/actions/actions.js | WR-03 — `A.submitProject` reports success on non-refusal push failure | warning | edge-case UX |
| docs/ProjectPermissions.md | IN-01 — stale file:line citation | info | cosmetic |
| src/pages/settings.js | IN-02 — permCreate toggle accessible label is the raw key, not localized copy | info | a11y polish |

### Human Verification Required

### 1. Restricted-member create affordance across entry points (criterion 4, D-51-14)

**Test:** As a Member in a workspace with `permCreate === true`, open the running app: check the Projects-page create button (disabled + tooltip "La création de projets est réservée aux admins" in FR), then trigger creation from the command palette, command popover, Overview header, Home header, sidebar layout button, and the `P` keyboard shortcut; submit the modal each time.
**Expected:** Projects page: disabled with localized tooltip. Other entry points (WR-02, known): the modal opens but submitting is refused by the server with the localized `err.projectCreateForbidden` toast and no project is created. No crash, no silent lie.
**Why human:** SPA rendering, tooltip display and toast behavior are browser-only; no browser harness in this repo.

### 2. Toggle + Teams section visual behavior in the running app

**Test:** As a lead (non-admin), open the share modal: flip the private/public toggle, then invite a team and remove it.
**Expected:** Toggle flips optimistically and persists (reverts with a localized toast on refusal); Teams section lists unlinked teams with Invite actions, linked teams in the note with remove actions; live-semantics hint visible; non-managers see the lock hint and no controls.
**Why human:** visual rendering and interaction flow; the revert-on-refusal path in local mode is also a known gap (WR-01).

### Gaps Summary

No automated gaps. All server-side hard gates verified: permCreate enforcement (stored-prefs-only, keyed `projectCreateForbidden` refusal riding the 200 PUT), lead-on-create, field pinning, Permissions-page teardown with no orphaned keys/routes, i18n gate green with 0 dead keys, docs aligned to the shipped model. The single behavior-unverified truth is the D-51-14 client affordance clause, which is code-present and wired on the primary surface but (a) has no rendered-state test and (b) is only partially gated across entry points (WR-02, already recorded). CR-01's inverted toggle label is a shipped user-visible defect against the phase goal's "admin restriction setting" being *comprehensible* — functionally the setting works and the server is authoritative; it is recorded as open in 51-REVIEW-DISPOSITION.md and should be fixed before Phase 52 transparency work builds on it.

---

_Verified: 2026-11-08T13:20:00Z_
_Verifier: the agent (gsd-verifier)_
