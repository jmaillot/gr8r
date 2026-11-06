# Phase 43: Workspace Logo - Pattern Map

**Mapped:** 2026-11-06
**Files analyzed:** 9 (5 modified, 1 new, 2 locale updates, 1 html tweak)
**Analogs found:** 9 / 9 (all in-repo, all git-tracked via `git ls-files`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` — POST/DELETE `/w/:slug/logo` | route + middleware guards + file-I/O | request-response, streaming | `handleUpload` (server.js:5120-5129) + `uploadBinary` (5088-5118) | exact (guard order & streamer reused verbatim) |
| `server.js` — public GET `/w/:slug/logo` | route, file serving | request-response, streaming | `serveFileBinary` (server.js:5167-5288) + intercept chain (5382-5437) | role-match (header set must be route-private per D-03) |
| `server.js` — logo doc persistence | model (doc channel) | CRUD | `updateDoc`/`wsRevision` (server.js:1910-1925) | exact |
| `server.js` — `workspacePayload` logo field | model serialization | transform | `workspacePayload` (server.js:624-635) | exact |
| `src/shell/layout.js` — sidebar avatar slot | component | event-driven (render) | `wsLogo(w, px)` in `src/core/icons.js:28-32`, used at `src/shell/layout.js:91` | exact (slot already exists — extend it) |
| `src/pages/settings.js` — upload/remove UI | component + action wiring | request-response | case `'workspace'` (settings.js:172-198) + XHR upload in `src/actions/actions.js:1036-1062` | role-match |
| `mailer.js` — digest header `<img>` | component (email builder) | transform | `buildDigestMessage` (mailer.js:644-777), call site server.js:1591-1607 | exact |
| `index.html` + client favicon swap | config/DOM | event-driven | `<link rel="icon">` index.html:8 | exact (one-line href swap) |
| `test/workspace-logo.test.mjs` | test | batch | `test/file-route-ordering.test.mjs` (whole file) | exact house test pattern |
| `src/locales/en.json` / `fr.json` | config | — | existing `err.*` keys (en.json:1607-1608) | exact |

## Pattern Assignments

### `server.js` — POST/DELETE `/w/:slug/logo` (route, streaming upload)

**Analog:** `handleUpload` + `uploadBinary`, server.js:5082-5129. New intercepts go in the `http.createServer` chain (server.js:5382-5437) BEFORE `serveStatic` and the `/api/` branch.

**Guard-order pattern** (lines 5120-5129, verbatim contract to copy — change `'member'` → `'admin'` per D-01):
```js
async function handleUpload(req, res, slug) {
  /* Guard order per the login-handler contract: cross-origin rejected before
     the body read, then the workspace/role gate, then the stream. */
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const ctx = requireWorkspace(req, res, slug, 'member');
  if (!ctx) return; // response already sent (404 workspaceNotFound / 403 readOnlyAccess)
  const id = uid();
  await uploadBinary(req, path.join(FILES_DIR, id));
  json(res, 200, { id });
}
```
Role gate is one argument away (server.js:2930-2945):
```js
function requireWorkspace(req, res, slug, minRole = 'viewer') { ... }
if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
  if (minRole === 'admin') fail(res, 403, 'adminOnly', 'Only workspace admins can do that');
```

**Size-capped streamer** (lines 5088-5118) — reuse `uploadBinary(req, dest)` unchanged (WR-05 drain-on-overflow, partial-file unlink, mid-stream 413 `uploadTooLarge` already inside). Do NOT hand-roll stream logic.

**Intercept chain pattern** (lines 5382-5437) — copy this shape for the two logo intercepts:
```js
const uploadMatch = url.pathname.match(/^\/w\/([a-z0-9-]{2,40})\/files$/);
if (uploadMatch && req.method === 'POST') {
  await handleUpload(req, res, uploadMatch[1]);
} else if (/^\/w\/([a-z0-9-]{2,40})\/file\/([A-Za-z0-9_-]+)$/.test(url.pathname) && (req.method === 'GET' || req.method === 'HEAD')) {
  ...
} else if (url.pathname.startsWith('/api/')) {
  await handleApi(req, res, url);
} else {
  serveStatic(req, res, url);
}
```
Slug regex `[a-z0-9-]{2,40}` is the traversal-safety precedent. Top-of-chain catch (lines 5438-5442) already converts `httpError` codes to `{ error, code }` JSON.

**Dir & cap constants** (lines 72-74, 147-149, 356-359):
```js
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(HERE, 'data'));
const FILES_DIR = path.join(DATA_DIR, 'files');
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 25);
const MAX_UPLOAD = MAX_UPLOAD_MB * 1024 * 1024;
// openDb(): fs.mkdirSync(FILES_DIR, { recursive: true });   ← add LOGOS_DIR mkdir next to it
```
D-04: cap = `MAX_UPLOAD` via `uploadBinary`; new dir = `path.join(DATA_DIR, 'logos')`, mkdir in `openDb()` (line 358 precedent).

**Doc persistence + revision contract** (lines 1910-1925, verbatim):
```js
function updateDoc(workspaceId, edit) {
  const row = db.prepare('select doc from workspaces where id = ?').get(workspaceId);
  if (!row) throw httpError(404, 'Workspace not found', 'workspaceNotFound');
  const doc = JSON.parse(row.doc);
  edit(doc);
  db.prepare('update workspaces set doc = ?, revision = revision + 1, updated_at = ? where id = ?').run(JSON.stringify(doc), now(), workspaceId);
  return doc;
}
/* Every endpoint that edits the document must return it, or the client keeps a
   stale revision and its next write is rejected with 409. */
function wsRevision(workspaceId) { ... }
```
→ POST/DELETE logo responses MUST include `revision: wsRevision(ws.id)` (research Pitfall 2).

**D-09 replace/delete:** unlink old file before/adjacent to the `updateDoc` call; `fs.unlink(dest, () => {})` is the fire-and-forget idiom used inside `uploadBinary` (line 5103).

### `server.js` — public GET `/w/:slug/logo` (route, file serving)

**Analog:** `serveFileBinary` (server.js:5167-5288) — but the logo route differs deliberately:

**Fixed-mime map pattern** (lines 5138-5145 + 5251-5256):
```js
const FILE_INLINE_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf' };
...
const ext = path.extname(String(record.name || '')).toLowerCase().replace(/^\./, '');
const mime = FILE_INLINE_MIME[ext] || FILE_ATTACHMENT_MIME[ext] || 'application/octet-stream';
```
⚠ **Do NOT touch `FILE_INLINE_MIME`** (research Pitfall 3). The logo route owns a route-private map per D-03:
```js
const LOGO_MIME = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg' }; // D-03
```

**Header-set pattern** (lines 5269-5277):
```js
const headers = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Type': mime,
  'Content-Length': stat.size,
  'Content-Disposition': fileDisposition(record.name, inline),
  'Cache-Control': 'private, max-age=3600',
  'Accept-Ranges': 'bytes',
};
if (inline) headers['Content-Security-Policy'] = "frame-ancestors 'self'";
```
Logo route deviations (all decision-pinned):
- `Cache-Control: public, max-age=31536000, immutable` — same value as the `assets/` policy in `cacheControl()` (lines 5038-5042); safe ONLY because D-11 `?v=` cache-busts. GET must ignore the `v` param for lookup.
- svg responses add `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` (GitHub posture; research Pitfall 4). Byte routes deliberately do NOT use `securityHeaders()` (comment at line 5164-5166).
- Session-free (D-02): unlike `serveFileBinary` (which calls `requireWorkspace(..., 'viewer')`), the logo GET resolves the workspace by slug directly and answers an identical 404 for unknown-slug and logo-unset (no oracle). Use `wsBySlug(slug)` + parse `doc.data.logo`.
- Containment precedent: `if (!record || path.dirname(file) !== FILES_DIR) return fail(res, 404, ...)` (lines 5186-5188) — mirror for the logos dir.
- Streaming tail to copy (lines 5283-5287): `res.writeHead(...); fs.createReadStream(file).pipe(res)` with `stream.on('error', () => res.destroy())`.

**Serialization analog** (lines 624-635) — add `logo` to this payload:
```js
function workspacePayload(row, membership = null) {
  const color = row.color || '#1D1C1A';
  return { id: row.id, name: row.name, slug: row.slug, color, c: color, role: ..., memberId: ... };
}
```

### `src/shell/layout.js` + `src/core/icons.js` — sidebar/topbar avatar slot (component)

**Analog:** the slot ALREADY EXISTS. `layout.js:91` renders `${wsLogo(d.ws, 22)}` beside the ws-name span (lines 90-94):
```js
<button class="ws grow" data-a="pop" data-pop="ws" aria-haspopup="menu" aria-label="${t('a11y.switchWorkspace')}">
  ${wsLogo(d.ws, 22)}
  <span class="ws-name trunc">${esc(d.ws.name)}</span>
```
`icons.js:28-32`:
```js
export function wsLogo(w, px = 22) {
  return w && w.brand
    ? `<span class="ws-logo brand" style="width:${px}px;height:${px}px">${MARK(px)}</span>`
    : `<span class="ws-logo" style="--c:${w.c};...px">${esc(w.name[0])}</span>`;
}
```
**Action:** extend `wsLogo` (or branch before it) so a `d.ws.logo` renders `<img class="ws-logo" src="...?v=..." style="width:${px}px;height:${px}px" alt="">` — CSS-fit, rounded, per D-12 — and falls back to the existing letter-mark otherwise (D-10 per-surface fallback). The email-brand `<img>` precedent is `brandLogo` (icons.js:26-27).

### `src/pages/settings.js` — upload/remove controls (component)

**Analog:** case `'workspace'`, lines 172-198. The role gate is already computed:
```js
const wsAdmin = !api.enabled || api.workspace?.role === 'owner' || api.workspace?.role === 'admin';
```
Existing slot to extend (line 178 — the 52px `wsLogo` header inside the form):
```js
<div class="row" style="gap:14px;margin-bottom:18px">${wsLogo(d.ws, 52)}<div>...swatches...</div></div>
```
Add upload/remove buttons gated on `wsAdmin` (same `${wsAdmin ? ... : ''}` conditional used at line 181 for the save button).

**Client raw-body upload analog:** `src/actions/actions.js:1036-1062`:
```js
const xhr = new XMLHttpRequest();
xhr.open('POST', `/w/${D().ws.url}/files?name=${encodeURIComponent(file.name)}&project=...`);
xhr.responseType = 'json';
xhr.onload = () => { if (xhr.status < 200 || xhr.status >= 300) return failRow(xhr.response?.code || 'serverUnreachable'); ... };
xhr.onerror = () => failRow('serverUnreachable');
xhr.send(file);
```
Logo upload copies this minus progress UI and query params; DELETE rides the existing client API helper pattern. After success the client must adopt the returned `revision` (research Pattern 4) before its next doc write.

### `mailer.js` — digest header logo (email builder)

**Analog:** `buildDigestMessage` (mailer.js:644-777). Key conventions to copy:
- Absolute URL composition from `appUrl` (lines 651-652): `const taskUrl = t => ... \`${appUrl}/w/${slug}/...\`` — build the logo URL the same way (`${appUrl}/w/${slug}/logo?v=...`), never relative (research Pitfall 8).
- i18n frame with English-literal degradation (lines 664-683): new alt text joins this frame via `tFor(locale, 'notif.digest.*')`.
- HTML escaping: `${escapeHtml(...)}` on every interpolated URL/label (lines 709, 723, 726).
- Insertion point: the header cell `<tr><td>` at lines 722-723, before the greeting `<p>`. Capped `<img>` per D-07: `max-height:48px` inline style, `alt="${escapeHtml(workspace)}"`.
- Conditional-omit precedent (lines 747-749): unsubscribe headers render only when pre-built & https — mirror this if the planner gates the logo `<img>` on https APP_URL (open question 1 in RESEARCH.md).
- Supply side: `sendDigest` call site server.js:1592-1607 — pass `logoUrl` (or `logo`) as a new msg field composed from `doc.data.logo` + `APP_URL`.

### `index.html` + client favicon swap (D-06)

**Analog:** `index.html:8`:
```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```
One-line JS swap after workspace context load (research Code Example):
```js
const link = document.querySelector('link[rel="icon"]');
if (link) link.setAttribute('href', logoUrl || '/favicon.svg');
```
Place near existing workspace-context bootstrap (`src/shell/layout.js:70-73` area or the store bootstrap that computes `d.ws`).

### `test/workspace-logo.test.mjs` (test, new file)

**Analog:** `test/file-route-ordering.test.mjs` — copy its full skeleton (lines 1-60 shown):
```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ADMIN, ROOT, login, startServer } from './helpers/server.mjs';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

async function plantFile(server, admin, id, name, bytes) {
  fs.writeFileSync(path.join(server.dataDir, 'files', id), bytes);
  const cur = await admin.client.get('/api/workspaces/acme');
  const doc = cur.data.doc;
  doc.data = doc.data || {};
  ...
  const res = await admin.client.put('/api/workspaces/acme', { revision: cur.data.revision, doc });
}

test('...', async () => {
  const server = await startServer({});
  try {
    const admin = await login(server.base, ADMIN.email, ADMIN.password);
    const res = await fetch(`${server.base}/w/acme/file/f_order1`, { headers: { cookie: admin.client.cookie() } });
    assert.notEqual(res.headers.get('content-type'), 'text/html', 'the byte route answered with the SPA fallback');
    ...
  } finally { await server.stop(); }
});
```
Verified helper exports: `startServer({})`, `login(base, email, password)` → `{ status, client }`, `ADMIN`, `ROOT`, `client.cookie()`. Pins to port (research Test Map): admin-only 403, cross-origin 403, 413 `uploadTooLarge`, non-image 400 with catalogued code, public GET no-cookie 200 fixed mime, unset → 404 (not 302 — D-10), replace unlinks old file, restart survival, `content-type !== 'text/html'` SPA-fallback regression (mirror file-route-ordering's core assertion).

### `src/locales/en.json` / `fr.json` (i18n gates)

**Analog:** `err.uploadTooLarge` / `err.fileNotFound` at en.json:1607-1608; `settings.ws.icon` at 1166.
- Every new `fail(res, status, 'code', ...)` code (e.g. `err.invalidLogo`) MUST exist non-empty in BOTH en.json and fr.json or `test/error-codes.test.mjs` fails.
- New UI strings go through `t('key')`; `npm run i18n:scan` (prebuild hook) statically verifies call sites.
- Digest strings use the `notif.digest.*` namespace (mailer.js `tFor(locale, ...)`).

## Shared Patterns

### SameOrigin-before-body-read guard order
**Source:** server.js:5121-5125
**Apply to:** both logo POST and DELETE routes
```js
if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
const ctx = requireWorkspace(req, res, slug, 'admin'); // 404 workspaceNotFound / 403 adminOnly, no oracle
if (!ctx) return;
```

### D-notation decision comments near constrained code
**Source:** server.js:5133-5137 (D-06 fixed policy), 5164-5166 (own-header-set note), mailer.js:657-660, 740-746
**Apply to:** the logo route's public-serving and SVG-inline security comments
House style: `/* D-0X (phase): ... */` immediately above the code the decision constrains.

### Fire-and-forget unlink idiom
**Source:** server.js:5103
**Apply to:** logo replace (D-09) and workspace-DELETE logo cleanup
```js
fs.unlink(dest, () => {});
```

### Per-surface favicon fallback (no server redirect)
**Source:** D-10 + icons.js:28-32 (letter-mark fallback precedent), index.html:8
**Apply to:** sidebar slot, settings header, digest template, favicon swap — each consumer checks `logo` presence and renders `/favicon.svg` (or letter-mark) itself. GET returns 404 when unset, never 302.

### Single versioned-URL builder
**Source:** RESEARCH.md Pitfall 6 / D-11
**Apply to:** `workspacePayload` logo field, digest builder, favicon swap — one shared helper that appends `?v=<uploaded_at>`; GET ignores the param for lookup.

## No Analog Found

| File/Concern | Role | Data Flow | Reason | Fallback |
|--------------|------|-----------|--------|----------|
| Magic-byte sniff (~15 lines: png `89 50 4E 47`, jpg `FF D8 FF`, svg leading `<`) | utility | transform | No in-repo binary sniffing exists | RESEARCH.md "Don't Hand-Roll" table gives exact prefixes |
| Route-private sandbox CSP header for inline SVG | config | — | `FILE_INLINE_MIME` deliberately excludes svg; no svg-serving precedent | GitHub posture from RESEARCH.md Pitfall 4 |

## Metadata

**Analog search scope:** `server.js` (targeted ranges: 72-79, 145-152, 355-360, 620-639, 1551-1610, 1905-1929, 2925-2946, 5038-5291, 5368-5442), `mailer.js` (644-783), `src/shell/layout.js`, `src/core/icons.js`, `src/pages/settings.js`, `src/actions/actions.js`, `index.html`, `test/file-route-ordering.test.mjs`, `src/locales/en.json`
**Files scanned:** 10 primary sources, ~450 lines read
**Tracked-source gate:** all named analogs verified `git ls-files` — no mirrors
**Pattern extraction date:** 2026-11-06
