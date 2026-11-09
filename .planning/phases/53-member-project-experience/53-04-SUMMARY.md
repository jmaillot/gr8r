---
phase: 53-member-project-experience
plan: 04
subsystem: ui
tags: [projects-table, share-dedup, i18n, e2e, playwright, data-a-pins]

requires:
  - phase: 53-member-project-experience/53-03
    provides: unified projectSettings modal with data-tab entry contract (A.projectSettings, General/Access tabs)
provides:
  - Workspace > Projects table with a Members count column and a per-row settings gear opening the unified modal on the General tab
  - Exactly one Share affordance on the project page (labeled button → Access tab); avatar-stack/user-plus/overview-pill Share duplicates deleted
  - Pruned a11y.addMember key family; data-a pins at 481 with provenance
affects: [53-05-teams-polish (members-box + invite-button removal builds on the deduped Share surface)]

tech-stack:
  added: []
  patterns: [coarse-count table cells (no roster tooltips, T-53-11), per-row settings gear with data-tab deep link, display-only pill for counts]

key-files:
  created: [e2e/projects-table.spec.mjs]
  modified: [src/pages/projects.js, src/pages/project.js, src/views/project-overview.js, src/locales/en.json, src/locales/fr.json, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs]

key-decisions:
  - "Overview members pill made display-only (span, not button) rather than retargeted — M-13 demands exactly one Share affordance per project page, and retargeting would have created a second access-tab entry point"
  - "Labeled Share button carries data-a=projectSettings data-tab=access directly in markup instead of going through A.share — the context-menu Share entry keeps A.share (runtime data-a, not literal markup), so the grep gate stays clean"

requirements-completed: [PROJ-01, PROJ-02]

coverage:
  - id: D1
    description: "Projects table renders Lead / Teams / Members count / Status (PSTAT pill + task progress) / Target date columns"
    requirement: PROJ-01
    verification:
      - kind: e2e
        ref: "e2e/projects-table.spec.mjs#the table renders all columns with a numeric Members cell, and the row gear opens settings on General (EN) (PROJ-01)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Per-row settings gear (data-a=projectSettings, data-tab=general) opens the unified modal on the General tab"
    requirement: PROJ-01
    verification:
      - kind: e2e
        ref: "e2e/projects-table.spec.mjs#the table renders all columns with a numeric Members cell, and the row gear opens settings on General (EN) (PROJ-01)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Exactly one Share affordance on the project page — the labeled button, opening the unified modal's Access tab; avatar-stack/user-plus/overview duplicates deleted, zero data-a=\"share\" markup in src/"
    requirement: PROJ-02
    verification:
      - kind: e2e
        ref: "e2e/projects-table.spec.mjs#exactly one Share affordance opens the Access tab; the deleted duplicates are gone (EN) (PROJ-02)"
        status: pass
      - kind: other
        ref: "! grep -rn 'data-a=\"share\"' src/ → zero matches"
        status: pass
    human_judgment: false
  - id: D4
    description: "Dead a11y.addMember key deleted in the same commit; i18n gate 0 dead / 0 stale; data-a pins bumped with provenance (484→481)"
    requirement: PROJ-02
    verification:
      - kind: other
        ref: "npm run i18n:scan → 0 dead; node --test test/i18n-shell.test.mjs test/i18n-toast.test.mjs → 53/53"
        status: pass
    human_judgment: false
  - id: D5
    description: "The new table columns read well visually (column widths, alignment, density) at real workspace sizes"
    verification: []
    human_judgment: true
    rationale: "Column layout/aesthetics are a visual judgment no automated assertion covers; e2e only proves structure."

metrics:
  duration: 10 min
  completed: 2026-11-09
  status: complete
actuals:
  tokens: 5800
  tasks: 2
  commits: 3
  plan_head_before: baa7c5c5f8df919830b578c149bd13265dfed5bb
  plan_head_after: 6e90e59
commits: 2
---

# Phase 53 Plan 04: Projects Table Columns & Share Dedup Summary

**Projects table gains a Members count column and a per-row settings gear to the unified modal's General tab; the project page is reduced to exactly one labeled Share button opening the Access tab, with dead keys pruned and pins bumped in the same commits.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-11-09T12:34:40Z
- **Completed:** 2026-11-09T12:44Z
- **Tasks:** 2/2
- **Files modified:** 8 (1 created)

## Accomplishments
- Table view: Members count column (`table.members`, EN+FR) rendering a coarse count — never a roster (T-53-11) — plus a trailing gear column (`data-a="projectSettings" data-tab="general"`) beside the ⋯ menu; Status (PSTAT pill + `progBar`/`progressOf`) and Target date (`fmtDate(p.due)`) verified intact after the 53-03 reassembly
- Share dedup (M-13): header avatar-stack Share and user-plus Share deleted; labeled Share dispatches `projectSettings` with `data-tab="access"` directly; overview members pill made display-only; zero `data-a="share"` occurrences in src/
- UX-01 discipline: `a11y.addMember` deleted from both locales in the same commit; `npm run i18n:scan` 0 dead / 0 stale; data-a pins 483→484→481 with per-change provenance
- New `e2e/projects-table.spec.mjs`: five-column headers, numeric Members cell, gear→modal→General, one-Share/Access-tab/duplicates-gone assertions

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end table columns + row gear opening the unified modal** - `06a18e5` (feat)
2. **Task 2: Share dedup on the project page — one labeled button to the Access tab** - `6e90e59` (feat)

## Files Created/Modified
- `src/pages/projects.js` — Members `<th>`/`<td>` count cell + gear cell with `<th></th>` spacer in the table renderer
- `src/pages/project.js` — avatar-stack + user-plus Share buttons deleted; labeled Share → `data-a="projectSettings" data-tab="access"`; unused avStack import dropped
- `src/views/project-overview.js` — members pill made a non-interactive span (no second Share affordance)
- `src/locales/en.json`, `src/locales/fr.json` — +`table.members`, −`a11y.addMember`
- `test/i18n-shell.test.mjs`, `test/i18n-toast.test.mjs` — data-a pin 483→481 with provenance comments
- `e2e/projects-table.spec.mjs` — new: table columns + gear + Share dedup coverage

## Decisions Made
- Overview members pill became display-only rather than a second access-tab entry — keeps M-13's "exactly one Share affordance" literally true on every tab.
- Labeled Share carries the dispatch attributes in markup (no A.share hop); A.share remains solely for the runtime-generated context-menu entry, so the literal-markup grep gate stays at zero.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] project-overview.js carried a fourth data-a="share" occurrence**
- **Found during:** Task 2 (the `! grep -rn 'data-a="share"' src/` verify gate)
- **Issue:** The plan's action listed only project.js:74-75, but the overview tab's members pill also dispatched A.share — the grep gate would have failed.
- **Fix:** Pill converted to a display-only span (consistent with M-13's single-affordance rule); counted in the pin bump (−1).
- **Files modified:** src/views/project-overview.js
- **Verification:** grep gate clean; e2e asserts the pill is non-interactive
- **Committed in:** 6e90e59

**2. [Rule 3 - Blocking] e2e suite serves the built app — dist was stale**
- **Found during:** Task 1 (first e2e run failed on the old bundle)
- **Issue:** `npm run e2e` serves `dist/`; source edits need `npm run build` first (same lesson as 53-03's notes).
- **Fix:** Rebuilt before each verification round.
- **Files modified:** none (build artifact)
- **Verification:** spec green after rebuild
- **Committed in:** n/a (workflow note, no code change)

---

**Total deviations:** 2 auto-fixed (2 blocking workflow/gate issues). **Impact on plan:** both required for the verify gates to hold; no scope creep.

## Issues Encountered
- `test/totp-rewrap.test.mjs` fails suite-wide: ENOENT `DEPLOY.md` — pre-existing from the parallel docs split (logged in 53-01's deferred items; out of scope).
- Deep-link `page.goto('/w/slug/project/id')` didn't resolve the SPA route in the new spec — replaced with UI navigation (Projects → row click), matching the sibling spec's convention.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Ready for 53-05 (Teams polish + milestone i18n close-out): the Share surface is deduped, invite flows run only through the unified modal, and the i18n gate is at 0 dead / 0 stale with pins current.
- No blockers.

---
*Phase: 53-member-project-experience*
*Completed: 2026-11-09*

## Self-Check: PASSED

- 53-04-SUMMARY.md and e2e/projects-table.spec.mjs exist on disk.
- All 3 commits (06a18e5, 6e90e59, 629d711) present in `git log`.
- Acceptance criteria re-run: Members count cell + `data-a="projectSettings" data-tab="general"` gear in the table renderer; e2e asserts all five columns + gear→modal→General and one Share→Access (2/2 pass); `npm run i18n:scan` exits 0 with `table.members` in both locales and `a11y.addMember` deleted; `grep -rn 'data-a="share"' src/` returns nothing; no tooltip in the new columns renders names or perm levels (count/date only).
- Plan verification: `npm run e2e -- e2e/projects-table.spec.mjs` 2/2 green; `npm run e2e -- e2e/project-settings.spec.mjs` 9/9 and `e2e/flows.spec.mjs` 30/30 (no regressions); `npm test` 1147 pass / 1 fail (pre-existing totp-rewrap DEPLOY.md ENOENT, already tracked in WINDOWS.md, out of scope).
