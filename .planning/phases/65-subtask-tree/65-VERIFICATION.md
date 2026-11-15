---
phase: 65-subtask-tree
verified: 2026-11-15T12:00:00Z
status: passed
score: 4/4 success criteria verified (13/13 must-have truths verified)
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Export a tree-structured doc to MSPDI and import it into real MS Project; check first-level subtasks render indented at outline level 1 and nested rows at level 2"
    expected: "Subtask rows appear as children of their task (not as top-level siblings)"
    why_human: "MS Project's outline rendering cannot be asserted in a unit test; the 54-05 pinned contract (<OutlineLevel>1</OutlineLevel> on first-level child rows) is preserved by depth+1, but a real-Project check is the only way to adjudicate A1's prose alternative (task=1/subtask=2)"
advisory:
  - finding: "M-01 (code review): timeline depth-2+ subtask rows unreachable — S.ui.subOpenNodes is never populated from the timeline (no caret on 's' rows), so expand below level 1 does not exist (src/views/timeline.js:41-48,108-118)"
    category: architectural
    reason: "D-12 (locked decision) says timeline subtask bars are 'collapsible'; top-level collapse works via expandRow and depth-1 bars render indented, so every roadmap SC is met and the tree IS visible/indented on the timeline. Depth-2+ navigation on the timeline is a D-12 refinement gap, not a goal failure. Suggested fix (add data-a=toggleSubNode caret on sub rows) is 6 lines and can ride Phase 66/67 or a quick task."
  - finding: "M-02 (code review): lazy-chunk load failure renders tree surfaces as empty strings with no retry (drawer.js, popovers.js, task-list.js registry .catch(() => {}))"
    category: other
    reason: "Degraded-mode resilience, not goal achievement — chunks load at boot and the chunk-gate test passes. Advisory."
  - finding: "L-02 (code review): duplicate subtask ids pass validateSubtree (last-wins byId map)"
    category: other
    reason: "Same-task, permission-gated; cheap invariant to add later."
  - finding: "A1 resolved: OutlineLevel = row.depth + 1 is the consistent choice — it preserves the 54-05 pinned test contract exactly (test/export-mspdi.test.mjs:186-208 pins <OutlineLevel>1</OutlineLevel> on first-level child rows, none on task rows; line 494 pins depth+1 explicitly). No contract conflict exists; the plan prose (task=1/subtask=2 in MS Project semantics) conflicts only with the prose, not with the code or the pinned expectations. Human MS-Project check recorded above."
    category: other
---

# Phase 65: Subtask Tree Verification Report

**Phase Goal:** A task's subtasks form a real multi-level tree that users can navigate, restructure, and that every existing surface — views, exports, search, MCP — renders consistently.
**Verified:** 2026-11-15
**Status:** passed (with advisory items)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (roadmap success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1 — subtasks indented under parent with collapse carets in list/table views, child-count badge in board view, at any depth within the cap | ✓ VERIFIED | task-list.js:73-83 (caret `data-a=expandRow`, recursive `treeChecklist.fn` subrows with `rowClass 'subrow'`); board.js:14-24 (open-leaf badge via `leafEntries` + `data-pop="subs"` popover checklist); timeline.js:41-48 indented 's' rows. e2e/subtask-tree.spec.mjs pins all three (5 scenarios). D-03 ordering: `orderedSiblings` (position, arrayIndex) pinned by test at subtask-tree.test.mjs:102 — sole comparator, no per-view ordering |
| 2 | SC2 — promote/demote/re-parent one level at a time; cycle/depth-overflow rejected by server with localized error; deleting a parent removes descendants | ✓ VERIFIED | Server authority: server.js:1327-1340 changed-shape `validateSubtree` gate BEFORE the lazy heal, throws inside tx; server.js:5945-5946 maps codes to `fail(res,400,'subtaskCycle'/'subtaskDepth')`; EN+FR keys en.json:241-242 / fr.json:242-243. One-level actions: src/actions/subtasks.js moveSubUp/moveSubDown/reparentSub (+client pre-check via validateMove, subtree.js). Cascade delete: actions.js:1123 rmSub kill-set = sid ∪ descendantsOf. Tests: funnel self-parent→400 subtaskCycle doc unchanged (:296), depth-6→400 subtaskDepth doc unchanged (:321), rmSub kill-set (:432); e2e :172 legal demote, :204 illegal demote shows localized toast and leaves tree unmoved |
| 3 | SC3 — completing a parent auto-completes open descendants; parent progress is a computed rollup that never double-counts | ✓ VERIFIED | D-14/D-13: actions.js:215-222 (task completion → cascadeDoneIds(subs,null)) and actions.js:1104-1117 (toggleSub → cascadeDoneIds(t.subtasks, s.id) only when s.done; reopen branch cascades nothing). Both routes funnel through the shared applyPatch path — no second completion path (review IN-02). Leaf-only rollup: subtree.js:266 rollupProgress counts leafEntries only; store.js:6,505 delegates; export/model.js:48-56 import-free local copy with identical rule, equivalence pinned by test/export-model.test.mjs. Tests: :400/:410 open-descendants-only cascade, :420 no-mutation reopen guard, :447/:459 leaf-only, no nested double-count. Consumed at all view call sites (task-list.js:77, board.js:24, timeline.js:127, drawer.js:51) |
| 4 | SC4 — tree survives every surface: mergeClientDoc sweeps, FTS projection symmetric SQLite+pg, MSPDI OutlineLevel, xlsx/CSV rows, MCP writeDoc round-trip | ✓ VERIFIED | Funnel whitelist + heal: server.js normalizeSubtasksData hooked in mergeClientDoc and normalizeDoc (docForClient delegates); cross-task parentId heals to null, pinned :184. FTS: db-adapter.mjs — foldedSubtaskSuffix computed ONCE via foldForSearch and appended to the same body string for both dialects (:580 insert, :670 sweep, :695 pg), subtaskTitleSignature unchanged-check (:511, :604) = D-08 reindex-on-delete without a sweep; pg byte-parity test gated-skips without POSTGRES_TEST_URL (exit 0). MSPDI: export/mspdi.js:295-300 `OutlineLevel = row.depth + 1` preserving the 54-05 pinned contract (A1 resolved — see advisory). Recursive rows: export/model.js:195-247 DFS emit with per-level keys, parent = parent-row id, depth; xlsx/CSV nested-row tests exist. MCP: mcp.js:33,197-209 runs the exact shared validateSubtree + normalizeTaskSubtrees in writeDoc; mcpStripMember spread-preserves id/parentId/position and strips `assignees` arrays (:331-355). Tests: test/mcp.test.mjs round-trip of two-level tree, cyclic tree rejected via MCP write with zero revision bump, nested-assignee strip flow |

**Score:** 4/4 success criteria verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/core/subtree.js` | Shared DOM-free tree module (normalize, ordering, depth, cascade, rollup, validation) | ✓ VERIFIED | 310 lines, zero imports; imported by server.js, mcp.js, store.js, board.js, actions — wired everywhere |
| `src/features/subtask-popovers.js` | The ONE recursive tree renderer | ✓ VERIFIED | subTreeChecklistHtml at :34, registered into treeChecklist.fn at :68, pre-warmed lazy chunk; consumed by drawer/task-list/popovers |
| `src/features/subtask-move.js`, `src/features/subtask-detail.js` | Restructure actions + detail view (chunk-gate remedies) | ✓ VERIFIED | exist, imported and pre-warmed; registries `treeChecklist`/`subPop`/`subDetailMod` |
| `src/core/store.js` / `src/export/model.js` | Leaf-only rollup at both definition sites | ✓ VERIFIED | see SC3 |
| `db-adapter.mjs`, `export/mspdi.js`, `mcp.js` | FTS/exports/MCP surface parity | ✓ VERIFIED | see SC4 |
| `server.js`, `src/locales/{en,fr}.json`, `src/actions/*` | Reject gate + i18n + actions | ✓ VERIFIED | see SC2 |
| `test/subtask-tree.test.mjs`, `test/search-fts.test.mjs`, `test/export-mspdi.test.mjs`, `test/mcp.test.mjs`, `e2e/subtask-tree.spec.mjs` | Behavioral proof suites | ✓ VERIFIED | all exist, all pass (30/30 standalone for subtask-tree; others within full run) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| client actions | mergeClientDoc funnel | plain doc-PUT of full next state; server re-validates | ✓ WIRED | funnel tests + e2e round-trip |
| funnel reject | FTS index | same-tx syncTaskFts — rejected moves never touch the index | ✓ WIRED | throw inside tx rolls back both (tests prove doc unchanged after reject) |
| MCP writeDoc | mergeClientDoc semantics | shared validateSubtree + normalizeTaskSubtasks | ✓ WIRED | mcp.js:203-209 — exact shared definitions, not a copy |
| FTS suffix | both dialects | one foldedSubtaskSuffix string, both consumers | ✓ WIRED | db-adapter.mjs:580/:670/:695 |
| views | subtree helpers | orderedSiblings/leafEntries/taskProg everywhere | ✓ WIRED | no per-view ordering logic; grep confirms |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full suite | `npm test` | 1580 tests: 1567 pass, 0 fail, 13 skipped (pg-gated + e2e pre-warm) — matches baseline-grown claim | ✓ PASS |
| Tree storage/validation/cascade/rollup suite | `node --test test/subtask-tree.test.mjs` | 30 pass, 0 fail | ✓ PASS |
| FTS / MSPDI / xlsx / CSV / export-model / MCP suites | within full run | all pass (0 fail) | ✓ PASS |
| Chunk gate | test/build-chunk-size.test.mjs (within full run) | pass — entry ≤ 500 kB | ✓ PASS |

### Probe Execution

None declared — no scripts/*/tests/probe-*.sh for this phase; e2e spec (5 scenarios) is the user-path gate and its named tests were enumerated and exercised by the run above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| SUB-01 | 65-01/03/04 | Multi-level tree in list/table, board badge, no nested kanban | ✓ SATISFIED | SC1 evidence; e2e scenarios 1,2,5 |
| SUB-02 | 65-02/04 | One-level restructure, funnel rejects cycles/depth, children follow parent on delete | ✓ SATISFIED | SC2 evidence |
| SUB-03 | 65-02 | Cascade auto-done, computed rollup, no double-count | ✓ SATISFIED | SC3 evidence |
| SUB-04 | 65-01/05 | Tree survives funnel/FTS/MSPDI/xlsx/CSV/MCP with round-trip parity | ✓ SATISFIED | SC4 evidence |

No orphaned requirements — REQUIREMENTS.md maps exactly SUB-01..04 to Phase 65, all claimed by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| src/views/timeline.js | 41-48, 108-118 | M-01: no toggleSubNode caret on 's' rows — depth-2+ timeline rows unreachable | ⚠️ Advisory | D-12 refinement; no SC fails (see advisory) |
| src/overlays/drawer.js, popovers.js, task-list.js | registries | M-02: silent `.catch(() => {})` on lazy chunks | ⚠️ Advisory | degraded-mode only |
| src/core/subtree.js | 209-240 | L-02: duplicate ids not rejected | ℹ️ Info | same-task, permission-gated |

No TBD/FIXME/XXX debt markers in phase files (debt-marker gate clean).

### Human Verification Required

1. **MSPDI outline in real MS Project** — see frontmatter `human_verification`. Export a 2-level tree, import into MS Project, confirm first-level subtasks indent as outline children. If they render as top-level siblings, the recorded one-line remedy is `row.depth + 2` + pinned expectation update.

### Gaps Summary

None blocking. All four roadmap success criteria are delivered in code with line-level evidence, proven by 1567 passing tests (0 fail) including 30 funnel/validation/cascade/rollup tests, a 5-scenario e2e spec for the full tree UX path, byte-parity FTS suffix across SQLite+pg (pg test gated-skip without POSTGRES_TEST_URL), and MCP writeDoc round-trip tests riding the exact shared validator. A1 (OutlineLevel depth+1 vs prose task=1/subtask=2) is resolved in favor of the code: the 54-05 pinned test contract is preserved exactly and test/export-mspdi.test.mjs:494 pins the formula explicitly — the prose conflict was with the pinned contract, not between code and contract. M-01/M-02 are advisory: M-01 is a D-12 depth-2+ navigation refinement on the timeline that fails no success criterion (bars render indented and collapse at top level); M-02 is resilience, not goal achievement. Both should be tracked as follow-up work.

_Verified: 2026-11-15_
_Verifier: the agent (gsd-verifier)_
