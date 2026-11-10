# Phase 49: Visibility model collapse & grant materialization - Research

**Researched:** 2026-11-07
**Domain:** Permission-predicate collapse + one-boot data sweep in an existing single-file Node server (doc-resident membership, SQLite/pg dual backend)
**Confidence:** HIGH — every claim is grounded in code read this session; line numbers cited inline.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MIG-01 | Boot migration materializes every access path (teams ∩ members, Phase-29 scope grants) into `p.members` before deleting `p.teams`; per-member × per-project read-equivalence proven before/after | Sweep design (§Sweep), `team_members` user_id→member_id mapping via `memberships` (server.js:789-792 comment, 884-887), fixture plan (§Fixtures) |
| MIG-02 | Phase-29 scope columns and the D-03 grant inversion retired | D-49-1 convert-and-clear: sweep materializes then sets `memberships.scope`/`invites.scope` to NULL; schema untouched (ensureColumns at server.js:432-433 stay); `projectScope`/`inScopeProject`/`scopeGrants` (server.js:813-870) deleted |
| MIG-03 | Reminder pass, email mirror, digest, MCP mirror read the new model through `memberCanReadProject`; parity test | Call-site census (§Census): all three send-time consumers already call the helper behind `projectScope(...) === null` guards whose prefixes must be deleted; mcp.js:177-189 mirror rewritten in lockstep |
| VIS-02 | Member sees non-private projects + private projects explicitly invited to; team-derived visibility replaced | `memberCanReadProject` body collapses to `canSeeProject(p, memberId)` for non-admins (D-49-3 keeps `canSeeProject` byte-identical minus `p.access` fallback) |
| VIS-03 | Private project never reaches a non-invitee through any door; byte-identical 404s preserved | 404-matrix extension BEFORE implementation (PITFALLS.md Pitfall 6); redaction funnel `hiddenFor` (server.js:872) survives as the single choke point |
</phase_requirements>

<user_constraints>
## User Constraints (from CONTEXT.md — verbatim, planner MUST honor)

### Locked Decisions
- **D-49-1 (Convert-and-clear):** boot sweep materializes every scope-derived grant into `p.members`, then sets `memberships.scope` and `invites.scope` to **NULL**. Schema untouched (no column drop, no ensureColumn removal, no pg drift). One-way: scope JSON erased at sweep time.
- **D-49-2:** After the one boot, **no code path may ever read or honor a scope column again.** MIG-02's proof is the set-equality fixture, not column retention.
- **D-49-3:** `p.private` stays a **boolean** — no enum migration. `projectIsPrivate()`, `normalizeProjects` invariants, `redactDoc`, `mergeClientDoc` and the MCP mirror keep their exact shape; smallest possible diff.
- **D-49-4:** Legacy `p.access === 'private'` fallback retired — the sweep normalizes legacy `p.access` documents to the boolean. Dead-code removal, not a behavior change.
- **D-49-5:** The sweep **deletes `p.teams` from every project document.** No inert/display-only remnant.
- **D-49-6:** `p.teams` absence **is** the "already materialized" second-boot marker, pinned by an explicit boot check or test pin. Fully-swept workspace untouched byte-for-byte on second boot, SQLite and pg.
- **D-49-7:** Materialize **all** grants — every (member, project) pair visible under the OLD predicate, including scope-grant-only pairs (D-03 inversion) and team-intersection pairs. Roles untouched (guest stays guest). No exceptions.
- **D-49-8:** The sweep **preserves the sealed shape** of private projects with empty members: materialization must not trigger `normalizeProjects` un-sealing.

### the agent's Discretion (research/planner territory)
Call-site census, fixture matrix design, sweep ordering mechanics, MCP mirror shape (keep mirror vs inline — ARCHITECTURE.md leans inline-but-no-import), seed.js fixture cleanup.

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

## Summary

This phase is a deletion-driven simplification carrying one load-bearing migration. Today the visibility predicate has three widening terms stacked on `canSeeProject` (server.js:758-761): a live team intersection (`teamIntersects`, :773-775, read via `teamsOfUser` :1829), a Phase-29 scope predicate (`projectScope`/`inScopeProject`/`scopeGrants`, :813-870, with the D-03 inversion where scope OPENS private projects), and the legacy `p.access === 'private'` fallback (:754). The v2.0 model deletes all of them: a non-admin sees a project iff it is non-private or they are in `p.members`. Because those terms currently OPEN projects, deleting them without a data sweep would silently strip access — hence the one-boot sweep that materializes every old-predicate grant into `p.members` first.

The sweep follows the house guarded-additive-migration template (verified at server.js:2240-2308: `vacuum into` backup → "no backup = no mutation" → per-workspace transaction → second-boot no-op pin, all proven in test/migration.test.mjs:435-482). All sweep SQL must be portable through db-adapter.mjs (text ids, integer epochs, `run()` returns exactly `{ changes }` — Phase 45 invariant).

The danger surface is not the predicate — it is the consumers. The census below is exhaustive and read this session. Three send-time consumers gate `memberCanReadProject` behind a `!projectScope(...)` prefix that becomes unreachable/nonsense once `projectScope` dies; they must be edited in the same phase. The MCP mirror (mcp.js:177-189) is a documented deliberate duplicate with its own team-intersection term (line 188) and must be rewritten in lockstep or MCP stays over-permissive with no UI to notice it.

**Primary recommendation:** Same phase, same boot: (1) extend the 404-matrix and set-equality fixtures first, (2) collapse `hiddenFor`/`memberCanReadProject` in place, (3) delete the scope machinery and its consumer prefixes, (4) land the boot sweep (materialize → normalize `p.access` → clear scope columns → delete `p.teams`), (5) rewrite the MCP mirror + parity test, (6) run both backends to byte-identical second boot.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Visibility predicate | API/Backend (server.js funnel) | — | Single-funnel doctrine: `hiddenFor` → `memberCanReadProject`, no second pipeline |
| Grant materialization | Database/Storage (boot sweep) | API (predicate flips after sweep) | Sweep must run before the collapsed predicate takes effect, same boot (Pitfall 1) |
| MCP access enforcement | MCP process (mcp.js mirror) | — | Deliberate no-import duplicate; parity test pins the copies |
| Send-time gating (reminder/email/digest) | API/Backend (scheduler passes) | — | Already route through the helper; delete scope prefixes only |
| Doc redaction/merge protection | API/Backend (`redactDoc`/`mergeClientDoc`) | — | Untouched structurally; they consume `hiddenFor` |

## Standard Stack

No new dependencies (standing invariant: zero new runtime deps). Everything uses existing in-repo machinery.

| Asset | Location | Purpose | Why |
|-------|----------|---------|-----|
| `memberCanReadProject` | server.js:786-794 | THE predicate — rewrite body in place, keep name + call sites | One-helper-one-funnel rule (RETROSPECTIVE) |
| `canSeeProject` / `projectIsPrivate` | server.js:751-761 | Survive byte-identical minus the `p.access` fallback (:754) per D-49-3/4 | Already exactly M-05 semantics |
| `hiddenFor` | server.js:872-902 | The one funnel; collapse to null-scope body minus team term | RedactDoc/mergeClientDoc/reminder/email/digest all consume it |
| Guarded migration template | server.js:2240-2308 (`migrateTenancy` + backup) | Backup → transaction → idempotence pattern to copy | Proven byte-identical second boot (test/migration.test.mjs:435-482) |
| db-adapter.mjs facade | existing | All sweep SQL portable SQLite+pg | Phase 45 invariant: `run()` returns exactly `{ changes }` |
| node:test + test/helpers | `npm test` | All new tests | House runner (`node --test --test-concurrency=2 test/*.test.mjs`) |

## Package Legitimacy Audit

Not applicable — this phase installs zero external packages (zero-new-runtime-deps standing invariant). No registry checks required.

## Call-Site Census (VERIFIED this session — planner commits this table into the plan)

### server.js — predicate + funnel (the deletion target)
| Symbol | Lines | Disposition |
|--------|-------|-------------|
| `projectIsPrivate` | 751-755 | Keep; delete `return p.access === 'private'` fallback (line 754) per D-49-4 |
| `canSeeProject` | 758-761 | Keep byte-identical |
| `teamIntersects` | 773-775 | **DELETE** |
| `memberCanReadProject` | 786-794 | Rewrite: body → `canSeeProject(p, memberId)` (admins handled by caller's ROLE_RANK gate); becomes synchronous — decide: keep `async` signature to avoid touching every caller, or make sync and update callers (ARCHITECTURE.md: becomes "synchronous and cheap"; send-time consumers `await` it today) |
| `projectScope` (+ `CORRUPT_SCOPE_WARNED`) | 812-837 | **DELETE** (D-49-2: no code reads scope again) |
| `inScopeProject` | 840-844 | **DELETE** |
| `scopeGrants` | 864-870 | **DELETE** |
| `hiddenFor` | 872-902 | Collapse to: ROLE_RANK < admin → hidden = private ∧ ¬canSeeProject; admin/owner → `hiddenProjectIds` (which also reduces to `canSeeProject`). Scoped branch (:896-901) deleted. The `teamsOfUser` lookup (:884-887) and membership→user_id resolution die with the team term |
| `normalizeProjects` | 909-943 | **EDIT:** delete the `p.teams` normalization (:916-923) — after the sweep no doc carries `p.teams`, and re-creating the key on every normalize would break the D-49-6 byte-identical marker. Keep everything else, including the un-sealing safety net (:926-936) |
| `hiddenProjectIds` | 945-951 | Keep as-is (already pure `canSeeProject`) |
| `teamsOfUser` | 1829 | Keep — still used by rosters/mentions/`member.teams` projection (:4775); loses only its visibility role |
| `canManageProject` | 796-799 | Keep unchanged |

### server.js — send-time consumers (delete the scope prefix, keep the helper call)
| Consumer | Lines | Exact edit |
|----------|-------|-----------|
| Email mirror `queueNotifEmails` | scopeByMember map :1300-1301; gate :1354-1370 | Delete `recipientScope`/`inScopeProject` re-check (:1357-1362); keep `memberCanReadProject` term (:1370) |
| Reminder pass | assignee fetch :1472; gate :1468-1487 | Delete `!inScopeProject(project, projectScope(assigneeMembership))` (:1480) and the `!projectScope(assigneeMembership) &&` prefix (:1487); keep `memberCanReadProject` |
| Digest loop | :1601-1606 | Same two deletions (:1605, :1606 prefix); Phase 40 D-05/D-06 name-resolution-after-funnel ordering survives verbatim |
| Activity record funnel | :5565 | `hiddenFor` call — no edit needed (funnel does the work) |

### server.js — scope-column writers (dead after D-49-1; decide with planner)
| Site | Lines | Note |
|------|-------|------|
| `addMembership` scope param + upsert | 2785-2812 | Invite-accept path lands `invites.scope` onto `memberships.scope` (SCOPE-05). After the sweep no reader exists; per D-49-2 the write should go too — but Phase 50 reworks invites anyway. Minimal-diff option: stop passing scope from the accept path; leave column NULL |
| Promotion clears scope | :4703 | Dies with the model (no scope to clear) |
| Member scope PUT route | :4798-4821 | Scope-writing admin route — CONTEXT gives this phase no UI deletion mandate (that's Phase 51's Settings-page removal), but the route writes a column nothing reads. Recommendation: delete the route now (it enforces a model that no longer exists and the D-04 tests around it die with it); flag for planner |
| Invite create writes `scope` | :4995; payload projection :1884-1900 | Same: stop writing/projecting scope on invites (D-49-2); Phase 50 reshapes invites regardless |
| ensureColumns `memberships.scope`/`invites.scope` | 432-433 | **KEEP** (D-49-1: schema untouched, no pg drift) |

### mcp.js — the lockstep mirror
| Symbol | Lines | Edit |
|--------|-------|------|
| `canReadProject` mirror | 177-189 | Rewrite: admin check (:182) + `canSeeProject`-equivalent body (:183-186); delete team query + intersection (:187-188). Discretion: keep the mirror function (recommended — it has distinct context plumbing: `ctx.user.id`, `ctx.membership`) or inline; **never import server.js** |
| `visibleProjects` / `readableProjectIds` / `visibleTasks` / `findVisibleTask` / `findVisibleProjectRef` | 194-231 | Untouched — they call `canReadProject` |

## Sweep Design (the load-bearing part)

Sequencing at boot (ARCHITECTURE.md Pitfall 1): sweep code + predicate code land together; **sweep executes before the collapsed predicate serves any request**.

1. **Guard:** detect work needed = any workspace doc project with `p.teams` present OR any `p.access` string OR any non-NULL scope column. A fully-swept workspace is untouched (D-49-6 marker: `p.teams` absence everywhere + all scope NULLs + no `p.access`).
2. **Pre-backup** if mutation needed: `vacuum into` pattern (server.js:2240-2249) — no backup = no mutation.
3. **Per-workspace transaction** (one `db.tx` per workspace):
   a. Load doc, snapshot old-visibility inputs (`p.teams`, `p.members`, `p.access`, memberships scope).
   b. For each private project `p` with `p.teams[]`: for each team, append member_id of every `team_members` row, mapping **user_id → member_id through `memberships`** (Pitfall 3: `p.members` is member_id-space, `team_members` is user_id-space — verified comment server.js:782-784, query :885). Skip silently members with no membership row; assert in tests.
   c. For each membership with parseable non-null scope: for each scoped project id → append that member; for each scoped team id ∩ `team_members` → append those members (D-03 inversion preserved as data — this is the D-49-7 materialize-all).
   d. Normalize legacy `p.access === 'private'` → `p.private = true` (D-49-4) — do this BEFORE any `canSeeProject`-shaped re-derivation so old and new representations agree.
   e. `delete p.teams` from every project (D-49-5). Team history lives in the activity log.
   f. Sealed-shape care (D-49-8): the sweep must NOT run `normalizeProjects` on the swept doc — normalize would un-seal a private project with empty members (:931-936 pushes ownerId / flips private=false). Append grants only, preserving empty-members shape when no grants apply. (`normalizeProjects` will run later on live reads, but by then the sweep has already materialized whatever the old predicate granted; if the old predicate granted nothing, the sealed shape is exactly what the old model showed, so un-sealing by normalize would CHANGE visibility — verify the fixture pins this.)
   g. Write doc back through the normal update path (JSON, revision untouched or bumped — planner decides; byte-identical second boot is the pin).
4. **Scope columns:** `update memberships set scope = null` / `update invites set scope = null` per workspace — inside the SAME transaction as the doc write (D-11-style atomicity precedent, server.js:2262-2266).
5. **Idempotence:** second pass finds no `p.teams`, no `p.access`, all scope NULL → zero writes, no second backup.

**pg portability:** all statements through db-adapter.mjs; text ids, integer epochs; no SQLite-only pragmas inside the per-workspace tx (the `vacuum into` backup is SQLite-only — follow the `sqliteOnly` wrapper precedent, server.js:2241; pg path needs its equivalent snapshot step or documented fallback — check how Phase 45 copy-sqlite-to-pg handles pre-migration state).

## Fixtures (set-equality matrix — success criterion 1)

Per-member × per-project visibility snapshot under the OLD predicate, taken before sweep; asserted equal under the NEW predicate after one boot; asserted byte-identical after second boot. Cell matrix (PITFALLS.md test strategy + D-49-7/8):

| Actor shape | Project shape | Old predicate source | Expected after |
|---|---|---|---|
| plain member, in `p.members` | private | access list | member — no-op |
| plain member, NOT in members | private | — | hidden — no-op |
| member with team in `p.teams` | private | teamIntersects | materialized into members |
| member on team, doc-only profile (no membership row) | private via team | skipped by expansion | **cannot be materialized** — assert explicit test decision: old model could grant access to no-membership doc profiles? Verify: `hiddenFor` resolves member_id via memberships row (:884-887), so a member_id without a membership row had NO team access — expansion loses nothing |
| scoped member, project in `scope.projects` | private, not in members | D-03 inversion (`scopeGrants` :865) | materialized |
| scoped member, team in `scope.teams` ∩ `p.teams` | private | D-03 A1 union (:867) | materialized |
| scoped member, private project on their access list but out of scope | private | **hidden** today (:899 `!inScopeProject ∨ !scopeGrants` — access list does NOT save them) | still hidden (old-hidden stays hidden — materialize nothing) |
| scoped member, out-of-scope PUBLIC project | public | hidden today | still hidden? **Trap**: scope subtracts reach (:847-853 comment). After collapse, public = visible. This is the ONE cell where old-visible must stay visible → materialize a members entry on a now-"private"? No — the project is public; the new model makes it visible, a visibility GAIN. D-49-7 says nobody loses access; gains from predicate simplification are inherent to the model change. **Planner/owner note: document this as the only intentional gain** (out-of-scope members of public projects gain visibility) |
| guest (viewer) via invite scope, exactly one private project | private | D-13/D-03 | materialized; guest stays guest (D-49-7) |
| admin / owner | anything | ROLE_RANK bypass (:882) | visible, untouched |
| nobody | private, empty members, no teams/scope ("sealed") | `normalizeProjects` un-seal edge (:931-936) | sealed shape preserved (D-49-8) — no members injected, `private` not flipped |
| legacy `p.access:'private'` doc | private | fallback :754 | normalized to boolean; same visibility |
| any member | public | always visible | visible |

**Fixture source:** seed/demo workspace (`scripts/export-seed.mjs`, `src/data/seed.js`) + hand-built legacy DB fixture in the migration-test style (test/migration.test.mjs builds legacy rows directly — follow it).

## 404-Matrix extension (BEFORE implementation — PITFALLS Pitfall 6)

Existing homes: test/privacy.test.mjs (redaction funnel, "stored projects are normalised and hidden…" :232+), test/file-route-ordering.test.mjs, test/scope.test.mjs (D-03 truth table :261-317, scope routes), test/hardening.test.mjs. Expected values must be the MODEL's, never `memberCanReadProject` output (anti-tautology). New rows: non-invitee member × private project through doc GET, file serve, and each MCP read/list tool family (`visibleProjects`, `readableProjectIds`, `visibleTasks`, `findVisibleTask`, `findVisibleProjectRef` — mcp.js:194-231) → byte-identical 404/empty body, body-equality asserted not just status. team-derived and scope-derived cells flip expectation from visible → 404.

**Test files that must change or die with the model:**
- test/scope.test.mjs — most tests assert the scope route/D-03 model; the route deletion (or dormancy) decision rewrites this file wholesale. Do not leave half-deleted tests green against a dead model.
- test/privacy.test.mjs — team cells updated; funnel cells keep shape.
- test/mcp.test.mjs — add the parity test: same fixture doc + member, server predicate vs mirror must agree (Pitfall 4).
- test/due-reminders.test.mjs, test/digest.test.mjs — Phase 37/38 suppression + no-double-send invariants must pass **unmodified** (canary: if they need edits beyond recipient-filter updates, the pass architecture drifted).
- test/notif-i18n.test.mjs:255 — mentions `memberCanReadProject`; check its assertion still holds.
- test/membership.test.mjs, test/invite-revision.test.mjs — scope-writing/SCOPE-05 assertions must be updated with the route decisions.

## Common Pitfalls

1. **Splitting sweep from predicate (CRITICAL):** predicate-first locks team members out. Same phase, same boot, sweep first.
2. **MCP mirror drift:** forgetting mcp.js:187-188 leaves a live over-permissive surface. Lockstep edit + parity test.
3. **user_id vs member_id in team expansion:** map through `memberships` (server.js:885 pattern); `p.members` is member_id-space, `team_members` is user_id-space.
4. **`normalizeProjects` re-creating `p.teams`:** lines :916-923 would resurrect the key on every read post-sweep — the D-49-6 byte-identical marker requires deleting that normalization block too.
5. **Un-sealing sealed projects:** running `normalizeProjects` during the sweep (or materializing a grant that never existed) breaks D-49-8. Sweep must be append-only on `p.members`.
6. **404-matrix tautology:** expected values from the model table, not from the code under test.
7. **Out-of-scope-public gain:** the only visibility GAIN in the swap (scoped member + public project, previously hidden by `inScopeProject` :899). Document it; do not "fix" it by keeping a scope term.
8. **Half-deleted guard:** the `assigneeOutOfScope` write guard (mergeClientDoc :1176-1192) is built on `projectScope`. ARCHITECTURE.md recommends a cheap replacement reusing `canSeeProject`/`memberCanReadProject` or accepting+documenting the loss; do not leave the throw half-deleted. Note: after collapse, a non-admin can read all public projects, so the guard's residual value is only private-project assignments — cheap replacement: throw when assignee cannot read the project.
9. **Second-boot writes:** any `delete p.teams` re-emitted, any scope `update` re-run, any `p.access` normalization re-applied must be guarded by the D-49-6 marker or the byte-identity pin fails on both backends.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Backup/restore | Custom file copy | `vacuum into` + `sqliteOnly` wrapper (server.js:2241-2244) |
| Migration idempotence machinery | New marker scheme | The guarded-additive pattern of migrateTenancy / migration.test.mjs |
| Visibility re-derivation in tests | Reimplementing the predicate | Fixture model table (independent oracle) |
| Cross-backend test scaffolding | Hand pg harness | Existing pg-matrix / copy-sqlite-to-pg infra (test/pg-matrix.test.mjs, scripts/copy-sqlite-to-pg.mjs) |

## Code Examples

### Collapsed predicate (target shape)
```js
// server.js — after Phase 49 (discretion: keep async to leave call sites untouched,
// or go sync and update the ~5 awaiting callers)
async function memberCanReadProject(p, wsId, memberId /* liveTeams param dies */) {
  if (canSeeProject(p, memberId)) return true;
  return false; // admins/owners are exempted by callers' ROLE_RANK gates (hiddenFor :882, mcp.js :182)
}
```
(Verified: the `wsId`/`liveTeams` params exist only to resolve teams — server.js:786-794.)

### hiddenFor collapse
```js
async function hiddenFor(doc, membership) {
  if (membership?.workspace_id && ROLE_RANK[membership.role] < ROLE_RANK.admin) {
    const memberId = membership.member_id || null;
    const seen = new Set();
    for (const p of doc?.data?.projects || []) {
      if (p?.id && !canSeeProject(p, memberId)) seen.add(p.id);
    }
    return seen;
  }
  return hiddenProjectIds(doc, membership?.member_id || null);
}
```

### Send-time consumer edit (reminder pass, :1480-1487 shape)
```js
// BEFORE: if (!inScopeProject(project, projectScope(assigneeMembership))) continue;
//         if (!projectScope(assigneeMembership) && !(await memberCanReadProject(project, ws.id, t.assignee))) continue;
// AFTER:
if (!(await memberCanReadProject(project, ws.id, t.assignee))) continue;
```

## Validation Architecture

| Property | Value |
|----------|-------|
| Framework | node:test (`node --test --test-concurrency=2 test/*.test.mjs`), ~1133 tests green baseline |
| Config file | none needed — house convention |
| Quick run | `node --test test/privacy.test.mjs test/mcp.test.mjs test/scope.test.mjs test/migration.test.mjs` |
| Full suite | `npm test` |

| Req | Behavior | Test | File |
|-----|----------|------|------|
| MIG-01 | set-equality before/after one boot | new `test/visibility-migration.test.mjs` (Wave 0) | ❌ Wave 0 |
| MIG-01 | second boot byte-identical, both backends | extends migration.test.mjs pattern (:435-482) | exists |
| MIG-02 | no code reads scope; columns NULL after sweep | static-source assert + fixture | ❌ Wave 0 |
| MIG-03 | server predicate ≡ MCP mirror | new parity test in mcp.test.mjs | ❌ Wave 0 |
| VIS-02 | non-invitee hidden; membership removal hides on next read | privacy.test.mjs extension | exists |
| VIS-03 | byte-identical 404 per door × actor × shape | 404-matrix extension (privacy + file-route-ordering + mcp) | exists, extend |
| — | Phase 37/38 canaries pass unmodified | due-reminders + digest tests | exists |

**Wave 0 gaps:** fixture-builder for legacy multi-shape DB (both backends); the set-equality migration test; MCP parity test; 404-matrix extension task (test-first, before implementation task).

## Security Domain

| ASVS Category | Applies | Control |
|---------------|---------|---------|
| V4 Access Control | yes | Single funnel `hiddenFor`; byte-identical 404s (no existence oracle) — preserved by construction |
| V5 Input Validation | yes | Sweep parses stored scope JSON defensively — reuse `projectScope`'s parse discipline in the sweep (fail-open at old-model re-derivation time, since unreadable scope under the OLD model meant workspace-wide; materialization must reproduce that, not skip) |
| V14 Config | no new surface | ensureColumns stay; no schema change |

| Threat | Mitigation |
|--------|-----------|
| Existence oracle during swap | 404 bodies byte-identical, body-equality asserted |
| Over-permissive MCP window | mcp.js edited in same phase + parity test |
| Access creep from materialization | materialize exactly old-visible pairs; D-49-7 test-pinned |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `memberCanReadProject`'s awaiting callers tolerate a signature change (or it stays async) — call sites at :890, :1370, :1487, :1606 + mcp mirror | Census | Mechanical, low; planner picks sync-vs-async |
| A2 | Deleting the scope-writing admin route (server.js:4798-4821) + invite-scope writes (:4995, :1884-1900, SCOPE-05 :2803-2812) is in-phase (D-49-2 "no code path may ever read or honor" implies writes die too); Phase 50 reshapes invites anyway | Census | If deferred, dead writes persist — cosmetic, but violates D-49-2's spirit and breaks byte-identity tests |
| A3 | Out-of-scope member × public project is the only intentional visibility GAIN | Fixtures | If owner disagrees, a residual scope read would be needed — contradicts D-49-2; flag in plan checkpoint |
| A4 | Sweep must not call `normalizeProjects` on the swept doc (un-seal risk) | Sweep step 3f | If un-sealing is actually intended post-materialization, fixture D-49-8 fails — verify with owner |
| A5 | Doc revision is not bumped by the sweep, or is bumped once — either is acceptable to second-boot pinning as long as deterministic | Sweep step 3g | Non-deterministic revision → byte-identity test fails spuriously |
| A6 | pg path has an equivalent pre-migration snapshot step or a documented fallback (backup machinery is SQLite-only per `sqliteOnly`) | Sweep step 2 | pg migration unguarded if missed |

## Open Questions (RESOLVED)

1. **Sync vs async `memberCanReadProject`** — RESOLVED: keep `async` (smallest diff, ~5 awaiting callers). Settled by 49-03 Task 1.
2. **Scope-route deletion timing** — RESOLVED: delete route + its tests now (per A2/D-49-2). Settled by 49-03 Task 2 (route deletion) and Task 3 (route tests deleted).
3. **Out-of-scope-public gain (A3)** — RESOLVED: accepted as the one intentional gain, pinned by the D-49-7 gain assertion in 49-03 Task 3 (privacy.test.mjs out-of-scope × public → VISIBLE).
4. **pg backup fallback (A6)** — RESOLVED: pg lane uses the documented snapshot/fallback step. Settled by 49-02 Task 1 (A6 fallback in the sweep's pg path).

## Environment Availability

No external dependencies beyond the existing stack (node, SQLite file, optional `POSTGRES_TEST_URL` pg test matrix — established in Phase 45). Step 2.6: SKIPPED beyond confirming `npm test` and the pg matrix harness already exist (test/pg-matrix.test.mjs, scripts/copy-sqlite-to-pg.mjs — VERIFIED in scripts/ and test/ listings this session).

## Sources

### Primary (HIGH confidence — read this session)
- server.js:751-951 (predicates, funnel, normalizeProjects), 1082-1195 (mergeClientDoc + guard), 1296-1370 (email mirror), 1468-1487 (reminder), 1601-1606 (digest), 2240-2308 (migration template), 2785-2812 (addMembership scope), 432-433 (scope ensureColumns), 4703/4798-4821/4995 (scope writers), 1829-1833 (teamsOfUser), 5565 (activity funnel)
- mcp.js:176-231 (mirror + all read/list tool resolution)
- test/migration.test.mjs (guarded-migration + byte-identity precedents), test/privacy.test.mjs (funnel tests), test/scope.test.mjs (D-03 truth table + scope routes), scripts/ + test/ listings
- CONTEXT.md (D-49-1..8), REQUIREMENTS.md (MIG/VIS definitions), ARCHITECTURE.md / PITFALLS.md / SUMMARY.md (milestone research)

### Secondary
- .planning/PROJECT.md, RETROSPECTIVE.md (one-helper-one-funnel doctrine), STATE.md (Phase 38/45 invariants)

## Metadata

**Confidence breakdown:** Census + predicate shapes: HIGH (all read this session, line-cited). Sweep design: HIGH (template verified). Fixture cell semantics: MEDIUM-HIGH (A3/A4 flagged for owner). 

**Research date:** 2026-11-07. **Valid until:** codebase-internal — stable until Phase 50 edits invites.
