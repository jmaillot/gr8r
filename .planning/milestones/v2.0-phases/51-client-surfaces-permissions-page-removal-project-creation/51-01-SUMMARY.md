---
phase: 51-client-surfaces-permissions-page-removal-project-creation
plan: 01
subsystem: permissions
tags: [permissions, doc-sync, permCreate, lead-role, share-modal, authority-matrix]
requires: [Phase 49 visibility collapse, Phase 50 mergeClientDoc pinning, lead-aware canManageProject]
provides: [permCreate server enforcement (keyed projectCreateForbidden refusal), server-enforced lead-on-create, share-modal two-state private toggle with optimistic revert, authority-matrix + project-creation + team-link test suites]
affects: [51-02 (create affordance gating), 51-03 (permCreate relocation), Phase 52 transparency]
tech-stack:
  added: []
  patterns: [scoped keyed refusal on the 200 doc-PUT response, stored-prefs-only enforcement read, server-side creator-as-lead grant]
key-files:
  created:
    - test/client-surfaces.test.mjs
    - test/project-creation.test.mjs
    - .planning/phases/51-client-surfaces-permissions-page-removal-project-creation/51-01-tdd-red-evidence.json
  modified:
    - server.js
    - src/overlays/modals.js
    - src/actions/actions.js
    - test/visibility-team.test.mjs
    - test/privacy.test.mjs
key-decisions:
  - "Keyed create-refusal rides the 200 doc-PUT response as `refused: [{code:'projectCreateForbidden', project}]` — a whole-PUT 403 would break unrelated concurrent edits (Pitfall 1); Wave 2 maps the key to a toast without transport changes"
  - "permCreate restriction semantics: stored prefs.permCreate === true means RESTRICTED (phase-wide convention, confirmed by 51-02-PLAN); note the legacy settings toggle polarity (permCreate !== false = 'members can create') differs — 51-03's relocation must align it"
  - "Creator-as-lead (D-51-17) superseded the privacy-test custodian model: a member's new private project now has the creator as lead+member instead of an owner-injected custodian, so the creator can see their own project"
requirements-completed: [CRT-01, VIS-01]
duration: 19 min
completed: 2026-11-08T11:24:17Z
commits: 5
plan_head_before: 7254a2a2c1eb908af34adff53377ccc2a05727d0
plan_head_after: d6c4432
estimate:
  tokens: 70000
actuals:
  tokens: 109500
  tasks: 3
  commits: 5
status: complete
---

# Phase 51 Plan 01: Toggle tracer, permCreate enforcement & lead-on-create Summary

**One-liner:** Share-modal private toggle made real end-to-end (two-state control, optimistic revert, doc-sync only) plus the two missing server capabilities — stored-prefs-only `permCreate` enforcement with a scoped keyed `projectCreateForbidden` refusal, and server-enforced creator-as-lead — pinned by 13 new authority-matrix/project-creation/team-link tests; full suite 1119 pass / 0 fail.

## Accomplishments

- **Task 1 (tracer):** Authority-matrix suite `test/client-surfaces.test.mjs` (owner ✓ / admin ✓ / non-admin lead ✓ / member ✗ × private toggle), each cell asserting the STORED doc after a doc PUT; the end-to-end lead path (m_plain leads p_membershare, flips private both directions, persists). Client slice: `shareAccess` select replaced in place by a two-state checkbox toggle reusing `modal.onlyInvited`/`modal.everyoneAt` (D-51-1/2, no new key); `IN.shareAccess` now snapshots before mutate, flips optimistically, settles via `pushNow()`, and on refusal restores the snapshot with a localized error toast (D-51-3). No REST route touched.
- **Task 2 (TDD):** RED (4 intentional failures on target assertions, evidence recorded) → GREEN in `mergeClientDoc`: restriction read ONLY from the stored doc's `prefs.permCreate` per request (D-51-16, Pitfall 3); below-admin actor introducing an unseen project id → keyed `projectCreateForbidden` refusal that rides the 200 response while the rest of the PUT merges (Pitfall 1); refused creates leave no orphans (project/tasks/comments/projOrder dropped); member-created projects get `lead = creator` enforced server-side (D-51-17); member PUTs can never rewrite the stored pref (T-51-01); logInfo audit per refusal (V7).
- **Task 3:** `test/visibility-team.test.mjs` extended with the Wave 2 write-side cells: owner/lead team-link PUTs persist, member PUT removing `p.teams` pinned (whole-team revocation guard); unlinking the ONLY team from a private project keeps it private with a manager (Pitfall 6); a doc-sync-written team link grants a current team member on the next read (3-term predicate regression guard).

## TDD Cycle (Task 2)

- **RED:** `test/project-creation.test.mjs` — 4/5 tests failed intentionally on the planned behaviors (lead-on-create, keyed refusal, stored-pref pinning, immediacy). Evidence: `51-01-tdd-red-evidence.json` (validated `RED_EVIDENCE_OK` by the executor — `gsd_run` CLI unavailable in this environment, so `gsd_run check tdd-red-evidence` could not run; all 5 tests discovered, every failure an AssertionError on a planned behavior). Commit `test(51-01)`.
- **GREEN:** mergeClientDoc guard + lead grant + prefs pinning + route refusal channel. Commit `feat(51-01)`.
- **REFACTOR:** none needed — implementation landed minimal with rationale comments; no refactor commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Icon-baseline regression from the toggle markup**
- **Found during:** full-suite verification (after Task 3)
- **Issue:** the new markup carried the quoted literal `'pointer'` (cursor style); `scripts/icons.mjs lucideIconNames` matches ANY quoted lowercase token that names a lucide icon, so the frozen pre-phase icon baseline test (build-locales) failed on the new `pointer` entry.
- **Fix:** dropped the cursor style from the toggle label (no behavior loss).
- **Files modified:** src/overlays/modals.js
- **Commit:** d6c4432

**2. [Rule 1 - Plan-mandated model change] privacy.test.mjs custodian pin superseded by D-51-17**
- **Found during:** full-suite verification (after Task 2)
- **Issue:** `test/privacy.test.mjs` pinned the old model — Bob's newly created private project received the workspace owner as injected custodian and Bob could not see it. The lead-on-create grant (a plan must_have) makes Bob the lead+member, so normalizeProjects no longer injects a custodian and Bob legitimately sees his own project. Verified non-pre-existing via a temp worktree at the pre-change commit (16/16 pass before the change).
- **Fix:** updated the two pinned assertions to the D-51-17 model (creator is lead; creator sees the project they created).
- **Files modified:** test/privacy.test.mjs
- **Commit:** d6c4432

**Total deviations:** 2 auto-fixed (2× Rule 1). **Impact:** none on plan scope — both are direct consequences of the shipped behaviors; the full suite is green.

## Verification

- `node --test --test-concurrency=2 test/client-surfaces.test.mjs test/project-creation.test.mjs test/visibility-team.test.mjs` — 18 pass / 0 fail
- `npm test` full suite — **1130 tests, 1119 pass, 0 fail, 11 skips** (Phase 50 exit baseline: 1106 pass / 11 skips; +13 new tests)
- `grep -n projectCreateForbidden server.js` — guard live at server.js:1061 (refusal), :4686 (response channel)

## Coverage

- deliverable: authority matrix (owner/admin/lead/member × toggle)
  verification: [{ kind: tests, ref: "test/client-surfaces.test.mjs", status: pass }]
  human_judgment: false
- deliverable: two-state toggle replaces the select in place with optimistic revert
  verification: [{ kind: command, ref: "node --check src/overlays/modals.js && node --check src/actions/actions.js", status: pass }]
  human_judgment: true
  rationale: the SPA toggle rendering and revert-toast UX are client-side only (no browser harness in this repo); visual behavior needs human spot-check in the running app
- deliverable: permCreate enforcement (stored-only read, immediacy, scoped keyed refusal)
  verification: [{ kind: tests, ref: "test/project-creation.test.mjs", status: pass }]
  human_judgment: false
- deliverable: member-created project carries creator as lead
  verification: [{ kind: tests, ref: "test/project-creation.test.mjs#restriction OFF", status: pass }, { kind: tests, ref: "test/privacy.test.mjs", status: pass }]
  human_judgment: false
- deliverable: team-link write invariants (manager gating, unlink, live-link)
  verification: [{ kind: tests, ref: "test/visibility-team.test.mjs", status: pass }]
  human_judgment: false

## Known Stubs

None.

## Authentication Gates

None.

**Next:** Ready for 51-02 (create affordance gating + Teams section + not-found surfaces ride these proven semantics).
