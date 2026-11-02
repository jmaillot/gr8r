# Phase 28: Multi-Team Membership - Context

**Gathered:** 2026-11-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Team membership becomes a real set of authority rows (`teams` + `team_members` join table),
migrated additively from the scalar `memberships.team` column. Every surface — rosters,
assignment/mention autocompletes, @team mentions, project `teams[]` visibility — reads the
set. Membership data leaves the client-mergeable workspace document entirely (TEAM-05).
No per-team roles (role ladder unchanged). Phase 29 (scoped permissions) consumes the
`team_members` team set this phase establishes.

</domain>

<decisions>
## Implementation Decisions

### Membership edit path (architecture)
- **D-01:** Team membership is edited through **new server API routes** (admin-gated,
  e.g. add/remove a membership-team row). The teams modal and members page call the API;
  the workspace document never carries membership. **Reversibility:** costly — removes
  `syncMemberTeams()` and the doc's `teams[].members` arrays entirely; every roster-read
  surface moves to the new authority, so backing this out means rebuilding the doc-diff
  pipeline across server and client.
- **D-02:** `doc.teams[].members` arrays are dropped from the document; `syncMemberTeams()`
  (server.js:1019) is deleted. Team definitions (id, name, color) stay in the doc;
  only membership rows move out. — **Reversibility:** costly — TEAM-05's regression test
  pins membership out of the doc; undoing re-introduces the clobber hazard the test forbids.

### Migration semantics
- **D-03:** `memberships.team` is the migration source of truth: one `team_members` row per
  member whose scalar team is set. Doc `teams[].members` lists are ignored and dropped.
  Members with `team = null` get no rows — teamless is a valid state. — **Reversibility:**
  one-way — the doc member lists are deleted at migration; a different source-of-truth
  choice later would need a new migration from surviving data only.
- **D-04:** After migration, the scalar `memberships.team` column stays in the schema
  (additive-only discipline) but nothing reads or writes it. No "primary team" concept is
  introduced anywhere.

### Roster UI
- **D-05:** Team membership is editable from **both** the teams modal (multi-select per
  member, replacing the single-team assignment) and the members page.
- **D-06:** On the members page, team editing lives in the **existing member edit modal**,
  which gains a multi-select team picker next to role — reusing the existing modal and
  catalogue strings (EN+FR), not inline table checkboxes.

### Invite flow
- **D-07:** Invites support **multiple teams at once**: `invites.team` becomes
  `invites.teams` (JSON array), the invite form offers multi-select, and acceptance inserts
  one `team_members` row per team. — **Reversibility:** reversible — column add is additive;
  backfill from scalar is part of the migration.

### the agent's Discretion
- Exact API route naming/shape for membership edits (planner + codebase conventions).
- Server-side resolution mechanics for @team fan-out and assignment-intersection filtering
  (researcher identifies exact call sites: currently client-side at `src/actions/actions.js:143`).
- Migration test specifics beyond the pinned `test/migration.test.mjs` byte-identical boot.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — TEAM-01..TEAM-05 define this phase's requirements verbatim
- `.planning/ROADMAP.md` §Phase 28 — success criteria (dual-roster visibility, mention dedup,
  assignment intersection, doc-write survival regression, byte-identical boot)
- `.planning/PROJECT.md` — v1.6 constraints (zero runtime deps, additive migrations) and
  milestone invariants (EN+FR catalogue)

### Cross-phase
- `.planning/ROADMAP.md` §Phase 29 — consumes `team_members`; scope predicate will run over
  this phase's team set. Schema shape chosen here constrains Phase 29.
- `.planning/ROADMAP.md` (header note) — the OIDC identity-column schema decision is settled
  during Phase 28 **planning** (columns land with SSO in Phase 30, research Pitfall 5).
  Flag for the planner, not decided in this discussion.

### Code (authority sites to change)
- `server.js` — `memberships` schema (lines 156–164), `syncMemberTeams()` (line 1019),
  `addMembership()` (line 1788), doc teams handling (lines 544–551, 1214, 1750),
  pre-migration backup pattern (`vacuum into`, line 1365), `ensureColumn()` additive
  migration pattern (line 223)
- `src/core/store.js` — `teamsList()`/`team()` doc accessors (lines 368–394)
- `src/actions/teams.js` — teams modal actions (edits `d.teams[].members` directly today)
- `src/actions/actions.js` — @team mention fan-out (line 143, client-side `m.team === tid`),
  invite flow (lines 1874, 2057), project form team prefill (line 1425)
- `src/data/seed.js` — seed teams and member `teams` arrays to align with new authority

No external specs/ADRs — requirements fully captured in REQUIREMENTS.md and decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Pre-migration backup pattern: `vacuum into '<file>'` with timestamped name under `DATA_DIR`
  (server.js:1365) — reuse verbatim for the team_members migration backup.
- `ensureColumn()` additive-migration helper (server.js:223) — established pattern; note the
  join-table migration needs `create table if not exists` in SCHEMA + row backfill instead.
- Projects already multi-team: `project.teams[]` normalization (P3, server.js:544 and
  store.js:180) — member-side migration can mirror this additive shape.
- Member edit modal + teams modal exist with catalogue strings — extend, don't rebuild.
- Notification system has per-recipient rows with dedup — mention fan-out dedup (TEAM-03)
  rides the existing Set-based targeting.

### Established Patterns
- Authority-rows-not-doc: memberships, invites, sessions all live in tables; the doc is
  rebuilt on read (`syncProfiles`). This phase completes that pattern for teams.
- Additive-only, byte-identical-second-boot migrations pinned in `test/migration.test.mjs`.
- Role gating via `ROLE_RANK` (server.js:1020) — new membership API routes gate the same way.
- Zero runtime dependencies — join-table work is pure `node:sqlite`.

### Integration Points
- Invite acceptance (`server.js:3163` `addMembership`) — gains team_members row insertion.
- `docForClient`/`syncProfiles` — stop mirroring scalar team into doc members.
- Assignment picker & mention autocomplete — read team set via server-provided membership
  data instead of `m.team` scalar.
- Project visibility `teams[]` intersection (TEAM-04) — compare against `team_members` set.

</code_context>

<specifics>
## Specific Ideas

- Teams modal keeps its identity as the team-centric view but each member row becomes
  multi-select across all teams (replacing single-team assignment).
- The members page edit modal is the person-centric mirror: same data, same API, one form.

</specifics>

<deferred>
## Deferred Ideas

- Per-team roles / per-membership permission levels — explicitly excluded by TEAM-01 (role
  ladder stays the ceiling). Phase 29 adds *scope* (reach restriction), not elevation.

None otherwise — discussion stayed within phase scope.

</deferred>

---

*Phase: 28-Multi-Team Membership*
*Context gathered: 2026-11-01*
