---
status: testing
phase: 67-project-webhooks
source: [67-VERIFICATION.md]
started: 2026-11-15T23:55:00Z
updated: 2026-11-16T00:20:00Z
note: "Deferred by user — UAT postponed until after Phase 68 (known issue G-67-1: Dockerfile missing webhook modules); resume with /gsd-verify-work 67"
---

## Current Test

number: 1
name: Live MS Teams Workflows delivery — register real hook, send test, verify Adaptive Card + HMAC signature
expected: |
  A real MS Teams Workflows endpoint receives the Adaptive Card within seconds of
  pressing « Envoyer un test », with a valid `X-Gr8r-Signature` HMAC (verify with
  the shown-once secret). No secret reappears in list/edit views afterwards.
awaiting: user response → issue reported (server crash on startup)

## Tests

### 1. Live delivery to a real MS Teams Workflows endpoint
expected: Register a real Teams Workflows hook (URL shown-once secret displayed only at creation), press « Envoyer un test » in the webhooks tab, and confirm the Adaptive Card lands in the Teams channel. Verify the `X-Gr8r-Signature` header HMAC against the shown secret. Confirm the secret is never shown again in list/edit views or logs.
result: issue
reported: "Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/webhook-ssrf.js' imported from /app/server.js — container crashes on startup"
severity: blocker

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
  status: failed
  reason: "User reported: ERR_MODULE_NOT_FOUND /app/webhook-ssrf.js imported from /app/server.js in the Docker container"
  severity: blocker
  test: 1
  artifacts: []
  missing: []
