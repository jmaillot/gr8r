---
status: complete
phase: 67-project-webhooks
source: [67-VERIFICATION.md]
started: 2026-11-15T23:55:00Z
updated: 2026-11-16T12:10:00Z
note: "Deferred by user — UAT postponed until after Phase 68 (known issue G-67-1: Dockerfile missing webhook modules); resume with /gsd-verify-work 67"
---

## Current Test

[testing complete]

## Tests

### 1. Live delivery to a real MS Teams Workflows endpoint
expected: Register a real Teams Workflows hook (URL shown-once secret displayed only at creation), press « Envoyer un test » in the webhooks tab, and confirm the Adaptive Card lands in the Teams channel. Verify the `X-Gr8r-Signature` header HMAC against the shown secret. Confirm the secret is never shown again in list/edit views or logs.
result: issue
reported: "Le test est livré dans Teams mais le payload affiche encore le nom « gr8r » — il devait être remplacé par « Projects Studio ». La signature n'a pas pu être vérifiée visuellement (pas d'accès au header côté Teams)."
severity: cosmetic

## Summary

total: 1
passed: 0
issues: 1
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
  status: failed
  reason: "User reported: le payload de test livré dans Teams affiche encore « gr8r » — devait être remplacé par « Projects Studio »"
  severity: cosmetic
  test: 1
  root_cause: "Test payload body hardcoded at server.js:6505 — 'This is a test payload sent from gr8r.' (user-visible text in the delivered card). No other 'gr8r' occurrences in the webhook payload path (webhook-formats.js clean); the technical header x-gr8r-signature (server.js:2828) is protocol-level and stays."
  artifacts:
    - path: "server.js"
      issue: "line 6505: sample payload body uses the legacy product name"
  missing:
    - "Replace 'gr8r' with 'Projects Studio' in the test payload body (server.js:6505); update the pinning test in test/webhook-routes.test.mjs if any"
