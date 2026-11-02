---
phase: 31-second-totp-factor
plan: 03
subsystem: auth-totp-client
tags: [totp, 2fa, multi-factor, client, settings, i18n]
requires: [factors/enroll|enable|remove routes (31-02), tfaFactors + factor rows (31-01), staged tfa card pattern]
provides: [Add-factor staged wizard (addName→addPw→addVerify), per-factor remove confirm stage, tfaFactorEnroll/tfaFactorEnable/tfaFactorRemove wrappers, nine settings.tfa add/remove-factor keys EN+FR]
affects: [phase 31 verification (/gsd-verify-work), v1.6 milestone close]
tech-stack:
  added: []
  patterns: [staged-state wizard cloning tfaStage, D-58 503-body suppression in every new handler, refreshTfa() server ground truth after every mutation, D-53 recovery-modal reuse for rotated codes]
key-files:
  created: []
  modified: [src/pages/settings.js, src/actions/actions.js, src/core/api.js, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs, e2e/admin-revoke-cycle.spec.mjs, e2e/operator-revoke-cycle.spec.mjs, test/audit-log.test.mjs, test/totp-encryption.test.mjs, test/totp-rewrap.test.mjs, src/shell/render.js]
key-decisions:
  - "Add-factor button is hidden when the factor list is empty AND while any stage is open — first-ever enrollment stays on the legacy password-only setup wizard per the Plan 02 route contract (409 tfaNotEnabled guards the new route)."
  - "The remove confirm echoes the factor's localized name looked up from S.ui.tfaFactors by data-id — no name duplication in state, and the echo passes through esc() (T-31-12)."
  - "D-15 survivor-verify refusal arrives as codeRejected and is mapped to the code field; factorNotFound clears the stage and re-lists from the server."
  - "A.tfaCancel extended to clear the wizard's transient staging (secret/otpauth/stagedId/label/removeId) so no staged secret outlives the stage."
requirements-completed: [TOTP2-02, TOTP2-05]
metrics:
  duration: ~40 min (20:23–21:03 UTC)
  completed: 2026-11-01
status: complete
actuals:
  tokens: 9400    # chars/4 over the realized diff (238+/20−, 14 files; 64e9af3e..f7e3135)
  tasks: 3
  commits: 3
plan_head_before: 64e9af3e186cc86cfaf28a1b521662ef1855edd6
plan_head_after: f7e3135
---

# Phase 31 Plan 03: Second TOTP Factor — Client Wiring Summary

**One-liner:** The settings 2FA card gains the full factor lifecycle — localized list rows with relative last-used, the "Add factor" staged wizard (required naming → password + existing-factor code → QR/verify), and a per-factor remove confirm echoing the factor name — completing TOTP2-02/TOTP2-05 and the EN+FR i18n gate.

## What Was Built

- **Task 1 (`04b0923`):** `tfaFactorEnroll`/`tfaFactorEnable` wrappers beside the tfa family (auth-scoped). "Add factor" button in the 2FA card header, hidden while a stage is open or when the factor list is empty (first-ever enrollment keeps the legacy setup wizard). Stages `addName` (required label, client-mirrors the server's labelRequired gate, maxlength 64) → `addPw` (password + 6-digit live code from an existing factor) → `addVerify` (QR + copyable secret + live code, cloning the existing verify rendering). `A.tfaAddFactor*` handlers clone `A.tfaBeginEnroll`: errors cleared at stage entry, per-field error keys (`wrongCurrentPassword`/`passwordRequired`→pw, `codeRejected`/`tooManyAttempts`→code, `labelRequired`/`labelTooLong`→back to addName, `tfaNotEnabled`→off state), 503 → localized `err.masterKeyMissing`, response body never rendered (D-58). D-53 recovery codes surfaced exactly once through the transient modal if factors/enable rotates them. Six add-factor keys EN+FR (catalogue 1629→1635), api verb pin 36→38.
- **Task 2 (`4a71022`):** `tfaFactorRemove` wrapper. Per-row Remove button (data-id) opening the in-place staged confirm — factor name echoed via `esc(t(...))`, password + live code fields, no picker (D-16/D-19). `A.tfaAskRemove`/`A.tfaFactorRemove`: `factorNotFound` clears the stage and re-lists from the server, the D-15 survivor refusal arrives as `codeRejected` on the code field; success clears the stage before `await refreshTfa()` so the list re-renders from server ground truth (D-05) after every add/remove. Three remove keys EN+FR (catalogue 1635→1638), verb pin 38→39.
- **Task 3 (`f7e3135`):** Phase gate. fr.json D-05 typography fixes in the new keys (NBSP-padded guillemets, curly apostrophes); data-a count pins 456→466 (i18n-shell, i18n-toast); **Rule 1 bug fix:** `A.markAllRead` called the undefined `myNotifs` — the store import was added (runtime crash on mark-all-read); pre-existing lint errors cleared to make the gate green (unused vars/imports in e2e×2/audit-log/totp-encryption/totp-rewrap, unused eslint-disable in render.js, no-regex-spaces via `{2}` quantifiers in the re-wrap pins).

## Deviations from Plan

### Auto-fixed Issues (Rules 1/2/3)

**1. [Rule 1 - Bug] A.markAllRead crashed on an undefined helper**
- **Found during:** Task 3 (lint gate — no-undef surfaced it)
- **Issue:** `A.markAllRead` called `myNotifs()` which was never imported into actions.js — clicking mark-all-read threw at runtime. Pre-existing, but it lives in a file this plan touches and lint gate requires green.
- **Fix:** Added `myNotifs` to the existing `../core/store.js` import.
- **Files:** src/actions/actions.js
- **Commit:** f7e3135

**2. [Rule 3 - Blocker] Pre-existing lint errors blocked the phase gate**
- **Found during:** Task 3 (verify: `npm run lint`)
- **Issue:** 13 errors + 1 warning, ALL pre-dating phase 31 (verified identical set at pre-phase commit 47367c6d): unused vars/imports (e2e/admin-revoke-cycle, e2e/operator-revoke-cycle, test/audit-log, test/totp-encryption, test/totp-rewrap), an unused eslint-disable directive (src/shell/render.js), and no-regex-spaces on the re-wrap summary pins.
- **Fix:** Mechanical cleanup — removed unused imports/vars/directive, rewrote the double-space regex literals with `{2}` quantifiers (behavior-identical matches).
- **Files:** e2e/admin-revoke-cycle.spec.mjs, e2e/operator-revoke-cycle.spec.mjs, test/audit-log.test.mjs, test/totp-encryption.test.mjs, test/totp-rewrap.test.mjs, src/shell/render.js
- **Commit:** f7e3135

**3. [Rule 1 - Bug] French catalogue values breached D-05 typography**
- **Found during:** Task 3 (`test/french-typography.test.mjs`)
- **Issue:** New keys used straight apostrophes (`d'un`) and unpadded guillemets.
- **Fix:** Curly apostrophes (U+2019) and U+00A0-padded guillemets.
- **Files:** src/locales/fr.json
- **Commit:** f7e3135

**4. [Rule 3] Tracked-count pins synced**
- **Issue:** data-a tree-wide counts 456→466 (10 new staged controls), api verb sites 36→38→39, catalogue 1629→1635→1638.
- **Files:** test/i18n-shell.test.mjs, test/i18n-toast.test.mjs, test/i18n-core-features.test.mjs
- **Commits:** 04b0923, 4a71022, f7e3135

**Total deviations:** 4 auto-fixed (1 Rule 1 bug, 2 Rule 3 blockers/pins, 1 typography). **Impact:** none on plan scope — the gate now passes; all fixes are mechanical or correctness-restoring.

## Auth Gates

None.

## Verification

- `node --test test/i18n-scan.test.mjs test/build-locales.test.mjs test/catalogue.test.mjs test/i18n-core-features.test.mjs` → 0 fail (Task 1/2 verify)
- `npm test` → **680/680 pass**
- `npm run lint` → clean (0 errors, 0 warnings)
- grep verification: factor names render only via `esc(t(f.name))` (row) and `esc(rmName)` (confirm echo) — T-31-12 satisfied
- D-58: every new handler maps `res.status === 503` to `t('err.masterKeyMissing')`; response bodies never rendered

## Known Stubs

None — every surface is wired to server ground truth; no placeholder copy, no unwired props.

## Coverage

- deliverable: Add-factor wizard (name → step-up → QR/verify)
  human_judgment: false
  verification:
    - kind: command
      ref: node --test test/i18n-scan.test.mjs test/build-locales.test.mjs (0 fail)
      status: pass
    - kind: command
      ref: npm run lint (clean)
      status: pass
  rationale: stage order and step-up enforced client-side over the Plan 02 route contract; full-flow multi-factor enrollment is exercised server-side by test/tfa-multi-factor.test.mjs (31-02).
- deliverable: Per-factor remove confirm + list refresh
  human_judgment: true
  verification:
    - kind: command
      ref: npm test (680/680)
      status: pass
  rationale: the staged confirm's UX (name echo, field errors, list re-render after add/remove) has no client test harness — visual verification belongs to /gsd-verify-work.
- deliverable: EN+FR catalogue parity (9 new keys)
  human_judgment: false
  verification:
    - kind: test
      ref: test/i18n-core-features.test.mjs#catalogue-pin (1638)
      status: pass
    - kind: test
      ref: test/french-typography.test.mjs#D-05-rules
      status: pass

## Self-Check: PASSED

- Commits 04b0923 / 4a71022 / f7e3135 present on main (git log verified) ✔
- Rev-list count 64e9af3e..HEAD = 3, matching plan_head_before ledger ✔
- npm test 680/680 + npm run lint clean at HEAD ✔
- grep src/pages/settings.js: factor names only via esc()/t() paths ✔
