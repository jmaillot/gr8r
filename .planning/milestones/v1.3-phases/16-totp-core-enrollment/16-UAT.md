---
status: complete
phase: 16-totp-core-enrollment
source: [16-VERIFICATION.md]
started: 2026-10-27T00:00:00Z
updated: 2026-10-27T12:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Real-device QR scan — enroll with a real phone/authenticator
expected: |
  Scanning the card's QR with a real authenticator app yields a working 6-digit code that the verify step accepts; the enroll→enable flow completes end-to-end.
result: pass

### 2. Enrollment card visual states walk-through
expected: |
  The settings 2FA card transitions correctly: off state → password step-up → enrolling state (QR + copyable secret, both EN and FR locales) → verify code → on state; disable via password + code returns to off state.
result: pass

### 3. One-time recovery-codes modal behavior
expected: |
  The recovery-codes modal is shown exactly once at enable; copy-all duplicates the codes; after dismissal nothing re-displays the codes (no localStorage/sessionStorage persistence, refresh does not restore them).
result: pass

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
