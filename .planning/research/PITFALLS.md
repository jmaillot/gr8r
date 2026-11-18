# Domain Pitfalls — Adding PWA Installability to Projects Studio

**Domain:** bolting PWA installability (manifest, icons, pass-through SW, install banner) onto an existing self-hosted PM SPA
**Researched:** 2026-11-18
**Repo state verified this session:** `public/sw.js` is the existing minimal push/click-router SW (Phase 48 + 59); `registerSw()` in `src/core/push.js:161` registers it gated on `'serviceWorker' in navigator && api.enabled`; server serves `sw.js` and `index.html` **no-cache** (server.js:8097); CSP is `default-src 'self'; script-src 'self'; … frame-ancestors 'none'` (server.js:8048-8049); SPA routes are `/w/:slug/...` with popstate mirroring (v1.5); static-contract tests in `test/browser-push.test.mjs:123-142` pin sw.js byte-substrings and forbid `fetch|install|activate|import` tokens; chunk gate 498 kB / 500 kB (~2 kB headroom); i18n build gate (`scripts/i18n-scan.mjs`); e2e dist-staleness guard + 115 Playwright specs; `index.html` currently has **no** manifest link, no `apple-touch-icon`, no `theme-color` meta.

---

## Critical Pitfalls

### Pitfall 1: Extending `public/sw.js` breaks the pinned static contract (and tempts skipWaiting/claim)
**What goes wrong:** The existing sw.js is contract-frozen: `test/browser-push.test.mjs:123-142` asserts byte-identical pinned substrings (`u.origin === self.location.origin`, `openWindow(url)`, the URL constructor line) and a token regex forbidding `fetch|install|activate|import` **including comments**. Two failure modes when adding PWA installability:
1. Someone adds `install`/`activate`/`skipWaiting`/`clients.claim` handlers → the token test goes red, and — worse — skipWaiting+claim on a *pass-through* SW creates update races the app never had (a freshly-claimed SW mid-session with new behavior).
2. Someone writes a comment containing the word "import" or "activate" → red test for a non-code reason (regex is token-based; documented in 59-RESEARCH Pitfall 7).

A no-cache SW with **no fetch handler** needs **no lifecycle machinery at all**: the browser's default update flow (byte-diff on navigation, new SW waits, takes over on next reload) is exactly the honest "strictly online" behavior PWA-03 wants. skipWaiting/clients.claim would make a newly-deployed SW take control of already-open tabs mid-session — with no fetch handler this is nearly harmless today, but it is a footgun the moment anyone ever adds a handler, and it breaks the "no lifecycle machinery" precedent (59-03-PLAN explicitly forbids it).
**Warning signs:** browser-push.test.mjs static contract failing; code review seeing `skipWaiting`, `clients.claim`, or `addEventListener('install'|'activate'|'fetch')` in the diff.
**Prevention:** PWA installability needs **zero edits to sw.js** — the SW already exists and already satisfies "registered, no precache, no runtime caching." The only possible legitimate change is the `showNotification` icon if brand icons change (touches one pinned-adjacent line — do consciously, update tests deliberately). Keep the forbidden-token test as the enforcement boundary; add a phase-plan guard note that any sw.js diff is a STOP-and-justify event.
**Phase:** SW/registration phase (PWA-03) — decide "no sw.js changes" up front as a plan constraint.

### Pitfall 2: Second SW registration racing the first / scope collision
**What goes wrong:** One SW per scope — `public/sw.js` at `/sw.js` already owns the **root scope `/`** (registration uses absolute `'/sw.js'`, push.js:163). Common mistakes when adding installability:
1. Registering a *new* `pwa-sw.js` at the same scope → the two registrations clobber each other; push subscriptions attached to the old SW worker survive only until the new one replaces it, and `getRegistration()` (push.js:132) can return either.
2. Registering with a relative path (`register('sw.js')`) from a page at `/w/:slug/task/x` → resolves to `/w/:slug/task/sw.js` → 404 → registration silently fails (the `.catch(() => {})` at push.js:163 **swallows it**) and `serviceWorker.ready` then hangs — which is exactly the CR-02 dead-lock class Phase 59 already fixed once (`swReady()` 8s bound exists because of it).
3. Setting manifest `scope` narrower than `/` while the SW registration stays `/` → inconsistent control (SW controls pages the manifest considers out of app scope); or setting `scope`/`start_url` to `/w/` while push SW sits at `/` → the login page (`/login`, `/?next=`) is outside app scope but inside SW scope.
**Warning signs:** push subscriptions silently stop working after the PWA phase ships (404/410 sweep in `sendPushFor` clears them); console "A service worker already exists at scope"; e2e push-related specs flaking.
**Prevention:** **One SW, reused.** The existing `/sw.js` is already registered on every login path via `registerSw()` (CR-02 fix: boot + `enterApp`). The PWA milestone adds nothing to registration; it may only *verify* it (e.g., a static test asserting exactly one `serviceWorker.register` call site exists in `src/`). Manifest `scope` must be `"/"` (or omitted — same default) so installable pages and SW control agree. Any new registration code must use the absolute `'/sw.js'` path and ride `registerSw()`, never its own call site.
**Phase:** PWA-03 (SW) + manifest phase (PWA-01) jointly — scope/start_url decision must be made against the existing registration, not in isolation.

### Pitfall 3: `registerSw()` never fires in demo/static mode — install banner silently absent (or present in dev with a SW pointing at nothing)
**What goes wrong:** `registerSw()` is gated on `api.enabled` (push.js:162). In demo/seed mode (`!api.enabled`) no SW registers. If the install-banner logic keys off `navigator.serviceWorker.getRegistration()` or a `beforeinstallprompt` event that only fires with a SW+manifest satisfying install criteria, the banner appears in production but **never in demo mode** — and Chrome won't fire `beforeinstallprompt` at all without an active SW, so half-wired dev setups show *nothing* and someone "fixes" it by adding a dev-only registration that diverges from production. Conversely, in `vite dev` the SW registers from `/sw.js` served by Vite (public dir) — but the server-mode nuances (no-cache headers from server.js:8097) don't apply, so a dev SW can be cached by the browser with default heuristics and go stale across edits, producing "my change didn't take effect" ghosts.
**Warning signs:** banner works on the Docker deploy but not locally; stale SW surviving hard reloads in dev; `applicationServerKey`-style console warnings about no active SW.
**Prevention:** Single source of truth: banner code checks the same `api.enabled` + `registerSw()` seam push uses. For dev, rely on Vite serving `public/sw.js` and DevTools "Update on reload" — never add a dev-only registration path. Serve-header verification: a unit test pinning that server.js keeps sw.js/index.html in the no-cache branch (the existing line 8097) so nobody later "optimizes" caching of the SW.
**Phase:** PWA-03/PWA-04 — registration + banner must be specified against `api.enabled` semantics explicitly.

### Pitfall 4: `start_url` / `scope` vs `/w/:slug` — deep links and multi-workspace reality
**What goes wrong:** The SPA lives at `/w/:slug/...` (and `/login`, `/join`, `/` → redirect or workspace picker). Common manifest mistakes:
1. `start_url: "/w/"` or a hardcoded slug (`/w/demo`) → every install opens a workspace that may not exist for that user (404 or wrong tenant). Multi-workspace users (v1.1 core feature) with several installs/share targets get stranded.
2. `scope: "/w"` → the login page (`/login`, used by every logged-out deep link with `?next=`) and `/join` fall **outside** the installed app's scope: opening a notification email link in the installed window bounces to a *browser tab* for login, then the standalone app and the tab fight over the session flow.
3. `start_url` with a query string (`start_url: "/?source=pwa"`) — fine per spec, but `id` must then be stable and distinct; browsers key installed-app identity on `id` (fallback `start_url`). Changing `start_url` later without a stable `id` can create a *second* installed app on users' devices.
4. `display: "standalone"` + v1.5's popstate history mirroring: standalone windows have **no back button**. The app's history mirroring means `history.back()` works programmatically, but users who relied on browser back in a tab have no gesture in the installed window — iOS especially (Pitfall 7). Also: standalone deep-links opened from emails (`/w/:slug/task/:key`) land in the installed window only if within scope; `display_override`/`display` mismatch can make notification clicks (`openWindow(url)` in sw.js) open a *browser tab* instead of the installed window on some platforms.
**Warning signs:** installed app opens to 404 or wrong workspace; notification email links open outside the standalone window; `id` absent from manifest; two icons in an OS launcher after a start_url change.
**Prevention:** `start_url: "/"` (the app's own root handles workspace routing/session carry already — it's the same target sw.js's click router falls back to), `scope: "/"`, `id: "/"` set explicitly and frozen. Verify with e2e: from a clean profile, install → launch → login → navigate; and a pinned test asserting manifest `start_url`/`scope`/`id` values (static contract style, matching `test/browser-push.test.mjs` precedent). Document the "no back button in standalone" consequence in DEPLOY.md; consider an in-app back affordance decision in the banner phase rather than silently accepting it.
**Phase:** PWA-01 (manifest) — these are manifest-phase decisions; e2e verification belongs with PWA-04 acceptance.

### Pitfall 5: Icon mistakes — missing maskable, wrong sizes, `purpose` typo, SVG-only
**What goes wrong:** Chrome's install criteria require a 192×192 and a 512×512 (any) icon; `maskable` icons need a safe zone (~80% inner area) or the OS crops the brand mark into a circle/squircle and clips it. Classic failures: reusing the existing `favicon.svg` as the only icon (many platforms won't accept SVG in manifest icons, especially iOS/older Chromium); declaring `"purpose": "maskable any"` on one entry (the OS picks maskable rendering with the favicon's tight artwork → clipped logo); PNGs generated without padding for the safe zone; sizes declared but file actually different dimensions. Repo-specific: PWA-02 says icons derive from "the existing brand mark" — but the workspace **logo** feature (Phase 43) deliberately swaps the favicon per workspace client-side (layout.js `applyWsFavicon`, "no service-worker/manifest involvement" D-06). Do not wire workspace logos into the manifest: manifest is static, workspace logos are per-tenant — mixing them means the installed icon changes per logged-in user and the SW's `showNotification` icon (`'/favicon.svg'` hardcoded, sw.js:44) drifts from the manifest icons.
**Warning signs:** Lighthouse/DevTools "Installability: no icon ≥192px"; installed icon clipped on Android; per-workspace icon inconsistency.
**Prevention:** Ship real PNGs (192, 512, plus 512 maskable with padded safe zone) in `public/`, static manifest entries; keep Phase 43's D-06 boundary intact (client favicon swap stays untouched; manifest icons are the brand mark, not workspace logos). A static test can pin the manifest's icon block (paths + sizes + purpose) so edits are conscious. Keep sw.js's notification icon as-is or consciously update the pinned test.
**Phase:** PWA-02 (icons) — plus a one-line decision record re-affirming D-06 separation.

### Pitfall 6: i18n gate and chunk gate vs the banner and manifest
**What goes wrong:** Two gates can go red in surprising ways:
1. **i18n gate** (`scripts/i18n-scan.mjs` fails the build on uncatalogued literals): the install banner's strings ("Install Projects Studio", "Install", "Not now") are new UI literals — they must enter `en.json` + `fr.json` via the catalogue or the build fails. Sub-traps: writing the strings in `src/` as template literals before cataloguing; adding a key that the dead-key sweep later flags as stale if the banner is refactored; the `importBtn`-style Lucide icon-name collision documented in the v2.5 notes (label keys colliding with icon names). Also sw.js strings are forbidden by contract (T-48-02 zero-strings) — banner text must never move into the SW.
2. **Chunk gate** (entry at 498.11 kB of 500 kB — **~2 kB headroom**): install-detection + banner logic added to the eager entry path (`main.js` → shell) can push the entry over 500 kB and fail the build. Manifest/SW/icon files in `public/` are outside the bundle (safe), but the banner UI and `beforeinstallprompt` handling are not. Sub-trap: `deferredPrompt.prompt()` handling importing anything non-trivial eagerly.
**Warning signs:** `npm run build` fails on chunk-size or i18n-scan; review diff showing banner JSX/strings inline in an eager module.
**Prevention:** Catalogue all banner strings EN+FR in the same commit (the gate runs at build). Keep banner logic minimal and, if it approaches even 1 kB, lazy — the codebase already has the lazy-chunk pattern (settings/push chunk) and an eager-vs-lazy registration split precedent ("SW registration stays eager, settings UI rides the lazy chunk", 59-PATTERNS). The manifest itself, `public/*.png`, and sw.js edits add **zero** bundle bytes — say so in the plan so nobody over-engineers. A banner-only tiny chunk is an acceptable fallback; a second eager registration site is not (Pitfall 2).
**Phase:** PWA-04 (banner) owns both gates; PWA-01/02/03 are bundle-neutral by design — pin that in plans.

---

## Moderate Pitfalls

### Pitfall 7: iOS — no `beforeinstallprompt`, apple-touch-icon, standalone quirks
**What goes wrong:** Safari iOS never fires `beforeinstallprompt`; install is manual (Share → Add to Home Screen) and requires `apple-touch-icon` (a PNG, referenced by `<link rel="apple-touch-icon">`, 180×180 — **not** read from the web manifest). Mistakes: showing the banner on iOS (milestone says "honest no-op elsewhere" — detection must be UA/feature-based, not "no event after N seconds" which also fires on browsers that installed already); omitting apple-touch-icon so iOS installs with a screenshot-of-page icon; forgetting `apple-mobile-web-app-capable`/`mobile-web-app-capable` meta + `apple-mobile-web-app-status-bar-style` (the viewport already has `viewport-fit=cover` — good — but the status-bar style and `theme-color` interplay decide whether content sits under the notch); and the standalone **no-back-button** problem (see Pitfall 4) which on iOS is most acute — users swipe from the edge expecting browser-back and get nothing or a wrong view. The v1.5 history mirroring means an in-app back affordance is feasible but is a product decision.
**Warning signs:** banner rendered on an iPhone; iOS home-screen icon is a page screenshot; standalone app has content under the status bar; edge-swipe does nothing.
**Prevention:** Banner shows only when `'BeforeInstallPromptEvent' in window` + event received + not `display-mode: standalone` + not iOS UA; honest fallback copy ("iOS: use Share → Add to Home Screen") is a *catalogued* EN+FR string if shown. Ship `apple-touch-icon` link + iOS meta tags in `index.html` (static, zero bytes to the bundle). `theme_color` in the manifest must match the app's actual background color (also Pitfall 8). Decide the standalone back-navigation stance explicitly (accept + document, or add an affordance) — do not leave it implicit.
**Phase:** PWA-04 (banner honesty + detection) and PWA-01/02 (meta tags, apple-touch-icon). The back-navigation decision belongs in the milestone discussion, not discovered in UAT.

### Pitfall 8: `theme_color`/`background_color` vs the real UI
**What goes wrong:** Wrong `theme_color` paints the title bar/status bar a color that clashes with the app chrome (and `theme-color` meta vs manifest value can disagree); `background_color` shows only during launch splash — a white flash on a dark app (or vice versa) reads as broken. The app has a dark/light theme consideration — one static value cannot be right for both; pick the chrome color of the default theme and accept it.
**Warning signs:** screenshot of installed launch showing a white splash on the dark app; title bar color visibly off-brand.
**Prevention:** Extract the values from the existing CSS variables of the default theme; add `<meta name="theme-color">` in `index.html` consistent with the manifest; pin the two hex values in a static test so theme refactors notice.
**Phase:** PWA-01.

### Pitfall 9: CSP / headers traps for manifest and SW fetch
**What goes wrong:** (a) The CSP (`default-src 'self'; script-src 'self'` — server.js:8048) has no `manifest-src` or `worker-src` directive: manifest falls back to `default-src 'self'` (fine, same-origin) and worker falls back to `script-src 'self'` (fine) — but if anyone later serves the manifest from a CDN, renames it with a query-param busting scheme, or relaxes CSP, the silent fallback behavior changes. (b) The **manifest response headers**: server.js serves static files with a caching policy — a cached manifest (or one served with `Content-Type: application/json` vs `application/manifest+json`) can delay icon/theme updates for weeks; `X-Content-Type-Options: nosniff` (securityHeaders) will block a manifest served with a wrong Content-Type. (c) Traefik subpath deployments: if a deployment runs under a path prefix (`/gr8r/`), every absolute path in `index.html` (`/sw.js`, `/manifest.webmanifest`, icon hrefs, `start_url`, `scope`) silently 404s — the same absolute-path assumption sw.js's registration already makes (there is a precedent: it uses absolute '/sw.js' and works only at root deployments).
**Warning signs:** DevTools Application panel: "Manifest fetch failed" or "No matching service worker"; icons 404 on one deployment but not another; installed app broken only on a subpath instance.
**Prevention:** Serve the manifest with `Content-Type: application/manifest+json` (or `application/json`) + short `Cache-Control` (e.g. `no-cache` alongside index.html — extend the server.js:8097 branch consciously) and run it through the existing `securityHeaders()`. Add a server route/static-file test asserting manifest + icons are served with correct content-type and no-cache. For subpath deployments: either document root-only as a deployment constraint in DEPLOY.md (consistent with how `/w/:slug` and sw.js already assume root) or make the manifest paths relative (`scope: "./"`, relative icon/start_url) — decide once in planning; half-relative manifests are worse than either extreme.
**Phase:** PWA-01 (manifest serving + headers) with a DEPLOY.md note; subpath decision is a milestone-level discussion item.

### Pitfall 10: Playwright/e2e traps — SW interception, install event, stale dist guard
**What goes wrong:** (a) A SW registered in the e2e browser context persists across tests within a worker and intercepts nothing today (no fetch handler) — but its *registration state* affects tests that assert push settings UI (`swReady()` timeouts, notification permission flows). If the PWA work adds anything SW-related to boot, push-settings specs can flake or the 8s `swUnavailable` bound starts firing. (b) Chrome's `beforeinstallprompt` doesn't fire under default Playwright conditions; testing the banner requires stubbing the event (dispatch a fake `BeforeInstallPromptEvent` on `window`) — asserting on a real event produces a spec that never runs its body. (c) The e2e dist-staleness guard hashes `dist/.vite/manifest.json` — a **different** manifest (the web app manifest in `public/`) is unrelated and safe, but adding files to `public/` changes dist contents; make sure no test or fixture hashes `dist/` wholesale. (d) Tests asserting the manifest JSON must read it from `public/` (source of truth) or via a served fetch — not from the Vite build output, where it does not exist.
**Warning signs:** push-settings specs timing out after PWA phase lands; banner spec passing vacuously; staleness-guard test red on CI only.
**Prevention:** Stub `beforeinstallprompt` + `navigator.serviceWorker` in banner specs (the repo already has the stub-globals harness pattern in `test/browser-push.test.mjs:87-109` to copy). Keep banner e2e minimal (one EN + one FR spec, matching the codebase's EN+FR e2e discipline); verify SW registration state via `getRegistration()` with the existing `swReady()`-style bounding, never bare `serviceWorker.ready` awaits in specs.
**Phase:** PWA-04 acceptance; the registration-state risk belongs to PWA-03's verification plan.

### Pitfall 11: Manifest `id` / `start_url` churn across milestones
**What goes wrong:** No `id` today (no manifest at all). Once installed users exist, any later change to `start_url` without a frozen `id` re-keys the installed app identity → duplicate launcher entries / lost installed state on update. Conversely setting `id` to something path-derived and later moving the deployment breaks it.
**Warning signs:** users report a second icon after an update; installed app loses its window/state after redeploy.
**Prevention:** Set `"id": "/"` in the first manifest and treat it as frozen contract; pin it with a static test (same style as the sw.js contract tests).
**Phase:** PWA-01.

---

## Minor Pitfalls

### Pitfall 12: Dev-mode double registration vs Vite HMR
**What goes wrong:** Registering the SW inside a module that HMR re-executes → duplicate `register()` calls (harmless per spec — idempotent — but noisy) or a module-scope `await navigator.serviceWorker.ready` that re-runs on every HMR update. The repo's pattern already avoids this (`registerSw()` is idempotent and called from boot + `enterApp`, not module top-level await).
**Prevention:** Keep registration behind the existing `registerSw()`; never await SW state at module top level.
**Phase:** PWA-03/04 review checklist item.

### Pitfall 13: `display: standalone` breaking OAuth/2FA popups and window sizing
**What goes wrong:** The Entra SSO flow (v1.6) and TOTP flows were built for tab browsing; in a standalone window, popups/redirects behave slightly differently per platform, and a narrow standalone window triggers the ≤900px mobile band (Phase 64 contract) on desktop installs — the installed desktop window can silently render the mobile card stack.
**Warning signs:** installed desktop app shows mobile layout; SSO redirect feels broken on mobile standalone.
**Prevention:** Verify SSO login + 2FA from an installed context in UAT; set a sensible `display_override` if needed; note the viewport-band interaction in the phase verification checklist.
**Phase:** PWA-04 UAT checklist.

### Pitfall 14: Forgetting `Permissions-Policy` interplay / notifications in installed context
**What goes wrong:** The server sends `Permissions-Policy: camera=(), microphone=(), geolocation=()` (server.js:8047) — notifications are not restricted, fine; but a future "add `notifications=()`" "cleanup" would kill the existing push feature from installed windows where there is no visible tab prompt context.
**Prevention:** Static test already exists for headers? If not, pin that `notifications` is absent from the Permissions-Policy deny list.
**Phase:** PWA-03 verification (one assertion, cheap).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| PWA-01 manifest | start_url/scope vs `/w/:slug` + subpath deployments (P4, P9) | `start_url: "/"`, `scope: "/"`, `id: "/"` frozen; static contract test; DEPLOY.md root-only note |
| PWA-01 manifest | CSP/Content-Type on manifest response (P9) | manifest rides the no-cache branch (server.js:8097 extension), `application/manifest+json`, header test |
| PWA-01 manifest | theme_color vs real UI (P8) | values extracted from default-theme CSS vars, pinned by test |
| PWA-02 icons | maskable safe-zone clipping; SVG-only; workspace-logo mixing (P5) | real PNGs 192/512 + padded maskable; D-06 boundary re-affirmed; pinned icon-block test |
| PWA-02 icons | iOS apple-touch-icon missing (P7) | `<link rel="apple-touch-icon">` 180×180 PNG in index.html |
| PWA-03 SW | editing sw.js breaks pinned contract / skipWaiting temptation (P1) | zero sw.js edits; forbidden-token test stays the enforcement boundary |
| PWA-03 SW | second registration / relative path / scope collision (P2) | reuse `registerSw()` only; absolute '/sw.js'; scope = "/" |
| PWA-03 SW | demo-mode (`!api.enabled`) never registers; dev staleness (P3) | banner keyed on same seam; no-cache pin test for server headers |
| PWA-04 banner | i18n gate on banner strings (P6) | EN+FR catalogue keys in same commit; no strings in sw.js |
| PWA-04 banner | chunk gate: banner logic in 498 kB entry (P6) | minimal code or lazy chunk; manifest/icons are bundle-neutral — pin that |
| PWA-04 banner | iOS false-positive banner; standalone back-nav (P7, P4) | feature-detect `BeforeInstallPromptEvent` + `display-mode`; back-nav decision made in discussion |
| PWA-04 e2e | `beforeinstallprompt` never fires in Playwright; SW state flakes (P10) | stub-event specs; bounded `getRegistration()` waits |
| PWA-04 UAT | SSO/2FA + mobile band inside standalone window (P13) | installed-context UAT items |

## Sources
- Repo-verified (HIGH): `public/sw.js`, `src/core/push.js:141-172`, `src/main.js:105`, `server.js:8040-8060, 8097`, `index.html`, `vite.config.js`, `test/browser-push.test.mjs`, `.planning/milestones/v2.2-phases/59-browser-push/*` (RESEARCH Pitfall 12, REVIEW CR-02, VERIFICATION), `.planning/milestones/v1.9-phases/43-workspace-logo/43-RESEARCH.md` (D-06), PROJECT.md (v1.5 popstate mirroring, /w/:slug, chunk gate, i18n gate, Traefik deploy).
- Platform knowledge (MEDIUM, stable, spec-level): service worker update/claim semantics, Chrome install criteria (manifest + SW + 192/512 icons), iOS Safari `beforeinstallprompt` absence and apple-touch-icon requirements, manifest `id`/`start_url`/`scope` interplay, maskable-icon safe zone. Phase-specific hardware/device UAT (real iOS install) still required.
