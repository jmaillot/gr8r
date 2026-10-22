---
phase: 05-i18n-foundation-catalogue-contract
plan: 01
subsystem: i18n
tags: [i18n, catalogue, json, plural-rules, vite, lucide, node-test]

requires:
  - phase: none
    provides: the v1.1 app the i18n layer is added to (hand-written template strings, no framework, zero runtime dependency)
provides:
  - "src/core/i18n.js — the leaf i18n layer: t(), getLocale(), setLocale(), registerCatalogue(), availableLocales(), LOCALES, BASE_LOCALE, escHtml()"
  - "src/locales/en.json — the English base catalogue seed: 9 flat dotted keys, 2 CLDR plural objects"
  - "src/locales/fr.json — the 6-key French placeholder catalogue that exercises the locale switch"
  - "scripts/icons.mjs — the shared Lucide icon scan (lucideIconNames, lucideIconMarkup), importable by Node and by vite.config.js"
  - "test/fixtures/icons-baseline.json — the pre-phase icon list, frozen from the PRE-PHASE lucideSubset() plugin (174 names)"
  - "test/i18n.test.mjs — the layer contract suite: 16 cases over lookup, interpolation, English fallback, the plural table, the locale switch and the leaf contract"
  - "the build contract: the default build emits the French catalogue as its own fr-*.js chunk and inlines the English catalogue in the entry chunk"
affects: [06-english-extraction, 07-french-catalogue, 08-per-user-locale, 11-build-gate]

actuals:
  tokens: 4453
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "the leaf layer: a module under src/core that imports the data and nothing else from the app, so the dependency graph stays acyclic"
    - "the module-level mutable singleton read at call time (locale mirrors dateFormat in src/core/utils.js)"
    - "the catalogue is JSON, never a .js file under src/, so the Lucide icon walk can never sweep a value into the bundle"
    - "the top-level registerCatalogue(BASE_LOCALE, en) side effect that keeps the static JSON import alive through tree-shaking"

key-files:
  created:
    - src/core/i18n.js
    - src/locales/en.json
    - src/locales/fr.json
    - scripts/icons.mjs
    - test/fixtures/icons-baseline.json
    - test/i18n.test.mjs
  modified:
    - src/main.js

key-decisions:
  - "availableLocales() lists a registry entry when its catalogue is registered OR when the build ships a catalogue file for it (a glob loader exists), so the phase 8 selector offers English and Français in the browser instead of English alone"
  - "the plural category always comes from the ACTIVE locale's rules, as the plan's acceptance criterion states, even when the value itself came from the English fallback"

patterns-established:
  - "the catalogue seed keys under the contract. namespace exist only to prove one direction of the lookup; the production catalogue does not use it"
  - "a plural value is an object keyed by CLDR category, the count placeholder is {n}, and a missing member falls back to other"

requirements-completed: [I18N-06]

coverage:
  - id: D1
    description: "The leaf i18n layer: t(), getLocale(), setLocale(), registerCatalogue(), availableLocales(), LOCALES, BASE_LOCALE, escHtml() — importing nothing but the JSON catalogues"
    requirement: I18N-06
    verification:
      - kind: unit
        ref: "test/i18n.test.mjs#the layer is a leaf: it imports the catalogues and nothing else"
        status: pass
      - kind: unit
        ref: "test/i18n.test.mjs#the module exports the locale registry and the layer surface"
        status: pass
    human_judgment: false
  - id: D2
    description: "The English base catalogue: 9 flat dotted keys, plain-text values, 2 CLDR plural objects"
    requirement: I18N-06
    verification:
      - kind: unit
        ref: "test/i18n.test.mjs#a base catalogue key returns the string carried by the English catalogue file"
        status: pass
      - kind: other
        ref: "node --input-type=module -e \"...JSON.parse(src/locales/en.json)...\" (9 keys, no value containing < > \\\")"
        status: pass
    human_judgment: false
  - id: D3
    description: "The French placeholder catalogue: 6 keys, a many member on task.count, no many member on file.count, and contract.frenchOnly — the key that exists only in French"
    requirement: I18N-06
    verification:
      - kind: unit
        ref: "test/i18n.test.mjs#the locale switch announces itself with a gr8r:locale event"
        status: pass
    human_judgment: false
  - id: D4
    description: "The plural engine: the category comes from Intl.PluralRules for the active locale, one cached rule instance per locale, a missing member falls back to other, and an unresolvable value returns the key"
    requirement: I18N-06
    verification:
      - kind: unit
        ref: "test/i18n.test.mjs#the plural engine selects the English CLDR categories"
        status: pass
      - kind: unit
        ref: "test/i18n.test.mjs#the plural engine selects the French CLDR categories"
        status: pass
      - kind: unit
        ref: "test/i18n.test.mjs#a plural member that is missing falls back to other"
        status: pass
      - kind: unit
        ref: "test/i18n.test.mjs#a plural value with neither the selected member nor other makes t return the key"
        status: pass
      - kind: unit
        ref: "test/i18n.test.mjs#a plural value with no count is a string, never an object"
        status: pass
    human_judgment: false
  - id: D5
    description: "The locale switch announces itself with a gr8r:locale CustomEvent carrying detail.code, dispatched on the global document and never on an imported renderer"
    requirement: I18N-06
    verification:
      - kind: unit
        ref: "test/i18n.test.mjs#the locale switch announces itself with a gr8r:locale event"
        status: pass
      - kind: unit
        ref: "test/i18n.test.mjs#an unknown locale code resolves to the base locale and still announces the change"
        status: pass
    human_judgment: false
  - id: D6
    description: "The layer is inside the entry's module graph: the default build emits the French catalogue as its own fr-*.js chunk and carries the English catalogue in the entry chunk"
    requirement: I18N-08
    verification:
      - kind: other
        ref: "npm run build && node --input-type=module -e \"...dist/assets...\" — entry=index-BR2xhuQM.js fr=fr-Cx13KH9B.js en=true"
        status: pass
    human_judgment: false
  - id: D7
    description: "The pre-phase Lucide icon baseline is frozen from the pre-phase plugin and the shared scan reproduces it exactly — the new .js file under src/ adds no icon"
    requirement: I18N-08
    verification:
      - kind: other
        ref: "node --input-type=module -e \"...lucideIconNames('src') vs test/fixtures/icons-baseline.json\" — icons 174 baseline 174"
        status: pass
    human_judgment: false
  - id: D8
    description: "The interface renders exactly as it renders today: no user-visible string moved, and the whole suite stays green"
    verification:
      - kind: e2e
        ref: "npm run e2e — 6 Chromium tests passed"
        status: pass
      - kind: unit
        ref: "npm test — 66 tests passed (50 pre-existing + 16 new)"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-10-22
status: complete
---

# Phase 5 Plan 01: i18n foundation & catalogue contract Summary

**A leaf `t()` layer over JSON catalogues, with the escaping, plural and build contracts pinned by 16 tests before a single string moves.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-10-22T10:19:00Z
- **Completed:** 2026-10-22T10:35:00Z
- **Tasks:** 3
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments

- `src/core/i18n.js` is a real leaf: the suite extracts every import specifier with a both-quote-styles regex, asserts the set is non-empty, and asserts every specifier points at `../locales/*.json`.
- The catalogue contract is pinned: the English base string, the `{name}` interpolation, the untouched unknown placeholder, the unknown-key fallback, the raw pass-through (`Hello, <b>!`), and the escape table that matches `esc()` in `src/core/utils.js:10`.
- The plural engine is CLDR, not hand-written: French resolves 0 to `one` and 1 000 000 to `many`, English resolves 0 to `other`, and a member that is missing falls back to `other`.
- The locale switch announces itself with a `gr8r:locale` CustomEvent carrying `detail.code`, dispatched on the global `document` — the module never imports the renderer.
- The build contract is real, not vacuous: the default build emits `assets/fr-Cx13KH9B.js` carrying the French catalogue while the entry chunk carries the English one.
- The icon baseline is frozen from the PRE-PHASE plugin (174 names) and the shared scan reproduces it byte for byte — the new `.js` file under `src/` adds no icon.

## Task Commits

Each task was committed atomically; the two TDD tasks carry the RED/GREEN pair:

1. **Task 1: one catalogue value, from the JSON file to a returned string, and the layer into the build's module graph** — `7e44d40` (feat)
2. **Task 2 (seam): the locale switch the plural engine needs** — `acea0dd` (feat)
3. **Task 2 RED: the plural contract** — `c32e1d4` (test)
4. **Task 2 GREEN: the plural engine** — `1010692` (feat)
5. **Task 3 RED: the gr8r:locale announcement** — `5e317a2` (test)
6. **Task 3 GREEN: the announcement** — `f881656` (feat)

## Files Created/Modified

- `src/core/i18n.js` — the leaf layer: the locale singleton, `t()`, `getLocale()`/`setLocale()`, `registerCatalogue()`, `availableLocales()`, the locale registry, `escHtml()` and the cached `Intl.PluralRules` instances.
- `src/locales/en.json` — the English base catalogue seed: 9 flat dotted keys, `task.count` and `file.count` as CLDR-category objects.
- `src/locales/fr.json` — the 6-key French placeholder: `task.count` carries a `many` member, `file.count` deliberately does not, `contract.frenchOnly` exists only here.
- `scripts/icons.mjs` — the shared Lucide scan: `lucideIconNames(srcDir)` and `lucideIconMarkup(name)`. It lives outside `src/`, so the plugin's walk never reads it.
- `test/fixtures/icons-baseline.json` — the 174 pre-phase icon names, frozen from the pre-phase plugin's own `load()` output.
- `test/i18n.test.mjs` — the 16-case contract suite.
- `src/main.js` — one added line, `import './core/i18n.js';`. Nothing else in the entry changed.

## Verification

| Check | Command | Result |
|-------|---------|--------|
| Layer contract | `node --test test/i18n.test.mjs` | 16/16 pass |
| Icon baseline | the plan's `lucideIconNames('src')` vs the frozen baseline | `icons 174 baseline 174`, identical |
| Build graph | `npm run build` + the plan's `dist/assets` assertion | `entry=index-BR2xhuQM.js fr=fr-Cx13KH9B.js en=true` |
| Plural categories | `node -e "new Intl.PluralRules(...)"` | `one many other` |
| Bare Node import | `node --input-type=module -e "import('./src/core/i18n.js')"` | loads, no `document` needed |
| Whole suite | `npm test` | 66/66 pass (50 pre-existing untouched) |
| Shipped bundle | `npm run e2e` | 6/6 Chromium tests pass |
| Lint / format | `npm run lint && npm run format:check` | clean |
| Zero runtime dependency | `package.json` | no `dependencies` block |

## Decisions Made

- **`availableLocales()` counts a locale whose catalogue file the build ships.** The plan says "whose catalogue is present"; read strictly as "registered", the browser would offer English only until `fr` was loaded, which would break phase 8's LOC-02 ("the selector offers English and Français"). The implementation therefore accepts a registered catalogue OR a glob loader for that locale. In bare Node the loader map is empty, so only the registered locales are listed — the documented behaviour outside a bundler.
- **The plural category follows the active locale, as the plan's acceptance criterion states**, even when the value itself came from the English fallback. The seed catalogues do not expose the difference (French carries both plural keys); phase 7, which must cover every English key, will not either.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The locale switch lands one task early**
- **Found during:** Task 2 (the plural engine)
- **Issue:** Task 2's behaviour block carries five French cases (0 → `one`, 1 000 000 → `many`, the missing-member fallback), and a French case is unobservable while the active locale is English: `t()` resolves the active catalogue first and the English catalogue second, so a French value is never consulted. The plan's task order therefore made Task 2's own acceptance criterion unprovable — the switch that Task 3 owns was needed by Task 2.
- **Fix:** The switch was implemented in its own commit (`acea0dd`) inside Task 2's window, *without* the announcement; Task 3 then added the `gr8r:locale` dispatch on top of it. The seam's contract is exactly Task 3's action minus the event: registry resolution, an unknown code resolving to `BASE_LOCALE`, the synchronous singleton update, and the loader invocation.
- **Files modified:** `src/core/i18n.js`
- **Verification:** `node --test test/i18n.test.mjs` — the five French cases fail before the plural engine and pass after it; the switch's own contract is proven by Task 3's suite.
- **Committed in:** `acea0dd`

**2. [Rule 1 - Bug] The suite's document recorder shadowed the imported `t()`**
- **Found during:** Task 3 (GREEN)
- **Issue:** The switch tests declared their `node:test` context parameter as `t`, which shadowed the imported `t()` inside the callback: the first run failed with `TypeError: t is not a function` at the French lookup assertion.
- **Fix:** The context parameter was renamed to `ctx` in both switch tests.
- **Files modified:** `test/i18n.test.mjs`
- **Verification:** `node --test test/i18n.test.mjs` — 16/16 pass.
- **Committed in:** `f881656`

### Formatting

- **Prettier breaks the `LOCALES` literal across four lines.** The plan writes it on one line; Prettier always explodes an array of two multi-key object literals, and `npm run format:check` is a hard gate in this repository. The exported value is identical.

## Issues Encountered

- The RED commit of Task 3 failed GREEN on the first attempt with `TypeError: t is not a function` — the shadowing described above. The RED evidence itself was valid: the target assertion (`0 !== 1`, the recorder observing no event) failed exactly as intended.
- One Task 2 test ("a plural value with neither the selected member nor other makes `t()` return the key") already passed at RED: with no plural engine, `t()` returns the key for every object value. It became a meaningful regression guard once the engine resolved objects.

## Known Stubs

None. The catalogue seeds are complete for their contract, the icon baseline is a frozen list rather than a placeholder, and no file created or modified in this plan carries an empty value, a TODO or a disconnected data source.

## Notes for the next phases

- The catalogue-inertness **lint** — the test that rejects any value containing `<`, `>` or `"` — is plan 05-02's deliverable, exactly as this plan's threat register says (T-05-01). This plan keeps the seed values inert; the values were checked and none contains a forbidden character.
- **I18N-08 is not complete yet.** This plan delivers its first half (the French catalogue is emitted as its own chunk); the second half — an English-only build carrying no French byte — is plan 05-03's `localeSubset()` plugin and `build:en` script.
- The `contract.` namespace in both seeds exists only to prove one direction of the lookup. The production catalogue does not use it.

---
*Phase: 05-i18n-foundation-catalogue-contract*
*Completed: 2026-10-22*
