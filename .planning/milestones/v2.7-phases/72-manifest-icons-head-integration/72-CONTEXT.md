# Phase 72: Manifest, Icons & Head Integration - Context

**Gathered:** 2026-11-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Inert static install assets only: a hand-written `public/manifest.webmanifest`, a five-PNG
icon set rasterized once from the existing brand mark, head tags in `index.html`, and a
minimal `server.js` static-serving touch (MIME + compression + no-cache for the manifest).
Zero JS added, zero edits to `public/sw.js`, D-06 per-workspace favicon swap untouched.
Install banner UX is Phase 73; SW verification is Phase 74.

</domain>

<decisions>
## Implementation Decisions

### Icon source & maskable design
- **D-01:** The launch icon derives from the square `public/favicon.svg` PS monogram tile
  (not `logo-v4.svg`, which carries a wordmark and a 760×208 aspect).
- **D-02:** `purpose: any` 192/512 icons are a faithful rasterization of `favicon.svg`
  as-is (full-bleed gradient tile, no safe-zone changes) — matching today's tab favicon look.
- **D-03:** Maskable 192/512 variants are a redesigned artwork: full-bleed dark tile
  background extended to fill the square, monogram shrunk to ~60–66% of the canvas with the
  gradient rim inset inside the ~80% safe zone. Not blind padding, not glyph-only.
- **D-04:** `apple-touch-icon.png` (180×180) bakes the same dark tile as the maskable icon
  into an opaque PNG (iOS flattens transparency to black). Consistent look across iOS/Android.
- **D-05:** All committed PNGs are frozen from favicon.svg's **light-scheme rendering**
  (default vars: tile `#1D1338→#0A0714`, rim `#8B63F5→#FFB86B`). Icons are static files and
  cannot respond to device theme; the light-scheme default is the canonical brand look.

### PNG production
- **D-06:** PNGs are rendered by the agent in a headless browser from the SVG artworks and
  committed as static files. No rasterization tooling lands in the repo (zero-new-deps).
- **D-07:** Each PNG is shown to the owner as an embedded image in chat at execution time
  for visual approval before its commit lands.

### Theme & background colors
- **D-08:** Manifest `theme_color` = `#1D1338` (tile-a, lighter gradient end) — dark window
  frame harmonizing with the launch icon. Exact hex is frozen and pinned by the static
  contract test. **Reversibility:** one-way-ish — once users install the standalone app the
  id/color pair is cached by launchers; treat the pinned hex as a published contract.
- **D-09:** Manifest `background_color` = `#fbfaf8` (light app bg, `tokens.css`) so the
  splash screen hands off seamlessly to the app's first paint.
- **D-10:** `index.html` gets a single static `<meta name="theme-color" content="#1D1338">`
  (no light/dark media pair).
- **D-11:** iOS metas: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style:
  black-translucent`, `apple-mobile-web-app-title`, plus the `apple-touch-icon` link
  (already mandated by PWA-01). iOS splash-screen matrix beyond these metas stays out of
  scope (milestone boundary).

### Manifest delivery & MIME
- **D-12:** `server.js` diff is exactly three touches: add `.webmanifest:
  application/manifest+json` to the static `MIME` map (line ~8023 — verified missing;
  without it the manifest serves as `application/octet-stream` and Chromium rejects it),
  add `.webmanifest` to `COMPRESSIBLE`, and extend the `cacheControl()` no-cache branch
  (line ~8097) to include the manifest filename alongside `index.html` and `sw.js`.
- **D-13:** The MIME/no-cache contract is pinned twice: a static contract test asserting
  the MIME map entry + cacheControl branch + COMPRESSIBLE membership (the
  `test/browser-push.test.mjs` precedent), plus an e2e live check of
  `GET /manifest.webmanifest` headers (200, `application/manifest+json`, `no-cache`).
- **D-14:** CSP is verify-only: `default-src 'self'` already covers manifest fetch and PNG
  loads; no preemptive CSP edit.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone planning & research
- `.planning/research/SUMMARY.md` — HIGH-confidence milestone research: stack (zero deps),
  phase decomposition, repo-verified pitfalls 1–6 (sw.js token ban, SW scope, start_url
  freeze, icon mistakes, i18n/chunk gates, iOS honesty). Phase 1 section says "follow
  ARCHITECTURE.md's component map verbatim" — all Phase 72 decisions pre-made there.
- `.planning/REQUIREMENTS.md` — PWA-01 and PWA-02 full text; out-of-scope list.
- `.planning/ROADMAP.md` — Phase 72 goal, success criteria 1–4, standing constraints.

### Repo contracts the phase must not break
- `test/browser-push.test.mjs` — forbidden-token contract on sw.js (`fetch|install|activate|import`
  banned even in comments; byte-identical substrings). Zero `public/sw.js` edits.
- `server.js` — static `MIME` map (~8023), `COMPRESSIBLE` set (~8039), `cacheControl()`
  (~8097), `securityHeaders()` CSP (~8043). The three-line diff site for D-12.
- `public/favicon.svg` — canonical icon source artwork (theme-aware CSS vars; light scheme
  is the frozen render per D-05).
- `index.html` — current head (favicon link, fonts preconnect); insertion site for manifest
  link, theme-color meta, iOS metas.
- `src/styles/tokens.css` — `--bg: #fbfaf8` light / `#1a1a19` dark; source of D-09.
- Phase 43 D-06 boundary — per-workspace logo favicon swap must stay unaffected
  (success criterion 4; existing favicon tests must stay green).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `public/favicon.svg` — theme-aware square monogram, the single artwork source for all
  five PNGs (rasterized once, committed; not a build step).
- `public/sw.js` + `src/core/push.js` `registerSw()` — already the install SW at root
  scope; Phase 74 verifies, this phase must not touch them.
- `server.js` static file pipeline — MIME map, gzip cache, cacheControl; manifest rides
  the existing path with a 3-line extension.

### Established Patterns
- Static contract tests pinning file shape (`test/browser-push.test.mjs`) — the pattern
  for the new manifest/icons/header pins.
- `public/` files are copied verbatim by Vite, outside the bundle and the 500 kB chunk
  gate — the manifest and PNGs have zero gate impact.
- EN+FR i18n in same commit — not applicable this phase (no user-visible strings; head
  tags and manifest are not catalogued strings).

### Integration Points
- `index.html` `<head>` — manifest `<link rel="manifest">`, `<meta name="theme-color">`,
  apple-touch-icon link, iOS capability metas (D-10/D-11).
- `server.js:8097` `cacheControl()` — extend no-cache branch to `manifest.webmanifest`.
- Existing favicon swap (D-06) — the new head tags must not conflict with the runtime
  per-workspace favicon logic.

</code_context>

<specifics>
## Specific Ideas

- Owner picked the recommended option in every gray area: faithful favicon.svg `any`
  icons, inset-rim full-bleed maskable redesign, dark tile apple-touch-icon, dark frame
  (#1D1338) + light splash (#fbfaf8), 3-touch server diff, double pinning of headers.
- The dark tile gradient endpoints (`#1D1338`/`#0A0714`) and rim (`#8B63F5`→`#FFB86B`)
  are the canonical brand values; the frozen theme_color `#1D1338` is chosen as tile-a
  (the lighter end) deliberately.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 72-Manifest, Icons & Head Integration*
*Context gathered: 2026-11-18*
