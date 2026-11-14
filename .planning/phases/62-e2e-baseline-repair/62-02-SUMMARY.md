---
phase: 62-e2e-baseline-repair
plan: 02
subsystem: e2e
tags: [e2e, playwright, i18n, helpers, web-first-waits]
requires: ["62-01 (assertServerUp + locked webServer readiness contract)"]
provides: ["openSettings(page, {tab?}) helper", "selectLanguage(page, lang) helper"]
affects: ["e2e/french-overflow.spec.mjs", "future specs adopting the helpers (deferred per D-06)"]
tech-stack:
  added: []
  patterns: ["label-from-DOM (option labels read from the native select)", "role-based lazy-chunk wait (expect on chunk-rendered content)", "bounded expect.poll as sleep-free loop-safety measurement"]
key-files:
  created: []
  modified:
    - e2e/helpers/setup.mjs
    - e2e/french-overflow.spec.mjs
decisions:
  - "Helpers carry the first Playwright imports in setup.mjs (D-03 allows it); only `expect` is imported (helpers wait, specs assert — D-04)"
  - "D-03 combobox wording implemented as driving the enhanced select by its verified DOM roles (trigger button aria-haspopup=listbox + role=option items, src/ui/select.js) — no element carries that role (OQ-2 resolved-as disposition)"
  - "Task-2 triage found the 6 remaining specs already conformant at HEAD (sleep-free, role-based) — no rewrite churn per D-06 smallest-diff"
metrics:
  duration: ~25 min
  completed: 2026-11-14
  tasks: 2
  commits: 2
plan_head_before: 48df98c9c5d2c4be01d7498520a06c499c54cbe8
plan_head_after: 0c79f4b
status: complete
---

# Phase 62 Plan 02: french-overflow repair onto shared Settings helpers Summary

**One-liner:** `openSettings()`/`selectLanguage()` now own the lazy-chunk wait and the PATCH `/api/auth/me` wait in one place (setup.mjs), and french-overflow's language-switch spec runs sleep-free through them with the render-loop assertion preserved via bounded `expect.poll`.

## What Was Built

- **e2e/helpers/setup.mjs** — two composable exports:
  - `openSettings(page, { tab } = {})`: clicks the Settings entry (accessible name resolved from the catalogue of the language the document currently renders — label-from-catalogue, never transcribed), then THE lazy-chunk wait: a role-based auto-retrying `expect()` on the Language tab affordance (the chunk at `src/shell/layout.js` `settings: lazy(...)` must render before that button exists). `tab: 'language'` clicks the tab and waits for its level-1 heading.
  - `selectLanguage(page, lang)`: resolves the option label from the DOM (`select[data-in="langSel"] option`, named Error if absent), arms the `waitForResponse` on the PATCH `/api/auth/me` write path BEFORE clicking, clicks the trigger (`.set-body .select-btn`) then `getByRole('option', { name: label })`, returns the response — the caller asserts status 200 spec-side (D-04).
- **e2e/french-overflow.spec.mjs** — the language-switch spec rewritten onto the helpers; the `waitForTimeout(300/500/1000)` cluster (D-08 drift) is gone. The MutationObserver loop-safety measurement was restructured per Pitfall 3: observer installed BEFORE the option click, French re-render asserted, counter reset, then one bounded `expect.poll` on `__mutations === 0` (timeout 1500) plus the before/after innerHTML equality as an `expect.poll` — the render-loop assertion survives; only the wait strategy changed.

## Triage (D-07)

The plan assumed 7 failing specs. Triage at HEAD (commit 48df98c) found **all 12 tests in french-overflow.spec.mjs already passing** — no app regression anywhere (D-07 clear). The only remaining drift was the `waitForTimeout` cluster in the language-switch spec, which is exactly what D-08 replaces. Consequently:

- Task 1 proceeded as planned (helpers + rewrite of the language-switch spec — the only spec exercising the Settings/language path).
- Task 2's "rewrite the remaining 6 specs" resolved to a triage-and-verify pass: the remaining specs never touch the settings-language flow and are already role-based and sleep-free; migrating them onto `openSettings` would be gratuitous churn against D-06's smallest-diff ruling and would not strengthen a single assertion. They were verified unchanged in the full green run. Documented here as the disposition for the stale plan assumption.

## Per-Spec Assertion Diff (strengthened-or-equal — success criterion 2 / T-62-04)

**Language-switch spec (the only spec with drift):**
| Before | After | Verdict |
|---|---|---|
| `expect(page.getByRole('option')).toHaveText(['English', 'Français'])` (menu open) | `expect(optionLabels from native select).toEqual(['English', 'Français'])` | Equal — same two labels, same order; source of truth is the native select the enhanced menu is built from |
| `expect((await saved).status()).toBe(200)` (asserted last) | Same expect, asserted immediately after the re-render anchors | Equal — same assertion, earlier in flow |
| `expect(await page.evaluate(...__mutations)).toBe(0)` after `waitForTimeout(1000)` | `expect.poll(() => __mutations, { timeout: 1500 }).toBe(0)` after counter reset | Equal-or-stronger — a render loop keeps the counter climbing, so the poll still fails; quiet pages now return immediately |
| `expect(after).toBe(before)` innerHTML after `waitForTimeout(500)` | `expect.poll(() => app.innerHTML, { timeout: 1500 }).toBe(before)` | Equal — same assertion; only the wait strategy changed (the custom failure message is dropped: `expect.poll` takes no message param — diagnostics wording only, not strength) |
| `expect(window.__survived).toBe('no-reload')` | Unchanged | Equal |
| `'Language'` heading visible + trigger `expanded:false` click (in spec) | Heading wait lives in `openSettings({tab:'language'})` as an arrival wait; trigger click lives in `selectLanguage` | Equal — navigation/waits moved to helpers per D-04/D-05; the spec keeps every visibility claim |

**Remaining specs:** unchanged — zero assertion changes.

## Verification

- `npx playwright test --config e2e/playwright.config.mjs e2e/french-overflow.spec.mjs` → **12 passed**
- `grep -c waitForTimeout` and `networkidle` on the spec → 0; `combobox` on both touched files → 0
- `grep -c "export async function openSettings|selectLanguage" e2e/helpers/setup.mjs` → 1 each
- Standing gates: `npm run lint` ✅, `npm run build` ✅, `npm test` ✅

## D-03 Provenance Note

D-03's "driven by its real combobox role" wording is implemented as driving the enhanced select by its verified DOM roles (trigger button `aria-haspopup="listbox"` + `role="option"` items, src/ui/select.js) — no element carries that ARIA role, confirmed against OQ-2's resolved-as-pattern-wording disposition in 62-RESEARCH.md.

## Deviations from Plan

- **[Plan-assumption stale — documented, no code impact]** The plan's premise of 7 failing specs did not hold at HEAD: the suite was already green (likely repaired in the 62-01 wave or prior commits; 62-01's SUMMARY notes sibling-spec drift was out of its scope). The plan's deliverables (helpers, sleep removal per D-08, D-05 single-owner waits) were delivered in full; the "rewrite 6 more specs" scope collapsed to triage-and-verify because those specs have nothing left to repair.
- **[Rule 1 - Bug]** First cut of the helper imports tripped lint (`test` unused) and left the literal token the prohibitions ban inside a provenance comment; fixed in commit 0c79f4b.

## Deferred Issues

- **saved-views.spec.mjs:61 (VIEW-02)** — pre-existing failure carried from 62-01; sibling-spec migration is out of scope per D-06. Untouched.

## Known Stubs

None.

## Self-Check: PASSED

- e2e/helpers/setup.mjs, e2e/french-overflow.spec.mjs exist and are committed (798726f, 0c79f4b)
- Commits verified in `git log`; ledger measured 2 commits since 48df98c
