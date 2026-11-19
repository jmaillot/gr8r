---
gsd_state_version: "1.0"
milestone: v3.0
milestone_name: Access Control & Hardening
current_phase: 76
current_phase_name: OIDC/SSO Doors & Immunity Hardening
status: executing
stopped_at: Phase 76 context gathered
last_updated: "2026-11-19T17:06:22.944Z"
last_activity: 2026-11-19
last_activity_desc: Phase 75 complete, transitioned to Phase 76
state_head: 71560225f825cef143dfcade7d6c3d897105a29f
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 4
  completed_plans: 2
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-19)

**Core value:** Self-hosted, zero-dependency, multi-tenant project-management workspace — hardening
before features.
**Current focus:** Phase 75 — Domain Admission Core

## Current Position

Phase: 76 (OIDC/SSO Doors & Immunity Hardening) — READY TO EXECUTE
Plan: Not started
Status: Ready to execute
Last activity: 2026-11-19 — Phase 75 complete, transitioned to Phase 76

Progress: [███░░░░░░░] 33%

## Performance Metrics

**Velocity:**
- Total plans completed (v3.0): 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 75 | 2 | - | - |
| 76 | 0 | - | - |
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

Last session: 2026-11-19T16:45:18.255Z
Stopped at: Phase 76 context gathered
Resume file: .planning/phases/76-oidc-sso-doors-immunity-hardening/76-CONTEXT.md
