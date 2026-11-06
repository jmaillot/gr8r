---
gsd_state_version: "1.0"
milestone: v1.9
milestone_name: Digest Context & One-Click Unsubscribe
current_phase: 41
current_phase_name: unsubscribe-tokens-list-unsubscribe-headers
status: executing
stopped_at: Phase 41 context gathered
last_updated: "2026-11-06T07:18:27.851Z"
last_activity: 2026-11-05
last_activity_desc: Phase 40 complete, transitioned to Phase 41
state_head: aea0cb63eae0ab2db531e2eabc98f02d928db05b
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 4
  completed_plans: 2
---

# STATE.md

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-05)

- **Project:** Projects Studio — self-hosted PM workspace, zero runtime dependencies

**Core value:** real auth, real multitenancy, real localization, real notifications — no decorative state
**Current focus:** Phase 41 — Unsubscribe Tokens & List-Unsubscribe Headers

## Current Position

Phase: 41 (unsubscribe-tokens-list-unsubscribe-headers) — READY TO EXECUTE
Plan: Not started
Status: Ready to execute
Last activity: 2026-11-06 - Completed quick task 261106-b46: Move the daily digest and due-date reminder scheduler window from 09:00 to 08:00

## v1.9 Phase Order (roadmap created 2026-11-05)

1. Phase 40 — Digest Subject & Task Lines (SUBJ-01..03; independent, mailer-only;
   byte-identical claim key; hardened RFC 2047 subject builder with hostile-name tests;
   project names through `memberCanReadProject`)
2. Phase 41 — Unsubscribe Tokens & List-Unsubscribe Headers (UNSUB-01, UNSUB-03;
   domain-separated HMAC token format frozen by tests BEFORE the route exists; headers
   omitted when MASTER_KEY absent; DEPLOY.md DKIM caveat)
3. Phase 42 — One-Click Unsubscribe Endpoint (UNSUB-02; first anonymous mutating route —
   security contract first (token model, method allow-list, replay posture, response
   matrix), then route; convergent/replay-safe, no existence oracle, GET no-op)

Milestone-wide invariants (pinned per phase): Phase 38 suppression invariant + second-boot/
no-duplicate digest tests pass unmodified; EN+FR i18n gate (server keys included); zero
runtime dependencies, zero migrations, full suite green.

## Recent Decisions

- [v1.9 roadmap] Phase numbering continues from v1.8 (Phase 39) — v1.9 is Phases 40-42, no reset
- [v1.9 roadmap] Research's 3-phase build order adopted: SUBJ → UNSUB token+headers →
  UNSUB route. 1:1 clustering kept rather than folding to 2 phases so the
  security-contract-first ordering for the anonymous POST route survives as its own phase
- [v1.9 roadmap] Backlog Phase 999.1 (Phase 37 deferred UAT Test 2) is consumed by
  SUBJ-01/02 → Phase 40; Backlog section cleared
- [v1.9 roadmap] UNSUB-03 (footer link stays + Settings re-subscribe path) mapped to
  Phase 41 — it is a message-level guarantee; Phase 42 verifies re-subscribe end-to-end
- [Phase 39]: 39-01: audit recommendations ship as `proposed` pending owner validation —
  only the RFC 8058 digest decision graduated into v1.9 (owner-validated)
- [Phase 38]: 38-02: suppression gate reads STORED email_digest via getStoredNotifPrefs (D-08) —
  Phase 42's unsubscribe upsert must write stored rows, not merged views

## Milestone History

- ✅ v1.1 Multitenant — shipped, archived
- ✅ v1.2 Localization — shipped 2026-10-25, archived
- ✅ v1.3 Auth Hardening — shipped 2026-10-28, archived
- ✅ v1.4 Auth Completion — shipped 2026-10-30, archived (audit passed)
- ✅ v1.5 Reliability & Rotation — shipped 2026-11-01, archived (audit tech_debt; 16/16 REQs)
- ✅ v1.6 Team Access & Federation — shipped 2026-11-02 (4 phases, 17 plans, 24/24 REQs,
  803 tests, security audit 17/17 threats closed)
- ✅ v1.7 Team Visibility & Hardening — shipped 2026-11-04 (4 phases, 12 plans, archived)
- ✅ v1.8 Notification Sanity — shipped 2026-11-05 (4 phases, 12 plans, 13/13 REQs,
  archived; audit passed — 1 newly acknowledged + 9 carried-forward deferred items)
- 🚧 v1.9 Digest Context & One-Click Unsubscribe — roadmap created 2026-11-05

## Accumulated Context

### Decisions

- Zero-dependency scheduling: in-process `setInterval` pass + boot catch-up, no cron/redis
- Keyring format frozen: `v2:<key-id>:<iv>:<tag>:<ct>` — unsubscribe HMAC derives
  domain-separated from MASTER_KEY, never the raw AES key (v1.9 Phase 41)
- [Phase 38]: digest window is hour >= 9; claim key `${ws.id}:${user_id}:digest:${localDate}`
  is the no-double-send guarantee — v1.9 must keep it byte-identical
- [Phase 34]: notif prefs are sparse SQLite rows keyed (workspace_id, user_id); consumers
  read STORED values via getStoredNotifPrefs — the unsubscribe upsert creates missing rows
- [v1.6 Phase 30]: the SSO routes are the no-oracle/404 template; the unsubscribe route is
  the first anonymous MUTATING route — invite-accept family minus sameOrigin is the shape
- [Phase 40]: 40-01: RFC 2047 folding adopted for encodeWord (Pitfall 1/2 fired — 1879 octets single-line); folded at 900 octets/line
- [Phase 40]: 40-01: encodeWord + truncate exported as named exports for tests (A2); send API unchanged
- [Phase 40]: 40-02: SC-5 digest fallback tested via poisoned catalogue on exported buildDigestMessage (Plan 01 A2 precedent); FR digest subjects use NBSP before ':' (pre-existing typography breach fixed)

### Pending Todos

None yet.

### Blockers/Concerns

- [v1.9] Phase 42: first anonymous mutating route — run discuss-phase to pin the security
  contract (token model, method allow-list, replay posture, response matrix) before
  plan-phase, per research flag
- [v1.9] Phase 41: confirm the owner accepts the documented DEPLOY.md DKIM caveat
  (research recommendation: ship-with-caveat, no env-gating of `List-Unsubscribe-Post`)

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 261106-b46 | Move the daily digest and due-date reminder scheduler window from 09:00 to 08:00 local workspace time (both scheduler predicates hour >= 9 -> hour >= 8, update D-27-1 comments, re-pin T09 test fixtures) | 2026-11-06 | aea0cb6 | Verified | [261106-b46-move-the-daily-digest-and-due-date-remin](./quick/261106-b46-move-the-daily-digest-and-due-date-remin/) |
- [v1.9] MASTER_KEY rotation invalidates previously emailed unsubscribe links — document
  in DEPLOY.md; no other consumer depends on old links
- [carried] v1.5 deferred items (2 unknown debug sessions, phase 26 WR-01/WR-02) — see
  Deferred Items
- [carried] `DatabaseSync` deprecation alias (DEP0210) noted as deferred, not a v1.9 concern

### Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| debug_sessions | admin-revoke-only-own-session | unknown | 2026-11-01 | v1.5 |
| debug_sessions | login-broken-after-rotation | unknown | 2026-11-01 | v1.5 |
| uat_gaps | 26/26-UAT.md | diagnosed (0 pending scenarios) | 2026-11-01 | v1.5 |
| deferred_items | 28-02 TEAM-05 pin born green | acknowledged (intentional no-RED per TDD rules) | 2026-11-02 | v1.6 |
| deferred_items | DatabaseSync DEP0210 alias | noted (not a v1.7 concern) | 2026-11-02 | — |
| deferred_items | 34/deferred-items.md: D-12 COPY-pin allowlist resolved | acknowledged | 2026-11-05 | v1.8 |

## Session Continuity

Last session: 2026-11-05T14:30:45.702Z
Stopped at: Phase 41 context gathered
Resume file: .planning/phases/41-unsubscribe-tokens-list-unsubscribe-headers/41-CONTEXT.md

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| *(v1.9 — no plans executed yet)* | | | |
| Phase 40 P01 | 14m | 3 tasks | 2 files |
| Phase 40 P02 | 35m | 3 tasks | 6 files |

*(v1.8 metrics archived with the milestone record.)*

## Operator Next Steps

- Approve the v1.9 roadmap, then `/gsd-plan-phase 40`
