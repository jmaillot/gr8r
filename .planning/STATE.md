---
gsd_state_version: "1.0"
milestone: v2.1
milestone_name: Member & Project Experience
current_phase: 54
current_phase_name: Project export — Excel report, MSPDI XML and CSV
status: executing
stopped_at: Completed 54-02-PLAN.md
last_updated: "2026-11-10T10:04:33.283Z"
last_activity: 2026-11-10
last_activity_desc: Phase 54 execution started
state_head: c909ca548830fd3a339ec5913d2fdc2ecc392e42
progress:
  total_phases: 2
  completed_phases: 1
  total_plans: 5
  completed_plans: 1
---

# STATE.md

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-09)

- **Project:** Projects Studio — self-hosted PM workspace, zero-config default, `{ pg }` only runtime dep

**Core value:** real auth, real multitenancy, real localization, real notifications — no decorative state
**Current focus:** Phase 54 — Project export — Excel report, MSPDI XML and CSV

## Current Position

Phase: 54 (Project export — Excel report, MSPDI XML and CSV) — EXECUTING
Plan: 3 of 5
Status: Ready to execute
Last activity: 2026-11-10 — Phase 54 execution started

## v2.1 Phase 54 Plan Order (authored 2026-11-09, ported onto main 2026-11-10)

1. Plan 54-01 — CSV end-to-end tracer (model, CSV writer, gated export route, download
   helper, modal, both entry points). Wave 1.
2. Plan 54-02 — Pinned workbook writer behind a legitimacy checkpoint, repository gates,
   unzip/XML helpers, six-sheet shell + Tasks sheet. Wave 2 (blocked on 54-01).
3. Plan 54-03 — Summary meta, KPIs, charts 1-2, Board snapshot, Members + chart 3,
   Milestones sheet. Wave 3 (blocked on 54-02).
4. Plan 54-04 — Adaptive Gantt geometry, Timeline bars, diamonds, dependency connectors,
   Today column, shape cap, responsiveness. Wave 4 (blocked on 54-03).
5. Plan 54-05 — MSPDI serializer, Excel/Project format wiring, EN+FR catalogue, human
   Microsoft Project check. Wave 5 (blocked on 54-04).

**Drift warning**: the phase 54 artifacts were authored against a pre-Phase-53 tree
(`src/pages/project.js:73-80` header still had the avatar stack + labeled Share button).
Phase 53 removed both; the header now has settings + overflow and Share lives in the
context menu. Verify every line ref before executing 54-01.

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

**Last session:** 2026-11-10T10:04:33.233Z
**Stopped at:** Completed 54-02-PLAN.md
**Resume file:** None

### Last completed

- Phase 54 planning port: 11 artifacts (`54-SPEC`, `54-CONTEXT`, `54-DISCUSSION-LOG`,
  `54-PATTERNS`, `54-RESEARCH`, `54-VALIDATION`, `54-01..05-PLAN`) brought from the
  `feat/export` worktree onto `main`; ROADMAP/STATE updated without reverting Phase 53
- Phase 53 re-verification (2026-11-09): VERIFICATION.md regenerated against HEAD `cec43bd`
  (17/17, 1164 unit tests, 20/20 phase e2e, i18n gate 0/0), phase marked complete (11ebcb0)

### Next

- `/gsd-execute-phase 54` — but run a drift check first: the plans reference the
  pre-Phase-53 header (`project.js:73-80`), where the labeled Share button and avatar
  stack no longer exist. Either refresh the plans with `/gsd-plan-phase 54` or amend
  54-01's entry-point task against the current header.

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 53 P01 | 34 min | 3 tasks | 10 files |
| Phase 53 P02 | 55 min | 3 tasks | 12 files |
| Phase 53 P03 | 110 min | 3 tasks | 9 files |
| Phase 53 P04 | 10 min | 2 tasks | 8 files |
| Phase 53 P05 | 40 min | 3 tasks | 10 files |
| Phase 54 P01 | 29 min | 3 tasks | 15 files |
| Phase 54 P02 | 14 min | 3 tasks | 14 files |

## Decisions

- [Phase 53]: Invite scope bug fix: swapped ROLE_MEMBER_UI/ROLE_ADMIN_UI destructure (since 29-04) corrected — invites defaulted to Admin and member invites POSTed scope:null; fixed in 53-02
- [Phase 53]: Create/edit modal split (projectCreate vs projectSettings) removes the last dual-purpose modal; the deleted modals' i18n key families are all reused by the unified modal (i18n:scan 0 dead, no allowlist edits)
- [Phase 53]: Share dedup (53-04): the labeled Share button carries data-a=projectSettings data-tab=access directly in markup; A.share remains only for the context-menu entry; overview members pill made display-only so M-13's "exactly one Share affordance" holds on every tab
- [Phase 53]: Team modal submitTeam now awaits pushNow() before the membership PUTs — the 450ms-debounced doc push raced the team-whitelisted PUT (400 unknownTeam); latent bug fixed in 53-05
- [Phase 53]: The team-page invite button removed (TEAM-03) with its dead act.inviteToWorkspace key; invites only via Workspace > Members; page.team.accessHint carries the owner's verbatim multi-team sentence EN+FR (membersHint deleted)
- [Phase 53]: 11 pre-existing e2e failures (tenancy/locale/flows/french-overflow) bisected to pre-53-05 commit 6e90e59 — logged in deferred-items.md for milestone-verification triage; unit suite 1169/1169 green
- [Phase 53]: Re-verification 2026-11-09 (post-fix digest): 17/17 must-haves verified against HEAD `cec43bd`; PROJ-02 override recorded — owner ruling 5ca7a26 removed the header labeled Share button, leaving the project context-menu as the single Share entry point (REQUIREMENTS.md PROJ-02 / ROADMAP SC5 wording still says "labeled Share button" and should be reconciled at milestone close)
- [Phase 53]: WR-03 (guest invite to `allowInviteGuests=false`) confirmed fixed at 97468bc during re-verification; `53-REVIEW-DISPOSITION.md` row is stale ("open") and can be reconciled on the next review pass
- [Phase 54 port 2026-11-10]: Phase 54 planning recovered from the `feat/export` worktree
  (detached HEAD `776c0a3`, 10 commits, branched 58 commits behind main at `9b3f014`).
  Ported as file copies + ROADMAP/STATE/PROJECT edits, NOT a git merge: the worktree's
  planning docs were pre-53 snapshots and a merge would have reverted Phase 53 completion
  (PROJECT "SHIPPED" text, 13 requirement ticks, traceability table, roadmap phase entry).
  The commits are preserved on branch `phase-54-export`.
- [Phase 54 port 2026-11-10]: Phase 54 is treated as a v2.1 continuation phase (Phase 53
  shipped first) rather than a new milestone — its artifacts carry no milestone identity,
  and `54-01` builds on post-53 code. Drift caveat recorded: the plans reference
  `src/pages/project.js:73-80` (pre-53 header with avatar stack + labeled Share).
- [Phase 54]: Export model is DOM-free (zero imports); all writers receive machine fields so they never re-read the document
- [Phase 54]: Export route reads only docForClient; hidden-private and nonexistent ids return byte-identical 404s (no enumeration)
- [Phase 54]: Owner approval 2026-11-10: approved @office-kit/xlsx 0.26.1 (exact pin, integrity-verified, no install script)
- [Phase 54]: XLSX writer is server-only at the repo-root export/ directory; prohibition test makes the src/ boundary mechanical
