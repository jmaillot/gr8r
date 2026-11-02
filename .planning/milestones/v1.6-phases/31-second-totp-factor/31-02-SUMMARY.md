---
phase: 31-second-totp-factor
plan: 02
subsystem: auth-totp
tags: [totp, 2fa, multi-factor, routes, i18n]
requires: [totp_factors table, verifyTotpAgainstFactors helper (31-01), pendingTfa staging, v1.5 keyring]
provides: [POST /api/auth/tfa/factors/enroll, POST /api/auth/tfa/factors/enable, POST /api/auth/tfa/factors/remove, verifyTotpAgainstFactors excludeFactorId param, per-factor pendingTfa staging keys, err.labelRequired/labelTooLong/factorNotFound EN+FR]
affects: [tfa-disable, tfa-recovery-regen, tfa-login, Plan 31-03 (client wiring)]
tech-stack:
  added: []
  patterns: [shared-helper conversion of all step-up call sites, exclusion-parameter factor filtering (no second loop), verbatim teardown delegation for last-factor removal]
key-files:
  created: []
  modified: [server.js, test/tfa-multi-factor.test.mjs, test/totp-encryption.test.mjs, test/tfa-disable.test.mjs, test/tfa-recovery-regen.test.mjs, test/tfa-enrollment.test.mjs, test/tfa-login.test.mjs, test/i18n-core-features.test.mjs, src/locales/en.json, src/locales/fr.json]
decisions:
  - "Last-factor removal verifies the target's OWN code (helper unexcluded): applying the D-15 exclusion to a single-factor set would yield decrypted===0 → 503, making D-18's last-factor removal unreachable — the disable contract is the intended path."
  - "factors/enable stores the primary catalogue key for legacy-keyed pending entries (first-ever re-enable) and the enroll-supplied label for per-factor keys."
  - "First-ever enable via factors/enable returns the rotated recovery codes exactly once in the response (D-53) — Plan 03 must surface them."
  - "Stale-state supersession: the prior 31-02 run's commits (5357775/1f93860/84af399) never landed; this execution replaces them."
metrics:
  duration: ~50 min
  completed: 2026-11-01
status: complete
actuals:
  tokens: 13900   # 55600 diff chars / 4 over the realized diff (501+/53−, 10 files)
  tasks: 3
  commits: 3
plan_head_before: ec183bbde4e201c9967c9747c045b420f3a78fd4
plan_head_after: eb9f361
---

# Phase 31 Plan 02: Second TOTP Factor — Server Completion Summary

**One-liner:** All tfa step-ups and the enable challenge verify through the `totp_factors` single source of truth, plus the three factor-lifecycle routes — enroll (password + existing-factor code + required label), enable (staged secret, per-factor baseline, transactional insert), and remove (survivor-code guard, verbatim disable teardown for the last factor).

## What Was Built

- **Task 1 (`799a739`):** tfa/disable and tfa/recovery step-ups converted to `verifyTotpAgainstFactors` (decrypted===0 → 503 keeps the fail-closed contract; replay guard advances on the matched factor row); the pending-2FA enable challenge now verifies the STAGED pending secret with a null baseline (no users.two_fa_last_step read); Pitfall 5 sweep retires every users.two_fa_last_step write except the boot copy read and the disable teardown; pins finalized — one `wrapped` call site (the helper), zero route-level `'masterKey'` returns bypassing it (D-12). Test-side helpers (regen resetLastStep, corrupt-envelope plants, totp-encryption positive control, M2 snapshot) synced to the per-factor store.
- **Task 2 (`09ac7cc`):** POST `/api/auth/tfa/factors/enroll` (distinct `tfa-add-enroll` budget, password step-up, strict 6-digit gate, live code from an EXISTING factor before any secret is revealed — TOTP2-05/T-31-06; 409 for zero factors — additional factors only; trimmed label ≤64 chars, D-02; per-factor staging key `${userId}:${stagedId}` under the same 10-min TTL map, D-13). POST `/api/auth/tfa/factors/enable` (legacy userId-key fallback for the first-ever re-enable path; null-baseline verify of the staged secret; single-transaction factor insert with last_step = matched step; first-ever flip + recovery rotation with codes returned exactly once; success-only `tfa_factor_added` logSecurity). Tests T4–T8.
- **Task 3 (`eb9f361`):** helper gains the `excludeFactorId` param (D-16: no second loop); POST `/api/auth/tfa/factors/remove` — password gate, ownership 404, strict 6-digit gate; with >1 factor the code must verify against a SURVIVOR (D-15 self-lockout impossible); last-factor removal runs the disable teardown verbatim in one transaction (users flip, factor/recovery/challenge wipe, revoke-others-keep-current, D-18); single removal deletes only the target row, recovery untouched (D-17); `tfa_factor_removed` security verb. Tests T9–T13. Fixes: D-81 copy pin 3× (verify copy shared by factors/enroll + factors/remove), D-04 baseline assertion reads the factor row, `err.labelRequired/labelTooLong/factorNotFound` catalogue keys EN+FR (count 1626→1629).

## Deviations from Plan

### Auto-fixed Issues (Rules 1/2/3)

**1. [Rule 1 - Bug] D-15 exclusion would have bricked last-factor removal**
- **Found during:** Task 3 implementation
- **Issue:** Applying the target exclusion unconditionally leaves a zero-row candidate set for a single-factor user → decrypted===0 → 503 — the D-18 verbatim-disable path becomes unreachable, contradicting must-have truth #5 and T11.
- **Fix:** Exclusion applies only when factorCount > 1; the last factor verifies its own code (the disable contract).
- **Files:** server.js (factors/remove route)

**2. [Rule 3] Test-side stores synced to the per-factor replay guard**
- **Issue:** tfa-recovery-regen's `resetLastStep` zeroed only the users column; corrupt-envelope plants in tfa-disable/tfa-recovery-regen targeted users.two_fa_secret (no longer read); tfa-login and tfa-enrollment asserted the users baseline; the multi-factor M2 snapshot assumed the enable-time users write.
- **Fix:** All zero/plant/assert on `totp_factors` (the runtime store per D-06/D-10).
- **Files:** test/tfa-recovery-regen.test.mjs, test/tfa-disable.test.mjs, test/tfa-enrollment.test.mjs, test/tfa-login.test.mjs, test/totp-encryption.test.mjs, test/tfa-multi-factor.test.mjs

**3. [Rule 2] New route error codes catalogued**
- **Issue:** `labelRequired`/`labelTooLong`/`factorNotFound` had no err.* entries — the i18n error-codes gate failed.
- **Fix:** EN+FR keys added; catalogue pin 1626→1629.
- **Files:** src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs

**4. [Rule 1] D-81 503-copy pin count 1→3**
- **Issue:** The verify-route 503 copy is now shared by factors/enroll and factors/remove (same fail-closed contract, T-31-06/T-31-08) — the byte-identical pin saw 3 occurrences.
- **Fix:** Pin updated with the rationale comment.
- **Files:** test/totp-encryption.test.mjs

**5. [Rule 2] factors/enroll refuses zero-factor users with 409 tfaNotEnabled**
- **Issue:** Without the guard a 2FA-disabled user hitting the additional-factor route would get the misleading 503 masterKeyMissing (decrypted===0).
- **Fix:** Explicit count check before the step-up — first-ever enrollment is the legacy route's job (route contract).
- **Files:** server.js

## Auth Gates

None.

## Verification

- `node --test test/tfa-multi-factor.test.mjs test/totp-encryption.test.mjs` → 36/36 pass
- `npm test` → 680/680 pass
- Sweep: the only `update users set two_fa_last_step` write left is the disable teardown (server.js:2617); reads only in the boot copy — Pitfall 5/D-08 satisfied
- `decryptTotpSecret` exclusivity pin green: requireTotpSecret remains the only runtime caller

## Known Stubs

None — every surface is wired to server ground truth. (Client wiring for the new routes is Plan 03.)

## Self-Check: PASSED

- Commits 799a739 / 09ac7cc / eb9f361 present on HEAD (git log verified) ✔
- Rev-list count ec183bb..HEAD = 3, matching plan_head_before ledger ✔
- Routes present in server.js (grep factors/enroll|enable|remove) ✔
