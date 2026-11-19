---
phase: 72-manifest-icons-head-integration
plan: 01
subsystem: infra
tags: [pwa, web-app-manifest, mime, cache-control, playwright, node-test]

requires:
  - phase: milestone-baseline
    provides: existing static pipeline (MIME map / COMPRESSIBLE / cacheControl) in server.js, root-scope sw.js, favicon swap boundary (Phase 43 D-06)
provides:
  - public/manifest.webmanifest with the frozen field set (D-08/D-09) and four icon entries
  - server.js serving the manifest with application/manifest+json + no-cache (3-touch diff, D-12)
  - index.html head integration: manifest link, single theme-color, iOS metas, apple-touch-icon link (D-10/D-11)
  - e2e/manifest.spec.mjs live header check (D-13 half two)
  - test/manifest-contract.test.mjs static pins (D-13 half one)
affects: [72-02 (icon PNGs must satisfy manifest srcs + contract pins), 73-install-banner, 74-sw-verification]

actuals:
  tokens: 3040   # chars/4 over the realized diff (12162 chars)
  tasks: 3
  commits: 3

tech-stack:
  added: []   # zero-new-deps standing constraint honored
  patterns:
    - "Static contract test pinning source substrings + JSON field values (browser-push.test.mjs precedent)"
    - "Playwright request-API header-only e2e against the standard webServer fixture"

key-files:
  created:
    - public/manifest.webmanifest
    - e2e/manifest.spec.mjs
    - test/manifest-contract.test.mjs
  modified:
    - server.js
    - index.html

key-decisions:
  - "e2e manifest spec written as 3 tests (status/MIME, cache-control, body field set) matching the task's ≥3-passed verify bar"
  - "Contract test additionally guards against a charset suffix on the manifest MIME type and a second rel=icon link (Pitfall 4), beyond the plan's minimum pins"

patterns-established:
  - "Header-only e2e via Playwright request API — no browser page needed for wire-contract checks"

requirements-completed: [PWA-01]

coverage:
  - id: D1
    description: "GET /manifest.webmanifest returns 200 with Content-Type application/manifest+json and Cache-Control no-cache over the live server (D-12, D-13)"
    requirement: PWA-01
    verification:
      - kind: e2e
        ref: "e2e/manifest.spec.mjs#GET /manifest.webmanifest returns 200 with content-type application/manifest+json"
        status: pass
      - kind: e2e
        ref: "e2e/manifest.spec.mjs#GET /manifest.webmanifest carries Cache-Control no-cache"
        status: pass
    human_judgment: false
  - id: D2
    description: "Manifest JSON declares the frozen field set (name/short_name Projects Studio, standalone, / id/start_url/scope, theme_color #1D1338, background_color #fbfaf8) and the four icon entries in fixed order"
    requirement: PWA-01
    verification:
      - kind: unit
        ref: "test/manifest-contract.test.mjs#public/manifest.webmanifest frozen field set"
        status: pass
      - kind: e2e
        ref: "e2e/manifest.spec.mjs#GET /manifest.webmanifest body parses with the frozen field set"
        status: pass
    human_judgment: false
  - id: D3
    description: "server.js three-touch diff pinned as exact source substrings (MIME map, COMPRESSIBLE, cacheControl no-cache branch)"
    requirement: PWA-01
    verification:
      - kind: unit
        ref: "test/manifest-contract.test.mjs#server.js manifest serving contract"
        status: pass
    human_judgment: false
  - id: D4
    description: "index.html carries the manifest link, exactly one static theme-color meta (#1D1338, no media pair), iOS metas + apple-touch-icon link, with the favicon swap target byte-untouched (D-10/D-11, Pitfall 4)"
    requirement: PWA-01
    verification:
      - kind: unit
        ref: "test/manifest-contract.test.mjs#index.html head contract"
        status: pass
      - kind: integration
        ref: "npm test (1737-test baseline green, favicon-swap + browser-push gates included)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Visual appearance of the app frame/splash colors implied by theme_color/background_color (actual rendering in an installed standalone window)"
    verification: []
    human_judgment: true
    rationale: "How the OS renders the window frame and splash cannot be automated; deferred to owner UAT after 72-02 lands the real icon PNGs."

duration: 7min
completed: 2026-11-18
status: complete
---

# Phase 72 Plan 01: Manifest, Head Integration & Server Diff Summary

**Installable-app wire contract shipped: hand-written manifest.webmanifest served with `application/manifest+json` + `no-cache` via a 3-touch server.js diff, head tags in index.html, everything double-pinned by a static contract test and a live e2e header check.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-11-18T16:08:26Z
- **Completed:** 2026-11-18T16:15:23Z
- **Tasks:** 3
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments
- `public/manifest.webmanifest` with the frozen field set (D-08 `theme_color: #1D1338`, D-09 `background_color: #fbfaf8`, `/` id/start_url/scope, standalone) and four icon entries in pinned order — apple-touch-icon head-link-only per D-11
- `server.js` exactly three touches: MIME map entry (no charset suffix), `COMPRESSIBLE` member, `cacheControl()` no-cache branch (D-12)
- `index.html`: 6 head tags after the favicon link — manifest link, single static theme-color (D-10), 3 iOS metas + apple-touch-icon link (D-11); favicon-swap target byte-identical
- D-13 double pinning complete: `test/manifest-contract.test.mjs` (11 assertions) + `e2e/manifest.spec.mjs` (3 live tests)
- Zero edits to `public/sw.js` (forbidden-token contract green), zero CSP edits (D-14), zero new dependencies

## Task Commits

Each task was committed atomically:

1. **Task 1: Manifest file + 3-line server diff + e2e live header check (tracer)** - `8247419` (feat)
2. **Task 2: index.html head integration** - `e6a7f44` (feat)
3. **Task 3: Static contract test** - `3d784be` (test)

## Files Created/Modified
- `public/manifest.webmanifest` - hand-written manifest, frozen field set + 4 icon entries
- `server.js` - MIME map, COMPRESSIBLE, cacheControl() no-cache branch
- `index.html` - 6 new head tags
- `e2e/manifest.spec.mjs` - 3 header/body tests over the live server (D-13 half two)
- `test/manifest-contract.test.mjs` - 11 static pins (D-13 half one)

## Decisions Made
- e2e spec structured as 3 tests to match the task's "fewer than 3 passed tests" fail bar
- Contract test exceeds the plan's minimum: guards against charset-suffixed manifest MIME and a second `rel="icon"` link (Pitfall 4 regression guard)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- The e2e harness serves the built `dist/`, so `npm run build` was run before the manifest spec (dist staleness guard is fail-closed). Build green; chunk gate untouched (no JS added).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Plan 72-02 can commit the five PNGs (`icon-192/512`, `icon-maskable-192/512`, `apple-touch-icon.png`) — the manifest and contract test already reference their exact paths/sizes/purposes
- Tracer verified end-to-end (⚡): live server serves the manifest with the exact wire contract
- Phase gates at plan close: e2e manifest spec 3/3, contract test 11/11, `npm test` 1748 pass / 0 fail (baseline 1737 + 11 new), `git diff public/sw.js` empty

## Self-Check: PASSED

- `public/manifest.webmanifest`, `e2e/manifest.spec.mjs`, `test/manifest-contract.test.mjs` exist on disk
- Commits `8247419`, `e6a7f44`, `3d784be` present in `git log`
- All task `<acceptance_criteria>` re-run and passing; plan `<verification>` commands all green

---
*Phase: 72-manifest-icons-head-integration*
*Completed: 2026-11-18*
