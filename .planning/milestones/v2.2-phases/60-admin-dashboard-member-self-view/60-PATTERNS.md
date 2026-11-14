# Phase 60: Admin Dashboard & Member Self-View - Pattern Map

**Mapped:** 2026-11-13
**Files analyzed:** 11
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` (+`GET /api/workspaces/:slug/dashboard`) | route/controller (admin) | request-response | `server.js` Phase 52 transparency route (~6105-6139) | exact |
| `server.js` (+`GET /api/workspaces/:slug/me/visibility`) | route/controller (member) | request-response | same Phase 52 route | exact |
| `src/pages/dashboard.js` (NEW) | component/page | request-response + polling | `src/pages/members.js` (lazy page + expander) / `src/pages/home.js` (panel grid) | role-match |
| `src/pages/settings.js` (+My access section) | component/page section | request-response | its own `notif-push` section (`case 'notif-push'` ~522) + members.js expander rows | exact |
| `src/shell/layout.js` (+`P.dashboard`) | route registration | — | its own `P` map lazy entries (lines 41-68) | exact |
| `src/shell/layout.js` (+sidebar entry) | nav | — | its own `renderSidebar()` sItem entries (lines 164-177) | exact |
| `src/shell/render.js` (+ROUTE_IDS/ROUTE_ICONS) | config/route table | — | its own `ROUTE_IDS`/`ROUTE_ICONS` (lines 21-63) | exact |
| `src/core/api.js` (+`api.dashboard`, `api.myVisibility`) | service/api client | request-response | its own `memberVisibility` method (~line 346) + `call()` signal passthrough (line 59) | exact |
| `src/locales/en.json` / `fr.json` | config/i18n | — | existing `page.members.visReason.*` keys | exact |
| `test/dashboard.test.mjs` (NEW) | test | — | `test/transparency.test.mjs` (gate order, spawned server) | exact |
| `test/self-visibility.test.mjs` (NEW) | test | — | `test/transparency.test.mjs` + `test/helpers/visibility-fixture.mjs` | exact |
| `e2e/dashboard.spec.mjs` (NEW) | test (e2e) | — | existing `e2e/*.spec.mjs` (playwright config, port 4317) | role-match |

All named analogs verified git-tracked via `git ls-files`.

## Pattern Assignments

### `server.js` — dashboard aggregate route (admin, request-response)

**Analog:** `server.js` lines 6105-6139 (Phase 52 transparency route — the exact gate template)

**Gate order pattern** (lines 6105-6112) — copy verbatim, change minRole to `'admin'` (already is) and drop the target-member lookup:
```js
const wsMemberVisibilityMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/members\/([A-Za-z0-9_-]{1,64})\/visibility$/);
if (wsMemberVisibilityMatch && method === 'GET') {
  const ctx = await requireWorkspace(req, res, wsMemberVisibilityMatch[1], 'admin');
  if (!ctx) return;
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  // ...
```

**Read-copy posture** (lines 6114-6120) — normalizeProjects on a read copy; the dashboard route uses the SAME `JSON.parse(ctx.ws.doc)` raw-doc source (DASH-04: never `docForClient`):
```js
const doc = JSON.parse(ctx.ws.doc);
normalizeProjects(doc);
const memberTeams = await teamsOfMember(ctx.ws.id, targetMemberId, row);
```

**Response pattern** (lines 6138): `return json(res, 200, { ... })`; all error exits through `fail(res, status, code, msg)` before any data.

**Route placement:** immediately beside the Phase 52 route (before the EXPORT-ROUTE-BEGIN markers at line 6151). Role ladder: `ROLE_RANK = { viewer: 1, member: 2, admin: 3, owner: 4 }` (line 219); `requireWorkspace` at ~line 4010.

**Key inversion to document in the route comment:** the export route (lines 6183-6185) mandates `docForClient`; the dashboard route deliberately reads the RAW doc per the power-admin ruling (2026-11-12) — admin gate is the only protection.

---

### `server.js` — self-view route (member, request-response)

**Analog:** same Phase 52 route — the ONLY changes per research: minRole `'member'`, `myId = ctx.membership.member_id` (no user lookup, no 404 branch), response omits the `member` echo entirely:
```js
return json(res, 200, { projects }); // TRN-02: nothing else in the payload
```

Keep the funnel loop verbatim (lines 6122-6137) including the single-teamName block (T-52-03) and `?? 'member'` fallback.

---

### `src/pages/dashboard.js` (NEW page, request-response + poll)

**Analog A (lazy page shape + panel markup):** `src/pages/members.js` — `pageMembers()` (lines 30-44): header pattern `<div class="ph">…<h1>${t('nav.route.x')}</h1>…`, panel sections with `panel-h`; task rows via `miniRow(x)` and activity feed via `actHtml(a)` from `../components/task-list.js` (import block lines 2-28 is the canonical import list for a page module).

**Analog B (stat panels):** `src/pages/members.js` `pageMember()` lines 207-212:
```html
<div class="stats" style="margin-bottom:18px">
  <div class="stat"><span class="k">${t('...')}</span><span class="v">${n}</span></div>
```

**Analog C (admin UX gate, D-52-4 client side):** `src/pages/members.js` line 37 `const isAdmin = isMemberAdmin();` and conditional rendering (line 94).

**Deep links (D-09):** use existing `data-a="go" data-r="task"` drawer path — `src/shell/render.js` `urlForView` (lines 116-136) already addresses `/w/:slug/task/:key` and `/w/:slug/project/:key`; page rows just emit `data-a="go" data-r="task" data-key="…"` / `data-r="project" data-id="…"` like members.js rows do (lines 176, 220).

**Poll skeleton (D-05):** `src/core/api.js` line 59 — `call(method, path, body, { keepalive = false, signal } = {})` already accepts `signal` (Phase 58). Page pattern:
```js
let timer, inflight;
async function refresh() {
  inflight?.abort();
  inflight = new AbortController();
  const data = await api.dashboard(slug, window, { signal: inflight.signal });
  /* swap panel HTML */
}
refresh();
timer = setInterval(refresh, 30000);
// cleanup on route change: clearInterval(timer); inflight?.abort();
```
Client data comes ONLY from the endpoint response — never from `visibleProjects()`/`allTasks()` (mirrors the members.js expander comment, lines 67-70).

---

### `src/pages/settings.js` — My access section (D-11)

**Analog:** the file's own section pattern:
- Nav registration: `SET_NAV` array (lines 75-99) — add `['my-access', 'settings.nav.myAccess', 'shield-check']`-style entry in the personal or workspace group.
- Section resolution + stale-deep-link fallback: `pageSettings()` lines 284-296 (`known.includes(sec)` fallback).
- Body: `switch (sec) { case 'notif-push': … }` (~line 522) — add a `case 'my-access'` returning `H(t('settings.myAccess.lead')) + …` blocks using `srow()` (line 100-102) / `.sblock` panels.

**Row markup (D-14):** copy `src/pages/members.js` lines 75-91 verbatim — `KNOWN` codes list, label ternary with `visReasonTeam`, and the row template:
```js
const label = KNOWN.includes(p.reason)
  ? p.reason === 'team' && p.teamName
    ? t('page.members.visReasonTeam', { name: esc(p.teamName) })
    : t(`page.members.visReason.${p.reason}`)
  : esc(String(p.reason));
return `<div class="row" style="gap:8px">${pIcon(p, '', 14)}<span>${esc(p.name || p.id)}</span><span class="badge">${label}</span></div>`;
```
(Factor the label helper if reuse makes it cleaner — one vocabulary, two consumers.)

---

### `src/shell/layout.js` — lazy route + sidebar entry

**Analog (exact, lines 41-68):**
```js
const lazy = (imp, mk) => {
  const f = () => imp().then(m => (f.mod = m[mk].bind(m))());
  f.lazy = true;
  return f;
};
const P = {
  // ...
  settings: lazy(() => import('../pages/settings.js'), 'pageSettings'),
  // + dashboard: lazy(() => import('../pages/dashboard.js'), 'pageDashboard'),
};
```
No other change needed — `fillPage()` (lines 97-115) gives skeleton-then-fill (D-03) for free.

**Sidebar entry (D-01, admin-only):** `renderSidebar()` lines 164-177:
```js
${sItem('overview', routeName('overview'), 'layout-dashboard')}
// + ${isMemberAdmin() ? sItem('dashboard', routeName('dashboard'), 'gauge') : ''}
```
`isMemberAdmin()` must be imported from `../core/store.js` (home.js line 42 shows the conditional-render idiom). UX gate only — the server 403 is the control.

---

### `src/shell/render.js` — route table

**Analog (exact, lines 21-63):** add `'dashboard'` to `ROUTE_IDS` (the coverage check reads this list) and `dashboard: 'gauge'` (or another existing lucide icon — check `src/core/icons.js` mapping first; 'layout-dashboard' is taken by overview) to `ROUTE_ICONS`. `urlForView`'s `ROUTE_IDS.includes(route)` catch-all (line 134) then addresses `/w/:slug/dashboard` automatically.

---

### `src/core/api.js` — client seams

**Analog (exact, lines 341-346):**
```js
return call('GET', `/api/workspaces/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}/visibility`);
```
Add:
```js
dashboard: (slug, activityWindow, { signal } = {}) =>
  call('GET', `/api/workspaces/${encodeURIComponent(slug)}/dashboard` + (activityWindow ? `?activityWindow=${encodeURIComponent(activityWindow)}` : ''), undefined, { signal }),
myVisibility: slug =>
  call('GET', `/api/workspaces/${encodeURIComponent(slug)}/me/visibility`),
```

---

### `test/dashboard.test.mjs` (NEW)

**Analog:** `test/transparency.test.mjs` (lines 1-80) — copy the harness shape:
```js
import { after, before, test } from 'node:test';
import { login, startServer } from './helpers/server.mjs';
import { createVisibilityFixtureDb, VIS_ACTORS, VIS_PASSWORD, VIS_USER_IDS, VIS_WS, VISIBILITY_MODEL } from './helpers/visibility-fixture.mjs';
```
Pattern: `client.get(path)` helpers (lines 58-64), `assert.equal(res.status, 403)` gate matrix, `Object.keys(p)` entry-shape assertions (lines 69-80). **Anti-tautology:** expectations from the hand-derived `VISIBILITY_MODEL` / seeded fixture, never from production predicates; the test file must NOT import from `server.js`.

### `test/self-visibility.test.mjs` (NEW)

**Analog:** same file — the byte-level shape assertion (lines 69-80) is the TRN-02 template; add needle scans: `assert.ok(!JSON.stringify(payload).includes(actorId))` per fixture actor id/email.

---

### `src/locales/en.json` / `fr.json`

**Analog:** existing `page.members.visReason.{everyone,lead,member,team}` + `visReasonTeam` keys (consumed at members.js lines 85-86). New keys follow the same namespace discipline (`page.dashboard.*`, `settings.myAccess.*`); run `npm run i18n:scan` (0 dead / 0 stale gate).

## Shared Patterns

### Server gate is the control (D-52-4)
**Source:** `server.js:6107-6109`, comment block 6095-6104
**Apply to:** both new routes. `requireWorkspace(slug, minRole)` → `if (!ctx) return` → `sameOrigin` → everything else. Failure exits through `fail()` before any doc parse.

### The ONE visibility funnel
**Source:** `server.js` `memberCanReadProject` (~949), `projectAccessReason` (~976), `teamsOfMember` (resolve once per request — never memoized, D-50-3)
**Apply to:** self-view route only. Dashboard aggregates compute directly over the raw doc per the power-admin ruling; a second visibility predicate anywhere is a pin violation.

### Overdue definition
**Source:** `src/core/store.js:424` — `t.due && t.status !== 'done' && diffD(parse(t.due), TODAY) < 0`
**Apply to:** the server reducer must mirror this semantic; server "today" anchor should reuse whatever `test/due-reminders.test.mjs` pins (executor greps server.js for the reminder date helper first). Client stays display-only.

### Activity rows
**Source:** doc `data.activity` (server redaction site `server.js:1211`; client `D().activity` consumed in members.js line 195-197). Row shape `{ id, by, verb, task, project, at, extra }`; render verbs via existing `actHtml`/`actCategory` from `src/components/task-list.js` / Phase 9 rules.
**Apply to:** dashboard activity panel — server filters `a.at >= sinceMs` with whitelisted window param (`24h|7d|30d`, default `7d`).

### Lazy-route + skeleton-then-fill
**Source:** `src/shell/layout.js` lines 41-115
**Apply to:** dashboard page must be a `lazy()` entry (DELIV-02 chunk gate, ~6.6 kB entry headroom) — never entry-chunk imports; verify with `node --test test/build-chunk-size.test.mjs`.

### i18n discipline
**Source:** `scripts/i18n-scan.mjs` gate + existing `page.members.visReason.*` keys
**Apply to:** every new string catalogued EN+FR; machine reason codes stay on the wire, labels at render.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| dashboard aggregate reducer (server-side overdue/load/upcoming) | service logic (inline in route) | transform | No existing server-side aggregate; compose from `isOver` semantics + `assignees[]` reads (array only, per `test/assignees-migration.test.mjs`). Use research Code Examples + due-reminders date anchor. |

## Metadata

**Analog search scope:** `server.js`, `src/pages/`, `src/shell/`, `src/core/`, `test/`, `test/helpers/`, `e2e/`
**Files scanned:** ~12 (deep-read: server.js 6080-6209, members.js, layout.js, render.js, settings.js, store.js, transparency.test.mjs, api.js)
**Pattern extraction date:** 2026-11-13
