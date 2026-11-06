# Phase 43: Workspace Logo - Context

**Gathered:** 2026-11-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Per-workspace logo (Kanzo #16, LOGO-01): an Owner/Admin uploads an image from Workspace > General > Workspace settings; the logo is stored server-side (dedicated route + dedicated on-disk directory, reference on the workspace document) and rendered in the sidebar/topbar next to the workspace name, the Settings workspace page, the digest email header, and the browser tab favicon. When no logo is set, every surface falls back to `public/favicon.svg` per-surface (no redirect). NO image re-encoding/processing server-side, NO multi-image gallery, NO logo in individual notification emails (digest only), NO service-worker/manifest favicon involvement, NO new migration, NO new runtime dependencies.

</domain>

<decisions>
## Implementation Decisions

### Upload & storage
- **D-01:** Dedicated logo route (`POST /w/:slug/logo`) with its own on-disk storage directory (e.g. `/data/logos`), NOT the existing `files/` attachment system — clean separation from task/project attachments, simple public serving. SameOrigin + workspace/role gate before body read, per the existing `handleUpload` guard order. — **Reversibility:** reversible — additive route + directory; removing it leaves the app on the favicon fallback.
- **D-02:** Serving is a public, session-free route (`GET /w/:slug/logo`) — workspace-scoped path IS the access model (same trust shape as the Phase 42 unsubscribe token path being token-free but scoped). Digest emails and the favicon swap need an <img>-reachable URL. Fixed mime per response (D-06-style policy), never the client's claimed type. — **Reversibility:** one-way — a publicly-guessable workspace-scoped logo URL is a published contract; once digest emails embed it, revoking public access breaks every sent email.
- **D-03:** Accepted formats: png, jpg, svg. SVG served inline with `image/svg+xml` (same trust class as the app's own `logo-light.svg`/`logo-dark.svg` assets; upload is Owner/Admin role-gated). Served mime is fixed per extension per the D-06 fixed-policy precedent — svg→`image/svg+xml`, png→`image/png`, jpg→`image/jpeg`; anything else rejected at upload.
- **D-04:** Size cap reuses the existing `MAX_UPLOAD_MB` (25MB) knob — one env-var, no new configuration.

### Where it appears
- **D-05:** Surfaces showing the logo (exact set, closed): sidebar/topbar next to `ws.name` (`src/shell/layout.js`), Settings > General > Workspace page header (with upload/remove controls), digest email header, browser tab favicon. Nothing else in this phase.
- **D-06:** Browser favicon swap is client-side only: on workspace-context load, JS updates the `<link rel="icon">` href to the workspace logo URL; falls back to `/favicon.svg` when unset. No service-worker or manifest changes.
- **D-07:** Digest email only: logo in the digest header as a capped `<img>` (max-height ~48px, alt text = workspace name). Reminder/notification emails keep text-only identity.

### Data model & fallback
- **D-08:** Logo reference lives on the workspace document (e.g. `logo: { path, ext, uploaded_at }` or equivalent fields) — zero migration, follows the doc-based workspace pattern. — **Reversibility:** reversible — doc fields are additive and ignored by older readers.
- **D-09:** One logo per workspace: uploading a new logo replaces the reference and deletes the previous file from disk immediately; removing the logo deletes the file and clears the fields. No orphaned bytes.
- **D-10:** Fallback is per-surface: each consumer (sidebar, settings, email template, favicon swap) checks logo presence and renders `/favicon.svg` itself — no server-side 302 redirect on the logo route (redirecting image URLs in emails can look like tracking).
- **D-11:** Logo URL is versioned for cache-busting (e.g. `/w/:slug/logo?v=<uploaded_at epoch>` or content hash) — new upload = new URL = instant cache-bust everywhere; unchanged logo caches long.

### Display shape
- **D-12:** Sidebar/topbar renders a small square avatar-style slot (~20–24px, rounded) beside `ws.name`, CSS-fit; no server-side resize or crop. Upload validation may add a pixel-dimension check (no re-encoding) at researcher/planner discretion.
- **D-13:** Images served as-is — zero new dependencies, no image processing libraries; admin uploaders are trusted to supply reasonably-sized assets.

### the agent's Discretion
- Exact doc field shape and naming for the logo reference (D-08 semantics, not schema).
- Exact storage directory location and file naming scheme (uid-style ids per existing convention).
- Whether upload validation includes the optional dimension check (D-12).
- Exact CSS treatment of the avatar slot and digest header cap values within D-12/D-07 constraints.
- How the versioned URL parameter is computed (uploaded_at epoch vs content hash).
- Digest template insertion point and i18n key names for any alt/aria text (EN+FR, `npm run i18n:scan` green).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/ROADMAP.md` § Phase 43 — goal + five success criteria (all test-pinned obligations)
- `.planning/REQUIREMENTS.md` — LOGO-01 to be added at milestone start (Kanzo #16); standing constraints section

### Prior-phase context
- `.planning/phases/42-one-click-unsubscribe-endpoint/42-CONTEXT.md` — public-anonymous-route trust precedent, D-notation style, response-policy discipline
- `.planning/phases/40-digest-subject-task-lines/40-CONTEXT.md` — digest email construction (the header this phase adds the logo to), server i18n pattern

### Implementation anchors (source of truth in code)
- `server.js` § file uploads (~line 5082) — `uploadBinary()` raw-body streamer with mid-stream 413 cap; `handleUpload()` guard order (sameOrigin → role gate → stream)
- `server.js` § file serving (~line 5138) — D-06 fixed inline/attachment MIME policy + `fileDisposition()` RFC 6266 sanitizer (the pattern to follow for the logo route's own header set)
- `server.js` § static (~line 4965) — CSP `img-src 'self' data:` (public logo URL is same-origin, fits), `sendFile()` mechanics
- `src/shell/layout.js` (~line 92) — `ws-name` span where the sidebar logo slot goes
- `src/pages/settings.js` case `workspace` (~line 172) — workspace settings page, Owner/Admin `wsAdmin` gate already computed
- `public/favicon.svg`, `public/logo-light.svg`, `public/logo-dark.svg` — fallback + inline-SVG precedent assets
- `index.html` (~line 8) — `<link rel="icon">` the favicon swap updates
- `src/locales/en.json` / `src/locales/fr.json` + `scripts/i18n-scan.mjs` — i18n gate for new keys
- Digest email template/builder (see Phase 40 context) — header insertion point

No external ADRs/specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `uploadBinary(req, dest)` (server.js ~5088): raw-body size-capped stream-to-disk with WR-05 drain-on-overflow — the logo route streams through this unchanged.
- Fixed-MIME serving policy + `fileDisposition()` sanitizer: the logo route copies this discipline (own header set, fixed mime by extension, sanitized headers).
- `requireWorkspace(req, res, slug, 'admin')` role gate — Owner/Admin enforcement for upload/remove is one argument change from the member-gated upload route.
- `wsAdmin` computed in `src/pages/settings.js` case `workspace` — settings UI already knows the viewer's role; upload/remove controls gate on it.
- Client favicon precedent: `index.html` link tag; a one-line JS href swap needs no new machinery.

### Established Patterns
- Workspace-scoped routes (`/w/:slug/...`) with slug-regex routing in `server.js` — the logo routes follow the same shape.
- Doc-channel updates for workspace fields — logo reference rides the workspace document, no migration.
- D-notation decision comments near the code they constrain — the security-relevant bits (public serving, SVG inline) get the same treatment.
- EN+FR catalogue + `npm run i18n:scan` gate for every new user-facing string.

### Integration Points
- Sidebar (`src/shell/layout.js`), settings workspace page, digest email builder, favicon `<link>` in `index.html`.
- `MAX_UPLOAD_MB` / `MAX_UPLOAD` for the size cap; `DATA_DIR` for the logos directory sibling to `files/`.
- CSP already permits same-origin images — no policy change needed for the public logo URL.

</code_context>

<specifics>
## Specific Ideas

- The user's ask (Kanzo #16, verbatim): "can we add the possibility to upload a logo, and fallback to the favicon.svg if not set?" — the fallback is a first-class requirement, not an afterthought.
- Logo slot beside `ws.name` should read as an avatar (small, square, rounded), not a banner.

</specifics>

<deferred>
## Deferred Ideas

- Logo in individual notification/reminder emails — belongs with the email-identity work if ever scoped; digest-only for now (D-07).
- Per-member avatars / user profile images — new capability, own phase.
- Client-side crop/resize before upload — nice-to-have UX, not needed for trusted admin uploaders (D-13).
- Service-worker/manifest favicon theming (PWA icon set) — deferred with any future PWA work.

</deferred>

---

*Phase: 43-Workspace Logo*
*Context gathered: 2026-11-06*
