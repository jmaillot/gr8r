# Phase 48: Real browser push & toasts - Pattern Map

**Mapped:** 2026-11-07
**Files analyzed:** 7 (3 new, 4 modified — plus 2 i18n JSON edits)
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `public/sw.js` | worker/config (static asset) | event-driven (message) | `public/favicon.svg` placement + RESEARCH.md Pattern 2 (no existing SW) | partial (new category) |
| `src/core/push.js` | service (browser module) | event-driven (poll diff) | `src/core/notifPrefs.js` | exact (role + localStorage discipline) |
| `src/main.js` (MODIFIED) | entry/controller | event-driven | `src/main.js:71-90` (pollNotifs — the hook point itself) | exact |
| `src/pages/settings.js` (MODIFIED) | component (page renderer) | request-response | `src/pages/settings.js:504-512` (the `notif-push` case being edited) | exact |
| `src/locales/en.json` + `fr.json` (MODIFIED) | config (catalogue) | transform | existing `settings.notif.*` / `toast.*` key shapes | exact |
| `test/browser-push.test.mjs` | test (node:test) | transform | `test/i18n-search.test.mjs` | exact |

All analogs verified git-tracked (`git ls-files` → 8/8).

## Pattern Assignments

### `public/sw.js` (NEW — service worker, event-driven)

**Analog:** none in codebase (no SW exists). Static-file placement analog: `public/favicon.svg` (Vite `publicDir` copies verbatim to `dist/`, which is the runtime static root, `server.js` `ROOT = dist`).

**Shape to copy** (from RESEARCH.md Pattern 2 — the plan's pinned design):
```javascript
// public/sw.js — no fetch handler, no cache, no imports
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of cs) { if ('focus' in c) { await c.focus(); c.navigate?.(url); return; } }
    return self.clients.openWindow(url);
  })());
});
```

**Hard rules:** zero imports (never import `src/core/i18n.js` — its locale glob is Vite-coupled, `vite.config.js` `localeSubset`); no `fetch`/`install`/`activate` handlers; zero strings (title/body arrive pre-localized via `showNotification()` args). Already served `no-cache` by `server.js:5181` — no server change.

---

### `src/core/push.js` (NEW — browser service module, event-driven)

**Analog:** `src/core/notifPrefs.js` — the closest existing module: same directory, same plain-ES-module shape, same localStorage-with-try/catch discipline, same comment style.

**Module structure pattern** (notifPrefs.js lines 1-7, 45, 72-87):
```javascript
/* Per-user notification preferences — local-mode persistence (Phase 34, D-05/D-08).
   [block comment: phase ref, decision refs, WHY of the storage key] */
export const NOTIF_PREFS_KEY_PREFIX = 'projects.notifPrefs.';

export const notifPrefsKey = workspaceId => NOTIF_PREFS_KEY_PREFIX + (workspaceId || 'local');

export function getLocalNotifPrefs(workspaceId) {
  try {
    return { ...NOTIF_PREF_DEFAULTS, ...sanitize(JSON.parse(localStorage.getItem(notifPrefsKey(workspaceId)))) };
  } catch {
    /* storage blocked, corrupt JSON, or absent key: all-ON defaults (D-27-5) */
    return { ...NOTIF_PREF_DEFAULTS };
  }
}

export function setLocalNotifPrefs(workspaceId, prefs) {
  try {
    localStorage.setItem(notifPrefsKey(workspaceId), JSON.stringify(sanitize(prefs)));
  } catch {
    /* storage blocked or full: prefs stay for the session only */
  }
}
```

**Conventions to copy:**
- **Export style:** named `export function` / `export const`; no default exports anywhere in `src/core/`.
- **localStorage key namespacing:** `'projects.<feature>.'` prefix, scoped **per workspace** (and here per user — D-48/Pitfall 3: `'projects.pushSeen.<wsId>.<userId>'`), never inside the projects.v2 blob (D-01).
- **Every storage access in try/catch** with a comment stating the degradation behavior.
- **Header comment** cites phase + decision IDs (`Phase 34, D-05/D-08` style → here `Phase 48, D-48-2/D-48-4`).
- **Pure where possible:** noifes store import; `notifPrefs.js` deliberately avoids importing `store.js`/`api.js` — push.js may import `t` from `../core/i18n.js`, `toast` from `../ui/toast.js`, and `myNotifs` from `./store.js` (both are normal for ui-facing modules, see toast.js imports below).

**Store access pattern** (`src/core/store.js:315,339`):
```javascript
export const D = () => S.data;                    // workspace doc accessor
export const myNotifs = () => { /* rows scoped to current member, NOTIF_CAP 100 */ };
```
Use `myNotifs()` — never raw `D().notifs` filtering (myNotifs drops legacy rows without `to`). Row `type` values: `'mention'`/`'assign'`/`'comment'`/`'update'` (+ email-only `due_reminder`/`past_due` — never notify on those, G-37-2).

**showNotification branch** (RESEARCH.md Pattern 1):
```javascript
if (!('Notification' in window)) return;
if (Notification.permission !== 'granted') return;
const reg = await navigator.serviceWorker.getRegistration();
if (reg) await reg.showNotification(title, { body, tag: `gr8r-${notifId}`, icon: '/favicon.svg' });
else new Notification(title, { body }); // SW not yet active — constructor fallback
```

**esc() discipline:** toasts render HTML — every interpolated actor name/title must pass through `esc()` from `../core/utils.js` exactly as `src/ui/toast.js:15` does (`${esc(msg)}`, `${esc(opt.action)}`). SW notification `body` is plain text (OS-rendered) — pass raw text, never markup.

---

### `src/main.js` (MODIFIED — SW registration + poll hook)

**Analog:** `src/main.js:71-89` — the poll block is both the analog and the insertion point.

```javascript
/* P4-a notification poll (30s): hydrate the current workspace and re-render only
   when my unread count changed, so other members' notifications arrive without a
   full refresh. Skipped while a local edit is travelling to the server or the
   session is in conflict — hydration would clobber the client copy. */
let _pollUnread = -1;
const pollNotifs = async () => {
  if (!api.enabled || !api.user || S.ui.conflict || hasPendingChanges() || S.ui.auth) return;
  const slug = api.workspace?.slug;
  if (!slug) return;
  const res = await hydrateFromServer(slug);
  if (!res.ok) return;
  const unread = myNotifs().filter(n => !n.read).length;
  if (unread !== _pollUnread) { _pollUnread = unread; render(); }
};
setInterval(pollNotifs, 30000);
addEventListener('projects:notifs', () => pollNotifs());
```

**Conventions to copy:**
- **Import placement:** the big block of side-effect imports (lines 5-57) then named imports (58-64). New `import { ... } from './core/push.js'` goes with the named block; if push.js is a side-effect-loading module it joins the ordered import list near `./ui/toast.js` (line 14).
- **Registration pattern** (RESEARCH.md code example, matches house style of guarded one-liners):
```javascript
if ('serviceWorker' in navigator && api.enabled) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
```
- **Registration scope:** absolute `'/sw.js'` (never relative from a routed URL — Pitfall 1).
- **Event dispatch into the poll:** either call the diff inside `pollNotifs` after the unread check, or fire a custom event like the existing `projects:notifs` pattern (line 89) — one dispatch site, no parallel fetch channel (Pitfall 4: poll guards are correct, keep them).
- Comment style: decision-ID-attributed block comments above each listener.

---

### `src/pages/settings.js` (MODIFIED — badge swap in `notif-push` case)

**Analog:** the exact lines being edited, `src/pages/settings.js:504-512`:
```javascript
case 'notif-push':
  return (
    H(t('settings.notif.pushLead')) +
    srow(t('settings.notif.mentions'), `<span class="badge faint">${t('settings.notif.pushComingSoon')}</span>`, tog('push_mention', np.push_mention, 'np')) +
    srow(t('settings.notif.assignments'), `<span class="badge faint">${t('settings.notif.pushComingSoon')}</span>`, tog('push_assign', np.push_assign, 'np')) +
    srow(t('settings.notif.comments'), `<span class="badge faint">${t('settings.notif.pushComingSoon')}</span>`, tog('push_comment', np.push_comment, 'np')) +
    srow(t('settings.notif.dueReminder'), t('settings.notif.dueReminderDesc'), tog('due_reminder', np.due_reminder, 'np')) +
    srow(t('settings.notif.pastDue'), t('settings.notif.pastDueDesc'), tog('past_due', np.past_due, 'np'))
  );
```

**Conventions to copy:**
- **Row shape:** `srow(label, badgeOrDesc, tog(key, value, 'np'))` — the 3rd `'np'` arg routes the toggle to `IN.npToggle` (actions.js:2774, unchanged persistence — do not touch).
- **Badge pattern:** inline `<span class="badge ...">${t('key')}</span>` as the middle srow arg. Replace the 3 static `badge faint` "Coming soon" badges with the derived badge: `blocked ? `<span class="badge bad">${t('settings.notif.pushBrowserBlocked')}</span>` : ''` — a per-render derived value from a fresh `Notification.permission` read (D-48-4: never stored, clears on later poll). For badge class precedent check `badge`/`badge bad` usage across `src/pages/` (`errors.js`, notifications page) — research flags exact variant as implementer's call.
- **Renderer style:** pure template-string composition, no DOM mutation, every interpolated string through `t()` or `esc()`.

**Toggle permission side-effect** (`src/actions/actions.js:2774-2792`, the function to prepend to, NOT rewrite):
```javascript
IN.npToggle = async el => {
  S.notifPrefs[el.dataset.k] = el.checked;
  const wsId = api.enabled ? api.workspace?.id : D().ws.url;
  render();
  if (!api.enabled) { setLocalNotifPrefs(wsId, S.notifPrefs); return toast(t('toast.notifPrefsSaved'), { ms: 1500 }); }
  const r = await api.putNotifPrefs(wsId, S.notifPrefs);
  ...
};
```
D-48-3: `Notification.requestPermission()` goes at the top as a pre-step (user-gesture context) when `el.checked && el.dataset.k.startsWith('push_') && Notification.permission === 'default'`; denied → one-time `toast(t('toast.pushBrowserBlocked'), { kind: 'err', ms: 9000 })` and fall through (pref still persists). Everything below stays byte-identical.

---

### `src/locales/en.json` + `src/locales/fr.json` (MODIFIED)

**Analog:** existing key families in the same files: `settings.notif.pushComingSoon` (being removed), `settings.notif.mentionsDesc` (description style), `toast.notifPrefsSaved` (short toast copy style). Copy the house shapes: flat dotted keys, `{var}` interpolation for event lines (precedent: `notif.update` uses `{status}` — `src/pages/inbox.js:72`), EN and FR kept in strict key parity (i18n-core-features suite enforces catalogue pins).

Planned keys (RESEARCH.md): `settings.notif.pushBrowserBlocked`, `toast.pushBrowserBlocked`, `toast.pushMention`/`toast.pushAssign`/`toast.pushComment` (plain-text, `{name}`/`{title}` vars — toasts need plain text, NOT the HTML-bearing `notifText` output). Net catalogue-count pin move in `test/i18n-core-features.test.mjs:218` = +new keys − 2 (pushComingSoon removed from BOTH locales).

---

### `test/browser-push.test.mjs` (NEW — node:test with browser-global stubs)

**Analog:** `test/i18n-search.test.mjs:1-53` — the canonical stub-then-dynamic-import precedent.

**Stub pattern** (i18n-search.test.mjs lines 20-53, copy structure exactly):
```javascript
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { test } from 'node:test';

register(new URL('./helpers/virtual-icons-loader.mjs', import.meta.url));

/* The browser modules read `document`, `navigator` and `localStorage` while they
   load, so those globals are stubbed before the modules are imported dynamically. */
globalThis.document = {
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementById: () => null,
  addEventListener: () => {},
  body: {},
  title: '',
};
Object.defineProperty(globalThis, 'navigator', {
  value: { platform: 'Linux', userAgent: 'node' },
  configurable: true,
  writable: true,
});
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.addEventListener = () => {};

const ROOT = path.join(import.meta.dirname, '..');
const source = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const utils = await import('../src/core/utils.js');   // dynamic import AFTER stubs
```

**Extensions this test adds on top of the precedent:**
- `navigator` stub must also carry `serviceWorker: { register: async () => regStub, getRegistration: async () => regStub }` where `regStub.showNotification` records calls.
- `globalThis.Notification = class { static permission = 'default'; static requestPermission = async () => 'granted'; }` — static-property class so tests mutate `Notification.permission` per case (D-48-4 badge/blocked paths).
- **Stub order is load-bearing:** all globals BEFORE `await import('../src/core/push.js')` (each `node --test` file is its own process, so no cross-file leakage — Pitfall 5).
- **Static file test precedent:** use the `source(rel)` helper pattern (`fs.readFileSync`) for the PUSH-01 assertion that `public/sw.js` exists, contains `notificationclick` and contains NO `fetch` handler.
- Header comment block (`=====` box, lines 1-19 of the analog) explaining what is and isn't under test.
- Run: `node --test test/browser-push.test.mjs`; suite glob `test/*.test.mjs`, concurrency 2.

---

## Shared Patterns

### localStorage with try/catch degradation
**Source:** `src/core/notifPrefs.js:72-87`
**Apply to:** `src/core/push.js` (seen-set read/write)
```javascript
try { return JSON.parse(localStorage.getItem(KEY)); } catch { return fallback; }
try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* session-only */ }
```
Key prefix convention: `'projects.pushSeen.<wsId>.<userId>'` (scoped per user+workspace — Pitfall 3).

### esc() on every HTML interpolation
**Source:** `src/ui/toast.js:2,15`
**Apply to:** `src/core/push.js` toast path; settings badge strings
```javascript
import { $, esc } from '../core/utils.js';
el.innerHTML = `${icon}<span class="grow">${esc(msg)}</span>...`;
```

### toast() usage shape
**Source:** `src/ui/toast.js:8-28` and callers `src/main.js:103-120`, `src/actions/actions.js:2780`
**Apply to:** push.js foreground branch + one-time blocked toast
```javascript
toast(t('toast.pushBrowserBlocked'), { kind: 'err', ms: 9000 });
toast(msg, { kind: 'err', action: t('act.reload'), onAction: () => ... });
```
Default ms 4200; `kind: 'err'` for failures; action buttons optional.

### i18n singleton access
**Source:** every module: `import { t } from '../core/i18n.js';` then `t('key')` / `t('key', { var })`
**Apply to:** push.js (localized notification title/body), settings.js badge, toasts. Precedent for vars: `src/pages/inbox.js:60` `t(n.key, n.vars)`.

### Event-driven hook into the poll
**Source:** `src/main.js:75-89` (`pollNotifs` + `projects:notifs` listener)
**Apply to:** main.js modification — diff runs inside/after the existing poll; poll guards (`!api.enabled || !api.user || S.ui.conflict || hasPendingChanges() || S.ui.auth`) are kept, not duplicated or bypassed.

### node:test stub-then-import
**Source:** `test/i18n-search.test.mjs:26-53`
**Apply to:** `test/browser-push.test.mjs` — stubs installed before dynamic import; `register()` for the Vite virtual-icons module if any page module is imported.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `public/sw.js` | service worker | event-driven | No service worker exists in the codebase — the only static-`public/` files are SVG assets. Use RESEARCH.md Patterns 1-2 verbatim; the plan pins the full ~15-line script, so this is low-risk. |

## Metadata

**Analog search scope:** `src/core/`, `src/ui/`, `src/pages/`, `src/shell/`, `src/actions/`, `test/`, `public/`
**Files scanned:** ~12 read, 7 analogs selected (early stop; research already line-pinned most integration points)
**Pattern extraction date:** 2026-11-07
