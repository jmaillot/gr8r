---
status: testing
phase: 51-client-surfaces-permissions-page-removal-project-creation
source: [51-VERIFICATION.md]
started: 2026-11-08T14:10:00Z
updated: 2026-11-08T14:10:00Z
---

## Current Test

number: 1
name: Restricted-member create affordance across entry points (criterion 4, D-51-14)
expected: |
  Projects page: disabled with localized tooltip. Other entry points (WR-02, known): the modal opens but submitting is refused by the server with the localized `err.projectCreateForbidden` toast and no project is created. No crash, no silent lie.
awaiting: user response

## Tests

### 1. Restricted-member create affordance across entry points (criterion 4, D-51-14)
expected: |
  As a Member in a workspace with `permCreate === true`, open the running app: check the Projects-page create button (disabled + tooltip "La création de projets est réservée aux admins" in FR), then trigger creation from the command palette, command popover, Overview header, Home header, sidebar layout button, and the `P` keyboard shortcut; submit the modal each time.
  Expected: Projects page: disabled with localized tooltip. Other entry points (WR-02, known): the modal opens but submitting is refused by the server with the localized `err.projectCreateForbidden` toast and no project is created. No crash, no silent lie.
result: [pending]

### 2. Toggle + Teams section visual behavior in the running app
expected: |
  As a lead (non-admin), open the share modal: flip the private/public toggle, then invite a team and remove it.
  Expected: Toggle flips optimistically and persists (reverts with a localized toast on refusal); Teams section lists unlinked teams with Invite actions, linked teams in the note with remove actions; live-semantics hint visible; non-managers see the lock hint and no controls.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
