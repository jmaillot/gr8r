---
status: testing
phase: 20-recovery-code-regeneration
source: [20-VERIFICATION.md]
started: 2026-10-29T00:00:00Z
updated: 2026-10-29T00:00:00Z
---

## Current Test

number: 1
name: End-to-end regen UI flow
expected: |
  On the 2FA settings card (2FA on), a Regenerate button appears next to Turn off. Clicking it reveals an inline form asking for current password + 6-digit TOTP code with a warning that old codes will stop working. Submitting with a valid password and live TOTP code shows the existing one-time recovery modal displaying 10 new codes — shown once, cleared on dismiss, never persisted. On dismiss the inline form is gone and old recovery codes no longer work at login.
awaiting: user response

## Tests

### 1. End-to-end regen UI flow
expected: |
  On the 2FA settings card (2FA on), a Regenerate button appears next to Turn off. Clicking it reveals an inline password + 6-digit-code form with the "old codes will stop working" warning. Submitting valid credentials opens the one-time modal with 10 new codes; dismissing clears it, the inline stage is gone, and old codes fail at login.
result: [pending]

### 2. French locale rendering of the regen flow
expected: |
  With the UI in French, the regenerate button, inline form labels, warning copy, and modal content all render in French with no missing-key placeholders.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
