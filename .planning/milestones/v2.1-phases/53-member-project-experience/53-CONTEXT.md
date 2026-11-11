# Phase 53: Member & Project Experience - Context

**Gathered:** 2026-11-09
**Status:** Ready for planning

<domain>
## Phase Boundary

One phase covering the full v2.1 milestone, executed as 5 ordered plans: per-team
permissions server model (53-01) → invite modal polish (53-02) → unified project
settings modal (53-03) → projects table columns & Share dedup (53-04) → teams polish &
i18n close-out (53-05). Requirements: PSET-01..04, INVT-01..03, PROJ-01..02,
TEAM-01..03, UX-01. New capabilities are out of scope — this phase clarifies how the
already-scoped features behave.

</domain>

<decisions>
## Implementation Decisions

### Per-team permissions (plan 53-01, 53-03)

- **D-01: Team "Full access" is content-only.** A team with Full access gets full
  content rights on the project (edit tasks, comment, manage files) but the Access
  list itself stays owner/admin/lead-only. `canManageProject` is unchanged; per-team
  perms gate write actions, never management. A linked team can never lock the owner
  out. — **Reversibility:** costly — raising it later means auditing every write route
  and the `canManageProject` boundary across server + MCP; deciding it now avoids that.
- **D-02: Default perm for a newly linked team is "Can edit".** Owner's original
  wording: "For teams, they can edit". The admin can lower the level per team after
  linking.
- **D-03: Visibility stays boolean.** Per-team perms never add or remove a project
  from anyone's list — `canSeeProject` keeps answering see/don't-see; perms only gate
  what a member can do inside a project they can already see.

### Unified settings modal (plan 53-03, 53-04)

- **D-04: Two tabs — General and Access.** General: desc/icon/color/lead/target date.
  Access: Teams (with per-team perm dropdowns), Individual Members, General Access.
  Both old modals (projectModal, Share modal) are removed.
- **D-05: Share deep-links to the Access tab.** The project page's single Share button
  opens the modal directly on Access; the settings gear opens it on General.

### Invite modal (plan 53-02)

- **D-06: Guest without a project → disable + hint.** Deselecting the guest's only
  project disables the send button with a localized hint ("Guests need exactly one
  project" / FR equivalent). No silent clamping, no auto role downgrade.

### Projects table (plan 53-04)

- **D-07: Settings gear is a standalone per-row icon.** In Workspace > Projects, a
  small gear icon sits alongside the existing ⋯ menu as the last column — one click
  to the settings modal.

### Carried forward from milestone decisions (owner-validated 2026-11-09, pre-answered)

- M-09 per-team perms reuse the per-person 4-level model (Can view / Can comment /
  Can edit / Full access) — no new role concept
- M-10 status labels = PSTAT values; progress = task-based `progressOf`
- M-11 Date column = target date (`p.due`)
- M-12 one unified settings modal replaces projectModal + Share modal
- M-13 exactly one Share button on the project page (labeled one kept)
- TEAM-02 wording is the owner's exact sentence: "Every member of a team can have
  access to a project that is assigned to a team" (EN; FR equivalent)
- TEAM-03 invites are managed only via Workspace > Members
- Funnel lockstep is mandatory (client `canSee` mirror must equal the server funnel —
  commit 09a9c41 is the regression this prevents)

### the agent's Discretion

- Exact chip/dropdown styling within existing token system and modal patterns
- Tab bar visual treatment (reuse existing modal header patterns)
- Members-count tooltip wording (coarse info only — no rosters, T-52-03 doctrine)
- Un-select lifecycle details beyond D-06 (e.g. whether the hint also shows before
  any project is picked)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Permission & visibility model
- `.planning/research/ARCHITECTURE.md` — per-team perms storage decision
  (`p.perms['team:'+id]`), write-route gating via `projectPermFor`, all file:line
  integration points, build order
- `.planning/research/PITFALLS.md` — 10 pitfalls with phase matrix: funnel lockstep
  (09a9c41 bug class), mergeClientDoc pin block (imperative, at server.js:1090-1101),
  stale-PUT hazards for the unified modal, data-in binding checklist, guest invariant
  re-derivation
- `.planning/research/STACK.md` — zero new dependencies verdict + full reuse map
- `.planning/research/FEATURES.md` — table stakes / differentiators / anti-features
  per feature area
- `.planning/research/SUMMARY.md` — synthesis with suggested plan ordering
- `docs/WorkspacePermissions.md`, `docs/ProjectPermissions.md` — shipped v2.0
  permission model these features extend (planner must keep docs aligned)
- `.planning/ROADMAP.md` § Phase 53 — success criteria and milestone-wide invariants
- `.planning/REQUIREMENTS.md` — 13 REQ-IDs with file:line pointers

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `foldForSearch` (src/utils.js) — accent-insensitive search, live in share modal
  autocomplete (modals.js:203-228) and settings search; reuse for TEAM-01
- Chip picker pattern (modals.js:314-319 team chips; modals.js:79-98 scope picker) —
  reuse for INVT-02 Projects chips
- `PERMS` array + `p.perms` map (modals.js:195-201) — extend with `team:`-keyed
  entries for PSET-02
- `progBar` (src/ui/helpers.js:56-58) + `progressOf` (src/core/store.js:401-409) +
  PSTAT (src/core/constants.js:139-165) — PROJ-01 status column renderers
- Column renderers already exist verbatim in overview.js:40 / home.js:74 (`av`, `mem`,
  `pStatus`, `fmtDate(p.due)`)
- `data-in` / `IN.*` dispatch (src/actions/events.js:56-65; `IN.shareQ` at
  actions.js:1714) — the pattern for INVT-01 and every modal field in 53-03

### Established Patterns
- Full-DOM `render()` on state change — every modal input needs a `data-in` binding
  or it wipes (the INVT-01 bug class)
- Server-authoritative access with keyed refusals riding 200s; client reverts
  optimistically
- `mergeClientDoc` pin block is imperative (server.js:1090-1101) — new team-keyed
  perms entries must be added to it or a stale PUT silently deletes them
- i18n gate: dead keys deleted in the commit that removes the UI; catalogue/data-a
  pins updated in the same commits

### Integration Points
- `canSeeProject` (server.js:800) / `memberCanReadProject` (:813) — funnel, stays
  boolean
- `projectAccessReason` (server.js:828) — lockstep label mirror
- `mcp.js:183` `canReadProject` — MCP mirror, must be updated in the same commit
- `canSee` (src/core/store.js:345) — client funnel mirror, lockstep fixture
- Invite scope payload already end-to-end (actions.js:1934-1983 → server.js:5217-5226)
- Team detail page invite button (src/pages/members.js:174) — removal site
- projects.js table (view toggle grid/list/table) and project.js header (lines 74-77)

</code_context>

<specifics>
## Specific Ideas

- "For teams, they can edit" — the owner's phrasing that fixed D-02 (default Can edit)
- The exact hint sentence for TEAM-02 is the owner's own: "Every member of a team can
  have access to a project that is assigned to a team"
- The email-wipe bug is the owner's most-annoying daily friction — INVT-01 should be
  verified interactively (type → switch role → switch team → emails still present)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 53-Member & Project Experience*
*Context gathered: 2026-11-09*
