---
phase: 84-backlog-polish-ship
plan: 03
subsystem: mobile-polish + governance-rename
tags: [bp-03, in-01, mobile, e2e, viewport-sweep, hide-m]
requires: [Phase 68 D-02 cols popover ≤900px, 57-UAT deferred item, server.js now() convention, 84-02 locale/i18n state]
provides: [Columns-button label collapse at phone width, phone-viewport overflow sweep assertions (dashboard/members/governance), 57-UAT regression spec coverage, IN-01 updated_at stamp + unit pin]
affects: [84-04 ship gate (clean sweep + IN-01 closed), /gsd-verify-work BP-03 closure]
tech-stack:
  added: []
  patterns: [hide-m label collapse, expect.poll overflow probe (scrollWidth <= innerWidth), hidden[] dual-rendering assertion (card stack + in-DOM colgroup), direct-route navigation at phone width (off-canvas sidebar)]
key-files:
  created: []
  modified: [src/shell/view-engine.js, e2e/mobile-tasks-table.spec.mjs, e2e/mobile-card-hidden.spec.mjs, server.js, test/governance-rename.test.mjs]
decisions:
  - "Toolbar CSS untouched: .toolbar already flex-wraps (board.css:211-219) — the hide-m label collapse alone resolves the 57-UAT truncation (assumption A4 confirmed label-collapse-suffices)"
  - "Sweep navigates routes directly (page.goto) instead of sidebar clicks: the desktop sidebar is off-canvas at 390px so data-a='go' auto-waiting clicks never resolve; french-overflow.spec.mjs precedent"
  - "Overflow sweep found NO document-level overflow on any of the three surfaces — .perm-t permission tables scroll inside their own containers (scoped overflow, by design); no CSS fixes needed"
  - "A6 resolved: no byte-exact updated_at assertion existed in governance-rename.test.mjs — added the stamp pin to GV-01 rather than bumping"
metrics:
  duration: 19 min
  completed: 2026-11-20
status: complete
actuals:
  tokens: 62000
  tasks: 3
  commits: 3
plan_head_before: 7e175553ecbe2d5225f3c11862d02f4843ac024b
plan_head_after: d62d3f2ee1fdf63ee7e4e9dc376e2102f002f21c
---

# Phase 84 Plan 03: BP-03 mobile follow-ups + IN-01 Summary

**One-liner:** Columns button label collapses at phone width via the sibling hide-m pattern, phone-viewport overflow sweep (dashboard/members/governance) pinned green with zero overflow found, and the rename route now stamps updated_at = now() (IN-01) with a unit pin.

## What Was Done

**Task 1 (8d26c573) — Columns button label collapse (57-UAT deferred fix):**
- `src/shell/view-engine.js:227`: `${t('act.columns')}` wrapped in `<span class="hide-m">`, byte-for-byte the sibling Sort/Group/Saved-views pattern (:225/:226/:228).
- Toolbar CSS: located the `.toolbar` owner by grep (src/styles/views/board.css:211) — it already carries `flex-wrap: wrap`, so no CSS change was needed. Phase 68 D-02 hard constraint preserved: the button itself stays visible/functional ≤900px, never display:none (pinned by the existing 899px visibility test plus the new label-collapsed assertion).
- Verify: mobile-tasks-table spec 3/3 green.

**Task 2 (262607e3) — 57-UAT regression + phone-viewport sweep (D-07/D-08, existing specs only):**
- `e2e/mobile-tasks-table.spec.mjs` new test: at 390×844 the Columns label is hide-m-collapsed, the popover opens, toggling priority drives BOTH renderings through the same hidden[] state — the card stack field disappears/returns AND the desktop table's `col[data-col="priority"]` disappears/returns in-DOM (CSS-hidden ≤900px but still live). Plus the tasks-surface overflow probe.
- `e2e/mobile-card-hidden.spec.mjs` new test: no-horizontal-overflow via `expect.poll` on `scrollWidth <= innerWidth` for dashboard (post-sign-in), members and governance at 390×844, arrival proven by each surface's h1.
- Conventions kept: context-level viewport (no setViewportSize), one context per account, real-API fixtures, web-first assertions, no sleeps/screenshots, no new spec files.

**Task 3 (d62d3f2e) — IN-01 rename stamps updated_at (D-10):**
- A6 grep first: governance-rename.test.mjs has NO byte-exact workspace updated_at assertion (only group_mappings inserts carry their own) → added the stamp pin rather than bumping.
- `server.js:7183`: UPDATE now `set name = ?, slug = ?, updated_at = ?` with `now()` (integer Date.now(), :7760 convention). Parameterized query unchanged; route still behind isInstanceAdmin + throttle + sameOrigin; D-06 logInfo governance line untouched; no audit_log row (pinned by the existing D-06 test).
- GV-01 extended: pre-rename baseline row read via the old slug, then `updated_at` asserted integer, positive, and ≥ the pre-rename value.
- Verify: governance-rename 17/17; full `npm test` 2055 tests / 2042 pass / 0 fail (13 skips are pre-existing environment-gated, unchanged from 84-02's baseline).

## Sweep Triage Results (D-07)

Instrumented sweep (direct DOM measurement of every element's right edge vs innerWidth at 390×844):

| Surface | Document overflow | Finding |
|---------|------------------|---------|
| dashboard | 0px | none |
| members | 0px | `.perm-t` permission table (880px wide) scrolls inside its own scroll container — scoped overflow by design, no document bleed |
| governance | 0px | none |
| tasks (bonus, in the regression test) | 0px | none |

**Zero obvious CSS overflows found — nothing fixed, nothing deferred.** The sweep assertions now PIN this state permanently. (First draft of the sweep test used sidebar `[data-a='go']` clicks which hang at 390px — the desktop sidebar is off-canvas at phone width; switched to direct route navigation per the french-overflow precedent. Noted as a navigation-convention pitfall for future mobile specs.)

## Deviations from Plan

None against task content. Two execution notes:
1. **Task 2 nav approach changed during triage** (plan's "reachable from the existing fixtures" discretion clause): direct `page.goto` instead of sidebar clicks — the plan's wording didn't prescribe navigation mechanics; documented above for future spec authors.
2. **A6 branch taken:** the plan said "bump if byte-exact assertions exist, else add a stamp assertion" — the else-branch applied (no assertion existed).

## T-84 Threat-Row Compliance

| Row | Disposition | Evidence |
|-----|-------------|----------|
| T-84-05 Tampering via rename UPDATE | mitigate | Additive-only change: `updated_at = ?` added to the parameterized UPDATE; route still behind isInstanceAdmin + throttle + sameOrigin; no new inputs accepted |
| T-84-06 Repudiation (no timestamp trace) | mitigate | IN-01 IS the fix — updated_at stamped and unit-pinned (GV-01); D-06 logInfo governance line preserved verbatim |
| T-84-SC dependency installs | mitigate | Zero new dependencies; no install commands run this plan |

## Known Stubs

None.

## Self-Check: PASSED

- [x] src/shell/view-engine.js:227 carries `<span class="hide-m">${t('act.columns')}</span>` (FOUND)
- [x] server.js:7183 shows `updated_at = ?` with now() (FOUND via grep)
- [x] commits 8d26c573, 262607e3, d62d3f2e exist (FOUND; measured 7e175553..d62d3f2e = 3 commits)
- [x] mobile specs 7/7 green on the committed tree (two runs: post-Task-2 and final re-verify)
- [x] governance-rename 17/17; npm test 2055/2042/0
- [x] no new spec files (D-08): git diff shows only modifications to the two existing specs
