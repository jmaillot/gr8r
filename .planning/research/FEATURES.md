# Feature Research

**Domain:** Auth hardening for a self-hosted PM app (sessions management, password change with revocation, TOTP 2FA)
**Researched:** 2026-10-26 (v1.3 Auth Hardening milestone)
**Confidence:** HIGH

All three features are mature, well-understood security patterns — the expected behaviors are
converged across self-hosted products (GitHub, GitLab, Nextcloud, Gitea, Bitwarden, Proton,
standard web frameworks). Confidence is HIGH overall; the main uncertainty is product-local
(investigation phase 0, existing session rows and i18n keys), not domain knowledge.

## Feature Landscape

### Table Stakes (Users Expect These)

These are the behaviors users already get from any mainstream web product; missing one reads
as "broken" — which is exactly the current state of Gr8r Studio (fake QR, dead button, password
change that lies on success).

**Feature 1 — Sessions page (view + revoke)**

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Sessions list shows each active session: device/UA summary, IP, last-seen time | Every mainstream product (GitHub, Google, Nextcloud) shows this; a bare count feels broken | LOW | Parse User-Agent at login (store once, not per request); last-seen = update a `last_used_at` column on session lookup. All formats go through `t()` + `Intl` date formatting (v1.2 i18n dependency) |
| "Current session" marker on the caller's own session | Users must know which row is safe to revoke vs. which pushes them to login | LOW | Compare session id from cookie to row id; badge `"This device"` (translated) |
| Revoke one session by row (button per row) | Row-level revoke is the base primitive; "log out others" is built on it | LOW | Delete the session row + its server-side record. Opaque cookie sessions make this trivial: the token IS the row |
| "Log out other sessions" button — actually revokes all sessions except current, with confirmation | Explicitly named in the milestone; users expect the button on the row they see | LOW- MEDIUM | One SQL delete `WHERE user_id = ? AND id != current`. Confirmation dialog (existing modal pattern). Current session MUST survive — never log the caller out of the action they just performed |
| Logout-all everywhere (single "sign out of all devices" that also kills current + redirects to login) | Standard companion; different semantics from "other sessions" | LOW | Same delete without the `id !=` clause, then clear cookie. Cheap to add, often confused with the above — label distinctly |
| Session display data is captured, not inferred | Devise/desktop labels like "Firefox on Linux" require stored UA and IP at session creation | LOW | Store `ua` text and `ip` at creation only; do not live-track (anti-feature: live geolocation) |

**Feature 2 — Password change that actually works**

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| New password works at next login (the current bug) | A password form that answers "updated" but fails at login is worse than no form | LOW | Likely root cause somewhere in the stubbed auth zone (phase-0 investigation). Verify with a server test: change → logout → login with new password |
| Current password required to authorize the change (re-authentication) | OWASP Authentication Cheat Sheet standard; prevents session-hijacker changing the password (that's the account-takeover endgame the form must not hand over) | LOW | `scrypt.verify` the old password server-side before hashing the new one. Distinct error code `wrongPassword` (uses the v1.2 stable-error-code pattern: code + English fallback) |
| Password change revokes ALL other sessions automatically | OWASP Session Management Cheat Sheet: on password change, previous session IDs must be destroyed. Mainstream behavior (GitHub, Google, GitLab all do this) | LOW | Same SQL as "log out others"; reuse the sessions feature's revocation primitive. No button needed — automatic is the expected default |
| Current session SURVIVES the password change | The user is mid-flow, authenticated with fresh credentials; logging them out is jarring and most products keep them in. Revoking the current session would be acceptable if the response tells the user, but surviving is the norm | LOW | Deliberate decision: keep current session (optionally rotate/refresh its server-side record), revoke the rest |
| Confirmation/success toast reflects the true outcome ("Password updated — other sessions were signed out") | The v1.2 error-code decision warns against toasts that lie; success copy must match what actually happened | LOW | New i18n keys; client already translates codes |
| Confirmation before the destructive change (dialog or explicit "this will sign out your other devices") | Sets expectation; pairs with the revoke-on-change behavior | LOW | Existing confirm-modal pattern |

**Feature 3 — Real TOTP 2FA**

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Secret generation + `otpauth://totp/...` URI with correct parameters | Any authenticator app (Aegis, Google Authenticator, 1Password) scans this; wrong label/issuer shows garbage in the app | LOW- MEDIUM | URI form: `otpauth://totp/Gr8r:<user>?secret=<base32>&issuer=Gr8r&algorithm=SHA1&digits=6&period=30`. SHA1/6/30 defaults are REQUIRED for authenticator compatibility, not negotiable |
| Scannable QR code that renders the real URI | The current QR is fake/illegible — direct replacement target. Without a real QR the feature is unusable on mobile | LOW- MEDIUM | Zero-runtime-dependency constraint: generate QR as SVG server-side without a framework dependency is doable but non-trivial (~200 lines of QR encoding). Options: a tiny vendored QR encoder, or render the base32 secret + URI as copyable text as fallback. Vulnerable to phase-0 root-cause finding. A QR library is the one place a new dependency may beat hand-writing QR encoding — flag for the planner |
| Verify a 6-digit code BEFORE enrollment completes | Enabling 2FA on an unverified secret locks the user out if it's wrong (typo'd secret, bad clock). Every correct implementation confirms first: QR → scan → enter code → only then enable | MEDIUM | Store secret as `pending` + `created_at`; `POST /api/auth/2fa/verify` accepts any of current ±1 window (30 s clock skew), then flips `tfa_enabled=1`. This is the single most important correctness gate in the feature |
| Recovery / backup codes generated at enrollment, shown once, hashed at rest | If the phone is lost, TOTP without recovery codes is a lockout. All serious products issue one-time-use backup codes | MEDIUM | 8–10 single-use codes, scrypt-hashed inline with passwords, shown once in a modal, "I've saved them" gate. One new table or JSON column. This is the biggest NEW chunk of the feature |
| Disabling 2FA requires the current password (and a valid TOTP or recovery code when enabled) | Turning off 2FA with a stolen session is the attack 2FA exists to stop | LOW | Reuses password-verify + totp-verify primitives |
| Login enforces TOTP when enabled: after password, second step asks for 6-digit code (or recovery code) | The point of the feature | MEDIUM | Two-step login: password step issues a short-lived, single-purpose "pre-auth" ticket (a pending-2FA session token); second step verifies. Recovery code input allowed in the same field (auto-detect format) — simpler UX than two boxes |
| 2FA state is per-user, and offered optionally | Self-hosted small team reality: 2FA is opt-in per account; nothing forces admin → all members | LOW | New per-user column. Note: PROJECT.md already flags `tfa` as a workspace-shared document field that must become per-user — this feature is the trigger to fix that isolation bug (per-user settings isolation is also in Active requirements) |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Sessions page shows workspace tie-in and honest timestamps ("Last used 2 h ago") | "Last seen X ago" i18n via `Intl.RelativeTimeFormat` reuses the v1.2 layer for free — polish at near-zero cost | LOW | Pure client formatting |
| 2FA enforced flag for the instance (env/flag: admins must have 2FA) | One-line policy check that meaningfully improves a self-hosted deployment's posture without building enterprise forcing machinery | LOW- MEDIUM | Defer full role-based "required for all members" — anti-feature for this scale |
| Push/re-verification prompts ("confirm it's you" re-auth for sensitive actions reusing the password check) | The password-verify-on-change primitive generalizes: same inline "re-enter password" pattern can later guard plan changes or owner transfers | LOW once built | Design the password-verify endpoint (`POST /api/auth/reauth`? or inline in each endpoint) so it's reusable; don't build the UI yet |
| Remember-this-device for 2FA (skip TOTP for 30 days on this browser) | Big UX win, standard (GitHub). Session-row gains an optional `tfa_trusted` flag | MEDIUM | Adds a second token concept. Defer to v1.x — the two-step login must ship first |

### Anti-Features (Commonly Requested, Often Problematic — out of scale here)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| SMS or email OTP | "More channels = better" | The milestone context explicitly states no SMS/email delivery guarantees; self-hosted Docker image has no mailer; adds carrier/relay dependencies, costs, and a new failure mode that locks users out | TOTP + recovery codes only — the standards-based channel that needs no infrastructure |
| Geolocation / "device map" on the sessions page | Looks impressive | IP-geolocation databases are external, stale, and wrong; privacy-hostile for self-hosted; useless within a small team | Device + IP + last-seen text. Optional `Country` never — don't fetch geo databases |
| Live/real-time session tracking (sessions disappearing when revoked elsewhere, WebSockets) | Feels modern | Session polling/WebSocket plumbing for near-zero value; revocation already takes effect on next request | Static list, refreshed on page load; revoked sessions simply return 401 on use |
| Admin revokes any member's sessions globally | "I'm the admin" | Gr8r's auth is per-account; admin forcing into other accounts' sessions reopens the per-user isolation bug the milestone is closing; enterprise-scale | An admin can remove a membership (already exists); the user manages their own sessions |
| WebAuthn / passkeys in v1.3 | "It's 2026" | Separate enrollment + challenge ceremony, browser-dependent, doubles login flows Kat and 2FA logic; real project, wrong milestone | TOTP first (universally compatible); passkeys listed for future consideration |
| Forced 2FA for all users / organization-wide mandate | Security theater demand | With no SMS/email fallback, mandatory TOTP with no admin recovery path = guaranteed lockout tickets for a small self-hosted team | Optional per user + (later) an admin-must-have-2FA flag |
| Password strength meter / zxcvbn | Nice polish | New dependency or hand-rolled heuristics; risk scoring is project-scale creep | Minimum-length validation + reuse prevention check only (cheap, and "new password must differ" is required anyway) |
| Single-use login "sessions" & device push approval | Enterprise SSO territory | Requires notification infrastructure the app doesn't have | Nothing — out of scale |

## Feature Dependencies

```
[Password change works + revokes others]
    └──requires──> [Session revocation primitive (delete rows by user, keep current)]
                        └──requires──> [Session rows persisted server-side (already partially exists)]

[Sessions page "log out others"]
    └──uses──> [same revocation primitive]

[2FA verify-before-enable]
    └──requires──> [TOTP core: secret gen + base32 + code verify (hand-rolled or dep)]

[2FA login step]
    └──requires──> [TOTP core]
    └──requires──> [pre-auth ticket concept in login flow]
    └──enhances──> [recovery codes: consumed at login OR at disable]

[Recovery codes]
    └──requires──> [scrypt hashing (exists) + a new store for code hashes]

[All three features]
    └──requires──> [i18n: ~30–60 new keys, error codes pattern from v1.2]
    └──requires──> [per-user storage: `tfa` and `sessions` must move off the shared
                     workspace document (Active requirement from v1.1 audit)]

[Phase 0 investigation]
    └──feeds──> all three (find the shared stub root cause before building)
```

### Dependency Notes

- **Password change requires the revocation primitive:** "revoke others" is one shared SQL
  operation used by both the sessions button and the password-change flow. Build the primitive
  once, first — it makes the sessions feature and the password feature nearly free afterward.
- **Per-user settings isolation is a hidden prerequisite:** the v1.1 audit flagged that `tfa`
  and `sessions` are shared fields on the workspace document. Any real 2FA state or session
  metadata stored there would be wrong (shared across users). The move to per-user columns is
  a schema/migration task that must land in or before the 2FA phase; migration machinery
  exists and is proven.
- **2FA verify-before-enable requires TOTP core** but NOT recovery codes; recovery is additive
  and could even land in a follow-up phase — though shipping enrollment without recovery codes
  creates a lockout risk, so they belong in the same phase.
- **All features conflict with nothing existing**, but every success/error string must go
  through the i18n catalogue with the stable-error-code pattern, or the v1.2 build gate
  (i18n-scan.mjs) fails the build — that's a hard dependency, not polish.
- **QR generation is the one ecosystem decision:** a tiny QR encoder dependency vs. vendored
  code vs. text-secret fallback. This is the only place where the zero-runtime-dependency
  principle faces real friction; needs an explicit decision in the phase plan.

## MVP Definition

### Launch With (v1.3)

- [ ] Session revocation primitive (revoke others / one / all; current session survives
      "others") — everything else builds on it
- [ ] Sessions list with device, IP, last-seen, current-session marker + per-row revoke +
      "log out other sessions" with confirmation
- [ ] Password change verified end to end: old password required, new works at login,
      other sessions revoked automatically, current survives, honest success copy
- [ ] TOTP enrollment: secret + otpauth URI + real scannable QR + 6-digit verify BEFORE enable
- [ ] Login second step: TOTP code (or recovery code) after password
- [ ] Recovery codes: generated at enrollment, shown once, hashed, consumable at login and at disable
- [ ] Disabling 2FA requires password (+ code when enabled)
- [ ] `tfa` / session metadata moved to per-user storage
- [ ] i18n coverage for all new strings and error codes (EN + FR)

### Add After Validation (v1.x)

- [ ] "Remember this device" for 2FA — once the two-step login has shipped and been used
- [ ] Reusable re-auth endpoint guarding other sensitive actions (plan change, owner transfer)
- [ ] Admin-must-have-2FA instance flag

### Future Consideration (v2+)

- [ ] WebAuthn/passkeys — separate enrollment and challenge machinery
- [ ] Organization-wide 2FA mandate with admin recovery flow
- [ ] Login history / security-event log per user (audit-grade, beyond last-seen)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Session revocation primitive | HIGH | LOW | P1 |
| Sessions page (list + marker + revoke buttons) | HIGH | LOW-MEDIUM | P1 |
| Password change works + requires old + revokes others | HIGH | LOW (once primitive exists) | P1 |
| TOTP enrollment w/ verify-first + real QR | HIGH | MEDIUM | P1 |
| Login TOTP step + recovery codes | HIGH | MEDIUM | P1 |
| Disable-2FA requires password/code | MEDIUM | LOW | P1 |
| Per-user settings migration (tfa, sessions) | HIGH (correctness) | MEDIUM | P1 |
| "Last used X ago" relative formatting | MEDIUM | LOW | P2 |
| Remember this device | MEDIUM | MEDIUM | P2 |
| Reusable re-auth endpoint | MEDIUM | LOW | P2 |
| Admin 2FA flag | LOW | LOW | P3 |
| Passkeys, org mandate, login history | LOW for this scale | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | GitHub / GitLab | Nextcloud / Gitea | Our Approach |
|---------|-----------------|-------------------|--------------|
| Sessions page | Device, IP, last activity, current marker, revoke row + "sign out others" | Same pattern (Nextcloud: per-device, WebAuthn-tagged) | Match GitHub's model — device/IP/last-seen/current marker; no live tracking |
| Password change | Requires current password; revokes other sessions, keeps current | Same (varies: some log out everywhere) | OWASP-conformant: verify old, revoke others, keep current, honest copy |
| 2FA enrollment | QR + verify code before enabled + recovery codes shown once | Same in TOTP-capable instances | Identical flow; QR is the implementation risk (dependency vs vendored encoder) |
| 2FA enforcement | Optional per user; org-level policy in enterprise tiers | Optional; admin enforcement rare | Optional per user at this scale; admin flag deferred |
| Recovery channels | SMS/email + backup codes | Backup codes only (no mailer in many self-host setups) | Backup codes only — no SMS/email delivery, per milestone constraint |

## Sources

- OWASP Session Management Cheat Sheet — "Renew the Session ID After Any Privilege Level
  Change": password change must destroy previous session IDs (fetched directly, 2026-10-26)
- OWASP Multifactor Authentication Cheat Sheet — verification-before-enrollment, lookup/recovery codes (cited as basis; full text fetch degraded by search outage, pattern is standard)
- Web search was largely unavailable this session (SearXNG engines rate-limited/CAPTCHA); the
  remaining domain findings are well-established practice converged across GitHub, GitLab,
  Nextcloud, Gitea, and standard framework behavior (Devise, Django, Laravel) — MEDIUM-HIGH
  confidence on details, HIGH on the flows themselves. Phase planning should treat
  "what GitHub does" as the reference behavior.
- Project-local context: `.planning/PROJECT.md` (v1.1 audit Active items: per-user settings
  isolation; v1.2 decisions: stable error codes, i18n build gate)

---
*Feature research for: v1.3 Auth Hardening — sessions, password change, TOTP 2FA*
*Researched: 2026-10-26*
