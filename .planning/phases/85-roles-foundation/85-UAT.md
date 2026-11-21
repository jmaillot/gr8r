---
status: testing
phase: 85-roles-foundation
source: [85-VERIFICATION.md]
started: 2026-11-21T00:00:00Z
updated: 2026-11-21T00:00:00Z
---

## Current Test

number: 2
name: Backup page states
expected: |
  Empty state for holders; keyed 403 fullstate (err.backupRoleRequired) + home button for non-holders deep-linking /backup
awaiting: user response

## Tests

### 1. Grant/revoke surface round-trip
expected: Surface appears for the grantee on next load and disappears after revoke (server flag-drop per load is e2e-tested; the browser flow is not)
result: pass

### 2. Backup page states
expected: Empty state for holders; keyed 403 fullstate (err.backupRoleRequired) + home button for non-holders deep-linking /backup
result: issue
reported: "It redirect where i have an access silently"
severity: major

### 3. Tab rendering
expected: Rows show user, role badge, granter display name, relative time; the recent trail lists the audited actions newest-first
result: [pending]

## Summary

total: 3
passed: 1
issues: 1
pending: 1
skipped: 0
blocked: 0

- gap_id: G-85-2
  truth: "A non-holder deep-linking /backup gets the keyed backupRoleRequired 403 fullstate with home way out"
  status: failed
  reason: "User reported: It redirect where i have an access silently"
  severity: major
  test: 2
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis
