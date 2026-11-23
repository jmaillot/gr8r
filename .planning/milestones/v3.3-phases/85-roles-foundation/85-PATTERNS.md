# Phase 85: Roles Foundation - Pattern Map

**Mapped:** 2026-11-21
**Files analyzed:** 14 (4 new, 10 modified)
**Analogs found:** 14 / 14 (all analogs git-tracked, verified via `git ls-files`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `roles.js` (NEW, repo root) | service (pure domain module) | transform (capability resolution) | `groups.js` | exact (roadmap-designated verbatim template) |
| `server.js` — `instance_roles` table in SCHEMA | model (schema) | CRUD | `server.js:645-656` group_mappings block | exact |
| `server.js` — operator instance-roles routes (GET/POST/DELETE) | route/controller | request-response | `server.js:7476-7525` mapping-save route; `server.js:7052-7070` operator users GET | exact |
| `server.js` — audit on grant/revoke | service (audit) | event-driven (same-tx write) | `server.js:7092-7114` session-revoke tx; `server.js:7518-7521` mapping-save logSecurity | exact |
| `server.js` — stub `GET /api/backup/tasks` + task-edit stub | route | request-response | `server.js:7476-7498` guard-order route shape | role-match (no /api/backup family exists) |
| `server.js` — userPayload capability flags | model (payload builder) | transform | `server.js:1052-1062` userPayload | exact |
| `server.js` — `hasInstanceRole` server wiring | service | CRUD (direct query, no cache) | `isInstanceAdmin` server.js:4975-4977 (flag read) + injected-DB split of groups.js | role-match |
| `src/pages/backup.js` (NEW) | component (page) | request-response | `src/pages/governance.js` | role-match (new surface, governance patterns per D-27) |
| `src/pages/governance.js` — Instance Roles tab | component (page section) | request-response | `src/pages/governance.js` existing cards/table | exact |
| `src/shell/render.js` — route id + icon | config (route registry) | — | `src/shell/render.js:21-67` | exact |
| `src/shell/layout.js` — Backup nav entry + lazy load | component (shell) | — | `src/shell/layout.js:70,187-192` governance entry | exact |
| `src/core/api.js` — capability flag getters | store/hook | — | `src/core/api.js:160-183` (canCreateWorkspace, canSuperAccess) | exact |
| `src/locales/{en,fr,nl,de,es}.json` | config (i18n) | — | existing keyed-err vocabulary (enforced by error-codes/i18n-scan tests) | exact |
| `test/roles-core.test.mjs` (NEW) | test (unit/pin) | — | `test/groups-core.test.mjs` | exact |
| `test/db-adapter.test.mjs` — instance_roles DDL pin | test (unit/pin) | — | `test/db-adapter.test.mjs:304-338` group_mappings DDL test | exact |
| `test/instance-roles-api.test.mjs` (NEW) | test (e2e) | — | `test/groups-config-api.test.mjs` | exact |

## Pattern Assignments

### `roles.js` (NEW — pure domain module, repo root)

**Analog:** `groups.js` (ROADMAP-designated verbatim template)

**Bundling/purity header rule** (groups.js:1-20 — copy verbatim, adapt wording):
```js
/* Pure server-side module: NOT under src/ so Vite never bundles it (same
   rule as oidc.js / totp.js / mailer.js); no process.env reads; DB
   access is injected by the caller (never imported here). */
```

**Refusal funnel shape** (groups.js:49-56):
```js
/* The house {code,message}|null refusal funnel (mirrors domains.js ...):
   null = valid, object = keyed generic refusal the save API turns into
   fail(res, 400, code, message) → err.<code> in 5 locales. */
export function guidRefusal(raw, code = 'groupMappingBadGuid', message = '...') {
  return canonicalizeGuid(raw) ? null : { code, message };
}
```

**Recommended shape (research-verified, D-09..D-12):**
```js
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
Server wiring (D-14, no caching) does the async DB `all()` and passes rows into the pure function — same injected-DB split as groups.js.

---

### `server.js` — `instance_roles` table (model, SCHEMA block)

**Analog:** group_mappings block, server.js:645-656

**Table definition + comment style** (server.js:637-656):
```sql
/* GROUP-MAPPING (Phase 80, GM-01): operator-managed ... (decision-ID comment
   block explaining WHY each shape choice, before the DDL) */
create table if not exists group_mappings (
  id           text primary key,
  group_guid   text not null,
  workspace_id text not null,
  role         text not null check (role in ('owner','admin','member')),
  created_by   text references users(id) on delete set null,
  created_at   integer not null,
  updated_at   integer not null
);
create unique index if not exists group_mappings_pair on group_mappings(group_guid, workspace_id);
```

**D-03/D-04 deltas for instance_roles:** `role text not null check (role in ('backup_operator','restore_operator'))` (D-01); `user_id text not null references users(id) on delete cascade` (D-04 — do NOT copy set-null; group_mappings' set-null is creator-metadata semantics); unique index on `(user_id, role)` (D-02); `granted_by text not null references users(id) on delete cascade` (or set-null? — D-03 says "granted_by (user id)"; planner decides, matching group-mapping audit conventions); `granted_at integer not null`. No `updated_at` needed (D-03 row shape is fixed).

**No pg variant needed** [VERIFIED: db-adapter.mjs:419,442-445 — `pgSchemaVariant` widens generically; group_mappings carries no variant entry]. Mirror the group_mappings DDL pin discipline: no `collate nocase` (db-adapter.test.mjs:334-336).

---

### `server.js` — operator instance-roles routes (route, request-response)

**Analog:** mapping-save route server.js:7476-7498 (write path); operator users GET server.js:7052-7059 (read path)

**Guard order verbatim (Phase 83 D-05)** — server.js:7477-7483:
```js
if (pathname === '/api/governance/group-mappings' && method === 'POST') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const operator = await requireUser(req, res);
  if (!operator) return;
  // T-80-04: the operator gate BEFORE any target lookup — an
  // unauthenticated caller gets the generic 401, a non-operator the exact
  // 403 operatorOnly regardless of body validity.
  if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
  const body = await readJson(req);
```

**Throttle for write routes** — server.js:7078-7080 (keyed on caller, consumes a try even on 403):
```js
if (tooMany(`operator-revoke|${operator.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
```
Read routes carry NO throttle (server.js:7053-7055).

**Validation-before-write refusal funnel** — server.js:7485-7498 (codes passed EXPLICITLY at call site):
```js
const guidR = guidRefusal(body?.groupGuid, 'groupMappingBadGuid', 'Group ID must be an Entra Object ID (GUID)');
if (guidR) return fail(res, 400, guidR.code, guidR.message);
...
const dup = await db.get('select 1 from group_mappings where group_guid = ? and workspace_id = ?', [guid, ws.id]);
if (dup) return fail(res, 400, 'groupMappingDuplicate', 'That group is already mapped to this workspace');
```
Instance-roles grant route applies the same shape: role-token validation → D-05 Super-Admin refusal (`if (target.is_instance_admin) return fail(res, 400, 'instanceRoleAdminImplicit', ...)` — AFTER the operator gate, target fetch only then) → D-08 duplicate check → insert. Revoke (DELETE /:id) — same guard order, then row delete.

**Grant target pool** — reuse the operator user list fields (server.js:7060-7068: `id, name, email, is_instance_admin, last_login_at`); no new enumeration surface (D-07).

---

### `server.js` — audit on grant/revoke (event-driven)

**Analog:** session-revoke same-tx audit, server.js:7092-7114; mapping-save logSecurity, server.js:7518-7521

**Same-transaction discipline (BKROLE-03, prefer the STRONGER pattern per research):**
```js
// AUD-01: the audit row must be written in the SAME transaction as the
// mutation (db.tx(), never hand-rolled BEGIN/COMMIT). A forced audit
// failure rolls back the entire revocation.
const out = await db.tx(async () => {
  await db.run('delete from ...');  // or insert for grant
  await logSecurity(target.id, 'sessions_revoked_by_operator');
  await db.run(
    'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
    [uid(), operator.id, target.id, 'sessions_revoked_by_operator', del.changes, clientIp(req), null, operator.name, operator.email, target.name, target.email, now()],
  );
});
```
Snapshot name/email columns make the trail survive account deletion. `logSecurity` (server.js:5063-5065):
```js
async function logSecurity(userId, verb) {
  await db.run('insert into security_log (id, user_id, verb, created_at) values (?,?,?,?)', [uid(), userId, verb, now()]);
}
```
Action names: `instance_role_granted` / `instance_role_revoked` (snake_case family: `group_mapping_saved`, `sessions_revoked_by_operator` — discretion item per A2). Bare `logInfo` allowed only as a bonus line after the tx (server.js:7521 precedent), never as a substitute.

---

### `server.js` — stub `/api/backup/tasks` + task-edit stub (route, request-response)

**Analog:** the same guard-order route shape (server.js:7476-7498) — no /api/backup family exists yet.

**Recommended shape (research D-19/D-24/D-26):**
```js
if (pathname === '/api/backup/tasks' && method === 'GET') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const user = await requireUser(req, res); if (!user) return;
  // D-26: non-holder → 403 + NEW keyed refusal (not err.operatorOnly — role gate, not operator gate)
  const restore = await hasInstanceRole(user.id, CAP.RESTORE_USE);
  const backup  = await hasInstanceRole(user.id, CAP.BACKUP_MANAGE);
  if (!restore && !backup) return fail(res, 403, 'backupRoleRequired', 'A Backup or Restore Operator role is required');
  return json(res, 200, { tasks: [], canBackup: backup, canRestore: restore });
}
```
Task-edit stub (recommended: `POST /api/backup/tasks`) gates on BACKUP_MANAGE only and refuses a Restore Operator with its own keyed localized refusal — real endpoint so D-36's refusal e2e has something to refuse from. Note: unlike operator routes, these are user-facing role gates — the gate is the funnel, not `isInstanceAdmin`.

---

### `server.js` — userPayload capability flags (D-23)

**Analog:** userPayload, server.js:1052-1062
```js
async function userPayload(user) {
  return {
    id: user.id,
    ...
    twoFa: !!user.two_fa_enabled,
    isInstanceAdmin: !!user.is_instance_admin, // server ground truth for the operator card (D-112: DB flag only)
    workspaces: (await membershipsOf(user.id)).map(row => workspacePayload(row, row)),
  };
}
```
Add `canBackup`/`canRestore` (exact flag names at agent's discretion) computed via `hasInstanceRole(user.id, ...)` alongside line 1059. Recomputed per payload load — no caching (D-14/D-25).

---

### `server.js` — `isInstanceAdmin` (the gate the funnel extends)

**Analog:** server.js:4972-4977
```js
/* D-112: the instance-operator privilege boundary. Reads the DB flag ONLY —
   never process.env.ADMIN_EMAIL, never workspace membership or isAdminUser(). */
function isInstanceAdmin(user) {
  return user?.is_instance_admin === 1;
}
```

---

### `src/pages/backup.js` (NEW — component page)

**Analog:** `src/pages/governance.js` (D-27: "following governance.js patterns")

**Import block** (governance.js:18-26):
```js
import { esc, ago } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { S } from '../core/store.js';
import { api } from '../core/api.js';
import { t } from '../core/i18n.js';
import { av, empty } from '../ui/helpers.js';
import { ROUTE_TEARDOWN } from '../shell/render.js';
import { srow } from './settings.js';
import { refreshGovernanceWorkspaces, refreshOperatorUsers } from '../actions/actions.js';
```

**Fullstate doctrine** (governance.js:8-17 header + 33-36): renders ONLY from server responses, never the client document; 403 → `full403()` lock glyph + keyed err body + home way out; NO auto-poll (low-frequency surface). D-26: the Backup 403 uses its OWN keyed message, not `err.operatorOnly`:
```js
const full403 = () =>
  `<div class="fullstate"><div class="box"><div class="empty-state" style="padding:0"><div class="glyph">${ic('lock', 20)}</div></div><span class="code">${t('err.code403')}</span><h1>${t('nav.route.governance')}</h1><p>${t('err.operatorOnly')}</p><div class="row"><button class="btn btn-primary" data-a="go" data-r="home">${t('nav.goHome')}</button></div></div></div>`;
```

**In-render fetch kick** (governance.js:75-76):
```js
const loading = !S.ui.govWs;
if (loading && !S.ui.govWsErr) refreshGovernanceWorkspaces(); // in-render kick covers a boot-time deep link (TRN-01 precedent)
```

**Row rendering discipline** (governance.js:51-66): `esc()` on every payload string, text nodes only (T-79-10); honest nulls render `'—'`; `ago()` for relative time (D-33's granted_at formatting). Empty state: the `empty()` helper copy — D-34's "No instance roles granted yet" + Grant button front and center uses the governance box pattern.

---

### `src/pages/governance.js` — Instance Roles tab (component section)

**Analog:** the page itself — the new tab/card sits beside the existing workspace-governance and operator cards (D-29, `/governance` IS "Instance > Governance"). The dead-mapping warning section (Phase 83) is the model for D-32's recent-activity section: server returns bounded, newest-first audit rows (server.js:7544-7549):
```js
const trail = await db.all("select action, workspace_id, created_at from audit_log where action like 'group\\_%:group:%' escape '\\' order by created_at desc limit 100");
return json(res, 200, { orphans, trail });
```
**Research Open Question 1 recommendation:** the instance-roles GET returns `{ rows, recent }` in one response — same one-fetch shape.

- **Revoke** (D-31): D-90 inline-confirm pattern (`govArchiveAsk`/`govDeleteAsk` data-a handlers in governance.js:64) + success toast; no separate dialog.
- **Grant modal** (D-30): Phase 84 assignee-picker modal pattern (searchable user picker over `GET /api/auth/operator/users`, confirm-to-apply); duplicate grant (D-08) → keyed toast + highlight existing row.
- **granted_by** (D-33): resolved server-side in the list join, fallback to raw id if account deleted.

---

### `src/shell/render.js` — route registration (config)

**Analog:** render.js:21-67 — add `'backup'` to ROUTE_IDS (after 'governance' at line 43) and `backup: <icon>` to ROUTE_ICONS (beside `governance: 'scale'` at line 66). ROUTE_TEARDOWN registry (render.js:74) — backup page has no poll cycle (D-27), so no teardown entry needed.

---

### `src/shell/layout.js` — nav entry + lazy load

**Analog:** lazy registration layout.js:68-70; flag-gated nav layout.js:187-192

```js
/* 79-02 (WSG-07/D-11): the governance surface is instance-scoped and
   operator-only — lazy-loaded like dashboard, never on the entry chunk. */
governance: lazy(() => import('../pages/governance.js'), 'pageGovernance'),
```
```js
<div class="sgroup">
  <div class="sgroup-h">${t('common.instance')}</div>
  ${/* 79-02 (D-11): UX gate only — the server 403 is the control. */ ''}
  ${api.user?.isInstanceAdmin ? sItem('governance', routeName('governance'), 'scale') : ''}
</div>
```
Backup entry: `backup: lazy(() => import('../pages/backup.js'), 'pageBackup')` (chunk-size discipline, Pitfall 7); nav item gated on the capability flag visible to BOTH operator roles per D-21/D-22:
```js
${(api.user?.canBackup || api.user?.canRestore) ? sItem('backup', routeName('backup'), <icon>) : ''}
```
Top-level placement (D-21) — NOT inside the instance/governance group.

---

### `src/core/api.js` — capability flag getters

**Analog:** api.js:160-183
```js
/* ... Client gating is cosmetic (T-78-05); the server gate is
   the enforcement. */
get canCreateWorkspace() {
  return state.creation || state.user?.isInstanceAdmin;
},
/* [2026-11-21] Super-access surface gate: false hides governance Open and
   keeps the switcher honest (cosmetic only — the server enforces). */
get canSuperAccess() {
  return state.superAccess;
},
```
Add `get canBackup()` / `get canRestore()` reading `state.user?.<flag>` verbatim pattern — render-only, server enforces (D-23).

---

### `src/locales/{en,fr,nl,de,es}.json` — i18n (D-28)

All new keys in all 5 locales in the SAME commit: nav label (`nav.route.backup`), page title, empty state, and EVERY new keyed refusal (`backupRoleRequired`, task-edit Restore-Operator refusal, `instanceRoleAdminImplicit`, `instanceRoleDuplicate`). Enforced by error-codes.test.mjs + i18n-scan.test.mjs — a missing locale key fails `npm test`.

---

### `test/roles-core.test.mjs` (NEW — unit/pin, D-35)

**Analog:** test/groups-core.test.mjs:1-9 (pure import, no server boot, no db)
```js
/* Phase 80 (GM-02/GM-03) — groups.js pure-unit suite. Imports groups.js
   directly: NO server boot, NO db. ... */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeGuid, guidRefusal, roleTokenRefusal, resolveGroupsClaim, resolve } from '../groups.js';
```
Pin tests to write: (a) restore_operator ⇒ [RESTORE_USE] and NEVER ARCHIVE_READ; no ROLE_CAPS entry contains ARCHIVE_READ (D-35a, roadmap SC5); (b) admin (zero rows) holds every capability; refusal-funnel pure cases.

### `test/db-adapter.test.mjs` — instance_roles DDL pin (add to existing file)

**Analog:** group_mappings DDL test, test/db-adapter.test.mjs:306-338
```js
test('group_mappings DDL: insert round-trip, 3-token role CHECK, unique (guid, workspace) pair', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(adapter.SQLITE_SCHEMA);
  ... insert round-trip ...
  assert.throws(() => insert.run(...), /CHECK constraint failed/, "role 'viewer' must be refused by the table CHECK");
  assert.throws(() => insert.run(...), /UNIQUE constraint failed/, 'duplicate (group_guid, workspace_id) pair must be refused');
  // pg-incompatible DDL must never enter the new table (mirror discipline).
  const tableSql = db.prepare("select sql from sqlite_master where type = 'table' and name = 'group_mappings'").get().sql;
  assert.equal(/collate nocase/i.test(tableSql), false, 'group_mappings must carry zero collate nocase');
  db.close();
});
```
Instance-roles version pins: 2-token CHECK (a third role string throws), unique (user_id, role), FK cascade on user delete (D-04), zero `collate nocase`.

### `test/instance-roles-api.test.mjs` (NEW — e2e, D-36)

**Analog:** test/groups-config-api.test.mjs:1-60 — startServer-per-case harness with `withDb` for direct row inspection:
```js
import { ADMIN, client, login, signup, startServer, withDb } from './helpers/server.mjs';
test('unauthenticated POST → 401 signInRequired before any workspace probing (no oracle)', async () => {
  const server = await startServer({});
  try {
    const anon = client(server.base, 'anon');
    const badGuid = await anon.post('/api/governance/group-mappings', {...});
    ... assert.equal(badGuid.status, 401, ...); // gate must not leak which body part was wrong
  } finally {
    await server.stop();
  }
});
```
Also covers cross-origin-first ordering (raw fetch with foreign Origin header, lines 57-60), keyed-refusal pinning, and gate-order probes (403-vs-400 indistinguishability = no existence oracle). Uses this harness — NOT test/e2e-server-guard.test.mjs (that suite spawns the dist wrapper; wrong harness for route e2e).

---

## Shared Patterns

### Guard order — every new mutation route
**Source:** `server.js:7477-7483` (+ throttle from 7078-7080)
**Apply to:** instance-roles POST/DELETE, backup task-edit stub
`sameOrigin → requireUser → [throttle on writes] → gate (isInstanceAdmin for operator routes; hasInstanceRole for backup routes) → target/body fetch`. Gate BEFORE any target lookup (no existence oracle, T-80-04).

### Refusal funnel — every keyed refusal
**Source:** `groups.js:49-56` + `server.js:7485-7498`
**Apply to:** all new refusals. `{code,message}` from roles.js; `fail(res, 400, code, message)` with EXPLICIT code/message at the call site; key lands in all 5 locales same commit.

### Audit — every grant/revoke
**Source:** `server.js:7092-7114` (same-tx audit_log) + `logSecurity` 5063-5065
**Apply to:** instance-roles POST/DELETE. Write + audit row in ONE `db.tx`; snapshot actor/target name+email columns.

### Payload flags — server ground truth, client cosmetic
**Source:** `server.js:1059` + `src/core/api.js:160-183`
**Apply to:** userPayload, stub response, nav gating, api.js getters. Client NEVER derives capabilities from role slugs (D-23); no caching (D-14).

### Pure-module discipline
**Source:** `groups.js:1-20`
**Apply to:** roles.js — repo root (NOT src/), no process.env, DB injected by caller, exported pure functions unit-tested without server boot.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `POST /api/backup/tasks` stub + Backup page actions | route/component | request-response | No /api/backup family exists — first endpoint of a new family. Use the mapping-save guard-order shape (server.js:7476-7498) as the template; contract intentionally minimal (D-19, Phase 86/87 owns the real one). |

Everything else has an exact or role-match analog.

## Metadata

**Analog search scope:** repo root (groups.js, server.js, db-adapter.mjs), src/pages, src/shell, src/core, src/locales, test/
**Files scanned:** 12 analog files read (all git-tracked via `git ls-files`); research's line citations independently re-verified by direct read
**Pattern extraction date:** 2026-11-21
