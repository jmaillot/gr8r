---
phase: 62-e2e-baseline-repair
plan: 03
subsystem: e2e
tags: [e2e, playwright, i18n, phase-gate, web-first-waits]
requires: ["62-01 (assertServerUp)", "62-02 (openSettings/selectLanguage helpers)"]
provides: ["green locale.spec.mjs on the shared helpers", "phase-closure evidence (full e2e + standing gates)"]
affects: []
tech-stack:
  added: []
  patterns: ["bounded expect.poll as sleep-free loop-safety measurement", "label-from-DOM"]
key-files:
  created: []
  modified:
    - e2e/locale.spec.mjs
decisions:
  - "Triage (D-07) at HEAD found all 5 locale.spec.mjs tests already passing — no app bug; only the waitForTimeout cluster was real drift, mirroring the 62-02 finding"
  - "Loop-safety measurement restructured sleep-free per Pitfall 3: observer armed before the option click, counter reset after French re-render, bounded expect.poll on __mutations and innerHTML stability"
  - "Option labels asserted from the native select (label-from-DOM); no combobox role anywhere"
metrics:
  duration: ~25 min
  completed: 2026-11-14
  tasks: 2
actuals:
  tokens: ~12000
  tasks: 2
commits: 1
plan_head_before: 4d5eecc
plan_head_after: e12f25c
status: complete
---

# Phase 62 Plan 03: locale.spec.mjs:122 repair + phase gate Summary

**One-liner:** The last drifted spec lands on the shared `openSettings()`/`selectLanguage()` contract sleep-free with the render-loop assertion preserved, and the phase gate proves the whole baseline trustworthy: full e2e 112/112 green with zero ECONNREFUSED, 1524 unit tests, lint, 500 kB chunk gate and EN+FR i18n gate all green.

## What Was Built

- **e2e/locale.spec.mjs** — the `:122` spec (LOC-01/LOC-03) rewritten onto the plan-02 helpers: `openSettings(page, { tab: 'language' })` owns navigation + lazy-chunk wait, `selectLanguage(page, 'fr')` owns the trigger click and arms the PATCH `/api/auth/me` wait (returns the response; spec asserts status 200, D-04/D-05). The `waitForTimeout(300/1500)` cluster is gone (D-08): MutationObserver installed BEFORE the option click, French re-render asserted (`documentElement.lang === 'fr'` poll, `'Langue'` level-1 heading, `'Projets'` button), counter reset, then bounded `expect.poll` on `__mutations === 0` (timeout 1500) plus innerHTML-equality poll — the render-loop assertion survives, only waits changed (Pitfall 3).
- **Fallback coverage intact** — the sign-out/sign-in block (`'Menu du compte'` → `'Se déconnecter'`, `documentElement.lang === 'en'` after sign-out, `'fr'` after sign-in) untouched, equal-or-stronger.
- All other specs in locale.spec.mjs byte-untouched (D-06). Diff confined to the drift region: 29 insertions / 19 deletions in one spec.

## Triage (D-07)

`npx playwright test … e2e/locale.spec.mjs` at HEAD (4d5eecc) before the rewrite: **5 passed** — including `:122`. Mirroring 62-02's finding, all assertions were already satisfied by the app; the only drift was the sleep cluster. No app bug → D-07 clear, rewrite proceeded as planned (the sleeps were the deliverable, not a green fix).

## Per-Spec Assertion Diff (strengthened-or-equal — combined with 62-02 for success criterion 2)

| Before (locale.spec.mjs:122-177) | After | Verdict |
|---|---|---|
| Settings click + Language tab click + heading expect (in spec) | `openSettings(page, { tab: 'language' })` — same clicks + same heading wait, now in the one helper | Equal — navigation/waits moved per D-04/D-05 |
| Trigger click → `expect(option).toHaveText(['English','Français'])` with menu open | `optionLabels` from native select → `toEqual(['English','Français'])` before opening | Equal — same two labels, same order; label-from-DOM survives catalogue edits |
| Hand-rolled `waitForResponse(PATCH /api/auth/me)` in spec | Armed inside `selectLanguage` (before the click), status asserted spec-side | Equal — same assertion, D-05 single owner |
| `expect(__mutations).toBe(0)` after 300 ms settle + 1500 ms wait | `expect.poll(() => __mutations, { timeout: 1500 }).toBe(0)` after counter reset post-re-render | Equal-or-stronger — a render loop keeps the counter climbing; quiet pages return immediately |
| `expect(after).toBe(before)` innerHTML after 1500 ms wait | `expect.poll(() => app.innerHTML, { timeout: 1500 }).toBe(before)` | Equal — only the wait strategy changed |
| Reload persistence, PATCH-200, sign-out/sign-in fallback | Unchanged | Equal |

## Phase Gate Evidence (verbatim from captured log)

Full run: `npm run e2e 2>&1 | tee /tmp/opencode/phase62-gate.log` (log retained for re-check — T-62-05).

**E2E full run (scrubbed env, fresh `test-results/`, fresh `npm run build`):**
```
  112 passed (6.6m)
```
- ECONNREFUSED lines: **0** (`grep -c ECONNREFUSED /tmp/opencode/phase62-gate.log` → 0) — success criterion 1.
- Both repaired files fully green: french-overflow (12 tests, plan 02) and locale (5 tests, this plan).
- **VIEW-02 (saved-views.spec.mjs:61)** — passed in this run (5.9 s), so the deferred red carried from 62-01 is no longer red at HEAD. Untouched this phase (D-06); recorded as evidence, not as a fix.

**Standing gates:**
| Gate | Command | Result |
|---|---|---|
| Unit suite | `npm test` | tests 1536, **pass 1524**, fail 0 (12 skipped) |
| Lint | `npm run lint` | exit 0 |
| Build + chunk gate + i18n gate | `npm run build` | exit 0; chunk gate passed (~headroom intact); i18n scan: `0 literals, 0 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch, 0 dead` |

**Locked-files check:** `git diff e2e/playwright.config.mjs e2e/server.mjs` → empty. Success criterion 4 evidenced.

**Prohibitions verified:** `grep -c "waitForTimeout\|networkidle" e2e/locale.spec.mjs` → 0; `grep -c combobox` → 0 file-wide.

## Verification

- Pre-triage run at HEAD: 5 passed (drift = sleeps only).
- Post-rewrite: `npm run build && npx playwright test … e2e/locale.spec.mjs` → **5 passed**; `npm run lint` → 0.
- Phase gate as tabled above — all green, zero ECONNREFUSED.

## Deviations from Plan

- **[Plan-assumption stale — documented, no code impact]** Same as 62-02: the plan's tracer premise assumed `:122` fails at HEAD and frames the rewrite as the green fix. It was already green; the deliverable that remained real was the D-08 sleep removal + D-05 single-owner waits, delivered in full. D-07 triage executed as ordered before any edit.
- **[Positive surprise — evidence only]** VIEW-02 (the "one known red" carried per D-06) passed in the full gate run. Not chased, not touched; noted for the phase-gate record.

## Deferred Issues

None new. Sibling-spec migration onto the helpers remains deferred per D-06 (62-CONTEXT deferred list).

## Known Stubs

None.

## Self-Check: PASSED

- e2e/locale.spec.mjs modified and committed (e12f25c); helpers untouched (prohibitions respected).
- Commits verified in `git log`; ledger measured 1 commit since 4d5eecc.
- Gate log exists at /tmp/opencode/phase62-gate.log with the verbatim summary line and zero ECONNREFUSED.
