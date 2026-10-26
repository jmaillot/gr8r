# Requirements — Milestone v1.3 Auth Hardening

**Goal:** The auth surface becomes real — sessions, password change and 2FA stop being stubs
(they currently have no backend at all; auth state lives as decorative fields in the workspace
JSON document) and work end to end. Zero runtime dependencies preserved.

**Research:** `.planning/research/SUMMARY.md` (HIGH confidence; root cause confirmed by direct
code reads of `server.js`, `src/actions/actions.js`, `src/pages/settings.js`).

## v1.3 Requirements

### Session Management

- [ ] **SESS-01**: User can see their active sessions — device label, IP, last-seen, "this
  session" marker — served by a real `GET /api/auth/sessions` endpoint backed by the
  `sessions` table (with new `label` / `last_seen_at` columns).
- [ ] **SESS-02**: User can disconnect all other sessions with a working button; the current
  session stays signed in (revoke-others excludes the current `token_hash`).
- [ ] **SESS-03**: User can disconnect one individual session per row (per-session revoke).

### Password Change

- [ ] **PASS-01**: User can change password — current password verified server-side, new
  password works at the next login, atomic scrypt rehash.
- [ ] **PASS-02**: All other sessions are revoked automatically at password change (same revocation
  primitive as SESS-02, in one `transaction()`); the current session survives.
- [ ] **PASS-03**: Success copy states what actually happened (e.g. other sessions logged out) —
  the v1.2 honest-toast rule.

### TOTP 2FA

- [ ] **TFA-01**: User can enroll a TOTP authenticator — secret generated with `node:crypto`
  (`randomBytes`), verification with a ±1 time-step window, a replay guard (matched counter
  stored per user), and `timingSafeEqual` comparison.
- [ ] **TFA-02**: Enrollment shows a real scannable QR — `otpauth://totp/…?secret=…&issuer=Gr8r`
  (SHA1, 6 digits, 30 s period all explicit) rendered from a vendored MIT QR encoder, with a
  copyable secret fallback.
- [ ] **TFA-03**: 2FA activates only after a live 6-digit code verifies against a pending secret
  (verify-before-enable; no unverified-secret lockout).
- [ ] **TFA-04**: 8–10 single-use recovery codes, hashed at rest, shown exactly once, usable at
  login (mandatory companion to enrollment — no-recovery enrollment is a lockout factory).
- [ ] **TFA-05**: For enrolled users, login requires a second step (6-digit code or recovery
  code); no session identity exists before the code is verified (pending-session pattern must
  be tested as anonymous across every endpoint family).

### Cross-cutting

- [ ] **AUTH-01**: All new user-facing strings and error codes are catalogued in English and
  French; the `i18n-scan.mjs` build gate stays green (hard dependency, not polish).
- [ ] **AUTH-02**: Migration is additive columns/tables only with the byte-identical second-boot
  no-op guaranteed (`test/migration.test.mjs` extended); the fake `sessions` / `tfa` fields are
  removed from the workspace document (`emptyDoc()`, `seed.js`) — the v1.1 audit Active item.
- [ ] **AUTH-03**: All three flows are covered end-to-end in both locales (Chromium e2e); the QR
  is verified by UAT with a real device (Google Authenticator + one other app).

## Future Requirements (deferred)

- Disable-2FA flow (password + code gated) — deliberately out of scope for v1.3; enrollment
  stays one-way this milestone.
- Encryption-at-rest of the TOTP secret (AES-256-GCM under `MASTER_KEY`, fail closed).
- Reusable re-auth endpoint primitive; "log out all devices incl. current" alongside
  "log out others".
- Recovery-code regeneration action.
- Admin revoking a member's sessions; org-wide 2FA mandate.

## Out of Scope

- WebAuthn/passkeys, SMS or email OTP (no mailer in the server image), geolocation of sessions,
  live session tracking.
- Password history and strength meters beyond the existing validate rules; zxcvbn.
- Remember-me tiers (one tier deliberately — Pitfall 11).
- Per-user settings isolation beyond the auth fields (`notifPrefs`, `invoices` remain shared).
- Real billing, SSO/SAML, SCIM (unchanged from previous milestones).

## Traceability

Filled by the roadmap after phase mapping.
