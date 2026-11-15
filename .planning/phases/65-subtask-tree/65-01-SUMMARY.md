---
phase: 65
plan: 01
subsystem: subtask-tree
tags: [subtask-tree, funnel, normalize, tracer]
requires: []
provides:
  - "src/core/subtree.js — shared DOM-free tree module (normalizeTaskSubtasks, orderedSiblings, nextPosition, depthOf, descendantsOf, buildTree)"
  - "mergeClientDoc subtask-tree whitelist sink + read-side heal (normalizeDoc)"
  - "Wave-0 test harness test/subtask-tree.test.mjs"
affects: [65-02, 65-03, 65-04, 65-05]
tech-stack:
  added: []
  patterns: [D-53-1 normalize-sink funnel pattern, in-place mutation whitelist discipline, DOM-free import-free shared module (model.js discipline)]
key-files:
  created:
    - src/core/subtree.js
    - test/subtask-tree.test.mjs
  modified:
    - server.js
    - src/actions/actions.js
decisions:
  - "server.js imports src/core/subtree.js directly (ESM) — no byte-equal copy, one-definition rule honored"
  - "Read-side heal hooked in normalizeDoc alone (docForClient delegates to it) — single hook covers both read paths"
  - "Number.isSafeInteger as the position validity check (stricter than plan's Number.isInteger; same D-03 heal rule)"
  - "normalize resolvability check compares x !== s so a self-referencing id cannot satisfy its own parentId"
metrics:
  duration: 302s
  completed: 2026-11-15
status: complete
requirements-completed: [SUB-01, SUB-02, SUB-04]
coverage:
  - "SUB-01 (partial, storage/ordering foundation): orderedSiblings (position, arrayIndex) comparator pinned by tests; render surfaces are 65-03/65-04 scope"
  - "SUB-02 (partial, normalize foundation): crafted cross-task parentId heals to null at the funnel (T-65-02 test); cycle/depth reject codes are 65-02 scope"
  - "SUB-04 (partial, funnel half proven): mergeClientDoc round-trip preserves id/parentId/position; FTS/export/MCP parity extensions are 65-05 scope"
actuals:
  tokens: 5250
  tasks: 3
  commits: 3
plan_head_before: b907a41faf1311d9cef24f703dce33b2bbfc807c
plan_head_after: 5e6a9b95326183880890c60e0c551bfb5f321d90
estimate:
  tokens: 95000
---

# Phase 65 Plan 01: Subtask Tree Storage Shape Tracer Summary

**One-liner:** Proved the D-01/D-03 flat subtask-tree storage shape end-to-end — `{ id, parentId, position }` round-trips byte-identical through the mergeClientDoc whitelist sink, legacy docs heal lazily, crafted cross-task linkage never persists — with the shared DOM-free `subtree.js` module and the Wave-0 test harness all later plans extend.

## What Was Built

1. **Task 1 (tracer, RED first)** — `test/subtask-tree.test.mjs`: house `node:test` + `assert/strict` harness covering the normalize heal (legacy flat → `parentId:null`/array-index position, junk entries spliced, dangling/cross-task `parentId` → null, id factory injection, non-array subtasks ignored), the ordering helpers (plain `(position, arrayIndex)` comparator — never localeCompare), and four real-server funnel cases (two-level tree PUT→GET byte-identical, legacy heal on read, crafted cross-task `parentId` heals, repeat-PUT idempotency). Comment sections reserve space for 65-02 (cascade/rollup, validation codes) and 65-05 (FTS/export/MCP).
2. **Task 2** — `src/core/subtree.js` (149 lines, zero imports, zero DOM, named exports only): `normalizeTaskSubtasks` (in-place D-01a/D-03 heal — the whitelist-trap discipline from research Pitfall 1), `orderedSiblings`, `nextPosition`, `depthOf`, `descendantsOf` (visited-set cycle-safe), `buildTree`. No cycle/depth validation — explicitly 65-02's scope.
3. **Task 3** — `server.js` imports `normalizeTaskSubtasks` from the shared module (server.js is ESM and already imports `src/`), adds `normalizeSubtasksData` beside `normalizeAssigneesData`, and hooks it into `mergeClientDoc` (right after the assignee sink, before perm gates) and `normalizeDoc` (read side — `docForClient` delegates to it, so both read paths are covered by the single hook). `src/actions/actions.js` `KEY.addSub` now births `{ id, parentId: null, position: nextPosition(t.subtasks, null), title, done }`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Refinement] Resolvability check excludes self + Number.isSafeInteger**
- **Found during:** Task 2
- **Issue:** The research sketch's `s.parentId !== null && !t.subtasks.some(x => x?.id === s.parentId)` would let a self-referencing entry satisfy its own parentId (an unvalidated 1-cycle surviving normalization into 65-02), and the plan text's `Number.isInteger` would accept `-0`/huge integers as valid positions.
- **Fix:** resolvability requires a *different* entry (`x !== s`) matching the parentId; position validity is `Number.isSafeInteger`. Same D-03 heal rule, tighter edge cases.
- **Files modified:** src/core/subtree.js
- **Commit:** bae3b12

Note (not a deviation, plan-conformant): the plan's `uid('s')` id scheme is client-side (`src/core/utils.js uid`); the server's existing `uid()` (randomUUID) is passed as the heal factory — scheme unchanged per D-02.

## Verification Results

- `node --test test/subtask-tree.test.mjs test/client-surfaces.test.mjs` → 20/20 pass, 0 fail (includes the tracer's round-trip, heal, cross-task and idempotency cases; client-surfaces unregressed)
- Full `npm test` → 1548 tests, 1536 pass, 0 fail, 12 skipped (baseline was 1524 passing — grown, never shrunk)
- Plan `<verification>` items all proven on a real spawned server: two-level tree PUT → read-back identical; legacy flat doc reads back `parentId:null` + positional index; crafted cross-task `parentId` → null

## Known Stubs

None — no placeholder logic shipped. The comment-only test sections reserved for 65-02/65-05 are documented placeholders for later plans, not stubs of this plan's goal.

## Tracer Feedback Gate

HUMAN_VERIFY_MODE is `end-of-phase` and the tracer `<verify>` is automated-only → re-ran end-to-end after Task 3: all 20 cases green, full suite green. **⚡ Tracer verified end-to-end — expanding.**

## Self-Check: PASSED

- Files exist: src/core/subtree.js (149 lines), test/subtask-tree.test.mjs (222 lines), server.js/src/actions/actions.js modified — verified on disk
- Commits exist: 3d28f6b, bae3b12, 5e6a9b9 via `git log b907a41..HEAD`
- Zero new npm dependencies (standing constraint held)
- Acceptance criteria re-run: `grep -c "^import" src/core/subtree.js` → 0; named exports present; funnel hook before perm gates; addSub shape conforms

*Phase: 65-Subtask Tree · Plan 01 of 04 (wave 1)*
