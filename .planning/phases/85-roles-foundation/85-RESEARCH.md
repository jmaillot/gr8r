# Phase 85: Roles Foundation - Research

**Researched:** 2026-11-21
**Domain:** Server-side RBAC (instance roles), operator API routes, gated UI surface — all internal patterns; the v3.2 `groups.js` template copied verbatim per ROADMAP
**Confidence:** HIGH

## Summary

Phase 85 is a pattern-replication phase, not a novel-engineering phase. The CONTEXT decisions (D-01..D-36) are fully prescriptive and every pattern they reference exists in the codebase today and was read this session: the group-mapping table conventions (server.js:645-656), the CHECK-widening rebuild migration (server.js:715-740), the pure-logic domain module + pin-test convention (`groups.js` / `test/groups-core.test.mjs` / `test/db-adapter.test.mjs`), the operator route guard order (server.js:7052-7084, 7476-7498), the audit funnel (same-tx `audit_log` insert with snapshot columns, server.js:7095-7110; plus `logSecurity`, server.js:5063), the user-payload flag build (server.js:1052-1062), and the flag-gated nav/page client pattern (src/shell/layout.js:187-192, src/pages/governance.js).

No external packages are involved (standing constraint D-33-11: zero new npm dependencies; this phase needs none anyway). No external docs were needed — every discrete value cited below was read from source this session.

**Primary recommendation:** Build exactly to the CONTEXT decision list. New `roles.js` pure module next to `groups.js` (same bundling exclusion rule), new `instance_roles` table in the SCHEMA block + dual-mirror pin test, `hasInstanceRole(userId, capability)` funnel with the Super-Admin short-circuit INSIDE, three operator routes guarded in Phase 83 D-05 order, capability flags in `userPayload`, one shared top-level Backup page, and one Instance Roles tab in governance.js — each with its i18n keys in all 5 locales in the same commit.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
D-01 through D-36 as written in `85-CONTEXT.md` (verbatim authority). Highlights the planner MUST honor:

- **D-01:** `instance_roles.role` is a CHECK-constrained enum: `CHECK (role in ('backup_operator','restore_operator'))`. Widen later via the rebuild-migration pattern (server.js:717 precedent).
- **D-02:** One row per (user_id, role); both roles allowed as two rows; revoke = delete row. Shape is load-bearing (reversibility: costly).
- **D-03:** Row carries `id, user_id (unique per role), role, granted_by (user id), granted_at` — group-mapping table conventions + dual mirror + pin test.
- **D-04:** `ON DELETE CASCADE` via the user_id FK.
- **D-05:** Granting a role to a Super Admin (`is_instance_admin=1`) refused with keyed localized refusal.
- **D-06:** No self-guard — roles never affect Super Admin authority.
- **D-07:** Grant target pool = users from `GET /api/auth/operator/users` (D-121) only.
- **D-08:** Duplicate grant → keyed refusal; UI highlights the existing row.
- **D-09:** Capability-level API: `hasInstanceRole(userId, capability)` — callers never see raw role slugs.
- **D-10:** Four capability constants: `BACKUP_MANAGE`, `RESTORE_USE`, `ARCHIVE_READ` (defined but granted to NO role), `INSTANCE_ROLES_MANAGE` (never in the map — Super-Admin short-circuit only).
- **D-11:** Map: `backup_operator ⇒ [BACKUP_MANAGE]`, `restore_operator ⇒ [RESTORE_USE]`. One-way (this IS the restore-authority ≠ archive-read-authority encoding).
- **D-12:** Super-Admin short-circuit INSIDE the funnel, before any table lookup.
- **D-13:** Funnel lives in new `roles.js` domain module alongside groups.js — pure logic, unit-tested independently of server.js.
- **D-14:** Direct DB query per call, no caching.
- **D-15:** Role names surface via i18n labels only — no DB role catalog.
- **D-16:** Routes: `GET/POST /api/auth/operator/instance-roles`, `DELETE /api/auth/operator/instance-roles/:id`; Phase 83 D-05 guard order exactly (sameOrigin → requireUser → operator-keyed throttle → `is_instance_admin` gate BEFORE any target lookup → target fetch).
- **D-17:** Grant/revoke is Super-Admin-only.
- **D-18:** Grants/revokes audit-logged through the existing audit funnel (same-tx audit row), not bare logInfo.
- **D-19:** Stub `GET /api/backup/tasks` returns `[]` behind the gates so refusals have real endpoints.
- **D-20..D-28:** Backup surface = real page + empty state; top-level nav entry "Backup" (not inside Governance); ONE shared surface for both operators; capability flags in server payload (`canBackup`/`canRestore` indicative); stub response carries flags; revocation applies on next load; non-holder deep-link = 403 keyed refusal; page at `src/pages/backup.js` following governance.js patterns; all new i18n keys in all 5 locales in the same commit.
- **D-29..D-34:** Instance Roles tab on governance page: membership table + grant modal (Phase 84 assignee-picker pattern), inline-confirm revoke + toast (D-90 pattern), compact recent-activity section (audit rows), granted_by resolved server-side, standard governance empty state.
- **D-35:** Pin tests: (a) Restore Operator ⇒ RESTORE_USE, NEVER ARCHIVE_READ; (b) `is_instance_admin` user with zero rows holds every capability; no list response contains an implicit entry.
- **D-36:** Full e2e set: grant → surface + stubs; revoke → gone on next load; Restore Operator refused on task-edit stubs with keyed message; Backup Operator cannot grant/revoke; non-holder deep-link 403.

### the agent's Discretion
- Exact capability flag names in the user payload (canBackup/canRestore indicative)
- Exact wording of new i18n keys and refusal messages (keyed vocabulary applies)
- Visual treatment of role badges and grant modal chrome (mirrors assignee picker)
- Chunk-gating decision for src/pages/backup.js (66-03 size precedent)
- Exact audit funnel event naming for grants/revokes (consistency with Phase 80-82 events)

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BKROLE-01 | Grant/revoke Backup & Restore Operator roles from Instance Roles tab; grantees see surfaces; revocation on next load; Super Admins implicit | D-01..D-09 routes/funnel; D-20..D-28 surface; D-14 no caching gives next-load revocation; D-12 implicit membership |
| BKROLE-02 | Backup Operator = full task management; Restore Operator = browse/preview/restore, no task editing; Backup Operator cannot grant/revoke roles | D-10/D-11 capability map; D-16/D-17 route gates; D-19 stub endpoints exercise the refusal path; D-35 pin test (a) |
| BKROLE-03 | Every grant/revoke audit-logged through existing audit funnel | D-18; verified audit pattern: same-tx `audit_log` insert (server.js:7095-7110) + `logSecurity` (server.js:5063) + mapping-save precedent (server.js:7518-7521) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Role storage (instance_roles table) | Database/Storage (server.js SCHEMA + db-adapter dual mirror) | — | D-03: dual-mirror SQLite/Postgres table with pin test, exactly like group_mappings |
| hasInstanceRole funnel | API/Backend (roles.js pure module + server.js wiring) | — | D-13: pure logic module, unit-tested independent of server.js; client never computes roles |
| Grant/revoke/list routes | API/Backend (server.js operator route family) | — | D-16: operator-only guard order; client gating is cosmetic (T-78-05 doctrine) |
| Capability flags in payloads | API/Backend (userPayload + stub response) | Browser (render-only) | D-23: "no client-side role logic" — client renders flags verbatim |
| Instance Roles tab | Browser (governance.js) | API (new GET data) | D-29: renders from server payload; esc() text nodes only |
| Backup surface | Browser (src/pages/backup.js) | API (stub GET /api/backup/tasks) | D-20/D-27: page + empty state, gated actions |
| Audit trail for grants/revokes | API/Backend (same-tx audit_log row) | — | D-18/BKROLE-03 |

## Standard Stack

### Core
Zero new dependencies (D-33-11; this phase needs none). Everything is stdlib + existing in-repo modules:

| Asset | Location | Purpose | Why Standard |
|-------|----------|---------|--------------|
| groups.js template | `/groups.js` (repo root, NOT src/) | The verbatim template: pure module, no Vite bundling, injected DB, refusal funnel | ROADMAP designates it; D-13 copies it |
| db-adapter dual mirror | `/db-adapter.mjs` (`pgSchemaVariant`, line 419) | SQLite/Postgres schema branching | D-03 dual-mirror convention |
| node:test + assert/strict | `test/*.test.mjs` | Unit/pin/e2e tests | Project standard (`npm test` = `node --test --test-concurrency=2 test/*.test.mjs`) |

**Installation:** none.

**Version verification:** SKIPPED — no packages installed this phase (D-33-11 verified: v3.3 standing constraint, and CONTEXT specifies no new dependencies).

## Package Legitimacy Audit

> No external packages are installed in this phase — zero-dependency standing constraint (D-33-11). Audit table intentionally empty.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Operator (Super Admin)                        Regular user
     │                                              │
     ▼                                              ▼
Instance Roles tab (governance.js)           Backup route (backup.js)
     │  grant/revoke modal,                        │  renders from payload flags
     │  inline-confirm revoke                      │  (canBackup/canRestore)
     ▼                                              ▼
POST/DELETE /api/auth/operator/instance-roles   GET /api/backup/tasks (stub → [])
     │                                              │
     │  guard order (D-16/D-05):                    │  gate: hasInstanceRole(user,
     │  sameOrigin → requireUser →                  │    BACKUP_MANAGE|RESTORE_USE)
     │  throttle → isInstanceAdmin gate             │
     │  BEFORE target lookup                        │
     ▼                                              ▼
                roles.js hasInstanceRole(userId, capability)
                ┌─ isInstanceAdmin ⇒ true (short-circuit, D-12)
                └─ else: SELECT role FROM instance_roles
                        WHERE user_id=?  → capability map (D-11)
     │
     ├─ same-tx audit_log row (D-18, BKROLE-03)
     └─ refusal funnel {code,message} → fail(res,400,code,msg) → err.<code> ×5 locales
```

Revocation visibility: payload flags recompute per load (D-14/D-25) — no live push.

### Recommended Project Structure
```
roles.js                    # NEW: pure capability module (repo root, beside groups.js; NOT src/)
server.js                   # SCHEMA block: instance_roles table; operator routes; userPayload flags; stub
src/pages/backup.js         # NEW: gated Backup page (governance.js patterns)
src/pages/governance.js     # ADD: Instance Roles tab/card
src/shell/render.js         # ADD route id + icon (ROUTE_IDS / ROUTE_ICONS)
src/shell/layout.js         # ADD flag-gated nav entry (instance group, line 187-192 pattern)
src/core/api.js             # surface capability flags from state.user
src/locales/{en,fr,nl,de,es}.json  # all new keys, 5 locales, same commit (D-28)
test/roles-core.test.mjs    # NEW pin tests (D-35a)
test/db-adapter.test.mjs    # ADD instance_roles DDL pin (mirror of group_mappings test, line 306)
test/instance-roles-api.test.mjs  # NEW e2e (D-36)
```

### Pattern 1: Pure domain module with refusal funnel (groups.js, verbatim template)
**What:** Repo-root module, NOT under src/ so Vite never bundles it; no process.env reads; DB injected by caller; exports pure functions + a `{code,message}|null` refusal funnel; route calls `fail(res, 400, code, message)` with EXPLICIT key/message at the call site (server.js:7486-7490 precedent).
**When to use:** roles.js — capability constants, the role→capability map, `hasInstanceRole` (pure map-resolution part), grant/refusal validation.
**Example:**
```js
// groups.js:54-56 shape (verbatim template)
export function guidRefusal(raw, code = 'groupMappingBadGuid', message = '...') {
  return canonicalizeGuid(raw) ? null : { code, message };
}
```
**Key structural rule [VERIFIED: groups.js:1-20]:** module header documents "NOT under src/ so Vite never bundles it (same rule as oidc.js / totp.js / mailer.js); no process.env reads; DB access is injected by the caller (never imported here)."

### Pattern 2: Table definition + dual-mirror pin test (group_mappings, verbatim template)
The SCHEMA block comment style and shape to copy [VERIFIED: server.js:645-656]:
```sql
create table if not exists group_mappings (
  id           text primary key,
  group_guid   text not null,
  workspace_id text not null,
  role         text not null check (role in ('owner','admin','member')),
  ...
  created_by   text references users(id) on delete set null,
  created_at   integer not null,
  updated_at   integer not null
);
create unique index if not exists group_mappings_pair on group_mappings(group_guid, workspace_id);
```
The pin test lives in test/db-adapter.test.mjs — it round-trips an insert, exercises the CHECK refusal, and verifies the unique pair [VERIFIED: test/db-adapter.test.mjs:268,306-333]. The pg mirror needs no separate variant for this shape (group_mappings is NOT in any pg-specific variant list; `pgSchemaVariant` handles collation/epoch widening generically [VERIFIED: db-adapter.mjs:419,442-445]).

**D-04 note (FK cascade):** group_mappings' user reference uses `on delete set null` for created_by (creator is metadata). instance_roles' user_id must use `on delete cascade` per D-04 — rows vanish with the deleted account. Do not copy the set-null semantics blindly; only the column/audit conventions transfer.

### Pattern 3: Operator route guard order (Phase 83 D-05, verbatim) [VERIFIED: server.js:7476-7498]
```js
if (pathname === '/api/governance/group-mappings' && method === 'POST') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const operator = await requireUser(req, res);
  if (!operator) return;
  if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
  const body = await readJson(req);
  // ... validation funnel BEFORE any write ...
}
```
Throttle shape (write routes): `if (tooMany(\`operator-revoke|${operator.id}\`, 5, 15*60*1000)) return fail(res, 429, 'tooManyAttempts', ...)` — keyed on the caller, consumes a try even on 403 [VERIFIED: server.js:7078-7082]. Read routes carry NO throttle [VERIFIED: server.js:7053-7055].

### Pattern 4: Audit funnel (BKROLE-03) — two layers, both existing
1. **`logSecurity(userId, verb)`** — one-liner insert into security_log [VERIFIED: server.js:5063-5065]:
```js
async function logSecurity(userId, verb) {
  await db.run('insert into security_log (id, user_id, verb, created_at) values (?,?,?,?)', [uid(), userId, verb, now()]);
}
```
2. **Same-tx audit_log row** — the promotion/revocation path writes the mutation and the audit row inside ONE `db.tx`; "a forced audit failure rolls back the entire revocation" [VERIFIED: server.js:7092-7110]. Insert columns (verbatim [VERIFIED: server.js:7101]): `id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at` — actor/target name+email are snapshot columns so the trail survives deletion [VERIFIED: server.js:461-464].
3. **Mapping-save precedent** (the "Phase 80-82 helper" CONTEXT D-18 names): `logSecurity(operator.id, 'group_mapping_saved')` + a logInfo line, placed after the write [VERIFIED: server.js:7518-7521]. For instance-roles grants/revokes, use the *stronger* pattern: the write + audit row in one `db.tx` (D-02 uniqueness makes revoke a row delete worth transactional pairing), with action names in the family style: `instance_role_granted` / `instance_role_revoked` (discretion item — match the snake_case family: `group_mapping_saved`, `sessions_revoked_by_operator`).

### Pattern 5: Payload capability flags (D-23) [VERIFIED: server.js:1052-1062]
`userPayload` already emits `isInstanceAdmin: !!user.is_instance_admin` (line 1059). Add capability flags computed from `hasInstanceRole(user.id, ...)` alongside it. Client reads them off `state.user` via api.js getters (pattern: `get canCreateWorkspace()` reading `state.user?.isInstanceAdmin`, [VERIFIED: src/core/api.js:164-168]).

### Pattern 6: Flag-gated nav + route registration
- ROUTE_IDS array + ROUTE_ICONS map in render.js [VERIFIED: src/shell/render.js:21-67]; governance is registered at render.js:43/66 and lazy-loaded in layout.js:70.
- Nav entry gated on the payload flag, comment doctrine "UX gate only — the server 403 is the control" [VERIFIED: src/shell/layout.js:189-191]:
```js
${api.user?.isInstanceAdmin ? sItem('governance', routeName('governance'), 'scale') : ''}
```
The Backup entry gates on `(api.user?.canBackup || api.user?.canRestore)` (or the discretion-named flags) — visible to BOTH operator roles per D-21/D-22.

### Pattern 7: Governance page tab + inline-confirm + audit-activity section
governance.js renders ONLY from server responses (never the client document), full403/fullErr fullstates, esc() everywhere, no auto-poll [VERIFIED: src/pages/governance.js:1-21,33-51]. The dead-mapping trail pattern (Phase 83) is the model for D-32's recent-activity section: server returns bounded, newest-first audit rows [VERIFIED: server.js:7544-7549].

### Anti-Patterns to Avoid
- **Client-side role logic:** the client never derives capabilities from role slugs — server payload flags only (D-23).
- **Free-text role slugs:** CHECK enum only; a typo'd role silently matches nothing (D-01 rationale).
- **Filtering Super Admins out of the membership list:** structural prevention (D-05 refuse + D-12 short-circuit), never post-hoc filtering.
- **Caching capability flags:** direct DB query per call (D-14); caching breaks next-load revocation.
- **Existence oracle:** the operator gate runs BEFORE any target lookup (D-16/T-80-04).
- **Bare logInfo for audit:** BKROLE-03 names the funnel; logInfo is additive, never a substitute (mapping-save precedent uses it only as a bonus line).
- **ARCHIVE_READ mapped to a role:** reserved constant, zero mappings in Phase 85 (D-10/D-11, roadmap SC5).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQLite/Postgres schema branching | Dialect-specific DDL | db-adapter `pgSchemaVariant` (generic widening) | Already handles nocase/epoch-ms; group_mappings needed no variant |
| Refusal message vocabulary | Ad-hoc error strings | `{code,message}` funnel + `fail()` + 5-locale keyed errs | error-codes.test.mjs pins locale coverage |
| Audit trail | New logging table | Existing audit_log + logSecurity | Snapshot columns, same-tx discipline already built |
| Grant user picker | New user search | `GET /api/auth/operator/users` (D-07) | No new enumeration surface |
| Grant modal | New dialog system | Phase 84 assignee-picker modal pattern | D-30; confirm-to-apply, searchable |
| Relative time | Custom formatter | `ago()` from core/utils.js (governance.js imports it) | D-33 |
| Route teardown | Manual cleanup | ROUTE_TEARDOWN registry | render.js:69-74 |

## Runtime State Inventory

Not a rename/refactor/migration phase — new table only. All categories:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — new `instance_roles` table created empty at boot via SCHEMA; no backfill | None |
| Live service config | None — no external services involved | None |
| OS-registered state | None | None |
| Secrets/env vars | None — no new env reads (roles.js forbids process.env reads per groups.js rule) | None |
| Build artifacts | None — new module joins the existing build; no package changes | None |

## Common Pitfalls

### Pitfall 1: Super Admin appears in (or is demotable from) the membership list
**What goes wrong:** a grant row on an `is_instance_admin=1` user makes them listable and revocable — violating roadmap SC3.
**Why:** table allows any user_id; the funnel would otherwise consult rows for admins.
**How to avoid:** D-05 keyed refusal on the grant route when target is_instance_admin=1, AND D-12 short-circuit before any table lookup. Pin test D-35b: admin with zero rows holds every capability.
**Warning signs:** any code path that queries instance_roles for an admin user.

### Pitfall 2: ARCHIVE_READ leaks into restore_operator
**What goes wrong:** someone maps ARCHIVE_READ "temporarily" for convenience — the roadmap's restore-authority ≠ archive-read-authority encoding (SC5) silently rots.
**How to avoid:** D-35a pin test: Restore Operator ⇒ RESTORE_USE and NEVER ARCHIVE_READ; no capability-map entry contains ARCHIVE_READ in Phase 85.
**Warning signs:** any second capability in the restore_operator map.

### Pitfall 3: Revocation doesn't stick until cache expiry
**What goes wrong:** caching roles/capabilities makes revocation lag, failing criterion 1's "next load".
**How to avoid:** D-14 — direct indexed query per call; flags recompute per payload load (D-25). No in-memory cache, no session snapshot.
**Warning signs:** any `const caps = ...` memoization on a per-session object.

### Pitfall 4: Existence oracle in grant route
**What goes wrong:** target lookup before the admin gate lets non-admins probe which user ids exist (differing 404 vs 403).
**How to avoid:** D-16 guard order verbatim — isInstanceAdmin gate BEFORE target fetch (server.js:7480-7483 verbatim precedent).
**Warning signs:** a `db.get('users...')` above the operatorOnly check.

### Pitfall 5: i18n keys not in all 5 locales / landing late
**What goes wrong:** an emitting gate lands with missing locale keys → broken `t()` output or a failed i18n-scan test.
**How to avoid:** D-28 — nav label, page title, empty state, and EVERY new keyed refusal (role-required 403, Restore-Operator task-edit refusal, Super-Admin-grant refusal, duplicate-grant refusal) land in en/fr/nl/de/es in the same commit. error-codes.test.mjs and i18n-scan.test.mjs enforce vocabulary discipline.
**Warning signs:** `npm test` failures in error-codes/i18n tests after adding a `fail()` code.

### Pitfall 6: roles.js gets bundled into the client
**What goes wrong:** placing the module under src/ makes Vite bundle server logic (and process leaks).
**How to avoid:** repo root beside groups.js; copy the groups.js header rule verbatim (groups.js:1-20).
**Warning signs:** vite chunk report containing capability constants.

### Pitfall 7: Chunk-size regression from new page
**What goes wrong:** backup.js added to the entry chunk blows the chunk-size pin test (build-chunk-size.test.mjs exists).
**How to avoid:** lazy-load via `lazy(() => import('../pages/backup.js'), 'pageBackup')` exactly like governance (layout.js:70); chunk-gate if size demands (D-27, 66-03 precedent).
**Warning signs:** build-chunk-size / client-surfaces test failures.

## Code Examples

### The capability funnel (D-09..D-12) — recommended roles.js shape
```js
// roles.js — pure module beside groups.js (same bundling/ purity rules)
export const CAP = { BACKUP_MANAGE: 'backup_manage', RESTORE_USE: 'restore_use',
                     ARCHIVE_READ: 'archive_read', INSTANCE_ROLES_MANAGE: 'instance_roles_manage' };
const ROLE_CAPS = { backup_operator: [CAP.BACKUP_MANAGE], restore_operator: [CAP.RESTORE_USE] };
// D-11: ARCHIVE_READ deliberately mapped to NO role; INSTANCE_ROLES_MANAGE never in the map.

export function capabilitiesFor(isInstanceAdmin, roles) {
  if (isInstanceAdmin) return Object.values(CAP);            // D-12 short-circuit BEFORE rows
  const caps = new Set();
  for (const r of roles) for (const c of ROLE_CAPS[r] || []) caps.add(c);
  return [...caps];
}
```
Server wiring (D-14, no caching) then does the DB lookup and passes the rows into the pure function — the same injected-DB split groups.js uses.

### Stub backup gate (D-19/D-24)
```js
if (pathname === '/api/backup/tasks' && method === 'GET') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const user = await requireUser(req, res); if (!user) return;
  // D-26: non-holder → 403 + NEW keyed refusal (not err.operatorOnly — it is a role gate, not an operator gate)
  const restore = await hasInstanceRole(user.id, CAP.RESTORE_USE);
  const backup  = await hasInstanceRole(user.id, CAP.BACKUP_MANAGE);
  if (!restore && !backup) return fail(res, 403, 'backupRoleRequired', 'A Backup or Restore Operator role is required');
  return json(res, 200, { tasks: [], canBackup: backup, canRestore: restore });
}
```
Task-editing stubs (POST/PUT/DELETE under /api/backup/*) gate on BACKUP_MANAGE only and refuse a Restore Operator with the D-19/D-28 keyed localized refusal — real endpoints so D-36's refusal e2e has something to refuse from.

### Grant route refusal funnel (D-05/D-08)
```js
if (target.is_instance_admin) return fail(res, 400, 'instanceRoleAdminImplicit', 'Super Admins hold every role implicitly'); // D-05
const dup = await db.get('select 1 from instance_roles where user_id = ? and role = ?', [targetId, role]);
if (dup) return fail(res, 400, 'instanceRoleDuplicate', 'That user already holds this role'); // D-08
```
(Exact code strings are discretion items — keyed vocabulary applies; all five land in 5 locales same-commit.)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Boolean role columns | Extensible `instance_roles` table + capability funnel | D-33-4 ratified 2026-11-21 | This phase's whole design; roles widen via CHECK rebuild, never new columns |
| Env-based admin | DB-flag `is_instance_admin` sole instance tier | Phase 22 D-112 | Funnel reads the flag only (server.js:4972-4977) |
| Role slugs reaching callers | Capability-level API | This phase D-09 | Call sites survive Phase 90 role additions unchanged |

**Deprecated/outdated:** nothing this phase retires; strictly additive.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | group_mappings needs no pg-specific schema variant entry (generic `pgSchemaVariant` widening suffices for the instance_roles shape too) | Pattern 2 | A pg variant tweak needed at test time — cheap, additive, caught by db-adapter pin test |
| A2 | Audit action names `instance_role_granted`/`instance_role_revoked` (snake_case family) — discretion item, not yet fixed | Pattern 4 | Cosmetic; renaming later touches only the emit site + D-32 list filter |
| A3 | `hasInstanceRole` server wiring signature `(userId, capability)` does an async DB all() then calls the pure `capabilitiesFor` — exact split within roles.js vs server.js is planner's call | Code Examples | None — pure/persistence split is already locked at the module level (D-13) |

## Open Questions

1. **Does the Instance Roles tab data ride a new GET route or extend an existing one?**
   - What we know: D-16 fixes only GET/POST/DELETE on `/api/auth/operator/instance-roles`; the GET must also return the D-32 recent-audit section and resolved granted_by display names (D-33).
   - What's unclear: whether D-32's audit section rides the same GET response (recommended — one fetch, matches dead-mappings `{orphans, trail}` shape at server.js:7549) or a separate endpoint.
   - Recommendation: single GET returning `{ rows, recent }` — the dead-mappings route precedent.

2. **Route placement of task-edit stubs.**
   - What we know: D-19 fixes `GET /api/backup/tasks`; the refused task-edit endpoints are unnamed.
   - Recommendation: stub `POST /api/backup/tasks` returning the keyed refusal behind the BACKUP_MANAGE gate — enough surface for D-36's Restore-Operator-refusal test without inventing Phase 87's contract.

## Environment Availability

Phase has no external dependencies beyond the existing runtime.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node:test runner | all tests | ✓ | bundled with node (existing suite runs today) | — |
| SQLite / pg adapters | dual mirror | ✓ | existing db-adapter.mjs | — |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test + node:assert/strict (existing suite) |
| Config file | none — glob runner: `node --test --test-concurrency=2 test/*.test.mjs` [VERIFIED: package.json scripts.test] |
| Quick run command | `node --test test/roles-core.test.mjs test/db-adapter.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BKROLE-01 (D-35b) | Admin with zero rows holds every capability; no implicit entry in list | unit (pin) | `node --test test/roles-core.test.mjs` | ❌ Wave 0 |
| BKROLE-02 (D-35a) | restore_operator ⇒ RESTORE_USE, never ARCHIVE_READ; ARCHIVE_READ in no map | unit (pin) | `node --test test/roles-core.test.mjs` | ❌ Wave 0 |
| D-03/D-04 | instance_roles DDL round-trip, 2-role CHECK, unique (user_id, role), FK cascade | unit (pin) | `node --test test/db-adapter.test.mjs` | ❌ add to existing file (group_mappings pin at line 306 is the template) |
| BKROLE-01 e2e | grant → surface+stubs; revoke → gone on next load; deep-link 403 | e2e (server guard harness) | `node --test test/instance-roles-api.test.mjs` | ❌ Wave 0 |
| BKROLE-02 e2e | Restore Operator refused on task-edit stub (keyed message); Backup Operator cannot grant/revoke | e2e | `node --test test/instance-roles-api.test.mjs` | ❌ Wave 0 |
| BKROLE-03 | grant/revoke audit row written in same tx; forced audit failure rolls back | e2e | `node --test test/instance-roles-api.test.mjs` | ❌ Wave 0 |
| D-28 | all new keys present ×5 locales | suite | `npm test` (error-codes/i18n-scan pick it up) | ✅ existing |
| chunk discipline | backup.js lazy, entry chunk not bloated | suite | `npm test` (build-chunk-size, client-surfaces) | ✅ existing |

### Sampling Rate
- **Per task commit:** quick command above (roles-core + db-adapter)
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green (note pre-existing failure: webhook-events.test.mjs "due task…exactly ONE due.reminder delivery" — carried debt from v3.1 [VERIFIED: STATE.md:122], not this phase's)

### Wave 0 Gaps
- [ ] `test/roles-core.test.mjs` — D-35 pin tests (pure module, no boot — groups-core.test.mjs template)
- [ ] `test/instance-roles-api.test.mjs` — D-36 e2e set (e2e-server-guard.test.mjs / groups-config-api.test.mjs harness patterns)
- [ ] db-adapter.test.mjs instance_roles DDL pin — added to existing file

## Security Domain

> security_enforcement: enabled (config absent = enabled). This phase IS a security phase — an authorization model.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes — the phase's core | `hasInstanceRole` funnel as single server-side gate (D-09); operator gate before target lookup (D-16); client gating cosmetic only |
| V2/V3 (Auth/Session) | partially | Existing requireUser/session machinery reused; no new auth surface |
| V5 Input Validation | yes | {code,message} refusal funnel validate-before-write (server.js:7485-7498 precedent); CHECK enum constraint |
| V7 Audit | yes | Same-tx audit_log row (BKROLE-03); snapshot name/email columns |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Privilege escalation via grant (granting roles to Super Admins creates a demotion vector) | Elevation | D-05 refusal + D-12 short-circuit; pinned by test |
| Existence oracle on grant/revoke | Information disclosure | Gate before target lookup (D-16, T-80-04) |
| CSRF on mutations | Tampering | sameOrigin() FIRST, before body read and throttle [VERIFIED: server.js:7074-7075] |
| Throttle bypass by alternate callers | DoS | operator-keyed throttle consuming a try even on 403 [VERIFIED: server.js:7078-7080] |
| Un-logged mutation | Repudiation | same-tx audit row; forced audit failure rolls back the write |
| Client-trust violation | Elevation | Payload flags render-only; every endpoint re-checks via the funnel |

## Project Constraints (from AGENTS.md)

No project-level CLAUDE.md/AGENTS.md beyond the global config was found affecting this phase; the standing GSD constraints apply (atomic commits, plan-before-code). Two global rules that bind implementation:
- No opportunistic repair outside scope (note observations, don't touch — e.g. the webhook-events pre-existing failure stays untouched).
- Verify before inventing: every new key/code/value added to locales must match the existing keyed-vocabulary discipline.

## Sources

### Primary (HIGH confidence)
- Direct reads this session: server.js (schema 637-656, rebuild 715-740, audit_log 461-480, userPayload 1052-1062, isInstanceAdmin 4972-4977, operator routes 7050-7110, mapping save 7466-7550, logSecurity 5063-5065), groups.js (full), src/pages/governance.js (1-80), src/shell/render.js (21-100), src/shell/layout.js (150-209), src/core/api.js (150-200), test/groups-core.test.mjs, test/db-adapter.test.mjs (306-333), package.json
- `.planning/phases/85-roles-foundation/85-CONTEXT.md` (D-01..D-36), `.planning/REQUIREMENTS.md` (BKROLE-01..03, D-33-1..12), `.planning/STATE.md`

### Secondary (MEDIUM confidence)
- None needed — no external tech in scope.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero deps; all patterns read from source
- Architecture: HIGH — verbatim template designated by roadmap, every referenced precedent located and quoted
- Pitfalls: HIGH — drawn from in-repo pin tests and established doctrine comments

**Research date:** 2026-11-21
**Valid until:** stable (internal patterns; 30+ days or until server.js drifts materially)
