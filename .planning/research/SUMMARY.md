# Project Research Summary

**Project:** Projects Studio (gr8r) — Milestone v2.3 Consolidation & Hardening
**Domain:** Post-refactor e2e repair + mobile responsive table + flaky-test stabilization (zero-dep vanilla-JS SPA, Playwright suite)
**Researched:** 2026-11-14
**Confidence:** HIGH

## Executive Summary

v2.3 is a repair milestone, not a feature milestone: three targets (CONS-01 repair 9 failing e2e specs, CONS-02 mobile tasks-table truncation with the columns button, CONS-03 de-flake VIEW-02), all against an existing no-framework SPA with a strict zero-new-dependency constraint. The research is unanimous on the biggest conclusion: **nothing needs to be installed.** `@playwright/test@^1.64.1` already provides every needed API (`getByRole('combobox')`, `selectOption`, `waitForResponse`, `expect.poll`, `toBeInViewport`, webServer readiness polling), and CONS-02 is plain CSS work inside existing breakpoints. The "stack" work is API discipline and config hygiene.

CONS-01's root cause is fully diagnosed: Phase 56 made Settings a lazy chunk and changed the language row from a collapsed disclosure button to a native `<select data-in="langSel">` (combobox role, `src/pages/settings.js:131`). The 9 specs encode the pre-56 contract, so they fail identically at baseline and HEAD — this is spec drift, not an app regression. The fix is spec-side: better waiting (auto-retrying web-first assertions on rendered symptoms) and `selectOption` on the combobox — never weaker assertions, never sleeps. CONS-01 must land first because the repaired specs (especially french-overflow at 390px) are the regression net and acceptance tests for CONS-02 and CONS-03.

The top risks are all "wrong fix" risks: weakening assertions into tautologies (Pitfall 1), masking races with retries/timeouts/`reuseExistingServer` (Pitfalls 2–3), a parallel mobile render path forking the column-state contract (Pitfall 4), and — uniquely sharp here — the two hard gates: the 500 kB chunk gate has only **220 bytes of headroom**, and any new UI string must be catalogued EN+FR or the i18n scan fails (Pitfall 5). Phantom failures from stale dist/ports (`test-results/` races) are the environmental trap to watch across all three items.

## Key Findings

### Recommended Stack

**Zero new packages — not even dev-dependencies.** (STACK.md, HIGH confidence)

- `@playwright/test ^1.64.1` (installed): all needed APIs verified present — roles, `selectOption`, `toBeInViewport`, `expect.poll`/`configure`, `waitForResponse`, webServer `url` polling + `gracefulShutdown`
- `vite ^6.4.4` (installed, dev-only): no config change required for any repair
- Plain CSS: container queries (Chromium ≥105 supported), `table-layout: fixed`, existing breakpoints in `responsive.css`
- Only config additions contemplated: possibly a readiness retry in `e2e/server.mjs` wrapper, possibly `reuseExistingServer: !process.env.CI`

**Do NOT add:** wait-on/portfinder (webServer polling covers it), Testing Library, responsive-table libs, MSW, or screenshot tools (`toHaveScreenshot` pixel diffs flake — wrong tool for a stability milestone).

### Expected Features

(FEATURES.md)

**Must have (table stakes):**
- **CONS-01:** await lazy Settings render before interacting in all 9 failing specs; convert single-attempt reads (`isChecked()`, `evaluate()`) into auto-retrying assertions; suite back to 111/111 with standing gates green
- **CONS-02:** a decided mobile contract for the columns button (hide it on mobile OR make it drive the card stack fields); columns popover never overflows 390px viewport (`max-width: min(360px, calc(100vw - 24px))` + internal scroll); e2e proof at 390px (template: inbox-tabs spec)
- **CONS-03:** root-cause from retained trace (retries off, `--repeat-each`); remove coordinate dismissals (`mouse.click(5,400)` ×3) → Escape/backdrop; await `/api/me/views` PUT/POST via `waitForResponse`; VIEW-02 green across N≥10 consecutive runs with retries=0

**Should have (optional):**
- Shared `openSettings(page)` / `langSelect(page)` helpers in `e2e/helpers/setup.mjs` — one place knows the lazy-chunk contract
- Suite-wide popover helper (`openPopover` + Escape dismiss); card stack honoring `v.hidden` (deferred — real design question)

**Defer:**
- Card-stack-follows-hidden-columns (saved views meaning the same thing on phone and desktop) — needs an owner discussion; hide-the-button contract satisfies the UAT finding
- CI flake-detector job; lazy-route ready-marker convention (Med complexity)

**Anti-features:** `waitForTimeout` sleeps, `networkidle` waits, reverting Settings to a collapsed button, un-splitting lazy chunks, a third responsive regime (priority columns), horizontal-scroll table as primary mobile answer (FEATURES favors keeping the card stack; see Gaps).

### Architecture Approach

Nothing structural is being built — all fixes are additive at existing seams (ARCHITECTURE.md, HIGH — everything verified in the live tree). Key seams: `e2e/helpers/setup.mjs` (extend with shared helpers), the 8 stale selector sites in `french-overflow.spec.mjs` / `locale.spec.mjs`, `e2e/playwright.config.mjs` (readiness race — but do NOT touch `e2e/server.mjs`, its lifecycle is load-bearing), `src/styles/views/table.css` + `responsive.css` (existing 640px breakpoint — no fourth breakpoint), `src/styles/overlays.css` (popover caps). Product data flow is untouched across all three items; the correct a11y contract is the native `<select>`, proven by `demo-locale.spec.mjs:96`.

**Critical pitfalls (from PITFALLS.md):**

1. **Weakening assertions into tautologies (Pitfall 1, CRITICAL)** — classify each of the 9 failures as drift vs regression FIRST; repair = better waiting, never weaker expectation; diff assertion strength in review
2. **Masking the ECONNREFUSED webServer race with retries/reuseExistingServer (Pitfall 2)** — fix the readiness contract (recommended: `waitReady()` helper in setup.mjs, Option B); keep `retries: 0` locally; config defaults untouched
3. **De-flaking VIEW-02 with timeouts that hide the debounce/chunk race (Pitfall 3)** — await the actual completion signal (`waitForResponse` on the debounced write, server row via apiClient); diagnose with `--workers=1` and `--repeat-each` before fixing
4. **Parallel mobile render path forking the column-state contract (Pitfall 4)** — one render path, one source of truth for visible columns, media-query-gated; projects-table/saved-views specs are the tripwire
5. **500 kB chunk gate (220 B headroom) + i18n literals (Pitfall 5)** — per-task triad: `npm run build` + chunk-size test + i18n scan; remedy for headroom is lazy-map moves, never threshold bumps; every new string catalogued EN+FR in the same commit
6. **Phantom failures from stale dist/ports/test-results (Pitfall 6)** — always `npm run e2e -- <spec>`, never bare `npx playwright test`; clean between diagnosis runs

## Implications for Roadmap

Based on research, suggested phase structure (order is unanimous across FEATURES, ARCHITECTURE, and PITFALLS):

### Phase 1: E2E baseline repair (CONS-01)
**Rationale:** restores the green baseline that everything else is verified against; lowest risk (test-only); the repaired french-overflow specs are the acceptance instrument for CONS-02/03.
**Delivers:** `openSettings()`/`langSelect()` helpers; 9 specs rewritten to the combobox + lazy-render-wait contract; serial-group readiness fix as its own small plan first; `npm run e2e` → 111/111 (minus known VIEW-02 flake).
**Addresses:** CONS-01 table stakes + `openSettings` differentiator.
**Avoids:** Pitfalls 1, 2, 6, 7 (keep the full 16-route × 2-viewport matrix — these specs double as the only 390px overflow proof).

### Phase 2: VIEW-02 de-flake (CONS-03)
**Rationale:** diagnose early (root cause might be an app bug — legitimate outcome), but land after Phase 1 so the fix is measured on a stable green baseline. Independent of CONS-02 functionally.
**Delivers:** triage plan (trace + `--repeat-each`, pre-warmed server, workers=1) as a separate plan from the fix plan; coordinate dismissals removed; debounced write awaited; proven stability N≥10 with retries=0.
**Addresses:** CONS-03 table stakes; optional popover helper.
**Avoids:** Pitfall 3, 8 (don't touch the app's silent-degradation lazy-import policy), 13.

### Phase 3: Mobile tasks-table layout (CONS-02)
**Rationale:** last because it is the only item touching product CSS — the only real regression risk, and its verification needs the repaired suite. Isolate so a revert is one commit.
**Delivers:** decided mobile columns-button contract; popover never overflows 390px; new `e2e/mobile-tasks-table.spec.mjs` (`setViewportSize` on main config — no second Playwright project, no second webServer).
**Addresses:** CONS-02 table stakes.
**Avoids:** Pitfalls 4, 5 (chunk gate + i18n triad per task), 10 (viewport-based, never UA/touch detection), 11–12.

### Phase Ordering Rationale

- CONS-01 → everything: red baseline poisons "e2e proves it" for both other targets
- Within Phase 1: land the ECONNREFUSED readiness fix before the 9-spec rewrite
- CONS-03 diagnosis can start in parallel with Phase 1; landing waits
- CONS-02 last protects the 220 B gate headroom — small plans per task, never a big-bang mobile plan

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (CONS-02):** only item with a genuine open design decision — the mobile columns-button contract. FEATURES.md and ARCHITECTURE.md read the code differently (see Gaps). Needs `--research-phase` or at minimum an owner decision at discuss time.

Phases with standard patterns (skip research-phase):
- **Phase 1 (CONS-01):** root cause fully diagnosed; fix pattern proven in-repo (`demo-locale.spec.mjs:96`)
- **Phase 2 (CONS-03):** Playwright de-flaking is well-documented; triage methodology standard

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against installed versions + Playwright official docs via Context7; zero-dep conclusion is solid |
| Features | HIGH | Grounded in the actual specs, table code, CSS, and Playwright config, line-level |
| Architecture | HIGH | All integration points verified in live tree; web research not needed |
| Pitfalls | HIGH (mostly) | Codebase-verified + Playwright community wisdom (MEDIUM-HIGH) |

**Overall confidence:** HIGH — this is a read-our-own-code milestone and the research read the code.

### Gaps to Address

- **CONS-02 mobile contract (the one real divergence):** FEATURES.md reports the mobile view is already a card stack (`.only-m` panels) and recommends hiding the columns button or making it drive card fields; ARCHITECTURE.md reads `table.css` as a desktop scrolling table and recommends CSS-first honest horizontal scroll under the existing 640px breakpoint, explicitly rejecting a card re-render. **Resolve at requirements/discuss: which is the actual current mobile render, and is the contract "hide the button" or "button drives mobile fields"?** This is an owner decision, not a research question.
- **CONS-03 root cause unconfirmed:** debounced write-through race is the leading hypothesis (both files agree) but triage must precede the fix; if the app lacks a flush signal, a minimal app-side awaitable is a plan-time decision.
- **VIEW-02 serial-group retry semantics:** confirm a group retry won't double-apply view mutations (STACK.md point 4) before keeping VIEW-02 in a serial group.
- **`reuseExistingServer: !process.env.CI`** is suggested by STACK.md but Phase 04 deliberately made reuse opt-in after fixture contamination (PITFALLS 2 rejects changing the default) — keep the opt-in unless an owner revisits.

## Sources

### Primary (HIGH confidence)
- Playwright official docs via Context7 (`/microsoft/playwright`) — locators/auto-retry, actionability, `expect.poll`, `toBeInViewport`, `test.describe.configure` serial semantics, webServer (`url`, `gracefulShutdown`, `reuseExistingServer`)
- Live codebase (read directly, line-level): `e2e/playwright.config.mjs`, `e2e/french-overflow.spec.mjs`, `e2e/locale.spec.mjs`, `e2e/saved-views.spec.mjs`, `e2e/demo-locale.spec.mjs`, `e2e/helpers/setup.mjs`, `src/pages/settings.js:131-134`, `src/shell/layout.js` (lazy map), `src/shell/view-engine.js`, `src/actions/actions.js` (debounced viewSync, `.catch(()=>{})` seams), `src/styles/{responsive,views/table,components,overlays}.css`
- Project record: `.planning/PROJECT.md` (v2.3 goals/constraints), `56-02-SUMMARY.md` (bisect of the 9 failures, ECONNREFUSED note, gate headroom), `deferred-items.md`, Phase 04/12/53 config-evolution notes

### Secondary (MEDIUM confidence)
- Playwright community wisdom — webServer readiness vs first-request race; `waitForTimeout` as flake laundering; coordinate clicks as flake sources

---
*Research completed: 2026-11-14*
*Ready for roadmap: yes*
