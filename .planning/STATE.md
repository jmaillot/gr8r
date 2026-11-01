---
gsd_state_version: "1.0"
milestone: v1.6
milestone_name: Team Access & Federation
status: planning
last_updated: "2026-11-01T13:27:13.617Z"
last_activity: 2026-11-01
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# STATE.md

## Project Reference

- **Project:** Projects Studio — self-hosted PM workspace, zero runtime dependencies
- **Core Value:** real auth, real multitenancy, real localization, real notifications — no decorative state
- **Current focus:** Planning next milestone — run `/gsd-new-milestone`

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-11-01 — Milestone v1.6 started

## Milestone History

- ✅ v1.1 Multitenant — shipped, archived
- ✅ v1.2 Localization — shipped 2026-10-25, archived
- ✅ v1.3 Auth Hardening — shipped 2026-10-28, archived
- ✅ v1.4 Auth Completion — shipped 2026-10-30, archived (audit passed; integration 12 seams wired, 0 orphaned)
- ✅ v1.5 Reliability & Rotation — shipped 2026-11-01, archived (audit tech_debt, no blockers; 16/16 REQs)

## Shipped Outside the GSD Cycle (v1.4 window)

- App rebrand `gr8r` → Projects Studio (breaking: sessions/localStorage reset)
- Multi-team projects (`teams[]`, legacy scalar migrated)
- Notification system P4-a…f: backbone, assign, mentions (@member/@team), comments, status
  updates, email delivery — fully verified in real UI (e2e 62/62, npm test 566/566)

## v1.5 Phase Order (research-derived build order)

1. Phase 23 — deep links + APP_URL plumbing (consumed by the scheduler's email fan-out)
2. Phase 24 — audit hardening BEFORE the workspace-admin tier (audited from birth)
3. Phase 25 — version-aware migration filter (hard prerequisite before any `v2:` envelope)
4. Phase 26 — re-wrap rotation + DEPLOY.md runbook (depends on 25)
5. Phase 27 — reminder scheduler LAST (largest surface; 409 storms, transactional dedup,
   boot catch-up are its core risks)

## Accumulated Context

### Decisions

- Zero-dependency scheduling: in-process `setInterval` pass + boot catch-up, no cron/redis
- Dedup keys persist in SQLite (never in memory), written transactionally BEFORE the notification
- Version-aware boot migration filter must land before any `v2:` envelope exists
- Per-user timezone and custom reminder offsets deferred to v1.6/v2 (workspace-shared tz at v1.5)
- [Phase 23]: Creator watching: creator joins the computed watcher set (add-alongside P4-d/e), no backfill for legacy tasks
- [Phase 23]: Logged-out carry builds ?next= from location.pathname only; finishLogin's four-clause path-only validator stays the single source of truth (pinned by test/next-carry.test.mjs)
- [Phase 23]: urlForView maps every navigable view to its own path (plan 23-04): per-view URLs are what make popstate back/forward resolve views; drawer open/close push task/underlying URLs through go()
- [Phase 23]: G-23-1 closed (plan 23-05): queueNotifEmails resolves byline/recipient from memberships⋈users authority rows (workspace-scoped), doc profiles as fallback, 'Un membre' last resort
- [Phase 23]: 23-06: unknown team id falls back to workspace home silently (no oracle, T-23-07); bare /team resolves to the teams list
- [Phase 25]: D-K6 realized as one isEnvelopeVersion predicate (/^v\d+:/) behind a broad `not like 'v_:%'` SQL prefilter — no known-versions list
- [Phase 25]: D-K7 recognition is decryptability-based (decryptTotpSecret === null ⇒ unrecognized) — v2 rows silence themselves when Plan 02's decrypt support lands; D-78c gained a sanctioned third caller (the boot probe)
- [Phase 25]: D-K3/D-K4 format frozen by user checkpoint — key id = first 8 hex chars of sha256(raw key material), envelope = `v2:<key-id>:<iv>:<tag>:<ct>`
- [Phase 25]: encryptTotpSecret gained a version param (default 'v1'); ONLY the enable call site writes v2 — boot migration keeps v1 (Phase 26 re-wrap owns the stock)
- [Phase 26]: Re-wrap rotation (26-01): two env vars + one reboot converges every old envelope to v2:<new-id>; nudge fires iff PREVIOUS resolves nothing (D-K12); undecryptable rows preserved forever, D-74 backup re-mints per rotation boot (bounded by WR-02)
- [Phase 26]: Runbook (26-02): DEPLOY.md §14 covers the full key-custody lifecycle; key-id discovery and the D-K13 query are env-only (never argv), and its commands are pinned by doc-parsing parity tests in test/totp-rewrap.test.mjs
- [Phase 26]: G-26-1 closed (26-03): §14 gates rotation on two preconditions — image currency (grep -c migrateTotpReWrap server.js ≥ 1) and key-id coverage (id(MASTER_KEY_PREVIOUS) vs DB-stamped v2: substr prefixes, env-only) — plus a no-data-loss recovery note for the D-K7-without-re-wrap signature
- [Phase 24]: 24-04: audit-trail client fetch is unconditional — only the server knows the caller's full admin/owner membership set (D-T3), the card self-guards via the null state (D-V1)
- [Phase 27]: Workspace-shared tz = first membership member's profile tz; unknown/empty label falls back to UTC (A1 resolved)
- [Phase 27]: Reminder clock injection via test-only /api/internal/reminder-pass route gated by REMINDER_TEST_TOKEN
- [Phase 27]: Reminder prefs are flat boolean notifPrefs keys; catalogue keys camelCase (notif.dueReminder/pastDue) despite snake_case row types

### Pending Todos

None yet.

### Blockers/Concerns

- Membership-surface hardening items (v1.1 Active) remain parked in PROJECT.md — candidate
  for the next milestone alongside the recent-search leak and per-user settings isolation.
- Deferred at v1.5 close: 2 unknown debug sessions (admin-revoke-only-own-session,
  login-broken-after-rotation) and phase 26 WR-01/WR-02 — see STATE.md Deferred Items.

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| debug_sessions | 23-team-route-404 | resolved (fix shipped in 23-05 / 23-06, verified 2026-10-31) | 2026-11-01 | v1.5 |
| debug_sessions | 23-un-membre-byline | resolved (fix shipped in 23-05 / 23-06, verified 2026-10-31) | 2026-11-01 | v1.5 |
| debug_sessions | admin-revoke-only-own-session | unknown | 2026-11-01 | v1.5 |
| debug_sessions | login-broken-after-rotation | unknown | 2026-11-01 | v1.5 |
| uat_gaps | 26/26-UAT.md | diagnosed (0 pending scenarios) | 2026-11-01 | v1.5 |

## Session Continuity

Last session: 2026-11-01T12:26:33.762Z
Stopped at: Phase 27 complete — all phases complete
Resume file: None

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 23 P01 | 17 min | 3 tasks | 10 files |
| Phase 23 P03 | 2 min | 2 tasks | 2 files |
| Phase 23 P02 | 25 min | 2 tasks | 3 files |
| Phase 23 P04 | 40 min | 2 tasks | 4 files |
| Phase 23 P05 | 15 min | 2 tasks | 2 files |
| Phase 23 P06 | ~50 min | 2 tasks | 3 files |
| Phase 24 P01 | 15 min | 2 tasks | 2 files |
| Phase 24 P02 | 25 min | 3 tasks | 10 files |
| Phase 24 P03 | 35 min | 2 tasks | 10 files |
| Phase 25 P01 | 12 min | 3 tasks | 3 files |
| Phase 25 P02 | ~75 min | 3 tasks | 3 files |
| Phase 26 P01 | 35 min | 3 tasks | 3 files |
| Phase 26 P02 | 14 min | 2 tasks | 2 files |
| Phase 26 P03 | 4 min | 2 tasks | 1 files |
| Phase 24 P04 | 22 min | 2 tasks | 3 files |
| Phase 27 P01 | 35m | 3 tasks | 2 files |
| Phase 27 P02 | 25m | 2 tasks | 7 files |

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
