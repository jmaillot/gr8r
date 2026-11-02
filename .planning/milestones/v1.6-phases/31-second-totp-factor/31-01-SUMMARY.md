---
phase: 31-second-totp-factor
plan: 01
subsystem: auth-totp
tags: [totp, 2fa, migration, sqlite, i18n]
requires: [v1.5 keyring (requireTotpSecret/encryptTotpSecret), pendingTfa staging, login challenge flow]
provides: [totp_factors table, migrateTotpFactors boot copy, verifyTotpAgainstFactors helper, GET /api/auth/tfa/factors, factor rows in settings 2FA card, settings.tfa.factor.primary catalogue key EN+FR]
affects: [tfa-login, tfa-enable, tfa-disable, migrateTotpReWrap, Plan 31-02, Plan 31-03]
tech-stack:
  added: []
  patterns: [boot-time guarded migration (D-83 gate → backup → transaction → summary), single decrypt boundary, additive create-if-not-exists schema]
key-files:
  created: [test/tfa-multi-factor.test.mjs]
  modified: [server.js, test/migration.test.mjs, test/totp-encryption.test.mjs, test/tfa-disable.test.mjs, test/tfa-enrollment.test.mjs, test/i18n-core-features.test.mjs, src/core/api.js, src/actions/actions.js, src/pages/settings.js, src/locales/en.json, src/locales/fr.json]
decisions:
  - "Factor `name` stores the FULL locale key `settings.tfa.factor.primary` (not the plan's shorter `tfa.factor.primary`) so the client renders it with t(row.name) directly — within D-07's wording discretion."
  - "Enable path inserts the totp_factors row in the same transaction (Rule 2): without it a newly enrolled user could never complete a TOTP login and existing positive-path tests would 503."
  - "Disable teardown deletes the user's totp_factors rows (Rule 2, no-half-state): otherwise re-enroll would stack a second row and the boot copy's anti-join would go stale."
  - "migrateTotpReWrap extended to re-seal totp_factors.secret under the CURRENT key (Rule 2): a factor row left under the old key would brick TOTP login after a MASTER_KEY rotation."
metrics:
  duration: ~23 min (19:37–20:00 UTC)
  completed: 2026-11-01
status: complete
actuals:
  tokens: 10859   # 43437 diff chars / 4 over the realized diff
  tasks: 3
  commits: 3
plan_head_before: 47367c6df61af3534c9136d43d6d92be080530cb
plan_head_after: ed5990b
---

# Phase 31 Plan 01: Second TOTP Factor — Tracer Slice Summary

**One-liner:** `totp_factors` single source of truth with one-time boot copy (D-06/D-09), a shared `verifyTotpAgainstFactors()` helper converted into the login second step, and a localized factor list in the existing settings 2FA card.

## What Was Built

- **Task 1 (TDD red, `6e0740d`):** `test/tfa-multi-factor.test.mjs` — M1 boot-copy row pin, M2 byte-identical second boot, T1 any-factor login, T2 per-factor replay guard, T3 decrypt-boundary grep. `test/migration.test.mjs` gained `totp_factors` in the pragma snapshot list plus a sqlite_master-backed second-boot byte-identity pin (green pre-table, meaningful post-schema). RED confirmed: 5 failing tests for the right reason (missing table/helper).
- **Task 2 (tracer, `cea2670`):** SCHEMA `totp_factors` + index; `migrateTotpFactors()` boot copy (decrypt-free envelope verbatim, `last_step` from `users.two_fa_last_step`, catalogue-key name, JS anti-join + in-transaction per-row re-check, backup-first, zero-eligible early return); `verifyTotpAgainstFactors()` helper after `pendingTfa`; login TOTP branch converted (decrypted===0 → 503, !ok → code, matched factor's `last_step` updated, zero users-column writes). Deliberate pin update 3→2 (`if (!wrapped.ok) return 'masterKey'` — helper uses `continue` per D-12).
- **Task 3 (`ed5990b`):** GET `/api/auth/tfa/factors` (standard tfa preamble, metadata only), `api.tfaFactors()`, `refreshTfa()` populates `S.ui.tfaFactors`, one `srow()` per factor in the 2FA card (catalogue-localized name + relative last-used), `settings.tfa.factor.primary` EN+FR.

## Deviations from Plan

### Auto-fixed Issues (Rules 1/2 — all required for end-to-end coherence)

**1. [Rule 2] Enable path inserts the totp_factors row**
- **Found during:** Task 2 (tracer gate — full-suite run)
- **Issue:** With the login branch reading only `totp_factors`, a user enrolling via HTTP could never log in (no factor row until reboot); existing positive-path tests (writer flip, SC-2 round-trips) 503'd.
- **Fix:** The enable transaction inserts the factor row (`name` = catalogue key, `last_step` = matchedStep) alongside the users columns; first-ever semantics unchanged.
- **Files:** server.js (enable route)

**2. [Rule 2] Disable teardown deletes factor rows**
- **Issue:** Without it, disable→re-enroll stacks a second row and the boot copy anti-join never fires — no-half-state violation (D-18 spirit).
- **Fix:** `delete from totp_factors where user_id = ?` inside the existing disable transaction.
- **Files:** server.js (disable route)

**3. [Rule 2] Re-wrap rotation pass re-seals factor rows**
- **Issue:** `migrateTotpReWrap` converged only `users.two_fa_secret`; a factor row under the old key would brick TOTP login after MASTER_KEY rotation (SC-1 tail test caught it).
- **Fix:** Stale-candidate scan and re-seal now cover both stores in one pass/backup/summary.
- **Files:** server.js (migrateTotpReWrap)

**4. [Rule 3] Test-side baseline helpers sync both stores**
- **Issue:** `resetLastStep`/`signIn2fa`/`plant`/`enableFor` in tfa-disable, tfa-enrollment, totp-encryption only touched the users column; the login verify reads the per-factor guard.
- **Fix:** Those helpers zero/sync `totp_factors.last_step`/`secret` alongside; multi-factor fixture deletes the enable-inserted row to recreate the true pre-migration shape.
- **Files:** test/tfa-disable.test.mjs, test/tfa-enrollment.test.mjs, test/totp-encryption.test.mjs, test/tfa-multi-factor.test.mjs

**5. [Rule 3] Tracked-count pins updated**
- **Issue:** API call sites 35→36 (`tfaFactors`), catalogue 1625→1626 (`settings.tfa.factor.primary`).
- **Files:** test/i18n-core-features.test.mjs

## Auth Gates

None.

## Verification

- `node --test test/tfa-multi-factor.test.mjs test/migration.test.mjs test/totp-encryption.test.mjs` → 56/56 pass
- `npm test` → 670/670 pass
- `decryptTotpSecret(` occurrences: 4 (definition, wrapper, D-K7 probe, re-wrap) — exclusivity pin green
- i18n parity + build-locales suites green

## Known Limitations (interim, Plan 02 closes)

- **Interim replay-guard divergence:** the login branch now guards per-factor, but the disable and recovery-regen step-ups still verify against `users.two_fa_last_step` (their conversion to the shared helper is Plan 02 per D-10). Until then, the users column can lag the factor row, so a code used at login is not replay-guarded at those two step-ups within the ±1 window. Severity: low (both step-ups also require the current password); closes in Plan 02.
- Pre-existing `update users set two_fa_last_step` writes remain at the enable insert, disable reset and regen routes (out of this plan's scope; Plan 02's call-site sweep retires the reads, after which the column is kept-unread per D-08).

## Known Stubs

None — every surface this plan touches is wired to server ground truth.

## Self-Check: PASSED

- test/tfa-multi-factor.test.mjs exists ✔
- Commits 6e0740d / cea2670 / ed5990b present on HEAD ✔
- Commits measured: 3 (rev-list 47367c6d..HEAD) ✔
