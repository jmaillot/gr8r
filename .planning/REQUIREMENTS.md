# Requirements — v2.1 Member & Project Experience

**Status:** PLANNED
**Created:** 2026-11-09

## v2.1 Requirements

### Invite Modal

- [x] **INVT-01**: Email draft survives role/team/scope changes in the invite modal
  (`data-in="inviteDraft"` state binding + `IN.inviteDraft` handler — the textarea at
  modals.js:312 currently has no binding, so any `render()` wipes typed emails)
- [x] **INVT-02**: Admin/owner can select Projects in the invite modal — chip
  multi-select (same design as the Team chip picker, modals.js:314-319) below Team
  selection; the selection feeds the invite's project scope (payload already carries
  scope end-to-end: actions.js:1934-1983 → server.js:5217-5226)
- [x] **INVT-03**: Guest invariant enforced on the new path: a guest invite carries
  exactly one project (client clamp in `A.submitInvite` + server re-derivation on
  create AND invite edit; verify the MCP invite tool ceiling at plan time)

### Teams

- [x] **TEAM-01**: Edit Team members box is searchable — accent-insensitive
  `foldForSearch` filter input above the checkbox list (teams.js:33-45), like the
  share-modal member autocomplete (modals.js:203-228)
- [x] **TEAM-02**: Hint text replaced with correct multi-team wording:
  "Every member of a team can have access to a project that is assigned to a team"
  (replaces the factually wrong `page.team.membersHint` primary-team text; EN+FR)
- [x] **TEAM-03**: "Invite to workspace" button removed from the team detail page
  (members.js:174) — invites are managed only via Workspace > Members

### Project Settings

- [x] **PSET-01**: Unified project settings modal: General section (desc/icon/color/
  lead/target date) + Access section (Teams, Individual Members, General Access) —
  replaces both the current `projectModal` (modals.js:156-194) and the Share modal
  (modals.js:202-289); net code reduction
- [x] **PSET-02**: Per-team permissions: each team with access gets a perm level
  (Can view / Can comment / Can edit / Full access), reusing the per-person perms
  model (`PERMS` array, `p.perms` map — team-keyed namespacing per ARCHITECTURE.md)
- [x] **PSET-03**: Per-team perms enforced server-side: write-route gating via a
  `projectPermFor` helper, semantics decided inside `canSeeProject`/`memberCanReadProject`,
  mirrored into `mcp.js:183` `canReadProject` and `projectAccessReason` in ONE lockstep
  change, `mergeClientDoc` pin block + `normalizeProjects` extended, VISIBILITY_MODEL
  oracle extended (anti-tautology). Note: perms gate write actions, not visibility —
  `canSeeProject` stays boolean unless the owner rules otherwise
- [x] **PSET-04**: The same settings modal opens from Workspace > Projects (per-row
  gear) and the project page — identical component, no divergent copies

### Projects Table & Page

- [x] **PROJ-01**: Projects table columns: Lead (avatar+name) / Teams / Members
  (count) / Status (PSTAT pill + task-based `progressOf` bar) / Target date (`p.due`)
  — renderers already exist (overview.js:40, home.js:74); no avatar stacks
- [x] **PROJ-02**: Project page has exactly one Share button (labeled) — the `user+`
  icon button (project.js:75) and avatar-stack button (project.js:74) are removed;
  Share opens the unified settings modal's Access section

### Standing Invariants

- [x] **UX-01**: Every user-facing string catalogued EN+FR; `npm run i18n:scan` passes
  (0 dead / 0 stale); catalogue-size and data-a pins updated in the same commits as
  the changes that alter them; dead keys from removed modals deleted, never allowlisted

## Future Requirements (deferred)

- **TRN-02**: Member self-view of the transparency data (v3 candidate, carried from v2.0)
- **NOTIF-TRIM**: Notification audit trim recommendations (needs owner rulings)
- Per-person perms editing during invite (invite assigns scope; perms edited later in
  the Access tab — M-02 consistency, research anti-feature)

## Out of Scope

| Feature | Reason |
|---------|--------|
| New UI framework / component library | Zero-runtime-dependency constraint (D-12); all patterns are in-repo reassemblies |
| Avatar stacks in the projects table | Research anti-feature: count + existing renderers suffice |
| Separate Share quick-action | M-13: one Share entry point |
| Spray-fitting search into every picker | Only the Edit Team members box is in scope this milestone |
| Searchable token-chip pickers beyond the invite modal | Flat chip lists stay the pattern; revisit later |

## Traceability

| Requirement | Phase / Plan | Status |
|-------------|--------------|--------|
| PSET-02 | Phase 53, plan 53-01 | Complete |
| PSET-03 | Phase 53, plan 53-01 | Complete |
| INVT-01 | Phase 53, plan 53-02 | Complete |
| INVT-02 | Phase 53, plan 53-02 | Complete |
| INVT-03 | Phase 53, plan 53-02 | Complete |
| PSET-01 | Phase 53, plan 53-03 | Complete |
| PSET-04 | Phase 53, plan 53-03 | Complete |
| PROJ-01 | Phase 53, plan 53-04 | Complete |
| PROJ-02 | Phase 53, plan 53-04 | Complete |
| TEAM-01 | Phase 53, plan 53-05 | Complete (2026-11-09) |
| TEAM-02 | Phase 53, plan 53-05 | Complete (2026-11-09) |
| TEAM-03 | Phase 53, plan 53-05 | Complete (2026-11-09) |
| UX-01 | Phase 53, plan 53-05 (milestone-wide invariant, enforced in every plan) | Complete (2026-11-09) |

Coverage: 13/13 v2.1 requirements mapped to plan-level units inside the single Phase 53, no orphans, no duplicates.
