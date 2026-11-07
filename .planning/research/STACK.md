# Stack Research

**Domain:** Stack additions/changes for v2.0 project-level permissions & invitations rewrite (Projects Studio)
**Researched:** 2026-11-07
**Confidence:** HIGH (every claim verified against the live codebase: `server.js`, `db-adapter.mjs`, `mcp.js`; zero external research needed — the question is internal architecture, not ecosystem)

## Recommended Stack

### Verdict: the existing zero-dependency stack suffices — no new libraries, exactly one new table

Nothing in the new permission model needs a runtime dependency. The features are: a visibility enum instead of a boolean, two per-project booleans/doc fields, one join table, a boot backfill, and a simplified predicate. Every mechanism they need already exists and is proven: `ensureColumn` additive migrations (D-10, `db-adapter.mjs:508`), guarded boot backfills with eligibility predicates (`migrateTeamMembers` backfill, `server.js:2130+`), pre-backup `vacuum into`, byte-identical-second-boot pinning in `test/migration.test.mjs`, and the dual SQLite/pg adapter (`db.get/all/run/tx`).

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| node:sqlite via `db-adapter.mjs` | current | unchanged persistence default | New model is pure relational CRUD over ids; adapter's `get/all/run/tx` covers it |
| `pg` (only runtime dep, dynamic import under `DB_URL`) | current | optional Postgres backend | Schema suggestions below are portable: `text` ids, `integer` epochs, no `collate nocase`, adapter-translated `insert or ignore` (precedent: team_members backfill) |
| `ensureColumn` + guarded boot sweeps | existing | the only migration machinery needed | New columns are additive; the one semantic rewrite (visibility) is a guarded doc/table backfill following the Phase-28 pattern |
| `hiddenFor()` / `memberCanReadProject()` funnels | existing | the only places the new predicate lands | The new model *deletes* code (team term, scope grants) rather than adding pipelines — single-funnel discipline (D-06) pays off here |

### Schema Changes (the deliverable)

#### 1. NEW table: `project_members` — the explicit-access authority (mirrors `team_members` exactly)

```sql
create table if not exists project_members (
  workspace_id text not null references workspaces(id) on delete cascade,
  project_id   text not null,          -- doc-resident id; no FK, same as team_members.team_id (D-02 precedent)
  member_id    text,                   -- doc profiles key on member_id (memberships precedent)
  user_id      text not null references users(id) on delete cascade,
  added_by     text,                   -- user_id of inviter — feeds the transparency view + audit
  created_at   integer not null,
  primary key (workspace_id, project_id, user_id)
);
create index if not exists project_members_user on project_members(workspace_id, user_id);
```

**Why a table and not the existing doc field `projects[].members[]`:** the doc access list exists today and `canSeeProject()` reads it, but v2.0 makes explicit project access the *primary* visibility authority queried per read (the way `team_members` displaced the doc roster in Phase 28 and `notif_prefs` left the doc in Phase 34). A table gives: (a) lockstep with the established "doc is a projection, authority rows decide" doctrine; (b) the M-08 transparency view becomes one SQL query instead of a JSON walk; (c) team bulk-invite fan-out (M-03) is row inserts, not doc-revision contention. The no-FK-on-`project_id` shape is exactly the accepted `team_members`/`teams[]` trade (whitelist check at write time).

**Do NOT add a per-project role column.** M-02's editable role/scope/status are workspace-level `memberships.role` / invite fields. Project membership in v2.0 is binary (invited or not). Adding `role` to `project_members` would create a second, conflicting rank system — the exact ambiguity the single-guest concept (M-04) removes.

#### 2. Doc fields on `projects[]` (no schema migration — JSON document)

| Field | Type | Replaces | Notes |
|-------|------|----------|-------|
| `p.visibility` | `'public' \| 'private'` | `p.private` boolean + retired dropdown | `projectIsPrivate()` becomes `p.visibility === 'private'`; sweep deletes `p.private` like the `delete p.access` precedent in `normalizeProjects()` |
| `p.members_may_invite_guests` | boolean | the workspace Settings > Permissions page (removed per M-06) | Per-project toggle; admins/owner always allowed regardless. **Default decision needed from owner: `false` (safe) vs `true` (preserves today's behaviour where any member can invite).** |
| `p.teams[]` | — | becomes legacy, swept away | M-03: teams are an invitation mechanism, not a stored link. Boot sweep fans `p.teams` out into `project_members` rows and deletes the field (same "scalar→array then delete" pattern as `p.team`→`p.teams` in `normalizeProjects()`) |

Also: extend the `redactDoc()`/`mergeClientDoc()` restore-and-protect lists — today they restore `private, members, perms, lead`; they must restore `visibility` and `members_may_invite_guests` from storage, or a redacted client could blank a project's privacy (the exact bug class `mergeClientDoc()` exists to prevent).

#### 3. `ensureColumn` additions

```js
await adapterEnsureColumn('invites', 'project_id', 'text');   // project-scoped guest invites
await adapterEnsureColumn('invites', 'status', 'text');       // if post-invite status editing needs a value beyond used_at/expires_at — likely NULL for now
await adapterEnsureColumn('memberships', 'status', 'text');   // M-02 editable status (e.g. 'active'|'suspended'), nullable = active
```

The existing `invites.teams` column is **reused, not replaced**: under M-03 a team invite to a private project is a pending invite whose acceptance fans out into `project_members` rows. `invites.scope` / `memberships.scope` stay on disk as legacy-never-read (the `invites.team` D-04 precedent).

### Migration Strategy (the only risky part)

One guarded boot pass, following the Phase-28 pattern precisely:

1. **Pre-backup** `vacuum into` (existing machinery) gated on an eligibility predicate.
2. **Eligibility predicates** (so second boot is a byte-identical no-op):
   - `anyProjectWithoutVisibility()` — any `data.projects[]` entry lacking `visibility`
   - `projectMembersEligible()` — `count(*) from project_members` == 0 but private projects have non-empty `members[]` (mirrors the `team_members` guard at `server.js:2149`)
3. **Backfill order is load-bearing** (Phase 28 Pitfall 4 applies verbatim):
   a. For every project with `p.private === true` → `visibility = 'private'`, else `'public'`; delete `p.private`.
   b. Fan out `project_members`: private projects' `p.members[]` → rows; **then** `p.teams[]` ∩ `team_members` → rows. Order matters: teams must be resolved from `team_members` before `p.teams` is deleted. This fan-out is what makes the migration *visibility-preserving* — a team member who saw the project via the v1.7 `teamIntersects` rule still sees it via their new `project_members` row. **This equivalence is the acceptance test for the whole migration.**
   c. Delete `p.teams` from every project.
   d. Scope conversion (D-03 retirement): for each membership with a parseable non-null `scope`, write `scope.projects` (and `scope.teams` ∩ `team_members`) into `project_members`, then set `scope = null` (workspace-wide). This preserves the D-03 grant inversion's *effect* (scoped guests keep access to their one project) while making the new model the only semantics. Keep the defensive `projectScope()` parser as dead-path armor — deleting it is cleanup, not migration.
4. **Portability:** use the adapter's existing `insert or ignore` translation (proven in the team_members backfill); `integer` epoch columns match the pg bigint-epoch variant; no `collate nocase` (D-10 line-scoped rule); every new statement runs through `db.get/all/run/tx`, never raw sqlite.
5. **Pins:** extend `test/migration.test.mjs` with (i) byte-identical second boot, (ii) a visibility-equivalence matrix — for each seeded member × project, `memberCanReadProject` before migration == after.

### Integration Points with Existing Funnels (what changes where)

| Site | Change |
|------|--------|
| `memberCanReadProject()` (server.js:786) | **Rewrites to:** `!isPrivate(p) \|\| project_members has (ws, p.id, member)`. Deletes the `teamIntersects` term and the `teamsOfUser` lookup — the function gets *cheaper* (one indexed lookup vs the live-team set resolution). Signature keeps `liveTeams` param slot or drops it. |
| `hiddenFor()` (server.js:872) | The scoped branch (`projectScope()` non-null) becomes unreachable after the scope sweep — collapse to the single null-scope path. Keep the defensive scope parse returning null so a stray legacy row fails open. |
| `scopeGrants()` / `inScopeProject()` | Deletable once the sweep converges (D-03 grant inversion is subsumed: an invited guest's `project_members` row *is* the grant). |
| Send-time surfaces (reminder pass ~:1357, :1480, :1605, email mirror) | All already route through `memberCanReadProject` — **zero changes** if the helper's signature is preserved. This is the strongest argument for rewriting in place rather than adding a v2 predicate. |
| `redactDoc()` / `mergeClientDoc()` | Restore-list extension (above) + hidden-set derivation unchanged. |
| `mcp.js:177` | It carries a *mirror* of `memberCanReadProject` (no server import). **This is the one place the new model must be applied twice** — a known liability of the no-import design. Update in lockstep and add a behavioural parity test, or accept the small duplication with a pinned test. |
| `guestSingleProject` rule (server.js:4931) | Phase-29's "viewer + exactly one project" scope constraint conflicts with the single-guest concept (a guest can now be invited to several projects). Decision needed: drop the exactly-one rule (recommended — the `project_members` rows *are* the boundary) or keep it as a guard. Schema supports either; nothing to migrate. |
| M-01/M-02 invite hierarchy + post-invite editing | Pure route logic on `memberships.role` / `invites.role` — no stack change; the `check (role in (...))` constraints already admit all needed values. |

### What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| RBAC/ABAC library (Casbin, oso, accesscontrol) | Would break the zero-dependency invariant (D-12); the model is 2 predicates and 1 table | Hand-rolled predicate in `memberCanReadProject` (existing doctrine) |
| A `projects` table | Projects are doc-resident with optimistic revision concurrency; extracting them mid-milestone is a rewrite, not a permission change | `project_members` referencing doc ids by convention (team_members precedent) |
| Per-project role column | Creates a second rank system conflicting with M-01/M-04 | Workspace `memberships.role` stays the only role |
| Separate `project_visibility` / toggles table | Two more joins per read for two booleans | Doc fields on the project object |
| DB triggers/cascades for visibility | Audit-log doctrine (D-A2) forbids hidden implicit writes; visibility must be deterministic at predicate time | Explicit boot sweep + explicit route writes |
| Dropping the legacy columns (`private` fields inside docs, `scope` columns, `p.teams`) via destructive migration | Zero-migration-fatigue convention: legacy fields are deleted from *new writes* and left dormant on disk | `delete p.private` in normalize + never-read columns (D-04 pattern) |
| A second hidden-set pipeline for MCP | Two funnels = drift | Rewrite the mcp.js mirror + parity test (accepted duplication precedent) |

### Workspace-level settings (M-06/M-07)

The removed Settings > Permissions page and the new "restrict project creation to admins" setting are workspace-scoped config. Store them as fields on the workspace settings object (the existing workspace-settings surface, not `user_notif_prefs` — that table is per-user by design). No new table, no migration: absent field = default (creation open to all members per M-07 default).

## Alternatives Considered

| Recommended | Alternative | When the Alternative Would Win |
|-------------|-------------|-------------------------------|
| `project_members` authority table | Keep doc `projects[].members[]` as the access list | Only if the workspace doc stays small (< a few hundred project memberships); doc-list wins on zero migration, but loses on transparency-view queryability and write contention with team fan-out. The doctrine shift already happened in Phase 28 — follow it. |
| Convert-and-clear scope sweep | Keep `memberships.scope` live alongside the new model as a "restriction" layer | Only if the owner wants D-03 as a permanent admin restriction tool. Two overlapping access semantics is what M-05 explicitly replaces; the sweep is the honest retirement. |
| `visibility` enum on the doc | Keep `private` boolean | Enum is the dropdown replacement M-05 names and leaves room for a future `'unlisted'` without a second migration. |

## Sources

- `server.js:760-930` — `projectIsPrivate`, `canSeeProject`, `teamIntersects`, `memberCanReadProject`, `projectScope`, `scopeGrants`, `hiddenFor` (read directly — HIGH)
- `server.js:280-320, 420-445` — authority-table schema + `ensureColumn` inventory (HIGH)
- `server.js:2105-2195` — the Phase-28 guarded backfill pattern (eligibility predicates, pre-backup, portable inserts) (HIGH)
- `server.js:2936, 4931-4947` — guest/viewer mapping and `guestSingleProject` constraint (HIGH)
- `mcp.js:177` — duplicated permission predicate (HIGH)
- `db-adapter.mjs:505+` — D-10 `ensureColumn`, portability rules, `collate nocase` ban (HIGH)
- `.planning/PROJECT.md` — M-01..M-08 decisions, migration conventions (HIGH)

---
*Stack research for: v2.0 Project-level Permissions & Invitations*
*Researched: 2026-11-07*
