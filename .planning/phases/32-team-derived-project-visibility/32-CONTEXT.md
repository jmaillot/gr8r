# Phase 32: Team-Derived Project Visibility - Context

**Gathered:** 2026-11-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Visibility derivation widens from scoped-members-only to every non-guest member: a project
is readable iff `project.teams ∩ member.teams ≠ ∅` OR the project has no teams (workspace-wide
for public; access-list-gated for private) OR an explicit Phase-29 scope grants access OR the
existing access-list/public rules (kept as additive disjuncts). The derivation rides the single
`hiddenFor()` funnel with one shared team-intersect helper also consumed by send-time surfaces
(reminder pass, email mirror). Requirements VIS-01..VIS-05 (see REQUIREMENTS.md). No new
capabilities — pure visibility-semantics extension of the Phase-29 machinery.
</domain>

<decisions>
## Implementation Decisions

### Access-list fate
- **D-01:** The per-project access list (`p.members`) survives as an additive disjunct in the
  visibility predicate: readable ⟺ team-intersect ∨ no-teams(public) ∨ access-list ∨ public ∨
  scope-grant. Nobody loses access they have today.
- **D-02:** Legacy private projects relying on access lists behave identically after VIS —
  read semantics change only additively via team intersection. No migration, no UI nudge.

### Predicate shape
- **D-03:** The member-team intersect term lives in `hiddenFor`'s null-scope branch
  (`hiddenProjectIds` gains a team complement). The Phase-29 scoped branch
  (`inScopeProject ∧ scopeGrants`, server.js:698-739) stays byte-for-byte untouched —
  lowest regression risk against the 981-line `test/scope.test.mjs` pins.
  — **Reversibility:** reversible — additive disjunct in one branch; scoped-machinery untouched.
- **D-04:** One named shared helper (e.g. `teamIntersects(p, memberId)`) is consumed by
  `hiddenFor`'s null-scope branch AND the send-time surfaces (reminder pass, email mirror) per
  VIS-04 — no second visibility pipeline (roadmap invariant).
- **D-05:** The member's team set is read live from the `team_members` authority rows at
  predicate time — consistent with the v1.6 decision that membership lives only in authority
  rows; roster changes take effect immediately. No per-request caching.

### Private + no-teams (JIT-pinned edge)
- **D-06:** Predicate order for a non-scoped member: empty-teams first branch (public ⇒
  workspace-wide; private ⇒ still gated by its access list — NOT leaked workspace-wide), then
  team-intersect opens private team-linked projects, admin exemption on top. Pinned by
  JIT zero-team-account fixtures per Success Criterion 2.

### 404-matrix extent
- **D-07:** Extend the named MATRIX sweep in `test/scope.test.mjs` with team-derivation cells
  across every endpoint family it already covers (doc GET, project CRUD, tasks, comments,
  files) — not just the doc GET family.
- **D-08:** The `serveFileBinary` `normalizeProjects` gap (29-REVIEW finding: file side door
  skips normalization, so legacy scalar-`team` projects can 404 on files while visible in the
  doc) is folded INTO this phase — the file side door must agree with the doc read under the
  new predicate.

### the agent's Discretion
- Exact helper naming/signature (`teamIntersects` is a suggestion, not a contract).
- Fixture organization within the existing MATRIX structure.
- How send-time surfaces obtain the member's team set (same live authority-row query via the
  shared helper is the default).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & requirements
- `.planning/ROADMAP.md` §Phase 32 — Goal, Success Criteria 1-5 (404 byte-identical bodies,
  empty-teams predicate, D-03 survival, guest lock, send-time reach)
- `.planning/REQUIREMENTS.md` §VIS — VIS-01..VIS-05 requirement text

### Prior-phase decisions (binding)
- `.planning/milestones/v1.6-phases/29-team-project-scoped-permissions/29-02-SUMMARY.md` —
  D-03 grant inversion semantics, hiddenFor composition, truth-table cells
- `.planning/milestones/v1.6-phases/29-team-project-scoped-permissions/29-REVIEW.md` —
  the `serveFileBinary` normalizeProjects gap (D-08 folds it in)
- `.planning/STATE.md` §Accumulated Context — Phase-29 decisions 29-01..29-03

### Research
- `.planning/research/ARCHITECTURE.md` — funnel lines (:705-739), scoped-branch team-intersect
  note, VIS risk analysis (§193: conjunctive rewrite would break D-03)
- `.planning/research/FEATURES.md` §VIS — ride-the-one-funnel guidance, admin wildcard note
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `hiddenFor(doc, membership)` (server.js:730) — the single funnel; null-scope branch is where
  the team term lands (D-03)
- `inScopeProject` / `scopeGrants` (server.js:698, :722) — Phase-29 scoped machinery, to remain
  untouched
- `normalizeProjects` (server.js:746) — legacy scalar-`team` → `teams[]` migration; must be
  applied in `serveFileBinary` path (D-08)
- `test/scope.test.mjs` MATRIX — the named 404 sweep to extend (D-07)
- `test/migration.test.mjs` — home for byte-identical-boot pins if fixtures need them

### Established Patterns
- Additive union of hidden sets (never conjunctive composition) — 29-01
- Send-time-only enforcement for reminder pass / email mirror — 29-03
- 404 no-oracle: byte-identical `notFound`/`fileNotFound` bodies on every project-touching
  endpoint
- Membership authority in `team_members` rows only; doc `teams[].members` is display projection

### Integration Points
- `redactDoc` and `mergeClientDoc` both consume `hiddenFor` — writes are protected by the same
  predicate automatically
- Reminder pass and email mirror call sites (send-time guards from Phase 29) — swap their
  visibility resolution to the shared team-intersect helper
- Guest single-project gate (server.js:4180-4196) — must stay untouched; team derivation never
  widens guest reach (VIS-03)
</code_context>

<specifics>
## Specific Ideas

- The scoped-member branch must remain byte-for-byte identical to what Phase 29 shipped —
  regression risk containment was the deciding factor for the null-scope-branch placement.
- Empty-teams private projects must not leak: "no teams" ≠ "no restrictions" for private work.
</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.
</deferred>

---

*Phase: 32-Team-Derived Project Visibility*
*Context gathered: 2026-11-02*
