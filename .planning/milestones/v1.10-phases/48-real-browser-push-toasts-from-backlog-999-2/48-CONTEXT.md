# Phase 48 — Context: Real browser push & toasts

**Phase:** 48-real-browser-push-toasts-from-backlog-999-2
**Discussed:** 2026-11-07 (owner)
**Source:** backlog 999.2 (Phase 41 email-notification audit deferrals, Kanzo projectsstudio#6)

## Domain Boundary

Replace the three inert browser-push toggles (`push_mention` / `push_assign` / `push_comment`,
currently showing a "Coming soon" badge) with real in-app feedback, and add toast feedback for
mention/assign events. Nothing else — email digests/reminders are Phase 38/40 territory and
stay untouched.

## Decisions

- **D-48-1:** Delivery mechanism — poll + Notification API (NOT Web Push protocol)

The browser notification path is a **minimal service worker + `Notification` API triggered
from the existing poll cycle** (`src/core/store.js` poll). Rationale:

- Real Web Push (VAPID + RFC 8291 aes128gcm payload encryption, hand-rolled per D-12) is
  ~500-600 lines of delicate crypto plus a subscription store — rejected as disproportionate.
- The app already polls; if no tab is open the **email channel already covers offline
  delivery** (Phase 38 digests/reminders), so closed-tab push adds little.
- Server-side: **zero new endpoints**. The poll response already carries the activity feed;
  the client derives mention/assign events from it.

`server.js:5181` already sets `no-cache` for `sw.js` — the static serving path anticipates it.

- **D-48-2:** Foreground toast / background notification — never both, never re-notify read events

- Tab **foreground** → in-app toast only (`src/ui/toast.js`).
- Tab **background/hidden** (`document.hidden`) → browser Notification via the service worker.
- Never both for the same event; never notify for events the user has already seen (seen-state
  tracked client-side — the poll's activity cursor / last-seen timestamp).
- Respect the per-type pref keys: `push_mention` gates mention events, `push_assign` gates
  assign events, `push_comment` gates comment events.

- **D-48-3:** Settings UI — keep the 3 granular toggles, no migration

The three toggles stay granular and keep their existing server-side keys (already in
`VALID_PREF_KEYS` at `server.js:1196-1198`, defaults true at :1216-1218 — zero schema change).
On first activation, request browser permission if not yet granted. The "Coming soon" badge
(`settings.notif.pushComingSoon`, badge markup at `src/pages/settings.js:507-509`) is removed.

- **D-48-4:** Denied permission — toggle persists, badge shows blocked state, toast explains

When permission is denied (or becomes denied): the toggle still saves server-side (the
preference expresses intent), and the row shows a **"browser blocked" badge** (new i18n key,
EN+FR) instead of nothing, plus a one-time explanatory toast pointing at how to re-enable.
The badge clears on a later poll cycle if permission is granted. Never silently ignore.

## Canonical refs

- `src/ui/toast.js` — existing toast system to reuse
- `src/core/store.js:301` — poll machinery; activity feed arrives here
- `src/pages/settings.js:507-509` — the three toggle rows + badge to replace
- `server.js:1196-1198,1216-1218` — push_* pref keys (VALID_PREF_KEYS, defaults)
- `server.js:5181` — sw.js no-cache header precedent
- `docs/notification-audit.md` — Phase 39/41 audit that deferred this work

## Constraints carried in

- D-12: zero runtime dependencies — service worker and Notification API are browser built-ins
- i18n: every new user-facing string catalogued EN+FR (`npm run i18n:scan` gate)
- Motion discipline: toasts follow existing toast timings; no new animation curves
- Existing Phase 38 suppression/no-double-send invariants untouched (email channel unchanged)

## Deferred Ideas

- None raised during discussion.
