---
phase: 65-subtask-tree
plan: 05
subsystem: subtask-tree-surfaces
tags: [subtask-tree, fts, export, mspdi, mcp, parity]
requires:
  - "65-01 subtree.js helpers (buildTree ordering rule mirrored locally)"
  - "65-02 validateSubtree/normalizeTaskSubtasks + funnel reject codes"
  - "65-04 search subtaskMatch hint (the folded index now feeds it title-only hits)"
provides:
  - "Subtask titles in the FTS index on BOTH backends — one shared folded suffix, byte-identical SQLite/pg parity; structure-only changes reindex (D-06/D-08)"
  - "Recursive export rows with per-level keys, parent row ids and depth; MSPDI OutlineLevel = depth+1 and positional Summary adjacency"
  - "writeDoc tree gate: the shared validateSubtree + normalizeTaskSubtasks run on every MCP write (T-65-11)"
  - "mcpStripMember assignees-array strip that preserves tree fields (T-65-13)"
affects: [search palette precision (65-04 hint), MSPDI/xlsx/CSV consumers, MCP agents]
tech-stack:
  added: []
  patterns: [one-suffix-two-dialects FTS symmetry, positional DFS Summary adjacency, import-free local walk mirrors of subtree.js comparators, seeded-doc + real-tool MCP test flow]
key-files:
  created: []
  modified:
    - db-adapter.mjs
    - src/export/model.js
    - export/mspdi.js
    - mcp.js
    - test/search-fts.test.mjs
    - test/copy-sqlite-to-pg.test.mjs
    - test/export-model.test.mjs
    - test/export-mspdi.test.mjs
    - test/export-xlsx.test.mjs
    - test/export-csv.test.mjs
    - test/mcp.test.mjs
decisions:
  - "FTS: the folded subtask-title suffix is computed ONCE per task (buildTree (position, arrayIndex) order, foldForSearch only) and appended to the body text fed to BOTH dialects; the ftsSweep rebuild uses the identical expression so sweep and insert never diverge"
  - "A1 verified to the EXISTING test contract: OutlineLevel = row.depth + 1 with depth 0 on first-level subtask rows (OutlineLevel 1 preserved on those rows, depth-1 rows emit 2); task rows emit no element. Recorded discrepancy: plan/research prose says task=1/first subtask=2 in MS Project terms — the shipped base matches the pinned 54-05 expectation instead; flagged for the human verifier"
  - "MSPDI Summary became positional DFS adjacency (next row exactly one level deeper) — the old parent-id set could not distinguish two depth-0 siblings sharing the task's row id"
  - "T-65-11 mitigation landed as Rule 2: writeDoc never rode mergeClientDoc (it is a direct tx write), so the shared validateSubtree gate + normalizeTaskSubtasks heal were added inside writeDoc — the ONE validator, a second call site, not a second validator"
  - "T-65-13 fix as Rule 1: mcpStripMember checked the dead legacy scalar s.assignee; assignments live in assignees ARRAYS (D-55-4) — the mirror now filters every array like server.js stripMember, spread-preserving tree fields"
metrics:
  duration: 21m
  completed: 2026-11-15
status: complete
commits: 3
plan_head_before: 45062020190931558221b5834d9c1e7ac1d5fb85
plan_head_after: bf13780
actuals:
  tokens: 51000
  tasks: 3
  commits: 3
requirements-completed: [SUB-04]
coverage:
  SUB-04: "FTS: test/search-fts.test.mjs (title-only subtask hits depth 1+2, retitle/delete reindex, route-level parent hit with subtaskMatch) + test/copy-sqlite-to-pg.test.mjs byte-parity on a two-level fixture (pg-gated); Exports: test/export-model.test.mjs two-level ordering/keys/parent/depth fixture, test/export-mspdi.test.mjs OutlineLevel per depth + nested Summary, test/export-xlsx.test.mjs + test/export-csv.test.mjs model-order cases; MCP: test/mcp.test.mjs round-trip, subtaskCycle reject through writeDoc, nested assignee strip"
---

# Phase 65 Plan 05: FTS titles, depth-aware exports, MCP tree parity Summary

**One-liner:** The subtask tree now survives every non-view surface — subtask titles are searchable on both backends through one byte-identical folded suffix and forget deleted ones on the next funnel write, exports walk the tree in (position, arrayIndex) order with per-level keys, true depth and MSPDI OutlineLevel, and MCP writeDoc faces the same subtree gate as the funnel while stripping members without losing tree shape.

## What Was Built

1. **Task 1 — FTS subtask titles (D-06/D-08):** `syncTaskFts`'s unchanged-check now also compares a cheap serialized subtask-title signature (raw titles in buildTree order), so a retitle or delete of ANY subtask re-indexes the parent task's row on its next funnel write — no sweep, empty subtree = empty signature. The folded title suffix is computed ONCE per task via `foldForSearch` (no hand-rolled normalization) and appended to the body text consumed by BOTH dialects; the `ftsSweep` rebuild uses the identical expression. Tests: adapter-level title-only hits at depth 1 and 2, implicit AND across two subtasks' titles, stored-body order assertions, retitle/delete reindex with row-content proof (contentless FTS5 reuses rowids, so content — not rowid — proves the rewrite), route-level test that terms matching ONLY a subtask title return the parent task with the 65-04 `subtaskMatch` hint, and a pg-gated byte-parity test asserting pg `folded` === SQLite `title + ' ' + body` on a two-level fixture (skips, exit 0, without POSTGRES_TEST_URL).
2. **Task 2 — Nested export rows + OutlineLevel (SUB-04):** `src/export/model.js` replaces the flat `PARENT.n` emission with a recursive DFS walk in buildTree order: per-level keys (`PARENT.1.2`), `parent` = the parent ROW's id (task id for roots, per the CR-01 row-id contract), a `depth` field (0 for root subtask rows), date-inheritance fallbacks untouched; every nested row carries `parent` so the `topRows` predicate still excludes them all from KPIs (import-free local walk, model discipline kept). `export/mspdi.js` emits `OutlineLevel = row.depth + 1` on subtask rows (A1: the existing pinned `<OutlineLevel>1</OutlineLevel>` first-level contract is preserved) and computes `<Summary>` from positional DFS adjacency — a row is a summary iff the next row is exactly one level deeper — which fixes the old parent-id set's depth-0 sibling ambiguity. Tests: two-level model fixture (ordering incl. position-vs-array-order, keys, parent/depth/id, KPI exclusion), OutlineLevel per depth + nested-subtask-parent Summary, xlsx and CSV row-order cases. All four export suites: 134 pass.
3. **Task 3 — MCP tree parity (SUB-04, T-65-11/T-65-13):** `mcp.js` `writeDoc` now runs the SAME tree authority as the funnel — `subtree.validateSubtree` wholesale-rejects a cycle or depth overflow (the throw rolls the tx back; the stable code surfaces in the MCP error text) and `normalizeTaskSubtasks` heals shape on every write. `mcpStripMember`'s subtask branch was fixed to the live `assignees` arrays and spread-preserves `id`/`parentId`/`position`. Tests: writeDoc round-trip of a two-level tree with tree fields byte-intact, a cyclic tree seeded directly into the store rejected through any MCP write with `subtaskCycle` and zero revision bump, and a real signup→invite→accept→remove_member flow proving the NESTED subtask's assignee is stripped while the tree survives.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] writeDoc never rode mergeClientDoc — MCP writes had NO tree validation**
- **Found during:** Task 3 (read of mcp.js:183-194 showed a direct tx write; the plan's premise was false in code)
- **Fix:** the shared `validateSubtree` + `normalizeTaskSubtasks` (the exact funnel definitions, not a second validator) run inside `writeDoc` after the edit; T-65-11's mitigation now actually exists and the cycle-reject test proves the code surfaces through MCP
- **Files modified:** mcp.js
- **Commit:** bf13780

**2. [Rule 1 - Bug] mcpStripMember checked the dead legacy scalar `s.assignee`**
- **Found during:** Task 3 — the first strip test run left the nested assignee un-stripped
- **Issue:** assignments moved to `assignees` arrays in D-55-4; the MCP mirror still probed the pre-55 scalar, so it NEVER stripped a real subtask assignee
- **Fix:** mirrored server.js `stripMember`'s task branch (filter every `assignees` array, task and subtask, spread-preserve the rest)
- **Files modified:** mcp.js
- **Commit:** bf13780

**3. [Rule 1 - Test-gate note] contentless FTS5 reuses rowids on single-row delete+insert**
- **Found during:** Task 1 — the planned rowid-stability proof cannot distinguish a rewrite from a no-op on a one-row index
- **Fix:** the reindex assertions read the stored BODY content instead (and search-level absence of the old title); the unchanged case keeps the rowid-stability proof, which remains valid for no-rewrite
- **Files modified:** test/search-fts.test.mjs
- **Commit:** 7dac344

## Verification

- `node --test` (7 touched suites) — 192 pass, 0 fail, 5 pg-gated skips
- Full `npm test` — 1580 tests, 1567 pass, 0 fail, 13 skipped (baseline 1557 — grown, never shrunk)
- `npm run build` — green; entry chunk 499.99 kB ≤ 500 kB gate (no lazy-split needed: only src/export/model.js is client-bundled and it shrank the per-task closure)
- `npm run e2e` — 120/120
- Byte-parity: pg-gated test asserts pg `folded` === SQLite `title + ' ' + body` on the two-level fixture (skipped without POSTGRES_TEST_URL, exit 0)

## Known Stubs

None.

## Threat Flags

None — no new access surface. Subtask titles enter the per-workspace index searched through the existing permissioned route (T-65-12); MCP writes gained (not lost) validation (T-65-11); the member strip preserves tree fields (T-65-13).

## A1 Verification Note (recorded per plan instruction)

The plan/research prose describes OutlineLevel as 1-based with task = 1 and first subtask = 2 in MS Project outline semantics; the shipped formula (`row.depth + 1`, depth 0 on first-level rows) preserves the EXISTING 54-05 test contract (`<OutlineLevel>1</OutlineLevel>` on first-level child rows, nothing on task rows). Both the old and new behavior pin first-level rows at 1; depth-1 (nested) rows emit 2. If the human Project check shows first-level subtasks rendering as top-level siblings, the one-line remedy is emitting `row.depth + 2` and updating the pinned expectation — recorded here rather than silently changing a human-verified contract.

## Self-Check: PASSED

- SUMMARY.md exists at `.planning/phases/65-subtask-tree/65-05-SUMMARY.md`
- Commits verified via ledger: 3 commits in 4506202..bf13780 (7dac344, 4634faf, bf13780) — `git rev-list --count` → 3
- All acceptance criteria re-run: 7-suite run 192 pass / 0 fail; full npm test 1567 pass / 0 fail; e2e 120/120; build + chunk gate green
- Zero new npm dependencies (standing constraint held)
