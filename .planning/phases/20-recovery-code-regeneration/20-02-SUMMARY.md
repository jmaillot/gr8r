---
phase: 20
plan: 02
subsystem: client/2fa
tags: [2fa, recovery-codes, settings-ui, i18n]
requires: [POST /api/auth/tfa/recovery (20-01), D-53 recovery modal, D-90 tfa card]
provides: [api.tfaRecover, A.tfaAskRegen, A.tfaRegenConfirm, settings.tfa.regen* i18n keys (EN+FR)]
affects: [Phase 21 DIS-01 (uses err.tfaNotEnabled surface), /gsd-verify-work REGEN UAT]
tech-stack:
  added: []
  patterns: [stage-branch clone of the disable inline form, reused one-time modal (zero new display machinery, D-91)]
key-files:
  created: []
  modified: [src/core/api.js, src/pages/settings.js, src/actions/actions.js, src/locales/en.json, src/locales/fr.json, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs, test/i18n-core-features.test.mjs]
decisions:
  - "Regen form's code field is 6-digit-only semantics (autocomplete one-time-code, regenCodeLabel) — never the dual-shape disable codeLabel (D-85 client half)"
  - "Row-button mutual exclusion generalized: BOTH regen and turn-off buttons hide while any tfaStage is open"
  - "Success order mirrors enable-time block: tfaStage cleared first (Pitfall 6), codes into transient S.ui.recoveryCodes, openModal recovery, refreshTfa, toast"
metrics:
  duration: ~40m
  completed: 2026-10-29
actuals:
  tokens: 7400
  tasks: 2
  commits: 2
status: complete
plan_head_before: a03d43feb50ad375148b14f884c37666b4159ce4
plan_head_after: 2b64532674684fcc285c72239a7d08379d63e508
commits: 2
---

# Phase 20 Plan 02: Recovery-Code Regeneration (client half) Summary

**One-liner:** Regenerate-recovery-codes flow on the tfa settings card — inline password + 6-digit step-up form wired to `api.tfaRecover` → `POST /api/auth/tfa/recovery`, new codes shown exactly once through the reused D-53 modal, full EN + FR i18n.

## What Was Built

- **api.js**: `async tfaRecover(currentPassword, code)` posting to `/api/auth/tfa/recovery`, with a comment marking the response's plaintext codes as never persisted client-side (D-91).
- **settings.js**: regenerate button (`data-a="tfaAskRegen"`, btn-secondary) added to the on-state row; both row buttons hidden while any stage is open (generalized from `stage === 'disable' ? '' :` to `stage ? '' :`). New `stage === 'regen'` branch: form `data-submit="tfaRegenConfirm"` with `tfa-regen-pw` (current-password) and `tfa-regen-code` (one-time-code, 6-digit-only semantics per D-85 client half), the D-92 warning line above the buttons, Cancel via the existing `tfaCancel`.
- **actions.js**: `A.tfaAskRegen` (sets `S.ui.tfaStage = 'regen'`) and `A.tfaRegenConfirm` — client presence validation into `tfaRegenPw`/`tfaRegenCode`, then `loadingBtn('tfa-regen-save', …)`. Error switch: `wrongCurrentPassword|passwordRequired` → tfaRegenPw, `codeRejected|tooManyAttempts` → tfaRegenCode, `tfaNotEnabled` → `t('err.tfaNotEnabled')`, 503 → `t('err.masterKeyMissing')` (D-58 body never renders). Success: stage cleared FIRST (Pitfall 6), codes into transient `S.ui.recoveryCodes`, `render()`, `openModal({ type: 'recovery' })`, `refreshTfa()`, `toast(t('settings.tfa.regenToast'))`. No changes to modals.js or `A.recoveryDismiss`; no storage writes anywhere.
- **locales**: six `settings.tfa.regen*` keys in both en.json and fr.json (button, desc, password label, warning, 6-digit-only code label, success toast); `err.tfaNotEnabled` already landed in plan 01 and is reused.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Three structural count pins were suite-green-blocking**
- **Found during:** Task 2 full-suite run
- **Issue:** existing guard tests pin `data-a` sites (442), api call sites (29) and catalogue size (1575) exactly; the regen stage adds 3 data-a sites, 1 api call and 6 catalogue keys
- **Fix:** updated pins to 445 / 30 / 1581 with per-change comments (not weakened — counts stay exact)
- **Files modified:** test/i18n-shell.test.mjs, test/i18n-toast.test.mjs, test/i18n-core-features.test.mjs
- **Commit:** 2b64532

**Note (plan observation, no code deviation):** `err.tfaNotEnabled` was listed as a Task 1 key but already exists in both locales (plan 01 deviation #2 added it to satisfy the error-codes parity guard); Task 1 only added the six settings.tfa.regen* keys.

## Verification

- `node --test test/i18n-scan.test.mjs` — 25/25 pass
- `npm test` — 547/547 pass
- `grep -rn "recoveryCodes" src/ | grep -iE "localstorage|sessionstorage"` — no matches (D-91)
- `git diff 20-01..HEAD -- src/overlays/modals.js` — empty (zero new display machinery)

## Known Stubs

None.

## Threat Flags

None — client surface matches the plan's threat model exactly (no new endpoints, no storage, no auth-path changes; T-20-07 mitigated by the transient-only code path verified above).

## Self-Check: PASSED

- src/core/api.js contains `tfaRecover` → `/api/auth/tfa/recovery` — FOUND
- src/pages/settings.js + src/actions/actions.js contain `tfaAskRegen` and `tfaRegenConfirm` — FOUND
- Both locale files carry 6 `settings.tfa.regen*` keys — FOUND (grep count 6 each)
- Commit 3f97303 — FOUND
- Commit 2b64532 — FOUND
