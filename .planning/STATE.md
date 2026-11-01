---
gsd_state_version: "1.0"
milestone: v1.6
milestone_name: Team Access & Federation
current_phase: 28
current_phase_name: Multi-Team Membership
status: executing
stopped_at: Phase 28 context gathered
last_updated: "2026-11-01T18:50:00.399Z"
last_activity: 2026-11-01
last_activity_desc: Phase 28 execution started
state_head: 56d401fc9265191c4dc54eacdace10616ccdc83f
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 4
  completed_plans: 4
  percent: 100
---

# STATE.md

## Project Reference

- **Project:** Projects Studio — self-hosted PM workspace, zero runtime dependencies
- **Core Value:** real auth, real multitenancy, real localization, real notifications — no decorative state
- **Current focus:** v1.6 Team Access & Federation — Phase 28 ready to plan

## Current Position

Phase: 28 (Multi-Team Membership) — EXECUTING
Plan: 4 of 4
Status: Executing Phase 28
Last activity: 2026-11-01 — Completed 28-04-PLAN.md (TEAM-04 picker filter gap closure)

Progress: [██████████] 100% of phase plans (4/4)

## Recent Decisions
- 28-04: picker predicate `assignableInProject` — empty teams[] = unscoped project (all members assignable); current assignee always offered; bulk-assignee popover intentionally unfiltered (cross-project)

## v1.6 Phase Order (research-validated build order)

1. Phase 28 — multi-team membership (foundation; sets migration pattern; **also settles the
   OIDC identity-column schema decision during planning** — columns land in Phase 30)
2. Phase 29 — team/project-scoped permissions (consumes the team set; route-sweep heavy;
   use discuss-phase or --research-phase — open question: scoping depth for workspace-level
   surfaces)
3. Phase 30 — Entra SSO (raw OIDC; needs live-tenant spike at phase time; flag: Entra claim
   behavior varies by tenant)
4. Phase 31 — second TOTP factor (rides the v1.5 keyring verbatim; safest closer)

Milestone-wide invariants: EN+FR catalogue at write time, additive-only byte-identical-boot
migrations, full suite green, zero new runtime dependencies.

## Milestone History

- ✅ v1.1 Multitenant — shipped, archived
- ✅ v1.2 Localization — shipped 2026-10-25, archived
- ✅ v1.3 Auth Hardening — shipped 2026-10-28, archived
- ✅ v1.4 Auth Completion — shipped 2026-10-30, archived (audit passed; integration 12 seams wired, 0 orphaned)
- ✅ v1.5 Reliability & Rotation — shipped 2026-11-01, archived (audit tech_debt, no blockers; 16/16 REQs)

## Accumulated Context

### Decisions

- Zero-dependency scheduling: in-process `setInterval` pass + boot catch-up, no cron/redis
- Dedup keys persist in SQLite (never in memory), written transactionally BEFORE the notification
- Version-aware boot migration filter must land before any `v2:` envelope exists
- Keyring format frozen: `v2:<key-id>:<iv>:<tag>:<ct>` (key id = first 8 hex of sha256(key material)) — Phase 31 reuses verbatim
- [v1.6 roadmap]: Team membership lives ONLY in authority rows (`teams` + `team_members`); doc `teams[].members` is a rebuilt display projection — never client-mergeable
- [v1.6 roadmap]: Scope restricts, role governs; no per-team roles inside the role ladder (explicit out-of-scope)
- [v1.6 roadmap]: SSO links on verified email only, keyed by (issuer, subject); JIT provisioning shaped as invited members
- [v1.6 roadmap]: Second TOTP factor = rows in `totp_factors` mirroring the primary factor into `users.two_fa_secret` so existing call sites survive unmodified; recovery codes untouched (account-level break-glass)

### Pending Todos

None yet.

### Blockers/Concerns

- v1.5 deferred items carry forward (2 unknown debug sessions, phase 26 WR-01/WR-02) — see Deferred Items.
- Phase 28 planning MUST settle the OIDC identity-column schema (cross-phase decision; columns land in Phase 30).
- Phase 29 needs discuss-phase or --research-phase: scoping depth for workspace-level surfaces (inbox/activity) is an open product question; invite-time vs post-acceptance scoping also open.
- Phase 30 needs a live-tenant spike before the linking policy is finalized.

### Deferred Items

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| debug_sessions | admin-revoke-only-own-session | unknown | 2026-11-01 | v1.5 |
| debug_sessions | login-broken-after-rotation | unknown | 2026-11-01 | v1.5 |
| uat_gaps | 26/26-UAT.md | diagnosed (0 pending scenarios) | 2026-11-01 | v1.5 |

## Session Continuity

Last session: 2026-11-01T17:36:30.844Z
Stopped at: Phase 28 context gathered
Resume file: .planning/phases/28-multi-team-membership/28-CONTEXT.md

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| *(v1.6 — no plans executed yet)* | | | |

## Operator Next Steps

- Plan Phase 28 with /gsd-plan-phase 28 (settles the OIDC identity schema decision)
