---
phase: 53-member-project-experience
verified: 2026-11-09T20:29:26Z
status: passed
score: 17/17 must-haves verified
covered_files:
  - server.js
  - mcp.js
  - src/core/store.js
  - src/core/utils.js
  - src/shell/render.js
  - src/overlays/modals.js
  - src/actions/actions.js
  - src/actions/teams.js
  - src/features/teams.js
  - src/pages/projects.js
  - src/pages/project.js
  - src/pages/members.js
  - src/views/project-overview.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/perm.test.mjs
  - test/perm-drift.test.mjs
  - test/json-equal.test.mjs
  - test/invite-hierarchy.test.mjs
  - test/error-codes.test.mjs
  - test/i18n-core-features.test.mjs
  - test/i18n-shell.test.mjs
  - test/i18n-toast.test.mjs
  - test/helpers/visibility-fixture.mjs
  - test/mcp.test.mjs
  - test/transparency.test.mjs
  - test/visibility-migration.test.mjs
  - e2e/invite.spec.mjs
  - e2e/project-settings.spec.mjs
  - e2e/projects-table.spec.mjs
  - e2e/teams.spec.mjs
  - e2e/flows.spec.mjs
  - .planning/phases/53-member-project-experience/53-01-PLAN.md
  - .planning/phases/53-member-project-experience/53-02-PLAN.md
  - .planning/phases/53-member-project-experience/53-03-PLAN.md
  - .planning/phases/53-member-project-experience/53-04-PLAN.md
  - .planning/phases/53-member-project-experience/53-05-PLAN.md
  - .planning/phases/53-member-project-experience/53-01-SUMMARY.md
  - .planning/phases/53-member-project-experience/53-02-SUMMARY.md
  - .planning/phases/53-member-project-experience/53-03-SUMMARY.md
  - .planning/phases/53-member-project-experience/53-04-SUMMARY.md
  - .planning/phases/53-member-project-experience/53-05-SUMMARY.md
covered_digest: "v2:sha256:e61f8b03efe1ff2a3e88fba4a3e419a3d627b810b5e33c9ebceee645c97e3d1d"
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "The project page has exactly one Share affordance: the labeled button, which opens the unified modal directly on the Access tab; the avatar-stack and user-plus buttons are deleted (PROJ-02/D-05/M-13)."
    reason: "2026-11-09 owner ruling (commit 5ca7a26) removed the project-page header Share button as redundant with the settings gear. Exactly one Share entry point remains (the project context-menu Share, A.share → projectSettings tab=access), and access management stays reachable from the gear's Access tab. The e2e and machine-identifier pins were rewritten to the ruling; zero data-a=\"share\" markup remains in src/."
    accepted_by: "owner (Jérémy Maillot)"
    accepted_at: "2026-11-09"
re_verification:
  previous_status: passed
  previous_score: 8/8
  gaps_closed: []
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "REQUIREMENTS.md PROJ-02 and ROADMAP success criterion 5 still say 'exactly one Share button (labeled)' on the project page; the owner ruling removed the header button (exactly one share entry remains: the context menu)."
    category: other
    reason: "Planning text is stale relative to the 2026-11-09 owner ruling implemented at 5ca7a26; the code, e2e and data-a pins are internally consistent. Update the requirement/SC wording so future audits do not flag it."
    evidence_status: "documented owner ruling (commit 5ca7a26, e2e projects-table 'PROJ-02, 2026-11-09 ruling')"
  - finding: "53-REVIEW-DISPOSITION.md lists WR-03 as still 'open'."
    category: security
    reason: "Commit 97468bc landed the WR-03 fix (admin/owner guest invites now re-check project.allowInviteGuests at creation, refusing inviteGuestToggleOff); the disposition table was not updated. Code is correct; the record is stale."
    evidence_status: "fixed in code (server.js:5458-5465), disposition row stale"
  - finding: "deferred-items.md still labels the 4 flows.spec share-modal/creation failures 'pre-existing'."
    category: other
    reason: "WR-02 fix 9167c83 repaired those 4 in-phase regressions (UAT records flows.spec 33/33 green); only the 7 genuinely pre-existing failures (tenancy ×4, locale ×2, french-overflow ×1) remain. Refresh the deferred list."
    evidence_status: "fixed at 9167c83; UAT triage confirms"
---

# Phase 53: Member & Project Experience Verification Report

**Phase Goal:** The everyday surfaces — invite modal, team editing, project settings, projects table — match how people actually use workspaces, with per-team permissions enforced server-first through the one existing funnel.
**Verified:** 2026-11-09T20:29:26Z
**Status:** passed
**Re-verification:** Yes — full stale refresh against HEAD `cec43bd` (fix commits 879c251, 5ca7a26, 9167c83, 97468bc, fb7994d landed after the previous report).

## Re-Verification Note

The prior `53-VERIFICATION.md` was written before the review-fix commits. Its frontmatter said `passed` while its body said `human_needed` (e2e could not start in that environment). This report re-derives every verdict from the current tree and **runs the phase-53 e2e specs for the first time from this verifier**, so no truth is left present-but-behavior-unverified. `covered_digest` was recomputed over the current files with `gsd-tools query verification.fingerprint`.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin stores `p.perms['team:'+id]` via the normal doc-PUT path; no top-level field, no migration (PSET-02) | ✓ VERIFIED | `test/perm.test.mjs#row 1` passes; `grep p.teamPerms` → 0 in server.js/mcp.js/src |
| 2 | View-only team member refused content writes server-side with keyed `projectPermDenied`; Can-edit/Can-comment succeed; lead/owner/admin Full access (PSET-03) | ✓ VERIFIED | `perm.test.mjs` rows 2,3,4,6,7,16,17,18 pass; `server.js:1160-1223` gates tasks/comments/files on the STORED doc |
| 3 | `projectPermFor` semantics correct; team "Full access" is content-only; `canManageProject` body untouched (D-01) | ✓ VERIFIED | `server.js:866-889`; `canManageProject` identical to pre-plan `aedd30c:837-840`; `git diff aedd30c..HEAD` shows no body change |
| 4 | Stale/omitted non-manager PUT cannot wipe or downgrade team keys; `normalizeProjects` sweeps dangling/non-PERMS team keys (T-53-01) | ✓ VERIFIED | `perm.test.mjs` rows 5,8,9; sweep at `server.js:958` |
| 5 | Server funnel / `projectAccessReason` / mcp `canReadProject` / client `canSee` agree on every actor shape; visibility stays boolean (PSET-02/03/D-03) | ✓ VERIFIED | `test/mcp.test.mjs` parity rows incl. `m_teamviewonly/m_teamrevoked/m_danglingteam`; client-parity fixture; `src/core/store.js` byte-unchanged since pre-plan |
| 6 | Typed invite emails survive role/team/project toggles and re-renders in EN and FR (INVT-01) | ✓ VERIFIED | `e2e/invite.spec.mjs` EN + FR draft tests pass (ran this refresh); `IN.inviteDraft` has no `render()` |
| 7 | Projects chips (below Team, multi-select) feed `S.ui.inviteScope.projects` into the POST body (INVT-02) | ✓ VERIFIED | `e2e/invite.spec.mjs` chips test passes; `A.submitInvite` → `api.createInvites(..., scope)` |
| 8 | Guest = exactly one project enforced server-side on create for ALL inviter tiers (incl. admin/owner), on membership add/remove, and at accept; toggle-OFF projects refuse guest invites (INVT-03, WR-03) | ✓ VERIFIED | `perm.test.mjs` rows 10-14; `validateGuestInviteShape` 1 def + 4 call sites; `server.js:5458-5465` admin-path `allowInviteGuests` gate (commit 97468bc) |
| 9 | Guest ≠ 1 project disables send + localized hint EN/FR; no clamp or role downgrade (D-06/INVT-03) | ✓ VERIFIED | `e2e/invite.spec.mjs` EN + FR D-06 tests pass; `A.invProjToggle` toggles only, `guestNeedsProject` disables `#inv-submit` |
| 10 | MCP exposes exactly three tools and none creates invites (INVT-03 ceiling) | ✓ VERIFIED | `perm.test.mjs#row 15` passes |
| 11 | One unified `projectSettings` modal (General + Access) opens from Workspace > Projects and the project page; gear → General, Share entry → Access; old modals gone (PSET-01/PSET-04/D-04/D-05) | ✓ VERIFIED | `e2e/project-settings.spec.mjs` open/switch matrix EN+FR and old-modals-gone pass; `grep shareModal\|projectModal src/` → 0; dispatcher has only `projectSettings`/`projectCreate` |
| 12 | Per-team perm dropdowns round-trip, D-02 "Can edit" default, non-manager read-only with lock hint, concurrent-edit 409 honesty, every keystroke field `data-in`-bound (PSET-04/PSET-01) | ✓ VERIFIED | `e2e/project-settings.spec.mjs` tests 5-9 pass (D-02 reload, 409 conflict, read-only, EN/FR survival); `IN.teamPerm` + `A.submitProject` snapshot→pushNow→restore; accessBody static spans for non-managers |
| 13 | Projects table shows Lead / Teams / Members count / Status (PSTAT + progress) / Target date + per-row gear (D-07); no rosters or perm levels in cells/tooltips (PROJ-01) | ✓ VERIFIED | `e2e/projects-table.spec.mjs` table+gear test passes; `projects.js:56,61` renders `p.members.length`, `pStatus`, `progBar/progressOf`, `fmtDate(p.due)`, gear `data-a="projectSettings" data-tab="general"` |
| 14 | Project page share surface deduplicated: avatar-stack and user-plus buttons deleted; exactly one Share entry point remains and opens Access (PROJ-02/D-05/M-13) | ✓ PASSED (override) | Header Share button removed by 2026-11-09 owner ruling (5ca7a26). `grep data-a="share" src/` → 0; e2e asserts 0 header Share buttons and that Access is reachable. Single remaining Share entry = project context-menu `A.share` → `projectSettings` tab=access. See `overrides` + advisory. |
| 15 | Edit Team members box is accent-insensitive searchable and never loses checked state (TEAM-01) | ✓ VERIFIED | `e2e/teams.spec.mjs` search+checked-state test passes; `teams.js:34-54` uses `foldForSearch`, checks derive from `f.members` |
| 16 | Team hint is the owner's exact EN sentence + FR equivalent; team detail page has no invite button (TEAM-02/TEAM-03) | ✓ VERIFIED | `e2e/teams.spec.mjs` EN + FR hint and no-invite tests pass; locales carry `page.team.accessHint`; `pageTeam()` has no `data-a="invite"` (Members-directory button remains per TEAM-03) |
| 17 | i18n gate clean (0 dead/0 stale), pins accurate, no allowlist additions; full unit suite green; zero new runtime deps (UX-01) | ✓ VERIFIED | `npm run i18n:scan` → 0/0 (this refresh); `npm test` → 1164 pass / 0 fail / 11 skipped; `package.json` unchanged vs `aedd30c`; `scripts/i18n-scan.mjs` untouched in phase |

**Score:** 17/17 truths verified (1 PASSED via documented owner override, 0 present-but-behavior-unverified).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `server.js` `projectPermFor` | One shared perm resolver | ✓ VERIFIED | :866; used by the doc-PUT funnel |
| `server.js` `validateGuestInviteShape` | One shared guest validator | ✓ VERIFIED | :3296; create + add + remove + accept |
| `server.js` content-write gate | Server-side per-team gating | ✓ VERIFIED | :1160-1223, stored-doc + stored-parent rule (CR-01 fix) |
| `server.js` `normalizeProjects` sweep | Dangling/non-PERMS team-key sweep | ✓ VERIFIED | :958 |
| `mcp.js` `canReadProject` | Mirror kept in lockstep | ✓ VERIFIED | Boolean; parity tests pass |
| `src/overlays/modals.js` | `projectSettingsModal`, invite bindings, Access body | ✓ VERIFIED | old modals gone; `data-in="inviteDraft"`/`teamPerm` present |
| `src/actions/actions.js` | `IN.inviteDraft`, `IN.teamPerm`, `A.projectSettings`, conflict honesty | ✓ VERIFIED | no render in inviteDraft; snapshot/pushNow/restore |
| `src/features/teams.js` | Searchable members box + corrected hint | ✓ VERIFIED | foldForSearch; `page.team.accessHint` |
| `src/pages/projects.js` | Table columns + row gear | ✓ VERIFIED | :56/:61 |
| `src/pages/project.js` | Deduplicated header | ✓ VERIFIED (override) | no Share button; gear routes to settings |
| `src/locales/en.json` / `fr.json` | EN+FR parity, dead keys pruned | ✓ VERIFIED | `table.members`, `modal.inviteGuestNeedsProject`, `page.team.accessHint` both locales; `a11y.addMember`/`membersHint` gone |
| `test/perm.test.mjs`, `test/perm-drift.test.mjs`, `test/json-equal.test.mjs`, `test/invite-hierarchy.test.mjs` | Gating/guest/drift/JSON tests | ✓ VERIFIED | 32 tests pass in the focused run; full suite green |
| `e2e/{invite,project-settings,projects-table,teams}.spec.mjs` | UI coverage | ✓ VERIFIED | 20/20 pass this refresh |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `lib/modals.js` table-row gear | `A.projectSettings` → `projectSettingsModal` | `data-a="projectSettings" data-tab="general"` | ✓ WIRED (e2e) |
| `project.js` header gear | `A.editProject` → `A.projectSettings` | `data-a="editProject"` | ✓ WIRED (e2e) |
| context menu Share | `A.share` → Access tab | `I('share', ...)` → `dataset.tab='access'` | ✓ WIRED (single share entry) |
| `IN.teamPerm` | `p.perms['team:'+tid]` → `pushNow` | select `data-in="teamPerm" data-tid` | ✓ WIRED (e2e round-trip) |
| `A.submitInvite` | invite POST body `scope.projects` | `api.createInvites` | ✓ WIRED (e2e asserts both ids) |
| invite create | `validateGuestInviteShape` | server route | ✓ WIRED + tested |
| team membership add/remove | `validateGuestInviteShape` | server routes | ✓ WIRED + tested |
| accept route | `validateGuestInviteShape` + toggle re-check | server route | ✓ WIRED + tested |
| `teams.js` search input | `IN.teamSearch` → render | `data-in="teamSearch"` | ✓ WIRED (e2e) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| Projects table Members cell | `p.members.length` | store docs from server | Yes | ✓ FLOWING |
| Projects table Status/Progress | `pStatus(p.status)`, `progressOf(p.id)` | store | Yes | ✓ FLOWING |
| Access tab team perm selects | `p.perms['team:'+tid]` | store + server doc | Yes | ✓ FLOWING |
| Invite chips | `visibleProjects()` / `teamsList()` | store | Yes | ✓ FLOWING |
| Team members checklist | `f.members`, `people` | store | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Per-team gating + guest invariant + drift guard | `node --test test/perm.test.mjs test/perm-drift.test.mjs test/json-equal.test.mjs test/invite-hierarchy.test.mjs` | 32 pass / 0 fail | ✓ PASS |
| Full unit suite | `npm test` | 1164 pass / 0 fail / 11 skipped | ✓ PASS |
| i18n gate | `npm run i18n:scan` | 0 dead / 0 stale / 0 pending / 0 unresolved | ✓ PASS |
| Invite draft + chips + D-06 + teams | `npm run e2e -- e2e/invite.spec.mjs e2e/projects-table.spec.mjs e2e/teams.spec.mjs` | 10 passed | ✓ PASS |
| Unified settings modal (both tabs, per-team perms, conflict, read-only, survival EN/FR, old modals gone) | `npm run e2e -- e2e/project-settings.spec.mjs` | 10 passed | ✓ PASS |

### Probe Execution

No phase-declared probe scripts (`scripts/*/tests/probe-*.sh`) and this is not a migration/CLI-probe phase — section not applicable.

### Requirements Coverage

All 13 IDs are declared in a plan frontmatter and map 1:1 in `REQUIREMENTS.md` traceability. **No orphaned requirements.**

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| PSET-02 | 53-01 | Per-team permission levels | ✓ SATISFIED | perm rows 1,5,8,9; storage key + sweep |
| PSET-03 | 53-01 | Server-side enforcement via `projectPermFor` | ✓ SATISFIED | perm rows 2-7,16-18; funnel gate |
| INVT-01 | 53-02 | Email draft survives | ✓ SATISFIED | e2e EN+FR |
| INVT-02 | 53-02 | Projects chips feed scope | ✓ SATISFIED | e2e chips→POST |
| INVT-03 | 53-02 | Guest exactly-one-project + MCP ceiling | ✓ SATISFIED | perm rows 10-15; e2e D-06 EN+FR |
| PSET-01 | 53-03 | Unified settings modal, old modals gone | ✓ SATISFIED | e2e matrix + old-modals-gone; grep |
| PSET-04 | 53-03 | Same modal from both surfaces + per-team UI | ✓ SATISFIED | e2e tests 1-9 |
| PROJ-01 | 53-04 | Table columns + row gear | ✓ SATISFIED | e2e table+gear |
| PROJ-02 | 53-04 | One Share entry → Access | ✓ SATISFIED (override — 2026-11-09 owner ruling) | zero header Share buttons; one context-menu Share entry; Access via gear |
| TEAM-01 | 53-05 | Searchable members box, checks preserved | ✓ SATISFIED | e2e |
| TEAM-02 | 53-05 | Correct multi-team hint EN+FR | ✓ SATISFIED | e2e EN+FR; locales |
| TEAM-03 | 53-05 | No team-page invite | ✓ SATISFIED | e2e; `pageTeam()` |
| UX-01 | all | i18n gate clean, pins, dead keys, deps | ✓ SATISFIED | i18n scan 0/0; pins 479/1720; package.json unchanged |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | No `TBD`/`FIXME`/`XXX` debt markers in any phase-modified source file | ℹ️ Info | None |
| 53-REVIEW-DISPOSITION.md | WR-03 row | Disposition recorded as `open` although code fix landed at 97468bc | ℹ️ Info | Record-only; code not affected |
| deferred-items.md | flows ×4 | Still listed as pre-existing though repaired at 9167c83 | ℹ️ Info | Record-only; follows up |

No stub implementations, no hardcoded empty data reaching render, no client-only write gates found.

### Human Verification Required

None. All behavior-dependent truths were exercised by the unit suite and the phase-53 e2e specs run during this verification. The single deviation (project-page Share button) is an explicit, dated owner ruling, recorded as an override rather than deferred to testing.

### Gaps Summary

No gaps. The server-first per-team permission funnel is implemented in the single doc-sync funnel (`mergeClientDoc`) with keyed `projectPermDenied` refusals, and is proven by unit tests including the CR-01 binding/re-pointing regressions. The guest = exactly-one-project invariant is re-derived on create (all inviter tiers), membership add/remove and accept, with the WR-03 toggle gate now applied to admin/owner guest invites. Every phase-53 UI truth passes its e2e spec in EN and FR. The only requirement whose wording no longer matches the code is PROJ-02's "labeled Share button", superseded by the owner's 2026-11-09 ruling; it is carried as an override and flagged for a requirements-text update (advisory). Two planning records (WR-03 disposition row, deferred-items flows entry) are stale but do not affect the shipped behavior.

---

_Verified: 2026-11-09T20:29:26Z_
_Verifier: the agent (gsd-verifier)_