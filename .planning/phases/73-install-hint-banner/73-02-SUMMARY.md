---
phase: 73-install-hint-banner
plan: 02
subsystem: testing
tags: [pwa, beforeinstallprompt, playwright-e2e, install-banner, ios-detection, degradation-matrix, node-test]

requires:
  - phase: 73-install-hint-banner (plan 01)
    provides: src/features/install-banner.js (onBip/onInstalled/checkIos/isIos/cooldownExpired), main.js [73-01] listener block + boot-time checkIos(), EN+FR pwa.install.* keys, test/pwa-banner.test.mjs standing gates
provides:
  - test/pwa-banner.test.mjs expanded to 25 cases: iPadOS MacIntel clause, boot-shape invocation, Firefox silence + nothing-scheduled, shared suppression via the iOS dismiss X, boot-hydration retry, and the exact bannerMod().then(m => m.checkIos()) static pin
  - e2e/install-banner.spec.mjs — four Chromium journeys: stubbed-event EN strip → prompt triggered, dismissal persistence across reload, FR strip after the real settings language switch, iOS-simulated navigator boot proof (no stubbed event, no button, no prompt)
  - checkIos() boot-hydration race fix (Rule 1): bounded rAF retry while api.init() is pending — the iOS path now renders in the real app, not only in test seams
affects: [74-sw-verification, install-banner-uat, pwa-e2e]

actuals:
  tokens: 9700
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "e2e stub contract: addInitScript Event('beforeinstallprompt') with window.__bipPrompted (click) / window.__bipDispatched (dispatch) markers — e2e-only, never src/"
    - "boot-race retry pattern: guard decision retried across a bounded rAF budget ONLY while hydration is pending (enabled false, no auth screen); frame-based, never a timeout"
    - "iOS navigator fakery in e2e: Object.defineProperty(Navigator.prototype, 'userAgent') inside the init script"

key-files:
  created:
    - e2e/install-banner.spec.mjs
  modified:
    - src/features/install-banner.js
    - test/pwa-banner.test.mjs

key-decisions:
  - "checkIos() hydration race fixed frame-based: the retry loop runs only while guardSource() reports enabled:false and no auth screen — once the guard signals are live the decision is final and no further frames are scheduled, preserving the 'Firefox schedules nothing' contract"
  - "e2e dispatch marker window.__bipDispatched added alongside __bipPrompted so suppression is proven against a genuinely re-fired event (toBeHidden resolves instantly against a hidden-from-t0 strip — a plain evaluate raced the 150 ms stub)"
  - "FR journey reuses the phase-62 Settings helpers (openSettings + selectLanguage, the account-locale PATCH path) instead of demo-locale helpers — the main suite's server is API-backed, where demo mode cannot fire"

requirements-completed: [PWA-04]

coverage:
  - id: D1
    description: "Degradation matrix at unit level: iPadOS MacIntel+maxTouchPoints>1 renders the iosHint strip, boot-shape invocation renders it, Firefox is feature-silent (isIos false, nothing scheduled), iOS+standalone silent, iOS strip shares the cooldown via its dismiss X"
    requirement: PWA-04
    verification:
      - kind: unit
        ref: "test/pwa-banner.test.mjs#iPadOS 13+ (MacIntel + maxTouchPoints > 1) renders the same iOS strip (Pitfall 4)"
        status: pass
      - kind: unit
        ref: "test/pwa-banner.test.mjs#checkIos invoked the way main.js invokes it at boot renders the iosHint strip (D-06 runtime shape)"
        status: pass
      - kind: unit
        ref: "test/pwa-banner.test.mjs#Firefox: isIos() false, no render side effect, nothing scheduled (D-07)"
        status: pass
      - kind: unit
        ref: "test/pwa-banner.test.mjs#checkIos with iOS UA + standalone matches:true renders nothing (D-04 beats D-06)"
        status: pass
      - kind: unit
        ref: "test/pwa-banner.test.mjs#the iOS strip honors the shared suppression: its dismiss X writes the cooldown and checkIos() stays silent"
        status: pass
    human_judgment: false
  - id: D2
    description: "Boot-wiring pin: src/main.js carries the exact boot-time bannerMod().then(m => m.checkIos()) call — the D-06 runtime entry point cannot silently regress"
    requirement: PWA-04
    verification:
      - kind: unit
        ref: "test/pwa-banner.test.mjs#main.js wires the banner through the [73-01] lazy-import block only"
        status: pass
    human_judgment: false
  - id: D3
    description: "Boot-hydration race fixed: checkIos() retries the guard across a bounded rAF budget while api.init() is pending, then decides finally — iOS strip renders in the real app"
    requirement: PWA-04
    verification:
      - kind: unit
        ref: "test/pwa-banner.test.mjs#checkIos during boot hydration (enabled false) retries frames and renders once the guard resolves"
        status: pass
      - kind: e2e
        ref: "e2e/install-banner.spec.mjs#a faked iOS navigator renders the boot-time iosHint strip with no Install button and no prompt"
        status: pass
    human_judgment: false
  - id: D4
    description: "e2e Chromium journey: stubbed beforeinstallprompt shows the EN strip and the Install click triggers the prompt (window.__bipPrompted)"
    requirement: PWA-04
    verification:
      - kind: e2e
        ref: "e2e/install-banner.spec.mjs#the stubbed beforeinstallprompt shows the strip with EN text and the Install click triggers the prompt"
        status: pass
    human_judgment: false
  - id: D5
    description: "e2e dismissal persistence: X writes pwa.installDismissedAt and the cooldown suppresses re-render across a reload against a re-fired stubbed event"
    requirement: PWA-04
    verification:
      - kind: e2e
        ref: "e2e/install-banner.spec.mjs#dismissing the strip persists the cooldown and suppresses re-render across a reload"
        status: pass
    human_judgment: false
  - id: D6
    description: "e2e FR: after the real settings language switch (account-locale PATCH), the strip shows the FR catalogue string"
    requirement: PWA-04
    verification:
      - kind: e2e
        ref: "e2e/install-banner.spec.mjs#after switching the language to FR the strip shows the FR catalogue string"
        status: pass
    human_judgment: true
    rationale: "The FR strip text is machine-asserted against the catalogue, but the on-screen rendering quality of the strip (layout, safe-area, legibility) is visual — deferred to end-of-phase UAT alongside real-device iOS/Chromium checks"

duration: 16min
completed: 2026-11-18
status: complete
---

# Phase 73 Plan 02: Degradation Matrix + e2e Summary

**Platform degradation matrix proven (iPadOS clause, Firefox silence, boot-shape pin) plus four Playwright journeys — stubbed-event EN→prompt, dismissal persistence across reload, FR after a real language switch, and an iOS-simulated boot that exposed and fixed a real checkIos() hydration race — 25 unit cases + 4 e2e green, zero new dependencies, entry untouched.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-11-18T20:33:57Z
- **Completed:** 2026-11-18T20:49:39Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `test/pwa-banner.test.mjs` expanded 20 → 25 cases: iPadOS MacIntel+maxTouchPoints>1 clause (research Pitfall 4), boot-shape `bannerMod().then(m => m.checkIos())` invocation, Firefox feature-silence with an explicit nothing-scheduled assertion, shared-suppression proof through the iOS strip's own dismiss X, the boot-hydration retry case, and a static pin on the exact boot call shape
- `e2e/install-banner.spec.mjs` (new): the stub contract documented in the header (the real event never fires in Playwright), `window.__bipPrompted` / `__bipDispatched` markers e2e-only (T-73-02 verified clean: no stub marker in src/ or public/), all four scenarios green
- `[Rule 1]` `checkIos()` boot-hydration race fixed: the entry's boot call resolved before `api.init()` set `enabled`, so `canShow()` bailed forever and the iOS hint never rendered in the real app — exposed by the e2e iOS scenario (exactly what the plan's "runtime proof" was designed to catch)

## Task Commits

Each task was committed atomically:

1. **Task 1: Degradation matrix unit coverage + boot-wiring pin** - `862f69c` (test)
2. **Task 2: e2e spec + checkIos() boot-race fix** - `486b402` (test)

## Files Created/Modified
- `e2e/install-banner.spec.mjs` - the four Chromium journeys with the documented stub contract
- `src/features/install-banner.js` - checkIos() bounded-rAF hydration retry (Rule 1)
- `test/pwa-banner.test.mjs` - 25 cases (5 new: iPadOS, boot-shape, Firefox silence, shared suppression, hydration retry) + exact boot-call pin

## Decisions Made
- **Frame-based hydration retry, gated on boot state:** the retry loop only runs while `guardSource()` reports `enabled: false` and no auth screen; once the guard signals are live the decision is final and nothing further is scheduled — the Firefox "schedules nothing" contract is preserved because non-iOS browsers return before any scheduling.
- **`__bipDispatched` alongside `__bipPrompted`:** `toBeHidden` resolves instantly against a strip that is hidden from t=0, so a plain evaluate raced the stub's 150 ms dispatch; polling the dispatch marker proves suppression against a genuinely re-fired event.
- **FR journey through the phase-62 Settings helpers:** the main suite's server is API-backed (demo mode cannot fire), so the language switch rides the account-locale PATCH path via `openSettings`/`selectLanguage` instead of the demo-locale localStorage path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] checkIos() never rendered in the real app — boot-hydration race**
- **Found during:** Task 2 (the e2e iOS-simulation scenario, exactly its intended purpose)
- **Issue:** `bannerMod().then(m => m.checkIos())` resolves before `api.init()` sets `api.enabled`, so `canShow()` returned false at boot and the iOS strip only ever rendered behind unit-test seams
- **Fix:** bounded rAF retry inside checkIos() while the guard reports hydration pending (enabled false, no auth screen); decision is final once the guard is live — frame-based, never a timeout (D-06 "never timeout-based" intact)
- **Files modified:** src/features/install-banner.js, test/pwa-banner.test.mjs (new race unit test)
- **Verification:** e2e iOS scenario green (strip renders from boot with the iosHint, no button, no prompt); all 25 unit cases green; `npm test` 1782 pass / 0 fail
- **Committed in:** 486b402

**2. [Rule 3 - Blocking] e2e assertion raced the stub's 150 ms dispatch**
- **Found during:** Task 2 verification
- **Issue:** `expect(strip).toBeHidden()` resolves instantly (strip hidden from t=0) and the subsequent `__bipDispatched` evaluate ran before the stub fired — suppression was asserted vacuously
- **Fix:** `expect.poll` on the dispatch marker (and added the marker itself to the stub)
- **Files modified:** e2e/install-banner.spec.mjs
- **Verification:** dismissal-persistence scenario green
- **Committed in:** 486b402

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 3 blocking)
**Impact on plan:** both were required for the iOS runtime proof to be honest — the race fix is the difference between "renders in seams" and "renders in the real app". No scope creep, zero new dependencies, `public/sw.js` untouched, `src/main.js` untouched by this plan (entry budget intact: 495,560 bytes, −4,435 vs baseline).

## Issues Encountered
- First e2e run failed 2/4 (the two issues documented above as deviations); after fixes, 4/4 green.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All four ROADMAP success criteria for Phase 73 are now proven: EN/FR strip triggering the native prompt (e2e), suppression matrix (unit), iOS static hint + Firefox silence wired at runtime and proven in unit + e2e (crit 3), lazy chunk + entry delta + EN+FR catalogue (plan 01 build gates)
- Remaining: real-device iOS/Chromium rendering quality (D6 human-judgment coverage) → end-of-phase UAT / verify-work

---
*Phase: 73-install-hint-banner*
*Completed: 2026-11-18*

## Self-Check: PASSED
