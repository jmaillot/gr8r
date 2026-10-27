---
gsd_state_version: "1.0"
milestone: v1.3
milestone_name: Auth Hardening
current_phase: 18
current_phase_name: Closing Verification — i18n, Migration Proof & Real-Device UAT
current_plan: Not started
status: planning
stopped_at: Phase 18 context gathered
last_updated: "2026-10-27T17:48:35.219Z"
state_head: f5caffd0e2e8b7ddff5d936387e3ddd8b3e025f1
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 15
  completed_plans: 15
last_activity: 2026-10-26
---

# STATE

Last updated: 2026-10-26

## Project Reference

- **Project:** Gr8r Studio — self-hosted PM workspace, zero runtime dependencies
  (plain ES modules + Vite, `server.js` over `node:sqlite`, opaque session cookies, scrypt)
- **Core value:** a real project-management workspace that never ships a backend that lies —
  every feature is server-backed and honestly reported.
- **Milestone:** v1.3 Auth Hardening — the auth surface becomes real: sessions, password change
  and 2FA stop being doc-field stubs and work end to end.
- Previous milestones shipped: v1.0 (initial), v1.1 Multitenant (4 phases), v1.2 Localization
  (8 phases, 12 total). Archives: `.planning/milestones/v1.1-*`, `v1.2-*`.

## Current Position

Phase: 18 — Closing Verification — i18n, Migration Proof & Real-Device UAT

Current Plan: Not started
Total Plans in Phase: 2

Plans ready: none — Phase 16 verified (UAT 3/3), ready for /gsd-next
Status: Ready to plan
Progress: `[██░░░░░░░░░░░░░░░░░░] ~[███████░░░] 67%` — 3 of 6 v1.3 phases complete (13, 15, 16); next: Phase 17 — Login Second-Factor Flow

## Milestone v1.3 Roadmap (phases 13–18, continuing v1.1=1–4, v1.2=5–12)

| Phase | Name | Requirements |
|-------|------|--------------|
| 13 | Investigation & Invariant Pinning | — (decision groundwork for all others) |
| 14 | Schema & Session Ground Truth | SESS-01, SESS-02, SESS-03, AUTH-02 |
| 15 | Password Change End-to-End | PASS-01, PASS-02, PASS-03 |
| 16 | TOTP Core & Enrollment | TFA-01, TFA-02, TFA-03, TFA-04 |
| 17 | Login Second-Factor Flow | TFA-05 |
| 18 | Closing Verification (i18n, migration, real-device UAT) | AUTH-01, AUTH-03 |

**Coverage:** 14/14 v1.3 requirements mapped, each to exactly one phase. Phase 13 carries no
dedicated requirement by design — it confirms the shared root cause and pins the contracts.

**Ordering rationale (from research, HIGH confidence):** investigation first (one root cause for
three symptoms); revocation primitive before password change (PASS-02 literally reuses SESS-02's
SQL); TOTP core + enrollment **with recovery codes coupled to TFA-04** before the login challenge
(TFA-05 verifies something that exists); i18n (AUTH-01), migration/doc-field removal (AUTH-02)
thread through the phases they touch, mapped to their landing/final-gate phase; AUTH-03 closes
with the object (Chromium e2e in both locales + real-device QR UAT).

## Key Decisions for Planning

- Zero runtime dependencies held: TOTP is `node:crypto` (~40–60 lines), Base32 hand-rolled with
  known-vector tests, QR from a **vendored MIT `qrcode.js`** (qrcode-generator 2.0.4) — never
  hand-written.
- Headline security invariant (Pitfall 15): a pending-2FA sign-in is anonymous across every
  endpoint family until the code verifies — the 401 matrix test is mandatory.
- Revocation keep-current: `token_hash != sha256(current cookie)`; test "second cookie dead,
  caller alive" (Pitfall 9).
- Migration is additive columns/tables only, byte-identical second boot extended in
  `test/migration.test.mjs`; fake `sessions`/`tfa` doc fields removed from `emptyDoc()`/`seed.js`
  (the v1.1 audit Active item).
- Recovery codes ship **in the same phase as TOTP enablement** — no-recovery enrollment is a
  lockout factory.
- Encryption-at-rest of the TOTP secret (AES-256-GCM under `MASTER_KEY`, fail-closed) is an
  unsettled product decision — Phase 13 decides once, with DEPLOY.md consequences.

## Decisions

Carried forward from v1.1/v1.2 (full record in the milestone archives — key invariants that
touch this milestone):
- Server tests never mock SQLite or HTTP; each test file owns its server + temp database.
- `t()` never escapes; catalogues are JSON importable by plain Node; the i18n scan runs before
  the bundler, so an uncatalogued literal fails the build.
- Login/signup carry sameOrigin 403 before the throttle; TRUST_PROXY is allow-list opt-in.
- Operational run-order rule: e2e must follow the FULL build (`build:en` last fails French e2e).
- [Phase 13]: Phase 13 pinned all 17 auth contracts as 13-DECISIONS.md (D-01…D-17) — the canonical citation target for Phases 14–18: login_challenges table with sessions-table purity, structural pending=anonymous, AES-256-GCM under MASTER_KEY with v1: envelope and fail-closed 503, hash-only recovery codes, rotation-requires-re-enrollment, per-endpoint throttle budgets with IP+email keys and generic lockout copy, vendored qrcode-generator@2.0.4, doc-field removal scoped to Phase 14
- [Phase 13 / 13-02 gap closure]: D-04's landing phase resolved to one answer — Phase 14 owns the replay-guard column in the AUTH-02 additive migration (with byte-identical second-boot test coverage), Phase 16 owns the guard behavior; D-13's override scope resolved — the existing server.js:1235 429 copy is also replaced with the pinned generic copy when Phase 17 reworks the login flow (one logical login = one budget, D-03/D-11)
- [Phase 14]: AUTH-02 additive migration landed in 14-01: sessions gains label/ip/last_seen_at/user_agent, users gains dormant two_fa_* (not null default 0), login_challenges table + expiry index per D-01/D-04/D-31; ensureColumn defs byte-identical to SCHEMA (P-B); normalizeDoc + docFromClient independently strip sessions/tfa (P-A) and emptyDoc/seed.js literals deleted (D-33); no backfill
- [Phase 15]: PATCH /api/auth/password landed (15-01): verify-inside-transaction against a fresh password_hash re-select, keep-current revoke-others verbatim, throttle key `pwchange|user.id` (10/15min), 200 { ok: true } only; new codes wrongCurrentPassword/passwordRequired catalogued EN+FR; 5-test real-server suite proves PASS-01/02
- [Phase 14 / 14-02]: client foundation landed — 10 dev.* device-label keys + err.signedOutElsewhere in both locales (D-28), signedOutElsewhere in CLIENT_ONLY_ERR_CODES (P-D), api.sessions/revokeSession/revokeAllSessions as auth-scoped no-slug-guard methods, deviceLabel(ua) renders only t('dev.*') tokens; i18n count pin 1549 and api call-site pin 24 updated in-commit
- [Phase 14]: 14-03 revocation primitive landed: opaque 12-char hash-prefix ids (D-27), keep-current disconnect-all SQL (P-H), user-scoped idempotent-204 per-row DELETE (OQ4 — no sessionNotFound code), metadata capture at all 3 insert sites, touchLastSeen 60s throttle with lastSeenNext map (T-14-07 map-lost-on-restart proven by test)
- [Phase 14]: 14-04 client wiring landed: sessions tab reads S.ui.sessions (server ground truth) with deviceLabel()/ago()/no location (D-19), revokes call the 14-03 DELETE endpoints with D-29 refresh, signOutRevoked() = A.signOut + err.signedOutElsewhere (D-28); 2FA stubs + tab deleted (D-33), settings.tfa.* keys kept for Phase 16 reuse; guard pins moved in-commit (icon baseline 172-3=169, data-a 434-430, section-id 2fa removed)
- [Phase 14]: D-28 gap closure: central mid-session 401 intercept in api.js call() routes every signInRequired 401 through the registered signOutRevoked teardown (once-per-revocation latch, boot guard, re-arm); per-site revoke-action branches retired; err.sessionExpired fully retired from catalogues and allowlist
- [Phase 16]: 16-01: TOTP helpers in top-level totp.js (sibling of server.js, outside src/ so Vite never bundles server crypto); Phase 17 imports verifyTotpCode + normalizeRecoveryCode verbatim
- [Phase 16]: 16-01: otpauth label = Gr8r:<encodeURIComponent(email)> — only the email is encoded, prefix literal (D-54 exact format)
- [Phase 16]: 16-01: vendored src/lib/vendor/qrcode.js excluded from i18n user-visible-literal scan (third-party source, not interface copy)
- [Phase 16]: Recovery plaintexts generated pre-transaction, hashed inside it, returned once (16-02)
- [Phase 16]: Disable resets two_fa_last_step to 0 (NOT NULL sentinel); verify+teardown in one transaction (16-02)
- [Phase 16]: 16-03: 2FA card is a dedicated settings tab; on-state reads api.user.twoFa (userPayload now discloses it); 503/unknown errors render generic err.* only; recovery codes live in transient S.ui.recoveryCodes, cleared on modal dismiss
- [Phase 17]: Login 2FA: challenge cookie gr8r_tfa_challenge + dedicated POST /api/auth/tfa/login; one invalidTfaCode error shape; budget carries password→code steps; D-13 generic 429 copy
- [Phase 17]: Client pending 2FA state lives only in in-memory S.ui; api.login skips applyUser on pending2fa — the challenge is never readable as signed-in (D-70)
- [Phase 17]: Challenge abandon is a real logout (server clears the HttpOnly gr8r_tfa_challenge cookie); the throttle budget is server-owned and survives the abandon (D-61/D-03)
- [Phase 17]: Recovery burn at login is reported post-landing via toast, copy-escalated when it was the last code — no behavior difference (D-73/D-74/D-75)

## Verification commands used

```sh
npm test                          # real-server node:test suites (incl. migration)
npm run build && npm run e2e      # Chromium UAT against a throwaway server
npm run lint && npm run format:check && npm run build   # includes i18n-scan gate
node server.js                    # with DATA_DIR pointing at a copy of a real database
```

## Accumulated Context

### Open tech-debt items (tracked in PROJECT.md Active — not v1.3 scope)

- Membership-surface hardening (`sameOrigin` on invite accept, guest spoof, link-only admin
  invites, `firstWorkspace()` fallback).
- Router: browser URL write-only, no `popstate`; orphaned client exports.
- Substring-based recent-search leak; per-user settings isolation beyond auth fields
  (`notifPrefs`, `invoices` remain shared).

### Backlog notes

- The v1.2-backlog phases 999.1–999.3 (sessions button, password change, fake QR) are **absorbed
  by v1.3 Phases 13–17** — they were deferred UAT symptoms of the same stub-auth root cause.

## Session

**Last session:** 2026-10-27T17:48:35.144Z
**Stopped at:** Phase 18 context gathered
**Resume file:** .planning/phases/18-closing-verification-i18n-migration-proof-real-device-uat/18-CONTEXT.md

**Decisions (15-02):** toast.passwordUpdatedAll as its own key (D-37, no client-side composition); unknown error codes fall through to call()'s generic tErr under the current field; pw-conf intentionally clears on wrongCurrentPassword re-render — D-39 protects the surviving new-password value.

## Operator Next Steps

- Review `.planning/ROADMAP.md`; on approval run `/gsd-discuss-phase 13` (or straight to
  `/gsd-plan-phase 13`).

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| — | | | |
| Phase 13 P01 | 5min | 3 tasks | 1 files |
| Phase 13 P02 | 6min | 3 tasks | 2 files |
| Phase 14 P01 | 5min | 3 tasks | 3 files |
| Phase 14 P02 | 3min | 2 tasks | 6 files |
| Phase 14 P03 | 4min | 3 tasks | 2 files |
| Phase 14 P03 | 4min | 3 tasks | 2 files |
| Phase 14 P04 | 13min | 2 tasks | 7 files |
| Phase 14 P05 | ~13 min | 3 tasks | 9 files |
| Phase 16 P01 | 6m | 3 tasks | 7 files |
| Phase 16 P02 | 45min | 3 tasks | 6 files |
| Phase 16 P03 | ~50 min | 3 tasks | 12 files |
| Phase 17 P01 | 115min | 3 tasks | 9 files |
| Phase 17 P02 | 50m | 2 tasks | 13 files |
