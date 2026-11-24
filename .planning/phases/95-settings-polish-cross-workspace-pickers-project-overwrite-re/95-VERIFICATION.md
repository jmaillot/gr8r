---
phase: 95-settings-polish-cross-workspace-pickers-project-overwrite-re
verified: 2026-11-24T12:00:00Z
status: human_needed
score: 20/20 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - ".planning/phases/95-settings-polish-cross-workspace-pickers-project-overwrite-re/95-01-PLAN.md"
  - ".planning/phases/95-settings-polish-cross-workspace-pickers-project-overwrite-re/95-01-SUMMARY.md"
  - ".planning/phases/95-settings-polish-cross-workspace-pickers-project-overwrite-re/95-02-PLAN.md"
  - ".planning/phases/95-settings-polish-cross-workspace-pickers-project-overwrite-re/95-02-SUMMARY.md"
  - ".planning/phases/95-settings-polish-cross-workspace-pickers-project-overwrite-re/95-04-PLAN.md"
  - ".planning/phases/95-settings-polish-cross-workspace-pickers-project-overwrite-re/95-04-SUMMARY.md"
  - ".planning/phases/95-settings-polish-cross-workspace-pickers-project-overwrite-re/95-05-PLAN.md"
  - ".planning/phases/95-settings-polish-cross-workspace-pickers-project-overwrite-re/95-05-SUMMARY.md"
  - "export/restore.js"
  - "server.js"
  - "src/actions/actions.js"
  - "src/core/api.js"
  - "src/locales/de.json"
  - "src/locales/en.json"
  - "src/locales/es.json"
  - "src/locales/fr.json"
  - "src/locales/nl.json"
  - "src/overlays/modals.js"
  - "src/pages/backup.js"
  - "src/pages/settings.js"
  - "test/backup-scopes.test.mjs"
  - "test/client-surfaces.test.mjs"
  - "test/error-codes.test.mjs"
  - "test/i18n-core-features.test.mjs"
  - "test/i18n-shell.test.mjs"
  - "test/i18n-toast.test.mjs"
  - "test/mcp.test.mjs"
  - "test/restore-client.test.mjs"
  - "test/restore-overwrite.test.mjs"
  - "test/restore-routes.test.mjs"
  - "test/self-visibility.test.mjs"
  - "test/settings-client.test.mjs"
  - "test/team-pick-client.test.mjs"
  - "test/xws-gate.test.mjs"
covered_digest: "v2:sha256:078f9fbc5a5d104ce947ca581ae08e0ebdab47b92022b76f6c84b4cc89674a07"
gaps: []
human_verification:
  - test: "Open Settings > My Access and confirm the grouped read-only card grid reads well (project-colored icons, workspace subtitles, role badges, empty workspaces hidden)."
    expected: "Card grid, not a flat list; each project shows its own icon/color; no tick icon."
    why_human: "Visual layout quality cannot be judged by slice tests."
    verified: true
    verified_by: "owner (Prod, 2026-11-24)"
  - test: "View Settings > General > Workspace URL with a long URL."
    expected: "One line, ellipsis, full URL on hover title; no marquee."
    why_human: "Overflow behavior is visual."
    verified: true
    verified_by: "owner (Prod, 2026-11-24)"
  - test: "As Super Admin, open the Backup page: Run-now picker and restore drawer target pickers; restore a project archive and walk Restore-as-new AND Overwrite (with confirm phrase)."
    expected: "All workspaces visible in pickers only; drawer shows both CTAs for project archives; overwrite confirm uses the target project's CURRENT name; success/failure toasts render."
    why_human: "End-to-end drawer interaction and dialog chrome are not exercised by slice tests."
    verified: true
    verified_by: "owner (Prod, 2026-11-24)"
  - test: "Check Invite Member > Edit Teams picker feels identical to Teams > Edit team."
    expected: "Same selectable chip picker behavior."
    why_human: "UX parity judgment is visual/interactive."
    verified: true
    verified_by: "owner (Prod, 2026-11-24)"
---

# Phase 95: Settings Polish + Cross-Workspace Pickers + Project Overwrite Restore — Verification Report

**Phase Goal:** Settings surfaces polished (My Access, honest key purge, one-line URL, working Teams picker); operators see all workspaces in Backup/Restore scope pickers only; project-restore archives restorable as NEW or as OVERWRITE.
**Verified:** 2026-11-24T12:00:00Z
**Status:** verified — 20/20 automated must-haves pass; 4/4 human verification items confirmed by owner on Prod (2026-11-24)

**Re-verification:** No — initial verification.

## Goal Achievement

### Observable Truths (merged: ROADMAP SC-1..6 + PLAN frontmatter must_haves, 4 plans)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Run-now (Backup) workspace picker renders from phase-92 S.ui.backupScopes payload (XWS-01, D-11) | ✓ VERIFIED | src/pages/backup.js picker slice; xws-gate + backup-history-client + settings-client tests green; D-11 slice pinned |
| 2 | membershipsOf body + call sites byte-unchanged, guarded by grep gate | ✓ VERIFIED | test/xws-gate.test.mjs passes (body pin, call-site pin, scopes-handler guard-comment pin) — ran in this verification |
| 3 | Navigation / workspace switcher untouched | ✓ VERIFIED | git diff 69cbd673^..HEAD touches only picker slices/settings/restore files; client-surfaces pin updated knowingly |
| 4 | Invite Member > Edit Teams uses mteamToggle contract, surface=invite (SET-04, D-12) | ✓ VERIFIED | src/overlays/modals.js `data-a="mteamToggle"` + data-surface="invite"; A.invTeamToggle retired; team-pick-client tests green |
| 5 | Settings client-slice harness exists | ✓ VERIFIED | test/settings-client.test.mjs (5+ slices green) |
| 6 | My Access grouped read-only card grid, project icons, role badges, empty workspaces hidden (SET-01, D-07/D-08) | ✓ VERIFIED | src/pages/settings.js:521-529 renders api.myAccess() payload with pIcon; slice tests pin grid/pIcon/read-only/no-visibleProjects; route tests pin empty-group hiding + additive fields |
| 7 | My Access spans ALL member workspaces via new aggregate endpoint; /me/visibility byte-unchanged | ✓ VERIFIED | server.js:7906 GET /api/settings/my-access (membershipsOf read-only caller, xws-gate pin extended knowingly); self-visibility tests green incl. /me/visibility shape pins |
| 8 | Purge button gated on revoked keys, 2-click confirm; server deletes ONLY revoked rows, one value-free audit event, count toast (SET-02, D-09/D-10) | ✓ VERIFIED | server.js:7955 POST /api/keys/purge-revoked (requireUser + tooMany 5/15min); mcp.test.mjs pins removed-count, surviving active rows, exactly-one audit row w/o key values, 429 on 6th call, removed:0 |
| 9 | Workspace URL single line, ellipsis + title tooltip, no marquee (SET-03, D-13) | ✓ VERIFIED | settings.js:304 nowrap+ellipsis+title markup; D-13 slice test green |
| 10 | Every new key in ×5 locales in emitting commit | ✓ VERIFIED | restoreNameCollision/restoreTargetMissing/settings.apikeys.purge*/page.restore.projectPick*/overwrite* present in all 5 locale files (grepped); i18n-scan exits 0 |
| 11 | Project archive restores as OVERWRITE: full D-01 footprint removed, ids verbatim, ONE tx, target workspace doc | ✓ VERIFIED | export/restore.js overwriteProjectFragment; test/restore-overwrite.test.mjs happy-path + deletion-set + verbatim-ids cells pass (23/23 this run) |
| 12 | Full 89-05 guard chain unchanged: snapshot-first, scope-kind match, blob swap + repair net, FTS in-tx, pre-commit verification, global lock | ✓ VERIFIED | overwrite route diff shows only 2 extension points; snapshot-honesty + FTS + D-04 lock cells pass; lock-release funnel fix pinned (96aa2c40) |
| 13 | restoreNameCollision typed refusal ×5 with armed-target self-exclusion (same-named overwrite SUCCEEDS) | ✓ VERIFIED | Collision-scan cells pass; keys in all 5 locales; error-codes allowlist entry (client-side) |
| 14 | Overwrite route accepts project scope; confirmName validated server-side vs LIVE doc project name before archive resolution | ✓ VERIFIED | server.js route extension; restore-routes cells: acceptance + audit token 'project', confirmName near-miss, missing target |
| 15 | Permissions per D-05; Backup runs history preserved (D-06); roster skipped for project scope | ✓ VERIFIED | Role-matrix cells green; D-06 history cell green. NOTE: implemented as targeting gate at import_new position (see Deviations) |
| 16 | D-04 checkpoint: global restore lock unchanged for project path | ✓ VERIFIED | Decision `lock-unchanged` recorded 2026-11-24 in 95-04-PLAN.md, commit 904c840e; route lock cell pins no per-scope bypass |
| 17 | GET /api/backup/scopes carries additive projects:[{id,name}] per workspace, operator-gated (XWS-01/95-05) | ✓ VERIFIED | Strict pin knowingly moved to id/name/slug/projects; non-operator 403 pin green; zero-projects case green |
| 18 | Drawer offers BOTH CTAs for project archives + second-level project picker from scopes payload (D-02) | ✓ VERIFIED | src/pages/backup.js restoreProjectPick chip row + overwrite CTA; restore-client 5 slices green (payload-driven, no api.workspace in picker) |
| 19 | Overwrite CTA opens confirmDlg(typeName = CURRENT name) before POST {runId, targetId, targetProjectId, confirmName}; server re-validates | ✓ VERIFIED | actions.js:5695 posts the actual route contract; confirmDlg+typeName co-occurrence slice green |
| 20 | Drawer refusals ride existing tErr/restoreToast vocabulary; ×5 keys | ✓ VERIFIED | restoreToast closed map incl. restoreNameCollision (client-side allowlist); i18n parity tests green |

**Score:** 20/20 truths verified (0 present-behavior-unverified)

### Deferred Items

None — BKRST-05 is not in REQUIREMENTS.md's traceability table (late owner ruling 2026-11-24) but is the ROADMAP SC-6 contract and is fully covered here. No requirement mapped to a later phase remains open.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| test/xws-gate.test.mjs | membershipsOf byte gate | ✓ VERIFIED | green (ran) |
| test/settings-client.test.mjs | settings slice harness + 95-02 slices | ✓ VERIFIED | green (ran) |
| src/pages/backup.js | scopes-driven pickers + drawer project picker | ✓ VERIFIED | wired |
| src/overlays/modals.js | mteamToggle invite chips | ✓ VERIFIED | wired |
| server.js | my-access, purge-revoked, overwrite project acceptance, scopes projects | ✓ VERIFIED | all 4 additive blocks present; frozen ?all=1 route untouched (no diff hunks match) |
| export/restore.js | overwriteProjectFragment | ✓ VERIFIED | 23/23 engine cells pass |
| src/core/api.js | myAccess(), purgeRevokedKeys() | ✓ VERIFIED | wired into settings.js/actions.js |
| src/pages/settings.js | card grid, purge button, one-line URL | ✓ VERIFIED | wired |
| src/locales/{en,fr,nl,de,es}.json | all new keys ×5 | ✓ VERIFIED | grepped + i18n-scan green |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| runNowCard | S.ui.backupScopes | refreshBackupScopes once-per-session fill | WIRED | slice-pinned |
| drawer project picker | S.ui.backupScopes[].projects | chips | WIRED | slice-pinned |
| drawer Overwrite CTA | POST /api/backup/restore/overwrite | confirmDlg → {runId, targetId, targetProjectId, confirmName} | WIRED | matches shipped route contract (targetId, not plan's targetWorkspaceId — justified deviation) |
| purge button | api.purgeRevokedKeys() → POST /api/keys/purge-revoked | 2-click action pair | WIRED | mcp route tests green |
| my-access client | GET /api/settings/my-access | api.myAccess() | WIRED | payload-only doctrine pinned |
| overwrite route | restoreOverwriteUnit project branch | scope-kind + target ids | WIRED | route cells green |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| My Access grid | S.ui.myAccessData | GET /api/settings/my-access (live membershipsOf + doc walk) | Yes | ✓ FLOWING |
| Purge toast | removed count | delete changes count | Yes | ✓ FLOWING |
| Drawer project chips | S.ui.backupScopes[].projects | live workspace docs | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------- |
| Hard gates + all targeted suites | `node --test test/xws-gate test/backup-scopes test/restore-client test/restore-overwrite test/restore-routes test/self-visibility test/settings-client test/i18n-scan` | 142 pass / 0 fail | ✓ PASS |
| Full regression gate | `npm test` | 2492 tests, 2465 pass, **2 fail = exactly the 2 documented pre-existing** (D-05 fr-typography, D-06 webhook-routes); the scheduler flake passed this run | ✓ PASS |
| Zero new dependencies | `git diff 69cbd673^..HEAD -- package.json package-lock.json` | empty | ✓ PASS |
| Frozen ?all=1 route | diff grep vs 69cbd673^ | no hunks touch it | ✓ PASS |

### Probe Execution

None declared — no probe scripts in any 95-0x plan.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| XWS-01 | 95-01, 95-05 | All workspaces in Backup/Restore scope pickers only; workspacesForUser/nav byte-unchanged | ✓ SATISFIED | xws-gate green; pickers on scopes payload; pinned in REQUIREMENTS.md as Complete |
| SET-01 | 95-02 | My Access project icon / column layout | ✓ SATISFIED | card grid + pIcon slices |
| SET-02 | 95-02 | Revoked-key purge button, audit preserved | ✓ SATISFIED | route + 2-click + value-free audit pinned |
| SET-03 | 95-02 | Workspace URL single line | ✓ SATISFIED | ellipsis + title markup |
| SET-04 | 95-01 | Invite Edit-Teams selectable picker | ✓ SATISFIED | mteamToggle surface-aware contract |
| BKRST-05 | 95-04, 95-05 | Project archive restore as NEW or OVERWRITE | ✓ SATISFIED | engine + route + drawer + ×5 refusals, all cells green |

No orphaned requirements: all six phase IDs claimed by plans and mapped in ROADMAP §95. Note: REQUIREMENTS.md traceability table lacks a BKRST-05 row (doc-lag only; the requirement text lives in ROADMAP SC-6 and is satisfied).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | No TBD/FIXME/XXX/stub markers found in phase files | ℹ️ Info | clean |

### Deviations Evaluated (not failures)

1. **95-04 D-05 role matrix via targeting gate** — the plan's truth ("CAP gate already enforces Backup-Op exclusion") was factually wrong about the locked 89-05 chain; implementing it literally would have regressed a locked 403 pin. The shipped targeting gate (membership | SA bypass at import_new position, CAP chain byte-unchanged) honors D-05's intent; every matrix behavior is pinned by passing route cells. **Accepted.**
2. **95-05 overwrite POST key `targetId`** — matches the real 95-04 route contract (`body.targetId`); the plan's `targetWorkspaceId` would have 404'd. **Accepted.**
3. **Workspace logo excluded from project deletion set** — project archives carry logo:null; plan-literal removal would dangle a live blob reference. **Accepted.**
4. **95-02 locale keys moved to Task-3 commit** — required by the live-tree dead-key gate; still keys+usage in one commit. **Accepted.**

## Human Verification Required

See `human_verification` frontmatter — 4 items: My Access grid visuals, Workspace URL overflow, end-to-end drawer restore-as-new/overwrite walkthrough (incl. confirm phrase + collision toast), Edit-Teams picker parity.

## Gaps Summary

No gaps. All 20 must-haves verified with behavioral test evidence (142 targeted + full suite at baseline with only the 2 documented pre-existing failures). Hard gates re-verified: membershipsOf byte-green (xws-gate), frozen ?all=1 route untouched, zero new dependencies, i18n ×5 complete. Status is human_needed solely for visual/interactive confirmation of the four UI items above — automated checks passed.

---

_Verified: 2026-11-24T12:00:00Z_
_Verifier: the agent (gsd-verifier)_
