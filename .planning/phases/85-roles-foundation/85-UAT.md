---
status: testing
phase: 85-roles-foundation
source: [85-VERIFICATION.md]
started: 2026-11-21T00:00:00Z
updated: 2026-11-21T00:00:00Z
---

## Current Test

number: 1
name: Grant/revoke surface round-trip
expected: |
  As a Super Admin on /governance > Instance Roles, grant Backup Operator to a non-admin user; log in as that user (or reload) — Backup nav entry + Backup page appear; revoke the role; reload — the nav entry and page are gone
awaiting: user response

## Tests

### 1. Grant/revoke surface round-trip
expected: Surface appears for the grantee on next load and disappears after revoke (server flag-drop per load is e2e-tested; the browser flow is not)
result: [pending]

### 2. Backup page states
expected: Empty state for holders; keyed 403 fullstate (err.backupRoleRequired) + home button for non-holders deep-linking /backup
result: [pending]

### 3. Tab rendering
expected: Rows show user, role badge, granter display name, relative time; the recent trail lists the audited actions newest-first
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
