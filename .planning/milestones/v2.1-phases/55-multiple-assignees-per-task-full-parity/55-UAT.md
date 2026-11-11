---
status: complete
phase: 55-multiple-assignees-per-task-full-parity
source: [55-01-SUMMARY.md, 55-02-SUMMARY.md, 55-03-SUMMARY.md, 55-04-SUMMARY.md, 55-05-SUMMARY.md, 55-06-SUMMARY.md, 55-07-SUMMARY.md]
started: 2026-11-11T00:00:00Z
updated: 2026-11-11T12:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test

expected: Kill any running server. Start the app from scratch. Server boots without errors, the read-time assignee migration runs cleanly, and a primary query (health check, homepage load, or login) returns live data with no migration errors in the log.
result: pass

### 2. Assign multiple members to a task

expected: Open the assignee picker (board card, table cell, task drawer, or context menu). It is a search modal listing project members filtered by who can be assigned. Pick 2–3 members — the task now shows an avatar stack (up to 3 + overflow count), and the drawer lists all of them with first names + "+N".
result: pass

### 3. Assignee cap hint

expected: Try to add a 6th assignee. The picker blocks it and shows a visible hint (`page.field.assigneeCap`), in EN and FR locales.
result: pass
note: "re-tested after 55-08 fix — new member appears as picker candidate without reload; gap G-55-3 closed. Original issue report retained for history: 'i just invited 3 test accounts to the workspace + project, but i can only assign to the members that were in the project before the boot' (severity major)"

### 4. Removed-assignee notification

expected: With members A and B assigned, remove B via the picker. B receives an inbox notification ("removed from task", Assignments category); A is not re-notified; untouched members never get pinged.
result: pass

### 5. Any-of assignee filter

expected: On board/table, filter by an assignee — tasks where ANY of the assigned members match appear. Filter by "none"/unassigned shows only tasks with an empty assignees array. Group-by-assignee puts a shared task under each of its assignees.
result: pass
note: group-by-assignee confirmed in List view; board intentionally disables grouping (project.js:109), user initially looked for it on the board toolbar

### 6. Drag-drop assignee replace

expected: Drag a task card onto an assignee column/section. The assignees array is replaced by that single member (`[X]`), not appended. Dropping on unassigned clears the array.
result: pass

### 7. My-Tasks membership & counts

expected: After multi-assignment, My-Tasks shows the task for EACH assignee; Home stats, Overview, Members-page counts, layout badge and command palette all count the task once per member via includes.
result: pass

### 8. Reminder fan-out per assignee

expected: With a task due and 2+ assignees in different timezones/pref states, the reminder pass sends one reminder per assignee — each in their own TZ window, honoring their prefs (opted-out member gets none), and the ledger records exactly one row per member (no duplicates on re-run).
result: pass

### 9. Exports carry all assignees

expected: CSV and XLSX exports have a single joined "Assignees" column listing all members per task row. MSPDI export creates one resource per member and task-assignment pairs so MS Project shows all assignees. Per-member KPIs/Members sheet count shared tasks once per member.
result: pass
note: initial "one assignee in xlsx" report traced to a stale Docker container (pre-55 build); code path verified end-to-end via workbook probe (Tasks!E2/Board!E4 = joined names); passes after rebuild

### 10. Subtask assignees & start dates

expected: A subtask can carry its own assignee set (picker in subtask mode, avatar stack on drawer rows). Subtask detail and drawer show a Start row defaulting to the parent task's start, overridable; export writes `s.start || t.start` so subtasks no longer fall back to the project start in MS Project.
result: pass

### 11. Avatar stacks across all surfaces

expected: Board cards, table cells (incl. mobile card), timeline, calendar, task-list mobile row, home rows, search results and recents popover all render 3-avatar + overflow stacks; hovering the +N chip names the remaining members. Single-assignee tasks render a single avatar, empty tasks stay Unassigned.
result: pass

### 12. Member removal sweep

expected: Remove a member from the workspace. Their id is stripped from every task and subtask assignees array (empty arrays preserved); no orphaned avatars or broken counts anywhere.
result: pass

## Summary

total: 12
passed: 11
issues: 1
skipped: 0

## Gaps

- gap_id: G-55-3
  truth: "Newly invited members appear as assignee candidates in the picker after joining workspace + project"
  status: resolved
  resolved_by: 55-08
  resolved_at: 2026-11-11
  reason: "User reported: invited 3 test accounts to workspace + project, but can only assign to members that were in the project before the boot"
  severity: major
  test: 3
  artifacts:
    - server.js:5946-5955 (project-scoped invite-accept bumps workspace revision via updateDoc:2261)
    - src/core/store.js:156-157 + src/main.js:84,137 (409 → S.ui.conflict guards pollNotifs; retry dead-loops)
    - src/overlays/modals.js:513-514 (picker candidates from D().members — victim, not cause)
  missing:
    - accept-contract: project grant must not move the revision (or must propagate new revision to open clients)
    - conflict-recovery: 409 should re-hydrate instead of freezing the roster until reload
  diagnosis: .planning/debug/55-04-picker-missing-new-members.md

- gap_id: G-55-9
  truth: "XLSX export shows ALL assignees per task row, not just one"
  status: failed
  reason: "User reported: i only see one assignee in xlsx (Tasks AND Board sheets, task confirmed to carry two assignees)"
  severity: major
  test: 9
  artifacts:
    - "Pipeline probe PASSES end-to-end: buildExportModel + buildWorkbook on a synthetic two-assignee doc writes 'Alice, Bob' to Tasks!E2 and Board!E4 (shared string verified in sheet XML)"
    - "Server path verified: export route uses docForClient → normalizeAssigneesData re-run post-syncProfiles (server.js:1906-1919), redactDoc only drops hidden projects"
  missing:
    - "local dev DB (data/projects.db) is empty/rev1 — cannot reproduce against the user's actual data; suspect stale export or single-assignee data at export time, OR an env-specific failure (deployed build predates 55-05)"
  note: "Resolved 2026-11-11: stale Docker container (pre-55 build); code path verified end-to-end, passes after rebuild"
  resolved_by: rebuild
  resolved_at: 2026-11-11
