---
phase: 18-closing-verification-i18n-migration-proof-real-device-uat
plan: 01
subsystem: auth
tags: [2fa, client-state, regression, ui-state]

# Dependency graph
requires:
  - phase: 17-login-second-factor-flow
    provides: TFA login flow (A.doLogin/A.doTfaLogin/finishLogin) and 17-REVIEW.md WR-01/WR-02 findings
provides:
  - WR-01 fix: doTfaLogin success path resets S.ui.auth to 'login' before finishLogin
  - WR-02 fix: stale tfaRecoveryRemaining cleared at both login entries and in the success path (if/else)
  - test/tfa-state-fix.test.mjs source-structure regression pin (4 tests)
affects: [18-02 e2e flows, 18-04 pitfalls audit]

# Actuals (#2632)
actuals:
  tokens: 7400
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "source-structure regression pin: bodyOf() asserts on actions.js text ordering, no DOM needed"

key-files:
  created:
    - test/tfa-state-fix.test.mjs
  modified:
    - src/actions/actions.js

key-decisions:
  - "WR-02 success-path clear implemented as if/else after maskedEmail=null instead of an unconditional null: preserves the genuine burn count (plan's own prohibition) while satisfying the plan's ordering criteria"

patterns-established:
  - "Pattern: login-card state reset happens in the delegating action, never inside finishLogin (Pitfall E guard)"

requirements-completed: [AUTH-03]

coverage:
  - id: D1
    description: "WR-01: a 2FA login whose finishLogin fails renders the login card, never a stale '2fa' card"
    requirement: AUTH-03
    verification:
      - kind: unit
        ref: "test/tfa-state-fix.test.mjs#WR-01: doTfaLogin resets S.ui.auth to the login card before delegating to finishLogin"
        status: pass
    human_judgment: false
  - id: D2
    description: "WR-02: no spurious recovery toast after doLogin/doTfaLogin; genuine burn toast preserved"
    requirement: AUTH-03
    verification:
      - kind: unit
        ref: "test/tfa-state-fix.test.mjs#WR-02: the doTfaLogin success path clears a stale recovery count after maskedEmail"
        status: pass
      - kind: unit
        ref: "test/tfa-state-fix.test.mjs#WR-02: both doLogin and doTfaLogin clear a stale recovery count at entry"
        status: pass
    human_judgment: false
  - id: D3
    description: "Pitfall E guard: finishLogin never clears S.ui.auth (normal login path intact)"
    requirement: AUTH-03
    verification:
      - kind: unit
        ref: "test/tfa-state-fix.test.mjs#Pitfall E: finishLogin never clears S.ui.auth — the normal login path depends on it"
        status: pass
    human_judgment: false
  - id: D4
    description: "Whole-suite guard at Phase 17 baseline: i18n-scan, catalogue/build-locales, lint, format, build, npm test"
    verification:
      - kind: integration
        ref: "command: node scripts/i18n-scan.mjs && node --test test/catalogue.test.mjs test/build-locales.test.mjs && npm run lint && npm run format:check && npm run build && npm test"
        status: pass
    human_judgment: false

# Metrics
duration: 10min
completed: 2026-10-27
status: complete
---

# Phase 18 Plan 01: 2FA State Lifecycle Fix Summary

**WR-01/WR-02 client state fixes for the 2FA login flow — the auth card resets before finishLogin and stale recovery-toast state can no longer survive a login — pinned by a 4-test source-structure regression suite**

## Performance

- **Duration:** 10 min
- **Started:** 2026-10-27T19:52:00+01:00
- **Completed:** 2026-10-27T20:02:00+01:00
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `A.doTfaLogin` success path sets `S.ui.auth = 'login'` before `await finishLogin(...)`, so any post-verify failure render (workspace hydrate / invite accept) lands on the login card, not a stale 2FA card with an empty masked email
- Stale `S.ui.tfaRecoveryRemaining` cleared at the entry of both `A.doLogin` and `A.doTfaLogin` and in the doTfaLogin success path (if/else) — a spurious recovery toast can no longer fire on a later login, while a genuine burn count still survives to `reportRecoveryBurn()`
- `finishLogin` untouched (Pitfall E guard) and pinned by test
- Whole suite green at the Phase 17 baseline + 4 new tests: **524 pass / 0 fail**, i18n-scan 0 findings, lint/format/build clean

## Task Commits

1. **Task 1: Apply WR-01/WR-02 fix and pin it with a source-structure regression test** - `cf7ec66` (fix)
2. **Task 2: Whole-suite guard — fix breaks nothing** - `c497243` (test: prettier formatting)

## Files Created/Modified
- `src/actions/actions.js` - WR-01 auth-card reset + WR-02 recovery-count clears (entry + success path if/else)
- `test/tfa-state-fix.test.mjs` - 4-test source-structure regression pin (bodyOf pattern from locale-negotiate)

## Decisions Made
- WR-02 success-path clear implemented as `if (typeof ... === 'number') set; else clear` placed after `S.ui.maskedEmail = null` instead of the plan's literal unconditional `S.ui.tfaRecoveryRemaining = null` between `maskedEmail = null` and `finishLogin`. The literal version would have erased the burn count set just above — which the plan itself prohibits ("the value set in the success path must survive until the toast fires"). The if/else ordering satisfies every acceptance criterion verbatim (last null-clear before `finishLogin` is after `maskedEmail = null`) while preserving the genuine burn report.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's literal WR-02 success-path fix contradicted its own prohibition**
- **Found during:** Task 1
- **Issue:** The plan's `<action>` prescribed inserting an unconditional `S.ui.tfaRecoveryRemaining = null` between `S.ui.maskedEmail = null` and `await finishLogin(` — but the success path sets the burn count before that point, so the unconditional clear would destroy it and break `reportRecoveryBurn()` (the plan's own prohibition and truths[2]).
- **Fix:** Reordered so the burn-count set happens after `S.ui.maskedEmail = null`, as an if/else (`else S.ui.tfaRecoveryRemaining = null`). Stale counts are cleared; genuine burns survive. All acceptance-criteria orderings hold.
- **Files modified:** src/actions/actions.js
- **Verification:** test/tfa-state-fix.test.mjs 4/4 pass; npm test 524/0
- **Committed in:** cf7ec66 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The fix implements the plan's intent exactly; no scope creep.

## Issues Encountered
- `format:check` flagged the new test file on first run (Task 2) — fixed with `prettier --write` and re-verified; committed as c497243.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 2FA failure-surface state lifecycle is fixed; 18-02's e2e suite can exercise the 2FA path against the corrected client
- D-84 discharged; no blockers

---
*Phase: 18-closing-verification-i18n-migration-proof-real-device-uat*
*Completed: 2026-10-27*
