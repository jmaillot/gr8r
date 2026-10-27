---
status: testing
phase: 16-totp-core-enrollment
source: [16-VERIFICATION.md]
started: 2026-10-27T00:00:00Z
updated: 2026-10-27T00:00:00Z
---

## Current Test

number: 1
name: Real-device QR scan — enroll with a real phone/authenticator
expected: |
  Scanning the card's QR with a real authenticator app (Aegis, Google Authenticator, etc.) yields a working 6-digit code that the verify step accepts; the enroll→enable flow completes end-to-end.
awaiting: user response

## Tests

### 1. Real-device QR scan — enroll with a real phone/authenticator
expected: |
  Scanning the card's QR with a real authenticator app yields a working 6-digit code that the verify step accepts; the enroll→enable flow completes end-to-end.
result: [pending]

### 2. Enrollment card visual states walk-through
expected: |
  The settings 2FA card transitions correctly: off state → password step-up → enrolling state (QR + copyable secret, both EN and FR locales) → verify code → on state; disable via password + code returns to off state.
result: [pending]

### 3. One-time recovery-codes modal behavior
expected: |
  The recovery-codes modal is shown exactly once at enable; copy-all duplicates the codes; after dismissal nothing re-displays the codes (no localStorage/sessionStorage persistence, refresh does not restore them).
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
