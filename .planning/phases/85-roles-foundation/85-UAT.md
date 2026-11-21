---
status: complete
phase: 85-roles-foundation
source: [85-VERIFICATION.md]
started: 2026-11-21T00:00:00Z
updated: 2026-11-21T18:35:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Grant/revoke surface round-trip
expected: Surface appears for the grantee on next load and disappears after revoke (server flag-drop per load is e2e-tested; the browser flow is not)
result: pass

### 2. Backup page states
expected: Empty state for holders; keyed 403 fullstate (err.backupRoleRequired) + home button for non-holders deep-linking /backup
result: pass

### 3. Tab rendering
expected: Rows show user, role badge, granter display name, relative time; the recent trail lists the audited actions newest-first
result: pass

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

- gap_id: G-85-2
  truth: "A non-holder deep-linking /backup gets the keyed backupRoleRequired 403 fullstate with home way out"
  status: resolved
  resolved_by: redeploy
  resolved_at: 2026-11-21
  reason: "User reported: It redirect where i have an access silently"
  severity: major
  test: 2
  diagnosis: |
    Root cause: STALE DEPLOYMENT — the pg-uat Docker image was built Nov 7, two weeks
    before Phase 85. Its baked-in client bundle had no 'backup' route in ROUTE_IDS, so
    applyDeepLink('backup') fell through silently to the user's default home view (tasks).
    Service worker refuted as vector (public/sw.js has no fetch handler, T-48-02); local
    code and fresh dist verified correct end-to-end (server keyed 403 at server.js:7752,
    client fullstate at src/pages/backup.js:30). Also fixed along the way: roles.js was
    missing from the Dockerfile runtime layer (commit 85c2f06e — the container would have
    crashed on boot).
    Resolution: user rebuilt/redeployed the image. Re-test on the fresh deployment: the
    keyed 403 fullstate renders correctly → gap resolved, test 2 pass.

