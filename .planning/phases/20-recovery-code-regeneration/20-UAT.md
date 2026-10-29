---
status: complete
phase: 20-recovery-code-regeneration
source: [20-01-SUMMARY.md, 20-02-SUMMARY.md]
started: 2026-10-29T00:00:00Z
updated: 2026-10-29T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. End-to-end regen UI flow
expected: |
  On the 2FA settings card (2FA on), a Regenerate button appears next to Turn off. Clicking it reveals an inline password + 6-digit-code form with the "old codes will stop working" warning. Submitting valid credentials opens the one-time modal with 10 new codes; dismissing clears it, the inline stage is gone, and old codes fail at login.
result: pass
note: |
  Flow passed, but user reported a cosmetic layout issue on the same card: the on-state
  description ("L'authentification à deux facteurs est activée. Vous saisirez un code…")
  wraps ~one word per line. Cause (diagnosed): srow() is grid `minmax(0,1fr) auto`
  (src/styles/pages/settings.css:43) and the auto column now holds TWO buttons
  (Régénérer + Désactiver added in 20-02); longer FR labels squeeze the text column.
  Logged as gap G-20-1.

### 2. French locale rendering of the regen flow
expected: |
  With the UI in French, the regenerate button, inline form labels, warning copy, and modal content all render in French with no missing-key placeholders.
result: pass

## Summary

total: 2
passed: 2
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-20-1
  truth: "On the 2FA on-state card, the title and description text render on readable, naturally wrapped lines (not one word per line) even with the Regenerate + Turn off buttons present"
  status: failed
  reason: "User reported: the text 'L'authentification à deux facteurs est activée. Vous saisirez un code…' displays like one word per line (test 1 passed; cosmetic layout issue on the same card)"
  severity: cosmetic
  test: 1
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis