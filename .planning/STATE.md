---
gsd_state_version: "1.0"
milestone: v1.5
milestone_name: Reliability & Rotation
status: planning
last_updated: "2026-10-30T00:00:00.000Z"
last_activity: 2026-10-30
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# STATE.md

## Project Reference

- **Project:** Projects Studio — self-hosted PM workspace, zero runtime dependencies
- **Core Value:** real auth, real multitenancy, real localization, real notifications — no decorative state
- **Current focus:** Phase 23 — Email Deep Links & Creator Watching

## Current Position

Phase: 23 of 27 (Email Deep Links & Creator Watching) — first of 5 v1.5 phases
Plan: 0 of 0 (not yet planned)
Status: Ready to plan Phase 23
Last activity: 2026-10-30 — v1.5 ROADMAP.md created (Phases 23–27, 16/16 requirements mapped)

Progress: [░░░░░░░░░░] 0%

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

Last session: 2026-10-30
Stopped at: v1.5 roadmap created; awaiting owner approval before `/gsd-plan-phase 23`
Resume file: None
