---
phase: 06-english-extraction-locale-aware-formats
plan: 14
subsystem: ui
tags: [i18n, catalogue, extraction, pages, scanner, allow-list]

# Dependency graph
requires:
  - phase: 06-09
    provides: the extraction protocol (reuse over duplication, machine identifiers stay, t() never escapes), the green scan baseline (424 literals, 381 allow-list entries)
  - phase: 05-i18n-foundation-catalogue-contract
    provides: the t() leaf layer, the catalogue lint, the 174-name icon baseline
provides:
  - the thirteen remaining page modules (activity, errors, favorites, home, inbox, members, my-tasks, notifications, overview, project, projects, search, tasks) read every user-visible literal from the catalogue
  - 184 new page.* / err.* / a11y.* / common.* values in src/locales/en.json (1201 → 1385 keys)
  - an allow-list shrunk by 266 entries (381 → 115), still sorted; scan green at 128 literals, 0 violations
  - the stored activity verbs, the stored notification fragments and the stored role ids untouched — displayed through roleLabel()/catalogue lookups, never rewritten
affects: [phase-7 french translation of the page surfaces, phase-9 activity verb restructure]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 33000    # 132744 chars over the realized diff (17 files) / 4
  tasks: 3
  commits: 13

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "reuse over duplication: 82 of this wave's literals resolved to existing catalogue keys (nav.route.*, page.field.*, page.states.*, palette.*, act.*, common.*), only 102 new keys were minted"
    - "t-shadowing discipline: three more locals named t renamed tk (pageTeam in members.js, inboxItem/inboxPreview in inbox.js, the map callback in notifications.js) — every t() call resolves to the import"
    - "scanner contract discovered en route: callVars() reads explicit property keys only — a shorthand vars object { q } parses as zero vars, so placeholder parity requires the explicit { q: q } spelling"
    - "composite interpolated literals are extracted as one key with placeholders ({n} unread, {a} active · {c} completed, Health of every project in {ws}.) rather than as concatenated fragments"

key-files:
  created: []
  modified:
    - src/pages/activity.js
    - src/pages/errors.js
    - src/pages/favorites.js
    - src/pages/home.js
    - src/pages/inbox.js
    - src/pages/members.js
    - src/pages/my-tasks.js
    - src/pages/notifications.js
    - src/pages/overview.js
    - src/pages/project.js
    - src/pages/projects.js
    - src/pages/search.js
    - src/pages/tasks.js
    - src/locales/en.json
    - test/fixtures/i18n-pending.json
    - test/i18n-dates.test.mjs
    - test/i18n-core-features.test.mjs

key-decisions:
  - "The activity filters still parse the stored English verbs (a.verb.includes('comment'), /moved|completed|reopened/, includes('project')) — only the filter LABELS were extracted; the verbs are data phase 9 restructures"
  - "The members page displays roles through roleLabel(r) everywhere (the seg filter, the pills, the badges, the perms-table headers) while every stored id ('Owner', the filter comparison role === r, the ROLES machine list) stays exactly as it is"
  - "The notification fragments the seed stores (notifText's n.text, n.snippet) were never touched — only the labels around them (tabs, empty states, buttons, accessible names) read the catalogue"
  - "The 404 page reads t('page.notFound') = 'Page not found' byte-identically, so the Chromium selectors on that exact text still match (I18N-02 groundwork)"
  - "The search page keeps foldForSearch on both sides of the comparison untouched — only labels, the placeholder and the section titles moved to the catalogue"
  - "The catalogue wave-boundary pin moved 1201 → 1385 keys and the home.js import-shape pin gained t — both are the same pins re-measured at the new boundary, not weakened rules"

requirements-completed: []  # I18N-01 stays Pending until phase close (orchestrator instruction)

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "The thirteen page modules carry no user-visible literal — the scan reports none of them"
    requirement: I18N-01
    verification:
      - kind: other
        ref: "node scripts/i18n-scan.mjs → 128 literals, 128 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch"
        status: pass
    human_judgment: false
  - id: D2
    description: "The stored verbs, fragments and role ids are untouched; the members page displays roles through the catalogue"
    requirement: I18N-01
    verification:
      - kind: unit
        ref: "the activity-filter verify (includes('comment') / moved|completed|reopened intact) printed activity filters intact: true"
        status: pass
      - kind: unit
        ref: "npm test → 327/327 (the tenancy suite proves the role filter still matches the stored id)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The English interface renders byte-identically, proven by the six Chromium tenancy tests"
    requirement: I18N-01
    verification:
      - kind: e2e
        ref: "npm run build && npm run e2e → 6 passed (selectors on unchanged English text, including 'Page not found')"
        status: pass
    human_judgment: false
  - id: D4
    description: "The allow-list shrank by exactly this wave's literals and stays sorted; fr.json untouched; the icon baseline held"
    requirement: I18N-01
    verification:
      - kind: other
        ref: "allow-list 381 → 115 entries, sorted by file then text; fr.json still its 6 seed keys; the 174-name icon baseline asserted inside npm test"
        status: pass
    human_judgment: false

# Metrics
duration: 24min
completed: 2026-10-22
status: complete
---

# Phase 6 Plan 14: The Thirteen Remaining Page Modules Summary

**The thirteen remaining page modules — activity, 404, favourites, home, inbox, members, my tasks, notifications, overview, project, projects, search and tasks — now read every heading, subtitle, empty state, form label and accessible name from the catalogue through 184 new keys, the allow-list shrank by exactly the 266 literals the wave extracted (381 → 115), and the scan is green at 0 violations**

## Performance

- **Duration:** 24 min
- **Started:** 2026-10-22T17:57Z
- **Completed:** 2026-10-22T18:21Z
- **Tasks:** 3 (all TDD where a RED was drivable; the wave-boundary proof ran green-first pins)
- **Files modified:** 17

## Accomplishments

- 184 new values in `src/locales/en.json` (1201 → 1385 keys) across `page.*`, `err.*`, `a11y.*` and `common.*`; `fr.json` untouched at its 6 seed keys (D-02)
- All thirteen page modules swept: 296 literal findings at the wave start reduced to 128 (the remaining 128 belong to files outside this wave's surface); the allow-list shrank 381 → 115, still sorted
- 82 literals resolved to existing catalogue keys (reuse over duplication — `nav.route.*`, `page.field.*`, `page.states.*`, `palette.*`, `act.*`, `common.*`), only 102 new keys minted
- The activity filters still parse the stored English verbs byte-for-byte; the members page displays every role through `roleLabel(r)` while the stored ids, the `role === r` comparison and the `ROLES` machine list never moved
- The notification fragments the seed stores are untouched — the inbox and notifications pages extract only the labels around them
- The 404 heading reads `t('page.notFound')` = `"Page not found"` byte-identically, so the Chromium suite's selectors still match
- The search page's `foldForSearch` comparison normalises both sides exactly as wave 5 shipped it — preserved, not touched
- Verification: scan 128/128/0 violations; `npm test` 327/327; `npm run lint` clean; `npm run format:check` clean; `npm run build` ✓ and e2e 6/6 Chromium

## Task Commits

1. **Task 1: the activity, members, project and projects pages** — `91ca4b0` (home, carried over with task-1 files), `35c8d33` (activity + errors + favourites), `60bd79a` (members), `1a6964c` (project), `4eba98f` (projects)
2. **Task 2: the home, inbox, notifications, my-tasks and search pages** — `d28e6b8` (inbox), `12afc86` (notifications), `8933a5d` (my-tasks), `06637e7` (search)
3. **Task 3: the errors, overview, tasks and favourites pages, and the wave's proof** — `f9f94d6` (overview), `8a745b9` (tasks), `360fd12` (wave-boundary pins), `82976db` (prettier)

## Files Created/Modified

- `src/pages/{activity,errors,favorites,home,inbox,members,my-tasks,notifications,overview,project,projects,search,tasks}.js` — every user-visible literal replaced by a `t()` call; three `t`-shadowing locals renamed `tk`
- `src/locales/en.json` — +184 keys, inserted in the existing namespaces; no existing key renamed
- `test/fixtures/i18n-pending.json` — 381 → 115 entries, still sorted by `file` then `text`
- `test/i18n-dates.test.mjs` — the home.js import-shape pin now includes `t`
- `test/i18n-core-features.test.mjs` — the wave-boundary catalogue pin moved 1201 → 1385

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Three locals named `t` shadowed the catalogue lookup**
- **Found during:** Tasks 1 and 2
- **Issue:** `const t = team(...)` in `pageTeam` (members.js) and `const t = n.task ? task(...)` in `inboxItem`/`inboxPreview` (inbox.js) and the `.map(n => { const t = ... })` callback (notifications.js) would make `t('key')` call a data object as a function
- **Fix:** the contained locals renamed `tk` (wave-6/7 precedent); every `t()` call in those scopes now resolves to the import
- **Files modified:** src/pages/members.js, src/pages/inbox.js, src/pages/notifications.js
- **Committed in:** 60bd79a, d28e6b8, 12afc86

**2. [Rule 1 - Bug] The scanner's `callVars()` cannot read a shorthand vars object**
- **Found during:** Task 2 (search.js scan run)
- **Issue:** `t('page.search.noMatch', { q })` parses as zero vars (no `:` separator for the scanner's `propertySeparator`), so the placeholder-parity check reported a mismatch against the `{q}` placeholder in the value
- **Fix:** the vars object spelled explicitly `{ q: q }` — same rendering, the scan's parity check reads it
- **Files modified:** src/pages/search.js
- **Committed in:** 06637e7

**3. [Rule 3 - Blocking] Two wave-boundary regression pins pinned the pre-wave shape**
- **Found during:** Task 3 (`npm test`)
- **Issue:** `test/i18n-dates.test.mjs:178` pinned home.js's import as exactly `{ monthName, weekdayName }` — the wave legitimately added `t`; `test/i18n-core-features.test.mjs:218` pinned the catalogue at 1201 keys — the wave grew it by 184. Both failed on any correct implementation of this plan
- **Fix:** the import pin now matches `{ monthName, t, weekdayName }` (a strictly stronger check — it still asserts the month/weekday wiring); the catalogue pin moved to the new wave boundary 1385
- **Files modified:** test/i18n-dates.test.mjs, test/i18n-core-features.test.mjs
- **Committed in:** 360fd12

**4. [Rule 3 - Blocking] Prettier reported four swept files out of style**
- **Found during:** Task 3 (`npm run format:check`)
- **Issue:** the multi-line `t()` interpolations in home.js, members.js, my-tasks.js and search.js drifted from the project's Prettier style
- **Fix:** `prettier --write` on the four files; formatting only, the scan and the suite re-verified green after
- **Files modified:** src/pages/home.js, src/pages/members.js, src/pages/my-tasks.js, src/pages/search.js
- **Committed in:** 82976db

### Scope Notes (not deviations — the plan's own surface, read precisely)

- The plan's Task 1 groups four pages, but the executor's working tree already carried the home-page sweep from the same pass; its commit (`91ca4b0`) landed first and the remaining task-1 files followed in `35c8d33`–`4eba98f`. Every task-1 file is swept and committed.
- The plan's Task 3 names "the errors, overview, tasks and favourites pages" — errors.js and favorites.js were swept together with activity.js in `35c8d33` because they share the state-page surface; overview.js and tasks.js closed the task in `f9f94d6`/`8a745b9`.
- `page.overview.timeline` was minted even though `nav.route.timeline` already carries "Timeline" — the catalogue already holds duplicate values across namespaces (e.g. "Status", "Tasks"), and the key keeps the overview page's own label discoverable for phase 7.

## Issues Encountered

- The scanner's `ruleAttribute` family correctly left the `<kbd>`-shaped and machine-value attribute literals alone; no rule needed writing en route — the wave's only scanner discovery was the `callVars()` shorthand gap documented above.
- Two missed literals were caught by the scan rather than by inspection: the `data-tip`/`aria-label` pair "Open My Tasks" (home.js, reported as 2 `unlisted` findings after the first pending-list shrink) and the missing `page.members.col.lastActive` key (reported as `unresolved`). Both were fixed in the same pass that surfaced them.

## Known Stubs

None — no stub, placeholder, or unwired data source was introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The whole page surface of `src/pages/` now reads the catalogue: phase 7 (I18N-02, I18N-07) can translate every page heading, subtitle, empty state and accessible name by adding French values without touching a call site
- The stored vocabulary this wave deliberately left as data (activity verbs, notification fragments, role ids) is exactly the surface phase 7's render-time translation and phase 9's verb restructure own
- The 115 remaining allow-list entries belong to files outside the page modules (shell, overlays, actions, views) and are the later sweeps' to remove

## Self-Check: PASSED

- All 17 modified files exist on disk; all 13 task commits found in git log (`91ca4b0`, `35c8d33`, `60bd79a`, `1a6964c`, `4eba98f`, `d28e6b8`, `12afc86`, `8933a5d`, `06637e7`, `f9f94d6`, `8a745b9`, `360fd12`, `82976db`)
- Scan re-run at summary time: 128 literals, 128 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch
- Allow-list re-measured: 115 entries, sorted
- fr.json re-measured: 6 seed keys, untouched by this wave
- npm test re-run at summary time: 327/327; e2e 6/6 Chromium; lint and format:check clean

---
*Phase: 06-english-extraction-locale-aware-formats*
*Completed: 2026-10-22*