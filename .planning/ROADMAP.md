# Roadmap: gr8r

## Milestones

- ✅ **v1.0 MVP** — Phases 1-9 (shipped 2025-11-27)
- ✅ **v1.1 Security** — Phases 10-15 (shipped 2026-01)
- ✅ **v1.2 Authentication (SSO/OIDC)** — Phases 16-20 (shipped 2026-03)
- ✅ **v1.3 Invitations & Onboarding** — Phases 21-24 (shipped 2026-05)
- ✅ **v1.4 Admin Experience** — Phases 25-27 (shipped 2026-06)
- ✅ **v1.5 Integrations & Email** — Phases 28-30 (shipped 2026-09)
- ✅ **v1.6 Membership Refinement** — Phase 31 (shipped 2026-11-02)
- ✅ **v1.7 Team Visibility & Hardening** — Phases 32-35 (shipped 2026-11-04)
- ✅ **v1.8 Notification Sanity** — Phases 36-39 (shipped 2026-11-05)
- ✅ **v1.9 Digest Context & One-Click Unsubscribe** — Phases 40-44 (shipped 2026-11-07)
- ✅ **v1.10 Extensions & Adapters** — Phases 45-48 (shipped 2026-11-07)
- ✅ **v2.0 Project-level Permissions & Invitations** — Phases 49-52 (shipped 2026-11-09)
- 🚧 **v2.1 Member & Project Experience** — Phase 53 shipped 2026-11-09; Phase 54 in progress

## Phases

- [x] **Phase 53: Member & Project Experience** - One ordered phase covering all v2.1 requirements: per-team perms (server first), invite modal, unified project settings, projects table & Share dedup, teams polish — executed plan-by-plan in the dependency order below (completed 2026-11-09)
- [ ] **Phase 54: Project export — Excel report, MSPDI XML and CSV** - One export model, three writers (xlsx / MSPDI / CSV), scoped to the current filtered view or the whole project

## Phase Details

### Phase 53: Member & Project Experience

**Goal**: The everyday surfaces — invite modal, team editing, project settings, projects
table — match how people actually use workspaces, with per-team permissions enforced
server-first through the one existing funnel.

**Depends on**: Nothing (first phase of v2.1)

**Requirements**: PSET-02, PSET-03, INVT-01, INVT-02, INVT-03, PSET-01, PSET-04,
PROJ-01, PROJ-02, TEAM-01, TEAM-02, TEAM-03, UX-01

**Plans:** 5/5 plans complete

Plans:
**Wave 1**
- [x] 53-01-PLAN.md — Per-team perms server model (`p.perms['team:']`, `projectPermFor` write gates, lockstep mirrors, oracle + pin regression)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 53-02-PLAN.md — Invite modal: draft `data-in` fix, Projects chips, shared guest validator (create/edit/accept) + D-06 UX

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 53-03-PLAN.md — Unified project settings modal (General + Access) replacing projectModal + Share modal, per-team perm dropdowns

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 53-04-PLAN.md — Projects table columns (Lead/Teams/Members/Status/Target) + one labeled Share → Access tab

**Wave 5** *(blocked on Wave 4 completion)*
- [x] 53-05-PLAN.md — Teams polish (searchable members box, hint, invite removal) + milestone i18n close-out

**Execution order** (plans are built and executed in this order; each plan is
self-contained and commits atomically):

1. **53-01 Per-team perms — server model** (PSET-02, PSET-03): team-keyed levels in
   `p.perms['team:'+teamId]`, one shared `projectPermFor` helper gating write routes,
   lockstep across server funnel + `projectAccessReason` + mcp.js mirror + client
   `canSee` store mirror, `mergeClientDoc` pin block + `normalizeProjects` coverage,
   VISIBILITY_MODEL oracle extension. Visibility stays boolean.
2. **53-02 Invite modal** (INVT-01, INVT-02, INVT-03): `data-in="inviteDraft"` fix,
   Projects chip multi-select below Team, guest = exactly one project (client clamp +
   server validator on create and edit; MCP coverage verified).
3. **53-03 Unified project settings modal** (PSET-01, PSET-04): General + Access
   replaces projectModal and Share modal; per-team perm dropdowns backed by 53-01;
   every field `data-in`-bound; stale/concurrent-edit honesty; dead keys pruned.
4. **53-04 Projects table columns & Share dedup** (PROJ-01, PROJ-02): Lead / Teams /
   Members count / Status (PSTAT + progress) / Target date; exactly one labeled Share
   button opening the Access section of the unified modal.
5. **53-05 Teams polish & i18n close-out** (TEAM-01, TEAM-02, TEAM-03, UX-01):
   searchable Edit Team members box (`foldForSearch`, checked-state preserved), correct
   multi-team hint (EN+FR), team-page invite button removed with its dead keys, final
   milestone i18n gate sweep.

**Success Criteria** (what must be TRUE):

1. An admin can set a per-team permission level (Can view / Can comment / Can edit /
   Full access) on a project; the value persists in `p.perms['team:'+teamId]` with zero
   migrations, and write routes enforce it server-side through `projectPermFor` — a
   member whose only access comes from a "Can view" team cannot edit or comment.
2. The server funnel, `projectAccessReason`, the mcp.js mirror and the client `canSee`
   store mirror agree on every actor shape (VISIBILITY_MODEL oracle extended,
   client-mirror parity a tested fixture — the 09a9c41 bug class cannot recur); a stale
   client PUT cannot un-hide a project or wipe team-perm keys (pin-block regression test).
3. The invite modal survives interaction: typed emails never vanish when role/teams/
   projects change; Projects chips feed the invite scope; a guest invite carries exactly
   one project enforced on create AND edit.
4. One unified settings modal (General + Access) opens identically from
   Workspace > Projects and the project page; both old modals are gone; every
   keystroke-able field has a `data-in` binding; concurrent-edit conflicts surface
   honestly (no silent no-op saves).
5. The projects table shows Lead / Teams / Members count / Status (PSTAT pill +
   task-based progress) / Target date; the project page has exactly one Share button
   opening the modal's Access section.
6. The Edit Team members box is accent-insensitive searchable without losing checked
   state; the team hint shows correct multi-team wording (EN+FR); the team detail page
   has no invite button.
7. `npm run i18n:scan` passes across the whole milestone (0 dead / 0 stale), dead keys
   from removed UI deleted in the commits that remove them, catalogue-size and data-a
   pins updated in the same commits; full suite green; zero new runtime dependencies.

**Plans**: TBD

**UI hint**: yes (plans 53-02, 53-03, 53-04, 53-05)

### Phase 54: Project export — Excel report, MSPDI XML and CSV

**Goal**: A member can export a project's data — scoped to the current filtered view or the whole project — as a formatted Excel report with native charts and a Gantt carrying dependency arrows, as a Microsoft Project MSPDI XML file that opens with real task links, or as a flat CSV on the static demo.

**Depends on**: Phase 53 (v2.1) — no hard code dependency, but the plan line refs
were authored before Phase 53 landed and need a drift check at execute time

**Requirements**: See `54-SPEC.md` (13 locked requirements, ambiguity 0.11)

**Plans:** 5 plans

Plans:
**Wave 1**
- [x] 54-01-PLAN.md — CSV end-to-end tracer: model, CSV writer, gated export route, download helper, modal and both entry points

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 54-02-PLAN.md — Pinned workbook writer behind a legitimacy checkpoint, repository gates, unzip/XML helpers and the six-sheet shell with the Tasks sheet

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 54-03-PLAN.md — Summary meta, KPIs and charts 1-2; Board snapshot; Members with chart 3; Milestones sheet

**Wave 4** *(blocked on Wave 3 completion)*
- [ ] 54-04-PLAN.md — Adaptive Gantt geometry, Timeline bars, diamonds and dependency connectors, Today column, shape cap and responsiveness

**Wave 5** *(blocked on Wave 4 completion)*
- [ ] 54-05-PLAN.md — MSPDI serializer, Excel/Project format wiring, EN+FR catalogue and the human Microsoft Project check

## Milestone-Wide Invariants (pinned per plan)

- **UX-01** applies to EVERY plan: any commit that removes UI deletes its dead keys in
  the same commit; any commit that alters catalogue size or data-a pins updates the
  pins in the same commit.
- **Funnel lockstep**: any plan touching visibility or access semantics (53-01, 53-03)
  ships server funnel + `projectAccessReason` + mcp.js mirror + client `canSee` store
  mirror in one lockstep change, with client-mirror parity as a tested fixture.
- **Zero new runtime dependencies**; **zero migrations** (doc-field extensions only);
  **full suite green**; **EN+FR i18n gate (server keys included)**.

## Progress Table

| Plan | Status | Completed |
|------|--------|-----------|
| 53-01 Per-team perms (server model) | Complete | 2026-11-09 |
| 53-02 Invite modal (draft, chips, guest clamp) | Complete | 2026-11-09 |
| 53-03 Unified project settings modal | Complete | 2026-11-09 |
| 53-04 Projects table columns & Share dedup | Complete | 2026-11-09 |
| 53-05 Teams polish & i18n close-out | Complete | 2026-11-09 |
| 54-01 CSV end-to-end tracer | Complete | 2026-11-10 |
| 54-02 Workbook writer + six-sheet shell (Tasks) | Complete | 2026-11-10 |
| 54-03 Summary, KPIs, charts, Board/Members/Milestones | Pending | — |
| 54-04 Gantt geometry + dependency connectors | Pending | — |
| 54-05 MSPDI serializer + i18n close-out | Pending | — |

## Backlog

- **TRN-02** Member self-view of the transparency data (v3 candidate, carried from v2.0)
- **NOTIF-TRIM** Notification audit trim recommendations (needs D-05 owner rulings)
- Per-person perms editing during invite (invite assigns scope; perms edited later in
  the Access tab — M-02 consistency, research anti-feature)
- Searchable token-chip pickers beyond the invite modal; spray-fitting search into every picker
- General-Access granularity beyond private/public; column show/hide + saved views

<details>
<summary>✅ v1.8 Notification Sanity (Phases 36-39) — SHIPPED 2026-11-05</summary>

Details: [.planning/milestones/v1.8-ROADMAP.md](milestones/v1.8-ROADMAP.md)

</details>
