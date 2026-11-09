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
- 🚧 **v2.1 Member & Project Experience** — Phase 53 (in progress)

## Phases

- [ ] **Phase 53: Member & Project Experience** - One ordered phase covering all v2.1 requirements: per-team perms (server first), invite modal, unified project settings, projects table & Share dedup, teams polish — executed plan-by-plan in the dependency order below

## Phase Details

### Phase 53: Member & Project Experience

**Goal**: The everyday surfaces — invite modal, team editing, project settings, projects
table — match how people actually use workspaces, with per-team permissions enforced
server-first through the one existing funnel.

**Depends on**: Nothing (first phase of v2.1)

**Requirements**: PSET-02, PSET-03, INVT-01, INVT-02, INVT-03, PSET-01, PSET-04,
PROJ-01, PROJ-02, TEAM-01, TEAM-02, TEAM-03, UX-01

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
| 53-01 Per-team perms (server model) | Not started | - |
| 53-02 Invite modal (draft, chips, guest clamp) | Not started | - |
| 53-03 Unified project settings modal | Not started | - |
| 53-04 Projects table columns & Share dedup | Not started | - |
| 53-05 Teams polish & i18n close-out | Not started | - |

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
