---
status: testing
phase: 57-views-columns-general-access
source: [57-VERIFICATION.md]
started: 2026-11-12T18:40:00Z
updated: 2026-11-12T18:40:00Z
---

## Current Test

number: 1
name: Cross-device column persistence
expected: |
  Sign in on device A, hide a tasks-table column; sign in on device B (fresh session) — column still hidden. Column visibility choice persisted to the member's saved_views live row applies on device B.
awaiting: user response

## Tests

### 1. Cross-device column persistence
expected: Sign in on device A, hide a tasks-table column; sign in on device B (fresh session) — column still hidden.
result: [pending]

### 2. Cross-device named view
expected: Save a named view on device A; apply then delete it on device B — view is listed, applies (columns/sort/filters restored), and deletes across devices.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
