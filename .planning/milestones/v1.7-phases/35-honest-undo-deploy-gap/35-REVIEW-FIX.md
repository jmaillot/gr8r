---
phase: 35-honest-undo-deploy-gap
fixed_at: 2026-11-04T00:00:00Z
review_path: .planning/phases/35-honest-undo-deploy-gap/35-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 35: Code Review Fix Report

**Fixed at:** 2026-11-04
**Source review:** .planning/phases/35-honest-undo-deploy-gap/35-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

Note: `workflow.use_worktrees` is `false` in `.planning/config.json`, so all edits and commits were made in the main checkout (no worktree, no temp branch, no recovery sentinel).

## Fixed Issues

### WR-01: pushNow() wait loop is unbounded polling with no failure exit or user feedback

**Files modified:** `src/core/store.js`
**Commit:** 9f16914
**Applied fix:** Bounded the `while (pushing)` wait loop with a 5s deadline (`Date.now() + 5000`, consistent with the ~5s toast window). On timeout, `pushNow()` returns `{ ok: false, status: 0 }` — the same shape as the disabled/conflict guard above — so the undo gate's error toast fires honestly instead of the click handler parking forever. Loop still matches the store.js WR-02 pin's `/while \(pushing\)/` assertion. Classified "fixed: requires human verification" is not needed — the control flow is a straight deadline check, verified by the existing pin suite.

### WR-02: the undo gate uses `pushed.ok === false`, which misses an ok-less result shape

**Files modified:** `src/actions/teams.js`, `test/undo-membership.test.mjs`
**Commit:** 4d5fab5
**Applied fix:** Both the early-return gate (teams.js:188) and the post-loop combined check (teams.js:205) now use truthy `!pushed.ok`, failing closed on any ok-less result shape. The WR-01 source-scan pin in `test/undo-membership.test.mjs` now locates the gate via `/!pushed\.ok|pushed\.ok === false/` (accepts either form) and the post-loop regex was updated to `!pushed\.ok \|\| results\.some(...)`. Gate ordering (between `pushNow()` and the `Promise.all` PUT block) and all D-06 invariants unchanged — pin suite passes.

### WR-03: source-scan pins slice to end-of-file, over-scoping their assertions

**Files modified:** `test/undo-membership.test.mjs`
**Commit:** 8553ab6
**Applied fix:** Added an `onActionSlice(src)` helper performing a balanced-brace scan from `onAction: async () => {`'s opening brace, mirroring the bounding discipline of store.js's WR-02 pin (`src.indexOf('export ', ...)`). Both the D-06 pin and the WR-01 pin now run their assertions — including "exactly one `setMemberTeams` call site" — against the closure-bounded slice instead of the end-of-file remainder. The brace scan is sound here: no brace characters appear in string literals or comments in this closure body.

## Verification

- Targeted: `node --test test/undo-membership.test.mjs` — 7 pass / 0 fail (run after each fix).
- Full suite: `npm test` — 896 pass / 0 fail / 3 skipped (matches the stated baseline).
- Syntax checks: `node -c` on each modified file passed.
- All verification ran in the **main checkout** (worktrees disabled by config).

## Skipped Issues

None — all in-scope findings were fixed. Info findings IN-01, IN-02, IN-03 were left untouched per the fix scope.

---

_Fixed: 2026-11-04_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
