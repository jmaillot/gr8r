---
phase: 113-housekeeping-fold-in
plan: 01
subsystem: docs-tests
tags: [housekeeping, r-16, known-flake, state-drift, comment-only]
requires: [HK-03, HK-04, R-16]
provides: [known-flake-family-record, state-md-v3.9-header]
affects: []
tech-stack:
  added: []
  patterns: [110-precedent-inline-annotations, comment-only-test-headers]
key-files:
  created:
    - .planning/phases/113-housekeeping-fold-in/113-01-SUMMARY.md
  modified:
    - test/backup-routes.test.mjs
    - test/locale-registry-fixture.test.mjs
    - .planning/PROJECT.md
    - .planning/STATE.md
decisions:
  - 'Every added comment line begins with // so the plan''s comment-only diff filter passes as written (block-comment interiors are not filter-clean)'
  - 'Verify gate bug (Rule 1): plan''s node filter flagged ---/+++ diff headers as non-comment content; filter extended to skip diff file headers/hunks — comment-only intent preserved'
metrics:
  duration: ~12 min
  completed: 2026-11-28
status: complete
commits: 2
plan_head_before: 8be568dcc87e3c109ab6e3789d14795273f6f038
plan_head_after: 787919bc
estimate:
  tokens: 25000
actuals:
  tokens: ~20000
  tasks: 2
  commits: 2
---

# Phase 113 Plan 01: Housekeeping Fold-In Summary

**One-liner:** v3.3 scheduler/load flake family documented-as-known-flake via cross-referenced comment headers in two test files + PROJECT.md annotation (HK-03, R-16), and STATE.md v3.6 header drift fixed to v3.9 (HK-04) — zero behavior change.

## Tasks Completed

| # | Task | Commit |
|---|------|--------|
| 1 | Flake family documented-as-known-flake (HK-03, R-16) | 74288dd3 |
| 2 | STATE.md header drift fixed (HK-04) | 787919bc |

## What Was Done

- **test/backup-routes.test.mjs** — 16-line `//` header comment after the existing `/* ====` provenance block (existing block untouched): v3.3 scheduler/load contention family, restore re-upload test (~:508), full-suite-only, 16/16 ×2 isolated green (110), sibling locale-registry-fixture corroboration, R-16 document-not-chase ruling, baseline identity (exactly 2 documented failures) unaffected, runner serialization parked.
- **test/locale-registry-fixture.test.mjs** — 8-line `//` prepended header: sibling sighting during 110 verification (failed under full-suite load, isolated 5/5), points at backup-routes header as family record.
- **.planning/PROJECT.md** — bracketed `[status v3.9: documented-known-flake — … (R-16)]` appended inline after "scheduler overlap load-flake" on the Known-gaps-carried-forward line; original sentence survives verbatim (110 precedent).
- **.planning/STATE.md** — exactly 3 lines fixed: H1 → `— v3.9`, Current milestone → `v3.9 Backup & Settings UI Refresh (Phases 111–113)`, Phase position → `113 — in planning (1/1 plans; milestone v3.9, phases 111/112 done-or-in-flight)`. Frontmatter (`milestone: v3.9`) untouched; no other sections rewritten.

## Verify Gate Results

- `grep -c "R-16: document-not-chase"` → backup-routes: 1, locale-registry-fixture: 1
- `grep -c "documented-known-flake" .planning/PROJECT.md` → 1
- Comment-only node filter over `git diff -- test/` → OK (see Deviation 1 for header-line handling)
- Task 2 gate: `grep -c "Projects Studio — v3.6"` = 0; `Current milestone` line contains v3.9; `Phase:** 107` count = 0
- Isolated run `node --test test/backup-routes.test.mjs test/locale-registry-fixture.test.mjs`: 0 fail (1 skip pre-existing), confirming green
- Commit 74288dd3 touches exactly the 3 Task-1 files; 787919bc touches exactly STATE.md. Zero src/, server.js, package.json, or locale hunks in either commit (a phase-111 feat commit 748b1918 interleaved between them — file sets disjoint, no conflict).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Verify gate flagged `---`/`+++` diff headers as non-comment lines**
- **Found during:** Task 1 verify
- **Issue:** The plan's node-captured diff filter treats diff file-header lines (`--- a/…`, `+++ b/…`) as content and rejects them; the gate could never pass with any diff present.
- **Fix:** Filter extended to skip `diff --git`, `--- `, `+++ `, and `@@` structural lines. Comment-only intent unchanged — all real content lines are `//`-prefixed.
- **Files modified:** none (gate only)
- **Commit:** n/a

**2. [Rule 1 - Bug] Comment formatting adjusted for gate compatibility**
- **Found during:** Task 1 verify
- **Issue:** Initially wrote the records as block-comment interiors (lines not starting with `*`); the plan's filter only recognizes lines starting `/*`, `*`, or `//` after trim.
- **Fix:** Reformatted both records as `//` line comments. Content unchanged.
- **Files modified:** test/backup-routes.test.mjs, test/locale-registry-fixture.test.mjs
- **Commit:** 74288dd3

## Known Stubs

None.

## Self-Check: PASSED

- 74288dd3, 787919bc exist in log; all 4 modified files verified in commit stats; grep gates quoted above executed with passing output.
