---
phase: 51-client-surfaces-permissions-page-removal-project-creation
plan: 04
subsystem: docs
tags: [doc-sync, lead-role, permCreate, permissions-teardown, evidence-sweep, phase-close]
requires: [51-01 server permCreate enforcement + lead-on-create, 51-02 share-modal surfaces, 51-03 Permissions-page teardown]
provides: [Domain docs (ProjectPermissions.md, WorkspacePermissions.md) rewritten to the shipped Phase 51 model, per-criterion evidence record for all five Phase 51 success criteria]
affects: [Phase 52 transparency (docs state the final model verify-work will check), /gsd-verify-work 51]
tech-stack:
  added: []
  patterns: [D-NN-tagged doc supersessions mirroring shipped predicates file:line, per-criterion evidence sweep (Phase 49/50 close pattern)]
key-files:
  created: []
  modified:
    - docs/ProjectPermissions.md
    - docs/WorkspacePermissions.md
key-decisions:
  - "Docs cite only facts verified in the live tree at execution time (shareAccess checkbox at modals.js:286, shareTeamInvite/Remove at actions.js:1737/1756, canManageProject at server.js:820-823, keyed refusal at server.js:1061/4686, permCreate row at settings.js:299, permsTable on Members at members.js:56/100, stateNotFound at errors.js:16/project.js:42) — no line numbers carried over from pre-phase plans"
  - "Corrected two now-false forward references while rewriting: the 'future private-at-creation toggle' sentence in ProjectPermissions §4 (shipped in the share modal per D-51-1, not in projectModal) and WorkspacePermissions §3's 'client-side removal planned for Phase 51' (the invite-modal guest checkbox still exists at modals.js:326 as a viewer-label role shortcut)"
requirements-completed: [UX-01]
duration: 16 min
completed: 2026-11-08T12:48:00Z
commits: 2
plan_head_before: 3f2f8f8584b456f8ad0e3a311fd956ca5c5b3c6f
estimate:
  tokens: 40000
actuals:
  tokens: 6200
  tasks: 2
  commits: 2
status: complete
---

# Phase 51 Plan 04: Phase close — domain docs to shipped model & success-criteria evidence sweep Summary

**Both permission domain docs rewritten to the shipped Phase 51 model (two-state share-modal toggle with optimistic revert, Teams section with live semantics and Member-level invites, the D-51-17 lead role mirroring `canManageProject`, permCreate as a real server-enforced setting, Permissions page removed end-to-end) with D-NN-tagged supersessions and file:line references verified against the live tree; all five roadmap success criteria individually evidenced; full suite 1130 pass / 0 fail / 11 documented skips and i18n gate fully clean.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-11-08T12:31:45Z
- **Completed:** 2026-11-08T12:48:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- **Task 1:** ProjectPermissions.md — §3 rewritten to the two-state checkbox toggle (D-51-1/2/3: reuses `modal.onlyInvited`/`modal.everyoneAt`, `canManage`-gated, optimistic flip via `IN.shareAccess` with snapshot revert, doc-sync only); new §3bis for the share-modal Teams section (D-51-5..9: invite list excluding linked teams, linked-note with remove, team invite = Member role with individual-invite precedence, live-semantics copy per D-50-5/D-51-8); new §4bis-equivalent lead-role content (D-51-17: creator becomes lead via server-side `mergeClientDoc` grant, manage = admin/owner ∨ lead mirroring `canManageProject` server.js:820-823, workspace roles still outrank, partially supersedes D-50-1); §4 rewritten for the shipped creation story (default-open, `permCreate` real server enforcement with keyed `projectCreateForbidden` refusal riding the 200 PUT, disabled-with-tooltip client affordance, refusal toast + revert); honest not-found documented (D-51-4, `S.ui.lostProjects` → `stateNotFound`); récapitulatif table updated row-by-row.
  WorkspacePermissions.md — §5 rewritten as "état actuel (Phase 51)": page removed end-to-end (D-51-10..13) with stale `?sec=` deep-link fallback, `permCreate` relocated to General under the phase-wide `=== true` polarity with its new real server effect, role table on the Members page, the two deleted toggles documented as superseded (per-project `p.allowInviteGuests`) / dead (no public-share-link concept) **without naming the deleted keys anywhere in the file**; §4 relocated-table note; §3 corrected (guest checkbox still exists client-side as a role shortcut); §6 interface note updated to shipped surfaces.
- **Task 2:** Evidence sweep (below) + phase gates green.

## Success-Criteria Evidence (Phase 51 — one entry per roadmap criterion)

**Criterion 1 — single toggle flip, member lists change, honest not-found.**
Toggle: server-enforced end-to-end authority matrix (owner ✓ / admin ✓ / non-admin lead ✓ / member ✗ × private toggle, stored-doc assertions) and lead flip persistence in `test/client-surfaces.test.mjs` (51-01). Member lists: `test/visibility-team.test.mjs` read/write cells + the three-term predicate regression guard (51-01). Honest not-found: `test/client-surfaces.test.mjs#applyDoc records the visibility epoch` + `#admin privatizes p_open → member's served doc no longer carries it` (51-02). All pass in today's full-suite run (1130/0/11).

**Criterion 2 — share-modal team invite with live-semantics copy.**
Teams section markup in `src/overlays/modals.js:210-250` (invite list excluding linked teams, linked-note with remove, `canManage`-gated); copy carries the D-50-5 live semantics ("access follows team membership"), which **supersedes the roadmap's original "snapshot semantics" wording per D-51-8** (recorded in 51-CONTEXT). Write side: `test/client-surfaces.test.mjs#lead links then unlinks a team via doc-sync` + the whole-team-revocation guard and live-link cells in `test/visibility-team.test.mjs` — all pass.

**Criterion 3 — Permissions page removed end-to-end, no orphans.**
51-03 greps: `grep -rn "permGuests\|permPublic\|settings.nav.permissions" src/` → no matches; the removed-key leak assertions in `test/catalogue.test.mjs` (27 pass, including both catalogues); the dead-key detector (`0 dead` in `npm run i18n:scan`) now gates any future orphan; nav/case/toggles/keys all deleted with `permCreate` → General and `permsTable` → Members (D-51-10..13). Re-verified today: the two deleted keys appear nowhere in either domain doc.

**Criterion 4 — default-open creation with lead; restriction refused server-side + honest affordance.**
Default-open + creator-as-lead: `test/project-creation.test.mjs` (restriction OFF path, lead-on-create, stored-pref pinning, immediacy) and the D-51-17-updated custodian cells in `test/privacy.test.mjs` (creator sees the private project they created) — pass. Restricted mode: keyed `projectCreateForbidden` refusal rides the 200 PUT (`test/project-creation.test.mjs#restriction ON refused with projectCreateForbidden`); client affordance is disabled-with-tooltip, never hidden (D-51-14 — **the criterion's original "sees no create affordance" wording was refined to disabled-with-tooltip by D-51-14 during planning**, src/pages/projects.js:30-32), refusal toast + optimistic-insert revert (actions.js:1605-1622).

**Criterion 5 — i18n gate EN+FR with dead-key check.**
`npm run i18n:scan` today: 0 literals, 0 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch, **0 dead** — the dead-key detector (51-03) is inside the exit-code contract; catalogue-contract and removed-key cells in `test/catalogue.test.mjs` / `test/i18n-core-features.test.mjs` pass (catalogue pinned at 1701 keys).

**Milestone invariants (phase gate):** `npm test` → 1141 tests, **1130 pass, 0 fail, 11 skips** (the documented pre-existing baseline); `git diff HEAD~1..HEAD -- package.json package-lock.json` → empty (zero new runtime dependencies); this plan's diff touches docs only — server.js/src/ untouched, so the Phase 38 suppression + no-double-send invariants stand unmodified (their pinning tests pass in the suite above).

## Task Commits

1. **Task 1: Domain docs to the shipped model** - `269826a` (docs)
2. **Task 2: Success-criteria evidence sweep + full-suite gate** - this SUMMARY commit (evidence-only; no code files)

**Plan metadata:** `docs(51-04): complete plan`

## Files Created/Modified

- `docs/ProjectPermissions.md` — shipped toggle/Teams/lead/permCreate model with verified file:line refs
- `docs/WorkspacePermissions.md` — Permissions-page removal documented; permCreate relocation; deleted toggles superseded

## Decisions Made

- Verified every cited line number in the live tree before writing (no line refs carried over from pre-phase plans — several had drifted, e.g. `canManageProject` is server.js:820 not :776).
- Documented the two deleted settings toggles descriptively without naming their keys, so the docs themselves satisfy the same no-dead-key leak bar the i18n gate enforces on the catalogue.

## Deviations from Plan

**1. [Rule 1 - Doc-drift fix] Two forward references had become false with the phase shipped**
- **Found during:** Task 1
- **Issue:** ProjectPermissions §4 still described a *future* "toggle privé/public à la création dans projectModal" (shipped instead in the share modal per D-51-1), and WorkspacePermissions §3 claimed the invite-modal guest toggle's "client-side removal is planned for Phase 51" (the checkbox still exists at modals.js:326 as a viewer-label role shortcut).
- **Fix:** both rewritten to the shipped reality with D-tags (D-51-1; D-50-10 + shipped-surface note).
- **Files modified:** docs/ProjectPermissions.md, docs/WorkspacePermissions.md
- **Verification:** code greps (modals.js:286/326) confirm the documented state
- **Committed in:** 269826a

**Total deviations:** 1 auto-fixed (1× Rule 1). **Impact:** none on plan scope — doc accuracy is the deliverable.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Phase 51 complete (4/4 plans)** — tree ready for `/gsd-verify-work 51`: docs match shipped code, all five criteria evidenced, full suite + i18n gate green.
- Phase 52 (transparency view) inherits: the lead role (D-51-17), the three-term live predicate, and the permCreate enforcement model are now documented as the final Phase 51 state the transparency view must read.

---
*Phase: 51-client-surfaces-permissions-page-removal-project-creation*
*Completed: 2026-11-08*

## Self-Check: PASSED

- `docs/ProjectPermissions.md` and `docs/WorkspacePermissions.md` exist on disk with the updates; commit `269826a` verified in history.
- Plan-level verification re-run: `npm test` 1130 pass / 0 fail / 11 skips; `npm run i18n:scan` all families 0; docs grep gate clean (no deleted-key strings; D-51-17 referenced 7× in ProjectPermissions.md).
