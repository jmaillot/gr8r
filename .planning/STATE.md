---
gsd_state_version: "1.0"
milestone: v1.6
milestone_name: Team Access & Federation
current_phase: 29
current_phase_name: Team/Project-Scoped Permissions
status: executing
stopped_at: Completed 29-02-PLAN.md
last_updated: "2026-11-02T09:30:00.000Z"
last_activity: 2026-11-02
last_activity_desc: Completed 29-02-PLAN.md
state_head: 0521cea4a3964d1a2a6203763eab22739be00eb1
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 11
  completed_plans: 8
  percent: 25
---

# STATE.md

## Project Reference

- **Project:** Projects Studio — self-hosted PM workspace, zero runtime dependencies
- **Core Value:** real auth, real multitenancy, real localization, real notifications — no decorative state
- **Current focus:** v1.6 Team Access & Federation — Phase 28 ready to plan

## Current Position

Phase: 29 (Team/Project-Scoped Permissions) — EXECUTING
Plan: 3 of 4
Status: Ready to execute
Last activity: 2026-11-02 — Completed 29-02-PLAN.md

Progress: [███░░░░░░░] 25% of phase plans (4/4)

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
- [Phase 31]: 31-01: totp_factors is the single source of truth — boot copy carries the users envelope verbatim (decrypt-free) with last_step continuity; enable inserts the factor row, disable deletes them, rotation re-wrap covers factor rows
- [Phase 31]: 31-01: migrated factor name stores the full locale key settings.tfa.factor.primary, rendered via t(row.name) (D-07 wording discretion)
- [Phase 31]: 31-02: legacy tfa/enable keeps the users.two_fa_last_step baseline for the first-ever enable (the pending secret is unrelated to any enrolled factor's replay state) — Factor-row baselines are per-factor; only additional factors (factors/enable) use a null baseline
- [Phase 31]: 31-02: requirements TOTP2-01/02/03 left unmarked — they span 31-02 (API) and 31-03 (client wiring); shared-ID gate would mark early — requirements.ready-ids would flip them Complete before 31-03 SUMMARY exists
- [Phase 31]: Plan 31-02: last-factor removal verifies the target's own code (exclusion only with >1 factor) or the D-18 disable path would be unreachable; first-ever enable via factors/enable returns rotated recovery codes exactly once.
- [Phase 31]: Client factor lifecycle wired: Add-factor staged wizard + per-factor remove confirm over the Plan 02 routes, EN+FR complete
- [Phase 29]: 29-01: hiddenFor() composes private-hidden ∪ out-of-scope disjunctively — the D-03 scope-opens-private grant (Plan 02) rides the same single funnel
- [Phase 29]: 29-01: empty scope stored as null = workspace-wide (D-01); projectScope() returns null for admin+ regardless of stored JSON; promotion to admin/owner clears scope in-transaction (D-04)
- [Phase 29]: 29-02: D-03 grant inversion — scoped members see everything in scope (scopeGrants() short-circuits the private check); private+out-of-scope stays hidden even on-list; A1 team reach opens private team-linked projects (backstop assumption)
- [Phase 29]: 29-02: project-less file records (workspace-level uploads) stay member-visible — only project-bound records are scope-checked in serveFileBinary; the matrix artifact (MATRIX in test/scope.test.mjs) is the named SCOPE-03 sweep future families must extend

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

Last session: 2026-11-02T09:30:00Z
Stopped at: Completed 29-02-PLAN.md
Resume file: None

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| *(v1.6 — no plans executed yet)* | | | |
| Phase 31 P01 | 23min | 3 tasks | 12 files |
| Phase 31 P02 | 1h 9min | 3 tasks | 4 files |
| Phase 31 P02 | ~50 min | 3 tasks | 10 files |
| Phase 31 P03 | 40 min | 3 tasks | 14 files |
| Phase 29 P01 | 11 min | 3 tasks | 6 files |
| Phase 29 P02 | 27 min | 3 tasks | 2 files |

## Operator Next Steps

- Plan Phase 28 with /gsd-plan-phase 28 (settles the OIDC identity schema decision)
