---
phase: 06-english-extraction-locale-aware-formats
plan: 11
subsystem: ui
tags: [i18n, catalogue, extraction, actions, a11y, modals]

# Dependency graph
requires:
  - phase: 05-i18n-foundation-catalogue-contract
    provides: the t() leaf layer — non-escaping lookup, {name}/{n} interpolation, the catalogue lint
  - phase: 06-05
    provides: the shrinking allow-list device (test/fixtures/i18n-pending.json) and the static scanner (scripts/i18n-scan.mjs)
  - phase: 06-07
    provides: the toast surface of src/actions/actions.js (the other half of the file), the tMsg alias discipline for shadowed locals
provides:
  - The modal, confirmation and accessible-name surface of src/actions/actions.js and the six other action modules (archive.js, drag-drop.js, events.js, keyboard.js, subtasks.js, teams.js) read the catalogue; the scanner reports zero user-visible literals for all seven files
  - 109 new act.* / a11y.* / err.* / common.* values in src/locales/en.json covering the action surface's dialogs, labels, defaults and accessible names
  - An allow-list shrunk from 1592 to 1496 entries (the literals this wave extracted left the list; the rest is for the remaining waves)
  - The scanner's quoted-object-key rule — quoted keys are machine identifiers (D-08), never display text
affects: [06-12+ remaining sweeps, phase-7 french translation, phase-11 build gate]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 11000
  tasks: 3
  commits: 7

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Quoted object keys are machine identifiers: the scanner's display rules now skip them, so stored-data keys like 'Every 2 weeks' in RECUR_DAYS stay untouched (D-08)"
    - "The tMsg alias (import { t, t as tMsg }) resolves the shadowing trap where a local t is in scope — including the post-declaration trap where t('…') is evaluated inside the object literal assigned to that local (teams.js create/edit team)"

key-files:
  created:
    - test/i18n-modal.test.mjs
    - test/i18n-actions-modules.test.mjs
  modified:
    - src/actions/actions.js
    - src/actions/archive.js
    - src/actions/drag-drop.js
    - src/actions/subtasks.js
    - src/actions/teams.js
    - src/locales/en.json
    - test/fixtures/i18n-pending.json
    - scripts/i18n-scan.mjs

key-decisions:
  - "Quoted object keys are machine keys, not display text: RECUR_DAYS['Every 2 weeks'] matches the stored t.recur value, so translating it would break every recurring task. The scanner now recognises this position and excludes it"
  - "The teams.js module keeps its local t (the team record); the catalogue lookup is imported a second time as tMsg — the wave-7 discipline, extended to the post-declaration trap inside the object literal"
  - "events.js and keyboard.js carry no user-visible literals (their strings are machine identifiers: data-a action keys, route ids, keyboard shortcut keys); they were verified, not swept"

requirements-completed: []  # I18N-01 stays Pending until phase close (orchestrator instruction)

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "The modal, confirmation and accessible-name half of src/actions/actions.js reads the catalogue: modal titles/bodies, confirmation labels, aria-label/data-tip/placeholder attributes"
    requirement: I18N-01
    verification:
      - kind: unit
        ref: "test/i18n-modal.test.mjs#every modal/confirmation/a11y literal renders its previous English exactly"
        status: pass
      - kind: other
        ref: "node scripts/i18n-scan.mjs → 1709 literals, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch"
        status: pass
    human_judgment: false
  - id: D2
    description: "The six other action modules carry no user-visible literal; their machine identifiers (action keys, route ids, shortcut keys) are untouched"
    requirement: I18N-01
    verification:
      - kind: unit
        ref: "test/i18n-actions-modules.test.mjs#the six action modules' machine identifiers are untouched and their literals are extracted"
        status: pass
      - kind: other
        ref: "grep for data-a/data-r/data-v/keyboard keys → unchanged"
        status: pass
    human_judgment: false
  - id: D3
    description: "The allow-list shrunk by exactly the literals this wave extracted, and the scan stays green"
    requirement: I18N-01
    verification:
      - kind: other
        ref: "allow-list 1592 → 1496; scan 1818 → 1709 literals (13 reclassified as machine keys), 0 violations"
        status: pass
    human_judgment: false

# Metrics
duration: 25min
completed: 2026-10-22
status: complete
---

# Phase 6 Plan 11: Action Surface Modal & A11y Extraction Summary

**The modal, confirmation and accessible-name half of `src/actions/actions.js` plus the six other action modules now read the catalogue — 109 literals extracted, the scanner reports zero findings for all seven files, and the machine identifiers (`data-a`, route ids, keyboard keys) are byte-identical**

## Performance

- **Duration:** 25 min
- **Started:** 2026-10-22T17:05Z
- **Completed:** 2026-10-22T17:30Z
- **Tasks:** 3
- **Files modified:** 8, created: 2

## Accomplishments

- 109 new values in `src/locales/en.json` under `act.*`, `a11y.*`, `err.*` and `common.*`: the modal titles and bodies the action module opens, the confirmation labels, the `aria-label` / `data-tip` / `placeholder` attributes, and the six small modules' toasts and labels
- `src/actions/actions.js` swept (the modal/confirmation/a11y half left for this wave by plan 06-07), plus `archive.js`, `drag-drop.js`, `events.js`, `keyboard.js`, `subtasks.js`, `teams.js`
- The scanner (`scripts/i18n-scan.mjs`) gained the quoted-object-key rule: a quoted key in an object literal is a machine identifier and is never display text — `RECUR_DAYS['Every 2 weeks']` matches the stored `t.recur` value and must not be translated (D-08)
- Allow-list: 1592 → 1496 entries (−96, the wave's extracted literals); scan: 1818 → 1709 literals (−109 extracted, +13 reclassified as quoted object keys), 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch
- `npm test` 240/240 (was 221; +19 for the wave's contract tests), `npm run lint` and `npm run format:check` clean, `npm run build && npm run e2e` 6/6 Chromium, `fr.json` untouched (6 seed keys), icon baseline 174 held

## Task Commits

1. **Task 1 (actions.js modal/confirmations/a11y):** `e62bc86` (test, RED) → `fa7d417` (feat, GREEN)
2. **Task 2 (six other modules):** `914eb8a` (test, RED) → `94417f8` (feat, GREEN)
3. **Task 3 (verification + scanner rule):** `25d9613` (fix — the quoted-object-key rule), `79869f7` (test — the wave's proof), `c36e91c` (fix — the teams.js shadowing trap)

## Files Created/Modified

- `src/actions/actions.js` — the modal titles/bodies, confirmation labels and accessible names read the catalogue
- `src/actions/archive.js`, `src/actions/drag-drop.js`, `src/actions/subtasks.js`, `src/actions/teams.js` — swept
- `src/locales/en.json` — +109 keys
- `test/fixtures/i18n-pending.json` — 1592 → 1496 entries
- `scripts/i18n-scan.mjs` — quoted object keys are machine keys
- `test/i18n-modal.test.mjs`, `test/i18n-actions-modules.test.mjs` — new: the wave's contract tests

**Verified untouched (in the plan's file list, zero user-visible literals):** `src/actions/events.js`, `src/actions/keyboard.js` — their strings are machine identifiers (`data-a` action keys, route ids, keyboard shortcut keys), per D-08.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The scanner misread quoted object keys as user-visible literals**
- **Found during:** Task 3 (scan verification)
- **Issue:** `RECUR_DAYS = { ..., 'Every 2 weeks': 14, ... }` was flagged as an unlisted literal. The key is the stored recurrence value `t.recur` (machine identifier, D-08); translating it would break every recurring task silently.
- **Fix:** the scanner's display rules now skip quoted object keys — they are machine keys by position, like `data-a` values
- **Files modified:** scripts/i18n-scan.mjs
- **Commit:** 25d9613

**2. [Rule 1 - Bug] The teams module's local `t` shadowed the catalogue lookup inside the object literal it initialises**
- **Found during:** Task 2 (acorn scope walk)
- **Issue:** `t = { ..., desc: f.desc || t('common.noDescriptionYet'), ... }` — the lookup call sits inside the literal assigned to the local `t`, so at runtime it would call the team object as a function and throw.
- **Fix:** the lookup is imported a second time as `tMsg` and the call reads `tMsg('common.noDescriptionYet')`; the acorn scope walk now proves every `t()`/`tMsg()` call in the five swept files resolves to the import binding
- **Files modified:** src/actions/teams.js
- **Commit:** c36e91c

### Scope Notes (not deviations — the plan's own surface, read precisely)

- `events.js` and `keyboard.js` are in the plan's file list but carry **zero user-visible literals** — their strings are machine identifiers (the `data-a` action keys, route ids, keyboard shortcut keys). They were verified untouched rather than swept, per D-08.

## Issues Encountered

- None outstanding. The two Rule-1 fixes above were caught by the wave's own verification gates (the scan and the acorn scope walk) before the phase-7 French translation could inherit them.

## Known Stubs

None — no stub, placeholder, or unwired data source was introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The whole `src/actions/` directory is now catalogue-driven; the remaining sweeps (06-12+) own the other interface surfaces (`src/views/`, `src/pages/`, `src/components/`)
- The 109 new keys are English-only: phase 7 translates them by adding values without touching a call site
- The allow-list (1496 entries) is the meter for the remaining waves

## Self-Check: PASSED

- All 10 touched files exist on disk; all 7 task commits found in git log (`e62bc86`, `25d9613`, `fa7d417`, `914eb8a`, `94417f8`, `79869f7`, `c36e91c`)
- Scan re-run at summary time: 1709 literals, 1709 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch
- Allow-list re-measured: 1496 entries
- npm test re-run at summary time: 240/240; e2e 6/6; lint and format:check clean

---
*Phase: 06-english-extraction-locale-aware-formats*
*Completed: 2026-10-22*
