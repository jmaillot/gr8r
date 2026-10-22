---
phase: 06-english-extraction-locale-aware-formats
plan: 08
subsystem: ui
tags: [i18n, catalogue, extraction, shell, chrome, route-ids, file-types, tdd]

# Dependency graph
requires:
  - phase: 05-i18n-foundation-catalogue-contract
    provides: the t() leaf layer — non-escaping lookup, {name}/{n} interpolation, the catalogue lint
  - phase: 06-05
    provides: the shrinking allow-list device (test/fixtures/i18n-pending.json) and the static scanner (scripts/i18n-scan.mjs)
  - phase: 06-11
    provides: the green scan baseline (1709 literals, 1496 allow-list entries), the quoted-object-key machine rule, the reuse-don't-duplicate discipline
provides:
  - The shell chrome (layout.js, render.js, skeletons.js) and the shared helpers (helpers.js, select.js, toast.js, view-engine.js) carry no user-visible literal — the scanner reports zero findings for all seven files
  - ROUTE_IDS (the twenty route ids, byte-identical machine identifiers) + routeName = id => t('nav.route.' + id) — the sidebar, the breadcrumb and the document title follow the locale while the router keeps matching on the ids
  - FT loses its display `n`; fileTypeName(type) = t('file.type.' + id) becomes the file-type display, the groundwork phase 7's I18N-07 stands on
  - 94 new nav.* / page.* / act.* / a11y.* / common.* / file.type.* / toast.* values in src/locales/en.json
  - An allow-list shrunk from 1496 to 1383 entries (−113: 112 wave entries + 1 consumer-stale entry); scan 1709 → 1564 literals, 0 violations
affects: [06-09, 06-12, 06-13, 06-14, phase-7 french translation, phase-11 build gate]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 20900    # 83619 chars / 4 over the realized diff (14 files)
  tasks: 3
  commits: 5

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ROUTE_IDS + routeName: the route ids stay a readable list structure the coverage check parses out of the source, and the display name is a dynamic key built from the id — the scanner's catalogue-key family does not check a concatenated key, so the coverage must be a test"
    - "Lazy-getter display names: FIELDS' `name` became a getter so the catalogue lookup happens at ACCESS time, not module-load time — a module-level t() would freeze the locale at import"
    - "The lookup helper exported next to the table it reads: fileTypeName(type) lives beside FT and owns the other-fallback, so consumers never build the key themselves"

key-files:
  created:
    - test/i18n-shell.test.mjs
    - test/i18n-ui-helpers.test.mjs
  modified:
    - src/shell/layout.js
    - src/shell/render.js
    - src/shell/skeletons.js
    - src/shell/view-engine.js
    - src/ui/helpers.js
    - src/ui/select.js
    - src/ui/toast.js
    - src/main.js
    - src/views/files.js
    - src/overlays/drawer.js
    - src/locales/en.json
    - test/fixtures/i18n-pending.json

key-decisions:
  - "The route ids survive as ROUTE_IDS (a list, not a map) because the router matches on them (D-08) and because the coverage check must read them out of the source — the old ROUTE_NAMES object is gone, so a check that parsed it would fail on a correct implementation"
  - "The sidebar, the bottom navigation, the breadcrumbs and the topbar bell all read routeName(id) — one source of truth per route name, no parallel nav.* keys duplicating the route values"
  - "The file-type table keeps its colour and its icon and loses only its display name; the stored ids (fig, pdf, zip, img, sheet, doc, code, other) are byte-identical and fileType()'s extension lists are pinned by a test"
  - "Five topbar literals the scanner cannot see (Breadcrumb, Search and commands, Search or jump to…, Create new, Account menu) were swept too — they are user-visible even though the scan never reported them, so the catalogue grew beyond the allow-list delta"
  - "Reused existing values instead of duplicating keys: app.name ('Gr8r Studio'), common.workspace, common.today, toast.tryAgain, and routeName('timeline') for the sidebar's timeline sub-tab"

requirements-completed: []  # I18N-01 stays Pending until phase close (orchestrator instruction) — this plan delivers its chrome+helpers slice

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "The shell chrome reads the catalogue: the sidebar, the topbar, the offline bar, the bottom navigation, the skeletons and the document title; ROUTE_IDS keeps the twenty route ids and every one has a nav.route.* key"
    requirement: I18N-01
    verification:
      - kind: unit
        ref: "test/i18n-shell.test.mjs#every route id has a nav.route.* key that renders its previous English"
        status: pass
      - kind: other
        ref: "the plan's inline probe: routes 20, missing (empty)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The shared helpers read the catalogue: the empty-state callers, the avatars' accessible name, the file-type names through fileTypeName(), the select fallback, the offline toast and the view engine's toolbar"
    requirement: I18N-01
    verification:
      - kind: unit
        ref: "test/i18n-ui-helpers.test.mjs#every stored file-type id has a file.type.* key that renders its previous English"
        status: pass
      - kind: other
        ref: "node scripts/i18n-scan.mjs → 1564 literals, 1564 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch"
        status: pass
    human_judgment: false
  - id: D3
    description: "The machine identifiers survived: ROUTE_IDS lists the twenty ids byte-identically, fileType() returns the stored ids, the tree-wide data-a/data-r/data-v counts stay 438/58/76, ROUTE_ICONS untouched, icon baseline 174 held"
    requirement: I18N-01
    verification:
      - kind: unit
        ref: "test/i18n-shell.test.mjs#ROUTE_IDS survives in src/shell/render.js and lists the twenty route ids byte-identically"
        status: pass
      - kind: unit
        ref: "test/i18n-shell.test.mjs#the machine identifiers survived the wave — tree-wide data-a / data-r / data-v counts"
        status: pass
    human_judgment: false
  - id: D4
    description: "The English interface renders byte-identically after the sweep, proven end to end by the six Chromium tenancy tests"
    requirement: I18N-01
    verification:
      - kind: e2e
        ref: "npm run build && npm run e2e → 6 passed (selectors on unchanged English text)"
      - kind: unit
        ref: "npm test → 273/273 (was 240; +33 shell and helper contract tests)"
        status: pass
    human_judgment: false

# Metrics
duration: 9min
completed: 2026-10-22
status: complete
---

# Phase 6 Plan 8: Shell Chrome & Shared UI Helpers Extraction Summary

**The shell chrome and the shared ui helpers now read the catalogue — the route names became `nav.route.*` lookups over a surviving `ROUTE_IDS` list, the file types display through `fileTypeName()` while their stored ids stay untouched, 97 new catalogue values landed, and the allow-list shrank 1496 → 1383 with the scan green at 0 violations**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-22T15:09Z
- **Completed:** 2026-10-22T15:18Z
- **Tasks:** 3 (tasks 1–2 TDD: RED + GREEN commits; task 3 proof-only, green-first pins)
- **Files modified:** 14, created: 2

## Accomplishments

- `ROUTE_NAMES` in `src/shell/render.js` is replaced by `ROUTE_IDS` (the twenty route ids, byte-identical) plus `routeName = id => t('nav.route.' + id)`; `pageTitle()` reads `app.name`, `nav.notFound` and `page.savedView` from the catalogue
- The sidebar, the topbar, the offline bar, the breadcrumbs, the bottom navigation and the skeletons read `nav.*` / `page.*` / `a11y.*` / `act.*` — 51 new keys in task 1
- `FT` in `src/ui/helpers.js` keeps its colour and its icon and loses its display `n`; `fileTypeName(type)` builds the key from the stored id with the `other` fallback — 43 new keys in task 2 (`file.type.*` ×8, `page.*`, `act.*`, `a11y.*`, `common.*`)
- `src/ui/select.js`'s `|| 'Choose'` fallback and `src/ui/toast.js`'s offline toast (`toast.offlineChanges`, reusing `toast.tryAgain`) read the catalogue
- The view engine's `FIELDS` names became lazy getters (catalogue lookup at access time, never frozen at module load); the filter options, the group names, the sort map, the toolbar labels and the chipsbar all read the catalogue
- `test/i18n-shell.test.mjs` (18 tests) and `test/i18n-ui-helpers.test.mjs` (15 tests): the route and file-type coverage, the byte-identical English oracles, the absence in all seven files, the machine-identifier pins (tree-wide 438/58/76) and the acorn scope walk proving every `t()` call resolves to the import binding
- Allow-list 1496 → 1383 entries (−113), still sorted by `file` then `text`; the scan reports **1564 literals, 1564 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch**
- `npm test` 273/273, `npm run lint` and `npm run format:check` clean, `npm run build && npm run e2e` 6/6 Chromium — the icon baseline of 174 names held, `fr.json` untouched (6 seed keys)

## Task Commits

1. **Task 1: the shell chrome** — `956985c` (test, RED), `0d26e5b` (feat, GREEN)
2. **Task 2: the shared ui helpers and the view engine** — `e54d370` (test, RED), `2f6a084` (feat, GREEN)
3. **Task 3: the wave's proof** — `dad8077` (test — green-first pins + two eslint-driven one-token fixes)

## Files Created/Modified

- `src/shell/render.js` — `ROUTE_IDS` + `routeName`; `pageTitle()` catalogue-driven; the local `t` renamed `name`
- `src/shell/layout.js` — the whole chrome reads the catalogue; the arrow locals named `t` renamed (`tk`, `tm`)
- `src/shell/skeletons.js` — the loading `aria-label` reads `a11y.loading`
- `src/shell/view-engine.js` — `FIELDS` getters, the toolbar, the chips and the group/sort/filter names
- `src/ui/helpers.js` — `FT` display-less + `fileTypeName()`; the avatar's `data-tip`; `filePrev`'s local `t` renamed `ft`
- `src/ui/select.js` — the `a11y.choose` fallback
- `src/ui/toast.js` — the offline toast message and its action label
- `src/main.js` — the URL deep-link check reads `ROUTE_IDS.includes(...)` (the import shape the `ROUTE_NAMES` removal demands)
- `src/views/files.js`, `src/overlays/drawer.js` — the `FT[...].n` consumers follow `fileTypeName()`
- `src/locales/en.json` — +94 keys (253 → 347), inserted before the reserved `contract.*` block
- `test/fixtures/i18n-pending.json` — 1496 → 1383 entries, still sorted
- `test/i18n-shell.test.mjs`, `test/i18n-ui-helpers.test.mjs` — new: the wave's contract tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removing FT's display name broke consumers outside the plan's file list**
- **Found during:** Task 2
- **Issue:** `FT[f.type].n` was read in `src/views/files.js` (the type-filter `<option>` text and the table's Type column) and `src/overlays/drawer.js` (the attachment line, with an `|| 'File'` fallback). Deleting `n` would have rendered `undefined` there — the plan's file list does not name these files.
- **Fix:** the three sites now call `fileTypeName(...)` (byte-identical rendering, the unknown-type fallback included); drawer.js's `|| 'File'` literal left the source, so its stale allow-list entry left the list too — the one allow-list entry removed beyond the wave's own four files
- **Files modified:** src/views/files.js, src/overlays/drawer.js
- **Committed in:** 2f6a084

**2. [Rule 3 - Blocking] `src/main.js` matched URL deep-link segments against ROUTE_NAMES**
- **Found during:** Task 1
- **Issue:** `ROUTE_NAMES[seg]` and `ROUTE_NAMES[h]` in main.js would break at import time once `ROUTE_NAMES` was gone; main.js is not in the plan's `files_modified`.
- **Fix:** the check became `ROUTE_IDS.includes(seg)` / `ROUTE_IDS.includes(h)` — the same route-id membership test, byte-identical behaviour
- **Files modified:** src/main.js
- **Committed in:** 0d26e5b

### Scope Notes (not deviations — the plan's own surface, read precisely)

- **Five topbar literals the scanner cannot see were swept anyway** (`Breadcrumb`, `Search and commands`, `Search or jump to…`, `Create new`, `Account menu`): they are user-visible `aria-label`s and a button label in the chrome this wave owns, even though the scan never reported them. The catalogue carries them; the allow-list was never their meter.
- **`FIELDS`' names became lazy getters** rather than plain `t()` values: a module-level `t('page.field.status')` would freeze the locale at import time and go stale after a locale change. Getters keep the `F.name` string API every consumer already uses.
- **Task 3's tests are green-first pins, not RED→GREEN**: the task's `<action>` is "Close the wave" — pure proof with no implementation step. Its assertions are regression pins in the shape the plan's `<verify>` prescribes; the two one-token fixes inside it (an unused `v` binding in files.js, an unused `FILE_TYPES` const in the test) were eslint-driven.

## Issues Encountered

- None outstanding. The scan, the coverage tests and the scope walk caught every hazard before the GREEN commits: the shadowing traps (three locals named `t` across layout.js/helpers.js/render.js) were renamed before any call site could resolve wrong.

## Known Stubs

None — no stub, placeholder, or unwired data source was introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `fileTypeName()` is the display seam phase 7's I18N-07 stands on: the stored ids never change, so a French `file.type.*` value translates the display without touching a call site
- `ROUTE_IDS` + `routeName()` is the pattern for any future id→display table (statuses, priorities, roles are plan 06-12's surface)
- The remaining sweeps (06-09, 06-12…06-14) own the pages, the stored vocabulary, the overlays and the components; the allow-list (1383 entries) is their meter
- The 94 new keys are English-only: phase 7 translates them by adding values without touching a single call site

## Self-Check: PASSED

- All 11 created/modified files exist on disk; all 5 task commits found in git log (`956985c`, `0d26e5b`, `e54d370`, `2f6a084`, `dad8077`)
- Scan re-run at summary time: 1564 literals, 1564 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch
- Allow-list re-measured: 1383 entries, sorted; no entry names a file of this wave
- en.json: 347 keys, 0 values with forbidden characters; fr.json byte-identical to its pre-wave state (6 keys); icon baseline 174
- npm test re-run at summary time: 273/273; e2e 6/6 Chromium; lint and format:check clean

---
*Phase: 06-english-extraction-locale-aware-formats*
*Completed: 2026-10-22*
