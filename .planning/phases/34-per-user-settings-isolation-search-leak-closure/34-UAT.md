---
status: testing
phase: 34-per-user-settings-isolation-search-leak-closure
source: [34-VERIFICATION.md]
started: 2026-11-03T13:10:00Z
updated: 2026-11-03T13:10:00Z
---

## Current Test

number: 1
name: Two-user per-workspace settings isolation in the live UI
expected: |
  Open the settings page in API mode as two different users of the same workspace and toggle prefs for each. Each user sees their own stored prefs after their first toggle; the two users' toggles stay independent (no shared state).
awaiting: user response

## Tests

### 1. Two-user per-workspace settings isolation in the live UI
expected: Open the settings page in API mode as two different users of the same workspace and toggle prefs for each. Each user sees their own stored prefs after their first toggle; the two users' toggles stay independent (no shared state).
result: [pending]

### 2. API-mode pre-toggle hydration gap (product acceptance)
expected: KNOWN LIMITATION (Plan 04, ApiModeUX, human_judgment): in API mode, opening settings BEFORE toggling anything shows all-ON defaults, not the user's stored row, until the first PUT of the session adopts the server merge. Confirm this is acceptable or schedule a fetch-on-workspace-open.
result: [pending]

### 3. Local-mode reload + workspace-switch
expected: In local mode, toggle a pref, reload the page, switch to another local workspace and back. Prefs survive reload, no bleed between local workspaces (per-workspace localStorage keys).
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
