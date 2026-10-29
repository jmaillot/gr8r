# Roadmap: Gr8r Studio

## v1.4 — Auth Completion

**Goal:** every auth item deferred out of v1.3 lands — the 2FA lifecycle and session control
become complete. This is a gap-closure milestone on the shipped v1.3 auth surface, not
greenfield construction.

**Coverage:** 8/8 v1.4 requirements mapped. Phase numbering continues from v1.3 (phases 13–18).

## Phases

- [x] **Phase 19: TOTP Encryption Closure** - Fail-closed decrypt surface everywhere and a boot-time plaintext→envelope migration for legacy `two_fa_secret` rows (completed 2026-10-28)
- [ ] **Phase 20: Recovery-Code Regeneration** - A 2FA user can burn-and-replace their recovery codes behind fresh password + live TOTP step-up
- [ ] **Phase 21: Disable-2FA Verification & Closure** - The shipped disable route is verified against the full contract and closed with e2e + i18n coverage
- [ ] **Phase 22: Operator Session Revocation** - The instance operator can revoke any non-owner user's sessions; revoked browsers sign out honestly

## Phase Details

### Phase 19: TOTP Encryption Closure

**Goal**: Every TOTP secret lives in the `v1:` AES-256-GCM envelope, and every decrypt path fails closed — no plaintext fallback anywhere, ever.
**Depends on**: Nothing (first phase of the milestone; foundation for 20 and 21)
**Requirements**: ENC-01, ENC-02
**Success Criteria** (what must be TRUE):
  1. A database restored from a pre-v1.3 backup (plaintext `two_fa_secret`) boots with the secret encrypted into the `v1:` envelope, inside a transaction, with the pre-migration backup guarantee — and the second boot is a byte-identical no-op
  2. A malformed or non-`v1:` secret at any decrypt call site produces a fail-closed 503 on the affected TOTP-verify/disable endpoint — never a plaintext fallback, never silently accepted
  3. The fail-closed 503 touches only TOTP-verify/disable endpoints: normal login (non-2FA), workspace features and every other route work untouched when decryption cannot proceed
  4. Every decrypt call site has been audited and routes through the single boundary helper; grep-level tests prove no `decrypt(x) ?? x` pattern exists anywhere

**Plans:** 2/2 plans complete
**Status:** Complete (2026-10-28) — verified 12/12 must-haves, nyquist validated, security SECURED (threats_open: 0)

Plans:
**Wave 1**
- [x] 19-01-PLAN.md — Boot-time plaintext→`v1:` envelope migration (`migrateTotpEncryption`, trigger-gated, transactional, backup-guaranteed) + ENC-01 tests ✅ 19-01-SUMMARY.md

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 19-02-PLAN.md — Decrypt boundary closure: `requireTotpSecret` wrapper, two call-site swaps, three D-78 proofs (grep/behavioral/exclusivity)

### Phase 20: Recovery-Code Regeneration

**Goal**: A user with 2FA enabled can replace their recovery codes when they suspect exposure — with the strongest step-up, and atomic burn-and-replace semantics.
**Depends on**: Phase 19 (regeneration reads the encrypted secret for the live TOTP check)
**Requirements**: REGEN-01, REGEN-02
**Success Criteria** (what must be TRUE):
  1. A user with 2FA enabled can regenerate recovery codes via `POST /api/auth/tfa/recovery` by providing their current password and a live TOTP code — a recovery code is rejected as step-up every time (regression-tested)
  2. Regeneration atomically deletes all existing recovery codes and inserts the new hashed set in one transaction — an interrupted or concurrent attempt can never leave both old and new codes valid
  3. New plaintext codes are displayed exactly once in the UI and never stored; the old set is invalid the moment the new set lands
  4. The regeneration endpoint has its own throttle budget and the response carries `Cache-Control: no-store`

**Plans**: 2/2 plans executed

Plans:
**Wave 1**
- [x] 20-01-PLAN.md — Wave 1: POST /api/auth/tfa/recovery route (D-85..D-100), security_log mechanism (D-99), test/tfa-recovery-regen.test.mjs

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 20-02-PLAN.md — Wave 2: settings-card regen stage (D-90), actions + api wiring, D-53 modal reuse (D-91), EN+FR i18n (D-92)
- [x] 20-03-PLAN.md — Gap closure G-20-1: short row-level 2FA button labels + wrap-tolerant .srow control cluster

### Phase 21: Disable-2FA Verification & Closure

**Goal**: Turning 2FA off is verified end-to-end against the full contract — no ghost 2FA state, no recovery-code shortcut — and covered by automated proof.
**Depends on**: Phase 20 (disable and regeneration are siblings on the settings 2FA card; disable also consumes the encrypted-secret reality from Phase 19)
**Requirements**: DIS-01, DIS-02
**Success Criteria** (what must be TRUE):
  1. Disabling 2FA requires the current password and a live TOTP code — a recovery code can never disable 2FA (regression-tested)
  2. Disable in one transaction wipes `two_fa_*` columns, all recovery codes and any pending `login_challenges` — the account cannot be left in a half-disabled state where login still demands a code the account can no longer produce
  3. Disable applies an explicit, documented session policy (keep-current / revoke-others) and records the activity verb
  4. The full disable→re-enroll cycle is covered by Chromium e2e in EN + FR, with all new strings catalogued (i18n-scan green)

**Plans**: TBD
**UI hint**: yes

### Phase 22: Operator Session Revocation

**Goal**: The instance operator can forcibly sign out any non-owner user's browsers across the instance — with a hard privilege boundary — and revocation rides the existing honest 401 teardown.
**Depends on**: Phases 19–21 (consumes the gate/throttle/i18n patterns; closes the milestone with the cross-feature e2e)
**Requirements**: OPREV-01, OPREV-02
**Success Criteria** (what must be TRUE):
  1. The instance operator can revoke **all sessions of a target user** through an operator-authorized route; every revoked browser goes through the central mid-session 401 teardown and signs out honestly (signedOutElsewhere)
  2. When the operator revokes a target's sessions excluding their own, the operator's own sessions survive a revoke-others action on themselves
  3. Owner accounts are immune: an attempt to revoke an owner's sessions is refused and regression-tested
  4. The privilege gate is instance-operator, not workspace-admin: a workspace admin who is not the operator cannot revoke another user's sessions (privilege-matrix test)
  5. One cross-feature Chromium e2e covers the full lifecycle — enroll → regenerate → login → disable → re-enroll → revoke — in EN + FR, with no v1.3 test deleted or weakened

**Plans**: TBD

## Research Notes

- **Blocking decision for Phase 22** (resolve in `/gsd-discuss-phase 22`): the instance-operator gate mechanism — `ADMIN_EMAIL`-derived vs additive `is_instance_admin` flag column. Gating on `isAdminUser()` alone is rejected (tenant-boundary privilege inflation, research Pitfall 6).
- **Policy conflict for Phase 21** (resolve in discuss): research indicates the shipped disable route may accept recovery codes (server.js ~1575); REQUIREMENTS.md DIS-02 requires password + live TOTP only. Tighten, verified by regression test.
- **Audit-log location for Phase 22**: workspace activity log vs server logs for instance-level actions — settle in discuss-phase.
- Phase ordering follows the research build order: encryption closure first (single decrypt surface before any route work), then regeneration (smallest new route), then disable closure, then operator revocation (the newest privilege surface, only unknown last).
- Phases 19–21 follow standard patterns (skip research-phase); Phases 21–22 need discuss-phase rounds.

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 19. TOTP Encryption Closure | 2/2 | Complete    | 2026-10-28 |
| 20. Recovery-Code Regeneration | 2/2 | In Progress|  |
| 21. Disable-2FA Verification & Closure | 0/? | Not started | - |
| 22. Operator Session Revocation | 0/? | Not started | - |
