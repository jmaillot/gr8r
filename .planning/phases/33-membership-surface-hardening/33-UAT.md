---
status: complete
phase: 33-membership-surface-hardening
source: [33-01-SUMMARY.md, 33-02-SUMMARY.md]
started: 2026-11-03T12:30:00Z
updated: 2026-11-03T12:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Server boots from scratch without errors; legacy link-only admin invite sweep runs at boot (update-only, no crash); homepage loads.
result: pass

### 2. Cross-Origin Accept Rejected
expected: From a different origin (e.g. a page on another domain, or curl with a hostile Origin header like https://evil.com), POSTing to /api/invites/:token/accept gets a 403 crossOriginRejected response with the generic byte-identical body — no oracle, and it does not consume the invite throttle budget.
result: pass

### 3. First-Value Forwarded Headers
expected: With TRUST_PROXY=true, an x-forwarded-host header carrying multiple values ("a.com, evil.com") is judged by its FIRST value only — the second value is never consulted.
result: pass

### 4. Accept Body Whitelist
expected: Posting an accept body that smuggles extra keys (role: "admin", teams: [...], scope: ...) results in the same outcome as a clean body — the member gets only the invite's own role, no admin/extra team grants. Unknown keys are silently ignored, never rejected with 400.
result: pass

### 5. Deleted Workspace Invite (Accept)
expected: An invite whose workspace was deleted, when accepted, returns 410 workspaceGone — no membership row is created, no cross-tenant join.
result: pass

### 6. Deleted Workspace Invite (SSO)
expected: An SSO user reconciling an invite whose workspace no longer exists lands on the generic /login?sso=error page — the invite is consumed, no membership is created, no workspace-scoped data leaks.
result: pass

### 7. Admin Link-Only Invite Blocked
expected: An admin creating an invite for an admin/owner role with no email addresses gets a 400 inviteAdminEmailRequired error ("Admin invites must be sent to an email address"). A member-role link-only invite still works.
result: pass
result: [pending]

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
