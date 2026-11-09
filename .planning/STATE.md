---
gsd_state_version: "1.0"
milestone: v2.1
milestone_name: Member & Project Experience
current_phase: 53
status: roadmap_created
stopped_at: Phase 53 context gathered
last_updated: "2026-11-09T10:09:58.845Z"
last_activity: 2026-11-09
last_activity_desc: v2.1 roadmap approved (single phase, 5 ordered plans)
state_head: 369aa74d00226b3927a622c9b1ad6aa0dcf83022
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# STATE.md

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-09)

- **Project:** Projects Studio — self-hosted PM workspace, zero-config default, `{ pg }` only runtime dep

**Core value:** real auth, real multitenancy, real localization, real notifications — no decorative state
**Current focus:** Milestone v2.1 roadmap created — next: `/gsd-plan-phase 53`

## Current Position

Phase: 53 (not started)
Plan: —
Status: Roadmap created, approved by owner
Last activity: 2026-11-09 — v2.1 roadmap approved (single phase, 5 ordered plans)

## v2.1 Plan Order (approved 2026-11-09 — single Phase 53, executed plan-by-plan)

1. Plan 53-01 — Per-team perms, server model (PSET-02/03): team keys inside `p.perms`
   ('team:'+id), `projectPermFor` helper on write routes, ONE lockstep commit across
   server funnel + projectAccessReason + mcp.js mirror + client canSee, VISIBILITY_MODEL
   oracle extension, mergeClientDoc pin + normalize coverage. HARD PREREQUISITE for 53-03.
2. Plan 53-02 — Invite Modal: draft persistence, Projects chips, guest clamp
   (INVT-01..03; `data-in="inviteDraft"`, chip multi-select on S.ui.inviteScope,
   server-side guest-one-project validator across create/edit/accept + MCP).
   Independent — early quick value.
3. Plan 53-03 — Unified Project Settings Modal, General + Access (PSET-01/04;
   replaces projectModal + shareModal; per-team perm dropdowns need 53-01).
4. Plan 53-04 — Projects Table Columns & Share Button Dedup (PROJ-01/02; Lead /
   Teams / Members count / Status pill+progressOf / Target date; one Share button
   opening the modal's Access section). Needs 53-03.
5. Plan 53-05 — Teams Polish & Milestone i18n Close-out (TEAM-01..03 + UX-01 final
   sweep; foldForSearch members box, multi-team wording, invite-button removal,
   i18n gate clean). Carries the milestone-wide UX-01 close-out.

Milestone-wide invariants (pinned per plan): UX-01 i18n invariants (dead keys deleted
in the plan that removes the UI; pins bumped in the same commit); funnel lockstep +
client-mirror parity fixture for any plan touching access (53-01, 53-03 — bug class
empirically validated by commit 09a9c41); zero new runtime dependencies; zero
migrations; full suite green; EN+FR i18n gate (server keys included).

## Recent Decisions

- [v2.1 planning] Phase numbering continues from v2.0 (ends Phase 52) — v2.1 phases are 53-57, 5 phases per research SUMMARY.md suggested structure
- [v2.1 planning] Per-team perms live as namespaced keys inside `p.perms` (`p.perms['team:'+teamId]`), NOT a new top-level field — zero changes to mergeClientDoc/normalize/removal sweep sinks
- [v2.1 planning] `canSeeProject` stays boolean — per-team perms gate write actions only (M-09; owner-validated)
- [v2.1 planning] UX-01 mapped to Phase 57 (final gate sweep) but enforced in every phase's commits

## Accumulated Context

### Carry-over from v2.0 close (2026-11-09)

- v2.0 shipped: 4 phases (49-52), 17 plans, 15/15 requirements, 1141-test suite green,
  milestone audit passed. Client canSee funnel divergence fixed same day (commit 09a9c41).
- Deferred: TRN-02 (member self-view, v3 candidate), NOTIF-TRIM (owner rulings),
  per-person perms editing during invite (deferred to v2.x).
- Standing constraints: zero runtime deps; zero migrations; full suite green; EN+FR
  i18n gate (server keys included); byte-identical 404s (no existence oracle);
  SQLite+pg dual backend for migration tests.

### Known pitfalls for this milestone (from research)

1. Funnel/mirror divergence — empirically validated (09a9c41); client `canSee` is a
   real funnel consumer; parity must be a tested fixture cell, not an assumption.
2. Pin-block omission silently mass-revokes — living inside `p.perms` avoids this.
3. Unified modal stale-doc writes — mutate live store state, adopt revisions, gate
   Access with shared `canManageProject`.
4. Full re-render wiping input — every keystroke-able field needs a `data-in` binding
   (plan-level checklist in Phases 54/55).
5. Guest invariant is behavior-only (D-50-11) — every new write path re-derives it
   server-side.

## Session Continuity

**Last session:** 2026-11-09T10:09:58.822Z
**Stopped at:** Phase 53 context gathered
**Resume file:** .planning/phases/53-member-project-experience/53-CONTEXT.md

### Last completed

- v2.1 roadmap creation (this session): ROADMAP.md, STATE.md, REQUIREMENTS.md traceability

### Next

- Owner approves roadmap → `/gsd-plan-phase 53` (research flags: read/write semantics
  for team "Full access" is an explicit owner ruling; confirm MCP invite tool ceiling
  in Phase 54 planning)
