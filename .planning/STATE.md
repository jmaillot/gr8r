---
gsd_state_version: "1.0"
milestone: v2.1
milestone_name: Member & Project Experience
current_phase: 53
status: completed
stopped_at: Phase 53 complete — all phases complete
last_updated: "2026-11-09T20:30:48.826Z"
last_activity: 2026-11-09
last_activity_desc: Phase 53 complete
state_head: cec43bd4b2760862a2b8ff596cddb4e6ac0cc6b2
progress:
  total_phases: 1
  completed_phases: 1
  total_plans: 5
  completed_plans: 5
---

# STATE.md

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-09)

- **Project:** Projects Studio — self-hosted PM workspace, zero-config default, `{ pg }` only runtime dep

**Core value:** real auth, real multitenancy, real localization, real notifications — no decorative state
**Current focus:** v2.1 complete — no phase in flight; next milestone not yet planned

## Current Position

Phase: 53 (complete — last phase of v2.1)
Plan: 5/5 complete
Status: Phase 53 verified (17/17 must-haves) — milestone ready to close
Last activity: 2026-11-09 — Phase 53 verification refreshed and phase marked complete

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

**Last session:** 2026-11-09T20:30:00Z
**Stopped at:** Phase 53 complete and verified (17/17 must-haves) — v2.1 ready to close
**Resume file:** None

### Last completed

- Phase 53 re-verification: VERIFICATION.md regenerated against HEAD `cec43bd` (17/17,
  1164 unit tests, 20/20 phase e2e, i18n gate 0/0), phase marked complete (11ebcb0)

### Next

- `/gsd-complete-milestone v2.1` — archive v2.1 and prepare the next milestone
  (UI/UX polish batch is already scoped in the backlog)

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 53 P01 | 34 min | 3 tasks | 10 files |
| Phase 53 P02 | 55 min | 3 tasks | 12 files |
| Phase 53 P03 | 110 min | 3 tasks | 9 files |
| Phase 53 P04 | 10 min | 2 tasks | 8 files |
| Phase 53 P05 | 40 min | 3 tasks | 10 files |

## Decisions

- [Phase 53]: Invite scope bug fix: swapped ROLE_MEMBER_UI/ROLE_ADMIN_UI destructure (since 29-04) corrected — invites defaulted to Admin and member invites POSTed scope:null; fixed in 53-02
- [Phase 53]: Create/edit modal split (projectCreate vs projectSettings) removes the last dual-purpose modal; the deleted modals' i18n key families are all reused by the unified modal (i18n:scan 0 dead, no allowlist edits)
- [Phase 53]: Share dedup (53-04): the labeled Share button carries data-a=projectSettings data-tab=access directly in markup; A.share remains only for the context-menu entry; overview members pill made display-only so M-13's "exactly one Share affordance" holds on every tab
- [Phase 53]: Team modal submitTeam now awaits pushNow() before the membership PUTs — the 450ms-debounced doc push raced the team-whitelisted PUT (400 unknownTeam); latent bug fixed in 53-05
- [Phase 53]: The team-page invite button removed (TEAM-03) with its dead act.inviteToWorkspace key; invites only via Workspace > Members; page.team.accessHint carries the owner's verbatim multi-team sentence EN+FR (membersHint deleted)
- [Phase 53]: 11 pre-existing e2e failures (tenancy/locale/flows/french-overflow) bisected to pre-53-05 commit 6e90e59 — logged in deferred-items.md for milestone-verification triage; unit suite 1169/1169 green
- [Phase 53]: Re-verification 2026-11-09 (post-fix digest): 17/17 must-haves verified against HEAD `cec43bd`; PROJ-02 override recorded — owner ruling 5ca7a26 removed the header labeled Share button, leaving the project context-menu as the single Share entry point (REQUIREMENTS.md PROJ-02 / ROADMAP SC5 wording still says "labeled Share button" and should be reconciled at milestone close)
- [Phase 53]: WR-03 (guest invite to `allowInviteGuests=false`) confirmed fixed at 97468bc during re-verification; `53-REVIEW-DISPOSITION.md` row is stale ("open") and can be reconciled on the next review pass
