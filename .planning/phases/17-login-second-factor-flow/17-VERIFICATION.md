---
phase: 17-login-second-factor-flow
status: passed
verified: 2026-10-27T12:00:00Z
verification.status: passed
score: 11/11 must-haves verified
covered_files:
  - server.js
  - totp.js
  - src/core/api.js
  - src/pages/auth.js
  - src/actions/actions.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/tfa-login.test.mjs
  - test/helpers/server.mjs
  - .planning/phases/17-login-second-factor-flow/17-01-PLAN.md
  - .planning/phases/17-login-second-factor-flow/17-01-SUMMARY.md
  - .planning/phases/17-login-second-factor-flow/17-02-PLAN.md
  - .planning/phases/17-login-second-factor-flow/17-02-SUMMARY.md
covered_digest: "v2:sha256:3a7e5dccab85719618b4d8757ad3ffaf0b3982912bce4636b5d1f0691c9f7a22"
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "The client 2FA screen renders correctly in a real browser (visual flow, EN+FR)"
    addressed_in: "Phase 18"
    evidence: "Phase 18 success criteria: 'Chromium e2e for all three flows in both locales, QR UAT with a real device'"
---

# Phase 17: Login Second-Factor Flow — Verification Report

**Phase Goal:** Enrolled users face a real second step at login, and a pending sign-in is inert: the code — not the password — is what creates a session identity.
**Verified:** 2026-10-27
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Correct password on enrolled account → 200 `{pending2fa, maskedEmail}`, only the challenge cookie (~5 min), no session, no user payload | ✓ VERIFIED | server.js:1391-1399; test D-68 (tfa-login.test.mjs:95); test asserts no `user` key and `Max-Age=300` |
| 2 | `POST /api/auth/tfa/login` verifies a live TOTP (D-04 replay guard) and mints session + deletes challenge atomically in one transaction | ✓ VERIFIED | server.js:1618-1674 (single `transaction()`); test D-69 (:120) and D-04 replay (:143) — both pass against a real server + SQLite |
| 3 | Recovery code burns exactly once via conditional `used_at is null` update; `recoveryRemaining` returned; TOTP path omits the key | ✓ VERIFIED | server.js:1650-1654, 1689-1690 (`burn.changes !== 1`); test D-72 (:182) |
| 4 | 3 wrong codes or 5 min kills the challenge (401 challengeExpired); budget carries across password→2FA steps (no success-clear on pending branch) | ✓ VERIFIED | server.js:1626-1631 (increment-before-verify, `attempts > 3` → dead); `attempts.delete` at exactly 3 sites — tooMany eviction (1297), non-2FA login success (1402), verify success (1688); tests D-66 (:214, :242) and D-03 (:262) |
| 5 | Pending state structurally anonymous: requireUser routes, /w/:slug/file/:id, invite accept, PATCH /api/auth/me all reject; GET /api/auth/me → `{user: null}`; logout-from-pending clears row + cookie | ✓ VERIFIED | `currentUser()` (server.js:1248) reads only `COOKIE`/sessions — `CHALLENGE_COOKIE` is referenced only by logout (1425) and the verify route (1602); D-71 matrix test (:286) passes, incl. logout cookie `Max-Age=0` |
| 6 | No 429 copy discloses the lockout window; `tooManyAttempts` code carried; no Retry-After header | ✓ VERIFIED | `grep -c "Try again in 15 minutes" server.js` = 0; `grep Retry-After` = 0 matches; test D-13 assertion (:281); 429s at 1381/1611 carry generic copy + `tooManyAttempts` |
| 7 | Expired challenge rows swept at boot and hourly, matching the sessions sweeper | ✓ VERIFIED | server.js:2642-2643 — boot delete + `setInterval(..., 3600_000).unref()` |
| 8 | Client switches to dedicated full-screen `s === '2fa'` state with masked email + ONE dual-shape code input | ✓ VERIFIED | src/pages/auth.js:100-106 (authShell, `autocomplete="one-time-code"`, esc()'d maskedEmail only); doLogin pending branch actions.js:2724-2727 |
| 9 | No pending state persisted client-side; api.user never populated before verify | ✓ VERIFIED | src/core/api.js:176 (`if (r.ok && !r.data?.pending2fa) applyUser(...)`); api.tfaLogin (api.js:273) has no applyUser; zero localStorage/sessionStorage writes in the pending path |
| 10 | Back-to-sign-in performs a real logout (server clears challenge row + cookie) and resets to login; verify success lands via the normal post-success flow with honest recovery banners | ✓ VERIFIED | actions.js:2780-2792 (api.logout → reset); `finishLogin` shared tail (:2621) reused by doTfaLogin (:2772); `reportRecoveryBurn` (:2681) escalates at N=0 |
| 11 | EN+FR locales aligned with all new keys | ✓ VERIFIED | en.json/fr.json lines 859-865 + 1492-1493 mirror each other; `i18n-scan` → 0 literals / 0 pending / 0 unresolved / 0 placeholder-mismatch |

**Score:** 11/11 truths verified (0 present, behavior-unverified)

Behavior-dependence note: truths 1-7 all assert state transitions/cleanup invariants; each is exercised by a passing named test in `test/tfa-login.test.mjs` (real server + real SQLite, no mocks) — verified behaviorally, not just by symbol presence.

### Threat-Mitigation Invariants (T-17-01…T-17-09)

| Threat | Mitigation | Status |
|--------|-----------|--------|
| T-17-01 brute-force | 5/15min `2fa-login\|ip\|email` throttle (server.js:1610) + 3-wrong death + D-03 carry-over test | ✓ VERIFIED |
| T-17-02 challenge-as-identity | Separate cookie name; currentUser reads only sessions rows (1248); 401-matrix test passes | ✓ VERIFIED |
| T-17-03 CSRF on verify | `sameOrigin(req)` first, before body/throttle (1599) | ✓ VERIFIED |
| T-17-04 failure oracle | One `invalidTfaCode` for both shapes (1677); no second code exists | ✓ VERIFIED |
| T-17-05 429 timing disclosure | Generic copy, grep gate 0, no Retry-After | ✓ VERIFIED |
| T-17-06 TOTP replay | `two_fa_last_step` written inside the mint transaction (1646); replay test passes | ✓ VERIFIED |
| T-17-07 pending read as signed-in | applyUser guarded on `pending2fa`; only doTfaLogin adopts | ✓ VERIFIED |
| T-17-08 full email disclosure | Only server `maskedEmail`, esc()'d, interpolated into subtitle | ✓ VERIFIED |
| T-17-09 client shape branching | One `one-time-code` field, zero client branching | ✓ VERIFIED |

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Visual browser verification of the 2FA flow (rendering, EN/FR copy) | Phase 18 | "Chromium e2e for all three flows in both locales, QR UAT with a real device" |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| server.js login 2FA branch | challenge row + cookie + pending2fa payload | ✓ VERIFIED | lines 1391-1399 |
| server.js verify route | sameOrigin → throttle → increment-before-verify transaction | ✓ VERIFIED | lines 1597-1691 |
| CHALLENGE_COOKIE + setChallengeCookie/clear + maskEmail | ~5 min Max-Age; server-side masking | ✓ VERIFIED | 81, 1224-1246 |
| login_challenges sweeper | boot + hourly | ✓ VERIFIED | 2642-2643 |
| test/tfa-login.test.mjs | TFA-05-1…7 suite | ✓ VERIFIED | 9 tests, all pass |
| src/core/api.js tfaLogin | no applyUser inside | ✓ VERIFIED | 273 |
| src/pages/auth.js 2fa branch | authShell, masked email, one-time-code input | ✓ VERIFIED | 100-106 |
| src/actions/actions.js | pending branch, doTfaLogin, back link, banners | ✓ VERIFIED | 2621-2792 |
| locales en/fr | tfa* + err.* + recovery banner keys | ✓ VERIFIED | aligned, scan clean |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| CHALLENGE_COOKIE set (login) | read (verify), cleared (verify success / logout / death) | sha256 lookup + Max-Age=0 | ✓ WIRED | 1398, 1602, 1672/1684, 1425-1428, 1680 |
| attempts.delete | non-2FA success + verify success only | — | ✓ WIRED | 3 matches: eviction + 2 success sites |
| verifyTotpCode matchedStep | users.two_fa_last_step in mint transaction | — | ✓ WIRED | 1646 |
| doLogin pending branch | S.ui.auth='2fa' + maskedEmail | — | ✓ WIRED | actions.js:2724-2727 |
| doTfaLogin | api.tfaLogin → finishLogin | — | ✓ WIRED | 2748, 2772 |
| back link | api.logout → server challenge delete | — | ✓ WIRED | 2780-2792; server 1425-1428; D-71 test asserts |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| tfa-login suite | `node --test test/tfa-login.test.mjs` | 9 pass / 0 fail | ✓ PASS |
| Full regression | `npm test` | 520 pass / 0 fail | ✓ PASS |
| D-13 grep gate | `grep -c "Try again in 15 minutes" server.js` | 0 | ✓ PASS |
| Retry-After absence | `grep -n Retry-After server.js` | no matches | ✓ PASS |
| attempts.delete audit | `grep -n attempts.delete server.js` | 3 (eviction + 2 success sites) | ✓ PASS |
| i18n gate | `node scripts/i18n-scan.mjs` | 0/0/0/0/0/0 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TFA-05 | 17-01, 17-02 | Login requires second step; no session identity before code verifies; pending-session anonymous across every endpoint family | ✓ SATISFIED | Truths 1-7, D-71 matrix test; no orphaned requirements (REQUIREMENTS.md maps TFA-05 → Phase 17 only) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/actions/actions.js | 2772 | WR-01 (review): verify success leaves `S.ui.auth='2fa'` — a `finishLogin` failure branch (hydrate/queued-invite) re-renders the 2FA card with an empty masked email and a stale error; user IS signed in, reload recovers | ⚠️ Warning | UX-only dead-end on a rare failure branch; no security or data impact |
| src/actions/actions.js | 2770 | WR-02 (review): `S.ui.tfaRecoveryRemaining` survives a `finishLogin` failure → possible spurious recovery toast on a later unrelated login | ⚠️ Warning | Misleading copy only; no data risk |

**WR-01/WR-02 assessment:** polish-level, not goal gaps. Both live on the *failure* branch of `finishLogin` (workspace-hydrate or queued-invite failure *after* the server has already minted the session) — the phase's success-path truths are unaffected, and neither carries security or data risk (the reviewer's own classification is `warning`). Both are one-line hardening fixes suitable for a cleanup pass or Phase 18; they do not block goal achievement.

Also noted (review info items, out of phase scope): IN-01 — the D-71 matrix asserts 409 `accountExistsSignIn` for invite accept rather than 401; the structural claim is proven by absence of session mint + DB assertions, deviation documented in 17-01-SUMMARY.md. IN-02 — logout route lacks sameOrigin (pre-existing, predates this phase).

### Human Verification Required

None — the only human-scale item (visual browser flow) is explicitly the Phase 18 closing-verification scope and is recorded as deferred.

### Gaps Summary

No gaps. All four roadmap success criteria are behaviorally verified against the live code and the 520-test suite; all nine threat mitigations are wired in the code as claimed. The two open review warnings (WR-01/WR-02) are UX polish on a rare post-verify failure branch and do not prevent the phase goal.

---

_Verified: 2026-10-27_
_Verifier: the agent (gsd-verifier)_
