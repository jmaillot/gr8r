---
gsd_state_version: "1.0"
milestone: v3.2
milestone_name: Entra Group Mapping & Governance Backlog
current_phase: 80
current_phase_name: Group Mapping Core — Parser, Resolver, Overage Detection
status: executing
stopped_at: Completed 80-02-PLAN.md — Phase 80 fully executed, ready for /gsd-verify-work 80
last_updated: "2026-11-20T10:50:00.000Z"
last_activity: 2026-11-20
last_activity_desc: Phase 80 plan 80-02 executed (3 tasks, 3 commits) — phase plans 2/2 complete
state_head: 41de3b30
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
  percent: 20
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-20)

**Core value:** Self-hosted, zero-dependency, multi-tenant project-management workspace — hardening
before features.
**Current focus:** Phase 80 — Group Mapping Core — Parser, Resolver, Overage Detection

## Current Position

Phase: 80 (Group Mapping Core — Parser, Resolver, Overage Detection) — EXECUTING
Plan: 2 of 2 — COMPLETE
Status: Ready for /gsd-verify-work 80
Last activity: 2026-11-20 — 80-02 executed (save route, boot warning, Dockerfile contract)

Progress: [██........] 20%

## Milestone v3.2 Phase Map

| Phase | Name | Requirements | Depends on |
|-------|------|--------------|------------|
| 80 | Group Mapping Core — Parser, Resolver, Overage Detection | GM-01..03 | Nothing |
| 81 | Group Grant Path — Callback Wiring + Provenance | GW-01..04, GO-01..02 | 80 |
| 82 | Removal Sync + Guards + Audit | GS-01..04 | 81 |
| 83 | Governance — Workspace Rename & Slug Edit | GV-01..03 | Nothing (parallel) |
| 84 | Backlog Polish & Ship | BP-01..03 | 80–83 |

Owner-ratified decisions D-82-1..6 live in REQUIREMENTS.md and bind all group-mapping phases.

## Performance Metrics

**Velocity:**
- Total plans completed (v3.2): 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 80 | 2 | 14 min | 7 min |
| 81 | 0 | - | - |
| 82 | 0 | - | - |
| 83 | 0 | - | - |
| 84 | 0 | - | - |

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 80 P01 | 8 min | 3 tasks | 5 files |
| Phase 80 P02 | 6 min | 3 tasks | 10 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Standing constraints for v3.2:

- Zero new dependencies (no Graph SDK — claims-first; `test/dependencies.test.mjs` invariant pins this)
- 5-locale keyed refusals land in the same commit as the first emitting gate (en/fr/nl/de/es)
- Owner-scoped endpoints must not leak existence; destructive actions confirmed + audit-logged
- Boot-frozen env consts with strict-token tri-state parse (unset = off, invalid = boot-refuse)
- Group claims are snapshot-at-login (no periodic reconcile); unmapped users behave byte-identically
- Group match is a parallel admission concept beside the v3.0 domain door matrix (unchanged)
- `_claim_names` overage = UNMAPPED (never an empty list) — co-designed in 80, honored in 82
- Continuous phase numbering: v3.2 starts at Phase 80 (v3.1 ended at 79)
- D-82-1 highest role wins · D-82-2 group re-asserts over manual grants at login · D-82-3 operator
  demotion cleared then re-granted at next login · D-82-4 overage proceeds as unmapped ·
  D-82-5 old slug 404s, no redirect · D-82-6 dead mappings surface in operator console + boot log
- [Phase 80]: group_mappings carries a kind column ('workspace'|'operator') implementing the dedicated operator-mapping row kind now, so Phase 81 passes claims without config migration
- [Phase 80]: Non-array groups claim stays fail-closed (unmapped/shape); operatorFlag is true|null tri-state, never false
- [Phase 80, 80-02]: Refusal-code literals passed EXPLICITLY at the server.js call site (domains.js precedent) — the error-codes reverse-parity test greps server.js source, so default codes inside a module stay invisible to it
- [Phase 80, 80-02]: Boot group-mappings line is D-11 vocabulary (zero rows → exactly one off-line, no dead-mapping query); save route audits via logSecurity('group_mapping_saved') now to avoid the Phase 83 retrofit

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 82 planning: highest combined test surface (guard composition × provenance × overage) —
  plan-phase should be thorough; no external research needed
- Phase 80 planning: if the Graph overage fallback were ever ratified (it is NOT — D-82-4),
  the client-credentials contract would need live-doc verification
- DEPLOY.md must document that group nesting semantics live tenant-side (ApplicationGroup =
  direct-membership-only); no app-side resolution either way

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| pre-existing failure | webhook-events.test.mjs "due task with subscribed hook yields exactly ONE due.reminder delivery" fails (0≠1 claim row) — reproduced on the pre-78 tree (5b4aae51 server.js); unrelated to the creation gate | open | 78-01 | v3.1 |

## Session Continuity

Last session: 2026-11-20T10:50:00.000Z
Stopped at: Completed 80-02-PLAN.md — Phase 80 fully executed
Resume file: None

## Operator Next Steps

- Review .planning/ROADMAP.md, then start Phase 80 with /gsd-plan-phase 80
