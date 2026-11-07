# Phase 48: Real browser push & toasts — Research

**Researched:** 2026-11-07
**Domain:** Browser Notification API + minimal service worker, wired to the existing 30s poll; in-app toasts for mention/assign/comment events
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-48-1:** Delivery = minimal service worker + `Notification` API triggered from the EXISTING poll cycle (`src/core/store.js`). NOT the Web Push protocol (no VAPID, no RFC 8291, no subscription store, no new server endpoints). Email covers closed-tab delivery.
- **D-48-2:** Foreground tab → in-app toast (`src/ui/toast.js`); background/hidden tab (`document.hidden`) → browser Notification via service worker. Never both, never for already-seen events. Each event type gated by its `push_*` pref key.
- **D-48-3:** Keep the 3 granular toggles with existing server keys (`server.js` VALID_PREF_KEYS, defaults true). Remove the "Coming soon" badge (`settings.notif.pushComingSoon`, markup at `src/pages/settings.js:507-509`). On first activation, request browser permission if not yet granted.
- **D-48-4:** Denied permission → toggle still persists server-side, "browser blocked" badge (new i18n key EN+FR) + one-time explanatory toast; badge clears on a later poll when permission granted.

### the agent's Discretion
- Nothing explicitly delegated; implementation details below (seen-state mechanism, badge state storage, SW script shape) are research recommendations within the locked decisions.

### Deferred Ideas (OUT OF SCOPE)
- None raised during discussion. Email digests/reminders (Phase 38/40) stay untouched.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PUSH-01 | Real browser notifications replace the inert `push_*` toggles | Service worker at `public/sw.js` (Vite copies to `dist/`), registered from `src/main.js`; notifications fired via `registration.showNotification()` from the poll in `main.js:76-89` |
| PUSH-02 | Toast notifications for mention/assign events | Reuse `src/ui/toast.js` `toast()`; events derived from `myNotifs()` rows with `type` in `mention`/`assign`/`comment` |
| PUSH-03 | Zero new runtime dependencies (D-12); i18n EN+FR; full suite green | SW + Notification API are browser built-ins (no npm install); `test/dependencies.test.mjs` Dockerfile pin unaffected; i18n catalogue count pin must move (see Validation Architecture) |
</phase_requirements>

## Summary

The codebase is already push-ready in every place that matters. The server whitelists the three `push_mention`/`push_assign`/`push_comment` keys and defaults them to `true` (`server.js:1195-1225`), the settings UI renders the three rows with a "Coming soon" badge (`src/pages/settings.js:507-509`), the toggle handler (`IN.npToggle`, `src/actions/actions.js:2775-2794`) already persists them correctly through the existing one-branch path — so **no pref-pipeline work is needed at all**. The static server already anticipates `sw.js` with a `no-cache` Cache-Control rule (`server.js:5181`), and `sw.js` belongs in `public/` (Vite copies `public/*` verbatim into `dist/`, which is the runtime static root and is already in the Docker COPY list — no build/Docker changes).

Notifications events derive from the workspace document's `notifs` array, not a separate activity stream. Poll (`src/main.js:71-90`) hydrates the doc every 30s; `myNotifs()` (`src/core/store.js:322-326`) scopes rows to the current member. Row `type` values are exactly `'mention'`, `'assign'`, `'comment'`, `'update'` (written at `src/actions/actions.js:168`, `:105/:231`, `:1153`, `:203`). New event detection = unread rows not in a persisted seen-set; foreground (`!document.hidden`) → toast, hidden → SW notification.

The Notification API surface needed is small and standard: `navigator.serviceWorker.register('/sw.js')`, `Notification.permission` (`'granted'|'denied'|'default'`), `Notification.requestPermission()` inside the toggle click, and `registration.showNotification(title, options)` — verified against MDN via Context7 this session. The SW script stays ~15 lines: a `notificationclick` handler that focuses/navigates, **no fetch handler, no caching** — which structurally eliminates the cache-poisoning threat class.

**Primary recommendation:** One new browser module (`src/core/push.js`) owning permission state, seen-set, and the toast-vs-notification branch; a ~15-line `public/sw.js`; three-line registration in `main.js`; badge swap in `settings.js`; 5-6 new i18n keys EN+FR (and `pushComingSoon` removed); one new node:test file mocking `navigator.serviceWorker`/`Notification` per the existing stub precedent.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Permission request / state | Browser (client JS) | — | `Notification.permission`/`requestPermission` are page-side APIs; server stores only the intent pref |
| New-event detection | Browser (client JS, poll) | API (existing hydrate) | D-48-1: client derives events from poll response; zero new endpoints |
| Foreground toast | Browser (client JS) | — | Existing `src/ui/toast.js` |
| Background notification | Browser (service worker) | Browser (client JS shows it) | `registration.showNotification()` is called from the page (pre-localized strings), SW only handles clicks |
| Notification click routing | Browser (service worker) | — | `notificationclick` in sw.js → `clients.matchAll`/`openWindow` |
| `push_*` pref persistence | API (existing) | — | Already complete: whitelist, defaults, PUT endpoint, `npToggle` handler |
| sw.js serving | CDN/Static (server.js static) | Build (Vite publicDir copy) | `ROOT = dist` at runtime (`server.js:71`); `public/` → `dist/` at build |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none — browser built-ins) | — | `Notification` API, `ServiceWorkerRegistration.showNotification`, `document.visibilityState` | D-12 zero-dependency mandate; no npm install |

### Supporting
None. No new package of any kind (runtime OR dev). The icon set already carries `bell`/`bell-off` (used in `src/pages/design-system.js:174`, `src/pages/inbox.js`) — no icons-baseline change needed.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Poll-driven Notification (chosen, D-48-1) | Real Web Push (Push API + VAPID) | Requires server push-subscription store + RFC 8291 payload crypto (~500-600 hand-rolled lines per D-12); rejected as disproportionate — email covers closed-tab delivery |
| SW `fetch` handler with offline cache | None (no fetch handler) | Any fetch handler reintroduces cache-poisoning surface for zero phase benefit |
| i18n inside sw.js | Pre-localized strings passed from page to `showNotification()` | The page calls `showNotification` (MDN-verified pattern), so SW never needs the catalogue — avoids importing `src/core/i18n.js` (whose glob-import of locales is Vite-coupled) into a plain worker |

**Installation:**
```bash
# nothing to install — D-12 holds
```

**Version verification:** N/A — no packages. Registry/legitimacy gate not applicable this phase (no installs; skipped rather than "passed").

## Package Legitimacy Audit

Not applicable — this phase installs zero external packages (D-48-1 + D-12). No `npm install` tasks may appear in the plan.

## Architecture Patterns

### System Architecture Diagram

```
                     ┌────────────────────────────── Browser tab ─────────────────────────────┐
                     │                                                                        │
 other members ──►   │  30s poll (main.js pollNotifs) ──► hydrateFromServer() ──► doc.notifs  │
      │              │            │                                                            │
      │              │            ▼                                                            │
      │              │  diff vs seen-set (localStorage, per user+workspace)                    │
      │              │            │  new unread rows, type ∈ {mention, assign, comment}        │
      │              │            │  gated by S.notifPrefs.push_<type>                         │
      │              │            ▼                                                            │
      │              │   ┌── document.hidden? ──┬── yes ──► SW registration.showNotification() │
      │              │   │                      │              (title/body pre-localized)     │
      │              │   └── no ──► toast(msg) (src/ui/toast.js)                             │
      │              │                                                                        │
      │              │  settings toggle click ──► Notification.requestPermission()            │
      │              │        │                    granted → save pref (npToggle, unchanged)  │
      │              │        └ every poll: Notification.permission re-checked                │
      │              │                    denied → "browser blocked" badge + 1-time toast     │
      └──────────────┼────────────────────────────────────────────────────────────────────────┘
                     │                        ▲ notificationclick
                     │  public/sw.js ─────────┘ (focus existing client / openWindow task URL)
                     │        ▲ served no-cache
        GET /sw.js ──┘   server.js static (ROOT=dist, cacheControl sw.js → no-cache, :5181)
```

Primary use case: another member mentions you with your tab in the background → within one 30s poll, a browser Notification appears → clicking it focuses/navigates to the task. With the tab foreground → a toast appears instead.

### Recommended Project Structure
```
public/
└── sw.js                    # NEW — ~15 lines: notificationclick handler only, no fetch handler
src/
├── core/
│   └── push.js              # NEW — permission state, seen-set, notifyEvent() branch (toast vs SW)
├── pages/
│   └── settings.js          # EDIT — swap "Coming soon" badge for permission-aware badge (:507-509)
main.js                      # EDIT — register '/sw.js'; hook event dispatch into pollNotifs
test/
└── browser-push.test.mjs    # NEW — node:test with navigator/Notification/SW stubs
```

### Pattern 1: Show a notification through the SW from the page (pre-localized)
**What:** The page owns i18n; the SW is a dumb click router.
**When to use:** Every background event (D-48-2 hidden branch).
**Example:**
```javascript
// Source: Context7 /mdn/content — ServiceWorkerRegistration.showNotification()
// Page side (src/core/push.js):
if (!('Notification' in window)) return;
if (Notification.permission !== 'granted') return;
const reg = await navigator.serviceWorker.getRegistration();
if (reg) await reg.showNotification(title, { body, tag: `gr8r-${notifId}`, icon: '/favicon.svg' });
else new Notification(title, { body }); // SW not yet active — constructor fallback (MDN pattern)
```

### Pattern 2: SW click routing (whole sw.js)
**Example:**
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

### Pattern 3: Seen-set diff (no double notify)
```javascript
// localStorage key per user+workspace: 'projects.pushSeen.<wsId>.<userId>' → JSON array of seen notif ids
// On each poll: candidates = myNotifs().filter(n => !n.read && !seen.has(n.id)
//   && (n.type === 'mention' ? np.push_mention : n.type === 'assign' ? np.push_assign : n.type === 'comment' ? np.push_comment : false));
// mark all candidate ids seen BEFORE dispatching (poll is the delivery guarantee; a missed notification is not re-delivered by design — email is the backstop)
```

### Anti-Patterns to Avoid
- **Importing `src/core/i18n.js` into sw.js:** the locale glob is Vite-plugin-coupled (`vite.config.js` `localeSubset`); a plain worker can't resolve it. Pass localized strings from the page.
- **Adding a `fetch`/`install`/`activate` caching handler to sw.js:** re-invents offline caching, adds a stale-bundle bug class, and creates the cache-poisoning surface. The `no-cache` header only forces revalidation — an SW that caches its own assets defeats it.
- **Using the `Notification` constructor while SW exists:** MDN shows the constructor as fallback only; when a registration is active, always `registration.showNotification()` (constructor-fired notifications aren't clickable-routed through the SW on all browsers).
- **Notifying on `type: 'update'` or reminder rows:** only `mention`/`assign`/`comment` map to `push_*` keys (`due_reminder`/`past_due` are email-pref keys — G-37-2 removed the push_due toggle; do not resurrect).
- **Requesting permission on page load:** request inside the toggle-on click handler (user gesture, D-48-3 "on first activation").

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Web Push payload encryption / subscriptions | VAPID + aes128gcm | Not built (D-48-1) — email is the closed-tab channel | ~500-600 lines of crypto for little gain |
| Toast UI | Any new toast component | `toast()` from `src/ui/toast.js` | Exists, esc()'d, action-button support, i18n'd dismiss label |
| Notification text building | New copy logic | Mirror `notifText`/`notifIcon` semantics (`src/pages/inbox.js:38+`) with plain-text variants of the same catalogue keys | Consistency with the inbox surface |
| Pref persistence | Any new endpoint/branch | `IN.npToggle` unchanged | Already correct end-to-end (server whitelist + defaults verified) |

**Key insight:** the only genuinely new code is event derivation + permission-state UX; everything it touches already exists and is tested.

## Runtime State Inventory

Not a rename/refactor/migration phase — but the "absent runtime state" answers matter here:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `push_*` prefs already stored server-side (whitelisted, defaulted true); no backfill | None |
| Live service config | None — zero new endpoints (D-48-1) | None |
| OS-registered state | None — no OS registrations involved | None |
| Secrets/env vars | None | None |
| Build artifacts | `dist/` regenerates from `public/` on `npm run build`; stale `dist/` in dev simply won't have sw.js until a rebuild — dev flow uses `npm run dev` (Vite serves `public/` live) | Rebuild before `npm start` against a stale dist (routine) |

## Common Pitfalls

### Pitfall 1: SW scope in dev vs prod
**What goes wrong:** Registering `'/sw.js'` fails or narrows scope if the script is served from a subpath; `STATIC_DIR` override (`server.js:71`) can relocate the root.
**Why it happens:** Default SW scope = script's directory (MDN-verified).
**How to avoid:** Serve from `public/sw.js` → dist root; register `navigator.serviceWorker.register('/sw.js')` (scope `/` default). Never register a relative path from a routed URL.
**Warning signs:** `SecurityError` or notifications only working on `/` routes.

### Pitfall 2: Permission re-check misses the "later granted" case (D-48-4)
**What goes wrong:** Badge sticks after the user re-enables in browser settings.
**Why it happens:** Permission state cached in a module variable instead of re-read.
**How to avoid:** Read `Notification.permission` fresh inside every poll tick (it is a cheap sync property) and derive the badge from it; badge is *derived state*, never stored. Note: while the tab is open, browsers update `Notification.permission` when the user changes site settings.
**Warning signs:** Badge clearing only after a full reload.

### Pitfall 3: Double notify on hydration vs poll
**What goes wrong:** Initial page load (hydrate on route entry) fires toasts for a backlog of old unread rows.
**Why it happens:** Same diff logic runs on the first hydrate.
**How to avoid:** On first hydrate for a session, prime the seen-set silently (no notify); only diffs from the *second* data arrival onward notify. Scope the seen-set per user+workspace so switching accounts doesn't replay the other account's inbox.
**Warning signs:** Toast storm on every login.

### Pitfall 4: Poll skips silently
**What goes wrong:** `pollNotifs` bails when `!api.enabled || !api.user || S.ui.conflict || hasPendingChanges() || S.ui.auth` (`main.js:77-79`) — local demo mode and pending local edits suppress polling, so events during an unsaved edit never notify.
**Why it happens:** Hydration must not clobber the client copy (existing invariant, keep it).
**How to accept:** This is correct behavior; document that event delivery is best-effort within a signed-in, quiescent tab. Do not add a parallel fetch channel.

### Pitfall 5: `test-concurrency` + shared global stubs
**What goes wrong:** A new test file stubbing `navigator`/`Notification` at module top level can leak across files? No — each `node --test` file runs in its own process; but the stub must be installed **before** the dynamic `import()` of browser modules (see precedent).
**How to avoid:** Follow `test/i18n-search.test.mjs:28-45`: stub `document`, `navigator`, `localStorage`, `matchMedia`, `addEventListener` as globals, then `register(helpers/virtual-icons-loader.mjs)` and dynamic-import the module under test.

## Code Examples

### Toggle + permission wiring (settings side, D-48-3/D-48-4)
```javascript
// Source: repo — IN.npToggle at src/actions/actions.js:2775 (unchanged persistence);
// permission side-effect added as a pre-step when turning push_* ON:
IN.npToggle = async el => {
  if (el.checked && el.dataset.k.startsWith('push_') && 'Notification' in window
      && Notification.permission === 'default') {
    await Notification.requestPermission(); // user-gesture context
    if (Notification.permission === 'denied') {
      // one-time explanatory toast; fall through — pref still persists (D-48-4)
      toast(t('toast.pushBrowserBlocked'), { kind: 'err', ms: 9000 });
    }
  }
  /* …existing npToggle body unchanged… */
};
```

### Permission-aware badge (D-48-4, derived each render/poll)
```javascript
// settings.js notif-push section — replace the :507-509 badge argument:
const blocked = 'Notification' in window && Notification.permission === 'denied';
srow(t('settings.notif.mentions'), blocked ? `<span class="badge bad">${t('settings.notif.pushBrowserBlocked')}</span>` : '', tog('push_mention', np.push_mention, 'np'))
```
The poll already calls `render()` when the unread count changes; add a permission-change re-render trigger (cheap: compare `Notification.permission` against a memo each poll, exactly like `_pollUnread`).

### SW registration (main.js, near the poll block)
```javascript
if ('serviceWorker' in navigator && api.enabled) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `new Notification()` from page | `registration.showNotification()` via SW, constructor only as fallback | Stable for years (MDN documents both; SW form is the recommended path) | Click routing + OS-level integration only work via SW on all evergreen browsers |
| Web Push for everything | Push protocol for closed-tab; in-page Notification for open-tab | — | This phase needs only the in-page path (D-48-1) |

**Deprecated/outdated:** none relevant. No dependencies in this phase means no deprecation risk.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vite copies `public/*` verbatim into `dist/` (default `publicDir`); evidence: `dist/` already contains `favicon.svg`, `logo-*.svg` which exist only in `public/` [VERIFIED: repo — dist/ vs public/ listing]. The *mechanism* (default publicDir, no override in vite.config.js) is [ASSUMED] | sw.js placement | sw.js missing from dist in production → 404 on register; caught by a build check in the plan |
| A2 | `c.navigate(url)` on a focused WindowClient is a safe optional API; if absent, `openWindow` covers it | SW click routing | Minor UX difference only |
| A3 | Browsers keep `Notification.permission` in sync while the tab stays open (badge clears without reload) | Pitfall 2 | Worst case badge clears on next navigation/reload — D-48-4 says "clears on a later poll"; if a browser lags, an explicit re-check on `visibilitychange` is the mitigation |
| A4 | `notification.data.url` construction: task deep-links follow the existing route grammar; plan should reuse the same `data-a="openNotif"` target resolution the inbox uses (route ids in `src/shell/render.js`) rather than inventing a URL shape | SW click routing | Broken deep link — planner should pin the exact route string in the plan |

## Open Questions

1. **Toast copy source for events** — the inbox renders `notifText(n)` with HTML (`<b>` for the actor name); toasts need plain text and `esc()` discipline. *Recommendation:* add 3 plain-text catalogue keys (`act`-style with `{name}`/`{title}` vars) rather than stripping HTML from `notifText`. Planner decides exact keys.
2. **Exact badge visual class** — `badge bad` vs a new variant; follow existing `badge` usage in `src/pages/settings.js`/`notifications.js`. Low risk, implementer's call within the design system.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | test suite, server | ✓ | engines `>=24` [VERIFIED: package.json] | — |
| Vite (dev) | `npm run dev` serves `public/sw.js` | ✓ | ^6.4.4 [VERIFIED: package.json] | — |
| Modern browser with SW + Notification | runtime feature | Assume target browsers (existing PWA-era baseline); graceful no-op via `'Notification' in window` / `'serviceWorker' in navigator` guards | — | Feature silently disabled; toggles still persist (D-48-4 "blocked" badge shows for denied; unsupported shows nothing) |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — all optional features degrade gracefully in-page.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in), run via `npm test` = `node --test --test-concurrency=2 test/*.test.mjs` [VERIFIED: package.json scripts] |
| Config file | none — glob convention |
| Quick run command | `node --test test/browser-push.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PUSH-01 | sw.js exists in public/, contains no fetch handler, registers click handler only | static/file test | `node --test test/browser-push.test.mjs` | ❌ Wave 0 |
| PUSH-01 | Notification shown for new unseen event when `document.hidden` and pref on; NOT shown when pref off; NOT shown for already-seen ids | unit w/ stubs | `node --test test/browser-push.test.mjs` | ❌ Wave 0 |
| PUSH-02 | Toast path chosen when not hidden; not both channels | unit w/ stubs | `node --test test/browser-push.test.mjs` | ❌ Wave 0 |
| PUSH-01/03 | D-48-4: denied → badge rendered, pref still PUT; granted later → badge absent | unit w/ stubs | `node --test test/browser-push.test.mjs` | ❌ Wave 0 |
| PUSH-03 | i18n: new keys present EN+FR, `settings.notif.pushComingSoon` removed | catalogue test (update pins) | `npm test` (i18n-core-features) | ✅ update |
| PUSH-03 | D-12: Dockerfile COPY list unchanged | existing | `node --test test/dependencies.test.mjs` | ✅ |

### Sampling Rate
- **Per task commit:** `node --test test/browser-push.test.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green + `npm run i18n:scan` (runs in prebuild) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/browser-push.test.mjs` — new file; stub `document`/`navigator`/`localStorage`/`matchMedia`/`addEventListener` **before** dynamic import (precedent `test/i18n-search.test.mjs:28-45`); stub `Notification` as a global class with static `permission`/`requestPermission`, and `navigator.serviceWorker` with `getRegistration`/`register`
- [ ] i18n pin updates (exact edits, do these in the same task as the key changes):
  - `test/i18n-core-features.test.mjs:218` — catalogue size pin is currently `1706` [VERIFIED: test/i18n-core-features.test.mjs:218]. Net delta = (new keys) − 2 (`settings.notif.pushComingSoon` removed from BOTH en.json and fr.json). E.g. 5 new keys → `1706 + 5 − 2 = 1709`. Append the phase comment to the pin's trailing commentary per house style.
  - `test/i18n-core-features.test.mjs:167` — verbs pin `46` is UNAFFECTED (no new server endpoints, D-48-1). Verify the plan adds none.
  - `test/i18n-core-features.test.mjs:228` — icons baseline pin `169` is UNAFFECTED if no new icon is used; `bell`/`bell-off` already exist in the baseline. Prefer them; if a genuinely new glyph is chosen, this pin and `test/fixtures/icons-baseline.json` must move.

### Suggested new i18n keys (EN+FR, planner finalizes names)
`settings.notif.pushBrowserBlocked` (badge), `toast.pushBrowserBlocked` (one-time explanation), `toast.pushMention` / `toast.pushAssign` / `toast.pushComment` (plain-text event lines with `{name}`/`{title}` vars), optionally `page.notifications.pushBlockedHint`. All notification title/body strings are passed pre-localized from the page — sw.js holds zero strings.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | unchanged — no new endpoints (D-48-1); poll rides existing session |
| V3 Session Management | no | unchanged |
| V4 Access Control | no | notifications derive only from `myNotifs()` (server-scoped rows); no new data exposed |
| V5 Input Validation | yes | `esc()` on every interpolated string in toast HTML (`src/ui/toast.js` already esc's `msg` and `action`); plain-text `options.body` for SW notifications — never HTML |
| V6 Cryptography | no | none hand-rolled (Web Push crypto explicitly rejected, D-48-1) |
| V14 Configuration | yes | sw.js served `no-cache` (`server.js:5181`); no fetch handler → no cached-response poisoning surface |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via notification/toast text (actor names, task titles, comment snippets) | Tampering | `esc()` every interpolated value (existing toast discipline); SW `body` is rendered as plain text by the OS — pass raw text, never markup; mirror `notifText`'s esc pattern |
| SW cache poisoning / stale bundle | Tampering | sw.js contains NO fetch/caching logic; static layer already `no-cache`s sw.js; assets dir keeps `immutable` only for hashed `assets/` files |
| Notification click → open redirect / arbitrary URL | Tampering | sw.js builds the URL from `e.notification.data.url` resolved against `self.location.origin` via `new URL(..., origin)` — same-origin only, never `openWindow(rawString)` |
| Permission-gating abuse (notify spam) | DoS | Per-type pref gates + seen-set dedupe + poll interval (30s) naturally rate-limits; `tag` option collapses duplicate notifications |
| Information leakage via notifications on shared machines | Information Disclosure | Respect D-48-2 gating; body carries the same snippet text already visible in email digests — no new exposure class; keep titles generic (actor + action), never raw comment text beyond the existing 70-char snippet precedent (`actions.js:1153`) |

## Sources

### Primary (HIGH confidence)
- Context7 `/mdn/content` — `ServiceWorkerRegistration.showNotification()`, `Notification.permission` ('granted'/'denied'/'default'), `Notification` constructor fallback pattern, `ServiceWorkerContainer.register()` scope/updateViaCache semantics
- Repo (read this session): `server.js` (:71 ROOT, :1195-1225 pref keys/defaults, :5180-5184 cacheControl), `src/main.js:71-90` (poll), `src/core/store.js:296-330` (hasPendingChanges, myNotifs, notifyMembers), `src/ui/toast.js`, `src/pages/settings.js:496-517`, `src/pages/inbox.js:38-60` (notifText), `src/actions/actions.js:105,168,203,231,1153,2775-2794`, `src/core/notifPrefs.js`, `vite.config.js`, `Dockerfile`, `test/i18n-core-features.test.mjs:167,216-228`, `test/dependencies.test.mjs:28-59`, `test/i18n-search.test.mjs:28-45`

### Secondary (MEDIUM confidence)
- None needed

### Tertiary (LOW confidence)
- None — all API claims are MDN-cited or clearly flagged in Assumptions Log

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero-dependency browser APIs verified against MDN; no registry surface
- Architecture: HIGH — all integration points read and line-cited this session; existing pref pipeline needs zero changes
- Pitfalls: HIGH — every pitfall traces to code actually read (poll guards, i18n pins, mock precedent, cache-control rule)

**Research date:** 2026-11-07
**Valid until:** 2026-12-07 (stable domain; browser APIs frozen for years)

## RESEARCH COMPLETE
