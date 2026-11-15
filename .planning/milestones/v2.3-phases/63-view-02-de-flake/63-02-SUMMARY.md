---
phase: 63-view-02-de-flake
plan: 02
subsystem: e2e-spec
tags: [flaky, playwright, saved-views, view-02]
requires: [63-TRIAGE.md verdict]
provides: [deterministic VIEW-02 at retries=0 (D-01 10×), SC-3 semantic dismissal + real completion signals]
affects: [63-03]
tech-stack:
  added: []
  patterns: [arm-before-act waitForResponse (D-08), scoped .last() toast assertions, Escape popover dismissal]
key-files:
  created: []
  modified:
    - e2e/saved-views.spec.mjs
decisions:
  - Toast assertions scoped via .last() — the triage root cause (unscoped locator × 4200 ms toast lifetime)
  - Delete-flow popover race closed spec-side by awaiting open-GETs, DELETE and post-delete refresh GETs (TRIAGE §4.6)
  - No helper/config changes — fix stays spec-side (D-04, RESEARCH Pattern 1)
metrics:
  duration: ~12 min
  completed: 2026-11-14
  tasks: 2
  commits: 2
  plan_head_before: 13d17f8
  plan_head_after: b40c3e5
status: complete
actuals:
  tokens: 8000
  tasks: 2
  commits: 2
---

# Phase 63 Plan 02: VIEW-02 De-Flake Fix Summary

**One-liner:** VIEW-02 now passes 10/10 at workers=1 retries=0 (was 10/10 failed) via Escape popover dismissal, awaited live/named PUT completion signals, and `.last()`-scoped toast assertions killing the triage-confirmed strict-mode race.

## What was done

- **Task 1 (tracer, commit e6da5d4):** `setColumn()` rewritten — `mouse.click(5, 400)` → `keyboard.press('Escape')` with the kept `.pop.floating` `toHaveCount(0)` proof; the debounced live-view PUT awaited on a `waitForResponse` predicate (PUT `/api/me/views`, postData without `name`), armed immediately before the single toggle click (D-08 arm-before-act). Quick run: 1 passed.
- **Task 2 (commit b40c3e5):** Final dismissal site (post-apply columns check) → Escape; all four `.toast` assertions scoped to `.last()` — the triage root cause (identical save toast alive < 4.2 s in fast serial runs, strict-mode "resolved to 2 elements"); applied live PUT awaited after the apply row click (applyTableView re-arms the 450 ms debounce at savedViewsUi.js:128); delete flow awaits the refetch-on-open GETs (D-52), the DELETE, and the post-delete refresh GETs so the popover's last writer is the post-delete rebuild (TRIAGE §4.6 ordering race).
- **D-01 proof:** `--repeat-each=10 --workers=1 --retries=0` → **10 passed (1.4m)**, zero coordinate clicks, zero sleeps.
- **Gate sanity:** `npm run build && npm test && npm run lint` all pass.

## Deviations from Plan

**[Rule 1 - Bug] Scoped toast assertions + delete-flow network awaits (beyond the plan's literal task text).**
- **Found during:** Task 2, walking the full flow per 63-TRIAGE's verdict.
- **Issue:** The plan's tasks specified Escape + live-PUT waits, but the triage proved the reproduced failures were a toast strict-mode race and a popover-refresh ordering race — neither fixed by the planned changes alone; the 10× verify would have failed 10/10.
- **Fix:** Applied the triage's "Shape for Plan 02" items 1 and 3 (scoped toasts, awaited signals) — explicitly gated into this plan's scope by the 63-01 SUMMARY decision line.
- **Files modified:** e2e/saved-views.spec.mjs
- **Commit:** b40c3e5

## Known Stubs

None.

## Verification

- `grep -c 'mouse.click(5, 400)'` → 0 ✓
- `grep -c 'waitForTimeout'` → 0 ✓
- `/tmp/opencode/phase63-p2-t1.log`: `1 passed`; `/tmp/opencode/phase63-p2-t2.log`: `10 passed (1.4m)`, no failed line ✓ (ephemeral, not committed per T-63-01)
- build ✓ test ✓ lint ✓

## Self-Check: PASSED

- FOUND: commit e6da5d4, commit b40c3e5 (git log); e2e/saved-views.spec.mjs modified in both

## Deferred Issues

- Per-run `WARN login failed` double-login bounce — carried from 63-01, unchanged.
- Popover double-refresh stale-write (savedViewsUi.js refreshViewsPop vs deleteTableView) remains an app-side last-writer pattern; this plan closes the window spec-side only. Candidate for a future awaited-signal hardening if it ever fires app-side.
