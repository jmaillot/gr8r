---
gsd_state_version: "1.0"
milestone: v3.1
milestone_name: Workspace Governance
current_phase: 79
current_phase_name: Governance Surface
status: executing
stopped_at: Completed 79-02-PLAN.md
last_updated: "2026-11-20T07:11:52.407Z"
last_activity: 2026-11-20
last_activity_desc: Phase 79 execution started
state_head: 52e20f853f50e2225c307c8c71e95c637109293b
progress:
  total_phases: 2
  completed_phases: 1
  total_plans: 5
  completed_plans: 4
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-19)

**Core value:** Self-hosted, zero-dependency, multi-tenant project-management workspace — hardening
before features.
**Current focus:** Phase 79 — Governance Surface

## Current Position

Phase: 79 (Governance Surface) — EXECUTING
Plan: 3 of 3
Status: Ready to execute
Last activity: 2026-11-20 — Phase 79 execution started

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
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 79 P01 | 31 min | 3 tasks | 10 files |
| Phase 79 P79-02 | 13m | 3 tasks | 13 files |

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
- [Phase 79]: 79-01: governance routes fetch workspace rows by id via db.get — never requireWorkspace (unarchive stays possible); creator derived from the owner-membership LEFT JOIN, no created_by column
- [Phase 79]: 79-01: memberAlreadyMember is a keyed 409 refusal (not silent upsert); delete content check reads the RAW doc; audit verbs workspace_archived/unarchived/deleted, member_reassigned/released — all inside the mutation db.tx
- [Phase 79]: Orphan modal rides an additive generic 'custom' modal host (chunk-backed, assignee-picker precedent) — no governance branch in the modal switch
- [Phase 79]: Governance Delete renders on every row — the server is the authority; unarchive skips type-to-confirm (reversible), archive/delete confirm by slug, release by member email (D-04)

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

Last session: 2026-11-20T07:11:52.364Z
Stopped at: Completed 79-02-PLAN.md
Resume file: None
