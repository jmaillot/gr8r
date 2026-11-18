# Phase 72: Manifest, Icons & Head Integration - Research

**Researched:** 2026-11-18
**Domain:** Web app manifest + PWA icon set + HTML head integration (static assets, zero JS)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Launch icon derives from square `public/favicon.svg` PS monogram tile (NOT `logo-v4.svg`).
- **D-02:** `purpose: any` 192/512 icons are a faithful rasterization of `favicon.svg` as-is (full-bleed gradient tile, no safe-zone changes).
- **D-03:** Maskable 192/512 variants are a redesigned artwork: full-bleed dark tile extended to fill the square, monogram shrunk to ~60–66% of canvas, gradient rim inset inside the ~80% safe zone. Not blind padding, not glyph-only.
- **D-04:** `apple-touch-icon.png` (180×180) bakes the same dark tile as maskable, opaque PNG (iOS flattens transparency to black).
- **D-05:** All PNGs frozen from favicon.svg's **light-scheme rendering** (tile `#1D1338→#0A0714`, rim `#8B63F5→#FFB86B`).
- **D-06:** PNGs rendered by the agent in a headless browser from SVG artworks, committed static. No rasterization tooling in repo (zero-new-deps).
- **D-07:** Each PNG shown to owner as embedded image at execution time for visual approval before commit.
- **D-08:** Manifest `theme_color` = `#1D1338`, frozen and pinned by static contract test. Published contract once installed.
- **D-09:** Manifest `background_color` = `#fbfaf8` (light `--bg` from tokens.css).
- **D-10:** `index.html` gets a single static `<meta name="theme-color" content="#1D1338">` (no light/dark media pair).
- **D-11:** iOS metas: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style: black-translucent`, `apple-mobile-web-app-title`, plus `apple-touch-icon` link. iOS splash matrix out of scope.
- **D-12:** `server.js` diff is exactly three touches: MIME map entry `.webmanifest: application/manifest+json`, `.webmanifest` into `COMPRESSIBLE`, extend `cacheControl()` no-cache branch to include manifest filename.
- **D-13:** Contract pinned twice: static contract test (MIME map + cacheControl branch + COMPRESSIBLE membership) + e2e live header check of `GET /manifest.webmanifest` (200, `application/manifest+json`, `no-cache`).
- **D-14:** CSP verify-only — `default-src 'self'` already covers manifest fetch and PNG loads; no CSP edit.

### the agent's Discretion
Execution mechanics of the headless-browser PNG rasterization (D-06) — approach recommended in Architecture Patterns.

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope. (Install banner = Phase 73; SW verification = Phase 74; iOS splash matrix = milestone boundary.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PWA-01 | Valid web app manifest served no-cache with correct MIME; correct fields; index.html head tags; D-06 favicon swap unaffected | Manifest field spec (below); server.js three-touch diff sites verified; head insertion site verified; favicon swap mechanism verified (`src/shell/layout.js:143`) |
| PWA-02 | Five PNG icons committed under `public/`: 192/512 `any`, 192/512 maskable (safe-zone redesign), 180 apple-touch-icon | Maskable safe-zone geometry (80% inner circle) documented; rasterization approach documented |
</phase_requirements>

## Summary

This phase is almost fully pre-decided: CONTEXT.md locks every design choice, and all the
phase's risk lives in exact repo facts — which have now been read and verified this session.
The manifest is a hand-written static JSON file; the icon set is five PNGs rasterized once
from `favicon.svg` and committed; the head integration is ~6 tags in `index.html`; the
server diff is three lines in verified locations. The only genuinely technical unknowns
were (a) the maskable-icon safe-zone geometry and (b) iOS/Chromium specifics around MIME,
transparency, and icon discovery — both documented below with high confidence.

**Primary recommendation:** Plan as four small tasks — manifest file, icon production
(with D-07 visual approval checkpoint per PNG), head tags, server diff + double-pinned
contract tests — with the existing `test/browser-push.test.mjs` pattern as the pinning
template.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Manifest file | Static assets (`public/`) | Static server (`server.js` MIME/no-cache) | Plain JSON copied verbatim by Vite; server only controls headers |
| Icon PNGs | Static assets (`public/`) | — | Rendered once, committed; never generated at runtime |
| Head tags | `index.html` (static) | — | Platform metas are read before any JS runs |
| Header contract | Static server (`server.js`) | Test suite | MIME/cacheControl are server-side concerns; pinned by tests |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| None (zero deps) | — | Hand-written manifest, committed PNGs, static head tags | Milestone standing constraint: zero new runtime/dev deps [VERIFIED: .planning/STATE.md:62-63] |
| Playwright (existing devDep) | ^1.64.1 | Headless-browser rasterization of SVG → PNG (D-06), e2e live header check | Already in devDependencies; e2e harness exists (`e2e/playwright.config.mjs`) [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:test (built-in) | node ≥24 | Static contract test, `browser-push.test.mjs` pattern | Pinning MIME map / cacheControl / manifest fields [VERIFIED: package.json engines, test/ layout] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Playwright rasterization (D-06) | sharp/resvg devDep | Violates zero-new-deps standing constraint — rejected by D-06 |
| `purpose: "any maskable"` combined | Separate files | Locked D-03: separate variants; combined purpose is widely considered an anti-pattern (same artwork rarely serves both) |

## Package Legitimacy Audit

No packages installed this phase (zero-new-deps standing constraint; D-06 explicitly
forbids rasterization tooling in the repo). Audit table empty by design.

## Architecture Patterns

### System Architecture Diagram

```
Browser / OS installer
        │  GET /manifest.webmanifest
        ▼
server.js static pipeline ── MIME map (add .webmanifest → application/manifest+json)
        │                    ── COMPRESSIBLE (add .webmanifest → gzip)
        │                    ── cacheControl() (no-cache branch += manifest.webmanifest)
        ▼
public/manifest.webmanifest ── references ──▶ icon-192.png, icon-512.png
        │                                     icon-maskable-192.png, icon-maskable-512.png
        │                                     apple-touch-icon.png
        ▼
index.html <head> ── <link rel="manifest"> ──▶ discovery by Chromium/Safari
                  ── <meta name="theme-color" content="#1D1338">
                  ── iOS metas (D-11) + <link rel="apple-touch-icon" href="/apple-touch-icon.png">
                  ── existing <link rel="icon" href="/favicon.svg"> (D-06 swap target — untouched)
```

Primary trace: browser requests manifest → server serves it with correct MIME + no-cache →
manifest JSON declares icons + colors → head tags let platforms discover it.

### Recommended Project Structure
```
public/
├── manifest.webmanifest     # NEW — hand-written JSON
├── icon-192.png             # NEW — purpose any
├── icon-512.png             # NEW — purpose any
├── icon-maskable-192.png    # NEW — purpose maskable
├── icon-maskable-512.png    # NEW — purpose maskable
├── apple-touch-icon.png     # NEW — 180×180 opaque
├── favicon.svg              # existing — artwork source, untouched
└── sw.js                    # existing — ZERO edits (forbidden-token test)
index.html                   # head tags added
server.js                    # 3-line diff (verified sites below)
test/manifest-contract.test.mjs   # NEW static contract test (or fold into an existing static test file — planner's call)
e2e/*.spec.mjs               # live header check (D-13)
```

### Pattern 1: Static contract test (repo precedent)
**What:** A node:test file that reads the source file as text and asserts exact substrings,
including byte-identical pins and forbidden-token regexes.
**When to use:** Pinning the three server.js touches and the manifest field values (D-13).
**Example (from the repo precedent):**
```js
// Source: test/browser-push.test.mjs:121-131 (verified this session)
const sw = source('public/sw.js');
assert.ok(!/\b(fetch|install|activate|import)\b/.test(sw),
  'sw.js must carry no fetch/install/activate/import token');
assert.ok(sw.includes('new URL('), '...');
```
Apply the same shape: assert `server.js` contains
`'.webmanifest': 'application/manifest+json'` in the MIME map, `.webmanifest` inside the
`COMPRESSIBLE` Set literal, and `manifest.webmanifest` inside `cacheControl()`'s no-cache
branch; assert manifest JSON `name === 'Projects Studio'`, `display === 'standalone'`,
`start_url === '/'`, `id === '/'`, `theme_color === '#1D1338'`, `background_color === '#fbfaf8'`, and the five icon entries.

### Pattern 2: Manifest field set (W3C spec, minimal-installable)
**Example:**
```json
// Source: W3C Web App Manifest spec + MDN (high-confidence standard knowledge)
{
  "name": "Projects Studio",
  "short_name": "Projects Studio",
  "id": "/",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "theme_color": "#1D1338",
  "background_color": "#fbfaf8",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```
Notes [ASSUMED — standard spec knowledge, well within cutoff stability]:
- `id` resolves relative to origin; `"/"` is the correct form for root deployments.
- `scope: "/"` is the default when omitted but pinning it is harmless and satisfies the
  frozen-contract success criterion.
- `purpose: "any"` is the default; being explicit satisfies PWA-02's contract-test pin.
- `apple-touch-icon` does NOT go in the manifest — iOS ignores manifest icons entirely and
  reads only the `<link rel="apple-touch-icon">` head tag.

### Pattern 3: Maskable icon safe-zone geometry
**What:** Per spec, launchers may mask a maskable icon to a circle inscribed in the square.
The guaranteed-safe zone is the inner 80% — a centered circle of radius 40% of icon size.
**Geometry for D-03:** keep all meaningful artwork (monogram, rim) inside a centered circle
of diameter ~80% of canvas (409.6 px on 512; 153.6 px on 192); extend the dark tile
background to the full square edges (it will be cropped by any mask shape).
**Sizing in the 152-unit viewBox:** the ~80% safe zone radius ≈ 60.8 units from center
(76,76) — the rim circle currently sits at radius ~75.25 (rect stroke at 0.75 inset), so
the maskable redesign must scale the whole monogram+rim group to ~60–66% of canvas as
locked in D-03. [VERIFIED geometry: favicon.svg rim rect `x=".75" y=".75" width="150.5" height="150.5"`; safe zone per W3C icon-maskable spec / web.dev maskable icon docs]

### Pattern 4: Headless-browser PNG rasterization (D-06)
**Recommended approach:** a throwaway script (run in-session, not committed) that loads an
SVG artwork page in Playwright's chromium, screenshots the element at each target size, and
writes the PNG. Two artwork variants needed:
1. **`any` icons (D-02):** favicon.svg rendered as-is — force light scheme (the SVG's
   `prefers-color-scheme` media query must resolve to light; default vars apply when no
   scheme is forced, so plain render gives the D-05 light values — verify on the
   screenshot, headless Chromium default is light).
2. **maskable + apple-touch (D-03/D-04):** a temporary SVG variant with the tile rect
   extended to full square (no `rx`, no rim-outside-canvas) and the monogram group scaled
   ~60–66%. Committing the variant SVG is optional — D-06 says no rasterization *tooling*
   lands; a committed maskable-source SVG alongside favicon.svg is fine but not required
   (planner's discretion).
PNGs are opaque (`background_color`-free; the tile itself fills the canvas) — check
alpha channel is fully opaque for apple-touch-icon per D-04.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SVG → PNG rasterization | Canvas manual pixel work | Playwright element screenshot (existing devDep) | Correct font/gradient/filter rendering; D-06 locked |
| MIME/header serving logic | New route for manifest | Existing static pipeline 3-line extension | D-12 locked; the pipeline already handles gzip/etag/HEAD |
| Header validation | Custom fetch scripts in tests | Playwright `request` API in e2e (D-13) | Harness exists (`e2e/playwright.config.mjs`, `e2e/server.mjs`) [VERIFIED: e2e/ listing] |

## Runtime State Inventory

Not a rename/migration phase — but one runtime-cached-contract warning applies and is
already locked in D-08: **once users install the standalone app, launchers cache the
`id`/`theme_color` pair.** The pinned hex `#1D1338` and `id: "/"` are a published contract
from day one. No other runtime state: no DB rows, no service config, no OS registrations,
no env vars, no build artifacts involved. Verified: manifest/icons don't exist yet
(`public/` contains only favicon/favicon-v4/logo-dark/logo-light/logo-v4/sw.js) [VERIFIED: ls public/] — no stale assets to migrate.

## Common Pitfalls

### Pitfall 1: Manifest served as octet-stream → Chromium rejects
**What goes wrong:** Without the MIME map entry, `.webmanifest` falls to the pipeline's
fallback and Chromium logs a manifest fetch error; installability silently breaks.
**Why it happens:** `MIME` map has no `.webmanifest` entry [VERIFIED: server.js:8023-8038 —
entries are html/js/mjs/css/json/map/svg/png/jpg/jpeg/webp/ico/woff2/txt only].
**How to avoid:** D-12's MIME line + the static contract test + e2e live check (D-13).
**Warning signs:** DevTools Application panel shows "Manifest: fetch error" / no-install.

### Pitfall 2: Maskable icon clipping
**What goes wrong:** Reusing the `any` artwork (rim at ~99% of canvas) as maskable —
circle masks crop the rim and monogram corners on Android.
**Why it happens:** Lazily padding the same file instead of the D-03 redesign.
**How to avoid:** Separate files (locked), monogram+rim inside ~80% safe zone, tile
full-bleed. Verify by viewing at circle-crop (maskable.app-style check) during D-07 review.
**Warning signs:** Owner review (D-07) is the checkpoint.

### Pitfall 3: Transparent apple-touch-icon turns black on iOS
**What goes wrong:** iOS flattens PNG transparency to black — any alpha in the artwork
ruins the home-screen icon.
**Why it happens:** Reusing a transparent-background render.
**How to avoid:** D-04 locked: bake the opaque dark tile; verify alpha channel is 100%.
**Warning signs:** alpha=0 pixels in PNG inspection during rasterization.

### Pitfall 4: Breaking the Phase 43 D-06 favicon swap
**What goes wrong:** New head tags accidentally disturb the `<link rel="icon">` element the
runtime swap targets, or a test pins index.html head shape too rigidly.
**Why it happens:** The swap code queries the existing icon link:
```js
// Source: src/shell/layout.js:139-143 (verified)
// idempotent; the per-surface fallback is /favicon.svg. URL comes solely from
if (link) link.href = api.workspace?.logo?.url || '/favicon.svg';
```
**How to avoid:** Add manifest/theme-color/apple-touch tags WITHOUT touching the existing
`<link rel="icon" ...>` line; do not add a second `rel="icon"` link. Success criterion 4
requires all existing favicon tests green — run the full unit suite.
**Warning signs:** `test/browser-push.test.mjs`-adjacent tests or any index.html pins red.

### Pitfall 5: sw.js forbidden-token blast radius
**What goes wrong:** Any edit to `public/sw.js` — even comments — trips the
`/\b(fetch|install|activate|import)\b/` forbidden-token test, which also matches comments
[VERIFIED: test/browser-push.test.mjs:128-130].
**How to avoid:** Zero sw.js edits (standing constraint + phase boundary). Not even
"helpful" cache hints.
**Warning signs:** `npm test` red on browser-push.

### Pitfall 6: theme-color media-query pair vs single meta
**What goes wrong:** Adding two `theme-color` metas with `media="(prefers-color-scheme…)"`
changes browser chrome color in dark mode — rejected by D-10.
**How to avoid:** Exactly one static `<meta name="theme-color" content="#1D1338">`.
**Warning signs:** grep for `theme-color` count === 1 in index.html.

### Pitfall 7: iOS caches apple-touch-icon aggressively
**What goes wrong:** Changing the artwork later may not propagate to already-installed iOS
home-screen icons without re-adding. Combined with D-08 this reinforces: get D-07 visual
approval right the first time; the committed PNGs are a published contract.
**How to avoid:** D-07 approval checkpoint before each commit [ASSUMED — widely documented iOS behavior].

## Code Examples

### Server diff (D-12) — exact verified sites
```js
// 1. MIME map — insert into the existing object literal
// Source: server.js:8023-8038 (verified; add after '.txt' or logical spot)
'.webmanifest': 'application/manifest+json',

// 2. COMPRESSIBLE — extend the Set literal
// Source: server.js:8039 (verified)
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.map', '.svg', '.txt', '.webmanifest']);

// 3. cacheControl() — extend the no-cache branch
// Source: server.js:8095-8099 (verified)
function cacheControl(file) {
  if (file.includes(`${path.sep}assets${path.sep}`)) return 'public, max-age=31536000, immutable';
  if (path.basename(file) === 'index.html' || path.basename(file) === 'sw.js') return 'no-cache';
  return 'public, max-age=3600';
}
// → condition becomes: basename is index.html, sw.js, or manifest.webmanifest
```

### Head tags (D-10/D-11) — insertion into verified head
```html
<!-- Source: index.html:3-18 (verified current head; insert after the favicon link) -->
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#1D1338" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Projects Studio" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```
Keep the existing `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` exactly as-is (Pitfall 4).

### e2e live header check (D-13)
```js
// Source: pattern — Playwright request API, config at e2e/playwright.config.mjs (verified)
const res = await request.get('/manifest.webmanifest');
// assert status 200, content-type application/manifest+json, cache-control no-cache
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SW with fetch handler required for install | Fetch handler no longer required | Chrome 108 (mobile) / 112 (desktop) | Existing sw.js satisfies installability with zero edits [VERIFIED: .planning/STATE.md:69-71] |
| One combined `any maskable` icon | Separate purpose-specific files | Best practice, web.dev guidance | Matches locked D-03 |
| Single `theme-color` | Media-query pairs common elsewhere | — | Rejected by D-10 (frozen single meta) |

**Deprecated/outdated:**
- `apple-mobile-web-app-capable` is technically legacy (Safari 17+ prefers `mobile-web-app-capable`) — D-11 locked the legacy name; harmless and universally supported [ASSUMED].

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Manifest field semantics (`id` resolves to origin, `scope` default `/`, explicit `purpose: "any"`) | Architecture Pattern 2 | Cosmetic — fields are pinned by the contract test anyway, so any surprise surfaces at test time |
| A2 | Maskable safe zone = inner 80% circle (radius 40% of size) | Pattern 3 | Wrong geometry → clipped icons; caught at D-07 owner review |
| A3 | iOS caches apple-touch-icon aggressively | Pitfall 7 | Only affects future icon changes, not this phase |
| A4 | Headless Chromium defaults to light color-scheme (so favicon.svg renders with light vars without forcing) | Pattern 4 | Wrong-scheme PNGs caught immediately at D-07 review |
| A5 | `apple-mobile-web-app-capable` legacy name still universally supported | State of the Art | None for this phase; iOS install still works |

## Open Questions

1. **Where does the live e2e header check live?**
   - What we know: D-13 mandates it; e2e/ harness exists with playwright.config.mjs and helpers.
   - What's unclear: new spec file vs. adding to an existing one.
   - Recommendation: new small spec (e.g. `e2e/manifest.spec.mjs`) — planner decides against existing harness conventions.

2. **Commit the maskable variant SVG as a source file?**
   - What we know: D-06 forbids rasterization tooling, not SVG sources; favicon.svg stays untouched.
   - Recommendation: commit `public/icon-maskable.svg`-style source for future re-rendering, or keep throwaway — either satisfies D-06; planner picks.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node ≥24 | tests, server | ✓ (engines pin; suite runs at 1737 pass baseline) | ≥24 | — |
| Playwright chromium | D-06 rasterization, D-13 e2e | ✓ (devDep ^1.64.1, existing e2e suite) | 1.64.x | — |
| Vite | public/ copy verbatim | ✓ | ^6.4.4 | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in) + Playwright ^1.64.1 |
| Config file | none needed for node:test (`test/*.test.mjs` glob); `e2e/playwright.config.mjs` for e2e |
| Quick run command | `node --test test/manifest-contract.test.mjs` (or the file the planner names) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PWA-01 | MIME map + COMPRESSIBLE + cacheControl no-cache contain .webmanifest/manifest | static contract | `node --test test/<manifest-contract>.test.mjs` | ❌ Wave 0 |
| PWA-01 | Manifest JSON fields frozen (name/display/start_url/id/theme_color/background_color/icons) | static contract (same file) | same | ❌ Wave 0 |
| PWA-01 | `GET /manifest.webmanifest` → 200, `application/manifest+json`, `no-cache` | e2e live | `npx playwright test --config e2e/playwright.config.mjs <manifest spec>` | ❌ Wave 0 |
| PWA-02 | Five PNGs exist at correct sizes under public/, referenced by manifest | static contract (same file; size check via PNG header bytes or file existence) | same | ❌ Wave 0 |
| SC-4 | favicon swap unaffected; all existing gates green | full unit suite | `npm test` | ✅ existing |

### Sampling Rate
- **Per task commit:** quick contract test
- **Per wave merge:** `npm test` (unit 1737 baseline + lint 16 pre-existing errors baseline must not grow)
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/manifest-contract.test.mjs` (name planner's choice) — covers PWA-01/PWA-02 static pins
- [ ] `e2e/manifest.spec.mjs` (or equivalent) — covers PWA-01 live headers
- [ ] Framework install: none needed

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | no | Static files; manifest JSON is authored, not user input |
| V14 Config (headers) | verify-only | CSP `default-src 'self'` already covers manifest + PNG self-origin loads (D-14) [VERIFIED: server.js:8042-8052] |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Serving manifest cross-origin / scope confusion | Elevation | `start_url`/`scope`/`id` frozen to `/` (locked); absolute manifest paths |
| MIME sniffing | Tampering | Existing `X-Content-Type-Options: nosniff` on all static responses [VERIFIED: server.js:8045] |

## Sources

### Primary (HIGH confidence — read this session)
- `server.js:8023-8039, 8042-8052, 8095-8099` — MIME map, COMPRESSIBLE, CSP, cacheControl (all diff sites verified verbatim)
- `public/favicon.svg` — full artwork read: viewBox 152×152, light/dark var blocks, rim rect at 0.75 inset, gradient stop values `#1D1338/#0A0714`, `#8B63F5/#FFB86B`
- `index.html:1-18` — current head, favicon link line 8, insertion site
- `src/styles/tokens.css:7,102,142` — `--bg: #fbfaf8` light / `#1a1a19` dark
- `test/browser-push.test.mjs:121-131` — forbidden-token pattern + byte-identical pin precedent
- `src/shell/layout.js:139-143` — D-06 favicon swap mechanism
- `.planning/STATE.md`, `.planning/REQUIREMENTS.md`, CONTEXT.md — locked decisions, standing constraints, baselines
- `package.json`, `e2e/` listing, `public/` listing — tooling and current assets

### Secondary (HIGH confidence — standard, stable)
- W3C Web App Manifest spec / MDN — manifest fields, `application/manifest+json`, maskable icon purpose
- web.dev maskable icon guidance — 80% safe zone (A2)

### Tertiary (LOW)
- None — all material findings are repo-verified or stable-spec.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero deps; only existing tools
- Architecture: HIGH — every diff site and head line read this session
- Pitfalls: HIGH — 1,2,4,5 repo-verified; 3,7 well-known platform behavior (A3)
- Manifest field semantics: MEDIUM — A1, stable spec knowledge, contract-test-pinned anyway

**Research date:** 2026-11-18
**Valid until:** 2026-12-18 (static spec work, slow-moving)
