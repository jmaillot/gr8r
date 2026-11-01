---
status: testing
phase: 31-second-totp-factor
source: [31-VERIFICATION.md]
started: 2026-11-01T20:35:00Z
updated: 2026-11-01T20:35:00Z
---

## Current Test

number: 1
name: Add-factor wizard E2E (browser walk of the staged flow)
expected: |
  Ordered stages — naming → password → existing-factor code → QR/verify; localized
  errors on bad input; after verify, a new named factor row appears in the 2FA card.
awaiting: user response

## Tests

### 1. Add-factor wizard E2E
expected: Ordered stages (name → password → existing-factor code → QR/verify); localized errors on invalid input; after verify, a new named factor row appears in the 2FA card list.
result: [pending]

### 2. Remove confirm UX
expected: Confirm echoes the factor's escaped name; removal of one of several factors requires a survivor-factor code; the row disappears and the list refreshes from server ground truth.
result: [pending]

### 3. French rendering
expected: The nine new fr catalogue keys render with correct D-05 typography (apostrophes, spacing) in the 2FA card UI.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
