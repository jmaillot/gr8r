---
gsd_state_version: "1.0"
milestone: v3.2
milestone_name: Entra Group Mapping & Governance Backlog
current_phase: 84
current_phase_name: Backlog Polish & Ship
current_plan: 4
status: executing
stopped_at: Completed 84-02-PLAN.md
last_updated: "2026-11-20T18:19:34.243Z"
last_activity: 2026-11-20
last_activity_desc: Phase 83 complete, transitioned to Phase 84
state_head: 0102028476d172b861e65469d35eca8f02b6a54a
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 12
  completed_plans: 10
  percent: 60
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-20)

**Core value:** Self-hosted, zero-dependency, multi-tenant project-management workspace — hardening
before features.
**Current focus:** Phase 83 — Governance — Workspace Rename & Slug Edit

## Current Position

Phase: 84 — Backlog Polish & Ship
Current Plan: 4
Total Plans in Phase: 4
Status: Ready to execute
Last activity: 2026-11-20 — 84-02 complete (team pickers + IN-02 derived i18n check)

Progress: [██████░░░░] 60%

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
| 80 | 2 | - | - |
| 81 | 0 | - | - |
| 82 | 2 | - | - |
| 83 | 2 | - | - |
| 84 | 0 | - | - |

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 80 P01 | 8 min | 3 tasks | 5 files |
| Phase 80 P02 | 6 min | 3 tasks | 10 files |
| Phase 82 P01 | ~35 min | 3 tasks | 2 files |
| Phase 82 P02 | ~40 min | 3 tasks | 2 files |
| Phase 83 P01 | ~35 min | 3 tasks | 4 files |
| Phase 83 P02 | ~55 min | 2 tasks | 11 files |
| Phase 84 P02 | 22 min | 4 tasks | 13 files |

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
- [Phase 82, 82-01]: GS-02 sole-owner e2e uses groups: [] (genuinely-empty = reconcile-bearing shape) — a missing groups key skips the whole else-branch and never reaches the guard
- [Phase 82, 82-01]: guardRefuse(wsId, guid, delta) is the shared owner-guard funnel — Plan 02's owner-downgrade arm must route through it, not fork a second guard
- [Phase 82, 82-02]: downgrade writes go through addMembership so the D-82-7 conditional clause re-stamps the DRIVING group's provenance (role-source semantics)
- [Phase 82, 82-02]: delta audit rows use their OWN db.tx — addMembership owns an internal tx and db.tx does not nest (no savepoints)
- [Phase 82, 82-02]: D-82-11 uniform trail live — zero sso_group% security verbs remain; grant-side skips carry dead-workspace/archived-workspace reasons, removal-side dead-workspace stays vocabulary-only (FK cascade)
- [Phase 83, 83-02]: dead-mappings payload rides refreshGovernanceWorkspaces (seq-guarded, refusal hides card only); staged edit state carries origSlug so the D-03 fork compares against ground truth; rename refusals surface via tErr over existing err.* keys (zero new vocabulary)
- [Phase 83, 83-02]: the data-a/data-r/data-v machine-identifier pins exist in TWO suites (i18n-toast + i18n-shell) and the en catalogue size is pinned in i18n-core-features — all three bump together under D-12
- [Phase 84]: 84-02: locale keys land in the same commit as emitting markup (Tasks 2+3 merged); keyboard hook = input-scoped keyboard.js branch cloning the tz branch; tree-wide data-a/data-v count pins bumped as D-12 same-commit pins

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

Last session: 2026-11-20T18:19:17.090Z
Stopped at: Completed 84-02-PLAN.md
Resume file: None

## Operator Next Steps

- Review .planning/ROADMAP.md, then start Phase 80 with /gsd-plan-phase 80
