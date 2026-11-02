---
phase: 30-entra-sso-oidc
plan: 04
subsystem: auth/sso + client
tags: [oidc, sso-only, entra, i18n, client-surface, deploy-docs]
requires: [30-01 OIDC spine (/api/config oidcEnabled/oidcSsoOnly, /login?sso=error marker), 30-03 /#tfa and /#invitations redirect fragments]
provides:
  - SSO-only 404-no-oracle gate on /api/auth/login (SSO-06, D-07) — reversibility proven (D-08)
  - Microsoft SSO button on login + join surfaces, gated strictly on /api/config oidcEnabled (D-09/D-10)
  - oidcSsoOnly-driven password-form hiding (D-07 client side)
  - generic page.auth.ssoError banner for ALL callback failures (T-30-14)
  - SPA wiring of the /#tfa and /#invitations fragments (plan 03 handoff)
  - DEPLOY.md OIDC_* env block + Entra app-registration walkthrough
affects: []            # final plan of the phase
tech-stack:
  added: []            # zero new dependencies (milestone invariant)
  patterns: [server-ground-truth config gating, no-oracle 404 gating, hash-fragment auth states, catalogue-count pin bumps]
key-files:
  created: []
  modified: [server.js, src/pages/auth.js, src/core/api.js, src/main.js, src/locales/en.json, src/locales/fr.json, test/oidc-sso.test.mjs, test/i18n-core-features.test.mjs, test/i18n-pages.test.mjs, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs, DEPLOY.md]
decisions:
  - "The SSO-only gate sits BEFORE the sameOrigin guard on /api/auth/login — a cross-origin POST earns the same bare 404, so no 403 oracle leaks under any input"
  - "The invitations fragment renders a small auth card pointing back at the emailed /join/<token> links — the honest surface for 'surfaced, not mass-accepted' (plan 03 keeps both invites pending; no invite-listing API exists)"
  - "The sso=error marker is consumed at logged-out boot in main.js (banner = S.ui.errors.login = the single ssoError string) and the query param is scrubbed from the URL"
  - "Guard pins updated rather than worked around: catalogue 1653→1656 (+ssoError/invitationsTitle/invitationsBody), auth-page data-a 38→39 and tree-wide 468→469 (+invitations-card signOut)"
metrics:
  duration: ~25 min
  completed: 2026-11-02
status: complete
commits: 3
plan_head_before: 94884f4176c5811fc4c1b91a2f2965214c63451f
plan_head_after: 69ebd12
actuals:
  tokens: 6250         # chars/4 over the realized diff (25,000 diff chars in 12 files)
  tasks: 3
  commits: 3
---

# Phase 30 Plan 04: SSO-Only Mode + Client Surface + Operator Docs Summary

**One-liner:** With `OIDC_SSO_ONLY=true` the password door is a bare 404 (never 403-with-message, auth family intact, fully reversible with password_hash retained), the Microsoft button renders on login + join surfaces strictly from `/api/config` ground truth, all callback failures surface one generic `page.auth.ssoError` banner, the `/#tfa` and `/#invitations` fragments are wired into the SPA, and DEPLOY.md makes Entra deployment self-serve.

## What Was Built

- **`server.js`** — the SSO-only gate at the very top of `/api/auth/login`: `if (OIDC.ssoOnly) return fail(res, 404, 'notFound', 'Not found')` — the exact REMINDER_TEST_TOKEN 404 shape, answered BEFORE the sameOrigin guard so even a cross-origin POST gets the bare 404 (no 403 oracle under any input). `OIDC.ssoOnly` is true only when OIDC is enabled (plan 01's `readConfig` shaping kept). No other auth route touched — tfa/login, logout, /me stay functional (Pitfall 6 coherence).
- **`test/oidc-sso.test.mjs`** — 46 → 51 tests, the SSO-06 matrix: config `oidcSsoOnly:true`; login → 404 `notFound` (explicitly not-403, plus a cross-Origin POST row); tfa/login → 401 `challengeExpired` (route alive), logout → 204, me → `{user:null}`; signup still governed by ALLOW_SIGNUP (201 under SSO-only); the D-08 reversibility row — signup a real password account under SSO-only, observe the 404, verify password_hash retained, reboot the SAME database without the flag, password sign-in returns 200 with a session minted.
- **`src/core/api.js`** — `oidcEnabled`/`oidcSsoOnly` config state with false defaults (button hidden before `/api/config` resolves — UI-SPEC backstop) + getters; consumed exactly like `api.enabled`.
- **`src/pages/auth.js`** — `ssoBtn()`: a real `<a href="/api/auth/oidc/start">` (browser navigation, not XHR) styled as the socialBtns analog with the four-square Microsoft glyph (brand fills kept), zero new button strings (reuses `continueMicrosoft` + `or`). Rendered on the login branch AND the join-existing branch (D-09), only inside `api.oidcEnabled` conditionals (D-10 — `git grep OIDC_ src/` is empty). Under `oidcSsoOnly` the password form fields/submit vanish entirely — no disabled form, no explanatory message. New `invitations` auth state: an honest card pointing back at the emailed `/join/<token>` links + signOut.
- **`src/main.js`** — `authRoutes` gains `'tfa'` and `'invitations'` (plan 03's handoff: both were missing fragments; hash fragments survive mid-challenge refresh per Pitfall 9); signed-in boot intercepts `/#invitations` before the no-workspace routing swallows it; the `/login?sso=error` marker sets the existing `.alert danger` banner to `page.auth.ssoError` and scrubs the param — one generic string for all causes (T-30-14).
- **`src/locales/en.json` / `fr.json`** — `page.auth.ssoError` (exact UI-SPEC copy), `page.auth.invitationsTitle`, `page.auth.invitationsBody`.
- **`DEPLOY.md`** — an SSO subsection in §5: the six core OIDC_* vars with the D-02 activation rule (flag AND complete set; partial set ≡ disabled, plain 404s), the D-04 role clamp, the Azure Portal walkthrough (Web redirect URI `https://<host>/api/auth/oidc/callback` exactly, client secret value), SSO-only semantics + D-08 reversibility, and the real-tenant smoke test called out as the one manual verification. Zero new packages, existing doc tone.

## Verification

- `node --test test/oidc-sso.test.mjs` — 51/51 pass
- `npm test` (full suite) — 805 pass / 0 fail / 3 pre-existing skips
- `grep -c "OIDC_" DEPLOY.md` → 13 (≥ 5 gate)
- `git grep -n "OIDC_" src/` → no matches (D-10 prohibition honored)
- `git grep 403` confirms no SSO-only branch answers 403

## Deviations from Plan

Behavior executed as written. Two documented interpretation/guard-bump calls:

1. **[Interpretation] The `/#invitations` surface is a static honest card, not an invite list:** plan 03 deliberately keeps every pending invite reachable via its emailed `/join/<token>` link and no invite-listing API exists; the card states exactly that and offers signOut. No stubbed data source — the design is "surface, don't guess," honored structurally.
2. **[Guard bumps] Four catalogue/identifier pins updated in place** (catalogue 1653→1656, auth data-a 38→39, tree-wide data-a 468→469 ×2) with comments naming 30-04 — these are the house anti-drift guards, expected to move with the 3 new locale keys and the invitations-card `signOut` site.

## Known Stubs

None. The SSO-2FA landing reuses the existing `s === 'tfa'` state; its subtitle interpolates the (empty) masked email for SSO arrivals — cosmetic, noted for a future polish pass, not a data gap.

## Threat Flags

None — no security surface beyond the plan's threat model was introduced. T-30-12 (login-oracle — bare 404 before any guard, family coherence test-pinned), T-30-13 (button visibility — config-gated only, false defaults pre-resolve), T-30-14 (error surface — one generic string, marker scrubbed) are all mitigated and pinned; T-30-SC unchanged (zero new packages).

## Self-Check: PASSED

- `git log` verified: `9f6aa49` (SSO-06 gate), `fdad82b` (client surface), `69ebd12` (docs) — measured 3 commits from ledger base `94884f4`.
- Suites green: 51/51 in-file, 805/805 full suite (3 pre-existing skips).
- Acceptance greps run and quoted above.
