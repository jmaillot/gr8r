---
gsd_state_version: "1.0"
milestone: v3.1
milestone_name: Workspace Governance
current_phase: 78
current_phase_name: Creation Gate & Instance-Owner Identity
status: executing
stopped_at: Phase 79 context gathered
last_updated: "2026-11-20T05:04:34.720Z"
last_activity: 2026-11-20
last_activity_desc: Milestone v3.1 started
state_head: 37fa20143c29cee129a4c7649f989df51b5fd73c
progress:
  total_phases: 2
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-19)

**Core value:** Self-hosted, zero-dependency, multi-tenant project-management workspace — hardening
before features.
**Current focus:** Between milestones — v3.0 shipped; next milestone not started

## Current Position

Phase: 78 (Creation Gate & Instance-Owner Identity) — COMPLETE
Plan: 2 of 2 (78-01 + 78-02 complete)
Status: Phase done — next: Phase 79 (Governance Surface) at discuss-phase
Last activity: 2026-11-20 — Plan 78-02 executed (client gate-aware surfaces + await page + operator console, 5 commits; resumed after a mid-plan transport failure)

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
| 78 | 2 | - | - |

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
| pre-existing failure | webhook-events.test.mjs "due task with subscribed hook yields exactly ONE due.reminder delivery" fails (0≠1 claim row) — reproduced on the pre-78 tree (5b4aae51 server.js); unrelated to the creation gate | open | 78-01 | v3.1 |

## Session Continuity

Last session: 2026-11-20T05:04:34.677Z
Stopped at: Phase 79 context gathered
Resume file: .planning/phases/79-governance-surface/79-CONTEXT.md
