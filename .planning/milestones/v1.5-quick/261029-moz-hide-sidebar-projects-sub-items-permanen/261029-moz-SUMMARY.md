---
phase: quick-261029-moz
plan: 01
status: complete
subsystem: shell, settings, i18n
tags: [sidebar, projects, settings, i18n]
requires: []
provides:
  - Read-only active-projects inventory in Workspace settings > Projects
affects: []
tech-stack:
  added: []
  patterns: [renderSidebar template literals, sblock/srow settings markup, i18n pin guards]
key-files:
  created: []
  modified:
    - src/shell/layout.js
    - src/pages/settings.js
    - src/locales/en.json
    - src/locales/fr.json
    - test/i18n-core-features.test.mjs
    - test/i18n-shell.test.mjs
    - test/i18n-toast.test.mjs
decisions:
  - "Hard-hide (not CSS hide) of sidebar Projects sub-items; dead toggleExpand triggers removed from layout.js"
  - "A.toggleExpand action left in actions.js as acceptable dead code per plan instruction (only renderer call sites removed)"
  - "Settings active-project rows show team name + status badge, link to project via existing data-a=go convention"
metrics:
  tasks: 2
  commits: 2
actuals:
  tokens: 12000
  tasks: 2
  commits: 2
---

# Quick Task 261029-moz: Hide Sidebar Projects Sub-items Permanently Summary

Sidebar Projects sub-items (board/list/timeline/files) permanently hard-hidden and a read-only active-projects inventory added to Workspace settings > Projects.

## Completed Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Hard-hide sidebar Projects sub-items + dead expand affordance | 3fef45d | src/shell/layout.js |
| 2 | Read-only active-projects inventory in settings | 44b89ec | src/pages/settings.js, src/locales/en.json, src/locales/fr.json, test/i18n-*.test.mjs |

## What Was Done

**Task 1 — Sidebar hard-hide (3fef45d)**
- Removed the entire `.sub` block from `renderSidebar()` in src/shell/layout.js (the 4 sub-item buttons for board/list/timeline/files). All destinations remain reachable via the project detail page tabs.
- Removed both `data-a="toggleExpand"` triggers: the one on the `.pico` icon span and the chevron `ibtn` in the `.hov` span. `u.expanded` reads are gone from layout.js.
- Workspace Archive `sItem` and all other row affordances (drag, fav/lock badges, status dot, context menu) untouched.

**Task 2 — Settings active inventory (44b89ec)**
- In settings.js `case 'projects'`: added `active = d.projects.filter(p => !p.archived)` and rendered a read-only `.sblock` ("Active projects") above the existing archived section.
- Rows: project icon + name (link via `data-a="go" data-r="project"`), team name resolved via existing `team()` helper, status badge. Empty state reuses the faint-message pattern with new key `settings.projects.noActive`.
- Archived section (restore/delete/open-archive) unchanged.
- New locale keys: `settings.projects.active` / `settings.projects.noActive` (EN + FR).
- i18n pins bumped: catalogue 1594→1596 (i18n-core-features), data-a 448→446 (i18n-shell + i18n-toast).

## Verification

- `npm test`: 566 tests, 566 pass, 0 fail.
- grep confirms no `class="sub` block and no `toggleExpand` in src/shell/layout.js; Archive entry intact.
- grep confirms `settings.projects.active` in en.json, fr.json, and settings.js.

## Deviations from Plan

**1. [Rule 3 - Blocking] Extra i18n pin in test/i18n-shell.test.mjs**
- **Found during:** Task 2 verification
- **Issue:** The plan named only test/i18n-core-features.test.mjs for pin bumps, but the `data-a` count pin exists in two more files (i18n-shell, i18n-toast); i18n-toast failed first, then i18n-shell.
- **Fix:** Bumped the same `data-a` 448→446 pin in both files, same rationale comment.
- **Files modified:** test/i18n-shell.test.mjs, test/i18n-toast.test.mjs
- **Commit:** 44b89ec

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary surface.

## Self-Check: PASSED

- Files modified exist and committed: 3fef45d (layout.js), 44b89ec (settings + locales + tests).
- `git log` contains both commits on main.
- npm test end-to-end green after final pin bump.
