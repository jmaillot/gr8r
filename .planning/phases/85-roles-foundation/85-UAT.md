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
  diagnosis: |
    Root cause: stale pre-85-02 client bundle in the test browser — NOT a code defect.
    The old bundle had no 'backup' route in ROUTE_IDS (git show 1ebe4851~1:src/shell/render.js),
    so applyDeepLink('backup') fell through every branch and silently stayed on home — the
    exact reported symptom. Current code verified correct end-to-end: server keyed 403
    (server.js:7752-7766), client fullstate (src/pages/backup.js:30-39), fresh dist built
    post-feature (16:57 vs src 16:50). Service worker refuted as vector: public/sw.js has no
    fetch handler and no caching (T-48-02) — static caching is sound (index.html no-cache,
    /assets/* hash-named immutable). Stale-bundle window: a tab open across the 16:57 deploy,
    or bfcache. On mobile: close the tab and open the deep link fresh (no hard reload needed);
    optionally use a private tab to bypass any cache.
    Re-test: reload fresh, deep-link /w/:slug/backup as non-holder → expect keyed 403 fullstate.
    If it still silently lands on home on a verified-fresh bundle, that IS a code defect.
