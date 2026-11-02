---
status: complete
phase: 30-entra-sso-oidc
source: [30-VERIFICATION.md]
started: 2026-11-02T14:55:16Z
updated: 2026-11-02T18:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Confirm the A2 "verified email" policy against a real Entra tenant (WR-02)
expected: Per current code, non-guest pinned-tenant tokens link on the email claim regardless of email_verified; federated members fail closed. Confirm this matches the operator's intent.
result: issue
reported: "i want email to be verified"
severity: major

### 2. Real-tenant smoke test (deferred per plan user_setup)
expected: Configure OIDC_ENABLED + the three vars against a real Entra app registration; complete a sign-in — redirect to Microsoft, back to a session; button appears only when configured.
result: pass

## Summary

total: 2
passed: 1
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-30-1
  truth: "SSO identity linking requires a verified email claim (email_verified=true) from the pinned-tenant IdP; tokens without a verified email fail closed."
  status: failed
  reason: "User reported: i want email to be verified"
  severity: major
  test: 1
  root_cause: "server.js oidc callback (~line 2714): canLink = isPinnedTenant && !guestShape never consults claims.email_verified; assumption A2 substituted pinned-tenant member vouching for the claim, which the operator has now rejected."
  artifacts:
    - path: "server.js"
      issue: "Identity-resolution block computes canLink without email_verified"
    - path: "test/oidc-sso.test.mjs"
      issue: "Mock IdP fixtures don't model email_verified; SSO-03 tests pin the A2 policy"
    - path: "DEPLOY.md"
      issue: "Documents A2 verified-email policy that no longer matches intended behavior"
  missing:
    - "Require claims.email_verified === true (fail closed otherwise) before linking, JIT provisioning, or invite reconciliation"
    - "Update mock IdP fixtures and SSO-03 tests for the strict policy"
    - "Update DEPLOY.md verified-email documentation"
  debug_session: "(inline diagnosis — root cause directly observable in code, matches WR-02)"
