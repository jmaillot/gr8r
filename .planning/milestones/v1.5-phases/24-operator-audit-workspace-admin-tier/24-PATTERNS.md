# Phase 24: Operator Audit & Workspace-Admin Tier - Pattern Map

**Mapped:** 2026-10-31
**Files analyzed:** 8 (5 modified, 2 new, 1 possibly-modified)
**Analogs found:** 8 / 8

All analog paths verified git-tracked via `git ls-files` (no mirror paths).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` — SCHEMA string (audit_log DDL) | model/migration | CRUD | `server.js:92-170` (SCHEMA, security_log at 163-169) | exact (same file, same string) |
| `server.js` — operator revoke route (tx wrap + audit INSERT) | route | request-response + batch | `server.js:2062-2090` (itself) + `server.js:2317-2321` (transaction usage) | exact |
| `server.js` — NEW admin revoke route `POST /api/w/:slug/members/:id/revoke-sessions` | route | request-response | `server.js:2062-2090` (operator route) + `server.js:2301-2322` (workspace member route) | exact |
| `server.js` — NEW audit read route `GET /api/audit-log` | route | request-response (keyset pagination — NEW pattern, no analog) | `server.js:2042-2060` (operator users GET: gate → select → json) | role-match |
| `src/pages/settings.js` — owner trail section | component | request-response | `src/pages/settings.js:106-123` (`operatorCard()`) + mount at 523 | exact |
| `src/actions/actions.js` — trail refresh + admin revoke actions | store/actions | request-response | `src/actions/actions.js:1942-1977` (`refreshOperatorUsers`, `A.operatorRevoke*`) | exact |
| `src/core/api.js` — `revokeMemberSessions()`, `auditLog()` | service (API client) | request-response | `src/core/api.js:253-258` | exact |
| `src/locales/en.json` + `fr.json` — new `settings.audit.*` keys + any new `err.*` | config (i18n) | — | existing `settings.operator.*` / `err.ownerImmune` keys | role-match |
| `test/audit-log.test.mjs` (NEW) | test | batch | `test/operator-revoke.test.mjs` | exact |
| `e2e/admin-revoke-cycle.spec.mjs` (NEW) | test (e2e) | event-driven (browser) | `e2e/operator-revoke-cycle.spec.mjs` | exact |

## Pattern Assignments

### `server.js` — audit_log DDL (model, CRUD)

**Analog:** `server.js:92-170` (SCHEMA template string), esp. security_log 163-169.

**DDL pattern** (lines 163-169) — copy the house column style (`id text primary key`, `created_at integer not null`), but **omit every `references …` clause** (D-A2 — the cascade on 165 is exactly what audit_log must not have):

```sql
create table if not exists security_log (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,   -- NOT this
  verb       text not null,
  created_at integer not null
);
create index if not exists security_log_user on security_log(user_id);
```

New audit_log goes **inside the same SCHEMA template string** (new table → no `ensureColumn` call needed; `ensureColumn` at line 172 is only for additive column migrations). Two indexes: `(created_at desc)` and `(workspace_id, created_at desc)` — matches the naming style `audit_log_created` / `audit_log_workspace` (cf. 117, 154, 162, 169).

### `server.js` — transaction wrapper (service, batch)

**Analog:** `server.js:964-973` — **reuse verbatim, never hand-roll BEGIN/COMMIT:**

```js
function transaction(fn) {
  db.exec('begin immediate');
  try {
    const out = fn();
    db.exec('commit');
    return out;
  } catch (err) {
    db.exec('rollback');
    throw err;
  }
}
```

Call-site shape precedent — `server.js:2317-2320` (member DELETE inside workspace route):

```js
transaction(() => {
  db.prepare('delete from memberships where workspace_id = ? and user_id = ?').run(ctx.ws.id, target.id);
  updateDoc(ctx.ws.id, doc => stripMember(doc, row.member_id, target.id));
});
```

**Critical:** all `fail()` early returns stay BEFORE the `transaction()` call — a refusal inside the callback would leave the connection mid-transaction (see RESEARCH anti-patterns).

### `server.js` — operator revoke route modification (route, request-response)

**Analog:** `server.js:2062-2090` (the route itself — D-R3 wraps its DELETE+verb in `transaction()` and adds the audit INSERT).

**Gate-order pattern** (lines 2064-2078) — copy verbatim for the new admin route (sameOrigin first, every attempt consumes throttle budget, DB-flag gate, target 404 before immunity):

```js
const operatorRevokeMatch = pathname.match(/^\/api\/auth\/operator\/users\/([A-Za-z0-9_-]{1,64})\/revoke-sessions$/);
if (operatorRevokeMatch && method === 'POST') {
  // Pitfall 22 order: sameOrigin FIRST, before any body read or throttle.
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const operator = requireUser(req, res);
  if (!operator) return;
  // D-116: keyed on the caller, and every attempt — including 403 refusals —
  // consumes a try, because tooMany increments before any gate decision.
  if (tooMany(`operator-revoke|${operator.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
  if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
  const target = db.prepare('select id, is_instance_admin from users where id = ?').get(operatorRevokeMatch[1]);
  if (!target) return fail(res, 404, 'notFound', 'Not found');
  if (target.is_instance_admin && target.id !== operator.id)
    return fail(res, 403, 'ownerImmune', 'Owner accounts are immune to operator revocation');
```

**Core delete + success-only-verb pattern** (lines 2082-2089):

```js
const operatorTokenHash = sha256(parseCookies(req.headers.cookie)[COOKIE]);
const del = db.prepare('delete from sessions where user_id = ? and token_hash != ?').run(target.id, operatorTokenHash);
const left = db.prepare('select count(*) as n from sessions where user_id = ? and expires_at > ?').get(target.id, now());
if (del.changes > 0) logSecurity(target.id, 'sessions_revoked_by_operator');
return json(res, 200, { revoked: del.changes, remaining: left.n });
```

The audit INSERT goes inside the same `if (del.changes > 0)` block, both statements inside `transaction(() => …)`. IP source: `clientIp(req)` (lines 1401-1404):

```js
function clientIp(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}
```

Verb helper (stays untouched, D-A5) — `server.js:1554-1556`:

```js
function logSecurity(userId, verb) {
  db.prepare('insert into security_log (id, user_id, verb, created_at) values (?,?,?,?)').run(uid(), userId, verb, now());
}
```

### `server.js` — NEW admin revoke route (route, request-response)

**Analog:** hybrid of the two routes above. Gate block from `requireWorkspace` (lines 1503-1518) + tier rule from the member route (lines 2303-2313):

```js
function requireWorkspace(req, res, slug, minRole = 'viewer') {
  const user = requireUser(req, res);
  if (!user) return null;
  const ws = wsBySlug(slug);
  const membership = ws ? membershipOf(ws.id, user.id) : null;
  if (!ws || !membership) {
    fail(res, 404, 'workspaceNotFound', 'Workspace not found');
    return null;
  }
  if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    if (minRole === 'admin') fail(res, 403, 'adminOnly', 'Only workspace admins can do that');
    else fail(res, 403, 'readOnlyAccess', 'Your account has read-only access');
    return null;
  }
  return { user, ws, membership };
}
```

Tier-comparison precedent (lines 2310-2313) — the admin route's D-R2 rule is the stricter variant `ROLE_RANK[row.role] < ROLE_RANK.admin`:

```js
const actorRank = roleRank(ctx.membership.role);
if (actorRank < ROLE_RANK.owner && roleRank(row.role) >= ROLE_RANK.admin) {
  return fail(res, 403, 'ownerManagedRoles', 'Only an owner can manage admins and owners');
}
```

Target-membership lookup precedent (lines 2306-2308): `select * from users` + `membershipOf(ctx.ws.id, target.id)`, refusal `fail(res, 404, 'notAMember', 'That person is not a member of this workspace')`. Route registered in the API dispatch section (all `/api/*` matching precedes the SPA fallback); note D-R1's prefix `/api/w/` differs from siblings' `/api/workspaces/` — intentional, follow the lock.

### `server.js` — NEW audit read route (route, request-response, keyset pagination)

**Analog:** `server.js:2042-2060` (operator users GET) — gate → fixed-shape select → `json(res, 200, {…})`. No server-side pagination exists in the codebase (A2); the keyset pattern (`where created_at < ? order by created_at desc limit 101` → return 100 + `nextBefore`) is new — use RESEARCH Pattern 2. Tier visibility per D-T3: `isInstanceAdmin(user)` → all rows; else `requireWorkspace`-style admin-membership scope, `workspace_id` null rows never served to non-operators. Non-privileged → 403 (honest-gate convention, D-V1).

### `src/pages/settings.js` — owner trail section (component, request-response)

**Analog:** `operatorCard()` (lines 106-123), mounted at line 523.

**Mount pattern** (line 523):

```js
) + (api.user?.isInstanceAdmin ? operatorCard() : '');
```

**Two-stage confirm + render-from-server-state pattern** (lines 106-122) — the trail section and per-row rendering copy this structure (`srow`, `esc()`, `t()`, `data-a` attributes, badge hints):

```js
export function operatorCard() {
  const rows = S.ui.operatorUsers;
  if (!rows) return '';
  const meId = api.user?.id;
  return `<div class="sblock" style="margin-top:16px"><h2 …>${t('settings.operator.title')}</h2>…${rows
    .map(u =>
      srow(
        `<span class="row" style="gap:8px">${esc(u.name || '')}<span class="faint">${esc(u.email)}</span>…`,
        u.last_login_at ? ago(u.last_login_at) : '—',
        S.ui.operatorRevoke === u.id
          ? `<span class="row" …><button class="btn btn-danger btn-sm" data-a="operatorRevokeConfirm" data-id="${esc(u.id)}">${t('settings.operator.confirm')}</button><button class="btn btn-secondary btn-sm" data-a="operatorRevokeCancel">${t('common.cancel')}</button></span>`
          : `<button class="btn btn-secondary btn-sm" data-a="operatorRevokeAsk" data-id="${esc(u.id)}">${t('settings.operator.revokeShort')}</button>`,
      ),
    )
    .join('')}</div>`;
}
```

Trail rows render purely from snapshot columns (D-A3/D-V4) — **no joins to users/workspaces**. If a sibling `members.js` admin revoke button is planned, it follows the same staging (`S.ui` + `render()`), per `src/pages/members.js` (169 lines, tracked).

### `src/actions/actions.js` — trail refresh + admin revoke actions (actions, request-response)

**Analog:** lines 1938-1977.

**Ground-truth fetch pattern** (lines 1942-1954):

```js
export async function refreshOperatorUsers() {
  if (!api.enabled || !api.user?.isInstanceAdmin) return null;
  const res = await api.operatorUsers();
  if (!res.ok) {
    /* The 401 teardown belongs to the central intercept (D-28); other refusals
       leave the card empty — the gate itself is the honest answer. */
    if (res.status !== 401) S.ui.operatorUsers = null;
    return null;
  }
  S.ui.operatorUsers = res.data.users || [];
  render();
  return S.ui.operatorUsers;
}
```

**Confirm action + error-code toast pattern** (lines 1956-1977):

```js
A.operatorRevokeAsk = el => {
  S.ui.operatorRevoke = el.dataset.id; // the inline confirmation stage carries the target id
  render();
};
A.operatorRevokeCancel = () => {
  S.ui.operatorRevoke = null;
  render();
};
A.operatorRevokeConfirm = async el => {
  const id = el.dataset.id;
  const res = await api.operatorRevokeSessions(id);
  S.ui.operatorRevoke = null;
  if (!res.ok) {
    if (res.status === 401) return;
    const c = res.data?.code;
    return toast(tErr(c, null, res.error || t('err.serverUnreachable')), { kind: 'err' });
  }
  await refreshOperatorUsers(); // re-fetch so the list reflects the revoke
  toast(t('settings.operator.toastRevoked'));
};
```

The trail's `A.auditLoadMore` action appends the next keyset page to existing state (never replaces) — small extension of this pattern.

### `src/core/api.js` — new API client methods (service, request-response)

**Analog:** lines 253-258:

```js
async operatorUsers() {
  return call('GET', '/api/auth/operator/users');
},
async operatorRevokeSessions(userId) {
  return call('POST', `/api/auth/operator/users/${encodeURIComponent(userId)}/revoke-sessions`);
},
```

New methods (`revokeMemberSessions(slug, id)`, `auditLog(params)`) copy this exactly — `call()` wrapper, `encodeURIComponent` on path params, family comment above the pair.

### `src/locales/en.json` + `fr.json` — i18n keys (config)

**Analog:** existing `settings.operator.*` section and `err.ownerImmune`/`err.adminOnly`/`err.operatorOnly` (en.json:1521-1523). Reuse existing err codes wherever possible (zero new catalogue entries); genuinely new codes need `err.<code>` in **both** files in the same commit — `test/error-codes.test.mjs` (static scan of server.js `fail(res, <status>, '<code>'` literals, asserting non-empty `err.<code>` in en.json AND fr.json) and `test/catalogue.test.mjs` enforce parity. Gate locally with `npm run i18n:scan` (package.json:9-10).

### `test/audit-log.test.mjs` (NEW) — server-side suite (test, batch)

**Analog:** `test/operator-revoke.test.mjs` (269 lines) — copy its skeleton wholesale.

**Imports + fixtures pattern** (lines 1-41):

```js
/* Operator session revocation suite (phase 22 plan 01): real server, real SQLite.
   … No mocks. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { login, signup, startServer, withDb } from './helpers/server.mjs';

const revoke = (cookie, userId, srv = server) =>
  fetch(`${srv.base}/api/auth/operator/users/${userId}/revoke-sessions`, {
    method: 'POST',
    headers: { cookie },
  });

function userRow(email, srv = server) {
  return withDb(srv.dbPath, db => db.prepare('select * from users where email = ?').get(email));
}
```

Three test shapes to build from this analog:
1. **Route-level assertions** — `fetch` against `srv.base`, real cookies from `signup`/`login` (covers AUD-02 refusals, D-T3 visibility, pagination).
2. **Direct SQLite assertions** — `withDb(srv.dbPath, db => …)` for audit row contents and the **atomicity test**: `withDb` drop `audit_log`, call revoke, expect 5xx and unchanged session count (rollback proof, Pattern 3).
3. **Static source scan** — mirror `test/error-codes.test.mjs` (reads server.js as text, single-file scan): assert case-insensitive `update audit_log` / `delete from audit_log` never appear (D-A4). Scan **server.js only** to avoid false positives on fixtures/docs (Pitfall 5).

### `e2e/admin-revoke-cycle.spec.mjs` (NEW) — e2e suite (test, browser, EN+FR)

**Analog:** `e2e/operator-revoke-cycle.spec.mjs` (245 lines) — copy its conventions header and helpers verbatim.

**Convention pattern** (lines 1-42):

```js
/* Conventions follow tfa-disable-cycle.spec.mjs / flows.spec.mjs:
   fixtures only through the real API (helpers/setup.mjs), … every
   account/context presents its own run-unique X-Forwarded-For so throttle
   budgets never cross (Pitfall 5 — the FR run doubles every budget), and every
   asserted string resolves through fmt() against src/locales/en.json / fr.json
   — zero raw literals in assertions. */
import { test, expect } from '@playwright/test';
import { BASE_URL, PASSWORD, OWNER, apiClient, clientIp, createAccount, newRunId } from './helpers/setup.mjs';
import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };

function fmt(key, vars, lang) {
  let s = CATALOGUE[lang][key];
  if (s === undefined) throw new Error(`catalogue key missing in ${lang}: ${key}`);
  …
}
```

Reuse: `fmt()` + `escapeRe()` copy locally (never import out of flows.spec.mjs), per-account run-unique `X-Forwarded-For` via `newRunId()`/`clientIp`, fixtures through `apiClient`/`createAccount` only.

## Shared Patterns

### Gate ordering (Pitfall 22 / D-116)
**Source:** `server.js:2064-2072`
**Apply to:** both revoke routes and the audit read route.
`sameOrigin(req)` FIRST → `requireUser` → `tooMany(key|callerId, 5, 15*60*1000)` → authorization gate → target lookup. Reads may skip throttle (D-121 precedent, line 2044-2045); mutations never.

### Error handling
**Source:** `server.js:2065-2089`, catalogue gate `test/error-codes.test.mjs`
**Apply to:** every new route handler.
`fail(res, status, 'code', 'English message')` with fixed machine codes; reuse `crossOriginRejected`, `tooManyAttempts`, `operatorOnly`, `adminOnly`, `ownerImmune`, `notFound`, `notAMember` before inventing new ones. Any new code → `err.<code>` in en.json AND fr.json same commit.

### Transactions
**Source:** `server.js:964-973`
**Apply to:** both revoke routes' DELETE+security_log+audit_log work. All refusals before the wrapper; no `fail()` inside the callback.

### Success-only verbs (D-117)
**Source:** `server.js:2085-2088`
**Apply to:** both routes. Gate the security_log write AND the audit INSERT on `del.changes > 0`; response still `{ revoked: 0, remaining }` on zero-row delete.

### Append-only by construction (D-A4)
**Source:** DDL style `server.js:163-169` (inverted: no FKs, no triggers)
**Apply to:** audit_log. Only ever `insert into audit_log`. Enforced by the static-scan test (single-file scan of server.js).

### i18n / e2e string discipline
**Source:** `e2e/operator-revoke-cycle.spec.mjs:17-21`, `test/catalogue.test.mjs`
**Apply to:** trail UI, confirmations, e2e assertions. Every user-visible string through `t()`/`fmt()` against both catalogues; zero raw literals.

### Throttle isolation in tests (Pitfall 5)
**Source:** `e2e/operator-revoke-cycle.spec.mjs:11-18`, helper `newRunId()`
**Apply to:** both test files. Per-account run-unique `X-Forwarded-For`; FR run doubles every budget.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `GET /api/audit-log` keyset pagination slice | route | request-response (paginated) | No server-side pagination exists anywhere in the codebase (RESEARCH A2). Use RESEARCH.md Pattern 2 (`where created_at < :before order by created_at desc limit 101` → `{ rows, nextBefore }`), lean against offset pages. |
| `audit_log` table itself | model | append-only | No FK-free, snapshot-bearing table exists; security_log is the closest shape but must NOT be copied for its FK/cascade. Copy the column-naming/index-naming style only. |

## Metadata

**Analog search scope:** `server.js`, `src/pages/`, `src/actions/`, `src/core/`, `src/locales/`, `test/`, `e2e/`
**Files scanned:** 11 read in full or targeted (`git ls-files` verified all tracked)
**Pattern extraction date:** 2026-10-31
