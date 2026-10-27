---
status: pending
phase: 18-closing-verification-i18n-migration-proof-real-device-uat
source: [18-02-SUMMARY.md e2e paths, ROADMAP Phase 18 criterion 4]
started: 2026-10-27T00:00:00Z
updated: 2026-10-27T00:00:00Z
---

## Current Test

[awaiting human device pass]

## Tests

### 1. QR scan with Google Authenticator — enroll → verify
expected: |
  Start 2FA enrollment in the running app (Settings → 2FA card → password step-up → enrolling state). Scan the rendered QR with Google Authenticator on a real phone. The app adds the Gr8r entry and shows a 6-digit code. Enter the NEXT code from the app into the verify step: 2FA flips to on and the one-time recovery-codes modal is shown. Both locales on the surface if practical.
result:

### 2. QR scan with a second authenticator app — enroll → verify
expected: |
  Disable 2FA (password + a code from the phone), then re-enroll and scan the new QR with a second authenticator app (Aegis, Authy, or 2FAS per ROADMAP). The second app accepts the QR, and the next 6-digit code from it enables 2FA. Same enroll-verify shape as test 1.
result:

### 3. Full 2FA login on the device
expected: |
  With 2FA enabled, sign out of the app, then sign back in with email + password: the pending-2FA screen appears with the masked-email subtitle. Enter a live 6-digit code from the phone: you land signed in. Both locales on the surface if practical (the sign-in copy and the 2FA subtitle follow the account locale).
result:

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
