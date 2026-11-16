---
status: complete
phase: 65-subtask-tree
source: [65-01-SUMMARY.md, 65-02-SUMMARY.md, 65-03-SUMMARY.md, 65-04-SUMMARY.md, 65-05-SUMMARY.md]
started: 2026-11-15T13:50:00Z
updated: 2026-11-15T14:20:00Z
note: >
  Coverage blocks in 65-01/02/03/05 were authored as string lists, not the #1602
  mapping schema — classify-coverage reported validation_failed/malformed_block for
  all entries. Treated as human checkpoints per the fail-safe rule (no deliverable
  dropped); fix the SUMMARY coverage blocks to enable deterministic auto-pass routing
  in future sessions.
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: none
name: [testing complete]
expected: |
awaiting: nothing

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server. Start the app from scratch — server boots without errors and a primary query/page load returns live data.
result: pass

### 2. List/table tree rendering (SUB-01)
expected: Open a task with nested subtasks in list or table view. Subtasks appear indented under their parent at every level (up to the depth cap), each with a collapse caret; expanding/collapsing works per node and does not shift other tasks' rows.
result: pass

### 3. Drawer subtask tree (SUB-01)
expected: Open the task drawer. The subtask section shows the same recursive tree: indentation, per-node carets, and a header progress bar that reflects leaf-only completion (parent rows never double-count their children's progress).
result: pass

### 4. Board child-count badge + popover (SUB-01)
expected: In board view, a task with subtasks shows a badge counting its OPEN leaf subtasks. Tapping the badge opens a popover with the recursive checklist; completing children updates the count.
result: pass

### 5. Timeline indented bars (SUB-01)
expected: In timeline view, subtask bars appear indented under their parent task, top level collapsible; a subtask without its own dates inherits the parent's date range.
result: pass

### 6. One-level restructure via context menu (SUB-02)
expected: Right-click (or context-menu) a subtask: promote (move up one level), demote (under previous sibling), and re-parent (sibling picker) work one level at a time; impossible moves are absent from the menu (not disabled/errored).
result: pass

### 7. Cycle/depth reject with localized error (SUB-02)
expected: Attempt an illegal restructure (e.g., re-parent an ancestor under its own descendant, or demote past depth 5). Nothing mutates and a toast shows a localized error (EN and FR both available), not a raw code.
result: pass

### 8. Delete removes descendants (SUB-02)
expected: Delete a parent subtask that has children — the entire subtree is removed, not just the clicked node.
result: pass

### 9. Cascade completion + reopen behavior (SUB-03)
expected: Completing a parent auto-completes all its open descendants (including a subtask that is itself a parent — symmetric at every level). Reopening the parent leaves the descendants done.
result: pass

### 10. Search finds subtask titles with hint (SUB-04 / D-07)
expected: Search for a term that matches only a subtask's title — the parent task is returned with a faint "via subtask:" hint showing the matched title; clicking opens the parent's drawer.
result: pass

### 11. Exports carry the tree (SUB-04)
expected: Export a workspace with a multi-level tree to xlsx and CSV — subtask rows appear in tree order under their parents. Export MSPDI — subtask rows carry OutlineLevel and summary rows render as summaries.
result: skipped
reason: "Deferred follow-up: reporté à la fin du milestone — pas testable pour l'instant"

### 12. MCP round-trip (SUB-04)
expected: Via MCP writeDoc, write a task with a two-level subtask tree, then read it back — id/parentId/position survive; a cyclic write is rejected with subtaskCycle.
result: pass
source: automated
reason: "Vérifié en automatique par l'orchestrateur : test/mcp.test.mjs 41/41 — round-trip 2 niveaux (id/parentId/position intacts), rejet cyclique subtaskCycle (T-65-11), strip assigné imbriqué T-65-13"

### 13. Localized error toasts EN+FR (SUB-02, from VALIDATION manual checks)
expected: Trigger a cycle/depth reject with the app in English and in French — the toast wording is correct and human in both locales.
result: pass
source: automated
reason: "Vérifié en automatique par l'orchestrateur : clés err.subtaskCycle/err.subtaskDepth présentes et non vides dans en.json et fr.json avec libellés naturels symétriques ; tests i18n 22/22 (catalogue pinne la parité EN+FR de tout code émis) ; rendu toast réel observé au test 7"

## Summary

total: 13
passed: 12
issues: 0
pending: 0
skipped: 1

## Deferred Follow-Ups

- test: 11
  idea: "Vérifier les exports (xlsx/CSV en ordre d'arbre, MSPDI OutlineLevel/summary) — reporté à la fin du milestone, idéalement avec un import dans MS Project réel pour clore l'item A1"
  deferred_at: 2026-11-15

## Gaps

[none yet]
