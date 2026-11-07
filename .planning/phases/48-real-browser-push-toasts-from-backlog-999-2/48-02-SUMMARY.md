---
phase: 48-real-browser-push-toasts-from-backlog-999-2
plan: 02
subsystem: ui
tags: [notifications, permissions, service-worker, i18n, settings]

# Dependency graph
requires:
  - phase: 48-01
    provides: push.js permission state + toast seam, minimal sw.js, poll hook in main.js, 5 i18n keys (incl. settings.notif.pushBrowserBlocked, toast.pushBrowserBlocked)
provides:
  - Derived per-render "browser blocked" badge on the three push_* settings rows (no stored state)
  - requestPermission user-gesture pre-step in IN.npToggle with byte-identical persistence body
  - One-time-per-session explanatory blocked toast (push.js blockedToastOnce)
  - Poll permission memo (_pollPerm) that clears the badge without a reload
  - Final catalogue 1710 (EN-counted), pushComingSoon removed from EN+FR
affects: [verify-work phase 48, future notification/pref phases]

# Actuals (#2632)
actuals:
  tokens: 54000   # chars/4 over the realized diff (~217 insertions / ~44 deletions across 12 files)
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Derived badge per render from a live Notification.permission read (never stored; D-48-4)"
    - "Prepended permission pre-step in an action handler — persistence body byte-identical below (D-07 style, purely additive diff)"
    - "Module-scoped one-time session flag helper (blockedToastOnce) observable via the existing setToastSink seam"

key-files:
  created: []
  modified:
    - src/pages/settings.js
    - src/actions/actions.js
    - src/core/push.js
    - src/main.js
    - src/locales/en.json
    - src/locales/fr.json
    - test/browser-push.test.mjs
    - test/i18n-core-features.test.mjs
    - test/unsubscribe-route.test.mjs

key-decisions:
  - "Catalogue pin 1711 → 1710, not the plan's 1709: the pin counts EN keys only, so the two-file −2 total (EN+FR) is −1 in the catalogue (Rule 1 plan-arithmetic fix)"
  - "Blocked-toast observability reuses the 48-01 setToastSink seam — no second mechanism"
  - "The npToggle success toast is asserted indirectly via the localStorage prefs key (actions.js's own toast binding is not seamable without touching unrelated imports)"

patterns-established:
  - "pollPerm/_pollPerm memo: cheap sync permission read every poll tick, one combined render with the unread diff"
  - "badge-placement pin test re-derives from the notif-push case block (source contract style)"

requirements-completed: [PUSH-01, PUSH-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Coming-soon badge gone from the three push_* rows; toggles persist through the unchanged npToggle body"
    requirement: PUSH-01
    verification:
      - kind: unit
        ref: "test/unsubscribe-route.test.mjs#badge-placement pin (D-11/D-12/48-02)"
        status: pass
      - kind: unit
        ref: "test/browser-push.test.mjs#permission default + toggle-ON of a push_* key"
        status: pass
    human_judgment: false
  - id: D2
    description: "Denied permission shows the derived 'browser blocked' badge (badge red), derived per render, never stored"
    requirement: PUSH-01
    verification:
      - kind: unit
        ref: "test/unsubscribe-route.test.mjs#badge-placement pin (D-11/D-12/48-02)"
        status: pass
    human_judgment: true
    rationale: "The visual badge rendering against a really-denied browser is browser-native behavior; the source pin + derived-expression test cover the logic, the visual look is a judgment call for UAT"
  - id: D3
    description: "requestPermission fires only on push_* toggle-ON while permission is 'default'; denied → one-time toast + pref persists; granted and non-push keys unaffected"
    requirement: PUSH-03
    verification:
      - kind: unit
        ref: "test/browser-push.test.mjs#permission default + toggle-ON of a push_* key: requestPermission fires exactly once"
        status: pass
      - kind: unit
        ref: "test/browser-push.test.mjs#permission denied after the request: the blocked toast fires exactly ONCE"
        status: pass
      - kind: unit
        ref: "test/browser-push.test.mjs#permission granted: no requestPermission call and no blocked toast"
        status: pass
      - kind: unit
        ref: "test/browser-push.test.mjs#toggling a non-push key never touches the permission API"
        status: pass
    human_judgment: false
  - id: D4
    description: "Badge clears without reload after a denied → granted permission flip on a later poll tick"
    requirement: PUSH-03
    verification:
      - kind: unit
        ref: "test/browser-push.test.mjs#permChanged fires exactly once on a denied → granted flip"
        status: pass
      - kind: unit
        ref: "test/browser-push.test.mjs#main.js wires the permission memo into the poll render condition"
        status: pass
    human_judgment: true
    rationale: "Multi-session browser permission flip (settings change while the tab stays open) cannot be exercised under the stub harness; the pure seam + source contract cover the trigger logic"
  - id: D5
    description: "Catalogue at its final size, EN+FR parity, pushComingSoon removed from both locales, i18n gate green"
    requirement: PUSH-01
    verification:
      - kind: unit
        ref: "test/i18n-core-features.test.mjs#the catalogue holds after the billing removal …"
        status: pass
      - kind: other
        ref: "npm run i18n:scan (0 literals, 0 pending, 0 stale)"
        status: pass
    human_judgment: false

# Metrics
duration: 14min
completed: 2026-11-07
status: complete
---

# Phase 48 Plan 02: Permission-aware settings UI Summary

**Derived browser-blocked badge + requestPermission user-gesture pre-step in npToggle (one-time denied toast), poll permission memo that clears the badge without reload, catalogue at 1710**

## Performance

- **Duration:** 14 min
- **Started:** 2026-11-07T13:06:06Z
- **Completed:** 2026-11-07T13:20:00Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- The three "Coming soon" badges are gone: the notif-push rows now show a "browser blocked" badge derived per render from a live `Notification.permission === 'denied'` read (reuses `.badge.red`, zero new CSS — T-48 pin held)
- `IN.npToggle` gained a PREPENDED permission pre-step: only a push_* toggle-ON while permission is `default` calls `requestPermission()` inside the click; `denied` fires `blockedToastOnce()` (once per session); the persistence body below is byte-identical (purely additive diff, D-07 invariant)
- `main.js` pollNotifs now diffs `_pollPerm` beside `_pollUnread` — one combined render, so the badge clears without a reload after a denied → granted flip (D-48-4)
- `settings.notif.pushComingSoon` removed from EN+FR; catalogue pin moved with honest arithmetic (see Deviations); full suite + i18n:scan + dependencies green; package.json/Dockerfile untouched (D-12)

## Task Commits

1. **Task 1: Badge swap + pushComingSoon removal + catalogue pin** - `9cd658b` (feat)
2. **Task 2 (TDD RED): npToggle pre-step behaviors** - `52aeb75` (test)
3. **Task 2 (TDD GREEN): requestPermission pre-step + blockedToastOnce** - `8643d85` (feat)
4. **Task 3: Poll permission memo + full-suite gate** - `4ff18f0` (feat)

## Files Created/Modified
- `src/pages/settings.js` - derived blocked badge in the notif-push case (D-48-4)
- `src/actions/actions.js` - prepended requestPermission pre-step + push.js import
- `src/core/push.js` - `blockedToastOnce()` one-time session flag; `permChanged()` pure seam
- `src/main.js` - `_pollPerm` memo in pollNotifs, combined render condition
- `src/locales/en.json`, `src/locales/fr.json` - pushComingSoon deleted
- `test/browser-push.test.mjs` - fakeEl DOM harness extension; 4 pre-step behaviors + 2 poll-memo tests (17 total)
- `test/i18n-core-features.test.mjs` - catalogue pin 1711 → 1710
- `test/unsubscribe-route.test.mjs` - badge-placement pin re-derived for the new badge

## Decisions Made
- Catalogue pin 1710 (not the planned 1709): the pin counts `Object.keys(en)` only — the plan's "−2 total" spans both locale files, so the EN catalogue moves by −1. Comment documents the reconciliation.
- Blocked-toast observability rides the existing 48-01 `setToastSink` seam (no duplicate mechanism, per plan).
- The npToggle success-toast assertion is indirect (localStorage prefs key) — actions.js's own `toast` import is not seamable without unrelated changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's catalogue pin arithmetic was wrong (1709 → 1710)**
- **Found during:** Task 1 (i18n suite run)
- **Issue:** The plan pinned 1709 assuming a −2 catalogue move, but the catalogue test counts EN keys only; deleting one EN key moves it −1 (1711 → 1710). The planned pin made the suite fail with actual 1710.
- **Fix:** Pin set to 1710 with a comment reconciling the −2-both-files vs −1-catalogue arithmetic; test title updated.
- **Files modified:** test/i18n-core-features.test.mjs
- **Verification:** `node --test test/i18n-core-features.test.mjs` green (fail 0)
- **Committed in:** 9cd658b (Task 1 commit)

**2. [Rule 1 - Bug] Stale badge-placement pin in test/unsubscribe-route.test.mjs**
- **Found during:** Task 3 (full-suite gate)
- **Issue:** An existing D-11/D-12 test pinned `settings.notif.pushComingSoon` decorating exactly the three push rows — directly invalidated by Task 1's badge swap.
- **Fix:** Re-derived the pin for the new badge (live permission read, catalogue label, no pushComingSoon, functional rows badge-free, toggles still tog()-rendered and never disabled). D-11/D-12 invariants preserved.
- **Files modified:** test/unsubscribe-route.test.mjs
- **Verification:** `node --test test/unsubscribe-route.test.mjs` green (15 pass)
- **Committed in:** 4ff18f0 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 × Rule 1 — both test-pin arithmetic/staleness directly caused by this plan's changes).
**Impact on plan:** None — in-scope corrections of pins invalidated by the planned changes.

## Issues Encountered
- The known pre-existing totp-rewrap D-74 environmental failure (EACCES, documented in STATE.md Deferred Items) is the ONLY failure in the full suite: 1080/1081 green. Not touched (out of scope, per prior-wave context).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 48 complete: both plans' SUMMARYs on disk. PUSH-01/PUSH-03 fully delivered (48-01 dispatch layer, 48-02 settings/permission UX).
- T-48-07 (inherited sw.js structural prohibition) untouched: plan 02 modified no SW file.
- Ready for `/gsd-verify-work 48` (phase-level UAT; note D2/D4 coverage entries route to human judgment).

---
*Phase: 48-real-browser-push-toasts-from-backlog-999-2*
*Completed: 2026-11-07*
