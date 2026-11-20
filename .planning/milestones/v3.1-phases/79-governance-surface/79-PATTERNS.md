# Phase 79: Governance Surface - Pattern Map

**Mapped:** 2026-11-20
**Files analyzed:** 12 (2 new pages/suites + 9 modified + locales batch)
**Analogs found:** 12 / 12 (all git-tracked, verified via `git ls-files`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` — `/api/auth/operator/workspaces` route family | route (operator-gated) | request-response CRUD | server.js:6703-6827 operator/users family | exact |
| `server.js` — `workspaces.archived` column + migration | model/migration | batch (boot) | server.js:684-689 `users.is_instance_admin` migration | exact |
| `server.js` — archived gate in `requireWorkspace` | middleware (funnel) | request-response | server.js:4862-4877 `requireWorkspace` itself | exact (in-place) |
| `src/pages/governance.js` (NEW) | page component | request-response (server payload render) | `src/pages/dashboard.js` | exact |
| `src/pages/settings.js` — remove `operatorCard()` | component (relocation) | — | same file :259-278 (deletion site) | exact |
| `src/shell/render.js` — ROUTE_IDS/ROUTE_ICONS | config | — | render.js:21-65 (`dashboard` entry) | exact |
| `src/shell/layout.js` — lazy import + gated nav item | shell/nav | event-driven (nav) | layout.js:172-183 sgroup + :176 gate | exact |
| `src/core/api.js` — operator workspace methods | client api client | request-response | api.js:342-356 operator family | exact |
| `src/actions/actions.js` — governance actions + relocated operator actions | store/action layer | event-driven | actions.js:2749-2806 | exact |
| `src/locales/*.json` (×5) | config/i18n | — | en.json `settings.operator.*` / `err.*` keys | exact |
| `test/governance.test.mjs` (NEW) | test (server suite) | request-response | `test/creation-gate.test.mjs` + `test/helpers/server.mjs` | exact |
| `test/governance-client.test.mjs` (NEW) | test (client-surface, static) | — | `test/creation-gate-client.test.mjs` | exact |

## Pattern Assignments

### `server.js` — operator workspaces route family (route, request-response)

**Analog:** `server.js:6703-6827` (`/api/auth/operator/users` GET + revoke + promote/demote). Verified verbatim this session.

**Guard-order pattern** (lines 6703-6710, 6725-6733):
```js
const operatorUsersMatch = pathname === '/api/auth/operator/users';
if (operatorUsersMatch && method === 'GET') {
  // D-121: read route — sameOrigin → requireUser → operator gate. NO throttle
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const operator = await requireUser(req, res);
  if (!operator) return;
  if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
```
For destructive writes add throttle AFTER the gate, keyed on the caller (lines 6729-6731):
```js
if (tooMany(`operator-revoke|${operator.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
```
**Target lookup AFTER the gate** (no-oracle 404, lines 6734-6735):
```js
const target = await db.get('select id, name, email, is_instance_admin from users where id = ?', [operatorRevokeMatch[1]]);
if (!target) return fail(res, 404, 'notFound', 'Not found');
```
**⚠ Governance routes must NOT use `requireWorkspace`** — fetch the row by id with `db.get('select * from workspaces where id = ?')` under the operator gate (archived rows must stay actionable; requireWorkspace will be refusing them).

**Audit-in-tx pattern** (lines 6804-6826):
```js
const out = await db.tx(async () => {
  await db.run('update users set is_instance_admin = ? where id = ?', [promoting ? 1 : 0, target.id]);
  await db.run(
    'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
    [uid(), operator.id, target.id, promoting ? 'operator_promoted' : 'operator_demoted', 0, clientIp(req), null, operator.name, operator.email, target.name, target.email, now()],
  );
  return { user: { id: target.id, is_instance_admin: promoting ? 1 : 0 } };
});
logInfo(`operator ${promoting ? 'promoted' : 'demoted'}: ${target.email} by ${operator.email}`);
return json(res, 200, out);
```

### `server.js` — `workspaces.archived` column (model/migration, batch)

**Analog:** `server.js:684-689` (exact precedent):
```js
await adapterEnsureColumn('users', 'two_fa_enabled', 'integer not null default 0');
// Phase 22 D-112: instance-operator privilege flag — def byte-identical to
// the SCHEMA declaration (Pitfall P-B).
await adapterEnsureColumn('users', 'is_instance_admin', 'integer not null default 0');
```
Copy: `await adapterEnsureColumn('workspaces', 'archived', 'integer not null default 0');` — def byte-identical to the SCHEMA declaration; migration block sits at server.js:624-689.

### `server.js` — archived gate in `requireWorkspace` (middleware)

**Analog:** the funnel itself, `server.js:4861-4877`:
```js
async function requireWorkspace(req, res, slug, minRole = 'viewer') {
  const user = await requireUser(req, res);
  if (!user) return null;
  const ws = await wsBySlug(slug);
  const membership = ws ? await membershipOf(ws.id, user.id) : null;
  if (!ws || !membership) {
    fail(res, 404, 'workspaceNotFound', 'Workspace not found');
    return null;
  }
```
Insert the archived refusal after the membership 404, before the rank check, in the funnel's `fail(...)` + `return null` style:
```js
if (ws.archived === 1) {
  fail(res, 403, 'workspaceArchived', 'This workspace is archived');
  return null;
}
```
Do NOT filter `wsBySlug` (slug-collision semantics).

### `server.js` — delete mechanics (copy body, change gate)

**Analog:** existing owner DELETE, `server.js:7137-7152`:
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
Governance delete = same tx body + pre-tx empty-check (raw doc) + dispositions application + audit row inside the same tx.

### `src/pages/governance.js` (NEW) (component, request-response)

**Analog:** `src/pages/dashboard.js` (whole file, 163 lines).

**Imports pattern** (lines 18-25):
```js
import { esc, relDate } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S } from '../core/store.js';
import { t } from '../core/i18n.js';
import { api } from '../core/api.js';
import { av, empty } from '../ui/helpers.js';
import { ROUTE_TEARDOWN, render } from '../shell/render.js';
```

**Fill loop with abort + monotonic seq** (lines 27-46) — governance uses the same shape minus the poll:
```js
let fillSeq = 0;
let inflight = null;
async function fill() {
  const my = ++fillSeq;
  inflight?.abort();
  inflight = new AbortController();
  const res = await api.dashboard(S.ui.dashWindow || '7d', { signal: inflight.signal });
  if (my !== fillSeq || S.ui.route !== 'dashboard') return;
  if (res.ok) { S.ui.dashData = res.data; S.ui.dashErr = null; }
  else S.ui.dashErr = { status: res.status };
  render();
}
```

**403 fullstate** (lines 82-85) — D-11 non-operator deep-link pattern, adapt verbatim:
```js
if (S.ui.dashErr?.status === 403)
  return `<div class="fullstate"><div class="box"><div class="empty-state" style="padding:0"><div class="glyph">${ic('lock', 20)}</div></div><span class="code">${t('err.code403')}</span><h1>${t('nav.route.dashboard')}</h1><p>${t('err.adminOnly')}</p><div class="row"><button class="btn btn-primary" data-a="go" data-r="home">${t('nav.goHome')}</button></div></div></div>`;
```
**Generic error fullstate with retry** (lines 86-87, `dashRetry` action, CR-01 suppression at :96).

**Page scaffold + section wrappers** (lines 75-77, 150-151):
```js
const panel = (title, n, body) =>
  `<section class="panel"><div class="panel-h"><h2>${title}</h2><span class="faint">${n}</span></div>${body}</section>`;
const busyBody = () => `<div class="panel-b faint" aria-busy="true">${t('page.dashboard.loading')}</div>`;
```
Governance swaps `panel` for the `sblock` shape (`settings.js:263`): `<div class="sblock" style="margin-top:16px"><h2 …>${t(key)}</h2><p class="hint" …>${t(key)}</p>…</div>` and a `.perm-t` table (see `src/pages/members.js:74` pattern).

**Export naming:** `export function pageGovernance()` (matches `pageDashboard`, wired by layout lazy import).

### `src/pages/settings.js` — operatorCard removal (D-01)

**Analog (the code being moved):** `operatorCard()` at settings.js:259-278 — srow rows from `S.ui.operatorUsers`, D-90 stages `S.ui.operatorRevoke`/`S.ui.operatorDemote`, badges `badge green`/`badge`, `btn-danger btn-sm` inline confirms. Move the function wholesale into governance.js (or a shared module), then delete from settings.js along with the `refreshOperatorUsers()` mount call (actions.js:362 area). Pitfall 9: after the move, `grep operatorUsers|operatorRevoke|operatorDemote` — hits only in the governance path.

### `src/shell/render.js` — route registration (config)

**Analog:** render.js:21-43 (`ROUTE_IDS` — add `'governance'`) and :45-65 (`ROUTE_ICONS` — add `governance: 'scale'`). Also note `ROUTE_TEARDOWN` registry at :72 if the page needs cleanup.

### `src/shell/layout.js` — lazy import + gated nav (shell)

**Analog:** layout.js:172-183 (sgroup block) and :176 (the gate):
```js
<div class="sgroup">
  <div class="sgroup-h">${t('common.workspace')}</div>
  ${sItem('overview', routeName('overview'), 'layout-dashboard')}
  ${/* Phase 60 (D-01/D-52-4): UX gate only — the server 403 is the control. */ ''}
  ${isMemberAdmin() ? sItem('dashboard', routeName('dashboard'), 'gauge') : ''}
```
New: a sibling `<div class="sgroup">` headed `t('common.instance')` below this group, item `${api.user?.isInstanceAdmin ? sItem('governance', routeName('governance'), 'scale') : ''}`. Lazy import map lives at layout.js:56 (`dashboard: lazy(() => import('../pages/dashboard.js'), 'pageDashboard')` shape). `sItem` helper itself: layout.js:133-136.

### `src/core/api.js` — client methods (request-response)

**Analog:** api.js:342-356:
```js
async operatorUsers() {
  return call('GET', '/api/auth/operator/users');
},
async operatorRevokeSessions(userId) {
  return call('POST', `/api/auth/operator/users/${encodeURIComponent(userId)}/revoke-sessions`);
},
```
New methods follow identically: `governanceWorkspaces()`, `governanceArchive(id)`, `governanceUnarchive(id)`, `governanceDelete(id, payload)`, `governanceReassign(id, userId, payload)`, `governanceRelease(id, userId)` — `encodeURIComponent` on every path param, plain `call()`.

### `src/actions/actions.js` — action layer (event-driven)

**Analog:** actions.js:2749-2806. Exact refusal-toast shape to copy for every governance action:
```js
A.operatorPromote = async el => {
  const id = el.dataset.id;
  const res = await api.operatorPromote(id);
  if (!res.ok) {
    if (res.status === 401) return; // D-28: the central intercept owns the teardown
    const c = res.data?.code;
    return toast(tErr(c, null, res.error || t('err.serverUnreachable')), { kind: 'err' });
  }
  await refreshOperatorUsers(); // re-fetch so the list reflects the change
  toast(t('settings.operator.toastPromoted'));
};
```
Inline-confirm stage pattern (`Ask`/`Cancel`/`Confirm` trio, lines 2749-2770): `S.ui.operatorRevoke = el.dataset.id; render();` — D-90 shape reused for type-to-confirm state; extend with a slug/email-match predicate (confirmModal already does the compare).

### `src/overlays/modals.js` — type-to-confirm (D-04) — ALREADY EXISTS

**Analog:** `confirmModal(m)` at modals.js:512-521:
```js
export function confirmModal(m) {
  const needs = m.typeName;
  const ok = !needs || (S.ui.confirmText || '') === needs;
  ...
  <button class="btn ${m.danger ? 'btn-danger' : 'btn-primary'}" data-a="confirmOk" ${ok ? '' : 'disabled'}>${esc(m.ok)}</button>
```
Governance archive/delete passes `typeName: slug`, release passes `typeName: memberEmail`; `m.danger` picks the red glyph tile, non-danger uses amber (line 516). No new confirm machinery needed — only call sites. Orphan modal builds on `modalHtml` (modals.js:39).

### `src/locales/*.json` (×5) (config/i18n)

**Analog:** en.json `settings.operator.*` keys (lines 1483-1498, reused verbatim for the relocated section) and `err.operatorOnly` (:1776 — flat `"key": "string"` map). Every new key (`page.governance.*`, `err.workspaceArchived`, `err.workspaceNotEmpty`, disposition keys, `common.instance`) appended to all 5 catalogues in the same commit as the emitting code. Renaming any relocated key = remove old keys from all 5 in the same commit.

### `test/governance.test.mjs` (NEW) (test, request-response)

**Analog:** `test/helpers/server.mjs` harness + `test/creation-gate.test.mjs` family shape. Harness facts (helpers/server.mjs:13-30): `ADMIN` fixture stamps the operator via `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` env; `BASE_ENV` pins `WORKSPACE_CREATION: 'true'` — a governance suite wanting the closed gate overrides that key per server (`startServer({ env: { WORKSPACE_CREATION: 'false' } })`). Run: `node --test test/governance.test.mjs`.

### `test/governance-client.test.mjs` (NEW) (test, static client-surface)

**Analog:** `test/creation-gate-client.test.mjs` — copy its whole skeleton (lines 18-30): `readFileSync` source assertions against regexes, plus real 5-catalogue JSON imports:
```js
import en from '../src/locales/en.json' with { type: 'json' };
...
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const src = rel => readFileSync(`${ROOT}/${rel}`, 'utf8');
```
Pin here: settings.js no longer matches `/operatorCard/`; governance route id present in render.js ROUTE_IDS; nav gate present in layout.js; new keys present in all 5 catalogues (WSG-11).

## Shared Patterns

### Operator gate (`isInstanceAdmin`)
**Source:** `server.js:4857-4859`
```js
function isInstanceAdmin(user) {
  return user?.is_instance_admin === 1;
}
```
**Apply to:** every `/api/auth/operator/workspaces*` route — once per route, BEFORE target lookup.

### Keyed refusal via `fail()`
**Source:** `server.js` (single error constructor; comment at :4698 forbids hand-built error payloads)
```js
fail(res, 403, 'workspaceArchived', 'This workspace is archived')
```
**Apply to:** every refusal in the new family + requireWorkspace gate. Codes are the locale `err.*` keys.

### Audit row in same `db.tx`
**Source:** `server.js:6743-6770`, `:6801-6824`
**Apply to:** archive, unarchive, delete, reassign, release. Verbs like `operator_promoted` precedent — use `workspace_archived`, `workspace_deleted`, etc.

### Client gate-is-cosmetic doctrine
**Source:** `layout.js:175` comment + `dashboard.js:82-85`
**Apply to:** nav item gating (`api.user?.isInstanceAdmin`) and the 403 fullstate — the server 403 is the control.

### No source edits analog inventory
All paths named above verified tracked (`git ls-files` non-empty): server.js, src/pages/{dashboard,settings}.js, src/shell/{render,layout}.js, src/core/api.js, src/actions/actions.js, src/overlays/modals.js, src/locales/en.json, test/helpers/server.mjs, test/creation-gate-client.test.mjs.

## No Analog Found

| File | Role | Data Flow | Reason | Fallback |
|------|------|-----------|--------|----------|
| Orphan-disposition modal (per-member reassign/release controls) | component | form state | No multi-row disposition form exists in-repo; closest pieces are `modalHtml` + `select` + confirmModal disabled-OK mechanics | Compose from `modalHtml` (modals.js:39), `src/ui/select.js`, `av()`; state shape `S.ui.govDispositions` per UI-SPEC |
| Type-to-confirm as a *server-validated* control | validation | — | Client confirmModal exists; the server-side slug-confirm string compare has no precedent | ASVS V5: exact-match compare on body.confirmSlug; planner pins key (`slugConfirmMismatch`) |

## Metadata

**Analog search scope:** server.js route families + src/pages + src/shell + src/core + src/actions + src/overlays + src/ui + src/locales + test/
**Files scanned:** ~16 (read fully or targeted)
**Pattern extraction date:** 2026-11-20
