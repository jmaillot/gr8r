---
phase: 65
plan: 03
subsystem: subtask-tree
tags: [subtask-tree, views, drawer, board, timeline, task-list, i18n, chunk-gate]
requires:
  - "65-01 — subtree.js helpers (orderedSiblings, buildTree) + normalize sink"
  - "65-02 — leaf-only rollupProgress + cascade semantics"
provides:
  - "subTreeChecklistHtml (features/subtasks.js) — the ONE recursive tree renderer consumed by drawer, list/table subrows and the board popover"
  - "subtree.leafEntries — the shared leaf-set definition behind every view counter"
  - "S.ui.subOpenNodes — the session-only per-node collapse map (D-10) + A.toggleSubNode"
  - "Board open-leaf badge → 'subs' popover checklist (D-11); timeline 's' row kind with indented collapsible date-inheriting bars (D-12)"
  - "features/subtask-detail.js — lazy chunk for the subtask detail view (61-02 chunk-gate remedy precedent)"
affects: [65-04, 65-05]
tech-stack:
  added: []
  patterns: [one shared recursive renderer with compact/full modes, injected fxc tagger to break the render cycle, dynamic-import pre-warm for a low-frequency drawer section, session-only S.ui collapse map (openTasks precedent)]
key-files:
  created:
    - src/features/subtask-detail.js
  modified:
    - src/overlays/drawer.js
    - src/components/task-list.js
    - src/views/board.js
    - src/views/timeline.js
    - src/overlays/popovers.js
    - src/features/subtasks.js
    - src/core/subtree.js
    - src/core/store.js
    - src/actions/actions.js
    - src/locales/en.json
    - src/locales/fr.json
    - test/i18n-core-features.test.mjs
    - test/i18n-shell.test.mjs
    - test/i18n-toast.test.mjs
decisions:
  - "one shared recursive renderer (subTreeChecklistHtml) instead of per-view recursion — orderedSiblings is the only ordering logic anywhere; task-list consumes it in compact mode with rowClass 'subrow'"
  - "collapse state lives in a single session-only map S.ui.subOpenNodes (D-10), keyed by subtask id; the timeline's top level reuses the S.ui.openTasks precedent so the tree looks the same in list and timeline"
  - "progress counters read the 65-02 rollup: subtree.leafEntries (new shared export) for the done/total counts, store.taskProg (rollupProgress delegate) for the bars — no surface re-derives the leaf rule"
  - "chunk-gate remedy (61-02 precedent): the subtask DETAIL view split to features/subtask-detail.js and pre-warmed by drawer.js via dynamic import — the entry chunk had only 641 bytes of headroom and the phase's view work could not fit"
  - "board badge is a div with data-a=\"pop\" (role=button) rather than a <button> — keeps the existing .subp styling and the card's delegation pattern"
metrics:
  duration: 33min
  completed: 2026-11-15
  status: complete
requirements-completed: [SUB-01]
coverage:
  - "SUB-01 (view rendering half): the tree renders with carets + indentation in drawer and table/list, the board shows the open-leaf badge with a popover checklist, the timeline shows indented collapsible date-inheriting bars — all via the shared comparator and leaf-only rollup. The remaining SUB-01 surface (restructure popover entries) is 65-04; the gate stays open until it lands"
actuals:
  tokens: 42000
  tasks: 3
  commits: 3
plan_head_before: ee82be299d6e71b739e81996df9db896b7cc2e12
plan_head_after: 939ee29
estimate:
  tokens: 110000
---

# Phase 65 Plan 03: Tree Rendering on Every Surface Summary

**One-liner:** The multi-level subtask tree is now user-visible everywhere — drawer checklist, list/table subrows, board open-leaf badge with a popover checklist, and indented collapsible timeline bars with date inheritance — all through ONE shared recursive renderer ordered by the single `orderedSiblings` comparator, all progress leaf-based via the 65-02 rollup, collapse state session-only in `S.ui` (D-10).

## What Was Built

1. **Task 1** — Drawer subtasks section rewritten to render through the new shared recursive renderer (`subTreeChecklistHtml`, features/subtasks.js): `orderedSiblings` ordering (D-03), depth indentation, per-node collapse carets toggling the session-only `S.ui.subOpenNodes` map (D-10, new `A.toggleSubNode` action), rows carrying `data-ctx="sub"` — the reserved 65-04 context-menu surface. Header counter/progBar switched to the leaf-only rollup (new `subtree.leafEntries` shared export + `store.taskProg`). The 65-02 rollup was refactored onto `leafEntries` (behavior identical, one leaf definition). EN+FR `a11y.collapseSubtasks`/`a11y.expandSubtasks` same commit.
2. **Task 2** — task-list's flat subrow strip replaced by the shared renderer in compact mode (`rowClass: 'subrow'`): indented children at any depth within the cap, per-node carets, the data-a/data-id/data-sid delegation contract preserved. The flat progress chip (task-list.js:66) now reads the leaf-only rollup. See deviations for the chunk-gate remedy this task triggered.
3. **Task 3** — Board (D-11): the `.subp` badge now counts OPEN leaves with the rollup-fed bar; tapping opens a `subs` popover rendering the same recursive checklist (no per-subtask kanban). Timeline (D-12): a new `s` row kind emits subtask bars indented under the parent task, top level collapsible via `S.ui.openTasks` (shared with the list view — the tree looks the same everywhere) and nested levels via `S.ui.subOpenNodes`; bars without own dates inherit the parent's range; the per-task counter switched to leaf-only. EN+FR `a11y.openSubtasks`/`popover.subtasksOf` same commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Entry-chunk gate tripped — subtask detail view split to a lazy chunk**
- **Found during:** Task 2
- **Issue:** The chunk gate (≤500 kB, hard test assertion) had only 641 bytes of headroom at plan start (499359/500000 measured on the pre-plan build); the plan's own view work (~1.6 kB minified) pushed the entry chunk to 500950 bytes. Pitfall 7's "keep helpers lean" could not absorb a ~1.6 kB addition.
- **Fix:** The 61-02 remedy precedent — move a low-frequency surface out of the entry chunk. The subtask DETAIL view (a user-navigated secondary screen inside the drawer) moved verbatim to `src/features/subtask-detail.js`, pre-warmed by drawer.js at boot via dynamic `import()` (cached module; if somehow unloaded, the section renders empty and re-renders on resolve). Entry chunk after all three tasks: 498582 bytes (~1.4 kB headroom).
- **Files modified:** src/features/subtask-detail.js (new), src/features/subtasks.js, src/overlays/drawer.js
- **Commit:** b880134

**2. [Rule 2 - Missing shared helper] `subtree.leafEntries` added beside the rollup**
- **Found during:** Task 1
- **Issue:** The plan mandates leaf-based counters on four surfaces but no leaf-set helper exists — deriving leaves per surface would duplicate the SUB-03 rule the phase just centralized.
- **Fix:** exported `leafEntries(list)` from the import-free subtree module; `rollupProgress` refactored onto it (equivalence guaranteed by the existing suite).
- **Files modified:** src/core/subtree.js
- **Commit:** a22ebcd

**3. [Rule 3 - Blocking] Supporting wiring outside the plan's files_modified list**
- **Found during:** Tasks 1-2
- **Issue:** The per-node carets need a toggle action and a state default; the board popover needs a pop type. None of these files were in `files_modified`.
- **Fix:** `A.toggleSubNode` in actions.js, `subOpenNodes: {}` in store.js S.ui defaults (session-only, never persisted — D-10), `case 'subs'` in popovers.js. Also: orphaned `a11y.completeSubtask` key removed (its only consumer was the replaced flat subrow); house static-extraction pins updated with change-history annotations (catalogue size 1900→1903, data-a 507→511); a quoted `"leaf"` in a subtree.js comment removed after it tripped the frozen icon-baseline scan (the scanner reads quoted kebab tokens everywhere, comments included).
- **Files modified:** src/actions/actions.js, src/core/store.js, src/overlays/popovers.js, locales, three test pins
- **Commits:** a22ebcd, b880134, 939ee29

## Verification Results

- `npm run prebuild` (i18n scan) — 0 dead/missing/unresolved keys in both catalogues
- `node --test test/build-chunk-size.test.mjs` — green; entry chunk 498582 / 500000 bytes
- Full `npm test` — **1556 pass, 0 fail, 12 skipped** (baseline 1556 passing — grown, never shrunk; no tests removed)
- Acceptance criteria re-run: drawer renders via `subTreeChecklistHtml` (grep: no local ordering logic, `orderedSiblings` only); collapse state only in `S.ui.subOpenNodes` (grep over store/actions/renderer — no doc field, no persistence call); board badge counts open leaves via `leafEntries`, checklist in the existing `pop` pattern, no nested kanban markup; timeline bars indent by depth, inherit `s.due || t.due`-style ranges, collapse via S.ui session state; both consume the shared comparator + rollup

## Known Stubs

None. The per-subtask `data-ctx="sub"` hook is a reserved surface by plan instruction (menu items land in 65-04) — a documented placeholder, not a stub of this plan's goal.

## Self-Check: PASSED

- Files exist: src/features/subtask-detail.js, src/features/subtasks.js (shared renderer), all modified view files — verified on disk
- Commits exist: a22ebcd, b880134, 939ee29 — `git rev-list --count ee82be2..HEAD` → 3
- All acceptance criteria re-run via greps + the three verification commands above
- Zero new npm dependencies (standing constraint held)

*Phase: 65-Subtask Tree · Plan 03 of 04 (wave 3)*
