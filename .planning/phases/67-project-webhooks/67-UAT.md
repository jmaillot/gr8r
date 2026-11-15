---
status: testing
phase: 67-project-webhooks
source: [67-VERIFICATION.md]
started: 2026-11-15T23:55:00Z
updated: 2026-11-15T23:55:00Z
---

## Current Test

number: 1
name: Live MS Teams Workflows delivery — register real hook, send test, verify Adaptive Card + HMAC signature
expected: |
  A real MS Teams Workflows endpoint receives the Adaptive Card within seconds of
  pressing « Envoyer un test », with a valid `X-Gr8r-Signature` HMAC (verify with
  the shown-once secret). No secret reappears in list/edit views afterwards.
awaiting: user response

## Tests

### 1. Live delivery to a real MS Teams Workflows endpoint
expected: Register a real Teams Workflows hook (URL shown-once secret displayed only at creation), press « Envoyer un test » in the webhooks tab, and confirm the Adaptive Card lands in the Teams channel. Verify the `X-Gr8r-Signature` header HMAC against the shown secret. Confirm the secret is never shown again in list/edit views or logs.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
