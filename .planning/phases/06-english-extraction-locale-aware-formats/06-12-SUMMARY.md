---
phase: 06-english-extraction-locale-aware-formats
plan: 12
subsystem: i18n
tags: [i18n, catalogue, extraction, stored-vocabulary, core-modules, features, tdd]

# Dependency graph
requires:
  - phase: 05-i18n-foundation-catalogue-contract
    provides: the t() leaf layer — non-escaping lookup, {name}/{n} interpolation, the catalogue lint
  - phase: 06-05
    provides: the shrinking allow-list device (test/fixtures/i18n-pending.json) and the static scanner (scripts/i18n-scan.mjs)
  - phase: 06-11
    provides: the green scan baseline (1564 literals, 1383 allow-list entries), the reuse-don't-duplicate discipline
provides:
  - The stored vocabulary (statuses, priorities, labels, project statuses, roles) is displayed through the catalogue while the STORED VALUES NEVER CHANGE — task.status.* / task.priority.* / task.label.* / project.status.* / common.role.* lookups keyed on the id, the I18N-07 groundwork
  - roleLabel() lowercases the stored role id before it builds common.role.* — the document still holds 'Owner', the settings comparisons are untouched
  - The core modules (utils.js, api.js, icons.js) and the three feature modules (archive.js, subtasks.js, teams.js) carry no user-visible literal; theme.js already carried none
  - The scanner's position-based demo-content rule: TEAMS_SEED's names and descriptions are data, not interface text
  - 68 new catalogue values (347 → 415 keys); allow-list 1383 → 1299 entries; scan 1564 → 1462 literals, 0 violations
affects: [06-09, 06-13, 06-14, phase-7 french translation (I18N-07), phase-8 locale switch, phase-11 build gate]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 17100    # 68206 chars / 4 over the realized diff (13 files)
  tasks: 3
  commits: 5

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy-getter display names over the stored vocabulary: STATUSES / PRIOS / LABELS / PSTAT / NO_TEAM keep their `name` accessor but the getter calls t() at ACCESS time — every `.name` consumer across ~12 files outside the file list keeps working, and a locale switch re-renders instead of freezing the English at module load"
    - "The lowercase-key bridging rule: the document stores the capitalised role id ('Owner') while the catalogue key shape demands a lowercase segment, so the lookup lowercases the id before it builds the key — the stored value never changes"
    - "Position-based demo-content rule in the scanner: DEMO_CONSTS ('TEAMS_SEED') + parent-frame tracking excludes the seeded team names and descriptions by POSITION, never by a lexical blacklist — the same word elsewhere is still display text"

key-files:
  created:
    - test/i18n-vocab.test.mjs
    - test/i18n-core-features.test.mjs
  modified:
    - src/core/constants.js
    - src/core/store.js
    - src/core/utils.js
    - src/core/api.js
    - src/core/icons.js
    - src/features/archive.js
    - src/features/subtasks.js
    - src/features/teams.js
    - src/locales/en.json
    - test/fixtures/i18n-pending.json
    - scripts/i18n-scan.mjs

key-decisions:
  - "The vocabulary tables keep their `name` accessor as a lazy getter rather than dropping it: the plan's letter said 'drops name', but ~30 `.name` consumers (board.js, view-engine.js, actions.js, helpers.js, palette.js…) sit outside this plan's file list, and the wave-8 FIELDS precedent already established the getter as the house pattern — the display is a catalogue lookup keyed on the stored id either way"
  - "roleLabel() gained an explicit ROLE_KEYS guard so an unknown id falls back to t('common.role.member') instead of showing the key itself (T-06-45); common.role.viewer carries the server workspace role and renders the Guest label exactly as ROLE_LABELS did"
  - "Reused existing values instead of duplicating keys: act.deletePermanently, nav.route.archive (the h1 and the tablist), nav.route.tasks, nav.route.projects, page.field.assignee, page.field.due, common.unassigned, common.cancel, act.deleteTeam, nav.route.members, a11y.newTeam (the modal's New-team heading)"
  - "MOD resolves the Ctrl half at module load: the ⌘ symbol is a symbol, not text, and stays a literal; the module-load freeze is noted for phase 8's live locale switch"
  - "The subtaskHtml task parameter `t` was renamed `task` — the wave-8 shadowing rule — before any catalogue call could resolve wrong"

requirements-completed: []  # I18N-01 stays Pending until phase close (orchestrator instruction) — this plan delivers its stored-vocabulary + core-modules slice

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "The stored vocabulary is displayed through the catalogue and the stored values never change: every id of STATUSES / PRIOS / LABELS / PSTAT / ROLES has a key, the lookup is keyed on the id, and the ids are byte-identical to what they were"
    requirement: I18N-01
    verification:
      - kind: unit
        ref: "test/i18n-vocab.test.mjs#every stored status id has a task.status.* key that renders its previous English (and the priority / label / project-status / role coverage tests)"
        status: pass
      - kind: unit
        ref: "test/i18n-vocab.test.mjs#the document still holds the capitalised role ids — the comparison values never changed"
        status: pass
      - kind: other
        ref: "the plan's inline probe: roles Owner,Admin,Member,Guest, missing (empty)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The core modules and the three feature modules carry no user-visible literal; the HTTP verbs, the API paths, the icon names and the ⌘ symbol are untouched; the seeded team names and descriptions remain data"
    requirement: I18N-01
    verification:
      - kind: unit
        ref: "test/i18n-core-features.test.mjs#no extracted literal survives as a finding in the six files"
        status: pass
      - kind: unit
        ref: "test/i18n-core-features.test.mjs#the HTTP verbs and the API paths are byte-identical (21 call sites) / the icon names and the brand path are untouched / the ⌘ symbol is not a catalogue value"
        status: pass
      - kind: other
        ref: "node scripts/i18n-scan.mjs → 1462 literals, 1462 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch"
        status: pass
    human_judgment: false
  - id: D3
    description: "The allow-list lost every literal of the nine files of the wave (1383 → 1299) and stays sorted; the icon baseline of 174 names held"
    requirement: I18N-01
    verification:
      - kind: unit
        ref: "test/i18n-core-features.test.mjs#the allow-list carries no entry of the nine files of the wave and stays sorted"
        status: pass
      - kind: unit
        ref: "test/i18n-core-features.test.mjs#the icon baseline holds at 174 names"
        status: pass
    human_judgment: false
  - id: D4
    description: "The English interface renders byte-identically after the sweep, proven end to end by the six Chromium tenancy tests"
    requirement: I18N-01
    verification:
      - kind: e2e
        ref: "npm run build && npm run e2e → 6 passed (selectors on unchanged English text)"
      - kind: unit
        ref: "npm test → 299/299 (was 273; +12 vocabulary tests, +13 core/feature tests, +1 wave-proof pin counted across both files)"
        status: pass
    human_judgment: false

# Metrics
duration: 9min
completed: 2026-10-22
status: complete
---

# Phase 6 Plan 12: Stored Vocabulary & Core Modules Extraction Summary

**The stored vocabulary now displays through the catalogue while the document keeps holding `backlog`, `todo`, `urgent`, `design` and `Owner` untouched — the display is an id-keyed `t()` lookup behind lazy getters, the core modules and the three feature modules carry no user-visible literal, and the allow-list shrank 1383 → 1299 with the scan green at 0 violations**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-22T15:29Z
- **Completed:** 2026-10-22T15:38Z
- **Tasks:** 3 (tasks 1–2 TDD: RED + GREEN commits; task 3 green-first proof pins)
- **Files modified:** 11, created: 2

## Accomplishments

- `STATUSES` / `PRIOS` / `LABELS` / `PSTAT` in `src/core/constants.js` keep their ids and colours and lose their literal display names: the display is a lazy getter over `t('task.status.*')` / `task.priority.*` / `task.label.*` / `project.status.*`, read at access time — every `.name` consumer in the tree keeps working unchanged
- `ROLE_LABELS` is gone from `src/core/store.js`; `roleLabel()` lowercases the stored role id before it builds `common.role.*` (the document stores `'Owner'`, the key shape demands a lowercase segment), with an explicit key guard so an unknown id falls back to the member label instead of showing the key itself
- `workspaceList()`'s `Workspace` fallback reads `common.workspace`; `NO_TEAM`'s name is a lazy getter over `common.noTeam`
- `MOD`'s Ctrl half reads `common.ctrl` (the ⌘ symbol stays a literal); `api.js`'s client-side error strings read `err.serverUnreachable` / `err.noWorkspaceLoaded` with the 21 HTTP call sites and every path byte-identical; the logo's aria-label reads `a11y.brand`
- `archive.js`, `subtasks.js`, `teams.js` read the catalogue under `page.*` / `a11y.*` / `act.*` / `common.*` — 11 existing values reused instead of duplicated; the seeded `TEAMS_SEED` names and descriptions stay data
- The scanner gained the position-based demo-content rule: `DEMO_CONSTS` ('TEAMS_SEED') with parent-frame tracking excludes the seeded team values by position
- `test/i18n-vocab.test.mjs` (12 tests) and `test/i18n-core-features.test.mjs` (14 tests): the id coverage parsed out of the source tables, the byte-identical English oracles, the absence in all nine files, the machine-identifier pins (HTTP verbs/paths, icon names, role comparisons, demo content) and the wave-boundary counts
- Allow-list 1383 → 1299 entries (−84: 35 in task 1, 49 in task 2), still sorted by `file` then `text`; the scan reports **1462 literals, 1462 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch**
- `npm test` 299/299, `npm run lint` and `npm run format:check` clean, `npm run build && npm run e2e` 6/6 Chromium — `fr.json` byte-identical to its pre-wave state (6 seed keys)

## Task Commits

1. **Task 1: the stored vocabulary** — `c176622` (test, RED), `c7306cd` (feat, GREEN)
2. **Task 2: the core modules and the three feature modules** — `3bfa892` (test, RED), `30cf5ba` (feat, GREEN)
3. **Task 3: the wave's proof** — `3198c67` (test — green-first pins)

## Files Created/Modified

- `src/core/constants.js` — the four vocabulary tables carry lazy-getter display names; `TEAMS_SEED`, `ROLES`, `PCOLORS`, `PICONS` untouched
- `src/core/store.js` — `roleLabel()` id-keyed catalogue lookup with lowercase bridging; `NO_TEAM` getter; the `Workspace` fallback
- `src/core/utils.js` — `MOD` reads `common.ctrl`
- `src/core/api.js` — the two client-side error strings read the catalogue
- `src/core/icons.js` — the logo aria-label reads `a11y.brand`
- `src/features/archive.js` — the page reads the catalogue (heading/tab/button reuse + 7 new keys)
- `src/features/subtasks.js` — the task param renamed `task`; 19 literals swept
- `src/features/teams.js` — the team modal swept (5 new page.team keys + 2 placeholders)
- `src/locales/en.json` — +68 keys (347 → 415), inserted before the reserved `contract.*` block
- `test/fixtures/i18n-pending.json` — 1383 → 1299 entries, still sorted
- `scripts/i18n-scan.mjs` — the demo-content rule (see Deviations)
- `test/i18n-vocab.test.mjs`, `test/i18n-core-features.test.mjs` — new: the wave's contract tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The plan asserted the scanner's `DEMO_VALUES` set covers the TEAMS_SEED demo content — it did not**
- **Found during:** Task 1
- **Issue:** `scripts/i18n-scan.mjs`'s `DEMO_VALUES` only carries the default member name and the default project name; the seeded team names and descriptions were live findings, so removing their allow-list entries would have made the scan red with `unlisted` violations while leaving them listed would have violated the acceptance criterion "the allow-list lost the entries of these two files".
- **Fix:** a position-based machine rule instead of a lexical one: `DEMO_CONSTS = new Set(['TEAMS_SEED'])` plus parent-frame tracking in `analyse()`, so an object literal declared inside a demo const is skipped — the same word outside such a const is still display text, matching the scanner's position-based philosophy. `machineCategory()` classifies the occurrences as `DEMO_CONTENT` for the raw sweep.
- **Files modified:** scripts/i18n-scan.mjs (not in the plan's `files_modified`)
- **Committed in:** c7306cd

### Scope Notes (not deviations — the plan's own intent, read against the code)

- **The vocabulary tables keep their `name` accessor as a lazy getter rather than dropping it.** The plan's `<action>` said "STATUSES keeps `id` and drops `name`", but `.name` is consumed in ~12 files outside this plan's file list (`board.js`, `view-engine.js`, `actions.js`, `helpers.js`, `palette.js`, `context-menu.js`, `drag-drop.js`, `task-list.js`, `project.js`, `layout.js`…), and the wave-8 `FIELDS` precedent already established the lazy getter as the house pattern for exactly this situation. The display is a catalogue lookup keyed on the stored id either way, and a module-level `t()` would have frozen the locale at import. `NO_TEAM` got the same treatment.
- **`theme.js` was not modified:** the scan reports zero findings for it and the allow-list carried no entry — there was nothing to sweep.
- **`common.role.viewer` and `common.role.guest` both render `Guest`:** the server's workspace roles (`owner`/`admin`/`member`/`viewer`) and the document's capitalised role ids (`Owner`/`Admin`/`Member`/`Guest`) are two id spaces over one display set; each id gets its own key so any lookup stays key-clean. This is the one deliberate key-pair sharing a value in this wave.
- **`MOD` resolves the Ctrl half at module load**, so a live locale switch (phase 8) will not re-evaluate it until a reload — noted for phase 8 rather than restructured here, since changing MOD's export shape would break four consumer files outside this plan's list.

## Issues Encountered

- Two eslint/prettier fixes during the GREEN commits (an unused `ORACLES` array and a `no-regex-spaces` in the vocab test; prettier formatting on both test files) and one mis-measured pin corrected during Task 3 (the api call-site count is 21, measured, not the 33 first guessed). All caught by the gates before their commits landed.

## Known Stubs

None — no stub, placeholder, or unwired data source was introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `task.status.*` / `task.priority.*` / `task.label.*` / `project.status.*` / `common.role.*` are the display seam phase 7's I18N-07 stands on: the stored ids never change, so French values translate the display without touching a call site — the lazy getters re-read at every render
- `roleLabel()`'s lowercase bridging is the pattern for any capitalised stored id that meets the lowercase key shape
- The remaining sweeps (06-09, 06-13, 06-14) own the pages, the overlays and the components; the allow-list (1299 entries) is their meter
- The 68 new keys are English-only: phase 7 translates them by adding values without touching a single call site

## Self-Check: PASSED

- All 13 created/modified files exist on disk; all 5 task commits found in git log (`c176622`, `c7306cd`, `3bfa892`, `30cf5ba`, `3198c67`)
- Scan re-run at summary time: 1462 literals, 1462 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch
- Allow-list re-measured: 1299 entries, sorted; no entry names a file of this wave
- en.json: 415 keys; fr.json byte-identical to its pre-wave state (6 keys); icon baseline 174
- npm test re-run at summary time: 299/299; e2e 6/6 Chromium; lint and format:check clean

---
*Phase: 06-english-extraction-locale-aware-formats*
*Completed: 2026-10-22*
