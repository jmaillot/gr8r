---
gsd_state_version: "1.0"
milestone: v1.5
milestone_name: Reliability & Rotation
current_phase: 26
current_phase_name: Re-Wrap Rotation & Key-Custody Runbook
status: verifying
stopped_at: Completed 26-02-PLAN.md
last_updated: "2026-11-01T08:59:11.415Z"
last_activity: 2026-11-01
last_activity_desc: Phase 26 execution started
state_head: 15bf26ad4018d7c5bc01787ca8399c5a732bfcda
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 13
  completed_plans: 13
  percent: 20
---

# STATE.md

## Project Reference

- **Project:** Projects Studio — self-hosted PM workspace, zero runtime dependencies
- **Core Value:** real auth, real multitenancy, real localization, real notifications — no decorative state
- **Current focus:** Phase 24 — Operator Audit & Workspace-Admin Tier

## Current Position

Phase: 26 (Re-Wrap Rotation & Key-Custody Runbook) — EXECUTING
Plan: 2 of 2
Status: Phase complete — ready for verification
Last activity: 2026-11-01 — Phase 26 execution started

Progress: [██░░░░░░░░] 20%

## Milestone History

- ✅ v1.1 Multitenant — shipped, archived
- ✅ v1.2 Localization — shipped 2026-10-25, archived
- ✅ v1.3 Auth Hardening — shipped 2026-10-28, archived
- ✅ v1.4 Auth Completion — shipped 2026-10-30, archived (audit passed; integration 12 seams wired, 0 orphaned)

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

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 27 planning must resolve the revision-bump policy (accept bump vs side-table) and
  verify due-date storage format in seed.js/docs — flagged for `--research-phase`
- Phase 23 discuss-phase must decide the `?next` post-login redirect scope and the popstate
  scope (v1.1 Active debt)
- Phase 25 plan-time check: confirm `users.two_fa_secret` is the only envelope column
- Membership-surface hardening items (v1.1 Active) remain parked in PROJECT.md — not in v1.5 scope

## Session Continuity

Last session: 2026-11-01T08:59:11.366Z
Stopped at: Completed 26-02-PLAN.md
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
