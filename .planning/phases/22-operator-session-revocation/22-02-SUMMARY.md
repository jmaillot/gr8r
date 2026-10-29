---
phase: 22-operator-session-revocation
plan: 02
subsystem: operator-ui
tags: [operator-revocation, settings-card, i18n-catalogue, e2e-lifecycle]
requires: [is_instance_admin column, isInstanceAdmin gate, POST /api/auth/operator/users/:userId/revoke-sessions, D-28 central 401 teardown, D-90 inline-stage pattern]
provides: [GET /api/auth/operator/users, userPayload.isInstanceAdmin, settings operator card, api.operatorUsers/api.operatorRevokeSessions, refreshOperatorUsers + operatorRevokeAsk/Confirm/Cancel actions, 10 settings.operator.* keys EN+FR, e2e/operator-revoke-cycle.spec.mjs]
affects: [Phase 22 verifier, future instance-admin surfaces]
tech-stack:
  added: []
  patterns: [server-ground-truth card rendering (api.user.isInstanceAdmin, the twoFa convention), D-90 per-row inline confirm stage via S.ui.operatorRevoke, read route without throttle (D-121), fmt()-only e2e assertions]
key-files:
  created: [e2e/operator-revoke-cycle.spec.mjs]
  modified: [server.js, test/operator-revoke.test.mjs, src/pages/settings.js, src/core/api.js, src/actions/actions.js, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs]
decisions:
  - Operator card lives on the settings sessions tab (the security surface where revocation already lives), no new nav item — SET_NAV untouched
  - Owner-immunity hint asserted at the UI as the operator's own row showing the D-118 selfNote (no second flagged owner exists in e2e; no API can flag one)
  - users-list read route deliberately carries NO throttle (D-121); the revoke POST keeps the plan-01 caller-keyed band
metrics:
  duration: 55m
  completed: 2026-10-29
  tasks: 3
  commits: 3
  plan_head_before: 9bda52d4e4c0955a03839805920f3dbed88cbcf4
  plan_head_after: 90e637993c94868149edfdc65dda3249081dfac8
actuals:
  tokens: 40000
  tasks: 3
  commits: 3
status: complete
---

# Phase 22 Plan 02: Operator UI Surface & Lifecycle Proof Summary

**One-liner:** `GET /api/auth/operator/users` (D-121 five-field rows, no throttle) + `isInstanceAdmin` in userPayload + the operator-only settings card (D-120, D-90 inline confirm, owner-immune hints) with 10 catalogued EN/FR strings + a parametric EN+FR Chromium lifecycle spec proving enroll → regen → disable → re-enroll → revoke → honest signedOutElsewhere teardown with the operator surviving.

## What Was Built

1. **Server (Task 1, tracer):** `isInstanceAdmin: !!user.is_instance_admin` in `userPayload` (server.js:367); `GET /api/auth/operator/users` — sameOrigin → requireUser → operator gate (403 `operatorOnly`), no throttle, rows mapped to exactly `id, name, email, is_instance_admin, last_login_at` ordered by created_at. Three new tests in `test/operator-revoke.test.mjs`: exact-shape 200 (deepEqual on Object.keys), non-operator 403, unauthenticated 401. Suite 11/11.
2. **UI + catalogue (Task 2):** operator card in `src/pages/settings.js` sessions tab, rendered only when `api.user?.isInstanceAdmin` (server ground truth; the twoFa convention). Lists users from `refreshOperatorUsers()` (A.go mount hook); per-row D-90 inline confirm stage (`S.ui.operatorRevoke` carries the target id) with btn-danger Confirm + Cancel; owner rows show `settings.operator.ownerImmune`, the operator's own row the D-118 keep-current selfNote. `api.js` gained `operatorUsers()` / `operatorRevokeSessions()`; actions `operatorRevokeAsk/Cancel/Confirm` (401 left to the D-28 central intercept, error codes via tErr). 10 `settings.operator.*` keys in both locales. members.js untouched.
3. **e2e (Task 3):** `e2e/operator-revoke-cycle.spec.mjs` — parametric EN+FR, TOTP via totpAt (no backdoor), run-unique clientIp per account/context, all strings through fmt(). Lifecycle: API enroll → regenerate recovery codes → disable → re-enroll → victim 2FA browser login → bootstrap operator (D-113 ADMIN_EMAIL = e2e OWNER) opens the card, sees the users list, revokes the victim through the inline stage → victim's next requireUser surface fires the central `err.signedOutElsewhere` teardown + login form; operator still loads settings with the card. No existing spec touched (git shows only the new file in e2e/).

## Deviations from Plan

**1. [Rule 3 - Blocking] French catalogue typography + two tree-wide pins**
- **Found during:** Task 3 (`npm test`)
- **Issue:** The new fr.json strings used straight apostrophes and plain spaces before `;`/`?` (catalogue lint enforces narrow no-break spaces + typographic apostrophes); the `data-a` site count pin (445) in test/i18n-shell.test.mjs and test/i18n-toast.test.mjs broke with the card's 3 new actions; the catalogue key pin and verb pin (i18n-core-features) moved as expected and were advanced in Task 2.
- **Fix:** Narrow no-break spaces / typographic apostrophes in the 5 fr values; data-a pins 445→448 with changelog comments; verbs 30→32; catalogue keys 1584→1594 with the key changelog extended.
- **Files modified:** src/locales/fr.json, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs, test/i18n-core-features.test.mjs
- **Commit:** 90e6379

**2. [Decision documented] Immunity-hint e2e assertion shape**
- The plan's acceptance wording ("the immunity hint is visible") assumes a second flagged owner exists in e2e; no API route can flag one (by design, D-112) and the bootstrap operator is the only flagged account. The spec asserts the UI-side defense-in-depth that is honestly reachable: the operator's own owner row shows no revoke action and carries the selfNote. Server-side owner immunity remains pinned by the plan-01 D-119 suite.

**3. [Note] dist/ rebuild required**
- The e2e server serves the built SPA from dist/; the first spec run failed until `npm run build` picked up the new card code (dist is gitignored, no commit needed).

## Verification

- `node --test test/operator-revoke.test.mjs` — 11/11 pass
- `npm run i18n:scan` — 0 literals, 0 unresolved, 0 placeholder-mismatch
- `npm test` — 566/566 pass
- `npx playwright test --config e2e/playwright.config.mjs` — 61/61 pass (both operator-revoke-cycle langs green, twice)
- members.js unmodified; e2e/ diff contains only the new spec

## Threat Model Compliance

| Threat | Mitigation status |
|--------|-------------------|
| T-22-05 (users-list EoP) | Operator gate in-route; non-operator 403 + exact five-field shape regression-tested; no session/token/2FA columns |
| T-22-06 (CSRF) | sameOrigin first guard on the read route (revoke route already guarded in plan 01); card calls go through the same-origin api helper |
| T-22-SC (deps) | zero new dependencies |

## Known Stubs

None.

## Self-Check: PASSED

- e2e/operator-revoke-cycle.spec.mjs exists; all modified files committed
- Commits a19e465, da4c654, 90e6379 present in git log
- `git rev-list --count 9bda52d4..HEAD` = 3
