---
phase: 16-totp-core-enrollment
plan: 02
subsystem: auth-tfa-enrollment
tags: [totp, enrollment, recovery-codes, aes-256-gcm, throttle, transaction, fail-closed]
requires:
  - totp.js (verifyTotpCode, generateTotpSecret, buildOtpauthUri, generateRecoveryCode, normalizeRecoveryCode, recoveryHash) from 16-01
provides:
  - POST /api/auth/tfa/enroll (D-49 password step-up, D-48 server-built otpauth URI)
  - POST /api/auth/tfa/enable (verify-before-enable TFA-03, D-05 v1: AES-256-GCM envelope, D-04 replay baseline, 10 hashed recovery codes)
  - POST /api/auth/tfa/disable (D-57 dual-shape verify, D-59 one-transaction teardown)
  - recovery_codes table + recovery_codes_user index (additive guarded-create, P-B)
  - pendingTfa in-memory Map with 10-min TTL (D-46)
  - encryptTotpSecret / decryptTotpSecret (MASTER_KEY-derived AES-256-GCM, fail-closed 503 per D-06)
  - err.noPendingEnrollment / err.codeRejected / err.masterKeyMissing catalogued EN+FR
affects: [16-03 settings UI, phase 17 login second step]
tech-stack:
  added: []
  patterns: [verify-before-enable state machine, memory-only pending secret with lazy-sweep TTL, one-transaction dual-shape verify + teardown, hash-only recovery codes]
key-files:
  created: [test/tfa-enrollment.test.mjs]
  modified: [server.js, test/migration.test.mjs, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs]
decisions:
  - "Recovery plaintexts are generated BEFORE the enable transaction, hashed inside it, and returned exactly once in the response body (D-53)"
  - "Disable resets two_fa_last_step to 0 (the Phase 14 NOT NULL no-baseline sentinel) rather than NULL — the column is integer not null"
  - "disable verifies inside one transaction() with a fresh re-select (Pitfall 4); a miss commits nothing, a recovery burn marks used_at then the teardown deletes the row"
metrics:
  duration: ~45 min
  completed: 2026-10-27
status: complete
actuals:
  tokens: 76000
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 4a1fd0be3d5fe615c3d03940bf1d7c00b0a8833a
plan_head_after: b3dda55
---

# Phase 16 Plan 02: Server-Side TFA Enrollment Lifecycle Summary

The three `/api/auth/tfa/*` routes on a memory-only pending-secret Map: password step-up enroll, verify-before-enable with 10 sha256-hashed recovery codes and the D-05 `v1:` AES-256-GCM envelope, and a dual-shape disable that tears everything down in one transaction — proven by a 12-case no-mock integration suite and second-boot migration purity.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Enroll + enable (tracer, TDD): recovery_codes table, pendingTfa Map, both routes | d26ab7c | server.js, test/tfa-enrollment.test.mjs |
| 2 | Disable route: dual-shape verify + complete teardown | 812c5f7 | server.js, test/tfa-enrollment.test.mjs, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs |
| 3 | Migration purity: recovery_codes in the second-boot snapshot | b3dda55 | test/migration.test.mjs |

## TDD Flow (Task 1)

- **RED:** test/tfa-enrollment.test.mjs written first against the password-change harness shape; ran and failed (routes 404).
- **GREEN:** SCHEMA guarded-create + pendingTfa Map + enroll/enable implemented; first run caught MASTER_KEY absent in the harness (503) — fixed per D-10 by injecting a throwaway MASTER_KEY in the suite env.
- **Tracer gate:** re-ran `node --test test/tfa-enrollment.test.mjs` end-to-end after Task 1 green — 5/5 pass; expanded to Task 2.

## Verification

- `node --test test/tfa-enrollment.test.mjs` — 12 pass / 0 fail (step-up, no-persist-before-enable, enable + DB state, rotation, noPendingEnrollment, wrong-code rejection, D-11 6th-attempt lockout, wrong-password disable, burned-code rejection, recovery-code teardown, disable throttle, D-06 fail-closed 503 without MASTER_KEY)
- `node --test test/migration.test.mjs` — 16 pass / 0 fail (byte-identical recovery_codes DDL across a third boot; guarded-create definition pinned to the SCHEMA declaration)
- `node --test test/password-change.test.mjs` — 5 pass / 0 fail (Phase 15 regression)
- `npm test` — 511 pass / 0 fail

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Critical] New stable error codes were missing from the i18n catalogues**
- **Found during:** Task 2 (`npm test` — error-codes.test.mjs red: `en missing err.noPendingEnrollment`)
- **Fix:** added `err.noPendingEnrollment`, `err.codeRejected`, `err.masterKeyMissing` to en.json + fr.json (typographic apostrophe in FR per french-typography.test.mjs) and updated the 1551→1554 catalogue count pin in test/i18n-core-features.test.mjs
- **Files modified:** src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs
- **Commit:** 812c5f7

**2. [Note - Constraint, not a deviation] `two_fa_last_step` reset uses 0, not NULL**
- The plan's disable behavior says "two_fa_last_step null", but the Phase 14 column is `integer not null default 0`. Teardown writes 0 — the established no-baseline sentinel the replay guard already treats as "no prior step". Tested in the D-59 case.

**3. [Note] Test design constraint:** the harness server allows 5 signups/hour per IP, so the 12-case suite reuses five accounts (login rather than re-signup) and simulates a burn by inserting a known-hash `used_at` row — the same state the Phase 17 login path will produce.

## Threat Model Compliance

- T-16-03: enroll verifies `currentPassword` with scrypt before any secret generation; wrong password → 403, no secret, throttle budget consumed (D-49/D-41)
- T-16-04: recovery codes stored sha256-hashed whole (`recoveryHash(normalizeRecoveryCode(code))` — Pitfall 6 one-normalization); plaintext exists only in the enable response body; never logged or persisted
- T-16-05: enable requires a pending Map entry (409 `noPendingEnrollment` otherwise); ±1 window + replay guard vs `two_fa_last_step` via 16-01's verifyTotpCode; `2fa-verify|ip|email` budget 5/15min (D-11)
- T-16-14: disable requires password AND code; burned rows rejected via `used_at is null`; distinct `tfa-disable|user.id` budget 5/15min
- T-16-08: pendingTfa swept lazily at size > 5000 (attempts-Map shape); 10-min TTL per entry
- T-16-09: enable without MASTER_KEY → fail-closed 503 `masterKeyMissing` BEFORE any state mutation, body names MASTER_KEY (admin-facing only); proved by a dedicated no-key server test
- T-16-SC: no package installs in this plan

## Key Decisions Made

- Plaintext recovery codes are generated before the enable transaction, hashed inside it, and returned once — no re-read path exists
- Enable writes the D-05 envelope (`v1:<iv>:<tag>:<ct>`, key = sha256(MASTER_KEY)) plus the matched step baseline in one transaction with the recovery rotation and pending-entry clear
- Disable restructures the plan's "verify inside the transaction" into a single `transaction()` returning an outcome code (`password`/`masterKey`/`code`/`ok`), so Pitfall 4's fresh re-select covers both verify legs and a miss commits nothing
- decryptTotpSecret mirrors encryptTotpSecret — Phase 17's login verify will import the same fail-closed semantics

## Known Stubs

None. All routes are fully implemented and integration-proven; no placeholder or unwired data paths.

## Self-Check: PASSED

- test/tfa-enrollment.test.mjs exists (12/12 green at SUMMARY time)
- Commits d26ab7c, 812c5f7, b3dda55 present in git log (3 commits measured from the plan ledger)
- Full suite green at SUMMARY time (511 pass / 0 fail)
