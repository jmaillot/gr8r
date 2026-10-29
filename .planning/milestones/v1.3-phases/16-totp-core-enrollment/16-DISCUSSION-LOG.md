# Phase 16: TOTP Core & Enrollment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-27
**Phase:** 16-TOTP Core & Enrollment
**Areas discussed:** Enrollment endpoint & state, Recovery codes shape & UX, QR & secret display, Settings UI & disable flow

---

## Enrollment endpoint & state

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory pending Map | user_id-keyed Map with short TTL (attempts-Map pattern); secret never on disk until enable; restart = re-scan QR | ✓ |
| Encrypted column, flag off | Write ciphertext into two_fa_secret with enabled=0; "disabled with a secret" becomes auditable state | |
| login_challenges reuse | Store pending secrets in the existing login_challenges table | |

| Option | Description | Selected |
|--------|-------------|----------|
| enroll + enable pair | POST /api/auth/tfa/enroll + POST /api/auth/tfa/enable; D-26 flat style; verify-before-enable natural | ✓ |
| Single route | Impossible shape — secret must reach the phone first | |

| Option | Description | Selected |
|--------|-------------|----------|
| Server returns URI + secret | 200 { secret, otpauth }; server owns the otpauth URI format | ✓ |
| Client builds URI | Server returns raw secret only; client composes the URI | |

| Option | Description | Selected |
|--------|-------------|----------|
| No password re-entry | Live code verify is already proof of intent | |
| Password confirmation | POST /api/auth/tfa/enroll requires { currentPassword } (like PATCH /api/auth/password) | ✓ |
| Full re-auth step-up | WebCrypto/passkey — new pattern, heavy under zero-deps | |

**User's choice:** In-memory Map; enroll+enable pair; server-built URI; password step-up on enroll start.
**Notes:** Wrong-password attempts at enroll consume throttle budget (D-41 pattern); exact constant = agent discretion within D-11 band.

---

## Recovery codes shape & UX

| Option | Description | Selected |
|--------|-------------|----------|
| 10 codes | Headroom for burns across device losses | ✓ |
| 8 codes | Minimum of the TFA-04 band | |

| Option | Description | Selected |
|--------|-------------|----------|
| xxxx-xxxx hex | Lowercase hex groups; copyable, unambiguous; sha256-hashed whole | ✓ |
| 4+4 alphanumeric | Letter/number confusion (0/O, 1/I) hurts transcription | |

| Option | Description | Selected |
|--------|-------------|----------|
| users columns | two_fa_recovery text holding 10 hashes; no new table | |
| Dedicated table | One row per code (hash, used state); finer per-code state | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| One-time modal at enable | Copy-all; never retrievable again; re-enroll issues fresh set | ✓ |
| Inline in settings page | Simpler rendering but risks being missed | |

**User's choice:** 10 codes; xxxx-xxxx hex; dedicated table; one-time modal.
**Notes:** None.

---

## QR & secret display

| Option | Description | Selected |
|--------|-------------|----------|
| email as account label | otpauth://totp/Projects:<email>?…; unique per user | ✓ |
| Workspace slug as label | Colliding labels for multi-workspace users | |

| Option | Description | Selected |
|--------|-------------|----------|
| Copyable secret field | Monospace read-only field + copy button + "can't scan?" hint | ✓ |
| Secret field + otpauth link | Extra deep-link affordance; marginal for self-hosted web app | |

**User's choice:** Email label; copyable secret field.
**Notes:** None.

---

## Settings UI & disable flow

| Option | Description | Selected |
|--------|-------------|----------|
| Inline section states | One card with off/on states; enrollment inline; matches settings-page pattern and the retained settings.tfa.* keys | ✓ |
| Wizard modal | Multi-step modal for enrollment | |

| Option | Description | Selected |
|--------|-------------|----------|
| Password only | Symmetric gate; simplest lockout-free path | |
| 6-digit code required | Proves authenticator held; locks out dead-device users | |
| (free text) | "password + code + an admin can reset 2FA for a user" | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| 6-digit or recovery accepted | Lost-device user can disable with a printed code; matches TFA-05's dual shape | ✓ |
| 6-digit only | Recovery codes stay login-only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Generic client error | 503 body naming MASTER_KEY is server-log material only (D-06 "never user-facing") | ✓ |
| Show 503 detail in UI | Leaks key-management details to any signed-in user | |

**User's choice:** Inline card; password + code (either type) on disable; generic client error under fail-closed 503.
**Notes:** User also asked for admin 2FA reset — flagged as scope creep, captured in Deferred Ideas (no admin role/surface exists in the codebase).

---

## the agent's Discretion

- Pending-Map TTL length; per-user overwrite policy on re-enroll clicks.
- Exact throttle budget constant for enroll/disable step-up (D-11 band, distinct prefix).
- Burn-time normalization (dash strip / case-fold) — identical across enable display, login burn, disable verify.
- Exact toast copy within honest-copy rule; i18n count pins updated in-commit.
- D-06 503 body wording (admin-facing, names MASTER_KEY).
- Test file placement per existing test/ conventions.

## Deferred Ideas

- Admin reset of a user's 2FA — new capability (no admin role exists); roadmap backlog, own phase.
