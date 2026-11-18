# Feature Landscape — Installable PWA (v2.7)

**Domain:** PWA installability for an existing self-hosted PM tool (Projects Studio)
**Researched:** 2026-11-18
**Mode:** Features (ecosystem scan, scoped to PWA install support only)
**Overall confidence:** HIGH (Chromium criteria, iOS behavior, Firefox stance all cross-checked against Chrome devrel docs, MDN, Apple support docs, and community references)

---

## Repo dependency check: the existing service worker (HIGH confidence)

The browser-push feature already shipped `public/sw.js` (Phase 48, v1.10) and it is
**directly reusable for install purposes — no second service worker**:

- It is a minimal click/push router: `notificationclick` + `push` handlers only, **no
  fetch handler, no caching, no lifecycle handlers** (`test/browser-push.test.mjs`
  structurally forbids `fetch|install|activate|import` tokens in the file).
- Registered from `src/main.js:~105-108` (`navigator.serviceWorker.register('/sw.js')`,
  absolute path, `.catch(() => {})`) and from `src/core/push.js:163` behind `api.enabled`.
- Served `no-cache` by `server.js:8097`; Vite copies `public/*` → `dist/` verbatim.

**Implication:** the "pass-through service worker with no precache/no runtime caching"
requirement (PWA-03) is **already satisfied** by the existing SW — its no-fetch-handler
design IS the pass-through behavior. The only questions for the new milestone are:
(1) whether registration should be unconditional (currently the main.js registration is
unconditional but `push.js` re-registers only when push enabled — verify the actual gate
during planning; a registered-but-idle SW is harmless), and (2) whether Chromium's
`beforeinstallprompt` still needs a fetch handler (see below — the menu-install path
does not, and that's the path the install banner uses).

One caution: the structural test (`test/browser-push.test.mjs`) bans `install`/`activate`/
`fetch` tokens in sw.js. PWA-03 must be implemented as "SW already exists, verify it serves
install criteria" — NOT "add install/activate handlers", which would break that test and
re-open the cache-poisoning surface T-48-02 closed.

---

## What "installable" means per platform (2026 state)

| Platform | Installable? | Mechanism | What the app gets |
|----------|--------------|-----------|-------------------|
| **Chrome/Edge desktop** (Chromium) | Yes | Omnibox install icon or ⋮ menu → "Install page as app"; **`beforeinstallprompt` fires** when criteria met (see nuance below) | Standalone window, own taskbar/dock icon, app menu entry, `display: standalone` honored, richer install dialog if `screenshots` + `description` present |
| **Android Chrome** | Yes | Omnibox install banner + menu; installs as **WebAPK** (real app entry in launcher) | Standalone, home-screen icon from manifest, `beforeinstallprompt` fires |
| **iOS / iPadOS Safari** | Yes, always (any site) | Share sheet → **Add to Home Screen** (with "Open as Web App" toggle, iOS 26 wording) | Standalone web-app context; **no `beforeinstallprompt` ever**, no install criteria; icons from manifest **and** `apple-touch-icon` (Safari still prefers the link tag in many versions) |
| **Firefox desktop** | **No** | No site-to-app install path (removed 2022); community extension workarounds only | Tab-only experience — honest no-op |
| **Firefox Android** | Partially | Menu → "Install" / "Add to Home Screen" — often a **plain shortcut**, not always a WebAPK/standalone; **`beforeinstallprompt` does NOT fire** | Shortcut or standalone depending on manifest detection; unreliable |

**Chromium criteria nuance (2026, HIGH confidence):** Chrome removed the
"SW with a fetch handler" requirement for **menu installation** in Chrome 108 (mobile) /
112 (desktop), and Chrome supplies a default offline page for installed apps without one.
The *automatic* install-prompt algorithm historically still looked for a fetch handler;
Chrome has been migrating it to engagement-based signals. Practical consequence for this
project: **the existing no-fetch-handler SW is fine for the omnibox install path and for
`beforeinstallprompt` on current Chromium**, but if `beforeinstallprompt` proves flaky in
UAT, the fallback is the user using the ⋮ menu — the install-hint banner must handle both
(segments below).

Chromium criteria checklist (what gates `beforeinstallprompt` + omnibox icon):
1. HTTPS / secure context (already true — self-hosted behind Traefik)
2. Manifest with `name` (or `short_name`), `start_url`, `display: standalone|fullscreen|minimal-ui`
3. Icons: **192×192 and 512×512** PNG (the checker above matches what Chromium enforces)
4. SW registered (any SW; no fetch handler needed for menu install)
5. Not already installed; ~30s engagement heuristics for the *automatic* prompt

---

## Table Stakes

Missing any of these = the milestone doesn't deliver "installable".

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `manifest.webmanifest` in `public/` (name "Projects Studio", `short_name`, `start_url`, `scope: "/"`, `display: "standalone"`, `theme_color`, `background_color`) | The single gate for every platform; iOS reads `start_url`/`scope`/`display` from it | **Low** | Static JSON outside the Vite bundle — no chunk-gate impact. `scope: "/"` is load-bearing on iOS (omitting it makes in-app links pop out to Safari). `start_url: "/"` — no `?source=pwa` needed unless you want analytics (you don't). Add `id` so future reinstalls dedupe to one app entry. |
| `<link rel="manifest">` in index.html head | Discovery | **Low** | One line in `index.html`. |
| Icon set: 192×192 + 512×512 `purpose: "any"`, and a **maskable** variant (separate entries or `purpose: "any maskable"` per file) | Chromium requires 192+512; maskable prevents the circle-crop chop on Android; iOS needs 180×180 `apple-touch-icon` PNG (SVG won't do) | **Low-Med** | Derived from the existing brand mark (`public/favicon.svg`, `logo-*.svg`). Rasterizing an SVG at 3 sizes is a one-off script or hand export — zero deps. PWA-02. Add `<link rel="apple-touch-icon">` (180×180) — Safari ignores manifest icons for the home screen in practice. |
| SW registered unconditionally at boot | Chromium install criteria + iOS standalone "Open as Web App" behavior benefits; already done | **Zero (done)** | `public/sw.js` already registered from `main.js`. Verify the registration gate isn't push-only; if it is, make the boot registration unconditional (SW does nothing without a push anyway). |
| HTTPS | Secure context gate | **Zero (done)** | Self-hosted behind Traefik. localhost dev is a secure context too. |
| Honest iOS degradation in the install hint | iOS never fires `beforeinstallprompt`; users must use Share → Add to Home Screen | **Low** | Copy-only: detect iOS Safari (`navigator.userAgent` or feature-absence: no `beforeinstallprompt` + is-mobile + standalone not detected), show manual instructions. EN+FR i18n keys per the standing gate. PWA-04. |
| Honest Firefox-desktop degradation | No install path at all | **Low** | Same banner logic: if no `beforeinstallprompt` and not iOS → either hide the banner or show "not supported in this browser". Hiding is more honest for desktop Firefox; the iOS copy is worth showing because install DOES work there manually. |

## Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Install hint banner driven by `beforeinstallprompt`** (deferred prompt capture → own in-app banner button calls `prompt()`, then hide; hide forever on `appinstalled` or dismissal, persisted in localStorage) | The core UX of PWA-04: don't rely on the omnibox icon users never notice | **Low-Med** | Listen on `window`'s `beforeinstallprompt`, `e.preventDefault()`, stash the event, render banner; call `deferredPrompt.prompt()` on click; check `userChoice` outcome. Suppress when `window.matchMedia('(display-mode: standalone)')` or `navigator.standalone` (iOS) — already installed. ~40 lines, zero deps. |
| `display: standalone` polish — verify the card-stack layout works in the standalone window and there's no dead space where browser chrome used to be; handle `theme_color` for the Android status bar | The whole point of installing: app-shaped window | **Low** | Mostly QA + one meta tag. Android colors the task switcher/status bar from `theme_color`; iOS uses `apple-mobile-web-app-status-bar-style` (default/black/black-translucent) — `black-translucent` pairs with `viewport-fit=cover` + safe-area insets. Check whether the existing CSS already uses safe-area vars. |
| `apple-mobile-web-app-capable` / `apple-mobile-web-app-title` meta tags | iOS standalone mode + home-screen label without using the page `<title>` | **Low** | Two meta tags. iOS 17+ honors `display: standalone` from the manifest, but the meta tags are still the reliable path. |
| `shortcuts` in the manifest (e.g. "My tasks", "Inbox", "Search") | Long-press/dock context menu jumps straight into the app's hottest surfaces | **Low** | Pure manifest JSON, static URLs (`/w/...` is workspace-scoped so shortcuts must use non-scoped routes — check what `/` and existing top-level routes resolve to; shortcuts to `/w/:slug` would hardcode a slug, which is wrong for multi-tenant users). Keep to 2–3 generic targets or defer. |

## Anti-Features (explicitly NOT for this milestone)

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Offline caching / precache / runtime fetch handler** (Workbox, service-worker toolkit, anything intercepting `fetch`) | The owner's decision: strictly online. Adding a fetch handler re-opens the cache-poisoning surface T-48-02 eliminated, risks stale-bundle bugs with a rolling self-hosted deploy, and the existing test suite structurally forbids fetch/install/activate handlers in sw.js | Keep the existing no-fetch SW untouched; Chrome ships a default offline page for installed apps without one |
| **`share_target`** (receive shares from the OS) | Requires the OS to hand off to a form/POST endpoint; multi-workspace scoping is ambiguous (which workspace receives the share?), and it's a mobile-only nicety | Revisit only if someone asks to "send this link to Projects Studio" |
| **Protocol handlers (`registerProtocolHandler`)** | No PM-tool use case; modal-permission noise | Skip |
| **`window-controls-overlay` / `display_override`** | Desktop-only window-chrome customization; the standard standalone window is already the goal; WCO adds CSS safe-area complexity for zero user value | Standard `standalone` only |
| **Splash screens / `apple-touch-startup-image`** | iOS startup images need a matrix of exact device resolutions (dozens of PNGs) for a sub-second flash; Chrome desktop/Android don't use them | Rely on the fast SPA boot + `background_color` fill (Chrome/Android generate a splash from `background_color` + icon automatically — free) |
| **`screenshots` in manifest** | Only enriches Chrome's richer install dialog; requires maintaining marketing screenshots in the repo, and they go stale | Defer; the standard install dialog is fine |
| **`file_handlers`, `launch_handler`, badges, `related_applications`** | No use case here | Skip |
| **Second service worker for install** | Two SWs on one origin = scope/claim race with the push SW | One SW serves push AND install (see dependency check) |
| **Push rework** | Browser push already shipped; iOS standalone push exists on iOS 16.4+ but only for installed web apps and reuses the existing VAPID path — out of scope per milestone | Note as future bonus, don't touch |

---

## The honest install hint banner, per platform (PWA-04 behavior spec)

| Environment | Detection | Banner behavior |
|-------------|-----------|-----------------|
| Chromium desktop/Android, criteria met | `beforeinstallprompt` fired, not standalone | Show in-app banner ("Install Projects Studio"); click → `prompt()`; hide on `appinstalled`, on dismissal (persisted), or `userChoice !== 'accepted'` |
| Chromium already installed | `display-mode: standalone` / `display-mode: window-controls-overlay` | No banner (suppress at boot) |
| iOS / iPadOS Safari | No `beforeinstallprompt` + iOS UA + not `navigator.standalone` | Show banner with manual copy: Share → Add to Home Screen → Open as Web App (EN+FR) |
| iOS already installed (`navigator.standalone` true) | | No banner |
| Firefox desktop | No `beforeinstallprompt`, not iOS | No banner (or nothing — install genuinely impossible) |
| Firefox Android / Samsung Internet edge cases | No `beforeinstallprompt`, mobile UA, not iOS | Optional: generic "install from browser menu" copy; safe to omit — menu install still works without our help |
| Other/unknown | No event within N seconds | No banner — silent honest no-op |

Key correctness points: `beforeinstallprompt` may fire before or after app code runs
(register the listener in `main.js` at boot, before `load`); the captured event is
single-use (`prompt()` consumes it); never call `prompt()` without a user gesture;
`appinstalled` is the reliable "done" signal on Chromium.

---

## Feature Dependencies

```
manifest.webmanifest + icons ─┬─→ Chromium installable (omnibox/menu) ─→ beforeinstallprompt banner
existing sw.js (no change) ───┘        │
apple-touch-icon + iOS meta ──→ iOS Add to Home Screen works ─→ iOS manual-instructions copy
HTTPS (done) ─────────────────→ everything
i18n keys (EN+FR) ────────────→ banner copy (standing gate)
```

The banner depends on the manifest being correct — an incomplete manifest = no
`beforeinstallprompt` = banner silently never appears (which is also the graceful
failure mode, but check DevTools Application panel during UAT).

## MVP Recommendation

Prioritize:
1. Manifest + icon set + index.html head links (PWA-01, PWA-02) — everything gates on this
2. Verify/extend SW registration so it's unconditional (PWA-03 is ~a verification task, not a build task)
3. `beforeinstallprompt` banner with iOS manual-instructions fallback (PWA-04)

Defer: manifest `shortcuts` (needs a non-workspace-scoped route decision), manifest
`screenshots` (stale-asset maintenance), safe-area/status-bar polish beyond `theme_color`
(one follow-up if the standalone window shows a regression).

Defer (likely forever, per owner decision): everything in Anti-Features.

## Sources

- Chrome devrel — "Revisiting Chrome's installability criteria" (fetch-handler removal, Chrome 108/112) — HIGH
- web.dev — install criteria + installation-prompt guidance (`beforeinstallprompt` lifecycle) — HIGH
- MDN — Making PWAs installable — HIGH
- Apple support + Safari Web Content docs — Add to Home Screen, `apple-touch-icon`, iOS standalone meta — HIGH
- whatpwacando.today / OpenPWA — Firefox (no desktop install, no `beforeinstallprompt` even on Android) — MEDIUM-HIGH
- Repo evidence: `public/sw.js`, `src/main.js`, `src/core/push.js`, `server.js:8097`, `test/browser-push.test.mjs`, Phase 48 RESEARCH/REVIEW artifacts — VERIFIED (local)
