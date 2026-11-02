---
status: testing
phase: 30-entra-sso-oidc
source: [30-VERIFICATION.md]
started: 2026-11-02T14:55:16Z
updated: 2026-11-02T18:12:00Z
---

## Current Test

number: 1
name: Real-tenant smoke test — Entra sign-in with a verified tenant member
expected: |
  Configure OIDC_ENABLED + OIDC_TENANT_ID/OIDC_CLIENT_ID/OIDC_CLIENT_SECRET against a real Entra app
  registration and complete a sign-in with a tenant member whose email is verified. Expected:
  redirect to Microsoft, consent/select-account prompt, back to a session at /; the Microsoft
  button appears only when /api/config says oidcEnabled.
awaiting: user response

## Tests

### 1. Real-tenant smoke test — verified tenant member signs in
expected: Redirect to Microsoft, back to a session at /; Microsoft button only when configured (/api/config oidcEnabled).
result: [pending]

### 2. Real-tenant fail-closed negative check — token with email_verified !== true
expected: Lands on /login?sso=error with the generic ssoError banner; no users/oidc_identities row created, no session.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps

- gap_id: G-30-1 (RESOLVED in code — 30-06, commit 6a910eb: claims.email_verified === true gates linking/JIT/invite reconciliation, fail closed; negative tests pass. Remaining items below are real-tenant observations only.)
