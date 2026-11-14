---
phase: 56-delivery-infrastructure
plan: 02
subsystem: build
tags: [vite, code-splitting, dynamic-import, seed, lazy-chunk, build-gate, e2e]

# Dependency graph
requires:
  - phase: 56-01
    provides: async renderPage loader-map contract (P/ASYNC_ROUTES/fillPage), settings split, D-02 gate test with 1 designed RED (entry 552,830 B)
provides:
  - D-02 500 kB gate GREEN — no emitted .js chunk over 500000 B (entry 499,780 B, threshold untouched)
  - Lazy chunks for design-system, members, activity, search + seed (emptyState/ensureSeedData contract)
  - src/core/searchall.js shared searchAll module (palette stays entry-safe)
  - Node suites (browser-push, demo-workspace, i18n-search) apply seed() explicitly in setup
affects: [56-03/56-04 e2e runs, every later phase served from the split build]

# Actuals (#2632) — same estimateTokens scale (chars/4 over the realized diff)
actuals:
  tokens: 9000    # 35,960 diff chars / 4
  tasks: 3
  commits: 5

# Tech tracking
tech-stack:
  added: []
  patterns: [async page-loader map extension, seed-lazy boot contract (inline emptyState + explicit async ensureSeedData), shared-core module to keep first-paint surfaces entry-safe]

key-files:
  created:
    - src/core/searchall.js
  modified:
    - src/shell/layout.js
    - src/main.js
    - src/core/store.js
    - src/actions/actions.js
    - src/pages/search.js
    - src/overlays/palette.js
    - src/locales/en.json
    - src/locales/fr.json
    - test/build-chunk-size.test.mjs
    - test/browser-push.test.mjs
    - test/demo-workspace.test.mjs
    - test/i18n-search.test.mjs
    - test/i18n-core-features.test.mjs
    - test/scope.test.mjs

key-decisions:
  - "All consumers of members.js (members/member/teams/team) and design-system.js (system/states) moved to the async loader map together — leaving any one static would have kept the module in the entry graph and defeated the split"
  - "searchAll extracted verbatim to src/core/searchall.js BEFORE splitting the search page so the Ctrl-K palette (first paint) keeps it in the entry; pageSearch rides the lazy chunk"
  - "Seed migration mirrors today's behavior exactly: fresh demo boots await ensureSeedData() before first render (every fresh boot was seeded before); server mode hydrates from the workspace document; the corruption fallback stays synchronous via inline emptyState() — the app never boots null"
  - "A.confirmOk wraps async runs in Promise.resolve().catch → toast.errGeneric (EN+FR key added, catalogue pin 1814→1815) — confirmDlg ignores the returned promise, so a rejected run must not vanish silently"
  - "Auth edge NOT applied: entry reached 499,780 B after activity + search — the gate wins, no split for elegance"

requirements-completed: [DELIV-02]

coverage:
  - id: D1
    description: D-02 gate GREEN — a fresh vite build emits no .js chunk over 500000 bytes (threshold untouched)
    requirement: DELIV-02
    verification:
      - kind: integration
        ref: "test/build-chunk-size.test.mjs#every emitted .js chunk is <= 500000 bytes"
        status: pass
    human_judgment: false
  - id: D2
    description: seed.js out of the entry — a seed-*.js lazy chunk exists; emptyState()/ensureSeedData() contract in store.js; all three static seed edges severed
    requirement: DELIV-02
    verification:
      - kind: integration
        ref: "test/build-chunk-size.test.mjs#the build emits a lazy seed chunk"
        status: pass
      - kind: unit
        ref: "command: grep -c \"from '../data/seed\" src/core/store.js src/main.js src/actions/actions.js → 0 matches"
        status: pass
      - kind: unit
        ref: "command: node --test test/browser-push.test.mjs test/demo-workspace.test.mjs test/i18n-search.test.mjs test/catalogue.test.mjs → 74 pass"
        status: pass
    human_judgment: false
  - id: D3
    description: Design-system, members, activity and search pages emitted as their own lazy chunks behind the async loader map; EN catalogue inline + first-paint invariants intact
    requirement: DELIV-02
    verification:
      - kind: integration
        ref: "test/build-chunk-size.test.mjs (8/8 incl. lazy design-system/members/activity/search chunks)"
        status: pass
      - kind: integration
        ref: "test/build-locales.test.mjs (9 pass — EN catalogue inline)"
        status: pass
    human_judgment: false
  - id: D4
    description: Full unit suite + lint + i18n gate green on the split build
    requirement: DELIV-02
    verification:
      - kind: integration
        ref: "npm test → 1397 tests, 0 fail"
        status: pass
      - kind: integration
        ref: "npm run lint → clean; node scripts/i18n-scan.mjs → 0 dead/0 stale"
        status: pass
    human_judgment: false
  - id: D5
    description: e2e suite on the split build (109/109 planned)
    verification:
      - kind: e2e
        ref: "npm run e2e → 100/109 pass; the 9 failures reproduce verbatim at the 56-01 baseline commit 7ce7521 (pre-56-02) — see deferred-items.md"
        status: unknown
    human_judgment: true
    rationale: "The 9 failing specs (french-overflow ×7, locale:122) fail identically at the pre-56-02 baseline — a pre-existing condition out of 56-02's scope, but e2e is not green 109/109, so this deliverable cannot auto-pass"

# Metrics
duration: 62 min
completed: 2026-11-12
status: complete
---

# Phase 56 Plan 02: Delivery Infrastructure Summary

**D-02 500 kB gate GREEN without touching the threshold: entry 552,830 → 499,780 B via design-system/members/activity/search lazy chunks + the seed-lazy migration (inline emptyState fallback, explicit async ensureSeedData)**

## Performance

- **Duration:** 62 min
- **Started:** 2026-11-12T10:40Z (first task commit 10:55:30Z)
- **Completed:** 2026-11-12T11:42Z
- **Tasks:** 3 (TDD on Task 2: RED 7c2b037 → GREEN 83c8406)
- **Files modified:** 15 (134 insertions, 51 deletions)

## Accomplishments
- **D-02 gate GREEN:** every emitted .js chunk ≤ 500000 B — entry chunk 499,780 B (from 552,830 B at plan start; 606,073 B before the phase). The gate test is 8/8: the size property plus lazy-chunk existence for settings, qrcode, seed, design-system, members, activity, search.
- **Seed-lazy migration:** `src/data/seed.js` rides its own 14.93 kB lazy chunk; `store.js` defines an inline `emptyState()` boot fallback (never boots null) and exports memoized `ensureSeedData()`; fresh demo boots `await ensureSeedData()` before first render; `A.resetDemo`/`A.delWorkspace` run callbacks are async; the three seed-dependent node suites apply `seed()` explicitly in setup.
- **Residual edges in measured order:** activity (1.51 kB chunk), then search split behind `src/core/searchall.js` (palette keeps searchAll in the entry) — entry crossed under the gate at 499,780 B and the auth edge was correctly skipped.
- Full suite green: `npm test` 1397/0, lint clean, i18n scan 0 dead/0 stale.

## Task Commits

Each task was committed atomically:

1. **Task 1: design-system + members async loader split** - `17114ac` (feat)
2. **Task 2 (TDD RED): seed-chunk existence assertion** - `7c2b037` (test)
3. **Task 2 (GREEN): seed-lazy migration contract** - `83c8406` (feat)
4. **Task 3: residual edges (activity + search via core/searchall)** - `bf0920f` (feat)
5. **Task 3: final split-existence assertions** - `4c70afb` (test)

_TDD: RED 7c2b037 (target test failed on its own "no seed-*.js chunk" assertion, invalid-RED check not applicable — clean intentional failure), GREEN 83c8406, REFACTOR folded into Task 3's gate updates._

## Files Created/Modified
- `src/core/searchall.js` (NEW) - searchAll moved verbatim from search.js:8; shared by palette + search page, entry-safe
- `src/shell/layout.js` - loader map: system/states/members/member/teams/team/activity/search → dynamic imports; ASYNC_ROUTES extended; static imports removed
- `src/main.js` - bare imports of members/design-system/activity/search pages and seed removed; fresh demo boot awaits ensureSeedData()
- `src/core/store.js` - seed import severed; inline emptyState(); exported ensureSeedData() (memoized dynamic import)
- `src/actions/actions.js` - A.resetDemo/A.delWorkspace async via ensureSeedData(); A.confirmOk rejects surface as toast.errGeneric
- `src/pages/search.js` - searchAll removed, re-imported from core/searchall.js
- `src/overlays/palette.js` - searchAll re-pointed to ../core/searchall.js
- `src/locales/{en,fr}.json` - toast.errGeneric added; i18n pin 1814→1815
- `test/build-chunk-size.test.mjs` - seed + design-system/members/activity/search existence assertions
- `test/browser-push.test.mjs`, `test/demo-workspace.test.mjs`, `test/i18n-search.test.mjs` - explicit seed() in setup; searchAll re-pointed
- `test/scope.test.mjs` - searchAll re-pointed to core/searchall.js

## Decisions Made
- Split teams/team and states together with their module siblings (members.js, design-system.js) — Rollup keeps any statically-referenced module in the entry, so a partial conversion would have emitted no chunks at all.
- emptyState() mirrors seed()'s top-level structure minus demo content, with `ws.name` from `t('app.name')` to keep the i18n scan green (seed.js itself is scan-excluded as demo content).
- Auth edge skipped: the gate went green at 499,780 B without touching the logged-out boot path — the plan's decision rule ("the gate wins; do not split for elegance").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] i18n scan violation: 'Projects Studio' literal in store.js emptyState()**
- **Found during:** Task 2 (`npm test` — 4 i18n-scan tests failed)
- **Issue:** The inline ws.name literal was an unlisted user-visible literal (seed.js is scan-excluded; store.js is not)
- **Fix:** `ws.name: t('app.name')` — same value from the catalogue
- **Files modified:** src/core/store.js
- **Verification:** `node scripts/i18n-scan.mjs` → 0 violations; suites green
- **Committed in:** 83c8406

**2. [Rule 2 - Missing Critical] async confirm-run failures vanished silently**
- **Found during:** Task 2 (plan step 3's explicit contingency)
- **Issue:** `A.confirmOk` ignores the run callback's returned promise; the newly-async seed runs could reject with no feedback
- **Fix:** `Promise.resolve(m.run()).catch(...)` → `toast(t('toast.errGeneric'), { kind: 'err' })`; added the EN+FR catalogue key and bumped the pin 1814→1815
- **Files modified:** src/actions/actions.js, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs
- **Verification:** npm test green, i18n scan 0 dead/0 stale
- **Committed in:** 83c8406

**3. [Rule 1 - Bug] stale source-path grep in test/i18n-search.test.mjs after the searchAll move**
- **Found during:** Task 3 (`npm test` — "folded ONCE" test grepped src/pages/search.js for code now in core/searchall.js)
- **Fix:** Test source path re-pointed to src/core/searchall.js
- **Files modified:** test/i18n-search.test.mjs
- **Verification:** npm test green
- **Committed in:** bf0920f

**4. [Rule 1 - Bug] unused/missing imports in search.js after the extraction**
- **Found during:** Task 3 (`npm run lint` — 'foldForSearch' unused, 'mem'/'task' undefined: pageSearch renders mem(c.by)/task(c.task))
- **Fix:** Corrected search.js store import
- **Files modified:** src/pages/search.js
- **Verification:** npm run lint clean
- **Committed in:** bf0920f

---

**Total deviations:** 4 auto-fixed (1 × Rule 1 bug, 1 × Rule 2 missing-critical, 2 × Rule 3 blocking). **Impact on plan:** all fixes required for correctness/gates; no scope creep.

## Issues Encountered
- **e2e 100/109 — 9 failures are pre-existing at the 56-01 baseline, verified by bisect.** Full e2e failed 9 specs (french-overflow ×7, locale.spec.mjs:122). Built the pre-56-02 commit (7ce7521) in a throwaway worktree and ran the same specs: the identical 9 fail there with the same errors — 56-02 introduced none of them. Root cause evidence recorded in `deferred-items.md` (locale:122 expects a `<button>` role for a native `<select>` language row; the Settings page became a lazy chunk in 56-01). Logged as deferred, not fixed here (scope boundary). Unit suites, lint and the i18n gate are green; the D-02 gate — this plan's deliverable — is GREEN.
- When Playwright manages its own webServer, the first serial-group test can hit ECONNREFUSED while the server binds (same 100/109 result against a pre-warmed server).

## User Setup Required
None - no external service configuration required.

## Known Stubs
None.

## Next Phase Readiness
- The D-02 gate (this phase's acceptance arbiter) is GREEN: entry 499,780 B, no chunk over 500000 B, threshold never weakened.
- The async loader map now carries 9 async routes; every future page split is a one-line map entry + import removal.
- The seed-lazy contract (emptyState/ensureSeedData) is the pattern for any future entry-graph data decoupling.
- Open item for a later plan: the 9 pre-existing French-locale e2e failures (deferred-items.md) — unit-level behavior is covered, but e2e 109/109 should be restored before milestone close.

---
*Phase: 56-delivery-infrastructure*
*Completed: 2026-11-12*
## Self-Check: PASSED

- All created files exist on disk (src/core/searchall.js + 14 modified files per git log)
- All 5 task commits verified in git log: 17114ac, 7c2b037 (RED), 83c8406 (GREEN), bf0920f, 4c70afb
- Plan-level verification re-run at HEAD: test/build-chunk-size.test.mjs 8/8 GREEN (D-02 gate, entry 499,780 B); npm test 1397/0; npm run lint clean; scripts/i18n-scan.mjs 0 dead/0 stale; e2e 100/109 with the 9 failures proven pre-existing at baseline 7ce7521 (bisect worktree run, since cleaned up)
- STATE.md / ROADMAP.md untouched (orchestrator-owned per dispatch)
