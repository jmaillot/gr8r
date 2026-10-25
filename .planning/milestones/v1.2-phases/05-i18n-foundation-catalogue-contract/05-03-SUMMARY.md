---
phase: 05-i18n-foundation-catalogue-contract
plan: 03
subsystem: i18n
tags: [i18n, vite, build, locale-subset, lucide, node-test, zero-dependency]

requires:
  - phase: none
    provides: the v1.1 app the i18n layer is added to (hand-written template strings, no framework, zero runtime dependency)
  - plan: 05-01
    provides: "src/core/i18n.js (the leaf layer, the static English import and the import.meta.glob of the other locales), src/locales/{en,fr}.json (the seed catalogues), scripts/icons.mjs (the shared Lucide scan), test/fixtures/icons-baseline.json (the frozen pre-phase icon list)"
  - plan: 05-02
    provides: "test/catalogue.test.mjs (the catalogue contract and the zero-runtime-dependency guard that re-asserts the manifest after this plan's write)"
provides:
  - "vite.config.js — the localeSubset() plugin: the build's locale set comes from process.env.LOCALES (default en,fr) and a locale outside that set resolves to an empty module, so its strings never reach the bundle"
  - "vite.config.js — the lucideSubset() plugin now builds its ICONS map from the shared scan in scripts/icons.mjs, byte for byte the map it produced before"
  - "package.json — the build:en script, the English-only build; still no dependencies block"
  - "test/build-locales.test.mjs — the build contract suite: 9 tests over three real Vite builds, the French chunk, the English-only build, the frozen icon baseline and the catalogue in the bundle and in bare Node"
  - "the build layout is a contract: the French catalogue travels as its own chunk, an English-only build carries none of its bytes, and no catalogue key can add an icon to the bundle"
affects: [06-english-extraction, 07-french-catalogue, 08-per-user-locale, 11-build-gate]

actuals:
  tokens: 3723
  tasks: 2
  commits: 3

plan_head_before: 99842418ff0239f2ca7c89a048a3a0935831515b
plan_head_after: 6d8063d0c057d541480f5de9b62b27bfa599bff9

tech-stack:
  added: []
  patterns:
    - "the build's locale set is a single environment variable read at config load time, with the default 'en,fr' that no script may change"
    - "a locale outside the build set resolves to a virtual empty module, so the contract is about the BYTES in the artifact, never about the file names"
    - "a structural claim is anchored to an observable rule: the entry chunk is the asset the built index.html loads, and the markers are computed from the catalogue files and filtered against the application's own sources"
    - "the icon set is asserted on both sides — the source scan and the shipped bundle's entries — against a baseline frozen from a DIFFERENT implementation"

key-files:
  created:
    - test/build-locales.test.mjs
  modified:
    - vite.config.js
    - package.json

key-decisions:
  - "the base locale ships in EVERY build: it is the catalogue every other one falls back to (D-08), so a build configured for a set without it would leave the interface without a language; the locale set still defaults to en,fr and no build script changes that default"
  - "the base catalogue is exempted from the subset rather than from the contract: the plugin still empties a locale outside the set, but 'en' is always a member of the set, so the exemption is one line in the set's construction"
  - "the suite runs THREE real builds (en,fr / en / fr), not two: the third one is what proves the base catalogue ships whatever the locale set"

patterns-established:
  - "a build assertion is non-vacuous by construction: a marker that also occurs in a .js file under src/ is dropped, and the marker set is asserted NOT to be empty"
  - "a minifier's real serialisation is the pattern's spec: the shipped ICONS map is counted with /(?:[a-z][a-z0-9]*|\"[a-z0-9-]+\"):'<[a-z]/g, which matches the bundle's bare-or-quoted key and its SINGLE-quoted value"

requirements-completed: [I18N-08]

coverage:
  - id: D1
    description: "The build carries a locale set (process.env.LOCALES, default en,fr) and a locale outside that set resolves to an empty module, so its strings never reach the bundle"
    requirement: I18N-08
    verification:
      - kind: unit
        ref: "test/build-locales.test.mjs#an English-only build carries no French byte at all"
        status: pass
      - kind: other
        ref: "LOCALES=en node node_modules/vite/bin/vite.js build --outDir /tmp/gr8r-en-build --emptyOutDir && the plan's byte probe — 'french bytes in the english-only build: false'"
        status: pass
    human_judgment: false
  - id: D2
    description: "The default build emits the French catalogue as a chunk of its own, a file different from the entry chunk the built index.html loads"
    requirement: I18N-08
    verification:
      - kind: unit
        ref: "test/build-locales.test.mjs#the French catalogue is a chunk of its own, and not the entry chunk"
        status: pass
      - kind: other
        ref: "npm run build — dist/assets/fr-Cx13KH9B.js against the entry chunk dist/assets/index-BR2xhuQM.js"
        status: pass
    human_judgment: false
  - id: D3
    description: "The English catalogue is inlined in the entry chunk of every build, so the interface is never without a language"
    requirement: I18N-08
    verification:
      - kind: unit
        ref: "test/build-locales.test.mjs#the English catalogue is inlined in the entry chunk of the default build"
        status: pass
      - kind: unit
        ref: "test/build-locales.test.mjs#the base catalogue ships in every build, so the interface is never without a language"
        status: pass
    human_judgment: false
  - id: D4
    description: "No catalogue key added an icon: the source scan and the shipped bundle's icon entries are both exactly the frozen pre-phase baseline"
    requirement: I18N-08
    verification:
      - kind: unit
        ref: "test/build-locales.test.mjs#no catalogue key added an icon: the source scan is the frozen pre-phase baseline"
        status: pass
      - kind: unit
        ref: "test/build-locales.test.mjs#no catalogue key added an icon: the shipped bundle carries exactly that baseline"
        status: pass
    human_judgment: false
  - id: D5
    description: "The build still ships with no runtime dependency, and the default build's output is byte-identical to the pre-plan build"
    requirement: I18N-08
    verification:
      - kind: other
        ref: "node -e \"...package.json dependencies...\" — 'runtime deps: 0'"
        status: pass
      - kind: other
        ref: "npm run build — the same asset hashes as before the plan: index-BR2xhuQM.js and fr-Cx13KH9B.js"
        status: pass
    human_judgment: false
  - id: D6
    description: "The interface renders exactly as it does today: the whole suite stays green and the Chromium suite exercises the shipped bundle"
    requirement: I18N-08
    verification:
      - kind: unit
        ref: "npm test — 98 tests passed (89 pre-existing + 9 new)"
        status: pass
      - kind: e2e
        ref: "npm run e2e — 6 Chromium tests passed against the built dist/"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-10-22
status: complete
---

# Phase 5 Plan 03: i18n foundation & catalogue contract Summary

**The build layout became a contract: the French catalogue travels as its own chunk, an English-only build carries none of its bytes, and no catalogue key can add an icon to the bundle.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-22T10:45:00Z
- **Completed:** 2026-10-22T10:53:00Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- `vite.config.js` reads the build's locale set from `process.env.LOCALES` (default `en,fr`, which no script changes) and the new `locale-subset` plugin — registered with `enforce: 'pre'` — resolves a locale outside that set to a virtual empty module. The English-only build still resolves the French import; the module it resolves to simply carries no French byte.
- The `lucideSubset()` plugin now builds its `ICONS` map from the shared scan in `scripts/icons.mjs` instead of its own inline walk. The map is byte-for-byte the one it produced before: the default build still emits the same two asset hashes (`index-BR2xhuQM.js`, `fr-Cx13KH9B.js`).
- `test/build-locales.test.mjs` runs the real `vite build` three times, into temporary out directories (`dist/` is never touched) and asserts on the produced bytes: the French catalogue is a chunk of its own, the English-only build carries no French byte, the base catalogue ships whatever the locale set, the icon set is exactly the frozen pre-phase baseline on both the source and the shipped side, and the catalogue loads in bare Node.
- The assertions are not vacuous, and that is proven, not asserted: with the `locale-subset` plugin removed from the config, "an English-only build carries no French byte at all" fails; with a stray quoted icon name added to a `src/*.js` file, both icon assertions fail.
- `package.json` carries `build:en` and still has no `dependencies` block — the manifest guard of plan 05-02 re-asserts it and passes.

## Task Commits

Each task was committed atomically; Task 2 is a TDD task and carries the RED/GREEN pair:

1. **Task 1: the build carries a locale set, and the icon scan has one implementation** — `11feafe` (feat)
2. **Task 2 RED: the build contract, proven on the real bundle** — `190f89d` (test)
3. **Task 2 GREEN: the base catalogue ships in every build** — `6d8063d` (feat)

## Files Created/Modified

- `vite.config.js` — the `localeSubset()` plugin (the `locale-subset` name, `enforce: 'pre'`, a locale outside the build set resolving to `\0virtual:locale-empty:<code>` and `export default {};`), the `BUILD_LOCALES` set read from `process.env.LOCALES`, and the `lucideSubset()` plugin rebuilt on `lucideIconNames`/`lucideIconMarkup`. The `server` block is untouched.
- `package.json` — one added line, `"build:en": "LOCALES=en vite build"`. No `dependencies` block.
- `test/build-locales.test.mjs` — the 9-test build contract suite.

## Decisions Made

- **The base locale is a member of the build set, always.** `BUILD_LOCALES` is built as `{ 'en', …process.env.LOCALES }`, so the base catalogue is never emptied. The plan's own must-have says "the English catalogue is inlined in the entry chunk in every build, so the interface is never without a language", and the base catalogue is what every other catalogue falls back to (D-08). The exemption is one line in the set's construction; the plugin still empties every other locale outside the set.
- **The suite runs three builds, not two.** The third (`LOCALES=fr`) is what proves the base catalogue ships whatever the locale set — the very assertion that failed at RED.
- **The markers are computed, filtered and asserted non-empty.** A marker that also occurs in a `.js` file under `src/` is dropped ("Cancel", "Save", "Projects", "Gr8r Studio", "Language" are all in the app's own sources today), and the remaining set is asserted NOT empty on either side — an empty marker set is a broken test, not a passing one.
- **The icon pattern was left exactly as the plan measured it**: `/(?:[a-z][a-z0-9]*|"[a-z0-9-]+"):'<[a-z]/g`, matching the minifier's real serialisation (bare key when it is a valid identifier, double-quoted otherwise, single-quoted value, first tag never `<svg`). The value quote was NOT loosened: the bundle's unrelated `desc:"<p>Low-fidelity …"` payload would match and break the count by one. Measured on the shipped bundle: 174 matches, 174 distinct keys, exactly the frozen baseline.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] The base catalogue was emptied by a build set that did not carry it**
- **Found during:** Task 2 (RED)
- **Issue:** The plugin as the plan specifies it resolves *every* locale outside `BUILD_LOCALES` to an empty module. A build configured with `LOCALES=fr` therefore shipped no English catalogue at all, which breaks the plan's own must-have ("the English catalogue is inlined in the entry chunk in every build, so the interface is never without a language") and the English fallback of D-08: `t()` would have returned raw keys for every untranslated string.
- **Fix:** `BUILD_LOCALES` is now built with the base locale as an unconditional member, so `en` is never emptied. The plugin's behaviour for every other locale outside the set is unchanged, and the default is still `en,fr`.
- **Files modified:** `vite.config.js`
- **Verification:** `node --test test/build-locales.test.mjs` — the new test "the base catalogue ships in every build, so the interface is never without a language" fails at RED and passes at GREEN. The suite now runs a third build (`LOCALES=fr`) that carries the English catalogue in its entry chunk.
- **Committed in:** `6d8063d`

### TDD Gate Compliance

- **RED (`190f89d`):** the suite was committed with exactly one failing test — "the base catalogue ships in every build, so the interface is never without a language" — failing on `AssertionError: the entry chunk carries the English marker "Hello, {name}!"`, an assertion for the planned behaviour and not a load error. The other eight tests pass, because the plan deliberately places the implementation in Task 1 and the contract in Task 2; the classic "the test fails before any implementation exists" ordering is impossible by the plan's own task order, which is a `type: execute` plan, not a `type: tdd` one.
- **GREEN (`6d8063d`):** the base-locale exemption; 9/9 pass.
- **REFACTOR:** none needed.
- **Commit naming:** the phase's house style is `feat(05): …` / `test(05): …` (the convention of plans 05-01 and 05-02), not the `feat(05-03): …` pattern the generic TDD gate greps for. The house style was kept, so the gate's commit-pattern grep finds nothing; the RED/GREEN pair is listed above instead.
- **Non-vacuity evidence** (the plan's own concern: "the build assertions must not pass vacuously"): with the `locale-subset` plugin removed from `vite.config.js`, "an English-only build carries no French byte at all" fails; with a stray `'a-arrow-down'` token added to a `src/*.js` file, both icon assertions fail. Both probes were reverted; the working tree is clean.

---

**Total deviations:** 1 auto-fixed (1 missing critical functionality)
**Impact on plan:** The auto-fix is required by a must-have the plan states explicitly, and it narrows the surface rather than widening it. No scope creep: the plugin still empties every locale outside the build set, and the default build's output is byte-identical to the pre-plan build.

## Issues Encountered

- The first `prettier --check` of the new suite failed; the file was formatted with `prettier --write` before the RED commit. The suite's behaviour was unchanged.
- The RED run of the suite is slow by design — three real Vite builds, about 4 s in total. The suite writes into `os.tmpdir()` and deletes the directories in its `after` hook, so `dist/` is never touched and the developer's bundle survives a test run.

## Known Stubs

None. Every file created or modified in this plan carries a complete implementation: the plugin resolves or it does not, the suite asserts nine concrete behaviours, and no value is a placeholder, a TODO or a disconnected data source.

## Verification

| Check | Command | Result |
|-------|---------|--------|
| The build contract suite | `node --test test/build-locales.test.mjs` | 9/9 pass |
| The whole suite | `npm test` | 98/98 pass (89 pre-existing + 9 new) |
| Default build | `npm run build` | `index-BR2xhuQM.js` + `fr-Cx13KH9B.js` — the same hashes as before the plan |
| English-only build | `LOCALES=en node node_modules/vite/bin/vite.js build --outDir /tmp/gr8r-en-build --emptyOutDir` | `index-Berjxgmc.js` + a 0.03 kB `_virtual_locale-empty_fr-*.js` stub |
| No French byte in the English-only build | the plan's `node -e` probe | `french bytes in the english-only build: false` |
| `build:en` script | `npm run build:en` | builds, same assets as the manual `LOCALES=en` build |
| Icon baseline (source) | the plan's `lucideIconNames('src')` probe | `icons 174 baseline 174`, identical |
| Icon baseline (shipped) | the suite's shipped-entry count | 174 distinct keys, exactly the baseline set |
| Zero runtime dependency | `node -e "...package.json..."` | `runtime deps: 0` |
| Lint / format | `npm run lint && npm run format:check` | clean |
| Shipped bundle | `npm run e2e` | 6/6 Chromium tests pass |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **I18N-08 is complete.** The French catalogue is its own chunk, an English-only build carries none of its bytes, and the icon set is pinned to the pre-phase baseline on both sides of the comparison.
- Phase 6 and phase 7 can grow the catalogue freely: the suite computes its markers from the catalogue files and filters them against the application's own sources, so it stays valid as the catalogue grows.
- The build gate of phase 11 has its teeth: three real builds, non-vacuous markers, and a frozen icon baseline that a stray catalogue key would break.
- One thing the next phase should know: the English-only build emits a near-empty `_virtual_locale-empty_fr-*.js` stub. That is expected — the contract is about bytes, not about file names — and it is what the empty-module mechanism costs.
- The planning state files (`STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md`) were left untouched, following the convention of plans 05-01 and 05-02, which committed their summary alone. The phase-level bookkeeping (marking I18N-08 and phase 5 done) is left to the orchestrator.

## Self-Check: PASSED

- `test/build-locales.test.mjs`, `vite.config.js`, `package.json` and this summary exist on disk.
- The three task commits `11feafe`, `190f89d` and `6d8063d` are in the history.
- The measured commit count (`git rev-list --count 9984241..HEAD`) is 3, matching `actuals.commits`.
- `npm test` 98/98, `npm run lint` clean, `npm run format:check` clean, `npm run e2e` 6/6.

---
*Phase: 05-i18n-foundation-catalogue-contract*
*Completed: 2026-10-22*
