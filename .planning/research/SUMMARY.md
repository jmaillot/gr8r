# Project Research Summary

**Project:** Projects Studio — v2.0 "Project-level Permissions & Invitations"
**Domain:** Permission-model rewrite on an existing single-file Node server (document-store + authority-rows hybrid)
**Researched:** 2026-11-07
**Confidence:** HIGH

## Executive Summary

Projects Studio is a self-hosted, zero-dependency multi-tenant PM workspace with a hard-won architectural doctrine: **one visibility predicate (`memberCanReadProject`), one redaction funnel (`hiddenFor`), byte-identical 404s, guarded additive migrations, one helper one pipeline**. The competitor survey (Linear, OpenProject, Taiga, Wekan, Height) confirms that v2.0's direction — binary private/public per project, teams as bulk-invite mechanism instead of implicit visibility, one guest concept — is exactly the industry's converged model. The milestone is a *simplification*: the rewrite deletes widening terms (team-intersection, D-03 scope grants) from the predicate and adds two doc-carried toggles. No new runtime dependencies are needed.

**Storage decision resolved (STACK vs ARCHITECTURE disagreement):** keep project membership **doc-resident** (`p.members[]` on the project object in `workspaces.doc`) with a **grant-materialization boot sweep** — do NOT create a `project_members` authority table. Rationale: projects themselves are doc-resident with optimistic-revision concurrency, so a join table would reference doc ids with no FK, be denormalized against the doc on every write, and force `mergeClientDoc` to reconcile two sources of truth — a rewrite-shaped cost for zero behavioral gain. The `team_members` precedent doesn't transfer: teams moved to authority rows because they had no doc home; project access lists already do. Team invites (M-03) become *server-side expansion* of the team roster into `p.members` at invite time (snapshot semantics, owner-validated), and the boot sweep materializes all old-team/scope-derived access into `p.members` before the new predicate takes effect. STACK's migration machinery, schema columns (`invites.project`, `memberships.status`), and migration-test strategy are adopted unchanged — only the fan-out *target* changes from table rows to doc arrays. The transparency view (M-08) must call the funnel helper anyway (one-pipeline rule), so the "SQL-queryable transparency" argument for the table is moot.

Key risks are migration-shaped, not model-shaped: (1) the sweep and the predicate change MUST land in the same boot (predicate-first locks team members out; sweep-first is safe); (2) the MCP permission mirror (`mcp.js`) is a deliberate copy that must be edited in lockstep or it silently stays over-permissive; (3) half-dead scope/teams data must be converged, not merely ignored; (4) invites created pre-swap and accepted post-swap must re-derive at accept time, fail-closed. All are covered by the codebase's proven patterns (Phase-28 guarded backfill, HARD-01..05 fail-closed twins, 404-matrix, dual-backend test matrix).

## Key Findings

### Recommended Stack (STACK.md — adjusted for the storage resolution)

Zero new libraries, zero new tables. The existing stack suffices entirely.

**Core technologies (unchanged):**
- `node:sqlite` via `db-adapter.mjs` — the model is pure CRUD over ids; adapter's `get/all/run/tx` covers everything
- `pg` (only runtime dep) — all schema changes stay portable: `text` ids, `integer` epochs, no `collate nocase`
- `ensureColumn` + guarded boot sweeps — the only migration machinery needed
- `hiddenFor()` / `memberCanReadProject()` funnels — the new model *deletes* code; single-funnel discipline pays off

**Schema changes (the deliverable):**
- `ensureColumn('invites', 'project', 'text')` — target private project for project-scoped/guest invites
- `ensureColumn('memberships', 'status', 'text')` — M-02 editable status (nullable = active)
- Doc fields on `projects[]`: `p.private` becomes THE visibility toggle (dropdown retired;STACK's `'public'|'private'` enum is a fine variant — owner picks one, both are one-sweep changes), new `p.allowInviteGuests` / `p.members_may_invite_guests` boolean, `p.teams[]` swept away
- `redactDoc()`/`mergeClientDoc()` restore-and-protect lists extended: the new toggle must be pinned alongside `private/members/perms/lead`
- `invites.scope` / `memberships.scope` become legacy-never-read (D-04 retire-by-ignoring precedent)
- ~~`project_members` table~~ — **rejected**, see Executive Summary

### Expected Features (FEATURES.md)

**Must have (table stakes — all P1):**
- M-05 binary private/public project toggle + funnel rewrite — the model everything reads
- M-03 team invite via share modal (bulk grant, snapshot semantics) — required *before* killing team visibility or members lose access silently
- M-01 strict invitation hierarchy (owner-only owner promotion) + M-02 post-invite editing — same routes, one phase
- M-04 single guest concept (delete "Invité externe" toggle)
- M-06 per-project "members may invite guests" toggle + Settings > Permissions page removal

**Should have (differentiator):**
- M-08 member-visibility transparency view — no surveyed tool offers it; highest trust payoff. Helper-first: extract the "explain member visibility" helper during the funnel phase, UI is a thin consumer
- "Explain this access" reason chips reusing the M-08 helper

**Defer (post-milestone):**
- Re-sync team affordance for snapshot-granted teams
- MCP member-visible-projects tool
- Custom per-project roles / permission matrices — no demand, huge surface
- Anonymous/link sharing — breaks tenancy model, anti-feature

**Cross-tool synthesis that matters:** binary visibility + explicit membership is the dominant model; who-can-invite is a permission not a page; post-invite editing is universal and immediate; guests = lowest role with project-scoped reach. M-03 requires the snapshot-storage decision (recommendation (a): materialize per-member, with re-sync affordance post-milestone).

### Architecture Approach (ARCHITECTURE.md — adopted as primary)

Membership stays in the document; visibility stays a pure doc predicate. The whole milestone collapses `memberCanReadProject` to `canSeeProject(p, memberId) || roleIsAdmin` — synchronous, cheap, one choke point.

**Major components:**
1. **The funnel** (`hiddenFor` → `memberCanReadProject` → `redactDoc`/`mergeClientDoc`) — rewritten in place; scoped branch deleted; consumers (reminder pass, digest, email mirror) get the simplification for free by keeping their call sites
2. **Invite routes** — `invites.project` column, accept-time membership append, team-share expansion endpoint (maps user_id→member_id through `memberships` — space mismatch gotcha), strict hierarchy at create AND edit AND accept
3. **Transparency view** — one server endpoint, computed live through the funnel (never client-side: the redacted client doc cannot know what the member sees); read-only, no doc writes
4. **Client surfaces** — toggle swap, share-modal team invite, Permissions-page deletion, i18n EN+FR gate

### Critical Pitfalls (PITFALLS.md)

1. **Sweep split from predicate change (CRITICAL)** — same phase, same boot, sweep executes before the new predicate takes effect. Safer order: sweep-then-predicate (pure widening) never loses access.
2. **Orphaned access paths / MCP mirror drift** — exhaustive call-site census first (`memberCanReadProject`, `hiddenFor`, `projectScope`, `inScopeProject`, `redactDoc`, `mergeClientDoc`), committed to the phase plan; mcp.js updated in the SAME phase as the funnel (shipping it later leaves a live over-permissive window); parity test pins both copies.
3. **Half-dead scope/teams data** — "replace the model" means predicate AND stored state converge; needs a named owner-validated decision (D-xx) before the migration phase plans.
4. **Invites in flight** — accept-time re-derivation under the new model, fail-closed (410, HARD twins); interleaving test: create → migrate → accept.
5. **404-matrix tautology** — extend the matrix with new (actor × project) shapes BEFORE implementation; expected values independent of the code under test; per-MCP-tool rows for read/list tools; body-byte equality not status codes.

Also load-bearing: user_id vs member_id space mismatch in team expansion (map through `memberships`); client staleness (visibility epoch bump + refetch, localized not-found for ghost projects); Phase 37/38 scheduler invariants must pass unmodified; multi-backend (SQLite + pg) for every migration/sweep/concurrency test; i18n EN+FR for all new strings.

## Implications for Roadmap

Based on research, suggested phase structure (follows ARCHITECTURE.md's dependency-driven build order, cross-checked against FEATURES.md dependencies and PITFALLS.md phase mapping):

### Phase 1: Predicate collapse + grant-materialization migration
**Rationale:** Everything else depends on the new funnel shape. Atomic because splitting sweep from predicate is the #1 critical pitfall.
**Delivers:** Simplified `memberCanReadProject`/`hiddenFor` (team + scope terms deleted), boot sweep (private flag → visibility; `p.teams` ∩ `team_members` and parseable scopes → materialized into `p.members`, then delete `p.teams`), consumer edits in the same phase (scope prefixes deleted from reminder/digest/email — they can't compile against a deleted `projectScope`), MCP mirror updated in lockstep, `invites.project` ensureColumn, scope-column retirement (read-never).
**Addresses:** M-05 model core, M-03 precondition.
**Avoids:** Pitfalls 1, 2, 4, 7 (migration + funnel + interleaving land together).
**Test investment (deepest of the milestone):** 404-matrix extension written BEFORE code, visibility set-equality fixtures (old predicate visible set == new predicate visible set, incl. scoped-guest/private, team-only access, empty-members private project de-sealing), byte-identical second boot on SQLite AND pg, MCP parity test, Phase 37/38 canaries green unmodified.

### Phase 2: Invite authorization + the two toggles
**Rationale:** Guest semantics must no longer rely on scope columns before invite routes change.
**Delivers:** Strict hierarchy (M-01) enforced at create/edit/accept, post-invite editing routes (M-02), team-share expansion endpoint (M-03 snapshot semantics), per-project `allowInviteGuests` gate with admins/owner bypass (M-06 server-side), removal of the scope-writing admin route, mergeClientDoc pinning of the new toggle, `memberships.status` ensureColumn, guest-state boot validator (zero-project guest flagged loudly).
**Addresses:** M-01, M-02, M-03, M-06 (server), M-04 server-side.
**Avoids:** Pitfall 3 (guest collapse), toggle-default ambiguity (owner decision on default false fail-closed vs true preserves-today — recommend **false/fail-closed** but it's an owner decision to log as D-xx), stale-invite resurrection.

### Phase 3: Client surfaces + Permissions-page removal + i18n
**Rationale:** Depends on Phase 2's routes; all user-visible change batched with the i18n gate.
**Delivers:** Private/public toggle swap (replaces access dropdown), share modal team picker with expansion UI and copy reflecting invite semantics, guest-toggle deletion (`modal.guestToggle` EN+FR), Settings > Permissions page deleted end-to-end (permsTable relocated under Members as documentation — decide), visibility-epoch bump + client refetch + localized not-found for ghosts, removed-key sweep (i18n-scan catches new orphans, not removed pages — add a leak check).
**Addresses:** M-04, M-05/M-06 UI, M-07 workspace setting (restrict project creation to admins — independent, cheap, can ride here).
**Avoids:** Pitfall 5 (client staleness), UX pitfalls (silent access loss explained via migration report).

### Phase 4: Transparency view + cross-consumer verification sweep
**Rationale:** The oracle must read the NEW model; building it early is throwaway. Keeping verification last gives one clean UAT surface.
**Delivers:** `GET /members/:memberId/visibility` endpoint (server-computed via `memberCanReadProject`, admin-only or self-permitted — owner decision), UI panel with reason chips + hidden-count-only, full no-leak verification pass over reminder/digest/email/MCP.
**Addresses:** M-08, milestone-wide "looks done but isn't" checklist.
**Avoids:** Pitfall 1 (consumer re-verification), Pitfall 5 (lying transparency view), Pitfall 6 (matrix-tautology regression re-check).

### Phase Ordering Rationale

- **Phase 1 first and atomic:** the funnel is the choke point every consumer reads; its migration is the only risky part and must be indivisible (Pitfall 1) with the MCP mirror inside the same phase (Pitfall 4 of ARCHITECTURE.md).
- **Phase 2 before Phase 3:** routes before surfaces; the client toggle is display-only, the funnel decides.
- **Phase 4 last, helper first:** extract the visibility-explanation helper during Phase 1 (tested), consume it in Phase 4 — retrofitting it late means re-working the rewritten predicate.
- **M-07 is independent** — ship in Phase 3 as filler or pull earlier if needed.

### Research Flags

Phases likely needing deeper research during planning (`--research-phase`):
- **Phase 1:** carries the entire migration — needs the call-site census, fixture design (visibility set-equality matrix), and owner-validated D-xx decisions (scope-column disposition, visibility field name `private` vs enum, toggle default) before planning. Highest test investment.
- **Phase 2:** M-02 "scope" meaning under demoted D-03 needs owner clarification (project-membership lists? guest project?); share-modal removal semantics (removing a team — what of individually-added members?) needs UX decision.

Phases with standard patterns (skip research-phase):
- **Phase 3:** UI cleanup on well-documented existing surfaces; the only care point is the i18n removal sweep, which is a known pattern.
- **Phase 4:** single endpoint + thin UI reusing an already-tested helper.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Every claim verified against live code (server.js, db-adapter.mjs, mcp.js); zero external research needed. One researcher-level disagreement (project_members table) resolved in synthesis — see below. |
| Features | MEDIUM | Linear/OpenProject/Taiga/Wekan verified against official docs; Height/Focalboard from product knowledge (search engines partially degraded during research). Milestone features M-01..M-08 grounded in first-party PROJECT.md. |
| Architecture | HIGH | All integration points grounded in live code with line numbers; funnel analysis complete. |
| Pitfalls | HIGH | First-party analysis of this codebase's documented patterns; no generic advice needed. |

**Overall confidence:** HIGH

**On the resolved disagreement:** STACK.md (project_members table) vs ARCHITECTURE.md (doc-resident `p.members[]`). **Recommendation: ARCHITECTURE.md wins.** Deciding factors: (a) projects have no table — a join table references doc ids with no FK and creates dual-source-of-truth reconciliation in every write path via `mergeClientDoc`; (b) the milestone is a deletion-driven simplification of an existing doc predicate, not a new access system; (c) M-03's owner-validated snapshot semantics ("later team joiners don't gain access") are only expressible with materialized membership; (d) M-08 must route through the funnel helper anyway (one-pipeline rule), nullifying the SQL-queryability benefit; (e) the Phase-28 "doc is projection, authority rows decide" doctrine transferred teams (which lacked a doc home) — project access lists already live in the doc with protective machinery in place. STACK's migration machinery, portability rules, and test-pinning strategy are adopted wholesale with the fan-out target changed to `p.members`. If the owner overrides toward the table, the STACK.md schema and sweep are ready — but the roadmapper should plan on doc-resident membership.

### Gaps to Address

- **Toggle default (`allowInviteGuests`):** fail-closed `false` (recommended) vs `true` (preserves today's any-member-can-invite). Owner decision; log as D-xx before Phase 2 planning.
- **Visibility field representation:** keep `p.private` boolean vs STACK's `'public'|'private'` enum. Functionally equivalent, both one-sweep; owner picks during Phase 1 planning (enum leaves room for a future 'unlisted').
- **M-02 "scope" meaning** under demoted D-03 — owner clarification needed before Phase 2.
- **guestSingleProject rule** (server.js:4931): drop it (recommended — `p.members` is the boundary) or keep as guard; schema supports either, nothing to migrate. Owner decision.
- **Scope-column disposition** needs a written owner-validated decision (D-xx) before Phase 1 plans: recommendation is convert-and-clear (materialize grants into `p.members`, set columns legacy-never-read).
- **Transparency view access** (admin-only vs self-permitted) — owner decision, Phase 4.
- **Snapshotted-team removal UX** (what happens to individually-added members when a team chip is removed) — UX decision in Phase 2/3.
- **Visibility staleness mechanism** (epoch vs push vs 30s poll) — implementation detail for Phase 3 planning.

## Sources

### Primary (HIGH confidence)
- `.planning/PROJECT.md` — M-01..M-08 decisions, standing constraints, migration conventions
- `server.js` (read in research sessions) — visibility predicate, funnels, invites, scheduler passes (line-level citations in each research doc)
- `db-adapter.mjs` — ensureColumn, portability rules, dual-backend adapter
- `mcp.js` — duplicated permission mirror
- Codebase house patterns: Phase-28 guarded backfill, HARD-01..05, 404-matrix, Phase 37/38/40 invariants, Phase 45 pg matrix

### Secondary (MEDIUM confidence)
- Linear official docs — team visibility, guest scoping
- OpenProject official docs — Manage members / Invite grants, Non-member role, Create projects role
- Taiga community docs — member/role flows
- Wekan (IBRACORP + wiki) — board visibility, creation gating

### Tertiary (LOW confidence)
- Height, Focalboard/Mattermost Boards — product knowledge; search engines partially degraded during research

---
*Research completed: 2026-11-07*
*Ready for roadmap: yes*
