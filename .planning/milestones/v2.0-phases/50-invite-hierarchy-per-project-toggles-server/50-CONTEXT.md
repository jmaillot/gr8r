# Phase 50: Invite hierarchy & per-project toggles (server) - Context

**Gathered:** 2026-11-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Server-side invite authorization and per-project access semantics: strict
owner-only-owner hierarchy enforced at invite creation, role edit, and invite
acceptance (INV-01); post-invite editing of role/scope/status with immediate
effect (INV-02); team invites as a **live team link** (INV-03 — see D-50-5,
which supersedes the snapshot wording); per-project "members may invite
guests" toggle (VIS-04); one guest concept (INV-04). Includes the reverse-sweep
boot migration that converts Phase 49's materialized team grants back into
`p.teams[]` links.

No client UI — the toggle surfaces, share modal and Settings > Permissions
removal are Phase 51. No send-time consumer changes beyond keeping the
`memberCanReadProject` parity (which now carries the team term again).

</domain>

<decisions>
## Implementation Decisions

### Post-invite editing (M-02 / INV-02)
- **D-50-1:** "Project scope" editing = add/remove the user from
  `p.members`. No per-project roles, no invite-provenance tracking —
  team-link entries and direct invites are distinguished by the model
  (D-50-5), not by member provenance.
- **D-50-2:** "Status" = in/out of `p.members` — removal revokes access on
  the very next request. No per-project suspended flag.
- **D-50-3:** Role editing uses the existing workspace
  `PATCH /api/workspaces/:ws/members/:uid` route — Phase 50 verifies and pins
  with tests that a role change takes effect on the very next request (no
  cached roles), it does not build a new route.
- **D-50-4:** Edit hierarchy is **stricter than literal INV-01**: admins can
  only edit non-admins (members/guests); any edit touching another admin
  (role, scope, or status) requires an owner. Only an owner grants the owner
  role at all three points (invite creation, role edit, acceptance).

### Team access model — MILESTONE CHANGE
- **D-50-5:** Owner decision 2026-11-08 — **supersedes the M-03 snapshot
  wording and reverses D-49-5**: a project holds a **live team link**.
  `p.teams[]` returns on the project doc; the visibility predicate becomes
  `public ∨ memberId ∈ p.members ∨ member's team ∈ p.teams`. Joining a team
  grants access to every project the team is linked to; leaving the team
  revokes it (unless also individually in `p.members`). Individual invites
  coexist with team links. REQUIREMENTS.md (M-03, INV-03), ROADMAP.md (Phase
  50 success criterion 3) and PROJECT.md are updated in lockstep. —
  **Reversibility:** one-way — the live link replaces the Phase 49
  materialization as the model of record; re-snapshotting later means
  re-running a sweep and rewriting the predicate again.
- **D-50-6:** Phase 50 ships a **reverse-sweep boot migration**: Phase 49's
  materialized team grants (team-intersection-derived `p.members` entries)
  are converted back into `p.teams[]` links and the corresponding
  `p.members` entries removed; genuine individual invites are preserved.
  Without this, stale entries would keep access alive after a member leaves
  the team, silently defeating the live rule. Provenance source (activity
  log vs live-intersection diff) is researcher/planner territory.

### Per-project guest-invite toggle (VIS-04)
- **D-50-7:** `p.allowInviteGuests` defaults **OFF for new projects too**
  (consistent with D2.0-1's OFF for existing projects). Deny-by-default
  everywhere; an admin opts a project in.
- **D-50-8:** Admin/owner only can flip the toggle. Flipping OFF blocks only
  NEW member-initiated guest invites — existing guest members are untouched.
  A stale member guest invite accepted after the flip fails closed (Phase 33
  fail-closed invite-twin pattern, re-deriving from current state).
- **D-50-9:** Team invites bypass the toggle — an admin/owner team invite
  brings the full current roster including guest-role members regardless of
  the toggle (team invites are already owner/admin-only, a trusted act).

### One guest concept (INV-04)
- **D-50-10:** The guest data model collapses: existing
  `memberships.role`/`invites.role` value `'guest'` is normalized to
  `'viewer'` in this phase's boot migration; server code loses the guest
  term (success criterion 5 as written). The "Invité externe" client toggle
  dies (Phase 51 for the UI; the server stops honoring/mirroring it now).
- **D-50-11:** Guest specialness survives **via behavior only** —
  restrictions come from viewer-role checks (e.g. no workspace-settings
  access), enforced by existing role checks; no separate guest data model.

### Agent's Discretion
- Exact enforcement/refusal shapes for the three hierarchy points (status
  codes, error keys), API route shape for scope editing and team linking,
  migration mechanics and provenance reconstruction, `mergeClientDoc`
  pinning details for `p.allowInviteGuests`/`p.teams`, activity-log entries,
  404-matrix fixture extensions: technical territory for researcher/planner.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone research (primary)
- `.planning/research/ARCHITECTURE.md` — adopted architecture; NOTE: its
  Phase-2 "team-share expansion endpoint (snapshot)" description is
  superseded by D-50-5 (live team link) — the predicate-shape and
  funnel-completeness guidance still applies
- `.planning/research/PITFALLS.md` — Pitfall 3 (guest collapse: toggle
  drift, fail-closed accept) and Pitfall 4 (invite-in-flight during model
  swap: re-derive at accept) directly govern this phase; 404-matrix-first rule
- `.planning/research/SUMMARY.md` — edge fixture list to re-derive with the
  team term restored

### Requirements & decisions
- `.planning/REQUIREMENTS.md` — INV-01..04, VIS-04 definitions (M-03/INV-03
  wording updated to live team link per D-50-5)
- `.planning/PROJECT.md` — v2.0 milestone decisions and standing constraints
  (zero new runtime deps, dual backend, i18n gate)
- `.planning/ROADMAP.md` §Phase 50 — goal, success criteria (criterion 3
  updated to live team semantics)
- `.planning/phases/49-visibility-model-collapse-grant-materialization/49-CONTEXT.md`
  — what Phase 49 shipped (sweep, D-49-1..8); D-49-5 is reversed by D-50-5,
  D-49-2's scope retirement stands

### Domain docs
- `docs/ProjectPermissions.md` — permission/visibility model documentation
  (must be updated: team term returns to the predicate)
- `docs/WorkspacePermissions.md` — workspace roles, current guest model and
  the cosmetic toggles `permCreate|permGuests|permPublic` (§"état actuel")
  whose server gates this phase makes real

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `memberCanReadProject()` / `hiddenFor()` (server.js ~767-872) — the single
  visibility funnel; the team term returns here (was deleted by D-49)
- `teamIntersects()` / `teamsOfUser()` — deleted by Phase 49; resurrect or
  re-derive equivalents for the live team rule
- `invites` table (server.js:299-311) — `role/teams` columns exist; role
  check constraint accepts 'admin','member','viewer' (guest normalization
  already matches the stored domain)
- Invite routes (server.js:4940-5106) — create/list/accept with Phase 33
  fail-closed acceptance hardening to extend
- `PATCH /api/workspaces/:ws/members/:uid` (server.js:4764-4801) — the
  existing role-edit route D-50-3 pins
- Phase 49 boot-sweep machinery (guarded, transactional, byte-identical
  second boot) — the template for the D-50-6 reverse sweep and D-50-10
  guest normalization

### Established Patterns
- Fail-closed invite acceptance (Phase 33 HARD twins): re-derive permissions
  from current state at accept — governs the stale-guest-invite rule (D-50-8)
- Additive migration with pre-migration backup; "no backup = no mutation"
- `mergeClientDoc` reserved-row pinning — must pin the new
  `p.allowInviteGuests` and restored `p.teams`
- Byte-identical 404 / 404-matrix test per endpoint family — extend the
  matrix for team-linked access cells before implementation

### Integration Points
- Send-time consumers (reminder pass, email mirror, digest) read
  `memberCanReadProject` — parity test must cover the restored team term
- MCP mirror `canReadProject` (mcp.js) — must re-gain the team term in
  lockstep (Pitfall 2 lesson: no over/under-permissive window)
- `normalizeProjects()` invariants — cooperate with `p.teams` restoration
  and the sealed private-project shape (D-49-8 lesson)

</code_context>

<specifics>
## Specific Ideas

- Owner statement (verbatim intent): "project scope should be members +
  team" — a project has two access kinds: team links and individual
  members, both live. Everything derives from those two lists.
- Owner consistently chose deny-by-default and minimal-model options
  (toggle OFF everywhere, guest→viewer normalization, no new status flags).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Team-roster UX, share-modal
copy and toggle UI belong to Phase 51.)

</deferred>

---

*Phase: 50-Invite hierarchy & per-project toggles (server)*
*Context gathered: 2026-11-08*
