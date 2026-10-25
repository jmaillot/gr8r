# Phase 12: Real file uploads and previews - Pattern Map

**Mapped:** 2026-10-24
**Files analyzed:** 8 (new/modified files implied by 12-CONTEXT.md D-01…D-14 and 12-RESEARCH.md)
**Analogs found:** 8 / 8 (all in-repo; every analog path verified via `git ls-files`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` — upload endpoint `POST /w/:slug/files` | server (route handler) | streaming / file-I/O | `server.js` `readJson` (1171-1199) + `requireWorkspace` (1140-1155) | exact (same file, same stream-cap pattern) |
| `server.js` — file route `GET /w/:slug/file/:id` | server (route handler) | file-I/O / request-response | `server.js` `serveStatic`/`sendFile`/`securityHeaders` (1734-1829) | role-match (static serving machinery reused, headers overridden) |
| `server.js` — binary-delete diff on doc PUT | server (mutation hook) | CRUD | `server.js` doc-PUT handler (`/api/workspaces/:slug` PUT, ~1361-1400) | role-match (revision-transaction hook point) |
| `src/actions/actions.js` — `handleFiles` XHR swap | client action (uploader) | event-driven / streaming | `src/actions/actions.js` `handleFiles` (876-909) itself — the block being replaced; transport pattern: `src/core/api.js` `call()` error mapping | exact (in-place replacement, UI contract preserved) |
| `src/actions/actions.js` — `copyLink` file branch | client action | request-response | `src/actions/actions.js` `copyLink` (517-532) | exact (already builds the D-07 URL; verify only) |
| `src/overlays/modals.js` — `filePreviewModal` real bytes | component (modal) | request-response (media fetch) | `src/overlays/modals.js` `filePreviewModal` (293-300) itself | exact (in-place body swap) |
| `src/locales/en.json` / `fr.json` — new keys | config (i18n catalogues) | batch | existing `err.*` / `toast.*` / `modal.*` namespaces | exact |
| `test/upload.test.mjs` (NEW) | test (integration) | request-response | `test/error-codes.test.mjs` (whole file, esp. 338-359 bodyTooLarge test) + `test/helpers/server.mjs` harness | exact |
| `e2e/flows.spec.mjs` (modified) | test (e2e) | event-driven | existing flows in `e2e/flows.spec.mjs` | role-match |

All analogs are git-TRACKED source (checked with `git ls-files`); no gitignored mirrors named.

## Pattern Assignments

### `server.js` — upload endpoint `POST /w/:slug/files` (server, streaming)

**Analog:** `server.js` lines 1171-1199 (`readJson`) — the WR-05 stream-cap pattern this endpoint must mirror; auth via `requireWorkspace` (1140-1155); error via `httpError`/`fail` (1027-1051); sameOrigin guard before the body read (`server.js:1220-1222` comment shows the ordering contract).

**Auth/guard pattern** (lines 1140-1155):
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
Upload endpoint calls it with `'member'`; file GET with `'viewer'` (D-05).

**Stream-cap pattern to mirror** (readJson, 1171-1199 — copy the drain-then-respond structure, streaming to disk instead of buffering):
```js
req.on('data', chunk => {
  /* WR-05: on overflow, keep draining the request instead of destroying the
     socket — the response is only written once the body is fully consumed,
     so the client actually receives the 413 with its code. */
  if (overflow) return;
  size += chunk.length;
  if (size > MAX_BODY) {
    overflow = httpError(413, 'Request body too large', 'bodyTooLarge');
    return;
  }
  chunks.push(chunk);
});
```
Upload variant (per 12-RESEARCH Pattern 1): same shape, `out.write(chunk)` into `fs.createWriteStream(FILES_DIR/<id>)`, reject with `httpError(413, 'Upload too large', 'uploadTooLarge')`, `out.destroy()` + `fs.unlink(dest)` on abort.

**Env constant pattern** (lines 52, 68 — where `MAX_UPLOAD_MB` lands):
```js
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(HERE, 'data'));
const MAX_BODY = Number(process.env.MAX_BODY_BYTES || 8 * 1024 * 1024);
```
Also document `MAX_UPLOAD_MB` in the env block comment (lines 10-33, next to `MAX_BODY_BYTES=8388608`), and `fs.mkdirSync(FILES_DIR, { recursive: true })` alongside the DB bootstrap (`openDb`, line 136).

---

### `server.js` — file route `GET /w/:slug/file/:id` (server, file-I/O)

**Analog:** `server.js` lines 1734-1829 — `securityHeaders`, `sendFile`, `serveStatic`.

**Critical dispatcher pattern** (lines 1832-1856): the file route and the upload POST must be matched in the `http.createServer` handler BEFORE `serveStatic` — extensionless paths fall to `index.html` at 1820-1827 and would never reach a static-path registration:
```js
try {
  if (url.pathname.startsWith('/api/')) {
    await handleApi(req, res, url);
    ...
  } else {
    serveStatic(req, res, url);
  }
} catch (err) { /* json(res, status, { error, code: err.code }) */ }
```
Insert, before the `else`:
```js
const fileMatch = url.pathname.match(/^\/w\/([a-z0-9-]{2,40})\/file\/([A-Za-z0-9_-]+)$/);
if (fileMatch && (req.method === 'GET' || req.method === 'HEAD')) {
  if (/text\/html/.test(req.headers.accept || '')) return serveStatic(req, res, url); // SPA deep link (D-13)
  return serveFileBinary(req, res, fileMatch[1], fileMatch[2]);
}
```
(The upload POST `/w/:slug/files` likewise needs interception before `serveStatic`, which 405s non-GET.)

**Header-set pattern to override** (securityHeaders, 1734-1745 — the file route must NOT reuse this verbatim; `X-Frame-Options: DENY` + `frame-ancestors 'none'` would block the D-09 PDF iframe):
```js
'X-Content-Type-Options': 'nosniff',
'X-Frame-Options': 'DENY',
'Content-Security-Policy':
  "default-src 'self'; script-src 'self'; ... img-src 'self' data:; ... frame-ancestors 'none'",
```
Keep `nosniff`; for inline types (png/jpg/jpeg/gif/webp/pdf) use no XFO / `frame-ancestors 'self'`; for attachment types never emit an interactive default-src. `img-src 'self'` in the SPA CSP already covers `<img>` previews.

**Content-Type + headers from a fixed map** (sendFile, 1763-1767): `headers['Content-Type'] = MIME[ext] || 'application/octet-stream'` — the file route copies this shape but from the D-06 safe map (never the upload's claimed mime) plus `Content-Disposition` (inline/attachment, RFC 6266 sanitized filename from the record's `name`).

**Path-traversal guard pattern** (serveStatic, 1807-1808):
```js
const file = path.resolve(ROOT, `.${rel}`);
if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return notFound(res);
```
File route equivalent: resolve `path.join(FILES_DIR, id)` and assert the dirname is `FILES_DIR`; better, validate the id against the workspace doc record (auth + existence together).

**ETag/304 pattern** (sendFile, 1755-1761) — optional reuse for the binary route.

---

### `server.js` — binary-delete diff on doc PUT (server, CRUD)

**Analog:** the `/api/workspaces/:slug` PUT handler (~server.js:1361-1400), inside the revision transaction. Pattern: diff stored doc's `files` ids vs incoming doc's ids; `fs.unlink` each disappeared id AFTER the commit succeeds; missing file = success (idempotent). No existing analog unlinks files — this hook point is the analog (the doc-PUT diff is the only way records leave the document; per D-04 wording, strict same-PUT diff; self-healing is a noted follow-up, not required).

---

### `src/actions/actions.js` — `handleFiles` XHR swap (client action, event-driven)

**Analog:** `src/actions/actions.js` lines 876-909 — the code being replaced; the UI contract it defines is preserved exactly (D-14: entry points untouched).

**The exact block to replace** (886-906 — `setInterval` becomes one XHR per file):
```js
const iv = setInterval(() => {
  up.pct = Math.min(100, up.pct + 9 + Math.round(Math.random() * 22));
  const bar = document.getElementById('upbar-' + up.id),
    pc = document.getElementById('upct-' + up.id);
  if (bar) bar.style.setProperty('--p', up.pct / 100);
  if (pc) pc.textContent = up.pct + '%';
  if (up.pct >= 100) {
    clearInterval(iv);
    S.ui.uploads = S.ui.uploads.filter(x => x !== up);
    const rec = { id: uid('f'), name: up.name, type: fileType(up.name), size: up.size, by: D().me, at: Date.now() };
    D().files.unshift({ ...rec, project: up.project, task: up.task || null });
    if (up.task) {
      const tk = task(up.task);
      tk.attachments.push(rec);
      logAct('addedAFileTo', tk, { kind: 'fileAdded', value: up.name });
    }
    save();
    render();
    toast(t('toast.uploaded', { name: up.name }));
  }
}, 220);
```
Keep verbatim: the `S.ui.offline` early return (878-881, D-12), the `up` row object (884), the `--p` CSS-var + `upct-` text update contract, row removal at 100%, record shape (`id/name/type/size/by/at/project/task`), `logAct('addedAFileTo', …)`, `save()` + `render()` + toast.

**Replacement transport pattern** (12-RESEARCH Pattern 2, XHR built-in — no import):
```js
function uploadFile(file, ctx) {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/w/${D().ws.url}/files?name=${encodeURIComponent(file.name)}&project=${ctx.project || ''}&task=${ctx.task || ''}`);
    xhr.responseType = 'json';
    xhr.upload.onprogress = e => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      const bar = document.getElementById('upbar-' + up.id), pc = document.getElementById('upct-' + up.id);
      if (bar) bar.style.setProperty('--p', pct / 100);
      if (pc) pc.textContent = pct + '%';
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300
      ? { ok: true, id: xhr.response.id }
      : { ok: false, code: xhr.response?.code, status: xhr.status });
    xhr.onerror = () => resolve({ ok: false, code: 'serverUnreachable', status: 0 });
    xhr.send(file); // File/Blob sends as raw body
  });
}
```
**D-11 ordering:** XHR success FIRST, then the record push + `save()` (record persistence rides the existing doc channel and 409-retry machinery); on failure, toast via `tErr(code, …)` stable-code pattern, remove the row, push nothing to `data.files`.

**Error-translation pattern** (project-wide): server codes map through the established `err.<code>` mechanism — new codes `uploadTooLarge`, `fileNotFound` need entries in BOTH catalogues (enforced by `test/error-codes.test.mjs`).

---

### `src/actions/actions.js` — `copyLink` file branch (client action)

**Analog:** `src/actions/actions.js` lines 517-532. Already builds `${api.url}/w/${D().ws.url}/file/${d.fid}` — **no change needed** once the server route exists (D-07 URL is exactly this). Planner action: verify only.

**Deep-link half** (`src/main.js:112` — already exists):
```js
if (seg === 'file' && (data.files || []).some(f => f.id === key)) return go('file', { id: key });
```
Research-recommended resolution of the D-13 SPA side: extend this branch to stay on the current route + `openModal({ type: 'filePreview', file: f, tid: f.task })` — the same call `A.previewFile` makes (`actions.js:871-875`):
```js
A.previewFile = el => {
  const f = D().files.find(x => x.id === el.dataset.id);
  S.ui.pop = null;
  if (f) openModal({ type: 'filePreview', file: f, tid: f.task });
};
```
No new ROUTE_ID (`'file'` is absent from `ROUTE_IDS`, `src/shell/render.js:20-41`) and no new page.

---

### `src/overlays/modals.js` — `filePreviewModal` real bytes (component)

**Analog:** `src/overlays/modals.js` lines 293-300 — the modal being extended (in-place body swap):
```js
export function filePreviewModal(m, H) {
  const f = m.file;
  const ft = FT[f.type] || FT.other;
  return `${H(esc(f.name), `${ft.n} · ${f.size} ${t('modal.uploadedBy', { name: esc(mem(f.by)?.name || 'you') })} ${ago(f.at)}`)}
  <div class="modal-b"><div style="border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden">${filePrev(f).replace('class="fprev"', 'class="fprev" style="aspect-ratio:16/9"')}</div>
  ${m.tid ? `<div class="row faint" ...>...</div>` : ''}</div>
  <div class="modal-f"><button class="btn btn-secondary" data-a="copyLink" data-fid="${f.id}">...`;
}
```
Pattern: keep header/footer/tid-row verbatim; swap only the icon-art inner div. Real-bytes branch (D-03/D-09):
- img type (`f.type === 'img'`, per `FT` map at `src/ui/helpers.js:87-96`): `<img src="/w/${D().ws.url}/file/${f.id}" alt="${esc(f.name)}">` in the same bordered aspect-ratio box
- pdf type: `<iframe src="/w/${D().ws.url}/file/${f.id}" title="${esc(f.name)}">`
- everything else: keep the existing `filePrev(f)` download tile

Escape with `esc()` (already imported, line 2) — the codebase renders modals as template strings.

---

### `src/locales/en.json` / `fr.json` (config, batch)

**Analog:** existing `err.*` namespaces (see `test/error-codes.test.mjs:191-247` for the full inventory, e.g. `uploadOffline`). Pattern: every new server-emitted code (`uploadTooLarge`, `fileNotFound`) and every new user-visible literal (`toast.*`, `modal.*`) gets a non-empty entry in BOTH catalogues in the same task. Static gates run per commit: the parity test extracts `fail(res, N, 'code'` / `httpError(N, 'msg', 'code'` literals from server.js source by regex (lines 20-21) and reverse-parity checks catalogued codes against the server source + a `CLIENT_ONLY_ERR_CODES` allowlist (line 191+).

---

### `test/upload.test.mjs` (NEW — test, request-response)

**Analog:** `test/error-codes.test.mjs` — structure, harness usage, and the closest existing behavior test (`bodyTooLarge`, lines 338-359):
```js
test('bodyTooLarge reaches the client as a full 413 response, the socket never resets', async () => {
  const server = await startServer({ env: { MAX_BODY_BYTES: '64' } });
  try {
    const res = await fetch(`${server.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: big,
    });
    assert.equal(res.status, 413);
    const data = await res.json();
    assert.equal(data.code, 'bodyTooLarge');
    /* the server is still alive and answering on the same port */
    const alive = await fetch(`${server.base}/api/health`);
    assert.ok(alive.ok);
  } finally {
    await server.stop();
  }
});
```
Copy this skeleton for UPLOAD-02 (`MAX_UPLOAD_MB` oversize → 413 `uploadTooLarge`, server alive after). Boilerplate to copy:
- **Harness** (`test/helpers/server.mjs`): `startServer({ env: { MAX_UPLOAD_MB: '1' } })` boots on a free port with temp DATA_DIR and returns `{ base, port, dataDir, stop() }` (lines 43-94). `client(base, name)` is a cookie-bearing fetch wrapper (97-131) — but raw-body uploads need raw `fetch` with the cookie from `client.cookie()` (the harness client only sends JSON; upload tests POST a Blob/body manually with the captured `gr8r_session` cookie).
- **Auth setup pattern** (error-codes.test.mjs 116-131): login as admin, invite a member, accept — reuse verbatim for the member-role upload test and the outsider-404 test (UPLOAD-03, D-05).
- **Doc-PUT seeding** (line 323-327): `admin.put('/api/workspaces/acme', { revision, doc: { data: { ... } } })` to plant file records for the serving/deletion tests (UPLOAD-03/04/05).
- **Static-extraction pattern** (lines 13-21) for the PREVIEW-01 static test (`setInterval` absent from the upload path).

---

### `e2e/flows.spec.mjs` (modified — test, event-driven)

**Analog:** existing flows in `e2e/flows.spec.mjs` (Playwright ^1.64.1). Add PREVIEW-03 (modal renders img/pdf for a real file; download tile otherwise) and LINK-01 (copied link + navigation opens the preview modal; direct fetch serves bytes) as new cases in the existing spec's style.

---

## Shared Patterns

### requireWorkspace auth gate
**Source:** `server.js:1140-1155` (quoted above)
**Apply to:** Both new server endpoints — upload POST (`'member'`), file GET (`'viewer'`). 404 for unknown/unauthorized (D-05, no existence oracle).

### Stable error codes + i18n parity
**Source:** `server.js:1027-1051` (`fail`, `httpError`), `test/error-codes.test.mjs:19-28`
**Apply to:** Every new server rejection and client toast. Every code needs `err.<code>` in en+fr catalogues same-commit.

### sameOrigin guard ordering
**Source:** `server.js:1220-1222` (login shows the contract: guard before body read AND throttle)
**Apply to:** The upload POST — sameOrigin first, then requireWorkspace, then the stream.

### Escape-then-template-string rendering
**Source:** `src/overlays/modals.js:293-300`, `src/actions/actions.js:1-45` imports
**Apply to:** `filePreviewModal` body swap — `esc()` everything user-controlled; URL from `D().ws.url`.

### Zero-runtime-dependency transport
**Source:** PROJECT.md constraint; enforced in this phase by XHR (no fetch-progress), native `<img>`/`<iframe>` (no pdf.js), raw-body streaming (no multipart parser)
**Apply to:** All new code — browser/Node built-ins only.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `DATA_DIR/files/` storage dir | storage | file-I/O | No binary storage exists anywhere yet — new capability; follow the `fs.mkdirSync(recursive)` bootstrap pattern at `server.js:136` |
| Content-Disposition sanitizer (RFC 6266) | utility | transform | ~5-line hand-roll (zero-dep guarantee forbids a lib); Pitfall 4 in RESEARCH.md specifies the shape |

## Metadata

**Analog search scope:** repo root (`server.js`), `src/actions`, `src/overlays`, `src/core`, `src/ui`, `test/`, `e2e/`
**Files scanned:** 12 read (server.js excerpts, actions.js, modals.js, main.js, helpers.js, render.js, error-codes.test.mjs, helpers/server.mjs, e2e/flows.spec.mjs, locales)
**Pattern extraction date:** 2026-10-24
**Upstream inputs:** 12-CONTEXT.md (D-01…D-14), 12-RESEARCH.md (Patterns 1-4, Pitfalls 1-7 — all grounded in verified source lines, carried forward here)
