---
phase: 17-login-second-factor-flow
reviewed: 2026-10-27T00:00:00Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - server.js
  - src/actions/actions.js
  - src/core/api.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/pages/auth.js
  - test/dependencies.test.mjs
  - test/error-codes.test.mjs
  - test/fixtures/icons-baseline.json
  - test/helpers/server.mjs
  - test/i18n-core-features.test.mjs
  - test/i18n-pages.test.mjs
  - test/i18n-shell.test.mjs
  - test/i18n-toast.test.mjs
  - test/locale-negotiate.test.mjs
  - test/tfa-enrollment.test.mjs
  - test/tfa-login.test.mjs
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-10-27
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Reviewed the Phase 17 second-factor login implementation (server.js login branch + `POST /api/auth/tfa/login`, client `s === '2fa'` flow, locales, tests) against plans 17-01/17-02 and the threat register (T-17-01…T-17-09, T-17-SC).

**Threat mitigations — all verified present in code:**
- **T-17-01** (code brute-force): throttle `2fa-login|ip|email` 5/15min (server.js:1610) + 3-wrong-codes challenge death (1626–1631) + D-03 budget carry-over — `attempts.delete` exists at exactly two success sites (1402, 1688), the pending branch never clears; `tooMany` increments before verify inside the transaction (D-67 anti-race).
- **T-17-02** (challenge cookie as identity): `currentUser()` (1248–1261) reads only `gr8r_session`; the D-71 matrix test proves 401-anonymity across requireUser routes, file GET, PATCH me, and `{ user: null }` on the probe.
- **T-17-03** (CSRF): `sameOrigin(req)` first at server.js:1599, before body read and throttle.
- **T-17-04** (failure oracle): one generic `invalidTfaCode` for wrong-TOTP and dead-recovery (1677); empty codes rejected pre-transaction without consuming state.
- **T-17-05** (429 timing disclosure): `grep -c "Try again in 15 minutes" server.js` = 0; all 429s carry generic copy + catalogued `tooManyAttempts`; `err.tooManyLoginAttempts` removed from both catalogues.
- **T-17-06** (TOTP replay): matched-step guard written inside the mint transaction (1644–1646), replay test passes.
- **T-17-07/08/09** (client): `api.login` skips `applyUser` on `pending2fa` (api.js:176); only the server `maskedEmail` is rendered, esc()'d; one dual-shape field, no client shape branching.
- **T-17-SC**: no new dependencies; Dockerfile runtime COPY updated to ship totp.js with the dependency test updated to match.

Atomicity (Pitfall 4) holds: burn + challenge-delete + session mint + `two_fa_last_step` write are one `transaction()` (1618–1674); `recoveryRemaining` computed in-transaction; the burn uses the `used_at is null` conditional with `changes !== 1` rejection. Sweeper present at boot + hourly unref (2642–2643). `userPayload()` is explicit-field — the encrypted `two_fa_secret` never leaks in the verify response. maskEmail is first-char-only, nothing persisted.

Verification run: `node --test test/tfa-login.test.mjs` 9 pass / 0 fail; `npm test` 520 pass / 0 fail; `node scripts/i18n-scan.mjs` exit 0; `npm run lint` and `format:check` clean.

Findings below are confined to the client failure paths; no security or data-integrity defects found.

## Warnings

### WR-01: Verify success leaves `S.ui.auth = '2fa'` — post-verify failure branches re-render a stale 2FA card with an empty masked email

**File:** `src/actions/actions.js:2768-2772` (with `src/pages/auth.js:102`)
**Issue:** On verify success `doTfaLogin` calls `applyUser`, clears `S.ui.maskedEmail`, then delegates to `finishLogin`. If `finishLogin` takes a failure branch — workspace hydrate failure (`actions.js:2665-2669`) or queued-invite accept failure (`2640-2644`) — it calls `render()` while `S.ui.auth` is still `'2fa'` and `S.ui.maskedEmail` is now `null`. The user is actually signed in (the server minted the session), but the UI re-renders the code screen with the subtitle interpolating an empty `{email}` ("… pour .") and a stale `e.login` error. A second submission there can only 401 `challengeExpired` (the row was deleted), producing a confusing dead-end before the user recovers via reload. `doLogin` does not have this problem because its post-success state is already `'login'`.
**Fix:** Reset the auth state before delegating, so any `finishLogin` failure render lands on the login card:

```js
// in A.doTfaLogin, success path, before await finishLogin(...):
S.ui.auth = 'login';
S.ui.maskedEmail = null;
await finishLogin(api.user?.name || api.user?.email || '', done);
```

### WR-02: Stale `S.ui.tfaRecoveryRemaining` can fire a spurious recovery toast on a later, unrelated login

**File:** `src/actions/actions.js:2770` (set) and `src/actions/actions.js:2681-2687` (`reportRecoveryBurn`)
**Issue:** `recoveryRemaining` is stashed on `S.ui` before `finishLogin`, but `reportRecoveryBurn()` only runs on `finishLogin`'s success paths (2652, 2674). If `finishLogin` fails after a recovery burn (hydrate/invite failure — reachable per WR-01), the stored count survives. The next successful `finishLogin` — potentially a later password-only login after 2FA was disabled, or a different account in the same tab — calls `reportRecoveryBurn()` and toasts "Recovery code used — you have N left" for a burn that did not happen in that login. Misleading copy only; no data risk.
**Fix:** Clear the slot defensively at the entry of both `doLogin` and `doTfaLogin` (alongside `S.ui.errors = {}`), or clear it in `finishLogin`'s failure branches:

```js
S.ui.tfaRecoveryRemaining = null; // at A.doLogin / A.doTfaLogin entry
```

## Info

### IN-01: D-71 matrix asserts 409 for invite accept, not the plan's stated 401 — documented deviation

**File:** `test/tfa-login.test.mjs:321-324`
**Issue:** Plan 17-01's must_haves list "invite accept → 401" with a challenge cookie held; the suite (and code, server.js:2141) asserts `409 accountExistsSignIn`. The deviation is justified and recorded in 17-01-SUMMARY.md: the invite route legitimately serves anonymous account creation, and the security property (no session minted from the pending identity, challenge row untouched) is proven by the absence of a session cookie and DB assertions. I independently verified the anonymous creation path (server.js:2144-2161) only ever mints a session for the body-supplied new account — the challenge cookie contributes nothing. Flagged purely for plan-traceability.
**Fix:** None required; optionally note the 409 refinement in COVERAGE.md.

### IN-02: Logout route has no `sameOrigin` guard (logout CSRF) — pre-existing, outside this phase's diff

**File:** `server.js:1421-1429`
**Issue:** The logout handler was modified this phase (challenge-row deletion added) but, like before the change, performs a state-changing POST without the `sameOrigin` check every other mutation route applies. Impact is limited to a CSRF-forced sign-out/challenge-abandon (no data exposure). Out of the phase diff as a pre-existing condition; noting it as an observation for a future hardening pass, not a Phase 17 defect.
**Fix:** (future) Add `if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');` at the top of the logout route, matching the login/verify routes.

---

_Reviewed: 2026-10-27_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
