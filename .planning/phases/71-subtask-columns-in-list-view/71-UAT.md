---
status: testing
phase: 71-subtask-columns-in-list-view
source: [71-VERIFICATION.md]
started: 2026-11-18T06:30:00Z
updated: 2026-11-18T06:30:00Z
---

## Current Test

number: 1
name: Visual grid alignment + px-offset alignment + focus ring (standing UAT recheck — G-71-1)
expected: |
  Meta cells sit exactly under parent header columns at every nesting depth on both List and My Tasks views, at the same horizontal px offset as the parent cells; inherited priority dimmed; overdue due red; visible focus ring when tabbing through a status chip.
awaiting: user response

## Tests

### 1. Visual grid alignment + px-offset alignment + focus ring (standing UAT recheck — G-71-1)
expected: |
  Open the List view with a task that has subtasks (nested depth ≥ 1, some done/overdue, mixed assignees). Compare each subrow's Status / Assignees / Priority / Due cells against the header column edges AND against the horizontal px offset of the parent task's cells (G-71-1 recheck). Repeat on My Tasks. Tab through a status chip for the focus ring.
  Expected: Meta cells sit exactly under parent header columns at every nesting depth on both call sites, at the same horizontal px offset as the parent cells; inherited priority dimmed; overdue due red; visible focus ring.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
