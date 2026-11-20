# Phase 78: Creation Gate & Instance-Owner Identity - Pattern Map

**Mapped:** 2026-11-19
**Files analyzed:** 11 (new/modified symbols from CONTEXT + RESEARCH)
**Analogs found:** 11 / 11 — every new symbol has a tracked-source analog read this session

## File Classification

| New/Modified Symbol | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `WORKSPACE_CREATION` env const + boot-refuse (server.js) | config | boot-time transform | `server.js:135` ALLOW_SIGNUP + door-matrix log 8952 | exact |
| `POST /api/workspaces` gate swap (server.js:6811) | route | request-response | `server.js:6807-6832` (the code being replaced) | exact |
| `/api/config workspaceCreation` boolean (server.js:5020) | route | request-response | self + client consumer `src/core/api.js:175` | exact |
| `POST /api/auth/operator/users/:id/promote\|demote` | route | request-response (write) | `server.js:6703-6760` D-121 revoke-sessions | exact |
| Last-operator guard `lastOperator` 409 | route guard | request-response | `server.js:7121` needOwner | exact |
| `operatorCard` promote/demote UI (settings.js:253) | component | state→render | `src/pages/settings.js:253-271` + `src/actions/actions.js:2749-2760` | exact |
| Popover create-button gating (popovers.js:262) | component | conditional render | `src/overlays/popovers.js:262` workspaces case | exact |
| Await-access view (auth.js `no-workspace` extension) | component | poll loop | `src/pages/auth.js:129-134` + `src/main.js:111-126` pollNotifs | exact |
| `canCreateWorkspace` getter + `state.creation` (api.js) | store | transform | `src/core/api.js:157-159, 175` (self, shape change) | exact |
| `test/creation-gate.test.mjs` | test | boot-observable | `test/domain-admission.test.mjs:100-115` | exact |
| `e2e/await-access.spec.mjs` | test (e2e) | browser flow | `e2e/locale-refusal.spec.mjs` | exact |
| New i18n keys (`err.*`, `settings.operator.*`, await page) | config | — | `src/locales/en.json:1482-1491, 1784, 339` | exact |

## Pattern Assignments

### 1. Env const + boot-refuse (WSG-01)

**Analog:** `server.js:135` (ALLOW_SIGNUP zone) + `server.js:8946-8952` (boot log block)

Copy the zone placement (adjacent to ALLOW_SIGNUP) and the log-line placement (inside the same boot-log block as the D-06/D-11 domain lines). **Adapt:** unlike ALLOW_SIGNUP's silent `=== 'true'` coercion, use strict 3-way token match and boot-REFUSE (logError + process.exit(1) before listen). The log line format copies `domains:` lines — one line, resolved value + effective meaning:

```js
// server.js:135 (placement anchor)
const ALLOW_SIGNUP = process.env.ALLOW_SIGNUP === 'true';
// server.js:8952 (log placement anchor — add workspace-creation line in same block)
logInfo(`domains: door matrix — signup: ${domainListLog(SIGNUP_DOMAINS)} | ...`);
```

### 2. POST /api/workspaces gate swap (WSG-02)

**Analog:** `server.js:6807-6832` (the code being replaced — read directly)

Copy: sameOrigin-first, requireUser, the `fail()` keyed-refusal shape. **Adapt:** replace the `ALLOW_SIGNUP`-derived condition at 6811 with `if (!WORKSPACE_CREATION && !isInstanceAdmin(user)) return fail(res, 403, '<newKey>', ...)`. Gate primitive is `isInstanceAdmin` (server.js:4838: `return user?.is_instance_admin === 1;`) — never `hasAdminRole` (D-112). Delete the now-dead `askAdminForWorkspace` coupling + its 5 locale keys.

### 3. Promote/demote endpoints (WSG-06)

**Analog:** `server.js:6703-6760` D-121 revoke-sessions POST route (read in full this session). Copy the exact route order:

```js
// server.js:6705-6760 — the order IS the pattern (Pitfall 22):
if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', ...);   // FIRST
const operator = await requireUser(req, res); if (!operator) return;
if (tooMany(`operator-revoke|${operator.id}`, 5, 15*60*1000)) ...          // optional here
if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
const target = await db.get('select id, name, email, is_instance_admin from users where id = ?', [match[1]]);
if (!target) return fail(res, 404, 'notFound', 'Not found');
```

**Audit-log write — copy the full 12-column literal inside `db.tx()`** (server.js:6731-6746):

```js
const out = await db.tx(async () => {
  // ...flag UPDATE here...
  await db.run(
    'insert into audit_log (id, actor_id, target_id, action, session_count, ip, workspace_id, actor_name, actor_email, target_name, target_email, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)',
    [uid(), operator.id, target.id, 'operator_promoted', null, clientIp(req), null, operator.name, operator.email, target.name, target.email, now()],
  );
});
```

All 12 columns are required (NOT NULL on actor/target name/email/created_at); pass `null` for session_count and workspace_id (other insert sites do the same: server.js:6426, 6445, 7660). Forced audit failure rolls back the flag update. Use action strings `operator_promoted` / `operator_demoted` (audit read route server.js:6676 lists them under "all").

### 4. Last-operator guard (WSG-06)

**Analog:** `server.js:7121` (needOwner):

```js
if (row.role === 'owner' && (await ownerCount(ctx.ws.id, target.id)) === 0)
  return fail(res, 409, 'needOwner', 'Every workspace needs an owner');
```

**Copy:** count-before-UPDATE + keyed 409. **Adapt:** `select count(*) as c from users where is_instance_admin = 1` — if target is flagged and c <= 1, refuse with new keyed 409 (e.g. `lastOperator`). Also seeds the `err.needOwner` locale precedent (en.json:1784).

### 5. operatorCard promote/demote UI (WSG-06)

**Analog:** `src/pages/settings.js:253-271` operatorCard + `src/actions/actions.js:2749-2760`

Copy the ternary action-column shape — non-flagged rows get an action button, flagged rows get a hint/badge:

```js
// settings.js:266-269 — S.ui.operatorRevoke === u.id ? inline-confirm :
//   u.is_instance_admin ? hint : <button class="btn btn-secondary btn-sm" data-a="operatorRevokeAsk" data-id="${esc(u.id)}">
```

**Adapt:** add `data-a="operatorPromote"` on non-flagged rows, `data-a="operatorDemote"` on flagged rows (reusing or paralleling the D-90 inline-confirm stage: `S.ui.operatorRevoke` carries target id, ask/cancel/confirm trio in actions.js:2749-2760, `api.operatorRevokeSessions(id)` then `refreshOperatorUsers()` re-render). New keys land under the existing `settings.operator.*` namespace (en.json:1482-1491 shows the naming convention).

### 6. Popover create-button gating (WSG-10)

**Analog:** `src/overlays/popovers.js:262` — the create item is currently unconditional:

```js
// popovers.js:262 — template literal; render is reactive off S.ui.pop / state
`...<div class="msep"></div><button class="mi" data-a="newWorkspace">${ic('plus', 15)}${tMsg('popover.createWorkspace')}</button>${actions}`
```

**Copy:** nothing new to invent — just wrap the `<button class="mi" data-a="newWorkspace">` fragment in a ternary on the gate-aware `api.canCreateWorkspace` getter. Existing precedent for conditional fragments in the same template is the `api.enabled ? ... : ...` wrapper at popovers.js:255.

### 7. Await-access view (WSG-10)

**Analog:** `src/pages/auth.js:129-134` — the `no-workspace` view IS the base; extend it, don't create a new surface:

```js
// auth.js:129-134 — authShell card, signed-in-as panel, sign-out already present:
if (s === 'no-workspace')
  return authShell(
    `<div class="auth-card...">${brandLogo(96)}
    <h1>${t('page.auth.noWorkspaceTitle')}</h1><p class="sub">${t('page.auth.noWorkspaceBody')}</p>
    <div class="panel" ...>${t('page.auth.signedInAs')} ${esc(api.user?.email ...)}</div>
    <button class="btn btn-secondary btn-lg btn-block" data-a="signOut">${t('palette.signOut')}</button></div>`);
```

**Poll loop analog:** `src/main.js:111-126` pollNotifs — the house tick pattern:

```js
// main.js:115-118 — guards first, hydrate, memo-diff render; setInterval at :126
const pollNotifs = async () => {
  if (!api.enabled || !api.user || S.ui.conflict || hasPendingChanges() || S.ui.auth) return;
  ...
};
setInterval(pollNotifs, 30000);
```

**Visible-tab-only analog:** `src/core/store.js:283-287` — the house visibilitychange precedent:

```js
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushNow();
});
```

**Adapt:** 15 s interval, `if (document.hidden) return;` guard at tick top, probe `GET /api/workspaces` (server.js:6803-6806, returns userPayload workspaces — recommended over a new endpoint) or `api.me()`; stop when memberships appear or `api.user.isInstanceAdmin` → soft-enter via `hydrateFromServer(slug)` + `enterApp()` (the finishLogin happy path). Both entry points must be changed consistently: `src/main.js:402` (boot) AND `enterNoWorkspace()` in actions.js (~:4033, called from finishLogin) — Pitfall 10 double-hook.

### 8. canCreateWorkspace getter (WSG-03 client side)

**Analog:** `src/core/api.js:157-159` (getter) + `:175` (state adoption) — self-modification:

```js
get canCreateWorkspace() {
  return state.creation === 'open' || state.workspaces.some(w => w.role === 'owner' || w.role === 'admin');
}
// api.js:175
state.creation = r.data?.workspaceCreation === 'open' ? 'open' : 'admins';
```

**Adapt:** server sends boolean; client `state.creation = !!r.data?.workspaceCreation`; getter simplifies to `state.creation || state.user?.isInstanceAdmin` (the workspace owner/admin clause is dead under D-112). Verify consumers: main.js:402, enterNoWorkspace, A.newWorkspace (actions.js:3201 — keeps its `err.askAdmin` toast as belt-and-braces).

### 9. test/creation-gate.test.mjs (Wave 0)

**Analog:** `test/domain-admission.test.mjs:100-115` — boot-log assertion via `server.output()`:

```js
const server = await startServer({ env: { ALLOW_SIGNUP_DOMAINS: '*', ... } });
const line = server.output().split('\n').find(l => l.includes('domains: ALLOW_SIGNUP_DOMAINS:'));
assert.ok(line, 'the D-06 source-tagged boot line exists');
```

**Copy:** startServer-per-case pattern (env overrides), `server.output()` grep for the boot line and the boot-refuse stderr text, `await server.stop()` in finally. **Adapt:** for invalid-token cases assert child exit + error text naming WORKSPACE_CREATION and both valid values (harness captures stderr, test/helpers/server.mjs:65); for boot-refuse the server exits before ready — don't await health. **Critical:** test/helpers/server.mjs:17-26 BASE_ENV must gain `WORKSPACE_CREATION: 'true'` or every workspace-creating fixture suite breaks under unset=false (Pitfall 5).

### 10. e2e/await-access.spec.mjs (Wave 0)

**Analog:** `e2e/locale-refusal.spec.mjs` — the phase-77 spec read in full:

- Imports catalogues directly (`import nl from '../src/locales/nl.json' with { type: 'json' }` — no duplicated string table).
- Static key-presence assert: `test.expect(typeof cat[KEY]).toBe('string')` for each locale.
- Per-locale/per-case browser contexts; accounts created via `createAccount(BASE_URL, run, ...)` helpers from `e2e/helpers/setup.mjs`.

**Adapt:** exercise the closed-gate signup → await-view render → sign-out presence → poll-enter flow; drive `visibilitychange` by dispatching the event (A2: if flaky, assert the `document.hidden` guard at unit level instead).

### 11. i18n keys (WSG-11)

**Analog:** `src/locales/en.json:1482-1491` (`settings.operator.*` namespace), `:1784` (`err.needOwner`), `:339` (`err.signupDomainNotAllowed` — the phase-77 refusal key precedent).

**Copy:** `err.<camelCaseCode>` keys mirror fail() codes exactly (error-codes.test.mjs auto-extracts fail() literals → en+fr). **Adapt:** new keys: `err.workspaceCreationClosed`-style gate refusal, `err.lastOperator`, await-page keys (`page.auth.noWorkspace*` rewording + poll hint), `settings.operator.promote*/demote*` actions + toast — all 5 catalogues in the SAME commit (nl/de/es enforced by the locale-refusal exact-match pattern; en↔fr by test/catalogue.test.mjs).

## Shared Patterns

### sameOrigin-first mutation ordering (Pitfall 22)
**Source:** `server.js:6705-6707`
**Apply to:** both new operator endpoints and the gate-swapped POST /api/workspaces.
`if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', ...)` before ANY body read or throttle.

### fail() keyed refusal → client tErr pipeline
**Source:** `server.js:4682` (fail), `src/core/api.js:86` + `src/core/i18n.js:244` (tErr → `t('err.'+code)` with English fallback)
**Apply to:** every new refusal (`lastOperator`, creation-closed key).

### db.tx + 12-column audit literal
**Source:** `server.js:6731-6746` (also 6426, 6445, 7660)
**Apply to:** promote/demote writes — audit row in the SAME transaction as the flag UPDATE.

### poll guard + visibilitychange
**Source:** `src/main.js:111-126`, `src/core/store.js:283-287`
**Apply to:** await-page 15 s poll — `document.hidden` guard at tick top.

### startServer env-override harness
**Source:** `test/helpers/server.mjs` (BASE_ENV :17-26, output() :65)
**Apply to:** all creation-gate suites; add `WORKSPACE_CREATION: 'true'` to BASE_ENV.

## No Analog Found

None — every new symbol has a direct tracked-source analog.

## Metadata

**Analog search scope:** server.js, src/pages/, src/actions/, src/core/, src/overlays/, src/main.js, src/locales/, test/, e2e/, test/helpers/
**Files read directly:** server.js (5 zones), auth.js, settings.js, popovers.js, main.js, store.js, domain-admission.test.mjs, locale-refusal.spec.mjs, helpers/server.mjs, en.json
**Pattern extraction date:** 2026-11-19
