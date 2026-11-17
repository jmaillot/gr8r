---
status: testing
phase: 71-subtask-columns-in-list-view
source: [71-VERIFICATION.md]
started: 2026-11-17T16:44:52Z
updated: 2026-11-17T16:44:52Z
---

## Current Test

number: 1
name: Visual grid alignment + focus ring — List view subtask meta cells vs parent header columns (Tasks/Project AND My Tasks)
expected: |
  The 4 meta cells sit exactly under the parent header columns at every nesting depth on BOTH list views (Tasks/Project default cols `status→assignee→priority→due→project`, and My Tasks reordered cols `project→status→priority→due`); inherited priority is dimmed; overdue && !done due is red; keyboard focus shows a visible ring on the status chip.
awaiting: user response

## Tests

### 1. Visual grid alignment + focus ring (manual-only per 71-VALIDATION.md)
expected: Open the List view with a task that has subtasks (some nested depth ≥ 1, some done/overdue, mixed assignees), columns headers visible. Compare each subrow's Status / Assignees / Priority / Due cells against the header column edges on BOTH the Tasks/Project list AND the My Tasks list (the CR-01 fix reorders cells for My Tasks specifically); tab through a status chip to see the focus ring.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
