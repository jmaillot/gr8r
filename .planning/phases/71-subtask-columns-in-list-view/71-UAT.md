---
status: testing
phase: 71-subtask-columns-in-list-view
source: [71-VERIFICATION.md]
started: 2026-11-18T06:30:00Z
updated: 2026-11-18T11:15:00Z
---

## Current Test

number: 1
name: Visual grid + all-four-cells inner-content alignment + focus ring (post-G-71-4-closure recheck)
expected: |
  Open the List view with a task that has subtasks (nested depth ≥ 2, some done/overdue, mixed assignees), column headers visible. Compare each subrow's Status chip / Assignees / Priority / Due cells against the header column edges AND the parent task's pill content (px offset) — after 71-05 all four cells' visible content carries the parent pill's padding contract. Repeat on the My Tasks view (cols: project→status→priority→due). Tab through a status chip to see the focus ring.
  Expected: All four meta cells' visible content sits exactly under the parent header columns at every nesting depth on BOTH call sites, at the same px offset as parent pill content; inherited priority dimmed; overdue && !done due red; visible focus ring on the chip.
awaiting: user response

## Tests

### 1. Visual grid + all-four-cells inner-content alignment + focus ring (standing UAT recheck — G-71-1/G-71-3/G-71-4)
expected: |
  All four meta cells' visible content (status chip, assignee, priority, due) sits exactly under the parent header columns at every nesting depth on both List and My Tasks, at the same px offset as parent pill content; inherited priority dimmed; overdue due red; visible focus ring on the chip.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
