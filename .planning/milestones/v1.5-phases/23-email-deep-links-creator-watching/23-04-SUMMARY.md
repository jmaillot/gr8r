---
phase: 23-email-deep-links-creator-watching
plan: 04
subsystem: spa-routing
tags: [history, pushstate, popstate, back-forward, deep-links, e2e]
requires:
  - "23-01: urlForView() seam in go() + applyDeepLink task branch (src/main.js, src/shell/render.js)"
  - "23-02: logged-out ?next= carry boot branch (untouched, still replaceState-based)"
provides:
  - "pushState URL sync for every navigable view (/w/:slug/<route-id>, /w/:slug/project/:key, /w/:slug/member/:id, /w/:slug/task/:key)"
  - "single popstate handler at boot resolving through applyDeepLink with { back: true } (never pushes)"
  - "drawer open/close URL behaviour: open pushes the task URL, close pushes the underlying view URL (Back re-opens the task — D-03/research OQ2)"
  - "e2e/back-forward.spec.mjs (5 scenarios × EN+FR)"
affects: ["future view URL extensions ride urlForView + the popstate resolver as-is"]
tech-stack:
  added: []
  patterns: [opt.replace boot deep-link resolution, opt.noHistory for non-view URL writes, urlForView as the single URL-write seam]
key-files:
  created: [e2e/back-forward.spec.mjs]
  modified: [src/shell/render.js, src/main.js, src/actions/actions.js]
decisions:
  - "Extended urlForView beyond the plan's 'workspace root otherwise' to per-view paths — the plan's own must-have truths (back returns to the previous view) and acceptance criterion are unsatisfiable with a single root URL, and the plan action explicitly permits 'extend urlForView so every currently navigable route maps to a sane path'"
  - "Drawer open/close route through go() (A.openTask/A.closeDrawer + two side paths: archive of the open task, inline title edit) so the URL write stays in the single seam; noHistory keeps the drawer out of the internal view-back stack"
  - "Boot-time deep links resolve with opt.replace — the browser entry already carries the deep-linked address; pushing would duplicate it and break 'back leaves the task'"
  - "popstate drops the drawer for every non-task entry (counterpart of the close-push); task entries resolve through applyDeepLink unchanged (T-23-05: no new parsing surface)"
metrics:
  duration: ~45 min
  completed: 2026-10-30
status: complete
commits: 4
plan_head_before: 08a19e4f5bf30f77d437827d23154972af0a7cd4
plan_head_after: a2765ea2e8d9e2edf5e2b109bd5a1f893f06757d
actuals:
  tokens: 8000
  tasks: 2
  commits: 4
estimate:
  tokens: 72000
---

# Phase 23 Plan 04: URL Sync + Browser History (pushState/popstate) Summary

**One-liner:** Every SPA view now mirrors into browser history — go() pushes per-view URLs (/w/:slug/inbox, /project/:key, /task/:key…), one boot-time popstate handler restores views through the deep-link resolver with { back: true }, and closing the task drawer pushes the underlying view URL so Back re-opens the task.

## What Was Done

### Task 1: pushState in go() + popstate handler (LINK-04) — commits d5e16f3, a2765ea
- **src/shell/render.js** — go() writes URLs only through the urlForView seam: forward navigation pushes, back (`opt.back`) and boot deep-link resolution (`opt.replace`) replaceState. `opt.noHistory` added for non-view URL writes (drawer open/close must not pollute the internal `S.ui.history` back stack). urlForView extended per the plan's own action: task drawer → `/w/:slug/task/:key`, project → `/w/:slug/project/:key` (key-based, matching applyDeepLink), member → `/w/:slug/member/:id` (id-based, matching applyDeepLink), plain ROUTE_IDS → `/w/:slug/<route>`, home → workspace root.
- **src/main.js** — exactly one popstate listener at boot (grep count = 1). Cross-workspace/auth/bare-root entries land on the workspace home view; task entries resolve via applyDeepLink (same canSee checks + not-found handling — T-23-05 mitigated, no new parsing surface). Every non-task entry drops the drawer (counterpart of the drawer's close-push, otherwise urlForView would rewrite the restored view's URL back to the task address). applyDeepLink threads an `opt` argument; boot calls it with `{ replace: true }` so the browser's own deep-link entry is never duplicated. The 12 pre-existing auth/workspace replaceState sites untouched.
- **src/actions/actions.js** — A.openTask and A.closeDrawer now route through go() (keepDrawer + noHistory) instead of bare render(): opening the drawer pushes `/w/:slug/task/:key`, closing pushes the underlying view's URL (research Open Question 2, RESOLVED — consistent with D-03). Two side paths that drop the drawer without closeDrawer (archiving the open task; starting an inline title edit from a task row) also re-sync the URL (Rule 2). A follow-up commit (a2765ea) delivered the e2e-driven corrections: per-view URL mapping, boot opt.replace, and the popstate drawer drop.

### Task 2: back/forward e2e spec — commit 27ccc00
- **e2e/back-forward.spec.mjs** (EN+FR parametric, locale-file strings, real-API fixtures): (1) manual 3-view navigation + back/forward with a boot-time sentinel proving no page reload; (2) deep-link vs manual parity — back leaves the task, forward re-opens the drawer; (2b) drawer-close pushes the board URL, Back re-opens the task, Forward closes it; (3) refresh on a task URL keeps drawer + URL (D-03 regression); (4) history-length stability: two views add exactly two entries and repeated backs never grow it (Pitfall 4).

## Verification

| Check | Result |
|-------|--------|
| `npm test` | 585/585 pass |
| `npx playwright test --config e2e/playwright.config.mjs e2e/back-forward.spec.mjs e2e/deep-link.spec.mjs` | 18/18 pass (10 + 8, EN+FR) |
| `grep -c "addEventListener('popstate'" src/main.js` | 1 |
| 12 pre-existing replaceState sites | unchanged (diff inspection) |

## Deviations from Plan

**1. [Rule 1 - Correctness] urlForView extended to per-view paths (plan said "workspace root otherwise")**
- **Found during:** Task 1 verification
- **Issue:** With every non-drawer view resolving to the workspace root, popstate cannot distinguish views — back from My Tasks landed on Home, failing the plan's own must-have truth ("browser back returns to the previous view") and acceptance criterion. The plan action itself sanctions extending urlForView "so every currently navigable route maps to a sane path".
- **Fix:** Project views use their key, members their id, plain views the route id, home the workspace root — all resolvable by the existing applyDeepLink branches with zero new parsing. Also: boot deep links resolve with opt.replace (pushing would duplicate the browser's own entry), and the popstate handler drops the drawer on non-task entries (else the restored view's URL is rewritten back to the task address).
- **Files modified:** src/shell/render.js, src/main.js
- **Commit:** a2765ea

**2. [Rule 2 - Missing critical functionality] Two drawer-drop side paths left stale task URLs**
- **Found during:** Task 1
- **Issue:** A.archiveTask (open task) and DBL.editTitle drop `S.ui.drawer` without going through closeDrawer — under pushState the URL would keep claiming a task that is no longer open.
- **Fix:** Both re-sync the URL via go(S.ui.route, S.ui.params, { keepDrawer: true, noHistory: true }).
- **Files modified:** src/actions/actions.js
- **Commit:** d5e16f3

**3. [Rule 1 - Test infrastructure] e2e fixture titles must be deterministic, not run-unique**
- **Found during:** Task 2
- **Issue:** The acme document is shared across workers/runs and applyDeepLink resolves a task key to the FIRST match — run-unique task titles under the same static key raced, so drawer assertions intermittently saw another run's title.
- **Fix:** Fixture project/task titles derive from the static key; beforeAll is idempotent (skips re-adding when present).
- **Files modified:** e2e/back-forward.spec.mjs
- **Commit:** 27ccc00

**Total deviations:** 3 auto-fixed. **Impact:** none on scope; all gates green.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None — T-23-05 (popstate → view resolution) mitigated: the handler reuses applyDeepLink's exact resolution (same canSee/not-found handling), maps auth/workspace URLs to the workspace home view, and never resolves cross-workspace entries. T-23-SC N/A (zero runtime dependencies).

## Issues Encountered

Note for future phases: every new navigable view should extend urlForView (one line per case) — popstate and deep links then work for it with no further wiring.

**Next:** Ready for phase-level verification (`/gsd-verify-work`).

## Self-Check: PASSED

- e2e/back-forward.spec.mjs exists on disk — FOUND
- Commits d5e16f3, 27ccc00, a2765ea present in git log 08a19e4..a2765ea — FOUND
- Plan-level verification re-run at close: 585/585 node tests, 18/18 e2e (back-forward + deep-link)
