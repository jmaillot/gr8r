---
phase: 15-password-change-end-to-end
plan: 03
subsystem: i18n-copy
tags: [i18n, password, honest-copy, regression-guard]
requires: [15-01 server revocation transaction, 15-02 honest toast + route wiring]
provides: [honest settings.pw.done (EN/FR), honesty regression guard test]
affects: []
tech-stack:
  added: []
  patterns: [substring-level honesty guard (meaning pinned, not exact sentence)]
key-files:
  created: [test/password-copy-honesty.test.mjs]
  modified: [src/locales/en.json, src/locales/fr.json, test/i18n-pages.test.mjs]
decisions:
  - "Reworded banner to mirror the already-honest toast (settings.pw.done = signed-out statement) rather than changing the render site"
  - "Guard asserts substrings so future honest rewordings stay green"
  - "Updated i18n-pages EN oracle (Rule 3) — it pinned the falsified copy"
metrics:
  duration: ~3 min
  completed: 2026-10-27T10:45:32Z
  tasks: 2
  commits: 2
plan_head_before: 54ec95bea157ec3a91695cf4024a62878ba35356
plan_head_after: 357a4ec
actuals:
  tokens: 900
  tasks: 2
  commits: 2
status: complete
---

# Phase 15 Plan 03: Honest Password Success Banner Copy Summary

**One-liner:** Rewrote the falsified `settings.pw.done` banner copy in EN/FR to state that other sessions were signed out, and added a substring-level honesty regression guard.

## What Was Built

Gap 1 from 15-VERIFICATION.md is closed:

- `src/locales/en.json` / `src/locales/fr.json` (line 1242): `settings.pw.done` now reads "Password updated. Your other sessions were signed out." / "Mot de passe mis à jour. Vos autres sessions ont été déconnectées." — matching server.js:1365 (revoke-others in the same transaction) and the honest toast `toast.passwordUpdatedAll`. No other locale line changed.
- `test/password-copy-honesty.test.mjs` (new, 3 tests): honest phrase present / falsified phrase absent in both locales, plus JSON parse guard — dishonest copy is structurally impossible to reintroduce unnoticed (mitigates T-15-10).

## Verification

- `node scripts/i18n-scan.mjs` → 0 issues ✓
- `node --test test/password-copy-honesty.test.mjs` → 3 pass / 0 fail ✓
- `npm test` → 471 pass / 0 fail (existing password-change + auth-revoked tests untouched and passing) ✓

## Deviations from Plan

**1. [Rule 3 - Blocking issue] Updated i18n-pages EN oracle**
- **Found during:** Task 2 full-suite run
- **Issue:** `test/i18n-pages.test.mjs:483` pinned the exact falsified string 'Password updated. Other sessions stay signed in.' — the locale fix alone made the suite fail (1 test).
- **Fix:** Oracle updated to the new honest value. FR oracle reads fr.json dynamically — no change needed.
- **Files modified:** test/i18n-pages.test.mjs
- **Commit:** 357a4ec

(Files touched beyond the plan's files_modified list are limited to this one oracle line — settings.js was not touched, per constraints.)

## Commits

- 1ae336a: fix(15-3): make settings.pw.done banner state revocation honestly (EN/FR)
- 357a4ec: test(15-3): add honesty regression guard for password success copy

## Known Stubs

None.

## Threat Flags

None — no new trust-boundary surface; the guard strengthens the locale-catalogue boundary (T-15-10 mitigated).

## Self-Check: PASSED
