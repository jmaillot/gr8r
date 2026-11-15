---
phase: 65-subtask-tree
plan: 04
subsystem: subtask-tree-ux
tags: [subtasks, context-menu, search, e2e, chunk-gate]
requires: [65-01 subtree helpers, 65-02 validateMove/validateSubtree, 65-03 tree renderer]
provides: [A.moveSubUp/A.moveSubDown/A.reparentSub(+reparentSubTo), per-subtask context menu, re-parent picker popover, server subtaskMatch search field, client via-subtask hint, e2e/subtask-tree.spec.mjs]
affects: [65-05 (folds subtask titles into the FTS index — subtaskMatch precision improves), search palette consumers]
tech-stack:
  added: []
  patterns: [pre-warmed lazy chunk behind a registry (treeChecklist/subPop — 61-02/65-03 remedy precedent), folded-substring attribution fallback in the search handler]
key-files:
  created:
    - src/features/subtask-move.js
    - src/features/subtask-popovers.js
    - e2e/subtask-tree.spec.mjs
  modified:
    - src/actions/subtasks.js
    - src/actions/events.js
    - src/actions/actions.js
    - src/features/subtasks.js
    - src/features/subtask-detail.js
    - src/overlays/context-menu.js
    - src/overlays/popovers.js
    - src/overlays/drawer.js
    - src/components/task-list.js
    - src/pages/search.js
    - server.js
    - src/locales/en.json
    - src/locales/fr.json
    - test/fixtures/icons-baseline.json
    - test/search-fts.test.mjs
    - test/i18n-core-features.test.mjs
    - test/i18n-shell.test.mjs
    - test/i18n-toast.test.mjs
decisions:
  - "Re-parent targets are the moved subtask's SIBLINGS only (minus itself) — a deterministic one-level set that cannot cycle; depth legality stays validateMove's call"
  - "subtaskMatch attribution = folded substring scan over the hit task's own subtask titles in the search handler (FTS row text is one blob, not dissectible); precision improves when 65-05 folds titles into the index"
  - "Chunk-gate remedy: restructure actions + recursive renderer + subtask popovers moved to two pre-warmed lazy chunks behind treeChecklist/subPop registries (61-02/65-03 precedent) — entry chunk back under 500 kB"
metrics:
  duration: 47m
  completed: 2026-11-15
status: complete
commits: 3
plan_head_before: 7419f5013cbd6041e48ddf0dc799fff7ab694777
plan_head_after: a43a8c7
actuals:
  tokens: 68000
  tasks: 3
  commits: 3
requirements-completed: [SUB-01, SUB-02]
coverage:
  SUB-01: "e2e/subtask-tree.spec.mjs — list indented carets, drawer checklist order, board badge + popover checklist"
  SUB-02: "src/features/subtask-move.js one-level actions; e2e proves legal demote round-trip and the err.subtaskDepth wholesale reject"
---

# Phase 65 Plan 04: Restructure UX, search hint, e2e spec Summary

One-level subtask restructure (promote/demote/re-parent) through per-subtask context menus with client pre-check + server authority, subtask-title search hits surface the parent task with a "via subtask:" hint, and a 5-scenario e2e spec pins the whole tree UX path (120/120 gate).

## What Was Built

- **Task 1 — Restructure actions + context menus:** `A.moveSubUp` (promote one level), `A.moveSubDown` (demote under the previous sibling), `A.reparentSub`/`A.reparentSubTo` (sibling-picker re-parent) in the pre-warmed lazy chunk `src/features/subtask-move.js`. Every action runs `subtree.validateMove` as a CLIENT pre-check (UX only — D-05; the server funnel re-validates and the e2e illegal-move scenario proves the reject path), then mutates ONLY the moved node's `parentId`/`position` (D-03 one-node diff). Illegal moves mutate nothing and toast `err.subtaskCycle`/`err.subtaskDepth`. New `ctx === 'sub'` branch in context-menu.js (impossible moves are absent, not disabled), sid plumbing through the global contextmenu handler and `A.ctxBtn`, a ctx button on the drawer subtask detail, and the `subParent` picker popover. `A.promoteSub` (convert-to-task) untouched. Activity verbs `promotedASubtaskOf`/`demotedASubtaskOf`/`movedASubtaskOf` + extra kind `subtaskMoved` (renders via the existing `act.extra.quoted` key).
- **Task 2 — Search subtask-hint:** the `/api/workspaces/:ws/search` handler folds the hit task's subtask titles with the same `foldForSearch` the index uses and attaches the first matching title as a plain `subtaskMatch` string; absent on plain hits (unit-tested). `src/pages/search.js` server rows render a faint "via subtask:" label + `hl()`-highlighted matched title; the row keeps `data-a="openTask"` — the parent drawer, never a deep-link (D-07).
- **Task 3 — e2e spec:** `e2e/subtask-tree.spec.mjs`, 5 scenarios: list indented carets + position ordering, drawer checklist ordering, one-level demote via the context menu (doc round-trip asserts exactly the one-node diff), illegal depth-5 demote shows the localized `err.subtaskDepth` toast with the tree unmoved, board open-leaf badge count + checklist popover. Full gate: **120/120** (115 baseline + 5).

## Chunk-Gate Remedy (planned headroom was 1.4 kB; the feature overflowed it)

The entry chunk hit 502.4 kB against the 500 kB gate. Applied the established 61-02/65-03 lazy-split remedy twice, behind pre-warmed registries (no runtime behavior change — chunks load at boot):
- `src/features/subtask-move.js` — the restructure action handlers.
- `src/features/subtask-popovers.js` — the recursive checklist renderer `subTreeChecklistHtml` (moved out of features/subtasks.js, which now exports the `treeChecklist` registry) + the `subs`/`subParent` popover cases (`subPop` registry).
- Entry chunk: 499.95–499.99 kB. Gate tests 11/11.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 500 kB entry-chunk gate exceeded (502.4 kB)**
- **Found during:** Task 1 verify chain (`test/build-chunk-size.test.mjs`)
- **Fix:** lazy-split remedy described above; consumers call through `treeChecklist.fn`/`subPop` registries with boot-time pre-warm (same contract as 65-03's subtask-detail split)
- **Files:** features/subtasks.js, features/subtask-move.js, features/subtask-popovers.js, overlays/popovers.js, overlays/drawer.js, components/task-list.js
- **Commit:** 8f0543c

**2. [Rule 2 - Missing critical functionality] drawer subtask detail had no context-menu trigger**
- **Found during:** Task 1 — the 65-03 hook is right-click on `data-ctx="sub"` rows only
- **Fix:** ellipsis `ctxBtn` (data-ctx="sub") in `src/features/subtask-detail.js` header row
- **Commit:** 8f0543c

**3. [Rule 1 - Test-gate updates] frozen baselines moved with the feature**
- icons-baseline +`corner-down-right` (re-parent glyph); catalogue 1903→1911; data-a sites 511→517 — counts updated with explanatory comments in the pinning tests.
- **Commits:** 8f0543c, 8cfa9bc

## Verification

- `npm run prebuild` — 0 dead/missing keys (EN+FR)
- `npm test` — 1569 tests, 1557 pass, 0 fail
- `node --test test/search-fts.test.mjs` — 14/14 (incl. 2 new subtaskMatch cases)
- `node --test test/build-chunk-size.test.mjs` — 11/11
- `npm run e2e` — 120/120

## Known Stubs

None.

## Threat Flags

None — no new surface beyond the plan's threat model; `subtaskMatch` leaks only titles from the same permissioned task the hit already exposes (T-65-10).

## Self-Check: PASSED

- SUMMARY.md exists at `.planning/phases/65-subtask-tree/65-04-SUMMARY.md`
- Commits verified: 8f0543c, 8cfa9bc, a43a8c7 (3 plan commits via ledger 7419f501..a43a8c7), + metadata c83fcf8/ee62c32
- All acceptance criteria re-run: prebuild 0 dead keys; unit suite 1557 pass / 0 fail; search-fts 14/14; chunk gate 11/11; e2e 120/120
