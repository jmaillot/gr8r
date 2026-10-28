---
phase: 15-password-change-end-to-end
plan: 02
subsystem: password-change
tags: [password, i18n, actions, api-client, node-test, tracer]
requires:
  - 15-01 (PATCH /api/auth/password route + wrongCurrentPassword/passwordRequired codes — consumed verbatim)
  - 14-05 central 401 intercept in api.js call() (D-44 — no new interceptor code)
  - refreshSessions / signOutRevoked wiring in actions.js (D-29, D-28)
provides:
  - api.changePassword(currentPassword, newPassword) — auth-scoped, no slug guard (D-34)
  - real A.savePassword — fake-success loadingBtn stub removed; code→field error mapping with D-39 field-clearing semantics
  - toast.passwordUpdatedAll honest count-free copy (D-37/D-43) catalogued EN+FR
  - test/auth-revoked.test.mjs D-44 routing case + no-local-401-branch source pin (T-15-08)
affects:
  - /gsd-verify-work (full password-change UAT now possible end to end)
tech-stack:
  added: []
  patterns:
    - code→field error mapping via t('err.' + code) with unknown-code fallthrough to call()'s generic translation (T-15-07)
    - new-password value round-trips through S.ui.pwNew so it survives the wrongCurrentPassword re-render (D-39)
    - pin counters refreshed in-commit (14-02 precedent): api call-site 24→25, catalogue size 1550→1551
key-files:
  created: []
  modified:
    - src/core/api.js
    - src/actions/actions.js
    - src/locales/en.json
    - src/locales/fr.json
    - test/auth-revoked.test.mjs
    - test/i18n-core-features.test.mjs
    - test/sessions.test.mjs
decisions:
  - new toast key toast.passwordUpdatedAll rather than extending toast.passwordUpdated client-side (D-37: exact copy, no composition, no count)
  - unknown error codes fall through to call()'s generic tErr translation under the current field; only wrongCurrentPassword/passwordRequired/passwordTooWeak get field-specific placement
  - pw-conf intentionally clears on a wrongCurrentPassword re-render — only #pw-cur is guaranteed (D-39 text); the surviving new-password value is what the decision protects
metrics:
  duration: 14min
  completed: 2026-10-27
status: complete
estimate:
  tokens: 48000
actuals:
  tokens: 5400
  tasks: 3
  commits: 3
plan_head_before: d1281c998dd535e42d3088cbac0ec82ff38edf1e
plan_head_after: 6e1edeae127dcbc56f04221b3df6e8f378d3ed7f
commits: 3
---

# Phase 15 Plan 02: Client Password-Change Rewiring + Honest Copy Summary

The password form now calls the real PATCH /api/auth/password via api.changePassword, maps the server's error codes to the right fields with D-39 field-clearing semantics, and toasts the count-free honest "password updated · other sessions disconnected" — with the D-44 revocation routing proven by test.

## What Was Built

### Task 1 — Tracer: API method, action rewiring, locale keys (commit 9a7ed2b)

- **api.changePassword()** in the auth-scoped block of src/core/api.js — `call('PATCH', '/api/auth/password', { currentPassword, newPassword })`, no slug guard, mirroring revokeAllSessions (D-34; NOT hung off PATCH /api/auth/me).
- **A.savePassword rewired**: the `loadingBtn('pw-save', 800, fake)` fake-success path replaced with a real `await api.changePassword(cur, nw)` inside the existing loading-button pattern. Local validation (D-45) and the pwStrength meter untouched.
- **D-39 semantics**: `wrongCurrentPassword` and `passwordRequired` map to `e.pwCur` (error under the CURRENT field, `#pw-cur` cleared by the re-render); the new password survives via the existing `S.ui.pwNew` round-trip in settings.js. `passwordTooWeak` maps to `e.pwNew`. Unknown codes fall through to `res.error` (call()'s generic tErr translation) — no hash/session state in copy (T-15-07).
- **Success (D-43/D-37)**: all three fields cleared, `S.ui.pwNew = ''`, `S.ui.pwDone = true` (banner stays alongside the toast — both honest), `await refreshSessions()` (D-29), count-free `toast.passwordUpdatedAll`. User stays signed in. NO local 401 branch (D-44).
- **toast.passwordUpdatedAll** added to en.json + fr.json ("Password updated · other sessions disconnected" / « Mot de passe mis à jour · autres sessions déconnectées »). err.wrongCurrentPassword/err.passwordRequired already catalogued by 15-01.

### Task 2 — D-44 proof by test (commit fc6f326)

- test/auth-revoked.test.mjs extended with the revoked-second-browser case: `api.changePassword` 401 `signInRequired` routes through the registered teardown (fired count 2→3 via the existing latch sequence), `res.status === 401` still returned to the caller.
- Source pin added: the `A.savePassword` block contains `api.changePassword` and NO `status === 401` branch — teardown is exclusively the central intercept (T-15-08, no double toast). No new harness code.

### Task 3 — Phase gate (commit 6e1edea)

- **[Rule 3] Pin refresh (14-02 precedent):** api call-site count 24 → 25 (changePassword) and catalogue size 1550 → 1551 (toast.passwordUpdatedAll) in test/i18n-core-features.test.mjs — `npm test` failed forward-parity pins before the bump.
- **[Rule 3, pre-existing] format:check was already red on test/sessions.test.mjs** (trailing comma) before this phase — prettier --write applied to it alongside the touched auth-revoked.test.mjs so the gate passes.

## Verification Performed

- Tracer gate re-run end-to-end: `node scripts/i18n-scan.mjs` (0 literals/0 pending) + `node --test test/error-codes.test.mjs` 24/24 + `node --test test/password-change.test.mjs` 5/5 — pass, expanded.
- `node --test test/auth-revoked.test.mjs` — 7/7 (was 6; +1 D-44 case, source pins extended).
- `npm test` — 468/468 pass, 0 fail.
- `npm run lint`, `npm run format:check`, `npm run build` — all exit 0 (build embeds the i18n-scan gate).
- Grep assertions: `loadingBtn('pw-save'` count is 1 (the real `pw-save, 0` async pattern, no fake-timer 800 stub); `api.changePassword` present in both api.js and actions.js.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pin counters in test/i18n-core-features.test.mjs**
- **Found during:** Task 3
- **Issue:** the new call site and toast key shifted the api call-site (24→25) and catalogue-size (1550→1551) pins; full suite failed forward-parity.
- **Fix:** bumped both pins in-commit with plan annotations (14-02 precedent, plan Task 3 explicitly directs this).
- **Files modified:** test/i18n-core-features.test.mjs
- **Commit:** 6e1edea

**2. [Rule 3 - Pre-existing] format:check red on test/sessions.test.mjs**
- **Found during:** Task 3
- **Issue:** trailing-comma prettier violation already present before this phase (out-of-scope file blocking the phase gate).
- **Fix:** prettier --write on the file; formatting only, no behavior change.
- **Files modified:** test/sessions.test.mjs
- **Commit:** 6e1edea

## Threat Model Compliance

- **T-15-07** (Info Disclosure): mitigated — errors map by stable code via `t('err.' + code)` only; unknown codes fall through to call()'s generic handling; the new-password value is never interpolated into error strings.
- **T-15-08** (Tampering): mitigated — no local 401 branch in A.savePassword (source-pinned by test); single teardown via the central intercept.
- **T-15-09** (Repudiation): mitigated — honest count-free toast catalogued EN+FR, reviewable in the i18n gate.

## Auth Gates

None.

## Known Stubs

None. Every `<verify>` ran and passed.

## Self-Check: PASSED

- Files on disk: src/core/api.js, src/actions/actions.js, src/locales/en.json, src/locales/fr.json, test/auth-revoked.test.mjs, test/i18n-core-features.test.mjs, test/sessions.test.mjs — all modified and committed.
- Commits verified in git log: `9a7ed2b`, `fc6f326`, `6e1edea`.
- `git rev-list --count d1281c9..HEAD` over code commits = 3 (matches `commits: 3`).
