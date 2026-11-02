---
status: complete
phase: 30-entra-sso-oidc
source: [30-VERIFICATION.md]
started: 2026-11-02T14:55:16Z
updated: 2026-11-02T18:26:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Real-tenant smoke test — verified tenant member signs in
expected: Redirect to Microsoft, back to a session at /; Microsoft button only when configured (/api/config oidcEnabled).
result: pass

### 2. Real-tenant fail-closed negative check — token with email_verified !== true
expected: Lands on /login?sso=error with the generic ssoError banner; no users/oidc_identities row created, no session.
result: pass

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-30-1 (RESOLVED in code — 30-06, commit 6a910eb: claims.email_verified === true gates linking/JIT/invite reconciliation, fail closed; negative tests pass. Both real-tenant checks passed 2026-11-02.)
