---
gsd_state_version: "1.0"
milestone: v3.0
milestone_name: Access Control & Hardening
current_phase: 76
current_phase_name: OIDC/SSO Doors & Immunity Hardening
status: executing
stopped_at: Completed 76-01-PLAN.md
last_updated: "2026-11-19T17:26:39Z"
last_activity: 2026-11-19
last_activity_desc: 76-01 complete — DP-4/DP-5 doors + D-11 matrix log + D-12 suite (15 rows)
state_head: ac1f26bdf476da61ac51fc2b4394a830f121f521
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 4
  completed_plans: 3
  percent: 75
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-19)

**Core value:** Self-hosted, zero-dependency, multi-tenant project-management workspace — hardening
before features.
**Current focus:** Phase 76 — OIDC/SSO Doors & Immunity Hardening

## Current Position

Phase: 76 (OIDC/SSO Doors & Immunity Hardening) — EXECUTING
Plan: 2 of 2
Status: Executing Phase 76 (76-01 complete)
Last activity: 2026-11-19 — Completed 76-01-PLAN.md (DP-4, DP-5, D-11 + D-12 suite)

Progress: [███████░░░] 75%

## Performance Metrics

**Velocity:**
- Total plans completed (v3.0): 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 75 | 2 | - | - |
| 76 | 1 | 12 min | 12 min |
| 77 | 0 | - | - |

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

Last session: 2026-11-19T17:26:39Z
Stopped at: Completed 76-01-PLAN.md
Resume file: None — ready for 76-02-PLAN.md
