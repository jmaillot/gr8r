# Phase 29: Team/Project-Scoped Permissions - Context

**Gathered:** 2026-11-02
**Status:** Ready for planning

<domain>
## Phase Boundary

A membership can carry a scope — workspace-wide (default) or limited to specific teams
and/or specific projects — while its role stays the permission level. Scoped members see
only what their scope grants, enforced server-side on every read and write, with
out-of-scope by-id requests answering 404 (never 403 or data). Enforcement is a named
route sweep over every project-touching endpoint in `server.js` with a 404-matrix test per
endpoint family. Notification/mention recipient resolution runs the same scope predicate.
Invitations can carry scope; external collaborators can be invited to exactly one project.
Consumes the `team_members` authority rows from Phase 28. No per-team/per-project
permission *elevation* — scope only restricts reach.

</domain>

<decisions>
## Implementation Decisions

### Scope model & storage
- **D-01:** Scope shape is **mixed**: a membership scope holds `teams[]` and/or
  `projects[]` together (empty/null = workspace-wide). Reach = union of the scoped teams'
  projects plus the explicitly scoped projects. — **Reversibility:** costly — the scope
  shape feeds the invite form, member modal, scope predicate, and every route-sweep check;
  changing shape later touches all of them plus the stored column format.
- **D-02:** Scope lives in a **JSON scope column on `memberships`** (null, or
  `{teams:[], projects:[]}`), mirroring the `invites.teams` JSON-array precedent from
  Phase 28 D-07. Additive `ensureColumn()`-style migration. — **Reversibility:** one-way —
  the additive-migration test pin (`test/migration.test.mjs`, byte-identical second boot)
  locks the schema outcome.
- **D-03:** **Scope grants access:** an explicit project scope makes that project visible
  even if it is private and the member is not on its access list — scope is the
  authoritative grant for scoped members (intersects with nothing; it *opens*).
- **D-04:** Only **sub-admin roles** (viewer, member) can carry a scope; admin and owner
  memberships are always workspace-wide. Enforced server-side (reject/ignore scope on
  admin+ memberships), not just in the UI. — **Reversibility:** reversible.

### Workspace-level surfaces (the STATE.md open question — resolved)
- **D-05:** Members list shows the **full workspace roster** to scoped members (needed for
  @mentions, assignment context); other members' scope details are never shown.
- **D-06:** Workspace activity feed and cross-project search are **filtered server-side
  like private projects are today** — same redaction path; recent-search terms referencing
  out-of-scope projects are scrubbed.
- **D-07:** Notifications: scope is enforced **at send time only** (SCOPE-04 — recipient
  resolution runs the scope predicate). Pre-scope notifications stay visible; no
  server-side filtering of the notifications list.
- **D-08:** The scoped member's workspace UI is **unchanged** — same navigation, out-of-scope
  content filtered; stray by-id requests answer 404. No "scoped mode", no guest shell.

### Scope management UX
- **D-09:** Scope is set at **invite time** (invite form gains a scope section, SCOPE-05)
  and edited later in the **existing member edit modal** (extended in Phase 28 D-06 with
  the team multi-select).
- **D-10:** Admins pick teams/projects **by name from multi-selects** (pickers already
  exist from Phase 28); scope is stored as ids, names resolve live so renames propagate.
- **D-11:** **No self-indicator** — the scoped member experiences filtered content with no
  badge or "limited to" notice.
- **D-12:** Scope edits ride the **server membership API** (Phase 28 authority-route
  pattern, admin-gated), apply immediately, and never touch the workspace document.

### Guest collaborator model (SCOPE-06)
- **D-13:** No new role: an external project collaborator is a **viewer role + project
  scope** (exactly one project). "Guest" is viewer + scope expressed in the invite form,
  not a ROLE_RANK entry.
- **D-14:** The guest **inherits existing viewer semantics** inside their one project
  (read-only per current viewer behavior) — no guest carve-outs in the role ladder.
- **D-15:** After acceptance the guest lands via the **standard entry path** and sees only
  their project through normal filtering (consistent with D-08) — no special landing page.

### the agent's Discretion
- Exact route-sweep mechanics: endpoint-family grouping, 404-matrix test structure, and
  the shared scope-predicate helper signature (researcher/planner).
- Exact JSON column name and validation shape on `memberships` (planner + codebase
  conventions; `invites.teams` is the style precedent).
- Doc write-path treatment for scoped members (`mergeClientDoc` guard) — technical,
  follows from the redaction model.
- Whether the invite form scope section reuses the member-modal pickers verbatim or a
  lighter variant (planner/UI call, same data).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — SCOPE-01..SCOPE-06 define this phase's requirements verbatim
- `.planning/ROADMAP.md` §Phase 29 — goal, success criteria (404-matrix per endpoint family,
  scope predicate in notification resolution, invite-carried scope, single-project guest)
- `.planning/PROJECT.md` — v1.6 constraints (zero runtime deps, additive-only byte-identical
  migrations) and milestone invariants (EN+FR catalogue at write time, full suite green)
- `.planning/STATE.md` — "v1.6 Phase Order" note flagged the workspace-level-surfaces
  scoping-depth question; resolved here as D-05..D-08

### Cross-phase
- `.planning/phases/28-multi-team-membership/28-CONTEXT.md` — D-01/D-02 authority-rows
  architecture, D-06 member edit modal extension, D-07 `invites.teams` JSON-array precedent;
  this phase consumes the `team_members` set and the membership API pattern
- `.planning/phases/28-multi-team-membership/28-RESEARCH.md` — team_members schema and
  route details the scope predicate reads

### Code (authority sites to change)
- `server.js` — `redactDoc()` (line 731) and `hiddenProjectIds()`/`canSeeProject()`
  (lines 653–670): the read-side redaction path scope rides; `ROLE_RANK` (line 104) and
  role gates; `docForClient()` (line 1104) / `docFromClient()` (line 1116) read/write doc
  pipeline; membership API routes (lines ~3404–3569) from Phase 28 as the pattern for
  scope-edit routes; flat `pathname ===` route matching is what the sweep enumerates
- `test/migration.test.mjs` — additive-migration pin (byte-identical second boot)

No external specs/ADRs — requirements fully captured in REQUIREMENTS.md and decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `redactDoc()` (server.js:731) — already filters projects, tasks, comments, files,
  activity, notifs, events, saved views and recent-search terms per member; the scope
  predicate extends `hiddenProjectIds()` rather than building a second pipeline.
- Phase 28 membership API routes (admin-gated, authority rows, doc untouched) — the exact
  pattern for scope read/edit routes (D-12).
- Member edit modal + invite form with team multi-selects and EN+FR catalogue strings —
  extend, don't rebuild (D-09/D-10).
- Pre-migration backup pattern (`vacuum into`, server.js:1365) and `ensureColumn()`
  (server.js:223) — reuse for the scope column migration.

### Established Patterns
- Authority rows in tables, doc rebuilt on read (`syncProfiles`) — scope joins this
  pattern; never carried in the workspace document.
- 404-not-403 by-id responses preserve the v1.1 isolation contract (no existence oracle).
- Additive-only migrations pinned byte-identical in `test/migration.test.mjs`.
- Zero runtime dependencies — pure `node:sqlite`.

### Integration Points
- `canSeeProject()` / `hiddenProjectIds()` — scope check composes here (D-03 grant).
- Notification + mention recipient resolution — must call the same scope predicate (SCOPE-04).
- Invite creation and acceptance (`invites.teams` from Phase 28) — gains scope fields
  (D-09); acceptance writes the scope onto the new membership.
- Assignment picker / mention autocompletes — consume the already-filtered roster +
  `assignableInProject` predicate from Phase 28 (28-04); scope filters upstream of these.
- Every project-touching by-id endpoint in `server.js` — the named route sweep with
  per-family 404-matrix tests.

</code_context>

<specifics>
## Specific Ideas

- The invite form's scope section and the member-modal scope editor express the same data
  (teams[] + projects[] by name, stored as ids) — one mental model in both places.
- Guest = "viewer + exactly one project" is a *storage* simplification, not a UI label:
  the invite form may say "guest", the schema says role=viewer, scope={projects:[one]}.

</specifics>

<deferred>
## Deferred Ideas

- Per-team or per-project permission *levels* (elevation) — explicitly out of scope by
  SCOPE-01; role ladder stays the ceiling. Carried from Phase 28's deferred list.
- A distinct guest landing experience / "scoped mode" UI — rejected here (D-08, D-15);
  revisit only if guest feedback demands it.

</deferred>

---

*Phase: 29-Team/Project-Scoped Permissions*
*Context gathered: 2026-11-02*
