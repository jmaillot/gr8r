# Roadmap: Gr8r Studio

**Milestone: v1.3 — Auth Hardening.** Continues numbering from v1.1 (phases 1–4) and v1.2
(phases 5–12). All three target features (sessions, password change, 2FA) share one root cause:
auth state is decorative JSON in the shared workspace document with no backend. The build order
is re-ground auth state first, then three flows on top of it, ending with a closing verification
gate. Research: `.planning/research/SUMMARY.md` (HIGH confidence).

## Milestones

- ✅ **v1.1 Multitenant** — archived in `milestones/v1.1-*`
- ✅ **v1.2 Localization** — shipped 2026-10-25, archived in `milestones/v1.2-*`
- 🚧 **v1.3 Auth Hardening** — this roadmap (Phase 13–18)

## Phases

- [x] **Phase 13: Investigation & Invariant Pinning** - Diagnose the shared stub-auth root cause in the live code and pin the design contracts (pending-2FA session pattern, QR vendoring, throttle constants, encryption-at-rest decision, doc-field removal plan) before any build work *(complete: 13-01 + 13-02 gap closure; verification re-verification pending)*
- [ ] **Phase 14: Schema & Session Ground Truth** - Migrate auth state into real per-user tables, remove the fake `sessions`/`tfa` document fields, and make the sessions page + revocation primitive real (the primitive every later phase reuses)
- [ ] **Phase 15: Password Change End-to-End** - Password change verified against the current password, works at next login, and atomically revokes all other sessions in the same transaction that rehashes
- [ ] **Phase 16: TOTP Core & Enrollment** - Real TOTP secret generation, live code verification with replay guard, a genuinely scannable QR from a vendored encoder, and hashed single-use recovery codes shipped together at enrollment
- [ ] **Phase 17: Login Second-Factor Flow** - Enrolled users must pass a 6-digit or recovery-code step after login; a pending sign-in is anonymous across every endpoint family until the code verifies
- [ ] **Phase 18: Closing Verification — i18n, Migration Proof & Real-Device UAT** - Whole-surface gates: EN+FR catalogue green, byte-identical second-boot migration proven, Chromium e2e for all three flows in both locales, QR UAT with a real device

## Phase Details

### Phase 13: Investigation & Invariant Pinning

**Goal**: The root cause is confirmed against the live code and the technical decisions that constrain every later phase are made once, in writing — no discovery surprises mid-build.
**Depends on**: Nothing (milestone start)
**Requirements**: — (foundation phase; its deliverables are decisions consumed by SESS-01–03,
PASS-01–03, TFA-01–05 and AUTH-02)
**Success Criteria** (what must be TRUE):
  1. A written diagnosis states where each stub lives (code reads: `emptyDoc()` doc fields, fake QR renderer, client-only revoke/password paths) — no claim resting on assumption
  2. The pending-2FA session mechanism is decided (pending row vs dedicated `login_challenges` table) together with the invariant that no endpoint may treat a pending sign-in as an identity
  3. The QR strategy is pinned: a specific vendored MIT encoder file (license header, ESM compatibility with the Vite build) — never hand-written
  4. The TOTP secret encryption-at-rest question is answered once (with DEPLOY.md consequences noted) and throttle constants are fixed per endpoint, with no budget reset between password and 2FA steps
  5. The doc-field removal plan for `sessions`/`tfa` is scoped to its landing phase (Phase 14) with the guarantees it must keep (byte-identical second boot)

**Plans**: 2/2 plans complete executed; +1 gap-closure plan (13-02, from verification gaps_found)

Plans:
**Wave 1**
- [x] 13-01-PLAN.md — Produce 13-DECISIONS.md: verified stub diagnosis + pinned contracts D-01…D-17 (pending-2FA, encryption-at-rest, throttle, QR) + Phase 14 removal scope

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 13-02-PLAN.md — Gap closure: reconcile D-04 landing phase (Phase 14 owns the replay-guard column, Phase 16 the guard behavior) + resolve D-13 override scope (server.js:1235 copy replaced in Phase 17) in 13-DECISIONS.md; refresh stale [VERIFIED] count in 13-01-SUMMARY.md

### Phase 14: Schema & Session Ground Truth

**Goal**: Auth state stops being decorative JSON: sessions and 2FA fields live in per-user rows, the workspace document no longer carries auth fields, and the sessions page drives a real revocation primitive (revoke-others and per-row revoke) that later phases reuse.
**Depends on**: Phase 13
**Requirements**: SESS-01, SESS-02, SESS-03, AUTH-02
**Success Criteria** (what must be TRUE):
  1. A user sees their active sessions with device label, IP, last-seen and a "this session" marker — content that came from the `sessions` table, not from the workspace document (SESS-01)
  2. "Disconnect all other sessions" works: with two browsers signed in, the other one's next request is 401 and the current session stays signed in (SESS-02)
  3. Each row's individual revoke kills exactly that session (SESS-03)
  4. The workspace document contains no `sessions` or `tfa` fields on a fresh install, and an existing database migrates to the new schema with a second boot certified byte-identical (AUTH-02, extended `test/migration.test.mjs`)

**Plans**: 4 plans

Plans:
- [ ] 14-01-PLAN.md — Additive AUTH-02 migration: schema columns + login_challenges table + doc-field strip + extended migration test (tracer)
- [ ] 14-02-PLAN.md — Client foundation: locale keys (dev.*, err.signedOutElsewhere), API methods, deviceLabel() utility
- [ ] 14-03-PLAN.md — Server revocation: metadata capture, throttled last_seen_at, three /api/auth/sessions endpoints, test/sessions.test.mjs
- [ ] 14-04-PLAN.md — Client UI: settings sessions tab rewire, revoke actions, signOutRevoked(), 2FA stub deletion

**UI hint**: yes

### Phase 15: Password Change End-to-End

**Goal**: The password-change form stops lying: the server verifies the current password, the new password works at the next login, and all other sessions die atomically with the rehash — reusing Phase 14's revocation primitive.
**Depends on**: Phase 14
**Requirements**: PASS-01, PASS-02, PASS-03
**Success Criteria** (what must be TRUE):
  1. Changing password requires the correct current password; a wrong one fails and no change happens (PASS-01)
  2. After a successful change, the new password logs in and the old one does not (PASS-01)
  3. With two browsers signed in, a password change in one leaves the other's next request 401 while the changing session stays signed in — enforced inside one `transaction()` (PASS-02)
  4. The success toast states exactly what happened (password updated, other sessions disconnected) — the honest-copy rule (PASS-03)

**Plans**: TBD
**UI hint**: yes

### Phase 16: TOTP Core & Enrollment

**Goal**: A user can enroll a real TOTP authenticator: `node:crypto` secret, live 6-digit verification with replay protection, a genuinely scannable QR from a vendored encoder, and mandatory hashed recovery codes — no unverified-secret lockout.
**Depends on**: Phase 14 (schema); independent of Phase 15's surface
**Requirements**: TFA-01, TFA-02, TFA-03, TFA-04
**Success Criteria** (what must be TRUE):
  1. Enrollment generates a secret accepted by a standard authenticator (fixture-vector tests prove RFC 4226/6238 behavior: ±1 window, `timingSafeEqual`, matched-step replay guard) (TFA-01)
  2. A phone camera scans the displayed QR and the account appears in Google Authenticator; a copyable-secret fallback covers scannersless setups (TFA-02)
  3. 2FA flips on only after a live 6-digit code verifies against the pending secret; an abandoned enrollment leaves the user in exactly their pre-enrollment state (TFA-03)
  4. Enrollment issues 8–10 single-use recovery codes, shown exactly once in plaintext and hashed at rest; a printed code logs the user in exactly one time (TFA-04)

**Plans**: TBD
**UI hint**: yes

### Phase 17: Login Second-Factor Flow

**Goal**: Enrolled users face a real second step at login, and a pending sign-in is inert: the code — not the password — is what creates a session identity.
**Depends on**: Phase 16 (secret to verify) and Phase 14 (throttle machinery)
**Requirements**: TFA-05
**Success Criteria** (what must be TRUE):
  1. An enrolled user signs in with password then a 6-digit code, and only then is signed in (TFA-05)
  2. A recovery code can be burned at the login second step and works exactly once (TFA-05)
  3. A pending (password-correct, code-absent) sign-in is rejected as anonymous across every endpoint family — API routes, `/w/:slug/file/:id`, invite accept — with no cookie usable as identity (tested 401 matrix) (TFA-05)
  4. The password→2FA throttle shares one budget with no reset between steps; the challenge is short-lived (TFA-05)

**Plans**: TBD

### Phase 18: Closing Verification — i18n, Migration Proof & Real-Device UAT

**Goal**: The three flows are proven as a whole surface: both locales, real Chromium e2e, migration purity, DONE criteria from the pitfalls checklist, and the QR verified by human eyes on a real device.
**Depends on**: Phases 13–17 (all content phases)
**Requirements**: AUTH-01, AUTH-03
**Success Criteria** (what must be TRUE):
  1. The `i18n-scan.mjs` build gate is green with every new string and error code catalogued in English and French, and the app speaks both languages through all three flows (AUTH-01)
  2. Chromium e2e covers sessions revocation, password change + revocation, and the full 2FA login path in both locales (AUTH-03)
  3. A pre-v1.3 database migrates additively, no auth fields appear in any workspace JSON, and the second boot is byte-identical (final check of AUTH-02's guarantee)
  4. A human verifies the QR with Google Authenticator plus one other authenticator app on a real device (AUTH-03 — UAT, not automatable)
  5. The "looks-done-but-isn't" pitfalls checklist runs as explicit verification and each item is checked or gaps filed (AUTH-03)

**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 13. Investigation & Invariant Pinning | 2/2 | Complete    | 2026-10-26 |
| 14. Schema & Session Ground Truth | 0/N | Not started | - |
| 15. Password Change End-to-End | 0/N | Not started | - |
| 16. TOTP Core & Enrollment | 0/N | Not started | - |
| 17. Login Second-Factor Flow | 0/N | Not started | - |
| 18. Closing Verification | 0/N | Not started | - |

## Traceability

| Requirement | Phase |
|-------------|-------|
| SESS-01 | Phase 14 |
| SESS-02 | Phase 14 |
| SESS-03 | Phase 14 |
| AUTH-02 | Phase 14 |
| PASS-01 | Phase 15 |
| PASS-02 | Phase 15 |
| PASS-03 | Phase 15 |
| TFA-01 | Phase 16 |
| TFA-02 | Phase 16 |
| TFA-03 | Phase 16 |
| TFA-04 | Phase 16 |
| TFA-05 | Phase 17 |
| AUTH-01 | Phase 18 |
| AUTH-03 | Phase 18 |

Coverage: 14/14 ✓ (Phase 13 is decision groundwork with no dedicated requirement — its
deliverables are consumed by every other phase.)
