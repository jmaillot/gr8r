---
phase: 06-english-extraction-locale-aware-formats
plan: 04
subsystem: i18n
tags: [i18n, intl, calendar, weekdays, months, locale]

requires:
  - phase: 06-02
    provides: monthName() and weekdayName() — the Intl-backed, per-locale cached formatters
  - phase: 06-03
    provides: the untouched settings rows and the 'auto' sentinel the views render around
provides:
  - src/views/calendar.js — the weekday header, the month label and the week column come from the locale
  - src/overlays/popovers.js — the mini-calendar's two-letter header and month label come from the locale
  - src/pages/home.js — the greeting line's weekday and month come from the locale
  - src/views/timeline.js — the timeline's day and month labels come from the locale
  - src/core/utils.js — the four English arrays are deleted; every other export survives
  - test/i18n-dates.test.mjs — the date-surface contract: English byte-identical, French the locale's own
affects: [phase-7, phase-9, phase-11]

commits: 7
plan_head_before: 4c18399afe6c8634df44392b2721d3b154632815
plan_head_after: 3a286bb014ef95f4e4cd75ca374adaaa7a770402

actuals:
  tokens: 5624
  tasks: 3
  commits: 7

tech-stack:
  added: []
  patterns:
    - the header reads the week-start arithmetic instead of re-implementing it — startOfWeek() honours prefs.weekStart, the header walks its seven dates
    - the two-letter mini-calendar header keeps its truncation, applied to the locale's short weekday name instead of an English array

key-files:
  created:
    - test/i18n-dates.test.mjs
  modified:
    - src/views/calendar.js
    - src/overlays/popovers.js
    - src/pages/home.js
    - src/views/timeline.js
    - src/core/utils.js

key-decisions:
  - "The mini-calendar's two-letter header is weekdayName(..., 'short').slice(0, 2), NOT weekday: 'narrow' — the plan's own declared deviation: Intl's narrow weekday in English is one letter ('M T W T F S S'), which would both degrade the header and change the English rendering D-01 forbids. The header still comes from Intl, per the CONTEXT's actual requirement."
  - "The calendar's weekday header is built from the seven dates of the week through startOfWeek(cur) — it reads the week-start arithmetic rather than re-implementing it, so the first column is the same day it is today for every value of prefs.weekStart."
  - "The timeline's day label is monthName(d, 'short') — the same short month the MON array carried, now the locale's own ('juil.' in French)."

patterns-established:
  - "the date-surface test: the English oracles are the exact strings the arrays carried, asserted against the formatters (importable in bare Node), while the four view files' contracts are asserted on the source (the store touches document) — the discipline i18n-format.test.mjs already uses"
  - "source-level doesNotMatch(/\\b(MON|MONL|WD|WDL)\\b/) per touched file, so the arrays cannot quietly return at a call site"

requirements-completed: [I18N-03]

coverage:
  - id: D1
    description: "the weekday and the month names come from the locale, not from the English arrays — all nine call sites read monthName()/weekdayName() and the four arrays are deleted"
    requirement: I18N-03
    verification:
      - kind: unit
        ref: "test/i18n-dates.test.mjs#the four English arrays no longer exist in src/core/utils.js"
        status: pass
      - kind: unit
        ref: "test/i18n-dates.test.mjs#no file under src/ imports MON, MONL, WD or WDL"
        status: pass
      - kind: other
        ref: "grep -rn '\\b(MON|MONL|WD|WDL)\\b' src --include='*.js' — zero matches; npm run build resolves every import"
        status: pass
    human_judgment: false
  - id: D2
    description: "the English weekday and month headers are byte-identical to today's: 'Sun'…'Sat', 'Su'…'Sa', 'January'…'December', 'October 2026', 'Friday, July 24' (the 24th), 'Jul 24'"
    requirement: I18N-03
    verification:
      - kind: unit
        ref: "test/i18n-dates.test.mjs#the English weekday header is the locale's short weekday names, byte-identical to the WD array"
        status: pass
      - kind: unit
        ref: "test/i18n-dates.test.mjs#the English mini-calendar header is the two-letter truncation of the locale's short weekday names"
        status: pass
      - kind: unit
        ref: "test/i18n-dates.test.mjs#the English month label of the calendar is 'October 2026'"
        status: pass
      - kind: unit
        ref: "test/i18n-dates.test.mjs#the English greeting line reads 'Thursday, July 23' … and 'Friday, July 24' for the 24th"
        status: pass
      - kind: other
        ref: "npm run e2e — the 6 Chromium tests select on English text and pass unchanged"
        status: pass
    human_judgment: false
  - id: D3
    description: "the mini-calendar's two-letter header is produced by the locale's short weekday name, not by slicing an English array — and the week still starts on the day prefs.weekStart names"
    requirement: I18N-03
    verification:
      - kind: unit
        ref: "test/i18n-dates.test.mjs#the weekday header is built from the seven dates of the week, not from an index into an array"
        status: pass
      - kind: unit
        ref: "test/i18n-dates.test.mjs#the French mini-calendar header is the locale's own: 'di lu ma me je ve sa'"
        status: pass
      - kind: other
        ref: "startOfWeek() is unchanged and still reads S.prefs.weekStart; the header derives from it"
        status: pass
    human_judgment: false
  - id: D4
    description: "the French headers are the locale's own — 'dim.'…'sam.', 'dimanche', 'octobre', 'juillet 2026', 'vendredi, juillet 24' — never a slice of an English array"
    requirement: I18N-03
    verification:
      - kind: unit
        ref: "test/i18n-dates.test.mjs#the French weekday header is the locale's own: 'dim.', never a slice of an English array"
        status: pass
      - kind: unit
        ref: "test/i18n-dates.test.mjs#the French greeting line is the locale's own: 'vendredi, juillet 24'"
        status: pass
    human_judgment: false

# Metrics
duration: 8min
completed: 2026-10-22
status: complete
---

# Phase 6 Plan 04: The locale-driven weekday and month names Summary

**The last nine uses of the English `MON`/`MONL`/`WD`/`WDL` arrays now read the locale through `monthName()` and `weekdayName()`, the arrays are deleted, and every English header — `Sun`, `Su`, `October 2026`, `Friday, July 24`, `Jul 24` — is byte-identical to what it was.**

## Performance

- **Duration:** 8 min
- **Completed:** 2026-10-22T16:05:26+02:00
- **Tasks:** 3 (each TDD: a RED test commit, then the GREEN implementation commit)
- **Files modified:** 6 (1 created, 5 modified)
- **Commits:** 7 (6 task commits + 1 prettier formatting commit)
- **Actuals:** `tokens: 5624` — the characters of the realized diff over `src/` and `test/` (22 495) divided by four, the scale the plan's `estimate` uses. The plan's `estimate` (52 000) was a phase-level placeholder, as plans 06-02 and 06-03 already recorded.

## Accomplishments

- **The calendar, the mini-calendar, the home greeting line and the timeline are locale-driven.** `src/views/calendar.js`, `src/overlays/popovers.js`, `src/pages/home.js` and `src/views/timeline.js` import `monthName()` and `weekdayName()` from `../core/i18n.js` and no longer reference the arrays. All nine call sites (calendar `:20,32,60`; popovers `:96,98`; home `:40`; timeline `:74,136`) are replaced.
- **The four arrays are deleted from `src/core/utils.js`.** Every other export survives unchanged (`esc`, `uid`, `clamp`, `isMac`, `MOD`, `DAY`, `sod`, `TODAY`, `iso`, `parse`, `addD`, `dOff`, `diffD`, `dateFormat`, `setDateFormat`, `fmtDate`, `relDate`, `ago`, `minsAgo`, `dayBucket`), and no file under `src/` references the array names any more.
- **The week-start arithmetic is read, not re-implemented.** The calendar's header is built from `startOfWeek(cur)`'s seven dates, and `startOfWeek()` — unchanged — still honours `S.prefs.weekStart`, so the first column is the same day it is today for every value of the preference.
- **The mini-calendar keeps its two-letter header, now from the locale.** `weekdayName(addD(start, i), 'short').slice(0, 2)` applies the same truncation the source applied to the array — `Su Mo Tu We Th Fr Sa` in English byte for byte, `di lu ma me je ve sa` in French.
- **The date-surface contract is pinned in `test/i18n-dates.test.mjs`** (21 tests): the English oracles are the exact strings the arrays carried, asserted against the formatters; the four view files' contracts are asserted on the source; the arrays' return is blocked by three structural assertions.
- **The scan stays green at the wave boundary** with identical counts — see the deviation below for why the allow-list itself did not move.

## The English output samples (the oracle)

| Surface | Before (the arrays) | After (the locale) |
|---|---|---|
| calendar weekday header | `Sun`…`Sat` | `Sun`…`Sat` |
| calendar month label | `October 2026` | `October 2026` |
| calendar week column | `Sun` (of the day) | `Sun` |
| mini-calendar header | `Su Mo Tu We Th Fr Sa` (sliced array) | `Su Mo Tu We Th Fr Sa` (sliced `Intl` short name) |
| mini-calendar month label | `October 2026` | `October 2026` |
| home greeting line, 24 Jul 2026 | `Friday, July 24` | `Friday, July 24` |
| timeline day label | `Jul 24` | `Jul 24` |
| timeline month label | `July 2026` | `July 2026` |

**The French output (the locale's own, where an English array used to leak):**

| Surface | Result |
|---|---|
| calendar weekday header | `dim.` `lun.` `mar.` `mer.` `jeu.` `ven.` `sam.` |
| calendar / mini-calendar month label | `octobre 2026` |
| mini-calendar header | `di lu ma me je ve sa` |
| home greeting line, 24 Jul 2026 | `vendredi, juillet 24` |
| timeline day / month label | `24 juil.` shape's month token is `juil.`; `juillet 2026` |

## The scan's report

```
i18n scan — 1957 literals, 1957 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch
```

Identical to the baseline before this plan: the four arrays' values were **never** scan findings (see deviation 1), so the wave boundary is green with the allow-list unchanged at **1694** entries.

## Task Commits

Each task was committed atomically, TDD-shaped (RED test commit, then GREEN implementation commit):

1. **Task 1 RED: the date-surface contract of the calendar** — `2c82e38` (test)
2. **Task 1 GREEN: the calendar's weekday header, month label and week column come from the locale** — `fb21ff8` (feat)
3. **Task 2 RED: the mini-calendar, greeting-line and timeline contracts** — `3c63351` (test)
4. **Task 2 GREEN: the mini-calendar, the home greeting line and the timeline read the locale** — `a706a3c` (feat)
5. **Task 3 RED: the arrays cannot come back** — `e5c0ac0` (test)
6. **Task 3 GREEN: the four English month and weekday arrays are deleted** — `9112a86` (feat)
7. **Prettier formatting of the date-surface suite** — `3a286bb` (style)

## Files Created/Modified

- `test/i18n-dates.test.mjs` — the date-surface contract: 21 tests (created across the three RED commits).
- `src/views/calendar.js` — the header is `weekdayName(addD(start, i), 'short')` over `startOfWeek(cur)`'s seven dates; the month label is `monthName(cur, 'long')`; the week column is `weekdayName(d, 'short')`.
- `src/overlays/popovers.js` — the mini-calendar header is `weekdayName(addD(start, i), 'short').slice(0, 2)`; the month label is `monthName(m, 'long')`; `startOfWeek` is still imported from `../views/calendar.js`.
- `src/pages/home.js` — the greeting line is `${weekdayName(TODAY, 'long')}, ${monthName(TODAY, 'long')} ${TODAY.getDate()}`.
- `src/views/timeline.js` — the day label is `${monthName(d, 'short')} ${d.getDate()}`; the month label is `${monthName(m.d, 'long')} ${m.d.getFullYear()}`.
- `src/core/utils.js` — the four array declarations are deleted; nothing else changes.
- `test/fixtures/i18n-pending.json` — **unchanged** (1694 entries; see deviation 1).

## Decisions Made

- **The declared deviation is kept:** the two-letter header is `weekdayName(..., 'short').slice(0, 2)`, not `weekday: 'narrow'`. `Intl`'s narrow English weekday is one letter (`M T W T F S S`) — ambiguous and a change to the English rendering D-01 forbids. The CONTEXT's actual requirement (the header comes from `Intl`, not from an English array) is honoured.
- **The header reads the week-start arithmetic.** `startOfWeek()` is the single owner of the `prefs.weekStart` arithmetic; the header walks its output instead of computing `(i + weekStart) % 7` over an array. The test forbids the index-arithmetic shape from returning.
- **The source-level contracts live in the test suite.** The four view files cannot be imported by bare Node, so the suite asserts their shape on the source — the same discipline `test/i18n-format.test.mjs` uses for `src/ui/helpers.js` — while the behavioural oracle runs against the formatters, which are importable.

## Deviations from Plan

### Plan deviations (measurements, not choices)

**1. The allow-list never carried the thirty-eight month and weekday names, so it did not change.**
- **Found during:** Task 3, when the allow-list showed exactly one `src/core/utils.js` entry (`Ctrl`).
- **Issue:** the plan (and the must_have *"the allow-list loses the thirty-eight month and weekday names the four arrays carried"*) assumes the scanner reports the arrays' values as display labels. It does not: `scripts/i18n-scan.mjs` classifies any flat string array whose every element is a month/weekday name as a **machine list** (`MONTH_WEEKDAY_NAMES`, `scripts/i18n-scan.mjs:88-126`, applied at `:519-523`), so those 38 values were never findings and never allow-list entries. The plan's read-first pointer to 06-01-PLAN.md describes the scanner's design intent, but the shipped scanner deliberately carves the date arrays out. This is the same class of measurement correction as plan 06-02's deviation 3 and plan 06-03's deviation 2.
- **Resolution:** the invariant the plan actually wants holds — the arrays' values are gone from the sources, the meter carries none of them, and the scan is green with identical counts (1957/1957/0/0/0/0). The three month/weekday entries the list does carry (`Sunday`, `Monday`, `Saturday`) belong to `src/pages/settings.js`'s weekStart selector, are live pending literals of plan 06-09's sweep, and removing them would turn the scan red at the wave boundary. The suite pins the corrected invariant: no `src/core/utils.js` entry is a month or weekday name, and the list stays sorted.
- **Files modified:** none (allow-list untouched at 1694 entries).
- **Follow-up for the phase close:** `MONTH_WEEKDAY_NAMES` in `scripts/i18n-scan.mjs` is now dead weight for the deleted arrays; it is harmless (it only classifies array frames) and outside this plan's `files_modified`, but a later plan may retire it.

**2. The plan's `'Thursday, July 24'` oracle mislabeled the weekday: 24 July 2026 is a Friday.**
- **Found during:** Task 2, when the greeting-line assertion failed against the real calendar.
- **Issue:** the plan's behaviour text pins `'Thursday, July 24'` for "a Thursday in July", but 24 July 2026 is a Friday — the old array code rendered `Friday, July 24` for that date, so the byte-identical output for the 24th is `Friday, July 24`, not `Thursday, July 24`. The composition is the contract; the weekday label was prose.
- **Fix:** the Thursday oracle pins 23 July 2026 (`Thursday, July 23`) — a genuine Thursday — and a second assertion pins the 24th as `Friday, July 24`, byte-identical to the arrays. The French oracle `vendredi, juillet 24` (which the plan pinned correctly) is unchanged.
- **Files modified:** `test/i18n-dates.test.mjs`
- **Committed in:** `a706a3c`

**3. The plan's declared deviation (kept, not a discovery):** the mini-calendar header uses `weekday: 'short'` sliced to two characters, not `weekday: 'narrow'` — see Decisions Made. The CONTEXT's literal wording would cost the English header, which D-01 forbids.

---

**Total deviations:** 2 plan measurements corrected (1 recorded as a follow-up, 1 test-fixture fix) and the plan's own declared deviation kept.
**Impact on plan:** no scope change, no new dependency, no catalogue change (`fr.json` stays at its 6 seed keys), and the English output is byte-identical.

## Issues Encountered

- The Task 3 test initially asserted sortedness with `localeCompare`; the allow-list is sorted by code-unit order (the previous plans' serialization), so the test was corrected to the code-unit comparison that matches the file on disk.
- The Task 3 source assertion initially matched its own explanatory comment in `src/core/utils.js`; the comment was reworded rather than the assertion weakened.

## Known Stubs

None. Every call site is wired to the locale formatters and every output is reachable and pinned.

## Threat Flags

None new. The plan's threat register holds: the weekday/month options are fixed literals inside `monthName()`/`weekdayName()` (T-06-12), the header is seven calls over one cached formatter per locale (T-06-13), no user datum is exposed (T-06-14), and no package was installed (T-06-SC).

## User Setup Required

None — no external service configuration required.

## Verification

| Command | Result |
|---|---|
| `node --test test/i18n-dates.test.mjs` | 21 pass, 0 fail |
| `node --test test/i18n-dates.test.mjs test/i18n-format.test.mjs` | 45 pass, 0 fail |
| `npm test` | 176 pass, 0 fail (155 before this plan's 21 new tests; includes the catalogue, build-locales and icon-baseline contracts) |
| `node scripts/i18n-scan.mjs` | `1957 literals, 1957 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch`, exit 0 |
| `npm run lint` | clean |
| `npm run format:check` | clean (after one prettier pass on the new test file) |
| `npm run build` | green — the scan runs first and stays green |
| `npm run e2e` | 6 Chromium tests passed against the built `dist/` |
| `src/locales/fr.json` | untouched — 6 seed keys |
| `test/fixtures/icons-baseline.json` | 174 names — unchanged |

## Self-Check: PASSED

| Check | Result |
|---|---|
| `test/i18n-dates.test.mjs` exists | FOUND — 21 tests, all pass |
| `src/core/utils.js` has no `export const (MON\|MONL\|WD\|WDL)` | FOUND — absent |
| every other `utils.js` export survives | FOUND — all 20 names asserted by the suite |
| no `src/` file references the array names | FOUND — grep returns nothing |
| commits `2c82e38`, `fb21ff8`, `3c63351`, `a706a3c`, `e5c0ac0`, `9112a86`, `3a286bb` reachable from HEAD | FOUND — `git rev-list --count 4c18399..HEAD` → 7 |
| `src/locales/fr.json` untouched | FOUND — 6 keys, empty diff over the plan range |
| icon baseline | 174 — unchanged |
| allow-list | 1694 entries, unchanged, sorted (code-unit order) |
| scan | 1957 literals, 0 unlisted, 0 stale — green |
| `npm test` / lint / format:check / build / e2e | all green |

## Requirement status

`I18N-03` is the plan's declared requirement, but the traceability row in `.planning/REQUIREMENTS.md` is deliberately **left Pending**: the requirement is shared, plans 06-02 and 06-03 already recorded that it stays open until the phase closes ("the requirement is satisfied when the French interface actually renders in French" — the French catalogue is phase 7), and this plan alone does not complete it. This plan delivers its slice: no English month or weekday name survives in the sources, and every date header comes from the locale.

## Next Phase Readiness

- **The sweep's next waves are unblocked.** The settings page's `Sunday`/`Monday`/`Saturday` weekStart labels (and the rest of `src/pages/settings.js`) are plan 06-09's literals; nothing in this plan touches them.
- **`MONTH_WEEKDAY_NAMES` in `scripts/i18n-scan.mjs` is the one follow-up** — a dead classification for the deleted arrays, harmless, retired at the phase close if desired.
- **Phase 11's shipped-artifact proof inherits the date-surface suite:** the English headers are pinned byte-for-byte, so any future locale work that changes them fails loudly.
- **Nothing is blocked.**

---
*Phase: 06-english-extraction-locale-aware-formats*
*Completed: 2026-10-22*
