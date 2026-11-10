# Phase 52: Transparency view & milestone verification sweep - Context

**Gathered:** 2026-11-08
**Status:** Ready for planning

<domain>
## Phase Boundary

The final phase of milestone v2.0: an admin/owner transparency view showing
exactly what a given member can access, computed server-side through the ONE
visibility funnel (`memberCanReadProject`, `server.js:813`) — never from the
redacted client doc — plus a milestone-wide verification sweep re-running the
no-leak and invariant guarantees in one clean pass (TRN-01, M-08).

Member self-view is TRN-02 and stays deferred to v3. No new visibility
semantics: this phase observes the funnel, it does not change it.

</domain>

<decisions>
## Implementation Decisions

### View placement
- **D-52-1:** The transparency view lives **inside Workspace settings >
  Members** — each member row becomes expandable, revealing the projects
  that member can access. No separate Transparency page/section.
- **D-52-2:** Expansion reveals **all accessible projects** — non-private
  AND private ones the member can reach (matches TRN-01 wording; non-private
  projects are listed, not implied).
- **D-52-3:** The expanded view **refetches on every open** — closed and
  re-opened always shows current state (D-50-5 live team semantics: team
  join/leave can change access between opens). A stale open expansion is a
  point-in-time snapshot of when it was opened.
- **D-52-4:** The expand action is **admin/owner only** — gated server-side
  on workspace role, consistent with TRN-01. Members cannot expand their own
  row (that is TRN-02, v3).

### Access-reason detail
- **D-52-5:** Each listed project shows **WHY** the member can access it:
  'Everyone' (non-private) / 'Member' (direct `p.members`) / 'Team: {name}'
  (live team link) / 'Lead' (per-project lead, D-51-17).
- **D-52-6:** **First matching reason only** per project, in funnel order
  (membership → team; non-private is just 'Everyone') — matches how
  `canSeeProject` short-circuits, keeps the i18n surface small. No
  multi-reason combination display.
- **D-52-7:** Reasons render as **plain localized labels** (EN+FR through
  the i18n gate) — no chips/icons for v2.0.

### Agreement check (success criterion 2)
- **D-52-8:** Agreement between the transparency view and the member's own
  experience is verified by **permanent parity tests**: for each sampled
  member×project shape, the transparency endpoint's list must equal the
  complement of the redacted doc's hidden set (same convention as the
  Phase 49 funnel parity test).
- **D-52-9:** The parity fixture matrix is the **extended set**: public,
  private+direct member, private+team-linked, private+lead,
  private+no-access (absent), D-51-4 lost-visibility case, empty-members
  private project, member of zero teams, admin viewing another admin,
  guest member.

### Milestone verification sweep (success criterion 3)
- **D-52-10:** The sweep is **gates + docs refresh**: run the full 404-matrix,
  Phase 38 suppression + no-double-send invariants, EN+FR i18n gate, full
  test suite — and update `docs/WorkspacePermissions.md` +
  `docs/ProjectPermissions.md` to the shipped v2.0 model (docs still
  describe v1.7 in places; Phase 51 flagged the doc sweep).
- **D-52-11:** The sweep reuses the **Phase 51 verify commands verbatim**
  (`npm test`, `npm run i18n:scan`, the 404-matrix and suppression suites) —
  no new aggregate script.

### Agent's Discretion
Transparency endpoint shape and route placement, member-row expansion UI
mechanics, reason-label i18n keys, how the endpoint samples the funnel per
member (per-project `memberCanReadProject` calls are fine), parity test file
placement, docs refresh depth: technical territory for researcher/planner.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & decisions
- `.planning/REQUIREMENTS.md` — TRN-01 definition (TRN-02 explicitly deferred)
- `.planning/ROADMAP.md` §Phase 52 — goal, 3 success criteria
- `.planning/PROJECT.md` — v2.0 decisions (M-08 transparency), standing
  constraints (zero new runtime deps, i18n gate)
- `.planning/phases/51-client-surfaces-permissions-page-removal-project-creation/51-CONTEXT.md`
  — D-51-17 (lead role — the view must surface it), D-51-4 (lost-visibility
  honesty), D-51-10..13 (settings layout after teardown)
- `.planning/phases/50-invite-hierarchy-per-project-toggles-server/50-CONTEXT.md`
  — D-50-5 (live team link — governs D-52-3/D-52-5)
- `.planning/phases/49-visibility-model-collapse-grant-materialization/49-CONTEXT.md`
  — one-funnel rule, D-49-3 (boolean `p.private`), the parity-test convention

### Milestone research
- `.planning/research/ARCHITECTURE.md` — adopted architecture, funnel completeness
- `.planning/research/PITFALLS.md` — 404-matrix-first rule, no-leak doors

### Domain docs
- `docs/WorkspacePermissions.md` — workspace roles; updated by the sweep (D-52-10)
- `docs/ProjectPermissions.md` — project-level model incl. lead (D-51-17); updated by the sweep

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `memberCanReadProject` (server.js:813) — the ONE member-level readable
  predicate; the transparency endpoint must call it per member×project
- `canSeeProject(p, memberId, memberTeams)` — sync core term (public ∨ access
  list ∵ linked team); its short-circuit order defines the first-reason rule
- `teamsOfMember(wsId, userId)` — live team ids for the reason 'Team: {name}'
- `canManageProject` — already lead-aware (`p.lead === memberId`, D-51-17)
- `hiddenFor` — the redacted-doc path; the parity test compares the endpoint
  list against its complement
- Members section in `src/pages/members.js` (perms table relocated there in
  Phase 51, D-51-13) — the expansion UI attaches here

### Established Patterns
- Funnel parity tests (Phase 49): endpoint list vs redacted-doc hidden set
- Phase 51 verify commands (`npm test`, `npm run i18n:scan`, `node --check …`)
  are the proven sweep commands — reuse verbatim (D-52-11)
- EN+FR i18n gate on every new string (D-52-7)

### Integration Points
- New admin-only server endpoint computing accessible projects + reasons for
  a member, calling `memberCanReadProject` per project
- Settings > Members page rows (expansion trigger, admin/owner-gated)
- `docs/WorkspacePermissions.md` / `docs/ProjectPermissions.md` (sweep refresh)

</code_context>

<specifics>
## Specific Ideas

- The view is diagnostic: admins should be able to see WHY, not just THAT
  (D-52-5) — but first reason only, no combination display (D-52-6)
- Live semantics throughout: refetch per open, live team reasons (D-52-3)

</specifics>

<deferred>
## Deferred Ideas

- TRN-02 — Members see their own (redacted) visibility view (v3; D-52-4
  locks the admin-only gate for this phase)

</deferred>

---

*Phase: 52-transparency-view-milestone-verification-sweep*
*Context gathered: 2026-11-08*
