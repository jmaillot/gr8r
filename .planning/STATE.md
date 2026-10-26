---
gsd_state_version: "1.0"
milestone: v1.3
milestone_name: Auth Hardening
current_phase: 14
current_phase_name: Schema & Session Ground Truth
status: plan_13_02_complete
stopped_at: Phase 14 context gathered
last_updated: "2026-10-26T17:25:36.109Z"
state_head: e27e900253d4f66ab61af5105df8eb01cebfe7ee
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 6
  completed_plans: 2
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

Phase: 14 (Schema & Session Ground Truth) — READY TO EXECUTE
Plans ready: 4 (14-01, 14-02, 14-03, 14-04) — 2 execution waves
Status: Phase 14 planned — awaiting `/gsd-execute-phase 14`
Progress: `[██░░░░░░░░░░░░░░░░░░] ~22%` — 2 of 6 v1.3 phases started; Phase 13 complete (verification gaps 1–2 closed)

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

**Last session:** 2026-10-26T15:00:32.826Z
**Stopped at:** Phase 14 context gathered
**Resume file:** .planning/phases/14-schema-session-ground-truth/14-CONTEXT.md

## Operator Next Steps

- Review `.planning/ROADMAP.md`; on approval run `/gsd-discuss-phase 13` (or straight to
  `/gsd-plan-phase 13`).

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| — | | | |
| Phase 13 P01 | 5min | 3 tasks | 1 files |
| Phase 13 P02 | 6min | 3 tasks | 2 files |
