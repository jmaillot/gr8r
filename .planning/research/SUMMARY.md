# Project Research Summary

**Project:** Projects Studio (repo gr8r) — Milestone v2.7: Installable App (PWA)
**Domain:** PWA installability for an existing zero-dependency Vite + Node 24 self-hosted SPA
**Researched:** 2026-11-18
**Confidence:** HIGH

## Executive Summary

This milestone makes an existing self-hosted PM SPA (Projects Studio) installable on desktop and mobile, and the research conclusion is unusually decisive: **the entire milestone requires zero new dependencies, zero new build machinery, and — critically — zero edits to `public/sw.js`**. The 2026 Chromium reality is that the service-worker-fetch-handler install requirement was removed (Chrome 108 mobile / 112 desktop), and the repo already ships a no-fetch-handler push SW at root scope (`/sw.js`, Phase 48/59), served `no-cache` by `server.js:8097`. That SW is already the install SW. The deliverable collapses to: a hand-written static manifest in `public/`, a one-time set of PNG icons rasterized from the existing brand SVGs, three `<head>` tags in `index.html`, and ~40–80 lines of `beforeinstallprompt` banner logic (the only real JS written).

The recommended approach mirrors what the repo already does: static files in `public/` (Vite copies verbatim, outside the bundle and the 500 kB chunk gate), contract-style static tests pinning manifest/SW shape (the `test/browser-push.test.mjs` precedent), lazy-imported banner UI riding the D-48-1 pattern, and EN+FR catalogue keys for every banner string (i18n gate). `vite-plugin-pwa`/Workbox are explicitly rejected — first-party precedent (59-RESEARCH) plus the zero-dependency constraint.

The dominant risks are all repo-internal, not platform: (1) touching sw.js breaks the pinned forbidden-token contract test and re-opens the T-48-02 cache-poisoning surface — so the plan must declare "zero sw.js edits" as a hard constraint; (2) a second SW registration or relative-path registration silently breaks push (the CR-02 class); (3) manifest `start_url`/`scope` mistakes with the multi-tenant `/w/:slug` routing strand users or push login flows — the answer is `start_url: "/"`, `scope: "/"`, `id: "/"`, frozen; (4) the ~2 kB entry headroom (498/500 kB) means banner logic must be minimal or lazy; (5) iOS never fires `beforeinstallprompt` — the banner must degrade honestly (manual "Share → Add to Home Screen" copy), never fake it.

## Key Findings

### Recommended Stack

Zero new dependencies is the deliverable. Everything added is either a static asset or ~100 lines of hand-written JS. No Vite plugin, no Workbox, no library.

**Core technologies:**
- `public/manifest.webmanifest` (hand-written static JSON) — the single install gate for every platform; lives outside the bundle, zero chunk-gate impact. Contents: `name: "Projects Studio"`, `short_name`, `display: "standalone"`, `start_url: "/"`, `scope: "/"`, `id: "/"` (frozen), `theme_color`/`background_color` (from default-theme CSS vars), 4 icon entries.
- PNG icon set in `public/` — `icon-{192,512}.png` (`any`), `icon-maskable-{192,512}.png` (separate files, padded safe zone), `apple-touch-icon.png` (180×180, for iOS). Rasterized once from `favicon.svg`/`logo-v4.svg`, committed as static files; not a build step.
- Existing `public/sw.js` — **unchanged**. No fetch handler is needed (and is forbidden by contract test); registration already exists at root scope via `registerSw()` in `src/core/push.js`.
- `beforeinstallprompt` banner (~40–80 lines, lazy chunk per D-48-1 pattern) — the only JS: capture event, show in-app banner, `prompt()` on click, suppress on `appinstalled`/dismissal (localStorage), hide when already standalone.

**⚠ Cross-file conflict resolved (roadmapper note):** STACK.md recommends adding `skipWaiting`/`clients.claim` lifecycle handlers and unconditional SW registration. ARCHITECTURE.md, FEATURES.md and PITFALLS.md all verified from repo source that `test/browser-push.test.mjs:124` forbids the tokens `fetch|install|activate|import` in sw.js (regex includes comments) and pins byte-identical substrings. **The repo-verified position wins: zero sw.js edits, registration stays as-is (boot + `enterApp`).** A no-cache SW with no fetch handler needs no lifecycle machinery. Registration is already effectively unconditional via `main.js`; at most, planning should *verify* the `push.js` gate, not rewire it.

### Expected Features

**Must have (table stakes):**
- Valid manifest linked from `index.html` (`<link rel="manifest">`) — gates every platform
- Icon set: 192+512 `any` + maskable variants + `apple-touch-icon` — Chromium hard requirement + iOS icon route
- `display: standalone` — the milestone's core goal
- SW registered at root scope — already done; verify, don't build
- Honest iOS degradation — manual install copy (EN+FR), never a fake prompt
- Honest Firefox-desktop degradation — no banner (install genuinely impossible)
- `theme-color` meta + iOS meta tags — static, zero bundle cost

**Should have (differentiators):**
- In-app install banner driven by `beforeinstallprompt` — the core UX of PWA-04 (don't rely on the omnibox icon)
- Standalone polish: verify no dead space where browser chrome was, status-bar theming on Android
- Optional server touch: extend the no-cache branch (`server.js:8097`) to the manifest filename

**Defer (v2+ or forever):**
- Manifest `shortcuts` (needs non-workspace-scoped route decision), `screenshots` (stale-asset maintenance)
- Safe-area/status-bar polish beyond `theme_color` (follow-up if standalone shows a regression)
- Anti-features per owner decision: offline caching / fetch handler, `share_target`, protocol handlers, WCO, startup images, second SW, push rework

### Architecture Approach

The one-SW-per-scope constraint resolves itself: the existing root-scope push SW is the install SW; a no-fetch-handler SW intercepts nothing and is a pass-through by absence. New surface is deliberately tiny: static assets in `public/`, one `<link>` + metas in `index.html`, a lazy banner module dispatched from a ~5-line `beforeinstallprompt` listener in `main.js`, and contract tests pinning manifest fields and the sw.js pass-through forever.

**Major components:**
1. **Static assets** (`manifest.webmanifest`, 5 PNGs) — install criteria satisfaction; never bundled, never hashed
2. **`index.html` head** — manifest link, `theme-color`, `apple-touch-icon`; zero bundle bytes
3. **Banner module** (lazy `import()` from main.js listener) — `beforeinstallprompt` capture, prompt, dismissal persistence, standalone/iOS/Firefox detection; strings via EN+FR catalogue
4. **Contract tests** (`test/pwa.test.mjs` + e2e spec) — manifest fields pinned, sw.js token ban re-asserted, banner behavior stub-tested (real `beforeinstallprompt` never fires in Playwright)

### Critical Pitfalls

1. **Extending sw.js breaks the pinned contract** — `test/browser-push.test.mjs` forbids `fetch|install|activate|import` tokens (even in comments) and pins byte-substrings. skipWaiting/claim on a pass-through SW is a footgun, not a need. Prevention: declare "zero sw.js edits" as a plan constraint; any sw.js diff is a STOP-and-justify event.
2. **Second SW / relative-path registration / scope collision** — one SW per scope; `register('sw.js')` from `/w/:slug/...` resolves to a bogus sub-scope and the `.catch(() => {})` swallows the failure (CR-02 class). Prevention: reuse `registerSw()` only; manifest `scope: "/"` must agree with SW scope.
3. **`start_url`/`scope` vs multi-tenant `/w/:slug`** — hardcoded slug or `/w` scope strands multi-workspace users and pushes login (`/login`, `/join`) outside app scope. Prevention: `start_url: "/"`, `scope: "/"`, `id: "/"` frozen and pinned by test.
4. **Icon mistakes** — missing maskable safe zone (clipped logo on Android), SVG-only (rejected by iOS/older Chromium), combined `any maskable` (shrunken appearance), and mixing workspace per-tenant logos (Phase 43 D-06) into the static manifest. Prevention: separate padded maskable PNGs; keep D-06 boundary; pin the icon block with a static test.
5. **The two build gates** — i18n gate fails the build on uncatalogued banner strings (EN+FR keys in the same commit); chunk gate has ~1.9 kB headroom, so banner logic must be lazy (entry delta target < 200 bytes).
6. **iOS honesty** — `beforeinstallprompt` never fires on iOS; detection must be feature-based (`'BeforeInstallPromptEvent' in window` + not standalone + iOS UA), not "no event after N seconds"; `apple-touch-icon` (PNG 180×180) is still the dependable iOS icon route.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Manifest, Icons & Head Integration (PWA-01 + PWA-02)
**Rationale:** Everything gates on the manifest; this phase is inert (static assets + head tags, zero JS, zero gate risk) and unblocks both the banner and all platform install paths.
**Delivers:** `public/manifest.webmanifest` (start_url/scope/id = `/`, frozen), 5 PNGs rasterized from brand SVGs (incl. padded maskable redesign), `index.html` manifest link + `theme-color` + `apple-touch-icon` + iOS metas, optional no-cache server extension for the manifest, static contract test pinning manifest fields (`test/pwa.test.mjs`).
**Addresses:** Table stakes (manifest, icons, head links) from FEATURES.md.
**Avoids:** Pitfalls 3 (start_url/scope), 4 (icons/D-06), 8 (theme colors), 9 (CSP/Content-Type), 11 (id churn).

### Phase 2: Install Banner (PWA-04)
**Rationale:** The only real JS surface; depends on Phase 1's manifest being correct (an incomplete manifest = no `beforeinstallprompt` = silent graceful failure, which is why it comes second).
**Delivers:** `beforeinstallprompt` listener in `main.js` (lazy chunk per D-48-1), banner UI with Chromium prompt flow, iOS manual-install copy, Firefox honest no-op, standalone suppression, dismissal persistence; EN+FR catalogue keys; stubbed-event e2e (EN + FR); chunk-gate re-run (entry delta < 200 bytes).
**Addresses:** Differentiator banner + honest degradation table stakes from FEATURES.md.
**Avoids:** Pitfalls 5 (i18n/chunk gates), 6 (iOS false positives), 10 (Playwright traps), 12/13 (dev double registration, SSO/mobile-band in standalone — UAT checklist).

### Phase 3: SW Verification & End-to-End Verification (PWA-03, largely verification)
**Rationale:** PWA-03 is a *verification* task, not a build task — the SW already satisfies install criteria. Keeping it as a final gate phase prevents any temptation to "improve" sw.js and consolidates acceptance.
**Delivers:** Verification that registration exists on all boot paths (boot + `enterApp`), one `serviceWorker.register` call site, root scope controlled; Permissions-Policy `notifications` not denied (P14); headers pin test (sw.js/manifest no-cache); docs/DEPLOY.md section (root-only deployment constraint, iOS limitations, standalone no-back-button stance); real-device install UAT (desktop Chrome + Android; iOS documented no-op).
**Addresses:** SW table stake (verify-only) + acceptance verification.
**Avoids:** Pitfalls 1 (sw.js edits), 2 (registration race), 3 (demo-mode banner absence).

### Phase Ordering Rationale

- **Assets before JS:** Phase 1 is unbreakable (static files) and every other deliverable gates on it; Phase 2 is the only bundle-touching work and must follow so the manifest exists when the event fires.
- **PWA-03 as verification, not construction:** 3 of 4 research files independently conclude the SW needs zero edits; folding it last as a verification phase makes "don't touch sw.js" structural rather than aspirational.
- **The back-navigation product decision** (standalone windows have no back button; Pitfall 4/7) is a milestone-discussion item, not a phase discovery — surface it before Phase 2 planning.
- **Subpath deployment stance** (root-only vs relative manifest paths, Pitfall 9) is a milestone-level decision to settle during requirements, not mid-phase.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (banner):** moderate — the banner logic is well-understood, but the i18n/chunk-gate interaction, the dismissal-persistence UX, and the iOS/Firefox detection matrix deserve a careful plan (patterns are fully documented in research; `--research-phase` optional).

Phases with standard patterns (skip research-phase):
- **Phase 1 (manifest/icons):** all decisions made and pinned in this research; follow ARCHITECTURE.md's component map verbatim.
- **Phase 3 (SW verification):** pure verification against existing contracts; no new patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Chromium criteria cross-checked (web.dev, MDN, W3C TR, Chrome devrel); repo integration points read from source |
| Features | HIGH | Per-platform matrix consistent across Chrome devrel, MDN, Apple docs, community refs |
| Architecture | HIGH | Every claim grep/read-verified against this repo (sw.js, push.js, server.js, tests, prior milestone artifacts) |
| Pitfalls | HIGH | Repo-verified with file:line evidence; platform semantics spec-level stable |

**Overall confidence:** HIGH

### Gaps to Address

- **sw.js lifecycle handlers (STACK.md vs repo contract):** resolved in favor of zero edits (3-of-4 repo-verified consensus + forbidden-token test). If a future milestone wants skipWaiting/claim, it must consciously rewrite `test/browser-push.test.mjs` — out of scope here.
- **Manifest filename:** `.json` (STACK.md) vs `.webmanifest` (ARCHITECTURE/FEATURES). Either works; recommend `.webmanifest` + `application/manifest+json` for the canonical MIME (one server.js mime-map line). Decide once in planning.
- **iOS manifest-icon supersession boundary:** the exact iOS version where manifest icons fully replace `apple-touch-icon` was not independently verified — moot, since shipping `apple-touch-icon` is the dependable route regardless.
- **Standalone back-navigation stance:** product decision (accept + document vs in-app affordance using v1.5 history mirroring) — settle in milestone discussion before Phase 2.
- **Subpath deployment support:** root-only (consistent with existing `/sw.js` + `/w/:slug` assumptions) vs relative manifest paths — decide once in planning, document in DEPLOY.md.
- **Real-device UAT:** native install dialogs and iOS Add-to-Home-Screen cannot be automated; manual UAT on desktop Chrome + Android + iOS is a required acceptance step.

## Sources

### Primary (HIGH confidence)
- developer.chrome.com — "Revisiting Chrome's installability criteria" (fetch-handler removal: Chrome 108/112)
- web.dev — install criteria, installation-prompt lifecycle, engagement heuristics
- MDN — Making PWAs installable, manifest `icons`/`display` reference, maskable safe-zone guidance
- W3C Web Application Manifest TR (2026-10) — `purpose` token semantics
- Apple support + Safari Web Content docs — Add to Home Screen, `apple-touch-icon`, iOS standalone meta
- Repo source (verified locally): `public/sw.js`, `src/core/push.js:141-172`, `src/main.js:90-140`, `server.js:8040-8097`, `index.html`, `vite.config.js`, `test/browser-push.test.mjs`, Phase 48/59 milestone artifacts, Phase 43 D-06

### Secondary (MEDIUM-HIGH confidence)
- progressivewebapps.com / openpwa.net (2026) — per-browser install matrix (Safari/iOS 26 no criteria, Firefox 143 Windows web apps, no `beforeinstallprompt` on Firefox/iOS)

---
*Research completed: 2026-11-18*
*Ready for roadmap: yes*
