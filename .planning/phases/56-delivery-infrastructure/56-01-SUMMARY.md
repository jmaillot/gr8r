---
phase: 56-delivery-infrastructure
plan: 01
subsystem: build
tags: [vite, code-splitting, dynamic-import, build-gate, tdd, skeleton-loading]

# Dependency graph
requires:
  - phase: 55 (prior milestone work)
    provides: static entry graph, skeleton() loading state, D-03 QR lazy edge (7e45d82/7d6da16)
provides:
  - D-02 500 kB build gate as a runnable node:test (test/build-chunk-size.test.mjs) running a real vite build into a temp dir
  - Async renderPage loader-map contract (layout.js) that the remaining page splits reuse
  - settings.js split out of the entry graph as a lazy chunk (entry 606,073 → 552,830 B)
  - src/ui/strength.js shared strengthMeter (entry-safe, no pages edge)
affects: [56-02 (finishes the remaining edges to pass the gate), 56-03, 56-04, e2e dist guard]

# Actuals (#2632) — same estimateTokens scale (chars/4 over the realized diff)
actuals:
  tokens: 7700    # 30,979 diff chars / 4
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns: [async page-loader map + skeleton-then-fill render contract, chunk-size gate test on real build bytes]

key-files:
  created:
    - test/build-chunk-size.test.mjs
    - src/ui/strength.js
  modified:
    - src/shell/layout.js
    - src/shell/render.js
    - src/main.js
    - src/actions/actions.js
    - src/pages/auth.js
    - src/pages/settings.js
    - test/i18n-core-features.test.mjs

key-decisions:
  - "auth.js strengthMeter import re-pointed to src/ui/strength.js — leaving auth→settings would have re-inlined settings into the entry graph and defeated the split"
  - "renderPage split into renderPageSync (template fill for first-paint routes) + async fillPage (skeleton-then-fill for async routes) so sync home/auth first paint is byte-identical and never flashes a skeleton"
  - "fillPage carries a monotonic seq guard: a stale dynamic-import resolution can never overwrite a newer render, and a rejected import surfaces stateFailed() — never a stuck skeleton"
  - "Gate threshold kept at 500000 B (RED by design at 552,830 B) — not weakened to fake a pass; 56-02 lands the remaining edges"

patterns-established:
  - "Async page split: add route loader to layout.js P map with dynamic import + ASYNC_ROUTES entry; all later splits reuse this contract"

requirements-completed: []  # DELIV-02 intentionally NOT marked — shared with 56-02 and the gate is still red by design

coverage:
  - id: D1
    description: D-02 500 kB build gate exists as a runnable node:test spawning a real vite build into a mkdtemp outDir, asserting every .js chunk <= 500000 B with file name + byte count on violation
    requirement: DELIV-02
    verification:
      - kind: integration
        ref: "test/build-chunk-size.test.mjs#every emitted .js chunk is <= 500000 bytes"
        status: fail   # RED BY DESIGN at the 552,830 B baseline until 56-02 — see Known Stubs
      - kind: integration
        ref: "test/build-chunk-size.test.mjs#the build emits a lazy settings chunk"
        status: pass
      - kind: integration
        ref: "test/build-chunk-size.test.mjs#the build emits a lazy qrcode chunk"
        status: pass
    human_judgment: false
  - id: D2
    description: settings.js emitted as its own lazy chunk behind the async loader map; actions.js and main.js carry no settings edge
    requirement: DELIV-02
    verification:
      - kind: integration
        ref: "command: npx vite build → dist/assets/settings-DVRdRgpW.js emitted; entry 552,830 B (grep -c settings = 1)"
        status: pass
      - kind: unit
        ref: "command: grep pages/settings src/actions/actions.js src/main.js → no matches"
        status: pass
    human_judgment: false
  - id: D3
    description: Navigating to settings shows skeleton() then the page; home/first-paint routes render synchronously with no skeleton flash
    verification: []
    human_judgment: true
    rationale: "Skeleton-then-fill timing is browser-observable behavior; no automated test asserts the visual sequence — needs human UAT"
  - id: D4
    description: EN catalogue inline invariant intact and no node-suite regression from the async render or strengthMeter move
    requirement: DELIV-02
    verification:
      - kind: integration
        ref: "tests/build-locales.test.mjs (9 pass)"
        status: pass
      - kind: integration
        ref: "npm test → 1375 pass, 1 fail (the D-02 gate, red by design)"
        status: pass
    human_judgment: false

# Metrics
duration: 12 min
completed: 2026-11-12
status: complete
---

# Phase 56 Plan 01: Delivery Infrastructure Summary

**D-02 500 kB build gate installed as a real-build test + async renderPage loader map splitting settings into its own chunk (entry 606,073 → 552,830 B)**

## Performance

- **Duration:** 12 min
- **Started:** 2026-11-12T10:22:49Z
- **Completed:** 2026-11-12T10:35:03Z
- **Tasks:** 3
- **Files modified:** 9 (185 insertions, 52 deletions)

## Accomplishments
- D-02 gate test (`test/build-chunk-size.test.mjs`): real `vite build` into a mkdtemp outDir, every `.js` chunk asserted ≤ 500000 B with file name + byte count in the failure message, plus qrcode/settings lazy-chunk existence assertions (TDD: committed RED at the 606,073 B baseline, then feat, then assertion activation)
- `renderPage()` converted to the async loader-map contract: first-paint routes resolve synchronously from statically imported pages (no first-paint change), settings rides `import('../pages/settings.js')`, shell paints `skeleton()` and `fillPage()` swaps the page HTML in (seq-guarded, `stateFailed()` on rejection)
- `strengthMeter` moved to `src/ui/strength.js`; actions.js, auth.js and settings.js re-pointed — the last actions.js→pages edge severed, settings exits the entry graph
- Entry chunk measured 552,830 B (down 53,243 B from 606,073 B); `settings-*.js` emitted as a lazy chunk

## Task Commits

Each task was committed atomically:

1. **Task 1: 500 kB build gate test (RED)** - `f26ff8f` (test)
2. **Task 2 (tracer): async renderPage + strengthMeter decoupling + settings split** - `3424d69` (feat)
3. **Task 3: activate split-chunk assertions** - `7771aba` (test)

_TDD RED→GREEN→REFACTOR: RED = f26ff8f (size gate failing on index 606,073 B, qrcode existence green), GREEN = 3424d69, REFACTOR folded into Task 3's test activation (7771aba)._

## Files Created/Modified
- `test/build-chunk-size.test.mjs` - D-02 gate + split-chunk existence assertions (real build, temp dir)
- `src/ui/strength.js` - shared strengthMeter template (moved verbatim from settings.js:814)
- `src/shell/layout.js` - async loader map (`P`, `ASYNC_ROUTES`), `renderPageSync`/`renderPage`/`fillPage`, skeleton call-site
- `src/shell/render.js` - `fillPage()` invoked after the shell mount (the one renderPage caller)
- `src/main.js` - bare settings import deleted
- `src/actions/actions.js`, `src/pages/auth.js` - strengthMeter edge re-pointed (auth re-point is what lets settings actually leave the entry)
- `src/pages/settings.js` - local strengthMeter definition removed, imports from `../ui/strength.js`
- `test/i18n-core-features.test.mjs` - catalogue pin 1813 → 1814 (Rule 3)

## Decisions Made
- Re-pointed `auth.js`'s strengthMeter import to `src/ui/strength.js`: auth stays in the entry graph, so an auth→settings import would have re-inlined settings into the entry and silently defeated the split.
- Split renderPage into sync template fill + async `fillPage()` instead of making the whole shell async: sync routes must not re-render in a microtask after render() (that would nuke focus/selection restore), and home/auth keep byte-identical first paint.
- Kept the gate threshold at 500000 B — expectedly RED at 552,830 B; 56-02 finishes the remaining edges. No scope-reduction of D-02.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] i18n catalogue pin stale (1813 vs actual 1814)**
- **Found during:** Task 2 (tracer verify — `npm test`)
- **Issue:** `test/i18n-core-features.test.mjs` pinned the EN catalogue at 1813 keys, but commit 7e45d82 (the prior QR work) added `toast.qrLoadFailed` without bumping the pin — pre-existing failure at HEAD, blocking the task's `npm test` verification
- **Fix:** Bumped the pin to 1814 with a provenance comment
- **Files modified:** test/i18n-core-features.test.mjs
- **Verification:** `npm test` — the i18n suite passes (1375 pass)
- **Committed in:** 3424d69

**2. [Rule 3 - Blocking] Unused `av`/`pIcon` import in actions.js failing lint**
- **Found during:** Task 2 (tracer verify — `npm run lint`)
- **Issue:** Pre-existing eslint no-unused-vars errors at HEAD, blocking the task's lint verification
- **Fix:** Removed the unused import line
- **Files modified:** src/actions/actions.js
- **Verification:** `npm run lint` clean
- **Committed in:** 3424d69

---

**Total deviations:** 2 auto-fixed (2 × Rule 3 blocking, both pre-existing at HEAD but gate-blocking for this task's verify chain)
**Impact on plan:** Both fixes minimal and required to verify; no scope creep.

## Issues Encountered
None beyond the deviations above.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None. The D-02 size gate failing at 552,830 B is not a stub — it is the designed RED state of the acceptance arbiter; 56-02 lands the remaining edges to turn it green (the plan explicitly forbids weakening the threshold).

## Next Phase Readiness
- Entry baseline for 56-02: **552,830 B** (`index-BO3uZf07.js`) — 56-02 splits the remaining heavy non-first-paint modules to pass the 500 kB gate
- The async loader-map contract (`P` + `ASYNC_ROUTES` + `fillPage`) is the pattern every remaining split reuses — each is a one-line map entry plus removing the bare import
- `npm test` will stay at exactly 1 failure (the gate) until 56-02 lands; all other suites green, lint clean
- DELIV-02 not marked complete (shared with 56-02; gate still red by design)

---
*Phase: 56-delivery-infrastructure*
*Completed: 2026-11-12*

## Self-Check: PASSED

- All created files exist on disk (test/build-chunk-size.test.mjs, src/ui/strength.js, modified shell/actions/main files)
- All 3 task commits verified in git log: f26ff8f (test RED), 3424d69 (feat), 7771aba (test assertions)
- Plan-level verification re-run: build-chunk-size gate → existence assertions green, size gate RED by design (index 552,830 B); npm test → 1375 pass / 1 designed gate failure; npm run lint clean; build-locales 9 pass (EN catalogue inline invariant intact); catalogue 27 pass
- Temp build dirs cleaned (0 stray projects-gate-* in tmpdir)
- STATE.md / ROADMAP.md untouched (orchestrator-owned); SUMMARY committed separately

