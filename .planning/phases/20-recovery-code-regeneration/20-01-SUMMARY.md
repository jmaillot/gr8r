---
phase: 20
plan: 01
subsystem: auth/2fa
tags: [2fa, recovery-codes, security-log, tott-stepup, rate-limiting]
requires: [Phase 19 envelope crypto (requireTotpSecret), enable/disable TFA routes]
provides: [POST /api/auth/tfa/recovery, security_log table, logSecurity helper, err.tfaNotEnabled]
affects: [Phase 21 DIS-01 (reuses security_log + logSecurity verbatim), plan 02 (settings UI)]
tech-stack:
  added: []
  patterns: [sibling-composed route (disable step-up + enable burn-and-replace), single-transaction fresh re-select]
key-files:
  created: [test/tfa-recovery-regen.test.mjs]
  modified: [server.js, src/locales/en.json, src/locales/fr.json, test/totp-encryption.test.mjs, test/i18n-core-features.test.mjs]
decisions:
  - "D-99 mechanism: minimal security_log table + logSecurity helper, written inside the regen transaction (success-only rows); Phase 21 DIS-01 reuses verbatim"
  - "503 body copy made per-route unique ('MASTER_KEY is not configured — codes cannot be regenerated until the admin sets it') to honor the D-81 byte-distinct-copy guard"
  - "in-transaction two_fa_enabled check (D-95) per research resolution; no pre-transaction fast-path"
metrics:
  duration: ~35m
  completed: 2026-10-29
actuals:
  tokens: 3300
  tasks: 2
  commits: 2
status: complete
plan_head_before: 665cb6458c4948d0d3e650f1756583fbac834bba
plan_head_after: d948c9defe502fb9e0044f2bcb5dc348652d0460
commits: 2
---

# Phase 20 Plan 01: Recovery-Code Regeneration (server half) Summary

**One-liner:** `POST /api/auth/tfa/recovery` — password + live-TOTP step-up with atomic burn-and-replace of 10 hashed recovery codes, structurally incapable of accepting a recovery code (D-85), own 5/15min throttle, plus the minimal `security_log` mechanism (D-99) shared with Phase 21.

## What Was Built

- **Route** (`server.js`, after the disable block): guard order sameOrigin → requireUser → `tooMany('tfa-regen|<uid>', 5, 15min)` → readJson; empty password → 400 `passwordRequired`; strict `/^\d{6}$/` gate with **no** recovery_codes lookup anywhere (D-85); 10 plaintext codes generated pre-transaction; one `transaction()` with fresh re-select, password → TOTP order (D-86), `requireTotpSecret` fail-closed → 503 (D-89), D-87 `two_fa_last_step` update, delete-all + hash-insert (D-97), `logSecurity(user.id, 'tfa_recovery_regenerated')` (D-99); outcome mapping 409 `tfaNotEnabled` / 403 `wrongCurrentPassword` / 503 `masterKeyMissing` / 400 `codeRejected`; success `{ ok: true, recoveryCodes }` via `json()` (no-store, D-100).
- **SCHEMA**: `security_log` table (id, user_id FK cascade, verb, created_at) + `security_log_user` index; `logSecurity(userId, verb)` helper.
- **Tests** (`test/tfa-recovery-regen.test.mjs`, 5 tests, real server + real SQLite): happy path (200, 10 new hashes, old set burned, last_step advanced, exactly one security_log row, `cache-control: no-store`), D-85 regression (captured plaintext code → 400 + byte-unchanged hash set + explicit second-success no-store re-assertion), D-95 409, D-93/D-94 throttle (5×403 then 6th → 429, independent budget), stale-window 400 + corrupted-envelope 503 with zero mutation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Regen 503 body copy conflicted with the D-81 uniqueness guard**
- **Found during:** Task 2 full-suite run (`test/totp-encryption.test.mjs` — "per-route 503 body copies" pins each copy at exactly 1 occurrence)
- **Issue:** the plan's route skeleton reused the disable route's 503 message byte-for-byte
- **Fix:** distinct admin-facing copy `'MASTER_KEY is not configured — codes cannot be regenerated until the admin sets it'`
- **Files modified:** server.js
- **Commit:** d948c9d

**2. [Rule 3 - Blocking] `err.tfaNotEnabled` missing from locale catalogues**
- **Found during:** Task 2 full-suite run (`test/error-codes.test.mjs` parity test)
- **Issue:** plan 02 owns UI i18n keys, but the error-code parity guard is suite-green-blocking now
- **Fix:** added `err.tfaNotEnabled` to en.json + fr.json; updated the i18n catalogue size pin 1574 → 1575 with changelog note
- **Files modified:** src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs
- **Commit:** d948c9d

**3. [Rule 3 - Blocking] Phase 19 decrypt call-site count outdated**
- **Found during:** Task 2 full-suite run (`test/totp-encryption.test.mjs` pinned exactly 2 wrapped call sites)
- **Issue:** the regen route legitimately adds a third `requireTotpSecret` surface (D-77)
- **Fix:** guard updated to 3 with a comment making the count a tracked per-route floor, not a hard 2
- **Files modified:** test/totp-encryption.test.mjs
- **Commit:** d948c9d

**Note (not a code deviation):** plan acceptance grep `grep -c "tfa-recovery" server.js` is a typo for `tfa/recovery` (present, count 1); all substantive acceptance greps hold (`tfa-regen|` ≥ 1, security_log ≥ 3, delete-only recovery_codes access in the route block).

## Verification

- `node --test test/tfa-recovery-regen.test.mjs` — 5/5 pass
- `npm test` — 547/547 pass (i18n, error-codes, totp-encryption, migration suites unbroken)
- Route block contains no recovery_codes read (only its own delete/insert writes)

## Known Stubs

None.

## Threat Flags

None — the implemented surface matches the plan's threat model exactly (no new endpoints beyond the planned route, no auth-path changes, no schema changes beyond the planned security_log table).

## Self-Check: PASSED

- test/tfa-recovery-regen.test.mjs — FOUND
- Route block in server.js — FOUND (grep `tfa/recovery` = 1)
- Commit 9e4bb5c — FOUND
- Commit d948c9d — FOUND
