---
phase: 21-disable-2fa-verification-closure
plan: 02
subsystem: auth/tfa-e2e
tags: [e2e, playwright, 2fa, i18n, auth]
requires: [strict-disable-gate, challenge-teardown, revoke-others-on-disable, tfa-disable-form, fmt-catalogue]
provides: [test/e2e-tfa-disable-cycle, d102-ui-regression, d106-session-policy-e2e]
affects: []
tech-stack:
  added: []
  patterns: [parametric-lang-describe, two-context-cookie-jar, fmt-catalogue-assertions, nextWindow-replay-guard]
key-files:
  created:
    - e2e/tfa-disable-cycle.spec.mjs
  modified: []
decisions:
  - D-109 full-cycle Chromium spec parametric in EN+FR; re-enable via API on a fresh session (disable revoked the original API session per D-105)
  - D-102 asserted at the UI level through the real tfaDisableConfirm form; D-106 via two contexts with genuinely separate cookie jars
  - zero new locale strings — every asserted key was pre-catalogued (D-111)
metrics:
  duration: 43m
  completed: 2026-10-29
status: complete
actuals:
  tokens: 4200
  tasks: 2
  commits: 1
commits: 1
plan_head_before: 5db337d6ca411a411591222675f637eca5b391ea
plan_head_after: 8b09152b0b60e97d183062dd2be1ce076c1a97b2
---

# Phase 21 Plan 02: Full-Cycle 2FA Disable e2e (EN+FR) Summary

**One-liner:** One parametric Chromium spec proving the tightened disable route end-to-end in EN + FR — enable → login with 2FA → disable (password + live TOTP through the shipped form) → login without 2FA → re-enable — plus the D-102 recovery-code rejection regression at the form and the D-106 two-session honest-401 teardown, with i18n-scan green and zero new strings.

## What Was Built

### Task 1 — `e2e/tfa-disable-cycle.spec.mjs` — commit 8b09152

Two tests × two languages (4 Chromium runs), helpers locally copied from the flows.spec.mjs
conventions (flows.spec.mjs untouched):

1. **Full cycle (D-109):** API enroll+enable → browser login with a locally computed TOTP →
   settings tfa card → `data-a="tfaAskDisable"` → the real `data-submit="tfaDisableConfirm"`
   form (`#tfa-off-pw` / `#tfa-off-code` / `#tfa-off-save`) → success toast + server-ground-truth
   off state → fresh-cookie-jar login lands directly on the workspace (no pending2fa screen) →
   re-enable through the API on a fresh session (the original API session was revoked by D-105,
   which the fresh login itself re-proves).
2. **D-102 at the UI level:** a valid, unused recovery code typed into `#tfa-off-code` surfaces
   the server's `err.codeRejected` copy under the field with 2FA still on and the form still
   mounted.
3. **D-106 session policy:** two contexts = two cookie jars; after the disable, session B dies on
   its next requireUser surface with `err.signedOutElsewhere` and the login form, while session A
   still sees its sessions-tab ground truth.

Deterministic replay-guard discipline: `nextWindow(lastStepSec)` waits out the 30s step consumed
server-side (`two_fa_last_step`) before every submit — enable, each login, the disable — so no
code can be refused by the D-04 guard or fall outside the ±1 verify window. Every asserted string
resolves through `fmt()` against the locale catalogue; zero raw literals.

### Task 2 — i18n discipline + full gates — no commit (no file changes)

Audited the spec's 15-key fmt set against en.json + fr.json: all present, symmetric — zero new
strings needed (D-111 satisfied by reuse, as the plan preferred). Gates: `npm run i18n:scan` →
0 literals / 0 pending / 0 stale; full Playwright suite → 59/59 passed (no sibling regressions);
`npm test` → 555/555.

## Deviations from Plan

**1. [Rule 1 - Bug] Offset-based TOTP retry was structurally unsound; replaced with the deterministic nextWindow() wait.**
- **Found during:** Task 1 first runs (4/4 failed)
- **Issue:** The planned `tfaCode(secret, offset)` retry pattern from the phase-18 block only works
  when the first submit is within one step of now: the server verifies against a ±1 window around
  the current step AND refuses s ≤ lastStep, so a "retry with the next step's code" can easily
  submit a step +2 ahead (no-match) or a step at/below the consumed one (replay) — both hard
  failures, as observed in the traces.
- **Fix:** Capture the exact consumed epoch at enable (and chain it through each login); before
  every submit, `nextWindow()` waits until the server's step has strictly moved past it, then
  submits the current step's code. Deterministic; one retry retained for the residual boundary race.
- **Files:** e2e/tfa-disable-cycle.spec.mjs

**2. [Rule 1 - Bug] Stale codeRejected error poisoned the disable success race.**
- **Found during:** Task 1 (trace analysis — the TOTP disable POST returned 200 while the test
  took the rejection branch)
- **Issue:** The error span from the D-102 recovery-code attempt was still rendered when the
  subsequent TOTP submit raced error-vs-toast, so the race resolved on the stale text and the test
  looped.
- **Fix:** `disableWithTotp` resets the stage (tfaCancel → tfaAskDisable) before submitting, so the
  race only sees fresh state; success-path assertions moved to the persistent off-state row (the
  helper consumes the transient toast).
- **Files:** e2e/tfa-disable-cycle.spec.mjs

**3. Execution-environment note:** the user's brand-rename commit (5db337d, "Projects Studio"
wordmark) landed mid-execution and included an intermediate draft of the spec file; the Task 1
commit carries the final diff on top of it. `plan_head_before` is therefore 5db337d, not the
21-01 head. All asserted copy goes through the catalogue, so the rename did not touch the spec.

## Verification

- `npx playwright test --config e2e/playwright.config.mjs e2e/tfa-disable-cycle.spec.mjs` — 4/4 pass (EN + FR)
- Full suite `npx playwright test --config e2e/playwright.config.mjs` — 59/59 pass
- `npm run i18n:scan` — 0 literals / 0 pending / 0 unlisted / 0 stale
- `npm test` — 555/555 pass
- ESLint clean on the new spec

## Threat Model Check

T-21-07 mitigated: the D-106 assertion drives a real second browser context through the honest
401 teardown (`err.signedOutElsewhere`) after the disable, proving the D-105 delete in the live
session pipeline. T-21-08 mitigated: every assertion is `fmt()`-backed and i18n-scan is green.
T-21-SC: no packages installed. No new network/auth/file surface beyond the plan's threat model.

## Known Stubs

None — the spec drives only shipped surfaces (settings tfa card, login form, sessions tab) and
the real API.

## Self-Check: PASSED

- e2e/tfa-disable-cycle.spec.mjs exists ✓
- Commit 8b09152 present in git log ✓
