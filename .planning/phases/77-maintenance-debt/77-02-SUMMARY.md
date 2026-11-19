---
phase: 77-maintenance-debt
plan: 02
subsystem: pwa/testing
tags: [pwa, install-banner, regression-pins, sw-contract, review-disposition, i18n]
requires:
  - phase: 77-01
    provides: lint-clean repo (npm run lint exit 0), suite green baseline
provides:
  - "All 9 carried 73/74 review advisories fixed with regression pins (MAINT-03 / SC3)"
  - "pwa.install.hint locale key (en+fr, D-08 same-commit) rendered in the cta grow-span"
  - "EXIT_MS / RETRY_BUDGET_MS named constants; CSS exit transition derives from --install-banner-exit-ms"
  - "77-REVIEW-DISPOSITION.md carryover ledger (9 fixed, 0 open/skipped/deferred)"
affects: ["77-03 (locale e2e — build fresh dist; install-banner.js changed)"]
tech-stack:
  added: []
  patterns: ["wall-clock rAF retry budgets (performance.now deadline)", "CSS-var-derived transition constant (JS single source)", "full-line-anchored indexOf test gates", "defensive fileURLToPath ROOT derivation"]
key-files:
  created:
    - .planning/phases/77-maintenance-debt/77-REVIEW-DISPOSITION.md
  modified:
    - src/features/install-banner.js
    - src/main.js
    - src/locales/en.json
    - src/locales/fr.json
    - src/styles/overlays.css
    - test/pwa-banner.test.mjs
    - test/sw-contract.test.mjs
    - test/i18n-core-features.test.mjs
key-decisions:
  - "IN-02 mechanism: JS named constant (EXIT_MS) + CSS custom property set at mount — matches the codebase's no-shared-token convention without foreclosing a future toast.js unification (D-77-11 discretion)"
  - "73-IN-03 catch shape: a single named bannerChunkFailed(err) helper with a static-prefix console.warn, error object as a separate argument (ASVS V5) — deliberate, ledger-recorded exception to the house .catch(() => {}) convention (D-77-12)"
  - "Ledger fixed-count recorded honestly as 9 (the enumerated advisory list) although the plan's tally said 10 — planning arithmetic slip documented in the ledger rather than padded"
requirements-completed: [MAINT-03]
coverage:
  - id: D1
    description: "WR-01: cta grow-span renders the dedicated pwa.install.hint key (en+fr catalogued, D-08); button keeps pwa.install.cta"
    requirement: MAINT-03
    verification:
      - kind: unit
        ref: "test/pwa-banner.test.mjs#WR-01: the cta grow-span renders the dedicated hint key, never the CTA label duplicated"
        status: pass
      - kind: unit
        ref: "test/pwa-banner.test.mjs#both locale files catalogue the banner keys in the same commit (D-08)"
        status: pass
    human_judgment: false
  - id: D2
    description: "WR-02: stripFlavour tracked alongside strip (flavour-aware reuse); strip reference survives until removal timeout; deferred cleared on give-up"
    requirement: MAINT-03
    verification:
      - kind: unit
        ref: "test/pwa-banner.test.mjs#WR-02: renderStrip reuses the strip only for the same flavour and rebuilds for a different flavour"
        status: pass
      - kind: unit
        ref: "test/pwa-banner.test.mjs#WR-02: the strip reference survives until the removal timeout fires (not cleared at hide time)"
        status: pass
      - kind: unit
        ref: "test/pwa-banner.test.mjs#WR-02: deferred is null after the retry budget gives up without mounting"
        status: pass
    human_judgment: false
  - id: D3
    description: "73-IN-01..05: single hide per outcome path, EXIT_MS single source (CSS var), surfaced chunk-load failures, wall-clock retry budgets, header comment updated — each pinned"
    requirement: MAINT-03
    verification:
      - kind: unit
        ref: "test/pwa-banner.test.mjs#73-IN-01: the unexpected-outcome path schedules exactly ONE removal"
        status: pass
      - kind: unit
        ref: "test/pwa-banner.test.mjs#73-IN-02: EXIT_MS is the single exit-duration source — the CSS transition derives from it"
        status: pass
      - kind: unit
        ref: "test/pwa-banner.test.mjs#main.js wires the banner through the [73-01] lazy-import block only (updated 73-IN-03 pins)"
        status: pass
      - kind: unit
        ref: "test/pwa-banner.test.mjs#73-IN-04: retry budgets are wall-clock deadlines — no frame counters remain"
        status: pass
    human_judgment: false
  - id: D4
    description: "74-IN-01/02: gateIdx anchored to the full quoted gate line with !==-1 assert; defensive fileURLToPath ROOT derivation — both pinned"
    requirement: MAINT-03
    verification:
      - kind: unit
        ref: "test/sw-contract.test.mjs#the api.enabled gate is intact inside the registerSw registration path"
        status: pass
      - kind: unit
        ref: "test/sw-contract.test.mjs#74-IN-02: the ROOT derivation survives without import.meta.dirname (fileURLToPath fallback)"
        status: pass
    human_judgment: false
  - id: D5
    description: "77-REVIEW-DISPOSITION.md ledger: all 9 carried advisories fixed, none waived; two recorded exceptions + two observations"
    requirement: MAINT-03
    verification:
      - kind: other
        ref: "artifact exists: .planning/phases/77-maintenance-debt/77-REVIEW-DISPOSITION.md (open:0 fixed:9 skipped:0 deferred:0)"
        status: pass
    human_judgment: true
    rationale: "Ledger completeness and the honesty of the recorded exceptions are judgment calls for phase verification, not machine-provable"
duration: ~25 min
completed: 2026-11-19
status: complete
commits: 2
plan_head_before: c0261e5caac0a04a8a67e27629eb0b2452b2f758
plan_head_after: 18b53bac
actuals:
  tokens: 33000
  tasks: 3
  commits: 2
---

# Phase 77 Plan 02: Review Advisory Fixes Summary

All 9 carried 73/74 review advisories (WR-01, WR-02, 73-IN-01..05, 74-IN-01/02) fixed with regression pins in the same commit — install-banner module-state races gone, chunk-load failures surfaced, the 160 ms exit constant and the retry budgets made single-source (named constants / wall-clock), sw-contract gate hardening with a defensive ROOT derivation — and every disposition recorded in `77-REVIEW-DISPOSITION.md` (9 fixed, 0 waived). Full suite 1867 tests / 1854 pass / 0 fail (13 skipped) and `npm run lint` exit 0 after every commit.

## Performance

- **Duration:** ~25 min
- **Started:** 2026-11-19T19:52:00Z
- **Completed:** 2026-11-19T20:15:00Z
- **Tasks:** 3
- **Files modified:** 9 (8 code/test + 1 phase artifact)

## Must-Haves Verification

| Truth | Result |
| ----- | ------ |
| Every advisory WR-01, WR-02, 73-IN-01..05, 74-IN-01/02 FIXED with a regression pin, none waived (SC3) | ✅ PASS — ledger `77-REVIEW-DISPOSITION.md`: open 0 / fixed 9 / skipped 0 / deferred 0; pins green |
| The grow-span renders `pwa.install.hint`; the Install button keeps `pwa.install.cta` (D-77-8) | ✅ PASS — WR-01 pin: exactly one `t('pwa.install.cta')` usage (the button textContent); hint key in en+fr catalogues, != CTA string |
| The banner tracks stripFlavour alongside strip and clears `deferred` in the give-up-retry path (D-77-9) | ✅ PASS — flavour-reuse / reference-survival / give-up pins pass; `else deferred = null` × 2 asserted |
| Retry budgets are wall-clock, not frame-count (D-77-13) | ✅ PASS — no `++frames`/`let frames` in the module; `performance.now() + RETRY_BUDGET_MS` × 2 asserted |
| Chunk-load failures surfaced; the boot-line pin updated in the same commit (D-77-12) | ✅ PASS — `bannerChunkFailed` warn-shape pinned; zero silent `.catch(() => {})` in the banner block |

| Artifact | Result |
| -------- | ------ |
| 77-REVIEW-DISPOSITION.md carryover ledger | ✅ created (75-shape front-matter, one row per advisory) |
| `pwa.install.hint` in en.json + fr.json (D-77-8 scope) | ✅ PASS — catalogue-count gate 1949→1950 updated same-commit |
| Regression pins in pwa-banner + sw-contract suites | ✅ PASS — 35/35 and 10/10 |

| Key link | Result |
| -------- | ------ |
| main.js boot line ↔ test pin (73-IN-03 same-commit co-change) | ✅ PASS — pin asserts the new `.catch(bannerChunkFailed)` boot shape |
| hide() EXIT_MS ↔ overlays.css transition (73-IN-02) | ✅ PASS — CSS derives from `--install-banner-exit-ms`, fallback equals the JS constant |
| sw-contract verbatim gate line ↔ gateIdx anchor (74-IN-01) | ✅ PASS — gateIdx now the full quoted line, distinct `!== -1` assert |

## Task Commits

1. **Task 1+2: WR-01/WR-02/73-IN-01 + 73-IN-02..05 (banner cluster)** - `00e03579` (fix) — Tasks 1 and 2 landed as one commit (same file cluster; see Deviations)
2. **Task 3: 74-IN-01/02 sw-contract hardening + ledger** - `18b53bac` (test)

## Files Created/Modified
- `src/features/install-banner.js` — WR-01 hint render, stripFlavour tracking, single hide, EXIT_MS/RETRY_BUDGET_MS constants, wall-clock budgets, deferred give-up clearing
- `src/main.js` — bannerChunkFailed surfacing catch (×3 sites), comment updated
- `src/locales/en.json` / `fr.json` — `pwa.install.hint` key (D-08 same commit)
- `src/styles/overlays.css` — transition derives from `var(--install-banner-exit-ms, 160ms)`
- `test/pwa-banner.test.mjs` — 7 new pins, updated boot-line + D-08 pins, header comment refresh, fakeEl style.setProperty stub
- `test/i18n-core-features.test.mjs` — catalogue-count gate 1949→1950 with the 77-02 ledger comment
- `test/sw-contract.test.mjs` — full-line gateIdx anchor + defensive ROOT derivation + 74-IN-02 pin
- `.planning/phases/77-maintenance-debt/77-REVIEW-DISPOSITION.md` — new ledger

## Decisions Made
- IN-02 mechanism (discretion): JS named constant + CSS custom property set at mount — no shared token exists in the codebase, this adds one without foreclosing toast.js unification
- 73-IN-03 catch shape: named `bannerChunkFailed` helper, static prefix + error as separate console argument (V5)
- Ledger count honesty: recorded `fixed: 9` (the actual enumerated advisory count) with the plan's "10" tally slip documented, rather than padding a synthetic row

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] fakeEl stub lacked style.setProperty**
- **Found during:** Task 1 verification
- **Issue:** renderStrip now sets the CSS variable; the test harness's fake element had `style: {}` and crashed with `el.style.setProperty is not a function`
- **Fix:** `style: { setProperty() {} }` in fakeEl
- **Files modified:** test/pwa-banner.test.mjs
- **Verification:** pwa-banner suite 35/35 pass
- **Committed in:** 00e03579 (part of task commit)

**2. [Clarification, not a deviation] Task 1 + Task 2 committed as one commit**
- The plan split the banner fixes into two commits (WR-01/02/IN-01 vs IN-02..05), but every fix lives in the same file cluster (`install-banner.js` + its pins) and the pins interlock (IN-02's constant-agreement pin reads the same module the WR pins read). Grouped per D-77-1's file-grouped discipline; the full suite ran green after the single commit. Both tasks' acceptance criteria verified independently and all pass.

**3. [Clarification, not a deviation] catalogue-count gate update**
- The plan didn't name `test/i18n-core-features.test.mjs`, but its 1949-key catalogue gate fires on any new key (D-08's own enforcement). Updated 1949→1950 with the 77-02 ledger comment in the same commit as the key.

**4. [Clarification, not a deviation] ledger count 9 vs plan's 10**
- The enumerated advisory list is 9 findings; the plan's front-matter and acceptance criteria said "10 fixed rows". Recorded 9 honestly with the slip documented in the ledger (Note 4). SC3 is satisfied on the enumerated list.

**Total deviations:** 1 auto-fixed (Rule 3) + 3 clarifications. **Impact on plan:** none on scope; all acceptance criteria verified.

## Issues Encountered
None beyond the harness stub gap above.

## User Setup Required
None.

## Next Phase Readiness
- Ready for 77-03 (locale e2e). Note: `src/main.js` and `src/features/install-banner.js` changed, so 77-03 must run `npm run build` before `npm run e2e` (stale-dist fail-closed guard) — already mandated by 77-RESEARCH Pitfall 3.

---
*Phase: 77-maintenance-debt*
*Completed: 2026-11-19*
