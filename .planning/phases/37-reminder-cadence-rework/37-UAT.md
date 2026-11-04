---
status: partial
phase: 37-reminder-cadence-rework
source: [37-VERIFICATION.md]
started: 2026-11-04T14:36:22Z
updated: 2026-11-04T16:20:00Z
---

## Current Test

[testing paused — 2 items outstanding]

## Tests

### 1. Live scheduling cadence end-to-end (real clock)
expected: On a running instance with a real workspace, set a task due today; wait for the 09:00 scheduled pass (or the boot catch-up). Confirm the assignee's inbox and email each receive exactly one "Due today" notification, then one "Past due" the next morning, and nothing on subsequent days. Exactly 2 notifications total per task per assignee across the task's lifetime (per due-date value).
result: blocked
blocked_by: other
reason: "I will add a new task, but I cannot verify today"

### 2. Settings page rendering of the new copy
expected: Open Settings → notifications in EN and FR; check the due-reminder toggle label/description, and that the inbox filter label shows "Due-day reminder" (shared-label collateral). EN "Due-day reminder" / "Get a reminder on the morning a task is due."; FR "Rappel le jour d’échéance" / "Recevez un rappel le matin de l’échéance d’une tâche."; toggle still functional.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 1

## Gaps
