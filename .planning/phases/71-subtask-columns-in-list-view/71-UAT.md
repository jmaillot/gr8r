---
status: complete
phase: 71-subtask-columns-in-list-view
source: [71-VERIFICATION.md]
started: 2026-11-17T16:44:52Z
updated: 2026-11-17T17:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Visual grid alignment + focus ring (manual-only per 71-VALIDATION.md)
expected: Open the List view with a task that has subtasks (some nested depth ≥ 1, some done/overdue, mixed assignees), columns headers visible. Compare each subrow's Status / Assignees / Priority / Due cells against the header column edges on BOTH the Tasks/Project list AND the My Tasks list (the CR-01 fix reorders cells for My Tasks specifically); tab through a status chip to see the focus ring.
result: issue
reported: "they are there, but is it possible to align them at same px as parent task ?"
severity: cosmetic

## Summary

total: 1
passed: 0
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-71-1
  truth: "Subtask meta cells sit at the same horizontal px offset as the parent task's cells under each column header"
  status: failed
  reason: "User reported: they are there, but is it possible to align them at same px as parent task ?"
  severity: cosmetic
  test: 1
  artifacts:
    - src/styles/views/list.css
  missing:
    - ".subrow > .c-meta lacks the parent cells' horizontal padding (.thead > div / .trow > div use `padding: 0 8px`; subrow meta cells have none, so content sits 8px left of the parent column content)"
