---
phase: 63-view-02-de-flake
plan: 03
subsystem: e2e-gates
tags: [flaky, playwright, saved-views, view-02, gates]
requires: [63-TRIAGE.md D-03 verdict, 63-02 spec fix]
provides: [recorded D-03 not-proven ruling (SC-4), D-02 full parallel pass pre-validating Phase 64 close gate, green full phase gate]
affects: [Phase 64]
tech-stack:
  added: []
  patterns: [arm-before-act for popover-open GETs (D-08)]
key-files:
  created: []
  modified:
    - .planning/phases/63-view-02-de-flake/63-TRIAGE.md
    - e2e/saved-views.spec.mjs
decisions:
  - D-03 ruled NOT PROVEN → skip path: zero src/ diff, ruling + evidence citation recorded in TRIAGE §8 (SC-4: bug never laundered, never invented)
  - D-02 arm-after-act fix landed spec-side (Rule 1): open-GET listeners attach before the popover-open click
metrics:
  duration: ~37 min
  completed: 2026-11-14
  tasks: 2
  commits: 3
  plan_head_before: 9a6bd30
  plan_head_after: f9b569e
status: complete
actuals:
  tokens: 18000
  tasks: 2
  commits: 3
---

# Phase 63 Plan 03: Conditional D-03 Fix + Final Gates Summary

**One-liner:** D-03 ruled not-proven (zero src/ diff, ruling recorded per SC-4); a D-02 full parallel run exposed and fixed one last arm-after-act wait in the spec; the phase closed green — 112/112 parallel e2e with VIEW-02 inside it, build + 1524 unit + lint + e2e gate at exit 0.

## What was done

- **Task 1 (commit 4c4dd1d, skip path):** 63-TRIAGE's D-03 ruling is NOT PROVEN (§3/§6: every `/api/me/views` PUT completed 200 in order across all traces; clearTimeout coalescing is by-design debounce semantics). Per the plan's branch gate: zero code changes; a dated §8 addendum records the ruling with its evidence citation. The viewSync silent-except-401 contract, dynamic-import callers and sanitizeViewBlob payload are untouched by construction.
- **Task 2 (commits 1ee1e99 + f9b569e):**
  - First D-02 full parallel run failed VIEW-02 at 30 s: the two popover-open GET waits were armed *after* the awaited open click (a D-08 arm-after-act violation inside 63-02's delete-flow change) — under 3-worker load both GETs settle during the click round-trip and the post-armed listeners hang. **Rule 1 fix (1ee1e99):** listeners attach before the click; DELETE/post-delete arming already correct.
  - Post-fix D-02 confirmation: **112 passed (6.1m), 0 failed, VIEW-02 ✓ 8.8 s inside the run, zero ECONNREFUSED** — D-04 (no isolation) and retries=0 held.
  - Full phase gate verbatim (build → unit → lint → e2e): **i18n scan clean; chunks green (index 498.24 kB — 500 kB gate holds); 1536 unit tests, 1524 pass, 0 fail; lint ✓; e2e 112 passed (6.3m), VIEW-02 ✓ 8.7 s; exit 0** (f9b569e records the outcome addendum in TRIAGE §9).

## Deviations from Plan

**[Rule 1 - Bug] Fixed the popover open-GET arm-after-act wait (e2e/saved-views.spec.mjs).**
- **Found during:** Task 2, first D-02 full parallel run.
- **Issue:** 63-02's delete-flow change armed the two open-GET `waitForResponse` listeners after the awaited popover-open click; in fast parallel runs the GETs complete before the listeners attach, hanging the wait to the 30 s test timeout.
- **Fix:** armed both listeners before the click (D-08), DELETE/post-delete arming unchanged.
- **Files modified:** e2e/saved-views.spec.mjs
- **Commit:** 1ee1e99

## Known Stubs

None.

## Verification

- TRIAGE §8 records "D-03 app fix: NOT PROVEN" with trace evidence citation; `git status --porcelain src/` empty at Task 1 ✓
- `/tmp/opencode/phase63-d02.log`: 112 passed (6.1m), no failed line, 0 ECONNREFUSED ✓
- `/tmp/opencode/phase63-gate.log`: 112 passed (6.3m), no failed line, 0 ECONNREFUSED; unit 1524/0 in the shell transcript ✓
- `git log --oneline -- e2e/playwright.config.mjs`: no Phase 63 commit ✓

## Self-Check: PASSED

- FOUND: commits 4c4dd1d, 1ee1e99, f9b569e (git log); TRIAGE §8/§9 present

## Deferred Issues

- Interim one-off failures observed in two 2FA time-window specs during intermediate full runs (`flows` 2FA-en next-step-code retry; `tfa-disable-cycle` en 401-teardown wait) — unrelated to saved-views, untouched this phase, green in every other run including the final gate. Carried to Phase 64 planning as a known load-sensitive flake class; no retries/timeouts/isolation added (standing constraints).
- Per-run `WARN login failed` double-login bounce — carried from 63-01, unchanged.
- Popover double-refresh stale-write (savedViewsUi refreshViewsPop vs deleteTableView) — app-side last-writer pattern, closed spec-side only (63-02); candidate for a future awaited-signal hardening.
