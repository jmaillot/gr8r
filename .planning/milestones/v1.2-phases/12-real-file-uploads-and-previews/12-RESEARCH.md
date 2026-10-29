# Phase 12: Real file uploads and previews - Research

**Researched:** 2026-10-24
**Domain:** Binary upload/serving on a zero-dependency Node http server + XHR upload progress in a hand-rolled SPA
**Confidence:** HIGH (all claims grounded in this session's source reads; the project's own code IS the stack)

## Summary

This phase replaces the simulated upload in `handleFiles` with real bytes. The stack needs **zero new
packages**: the server is a hand-rolled `node:http` app (`server.js`, one process, zero runtime
dependencies — `server.js:1-8`), the client is a hand-rolled SPA, and both the upload transport (XHR
`upload.onprogress`) and the previews (`<img>` / `<iframe>` on a same-origin URL) are browser
built-ins. The entire phase is a wiring exercise across four known seams: a new upload endpoint and a
new file-serving route in `server.js`, an XHR swap in `src/actions/actions.js`, a real-bytes branch in
`filePreviewModal`, and a binary-delete hook in the doc-mutation path.

The most consequential architectural finding is about the **file route vs the SPA fallback**: today
every non-`/api/` path goes to `serveStatic` (`server.js:1869-1880`), which serves `index.html` for any
extensionless path — so `GET /w/:slug/file/:id` will *never* reach the static handler and must be
intercepted in the top-level request dispatcher before `serveStatic`. But the same URL is also the
copied deep link (D-13): when a browser navigates to it, the SPA should load and open the preview
modal (the `applyDeepLink` file branch already exists at `src/main.js:100-119`), while an `<img>`/`<iframe>`
fetch of the same URL should get bytes. The standard resolution is **Accept-header negotiation** on the
file route: a navigation request (`Accept: text/html`) falls through to the SPA bootstrap, everything
else serves bytes. This must be settled in planning because it is the one place two legitimate
behaviors collide on one URL.

**Primary recommendation:** Raw-body upload endpoint (`POST /w/:slug/files`, filename/metadata via
query params or headers, streamed to `DATA_DIR/files/<file-id>` with size enforcement during the
stream) + `GET /w/:slug/file/:id` with Accept negotiation (bytes vs SPA fallback), served with
Content-Disposition inline/attachment per D-06 and a header set *without* `X-Frame-Options: DENY` /
`frame-ancestors 'none'`; client swaps the `setInterval` block in `handleFiles` for one XHR per file;
`filePreviewModal` renders `<img>`/`<iframe src="/w/:slug/file/:id">` for img/pdf types only; binary
deletion hooks into the doc-PUT diff on the server.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Binaries stored flat by file id — `DATA_DIR/files/<file-id>`, one binary per record. No per-workspace directories, no sharding. The DB record already carries `name`, `type`, `size`.
- **D-02:** Size cap is env-configurable (`MAX_UPLOAD_MB`) with a sane default; the server rejects early with a stable error code (v1.2 D-7 error-code pattern).
- **D-03:** Store all types; preview only known-safe ones. Nothing rejected at upload by type; preview modal renders only images and PDFs, everything else shows a download tile. `fileType()` taxonomy stays authoritative.
- **D-04:** Delete with record — deleting a file record (or its task/project) deletes the binary in the same server mutation; `DATA_DIR` never accumulates orphans.
- **D-05:** File bytes behind the same `requireWorkspace` gate: unknown or unauthorized → `404`, no existence oracle.
- **D-06:** Inline for known-safe types, attachment for everything else. Images and PDFs serve inline; all other types serve with `Content-Disposition: attachment` and a `Content-Type` from a safe fixed server map — never the upload's claimed mime.
- **D-07:** Served route is `GET /w/:slug/file/:id` — workspace-scoped, resolving auth through `requireWorkspace(req, res, slug, minRole)`. Published contract once « Copier le lien » copies it; renaming breaks copied links.
- **D-08:** Real progress from XHR `upload.onprogress` replacing the `setInterval` simulation (the only zero-dependency way).
- **D-09:** Images render as `<img>` and PDFs via native browser embed (`<iframe>`/`<embed>` with the file URL). No PDF library.
- **D-10:** Lists and grids keep the compact type icons (`filePrev()`); real bytes render only in the preview modal.
- **D-11:** Failed uploads toast and leave no record — failure shows a toast via the stable error-code pattern, the progress row disappears, nothing added to `data.files`.
- **D-12:** Demo mode (`S.ui.offline`) stays metadata-only exactly as today.
- **D-13:** « Copier le lien » copies a URL that works both ways: the SPA gains a `file/:id` route that opens the preview modal, and the served `GET /w/:slug/file/:id` route serves real bytes outside the SPA.
- **D-14:** Upload entry points do not change — existing dropzones and `data-in="uploadFiles"` inputs stay; only `handleFiles` internals swap the fake timer for XHR.

### the agent's Discretion
- Upload endpoint method/payload shape (`POST /w/:slug/files` multipart vs raw body + headers) — pick what fits the hand-rolled server.
- Exact default for `MAX_UPLOAD_MB` and where it is validated.
- CSP header adjustments needed for `<iframe>` PDF embedding (`frame-src`).
- Activity-log verb reuse for file uploads (`fileAdded` exists).

### Deferred Ideas (OUT OF SCOPE)
- Paste / folder-upload support in dropzones.
- Image thumbnails in the files grid.
- Signed share links or public file URLs.
- Per-workspace storage quotas.
- Resumable/chunked uploads.
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Binary storage (`DATA_DIR/files/<id>`) | API / Backend (server.js) | — | Server owns the filesystem; client never writes bytes |
| Upload endpoint + size cap | API / Backend | — | `requireWorkspace` gate lives in server.js |
| Upload progress display | Browser / Client | — | XHR `upload.onprogress` events; existing `S.ui.uploads` row UI |
| File metadata record (name/type/size) | Browser / Client (doc) | API (doc PUT persistence) | Record already flows through the workspace JSON document via `save()`/`PUT /api/workspaces/:slug` |
| File serving route + headers | API / Backend | — | Content-Disposition, safe Content-Type map, auth |
| Real previews (img/pdf) | Browser / Client | API (bytes) | `<img>`/`<iframe>` with same-origin URL |
| Deep-link route `file/:id` → preview modal | Browser / Client | — | `applyDeepLink` already parses `file/<id>` (`src/main.js:112`) |
| Binary orphan cleanup on delete | API / Backend | — | D-04: same server mutation as the doc PUT that removes the record |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:http` | built-in (Node ≥24 required by package.json engines) | Upload endpoint, file route | Server already is one process on `node:http` [VERIFIED: package.json engines + server.js:40] |
| `node:fs` | built-in | Streamed write/read of binaries | Existing server uses fs everywhere [VERIFIED: server.js:41] |
| `XMLHttpRequest` | browser built-in | Upload progress | `fetch()` cannot report upload progress; XHR `upload.onprogress` can [VERIFIED: MDN XHR docs via training — see Assumptions A1] |
| `<img>` / `<iframe>` | browser built-in | Previews | D-09 forbids a PDF library; native embed is the zero-dep path |
| node:test + Playwright | existing dev deps (node:test, @playwright/test ^1.64.1) | Validation | Test infra already green (113 node:test + 6 Chromium) [VERIFIED: package.json scripts, STATE.md] |

**No new packages.** The zero-runtime-dependency guarantee (PROJECT.md) forbids multer/formidable/pdf.js
outright. The Package Legitimacy Audit below is therefore vacuous-but-required.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw body upload | multipart/form-data parsing by hand | Multipart parsing by hand is exactly the "don't hand-roll" category; raw body (single file per request, metadata in query/headers) fits the existing one-JSON-endpoint-at-a-time router style and avoids a parser entirely. **Recommend raw body.** |
| `fetch()` upload | XHR | fetch has no upload progress; D-08 mandates XHR |

**Installation:** none.

## Package Legitimacy Audit

> No external packages are installed by this phase (zero-runtime-dependency guarantee). No registry lookups required.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(none — no installs)* | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 Dropzone / file input (existing, D-14)
        │  FileList
        ▼
 handleFiles (actions.js:876)  ── S.ui.offline → toast, stop (D-12)
        │  one XHR per file
        ▼
 POST /w/:slug/files?name=&task=&project=   (raw body, cookies)
        │                        │
        │                 requireWorkspace(member) ── fail → 404/403 + stable code
        │                 size check during stream → 413 uploadTooLarge (D-02)
        ▼
 fs stream → DATA_DIR/files/<file-id>            (D-01, flat)
        │  onprogress events ──► S.ui.uploads row (upbar-/upct- ids)
        ▼ 200 {id}
 client pushes record {id,name,type,size,by,at,project,task}
 into D().files (+ task.attachments, logAct fileAdded) via mutate→save()
        │  PUT /api/workspaces/:slug (existing doc channel)
        ▼
 Preview: filePreviewModal renders <img>|<iframe src="/w/:slug/file/:id"> (D-03/D-09)
        │  GET /w/:slug/file/:id
        ▼
 requireWorkspace → 404 on unknown/unauth (D-05)
        │  Accept: text/html? ── yes ──► SPA fallback → applyDeepLink('file/<id>') → preview modal (D-13)
        ▼ no
 bytes: inline (img/pdf) | attachment + fixed Content-Type map (D-06)
        │
 Doc mutation deletes record (client) ──► server doc-PUT diff unlinks binary (D-04)
```

### Recommended Project Structure

No new directories beyond the D-01 storage dir (created with `fs.mkdirSync(recursive)` at boot next
to the existing DB bootstrap):

```
DATA_DIR/
├── projects.db              # existing
└── files/               # NEW: one binary per record, named <file-id>
```

### Pattern 1: Streamed raw-body upload with size cap (server)

**What:** Read the request body as chunks, write to the destination file, abort with 413 when the cap
is exceeded — never buffer a whole upload in memory (the existing `readJson` buffers, which is fine
for 8 MB JSON but not the general upload path).
**When to use:** The upload endpoint only.

```js
// Source: pattern mirrors readJson overflow handling at server.js:1196-1206 (WR-05: drain then respond)
function uploadBinary(req, res, dest, maxBytes) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    let size = 0, aborted = false;
    req.on('data', chunk => {
      if (aborted) return;              // keep draining (WR-05 pattern)
      size += chunk.length;
      if (size > maxBytes) { aborted = true; out.destroy(); fs.unlinkSync(dest); return reject(httpError(413, 'Upload too large', 'uploadTooLarge')); }
      out.write(chunk);
    });
    req.on('end', () => aborted ? null : (out.end(), resolve(size)));
    req.on('error', reject);
  });
}
```

### Pattern 2: XHR upload with progress (client)

**What:** One XHR per file; `xhr.upload.onprogress` drives the existing progress row; resolve/reject
maps the server's stable error code to a toast.
**When to use:** Replaces the `setInterval` block at `actions.js:886-906`.

```js
// Source: actions.js:884-908 (existing UI contract: --p CSS var + pct text, row removed at 100)
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

### Pattern 3: Accept-negotiated file route (server)

**What:** `GET /w/:slug/file/:id` intercepted **before** `serveStatic` (it never reaches the static
handler today — extensionless paths get index.html at `server.js:1874-1879`). When the client wants
HTML (browser navigation → SPA deep link), delegate to the existing SPA bootstrap; otherwise serve
bytes.
**When to use:** The D-13 dual-destination route.

```js
// In the http.createServer dispatcher (server.js:1836-1882), BEFORE serveStatic:
const fileMatch = url.pathname.match(/^\/w\/([a-z0-9-]{2,40})\/file\/([A-Za-z0-9_-]+)$/);
if (fileMatch && (req.method === 'GET' || req.method === 'HEAD')) {
  if (/text\/html/.test(req.headers.accept || '')) return serveStatic(req, res, url); // SPA deep link
  return serveFileBinary(req, res, fileMatch[1], fileMatch[2]);
}
```

### Pattern 4: Binary delete diff on the doc PUT (server)

**What:** The only way records leave the document is the client's doc PUT (`PUT /api/workspaces/:slug`,
`server.js:1361-1400`). D-04's "same server mutation" is naturally implemented there: diff the stored
doc's file ids against the incoming doc's file ids inside the revision transaction, `fs.unlink` each
disappeared id. The unlink is not transactional — do it **after** the commit succeeds, and treat a
missing file as success (idempotent).
**When to use:** Inside the existing PUT handler, next to the revision bump.

### Anti-Patterns to Avoid
- **Buffering the upload in memory then writing** (`fs.readFileSync`-style): `readJson` does this for
  JSON, but the upload path must stream — a 25 MB upload through a Buffer copy is wasteful and the cap
  check should abort mid-stream.
- **Trusting the upload's claimed mime / original filename for headers** (D-06): SVG and HTML are
  both `fileType → other` adjacent XSS vectors; the served Content-Type must come from a fixed map,
  the download filename from the record's `name` (sanitized for the header, see Pitfall 4).
- **A second metadata channel:** the record already has a persistence channel (the doc). Do not add a
  server-side files table for name/type/size — the doc is the source of truth (CONTEXT: "the record
  stays the source of truth").
- **Deleting binaries from client code:** the client has no filesystem; orphan cleanup must be
  server-side (D-04).
- **Serving the file route with the default `securityHeaders(req)`** — see Pitfall 2.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Upload progress | Fake timer (current) or fetch polling | XHR `upload.onprogress` | Only zero-dep transport with real progress; D-08 |
| PDF rendering | A JS PDF viewer | Native browser embed `<iframe src=…>` | D-09; every target browser renders PDFs natively in iframes |
| Multipart parsing | A hand-rolled multipart parser | Raw body per file (metadata in query/headers) | Multipart boundary/charset edge cases are a classic bug farm; raw body is one stream |
| Content-Type sniffing | Magic-byte detection | Fixed extension→type map + X-Content-Type-Options: nosniff | D-06's design deliberately avoids type guessing; all types stored, only known-safe previewed |
| Auth for new endpoints | New auth path | `requireWorkspace(req, res, slug, 'member')` | Ready-made at `server.js:1140` [VERIFIED: server.js:1140-1157] |

## Runtime State Inventory

> Included for completeness even though this is an additive-behaviour phase: the "simulated upload"
> behaviour it replaces has no stored state.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `data.files` records are metadata-only today; no binaries exist anywhere under DATA_DIR yet [VERIFIED: DATA_DIR only referenced for projects.db/backups, server.js:52-53, 852] | None for existing data; new writes go to `DATA_DIR/files/` |
| Live service config | None | None |
| OS-registered state | None | None |
| Secrets/env vars | New env knob `MAX_UPLOAD_MB` (D-02) added to the env doc block at `server.js:10-33` and read like `MAX_BODY` at `server.js:68` | code edit only |
| Build artifacts | None (no compiled assets involved; dist/ rebuilt by vite as usual) | None |

## Common Pitfalls

### Pitfall 1: The file route never reaches `serveStatic`
**What goes wrong:** Adding `GET /w/:slug/file/:id` "to the router" naively as a static path —
`serveStatic` serves `index.html` for every extensionless path (`server.js:1874-1879`), so the bytes
never appear and the SPA renders instead.
**Why it happens:** The top-level dispatcher only special-cases `/api/` (`server.js:1869`).
**How to avoid:** Intercept the file route in the `http.createServer` handler *before* the
`serveStatic` call (Pattern 3). Same for the upload POST: `/w/:slug/files` must be matched before
`serveStatic` too (a POST to serveStatic 405s).
**Warning signs:** curl of the file URL returns HTML instead of bytes.

### Pitfall 2: CSP / X-Frame-Options block the PDF iframe
**What goes wrong:** `securityHeaders()` sets `X-Frame-Options: DENY` and
`frame-ancestors 'none'` (`server.js:1736-1742`) on **every** response, including file bytes. An
`<iframe src="/w/:slug/file/:id">` is framing that response → the browser refuses to render the PDF.
**Why it happens:** The headers are correct for the SPA but wrong for a resource that is *meant* to be
same-origin-framed.
**How to avoid:** The file binary route builds its own header set: keep `X-Content-Type-Options:
nosniff` and a CSP **without** `frame-ancestors 'none'`/`X-Frame-Options` for inline types (or set
`frame-ancestors 'self'`), and never emit the interactive default-src for non-preview types. Note
`img-src 'self'` in the SPA CSP already allows same-origin images [VERIFIED: server.js:1741] — only
the framing headers need work. This is also the CONTEXT "CSP adjustments (agent's discretion)" item.
**Warning signs:** Browser console "refused to display … in a frame because it set X-Frame-Options
to 'deny'" in the preview modal.

### Pitfall 3: `MAX_BODY` cap is the wrong guard for uploads
**What goes wrong:** Reusing `readJson`/`MAX_BODY` (8 MB default, `server.js:68`) for uploads silently
caps every upload at the JSON limit, or — worse — the endpoint doesn't use `readJson` and there is no
cap at all until the disk fills.
**Why it happens:** D-02 wants a *separate* knob (`MAX_UPLOAD_MB`), independent of `MAX_BODY_BYTES`.
**How to avoid:** Read `MAX_UPLOAD_MB` at boot (default e.g. 25), enforce it in the streaming write
(Pattern 1), emit 413 with stable code `uploadTooLarge` **before** the body is fully consumed but
after draining (the WR-05 drain-then-respond pattern at `server.js:1196-1206`).
**Warning signs:** 413 arrives but the client already gave up on the socket.

### Pitfall 4: Content-Disposition filename injection
**What goes wrong:** The record's `name` (user-controlled, e.g. `rép"; .pdf` or CRLF) is echoed into
the `Content-Disposition` header → header splitting or broken filenames.
**Why it happens:** Filenames are arbitrary user strings.
**How to avoid:** Strip CR/LF/quotes/control chars, use `filename="ascii-fallback";
filename*=UTF-8''<pct-encoded>` (RFC 6266). Hand-roll carefully — it's ~5 lines, acceptable under the
zero-dep guarantee, and safer than importing a dependency.
**Warning signs:** Header-value test with a filename containing `"`/`\n`.

### Pitfall 5: Duplicate-file record vs binary id drift
**What goes wrong:** `A.dupFile` (`actions.js:1915-1922`) creates a record with a **new id** but the
"copy" record has no binary behind it — and D-04's diff would unlink nothing (old id still present),
leaving the duplicate unpreviewable/404.
**Why it happens:** Duplication was designed for metadata-only mode.
**How to avoid:** Decide explicitly in planning: either `dupFile` copies the binary server-side, or
it stays metadata-only and the duplicate serves a 404 with the stable `fileNotFound` code (honest,
matches demo mode). **Recommend the latter** (smallest surface, no new server mutation) and surface
the choice at plan review.
**Warning signs:** Duplicate record → preview modal → 404 toast.

### Pitfall 6: Upload success ≠ record persistence failure
**What goes wrong:** Bytes land in `DATA_DIR/files/<id>` but the doc PUT with the record fails (409
revision conflict, offline) → orphan binary with no record, invisible to D-04's diff.
**Why it happens:** Upload and record are two channels by design (CONTEXT: "the record stays the
source of truth… binary storage is new and separate").
**How to avoid:** Order client operations strictly: XHR success → then `mutate`/`save()` (which
already handles 409 retry via the existing sync machinery); on record-persist failure, toast and
**delete the just-uploaded binary** (a small `DELETE /w/:slug/files/:id`-style compensation or accept
the orphan until D-04's next full-document diff cleans it — the diff approach also self-heals
historical orphans). The self-healing diff is the cheaper, more robust answer.
**Warning signs:** `DATA_DIR/files/` contains ids absent from every workspace doc.

### Pitfall 7: i18n scan / error-code gates
**What goes wrong:** New user-visible strings (upload toasts, `err.uploadTooLarge`, `err.fileNotFound`)
miss the en/fr catalogues and `npm run build` fails on the i18n scan, or `test/error-codes.test.mjs`
fails because every `fail(res, …, 'code', …)` emitted by server.js must have an `err.<code>` entry in
both catalogues [VERIFIED: test/error-codes.test.mjs:18-25 extraction regex].
**How to avoid:** Add catalogue keys for every new literal and every new error code in the same task;
run `npm test` (which includes the static error-code parity test) per commit.
**Warning signs:** build exits 1 with file/line/literal.

## Code Examples

### Current code being replaced (verbatim anchors)

`handleFiles` simulation — the `setInterval` block to swap for XHR (`src/actions/actions.js:886-906`):
the row UI contract is `bar.style.setProperty('--p', up.pct / 100)` + `pc.textContent = up.pct + '%'`,
row removed from `S.ui.uploads` at 100%, then record pushed to `D().files` + `task.attachments` +
`logAct('addedAFileTo', …)` + `save()` + `render()` + `toast(t('toast.uploaded', { name }))`.
The `S.ui.offline` early return at `actions.js:878-881` stays untouched (D-12).

`copyLink` file branch (`src/actions/actions.js:517-532`): already builds
`${api.url}/w/${D().ws.url}/file/${d.fid}` — **no change needed** once the server route exists; the
link already points at the future D-07 URL.

Deep-link plumbing already half-exists (`src/main.js:112`):
```js
if (seg === 'file' && (data.files || []).some(f => f.id === key)) return go('file', { id: key });
```
but `'file'` is **not** in `ROUTE_IDS` (`src/shell/render.js:20-41` [VERIFIED: read this session]) and
no `file` page exists. Options for D-13's SPA side (planner picks):
1. **(Recommended)** Extend `applyDeepLink`'s file branch to `go('tasks')`-or-current-route + open the
   preview modal directly (`openModal({ type: 'filePreview', file, tid: f.task })` — same call
   `A.previewFile` makes at `actions.js:871-875`). No new route/page, matches "opens the preview
   modal" wording.
2. Add a `file` ROUTE_ID + page — more surface, unnecessary for a modal-only destination.

`filePreviewModal` (`src/overlays/modals.js:293-299`): the modal body renders `filePrev(f)` art
replaced with an aspect-ratio box; the real-bytes branch swaps that inner div for
`<img src="/w/${D().ws.url}/file/${f.id}" …>` (img type) or `<iframe src="…" title="…">` (pdf type),
keeping the download tile for all other types (D-03). Existing footer's `data-a="copyLink"
data-fid="${f.id}"` already wires D-13.

Error helpers (`server.js:1027-1051`): `fail(res, status, code, message, extra)` and
`httpError(status, message, code)` — all new rejections use these, and every new code string needs
`err.<code>` in `src/locales/en.json` + `fr.json` (enforced by test).

Auth gate signature (`server.js:1140-1157` [VERIFIED: read this session, quoted in full in
Research-verified values below]): `requireWorkspace(req, res, slug, minRole = 'viewer')` returns
`{ user, ws, membership }` or responds `404 workspaceNotFound` / `403 adminOnly|readOnlyAccess` and
returns null. Upload endpoint: `minRole 'member'`; file GET: `'viewer'`.

### Research-verified values (verbatim quotes)

`server.js:1140-1141` — `function requireWorkspace(req, res, slug, minRole = 'viewer') {`
`server.js:74` — `const RESERVED_SLUGS = new Set(['api', 'w', 'join', 'assets', 'static', 'health', 'login', 'signup', 'onboarding', 'settings', 'admin']);`
`server.js:68` — `const MAX_BODY = Number(process.env.MAX_BODY_BYTES || 8 * 1024 * 1024);`
`server.js:52` — `const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(HERE, 'data'));`
`src/overlays/modals.js:293` — `export function filePreviewModal(m, H) {`
`src/actions/actions.js:876` — `export function handleFiles(files, ctx) {`
`src/main.js:112` — `if (seg === 'file' && (data.files || []).some(f => f.id === key)) return go('file', { id: key });`
`src/ui/helpers.js:87-96` — `export const FT = { fig: …, pdf: { c: '#C4473A', i: 'file-text' }, zip: …, img: { c: '#23918A', i: 'image' }, sheet: …, doc: …, code: …, other: … };`
`src/shell/render.js:20` — `export const ROUTE_IDS = [` … no `'file'` entry (verified by reading lines 20-41).

Note the D-07 claim "RESERVED_SLUGS already blocks `file`" in CONTEXT is **imprecise**: `file` is NOT
in RESERVED_SLUGS — but it cannot collide with the file route anyway, because workspace slugs live
under `/w/:slug/` and the file path is `/w/:slug/file/:id` (a sub-path, not a slug). No collision
either way [VERIFIED: server.js:74, 201 — slug validation applies to workspace slugs only].

### Safe fixed Content-Type map (server, D-06)

Derive from the existing `fileType()` taxonomy (`src/ui/helpers.js:98-107` [VERIFIED]) — the
extension sets are quoted verbatim there: `fig`→(never inline), `pdf`→`application/pdf`, zip types
(`zip`,`rar`,`7z`)→`application/zip`-ish + attachment, img types (`png`,`jpg`,`jpeg`,`gif`,`webp`,
`svg`,`heic`)→ inline for png/jpg/jpeg/gif/webp; **svg must serve attachment + `application/octet-stream`**
(D-06's XSS rationale — SVG is scriptable), `heic` → attachment (not universally previewable);
sheet/doc/code/other → attachment + `application/octet-stream` (or `text/plain` for `.txt/.md/.csv` —
planner's discretion, still attachment).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Simulated `setInterval` progress | XHR `upload.onprogress` | This phase | Real progress; fetch still can't do upload progress (unchanged) |
| Metadata-only files | Bytes under `DATA_DIR/files/` | This phase | New storage dir + route; doc record unchanged in shape |
| Icon-art preview modal | `<img>`/`<iframe>` for img/pdf | This phase | Modal gains real rendering; `filePrev()` icon art retained for lists/grids (D-10) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `fetch()` cannot report upload progress and XHR `upload.onprogress` can | Standard Stack / D-08 | Low — this is stable, long-documented platform behavior; also the CONTEXT itself asserts it (D-08), so it's user-locked, not merely assumed |
| A2 | All modern browsers render PDFs in same-origin `<iframe>`/`<embed>` | Pitfall 2 / D-09 | Low — native PDF viewing is universal; Firefox uses pdf.js internally |
| A3 | Raw-body XHR with query-string metadata + same-origin cookies passes the existing `sameOrigin` check (no `Origin` header on same-origin XHR POST → check passes) | Pattern 2 / upload endpoint | Medium — same-origin XHR POSTs *do* usually carry `Origin` matching host, so the check passes either way; if a reverse proxy mangles Host, upload 403s — same failure class as every existing mutation, so no new risk |
| A4 | Accept-header negotiation (`Accept: text/html` → SPA) is reliable for distinguishing navigation from embed fetches | Pattern 3 | Low-medium — `<img>` sends `Accept: image/*`, `<iframe>` pdf sends no html; a paranoid fallback is to also require the request NOT to come from a `Sec-Fetch-Mode: navigate` mismatch; planner may simply always serve bytes for the file route and use a hash-based SPA link instead — decide at planning (see Open Question 1) |
| A5 | Default `MAX_UPLOAD_MB = 25` is a sane default | D-02 discretion | Low — pure policy choice |
| A6 | DupFile staying metadata-only (404 for the duplicate's preview) is acceptable | Pitfall 5 | Medium — UX-visible; flag at plan review or a checkpoint |

## Open Questions (RESOLVED)

All three questions were resolved during planning; each is implemented in the plan cited.

1. **SPA-side destination URL for copied file links** (RESOLVED — implemented by 12-03 Task 2: pathname route `/w/:slug/file/:id` + Accept negotiation) — D-13 says "the SPA gains a `file/:id` hash
   route", but the app's existing deep links are **pathname**-based (`/w/:slug/task/<key>`,
   `applyDeepLink`), not hash-based, and `copyLink` already copies the pathname form. Recommendation:
   keep the pathname form (`/w/:slug/file/:id`) for consistency with task/project links and implement
   the "both worlds" behaviour with Accept negotiation (Pattern 3). If negotiation feels fragile, the
   alternative is: server always serves bytes for `/w/:slug/file/:id`, and the SPA's copy-link copies
   that URL — "opened in a browser tab" then shows the browser's native PDF/image viewer, and the SPA
   deep-link only triggers when the SPA is already open. Confirm direction at planning.
   - What we know: `copyLink` already copies the pathname; `applyDeepLink` has a file branch; ROUTE_IDS lacks `file`.
   - What's unclear: whether "hash route" in D-13 was literal or shorthand for "the deep link works".
   - Recommendation: pathname route + Accept negotiation; ask user only if A4 concerns materialize.
2. **dupFile semantics** (RESOLVED — implemented by 12-03 Task 2, contract exclusion: metadata-only duplicate, 404 preview) — see Pitfall 5 / A6. Recommendation: metadata-only duplicate, 404 preview, or alternatively exclude dupFile from the copy-link contract. Small checkpoint candidate.
3. **Orphan self-healing** (RESOLVED — implemented by 12-02 Task on the doc-PUT diff: strict same-PUT unlink per D-04) — whether the doc-PUT diff should also unlink binaries not referenced by
   any workspace doc (heals Pitfall 6 across sessions) or strictly unlink only ids the same PUT
   removed. Recommendation: strict same-PUT diff (D-04 wording); note self-healing as a cheap follow-up.

## Environment Availability

> Phase is code/config-only against existing tooling; no new external dependencies.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | server, node:test | ✓ | v24.21.0 [VERIFIED: `node --version`] | — (engines ≥24) |
| npm test / node:test | validation | ✓ | built-in | — |
| Playwright | e2e (optional) | ✓ | ^1.64.1 [VERIFIED: package.json] | node:test server harness `test/helpers/server.mjs` (boots server on free port with temp DATA_DIR) [VERIFIED: test/helpers/server.mjs:43-50] |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (Node 24), plus Playwright for browser flows |
| Config file | none for node:test (`test/*.test.mjs` glob); `e2e/playwright.config.mjs` for Playwright |
| Quick run command | `node --test test/server-boot.test.mjs` |
| Full suite command | `npm test` (node --test --test-concurrency=2 test/*.test.mjs) and `npm run e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UPLOAD-01 | Upload endpoint stores bytes under `DATA_DIR/files/<id>`, auth-gated (member+), 404 for unknown ws/unauth | integration (node:test server harness) | `node --test test/upload.test.mjs -x` | ❌ Wave 0 |
| UPLOAD-02 | Oversize rejected 413 with stable code `uploadTooLarge`; code present in both catalogues | integration | `node --test test/upload.test.mjs -x` | ❌ Wave 0 |
| UPLOAD-03 | File route serves bytes to authorized member; 404 (not 403) for outsider — no existence oracle | integration | `node --test test/upload.test.mjs -x` | ❌ Wave 0 |
| UPLOAD-04 | Inline/attachment + safe fixed Content-Type per type map; svg never inline | integration | `node --test test/upload.test.mjs -x` | ❌ Wave 0 |
| UPLOAD-05 | Deleting record/task/project unlinks the binary (D-04) | integration | `node --test test/upload.test.mjs -x` | ❌ Wave 0 |
| PREVIEW-01 | `handleFiles` uses XHR onprogress (no `setInterval` in the upload path) | static / unit | extend an existing static test or Wave 0 file | ❌ Wave 0 |
| PREVIEW-02 | Failed upload: no record in `data.files`, toast shown (D-11) | unit (harness) | via existing test harness pattern | ❌ Wave 0 |
| PREVIEW-03 | Preview modal renders img/pdf for real files; download tile otherwise | e2e (Chromium) | `npm run e2e` (extend flows.spec) | ❌ (existing spec file exists; new case Wave 0) |
| LINK-01 | Copied file link + Accept navigation opens preview modal; direct fetch serves bytes | e2e | `npm run e2e` | ❌ Wave 0 |
| I18N-01 | Every new literal + error code in en/fr catalogues; build passes | static | `npm run build` + `npm test` (error-codes parity) | ✅ existing |

### Sampling Rate
- **Per task commit:** `node --test test/upload.test.mjs test/error-codes.test.mjs -x`
- **Per wave merge:** `npm test`
- **Phase gate:** `npm test` + `npm run e2e` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/upload.test.mjs` — new integration suite for the endpoint + route (UPLOAD-01…05), using `test/helpers/server.mjs` `startServer({ dataDir })` harness [VERIFIED: helpers signature]
- [ ] One e2e case in `e2e/flows.spec.mjs` or a new spec for PREVIEW-03/LINK-01
- Framework install: none needed.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing scrypt+session-cookie auth; file route inherits `requireWorkspace` |
| V3 Session Management | yes (read-only reuse) | Existing opaque session cookies; no change |
| V4 Access Control | yes | `requireWorkspace` with minRole; 404-on-unauthorized (D-05, no existence oracle) |
| V5 Input Validation | yes | Slug regex + record-id format check on the route; filename sanitization for Content-Disposition; size cap streamed |
| V6 Cryptography | no | No new crypto |
| V7/V14 file handling | **yes — the phase's core risk** | See threat table |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stored XSS via uploaded SVG/HTML served inline | Tampering/Elevation | D-06: svg/never-safe types → `Content-Disposition: attachment` + `application/octet-stream`; `X-Content-Type-Options: nosniff`; existing `script-src 'self'` CSP [VERIFIED: server.js:1741] |
| Path traversal in file id → arbitrary file read/write | Tampering/Info disclosure | File id validated against the record in the workspace doc (auth + existence together); never build paths from the raw URL param — resolve `path.join(FILES_DIR, id)` and assert `path.dirname === FILES_DIR` like `serveStatic` does (`server.js:1813`) |
| Existence oracle on unknown ids | Info disclosure | D-05: 404 for both unknown and unauthorized |
| Zip-bomb / oversize DoS | DoS | Streamed cap (D-02, MAX_UPLOAD_MB) mid-stream; no decompression of stored bytes |
| CSRF on the upload POST | Tampering | `sameOrigin(req)` gate like every other mutating endpoint [VERIFIED: server.js:1084-1090] |
| Framing abuses via new iframe route | Spoofing | Keep `frame-ancestors` tight for the SPA; only the inline binary response relaxes it (see Pitfall 2) — planner documents the exact header set |
| Disk exhaustion | DoS | Cap per file (D-02); quotas explicitly deferred |

## Project Constraints (from AGENTS.md)

`./AGENTS.md` and `./.opencode/AGENTS.md` do not exist in this repo (verified this session). The
governing constraints come from PROJECT.md via CONTEXT: zero-runtime-dependency guarantee, strict
workspace isolation, stable error-code pattern, hand-rolled server. All honored above.

## Sources

### Primary (HIGH confidence)
- `server.js` — read this session: env block (10-33), DATA_DIR (52), RESERVED_SLUGS (74), requireWorkspace (1140-1157), readJson/WR-05 (1178-1210), fail/json/httpError (1027-1051), sameOrigin (1084-1090), securityHeaders/CSP (1735-1742), sendFile/serveStatic (1753-1881), docFromClient (doc-PUT hook), top dispatcher (1836-1882)
- `src/actions/actions.js` — read this session: copyLink (517-532), handleFiles (876-913), previewFile (871-875), dupFile/delFile (1915-1944)
- `src/overlays/modals.js` — filePreviewModal (293-299)
- `src/main.js` — deep-link boot + applyDeepLink (100-119, 148-220)
- `src/ui/helpers.js` — FT map + fileType (87-107)
- `src/shell/render.js` — ROUTE_IDS (20-41)
- `src/core/api.js` — api.url / wsPath / call machinery (full file)
- `test/error-codes.test.mjs` — error-code parity contract; `test/helpers/server.mjs` — harness

### Secondary (MEDIUM confidence)
- MDN XHR upload progress / Content-Disposition RFC 6266 — standard platform knowledge, not re-fetched this session (A1, A2, Pitfall 4)

### Tertiary (LOW confidence)
- none

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — it is the project's own existing stack, all verified by reading source
- Architecture: HIGH — every integration point verified in source; one open design question (Open Question 1) flagged with a recommendation
- Pitfalls: HIGH — all seven are grounded in concrete source lines read this session

**Research date:** 2026-10-24
**Valid until:** 2026-11-23 (stable repo-internal domain)
