# Phase 79: Governance Surface - Research

**Researched:** 2026-11-20
**Domain:** Owner-scoped workspace governance (SQLite schema addition, operator-gated route family, client admin-area page)
**Confidence:** HIGH (all findings verified against in-repo source this session; no external packages involved)

## Summary

This phase is almost entirely **re-composition of proven in-repo primitives**. The backend work is: (1) one additive schema column (`workspaces.archived`) following the established `adapterEnsureColumn` migration pattern, (2) a new operator route family under `/api/auth/operator/workspaces` that mirrors the Phase 78 operator-users family shape verbatim (sameOrigin → requireUser → `isInstanceAdmin` gate → 403 `operatorOnly`), and (3) an archived-refusal inserted into the single workspace-resolution funnel (`requireWorkspace`, server.js:4862). The promote/demote backend (Phase 78) is reused unchanged; only its client UI relocates.

Two genuine design gaps need planner attention rather than library research: **the workspaces table has no `created_by` column** — SC#1's "creator" field must be derived from the `role='owner'` membership row (nullable, honest '—' when the original owner membership is gone), and **type-to-confirm is a NEW interaction** with no in-repo precedent (the closest is the D-90 inline-confirm stage). Everything else — audit-log-in-same-transaction, keyed 5-catalogue refusals, FK cascade deletion, the test harness — has direct precedent to copy.

**Primary recommendation:** Build the governance route family as a structural clone of the Phase 78 operator-users family (server.js:6703-6827); enforce archiving in `requireWorkspace` (one funnel, not per-route); do NOT filter `wsBySlug` (it would change slug-collision semantics); derive creator from the owner membership; and relocate `operatorCard()` markup into the new page module while deleting it from settings.js.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Operator management placement (WSG-09)**
- **D-01:** Promote/demote UI is RELOCATED into the governance page as a section — the governance page is the single surface. The Phase 78 `operatorCard` UI (src/pages/settings.js:253) is REMOVED from Settings entirely (no pointer remnant, no duplicate code paths). Backend endpoints from Phase 78 (`/api/auth/operator/users/*`) are reused unchanged. — Reversibility: costly.
- Ratifies the roadmap's "linked or relocated" open question: **relocated**.

**Archive vs delete semantics (WSG-08)**
- **D-02:** Archive = new `workspaces.archived` soft flag. Archived workspaces are hidden from normal listing/entry, slug access returns a keyed 'workspace archived' refusal, and the operator can unarchive from the governance page (reversible).
- **D-03:** Hard delete is allowed ONLY for empty/shadow workspaces (no projects/content). A workspace with real content must be archived instead — the endpoint refuses with a keyed error.
- **D-04:** All destructive actions (delete, archive, member release) use **type-to-confirm**: the operator types the workspace slug to confirm. Audit-logged via the audit-log table (server.js:418).

**Orphaned member disposition (WSG-08)**
- **D-05:** Per-member choice: reassign to another workspace (target + role picked in the same step) or release. No bulk-reassign.
- **D-06:** Block-until-resolved: the delete cannot execute while any member lacks a disposition ('release' counts as resolved). No member is ever stranded — matches SC#3.
- **D-07:** Archiving does NOT trigger the orphan flow — archived workspaces keep their member rows frozen. Orphan resolution is required only on hard delete.
- **D-08:** Reassignment control: dropdown of all workspaces (from the same operator listing) with name + member count; the operator assigns the member's role (owner/admin/member) in the same step.

**Listing endpoint & leak guard (WSG-07)**
- **D-09:** Non-operators get **403 forbidden** from the listing endpoint (not an empty 200). Consistent with the `operatorOnly` guard (server.js:6710); gates the caller, not workspace existence.
- **D-10:** New operator-gated route family: `GET /api/auth/operator/workspaces` plus action endpoints under it (archive/unarchive, delete, member reassign/release). Mirrors the Phase 78 console endpoint pattern (server.js:6703-6785). Do not extend the user-facing `/api/workspaces` family.
- **D-11:** Client: governance page lives as a slot in the Phase 60 power-admin admin area, rendered only when `/api/me` shows `isInstanceAdmin`; the endpoint enforces server-side regardless.

### the agent's Discretion
- Listing payload field details and pagination (5 fields named in WSG-07; planner picks shape — likely small instance, no pagination needed unless research says otherwise)
- Unarchive UX details (same page, one click + confirm)
- Exact refusal key names and locale phrasing (all 5 catalogues, same commit)
- Whether promote/demote section reuses operatorCard markup as a component moved into the page or is rewritten to fit the governance layout

### Deferred Ideas (OUT OF SCOPE)
- Workspace settings editing (rename/slug) from the governance page — carried from Phase 78 deferred list; still out of scope here
- Bulk member operations across workspaces — future consideration
- Workspace content transfer/merge tooling — future milestone
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WSG-07 | Owner-scoped page lists ALL workspaces (name, slug, member count, creator, created date); non-operators get forbidden, no existence oracle | Route family pattern (server.js:6703-6721), `isInstanceAdmin` gate (server.js:4857), single-SQL listing query pattern; creator derived from owner membership (gap — no `created_by` column) |
| WSG-08 | Delete/archive empty/shadow workspaces + reassign/release orphaned members; confirmation-gated, audit-logged | `adapterEnsureColumn` migration (server.js:624-689), archived gate in `requireWorkspace` (server.js:4862-4877), delete-tx precedent (server.js:7137-7152), audit-in-tx precedent (server.js:6804-6824), `membershipsOf`/`membersOf` helpers |
| WSG-09 | One governance surface including operator management | `operatorCard()` markup (settings.js:259-278), promote/demote actions (actions.js:2776-2810), api methods (api.js:351-354), Phase 78 endpoints reused unchanged |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Workspace listing (all instance workspaces) | API/Backend | — | Operator-scoped SQL aggregate; client renders verbatim |
| Archive/unarchive (soft flag) | API/Backend (flag write) | Client (type-to-confirm UX) | Flag lives in DB; entry refusal is server-side |
| Hard delete (empty-only) | API/Backend | Client (slug-typed confirm, orphan UI) | Deletion + audit in one `db.tx`; FK cascades |
| Orphan reassign/release | API/Backend | Client (per-member disposition UI) | Direct membership-row writes under the operator gate — never the user-facing member routes |
| Operator promote/demote | API/Backend (already built, unchanged) | Client (relocated markup) | Phase 78 endpoints reused verbatim per D-01 |
| Archived-entry refusal | API/Backend | Client (honest landing state) | `requireWorkspace` is the single funnel for every slug route |
| Governance page gating | Client (render-only gate) | API/Backend (enforcement) | `api.user?.isInstanceAdmin` controls nav/render; server 403 is the truth (D-11) |

## Standard Stack

### Core
No new dependencies — standing constraint (zero new dependencies, REQUIREMENTS.md). Everything uses existing in-repo primitives:

| Primitive | Location | Purpose | Why Standard |
|-----------|----------|---------|--------------|
| `adapterEnsureColumn(table, col, def)` | server.js:624-689 | Additive column migration at boot | The ONLY sanctioned way to add a column; def byte-identical to the SCHEMA declaration (Pitfall P-B comment at :679) |
| `isInstanceAdmin(user)` | server.js:4857-4859 | Operator gate primitive (D-112: DB flag only) | `return user?.is_instance_admin === 1;` — verbatim reuse |
| `fail(res, status, code, message)` | single error constructor beside `json()` | Every keyed refusal leaves here | No route builds an error object by hand (comment at server.js:4698) |
| `db.tx(async () => {...})` | audit precedents :6746, :6804 | Mutation + audit row atomicity | AUD-01/D-R3: a forced audit failure rolls back the mutation |
| `audit_log` insert | server.js:6751-6767, :6806-6822 | Destructive-action trail | Append-only, snapshot columns, FK-free (comment :423-426) |
| `logSecurity(userId, verb)` / audit verbs | server.js:4913, :6750 | Security-event + audit vocabulary | Verb-keyed precedent |
| `tooMany(key, max, windowMs)` | server.js:4881 | Write-route throttle | Revocation precedent :6731 — attempts keyed on operator.id |
| `membersOf(workspaceId)` | server.js:3289-3297 | Member list per workspace (join users) | Used by governance member payloads |
| `membershipsOf(userId)` | server.js:929-937 | Per-user workspace listing (normal listing source) | D-02 archived-hiding filter lands here |
| `srow(...)`, `sblock`, `badge` markup | settings.js:263-277 | Console row markup | Visual language of the operator console, relocates with operatorCard |
| `test/helpers/server.mjs` harness | test/helpers/server.mjs | Isolated spawn-per-test server | Every suite pattern; `WORKSPACE_CREATION: 'true'` base env to override per suite |

**Package Legitimacy Audit:** skipped — this phase installs **zero external packages** (standing constraint; `test/dependencies.test.mjs` pins dependency count).

## Architecture Patterns

### System Architecture Diagram

```
Operator browser
   │  GET /api/auth/operator/workspaces            (listing: all workspaces + member counts + creator + created)
   │  POST /api/auth/operator/workspaces/:id/archive | /unarchive
   │  POST /api/auth/operator/workspaces/:id/delete        ← body: {confirmSlug, dispositions:[...]}
   │  POST /api/auth/operator/workspaces/:id/members/:userId/reassign  ← body: {targetWorkspaceId, role}
   │  POST /api/auth/operator/workspaces/:id/members/:userId/release
   ▼
[route family guard — VERBATIM Phase 78 shape]
   sameOrigin(req) → requireUser(req,res) → isInstanceAdmin(operator)? ──no──► 403 operatorOnly
   ▼ yes
[listing] one SQL: workspaces LEFT JOIN memberships GROUP BY ws.id, LEFT JOIN owner-membership→users
[archive] set archived=1 + audit row (db.tx)              (no orphan flow — D-07)
[unarchive] set archived=0 + audit row (db.tx)
[delete] body empty-check on RAW doc → refuse workspaceNotEmpty
         → every member has a disposition? → else 409 dispositionRequired (D-06)
         → db.tx: dispositions applied, delete memberships+invites+workspace, audit row
[reassign] upsert memberships(target ws, user, role)  [release] delete memberships row
   ▼
Member's next entry of archived ws:
   GET /api/workspaces/:slug → requireWorkspace ── archived=1 ──► 403 workspaceArchived (keyed, D-02)
   (every /api/workspaces/:slug route rides this one funnel — server.js:4862-4877)
   ▼
Client governance page (src/pages/governance.js, new route id)
   rendered only when api.user?.isInstanceAdmin (D-11); server 403 = truth
   sections: workspace table (archive/delete/unarchive) + operatorCard section (relocated)
```

### Recommended Project Structure
```
server.js                          # SCHEMA workspaces.archived + adapterEnsureColumn + route family + requireWorkspace archived gate
src/pages/governance.js            # NEW page module (lazy-loaded, like dashboard.js) — workspace table, orphan UI, relocated operatorCard
src/pages/settings.js              # operatorCard() REMOVED (D-01 — no pointer remnant)
src/shell/render.js                # ROUTE_IDS + ROUTE_ICONS gain the new route id
src/shell/layout.js                # lazy import + nav sItem gated on isInstanceAdmin (precedent :176)
src/core/api.js                    # client call methods for the new operator endpoints (precedent :351-354)
src/actions/actions.js             # governance actions + relocated promote/demote/revoke actions; refreshGovernanceWorkspaces()
src/locales/*.json                 # new keys in all 5 catalogues, same commit
test/governance.test.mjs           # NEW server suite (harness pattern)
test/governance-client.test.mjs    # NEW client-surface suite (creation-gate-client.test.mjs pattern)
```

### Pattern 1: The Phase 78 operator route-family shape (copy verbatim per D-10)
**What:** Guard order is `sameOrigin` FIRST (before any body read or throttle — Pitfall 22), then `requireUser`, then the operator gate BEFORE any target lookup, so an unknown id is a no-oracle 404 for non-operators too.
**When to use:** Every new `/api/auth/operator/workspaces*` route.
**Example** (source: server.js:6703-6733, verified verbatim):
```js
const operatorUsersMatch = pathname === '/api/auth/operator/users';
if (operatorUsersMatch && method === 'GET') {
  // D-121: read route — sameOrigin → requireUser → operator gate. NO throttle
  // (read-only, no oracle: the payload exposes only the five D-121 fields).
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const operator = await requireUser(req, res);
  if (!operator) return;
  if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
  ...
}
```
Throttle precedent for destructive writes (server.js:6729-6731): `tooMany('operator-revoke|${operator.id}', 5, 15*60*1000)` — "keyed on the caller, and every attempt — including 403 refusals — consumes a try". The listing read route carries NO throttle (:6705-6706).

### Pattern 2: Additive column migration (Pitfall P-B)
**What:** Add the column to the SCHEMA `create table` AND mirror it with `adapterEnsureColumn` for existing databases; the ensure-column def is byte-identical to the SCHEMA declaration.
**Example** (source: server.js:362-371 SCHEMA and :684-689 migration precedents, verified verbatim):
```js
create table if not exists workspaces (
  id         text primary key,
  slug       text,
  name       text not null,
  color      text,
  doc        text not null,
  revision   integer not null default 1,
  created_at integer not null,
  updated_at integer not null
);
// ... in the migration block (pattern from users.is_instance_admin, server.js:687-689):
await adapterEnsureColumn('workspaces', 'archived', 'integer not null default 0');
```
Note: SQLite cannot add `not null` without a default via ALTER — `integer not null default 0` is exactly what the `users.is_instance_admin` migration used, so the adapter accepts this def shape today. [VERIFIED: server.js:689]

### Pattern 3: Audit row in the SAME transaction (AUD-01/D-R3)
**What:** Every destructive action writes its audit row inside the same `db.tx` as the mutation; a forced audit failure rolls the mutation back.
**Example** (source: server.js:6804-6824, promote endpoint, verified verbatim):
```js
const out = await db.tx(async () => {
  await db.run('update users set is_instance_admin = ? where id = ?', [promoting ? 1 : 0, target.id]);
  await db.run(
    'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
    [uid(), operator.id, target.id, promoting ? 'operator_promoted' : 'operator_demoted', 0, clientIp(req), null, operator.name, operator.email, target.name, target.email, now()],
  );
  ...
});
logInfo(`operator ${promoting ? 'promoted' : 'demoted'}: ${target.email} by ${operator.email}`);
```

### Pattern 4: Workspace deletion mechanics (existing owner DELETE — copy the body, change the gate)
**What:** The existing owner-scoped DELETE (server.js:7137-7152) shows exactly what a workspace delete must do: capture the logo ref BEFORE the tx, delete memberships + invites + workspace row (FKs cascade the rest), unlink the logo file AFTER the tx commits, log.
**Example** (source: server.js:7141-7151, verified verbatim):
```js
const deletedLogo = docLogo(ctx.ws)?.file || null;
await db.tx(async () => {
  await db.run('delete from memberships where workspace_id = ?', [ctx.ws.id]);
  await db.run('delete from invites where workspace_id = ?', [ctx.ws.id]);
  await db.run('delete from workspaces where id = ?', [ctx.ws.id]);
});
if (deletedLogo) fs.unlink(path.join(LOGOS_DIR, deletedLogo), () => {});
logInfo(`workspace deleted "${ctx.ws.name}" (slug: ${ctx.ws.slug}) by ${ctx.user.email}`);
```
The governance endpoint reads the workspace row by id via `db.get` (NOT `requireWorkspace` — an archived workspace must still be actionable by the operator, and requireWorkspace will be refusing archived rows).

### Pattern 5: Relocation of operatorCard (D-01)
**What:** `operatorCard()` (settings.js:259-278) renders rows from `S.ui.operatorUsers` with inline-confirm stages `S.ui.operatorRevoke` / `S.ui.operatorDemote`; its actions (`operatorPromote`, `operatorDemoteAsk/Cancel/Demote`, `operatorRevokeAsk/Cancel/Confirm`) live in actions.js:2749-2810 and call `api.operatorUsers()` / `api.operatorPromote(id)` / `api.operatorDemote(id)` / `api.operatorRevokeSessions(id)` (api.js:351-354). Relocation = move the function into the governance page module (or keep it exported from a shared module and import from governance.js), delete it from settings.js, and update the mount site.
**Discretion (per CONTEXT):** reuse the markup as-is or restyle to the governance layout — either is fine; the `settings.operator.*` locale keys already exist in all 5 catalogues and can be reused or renamed under a governance namespace (planner's discretion; if renamed, the old keys must be removed from all 5 catalogues in the same commit to keep catalogue parity tests green).

### Pattern 6: Client page + route registration (dashboard.js precedent)
**What:** New route id goes in `ROUTE_IDS` (render.js:21-43) and `ROUTE_ICONS` (:45-65); lazy import map in layout.js:56 (`dashboard: lazy(() => import('../pages/dashboard.js'), 'pageDashboard')`); nav item gated client-side with the same pattern as the workspace dashboard (`layout.js:176`: `${isMemberAdmin() ? sItem('dashboard', ...) : ''}` — "UX gate only — the server 403 is the control"). A non-operator deep-linking the route gets the server 403 rendered as an honest full-state (dashboard.js:84-87 precedent: `S.ui.dashErr?.status === 403` → lock glyph + `err.code403` + keyed message).

### Anti-Patterns to Avoid
- **Filtering `wsBySlug()` by archived:** `wsBySlug` (server.js:921-923) also backs `uniqueSlug` (:915) and the `slugTaken` checks (:6902, :7124). Filtering there changes slug-collision semantics — an archived workspace must keep occupying its slug (reversible unarchive must not collide with a new workspace). Put the archived refusal in `requireWorkspace` (:4862-4877), keyed off the fetched row's flag.
- **Extending `/api/workspaces` routes for governance actions (D-10 prohibition):** those routes are membership-gated (`requireWorkspace` with role ranks); the operator may have no membership. Governance actions read/write rows directly under the operator gate.
- **Reusing user-facing member-add/remove routes for reassignment:** the operator is not a member of the target workspace; those routes would 404/403. Write `memberships` rows directly under the operator gate.
- **Building the error payload by hand:** every refusal goes through `fail()` (server.js:4698 comment).
- **Audit row outside the transaction:** AUD-01/D-R3 pins them together (:6743-6746 comment).
- **Client-side gating only:** the client `isInstanceAdmin` check is cosmetic; the server 403 is the enforcement (D-11, and the layout.js:175 comment states this doctrine explicitly).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Column migration | Custom boot-time ALTER logic | `adapterEnsureColumn` (server.js:627-689 pattern) | Dialect-aware (pragma table_info / information_schema), Pitfall P-B pinned |
| Atomic mutation+audit | Two sequential writes | `db.tx` + audit insert (Pattern 3) | Rollback-on-audit-failure guarantee |
| Empty/content check | A filesystem or per-table sweep | `JSON.parse(ws.doc)` → `doc.data.projects` (and tasks) on the RAW row | The doc IS the content store; the dashboard route (:6175 precedent) reads the raw doc the same way |
| Member listing | New join query per route | `membersOf(workspaceId)` (server.js:3289-3297) | Already joins users with the fields governance needs (name, email, role, created_at) |
| Type-to-confirm state | Ad-hoc per-button flags | One shared stage object + action pair (D-90 precedent `S.ui.operatorRevoke`) | The D-90 inline-confirm stage is the established state shape; extend it with a slug-match predicate |
| Locale parity | Manual cross-file key checks | `test/catalogue.test.mjs` (5-catalogue parity pin) | CI enforces the same-commit rule |
| Test server | Hand-rolled HTTP fixtures | `test/helpers/server.mjs` harness | Spawn-per-test isolated DATA_DIR, BASE_ENV with `ADMIN_EMAIL` stamping the operator |

**Key insight:** Every backend capability this phase needs already exists as a named, commented, test-pinned primitive. The phase's engineering risk is in the *decision logic* (empty-check, orphan blocking, slug semantics), not in the plumbing.

## Runtime State Inventory

Schema-additive phase (migration aspect — the questions applied to the `archived` column):

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Existing SQLite/pg databases lack `workspaces.archived`; rows default to 0 via `adapterEnsureColumn` default | Migration only — `adapterEnsureColumn('workspaces','archived','integer not null default 0')` at boot; no backfill needed (nothing is archived until an operator acts) |
| Live service config | None — no external service holds workspace state | None |
| OS-registered state | None | None |
| Secrets/env vars | None — no new env keys (the phase is DB-flag driven, D-112 style) | None |
| Build artifacts | None — server.js and src/ are the shipped artifacts; test DB dirs are ephemeral | None |

## Common Pitfalls

### Pitfall 1: The workspaces table has no `created_by` column
**What goes wrong:** SC#1 requires "creator" in the listing; `createWorkspace` (server.js:4660-4679) records the creator only as the `role='owner'` membership row.
**How to avoid:** Derive creator in the listing query: left-join `memberships` (role='owner') → `users`. If the original owner's membership was removed, creator is genuinely unknown — render '—' (honest null). Do NOT add a `created_by` column retroactively (historical rows can't be backfilled truthfully; the membership join is the best available truth).
**Warning signs:** A test expecting creator on a workspace whose owner was released.

### Pitfall 2: Guard order (Pitfall 22)
**What goes wrong:** Reading the body or throttling before `sameOrigin` lets a cross-origin POST consume the victim's throttle budget or parse attacker bytes.
**How to avoid:** Copy the Phase 78 order verbatim: sameOrigin → requireUser → operator gate → throttle (for writes) → target lookup. Comment at server.js:6725: "sameOrigin FIRST, before any body read or throttle."
**Warning signs:** Any new route whose first statement is not `sameOrigin`.

### Pitfall 3: `requireWorkspace` is the single entry funnel — but governance must NOT ride it
**What goes wrong:** If governance action routes resolve the target workspace through `requireWorkspace`, (a) an archived workspace becomes un-actionable (unarchive impossible — deadlock), and (b) a non-member operator gets 404.
**How to avoid:** Governance routes fetch the row by id (`db.get('select * from workspaces where id = ?')`) under the operator gate; `requireWorkspace` gains the archived refusal for the *member* path only.
**Warning signs:** `requireWorkspace` appearing in any `/api/auth/operator/` route.

### Pitfall 4: Archived hiding must not break boot/first-workspace logic
**What goes wrong:** `membershipsOf` (server.js:929-937) feeds `userPayload.workspaces` (the client's workspace list) AND the post-delete `nextSlug` fallback (:7151). `firstWorkspace()` (:968) picks the fallback workspace at boot.
**How to avoid:** Add the archived filter to `membershipsOf` (D-02 "hidden from normal listing"); a member whose ONLY workspace is archived then has an empty workspace list → client handles the `workspaceArchived` refusal of any direct slug entry by landing on the no-workspace state (enterNoWorkspace precedent, actions.js:4013). Verify `firstWorkspace`/boot paths separately — decide explicitly whether boot fallback may land in an archived workspace (recommend: filter there too, else the member immediately hits the refusal).
**Warning signs:** A member auto-entering an archived workspace after sign-in.

### Pitfall 5: Delete-block semantics — dispositions vs content check are DIFFERENT refusals
**What goes wrong:** Conflating "workspace has content" (D-03: refuse with keyed error, archive instead) with "member lacks a disposition" (D-06: block until resolved).
**How to avoid:** Two separate checks with two separate keys: content check FIRST (`workspaceNotEmpty`), then disposition completeness (`dispositionRequired` or similar). Release counts as resolved (D-05).
**Warning signs:** One 409 carrying both meanings; the UI can't tell the operator which list to fix.

### Pitfall 6: Reassign target already contains the member
**What goes wrong:** `memberships` primary key is `(workspace_id, user_id)` (server.js:377) — a blind INSERT throws an unhandled constraint error.
**How to avoid:** Check the existing row: either refuse with a keyed error (cleanest — the operator picks another target), or upsert the role. Refuse is more honest; pick one and pin it in a test.
**Warning signs:** `UNIQUE constraint failed: memberships.workspace_id, memberships.user_id` in logs.

### Pitfall 7: FK cascade coverage is partial by design
**What goes wrong:** Only 5 tables declare `references workspaces(id) on delete cascade` (memberships :373, team_members :387, invites :400, and two more at :509/:660). Tables without the FK (e.g. saved_views, notifs, reminders rows keyed by workspace_id) may orphan on hard delete — but the EXISTING owner DELETE (:7137-7152) has always had this behavior, so hard delete via governance inherits the same reality.
**How to avoid:** Copy the existing DELETE body exactly (Pattern 4); do NOT invent extra cleanup — any gap is pre-existing and pinned by prior tests. Flag any discovered gap as an observation, not a silent fix.
**Warning signs:** `delete from workspaces` succeeding while rows referencing the id remain in non-FK tables (same as today's owner-delete path).

### Pitfall 8: Locale parity in the same commit
**What goes wrong:** New refusal keys (`workspaceArchived`, `workspaceNotEmpty`, disposition/refusal keys, governance UI strings) landing without all 5 catalogues fails the catalogue pin.
**How to avoid:** Every new key appended to en/fr/nl/de/es in the same commit as the emitting gate (catalogue files are flat key→string maps, e.g. `"err.operatorOnly"` at en.json:1776). Reuse `settings.operator.*` keys where the relocated UI reuses the strings; if keys are renamed to a governance namespace, remove the old keys from all 5 in the same commit.
**Warning signs:** `test/catalogue.test.mjs` red.

### Pitfall 9: Removing operatorCard leaves dead wiring
**What goes wrong:** The sessions-tab mount still calls `refreshOperatorUsers()` (actions.js:362) — a dead fetch on every settings visit for operators, and the D-90 stage state (`S.ui.operatorRevoke/...`) still referenced by removed markup.
**How to avoid:** Remove the mount call AND relocate the actions/state with the markup (actions are global, keyed by `data-a` — leaving them is a duplicate-path risk the D-01 decision explicitly forbids: "no duplicate code paths").
**Warning signs:** grep for `operatorUsers`/`operatorRevoke`/`operatorDemote` after the move — every hit should be in the governance path only.

### Pitfall 10: Throttle budget on destructive routes
**What goes wrong:** Governance delete/archive throttling keyed per-IP would lock the single legitimate operator out after a UI retry loop.
**How to avoid:** Mirror the revoke precedent: throttle keyed on `operator.id` (server.js:6731), max ~5 per 15 min, and decide deliberately whether read routes stay unthrottled (the listing precedent says yes — no oracle per :6705-6706).
**Warning signs:** 429s in the operator's own session during testing.

## Code Examples

### Listing query shape (compose from verified primitives)
```sql
-- name, slug, member count, created date, creator (owner-membership join), archived
select w.id, w.slug, w.name, w.archived, w.created_at,
       (select count(*) from memberships m where m.workspace_id = w.id) as member_count,
       owner_u.name as creator_name, owner_u.email as creator_email
  from workspaces w
  left join memberships owner_m on owner_m.workspace_id = w.id and owner_m.role = 'owner'
  left join users owner_u on owner_u.id = owner_m.user_id
 order by w.created_at, w.name collate nocase
```
[VERIFIED primitives: workspaces columns server.js:362-371; memberships role domain server.js:375; membersOf join shape server.js:3289-3297. The LEFT JOIN itself is [ASSUMED] composition — planner/task verifies against `collate nocase` index behavior.]

### Archived gate in requireWorkspace (insertion point verified)
```js
// server.js:4861-4877 — insert after the membership check, before the rank check:
if (ws.archived === 1) {
  return fail(res, 403, 'workspaceArchived', 'This workspace is archived'), null;
}
```
(Exact insertion point and whether operators bypass are planner decisions; D-02 says members "simply can't enter" — the operator reaches workspace data only through governance routes, so no bypass is needed. The `return fail(...), null` shape matches the existing funnel's style of returning null after fail — :4868-4876.)

### Orphan disposition payload (client-facing, D-05/D-08)
```json
{ "members": [{ "userId": "...", "name": "...", "email": "...", "role": "member" }],
  "targets": [{ "id": "...", "name": "...", "slug": "...", "memberCount": 4 }] }
```
`targets` = all workspaces from the same operator listing minus the one being deleted (D-08: name + member count). Role options are the existing membership role domain minus viewer for this flow: `owner/admin/member` [VERIFIED: server.js:375 role check — `check (role in ('owner','admin','member','viewer'))`; the D-08 role list excludes viewer per CONTEXT].

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Operator promote/demote UI in Settings console (Phase 78) | Relocated into governance page (D-01) | This phase | settings.js loses the card; endpoints unchanged |
| Workspace delete: owner-only, any content | Governance delete: operator-only, empty-only + archived alternative | This phase | Two independent delete paths coexist (owner DELETE untouched — no decision changes it) |
| No workspace listing beyond membership | Instance-wide operator listing | This phase | New no-oracle read route family |

**Deprecated/outdated:** none — no in-repo pattern is removed except the Settings card location (D-01).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `adapterEnsureColumn` accepts `integer not null default 0` for a new workspaces column (pattern copied from users.is_instance_admin) | Standard Stack / Pattern 2 | Migration fails at boot — trivially fixed by matching the exact precedent def |
| A2 | Governance action routes resolve the workspace by id with `db.get` instead of `requireWorkspace` | Pitfall 3 | Wrong choice makes unarchive impossible or leaks 404s to the operator |
| A3 | Empty = no projects (and no tasks) in the RAW stored doc | Don't Hand-Roll / Pitfall 5 | Too-strict definition refuses deletable shadow workspaces; too-loose wipes real content (D-03 violation) |
| A4 | Reassignment to a workspace where the user already has a membership → keyed refusal (not silent upsert) | Pitfall 6 | UX surprise; planner may ratify upsert instead |
| A5 | Boot fallback (`firstWorkspace`) should also skip archived workspaces | Pitfall 4 | Member auto-enters archived ws → immediate refusal (caught by tests if wrong) |
| A6 | Delete cascades cover the same table set as the existing owner DELETE; no extra cleanup invented | Pitfall 7 | Orphaned rows in non-FK tables — pre-existing behavior, not a regression |
| A7 | Listing read route carries no throttle (mirrors Phase 78 read precedent) | Pattern 1 | Minor — an operator hammering refresh is not a threat model |
| A8 | Listing SQL LEFT JOIN composition (creator via owner-membership) is correct as written | Code Examples | Wrong creator attribution — caught by the creator test |

## Open Questions

1. **Should the owner-scoped `DELETE /api/workspaces/:slug` also gain the empty-only constraint?**
   - What we know: D-03 scopes the rule to "the endpoint refuses" in the governance context; the existing owner DELETE (server.js:7137) deletes any workspace with content and no decision changes it.
   - What's unclear: whether the owner retains the wider right (likely — it predates this phase and nothing in CONTEXT touches it).
   - Recommendation: leave untouched; document the asymmetry in the route comment; flag to the owner at verify if it feels wrong.

2. **HTTP status for archived slug entry — 403 or 410?**
   - What we know: D-02 says "keyed 'workspace archived' refusal"; the codebase's refusal vocabulary uses 403 for gate refusals and 404 for missing.
   - What's unclear: whether the client distinguishes "archived" from other 403s (it does — via the `code` field, like `dashboard.js:84` keys off status).
   - Recommendation: 403 + `workspaceArchived` code; consistency beats REST pedantry here.

3. **Where in the sidebar the governance item sits.**
   - What we know: D-11 says "slot in the Phase 60 power-admin admin area"; the dashboard nav lives in the workspace group (layout.js:176), but governance is instance-scoped, not workspace-scoped.
   - What's unclear: exact nav placement/label (new "instance" group vs. beside dashboard).
   - Recommendation: planner decides under discretion; the route id, lazy import, and `isInstanceAdmin` gate are the fixed parts.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node (server + tests) | everything | ✓ | repo-standard | — |
| node:test runner | new test suites | ✓ | built-in (`node --test`) | — |
| SQLite (node:sqlite) | harness + migration | ✓ | built-in adapter | pg adapter ( dialect-owned, both supported) |
| No external packages | — | n/a | — | zero new dependencies (standing constraint) |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in), spawn-per-suite server harness |
| Config file | none — suites self-contained; shared harness `test/helpers/server.mjs` |
| Quick run command | `node --test test/governance.test.mjs` |
| Full suite command | `node --test test/` (existing convention; suites spawn isolated servers on ephemeral ports) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WSG-07 | operator → 200 listing with ALL workspaces incl. non-member/shadow; non-operator → EXACT 403 operatorOnly (never 404/empty-200); payload fields name/slug/memberCount/creator/createdAt | unit (server) | `node --test test/governance.test.mjs` | ❌ Wave 0 |
| WSG-08 | archive hides from member listing + slug entry 403 workspaceArchived; unarchive restores; delete refuses non-empty (workspaceNotEmpty); delete blocked while dispositions missing; delete executes with full dispositions, audit rows written; release/reassign membership effects | unit (server) | `node --test test/governance.test.mjs` | ❌ Wave 0 |
| WSG-08 | audit_log rows present for archive/unarchive/delete/reassign/release in same tx (rollback-on-audit-failure if pattern allows) | unit (server) | `node --test test/governance.test.mjs` | ❌ Wave 0 |
| WSG-09 | promote/demote via existing endpoints still work; settings.js no longer renders operatorCard (client-surface pin); governance page renders the operator section for isInstanceAdmin only | unit (client-surface) | `node --test test/governance-client.test.mjs` | ❌ Wave 0 |
| WSG-11 | every new refusal key present in all 5 catalogues same commit | unit | `node --test test/catalogue.test.mjs` | ✅ existing |
| — | migration: pre-column DB boots and gains `archived` default 0 | unit | `node --test test/migration.test.mjs` (pattern) | ❌ Wave 0 (extend or new suite) |

### Sampling Rate
- **Per task commit:** `node --test test/governance.test.mjs` (+ catalogue after any locale edit)
- **Per wave merge:** full `node --test test/`
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/governance.test.mjs` — server suite (WSG-07/08 gate matrix + actions + audit)
- [ ] `test/governance-client.test.mjs` — client-surface suite (settings.js:253 removal pin + governance render gate)
- [ ] Migration assertion for `adapterEnsureColumn('workspaces','archived',...)` (extend `test/migration.test.mjs` pattern or cover inside governance suite with a pre-column DB fixture)

## Security Domain

security_enforcement absent from `.planning/config.json` → enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes (existing) | session cookie + `requireUser` — reused, no new auth surface |
| V3 Session Management | no (no new session behavior) | — |
| V4 Access Control | **yes — the core of this phase** | `isInstanceAdmin` DB-flag gate (D-112) at family level; exact-403 matrix tests; no workspace-existence oracle (D-09) |
| V5 Input Validation | yes | `sameOrigin` first (Pitfall 22); slug-confirm string compare for type-to-confirm; role whitelisted against the existing role domain; `readJson` body shape checks |
| V6 Cryptography | no | — |
| V14 / Audit | yes | audit_log row in same `db.tx` (AUD-01/D-R3); destructive verbs enumerated |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Workspace-existence oracle via differential responses (404 vs 403 timing/shape for non-operators) | Information Disclosure | operator gate BEFORE target lookup (Phase 78 shape, :6776 comment); single refusal shape |
| Governance action CSRF | Tampering / Elevation | `sameOrigin` first statement on every route (repo-wide doctrine) |
| Mass-assignment on reassign payload (role injection) | Elevation | whitelist role against the DB CHECK domain (server.js:375); never pass body.role unchecked |
| Content wipe via governance delete | Tampering / Repudiation | empty-check on raw doc (D-03) + type-to-confirm slug (D-04) + audit row in tx (D-R3) |
| Throttle-budget theft via cross-origin POST | DoS | sameOrigin before throttle (Pitfall 22 comment :6730-6731) |

## Sources

### Primary (HIGH confidence)
- In-repo reads this session: server.js (4831-4919, 615-689, 915-1000, 3289-3328, 4655-4696, 6100s delete/PATCH, 6703-6857, 6876-7004, 8855-8924); src/pages/settings.js (245-319); src/pages/dashboard.js (full); src/shell/layout.js (150-229); src/shell/render.js (20-80); src/actions/actions.js (2700-2810, 3975-4054); src/core/api.js (145-184); src/locales/en.json (operator + err keys); test/helpers/server.mjs; .planning/config.json; REQUIREMENTS.md; STATE.md; PROJECT.md/ROADMAP.md excerpts via grep
- .planning/phases/79-governance-surface/79-CONTEXT.md (D-01..D-11, verbatim)

### Secondary (MEDIUM confidence)
- .planning/milestones/v2.2-phases/60-* (Phase 60 dashboard route/power-admin ruling — via planning-doc grep, quotes cross-checked against live code where cited)

### Tertiary (LOW confidence)
- None — no external/web sources used; all claims are in-repo.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every primitive read and quoted verbatim this session
- Architecture: HIGH — route family, migration, funnel and relocation patterns all precedented in-tree
- Pitfalls: HIGH for in-repo facts (creator gap, PK collision, cascade coverage, guard order); MEDIUM for the discretionary calls flagged in Assumptions A3/A4/A5

**Research date:** 2026-11-20
**Valid until:** 2026-12-20 (stable in-repo domain; no external dependency drift possible under the zero-deps constraint)
