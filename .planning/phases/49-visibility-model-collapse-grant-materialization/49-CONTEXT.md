# Phase 49: Visibility model collapse & grant materialization - Context

**Gathered:** 2026-11-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Access is decided solely by a project's `p.private` flag plus explicit membership
(`p.members`). A one-boot migration materializes every existing access path
(team intersections, Phase-29 scope grants) into `p.members` **before** the
collapsed predicate takes effect — no member gains or loses visibility in the
swap. The MCP mirror (`mcp.js`) is rewritten in lockstep in the same phase — no
over-permissive window. All send-time consumers (reminder pass, email mirror,
digest) route through the same `memberCanReadProject` helper.

The private/public toggle **UI** is Phase 51; invite hierarchy and per-project
toggles are Phase 50. This phase is server-side predicate + migration + parity.

</domain>

<decisions>
## Implementation Decisions

### Scope-column disposition (D2.0-2, refines MIG-02)
- **D-49-1:** Convert-and-clear — the boot sweep materializes every
  scope-derived access grant into `p.members`, then sets both
  `memberships.scope` and `invites.scope` to **NULL**. Schema untouched (no
  column drop, no ensureColumn removal, no pg drift). — **Reversibility:**
  one-way — the scope JSON is erased at sweep time; re-derivation after the
  boot is impossible (accepted: old visibility is exactly reproducible at
  sweep time, so nothing after the boot needs it).
- **D-49-2:** After the one boot, **no code path may ever read or honor a
  scope column again.** MIG-02's "dormant on disk, ignored by code" is
  refined to "cleared on disk, ignored by code"; the MIG-02 proof is the
  per-member × per-project set-equality fixture, not column retention.

### Visibility field representation
- **D-49-3:** `p.private` stays a **boolean** — no enum migration.
  `projectIsPrivate()`, `normalizeProjects` invariants, `redactDoc`,
  `mergeClientDoc` and the MCP mirror keep their exact shape; the smallest
  possible diff in the deepest-migration phase. The 'public'|'private' enum
  (and any future 'unlisted') is not pursued.
- **D-49-4:** The legacy `p.access === 'private'` fallback is retired — the
  sweep normalizes legacy `p.access` documents to the boolean, removing the
  dual representation. Behavior is identical either way (`projectIsPrivate`
  already honors both); this is dead-code removal, not a behavior change.

### `p.teams[]` fate after the sweep
- **D-49-5:** The sweep **deletes `p.teams` from every project document.**
  Team-share history lives in the activity log. No inert/display-only
  remnant.
- **D-49-6:** `p.teams` absence **is** the "already materialized" second-boot
  marker, pinned by an explicit boot check (or test pin): a fully-swept
  workspace (all projects lack `p.teams`, all scope columns NULL) is
  untouched byte-for-byte on second boot, on both SQLite and pg.

### D-03 legacy grant conversion
- **D-49-7:** Materialize **all** grants — every (member, project) pair
  visible under the OLD predicate, including scope-grant-only pairs (the
  D-03 inversion) and team-intersection pairs, gets an explicit `p.members`
  entry. Roles are untouched (a guest stays a guest). Nobody loses access;
  admins can remove entries later via the Phase 50/51 surfaces. This is the
  exact reading of success criterion 1 (set-equality) — no exceptions.
- **D-49-8:** The sweep explicitly **preserves the sealed shape** of private
  projects with empty members: materialization must not trigger the
  `normalizeProjects` un-sealing of an empty-members private project, and a
  private project with no grants and no teams/scope keeps its sealed
  empty-members shape. (The known de-sealing edge from the research.)

### Agent's Discretion
- Call-site census, fixture matrix design, sweep ordering mechanics, MCP
  mirror shape (keep the mirror function vs inline the now-sync predicate —
  ARCHITECTURE.md leans inline-but-no-import), seed.js fixture cleanup:
  technical territory for researcher/planner.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone research (primary)
- `.planning/research/ARCHITECTURE.md` — the adopted architecture: doc-resident
  `p.members`, grant-materialization principle (§Phase-1 build), sweep
  sequencing rules, call-site table for the funnel, Pitfall 1/2
- `.planning/research/PITFALLS.md` — 404-matrix-first rule (actor × project
  shape table BEFORE implementation), D-xx decision-id requirement, migration
  test pitfalls
- `.planning/research/SUMMARY.md` — resolved storage disagreement, edge
  fixtures list, phase-1 risk notes

### Requirements & decisions
- `.planning/REQUIREMENTS.md` — MIG-01..03, VIS-02, VIS-03 definitions;
  M-01..M-08 owner decisions; D2.0-1..4 rulings
- `.planning/PROJECT.md` — v2.0 milestone decisions (M-05, M-03), standing
  constraints (zero new runtime deps, dual backend, i18n gate, Phase 38
  invariants)
- `.planning/ROADMAP.md` §Phase 49 — goal, success criteria 1-5, research note

### Domain docs
- `docs/ProjectPermissions.md` — current permission/visibility model
  documentation (must be updated by this phase or its successors)
- `docs/WorkspacePermissions.md` — workspace-level roles referenced by the
  predicate (admin/owner exemptions)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `memberCanReadProject()` (server.js:786) — THE shared predicate; collapse
  happens inside it and its callers stay intact
- `projectIsPrivate()` (server.js:751) / `canSeeProject()` (server.js:758) —
  survive byte-identical per D-49-3 (minus the `p.access` fallback)
- `hiddenFor()` (server.js:872) — the one hidden-project funnel; scoped branch
  (`projectScope`/`inScopeProject`/`scopeGrants`) is the deletion target
- Phase 28/34 guarded boot-migration machinery (pre-backup, guarded,
  transactional, byte-identical second boot) — the sweep's template
- `normalizeProjects()` (server.js:909) — access normalization invariants the
  sweep must cooperate with (D-49-8)

### Established Patterns
- Additive migration with pre-migration backup; "no backup = no mutation";
  second boot byte-identical (migrateTenancy precedent, server.js:2276)
- Document redaction on read (`redactDoc`) + merge protection on write
  (`mergeClientDoc`) — unchanged by the predicate collapse
- Byte-identical 404 (`fileNotFound`) — no existence oracle; 404-matrix test
  per endpoint family (Phase 29/32 pattern to extend before implementation)

### Integration Points
- Send-time consumers reading the same predicate: reminder pass
  (server.js ~1469-1487, 1605-1606), email mirror (~1357-1370), digest
  (Phase 38 invariants must pass unmodified)
- MCP mirror `canReadProject` (mcp.js:177-189) — documented duplicate; team
  term (line 188) dies in the same phase (Pitfall 2)
- `teamIntersects()` (server.js:773) and `teamsOfUser()` — deletion targets
  once the sweep lands
- db-adapter.mjs async facade — all sweep SQL must be portable SQLite+pg
  (text ids, integer epochs, run() returns exactly { changes })

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Owner consistently
chose the minimal-diff option in every area (boolean field, delete-and-marker,
materialize-all), i.e. the phase should be a deletion-driven simplification
with the sweep carrying the entire behavioral change.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 49-Visibility model collapse & grant materialization*
*Context gathered: 2026-11-07*
