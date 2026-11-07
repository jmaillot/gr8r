# Architecture Research — v2.0 Project-level Permissions & Invitations

**Domain:** Permission-model rewrite on an existing single-file Node server (document-store + authority-rows hybrid)
**Researched:** 2026-11-07
**Confidence:** HIGH (every claim below is grounded in the live code: server.js, mcp.js, mailer.js read this session)

## The one structural decision: where project membership lives

**Recommendation: project membership STAYS in the document (`p.members[]`), and visibility stays a pure doc predicate. Do NOT create a `project_members` authority table.**

Rationale, grounded in the existing architecture:

1. **Projects themselves live in the doc.** `data.projects[]` is a JSON array inside `workspaces.doc` (server.js `projectsOf`, `normalizeProjects` ~909-943). There is no project table to hang a join table off; a `project_members` authority row would reference a doc-resident project id with no FK, be denormalized against the doc on every write, and would force `mergeClientDoc` (which already restores access fields from storage, lines 1099-1116) to reconcile two sources of truth. That is a rewrite-shaped cost for zero behavioral gain.
2. **The v2.0 model is strictly a *simplification* of the existing predicate.** `canSeeProject` (server.js:758-761) — public ∨ on the access list — is already exactly M-05's semantics. The whole milestone is: *delete* the widening terms (`teamIntersects`, Phase 32; `scopeGrants`/D-03, Phase 29) and add two doc-carried toggles.
3. **Teams become an invitation mechanism, not a visibility source (M-03).** "Invite a team" = the server *expands* the team's members into `p.members` at invite time (a materialized snapshot). Later team joiners do **not** gain access — which is the owner-validated semantics and is only expressible if membership is the materialized list.

The corollary: **the scope columns on `memberships` (and `invites.scope`) retire entirely** — `projectScope`/`inScopeProject`/`scopeGrants`/D-03 are deleted, not deprecated. Under M-05 a guest (role `viewer`) sees non-private projects like anyone else plus their explicit invites; the "exactly one project" guest shape (Phase 29) is subsumed by `p.members`.

### What changes shape-wise

| Store | v1.7–v1.10 today | v2.0 |
|---|---|---|
| `workspaces.doc` → `data.projects[]` | `p.private`, `p.members[]`, `p.teams[]`, `p.perms`, `p.lead` | `p.private` (becomes THE toggle, dropdown retired), `p.members[]` (now also holds materialized team invitees), `p.teams` **retired** (or inert display-only), new `p.allowInviteGuests` boolean, `p.perms`, `p.lead` |
| `memberships` | `role`, `member_id`, `scope` text column (D-03) | `role`, `member_id` — `scope` becomes inert (never read) |
| `team_members` | authority rows; drive `teamsOfUser` → visibility | authority rows; drive rosters/pickers/mentions/invites only — **no visibility role** |
| `invites` | `role`, `team`, `teams` JSON, `scope` JSON | `role`, `teams` (kept as bulk-invite target list), new `project` column (target private project for project-scoped/guest invites), `scope` retired |
| New | — | **nothing** (no new table, no new column except `invites.project`) |

This preserves the standing constraints: zero new runtime dependencies, and the only migration is one additive `ensureColumn` (`invites.project`) plus a one-shot data sweep.

## Integration map — new vs modified, explicitly

### The funnel: `hiddenFor` / `redactDoc` / `mergeClientDoc` (MODIFIED — one choke point)

- **`hiddenFor(doc, membership)`** (server.js:872-902): collapse to the null-scope body only. The scoped branch (`inScopeProject` ∪ `scopeGrants`, lines 896-901) and the D-03 comment block are deleted. Inside the remaining branch, `memberCanReadProject` loses its team term. Result: hidden = private ∧ member ∉ `p.members`, for everyone below admin/owner (admins/owners already bypass via the `ROLE_RANK` gate at line 882 — keep that).
- **`memberCanReadProject(p, wsId, memberId, liveTeams)`** (server.js:786-794): body reduces to `canSeeProject(p, memberId) || roleIsAdmin`. The `liveTeams` parameter, the membership→user_id resolution and `teamIntersects` all disappear — it becomes synchronous and cheap. **Keep the same name and call sites** so the "one visibility pipeline" discipline (RETROSPECTIVE: "one helper, one funnel") survives the rewrite.
- **`redactDoc` / `mergeClientDoc`** (server.js:1020-1195): structurally untouched — they consume `hiddenFor` and nothing else. Two surgical edits in `mergeClientDoc`:
  1. the access-field pinning block (lines 1104-1110) gains `p.allowInviteGuests = prev.allowInviteGuests` alongside `private/members/perms/lead` — a non-manager's stale doc PUT can never flip the invite toggle (same "access fields belong to a manager" family);
  2. the **assigneeOutOfScope write guard** (lines 1176-1192) is deleted with `projectScope` — its replacement, if any (see Pitfall 2), must not resurrect a second pipeline.
- The client-side matcher in `src/lib/redaction.js` (SEARCH-01 hidden-terms matcher) is unaffected: it consumes whatever `hiddenProjectTerms` produces.

### `memberCanReadProject` consumers — each gets the simplified predicate for free

| Consumer | Location | Change |
|---|---|---|
| `hiddenFor` null-scope branch | server.js:882-893 | simplified automatically via the helper |
| Reminder pass | server.js:1370, 1487, 1606 | the `!projectScope(assigneeMembership) &&` prefix of each SCOPE-04 check is deleted; the `memberCanReadProject` term stays. Phase 38's exactly-once claim architecture is untouched |
| Email mirror (`queueNotifEmails`) | server.js:1296+ | same: drop the scope re-check term, keep the project re-check |
| Digest loop | server.js:1561-1590 | same three-check → one-check reduction; D-05 name-resolution-after-funnel order survives verbatim |
| MCP mirror `canReadProject` | mcp.js:177-189 | **must be edited in lockstep** — it is a documented duplicate ("Mirror of memberCanReadProject without the server import"), not an import. Delete the team-intersection term (line 188). Better: since the new predicate is sync and pure (`p.private ∧ !p.members.includes(mid)`), consider inlining it and noting the parity contract in the comment — but do not attempt an import; the single-file architecture keeps server.js/mcp.js decoupled on purpose |
| File-serve side door | byte-identical 404 (`fileNotFound`) | untouched — it already routes through the same funnel; the 404-matrix tests keep their shape, only team/scope cells change expectation |

### Invites (MODIFIED — the biggest behavior change)

- **Workspace invites**: unchanged route, but authorization changes per M-01/M-02/M-06: admin/owner invite admin/member/guest as today; a plain member may open the invite modal only where they hold the right — workspace-level guests invites are governed by the *target project's* `allowInviteGuests` when the invite is project-scoped. Concretely: a member's invite creation requires a `project` target, and the route checks `p.allowInviteGuests === true` (admins/owner bypass).
- **Team share (M-03)**: "invite team X to project P" is a server-side mutation that appends X's current members (user_id → member_id via the `memberships` map, since `p.members` is member_id-space and `team_members` is user_id-space — Pitfall 3) to `P.members`, then bumps the doc revision through the normal push path. It is NOT stored as `P.teams`; no lingering team reference means later team membership changes never alter visibility. The share modal renders the expansion result, so removal is per-person, matching M-02 (everything editable post-invite).
- **`invites.project`** (new nullable column): on accept, if set, the accepted member is appended to that project's `p.members` (in addition to the workspace role). The `invites.teams` column stays for admin workspace-level team invites; its *visibility* meaning is gone — at accept it only seeds `team_members` as today.
- **Post-invite editing (M-02)**: role changes already live in `memberships`; project membership edits are doc edits to `p.members` gated by `canManageProject` — which already exists (server.js:796-799) and needs no change. New: a member who was invited to a private project can be removed from it by any manager; `normalizeProjects`'s "private project must keep a manager and non-empty access list" safety net (lines 926-936) already prevents sealing a project shut.

### Settings > Permissions page (REMOVED) + the two toggles

- The workspace-level permission surface (Phase 29 member-modal scope editor) is deleted end-to-end: UI page, the admin PUT route that wrote `memberships.scope`, and the invite-form scope picker. `projectScope`'s fail-open warn set (`CORRUPT_SCOPE_WARNED`) goes with it.
- **Private/public toggle** replaces the access dropdown in the project settings/share modal — same `p.private` field, same `normalizeProjects` invariants, so redaction semantics are identical. The existing merge behavior "whoever restricts keeps access" (lines 1111-1115) is retained and is exactly the M-02 spirit.
- **`allowInviteGuests`** is a new doc field on the project: read by the invite-authorization route, pinned by `mergeClientDoc` (above), rendered in the share modal, default `false` (fail-closed).

### Transparency view (NEW — one new component)

A single server endpoint, e.g. `GET /api/workspaces/:slug/members/:memberId/visibility`, admin-only (or self-permitted — owner decision, flag it), computed **live through the funnel**: iterate `data.projects`, apply the (new, sync) `memberCanReadProject` per project for the target membership, return `{ public: [...], private: [...] }` plus team rosters. It must call the helper — never re-implement the predicate (the D-06 one-pipeline rule is the codebase's hardest-won lesson). Client renders a read-only table. No doc writes, no revision bump.

### Client store (MODIFIED, lightly)

The client keeps a full local doc and PUTs snapshots; because `mergeClientDoc` keeps its reserved-row semantics, the store needs: the visibility dropdown → toggle swap, share-modal team-invite expansion UI, removal of the Permissions page and guest toggle, and the transparency view route. No store-architecture change — redaction is and remains server-authoritative.

## Data Flow (after rewrite)

```
[Client doc PUT] → mergeClientDoc ─→ hiddenFor (sync, doc-predicate) ─→ reserved rows restored
                                     ↳ pin private/members/perms/lead/allowInviteGuests
[Doc GET]        → docForClient → redactDoc → hiddenFor → stripped doc
[Reminder/digest/email pass] → memberCanReadProject per (recipient, project) → send/omit
[MCP tool]       → canReadProject mirror (same predicate, no team term)
[Invite accept]  → memberships row + (invites.project → append p.members) → doc push
[Team share]     → expand team_members → append p.members → doc push (one revision)
[Transparency]   → memberCanReadProject × projects → read-only report
```

Note what vanished from the data flow: the per-request `teamsOfUser` lookup inside `hiddenFor` (one `db.all` per document read today) and the `scopeByMember` map in the write guard. Read paths get *faster and synchronous*.

## Migration path (the load-bearing part)

**Principle: grant materialization.** Every (member, project) pair visible under the old predicate must be visible under the new one. The boot sweep computes old-visibility and writes it into `p.members` *before* the new predicate takes effect — same guarded, additive, pre-backup, byte-identical-second-boot machinery as Phases 28/34:

1. **Pre-backup** (existing `vacuum into` pattern).
2. **Sweep, per workspace doc** (idempotent, one transaction per workspace):
   - For each private project `p`: for each team id in `p.teams[]`, append the member_id of every `team_members` row of that team (mapping user_id→member_id through `memberships`); likewise for each membership with a parseable `scope`, append scoped `projects[]` ids' members for that member and the member-ids of scoped teams for team-linked projects.
   - Set `p.allowInviteGuests` only where explicitly intended — default **absent** (undefined-falsy = false); do not backfill `true` anywhere.
   - `delete p.teams` (the teams-as-visibility data is now materialized; keep teams[] only if the UI still displays "shared with teams" history — recommendation: delete, the activity log carries history).
3. **Schema**: `ensureColumn('invites', 'project', ...)`. The `memberships.scope` and `invites.scope` columns are left in place but never read (the codebase precedent — `p.access`, `invites.team` — is retire-by-ignoring, not `ALTER TABLE DROP`); this keeps the pg schema/SQLite schema in lockstep and the migration additive.
4. **Byte-identical second boot**: the sweep must detect "already materialized" — the natural marker is `p.teams` absence (delete-on-sweep makes the second pass a no-op) plus a scope-column read that is simply gone from the code.
5. **Sequencing within the deploy**: predicate simplification and sweep MUST land in the same phase (one boot). If the predicate ships first, team-scoped members lose access until the sweep runs; if the sweep ships first, nothing breaks (pure widening). So the safe order is: sweep code + predicate code together, sweep executes first at boot.

**Lossless check for the migration test suite**: snapshot visibility sets for every (membership, project) under the old predicate on a fixture DB, run boot, assert set-equality under the new predicate — including the three edge fixtures: scoped-guest-on-private-project (D-03 canonical cell), team-only access, private project with empty members list (`normalizeProjects` un-seals it — that de-sealing must survive the sweep).

## Recommended build order (dependency-driven)

1. **Phase 1 — Predicate collapse + grant materialization migration** (atomic, as argued above). Everything else depends on the new `hiddenFor`/`memberCanReadProject` shape. Deliverables: simplified funnel, boot sweep, 404-matrix test updates (team/scope cells now expect hidden), migration test with visibility set-equality, MCP mirror updated in the same phase (it is part of the surface contract; shipping it later leaves a live over-permissive leak window — MCP would still honor team intersection the UI no longer does).
   *Flag: this phase carries the migration; it needs the deepest test investment.*
2. **Phase 2 — Invite authorization + the two toggles**. `invites.project` column, project-scoped guest invites with the `allowInviteGuests` gate, strict hierarchy checks (M-01), post-invite edit routes (M-02), team-share expansion endpoint (M-03), removal of the scope-writing admin route. Depends on Phase 1 (guest semantics no longer rely on scope columns).
3. **Phase 3 — Removal surfaces + client**: Settings > Permissions page deleted end-to-end, private/public toggle swap, share modal (team bulk invite + guest toggle), client store adjustments. Depends on Phase 2's routes. i18n gate (EN+FR, `scripts/i18n-scan.mjs`) applies from this phase onward — batch all new strings here and in Phase 4.
4. **Phase 4 — Transparency view + consumers verification sweep**: the visibility endpoint + UI; then a verification pass over reminder pass / email mirror / digest asserting the scope-check deletions and re-running the no-leak fixtures (Phase 38's digest leak class, v1.8 CR-01). Could fold into Phase 1-3, but keeping it last gives one clean UAT surface per consumer.
   *Actually split:* the consumer code edits (deleting scope prefixes) belong in **Phase 1** (they cannot compile against a deleted `projectScope`); Phase 4 is verification + transparency only.

Revised: **Phase 1 = predicate + migration + consumer edits + MCP mirror; Phase 2 = invites/toggles/hierarchy; Phase 3 = client surfaces + Permissions-page removal + i18n; Phase 4 = transparency view + cross-consumer verification (reminder/digest/email/MCP no-leak matrix).**

## Pitfalls

### Pitfall 1 — Splitting the sweep from the predicate change (CRITICAL)
Shipped separately, one boot serves docs under the wrong rule: predicate-first locks team-scoped members out; sweep-first alone is safe but useless without the new rule. **Same phase, same boot, sweep before predicate takes effect.**

### Pitfall 2 — Deleting the assigneeOutOfScope guard removes a real invariant
Today a doc PUT cannot assign a member to a task in a project they cannot see (server.js:1183-1191). With scope gone, the analogous invariant is "assignee can read the project" — under the new model a member sees all public projects anyway, so the guard is *mostly* subsumed, but a private project with an assignee later removed from `p.members` leaves an orphaned assignment (reminder pass already skips those sends — line 1487 — so the residual risk is a stale assignee chip). Recommendation: keep a cheap guard reusing `canSeeProject`, or accept and document; do not leave the throw half-deleted.

### Pitfall 3 — user_id vs member_id in the team expansion
`p.members` is member_id-space; `team_members` is user_id-space keyed (server.js:789-791 comment). The expansion MUST map through `memberships`, and members without an account-backed membership row (doc-only profiles) cannot be team members anyway — skip silently, assert in tests.

### Pitfall 4 — MCP mirror drift
`mcp.js canReadProject` is a deliberate copy. If Phase 1 edits server.js and forgets mcp.js, MCP keeps honoring team intersection → a live over-permissive surface with no UI to notice. Pin it with a parity test (same fixture doc, same member, both predicates must agree).

### Pitfall 5 — `invites.teams` semantics silently changing
The column persists; its *effect* changes from "team visibility via scope/teams columns" to "seed team_members only". Any code path at accept-time that previously propagated invite scope into `memberships.scope` must be deleted, not orphaned, or a stale invite resurrects a scope row the new code ignores — harmless at runtime but confusing and it breaks the byte-identical-boot invariant on later reads.

## Anti-Patterns

- **A `project_members` authority table** — dual source of truth against doc-resident projects; reconciliation logic in every write path for zero behavioral gain.
- **Keeping `project.teams` as a display-only visibility hint** — any surviving read of `p.teams` in a predicate is the old model leaking back in. Materialize and delete.
- **A second transparency computation** in the client — the view must be server-computed through the funnel; a client-side reimplementation of visibility over the (redacted!) local doc is definitionally wrong — the client cannot see what it cannot see.

## Sources

- `server.js` (read this session): `canSeeProject` 751-761, `teamIntersects` 773-775, `memberCanReadProject` 786-794, `projectScope`/`inScopeProject`/`scopeGrants` 813-870, `hiddenFor` 872-902, `normalizeProjects` 909-943, `redactDoc` 1020-1045, `mergeClientDoc` 1082-1195, reminder/digest scope checks 1370/1487/1561-1590/1606, `docForClient` 1675-1685, `docFromClient` 1725-1810, `teamsOfUser` 1829-1833, schema 270-312
- `mcp.js`: `canReadProject` mirror 177-189, `visibleProjects`/`readableProjectIds` 194-215
- `mailer.js:696`, reminder/digest consumers, `docs/ProjectPermissions.md` (FR summary of the funnel)
- `.planning/PROJECT.md` (M-01..M-08 decisions, standing constraints), `.planning/RETROSPECTIVE.md` ("one helper, one funnel" rule)
