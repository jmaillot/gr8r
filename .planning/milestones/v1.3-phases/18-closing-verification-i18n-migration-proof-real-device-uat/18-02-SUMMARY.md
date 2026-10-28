---
phase: 18-closing-verification-i18n-migration-proof-real-device-uat
plan: 02
subsystem: auth-e2e
tags: [e2e, playwright, auth, 2fa, i18n]

requires:
  - phase: 17-login-second-factor-flow
    provides: 2FA login flow (pending2fa screen, dual-shape code field) and 18-01's WR-01/WR-02 client fixes
  - phase: 14-schema-session-ground-truth
    provides: sessions API + revoke-all endpoint and D-28 central 401 teardown (err.signedOutElsewhere)
provides:
  - Chromium e2e proof of all three auth flows (2FA login, session revocation, password-change revocation) in EN + FR — AUTH-03's automated half
  - 10 new tests inside e2e/flows.spec.mjs (D-75: same file, no new spec/config)
affects: [18-04 real-device UAT]

actuals:
  tokens: 42000
  tasks: 3
  commits: 2

key-files:
  created: []
  modified:
    - e2e/flows.spec.mjs
    - e2e/server.mjs
    - src/styles/shell.css

key-decisions:
  - "Continued the stranded diff from the failed executor after verifying it against ground truth (locale keys, server route payloads, DOM selectors) instead of rewriting"
  - "e2e/server.mjs sets a throwaway random MASTER_KEY: the enable path's AES-256-GCM envelope (D-06) is the real behavior under test; the fail-closed 503 is production behavior, not the suite's target — no test-only backdoor (D-76 kept)"
  - "Rule 1 fix: shell.css's global `.sub { display:none }` (a sidebar-submenu rule) hid every auth-card subtitle including the 2FA masked-email copy — scoped to `.sitem .sub`"
  - "Two-device tests give device A the loop's negotiated locale (fr-FR for the fr variant) so fillLogin's catalogue labels match A's anonymous login form"

requirements-completed: [AUTH-03, AUTH-01]

# Metrics
duration: 70min
completed: 2026-10-27
status: complete
---

# Phase 18 Plan 02: Auth Flows e2e (EN+FR) Summary

**Chromium proof of the three auth flows — full 2FA login (TOTP computed locally via totp.js + recovery-code burn with the honest once-only toast), session revocation and password-change revocation with the signedOutElsewhere teardown — parametric EN + FR, 10 new tests inside flows.spec.mjs**

## Inherited diff handling

The previous executor attempt failed mid-task (screenshot-based verification crashed its model) and left uncommitted edits in `e2e/flows.spec.mjs` and `e2e/server.mjs`. The diff was assessed, not discarded: every locale key, server route payload (`secret`, `recoveryCodes`, `codeRejected`), DOM selector (`#tfa-login-code`, `.sitem[data-sec]`, `revokeAll`, `confirmOk`, `#pw-save`, `modal-wrap`) and the `maskEmail` format was checked against server.js, src/pages, src/actions and src/locales. The approach was plan-conformant; it was continued. Its bugs (found by running the gate) were fixed in place: missing `await` on the recovery-burn assertion, device A's context not negotiating the loop language (deterministic FR label mismatch, proven by a text-only probe), and the `2faneg` tag/workspace-slug colliding across the two negative-test instances (email/slug 409 when both land in one worker).

## Performance

- **Duration:** ~70 min
- **Completed:** 2026-10-27
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Full 2FA login happy path in Chromium for EN + FR: API enroll → `pending2fa` screen (masked-email subtitle via catalogue) → locally computed TOTP at submit time (D-76, ±1-window retry per D-04, replay-guard-aware step offset) → landed signed in on the account-locale workspace
- Recovery-code burn at the login 2FA step for EN + FR: dual-shape input, honest `auth.recoveryUsed` toast rendering exactly once (WR-02 fix from 18-01 intact)
- Wrong-code negative test: `err.invalidTfaCode` copy asserted and proven distinct from `err.challengeExpired` (boundary-flake diagnosability)
- Session revocation (Pitfall 9) EN + FR: device B dies into the D-28 teardown with `err.signedOutElsewhere`; device A's session survives and keeps acting
- Password change (Pitfall 12) EN + FR through the real settings surface: PASS-03 honest copy (`toast.passwordUpdatedAll`), B dies, A survives
- Zero package installs (T-18-SC); every asserted string catalogue-backed via `fmt()`, every API fixture step `must()`-checked, run-unique `clientIp` per account/context (Pitfall B)

## Task Commits

1. **Task 1: Full 2FA login e2e — TOTP locally computed, EN+FR (tracer)** - `fca9c1f` (test; includes the Rule 1 CSS fix and the e2e MASTER_KEY)
2. **Task 2: Session revocation and password-change revocation e2e, EN+FR** - `0d22d8b` (test)
3. **Task 3: Gate hygiene** - no code changes; full gate sequence run green (see below)

## Gate results (Task 3)

- `npm test`: 524 pass / 0 fail
- `npm run lint`: clean
- `npm run format:check`: clean
- `npm run build`: clean (full build, never build:en last — run-order rule honored)
- `npm run e2e`: **55 passed / 0 failed** (47 prior + 10 new auth tests minus re-counted variants — all green in Chromium)
- `package.json` untouched (gates stay explicit commands)
- `grep -c totpAt e2e/flows.spec.mjs` = 4; no `server.js` diff

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Global `.sub` CSS rule hid every auth-card subtitle**
- **Found during:** Task 1
- **Issue:** `shell.css` had a top-level `.sub { display:none }` (intended for the sidebar's `.sitem .sub` submenus) that `display:none`'d every auth-card subtitle — the 2FA masked-email copy (`page.auth.tfaSubtitle`) never rendered visibly, and the same latent bug hid subtitles on the login/signup cards for real users.
- **Fix:** Scoped the rule to `.sitem .sub` (the only consumer, `src/shell/layout.js:130`); verified by a text-only Playwright probe (`display: block`, 380×39 box).
- **Files modified:** src/styles/shell.css
- **Commit:** fca9c1f

**2. [Rule 1 - Bug] (inherited diff) Device A's login form language mismatch**
- **Found during:** Task 2 verification
- **Issue:** In the two-device tests, device A's context was created without a locale (en-US default) while `fillLogin(a, …, 'fr')` filled French catalogue labels — the FR variants could never pass.
- **Fix:** A's context negotiates the loop language (`fr-FR` for the fr variant), matching the test's documented intent that the fr variant runs the whole surface in French.
- **Files modified:** e2e/flows.spec.mjs
- **Commit:** 0d22d8b

**3. [Rule 1 - Bug] (inherited diff) Negative-test fixture collisions**
- **Found during:** Task 1 verification
- **Issue:** Both negative-test instances (en/fr loop) shared tag `2faneg` and workspace slug `2faneg-<run>`; when Playwright scheduled them into one worker (same run id) the second signup hit email/slug 409.
- **Fix:** Tag and slug made per-lang (`2faneg-${lang}`).
- **Files modified:** e2e/flows.spec.mjs
- **Commit:** fca9c1f

**4. [Rule 1 - Bug] (inherited diff) Missing await on the recovery-burn assertion**
- **Found during:** Task 1 verification
- **Issue:** `await expect(submitTfaCode(...)).toBe(true)` asserted on a Promise, failing instantly and aborting the still-running click.
- **Fix:** `expect(await submitTfaCode(...))`.
- **Files modified:** e2e/flows.spec.mjs
- **Commit:** fca9c1f

---

**Total deviations:** 4 auto-fixed bugs (2 in the inherited diff, 1 pre-existing app bug)
**Impact on plan:** All within the plan's files scope; no scope creep. The CSS fix is a user-facing correctness repair surfaced by the new tests.

## Issues Encountered
- `--repeat-each` reuses the worker's beforeAll `run` id, so fixture tags collide (signup 429/409) in repeat mode — an artifact of the harness, not of the suite; single-run and full-suite runs are green.

## Verification notes
- All verification was done via text output only (test-runner exit codes, stdout, a11y snapshots, DOM text probes) — no screenshots or image content were captured, per the executor constraint.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- AUTH-03's automated half is discharged and Phase 17's deferred visual verification of the 2FA login is retired by the Chromium proof
- 18-03 (migration proof) and 18-04 (real-device UAT) are unblocked; the human UAT walk can follow the proven e2e paths

---
*Phase: 18-closing-verification-i18n-migration-proof-real-device-uat*
*Completed: 2026-10-27*
