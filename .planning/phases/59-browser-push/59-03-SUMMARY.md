---
phase: 59-browser-push
plan: 03
subsystem: browser/push
tags: [service-worker, web-push, settings-ui, i18n, deep-link, uat]
requires:
  - phase: 59-01
    provides: push_subscriptions routes, /api/me/push-config fail-absent, VAPID custody, push_due pref
  - phase: 59-02
    provides: sendPushFor fan-out, ticker payload ≤4096, per-device test-send route
  - phase: 48
    provides: sw.js pinned contract (T-48-02/T-48-03), notificationclick router, derived permission badge
provides:
  - SW push event handler with D-12 open-client suppression + zero-strings display (showNotification with data.url deep-link)
  - Client helpers in src/core/push.js (fetchPushConfig/enablePush/disablePush/fetchPushDevices) with gesture-only requestPermission (D-01)
  - Settings Push tab: master enable toggle, push_due row, device list with labels + per-device send-test/unsubscribe, i18n EN+FR
affects: [verify-work phase 59 UAT routing, Phase 61 (push payload consumers), DEPLOY.md runbook users]
tech-stack:
  added: []
  patterns: [SW clients.matchAll best-effort suppression (D-12/D-13, no page↔SW handshake), user-gesture-gated permission prompt, canonical toJSON() subscription body passthrough]
key-files:
  created: []
  modified: [public/sw.js, src/core/push.js, src/pages/settings.js, src/actions/actions.js, src/main.js, src/locales/en.json, src/locales/fr.json, test/browser-push.test.mjs, test/catalogue.test.mjs (pins), Dockerfile]
key-decisions:
  - "Click-dispatch handlers use the A.push* path, not IN.push* — IN only fires on input/change, never click (data-a attributes were dead wiring until re-registered on A)"
  - "Service worker registered AFTER api.init() — the module-eval enabled-gate saw api.enabled=false forever on server deployments when registration ran at module load"
  - "SW-only best-effort suppression via clients.matchAll; no page↔SW suppression handshake (D-13)"
patterns-established:
  - "A vs IN action-handler grammar: IN = input/change dispatch, A = click dispatch — data-a buttons must register on A"
  - "Post-init SW registration ordering for enabled-gated modules"
requirements-completed: [PUSH-01, PUSH-03]
coverage:
  - id: D1
    description: "SW push handler: open-client suppression (D-12), tab-closed OS display with pre-localized ticker, malformed-payload safety, data.url deep-link via unchanged notificationclick router"
    requirement: PUSH-03
    verification:
      - kind: unit
        ref: "test/browser-push.test.mjs (stubbed-globals push-event tests: suppression, display, malformed payload)"
        status: pass
      - kind: manual_procedural
        ref: "UAT items 3–5 on production (real OS notification, deep-link, tab-open suppression)"
        status: pass
    human_judgment: true
    rationale: "OS-level notification display, deep-link navigation and suppression behavior only provable on a real device/browser"
  - id: D2
    description: "Settings Push tab: gesture-only master enable (requestPermission+subscribe), config-404 fail-absent hiding, device list with labels + per-device send-test, push_due row, EN+FR catalogue complete"
    requirement: PUSH-01
    verification:
      - kind: unit
        ref: "test/browser-push.test.mjs (enablePush/disablePush/device-list/push_due/no-gesture-prompt tests)"
        status: pass
      - kind: other
        ref: "node scripts/i18n-scan.mjs (0 dead / 0 stale EN+FR)"
        status: pass
      - kind: manual_procedural
        ref: "UAT items 1–2 on production (permission prompt from toggle only, labeled device row)"
        status: pass
    human_judgment: true
    rationale: "Permission-prompt origin (toggle-only, never page load) and the device-list UX are owner-accepted behaviors"
duration: ~3h (incl. real-device UAT checkpoint + orchestrator fixups)
completed: 2026-11-13
status: complete
plan_head_before: 7a06c2b
plan_head_after: 94774e4
commits: 13
actuals:
  tokens: 21500
  tasks: 3
  commits: 13
---

# Phase 59 Plan 03: Browser Layer — SW Handler, Settings Push Tab, Phase Gate Summary

**Service-worker push handler with open-tab suppression + deep-link display, gesture-gated Settings opt-in with device list and per-device test push, owner UAT passed 6/6 on production.**

## What was built

- **Task 1** (6ac9080 RED + 6d303a9 feat): single `push` listener in `public/sw.js` — `clients.matchAll({type:'window', includeUncontrolled:true})` suppression (D-12/D-13), try/catch payload parse, `showNotification` with ticker payload + `data:{url}` feeding the unchanged `notificationclick` router. Zero new strings; no fetch/install/activate/import tokens; pinned substrings byte-identical.
- **Task 2** (824165c RED + 58836eb feat): `src/core/push.js` helpers (`fetchPushConfig`/`enablePush`/`disablePush`/`fetchPushDevices`) with in-flight double-click guard, canonical `toJSON()` body passthrough, gesture-only `requestPermission` (D-01); Settings `notif-push` case extended with master toggle (config-404 fail-absent hide), `push_due` row (D-09), device list with per-device send-test (`POST /api/me/push-subscriptions/test`) + unsubscribe; `err.pushSubscribeFailed` + Settings keys added EN+FR, catalogue pins amended; standing-gate pin amendments (2992d49).
- **Task 3** (checkpoint): full standing gate green — **1489 tests / 0 fail, lint clean, i18n 0 dead/0 stale, e2e 111/111** — then the blocking-human UAT checkpoint. **Owner confirmed all six UAT items PASSED on production** (https://projects.jeremymaillot.fr, Windows Firefox + second device):
  1. Permission prompt fires from the Settings toggle only ✓
  2. Device list shows the labeled device ("Windows · Firefox") ✓
  3. Send test → real OS notification with test ticker, verified with the app tab CLOSED (tab open → no OS banner, D-12 working) ✓
  4. Clicking the OS notification deep-links into the app (workspace root → configured home view) ✓
  5. D-12 suppression: no OS banner while an app tab is open ✓
  6. After `docker restart projects-studio`, the device still receives pushes without re-subscribing; VAPID keys loaded from the persisted file (PUSH-05 restart proof) ✓

## Verification

- `node --test test/browser-push.test.mjs` — green
- `npm test` — 1489 tests, 0 fail; `npm run lint` — clean; `node scripts/i18n-scan.mjs` — 0 dead/0 stale; `npm run e2e` — 111/111
- Owner UAT: 6/6 items passed on production (see above)

## Deviations from Plan

### Auto-fixed Issues (orchestrator-landed post-checkpoint fixes — Rule 1/3 deviations of this plan)

**1. [Rule 3 - Blocking] Phase 58 packaging gap: search-terms.mjs missing from Docker runtime stage**
- **Issue:** container boot crashed on db-adapter import (pre-existing phase 58 gap, surfaced while verifying this phase on the live deployment).
- **Fix:** Dockerfile ships `search-terms.mjs` in the runtime stage; D-12 Dockerfile pin amended.
- **Committed in:** 36bf788

**2. [Rule 1 - Bug] VAPID test fixture did not truly decode**
- **Issue:** fixture key `_-s=` decoded outside the intended [255,251] byte pair.
- **Fix:** fixture changed to `__s` (truly decodes [255,251]).
- **Committed in:** a2bca20

**3. [Rule 1 - Bug] Service worker registered before api.init() — never registered on server deployments**
- **Issue:** the module-eval gate read `api.enabled=false` forever at registration time, so the SW never registered where the module gate applies (UAT item 2 gap).
- **Fix:** `src/main.js` registers the SW after `api.init()`; D-12 pin amended for search-terms.mjs.
- **Committed in:** 687bbe3

**4. [Rule 1 - Bug] Push buttons wired data-a but registered as IN handlers — dead UI**
- **Issue:** `IN.push*` only fires on input/change, never click, so the data-a push buttons were dead (UAT item 2 gap). Interim 040f57d rewired to data-in; final 94774e4 moved handlers to the `A.push*` click path (data-a preserved, pin counts amended).
- **Fix:** handlers + buttons both use the A click-dispatch path.
- **Committed in:** 040f57d + 94774e4

**5. [Rule 2 - Missing critical] Silent enablePush failure paths**
- **Issue:** subscribe failures failed silently — no user feedback.
- **Fix:** error toast on pushSubscribeFailed error codes (`err.pushSubscribeFailed` EN+FR key added, error-codes client allowlist + catalogue pins amended).
- **Committed in:** 26a7644

---

**Total deviations:** 5 auto-fixed (4 Rule 1 bugs, 1 Rule 2 missing-critical; all landed by the orchestrator after the UAT checkpoint, each commit green on the standing gate).
**Impact on plan:** All fixes necessary for the UAT items to pass on the real deployment; no scope creep. Fixup lessons recorded as key-decisions (A vs IN dispatch grammar; post-init SW registration).

## Issues Encountered

- UAT item 2 (Settings toggle/device list) initially failed on production due to deviations 3–5 above; all resolved and re-verified by the owner before approval.

## User Setup Required

None beyond Plan 01's DEPLOY.md §16 (VAPID custody) — owner already configured; restart proof confirmed by UAT item 6.

## Next Phase Readiness

- Phase 59 complete (3/3 plans); PUSH-01..05 all delivered and owner-accepted.
- Ready for Phase 60 (Admin Dashboard & Member Self-View) and Phase 61 (Notification Trim — burst handling rides `sendPushFor`).

---
*Phase: 59-browser-push*
*Completed: 2026-11-13*
