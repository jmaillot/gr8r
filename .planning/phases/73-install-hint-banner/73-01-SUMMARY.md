---
phase: 73-install-hint-banner
plan: 01
subsystem: ui
tags: [pwa, beforeinstallprompt, install-banner, lazy-chunk, i18n, localStorage, node-test, vite-build-contract]

requires:
  - phase: 72-manifest-icons-head-integration
    provides: webmanifest (display: standalone) + head metas — the install-criteria surface the banner's Chromium path builds on
provides:
  - src/features/install-banner.js — lazy banner chunk: onBip/onInstalled/checkIos/isIos/cooldownExpired exports, 14-day localStorage cooldown (pwa.installDismissedAt), prompt() from the Install click only, body-level mount outside the app root
  - main.js [73-01] listener block: beforeinstallprompt (preventDefault) + appinstalled listeners + one boot-time checkIos() call (the D-06 runtime entry point)
  - EN+FR catalogue keys pwa.install.cta / pwa.install.iosHint (D-08, same commit)
  - .install-banner fixed-bottom CSS strip with env(safe-area-inset-bottom) (D-01)
  - test/pwa-banner.test.mjs — 20 node:test unit + contract + build cases; the phase's standing gates
  - test/fixtures/banner-entry-baseline.json — the D-09 entry-delta baseline (499995 bytes at 0fb7be1)
affects: [74-sw-verification, pwa-e2e, install-banner-uat]

actuals:
  tokens: 71000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "[73-01] comment-tagged lazy-import listener block in main.js (bannerMod family, D-02/D-09)"
    - "guardSource() test seam over api.enabled/S.ui.auth/pathname (push.js setPushWorkspace pattern)"
    - "fail-absent localStorage read + silently-tolerant write (push.js discipline) for the cooldown key"
    - "entry-delta build contract against a pinned baseline fixture (D-09)"

key-files:
  created:
    - src/features/install-banner.js
    - test/pwa-banner.test.mjs
    - test/fixtures/banner-entry-baseline.json
  modified:
    - src/main.js
    - src/locales/en.json
    - src/locales/fr.json
    - src/styles/overlays.css
    - test/i18n-core-features.test.mjs

key-decisions:
  - "Converted actions/keyboard.js to a pre-warmed lazy chunk (Rule 3): the 500 kB gate had only 5 bytes of headroom (entry 499,995/500,000, not the plan's assumed ~2 kB), so the ~390-byte banner block could not fit; keyboard.js is self-contained (one document keydown listener, GO_MAP/gPending exported nowhere else)"
  - "Added a setGuardSource() seam so node tests can pin the D-03 guard signals — api.enabled is getter-bound in the harness (push.js setPushWorkspace precedent)"
  - "Cooldown garbage values coerce via Number()||0 → 0 → treated as no cooldown (banner may show); the stored value is never rendered (T-73-01)"

patterns-established:
  - "Banner entry wiring: two window listeners + one boot-time checkIos() call, zero detection logic in the entry (D-06/D-09)"
  - "prompt() reachable only from the Install button click handler; deferred nulled immediately (one shot per captured event)"

requirements-completed: [PWA-04]

coverage:
  - id: D1
    description: "Chromium happy path: stubbed beforeinstallprompt → preventDefault → lazy chunk → fixed-bottom strip → Install click calls prompt() exactly once → hide on accepted"
    requirement: PWA-04
    verification:
      - kind: unit
        ref: "test/pwa-banner.test.mjs#the Install click calls prompt() exactly once from the gesture and hides on accepted"
        status: pass
      - kind: unit
        ref: "test/pwa-banner.test.mjs#onBip renders the strip one frame after the event, without prompting"
        status: pass
    human_judgment: false
  - id: D2
    description: "Dismissal persistence: X writes pwa.installDismissedAt, 14-day cooldown suppresses re-render, userChoice 'dismissed' hides WITHOUT writing the key"
    requirement: PWA-04
    verification:
      - kind: unit
        ref: "test/pwa-banner.test.mjs#the X dismissal writes pwa.installDismissedAt and hides"
        status: pass
      - kind: unit
        ref: "test/pwa-banner.test.mjs#a stored recent timestamp suppresses rendering; a backdated one (>14d) allows it"
        status: pass
      - kind: unit
        ref: "test/pwa-banner.test.mjs#userChoice 'dismissed' hides the strip and leaves pwa.installDismissedAt untouched"
        status: pass
    human_judgment: false
  - id: D3
    description: "Suppression matrix: standalone display mode, auth screens, demo mode, /join routes, appinstalled — strip never renders"
    requirement: PWA-04
    verification:
      - kind: unit
        ref: "test/pwa-banner.test.mjs#standalone display mode: onBip renders nothing (D-04)"
        status: pass
      - kind: unit
        ref: "test/pwa-banner.test.mjs#auth screen: onBip renders nothing (D-03)"
        status: pass
      - kind: unit
        ref: "test/pwa-banner.test.mjs#demo mode (api disabled): onBip renders nothing (D-03)"
        status: pass
      - kind: unit
        ref: "test/pwa-banner.test.mjs#join route: onBip renders nothing (D-03)"
        status: pass
      - kind: unit
        ref: "test/pwa-banner.test.mjs#onInstalled() hides the strip"
        status: pass
    human_judgment: false
  - id: D4
    description: "Platform degradation at unit level: iOS boot pre-check renders the iosHint-only strip (no button), Firefox renders nothing, iOS+standalone and iOS+cooldown render nothing; wired at runtime from main.js boot-time checkIos()"
    requirement: PWA-04
    verification:
      - kind: unit
        ref: "test/pwa-banner.test.mjs#checkIos with an iPhone UA and no captured event renders the iosHint strip — no button, nothing scheduled"
        status: pass
      - kind: unit
        ref: "test/pwa-banner.test.mjs#checkIos with a Firefox UA renders nothing (D-07)"
        status: pass
      - kind: unit
        ref: "test/pwa-banner.test.mjs#checkIos with iOS UA + standalone matches:true renders nothing (D-04 beats D-06)"
        status: pass
      - kind: unit
        ref: "test/pwa-banner.test.mjs#checkIos with iOS UA + active cooldown renders nothing (D-05 beats D-06)"
        status: pass
    human_judgment: true
    rationale: "Unit-proven with stubbed UAs/matchMedia; real-device iOS/Chromium rendering needs on-device UAT (plan 02 / end-of-phase)"
  - id: D5
    description: "Build contract: real vite build emits exactly one lazy install-banner chunk; entry delta ≤ 200 bytes over the pinned pre-banner baseline; EN+FR keys catalogued same commit"
    requirement: PWA-04
    verification:
      - kind: integration
        ref: "test/pwa-banner.test.mjs#a real vite build emits exactly one lazy install-banner chunk (D-09)"
        status: pass
      - kind: integration
        ref: "test/pwa-banner.test.mjs#the entry chunk grew by at most 200 bytes over the pre-banner baseline (D-09)"
        status: pass
      - kind: unit
        ref: "test/pwa-banner.test.mjs#both locale files catalogue the banner keys in the same commit (D-08)"
        status: pass
    human_judgment: false

duration: 21min
completed: 2026-11-18
status: complete
---

# Phase 73 Plan 01: Install Hint Banner (tracer slice) Summary

**Chromium install banner end-to-end as a lazy chunk — captured-event strip with prompt-from-gesture, 14-day localStorage cooldown, iOS boot-time hint pre-check, Firefox silence — proven by 20 node:test unit/contract cases plus a real-vite-build entry-delta gate (entry 495,560 vs 499,995 baseline, delta −4,435).**

## Performance

- **Duration:** 21 min
- **Started:** 2026-11-18T20:07:55Z
- **Completed:** 2026-11-18T20:28:38Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- `src/features/install-banner.js` lazy chunk: onBip/onInstalled/checkIos/isIos/cooldownExpired, rAF-deferred canShow() past hydration (Pitfall 6), prompt() only from the Install click with deferred nulled (one shot per event), fail-absent localStorage discipline (T-73-01 mitigation)
- main.js `[73-01]` block: `beforeinstallprompt` (preventDefault) + `appinstalled` listeners and the boot-time `checkIos()` call — the D-06 iOS degradation path is reachable at runtime, not only via test seams
- EN+FR catalogue keys `pwa.install.cta` / `pwa.install.iosHint` in the same commit (D-08); `.install-banner` fixed-bottom token-only CSS with safe-area padding (D-01)
- `test/pwa-banner.test.mjs`: 18 unit/contract cases + 2 real-vite-build contract cases; combined run with `test/browser-push.test.mjs` is 50/50 green; full `npm test` 1789 tests / 1777 pass / 13 skipped (baseline skip pattern), 0 fail

## Task Commits

Each task was committed atomically:

1. **Task 1: Chromium happy path end-to-end** - `7c3664f` (feat)
2. **Task 2: Build contract — lazy chunk + entry delta** - `3d88016` (test)

## Files Created/Modified
- `src/features/install-banner.js` - the lazy banner chunk (Chromium strip + iOS hint + cooldown + guards)
- `src/main.js` - `[73-01]` listener block + boot-time checkIos(); keyboard.js pre-warmed lazy conversion
- `src/locales/en.json` / `src/locales/fr.json` - `pwa.install.cta` + `pwa.install.iosHint`
- `src/styles/overlays.css` - `.install-banner` fixed-bottom strip (z-index 110, safe-area)
- `test/pwa-banner.test.mjs` - unit + static-pin + build-contract suite (20 tests)
- `test/fixtures/banner-entry-baseline.json` - D-09 entry baseline (499,995 bytes at 0fb7be1)
- `test/i18n-core-features.test.mjs` - catalogue-size pin 1944→1946 with changelog entry

## Decisions Made
- **keyboard.js → pre-warmed lazy chunk (Rule 3):** the entry had 5 bytes of headroom at the 500 kB gate (499,995/500,000 — the plan's "~2 kB" assumption was stale), so the ~390-byte banner block tripped the gate. Applied the established 67-04/66-02 remedy: `import('./actions/keyboard.js').catch(() => {})`. Entry now 495,560 bytes (−4,435 vs baseline); keyboard.js registers its keydown listener on arrival and exports GO_MAP/gPending to no other module.
- **setGuardSource() seam:** api.enabled is getter-bound in the node harness, so the D-03 guard signals (auth/enabled/path) read through a live seam — the push.js setPushWorkspace precedent.
- **Cooldown garbage semantics:** `Number(v) || 0` means a corrupt stored value is treated as "no cooldown" (banner may show) — the fail-open side of a self-XSS-only surface; the value is never rendered.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Entry chunk exceeded the 500 kB gate (5 bytes headroom, not ~2 kB)**
- **Found during:** Task 1
- **Issue:** the `[73-01]` listeners added ~390 minified bytes to an entry sitting at 499,995/500,000 — `test/build-chunk-size.test.mjs` would fail; the plan's baseline assumption (~2 kB headroom) was stale
- **Fix:** converted `import './actions/keyboard.js'` to the established pre-warmed lazy-chunk pattern (`[73-01 Rule 3]` comment tag); verified self-contained before converting (no other importer of GO_MAP/gPending)
- **Files modified:** src/main.js
- **Verification:** entry 495,560 bytes; chunk gate + D-09 delta assertion green
- **Committed in:** 7c3664f

**2. [Rule 1 - Bug] French typography regression on a pre-existing catalogue line**
- **Found during:** Task 1 (french-typography gate)
- **Issue:** editing the tail of fr.json replaced the NBSP before ':' in `templates.importProjectLabel` with a plain space
- **Fix:** restored the U+00A0; gate 9/9 green
- **Files modified:** src/locales/fr.json
- **Verification:** node --test test/french-typography.test.mjs passes
- **Committed in:** 7c3664f

**3. [Rule 3 - Blocking] i18n catalogue-size pin (1944) tripped by the two new keys**
- **Found during:** Task 1 verification (`npm test`)
- **Issue:** `test/i18n-core-features.test.mjs` pins the EN catalogue size; 1944 ≠ 1946
- **Fix:** updated the pin to 1946 and appended the `+2 (73-01)` changelog entry in the test's own convention (title + inline comment)
- **Files modified:** test/i18n-core-features.test.mjs
- **Verification:** full npm test green (0 fail)
- **Committed in:** 7c3664f

**4. [Rule 2 - Missing critical] guardSource() test seam**
- **Found during:** Task 1 (unit harness)
- **Issue:** api.enabled is getter-bound; unit tests could not exercise the "enabled app" guard branch, so the happy path was untestable
- **Fix:** live guard seam + setter, mirroring push.js setPushWorkspace; production default unchanged
- **Files modified:** src/features/install-banner.js, test/pwa-banner.test.mjs
- **Verification:** all suppression and happy-path cases green
- **Committed in:** 7c3664f

---

**Total deviations:** 4 auto-fixed (1 blocking gate remedy, 1 regression fix, 1 pin update, 1 test seam)
**Impact on plan:** all four were required to satisfy the standing chunk/i18n gates and make the tracer testable; no scope creep, zero new dependencies, sw.js/server.js/index.html untouched.

## Issues Encountered
None beyond the deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02 (e2e + UAT) can build directly on the exported seams: stub `beforeinstallprompt` via `page.addInitScript`, assert the strip, click → `window.__bipPrompted`, cooldown persistence across reload
- Real-device iOS/Chromium behavior (D4 human-judgment coverage) lands in plan 02's UAT
- The 20 banner tests are the phase's standing gates; the entry now has ~4.4 kB of headroom for the 500 kB gate

---
*Phase: 73-install-hint-banner*
*Completed: 2026-11-18*
