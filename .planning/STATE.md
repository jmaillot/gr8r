---
gsd_state_version: "1.0"
milestone: none
milestone_name: "(next milestone not started — run /gsd-new-milestone)"
current_phase: none
current_phase_name: none
status: milestone_archived
stopped_at: v3.0 archived + tagged — ready for /gsd-new-milestone
last_updated: "2026-11-19T21:45:00.000Z"
last_activity: 2026-11-19
last_activity_desc: v3.0 milestone archived (3 phases, 7 plans, 10/10 requirements) and tagged
state_head: 9833cac36a6274f3ea8fa69d04a9ac721f59554d
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-19)

**Core value:** Self-hosted, zero-dependency, multi-tenant project-management workspace — hardening
before features.
**Current focus:** Between milestones — v3.0 shipped; next milestone not started

## Current Position

Phase: none (v3.0 archived 2026-11-19)
Plan: none
Status: Between milestones — run /gsd-new-milestone to start the next cycle
Last activity: 2026-11-19 — v3.0 archived (3 phases, 7 plans, 10/10 requirements) and tagged

Progress: [░░░░░░░░░░] 0% (new milestone not started)

## Performance Metrics

**Velocity:**
- Total plans completed (v3.0): 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 75 | 2 | - | - |
| 76 | 2 | - | - |
| 77 | 2 | - | - |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Seed SEED-261119-f3w owner-validated — door-matrix design not re-litigated; zero new dependencies
- Exact-domain Set matching (never `endsWith` — verified bypass vector); exact `split('@')` single funnel
- Tri-state env parse: null = unset/inherit-or-off vs empty Set = deny-all (set-but-empty semantics
  ratified at Phase 75 planning)
- Fail-closed accept-time re-validation (live list, never a stored snapshot); existing-account immunity
- All refusal keys land in all 5 locale catalogues (en/fr/nl/de/es) in the same commit as the first
  emitting gate
- NO invite-edit route exists — seed "invite edit" maps to create-route replace-a-live-link semantics
  (re-minting covered by DP-2); no route invented
- Continuous phase numbering: v3.0 starts at Phase 75 (v2.7 ended at 74)
- 76-01: logInfo is single-argument — the DP-4 refusal log interpolates the domain into the
  message string (`sso signup domain refused — domain: X`) instead of a structured payload
- 76-01: DP-5's literal partial-filter row is unobservable (pendingInvites keyed by row email
  ⇒ one verdict per email); suite pins two-in-list-invites '/#invitations' branching instead
- 76-01: Open Q1/Q2/Q3 resolved — no DP-2 change; fake IdP extracted to test/helpers/oidc-idp.mjs;
  invites listing API confirmed un-gated
- 76-02: TRUTH AMENDED (Option B, owner-approved) — accept-time re-validation applies to ALL admits,
  including existing accounts; existing-account immunity covers authentication/logins only (SC2),
  never invite acceptance. Existing out-of-list member re-invited under a tightened list gets
  403 inviteDomainNoLonger, invite not consumed, loosening revives it
- 76-02: immunity is test-only proof (zero production diffs in plan 02) — prohibition enforced

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 75 planning: confirm whether mcp.js can mint invites (research unconfirmed) — if yes it is a
  sixth door-matrix cell on the shared validator
- Phase 75 planning: ratify set-but-empty = deny-all semantics with the owner
- Phase 76 planning: redirect-surface refusal UX + DP-5 invite-filtering e2e design; verify MCP invite
  surface
- Phase 77 planning: WR-01/WR-02/IN-01..05 advisory scope was not re-researched this cycle — scope at
  discuss-phase

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-11-19T18:10:42.363Z
Stopped at: Phase 77 context gathered
Resume file: .planning/phases/77-maintenance-debt/77-CONTEXT.md
