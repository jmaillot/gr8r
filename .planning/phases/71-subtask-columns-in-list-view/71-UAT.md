---
status: diagnosed
phase: 71-subtask-columns-in-list-view
source: [71-VERIFICATION.md]
started: 2026-11-18T06:30:00Z
updated: 2026-11-18T10:00:00Z
---

## Current Test

[testing complete — 1 issue reported, diagnosed below]

## Tests

### 1. Visual grid alignment + px-offset alignment + focus ring (standing UAT recheck — G-71-1)
expected: |
  Open the List view with a task that has subtasks (nested depth ≥ 1, some done/overdue, mixed assignees). Compare each subrow's Status / Assignees / Priority / Due cells against the header column edges AND against the horizontal px offset of the parent task's cells (G-71-1 recheck). Repeat on My Tasks. Tab through a status chip for the focus ring.
  Expected: Meta cells sit exactly under parent header columns at every nesting depth on both call sites, at the same horizontal px offset as the parent cells; inherited priority dimmed; overdue due red; visible focus ring.
result: issue
reported: "the subtasks status are not aligned with parent task status column"
severity: cosmetic

## Summary

total: 1
passed: 0
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-71-3
  truth: "Subrow meta cells sit exactly under the parent/header columns at every nesting depth on both List and My Tasks"
  status: failed
  reason: "User reported: the subtasks status are not aligned with parent task status column"
  severity: cosmetic
  test: 1
  root_cause: "Parent status cell renders <button class='pillbtn'> with padding: 0 7px; the 71-01 subrow chip renders <label class='stchip'> with no padding — cell content-boxes align (all the spec measures) but the visible icon/text sits ~7px left in the subrow. stchip also lacks pill height/background affordance."
  artifacts:
    - path: "src/features/subtask-popovers.js:85"
      issue: "subrow status markup uses bare .stchip label without pill padding"
    - path: "src/styles/views/list.css:190"
      issue: ".stchip lacks the .pillbtn padding/height/background contract"
    - path: "src/components/task-list.js:27"
      issue: "parent status cell wraps stPill in .pillbtn (padding 0 7px)"
    - path: "e2e/subtask-align.spec.mjs"
      issue: "contentLeftX measures cell box, not chip inner content — metric blind spot"
  missing:
    - "Give .subrow .c-status .stchip the .pillbtn visual contract (padding: 0 7px; height: var(--h-sm); border-radius) so chip content lines up with the parent pill"
    - "Extend subtask-align.spec.mjs to assert the chip's inner first-child left edge against the parent pill's content left edge"
  debug_session: ".planning/debug/g-71-3-status-chip-visual-offset.md"
