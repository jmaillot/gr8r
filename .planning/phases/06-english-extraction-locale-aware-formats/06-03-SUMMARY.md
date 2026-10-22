---
phase: 06-english-extraction-locale-aware-formats
plan: 03
subsystem: i18n
tags: [i18n, preferences, sentinel, settings, intl, locale]

requires:
  - phase: 06-02
    provides: the Intl primitives, isAutoDateFmt() and the sentinel handling inside formatDate()
provides:
  - test/i18n-prefs.test.mjs — the preference contract: the sentinel predicate, the read-time resolution, the two settings rows and the write path
  - src/pages/settings.js — the date-format and time-format rows: the 'auto' option, the locale-computed preview and the catalogue previews
  - src/core/prefs.js — prefValue(key, value), the one coercion the preference bag applies
  - src/actions/actions.js — A.setPref and IN.prefSel write through prefValue(), so the sentinel survives a save
  - src/locales/en.json — the three time-format labels
affects: [06-04, 06-09, phase-7, phase-8, phase-11]

commits: 3
plan_head_before: 7ac0f7d36e3e456f7d8894b67e8f741d02760208
plan_head_after: 87ec20b5c7884597f47ee16df3cd9ad2d1e8634a

actuals:
  tokens: 5438
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - the sentinel is resolved at READ time: the predicate decides, the value is never written back
    - the preference writers share one pure helper, prefValue(key, value), in a leaf module the node suite can import

key-files:
  created:
    - test/i18n-prefs.test.mjs
    - src/core/prefs.js
  modified:
    - src/pages/settings.js
    - src/actions/actions.js
    - src/locales/en.json
    - test/fixtures/i18n-pending.json

key-decisions:
  - "The stored 'MMM d' IS the 'auto' sentinel (D-04): the document cannot distinguish a preference that was never touched from one the user picked as the default, so the value is resolved when it is READ and no document is rewritten, no revision moves and no migration is added."
  - "The date-format row REPLACES the 'MMM d' option with an 'auto' option rather than keeping both: the stored value means 'follow the locale', so a visible 'MMM d' choice would offer a selection the application cannot honour."
  - "The 'auto' preview is computed by the locale's own date format from a fixed sample (1 October 2026, the year suppressed), never from a hard-coded English string: it follows the locale and stays stable in every year."
  - "The selected option is COMPUTED at render time (isAutoDateFmt(P.dateFmt) ? 'auto' : P.dateFmt), never stored: only a user action writes a value, and that value is the literal 'auto'."
  - "The one declared English delta — the time-format selector now defaults to the new 'auto' option — is recorded where the phase's verification reads it: the roadmap's success criterion 2 and the CONTEXT's 'Declared English deltas'. The English clock is still 12-hour and no stored document changes."

patterns-established:
  - "a sentinel is a READ-time decision: isAutoDateFmt() is consulted where the value is used, and no code path writes the resolved value back to the bag, the document or the server"
  - "the preference bag applies exactly one coercion (weekStart to a number), and it lives in a pure exported helper so a node suite can prove it without a browser"

requirements-completed: [I18N-03]

coverage:
  - id: D1
    description: "a stored 'MMM d' renders the locale's date format ('Jul 24' in English) and the document is never rewritten: the sentinel is resolved when the value is read"
    requirement: I18N-03
    verification:
      - kind: unit
        ref: "test/i18n-prefs.test.mjs#a stored MMM d renders the locale date form: Jul 24"
        status: pass
      - kind: unit
        ref: "test/i18n-prefs.test.mjs#resolving the preference never writes: neither setDateFormat() nor fmtDate() saves"
        status: pass
      - kind: unit
        ref: "test/i18n-prefs.test.mjs#the sentinel is never resolved at WRITE time: the store never maps a pattern"
        status: pass
    human_judgment: false
  - id: D2
    description: "the three explicit date patterns ('d/M', 'M/d', 'yyyy-MM-dd') always win, in every locale: '24/7' in English and in French"
    requirement: I18N-03
    verification:
      - kind: unit
        ref: "test/i18n-prefs.test.mjs#a stored d/M renders 24/7, in English and in French"
        status: pass
      - kind: unit
        ref: "test/i18n-format.test.mjs#an explicit date pattern always wins, in every locale"
        status: pass
    human_judgment: false
  - id: D3
    description: "the settings page offers an 'auto' option on both format rows, computes the 'auto' preview from the locale ('Oct 1' in English, '01/10' in French) and reads the three explicit previews from the catalogue"
    requirement: I18N-03
    verification:
      - kind: unit
        ref: "test/i18n-prefs.test.mjs#the date-format selector offers auto, d/M, M/d and yyyy-MM-dd"
        status: pass
      - kind: unit
        ref: "test/i18n-prefs.test.mjs#the auto preview is computed from the locale date format, never hard-coded"
        status: pass
      - kind: unit
        ref: "test/i18n-prefs.test.mjs#the three explicit previews are catalogue values, and the literals are gone"
        status: pass
    human_judgment: false
  - id: D4
    description: "the sentinel survives a save: prefValue('dateFmt', 'auto') is the string 'auto', weekStart is still the only coerced key, and neither writer compares a value against 'auto'"
    requirement: I18N-03
    verification:
      - kind: unit
        ref: "test/i18n-prefs.test.mjs#the preference value is written verbatim: the sentinel survives a save"
        status: pass
      - kind: unit
        ref: "test/i18n-prefs.test.mjs#both preference writers go through the shared helper"
        status: pass
      - kind: unit
        ref: "test/i18n-prefs.test.mjs#no preference value is compared against auto, and only weekStart is coerced"
        status: pass
    human_judgment: false
  - id: D5
    description: "the one declared English delta — the time-format selector now defaults to the 'auto' option — is recorded in the roadmap's success criterion 2 and in the phase's CONTEXT"
    requirement: I18N-03
    verification:
      - kind: unit
        ref: "test/i18n-prefs.test.mjs#the declared English delta is recorded where the phase verification reads it"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-10-22
status: complete
---

# Phase 6 Plan 03: The 'auto' sentinel Summary

**The stored `'MMM d'` now means "follow the locale": the date and time settings rows offer an `'auto'` option, its preview is computed by the locale's own formatter, and the sentinel reaches the preference bag verbatim so it survives the first save.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-22T13:00:00Z
- **Completed:** 2026-10-22T13:09:37Z
- **Tasks:** 3
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- **The sentinel is proven to be read-time only.** `test/i18n-prefs.test.mjs` (18 tests) asserts the predicate's five cases, the two resolutions (`'MMM d'` → `Jul 24`, `'d/M'` → `24/7` in English *and* in French), that neither `setDateFormat()` nor `fmtDate()` calls `save()`, touches `S.prefs` or rewrites the pattern, and that the store never maps a pattern — so no document is rewritten and no revision moves.
- **The default IS the sentinel.** `DEFAULT_PREFS.dateFmt` is `'MMM d'` and `isAutoDateFmt('MMM d')` is true, so a document that was never touched renders the locale's date form from the very first render. `timeFmt` is genuinely unset — it is absent from `DEFAULT_PREFS` — so it needs no mapping.
- **The settings page follows the locale.** The date-format row offers exactly `auto`, `d/M`, `M/d` and `yyyy-MM-dd`; a stored `'MMM d'` marks `'auto'` as selected (computed at render, never written back); the `'auto'` preview is `formatDate(SAMPLE_DATE, { pattern: 'auto', year: 'never' })` → **`Oct 1`** in English and **`01/10`** in French, computed rather than hard-coded. The three explicit previews are catalogue values (`1/10`, `10/1`, `2026-10-01`).
- **The time-format row gains `'auto'`**, and an unset preference selects it. The two explicit options keep their exact English text — `12-hour (2:30 PM)` and `24-hour (14:30)` — because the sample is now rendered by `formatTime()` instead of being typed into the label.
- **The sentinel survives a save.** `prefValue(key, value)` is the one coercion the bag applies (`weekStart` → a number, everything else verbatim); `A.setPref` and `IN.prefSel` both go through it, so `prefValue('dateFmt', 'auto')` is the string `'auto'`.
- **The allow-list shrank by exactly the literals this plan removed**: 1695 → **1694**. The scan reports **1957 literals, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch** and exits 0; `npm run build` (which runs the scan first) succeeds.

## The English output is unchanged

| Sample | Output |
|---|---|
| stored `'MMM d'`, 24 Jul 2026 | `Jul 24` |
| stored `'d/M'` (en **and** fr) | `24/7` |
| the `'auto'` preview, 1 Oct 2026 | `Oct 1` (en) — `01/10` (fr) |
| the `'auto'` clock, 14:30 | `2:30 PM` (en) — `14:30` (fr) |
| the two explicit time options | `12-hour (2:30 PM)`, `24-hour (14:30)` |
| file size | `1023 KB` |
| relative time | `5m ago` |
| the sentinel predicate | `isAutoDateFmt('MMM d')` → `true`, `'auto'` → `true`, `'d/M'` → `false` |

## Task Commits

Each task was committed atomically:

1. **Task 1: the sentinel is resolved at read time, and nothing is written back** - `b31f25c` (test)
2. **Task 2: the date-format and time-format rows of the settings page** - `d29d27f` (feat)
3. **Task 3: the preference write path carries the sentinel through verbatim** - `87ec20b` (feat)

**Plan metadata:** the summary itself (`docs(06): complete the 06-03 sentinel plan`).

## Files Created/Modified

- `test/i18n-prefs.test.mjs` - the preference contract: the sentinel predicate, the read-time resolution, the two settings rows, the catalogue, the write path and the declared delta (18 tests)
- `src/core/prefs.js` - `prefValue(key, value)`: the one coercion the preference bag applies, in a leaf module the node suite can import
- `src/pages/settings.js` - the date-format and time-format rows: the `'auto'` option, the computed preview, the catalogue previews, the `t`/`formatDate`/`formatTime`/`isAutoDateFmt` imports and the two fixed sample dates
- `src/actions/actions.js` - `A.setPref` and `IN.prefSel` write through `prefValue()`; the module re-exports the helper
- `src/locales/en.json` - `settings.timeFormat.auto` ("Automatic"), `settings.timeFormat.h12` ("12-hour"), `settings.timeFormat.h24` ("24-hour"); no existing key renamed
- `test/fixtures/i18n-pending.json` - the allow-list, minus the one literal this plan removed

## Decisions Made

- **The stored `'MMM d'` is the sentinel, and it is resolved at read time** (D-04). Nothing in the plan writes it back: `src/core/store.js` contains neither `isAutoDateFmt` nor the string `'auto'`, which the test asserts.
- **The date-format row replaces the `'MMM d'` option instead of keeping both.** A visible `'MMM d'` choice would offer a selection the application cannot honour, since the stored value means "follow the locale".
- **The previews are computed from a fixed sample** (1 October 2026, the year suppressed), so they are stable in every year and follow the locale. The English `'Oct 1'` is byte-identical to the literal it replaces.
- **The explicit time options' text is unchanged** and now comes from the catalogue plus the formatter. The `'auto'` option's label is the one new thing on the row — the declared English delta.
- **The declared delta was already recorded** in `.planning/ROADMAP.md` § Phase 6 (success criterion 2) and in `06-CONTEXT.md` under "Declared English deltas"; the plan's task 2 asked for it to be written there, and a test now pins both places so the carve-out cannot silently disappear.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `prefValue()` lives in a new leaf module, `src/core/prefs.js`, instead of `src/actions/actions.js`**
- **Found during:** Task 3 (the preference write path)
- **Issue:** the plan puts the helper in `src/actions/actions.js` and asks the node suite to call it, but that module cannot be imported by bare Node: `src/core/api.js` imports a Vite virtual module and `src/core/store.js` reaches `src/core/utils.js`, which touches `document` at module load. Measured: `node -e "import('./src/actions/actions.js')"` fails with *"Only URLs with a scheme in: file, data, and node are supported by the default ESM loader. Received protocol 'virtual:'"*.
- **Fix:** the pure helper moved to `src/core/prefs.js` (a leaf module with no import at all); `src/actions/actions.js` imports it and re-exports it (`export { prefValue };`), so the plan's contract — *"`src/actions/actions.js` exports `prefValue(key, value)`"* — still holds, and the test can call the function without a browser.
- **Files modified:** `src/core/prefs.js` (new), `src/actions/actions.js`, `test/i18n-prefs.test.mjs`
- **Verification:** `node --test test/i18n-prefs.test.mjs` → 18 pass, including *the preference value is written verbatim: the sentinel survives a save* and *both preference writers go through the shared helper*; `npm test` → 155 pass.
- **Committed in:** `87ec20b`

**2. [Clarification of an ambiguous instruction] the allow-list lost exactly ONE entry, not every `src/pages/settings.js` entry**
- **Found during:** Task 2 (the settings rows)
- **Issue:** the plan's Task 2 says *"Remove the entries of `src/pages/settings.js` from `test/fixtures/i18n-pending.json` in this task"*, but the scanner treats a **stale** entry and an **unlisted** finding as violations alike, and the settings page still carries **209** literals that plan `06-09`'s sweep will extract. Removing them all would turn the scan — and therefore `npm run build` — red at the wave boundary, which the plan's own must_have forbids (*"the allow-list shrinks by exactly the literals this plan removed from the settings page, so the scan stays green at the wave boundary"*).
- **Fix:** only the literals that actually left the source left the list. Of the six the plan names, only `'Oct 1'` was ever a finding — `'1/10'`, `'10/1'`, `'2026-10-01'`, `'12-hour (2:30 PM)'` and `'24-hour (14:30)'` do not match the scanner's display shape (a capitalised word or a prose literal), so they were never in the allow-list. The list went from **1695 to 1694**, sorted by file then text.
- **Files modified:** `test/fixtures/i18n-pending.json`
- **Verification:** `node scripts/i18n-scan.mjs` → *1957 literals, 1957 pending, 0 unlisted, 0 stale*, exit 0; `npm run build` succeeds.
- **Committed in:** `d29d27f`

---

**Total deviations:** 1 auto-fixed (1 blocking), 1 clarification of an ambiguous instruction.
**Impact on plan:** The helper's location moved to a leaf module because the planned location is not importable by the test that proves it; the plan's *contract* (the helper exists, both writers use it, the sentinel is carried verbatim) is intact. The allow-list moved by exactly the one literal the plan removed. No scope creep, no behavioural change.

## Issues Encountered

- **The plan's "remove the entries of `src/pages/settings.js`" instruction is not executable as written** (see deviation 2). The governing must_have was followed instead.
- **The plan assumed `src/actions/actions.js` was importable by bare Node.** It is not (see deviation 1). Every assertion that needs the DOM's absence is therefore made on the source, and every assertion that needs behaviour is made on the leaf layer — the same discipline the phase-5 formatter suite already uses.

## Verification

| Command | Result |
|---|---|
| `node --test test/i18n-prefs.test.mjs` | 18 pass, 0 fail |
| `node --test test/i18n-format.test.mjs test/i18n.test.mjs test/catalogue.test.mjs` | 63 pass, 0 fail |
| `node --test test/migration.test.mjs` | 8 pass, 0 fail — the shared document is not rewritten; the byte-identical second boot still holds |
| `node scripts/i18n-scan.mjs` | `1957 literals, 1957 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch`, exit 0 |
| `npm test` | 155 pass, 0 fail (137 before this plan) |
| `npm run build` | built in 1.95 s — 62 modules, `prebuild` scan green |
| `npm run e2e` | 6 Chromium tests passed |
| `npm run lint && npm run format:check` | clean |

**Self-check: PASSED** — every file named above exists, and the three task commits (`b31f25c`, `d29d27f`, `87ec20b`) are reachable from `HEAD` (`git rev-list --count 7ac0f7d..HEAD` → 3).

**Contracts that did not move:** no runtime dependency (`package.json` keeps no `dependencies` block); the catalogue stays JSON under `src/locales/` with no French key added (`fr.json` stays at its 6 keys); the icon baseline of 174 names did not change; the ten `MON`/`MONL`/`WD`/`WDL` arrays in `src/core/utils.js` are untouched (plan `06-04` deletes them); `t()` still never escapes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The sentinel is in place and pinned: a later plan can extract the settings page's remaining strings (plan `06-09`) without touching the format rows' behaviour.
- `src/core/prefs.js` is the place for the next pure preference helper; the two writers already route through it.
- The declared English delta is recorded in the roadmap's success criterion 2 and in the CONTEXT, so the phase's verification reads it where it matters.
- Nothing is blocked.

---
*Phase: 06-english-extraction-locale-aware-formats*
*Completed: 2026-10-22*
