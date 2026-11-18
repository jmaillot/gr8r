# Phase 73: Install Hint Banner - Research

**Researched:** 2026-11-18
**Domain:** `beforeinstallprompt` install banner (vanilla JS, no framework, lazy chunk in an existing Vite SPA)
**Confidence:** HIGH

## User Constraints (from CONTEXT.md)

### Locked Decisions (verbatim, D-01 … D-09)
- **D-01:** Fixed bottom strip (fixed bar at the bottom edge, above content) with an Install button and a dismiss X. Not a toast, not inline.
- **D-02:** Boot-only, event-driven: a ~5-line `beforeinstallprompt` listener in `main.js` lazy-imports the banner module; the banner shows whenever the event fires after hydration — no user-interaction prerequisite, no delay gate.
- **D-03:** Banner may appear on any authenticated app route, including `/w/:slug` workspace routes; suppressed on `/login`, `/join`, and demo screens. It lives at shell level so it survives workspace switching.
- **D-04:** Banner suppresses itself on `appinstalled`, when the app is already running standalone (`display-mode: standalone` matchMedia), and on user dismissal.
- **D-05:** Dismissal persists client-side in `localStorage` with a **14-day cooldown**.
- **D-06:** iOS shows the same fixed bottom strip containing a static one-line hint ("Share → Add to Home Screen", EN+FR) — no button, no fake prompt. Detection is feature-based (no `BeforeInstallPromptEvent` + iOS UA + not standalone), never timeout-based.
- **D-07:** Firefox (desktop and Android) gets total silence — the banner never appears.
- **D-08:** Every banner string is catalogued EN+FR in `src/locales/en.json` and `fr.json` in the same commit (i18n gate).
- **D-09:** Banner logic is a lazy chunk (`import()` from the `main.js` listener, the established `import('./x.js').catch(() => {})` pattern); entry delta target < 200 bytes; chunk gate re-run.

### Hard constraints from phase definition
- **Zero edits to `public/sw.js`, `server.js`, or `index.html` head tags** (Phase 72 landed those).
- e2e must **stub** `beforeinstallprompt` — the real event never fires in Playwright.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PWA-04 | Honest install affordance: Chromium native prompt via `prompt()`; iOS static instructions; Firefox nothing; EN+FR catalogued; suppression rules | Sections below: event API, detection matrix, repo patterns |

## Summary

Phase 73 is ~40–80 lines of event-driven JS plus a CSS strip plus EN+FR keys. All platform facts are settled in the milestone research (`.planning/research/SUMMARY.md`, Phase 2 section): Chromium fires `beforeinstallprompt` only when install criteria are met (Phase 72's manifest satisfies them); the captured event's `prompt()` must be called from a user gesture, and its `userChoice` promise resolves `{ outcome: 'accepted'|'dismissed' }` [CITED: web.dev/learn/pwa/installation-prompt, MDN]. iOS Safari and Firefox never fire the event — hence the feature-based degradation (D-06/D-07).

Repo-side, everything needed already exists: the lazy-import pattern with comment-tagged pre-warm rationale lives in `src/main.js:52-66` and `main.js:114` (`import('./core/push.js').then(...)`), `t()` in `src/core/i18n.js` is the only string path, tokens live in `src/styles/tokens.css`, and the gates (`build-chunk-size.test.mjs` 500 kB cap, `build-locales.test.mjs`, `browser-push.test.mjs:134` sw.js token ban `/\b(fetch|install|activate|import)\b/`) are established node:test contracts. The critical entry-budget fact: the entry chunk has ~2 kB headroom (498/500 kB per SUMMARY.md), so the listener must be tiny and the banner must be a separate chunk (D-09).

**Primary recommendation:** one listener pair in `main.js` (`beforeinstallprompt` → lazy-import `src/features/install-banner.js` and hand it the event; `appinstalled` → dispatch a small custom event the banner module listens for), one new module owning render/detect/suppress/prompt, EN+FR keys in the same commit, one contract test pinning listener + chunk existence, one e2e spec stubbing the event.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Event capture (beforeinstallprompt/appinstalled) | Browser/Client (main.js entry) | — | window events; must be at boot before Chrome's mini-infobar chance to preventDefault |
| Banner render/prompt/dismiss | Browser/Client (lazy chunk) | — | pure DOM, uses `event.prompt()` directly |
| Platform detection (iOS/Firefox/standalone) | Browser/Client (lazy chunk) | — | `matchMedia`, UA sniff, `'BeforeInstallPromptEvent' in window` |
| Dismissal persistence | Browser/Client (localStorage) | — | D-05: per-browser, no server round-trip |
| Strings | Browser/Client (i18n catalogue) | — | `t()` via `src/core/i18n.js` |
| Route guard | Browser/Client (lazy chunk) | shell render state | reads existing route/auth state (`S.ui.auth`, pathname) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none — zero new dependencies) | — | window events, matchMedia, DOM, localStorage | Milestone research conclusion: "zero new dependencies, zero new build machinery" [VERIFIED: .planning/research/SUMMARY.md:10] |
| Vite dynamic import | existing | lazy chunk emission | `import('./x.js')` already emits separate chunks (qrcode/settings pins in build-chunk-size.test.mjs) |

**Installation:** none.

## Architecture Patterns

### Pattern 1: The established lazy-import listener (copy this shape)
**What:** tiny entry-side trigger, module body fully lazy.
**Repo example** [VERIFIED: src/main.js:52-66, 114]:
```js
/* [67-04 Rule 3] the subtask actions ride a pre-warmed lazy chunk … */
import('./actions/subtasks.js').catch(() => {});
/* notifyNewEvents/permChanged ride the lazy push chunk (DELIV-02 index gate) */
const pushMod = () => import('./core/push.js');
```
For the banner (D-02/D-09), the entry cost is the listener + one `import()`:
```js
/* [73-01] the install banner rides a lazy chunk — the entry carries only
   these two listeners; the event object is handed to the module. */
const bannerMod = () => import('./features/install-banner.js');
addEventListener('beforeinstallprompt', e => { e.preventDefault?.(); bannerMod().then(m => m.onBip(e)).catch(() => {}); });
addEventListener('appinstalled', () => { bannerMod().then(m => m.onInstalled()).catch(() => {}); });
```
**Key detail:** keep `e.preventDefault()` — it suppresses Chrome's own mini-infobar so the in-app strip is the only affordance [CITED: web.dev/learn/pwa/installation-prompt].

### Pattern 2: prompt() from user gesture + outcome handling
```js
// Source: web.dev/learn/pwa/installation-prompt (pattern), adapted
let deferred = null;
export function onBip(e) { deferred = e; if (canShow()) render(); }
export function onInstalled() { hide(); }
// click handler on the Install button:
deferred.prompt();
const { outcome } = await deferred.userChoice; // 'accepted' | 'dismissed'
deferred = null;
if (outcome === 'accepted') hide(); // appinstalled also fires; belt + suspenders
```
`userChoice` resolution: `{ platform, outcome }` where outcome is `'accepted'` or `'dismissed'` [CITED: MDN BeforeInstallPromptEvent]. Calling `prompt()` again on the same event is forbidden — one shot per captured event, so null it after use.

### Pattern 3: feature-based platform detection (D-06/D-07)
```js
const standalone = matchMedia('(display-mode: standalone)').matches;
const hasBip = 'BeforeInstallPromptEvent' in window;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS 13+ masquerades as Mac
```
Decision matrix:
- `standalone` → never show (D-04).
- event captured (`onBip` called) → Chromium path: button + dismiss X.
- no event captured AND `isIOS` AND not standalone → iOS strip: static one-liner only.
- everything else (Firefox, unqualified Chromium) → silence (D-07). No timeout wait — "no event" alone proves nothing, which is exactly why only iOS gets the manual strip.

### Pattern 4: dismissal persistence (D-05)
```js
const KEY = 'pwa.installDismissedAt';
const show = () => Date.now() - (Number(localStorage.getItem(KEY)) || 0) > 14 * 864e5;
// on dismiss: localStorage.setItem(KEY, String(Date.now())); hide();
```
`localStorage` availability in this repo is already assumed by existing code (seen-set in push module) — same primitive, no wrapper needed. Note `localStorage` read is in the lazy chunk, not the entry (entry-byte budget).

### Pattern 5: route/auth guard (D-03)
Reuse existing signals — no new route plumbing. Suppress when: `S.ui.auth` is truthy (login/join/auth screens), demo mode (`!api.enabled`), or pathname matches `/join/…`. Because the banner is shell-level fixed positioning, it survives `render()`/workspace switching without re-adding; simplest robust approach: re-check guard inside `render()` reactions or re-evaluate on the existing `projects:locale`/render event, or append the strip to `document.body` outside the app root so shell re-renders never remove it (body-attached is what the guard design implies — verify at planning which mount point keeps it above content but outside the re-rendered root).

### System Architecture Diagram
```
Chromium meets install criteria (Phase 72 manifest)
        │
        ▼  window 'beforeinstallprompt'
main.js listener (entry, ~5 lines) ──preventDefault()──▶ lazy import()
        │                                                │
        ▼                                    install-banner.js chunk
   appinstalled event ◀── accept ──── prompt() from click ──▶ userChoice
        │                        │  dismiss X ──▶ localStorage (14d)
        ▼                        ▼
   hide + suppress           hide + cooldown
   (always-standalone / iOS-UA / Firefox → never render or static strip only)
```

### Anti-Patterns to Avoid
- **Timeout-based iOS detection** ("no event after 3s ⇒ show iOS hint"): D-06 forbids it; it also misfires on slow qualifying Chromium. Feature checks only.
- **Reusing the captured event twice:** `prompt()` throws/loses efficacy after first call — null the reference immediately.
- **Banner inside the re-rendered app root:** a shell `render()` would wipe it. Mount outside the app container (body-level).
- **Any sw.js edit:** `test/browser-push.test.mjs:134` bans the tokens `fetch|install|activate|import` verbatim in `public/sw.js` [VERIFIED: test/browser-push.test.mjs:134]. Note the irony: the word "install" is banned *in the SW file* — banner code must stay out of sw.js entirely (it is anyway, different module).
- **Server-side or workspace-doc dismissal state:** D-05 locks localStorage; don't drift to `S.prefs` (that syncs to the account).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| String lookup | local copy table | `t()` from `src/core/i18n.js` | i18n gate (`build-locales.test.mjs`, i18n-scan) enforces catalogue membership |
| Chunk-size enforcement | manual byte eyeballing | `test/build-chunk-size.test.mjs` re-run | gate runs real `vite build` into temp dir |
| e2e install simulation | real Chromium install | stubbed `beforeinstallprompt` via `page.addInitScript` | event never fires in Playwright (success criteria 1) |
| Styling values | ad-hoc hex/spacing | `src/styles/tokens.css` tokens | repo convention; iOS-safe safe-area padding via `env(safe-area-inset-bottom)` on the fixed strip |

## Common Pitfalls

### Pitfall 1: Entry delta blowout
**What goes wrong:** listener + inline detection logic in main.js pushes the entry over 500 kB (headroom ~2 kB).
**Avoid:** entry carries ONLY the two listeners + `import()`; everything else in the chunk. Add a build assertion comparing entry chunk size to a pinned baseline (pattern: `icons-baseline.json` fixture).

### Pitfall 2: `prompt()` outside user gesture
**What goes wrong:** calling `prompt()` on boot or in the event handler itself throws/no-ops.
**Avoid:** only in the Install button click handler. [CITED: MDN BeforeInstallPromptEvent.prompt()]

### Pitfall 3: Banner re-appearing after dismiss
**What goes wrong:** every subsequent `beforeinstallprompt` (Chrome re-fires it on navigation/visibility changes) re-renders the banner despite dismissal.
**Avoid:** check the 14-day cooldown inside the render decision of the lazy module, not only at import time; the module may be re-imported cheaply (already cached) on every event fire.

### Pitfall 4: iPadOS detection
**What goes wrong:** iPadOS 13+ reports `navigator.platform === 'MacIntel'`.
**Avoid:** the `maxTouchPoints > 1` clause in the iOS sniff (Pattern 3).

### Pitfall 5: Dev double-fire / caching in dev
**What goes wrong:** Vite dev HMR can re-run listeners; localStorage cooldown hides the banner during dev testing.
**Avoid:** gate dev convenience (e.g. `window.__projects` already exists — add a debug hook there for DEV only, per `main.js:407`).

### Pitfall 6: Chrome fires the event before the app hydrates
**What goes wrong:** banner attempts to read auth state before `init()` finished → shows on login screen.
**Avoid:** in `onBip`, defer the canShow() decision until boot's `render()` has run (e.g. simple retry on next microtask/event, or have the module subscribe to the existing `projects:notifs`/render signals). Keep it simple: the event usually fires well after load; a one-shot `requestAnimationFrame`+recheck or listening once for the first render is enough.

## Code Examples

### e2e stub (Playwright)
```js
// Source: pattern — beforeinstallprompt is never real in headless runs
await page.addInitScript(() => {
  class FakeBIP extends Event {
    constructor() { super('beforeinstallprompt'); }
    prompt() { this.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' }); }
  }
  const ev = new FakeBIP(); ev.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
  setTimeout(() => window.dispatchEvent(ev), 100);
});
```
Assert: strip visible with EN text; click Install; assert a `promptCalled` side effect (expose via the stub, e.g. set `window.__bipPrompted = true`). FR: reuse `demo-locale.spec.mjs` locale-switching helpers [VERIFIED: e2e/demo-locale.spec.mjs exists].

### iOS strip (static, no button)
Same fixed-bottom container; content = dismiss X + `t('pwa.install.iosHint')` ("Share → Add to Home Screen" / FR equivalent — respect French typography rules, `test/french-typography.test.mjs` exists). Never include an Install button on iOS.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SW fetch-handler required for install | No fetch handler needed (Chrome 108 mobile / 112 desktop) | 2022–2023 | Existing push SW already qualifies; zero sw.js work [VERIFIED: .planning/research/SUMMARY.md:10] |
| Chrome mini-infobar only | `beforeinstallprompt` customization standard | long-standing | D-01 in-app strip is the recommended UX [CITED: web.dev/learn/pwa/installation-prompt] |
| Firefox no install | Firefox 143 ships Windows web apps, but still no `beforeinstallprompt` | 2025 | D-07 silence stays correct [VERIFIED: .planning/research/SUMMARY.md:139] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Body-level mount (outside app root) keeps the strip through shell re-renders — needs a look at `src/shell/render.js` mount structure during planning | Pattern 5 | Banner wiped on navigation; visible regression in e2e |
| A2 | `render()`/auth state (`S.ui.auth`, `api.enabled`) readable from a lazy feature module at event time | Pattern 5 / Pitfall 6 | Banner on login screens |
| A3 | iPadOS MacIntel sniff needed (desktop-focused app, but D-06 says iOS broadly) | Pattern 3 | Banner shows as "Chromium" on iPad Safari — actually that path requires captured event, so low risk |

All other claims are repo-verified (cited with file:line) or cited to official docs.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Playwright | e2e stub spec | ✓ | ^1.64.1 (package.json) | — |
| node:test | contract tests | ✓ | repo standard | — |
| Vite build (chunk gate) | D-09 verification | ✓ | existing | — |

None missing.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (unit/contract) + @playwright/test (e2e) |
| Config file | `e2e/playwright.config.mjs`; node:test needs no config |
| Quick run command | `node --test test/pwa-banner.test.mjs` (new) |
| Full suite command | `npm test` and `npm run e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PWA-04 (crit 4) | entry delta < 200 bytes; lazy chunk emitted | contract | `node --test test/pwa-banner.test.mjs` (asserts chunk `install-banner-*` exists; entry within baseline+200) — rides real `vite build` per build-chunk-size pattern | ❌ Wave 0 |
| PWA-04 (crit 4) | EN+FR keys catalogued same commit | contract | existing i18n gate (`i18n-scan` via prebuild + `npm test`) | ✅ (existing gates) |
| PWA-04 (crit 1–3) | banner show/prompt/suppress/iOS-hint/Firefox-silent | unit (stubbed globals, browser-push.test.mjs stub pattern) | `node --test test/pwa-banner.test.mjs` | ❌ Wave 0 |
| PWA-04 (crit 1–2) | e2e: stubbed event, EN + FR, click → prompt; dismissal persists | e2e | `npx playwright test --config e2e/playwright.config.mjs e2e/install-banner.spec.mjs` | ❌ Wave 0 |
| constraint | zero sw.js edits | contract | existing `node --test test/browser-push.test.mjs` | ✅ |

### Wave 0 Gaps
- [ ] `test/pwa-banner.test.mjs` — chunk-existence + suppression/cooldown unit tests (use the browser-push.test.mjs global-stub pattern for the lazy module)
- [ ] `e2e/install-banner.spec.mjs` — stubbed-event spec, EN + FR
- [ ] Entry-size baseline fixture if the planner wants a pinned delta assertion

## Security Domain

`security_enforcement` not disabled in config → included. This phase is client-UI-only; attack surface is minimal.

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V5 Input Validation | marginal | only localStorage read of own key (Number parse with `|| 0` fallback); no user input rendered — use `textContent`/existing DOM helpers, no innerHTML interpolation of dynamic values |
| V2/V3/V4/V6 | no | no auth/session/crypto surface |

| Threat Pattern | STRIDE | Mitigation |
|----------------|--------|------------|
| localStorage poisoning (self-XSS only) | Tampering | Number() coercion with fallback; worst case banner shows early — no code path executes attacker data |

## Sources

### Primary (HIGH confidence)
- Repo reads this session: `src/main.js` (lazy-import patterns, listeners, init flow), `test/browser-push.test.mjs:1-40+134`, `test/build-chunk-size.test.mjs`, `test/build-locales.test.mjs`, `.planning/research/SUMMARY.md`, `package.json` scripts, `test/` + `e2e/` listings, `public/manifest.webmanifest` (`"display": "standalone"` at line 7).
- web.dev/learn/pwa/installation-prompt; MDN `beforeinstallprompt` event / `BeforeInstallPromptEvent` — event capture, `prompt()` from gesture, `userChoice` outcome shape, `preventDefault` for mini-infobar.

### Secondary (MEDIUM)
- `.planning/research/SUMMARY.md` platform matrix and per-browser install facts (curated milestone research, includes openpwa.net / MDN cross-checks).

### Tertiary (LOW)
- None material.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero dependencies; all patterns repo-verified
- Architecture: HIGH — decisions D-01..D-09 lock the design; only mount-point detail (A1) open
- Pitfalls: HIGH — event API cited from official docs; repo pitfalls from read code

**Research date:** 2026-11-18
**Valid until:** 2026-12-18 (stable domain)
