# Project Research Summary

**Project:** Gr8r Studio — v1.3 Auth Hardening (TOTP 2FA, QR provisioning, session revocation)
**Domain:** Self-hosted PM workspace — hand-rolled auth on Node 24 built-ins (`node:sqlite`, zero runtime deps)
**Researched:** 2026-10-26
**Confidence:** HIGH

## Executive Summary

The three "stubbed" features (sessions page, password change, 2FA) are not half-implemented — **they have no backend at all.** Architecture research confirmed via direct code reads that all three are decorative fields inside the shared workspace JSON document (`sessions: []`, `tfa: false` in `emptyDoc()`), mutated client-side only: the fake QR is a pseudo-random grid, the "revoke" button filters a local array, and password change shows a fake delay + toast. The root cause is architectural: auth state stored in a tenant-shared doc instead of per-user tables. The fix is not three features — it is one re-grounding of auth state into real per-user schema, then building the three flows on top.

The recommended approach honors the project's zero-runtime-dependency invariant: TOTP is ~40–60 lines of `node:crypto` (HMAC-SHA1, dynamic truncation per RFC 4226, `timingSafeEqual`, ±1 step window), Base32 is a ~20-line hand-rolled codec (Node has none built-in), and QR generation is a single **vendored, audited MIT file** (`qrcode-generator` 2.0.4's `qrcode.js`) imported as an ES module into the Vite build — NOT hand-written (QR has ~6 algorithm trapdoors: that's how today's fake QR happened) and NOT an npm runtime dep. Session revocation already has its hard half built: opaque DB-backed session rows mean revocation is literally `DELETE FROM sessions WHERE user_id = ? AND token_hash != sha256(current cookie)`.

The dominant risks are the classic TOTP/security mistakes, each with a concrete prevention: time-step drift (±1 window minimum), replay (store `last_used_step` per user, same migration), pending-2FA sessions leaking authentication **before** code verification (Pitfall 15 — the headline security trap; no endpoint may treat a pending session as signed-in), self-revocation via "revoke others" forgetting to exclude the current token, and the byte-identical second-boot migration guarantee (columns-and-tables only, no backfills). Recovery codes are mandatory in the same milestone as TOTP enablement — shipping enrollment without them is a lockout factory.

## Key Findings

### Recommended Stack

Add **zero runtime dependencies.** Everything needed is in `node:crypto`, pre-existing schema, or one vendorable file. Explicitly rejected: `otplib@13` (fresh rewrite, API churn, buys HOTP plumbing Gr8r will never call) and `qrcode@1.5.4` as a runtime dep (breaks PROJECT.md core decisions #1–#3; native canvas fallbacks risk the Docker image).

**Core technologies:**
- `node:crypto` — TOTP gen/verify via `createHmac('sha1')` + RFC 4226 truncation; `timingSafeEqual` compare; `randomBytes(20)` secrets; optional AES-256-GCM secret encryption-at-rest under a host-derived key
- Hand-written Base32 (RFC 4648, ~20 LOC, named constant alphabet, known-vector test) — encodes the 32-char secret and decodes it in `otpauth://`
- Vendored `qrcode.js` (from `qrcode-generator@2.0.4`, MIT, one file) in `src/lib/vendor/` — rendered as inline SVG from the boolean matrix; NOT hand-written
- Existing `users` / `sessions` tables + `ensureColumn()` migration pattern — additive columns only, guarded creates, no new tables except possibly `login_challenges` (architect's choice) for pre-2FA login state

**Schema additions (complete list):** `users` + `two_fa_secret`, `two_fa_enabled`, `recovery_codes` (+ replay counter per Pitfall 2), `sessions` + `label`, `last_seen_at` (throttled, ≥5 min per session).

### Expected Features

**Must have (table stakes, P1):**
- Session revocation primitive: keep-current SQL, usable by both sessions page and password change (build once, first)
- Sessions list: device label + IP + last-seen + "current session" marker, per-row revoke, "log out other sessions" with confirm
- Password change end-to-end: requires current password, new password works at next login, revokes other sessions atomically, current session survives, honest success copy
- TOTP enrollment: `otpauth://totp/Gr8r:<email>?secret=...&issuer=Gr8r&algorithm=SHA1&digits=6&period=30` (all params explicit), real scannable QR, **verify-before-enable** (pending secret until a code verifies)
- Login second step: 6-digit code or recovery code after password (single field, auto-detect format)
- Recovery codes: 8–10 single-use, hashed at rest (`sha256` per code), shown exactly once, consumable at login and at disable
- Disable-2FA requires current password
- Per-user settings migration: remove `tfa`/`sessions` from the workspace doc (`emptyDoc()`, `seed.js`) — flagged Active item from v1.1 audit
- i18n coverage EN+FR for all new strings/error codes (the `i18n-scan.mjs` build gate fails otherwise — hard dependency, not polish)

**Should have (P2):** relative "last used X ago" via `Intl.RelativeTimeFormat`; reusable re-auth endpoint primitive; remember-this-device (defer hook, ship later).

**Defer / anti-features:** WebAuthn/passkeys, SMS/email OTP (no mailer in image), geolocation on sessions, live session tracking, org-wide 2FA mandate, password histories/zxcvbn, admin revoking members' sessions, remember-me tiers (deliberately one tier for v1.3 — Pitfall 11).

### Architecture Approach

The settings UI (`settings.js:378-421`) and all its strings already exist — the work is **rewiring data sources and actions plus new endpoints.** New route handlers sit beside `/api/auth/*` in `server.js`: `GET /api/auth/sessions`, `POST /api/auth/sessions/revoke-others`, `POST /api/auth/password-change` (verify old → rehash → revoke-others **inside one `transaction()`**), `POST /api/auth/2fa/{setup,verify,disable}` (setup/verify/disable password-gated), and `POST /api/auth/login/2fa` consuming a short-lived pending challenge. Login branches: valid password + `two_fa_enabled=0` → session; enabled → challenge token, **no session cookie until code verified** (Option A pattern: a pending row that no endpoint treats as identity except the verify/logout path — applies to *every* `requireUser`/`requireWorkspace` consumer, incl. the `/w/:slug/file/:id` file route and invite-accept fallback). Client: new `src/lib/totp.js`, `src/lib/qr.js`, `src/lib/ua-labels.js`; modify `api.js`, `actions.js`, `settings.js`, `auth.js`; delete doc fake-fields; extend `test/migration.test.mjs` for byte-identical second boot.

**Invariants to pin in writing at investigation phase:** identity re-derived from DB every request (never memoize `currentUser`); tokens are pure random entropy, never password-derived (Pitfall 13); revoke keeps current via `token_hash !=`; sameOrigin + `tooMany` guard-first on every new mutation endpoint; scrypt runs once per password-change request.

### Critical Pitfalls

1. **Pending 2FA session = auth bypass (Pitfall 15, the dangerous one)** — no cookie/identity before TOTP verification; test every endpoint family returns 401 for a pending session; short challenge lifetime (~5 min), never `SESSION_DAYS`.
2. **Revocation self-DoS (Pitfall 9)** — the CLI precedent deletes *all* rows including current; the endpoint must exclude the current `token_hash`; test "second cookie dead, caller alive."
3. **TOTP window + replay** — accept counter−1..+1 (RFC 6238 §5.2); store the matched counter per user and reject ≤ it (same migration, never bolted on later); `timingSafeEqual` with length validation *before* the call (it throws on unequal length).
4. **Secret/recovery code storage** — TOTP secret AES-256-GCM under `MASTER_KEY`-derived key, fail closed if unset; recovery codes `sha256`-hashed individually, single-use via `used_at` + changes-count (race-safe, auditable), shown exactly once, one undifferentiated error code (`invalidRecoveryCode`).
5. **Migration no-op + shared-field removal (Pitfall 21)** — columns/tables only; no user-data backfill at boot; extend the migration test. The `tfa`/`sessions` doc-field removal and the per-user migration are the same task, not two.

Also load-bearing: otpauth URI completeness (SHA1/6/30 explicit, correct issuer escaping — silent scan failures are common); throttle reuse with explicit per-endpoint constants and no budget reset between password and 2FA steps; i18n catalogue keys as a per-phase deliverable; QR must be vendored, never hand-rolled.

## Implications for Roadmap

Suggested phase structure (extends the milestone's phased plan; research agrees substantially with ARCHITECTURE.md §4 build order):

### Phase 1: Investigation & Invariant Pinning (Investigation)
**Rationale:** All three features share one root cause; confirm it and pin the contract before building.
**Delivers:** Confirmed findings (no endpoints, doc-field stubs), decisions: pending-session pattern (Option A/B), `login_challenges` table vs pending row, QR strategy (vendored `qrcode-generator` file — recommended), TOTP secret encryption-at-rest on/off (fail-closed `MASTER_KEY`), throttle constants table, module placement. Removes fake `sessions`/`tfa` doc fields from `emptyDoc()` and `seed.js`.
**Avoids:** Pitfalls 15, 19, 21, 22; establishes the Pitfall 10/13 invariants.

### Phase 2: Schema + Session Truth & Revocation
**Rationale:** The revocation primitive is the shared dependency — password change reuses it; smallest vertical slice; unblocks the sessions page verification surface.
**Delivers:** `ensureColumn` additions (`users.two_fa_*`, `recovery_codes`; `sessions.label`, `last_seen_at`), `login_challenges` guarded create, `GET /api/auth/sessions`, `POST /revoke-others` (keep-current), wire `actions.js`/`settings.js` to real API, UA label stamping, throttled last-seen, i18n keys.
**Avoids:** Pitfalls 9, 10, 11; migration-no-op (21).

### Phase 3: Password Change (end-to-end)
**Rationale:** Nearly free once the revocation primitive exists; highest trust-value fix (form currently lies).
**Delivers:** `POST /api/auth/password-change` — verify old, single shared `validatePasswordStrength`, rehash + revoke-others in one `transaction()`, honest success toast, e2e: new password works at login, other sessions 401, current survives.
**Avoids:** Pitfalls 12, 13, 14.

### Phase 4: TOTP Core + Enrollment
**Rationale:** Widest slice, but independent of Phase 3's surface; core crypto first so enrollment is thin.
**Delivers:** `src/lib/totp.js` (±1 window, replay counter, timingSafeEqual, base32 codec + known-vector tests), `src/lib/qr.js` (vendored encoder → inline SVG, copyable secret fallback), `/2fa/setup` + `/verify` (pending→enabled flip) + `/disable` (password-gated), recovery codes (hashed, shown once, single-use), settings-page transformation.
**Avoids:** Pitfalls 1–8, 16, 17, 19, 20.

### Phase 5: Login Challenge Flow + Hardening
**Rationale:** The login route should change once, coherently, only after enrollment exists.
**Delivers:** Login branch for `two_fa_enabled`, pending challenge creation/promotion, `POST /login/2fa` (TOTP or recovery burn), throttle integration (same budget across password→2FA steps), per-endpoint constants, 401-matrix test for pending sessions across all endpoint families.
**Avoids:** Pitfalls 15, 18, 22.

### Phase 6: Verification, i18n & Migration Proof
**Rationale:** Cross-cutting gates land last, applied to the whole surface.
**Delivers:** Extended `test/migration.test.mjs` (fresh + pre-locale DBs; second boot byte-identical; no auth keys in workspace JSON), full e2e in both locales, real-device QR UAT (Google Authenticator + one other), "looks-done-but-isn't" checklist from PITFALLS.md as explicit verification, FR sweep, DEPLOY notes (incl. `MASTER_KEY` note if encryption-at-rest enabled).
**Avoids:** Pitfall 20, 21 residuals.

### Phase Ordering Rationale
- **Investigation first** — three symptoms, one root cause; building before confirming risks three special-cased fixes with no shared foundation.
- **Revocation before password change** — password-change-revokes-others is literally the same SQL; building the primitive once removes both feature's hardest half.
- **TOTP before login challenge** — verification needs something to verify; keeping the login-route edit in one phase avoids two half-edits of the throttled login path.
- **Recovery codes ship with enrollment** — no-recovery enrollment is a lockout factory; non-negotiable coupling per FEATURES.md.
- **Per-user doc-field removal lands with schema work (Phase 2)** — any later is shared-tenant auth state shipping wrong.

### Research Flags

Needs dedicated research/decisions at plan time:
- **Investigation phase (1):** pending-session pattern choice, `MASTER_KEY`/encryption-at-rest decision, QR vendor source pinning, throttle constants — Phase-13-scoped decisions, not repeat research.
- **Phase 4 (TOTP/QR):** vendor QC of the chosen `qrcode.js` file (license header, ESM wrapping compat with Vite build); otpauth fixture-vector test worth designing carefully.

Standard patterns (skip further research):
- **Phases 2, 3, 5:** revocation SQL, scrypt change, throttle reuse — all precedents exist in `server.js`; patterns are fully pinned by this research.
- **Phase 6:** migration-test extension and i18n gate mechanics are established v1.1/v1.2 machinery.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | npm versions verified against registry 2026-10-26; Node crypto behavior verified against nodejs.org docs; existing schema read directly in `server.js` |
| Features | HIGH | Flows converged across GitHub/GitLab/Nextcloud/Gitea + OWASP cheat sheets; minor caveat: web search was degraded this session (MEDIUM-HIGH on fine details, HIGH on flows) |
| Architecture | HIGH | Every claim cites a file/line read today; migration machinery proven and test-anchored |
| Pitfalls | HIGH | Grounded in RFC 6238/4226/4648, otpauth spec, OWASP, and direct reads of the throttle/scrypt/session machinery |

**Overall confidence:** HIGH

### Gaps to Address

- **Web search was partially unavailable** during feature research (engine rate-limits): reference the OWASP MFA cheat sheet and a real-device QR test during verification even though the flows are standard.
- **TOTP secret encryption-at-rest is a product decision, not settled research** — Stack and Pitfalls differ in tone (optional-but-recommended vs fail-closed). Investigation phase must decide once, with DEPLOY.md consequences documented.
- **Pending-session mechanism (Option A pending row vs dedicated `login_challenges` table)** — both viable; Architecture recommends one, Pitfalls the other variant. Investigation decides; either satisfies the invariant if tested as specified.
- **Recovery-code "regenerate" action** — out of scope for v1.3 (research agrees); document explicitly so it isn't quietly added.
- **Session-count/hash growth indexing** (`sessions` composite lookups with new filters) — trivial at this scale; monitor, no action needed.

## Sources

### Primary (HIGH confidence)
- Direct reads: `server.js` (schema :84-132, migrations :134-156, scrypt :166-190, transaction/emptyDoc :747-789, auth routes :1225-1320, CLI/sweep :2158-2174); `src/actions/actions.js` :2351-2427 (stubs); `src/pages/settings.js` :378-437 (fake QR/codes); `src/data/seed.js` :498-527; `src/core/api.js` :137-202; `test/migration.test.mjs`; `.planning/PROJECT.md`
- RFC 6238 (TOTP §5.2 window), RFC 4226 (HOTP truncation), RFC 4648 (base32), Google Authenticator KeyUriFormat wiki (otpauth URI)
- nodejs.org `crypto` docs (Node 24/26): HMAC, `timingSafeEqual`, `createCipheriv`, encodings list (no Base32)
- npm registry 2026-10-26: `qrcode-generator@2.0.4` (MIT), `qrcode@1.5.4`, `otplib@13.5.0`, `@otplib/preset-default@12.0.1`

### Secondary (MEDIUM-HIGH confidence)
- OWASP Authentication + Session Management cheat sheets (fetch confirmed for session; MFA fetch degraded by search outage — pattern is standard)
- Mainstream-product behavior convergence: GitHub, GitLab, Nextcloud, Gitea, Bitwarden, Devise/Django/Laravel norms

---
*Research completed: 2026-10-26*
*Ready for roadmap: yes*
