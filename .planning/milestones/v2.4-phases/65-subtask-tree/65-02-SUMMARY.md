---
phase: 65
plan: 02
subsystem: subtask-tree
tags: [subtask-tree, funnel, wholesale-reject, cascade, rollup, tdd]
requires:
  - "65-01 — subtree.js helpers, normalizeSubtasks sink, Wave-0 test harness"
provides:
  - "src/core/subtree.js — MAX_SUBTASK_DEPTH, subtreeHeight, wouldExceedCap, validateMove, validateSubtree, cascadeDoneIds, rollupProgress"
  - "mergeClientDoc wholesale-reject gate (subtaskCycle/subtaskDepth, tx-atomic) + catch mapping + EN/FR err keys"
  - "D-13/D-14 cascade completion (toggleSub + applyPatch) and cascade delete (rmSub)"
  - "leaf-only rollup at store.js taskProg (delegate) and model.js taskProgress (deliberate local copy)"
affects: [65-03, 65-04, 65-05]
tech-stack:
  added: []
  patterns: [wholesale-reject tx-rollback (assignee-guard analog), changed-shape signature gate before the lazy heal, static-extraction wiring tests for DOM-coupled modules, deliberate import-free duplicate with equivalence test]
key-files:
  created: []
  modified:
    - src/core/subtree.js
    - server.js
    - src/actions/actions.js
    - src/core/store.js
    - src/export/model.js
    - src/locales/en.json
    - src/locales/fr.json
    - test/subtask-tree.test.mjs
    - test/export-model.test.mjs
    - test/i18n-core-features.test.mjs
decisions:
  - "funnel tree gate runs BEFORE the lazy heal: normalize re-roots self-parents, so a raw self-parenting PUT must be rejected (subtaskCycle) or it would silently normalize away — pre-heal validation is strictly the right gate because heal/splice can never create a cycle or add depth"
  - "gate validates only tasks whose serialized (id,parentId,position,done) signature changed vs stored — once per changed task, not per read (T-65-05 DoS bound)"
  - "validateSubtree (whole-array structural gate) added beside the plan-named validateMove: the funnel sees whole docs, not one move; validateMove stays the one-level restructure validator (client pre-check, tests)"
  - "cascade completion wired inside applyPatch's status:'done' branch — every task-completion surface (toggleDone, bulk complete, drag) cascades through one site; reopen branch cascades nothing (D-13)"
  - "store.js delegates to subtree.rollupProgress; model.js keeps its import-free local copy with the identical rule, equivalence-pinned by a test (per model.js discipline)"
metrics:
  duration: 14min
  completed: 2026-11-15
status: complete
requirements-completed: [SUB-02, SUB-03]
coverage:
  - "SUB-02 (server authority + cascades): validateSubtree/validateMove wholesale-reject codes at the funnel with tx rollback; one-level rule enforced structurally; rmSub kill-set removes whole subtrees. Restructure ACTIONS (promote/demote/re-parent popover entries) are 65-03 UI scope"
  - "SUB-03 (cascade + rollup): D-13/D-14 cascade completion at subtask and task level, no reopen cascade; leaf-only rollup at both duplicated sites with equivalence proof. Inline progress chips (task-list.js:66, board.js:18, timeline.js:124, drawer.js:104) still consume the flat ratio — 65-03/65-04 view work, noted outstanding"
actuals:
  tokens: 18000
  tasks: 3
  commits: 4
plan_head_before: 65e02fc55bb1a796fd6e51a37eca8abdf5b0f4af
plan_head_after: 5efcbf8
estimate:
  tokens: 120000
---

# Phase 65 Plan 02: Server Tree Authority — Reject Gate, Cascades, Leaf-Only Rollup Summary

**One-liner:** The server now owns tree legality — cycle/depth-violating restructures are rejected wholesale at the mergeClientDoc funnel with tx-atomic rollback and localized `subtaskCycle`/`subtaskDepth` codes — while completion cascades symmetrically at every level (D-14, reopen cascades nothing per D-13), deletion removes whole subtrees, and parent progress became a leaf-only rollup with zero double-counting at both duplicated definition sites.

## What Was Built

1. **Task 1 (TDD: RED → GREEN)** — `subtree.js` gained `MAX_SUBTASK_DEPTH = 5`, `subtreeHeight`, `wouldExceedCap`, `validateMove` (one-level restructure validator: cycle via ancestor-chain walk, depth via height + new root level), and `validateSubtree` (whole-array structural gate). `mergeClientDoc` runs a changed-shape gate (serialized `id/parentId/position/done` signature vs stored) BEFORE the lazy heal — critical because the heal re-roots self-parents, so a raw self-parenting PUT must reject or it would silently normalize away. Violations throw inside the tx; the assignee-guard catch gained sibling branches mapping both codes to `fail(res, 400, code)`; `err.subtaskCycle`/`err.subtaskDepth` landed in EN+FR the same commit. Funnel tests prove: self-parent → 400 `subtaskCycle` doc unchanged; depth-6 → 400 `subtaskDepth` doc unchanged; legal repeat-PUT stays byte-identical.
2. **Task 2 (TDD)** — `cascadeDoneIds(list, parentId)` in subtree.js (pure, visited-set safe; `null` root = whole task tree). `A.toggleSub` cascades on the complete branch only (D-14 symmetric at every level); reopen cascades nothing (D-13). Task-level completion cascades inside `applyPatch`'s `status:'done'` branch — one site covers every completion surface. `A.rmSub` kill-set = target ∪ `descendantsOf` (children follow parent). Wiring pinned by a static-extraction test (actions.js is DOM-coupled); behavior pinned by pure helper tests.
3. **Task 3 (TDD)** — `rollupProgress(t, statusProgress)` in subtree.js: leaves only (a subtask with descendants contributes nothing). `store.js taskProg` delegates to it; `model.js taskProgress` keeps its deliberate import-free local copy with the identical rule; the pre-existing store/model progress-parity test now reads 33 (not 40/60) on the nested fixture, and a new equivalence test pins model ≡ subtree rollup. Done short-circuit and STATUS_PROGRESS fallback unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Funnel gate placed before the lazy heal, not after**
- **Found during:** Task 1
- **Issue:** The plan said "after normalizeSubtasks runs, run the move validation" — but the heal re-roots self-parents (resolvability excludes self), so the plan's own funnel test (self-parent → 400 subtaskCycle) could never pass: the violation would silently normalize to a root subtask.
- **Fix:** validation runs on the incoming (pre-heal) shape for changed-shape tasks; the heal/splice can never create a cycle or add depth, so pre-heal is strictly the correct gate. A whole-array `validateSubtree` was added beside `validateMove` (the funnel sees whole docs, not a single move) — `validateMove` keeps its plan-specified signature and role.
- **Files modified:** src/core/subtree.js, server.js
- **Commit:** ebcdafa

**2. [Rule 3 - Blocking] i18n catalogue-size gate updated 1898 → 1900**
- **Found during:** Post-task full-suite run
- **Issue:** `test/i18n-core-features.test.mjs` pins the exact catalogue size; the two mandated err keys tripped it.
- **Fix:** bumped to 1900 with the house change-history annotation (+2 err.subtaskCycle/err.subtaskDepth, 65-02).
- **Files modified:** test/i18n-core-features.test.mjs
- **Commit:** 5efcbf8

Note (not a deviation): the pure cascade/rollup helper tests plus their subtree.js implementations landed with the Task 1 commit (ebcdafa) since Task 1 already touched those files; Task 2's commit (765b800) covers the actions wiring and its static-extraction pin.

## Verification Results

- `node --test test/subtask-tree.test.mjs test/error-codes.test.mjs test/export-model.test.mjs` → 97/97 pass
- Full `npm test` → 1568 tests, 1556 pass, 0 fail, 12 skipped (baseline 1536 — grown, never shrunk)
- `npm run build` green (bundle includes subtree.js consumers; chunk gate untripped)
- Plan `<verification>` items: reject → 400 + unchanged doc (funnel tests); legal repeat → identical; parent done → descendants done, reopen untouched, rmSub → subtree gone (pure + wiring tests); rollup leaf-only/no double-count with both copies equivalent (equivalence + parity tests)

## Known Stubs

None. Outstanding (planned, not stubs): inline progress chips at task-list.js:66, board.js:18, timeline.js:124, drawer.js:104 still consume the flat ratio — 65-03/65-04 view work per the plan's explicit "Do NOT touch the inline progress chips yet".

## Self-Check: PASSED

- Files exist: subtree.js/server.js/actions.js/store.js/model.js/en.json/fr.json + the three test files — verified on disk via the verification greps above
- Commits exist: ebcdafa, 765b800, f21c50c, 5efcbf8 — `git rev-list --count 65e02fc..HEAD` → 4
- All acceptance criteria re-run: catch branches present (grep → 3 hits), EN+FR keys non-empty (2 each), funnel cases in test file, cascadeDoneIds consumed by toggleSub + applyPatch, rmSub kill-set, store delegation, model local copy, fixture 1-done-root+2-open-leaves → 0, done → 100, fallback preserved
- Zero new npm dependencies (standing constraint held)

*Phase: 65-Subtask Tree · Plan 02 of 04 (wave 2)*
