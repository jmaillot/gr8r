---
status: testing
phase: 73-install-hint-banner
source: [73-VERIFICATION.md]
started: 2026-11-18T23:40:00Z
updated: 2026-11-18T23:40:00Z
---

## Current Test

number: 1
name: Real Chromium install flow (CR-01 production closure)
expected: |
  On an install-eligible Chromium desktop/Android profile, cold-load the app and let
  beforeinstallprompt fire in its natural (often pre-hydration) timing. The install
  banner appears within ~2 s of load despite the early event timing; clicking Install
  triggers the real native install prompt.
awaiting: user response

## Tests

### 1. Real Chromium install flow (CR-01 closure)
expected: Cold-load on an install-eligible Chromium desktop/Android profile; the banner appears within ~2 s of load (natural pre-hydration event timing); clicking Install triggers the native prompt.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
