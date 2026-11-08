---
phase: 52-transparency-view-milestone-verification-sweep
plan: 03
subsystem: docs-verification
tags: [docs, verification-sweep, milestone, permissions]
requires: [Phase 51 verify commands (D-52-11), shipped v2.0 visibility model (52-01/52-02), server.js visibility funnel]
provides: [refreshed docs/WorkspacePermissions.md + docs/ProjectPermissions.md to the v2.0 model, sweep evidence (M-08 success criterion 3)]
affects: []
tech-stack:
  added: []
  patterns: [citation-reverification-at-doc-time, gates-verbatim-no-aggregate-script]
key-files:
  created: []
  modified: [docs/WorkspacePermissions.md, docs/ProjectPermissions.md]
decisions:
  - "All server.js file:line citations re-grepped against the live tree and refreshed (requireWorkspace 3225-3240, mergeClientDoc 1041, visibility route 4977-5005, ROLE_RANK 207, lead-on-create 1084-1090, perms preservation 899/1094/1950) — the Phase 52 route insertion had shifted every downstream line number"
  - "The transparency view is documented as a new §7 in WorkspacePermissions.md and §6 in ProjectPermissions.md — route, requireWorkspace('admin') gate as the real control, first-match reason semantics (D-52-5/6), refetch-per-open (D-52-3), funnel-only computation; member self-view documented as deferred (v3) without naming the deferred requirement"
metrics:
  duration: ~20 min
  completed: 2026-11-08
status: complete
actuals:
  tokens: 14000
  tasks: 2
  commits: 1
commits: 1
plan_head_before: 529d42a
plan_head_after: 19dc4a7
---

# Phase 52 Plan 03: Milestone verification sweep & permission docs refresh Summary

Re-ran the Phase 51 verify gates verbatim in one clean pass (all green) and refreshed both French permission docs to the shipped v2.0 model with live-tree-verified citations.

## What Was Built

**Task 1 — docs refresh (commit 19dc4a7)**
- `docs/WorkspacePermissions.md` / `docs/ProjectPermissions.md`: every `server.js:NNN` citation re-grepped against the live tree at doc time (Pitfall 6 — the 52-01 route insertion shifted line numbers). Notably: `requireWorkspace` 2707-2721 → 3225-3240, `mergeClientDoc` 1002 → 1041, `projectCreateForbidden` push 1061 → 1077-1081 (channel 4686 → 4703-4706), `ROLE_RANK` 193 → 207, `canManageProject` 820-823 → 837-840, `normalizeProjects` 807-836 → 872-901, perms preservation 1002/1835/834 → 1094/1950/899. Client refs refreshed too (`permsTable` members.js:124, Guest label actions.js:1817/1891, guests hint fr.json:798, MCP bypass mcp.js:183/185, invite scope block modals.js:369-378).
- New content covering the v2.0 model: the admin transparency view (route `GET /api/workspaces/:slug/members/:memberId/visibility`, server.js:4977-5005; `requireWorkspace(..., 'admin')` gate as the real control; list computed only through `memberCanReadProject` 813-818; first-match reasons via `projectAccessReason` 828-836 — everyone/lead/member/team; refetch-per-open D-52-3; D-51-4 lost-visibility honesty), the per-project lead role (D-51-17) and boolean `p.private`. Member self-view documented as **deferred (v3)** — the deferred requirement id does not appear in either doc (verify gate).
- Docs remain French with existing typography conventions.

**Task 2 — milestone verification sweep (no commit; verification only)**

All gates green in one clean pass (D-52-11 — Phase 51 commands verbatim, no new aggregate script):

| Gate | Command | Result |
|------|---------|--------|
| 404-matrix + Phase 38 suppression/no-double-send | `node --test test/privacy.test.mjs test/digest.test.mjs` | 36 pass / 0 fail / 0 skip |
| i18n EN+FR gate (incl. Plan 02 keys) | `npm run i18n:scan` | 0 dead, 0 stale, 0 pending, 0 unresolved |
| Zero new runtime dependencies | `node --test test/dependencies.test.mjs` | pass / fail 0 |
| Syntax gates | `node --check server.js && node --check src/pages/members.js` | clean |
| Full suite (~incl. new transparency suite) | `npm test` | **1152 tests: 1141 pass / 0 fail / 11 pre-existing skips** |

**Carried items:** none surfaced in this sweep — the two Phase 51 advisory CR items (inverted `permCreate` polarity in src/pages/settings.js, partial create gating) did not produce any red gate, so nothing to log beyond this note (REVIEW-DISPOSITION precedent; not patched here per Pitfall 5).

## Deviations from Plan

None — plan executed exactly as written. Task 2 is verification-only by design, hence 1 commit total (docs).

## Threat Model Compliance

- **T-52-06** (stale docs as security risk): every file:line citation re-verified against the live tree at doc time; the verify grep confirms both docs carry server.js citations and no deferred-requirement mention.
- **T-52-SC**: zero package installs; `test/dependencies.test.mjs` green in the sweep.

## Known Stubs

None.

## Verification

- Plan verify chain: citation grep pass (both docs carry server.js refs), TRN-deferred grep pass (0 matches), sweep chain exit 0.
- `npm test` 1141/0 with 11 pre-existing skips (unchanged from 52-01/52-02 baselines).

## Self-Check: PASSED

- Commit 19dc4a7 exists on main; both docs on disk carry the refreshed citations; SUMMARY present.
- All five sweep gates green in one pass (recorded above).
