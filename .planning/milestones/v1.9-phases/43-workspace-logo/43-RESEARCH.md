# Phase 43: Workspace Logo - Research

**Researched:** 2026-11-06
**Domain:** Single-file Node.js HTTP server (server.js) + vanilla-JS SPA — file upload/streaming, fixed-MIME serving, workspace doc channel, digest email builder, client favicon swap
**Confidence:** HIGH (all claims verified by reading repo source this session; zero new external dependencies, so no package audit needed)

## Summary

The app is a zero-framework stack: one `server.js` (raw `http` + better-sqlite3), a Vite-built vanilla-JS SPA (`src/`), and a hand-rolled mailer (`mailer.js`). Every mechanism this phase needs already exists and was verified in source: a raw-body streaming uploader with mid-stream 413 cap (`uploadBinary`, server.js:5088-5118), a fixed-MIME serving discipline with a header-sanitizing `fileDisposition()` (server.js:5138-5162), a role gate one argument away from Owner/Admin (`requireWorkspace(req,res,slug,'admin')`, server.js:2930-2945), and a doc-channel mutator that stores workspace-shape data with zero migration (`updateDoc`, server.js:1910-1917). Byte routes live as regex intercepts inside `http.createServer` **before** `serveStatic` and the `/api/` branch (server.js:5382-5437) — the logo routes must join that intercept chain or the extensionless `/w/:slug/logo` GET would fall into the SPA fallback (pinned regression class: `test/file-route-ordering.test.mjs`).

Two findings materially shape the plan. **(1) Revision bump:** `updateDoc` increments the workspace doc `revision` on every call (server.js:1915) — a logo upload that writes `doc.data.logo` invalidates every client's held revision, and the upload response MUST return the fresh revision (`wsRevision`, server.js:1922-1925) or the admin's next doc write 409s. **(2) SVG inline serving is a deliberate exception:** the existing `FILE_INLINE_MIME` map (server.js:5138-5145) excludes svg exactly because attachment SVGs are scriptable; the logo route must NOT reuse that map — it needs its own fixed `{svg,png,jpg}` map per D-03 and its own header set, ideally adding a restrictive `Content-Security-Policy`/`sandbox` on the SVG response so direct navigation cannot execute scripts (the `<img>` context is inert; direct navigation is the exposure).

**Primary recommendation:** Three routes in the existing intercept chain — `POST /w/:slug/logo` (sameOrigin → requireWorkspace 'admin' → validate magic bytes/ext → `uploadBinary` to `DATA_DIR/logos/<uid>.<ext>` → `updateDoc` set `doc.data.logo` → return `{ logo, revision }`), `DELETE /w/:slug/logo` (same gate; unlink file + clear fields), and a public session-free `GET /w/:slug/logo` that resolves slug→workspace→`doc.data.logo`, serves fixed mime by extension with `Cache-Control: public, max-age=31536000, immutable` (safe because D-11 versioning cache-busts), and 404s (favicon-fallback contract, D-10) when unset. Add `logo` to `workspacePayload`, render in the four surfaces, and pin everything in `test/workspace-logo.test.mjs`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Dedicated logo route (`POST /w/:slug/logo`) with its own on-disk storage directory (e.g. `/data/logos`), NOT the existing `files/` attachment system. SameOrigin + workspace/role gate before body read, per the existing `handleUpload` guard order. Reversible.
- **D-02:** Serving is a public, session-free route (`GET /w/:slug/logo`) — workspace-scoped path IS the access model. Fixed mime per response, never the client's claimed type. One-way (published contract once digest emails embed it).
- **D-03:** Accepted formats: png, jpg, svg. SVG served inline with `image/svg+xml`. Served mime fixed per extension: svg→`image/svg+xml`, png→`image/png`, jpg→`image/jpeg`; anything else rejected at upload.
- **D-04:** Size cap reuses the existing `MAX_UPLOAD_MB` (25MB) knob — one env-var, no new configuration.
- **D-05:** Surfaces showing the logo (closed set): sidebar/topbar next to `ws.name` (`src/shell/layout.js`), Settings > General > Workspace page header (with upload/remove controls), digest email header, browser tab favicon. Nothing else in this phase.
- **D-06:** Browser favicon swap is client-side only: on workspace-context load, JS updates the `<link rel="icon">` href to the workspace logo URL; falls back to `/favicon.svg` when unset. No service-worker or manifest changes.
- **D-07:** Digest email only: logo in the digest header as a capped `<img>` (max-height ~48px, alt text = workspace name). Reminder/notification emails keep text-only identity.
- **D-08:** Logo reference lives on the workspace document (e.g. `logo: { path, ext, uploaded_at }` or equivalent fields) — zero migration.
- **D-09:** One logo per workspace: uploading replaces the reference and deletes the previous file immediately; removing deletes the file and clears the fields. No orphaned bytes.
- **D-10:** Fallback is per-surface: each consumer checks logo presence and renders `/favicon.svg` itself — no server-side 302 redirect on the logo route.
- **D-11:** Logo URL is versioned for cache-busting (e.g. `?v=<uploaded_at epoch>` or content hash).
- **D-12:** Sidebar/topbar renders a small square avatar-style slot (~20–24px, rounded) beside `ws.name`, CSS-fit; no server-side resize or crop. Optional pixel-dimension check at researcher/planner discretion.
- **D-13:** Images served as-is — zero new dependencies, no image processing libraries.

### the agent's Discretion
- Exact doc field shape and naming for the logo reference (D-08 semantics, not schema).
- Exact storage directory location and file naming scheme (uid-style ids per existing convention).
- Whether upload validation includes the optional dimension check (D-12).
- Exact CSS treatment of the avatar slot and digest header cap values within D-12/D-07 constraints.
- How the versioned URL parameter is computed (uploaded_at epoch vs content hash).
- Digest template insertion point and i18n key names for any alt/aria text (EN+FR, `npm run i18n:scan` green).

### Deferred Ideas (OUT OF SCOPE)
- Logo in individual notification/reminder emails.
- Per-member avatars / user profile images.
- Client-side crop/resize before upload.
- Service-worker/manifest favicon theming (PWA icon set).
</user_constraints>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LOGO-01 | Workspace logo upload, storage, rendering with favicon fallback | All mechanisms verified in-repo: `uploadBinary`, `requireWorkspace(...,'admin')`, `updateDoc`, intercept-chain routing, fixed-MIME policy, `buildDigestMessage`, i18n catalogue gates |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Upload/remove + validation + storage | API/Backend (server.js) | — | Raw-body streaming and role gates are server-owned; same as existing file uploads |
| Public serving with fixed mime + cache headers | API/Backend (server.js) | — | Byte route in the intercept chain, like `/w/:slug/file/:id` |
| Logo reference persistence | Database (workspace doc via `updateDoc`) | — | Doc channel is the established zero-migration store for workspace-shape data |
| Sidebar/topbar avatar slot | Browser/Client (`src/shell/layout.js`) | — | Pure DOM/CSS next to the existing `ws-name` span |
| Settings upload/remove UI | Browser/Client (`src/pages/settings.js`) | API/Backend | `wsAdmin` gate already computed there (settings.js:173) |
| Favicon swap | Browser/Client (JS) | — | D-06: client-side `<link rel="icon">` href swap only |
| Digest email header logo | Backend (mailer.js `buildDigestMessage`) | API/Backend (server.js supplies logoUrl) | Digest rendering lives in `buildDigestMessage`; server composes the absolute URL at the `sendDigest` call site |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:http + fs (existing) | Node >=24 (engines field, package.json) | Routes, streaming, unlink | House pattern; **no new runtime dependencies** is a success criterion |
| better-sqlite3 (existing) | in package-lock | Workspace doc persistence via `updateDoc` | Already the persistence layer |
| node:test (existing) | built-in | `test/workspace-logo.test.mjs` | Whole suite is `node --test test/*.test.mjs` |

**Installation:** none — D-13 forbids new dependencies. No Package Legitimacy Audit required (no external packages installed; not applicable).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Magic-byte sniff (hand-rolled, ~15 lines) | `file-type` npm | Rejected: D-13 forbids deps; png/jpg/svg magic checks are trivial |
| Dimension check for png/jpg (parse IHDR/SOF headers) | sharp/canvas | Rejected: re-encoding deps forbidden; optional per D-12, recommend skipping |

## Architecture Patterns

### System Architecture Diagram

```
Admin browser (settings page, wsAdmin gate)
   │  POST /w/:slug/logo  (raw body bytes; DELETE for remove)
   ▼
server.js intercept chain (BEFORE serveStatic & /api/)
   │  1. sameOrigin(req)          → 403 crossOriginRejected
   │  2. requireWorkspace(slug,'admin') → 404/403 (no oracle)
   │  3. validate ext + magic bytes     → 400 invalidLogo (localized err.code)
   │  4. uploadBinary(req, LOGOS_DIR/<uid>.<ext>)  → 413 mid-stream (uploadTooLarge)
   │  5. unlink old logo file (D-09)
   │  6. updateDoc(ws.id, doc => doc.data.logo = {...})   ← bumps doc revision!
   ▼
workspaces.doc (SQLite, zero migration)          DATA_DIR/logos/<uid>.<ext>
   │                                                  │
   ├─ workspacePayload(+logo) → GET /api/workspaces/:slug → sidebar slot, settings page
   ├─ public GET /w/:slug/logo?v=<uploaded_at>  (session-free, fixed mime, immutable cache)
   │        ├─ sidebar <img> + favicon <link> swap (client, D-06)
   │        └─ digest email <img src=APP_URL/w/:slug/logo?v=...> (buildDigestMessage, D-07)
   └─ logo absent → every consumer renders /favicon.svg itself (D-10, no redirect)
```

### Recommended Project Structure
```
server.js                    # 3 route intercepts + LOGOS_DIR + logo helpers (near file-upload section ~5082)
src/shell/layout.js:92       # avatar slot beside ws-name span
src/pages/settings.js:172    # upload/remove controls in case 'workspace'
src/core/api.js (or equiv)   # uploadLogo/removeLogo client calls (raw-body fetch, like existing file upload)
mailer.js:644                # buildDigestMessage header <img> + alt text
src/locales/en.json|fr.json  # err.invalidLogo (+ digest alt keys if catalogued)
test/workspace-logo.test.mjs # role gate, mime policy, fallback, replace/delete, restart survival
```

### Pattern 1: Route interception in the byte-route chain
**What:** Every non-`/api/` byte route is a regex intercept inside `http.createServer` before `serveStatic` (which 405s non-GET and SPA-fallbacks extensionless GETs).
**When to use:** Both logo routes.
**Example** (verified shape, server.js:5382-5437):
```js
/* Upload POST must be intercepted before serveStatic (which 405s non-GET). */
const uploadMatch = url.pathname.match(/^\/w\/([a-z0-9-]{2,40})\/files$/);
if (uploadMatch && req.method === 'POST') { await handleUpload(req, res, uploadMatch[1]); }
else if (/^\/w\/([a-z0-9-]{2,40})\/file\/([A-Za-z0-9_-]+)$/.test(url.pathname) && (req.method === 'GET' || req.method === 'HEAD')) { ... }
else if (/^\/unsubscribe\/([A-Za-z0-9_-]+)$/.test(url.pathname)) { ... }
else if (url.pathname.startsWith('/api/')) { ... }
else { serveStatic(req, res, url); }
```

### Pattern 2: Guard order (login-handler contract)
Verified verbatim, server.js:5120-5129:
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
The logo POST copies this with `'admin'` (D-01) and pre-validates ext/magic before streaming (or streams to a temp name then renames — planner's choice; validate-after-stream is simpler and matches `uploadBinary`'s resolve-with-size contract).

### Pattern 3: Fixed-MIME serving with own header set
Verified verbatim, server.js:5138-5145 and 5269-5277:
```js
const FILE_INLINE_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf' };
```
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
The logo route builds its **own** map `{ svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg' }` (D-03) — do NOT add svg to `FILE_INLINE_MIME` (it deliberately excludes scriptable types for attachments). Logo `Cache-Control` should be `public, max-age=31536000, immutable` (matches the `assets/` policy, server.js:5039) **only because** D-11's `?v=` versioning cache-busts; the `?v` value must be ignored for lookup (serve by slug, not by version).

### Pattern 4: Doc-channel persistence with revision return
Verified verbatim, server.js:1910-1917:
```js
function updateDoc(workspaceId, edit) {
  const row = db.prepare('select doc from workspaces where id = ?').get(workspaceId);
  if (!row) throw httpError(404, 'Workspace not found', 'workspaceNotFound');
  const doc = JSON.parse(row.doc);
  edit(doc);
  db.prepare('update workspaces set doc = ?, revision = revision + 1, updated_at = ? where id = ?').run(JSON.stringify(doc), now(), workspaceId);
  return doc;
}
```
And server.js:1919-1921: *"Every endpoint that edits the document must return it, or the client keeps a stale revision and its next write is rejected with 409."* → the logo POST/DELETE responses must include the fresh revision (`wsRevision(ws.id)`, server.js:1922) so the client can refresh, OR the client must re-GET the workspace after upload.

### Pattern 5: i18n + error-code catalogue gates (hard gates, test-enforced)
- Every new `fail(res, status, 'code', ...)` code is auto-extracted by `test/error-codes.test.mjs`, which asserts a non-empty `err.<code>` in **both** `src/locales/en.json` and `fr.json`. A new `invalidLogo` (or similar) code fails the suite without both entries.
- `npm run i18n:scan` (also a `prebuild` hook) statically scans `t()` call sites; new UI strings must be catalogued EN+FR.
- Digest strings use `tFor(locale, 'notif.digest.*')` in `buildDigestMessage` (mailer.js:664-683) with an English-literal degradation `catch`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Size-capped raw-body streaming with 413 + drain | Custom stream logic | `uploadBinary(req, dest)` (server.js:5088) | WR-05 drain-on-overflow and partial-file unlink already handled; reuse unchanged |
| Role gating / no-oracle 404s | Custom checks | `requireWorkspace(req,res,slug,'admin')` (server.js:2930) | Emits exactly the right 404/403 shapes |
| Header sanitization | Custom | `fileDisposition()` (server.js:5155) — or omit Disposition entirely (serving a generated name) | RFC 6266 discipline exists |
| Doc persistence | SQL columns / migration | `updateDoc` (server.js:1910) | NO new migration is a phase constraint |
| Fresh-revision sync | Custom reconciliation | `wsRevision(ws.id)` in the response | Established contract (server.js:1919) |
| Magic-byte validation | Image library | ~15-line png (`89 50 4E 47`), jpg (`FF D8 FF`), svg (leading `<`/`<?xml`) prefix check | D-13 forbids deps; trivial prefixes |

**Key insight:** This phase is almost entirely assembly of verified in-repo mechanisms. The only genuinely new logic is (a) the public session-free GET's header set, (b) magic-byte validation, and (c) the four render surfaces.

## Common Pitfalls

### Pitfall 1: SPA fallback swallows the logo GET
**What goes wrong:** `/w/:slug/logo` is extensionless → `serveStatic` falls through to the index.html SPA fallback; the favicon swap gets `text/html`.
**Why it happens:** The intercept chain is the only path to byte serving (pinned by `test/file-route-ordering.test.mjs`).
**How to avoid:** Add both logo intercepts in the chain before `serveStatic`, with a regression test mirroring `file-route-ordering.test.mjs`.
**Warning signs:** `content-type: text/html` on the logo GET.

### Pitfall 2: Stale doc revision after upload
**What goes wrong:** `updateDoc` bumps revision (server.js:1915); the settings client's next doc PUT 409s.
**How to avoid:** Return `{ logo, revision: wsRevision(ws.id) }` from POST/DELETE and have the client adopt it (or force a workspace re-GET).
**Warning signs:** 409 `revisionConflict` right after a logo upload.

### Pitfall 3: Reusing `FILE_INLINE_MIME` / touching it for svg
**What goes wrong:** Adding svg to the attachment map would serve ALL uploaded attachment SVGs inline — a scriptable-content policy regression far outside this phase.
**How to avoid:** Logo route owns a private `{svg,png,jpg}` map (D-03). Never mutate `FILE_INLINE_MIME`.
**Warning signs:** diff touching server.js:5138.

### Pitfall 4: SVG direct-navigation script execution
**What goes wrong:** Inline `image/svg+xml` is inert in `<img>` but scripts execute on direct top-level navigation.
**How to avoid:** On the svg (or all logo) responses add `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` (GitHub's svg-serving posture) — consistent with the route's "own header set" precedent (server.js:5166 note: byte routes do NOT use `securityHeaders()`).
**Warning signs:** no CSP header on the logo response.

### Pitfall 5: Orphaned bytes on replace/delete/workspace-delete
**What goes wrong:** D-09 promises no orphans; replace must unlink the old file; workspace DELETE (server.js:4391-4402) doesn't know about logos and would strand `DATA_DIR/logos/<uid>`.
**How to avoid:** unlink in the transaction-adjacent flow of POST/DELETE; add logo cleanup to the workspace DELETE handler (small, in-scope because D-09 is a phase obligation) — or document startup sweeping. Recommend explicit unlink in workspace DELETE.
**Warning signs:** files under `data/logos/` with no workspace.

### Pitfall 6: Cache staleness without versioning discipline
**What goes wrong:** Serving `immutable` without every URL carrying `?v=<uploaded_at>` → admins see the old logo for a year.
**How to avoid:** Single URL builder used by ALL consumers (payload field, digest, favicon swap) that always appends `?v=`; the GET ignores the param for lookup.
**Warning signs:** any consumer constructing the logo URL by hand.

### Pitfall 7: Claimed-mime trust at upload
**What goes wrong:** Trusting the client's Content-Type/extension → an `.svg`-named html file served as `image/svg+xml`.
**How to avoid:** Validate magic bytes server-side (png/jpg prefixes, svg must start with `<`); served mime derives from the server-verified ext stored in the doc, never from the request.
**Warning signs:** any read of `req.headers['content-type']` deciding the stored ext.

### Pitfall 8: Digest `<img>` must be absolute and https-aware
**What goes wrong:** A relative `/w/:slug/logo` URL in an email renders nowhere.
**How to avoid:** Build the URL server-side from `APP_URL` at the `sendDigest` call site (server.js:1592-1607 already passes `appUrl`; `buildDigestMessage` composes `${appUrl}/w/${slug}/...` deep links the same way, mailer.js:652). Follow the unsubscribe precedent: omit the img when APP_URL isn't https (degrade to text-only header) or accept http self-hosted — planner's call; the Phase 41 precedent gates on https.
**Warning signs:** `src="/w/..."` in the email HTML.

## Code Examples

### Upload route skeleton (assembles verified pieces)
```js
// server.js — new intercepts (before serveStatic in the createServer chain)
const LOGOS_DIR = path.join(DATA_DIR, 'logos');            // sibling of FILES_DIR (server.js:73)
// boot: fs.mkdirSync(LOGOS_DIR, { recursive: true });      // pattern: server.js:358

const LOGO_MIME = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg' }; // D-03, route-private
const LOGO_RE = /^\/w\/([a-z0-9-]{2,40})\/logo$/;

// POST/DELETE: sameOrigin → requireWorkspace(slug,'admin') → act → respond with fresh revision
// GET: session-free — resolve ws by slug, read doc.data.logo, 404 (logoNotFound or generic) if unset
```

### Client favicon swap (D-06)
```js
// after workspace context load (d.ws.logo ? url : null)
const link = document.querySelector('link[rel="icon"]');
if (link) link.setAttribute('href', logoUrl || '/favicon.svg'); // index.html:8 is the existing tag
```

### Test skeleton (house pattern)
```js
// test/workspace-logo.test.mjs
import { ADMIN, ROOT, login, startServer } from './helpers/server.mjs';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
// startServer({}) boots on a free port with a temp DATA_DIR (helpers/server.mjs:43)
// admin = await login(server.base, ADMIN.email, ADMIN.password)  → admin.client
// pin: member 403 adminOnly; cross-origin 403; >MAX_UPLOAD 413 'uploadTooLarge';
//      non-image 400 err.<code> catalogued EN+FR; GET public w/o cookie 200 fixed mime;
//      unset → 404 (not 302, D-10); replace unlinks old file; restart keeps serving.
```
Verified helper exports: `startServer({ dataDir, env })`, `login(base, email, password)`, `ADMIN`, `ROOT`, `client` (test/helpers/server.mjs:11-156).

## State of the Art

Not applicable — no external libraries; all patterns are in-repo and current as of this working tree (v1.1.1).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `uid()` is the existing id generator usable for logo filenames | Pattern 2 | Cosmetic — planner may pick another naming scheme (discretion area) |
| A2 | SVG sandbox-CSP header posture (GitHub-style) is acceptable under D-03's "same trust class" framing | Pitfall 4 | Low — additive header; planner can checkpoint with user if cautious |
| A3 | Client raw-body upload from settings page can mirror the existing file-upload client call (not re-verified in `src/core/api.js` this session) | Structure | Low — same-origin fetch with credentials; pattern exists somewhere in the SPA for `/w/:slug/files` |
| A4 | Adding logo cleanup to the workspace DELETE handler is in-scope for D-09 | Pitfall 5 | Low — alternatively a documented startup sweep |

## Open Questions

1. **Digest `<img>` when APP_URL is http (self-hosted)?** (RESOLVED — 43-02 Task 3)
   - What we know: Phase 41 precedent gates unsubscribeUrl on `https://` (server.js:1602).
   - What's unclear: whether the logo should embed on http APP_URL deployments.
   - Resolution: embed regardless of scheme — an image URL is not a security-header contract, unlike the Phase 41 unsubscribe gating. Implemented in 43-02 Task 3, action step 1.
2. **Dimension check (D-12 optional)?** (RESOLVED — skip, D-12 discretion)
   - Resolution: skip — trusted admin uploaders (D-13), CSS-fit slot handles aspect; png/jpg dimension sniffing is ~40 lines of binary parsing for marginal value. D-12 left to executor discretion with skip chosen; no task implements it.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | server, tests | ✓ | >=24 (engines, package.json) | — |
| better-sqlite3 | doc persistence | ✓ | in package-lock | — |
| npm test / i18n:scan | validation gates | ✓ | scripts in package.json | — |

**Missing dependencies with no fallback:** none. **With fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in), `--test-concurrency=2` |
| Config file | none needed — `npm test` globs `test/*.test.mjs` |
| Quick run command | `node --test test/workspace-logo.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LOGO-01 / SC-1 | Admin upload stored server-side, survives restart | integration | `node --test test/workspace-logo.test.mjs` | ❌ Wave 0 (new file) |
| LOGO-01 / SC-2 | No logo → favicon fallback byte-identically, no broken img | integration + unit | same file (per-surface fallback assertions) | ❌ Wave 0 |
| LOGO-01 / SC-3 | Owner/Admin only; member sees read-only | integration | same file (role-gate pin) | ❌ Wave 0 |
| LOGO-01 / SC-4 | Non-image/oversized rejected, localized err code EN+FR | integration + catalogue | same file + existing `test/error-codes.test.mjs` + `npm run i18n:scan` | partial (gates exist) |
| LOGO-01 / SC-5 | Full suite green, no new deps | suite | `npm test` + `npm run i18n:scan` + `npm run lint` | ✓ existing |

### Sampling Rate
- **Per task commit:** `node --test test/workspace-logo.test.mjs` (+ `npm run i18n:scan` when strings touched)
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green + `i18n:scan` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/workspace-logo.test.mjs` — covers all LOGO-01 pins above (no framework install needed)
- None otherwise — `test/helpers/server.mjs` covers boot/login fixtures

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | `requireWorkspace(slug, 'admin')` role gate, sameOrigin before body read |
| V5 Input Validation | yes | Extension allow-list + magic-byte prefix check; size cap via `MAX_UPLOAD` |
| V6 Cryptography | no | None needed (no tokens, no secrets) |
| V14 File Upload/Download | yes | Own fixed-MIME map, `nosniff`, sandbox CSP on svg, no client-mime trust |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SVG XSS via direct navigation | Tampering | `Content-Security-Policy: sandbox` header on logo responses |
| Content-type confusion | Tampering | Server-verified ext → fixed mime; never request Content-Type |
| Path traversal via slug/id | Tampering | Slug regex `[a-z0-9-]{2,40}` + uid filenames + `path.dirname` containment check (server.js:5186-5188 precedent) |
| Existence oracle on public GET | Information Disclosure | 404 identical for unknown slug and logo-unset workspace |
| DoS via oversized body | DoS | `uploadBinary` mid-stream 413 with drain (WR-05) |

## Sources

### Primary (HIGH confidence — read this session)
- `server.js` — uploads (5082-5129), serving policy (5131-5288), requireWorkspace (2930-2945), workspace PATCH/DELETE (4363-4402), updateDoc/wsRevision (1910-1925), workspacePayload (624-635), intercept chain (5372-5437), static/cache (5038-5074), MAX_UPLOAD (148-149), DATA_DIR/FILES_DIR (72-74), mkdir (357-358), digest send (1551-1607)
- `mailer.js` — buildDigestMessage (644-777), sendDigest call contract, unsubscribe https precedent (740-749)
- `src/shell/layout.js:92`, `src/pages/settings.js:172-181`, `index.html:8`
- `test/file-route-ordering.test.mjs`, `test/error-codes.test.mjs`, `test/helpers/server.mjs`
- `package.json`, `.planning/phases/43-workspace-logo/43-CONTEXT.md`

### Secondary / Tertiary
- none needed (no external tech)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; all mechanisms read in source
- Architecture: HIGH — route/doc/payload patterns all verified
- Pitfalls: HIGH — each grounded in a cited line range

**Research date:** 2026-11-06
**Valid until:** 2026-12-06 (stable in-repo domain)
