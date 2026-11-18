# Phase 73: Install Hint Banner - Pattern Map

**Mapped:** 2026-11-18
**Files analyzed:** 6
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/main.js` (modify) | entry/listener wiring | event-driven | `src/main.js` lazy-import family (lines 48–66, 114) | exact |
| `src/features/install-banner.js` (new) | feature module (lazy chunk) | event-driven + DOM render | `src/core/push.js` (lazy-chunk module, localStorage discipline, test seams) | exact (role+data-flow) |
| `src/features/install-banner.js` render/dismiss DOM | component (vanilla DOM) | request-response (click) | `src/ui/toast.js` | role-match |
| `src/locales/en.json` + `fr.json` (modify) | config (strings) | static | existing flat-key catalogue (`"a11y.dismiss"`) | exact |
| CSS strip (new rules in `src/styles/`) | styles | static | `#toasts` in `src/styles/overlays.css:759` + `responsive.css:150` safe-area | role-match |
| `test/pwa-banner.test.mjs` (new) | test (contract/unit) | batch | `test/browser-push.test.mjs` | exact |
| `e2e/install-banner.spec.mjs` (new) | test (e2e) | request-response | `e2e/manifest.spec.mjs` (phase-72 pattern) + `e2e/demo-locale.spec.mjs` (FR switch) | role-match |

## Pattern Assignments

### `src/main.js` — listener wiring (entry, event-driven)

**Analog:** `src/main.js` itself — the established lazy-import family.

**Lazy-import pattern** (lines 48–55, 64–66):
```js
/* [67-04 Rule 3] the subtask actions ride a pre-warmed lazy chunk … */
import('./actions/subtasks.js').catch(() => {});
/* [66-02 D-13] the template actions ride a pre-warmed lazy chunk … */
import('./actions/templates.js').catch(() => {});
/* notifyNewEvents/permChanged ride the lazy push chunk (DELIV-02 index gate) */
const pushMod = () => import('./core/push.js');
```

**Listener + lazy chunk pattern** (lines 114–115):
```js
const registerSw = () => import('./core/push.js').then(m => m.registerSw()).catch(() => {});
addEventListener('load', registerSw);
```

**Banner listener to add** (copy this shape, per RESEARCH.md Pattern 1):
```js
/* [73-01] the install banner rides a lazy chunk — the entry carries only
   these two listeners; the event object is handed to the module. */
const bannerMod = () => import('./features/install-banner.js');
addEventListener('beforeinstallprompt', e => { e.preventDefault?.(); bannerMod().then(m => m.onBip(e)).catch(() => {}); });
addEventListener('appinstalled', () => { bannerMod().then(m => m.onInstalled()).catch(() => {}); });
```
Keep the comment-tag convention (`[73-01]`) matching `[67-04]`/`[66-02]`. Entry delta = 2 listeners + 1 import only (D-09, <200 bytes).

**Comment style:** every listener in main.js carries a decision-id comment block (see lines 64–66, 105–113). Copy that style for the banner listeners.

---

### `src/features/install-banner.js` (new) — lazy feature module

**Analog:** `src/core/push.js` — the closest existing lazy-chunk module: same role (browser-only feature module dynamically imported), same data flow (event-driven, window/browser primitives), same localStorage discipline, same test-seam pattern.

**Header + import pattern** (push.js lines 1–17):
```js
/* Real browser push + foreground toasts … (multi-paragraph decision comment) */
import { S, D, myNotifs, mem, task } from './store.js';
import { api, call } from './api.js';
import { deviceLabel } from './utils.js';
import { t } from './i18n.js';
import { toast } from '../ui/toast.js';
```
→ install-banner.js: relative imports only; pull `t` from `./core/i18n.js`, `S`/`api` from store/api for the route/auth guard; `esc`/`$` from `./core/utils.js` if needed.

**localStorage discipline** (push.js lines 56–72) — copy the try/catch + try/catch-write shape for the 14-day cooldown key:
```js
export function getSeen(wsId, userId) {
  try {
    const v = JSON.parse(localStorage.getItem(seenKey(wsId, userId)));
    return Array.isArray(v) ? v : [];
  } catch {
    /* storage blocked, corrupt JSON, or absent key: nothing is considered seen */
    return [];
  }
}
export function markSeen(wsId, userId, ids) {
  try {
    localStorage.setItem(seenKey(wsId, userId), JSON.stringify(...));
  } catch {
    /* storage blocked or full: the seen-set stays for the session only */
  }
}
```
Note the house convention: **fail-absent reads, silently-tolerant writes**, comment explaining why.

**Test-seam pattern** (push.js lines 33–36, 149–152) — expose live bindings the node harness can observe/replace:
```js
export let showToast = toast;
export function setToastSink(fn) { showToast = fn || toast; }
```
→ For the banner: export `onBip(e)` / `onInstalled()` (called by main.js) plus small pure seams (e.g. `cooldownExpired(now)` decision function) so unit tests don't need DOM.

**Detection matrix (RESEARCH.md Pattern 3, feature-based):**
```js
const standalone = matchMedia('(display-mode: standalone)').matches;
const hasBip = 'BeforeInstallPromptEvent' in window;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
```
Decision: standalone → never show; event captured → Chromium strip (button + X); no event AND isIOS AND not standalone → static one-liner strip; else silence (D-07). Never timeout-based (D-06).

**Cooldown (RESEARCH.md Pattern 4):**
```js
const KEY = 'pwa.installDismissedAt';
const show = () => Date.now() - (Number(localStorage.getItem(KEY)) || 0) > 14 * 864e5;
// on dismiss: localStorage.setItem(KEY, String(Date.now())); hide();
```
Number coercion with `|| 0` fallback (security note: localStorage is self-XSS only; never render its contents).

**prompt() from user gesture only (RESEARCH.md Pattern 2):**
```js
let deferred = null;
export function onBip(e) { deferred = e; if (canShow()) render(); }
export function onInstalled() { hide(); }
// Install button click handler only:
deferred.prompt();
const { outcome } = await deferred.userChoice; // 'accepted' | 'dismissed'
deferred = null;               // one shot per captured event — null it
if (outcome === 'accepted') hide();
```

**Route/auth guard (D-03)** — reuse existing signals, no new plumbing. `S.ui.auth` truthy = auth screen; `!api.enabled` = demo; pathname `/join/…` — same guards the 30s poll uses in main.js:85:
```js
if (!api.enabled || !api.user || S.ui.conflict || hasPendingChanges() || S.ui.auth) return;
```

**Mount point (A1 open question for planner):** append to `document.body`, OUTSIDE the app root — a shell `render()` would wipe an in-root banner (anti-pattern in RESEARCH.md).

---

### `src/ui/toast.js` — DOM render/dismiss pattern (role-match analog)

**Analog:** `src/ui/toast.js` lines 8–28.

**Escaped-DOM + dismiss-X pattern:**
```js
const el = document.createElement('div');
el.className = 'toast';
el.setAttribute('role', 'status');
el.innerHTML = `${icon}<span class="grow">${esc(msg)}</span>…<button class="ibtn ibtn-xs" aria-label="${t('a11y.dismiss')}" style="color:inherit;opacity:.6">${ic('x', 13)}</button>`;
const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 160); };
el.querySelector('.ibtn').onclick = kill;
```
Copy for the banner: `esc()` for every string, `t('a11y.dismiss')` for the X's aria-label (key already exists — reuse it, do not add a duplicate), `ic('x', 13)` for the dismiss icon, exit-animation-then-remove. **Exception:** the Install button and iOS one-liner copy are static catalogue strings interpolated into innerHTML with `esc()` — never inject the localStorage value or any dynamic data (V5 note in RESEARCH.md).

---

### `src/locales/en.json` / `fr.json` (modify)

**Analog:** existing flat-key catalogue (`src/locales/en.json:2-3`):
```json
{
  "app.name": "Projects Studio",
  "a11y.dismiss": "Dismiss",
```
Both files are flat `"dotted.key": "value"` maps, keys in both files symmetric. Add `pwa.install.*` keys (e.g. `pwa.install.cta`, `pwa.install.iosHint`, plus a11y labels) to **both** files in the same commit (D-08; i18n gate `build-locales.test.mjs` + i18n-scan enforce membership). iOS FR string must respect French typography rules (`test/french-typography.test.mjs` exists).

---

### CSS strip (new rules)

**Analog:** `#toasts` fixed positioning in `src/styles/overlays.css:759-769`:
```css
#toasts {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 100;
  ...
}
```
**Safe-area pattern:** `src/styles/responsive.css:150`:
```css
padding: 4px 6px calc(4px + env(safe-area-inset-bottom, 0px));
```
→ Banner: `position: fixed; bottom: 0; left: 0; right: 0;` with `padding-bottom: calc(<token> + env(safe-area-inset-bottom, 0px))`, z-index ≥ toasts (100) or just above content; use `src/styles/tokens.css` values, no ad-hoc hex.

---

### `test/pwa-banner.test.mjs` (new) — contract/unit test

**Analog:** `test/browser-push.test.mjs` (exact match for the stub discipline).

**Global-stub-before-dynamic-import pattern** (lines 19–75) — the stub order is load-bearing:
```js
register(new URL('./helpers/virtual-icons-loader.mjs', import.meta.url));
const ls = new Map();
globalThis.localStorage = { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) };
const fakeEl = () => ({ innerHTML: '', style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {}, setAttribute() {}, querySelector: () => fakeEl(), querySelectorAll: () => [] });
globalThis.document = { querySelector: () => fakeEl(), getElementById: () => fakeEl(), body: fakeEl(), createElement: fakeEl, hidden: true, /* … */ };
Object.defineProperty(globalThis, 'navigator', { value: { platform: 'Linux', userAgent: 'node' }, configurable: true });
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.addEventListener = () => {};
```
Then dynamic-`import()` the module under test AFTER stubs. For the banner test: override `matchMedia` per-test to flip `standalone`, set `navigator.userAgent` for iOS/Firefox cases, use the `ls` Map to assert the 14-day cooldown (write `pwa.installDismissedAt`, assert no-show; backdate it, assert show). Also add the static contract pin: chunk `install-banner-*` emitted by a real `vite build` + entry delta <200 B (pattern: `test/build-chunk-size.test.mjs` / `icons-baseline.json` fixture per RESEARCH.md Wave 0).

---

### `e2e/install-banner.spec.mjs` (new) — e2e test

**Analog:** `e2e/manifest.spec.mjs` (phase-72 e2e: header comment block explaining the contract, `import { test, expect } from '@playwright/test'`, webServer fixture boots `e2e/server.mjs` on built dist) + `e2e/demo-locale.spec.mjs` for the EN↔FR switching helpers.

**Event stub (RESEARCH.md, event never fires in Playwright):**
```js
await page.addInitScript(() => {
  const ev = new Event('beforeinstallprompt');
  ev.prompt = () => { ev.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' }); window.__bipPrompted = true; };
  ev.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
  setTimeout(() => window.dispatchEvent(ev), 100);
});
```
Assert: strip visible with EN text → click Install → `window.__bipPrompted` true; dismiss → reload → still hidden (cooldown); FR run reuses demo-locale helpers.

## Shared Patterns

### Lazy chunk with `.catch(() => {})` + comment tag
**Source:** `src/main.js:48-66, 114`
**Apply to:** the new `beforeinstallprompt`/`appinstalled` listeners in main.js
```js
const bannerMod = () => import('./features/install-banner.js');
```
Entry carries ONLY the listeners + import; everything else lives in the chunk (entry headroom ~2 kB of the 500 kB cap).

### Fail-absent localStorage try/catch
**Source:** `src/core/push.js:56-72`
**Apply to:** cooldown read/write in install-banner.js

### `t()` as the single string path
**Source:** `src/core/i18n.js` (module-level singleton, call-time read); catalogue keys `pwa.install.*` in both `src/locales/en.json`/`fr.json`, same commit
**Apply to:** every banner string, including aria-labels

### `esc()` + `t('a11y.dismiss')` + `ic('x', 13)` dismiss affordance
**Source:** `src/ui/toast.js:14-25`
**Apply to:** banner dismiss X

### Tokens-only styling + `env(safe-area-inset-bottom)`
**Source:** `src/styles/overlays.css:759`, `src/styles/responsive.css:150`, `src/styles/tokens.css`
**Apply to:** the fixed bottom strip

### Route/auth suppression signals
**Source:** `src/main.js:85` (`!api.enabled || !api.user || S.ui.conflict || hasPendingChanges() || S.ui.auth`), `src/main.js:310` (`/join/…` regex)
**Apply to:** banner canShow guard (D-03)

### Comment-tagged decision blocks
**Source:** house convention everywhere (`[67-04]`, `[66-02 D-13]`, `[59-UAT]`, `[D-48-x]` in main.js/push.js)
**Apply to:** every new code block references its D-xx decision id

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/features/install-banner.js` platform-detection matrix | utility | transform | No existing `beforeinstallprompt`/UA-sniff code exists; use RESEARCH.md Patterns 2–4 (feature-based, cited to web.dev/MDN) |

## Metadata

**Analog search scope:** `src/`, `src/core/`, `src/ui/`, `src/features/`, `src/styles/`, `src/locales/`, `test/`, `e2e/`
**Files scanned:** ~12 read in full or targeted
**Pattern extraction date:** 2026-11-18
