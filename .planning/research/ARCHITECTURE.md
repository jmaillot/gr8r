# Architecture Patterns — PWA Installability (v2.7)

**Domain:** PWA install support for an existing self-hosted SPA (Projects Studio, repo gr8r)
**Researched:** 2026-11-18
**Mode:** Ecosystem / integration-focused (subsequent milestone)
**Overall confidence:** HIGH — every claim below was verified by grep/read against this repo, not assumed.

## Verified repo facts (the questions the milestone asked)

| Question | Verified answer (evidence) |
|---|---|
| Does a push service worker already exist? | **YES.** `public/sw.js` (48 lines, Phase 48 + extended by Phase 59): `notificationclick` router + `push` handler. Comment at line 2 states the contract: *"Deliberately MINIMAL: no network-interception handler, no lifecycle handlers, no caching, no module references (T-48-02)"*. |
| Where is it registered? | `src/core/push.js:161` — `registerSw()` exports `navigator.serviceWorker.register('/sw.js').catch(() => {})`, gated on `'serviceWorker' in navigator && api.enabled`. Fired from `main.js` on `load` (lazy `import('./core/push.js')`, D-48-1) **and** re-fired from `enterApp()` on every SPA login (CR-02 fix). |
| SW scope? | **Root `/`** — the registration URL is absolute `'/sw.js'` (main.js comment: "Absolute '/sw.js' scope only — a relative URL from a routed deep link would register a bogus sub-scope (Pitfall 1)"). Root scope covers `/w/:slug/...`, `/join`, and the demo path automatically. |
| Server caching for sw.js? | `server.js:8097` — `if (basename === 'index.html' || basename === 'sw.js') return 'no-cache'`. |
| Static contract tests on sw.js? | `test/browser-push.test.mjs:124` asserts sw.js contains **NO** `\b(fetch\|install\|activate\|import)\b` token (regex includes comments) and pins exact substrings (`u.origin === self.location.origin`, `openWindow(url)`, the `new URL(...)` click lines) byte-identical. Also a full behavioral harness stubbing `self` (`new Function('self', source('public/sw.js'))`). |
| CSP today? | `server.js:8048-8049`: `default-src 'self'; script-src 'self'; ... img-src 'self' data:; connect-src 'self'`. No `manifest-src` directive → falls back to `default-src 'self'`. |
| Any existing manifest reference? | **None.** Grep for `manifest` in `index.html`, `src/main.js`, `server.js` (static-serve paths): zero hits. `<link rel=manifest>` does not exist yet. |
| public/ contents? | `favicon.svg`, `favicon-v4.svg`, `logo-{dark,light,v4}.svg`, `sw.js`. No PNGs yet (PWA-02 must add them). |
| Demo path? | Demo is same-origin (seeded workspace through the same server/SPA; `e2e/demo.playwright.config.mjs`, `demo-locale.spec.mjs`). No separate origin or subpath → root SW scope covers it; no per-path SW thinking needed. |

---

## Recommended Architecture

**The one-SW-per-scope constraint resolves itself:** there is exactly one SW at scope `/` and there must stay exactly one. The existing push SW **is already the install SW** — a service worker with no `fetch` handler intercepts nothing and is a perfect pass-through (network-first by absence, not by code). PWA-03 requires **zero new SW code**. Do not create `sw-install.js`; do not add a second registration.

### Component map (new vs modified)

| File | New/Modified | Change |
|---|---|---|
| `public/manifest.webmanifest` | **NEW** | Static manifest: `name: "Projects Studio"`, `short_name`, `display: "standalone"`, `start_url: "/"`, `scope: "/"`, `theme_color`, `background_color`, `icons[]` (192/512 regular + 192/512 `purpose: "maskable"`). Lives in `public/` → Vite copies it verbatim to `dist/`. **No plugin.** |
| `public/icons/icon-{192,512}.png`, `icon-maskable-{192,512}.png` | **NEW** | PWA-02. Committed PNGs derived from the brand mark (generated once offline, e.g. from `logo-v4.svg`), not build-generated — keeps the zero-dependency constraint. |
| `index.html` | **MODIFIED** (1 line + 1 meta) | `<link rel="manifest" href="/manifest.webmanifest" />` + `<meta name="theme-color" content="...">`. Zero bundle cost — index.html is outside the chunk gate. |
| `src/main.js` | **MODIFIED** (~10 lines) | One `beforeinstallprompt` listener: `e.preventDefault()` + stash the event in a module/`S.ui` flag + dispatch an app event. Banner render rides the existing render cycle. If any real logic is needed, mirror the D-48-1 pattern: lazy `import()` so the entry pays ~nothing of the 2 kB headroom. |
| `src/locales/en.json`, `src/locales/fr.json` | **MODIFIED** | New keys under `settings.*` (e.g. `settings.install.title`, `settings.install.hint`, `settings.install.action`) — the i18n-scan gate will enforce them. |
| Settings UI (`src/pages/settings.js` or the install hint component) | **MODIFIED** | Banner section rendered only when `beforeinstallprompt` has fired (Chrome/Edge/Android desktop+mobile). iOS/Safari: event never fires → honest no-op, no banner, no fake button. |
| `server.js` | **MODIFIED** (1 line, optional) | Extend the no-cache list at `:8097` with `manifest.webmanifest` (staleness of manifest names/icons is annoying in practice; the file is ~1 kB). Not strictly required but cheap. |
| `public/sw.js` | **UNCHANGED** | Zero edits. The static contract tests stay byte-green. |
| `test/browser-push.test.mjs` | **UNCHANGED** | Existing sw.js assertions unaffected because sw.js is untouched. |
| `test/` (new, e.g. `test/pwa.test.mjs`) + `e2e/` (new spec) | **NEW** | Static manifest contract tests + Playwright assertions (below). |
| `docs/DEPLOY.md` | **MODIFIED** | Short §: manifest/SW behavior, what install requires (HTTPS already true behind Traefik), iOS limitations. |

### Data flow

```
public/manifest.webmanifest ──(Vite copies verbatim)──▶ dist/
index.html <link rel="manifest"> ──▶ browser fetches manifest (same-origin, CSP default-src 'self' ✓)
src/main.js  ──load──▶ push.js registerSw() ──▶ /sw.js @ scope '/' (ALREADY EXISTS — no change)
window 'beforeinstallprompt' ──▶ main.js stashes event ──▶ render ──▶ banner in Settings
Banner click ──▶ stashedEvent.prompt() ──▶ native install dialog
```

### Why manifest in `public/` and not a Vite plugin

- The established pattern for non-bundled statics is `public/` (sw.js, favicons, logos). Vite copies it byte-identically; no hashing needed (the file is tiny and server can no-cache it).
- **`vite-plugin-pwa` / Workbox are explicitly rejected** — first-party precedent: 59-RESEARCH.md *"Do NOT add vite-plugin-pwa/workbox (STACK.md explicitly rejects: would rewrite the hand-built sw.js)"*. They also violate the zero-new-dependencies constraint.
- A plugin generating the manifest would also fight the EN-only/no-French-byte build gates and the icon-scanner traps documented for templates (`docs/project-templates.md §3`) for zero benefit on a static JSON file.

### SW coexistence details (the subtle parts)

1. **One registration, already lazy.** `registerSw()` is idempotent, re-fires on SPA login (CR-02), and failures are swallowed by design (poll + email are the delivery guarantee). Install criteria only need *a* controlled SW at scope — this one qualifies. Nothing to add.
2. **Do NOT add a `fetch` handler to sw.js.** It would (a) be redundant — absence of a fetch handler is itself the pass-through; (b) trip the `test/browser-push.test.mjs:124` forbidden-token regex (`fetch`), which includes comments; (c) open the cache-poisoning surface T-48-02 closed structurally. If a future phase ever needs interception, the contract tests must be consciously updated (59-RESEARCH Pitfall 7) — not this phase.
3. **Update-staleness:** sw.js is served `no-cache` (server.js:8097) and has no `skipWaiting` machinery by contract. Adding manifest/SW does not change this; the browser re-checks sw.js on navigation, and since the file never changes, there is no update churn.
4. **Push `showNotification` icon** points at `/favicon.svg`; the manifest icons are separate and additive — no interaction.

### CSP implications

None. `manifest-src` is absent → governed by `default-src 'self'`; the manifest and icons are same-origin. No header change required. (Verify once in e2e that the manifest response carries the standard CSP and the browser doesn't block — Playwright assertion covers it.)

### Bundle budget

Entry gate: 498.11 kB / 500 kB → **~1.9 kB headroom**. The only main.js additions are: one `addEventListener('beforeinstallprompt', ...)` (~5 lines) and a stashed-event flag. The banner render function should live in the settings/lazy surface it belongs to, imported dynamically only when the event fires (exact shape of the existing `registerSw = () => import('./core/push.js')...` pattern in main.js). Target entry delta: **< 200 bytes**. All strings ride the existing locale JSON loading (catalogues are outside the entry).

## Patterns to Follow

### Pattern 1: Lazy-import on browser event (D-48-1 precedent)
**What:** minimal eager hook in main.js, real logic in a lazy chunk.
```js
/* main.js — the entire eager PWA surface */
let installEvt = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvt = e;
  import('./features/install.js').then(m => m.onInstallAvailable(e)).catch(() => {});
});
```
**When:** anything listening for browser events with a 2 kB entry headroom.

### Pattern 2: Static-contract tests for non-bundled assets (browser-push.test.mjs precedent)
**What:** read the file source in Node, assert substrings/JSON shape. New `test/pwa.test.mjs` should assert: manifest is valid JSON with required fields (`name`, `display: "standalone"`, `start_url`, icons ≥192+512 + maskable variants), index.html carries the `<link rel="manifest">`, and sw.js still contains no fetch/install/activate/import token (guarding the pass-through contract forever).

## Anti-Patterns to Avoid

### Anti-Pattern 1: vite-plugin-pwa / Workbox
**Why bad:** rewrites/owns the SW, adds dependencies, breaks T-48-02 contract and the zero-dep constraint. **Instead:** static manifest + the existing SW.

### Anti-Pattern 2: A second "install" service worker or scope
**Why bad:** only one SW per scope; a second file at `/w/` scope would fragment registration (`getRegistration()` in push.js returns the wrong one). **Instead:** the existing root-scope SW is the install SW.

### Anti-Pattern 3: A fetch passthrough handler "for correctness"
**Why bad:** breaks the pinned forbidden-token test, adds a cache-poisoning surface for zero behavior change. **Instead:** no fetch handler.

## E2E Testability (Playwright)

Real install (native dialog, `appinstalled`) cannot be driven from Playwright. Assertable:

| What | How |
|---|---|
| Manifest served + valid | `page.request.get('/manifest.webmanifest')` → 200, `Content-Type: application/manifest+json` (or json), parse + assert fields. Also assert CSP header present. |
| SW registered, root scope | `page.evaluate(() => navigator.serviceWorker.getRegistration())` → non-null after load; assert `reg.scope === origin + '/'`. (Demo config reuses the same origin — one spec covers both.) |
| Banner conditions | `page.addInitScript` to dispatch a synthetic `beforeinstallprompt` (`window.dispatchEvent(new Event('beforeinstallprompt'))` — the handler must tolerate a no-prompt event, or the init script attaches a stub `prompt()`). Assert banner appears; click → `prompt()` stub called. Assert banner absent with no event (iOS-honesty case) — in both locales per the EN+FR e2e convention. |
| No-cache headers | request intercept on `/sw.js` and `/manifest.webmanifest`. |
| Unit (static) | `test/pwa.test.mjs` manifest/sw contract as above; catalogue test pins the new `settings.install.*` keys. |

## Build Order (considers one-SW-per-scope + chunk gate)

1. **Assets first:** generate + commit the 4 PNG icons and `public/manifest.webmanifest`; index.html link + theme-color meta. No JS touched, zero gate risk. Static tests for the manifest.
2. **Banner:** `beforeinstallprompt` hook in main.js (lazy chunk), Settings banner UI, i18n keys EN+FR, catalogue-test pins. Entry delta < 200 bytes; chunk gate re-run.
3. **Server touch:** optional no-cache for the manifest filename.
4. **Verification:** `test/pwa.test.mjs` + e2e spec (manifest / SW registration / banner mocked / no-banner case), full gates (unit, e2e, lint, i18n, chunk 11/11), plus a manual install UAT on a real device (desktop Chrome + Android; iOS documented as no-op).

Order rationale: step 1 is inert (nothing can break), step 2 is the only JS surface (guarded by the chunk gate), and SW work is **absent by design** — the constraint is satisfied by not touching sw.js at all.

## Sources

- Repo verified: `public/sw.js` (full read), `src/core/push.js:120-200`, `src/main.js:90-140`, `index.html`, `server.js:8048-8097`, `test/browser-push.test.mjs`, `.planning/milestones/v2.2-phases/59-browser-push/{RESEARCH,PATTERNS,VERIFICATION}.md`, `.planning/PROJECT.md` (v2.7 goals, 500 kB gate, zero-dep constraint).
- Platform knowledge (MDN/Web.dev: beforeinstallprompt, one-SW-per-scope, manifest criteria): HIGH confidence, stable APIs.
