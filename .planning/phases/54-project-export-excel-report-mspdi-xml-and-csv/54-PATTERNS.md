# Phase 54: Project export — Excel report, MSPDI XML and CSV — Pattern Map

**Mapped:** 2026-11-09
**Files analyzed:** 28 (17 new, 11 modified)
**Analogs found:** 20 direct + 7 partial / 28 (1 with no close analog: the shared fixture)

> Every analog path below is git-tracked source, verified with `git ls-files -- <path>`.
> `export/` and `src/export/` do not exist yet — this phase creates them.

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/export/model.js` | model | transform | `src/lib/redaction.js` | role-match |
| `src/export/options.js` | config | transform | `src/core/constants.js` | partial |
| `src/export/gantt.js` | utility | transform | `src/views/timeline.js` | role-match |
| `src/export/csv.js` | utility | transform | `mailer.js` (`escapeHtml`) | partial |
| `export/xlsx.js` | service | file-I/O | `mailer.js` (buffer producer) | partial |
| `export/mspdi.js` | service | transform | `mailer.js` (`escapeHtml`) | partial |
| `src/core/download.js` | utility | file-I/O | `src/core/api.js` (`uploadLogo`) | role-match |
| `src/overlays/modals.js` (mod) | component | request-response | `src/overlays/modals.js` (`shareModal`) | exact |
| `src/actions/actions.js` (mod) | controller | request-response | `src/actions/actions.js` (`A.share`, `IN.*`) | exact |
| `src/pages/project.js` (mod) | component | request-response | `src/pages/project.js` (header cluster) | exact |
| `src/overlays/context-menu.js` (mod) | component | request-response | `src/overlays/context-menu.js` (`p.ctx === 'project'`) | exact |
| `src/locales/en.json` (mod) | config | transform | existing catalogue families | exact |
| `src/locales/fr.json` (mod) | config | transform | existing catalogue families | exact |
| `server.js` (mod) | controller | request-response | `server.js` project PATCH / doc GET | exact |
| `package.json` (mod) | config | — | `package.json` `dependencies` | exact |
| `eslint.config.js` (mod) | config | — | `eslint.config.js` node-globals block | exact |
| `Dockerfile` (mod) | config | — | `Dockerfile` runtime COPY list | exact |
| `test/dependencies.test.mjs` (mod) | test | — | itself (assertions) | exact |
| `test/export-model.test.mjs` | test | transform | `test/dependencies.test.mjs` | role-match |
| `test/export-csv.test.mjs` | test | transform | `test/dependencies.test.mjs` | role-match |
| `test/export-gantt.test.mjs` | test | transform | `test/dependencies.test.mjs` | role-match |
| `test/export-xlsx.test.mjs` | test | file-I/O | `test/dependencies.test.mjs` + `test/helpers/unzip.mjs` | partial |
| `test/export-mspdi.test.mjs` | test | transform | `test/dependencies.test.mjs` | role-match |
| `test/export-route.test.mjs` | test | request-response | `test/helpers/server.mjs` consumers | role-match |
| `test/export-prohibition.test.mjs` | test | — | `test/dependencies.test.mjs` (source assertions) | role-match |
| `test/fixtures/export-fixtures.mjs` | test fixture | transform | — | none |
| `test/helpers/unzip.mjs` | test utility | file-I/O | `test/helpers/server.mjs` (helper shape) | partial |
| `test/helpers/xml.mjs` | test utility | transform | `test/helpers/server.mjs` (helper shape) | partial |

---

## Pattern Assignments

### `src/export/model.js` (model, transform)

**Analog:** `src/lib/redaction.js` — the repo's one shared, dependency-free, DOM-free module imported by both `server.js` and `src/`.

**Module contract to copy** (lines 1-24):

```js
// SEARCH-01 (Phase 34): tokenized hidden-name matcher for recent searches.
//
// D-13 — match on word/token boundaries after normalization instead of a raw
// substring `includes`: ...
//
// Pure and importable — server.js stays export-free (D-16 test seam).

/* Normalize + tokenize a value: NFC, lowercase, split on any run of
   characters that is not a letter or a number (Unicode-aware). */
export function tokenize(value) {
  if (typeof value !== 'string') return [];
  ...
}
```

What to copy:
- A leading header comment naming the decision ids the module implements, then one `export function` per pure responsibility.
- No imports at all. `src/export/model.js` must not import `src/core/utils.js` (`document`/`navigator` touched at module scope — see `scripts/export-seed.mjs` header) and must not import `src/core/constants.js` (`LABELS` entries are lazy client-`t` getters, `src/core/constants.js:80-91`).
- Dependency injection, not a singleton: `buildExportModel(doc, projectId, opts, deps)` with `deps = { translate, labelName, now }`. The client passes `t`, the server passes `(k, v) => tFor(locale, k, v)` (`src/core/i18n.js:194-206`).
- Return `null` for an unknown project; the route maps it to 404. Do not throw.

**Key constants live here** so the dead-key gate can see them (see “i18n gate” below): `export.col.*`, `export.sheet.*`, `export.timeline.truncated`. They must be plain string literals (the gate's `collectReferencedKeys` only recognises literal/template-head strings, `scripts/i18n-scan.mjs:1291-1314`).

---

### `src/export/options.js` (config, transform)

**Analog:** `src/core/constants.js` (frozen id tables + derived maps, lines 80-138).

```js
export const LB = Object.fromEntries(LABELS.map(l => [l.id, l]));
```

Copy the shape, not the lazy-`t` getters:

```js
export const DEFAULT_OPTIONS = Object.freeze({
  descriptions: false, comments: false, subtasks: false,
  completed: true, archived: false,
});
```

RESEARCH allows folding this into `model.js` (Recommended Structure, line 223). If folded, no separate file and no separate test. If kept, add it to the model test — the five toggle names are asserted by R3.

> **Resolved by the plans:** folded. No `src/export/options.js` file is created; `DEFAULT_OPTIONS` and its freeze live in `src/export/model.js` and are asserted in `test/export-model.test.mjs`. Plan 01 cites the `model.js` section for this material. Likewise the phase's request-response suite is `test/export-route.test.mjs`, not a separate permissions file.

---

### `src/export/gantt.js` (utility, transform)

**Analog:** `src/views/timeline.js` — the only existing implementation of this geometry.

**Axis geometry** (lines 27-31, 48-54):

```js
const dw = S.ui.tlZoom === 'week' ? 32 : 11;
const rs = startOfWeek(addD(TODAY, S.ui.tlZoom === 'week' ? -21 : -56));
const nDays = S.ui.tlZoom === 'week' ? 7 * 13 : 7 * 34;
const X = ds => diffD(parse(ds), rs) * dw;
...
const RH = 36;
const rowY = {};
rows.forEach((r, i) => { if (r.type === 't') rowY[r.t.id] = i * RH + RH / 2; });
```

**Bar width rule** (lines 92-97) — the exact inclusive-span rule D-54-6 needs:

```js
const s = t.start && t.start <= t.due ? t.start : t.due;
const x = X(s);
const w = Math.max(dw, (diffD(parse(t.due), parse(s)) + 1) * dw);
```

**Dependency anchors** (lines 100-116): predecessor finish edge `X(a.due) + dw` → successor start edge `X(s)`, with a bent cubic between them. The export uses `bentConnector3` instead of SVG, but the anchor columns come from the same two dates.

**Milestone placement** (lines 151-167): one diamond per date, same-day milestones merged; export keeps one diamond per milestone (no merge) but the column rule is `columnOf(date)`.

Also copy the empty state from lines 127-133: no rows is a valid render, never an error — R6's “zero dated tasks” edge.

Do **not** copy `TODAY`, `S.ui.tlZoom` or the 32/11 px widths: the export axis is adaptive (90-day threshold) and the Today marker is `columnOf(exportDate)`.

---

### `src/export/csv.js` (utility, transform)

**Analog:** `mailer.js:99-101` — the repo's boundary-escaping convention (escape once, at the serialisation edge, with an explicit map):

```js
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
```

CSV rules differ (RESEARCH Pattern 8): RFC-4180 quoting, UTF-8 BOM, and `'` prefix for `= + - @`. Follow the same shape — a `cell(v)` function plus one `toCsv(model)` export:

```js
const BOM = '\uFEFF';
const RISKY = /^[=+\-@]/;
const cell = v => {
  let s = v == null ? '' : String(v);
  if (RISKY.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
```

Header labels arrive already translated in `model.headers.task` — the module imports nothing (no `t`, no `utils`).

---

### `export/xlsx.js` (service, file-I/O)

**Analog:** none for workbook writer; partial for “produce bytes on the server” — `mailer.js:108-110`:

```js
function base64Body(value) {
  return Buffer.from(value, 'utf8').toString('base64');
}
```

Copy from it: server-only module, Node `Buffer`, no display strings. Everything else comes from RESEARCH §Patterns 2/3/5/9 and §Code Example 1. For the `Board` sheet, take lane order and card fields from `src/views/board.js:32-41` (`STATUSES.map`, count per lane, title/assignee/priority/due/subtask progress) — never from rendered HTML. Key placement rules:
- import only subpaths (`@office-kit/xlsx/workbook`, `/worksheet`, `/styles`, `/drawing`, `/chart`, `/node`) — no root import (Pitfall 1);
- six sheets created up front in fixed English order;
- `wb.bookViews = [makeWorkbookView({ activeTab })]` in addition to `setActiveSheet`;
- `setFreezePanes(ws, 'A2')`, Timeline `'D2'`;
- yield with `setImmediate` between sheets; build fully in memory, then one `res.end(buf)`.

---

### `export/mspdi.js` (service, transform)

**Analog:** `mailer.js:99-101` for the escaper; structure has no analog.

```js
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
```

The MSPDI escaper is the same five entities plus `'` → `&apos;`:

```js
const escXml = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
```

Everything else (element order, FieldIDs, `ExtendedAttribute` not `<Text1>`, empty-collection omission) comes from RESEARCH §Pattern 6; do not improvise order — Project treats it positionally (Pitfall 8).

---

### `src/core/download.js` (utility, file-I/O)

**Analog:** `src/core/api.js` `uploadLogo` (lines 249-273) — the repo's existing raw-`fetch`, same-origin, non-JSON client call:

```js
async uploadLogo(file) {
  const slug = state.workspace?.slug;
  if (!slug || !file) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
  let res;
  try {
    res = await fetch(`/w/${encodeURIComponent(slug)}/logo`, { method: 'POST', credentials: 'same-origin', body: file });
  } catch {
    return { ok: false, status: 0, error: t('err.serverUnreachable') };
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) return { ok: false, status: res.status, error: data?.code ? tErr(data.code, data, data?.error) : data?.error };
  ...
}
```

Copy this error contract exactly:
- network failure → `{ ok: false, status: 0, error: t('err.serverUnreachable') }`;
- non-2xx → errors are JSON, map with `tErr(data.code, data, data?.error)`;
- 2xx → `await res.blob()` (never `res.text()`; see `api.call` lines 59-95, which always drains text and JSON-parses it);
- filename from `Content-Disposition`, `filename*=UTF-8''` parsed **before** `filename="..."` — `fileDisposition` emits both (`server.js:5860-5867`) and only the first survives accents.

`saveBlob(blob, filename)` uses `URL.createObjectURL` + a `download` anchor; keep the `download`-attribute convention already used at `src/overlays/modals.js:435`.

---

### `src/overlays/modals.js` (component, request-response) — MODIFY

**Analog:** itself — `shareModal` and the `modalHtml` switch.

**Switch registration** (lines 33-43). Add a `case 'export':` branch alongside `share`:

```js
export function modalHtml(m) {
  const H = (title, sub = '') =>
    `<div class="modal-h">...<button class="ibtn ibtn-sm" data-a="closeModal" aria-label="${t('a11y.close')}">${ic('x', 16)}</button></div>`;
  const wrap = (cls, inner) => `<div class="modal ${cls}" role="dialog" aria-modal="true" aria-labelledby="mt-${m.type}">${inner}</div>`;
  switch (m.type) {
    ...
    case 'share':
      return wrap('', shareModal(m, H));
```

**Modal body + footer** (lines 202-213 and 288):

```js
export function shareModal(m, H) {
  const p = proj(m.id);
  if (!p) return H(t('err.projectNotFound'));
  const canManage = canManageProject(p);
  ...
  return `${H(t('modal.shareTitle', { name: esc(p.name) }))}
  <div class="modal-b">...</div>
  <div class="modal-f"><button class="btn btn-secondary" data-a="copyLink" data-pid="${p.id}">${ic('link', 14)}${t('act.copyLink')}</button><span class="sp"></span><button class="btn btn-primary" data-a="closeModal">${t('act.done')}</button></div>`;
}
```

Copy: `H(title, sub)` header, `form class="modal-b"` with `data-submit="..."`, footer `modal-f` with `sp` spacer. Every label through `t('export.*')`, every user string through `esc()`. Toggle inputs use the existing `IN` handler convention (`data-in="..."`).

**Download affordance precedent** (lines 434-435) — the `download` attribute and `ic('download', 14)` already exist:

```js
? `<a class="btn btn-secondary" href="/w/${D().ws.url}/file/${f.id}" download="${esc(f.name)}">${ic('download', 14)}${t('act.download')}</a>`
```

For a generated blob this becomes a button (`data-a="exportSubmit"`), not an `<a>` — but keep the icon and the label key `act.download` if a direct save action is offered.

---

### `src/actions/actions.js` (controller, request-response) — MODIFY

**Analog:** itself — `A.share` and the `IN.*` handlers.

**Action table** (lines 56-60):

```js
export const A = {},
  IN = {},
  KEY = {},
  DBL = {},
  BLUR = {};
```

**Open-modal action** (lines 1708-1713):

```js
/* sharing & invites */
A.share = el => {
  const id = el.dataset.id || curProjectId();
  S.ui.shareQ = '';
  S.ui.pop = null;
  openModal({ type: 'share', id });
};
```

**Input handler with permission re-check** (lines 1854-1857):

```js
IN.shareAccess = async el => {
  const p = proj(el.dataset.id);
  if (!p) return;
  if (!canManageProject(p)) return;
```

**Submit handler that re-renders** (lines 2040-2043):

```js
IN.invRole = el => {
  S.ui.inviteRole = el.value;
  render();
};
```

Register `A.exportOpen` (opens `{ type: 'export', id }`), `IN.exportOption`/`IN.exportScope` (state + `render()`), and `A.exportSubmit` (guard with `canManageProject`, call the download helper, toast success/failure). The dispatcher is `src/actions/events.js:34-39` — `const fn = A[el.dataset.a]`, so no registration list exists.

---

### `src/pages/project.js` (component, request-response) — MODIFY

**Analog:** itself, header cluster lines 70-79:

```js
<button class="ibtn ibtn-sm" data-a="toggleFavProj" ...>${ic('star', 15)}</button>
...
<div class="row" style="gap:4px">
  <button class="row" data-a="share" data-id="${p.id}" aria-label="${t('nav.route.members')}" style="gap:0">${avStack(p.members, 5, 'md')}</button>
  <button class="ibtn ibtn-sm" data-a="share" data-id="${p.id}" data-tip="${t('a11y.addMember')}" aria-label="${t('a11y.addMember')}">${ic('user-plus', 15)}</button>
  <button class="btn btn-secondary btn-sm hide-m" data-a="share" data-id="${p.id}">${ic('share-2', 13)}${t('act.share')}</button>
  <button class="ibtn ibtn-sm" data-a="editProject" ...>${ic('settings', 15)}</button>
  <button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="project" data-id="${p.id}" aria-label="${t('a11y.more')}">${ic('ellipsis', 15)}</button>
</div>
```

Insert **immediately before** the Share button, wrapped in the client guard:

```js
${canManageProject(p) ? `<button class="ibtn ibtn-sm" data-a="exportOpen" data-id="${p.id}" data-tip="${t('export.action')}" aria-label="${t('export.action')}">${ic('download', 15)}</button>` : ''}
```

D-54-2 is literal: render nothing, not a disabled button. Pattern source: `src/overlays/context-menu.js:70-76` hides member-management items rather than disabling them.

---

### `src/overlays/context-menu.js` (component, request-response) — MODIFY

**Analog:** itself.

**Item factory** (lines 10-13):

```js
export function ctxMenu(p) {
  const I = (act, icon, label, extra = '', r = '') =>
    `<button class="mi ${extra}" data-a="${act}" data-id="${p.id}" data-key="${p.key || ''}">${ic(icon, 15)}${label}${r ? `<span class="r">${r}</span>` : ''}</button>`;
```

**Project menu** (lines 35-51):

```js
if (p.ctx === 'project') {
  const pr = proj(p.id);
  if (!pr) return '';
  return (
    I('openProject', 'arrow-up-right', tMsg('toast.open')) +
    ...
    I('share', 'share-2', tMsg('act.share')) +
```

**Hide-when-denied precedent** (lines 65, 70-76):

```js
const canRm = isMemberAdmin() && m.id !== D().me && (me()?.role === 'Owner' || (m.role !== 'Owner' && m.role !== 'Admin'));
...
(canRm ? I('ctxRole', ...) + ... : '')
```

Add `(canManageProject(pr) ? I('exportOpen', 'download', tMsg('export.action')) : '')` after `share`. Import `canManageProject` from `../core/store.js` (already imported there: `D, mem, me, proj, task, visibleProjects, isMemberAdmin`, line 4).

---

### `src/locales/en.json` / `src/locales/fr.json` (config, transform) — MODIFY

**Analog:** existing catalogue families (`act.*`, `modal.*`, `err.*`) plus the plural object.

**Plural form** (`src/locales/en.json:1730-1734`):

```json
"common.starterTasks": {
  "one": "...",
  "other": "..."
},
```

**Shape gates that a new key must satisfy** (`test/catalogue.test.mjs:19-33, 41`):

```js
const FORBIDDEN = [
  { char: '<', name: 'a left angle bracket' },
  { char: '>', name: 'a right angle bracket' },
  { char: '"', name: 'a double quote' },
];
const KEY_SHAPE = /^[a-z][a-z0-9]*(\.[a-z][a-zA-Z0-9]*|\.[0-9]+)+$/;
const PLACEHOLDER = /\{(\w+)\}/g;
```

So:
- every key is at least two dotted lowercase segments — `export.scope.count` OK, `export` alone rejected;
- values carry no `<`, `>`, `"`;
- `{n}` placeholders must match between EN and FR and between catalogue and call site (`scripts/i18n-scan.mjs:15-21`);
- counts are `{one, other}` objects, resolved by `resolvePlural` (`src/core/i18n.js:168-185`);
- the SPEC prohibition requires that no `export.*` value contains `.mpp` (only the notice text may say “not .mpp”).

Existing bilingual anchors: `act.download` (`en.json:546`, `fr.json:547`), `err.serverUnreachable` (`en.json:445`, `fr.json:446`).

---

### `server.js` (controller, request-response) — MODIFY

**Analog:** itself — three existing patterns, in the order the export route must reproduce.

**1. Workspace-scoped project route** (`server.js:5026-5053`) — regex, `requireWorkspace`, `sameOrigin`, `readJson`, `fail`, `json`:

```js
const wsProjectMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/projects\/([A-Za-z0-9_-]{1,64})$/);
if (wsProjectMatch && method === 'PATCH') {
  const ctx = await requireWorkspace(req, res, wsProjectMatch[1], 'admin');
  if (!ctx) return;
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const body = await readJson(req);
  ...
  return json(res, 200, { projectId: wsProjectMatch[2], ..., revision: await wsRevision(ctx.ws.id) });
}
```

Export uses the **same shape** with `'viewer'` on `requireWorkspace` (read parity first), then the manage gate.

**2. The redacted document read** (`server.js:4675-4685`):

```js
const wsMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})$/);
if (wsMatch && method === 'GET') {
  const ctx = await requireWorkspace(req, res, wsMatch[1]);
  if (!ctx) return;
  return json(res, 200, {
    ...workspacePayload(ctx.ws, ctx.membership),
    revision: ctx.ws.revision,
    updatedAt: ctx.ws.updated_at,
    doc: await docForClient(JSON.parse(ctx.ws.doc), ctx.ws, ctx.membership),
  });
}
```

The export route may **only** see `await docForClient(JSON.parse(ctx.ws.doc), ctx.ws, ctx.membership)`. Never `ctx.ws.doc` — not even for the project name (R10 prohibition).

**3. Permission predicates** (lines 800-840):

```js
function canSeeProject(p, memberId, memberTeams = []) {
  if (!projectIsPrivate(p)) return true;
  if (!memberId) return false;
  if (Array.isArray(p.members) && p.members.includes(memberId)) return true;
  return Array.isArray(p.teams) && p.teams.length > 0 && memberTeams.some(t => p.teams.includes(t));
}
...
function canManageProject(p, memberId, role) {
  if (role === 'owner' || role === 'admin') return true;
  return !!memberId && p?.lead === memberId;
}
```

Server signature is `(p, memberId, role)` with **lowercase** roles; the client is `(p)` with `Owner`/`Admin` (Pitfall 13). Do not import one into the other.

**4. Response helpers and filename** (lines 3071-3087, 5860-5867):

```js
function json(res, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}
function fail(res, status, code, message, extra) {
  return json(res, status, { error: message, code, ...extra });
}
```

```js
function fileDisposition(name, inline) {
  // eslint-disable-next-line no-control-regex
  const safe = String(name || 'file').replace(/[\r\n"\u0000-\u001f\u007f]/g, '');
  const ascii = safe.replace(/[^\x20-\x7e]/g, '_') || 'file';
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
```

The binary response is the **only** place that does not use `json()`; write headers explicitly with `Cache-Control: no-store`, the correct MIME (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/xml; charset=utf-8`, `text/csv; charset=utf-8`), `Content-Length: buf.length`, and `fileDisposition('<slug>-<date>.<ext>')`.

**5. New error codes** must be static literals in `fail(res, <n>, '<code>', ...)` — `test/error-codes.test.mjs:19-28` scrapes exactly that form:

```js
for (const m of serverSource.matchAll(/fail\(res,\s*\d+,\s*'([A-Za-z][A-Za-z0-9]*)'/g)) codes.add(m[1]);
...
assert.ok(typeof fr[`err.${code}`] === 'string' && fr[`err.${code}`] !== '', `fr missing err.${code}`);
```

`exportForbidden` → `err.exportForbidden`, and `exportInvalidRequest` if the format is validated. Both catalogues.

**6. Route position matters** — `test/file-route-ordering.test.mjs` pins route precedence. Register the export route beside the other `/api/workspaces/:slug/projects/:id` routes (around 5026), before any generic catch-all. See the shared “Route ordering” note.

---

### `package.json` (config) — MODIFY

**Analog:** itself, lines 7-39.

```json
"scripts": { "prebuild": "node scripts/i18n-scan.mjs", "test": "node --test --test-concurrency=2 test/*.test.mjs", ... },
"engines": { "node": ">=24" },
"dependencies": { "pg": "^8.23.1" }
```

Change `dependencies` to `{ "@office-kit/xlsx": "0.26.1", "pg": "^8.23.1" }` — **exact pin**, no caret (SPEC constraint). The new test glob picks up `test/export-*.test.mjs` automatically; no script edit needed.

---

### `eslint.config.js` (config) — MODIFY

**Analog:** itself, lines 6-17.

```js
{
  files: ['**/*.js'],
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser } },
},
{
  files: ['vite.config.js', 'eslint.config.js', 'server.js', 'mailer.js', 'totp.js', 'oidc.js', 'mcp.js', 'scripts/**/*.mjs', 'test/**/*.mjs'],
  languageOptions: { globals: { ...globals.node } },
},
```

Add `'export/**/*.js'` to the node-globals `files` list. Without it, `Buffer`, `process` and `setImmediate` are `no-undef` because the catch-all `**/*.js` block gives every JS file browser globals only.

---

### `Dockerfile` (config) — MODIFY

**Analog:** itself, runtime stage lines 18-29.

```dockerfile
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/tz.js ./tz.js
...
COPY --from=build /app/src ./src
...
COPY --from=build /app/node_modules ./node_modules
```

Add `COPY --from=build /app/export ./export`. `node_modules` already ships, so the pinned writer resolves at runtime. Keep the runtime stage bare `node:24-alpine` + `su-exec` — no new `apk` package, no build toolchain.

---

### `test/dependencies.test.mjs` (test) — MODIFY

**Analog:** itself. Two assertions **will fail** until edited; both are intentional gates.

Lines 26-37:

```js
assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['pg'], ...);
assert.match(pkg.dependencies.pg, /^\^8\./, ...);
```

→ becomes `['@office-kit/xlsx', 'pg']` (sorted), plus a new exact-pin assertion for the xlsx entry.

Lines 39-72:

```js
assert.deepEqual(
  copyTargets.sort(),
  ['db-adapter.mjs', 'dist', 'mailer.js', 'mcp.js', 'node_modules', 'oidc.js', 'seed.json', 'server.js', 'src', 'totp.js', 'tz.js'],
  ...
);
```

→ add `'export'` to the expected list (sorted: `dist`, `db-adapter.mjs`, `export`, `mailer.js`, …). Also update the test title (“exactly the five COPY targets”) and the header comment block, which currently ends at “Phase 46”.

This test is also the model for the new prohibition test: it reads source text with `fs.readFileSync` and asserts on it, which is exactly how “no `@office-kit/xlsx` under `src/`” and “no `ctx.ws.doc` in export code” should be asserted.

---

### Test suites (test, transform / request-response)

**Analog:** `test/dependencies.test.mjs` for structure; `test/helpers/server.mjs` for integration.

**Suite skeleton** (from `test/dependencies.test.mjs:16-24`):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import pkg from '../package.json' with { type: 'json' };

const REPO_ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
```

**Integration harness** (`test/helpers/server.mjs:11-25`):

```js
export const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const ADMIN = Object.freeze({ email: 'owner@test.local', password: 'owner-password-1', name: 'Owner' });
const BASE_ENV = Object.freeze({ HOST: '127.0.0.1', SEED_DATA: 'false', ALLOW_SIGNUP: 'true', ... });
```

Permission tests import `ADMIN, ROOT, login, signup, startServer, client, inviteToken` exactly as `test/error-codes.test.mjs:11` does, and assert the **404-parity trio** (status, body, headers) by comparing the export response to the project-read response.

`test/export-prohibition.test.mjs` copies the “read the source as text” technique (`test/error-codes.test.mjs:13`):

```js
const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
```

then asserts: no `@office-kit/xlsx` import literal resolves under `src/`, and no `ctx.ws.doc` reference sits inside the export route block.

---

### `test/fixtures/export-fixtures.mjs` (test fixture, transform)

**Analog:** none. Build a plain ESM factory returning a fresh object per test (no shared mutable state) with the 12 cases RESEARCH §Wave 0 lists: daily span, weekly span, 90/91 pair, `start == due`, deps, milestone, empty lane, archived, done, subtasks, `=1+1`, `A & <B>`, `<script>` description.

---

### `test/helpers/unzip.mjs` / `test/helpers/xml.mjs` (test utilities)

**Analog:** `test/helpers/server.mjs` for helper shape — named exports, no side effects, `ROOT` derived from `import.meta.dirname`.

`unzip.mjs` is the `node:zlib` central-directory reader from RESEARCH §Code Example 2 (do **not** use `@office-kit/xlsx/node` `fromBuffer` — broken in 0.26.1). `xml.mjs` is a ~30-line tag-balance checker; `saxes` is an acceptable devDependency alternative.

---

## Shared Patterns

### Permission funnel — order is the security property

**Source:** `server.js:800-840`, `server.js:5026-5030`, `server.js:4675-4685`.
**Apply to:** the export route only.

Order, never reordered:

1. `requireWorkspace(req, res, slug, 'viewer')` → unknown workspace / no session already gets its existing status.
2. `sameOrigin(req)` for the POST.
3. `readJson` + format validation (`exportInvalidRequest`).
4. `docForClient(JSON.parse(ctx.ws.doc), ctx.ws, ctx.membership)` — the only document.
5. Find the project in the redacted doc → `404 projectNotFound` when absent (this is the 404 parity: a hidden project is absent from the redacted doc, so the same status/body as the read).
6. `canManageProject(project, ctx.membership.member_id, ctx.membership.role)` → `403 exportForbidden` with **no bytes generated**.
7. Generate; any failure returns JSON before headers.

`memberCanReadProject` is already applied inside `docForClient`/`redactDoc`; do not re-implement team logic in the export route.

### i18n contract and gate

**Source:** `src/core/i18n.js:194-226`, `scripts/i18n-scan.mjs:15-21, 1291-1360, 1437-1447, 1604-1645`, `test/catalogue.test.mjs:19-46`.

**Apply to:** every new label, sheet name, column header, notice, toast and error.

- Inject `translate`; never import a singleton in the model. Server: `(k, v) => tFor(locale, k, v)`. Client: `t`.
- Catalogue values: no `<`, `>`, `"`; keys must match `/^[a-z][a-z0-9]*(\.[a-z][a-zA-Z0-9]*|\.[0-9]+)+$/`.
- EN ↔ FR parity is a hard gate. A key added to one catalogue without the other fails `prebuild` (`main()` lines 1630-1638). Placeholders must match.
- Dead-key gate: sources = `src/**/*.js` + `server.js` + `mailer.js` (`deadKeySources`, lines 1344-1360). **A key referenced only from `export/*.js` is dead** — `export/` is outside `src/` and not in the server-file list. Keep export key constants in `src/export/model.js` (scanned) or use them in `server.js` on a literal `tFor('export.…')` call.
- `src/export/*.js` **is** scanned by the literal families (it lives under `src/`). It must contain no display text — only key strings and machine identifiers. Labels arrive from the injected translator.
- `server.js` keys are checked with `t`/`tFor`; a literal key there must resolve in both catalogues.
- Plural counts: `{one, other}` objects, `resolvePlural` handles `vars.n`.

### Error contract

**Source:** `server.js:3085`, `test/error-codes.test.mjs:19-28`.

```js
function fail(res, status, code, message, extra) {
  return json(res, status, { error: message, code, ...extra });
}
```

- New code → static literal in `fail(res, <n>, '<code>', …)`.
- Add `err.<code>` to **both** catalogues, non-empty strings.
- Never build an inline `json(res, <n>, { error: ... })` payload — a test greps for it.

### Escaping per format

**Source:** `mailer.js:99-101` (escape-at-the-boundary convention), RESEARCH §Pattern 8.

| Format | Rule | Verify |
|---|---|---|
| MSPDI | `& < > " '` → `&amp; &lt; &gt; &quot; &apos;` on every text node/attribute | title `A & <B>` round-trips |
| xlsx | strings through `setCell` (shared strings); never a formula cell for user text | no `<c … t="str"><f>` for user data |
| CSV | RFC-4180 quoting, UTF-8 BOM, `'` prefix for `= + - @` | `=1+1` stays literal |
| HTML (modal) | `esc()` from `src/core/utils.js` on all user values | titles/labels in the modal |

### Binary download

**Source:** `src/core/api.js:59-95, 249-273`, `server.js:5860-5867`, `src/overlays/modals.js:434-435`.

- `api.call` cannot be reused (it always `res.text()` + `JSON.parse`).
- Success → `res.blob()`; error → `res.json()` then `tErr(code, data, data.error)`.
- `filename*` before `filename=`.
- `saveBlob` keeps the `download` attribute convention; revoke the object URL.

### Dependency, lint and image gates

**Source:** `test/dependencies.test.mjs:26-72`, `eslint.config.js:6-17`, `Dockerfile:18-29`.

Any of these three omissions fails CI or production:
1. add `@office-kit/xlsx` to `dependencies` (exact) and update the `['pg']` assertion;
2. add `export/**/*.js` to the node-globals block or `npm run lint` fails on `Buffer`/`setImmediate`;
3. add `COPY --from=build /app/export ./export` and update the COPY-list assertion.

### Route ordering

**Source:** `test/file-route-ordering.test.mjs` (existing precedence suite).
**Apply to:** the export route.

Register `/api/workspaces/:slug/projects/:id/export` in the same block as the other project routes (`server.js:~5026`). Do not place it after the generic `/api/` catch-all or the file/`/w/` handlers; a regex ending in `/export` cannot collide with `/members` or `/projects/:id`, but the ordering test pins the dispatcher’s shape.

### Test conventions

**Source:** `test/dependencies.test.mjs`, `test/error-codes.test.mjs`, `test/helpers/server.mjs`.

- `node:test` + `node:assert/strict`, one concern per `test(...)`.
- Unit suites import source directly; never boot a server.
- Integration suites import the helper, spawn a real server on an ephemeral port with temp `DATA_DIR`.
- Source-policy assertions read the file with `fs.readFileSync` and regex it — that is the house pattern for “no import X under src/” and “no `ctx.ws.doc`”.

---

## Repository Constraints That Break a Naive Plan

These are not preferences; each one turns a straightforward implementation into a failing gate.

1. **`test/dependencies.test.mjs` pins `dependencies` to exactly `{pg}` and the runtime COPY list to 11 exact targets** (lines 26-72). Adding the writer and shipping `export/` requires editing both assertions in the same commit as `package.json`/`Dockerfile`.
2. **eslint gives browser globals to `**/*.js`** (`eslint.config.js:7-10`). `export/**/*.js` must be added to the node list or `Buffer`, `process`, `setImmediate` are `no-undef`.
3. **`src/core/utils.js` touches `document.querySelectorAll` and `navigator.platform` at module scope** (documented in `scripts/export-seed.mjs`). `src/export/model.js` must not import it; dates/ids must be locally parsed (`YYYY-MM-DD` strings). `src/core/i18n.js` is server-importable and is already imported by `server.js:61`.
4. **i18n-scan walks only `src/**/*.js`** plus `server.js`/`mailer.js`. `src/export/*` is scanned for literals → no display strings; `export/*` is **not** scanned → keys used only there become dead keys.
5. **The dead-key gate uses `src/**/*.js` + `server.js` + `mailer.js`** (`scripts/i18n-scan.mjs:1344-1360`). Keep export key literals in `src/export/model.js` or `server.js`.
6. **`test/error-codes.test.mjs` scrapes `fail(res, <n>, '<code>'`** from `server.js`; a new code must be a static literal and exist in EN + FR.
7. **`canManageProject` has two signatures** — client `(p)` with `Owner`/`Admin` (`src/core/store.js:353-356`), server `(p, memberId, role)` with lowercase roles (`server.js:837-840`).
8. **`@office-kit/xlsx` has no root export** (subpath imports only) and the client must never resolve it; putting writers in `export/` makes the prohibition mechanically true.
9. **`@office-kit/xlsx` `fromBuffer` is broken in 0.26.1** — tests must use the `node:zlib` reader, not the library, to verify the output.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `export/xlsx.js` | service | file-I/O | No workbook/binary generator exists; nearest byte producer is `mailer.js:108`. Use RESEARCH §Patterns 2/3/5/9 + §Code Example 1. |
| `export/mspdi.js` | service | transform | No XML serializer exists; escaping convention from `mailer.js:99`, structure from RESEARCH §Pattern 6. |
| `src/export/csv.js` | utility | transform | No delimited-text writer exists; RFC-4180 rules from RESEARCH §Pattern 8. |
| `test/fixtures/export-fixtures.mjs` | test fixture | transform | `test/fixtures/` holds only JSON gates; build a fresh in-memory factory. |
| `test/helpers/unzip.mjs` / `test/helpers/xml.mjs` | test utility | file-I/O / transform | No binary or XML test helpers exist; use `test/helpers/server.mjs` only for module shape. |

---

## Metadata

**Analog search scope:** repo root (`server.js`, `mailer.js`, `package.json`, `Dockerfile`, `eslint.config.js`), `src/core/**`, `src/views/**`, `src/overlays/**`, `src/actions/**`, `src/pages/**`, `src/shell/**`, `src/lib/**`, `src/locales/**`, `scripts/**`, `test/**`.
**Files scanned:** ~40 read in full or targeted ranges; 26 existing analogs verified git-tracked.
**Excluded by gate:** none — no `/.gsd/capabilities/` mirror path was used.
**Pattern extraction date:** 2026-11-09.