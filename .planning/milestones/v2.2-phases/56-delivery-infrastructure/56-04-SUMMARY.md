---
phase: 56
plan: 04
subsystem: i18n-build
tags: [i18n, build, vite, registry, scan]
requires: [56-01 (build manifest/stamp), 56-03 (chunk gate harness)]
provides:
  - src/core/locale-names.js — shared frozen native-name map (browser + node)
  - scripts/locales.mjs — localeCodes(srcDir) / localeNames(), the shared scan
  - derived BUILD_LOCALES in vite.config.js (one JSON file = one shipped locale)
  - derived LOCALES registry in src/core/i18n.js (glob keys + BASE_LOCALE)
  - registerCatalogue registry growth (node parity)
  - test/locale-registry-fixture.test.mjs — D-08 end-to-end proof
affects: [scripts/i18n-scan.mjs, vite.config.js, all i18n test suites]
tech-stack:
  added: []
  patterns: [virtual-module plugin with enforce:'pre', registry-growth on registerCatalogue, fixture-locale lifecycle test]
key-files:
  created:
    - src/core/locale-names.js
    - scripts/locales.mjs
    - test/locale-registry-fixture.test.mjs
  modified:
    - src/core/i18n.js
    - vite.config.js
    - scripts/i18n-scan.mjs
    - test/i18n.test.mjs
    - test/i18n-dates.test.mjs
    - test/i18n-format.test.mjs
    - test/i18n-pages.test.mjs
    - test/i18n-scan.test.mjs
    - test/locale-negotiate.test.mjs
    - test/catalogue.test.mjs
decisions:
  - Registry derivation: entry {code:'en',name:'English'} + one entry per glob key; registerCatalogue(code,data) grows the registry so Node (tests, server.js) gains locales by registration exactly as the browser does via the glob
  - Browser name-map subset via localeNamesSubset() vite plugin (enforce:'pre') — full map stays for Node consumers; keeps entry under the DELIV-02 500 kB gate
  - Fixture display name lives in catalogue data; registry native name falls back to the raw code for unknown codes
metrics:
  duration: ~3.2h wall (multi-session)
  completed: 2026-11-12T12:27:20Z
status: complete
plan_head_before: de9366c1571b4b2a8151302c3924df335ed67f9f
plan_head_after: 77b16a5865adc0e7f64319284f2bd0bdd2330f7f
commits: 4
requirements-completed: [I18N-01]
actuals:
  tokens: 32600   # chars/4 over the realized diff (13 files, 326 insertions / 26 deletions)
  tasks: 3
  commits: 4
---

# Phase 56 Plan 04: Locale registry derivation + fixture-locale proof Summary

One-JSON-file-is-one-locale, proven end-to-end: the build's locale set, the i18n registry, the scan's name map and the fixture test all derive from the same source of truth (src/locales/ + the shared scan in scripts/locales.mjs).

## What Was Built

- **src/core/locale-names.js** — frozen LOCALE_NAME_MAP (15 locales), pure data, leaf-compatible.
- **scripts/locales.mjs** — `localeCodes(srcDir)` / `localeNames()` reading src/locales/; the single scan shared by build, registry and scan gate (D-07/D-09).
- **vite.config.js** — BUILD_LOCALES derived from `localeCodes()` (no more `'en,fr'` literal); `localeNamesSubset()` plugin inlines the shipped-locale subset of the name map into the entry (full map remains for Node).
- **src/core/i18n.js** — LOCALES registry derived at load time: `{code:'en',name:'English'}` entry plus one entry per glob key; `registerCatalogue(code, data)` grows the registry (frozen reassignment) so plain-Node consumers gain locales by registration, exactly like server.js does at boot.
- **scripts/i18n-scan.mjs** — LOCALE_NAMES derived from `Object.values(localeNames())` instead of a hand-listed array.
- **test/locale-registry-fixture.test.mjs** — five D-08 clauses on the build-locales harness shape: default build auto-ships an xx-*.js chunk from a lone fixture file; the bundle's locale glob matches the fixture and its name-map entry exists; plain-Node degrade path intact; build-locales suite still green; scan gate clean. Fixture lifecycle in try/finally with an after() absence assertion (Pitfall 6).

## Verification

- `node --test test/locale-registry-fixture.test.mjs` — 5/5 pass
- `npm test` — 1403 tests, 0 fail (was 1386 pre-plan; fixture test + registry-growth test added)
- `npm run lint` — exit 0
- `node scripts/i18n-scan.mjs` — 0 findings, exit 0
- Default build emits fr-*.js; entry chunk 499,981 B < 500,000 B DELIV-02 gate, no chunk-size warning; LOCALES=en opt-out emits no fr chunk (Task 1 verification)
- Plain-Node `availableLocales()` = `[{code:'en',name:'English'}]` with loaders={} — degrade path intact; registerCatalogue('fr', …) grows it to include fr
- EN catalogue inline invariant intact (catalogue tests green)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/2 — Node parity] registerCatalogue now grows the LOCALES registry**
- **Found during:** Task 2 (RED run of the registry-growth test)
- **Issue:** The planned derivation (`Object.keys(loaders) ∪ {BASE_LOCALE}`) yields an en-only registry in plain Node: `import.meta.glob` throws outside Vite, so `loaders = {}`. That broke ~9 test files calling `setLocale('fr')` and clamped server FR notification emails (server.js registers fr via `registerCatalogue` at boot).
- **Fix:** `registerCatalogue(code, data)` reassigns a fresh frozen registry including `{code, name: LOCALE_NAME_MAP[code] || code}`. Browser and Node gain locales through the same two mechanisms they already used (glob / registration).
- **Files modified:** src/core/i18n.js, plus Node test files now bootstrap their catalogues (test/i18n.test.mjs, test/i18n-dates.test.mjs, test/locale-negotiate.test.mjs, test/catalogue.test.mjs, test/i18n-pages.test.mjs)
- **Commit:** b2cc38d

**2. [Rule 3 — blocking] vite:resolve pre-empts plugin resolveId for relative imports**
- **Found during:** Task 2 (entry chunk still 186 B over the 500 kB gate with the subset plugin active)
- **Issue:** `localeNamesSubset()`'s resolveId never fired: Vite's own resolver handles relative imports before normal user plugins, so the full name map still reached the entry (500,204 B > gate).
- **Fix:** `enforce: 'pre'` on the plugin (mirrors how `localeSubset()` already works); entry dropped to 499,981 B, no warning.
- **Files modified:** vite.config.js
- **Commit:** b2cc38d

**3. [Rule 1 — stale contract tests] Leaf-contract / import-allowlist updates**
- **Found during:** Tasks 2–3 (npm test)
- **Issue:** Pre-existing "imports nothing but…" tests rejected the newly mandated pure-data imports: the i18n layer's `./locale-names.js` sibling and the scanner's `./locales.mjs`; plus test/i18n-pages.test.mjs's "no removed language label" scan needed to exclude the new src/core/locale-names.js file.
- **Fix:** Allowlists extended (leaf-compatible pure-data siblings); file exclusion added on the correct (file) branch of the scan check.
- **Files modified:** test/i18n.test.mjs, test/i18n-format.test.mjs, test/i18n-scan.test.mjs, test/i18n-pages.test.mjs
- **Commit:** b2cc38d

**4. [Rule 1 — wrong bundle assertion] Fixture clause 2 asserted a literal `code:"xx"`**
- **Found during:** Task 3 (RED)
- **Issue:** The derived registry is built at runtime from glob keys (`Object.keys(glob).map(code)`), so the minified bundle never contains `code:"xx"`. The assertion was wrong, not the implementation.
- **Fix:** Clause 2 now asserts the real bundle-level proof: the locale glob key `"../locales/xx.json"` reaching the entry plus the name-map `xx:"xx"` fallback entry. TAP RED evidence persisted and gate-checked (RED_EVIDENCE_OK) before the fix landed.
- **Files modified:** test/locale-registry-fixture.test.mjs
- **Commit:** 77b16a5

## TDD Gate Compliance

- Task 2: RED committed first (1cad92c, evidence RED_EVIDENCE_OK), then GREEN (b2cc38d).
- Task 3: clause-2 RED captured with full TAP output (evidence RED_EVIDENCE_OK at /tmp/opencode/tdd-red-56-04-task3.json); note the RED-state fix and GREEN assertion landed in the same commit 77b16a5 (the staged file carried the corrected assertion; history note in the commit message).

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary surfaces.

## Self-Check: PASSED

- Files exist: src/core/locale-names.js, scripts/locales.mjs, test/locale-registry-fixture.test.mjs — FOUND
- Commits: d830592, 1cad92c, b2cc38d, 77b16a5 — FOUND (git log de9366c..HEAD, count 4)
- src/locales/xx.json absent after fixture run — verified
