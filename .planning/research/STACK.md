# Stack Research — PWA Installability (v2.7 Installable App)

**Domain:** PWA installability for an existing zero-dependency Vite + Node 24 self-hosted app
**Researched:** 2026-11-18
**Confidence:** HIGH (Chromium criteria cross-checked across web.dev, MDN, Chrome for Developers and a Sept-2026 browser survey; repo integration points read from source)

## Executive verdict

**The entire milestone needs ZERO new dependencies and almost zero new build machinery.** The
critical 2026 finding: **Chromium no longer requires a service worker with a fetch handler to
install** — the fetch-handler requirement was removed in Chrome 108 (Android) / 112 (desktop),
and current Chromium source has no SW check in the promotion pipeline at all (a registered SW
*is* still the safest bet for the `beforeinstallprompt` heuristic and for older Android
Chromium — and this repo **already registers one** at `/sw.js`). So the deliverable collapses to:

1. a hand-written `public/manifest.json` (static file, never enters the bundle),
2. PNG icons generated from `public/favicon.svg` (raster export is a one-time asset job, not code),
3. reusing the **existing** `sw.js` + its existing `/sw.js` registration in `src/core/push.js`,
4. ~1–2 kB of install-hint code listening for `beforeinstallprompt`.

Nothing touches the 500 kB chunk gate: manifest, icons and sw.js are static `public/` assets
copied verbatim by Vite; the only JS added is the banner logic (see chunk-gate section).

---

## Browser install criteria, verified current for 2026

### Chrome / Edge / Samsung Internet (Chromium)

| Criterion | Detail (2026) |
|---|---|
| Secure context | HTTPS (localhost exempt) |
| Manifest linked | `<link rel="manifest">` on the page; parses cleanly |
| `name` **or** `short_name` | Either satisfies |
| `icons` | A **192×192 and a 512×512** entry for promotion; install dialog needs one icon ≥144 px in PNG/SVG/WebP with `sizes` declared. Both sizes checked — one 512 alone fails. `sizes` uses lowercase `x` |
| `start_url` | Must be inside scope and return a document |
| `display` | `standalone`, `fullscreen` or `minimal-ui` (or a `display_override` entry resolving to one). `browser` = never installable |
| `prefer_related_applications` | Absent or `false` |
| **Service worker** | **NOT required** since Chrome 108 (mobile) / 112 (desktop) for menu installs; the `beforeinstallprompt` heuristic no longer gates on a fetch handler in current Chromium. **Keep a registered no-cache SW anyway** (older Android Chromium, belt-and-braces for the prompt heuristic — and it already exists here) |
| Engagement heuristics | User has tapped the page at some point + ~30 s viewed (cumulative, any session); Chrome delays `beforeinstallprompt` until these are met — "DevTools says installable but no event yet" is expected behavior |
| Not already installed | Per profile |

Chrome's own promo UI is rate-limited (90 days after dismissal on Android, 7 days after
ignore; ML classifier on Android); **`beforeinstallprompt` itself is not rate-limited** — your
in-app banner is the reliable surface, which is exactly PWA-04.

Debug authority: DevTools → Application → Manifest → Installability (Lighthouse's PWA category
is retired — do not chase it).

### Safari / iOS / iPadOS

- **No installability criteria at all.** Since iOS/iPadOS 26, *every* site added via
  Share → Add to Home Screen opens as a web app by default; macOS Add to Dock works for any site.
- **`beforeinstallprompt` is never fired on iOS — not supported, not "coming".** The honest
  degradation path is: either show nothing, or show a static instruction hint ("Share → Add to
  Home Screen" / FR "Partager → Sur l'écran d'accueil") when iOS Safari is detected. Decide
  which in the phase plan; research recommends the static hint (it is honest and cheap).
- iOS ignores `display` for install gating but **honors `display: standalone` at launch** and
  uses the manifest name/icons. **`apple-touch-icon` (180×180 PNG) is still required** — iOS
  does not read the manifest `icons` for the home-screen icon reliably (it does since iOS 15+
  in many cases, but the `apple-touch-icon` link remains the dependable route).
- `theme-color` meta is honored in recent Safari standalone tabs.
- Startup images (`apple-touch-startup-image`) are unnecessary on modern iOS — skip them.

### Firefox

- **Never fires `beforeinstallprompt`.** No custom in-app banner is possible.
- Android: installs manifest-based apps as home-screen shortcuts (HTTPS, display ≠ browser,
  an icon ≥192 px).
- Desktop: Firefox 143+ (Sept 2025) can pin a site as a Windows taskbar web app — manifest
  driven, no criteria published, no prompt API. No code needed from us; the manifest is the
  whole integration.

---

## Recommended stack additions

### Core (everything)

| Technology | Version | Purpose | Why |
|---|---|---|---|
| `public/manifest.json` (hand-written) | — | Web app manifest | Static JSON in `public/` is copied verbatim by Vite, never hashed, never bundled, zero chunk-gate impact. No plugin needed — there is no dynamic content in a manifest |
| `public/icon-192.png`, `icon-512.png`, `icon-192-maskable.png`, `icon-512-maskable.png`, `apple-touch-icon.png` (180) | — | Icon set | Chromium checks 192+512 explicitly; separate maskable files (see icon section); 180 PNG for iOS. All rasterized once from `public/favicon.svg` |
| `public/sw.js` (existing, unchanged semantics) | — | Pass-through SW | Already exists (Phase 48 push click-router), already registered at `/sw.js`, already served `no-cache` by `server.js:8097`. **Has no fetch handler by deliberate T-48-02 decision — which is fine for installability in 2026** |
| Install-hint module (~1–2 kB, new) | — | `beforeinstallprompt` banner | The only real JS written this milestone |

### Supporting: nothing

No library, dev dependency, or Vite plugin is warranted. See "What NOT to Use".

## Recommended manifest (exact members and values)

```json
{
  "id": "/",
  "name": "Projects Studio",
  "short_name": "Projects",
  "description": "A calm, structured project management workspace.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#…existing app background…",
  "theme_color": "#…existing brand color…",
  "icons": [
    { "src": "/icon-192.png",          "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png",          "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-192-maskable.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Member-by-member rationale:

- **`id: "/"`** — permanent app identity, resolved against the start_url origin. Fix it now so
  a future `start_url` change doesn't silently create a second installed app. (HIGH confidence.)
- **`start_url: "/"` + `scope: "/"`** — the app is multi-tenant (`/w/:slug/…`), so the only
  scope-safe start URL is `/` (existing boot flow already redirects to the last workspace).
  Root-relative paths; relative URLs resolve against the manifest URL, absolute paths avoid
  all ambiguity.
- **`display: "standalone"`** — the milestone goal; one of the three Chromium-accepted values.
  Do not use `window-controls-overlay` in `display` (ignored/blocks install) — it would go in
  `display_override`, which this app doesn't need.
- **`short_name`** — Chromium prepends `short_name`/`name` to the standalone window title
  (anti-disguise measure); don't repeat the app name in `<title>`.
- **Separate `any` and `maskable` files** — `"purpose": "any maskable"` on one padded file is
  valid syntax but makes the padded image look shrunken in unmasked contexts. Ship separate
  files (W3C spec + manifest-cheatsheet guidance).
- **No `shortcuts`, `screenshots`, `prefer_related_applications`, `lang`, `dir`** — optional;
  shortcuts/screenshots are richer-UI polish that can come later. `prefer_related_applications`
  is simply absent (absent == false).

### Icon set (PWA-02)

| File | Size | Purpose | Notes |
|---|---|---|---|
| `icon-192.png` | 192×192 | `any` | Chromium hard requirement |
| `icon-512.png` | 512×512 | `any` | Chromium hard requirement |
| `icon-192-maskable.png` | 192×192 | `maskable` | Opaque full-bleed background; logo inside the central 80% circle (safe zone) |
| `icon-512-maskable.png` | 512×512 | `maskable` | Same design rule |
| `apple-touch-icon.png` | 180×180 | — (link tag) | iOS home-screen icon; no transparency quirks to manage (iOS flattens anyway) — opaque background recommended |

All rasterized once from the existing `public/favicon.svg` (source of truth stays the SVG;
PNGs are build-time-generated assets checked into `public/`, e.g. via a one-off `sharp`/
`rsvg-convert` run — **not** a build step, to keep zero dev dependencies). The maskable variant
needs a padded redesign of the mark (favicon is almost certainly not safe-zone-aware), so the
icon job includes a maskable-specific layout, not blind padding.

`type` always declared; `sizes` lowercase `x`. No SVG in the manifest `icons` (Chromium supports
it but raster fallback is required anyway — PNG-only is simpler and universal).

## Service worker: what a no-cache SW needs (PWA-03)

**Good news: the existing `public/sw.js` is already the correct shape.** It has no fetch
handler (T-48-02 — structurally eliminates the cache-poisoning surface), holds push +
notificationclick handlers, and `server.js:8097` serves it `no-cache`. In 2026 this SW:

- does **not** block install (no fetch-handler requirement anymore),
- does **not** intercept any request → app stays strictly online,
- satisfies the "registered SW" belt-and-braces for older Android Chromium and the
  `beforeinstallprompt` heuristic.

Two things to add/decide:

1. **Lifecycle handlers — deliberate, small deviation from the T-48-02 comment.** The current
   SW deliberately omits `install`/`activate` handlers. For a *no-cache* SW this is the one
   place the omission bites: without `skipWaiting`, a new sw.js version waits for every tab
   to close before activating, so a push-handler fix can lag days. Add:

   ```js
   self.addEventListener('install', () => self.skipWaiting());
   self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
   ```

   These are safe precisely because there is no fetch handler — `clients.claim()` cannot
   change how any page load is served. Document the amendment to the Phase 48 comment.
2. **Registration — move to unconditional.** `src/core/push.js` registers `/sw.js` only when
   `api.enabled`. For installability the SW must register in all server deployments regardless
   of push enabled-state (and `chrome://web-apk`/WebAPK creation on Android keys off the SW
   controlling `start_url`). Shape:

   ```js
   if ('serviceWorker' in navigator) {
     window.addEventListener('load', () => {
       navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
     });
   }
   ```

   Recommend a tiny `src/core/pwa.js` owning: unconditional registration + updatecheck via
   `registration.update()` on `visibilitychange`/`pageshow` (browsers already auto-check on
   navigations and push events — an explicit update call is optional polish), +
   `beforeinstallprompt`/`appinstalled` banner logic. `push.js` keeps `getRegistration()` and
   drops its own register (or keeps it — registration is idempotent same-scope).

**Update lifecycle honesty:** with no precache and no runtime caching there is literally
nothing to invalidate — a new deploy is picked up by the next navigation. `sw.js` served
`no-cache` (already true) + skipWaiting/claim = the whole update story. No update toast needed;
the app is online-first by construction.

### Registration timing note

Registering on `window.load` (not immediately at module eval) avoids competing with the
initial render and the Vite chunk fetch — this matters with ~2 kB of entry headroom.

## Install hint banner (PWA-04) — code shape

```js
// src/core/pwa.js (excerpt)
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  if (installedOrDismissedRecently()) return;      // localStorage, 90-day mirror of Chrome's rule
  if (matchMedia('(display-mode: standalone)').matches) return;
  deferredPrompt = e;
  showInstallHint();                                // small UI affordance, EN+FR i18n keys
});

hintButton?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;   // 'accepted' | 'dismissed'
  deferredPrompt = null;
  if (outcome === 'dismissed') storeDismissal();          // suppress ~90 days
  hideInstallHint();
});

window.addEventListener('appinstalled', () => {         // fires for ALL install paths
  deferredPrompt = null;
  hideInstallHint();
});
```

- `beforeinstallprompt` fires on Chrome/Edge/Samsung Internet **only**; Firefox and iOS never
  fire it → those platforms get the honest no-op (iOS optionally gets the static
  "Share → Add to Home Screen" hint, and only when NOT already standalone).
- Standalone detection: `matchMedia('(display-mode: standalone)')` + `navigator.standalone`
  (iOS). Installed apps must never see their own install banner.
- **i18n gate applies**: every banner string gets EN+FR catalogue keys (i18n-scan will fail
  otherwise). Small key count (~3–5).
- Chrome delays the event behind engagement heuristics — for a daily-use self-hosted tool that
  resolves within a session or two; no workaround exists or is needed.

## index.html changes (exact)

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#…brand…" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
```

Existing `<link rel="icon" … /favicon.svg">` stays. Every page must reference the manifest —
this is a SPA with one `index.html`, so one tag suffices. Optional: `"dark mode" media-scoped
theme-color` — defer; one color is fine for v2.7.

## server.js / mime consideration

Check the static mime map: if the server serves `.json` as `application/json`, that works for
`manifest.json` (Chrome does not require `application/manifest+json`; it sniffs). If you
prefer the `.webmanifest` extension + canonical MIME, add one map entry
(`application/manifest+json`). Either is correct — pick `.json` for zero server change unless
a test wants the canonical type.

## Chunk-gate impact (the ~2 kB headroom)

- `manifest.json`, all PNGs, `sw.js`: **static `public/` files — copied verbatim, never
  hashed, never enter the JS bundle or the `.vite/manifest.json` hash** that the e2e
  staleness guard reads. Zero gate impact. (Do NOT let any Vite plugin inject/transform the
  manifest — see What NOT to Use.)
- New JS: keep install-banner logic inside one small module imported by the existing boot
  (not a new lazy chunk, not its own route chunk). Estimated <1.5 kB minified — within the
  498→500 kB headroom, but **verify with the chunk-gate report in the phase**; if it nudges
  the entry over, fold the listener block into an existing always-loaded module (e.g.
  `src/core/` next to `push.js`) rather than splitting a new chunk.
- The `skipWaiting`/`claim` addition to sw.js is ~120 bytes of static file — irrelevant to the
  gate.

## Integration points (verified in repo)

| Point | File | Status |
|---|---|---|
| SW source | `public/sw.js` | Exists; add 2 lifecycle listeners only |
| SW registration | `src/core/push.js:163` (`register('/sw.js')`, gated on `api.enabled`) | Make unconditional / relocate to `src/core/pwa.js` |
| SW serving | `server.js:8097` — `sw.js` already `no-cache` | No change |
| Static assets | `public/` (Vite copies verbatim) | Add manifest + 5 PNGs |
| HTML head | `index.html` | Add 3 tags |
| Brand mark | `public/favicon.svg` (+ `favicon-v4.svg`, `logo-*.svg`) | Rasterize + maskable redesign |
| i18n | `src/locales/` + `scripts/i18n-scan.mjs` gate | Add banner keys EN+FR |
| CSP | `server.js` securityHeaders | Worker registration is same-origin; verify `worker-src`/`script-src` allows `'self'` workers (should already, given push shipped) |

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|---|---|---|
| Hand-written `public/manifest.json` | **vite-plugin-pwa** | Adds a dev dependency (violates the standing zero-dependency constraint), generates a *hashed* SW and injects Workbox precache/runtime caching — the exact thing the milestone forbids — and writes the manifest through the bundler, entangling it with the chunk-gate machinery. The manifest is 20 static lines; a plugin is pure overhead here |
| Bare `navigator.serviceWorker.register` | **Workbox / workbox-window** | Runtime caching is explicitly out of scope; a no-cache SW needs zero abstractions. Workbox would also be a dependency |
| Reuse existing `public/sw.js` | New dedicated `sw-pwa.js` | Two SW registrations can't share the top-level scope — the push SW already owns `/`; a second worker would need a sub-scope and would double the surface for zero benefit. One SW with push + install-support listeners is the correct shape (and matches how push shipped in Phase 48) |
| PNG icons in `public/` | SVG-only manifest icons | Chromium accepts SVG icons, but a raster fallback is required for correctness elsewhere anyway, and SVG install icons freeze at install time. PNG-only is simpler and universally consumed |
| `"purpose": "any maskable"` combined icons | Separate files | Combined padded icons look shrunken wherever the mask isn't applied; spec-adjacent guidance and every 2026 reference recommend separate files |
| Optional: `registration.update()` on visibility | Browsers' automatic update checks | Navigations + push events already trigger SW update checks; explicit calls are optional polish, not required for a no-cache SW |

## What NOT to Use

| Avoid | Why | Use Instead |
|---|---|---|
| vite-plugin-pwa | Dev dependency + Workbox precache injection (forbidden) + manifest-through-bundler coupling | Hand-written `public/manifest.json` |
| workbox-* (any package) | Runtime caching is explicitly out of scope; the SW must stay a pass-through | Bare SW lifecycle listeners |
| A fetch handler "just to satisfy old install rules" | 2026 Chromium doesn't require it; reintroduces a network interception surface (T-48-02 violation) for zero gain | No fetch handler; existing push-only SW |
| `purpose: "any maskable"` single icons | Shrunken appearance in unmasked contexts | Separate `any` + `maskable` files |
| `display: "window-controls-overlay"` (in `display`) | Chromium ignores it and won't install | `"display": "standalone"` |
| `apple-touch-startup-image` | Unnecessary on modern iOS; image-set maintenance burden | Skip |
| Lighthouse PWA audits as CI gate | Category retired by Chrome; checks a different list than runtime | DevTools Application → Manifest → Installability; optionally `Page.getInstallabilityErrors` via CDP in Playwright |
| Caching `manifest.json`/icons long-term | Icon/manifest staleness after deploy mirrors the dist-staleness bug class the project already guards against | Same `no-cache`/short cache policy as `index.html` (verify server static cache headers for the new files) |

## Version Compatibility

| Component | Compatible With | Notes |
|---|---|---|
| Existing `sw.js` (no fetch handler) | Chrome 108+/112+, Edge, Samsung Internet | Installable since those floors; before 108/112 a fetch handler was required — irrelevant for a self-hosted app in 2026 |
| `skipWaiting`/`clients.claim` | All browsers with SW | Safe here only because no fetch handler exists |
| `beforeinstallprompt` | Chromium family only | Never Firefox, never iOS — by design |
| iOS 26 standalone launch | Any site | Manifest refines (name, standalone), `apple-touch-icon` still the dependable icon route |
| Firefox 143+ desktop web apps | Windows | Manifest-driven, no API, no code needed |

## Installation

```bash
# Nothing to install. Zero dependencies is the deliverable.
# Icons are a one-time rasterization from public/favicon.svg (any local tool),
# committed as static files.
```

## Sources

- developer.chrome.com — "Revisiting Chrome's installability criteria" (SW requirement removed: Chrome 108 mobile / 112 desktop; default offline page for installed apps) — HIGH
- web.dev/articles/install-criteria + web.dev/learn/pwa/installation (current criteria list, no SW mention; engagement heuristics) — HIGH
- MDN — Making PWAs installable; Manifest `icons`/`display` reference; Define app icons (maskable safe-zone guidance) — HIGH
- W3C Web Application Manifest TR (2026-10) — `purpose` token semantics (`any`/`maskable`/`monochrome`), member list — HIGH
- progressivewebapps.com/fundamentals/installability (2026-09) + openpwa.net installability-criteria (2026-06) — per-browser 2026 matrix: Safari/iOS 26 no criteria, Firefox 143 Windows web apps, BIP never fires on either — MEDIUM-HIGH (consistent with primary sources)
- Repo source: `public/sw.js`, `src/core/push.js`, `server.js:8097`, `index.html`, `vite.config.js` — verified integration points, HIGH
- Not independently verified: exact iOS version boundary where manifest icons fully supersede `apple-touch-icon` (kept `apple-touch-icon` as the dependable route regardless)

---
*Stack research for: Projects Studio v2.7 — Installable App (PWA)*
*Researched: 2026-11-18*
