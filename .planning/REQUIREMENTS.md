# Requirements — Milestone v1.4 Auth Completion

Derived from `.planning/research/` (STACK, FEATURES, ARCHITECTURE, PITFALLS, SUMMARY) and the
owner's scoping decisions. Ground-truth correction from research: v1.3 already ships the
AES-256-GCM TOTP encryption machinery (`encryptTotpSecret`/`decryptTotpSecret`, `v1:` envelope,
fail-closed 503), the disable-2FA route with password step-up, and self-session revocation.
This milestone is therefore gap-closure on the v1.3 auth surface, not greenfield construction.

**Privilege-model decision (owner-validated):** admin session revocation is scoped to an
**instance operator** (not workspace admins, not both tiers).

## v1.4 Requirements

### TOTP Encryption Closure (ENC)

- [x] **ENC-01**: On boot, any legacy plaintext `users.two_fa_secret` value (non-`v1:` format)
  is encrypted into the `v1:` envelope idempotently, inside a transaction, with the existing
  pre-migration backup guarantee, and a second boot is a byte-identical no-op
- [ ] **ENC-02**: Every `decryptTotpSecret` call site fails closed on a malformed/non-`v1:`
  secret — no plaintext fallback (`decrypt(x) ?? x`) anywhere; the fail-closed 503 affects only
  TOTP-verify/disable endpoints, never non-2FA login or workspace features

*Deferred from this category (per scoping):* key-version envelope upgrade for rotation
(re-enrollment on rotation accepted for now), DEPLOY.md key-custody runbook (tracked in
Out of Scope — update docs when rotation lands).

### Recovery-Code Regeneration (REGEN)

- [ ] **REGEN-01**: A user with 2FA enabled can regenerate their recovery codes via
  `POST /api/auth/tfa/recovery` — current password **and** a live TOTP code required; a
  recovery code must never satisfy the step-up
- [ ] **REGEN-02**: Regeneration atomically deletes all existing recovery codes and inserts the
  new hashed set in one transaction; new plaintext codes are displayed once and never stored

### Disable-2FA Closure (DIS)

- [ ] **DIS-01**: The shipped disable route is verified and, where needed, fixed: pending
  `login_challenges` teardown, one-transaction cleanup of `two_fa_*` + recovery codes, and an
  explicit session policy on disable
- [ ] **DIS-02**: A recovery code can never disable 2FA — password + live TOTP code required
  (regression-tested)

### Admin Session Revocation (OPREV)

- [ ] **OPREV-01**: The instance operator can revoke **all sessions of a target user** through
  an operator-authorized route; the operator's own sessions are excluded from a
  revoke-others action on themselves; revocation rides the existing mid-session 401 teardown,
  so revoked browsers sign out honestly
- [ ] **OPREV-02**: Owner accounts are immune: the operator cannot revoke an owner's sessions
  (privilege boundary, regression-tested)

## Future Requirements (deferred)

- Key-version envelope enabling MASTER_KEY rotation as a re-wrap (currently rotation = re-enroll)
- DEPLOY.md key-custody / lost-key runbook (documented escape hatch: re-enroll)
- Per-user + revoke-all operator route shapes (only per-user revoke ships in OPREV-01)
- Audit trail entries for operator revocations
- Workspace-admin tier of revocation
- Membership-surface hardening, router/URL popstate, recent-search leak, per-user settings
  isolation (carried in PROJECT.md Active)

## Out of Scope (explicit exclusions)

- Admin-disables-user's-2FA (operator turns 2FA off on someone's behalf) — account-takeover
  surface; recovery = operator-assisted re-enrollment instead
- Plaintext "recovery copy" of the TOTP secret, key escrow
- Soft-disable grace periods for 2FA
- Revoke-by-IP
- Recovering access when MASTER_KEY is lost (fail-closed consequence accepted; users re-enroll)

## Traceability

| REQ | Phase | Status |
|-----|-------|--------|
| ENC-01 | Phase 19 | Complete (19-01) |
| ENC-02 | Phase 19 | Pending |
| REGEN-01 | Phase 20 | Pending |
| REGEN-02 | Phase 20 | Pending |
| DIS-01 | Phase 21 | Pending |
| DIS-02 | Phase 21 | Pending |
| OPREV-01 | Phase 22 | Pending |
| OPREV-02 | Phase 22 | Pending |

Coverage: 8/8 v1.4 requirements mapped, no orphans, no duplicates.
