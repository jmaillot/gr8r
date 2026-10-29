---
status: complete
phase: 18-closing-verification-i18n-migration-proof-real-device-uat
source: [18-02-SUMMARY.md e2e paths, ROADMAP Phase 18 criterion 4]
started: 2026-10-27T00:00:00Z
updated: 2026-10-28T00:00:00Z
---

## Current Test

All three device tests executed by the human on a real phone (2026-10-28). All passed.

## Tests

### 1. QR scan with Google Authenticator — enroll → verify
expected: |
  Start 2FA enrollment in the running app (Settings → 2FA card → password step-up → enrolling state). Scan the rendered QR with Google Authenticator on a real phone. The app adds the Projects entry and shows a 6-digit code. Enter the NEXT code from the app into the verify step: 2FA flips to on and the one-time recovery-codes modal is shown. Both locales on the surface if practical.
result: |
  PASS — Google Authenticator scanned the enrollment QR on a real phone; the app
  accepted the entry, showed a 6-digit code, and the verify step enabled 2FA with
  the one-time recovery-codes modal as expected.

### 2. QR scan with a second authenticator app — enroll → verify
expected: |
  Disable 2FA (password + a code from the phone), then re-enroll and scan the new QR with a second authenticator app (Aegis, Authy, or 2FAS per ROADMAP). The second app accepts the QR, and the next 6-digit code from it enables 2FA. Same enroll-verify shape as test 1.
result: |
  PASS — 2FA disabled then re-enrolled; the new QR was scanned with Microsoft
  Authenticator (in lieu of Aegis/Authy/2FAS — same second-app shape). The app
  accepted the QR and the next 6-digit code enabled 2FA ("je viens de tester avec
  Microsoft authenticator, cela fonctionne").

### 3. Full 2FA login on the device
expected: |
  With 2FA enabled, sign out of the app, then sign back in with email + password: the pending-2FA screen appears with the masked-email subtitle. Enter a live 6-digit code from the phone: you land signed in. Both locales on the surface if practical (the sign-in copy and the 2FA subtitle follow the account locale).
result: |
  PASS — with 2FA enabled, full sign out / sign back in on the device with email +
  password and a live 6-digit code from the phone; landed signed in (validated via
  the user's successful real sign-in requiring Google Authenticator). Single locale
  on this surface — both-locale coverage is already provided by the e2e suite's
  pending2fa en/fr tests; no gap filed.

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
