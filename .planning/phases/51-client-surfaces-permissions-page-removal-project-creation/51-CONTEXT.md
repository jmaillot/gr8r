# Phase 51: Client surfaces, Permissions-page removal & project creation - Context

**Gathered:** 2026-11-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Client-side permission surfaces on top of the Phase 49/50 server model:
the share modal's `shareAccess` select becomes a per-project private/public
toggle (VIS-01); the share modal offers team invites with live-team copy
(D-50-5); the workspace Settings > Permissions page is deleted end-to-end
with its relevant pieces relocated (CRT-02); project creation is open by
default with an admin-restriction setting made real (CRT-01); every new or
changed string is catalogued EN+FR through the i18n gate (UX-01).

Server-side invite hierarchy, per-project toggles and the visibility
predicate are Phase 50/49 territory — this phase calls them. The Phase 52
transparency view is out of scope.

</domain>

<decisions>
## Implementation Decisions

### Private/public toggle (VIS-01)
- **D-51-1:** The toggle lives **in the share modal, in place** — replacing
  the existing `shareAccess` select in the general-access row
  (`src/overlays/modals.js:252`). No project-header control.
- **D-51-2:** Control shape is a **two-state toggle reusing the existing
  labels** ('Only invited' / 'Everyone at {workspace}') — existing i18n
  keys reused, no new key for the control itself.
- **D-51-3:** The flip is **optimistic with revert** — UI flips instantly,
  reverts with a toast if the server refuses. No wait-for-ack spinner.
- **D-51-4:** Visibility-epoch refetch: a client that loses a project (e.g.
  someone flipped it private) **refetches and shows an honest localized
  not-found state** — no silent removal, no raw error (roadmap criterion 1).
- **D-51-5:** The share modal shows an **inline teams note** when `p.teams`
  is non-empty, making the live team link visible at the point of control.

### Share-modal team invite (INV-03 surfaces)
- **D-51-6:** Team invite is a **'Teams' section in the share modal**
  listing workspace teams with an 'Invite team' action each — no unified
  email/team typeahead.
- **D-51-7:** **Team invite confers Member role — no role choice on the
  team action.** To make someone admin/owner, issue a separate **individual
  invite; the individual role takes precedence over the team-derived
  role** so the member can perform elevated tasks on that project.
- **D-51-8:** Copy reflects **live team semantics** ("current members of
  the team have access, and access follows team membership") — the
  roadmap's "snapshot semantics" wording is superseded by D-50-5.
- **D-51-9:** Already-linked teams are **listed in the teams note with a
  remove action** and excluded from the invite list.

### Settings > Permissions teardown (CRT-02)
- **D-51-10:** `permCreate` (creation restriction) **relocates to Workspace
  settings > General** — the toggle's key and behavior carry over, the page
  dies.
- **D-51-11:** `permGuests` is **deleted** — superseded by the per-project
  `p.allowInviteGuests` toggle (D-50-10, D-50-7).
- **D-51-12:** `permPublic` ('Allow public share links') is **deleted** —
  the collapsed model has no separate public-share-link concept.
- **D-51-13:** The role-permissions table (`permsTable`) **relocates to
  Workspace settings > Members**. No orphaned routes, actions or i18n keys
  remain (removed-key leak check).

### Project creation & the lead role (CRT-01) — MILESTONE CHANGE
- **D-51-14:** With the restriction on, members see the create affordance
  **disabled with a tooltip** ('restricted to admins') — not hidden
  entirely.
- **D-51-15:** Server refusal of a restricted create attempt is **403 +
  localized toast**.
- **D-51-16:** The restriction takes effect **immediately** — next request,
  no cached state.
- **D-51-17:** **MILESTONE CHANGE — supersedes D-50-1 in part:** the
  project creator becomes a **per-project lead**, a NEW per-project role
  with **project-manage rights** (manage that project's members, toggles
  and settings). Workspace admin/owner rights are unchanged and still
  outrank. This reintroduces one per-project role where D-50-1 said "no
  per-project roles" — the visibility predicate, share-modal manage
  gating (`canManage`), mergeClientDoc pinning, and the Phase 52
  transparency view must all account for it. — **Reversibility:** costly —
  the lead role touches the manage-permission checks on every project
  surface; undoing it means re-gating `canManage` back to workspace roles
  across server + client + MCP mirror.

### Agent's Discretion
- Exact API shape for the toggle endpoint reuse (Phase 50 routes), teams
  note markup, visibility-epoch refetch mechanics, removed-key detection
  specifics, where the server carries `permCreate` enforcement, lead-role
  storage representation (`p.members` entry shape vs new field),
  activity-log entries: technical territory for researcher/planner.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & decisions
- `.planning/REQUIREMENTS.md` — VIS-01, CRT-01, CRT-02, UX-01 definitions
- `.planning/ROADMAP.md` §Phase 51 — goal, 5 success criteria (criterion 2
  copy wording superseded by D-51-8)
- `.planning/PROJECT.md` — v2.0 decisions, standing constraints (zero new
  runtime deps, i18n gate)
- `.planning/phases/50-invite-hierarchy-per-project-toggles-server/50-CONTEXT.md`
  — D-50-5 (live team link — governs D-51-8), D-50-7/8 (guest toggle),
  D-50-10/11 (guest→viewer); D-50-1 partially superseded by D-51-17
- `.planning/phases/49-visibility-model-collapse-grant-materialization/49-CONTEXT.md`
  — collapsed predicate, D-49-3 (boolean `p.private`)

### Milestone research
- `.planning/research/ARCHITECTURE.md` — adopted architecture, funnel
  completeness
- `.planning/research/PITFALLS.md` — 404-matrix-first rule, no-leak doors

### Domain docs
- `docs/WorkspacePermissions.md` — workspace roles, the cosmetic toggles
  this phase makes real or deletes (§"état actuel")
- `docs/ProjectPermissions.md` — permission/visibility model documentation
  (must be updated: toggle UI, team invite surfaces, lead role)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Share modal general-access row (`src/overlays/modals.js:252`) — the
  `shareAccess` select to replace with the toggle; `canManage` gating
  already present (must learn the lead role)
- Share modal invite form (`modals.js:202-221`, `shareQ` typeahead,
  `PERMS` role select) — the pattern for the new Teams section
- Workspace settings toggles (`src/pages/settings.js:489-493`) —
  `permCreate` row to relocate to General; `permsTable` import from
  `members.js` to relocate
- `canSee()` client predicate (`src/core/store.js:326`) — client-side
  visibility check for the honest not-found path
- Project list lock icons (`src/pages/projects.js:15,43`) — already render
  `p.private` state
- i18n catalogs `src/locales/en.json` / `fr.json` + `npm run i18n:scan`
  gate

### Established Patterns
- `tog()` settings-row toggle component — reuse for permCreate relocation
- Optimistic action + revert toast — existing modal action pattern
- i18n removed-key leak check — must catch permGuests/permPublic/Permissions
  page keys after deletion

### Integration Points
- Phase 50 toggle/team-link server routes — the surfaces call them
- `p.teams` / `p.members` / `p.allowInviteGuests` in the client doc —
  teams note, invite section, linked-team removal
- `mergeClientDoc` reserved rows — lead-role representation must be pinned
  if stored on the project doc
- Workspace settings page sections (General, Members) — relocation targets

</code_context>

<specifics>
## Specific Ideas

- Owner (verbatim): team invite makes members of that team "Member role";
  to make a team member admin or owner, add a separate individual invite
  with his role — "the individual invite must precede team role so he can
  do admin tasks".
- Owner (verbatim): the creator becomes "admin of that project" — refined
  with the agent into the per-project lead role with project-manage rights
  (D-51-17).
- Owner consistently chose minimal-diff, reuse-existing-labels options
  (toggle in place, same copy, permCreate to General).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (The Phase 52 transparency
view is the natural place to surface lead/membership provenance.)

</deferred>

---

*Phase: 51-Client surfaces, Permissions-page removal & project creation*
*Context gathered: 2026-11-08*
