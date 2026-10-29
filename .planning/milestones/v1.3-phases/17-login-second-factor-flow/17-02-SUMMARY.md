---
phase: 17-login-second-factor-flow
plan: 02
subsystem: auth-client
tags: [2fa, login, ui, i18n, security, tfa-05]
requires: [POST /api/auth/tfa/login (17-01), pending2fa/maskedEmail login payload (17-01), logout clears challenge row+cookie (17-01), err.invalidTfaCode/err.challengeExpired keys (17-01), finishLogin post-success flow (extracted from doLogin)]
provides: [api.tfaLogin(code), s === '2fa' full-screen auth state (masked email + one dual-shape code input), doLogin pending branch (S.ui.auth='2fa'), doTfaLogin verify action, tfaBackToSignIn logout-backed abandon action, reportRecoveryBurn honest recovery banners (auth.recoveryUsed / auth.recoveryUsedLast EN+FR), exported applyUser, finishLogin helper]
affects: [phase 18 e2e (drives the client 2FA flow), settings 2FA tab (shares the one-time-code input idiom)]
tech-stack:
  added: []
  patterns: [in-memory-only pending state on S.ui (no persistence by construction), shared post-success login tail (finishLogin), post-landing toast with action button]
key-files:
  created: []
  modified: [src/core/api.js, src/pages/auth.js, src/actions/actions.js, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs, test/i18n-pages.test.mjs, test/i18n-toast.test.mjs, test/i18n-shell.test.mjs, test/locale-negotiate.test.mjs, test/fixtures/icons-baseline.json, server.js, test/tfa-login.test.mjs]
decisions:
  - pending2fa state lives ONLY in in-memory S.ui (auth flag + maskedEmail); api.login skips applyUser on pending2fa so a pending challenge is never readable as signed-in (D-70, T-17-07)
  - The 2FA card renders one dual-shape autocomplete="one-time-code" field — zero client branching on code shape (D-64, T-17-09); only the server-computed maskedEmail is esc()'d into the subtitle (D-62, T-17-08)
  - doLogin's post-success tail extracted into finishLogin() so doTfaVerify reuses the exact ?next=/queued-invite/hydrate landing (D-75); the D-11 locale-adoption pin test now asserts finishLogin adopts before hydration
  - Challenge abandon is a real logout (the HttpOnly projects_tfa_challenge cookie is server-clearable only); the throttle budget is server-owned and untouched (D-61/D-03)
  - Recovery-burn report is a post-landing toast, escalated copy only when recoveryRemaining === 0; no behavior difference between the two paths (D-73/D-74)
metrics:
  duration: ~50m
  completed: 2026-10-27
status: complete
actuals:
  tokens: 51000
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 6aea2556b181f6f3e9872d9d250a4c2e1570b64e
plan_head_after: 164ed71
---

# Phase 17 Plan 02: Login Second-Factor Flow (client) Summary

**One-liner:** a correct password on an enrolled account now parks the client on a dedicated full-screen `s === '2fa'` card — masked email, one dual-shape code field, no persisted pending state — and a correct TOTP/recovery code enters through the same post-success landing as any login, with an honest post-landing report when a recovery code was burned.

## What Was Built

- **api.js:** `tfaLogin(code)` → `POST /api/auth/tfa/login`, deliberately without applyUser; `login` now skips `applyUser` when the response carries `pending2fa` (T-17-07 / D-70 / Pitfall 6). `applyUser` exported so the verify response — the only other payload allowed to mint a signed-in client — adopts through the same primitive.
- **auth.js:** the `s === '2fa'` branch of renderAuth — authShell full-screen card (no inline swap, D-60), subtitle interpolating the esc()'d `S.ui.maskedEmail` (never the raw address, D-62), ONE `autocomplete="one-time-code"` input (no client shape branching, D-64), `data-submit="doTfaLogin"`, `ferr('login')` alert slot, back-to-sign-in link.
- **actions.js:** doLogin pending branch (in-memory S.ui only — zero localStorage/sessionStorage writes, D-70); `doTfaLogin` following the loadingBtn/done() pattern, mapping `invalidTfaCode`/`challengeExpired`/`tooManyAttempts` into the `login` error slot, restarting at the password step on a dead challenge (D-66 client side); `tfaBackToSignIn` performing a real `api.logout()` (plan-01 logout deletes the challenge row + cookie) then resetting to login (D-61); the shared post-success tail extracted to `finishLogin()` so verify success lands exactly like a password login (?next=, queued invite, hydrate, home overview — D-75); `reportRecoveryBurn()` firing after enterApp with `auth.recoveryUsed` (+ settings shortcut) or the escalated `auth.recoveryUsedLast` when N = 0 (D-73/D-74).
- **Locales EN+FR (same commit as their code):** `page.auth.tfaTitle/tfaSubtitle/tfaCodeLabel/tfaVerify`, `auth.recoveryUsed`, `auth.recoveryUsedLast`; reused `page.auth.backToSignIn`, `nav.route.settings`, and the plan-01 `err.invalidTfaCode/err.challengeExpired/err.tooManyAttempts` keys.

## Deviations from Plan

**1. [Rule 3 - Blocking] Frozen machine-identifier pins adapted to the new surface**
- **Found during:** Task 1 verify (icon baseline 169→170, call-site count 28→29, catalogue 1568→1572→1574, auth-page data-a 36→38, tree-wide data-a 440→442)
- **Issue:** the i18n/icon pins are byte-identical or exact-count contracts; the new card (+shield-check icon, +4 locale keys, +2 data-a sites, +1 API call site) moved them by construction.
- **Fix:** each pin updated with a dated comment (17-02); the D-11 locale-negotiation test extended to assert finishLogin adopts the locale before hydration (invariant preserved across the helper extraction).
- **Commits:** 5950ac0, 164ed71

**2. [Rule 3 - Blocking] Prettier formatting on plan-01 files (pre-existing red)**
- **Found during:** Task 2 `npm run format:check`
- **Issue:** server.js and test/tfa-login.test.mjs (both created/modified in plan 01) failed the formatter gate before this plan's Task 2 could pass it.
- **Fix:** `prettier --write` on the two files, no logic change (520/520 tests still green).
- **Commit:** 164ed71

## Auth Gates

None — no external services touched.

## Known Stubs

None.

## Verification

- `node scripts/i18n-scan.mjs` → 0 literals / 0 pending / 0 unresolved / 0 placeholder-mismatch
- `npm run lint` → clean; `npm run format:check` → all files formatted
- `npm run build` → ✓ built (vite)
- `npm test` → **520 pass / 0 fail** (full suite incl. plan-01's 9 tfa-login server tests)

## Self-Check: PASSED

- src/core/api.js, src/pages/auth.js, src/actions/actions.js, both locale files modified and committed; commits 5950ac0 and 164ed71 present on main; SUMMARY/STATE/ROADMAP follow in the docs commit.
