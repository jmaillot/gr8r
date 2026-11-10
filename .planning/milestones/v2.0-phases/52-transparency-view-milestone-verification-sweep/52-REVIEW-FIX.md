---
phase: 52-transparency-view-milestone-verification-sweep
fixed_at: 2026-11-08T12:00:00Z
review_path: .planning/phases/52-transparency-view-milestone-verification-sweep/52-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 52: Code Review Fix Report

**Fixed at:** 2026-11-08T12:00:00Z
**Source review:** .planning/phases/52-transparency-view-milestone-verification-sweep/52-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (Critical: 0, Warning: 3 — Info findings IN-01/IN-02 out of scope)
- Fixed: 3
- Skipped: 0

## Verification

- Tier 1 (re-read): all three modified sections re-read after each edit; fix text present, surrounding code intact.
- Tier 2 (syntax): files are ESM (`"type": "module"`) — `node --check` is unreliable for ESM `.js`, so syntax was exercised via module import during the test run (no parse errors).
- Tests: `node --test test/transparency.test.mjs test/client-surfaces.test.mjs test/i18n-actions-modules.test.mjs` — **32 tests, 32 pass, 0 fail** (run in the **main checkout**, since `workflow.use_worktrees=false`). Run twice: once after WR-01+WR-02 edits, once after all three commits against the final state.
- Full test suite not run between fixes per fixer policy; left for the verifier phase.

## Fixed Issues

### WR-01: Error-path fetch result adopted without the stale-guard re-check

**Files modified:** `src/actions/actions.js`
**Commit:** 480c063
**Applied fix:** Added `if (S.ui.memberVisibility !== id) return;` to the error path after the 401 check, mirroring the success-path in-flight stale-guard, so a slow failing request can no longer overwrite a panel that was closed or re-targeted while in flight.

### WR-02: Early return on missing `userId` leaves the panel stuck in the loading state

**Files modified:** `src/actions/actions.js`
**Commit:** e1f92a8
**Applied fix:** The `if (!m?.userId) return;` early return now resets `S.ui.memberVisibility = null` and sets `S.ui.memberVisibilityData = { err: true }` before `render()`, so a mid-session roster change can never strand the panel in the loading state.

### WR-03: Stale expansion survives navigation — panel re-shows cached data on return

**Files modified:** `src/shell/render.js`
**Commit:** a2d5731
**Applied fix:** Added `S.ui.memberVisibility = null; S.ui.memberVisibilityData = null;` to `go()`'s transient per-surface reset block (after `editCell`), so returning to Members always re-opens with a fresh fetch per D-52-3, instead of re-presenting the previous fetch's access data.

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-11-08T12:00:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
