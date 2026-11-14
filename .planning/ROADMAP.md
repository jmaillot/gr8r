# Roadmap: Projects Studio (gr8r)

## v2.3 — Consolidation & Hardening

**Goal:** bring the whole verification suite back to 100% green and fix the mobile
experience of the tasks table — no new features.

**Phases:** 3 (numbering continues from v2.2, which ended at Phase 61)
**Coverage:** 7/7 requirements mapped

## Phases

- [x] **Phase 62: E2E Baseline Repair** - Fix the webServer readiness race and repair the 9 drifted specs against the lazy-chunk Settings contract (completed 2026-11-14)
- [x] **Phase 63: VIEW-02 De-Flake** - Diagnose the flaky VIEW-02 spec with evidence, then stabilize it deterministically with retries=0
- [ ] **Phase 64: Mobile Tasks Table & Suite Green** - Hide-the-columns-button mobile contract, honestly usable card stack, and the 111/111 e2e close

## Phase Details

### Phase 62: E2E Baseline Repair

**Goal**: The e2e suite becomes a trustworthy regression net again — no readiness races, and every spec asserts the real (post-Phase-56) Settings contract with stronger, never weaker, assertions
**Depends on**: Nothing (first phase)
**Requirements**: E2E-01, E2E-02
**Success Criteria** (what must be TRUE):
  1. A full e2e run completes with zero ECONNREFUSED 127.0.0.1:4317 errors from the shared readiness poll — the fail-closed readiness contract is race-free without changing `reuseExistingServer` defaults, global `retries`, or `gracefulShutdown`
  2. All 7 `french-overflow.spec.mjs` specs and `locale.spec.mjs:122` pass against HEAD via role-based queries (native `<select>` asserted by its real combobox role) and auto-retrying waits on the lazy Settings chunk — no sleeps, no `networkidle`, no weakened expectations (assertion strength diffed in review)
  3. Shared `openSettings()` / language-select helpers exist in `e2e/helpers/setup.mjs` so exactly one place knows the lazy-chunk contract — no per-spec duplicated wait logic
  4. The standing gates stay green throughout: 1524-test unit suite, lint clean, 500 kB chunk gate (only ~220 B headroom), EN+FR i18n gate

**Plans:** 3/3 plans complete

Plans:
**Wave 1**
- [x] 62-01-PLAN.md — readiness: reproduce ECONNREFUSED emitter + D-02 assert-once guard (E2E-01)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 62-02-PLAN.md — openSettings/selectLanguage helpers + 7 french-overflow specs (E2E-02)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 62-03-PLAN.md — locale.spec.mjs:122 repair + phase gate: full e2e green, gates green (E2E-02)

### Phase 63: VIEW-02 De-Flake

**Goal**: VIEW-02 stops being a coin flip — its root cause is proven with evidence and the spec passes deterministically, fixing any app async-contract bug the triage exposes
**Depends on**: Phase 62 (fix measured on a stable green baseline; repaired specs are the tripwire)
**Requirements**: FLAKY-01, FLAKY-02
**Success Criteria** (what must be TRUE):
  1. The flake root cause is documented with evidence from a repeated-run trace (retries=0, pre-warmed server, `--workers=1`) — the debounced `persistLiveView` write-through race, coordinate-click dismissal, or shared OWNER/acme live-state hypothesis is confirmed or eliminated with artifacts, not guesses
  2. VIEW-02 passes `--repeat-each N ×` locally with retries=0 — deterministic, no added sleeps, no `networkidle`, no raised global retries
  3. Coordinate-click popover dismissal (`mouse.click(5,400)` ×3) is replaced by a semantic dismissal (Escape/backdrop) and the debounced view write is awaited on its real completion signal (`waitForResponse` on `/api/me/views` PUT/POST) — not on a timeout
  4. If triage proves an app-side async-contract bug, it is fixed in the app (not laundered in the spec) and pinned by a regression test

**Plans:** 3/3 plans complete

Plans:
- [x] 63-01-PLAN.md — Triage: trace-protocol evidence rounds + 63-TRIAGE.md hypothesis × evidence verdict (FLAKY-01)
- [x] 63-02-PLAN.md — Spec fix: Escape dismissal + awaited live-PUT waits; D-01 10× proof (FLAKY-02)
- [x] 63-03-PLAN.md — Conditional D-03 (ruled not-proven, recorded) + D-02 full-suite gate green (FLAKY-02)

### Phase 64: Mobile Tasks Table & Suite Green

**Goal**: The tasks table is honestly usable on a phone under the owner's hide-the-button ruling, and the whole e2e suite closes 111/111 green at milestone close
**Depends on**: Phase 62 and Phase 63 (the repaired, de-flaked suite is this phase's acceptance instrument)
**Requirements**: MOB-01, MOB-02, E2E-03
**Success Criteria** (what must be TRUE):
  1. Under the mobile breakpoint the tasks-table Columns button is hidden — no desktop behavior change: column show/hide and saved views untouched in desktop, saved-view blobs stay byte-compatible (projects-table/saved-views specs pass unmodified)
  2. On a mobile viewport the card stack renders without truncation from the toolbar affordances, verified by a mobile-viewport e2e (`setViewportSize` + web-first assertions on the main config — no second Playwright project or webServer), not screenshots
  3. One render path, one source of truth for visible columns — the mobile treatment is media-query-gated, never a parallel render fork (Pitfall 4 tripwire specs stay green)
  4. The full e2e suite is 111/111 green at milestone close: 0 known failures, VIEW-02 stable per Phase 63, with every standing gate green (1524 unit tests, lint, chunk gate, i18n gate)

**Plans**: 3 plans

Plans:
**Wave 1**
- [ ] 64-01-PLAN.md — Mobile CSS contract: generic Columns hide at ≤900px + Option B band alignment + boundary e2e (MOB-01)

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 64-02-PLAN.md — Card stack polish + D-12 long-task truncation suite at 390×844 (MOB-02)

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 64-03-PLAN.md — Milestone close: full parallel e2e run + standing gates, zero waivers (E2E-03)

**Wave structure**: 64-01 (Wave 1) → 64-02 (Wave 2, blocked on 64-01) → 64-03 (Wave 3, blocked on both)
**UI hint**: yes

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 62. E2E Baseline Repair | 3/3 | Complete    | 2026-11-14 |
| 63. VIEW-02 De-Flake | 3/3 | Complete    | 2026-11-14 |
| 64. Mobile Tasks Table & Suite Green | 0/? | Not started | - |

## Milestone Notes

**Ordering rationale (research consensus, unanimous):**
- Phase 62 first: a red baseline poisons "e2e proves it" for both other targets.
  Within it: the ECONNREFUSED readiness fix lands as its own small plan BEFORE the
  9-spec rewrite.
- Phase 63 next: diagnosis can start in parallel with 62, but the fix lands on the
  stable green baseline. Independent of mobile.
- Phase 64 last: the only item touching product CSS (the only real regression risk)
  and the only phase with the ~220 B chunk-gate headroom exposure — small plans per
  task, never a big-bang mobile plan; per-task triad: `npm run build` + chunk-size
  test + i18n scan.

**Standing constraints (every phase):** zero new runtime or dev dependencies;
no weakened assertions, no global `retries` increases, no timeout inflation;
always `npm run e2e -- <spec>` (never bare `npx playwright test`) to avoid
stale-dist phantom failures; `e2e/server.mjs` lifecycle untouched.
