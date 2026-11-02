---
status: testing
phase: 30-entra-sso-oidc
source: [30-VERIFICATION.md]
started: 2026-11-02T14:55:16Z
updated: 2026-11-02T14:55:16Z
---

## Current Test

number: 1
name: Confirm the A2 "verified email" policy against a real Entra tenant (WR-02)
expected: |
  Per current code, non-guest pinned-tenant tokens link on the email claim regardless of email_verified; federated members fail closed. Confirm this matches the operator's intent.
awaiting: user response

## Tests

### 1. Confirm the A2 "verified email" policy against a real Entra tenant (WR-02)
expected: Per current code, non-guest pinned-tenant tokens link on the email claim regardless of email_verified; federated members fail closed. Confirm this matches the operator's intent.
result: [pending]

### 2. Real-tenant smoke test (deferred per plan user_setup)
expected: Configure OIDC_ENABLED + the three vars against a real Entra app registration; complete a sign-in — redirect to Microsoft, back to a session; button appears only when configured.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
