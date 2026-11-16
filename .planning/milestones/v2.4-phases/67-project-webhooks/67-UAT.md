---
status: complete
phase: 67-project-webhooks
source: [67-VERIFICATION.md]
started: 2026-11-15T23:55:00Z
updated: 2026-11-16T12:50:00Z
note: "Post-gap-closure UAT: G-67-1 resolved (Dockerfile), G-67-2 fixed by plan 67-05 — live delivery re-test PASSED"
---

## Current Test

[testing complete]

## Tests

### 1. Live delivery to a real MS Teams Workflows endpoint
expected: Register a real Teams Workflows hook (URL shown-once secret displayed only at creation), press « Envoyer un test » in the webhooks tab, and confirm the Adaptive Card lands in the Teams channel. Verify the `X-Gr8r-Signature` header HMAC against the shown secret. Confirm the secret is never shown again in list/edit views or logs.
result: pass
note: "Post-fix re-run (2026-11-16): delivered card body reads « This is a test payload sent from Projects Studio. ». Pre-fix report (cosmetic, « gr8r » in card body) resolved by plan 67-05 (commit c7a27ca)."

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-67-1
  truth: "Server starts cleanly with webhook modules present; live Teams delivery testable"
  status: resolved
  resolved_by: "commit 429cc48 (Dockerfile ships webhook modules in runtime stage)"
  resolved_at: 2026-11-16
  reason: "User reported: ERR_MODULE_NOT_FOUND /app/webhook-ssrf.js imported from /app/server.js in the Docker container"
  severity: blocker
  test: 1
  artifacts:
    - path: "Dockerfile"
      issue: "webhook modules missing from runtime COPY whitelist (fixed)"
  missing: []
- gap_id: G-67-2
  truth: "Webhook payloads use the product name « Projects Studio », never « gr8r »"
  status: resolved
  resolved_by: 67-05
  resolved_at: 2026-11-16
  reason: "User reported: le payload de test livré dans Teams affiche encore « gr8r » — devait être remplacé par « Projects Studio ». Fixed by plan 67-05 (commit c7a27ca); post-fix UAT re-run pending below."
  severity: cosmetic
  test: 1
  root_cause: "Test payload body hardcoded at server.js:6505 — 'This is a test payload sent from gr8r.' (user-visible text in the delivered card). No other 'gr8r' occurrences in the webhook payload path (webhook-formats.js clean); the technical header x-gr8r-signature (server.js:2828) is protocol-level and stays."
  artifacts:
    - path: "server.js"
      issue: "line 6505: sample payload body uses the legacy product name"
  missing:
    - "Replace 'gr8r' with 'Projects Studio' in the test payload body (server.js:6505); update the pinning test in test/webhook-routes.test.mjs if any"
