---
phase: 06-english-extraction-locale-aware-formats
plan: 10
subsystem: interface-i18n
tags: [i18n, extraction, views, entry, allow-list, scan-contract]
requires:
  - 06-01 (the scanner and the allow-list device)
  - 06-04 (weekdayName/monthName formatters)
  - 06-05 (foldForSearch accent-insensitive filter)
  - 06-09, 06-14 (the sixteen page modules)
  - 06-14 (the 1385-key wave boundary)
provides:
  - the six view modules and the entry module fully extracted
  - the EMPTY allow-list (test/fixtures/i18n-pending.json = [])
  - the phase's final proof tests: the empty list, the raw coverage sweep, the t() resolution, the real-tree gate probe
affects:
  - phase 7 (the French sweep reads a complete English base)
  - phase 11 (the build gate reads the empty allow-list)
tech-stack:
  added: []
  patterns: ["t() aliased as tk where a local t shadows it", "TCOLS element 1 is a catalogue key translated at render", "machine categories extended positionally (NORMALIZATION_FORM)"]
key-files:
  created: []
  modified:
    - src/views/board.js
    - src/views/calendar.js
    - src/views/files.js
    - src/views/project-overview.js
    - src/views/table.js
    - src/views/timeline.js
    - src/main.js
    - src/pages/errors.js
    - src/overlays/popovers.js
    - scripts/i18n-scan.mjs
    - src/locales/en.json
    - test/fixtures/i18n-pending.json
    - test/i18n-scan.test.mjs
    - test/i18n-dates.test.mjs
    - test/i18n-core-features.test.mjs
decisions:
  - "TCOLS element 1 became a catalogue key translated at both render sites (the table header and the visible-columns popover) rather than a display string"
  - "the raw sweep now reports only real string tokens — a comment fragment is not a literal the rules can carry"
  - "the NORMALIZATION_FORM machine category (normalize('NFD')) added to the sweep positionally"
metrics:
  duration: 30 min
  completed: 2026-10-22
status: complete
plan_head_before: 2b8a5643595513d975e5b1a56064e383ec550394
plan_head_after: 908939b90b1badd78047c8caff661c643d193cab
commits: 5
actuals:
  tokens: 73500
  tasks: 3
  commits: 5
estimate:
  tokens: 54000
  tasks: 3
---

# Phase 6 Plan 10: the six views, the entry, and the empty allow-list Summary

The six view modules and the entry read the catalogue, the allow-list reaches ZERO (0 literals / 0 pending / 0 violations over the whole tree), and the phase's five success criteria are each proven by an executable check on the real tree.

## What was built

- **The six view modules swept** (Task 1): `src/views/board.js`, `calendar.js`, `files.js`, `project-overview.js`, `table.js`, `timeline.js` — every user-visible literal is now a `t()` call (aliased `tk` where a local `t` shadows the lookup: board's `kcard(t)`, table's `tcell(t)`, timeline's `r.t`, calendar's `it.t`, project-overview's `ts` arrows, main's `find()` local). 107 allow-list entries left the list.
- **The entry swept and the list emptied** (Task 2): `src/main.js` (the four `projects:save-error` toasts, their `Reload`/`Retry` action labels, the invite-error fallback, the workspace-load failure) and `src/pages/errors.js` (the `ERROR 404` / `ERROR 403` code labels). `test/fixtures/i18n-pending.json` is now `[]` — the file is KEPT for the phase-11 build gate.
- **The five success criteria proven** (Task 3): new final assertions in `test/i18n-scan.test.mjs` — the scan finds no rule finding anywhere under `src/`; the empty list plus a green verdict; the raw coverage sweep reports no unexplained capitalised single-word occurrence; every literal `t('…')` key under `src/` resolves in the catalogue with matching placeholders; and the gate probe (a literal appended to `src/views/table.js` makes the scanner exit non-zero, restored in `finally`).

## The phase's verification record (the five roadmap criteria)

| # | Criterion | Evidence |
|---|-----------|----------|
| 1 | the static scan finds none, and the build fails when one is added | `i18n scan — 0 literals, 0 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch`; the raw sweep: 118 occurrences, 9 named machine categories, 0 unexplained; the gate probe test exits non-zero on a real appended literal |
| 2 | the interface behaves exactly as it did | `npm test` 335/335, `npm run build && npm run e2e` 6/6 Chromium (the tests select on unchanged English text); every extracted literal is byte-identical, including the composed `Sort: {label}` and `Group: {key}` shapes |
| 3 | the formatters are locale-driven | `test/i18n-format.test.mjs` green — French `24/07/2026`, 24-hour clock, « il y a 2 jours »; English output byte-identical |
| 4 | counts use the locale's plural form | `test/i18n-plural.test.mjs` green; no `? 's' : ''` survives under `src/` |
| 5 | "elodie" finds "Élodie", sort order unchanged | `test/i18n-search.test.mjs` green; `files.js` keeps `localeCompare`, no `Intl.Collator` anywhere under `src/` |

Plus the two invariants: the icon baseline holds at exactly 174 names (`test/build-locales.test.mjs`), and `package.json` carries no `dependencies` block (`test/catalogue.test.mjs`). The two declared English deltas stand as documented in 06-CONTEXT.md (the time-format selector's `'auto'` default; the un-grouped English number).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `src/pages/errors.js` swept though not in `files_modified`**
- **Found during:** Task 2
- **Issue:** the allow-list carried 2 entries for `src/pages/errors.js` (`ERROR 403`, `ERROR 404`). Emptying the list without sweeping that file would have produced 2 unlisted violations — the zero gate is unreachable without it.
- **Fix:** the two code labels became `err.code404` / `err.code403`; the file already imported `t`.
- **Files modified:** src/pages/errors.js, src/locales/en.json
- **Commit:** 1441093

**2. [Rule 3 - Blocking] `src/overlays/popovers.js` translates TCOLS labels at render**
- **Found during:** Task 1
- **Issue:** TCOLS element 1 became a catalogue key; `overlays/popovers.js:340` (the visible-columns popover) rendered `${c[1]}` directly and would have shown raw keys.
- **Fix:** `${tMsg(c[1])}` — one line, `tMsg` was already imported.
- **Files modified:** src/overlays/popovers.js
- **Commit:** 4918807

**3. [Rule 3 - Blocking] scanner: the raw sweep skips non-string matches and gains the NORMALIZATION_FORM category**
- **Found during:** Task 3
- **Issue:** the first run of the coverage sweep over the finished tree reported 2 unexplained occurrences: `'Owner'` inside a comment in `src/core/store.js` (no string token exists there, so no rule can ever carry it) and `'NFD'` (the `normalize('NFD')` argument in `src/core/utils.js` — a machine value with no named category). Both are missing rules by the plan's own definition.
- **Fix:** `sweepDisplayLabels` now reports only positions the lexer recorded as string literals; `machineCategory` classifies the argument of `.normalize()` as `NORMALIZATION_FORM`. The sweep is 118 occurrences / 9 categories / 0 unexplained.
- **Files modified:** scripts/i18n-scan.mjs
- **Commit:** 908939b

**4. [Boundary re-measure, not weakening] three pins moved to the new boundary**
- `test/i18n-core-features.test.mjs`: catalogue pin 1385 → **1446** keys (61 new values).
- `test/i18n-dates.test.mjs`: the calendar and timeline import-shape pins now match `import { monthName, t as tk, … }` — strictly stronger (they still assert the month/weekday wiring).
- Commits: 4918807, 908939b

## Verification

- `node scripts/i18n-scan.mjs` — `0 literals, 0 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch`, exit 0.
- `node --test test/i18n-scan.test.mjs test/i18n-format.test.mjs test/i18n-plural.test.mjs test/i18n-search.test.mjs test/i18n.test.mjs test/catalogue.test.mjs test/build-locales.test.mjs` — 132 pass / 0 fail.
- `npm test` — 335/335.
- `npm run lint && npm run format:check` — green.
- `npm run build` (prebuild scan runs first) — green; `npm run e2e` — 6/6 Chromium.
- `git status --porcelain` clean after the gate probe (the probe restores the file in `finally`, asserted in the test).

## Known Stubs

None.

## Deferred (unchanged from 06-CONTEXT.md)

The `Intl.Collator` sort order (D-06), the IANA time-zone migration (D-04), the French catalogue (phase 7), the per-user locale (phase 8), the activity verbs (phase 9), the server error codes (phase 9). Lowercase fragments the scan's capitalisation-based rules do not report (`+N more`, `browse`, `days until`, `${k} view`) remain inline by the phase's scan contract — they are catalogue candidates for the French sweep of phase 7.

## Self-Check: PASSED

- Commits exist: 0b23c8d, 4918807, e6c5075, 1441093, 908939b (measured `git rev-list --count 2b8a564..HEAD` = 5).
- `test/fixtures/i18n-pending.json` is `[]` on disk.
- `node scripts/i18n-scan.mjs` exits 0 with 0 literals / 0 violations.
- en.json carries 1446 keys; fr.json untouched (6 seed keys).