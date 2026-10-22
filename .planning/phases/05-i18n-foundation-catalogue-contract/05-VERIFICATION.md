---
phase: 05-i18n-foundation-catalogue-contract
verified: 2026-10-22T10:56:24Z
status: passed
score: 5/5 roadmap success criteria verified (20/20 plan must-have truths)
covered_files:
  - .planning/phases/05-i18n-foundation-catalogue-contract/05-01-PLAN.md
  - .planning/phases/05-i18n-foundation-catalogue-contract/05-01-SUMMARY.md
  - .planning/phases/05-i18n-foundation-catalogue-contract/05-02-PLAN.md
  - .planning/phases/05-i18n-foundation-catalogue-contract/05-02-SUMMARY.md
  - .planning/phases/05-i18n-foundation-catalogue-contract/05-03-PLAN.md
  - .planning/phases/05-i18n-foundation-catalogue-contract/05-03-SUMMARY.md
  - .planning/phases/05-i18n-foundation-catalogue-contract/05-CONTEXT.md
  - package.json
  - scripts/icons.mjs
  - src/core/i18n.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/main.js
  - test/build-locales.test.mjs
  - test/catalogue.test.mjs
  - test/fixtures/icons-baseline.json
  - test/i18n.test.mjs
  - vite.config.js
covered_digest: "v2:sha256:216cb159c23167152a6bd59f8ee5494cbdb8f4bebba05d1e260e957472753a36"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 5: i18n foundation & catalogue contract — Verification Report

**Phase Goal:** The `t()` layer, the catalogue format, the escaping contract, the plural engine and
the build layout — fixed before a single string moves… A leaf module `src/core/i18n.js` (locale
singleton, `t()`, `getLocale()`/`setLocale()`, plural selection, cached `Intl` wrappers, the locale
registry) over `src/locales/{en,fr}.json`. No runtime dependency is added.
**Verified:** 2026-10-22T10:56:24Z
**Status:** passed
**Re-verification:** No — initial verification (no prior `*-VERIFICATION.md` in the phase directory)

## Verification stance

Every claim below was checked against the working tree, not against the summaries. The three
SUMMARY files were read only to locate the claims to falsify; two of the three things the
executors flagged were re-derived independently (the base-locale build change and the icon
baseline), and two deliberate mutations were performed and reverted (a `<`/`>` value and a `"`
value injected into `src/locales/fr.json`).

Independent evidence gathered:

| Probe | Command | Result |
| --- | --- | --- |
| Whole node suite | `npm test` | 98 pass / 0 fail (66 pre-existing + 16 + 23 + 9 new) |
| Browser suite | `npm run e2e` | 6/6 Chromium (Playwright) pass |
| Lint / format | `npm run lint`, `npm run format:check` | clean |
| Real builds | `LOCALES=en,fr|en|fr node node_modules/vite/bin/vite.js build --outDir …` | 3 builds, bytes inspected directly |
| Icon baseline provenance | pre-phase scan (verbatim from `d1cc552:vite.config.js`) run over `git archive d1cc552 src` vs `test/fixtures/icons-baseline.json` vs the current tree | 174 = 174 = 174, byte-identical lists, zero names added |
| Bare-Node import | `node -e "import('./src/locales/fr.json',{with:{type:'json'}})"` (Node v24.21.0) | 6 keys, OK |
| Mutation 1 | `"nav.projects": "Projets <b>bold</b>"` injected into `src/locales/fr.json` | `test/catalogue.test.mjs` → **✖ the seed catalogues pass every rule** — "the value carries a left angle bracket" + "right angle bracket" → reverted, `git status` clean, file byte-identical |
| Mutation 2 | `"nav.projects": "The \"Projets\" panel"` injected into `src/locales/fr.json` | `test/catalogue.test.mjs` → **✖ the seed catalogues pass every rule** — "the value carries a double quote" → reverted, `git status` clean, file byte-identical |

## Goal Achievement

### Roadmap success criteria (the contract)

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | A catalogue lookup returns the English base string, and a key with no value in the active catalogue falls back to English instead of rendering empty text | **✓ VERIFIED** | `src/core/i18n.js:114-123` — `t()` reads the active catalogue, then `catalogues.get(BASE_LOCALE)`, then returns the key (never empty). `test/i18n.test.mjs:12-15` asserts `t('nav.projects') === en['nav.projects']`; the `gr8r:locale` test asserts `t('contract.englishOnly') === 'English only'` **while the active locale is `fr`** — a real state transition exercised by a passing test, not a presence check. |
| 2 | The test suite rejects any catalogue value containing `<`, `>` or `"`, so no catalogue value can inject markup | **✓ VERIFIED** | `test/catalogue.test.mjs` — `FORBIDDEN` (`<`, `>`, `"`), `lintValue()` tests the **raw** value with `value.includes(char)`, and `lintAll()` lints **every** file in `src/locales` (not just the seeds). Proven non-vacuous by mutation: injecting `<`/`>` and then `"` each turned the committed test red with the named character (table above), and the file was restored byte-identical. The committed rule is the raw-character rule, **not** the plan's malformed `JSON.stringify` command — the plan's version is disclosed in `05-02-SUMMARY.md` as a defect of the *command*, and the committed test does the right thing. |
| 3 | A count is selected by the locale's CLDR categories — 0 → `one` in French and `other` in English, 1 000 000 → `many` in French — never by a hand-written `n > 1` rule | **✓ VERIFIED** | `src/core/i18n.js:91-112` — `new Intl.PluralRules(code)` cached per locale (`:91-100`), `.select(count)` yields the category (`:108`); no `n > 1` anywhere. `src/locales/fr.json` carries a `many` member (`"{n} de tâches"`) that English does not have, so a hand-written rule could not produce the French 1 000 000 result. `test/i18n.test.mjs` — English `0 → '0 tasks'` (`other`), `1 → '1 task'`, `2 → '2 tasks'`, `1000000 → '1000000 tasks'`; French `0 → '0 tâche'` (`one`), `1 → one`, `2 → other`, `1000000 → '1000000 de tâches'` (`many`). |
| 4 | The build emits the French catalogue as its own chunk, and a build configured for English only contains none of the French catalogue's bytes | **✓ VERIFIED** | Independent builds. Default (`LOCALES=en,fr`): `assets/fr-Cx13KH9B.js` (301 B) contains **exactly** the six French keys as `export{e as default}`, and the entry chunk `index-BR2xhuQM.js` carries **0 of the 9** French strings (raw and `\uXXXX`-escaped). English-only (`LOCALES=en`): the French module resolves to a 33-byte stub `const t={};export{t as default}` (`_virtual_locale-empty_fr-*.js`); a byte-level scan of **all 9** French strings, raw and escaped, across **every** asset found **zero** occurrences. The French chunk is not inlined in the entry chunk in either the default or the `fr` build. |
| 5 | The catalogue is importable by plain Node and by the browser build, and no catalogue key added an icon to the bundle | **✓ VERIFIED** | **Plain Node:** Node v24.21.0 imports both catalogues with the `json` import attribute; the whole suite is *loaded* by bare Node with `import … with { type: 'json' }`, so a non-importable catalogue would stop the suite from loading. **Browser build:** all 11 English strings verified present in the entry chunk of the English-only build (read from the built `index.html`'s own script tag, not by guesswork). **Icons:** I re-ran the **pre-phase** scan algorithm (verbatim from `d1cc552:vite.config.js`) over the **pre-phase** source tree (`git archive d1cc552 src`) → 174 names, identical to the committed `test/fixtures/icons-baseline.json`; the current tree → the same 174; added names: **none**. The baseline is a genuine pre-phase baseline, not a snapshot taken after `src/core/i18n.js` existed. D-04 is also structural: the scan reads only `.js` files, so a JSON catalogue can never contribute a token. |

**Score: 5/5 roadmap success criteria.**

### Plan must-have truths (the union of the three plans' frontmatter)

| # | Truth (abridged) | Plan | Status |
| --- | --- | --- | --- |
| 1 | `t('nav.projects')` returns the English base string from `en.json`, never empty | 05-01 | ✓ VERIFIED |
| 2 | `t()` returns the value raw — an interpolated `<b>` comes back as `<b>` | 05-01 | ✓ VERIFIED (`i18n.js:121`, `i18n.js:83-86` — no escaper on the path) |
| 3 | A key with no value in the active catalogue falls back to English | 05-01 | ✓ VERIFIED |
| 4 | A key that exists only in the active catalogue resolves from it | 05-01 | ✓ VERIFIED (`contract.frenchOnly` → `Français seulement`) |
| 5 | The count is chosen by `Intl.PluralRules`, never by `n > 1` | 05-01 | ✓ VERIFIED |
| 6 | `setLocale('fr')` switches the singleton and announces `gr8r:locale` | 05-01 | ✓ VERIFIED (`i18n.js:47-67`; the dispatch is after the catalogue is ready) |
| 7 | `src/core/i18n.js` imports nothing but the JSON catalogues (leaf) | 05-01 | ✓ VERIFIED (the file's only specifier is `../locales/en.json`; `import.meta.glob` is inlined by Vite and throws in Node, caught at `i18n.js:23-27`) |
| 8 | The layer is in the entry's module graph; the default build inlines English and emits French as its own chunk | 05-01 | ✓ VERIFIED (independent build) |
| 9 | The suite rejects a catalogue value containing `<`, `>` or `"` | 05-02 | ✓ VERIFIED (mutation-proven) |
| 10 | Every key is flat, dotted, namespaced; every plural value is a CLDR-keyed object with an `other` member | 05-02 | ✓ VERIFIED (`KEY_SHAPE`, `CLDR_CATEGORIES`, `plural-other` rules) |
| 11 | French is a strict subset of English (apart from the `contract.` namespace) and shared keys carry the same placeholders | 05-02 | ✓ VERIFIED (`lintAgainstBase`) |
| 12 | `src/locales/` holds JSON files only | 05-02 | ✓ VERIFIED (guard test + directory listing) |
| 13 | The registry and the catalogue files agree, in both directions | 05-02 | ✓ VERIFIED |
| 14 | The project still ships with no runtime dependency | 05-02 | ✓ VERIFIED |
| 15 | The lint rejects an ICU argument but never a legitimate plain-text value (`"Select…"` passes) | 05-02 | ✓ VERIFIED (`ICU_ARGUMENT` matches the argument form only) |
| 16 | The default build emits the French catalogue as its own chunk, different from the entry chunk | 05-03 | ✓ VERIFIED |
| 17 | An English-only build contains none of the French catalogue's bytes | 05-03 | ✓ VERIFIED (byte-level scan) |
| 18 | The English catalogue is inlined in the entry chunk in **every** build | 05-03 | ✓ VERIFIED (also checked for the `LOCALES=fr` build) |
| 19 | No catalogue key added an icon: the bundle's icon entries are exactly the frozen pre-phase baseline | 05-03 | ✓ VERIFIED (pre-phase scan re-run) |
| 20 | The build still ships with no runtime dependency | 05-03 | ✓ VERIFIED |

**Score: 20/20 plan truths.**

### The two flagged items, judged

**1. The base locale now ships in every build (`vite.config.js:9-15`).** The current behaviour is
`BUILD_LOCALES = new Set([BASE_LOCALE, ...process.env.LOCALES.split(',')])`, so `en` is never
emptied by the `localeSubset()` plugin. **Judged: correct, and required by the contract.**
- D-08 makes English the fallback catalogue; a build without the English catalogue would make
  `t()` return raw keys for every untranslated string — the exact failure the phase exists to
  prevent.
- It does **not** weaken criterion 4: only *non-base* locales outside the build set are emptied.
  The English-only build still carries **zero** French bytes (byte-level scan above), and the
  default build still emits French as its own chunk.
- It is a narrowing of the plugin's blast radius, not a widening. The plan's own must-have
  ("the English catalogue is inlined in the entry chunk in every build") is the authority the
  executor cited, and it is stated verbatim in `05-03-PLAN.md` must_haves.
- The deviation is disclosed in `05-03-SUMMARY.md` ("Total deviations: 1 auto-fixed (1 missing
  critical functionality)") and is backed by a dedicated test
  (`the base catalogue ships in every build, so the interface is never without a language`).
  **Not a gap.**

**2. The malformed plan verify command for the markup lint.** The plan filtered with
`JSON.stringify(v).includes('"')`, which matches the *serialization* of every value and could only
ever fail. The **committed** contract is the raw-character rule: `value.includes(char)` over the
three forbidden characters, applied member-by-member to plural objects and file-by-file to every
catalogue on disk. Proven by mutation (see the probe table): both `<`/`>` and `"` turn the
committed test red. The defect was in the plan's *command*, not in the shipped contract.
**Not a gap.**

### Locked decisions (D-01…D-15) — conformance

| Decision | Conformance | Evidence |
| --- | --- | --- |
| D-01 leaf module `src/core/i18n.js` with a module-level locale singleton | ✓ | `i18n.js:8-19` — `BASE_LOCALE`, frozen `LOCALES`, `let locale`, `catalogues` Map; the layer imports nothing from the app |
| D-02 `gr8r:locale` CustomEvent, no renderer import | ✓ | `i18n.js:63-65` — dispatch on the global `document`, guarded by `typeof document !== 'undefined'` |
| D-03 own one-line `escHtml` | ✓ | `i18n.js:77-79` — same table as `esc()` in `src/core/utils.js:10`; asserted equal by a test |
| D-04 catalogues are JSON, never `.js` under `src/` | ✓ | `src/locales/{en,fr}.json`; guard test asserts the directory holds JSON only; the icon scan reads `/\.js$/` only |
| D-05 flat, dotted, namespaced keys | ✓ | `KEY_SHAPE` regex enforced by the lint on every file |
| D-06 plural = object keyed by CLDR category, selected by `Intl.PluralRules` | ✓ | `i18n.js:105-112`; `many` present only in French |
| D-07 interpolation subset — no `select`, no `offset`, no `#` | ✓ (documented spelling deviation) | The lint rejects any ICU argument (`{… , plural|select|selectordinal|offset}`); the concrete count spelling is `{n}`, not the literal `{count, plural, …}` of D-07. Deviation recorded in `05-01-PLAN.md` and justified there by D-06's CLDR-object shape. **Judged: honours the substance of D-07** (no ICU construct is interpreted) and is the only spelling consistent with D-06. ℹ️ INFO, not a gap. |
| D-08 fallback to English | ✓ | `i18n.js:117-120`; exercised under an active `fr` locale by a passing test |
| D-09 `t()` never escapes | ✓ | `i18n.js:121` returns the interpolated string untouched; a test asserts `<b>` comes back raw |
| D-10 catalogue values are plain text, made inert by a test; interpolation escaped at the call site | ✓ | The lint (mutation-proven) + `esc()`/`escHtml()` remain at the call sites |
| D-11 `data-*` attributes and action keys never translated | ✓ | No call site of `t()` exists in `src/` at all — no machine identifier can be translated in this phase |
| D-12 English static, others via `import.meta.glob`, never both | ✓ | `i18n.js:6` (static `en.json`), `i18n.js:24` — the glob **excludes** `en.json` (`'!../locales/en.json'`) |
| D-13 the catalogue stays importable by bare Node 24 | ✓ | Verified on Node v24.21.0; the whole suite loads under bare Node with the JSON import attribute |
| D-14 no runtime dependency | ✓ | `package.json` has **no** `dependencies` key; `package-lock.json` unchanged since `d1cc552`; `src/` imports only relative JSON; guarded by a committed test |
| D-15 the locale registry lives in `src/core/i18n.js` | ✓ | `i18n.js:8-12` — `LOCALES` exported and frozen; the registry/file agreement test compares it with the files on disk |

## Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/i18n.js` | the leaf layer: `t()`, `getLocale()`, `setLocale()`, `registerCatalogue()`, `availableLocales()`, `LOCALES`, `BASE_LOCALE`, `escHtml()` | ✓ VERIFIED | 124 lines; all 8 exports present; substantive; wired by `src/main.js:7` |
| `src/locales/en.json` | the English base seed | ✓ VERIFIED | 9 flat dotted keys, 2 CLDR plural objects |
| `src/locales/fr.json` | the French placeholder seed | ✓ VERIFIED | 6 flat dotted keys, `many` on `task.count`, `contract.frenchOnly` |
| `src/main.js` | the entry imports the layer | ✓ VERIFIED | one added line (`+import './core/i18n.js';`) — the **only** change to any pre-existing source file |
| `scripts/icons.mjs` | the shared Lucide scan | ✓ VERIFIED | `lucideIconNames()` / `lucideIconMarkup()`; imported by both `vite.config.js` and the test suite; lives outside `src/` so it cannot scan itself |
| `test/fixtures/icons-baseline.json` | the frozen pre-phase icon list | ✓ VERIFIED | 174 names; independently re-derived from the pre-phase tree |
| `test/i18n.test.mjs` | the layer contract suite | ✓ VERIFIED | 16 named tests |
| `test/catalogue.test.mjs` | the catalogue contract suite | ✓ VERIFIED | 23 named tests |
| `test/build-locales.test.mjs` | the build contract suite | ✓ VERIFIED | 9 named tests, three real `vite build` runs into a temp dir |
| `vite.config.js` | `localeSubset()` + the shared `lucideSubset()` | ✓ VERIFIED | `vite.config.js:37-60` (plugin), `:44-52` (the shared scan) |
| `package.json` | the `build:en` script | ✓ VERIFIED | one added line; `dependencies` block absent |

## Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/main.js` | `src/core/i18n.js` | side-effect import | ✓ WIRED | `src/main.js:7` — puts the layer in the entry's module graph so Vite rewrites `import.meta.glob` |
| `src/core/i18n.js` | `src/locales/en.json` | static import with `{ type: 'json' }` + top-level `registerCatalogue` | ✓ WIRED | `i18n.js:6`, `i18n.js:36` — the top-level call is what survives tree-shaking; the English strings are in the entry chunk of all three builds |
| `src/core/i18n.js` | `src/locales/*.json` | `import.meta.glob` in a `try/catch` | ✓ WIRED | `i18n.js:22-27` — Vite rewrites it to one chunk per locale; bare Node catches the ReferenceError and still loads the module |
| `src/core/i18n.js` | `Intl.PluralRules` | one cached rule instance per locale | ✓ WIRED | `i18n.js:91-100` |
| `src/core/i18n.js` | `document` | `gr8r:locale` CustomEvent | ✓ WIRED | `i18n.js:63-65` — no renderer import, acyclic graph preserved |
| `test/catalogue.test.mjs` | `src/locales/*.json` | `fs` read + bare-Node JSON import | ✓ WIRED | the lint runs on the real files; the import proves Node-importability in the same suite |
| `test/catalogue.test.mjs` | `src/core/i18n.js` | `LOCALES` / `BASE_LOCALE` import | ✓ WIRED | registry-vs-files agreement test |
| `test/catalogue.test.mjs` | `package.json` | manifest read | ✓ WIRED | the zero-runtime-dependency guard |
| `vite.config.js` | `process.env.LOCALES` | `BUILD_LOCALES` | ✓ WIRED | default `en,fr`; `build:en` sets `LOCALES=en` |
| `vite.config.js` | `scripts/icons.mjs` | the shared scan | ✓ WIRED | one implementation, so the plugin and the test cannot diverge |
| `test/build-locales.test.mjs` | `test/fixtures/icons-baseline.json` | the frozen list | ✓ WIRED | both sides of the icon comparison are compared name for name |
| `test/build-locales.test.mjs` | the built `index.html` | the page's own script tag names the entry chunk | ✓ WIRED | every structural claim has an observable anchor |

## Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Produces real data | Status |
| --- | --- | --- | --- | --- |
| `src/core/i18n.js` | `catalogues` | the JSON catalogue files (real files on disk) | ✓ | ✓ FLOWING — not a literal, not a mock; `en.json`/`fr.json` are read by the bundler and by bare Node |
| `src/core/i18n.js` | `locale` | `setLocale()` (module singleton) | ✓ | ✓ FLOWING — driven by the registry, defaulting to the base locale |
| `test/catalogue.test.mjs` | the lint's input | `fs.readdirSync` + `JSON.parse` over `src/locales` | ✓ | ✓ FLOWING — every file on disk is linted, so a new catalogue is covered the day it lands |
| `test/build-locales.test.mjs` | the markers | computed from the catalogue files, filtered against `src/**/*.js` | ✓ | ✓ FLOWING — and asserted **non-empty** on both sides, so an empty marker set would fail rather than pass vacuously |
| `test/build-locales.test.mjs` | the built assets | three real `vite build` runs | ✓ | ✓ FLOWING — real bytes, asserted on, not on a source tree |
| `test/fixtures/icons-baseline.json` | the icon list | the pre-phase scan | ✓ | ✓ FLOWING — independently re-derived from `git archive d1cc552 src` |

No static return, hardcoded literal or mock terminates a chain.

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| The whole node suite | `npm test` | 98 pass / 0 fail | ✓ PASS |
| The shipped browser bundle | `npm run e2e` | 6/6 Chromium pass | ✓ PASS |
| The French catalogue is a chunk of its own | `LOCALES=en,fr … vite build` | `assets/fr-Cx13KH9B.js` = the 6 French keys; the entry chunk holds 0 of the 9 French strings | ✓ PASS |
| The English-only build carries no French byte | `LOCALES=en … vite build` + a 9-string raw/escaped scan over every asset | 0 occurrences | ✓ PASS |
| The base catalogue ships in every build | `LOCALES=fr … vite build` | the entry chunk carries all 11 English strings | ✓ PASS |
| The catalogues load in bare Node | `node -e "import('./src/locales/fr.json',{with:{type:'json'}})"` (Node v24.21.0) | 6 keys | ✓ PASS |
| No icon was added | the pre-phase scan over the pre-phase tree vs the baseline vs the current tree | 174 = 174 = 174, 0 added | ✓ PASS |
| A value carrying `<`/`>` is rejected | mutation on `src/locales/fr.json` | the committed test goes red naming the character | ✓ PASS (and reverted) |
| A value carrying `"` is rejected | mutation on `src/locales/fr.json` | the committed test goes red naming the character | ✓ PASS (and reverted) |
| The interface renders as before | `git diff d1cc552 -- src/` + the suites | the only change to a pre-existing source file is one import line; 98 + 6 tests green | ✓ PASS |

## Probe Execution

No `scripts/*/tests/probe-*.sh` probe exists in this repository, and no plan declares one. The
phase's equivalent executable checks are the three `node:test` suites, all executed above.

## Requirements Coverage

| Requirement | Source plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| **I18N-06** | 05-01 (layer), 05-02 (lint) | A catalogue value can never inject markup — catalogue values are plain text, and a test rejects any value containing `<`, `>` or a double quote | ✓ SATISFIED | The raw-character rule is committed at `test/catalogue.test.mjs` (`FORBIDDEN` + `lintValue` + `lintAll` over every file in `src/locales`). Proven by two mutations, each turning the committed test red and naming the file, the key and the character. `t()` never escapes (D-09/D-10), so the value reaches the DOM as inert plain text; interpolated values are escaped at the call site with the existing `esc()`. |
| **I18N-08** | 05-03 (build) | The French catalogue is built as its own chunk, so an English-only build carries no French string | ✓ SATISFIED | `vite.config.js:37-60` (`localeSubset()`) + `package.json` `build:en`. Verified on the real artifacts: the default build emits `fr-Cx13KH9B.js` holding exactly the French catalogue, and the `LOCALES=en` build carries **zero** of the 9 French strings (raw and `\uXXXX`-escaped) across every asset — only a 33-byte empty-module stub remains. |
| I18N-01…05, I18N-07, LOC-*, SEARCH-01 | — | — | n/a | Mapped to phases 6, 7 and 8 in `.planning/REQUIREMENTS.md`; out of this phase's scope. No orphaned requirement: I18N-06 and I18N-08 are the only two mapped to Phase 5, and both are claimed by the plans. |

## Prohibitions — the two promises judged concretely

| Prohibition | Verdict | Evidence |
| --- | --- | --- |
| **No runtime dependency is added** | ✓ HELD | `package.json` has **no** `dependencies` key at all (only 7 devDependencies, all pre-existing build tools); `git diff d1cc552 -- package-lock.json` is **empty** — no lockfile churn, so no package was installed; the only new import in `src/` is `../locales/en.json`; the catalogue is plain JSON, so nothing was pulled from npm. Guarded by a committed test (`the project declares no runtime dependency`). |
| **The interface renders exactly as before** | ✓ HELD | `git diff d1cc552 -- src/` touches **one** pre-existing file with **one** added line: `import './core/i18n.js';` (`src/main.js:7`). No user-visible string was moved, no call site of `t()` was added, and the imported module has no DOM side effect (it only registers the base catalogue and reads `Intl.PluralRules`). Evidence: 98/98 `node:test` (66 of them pre-existing, covering the real server and real SQLite) and 6/6 Chromium e2e, all green; `npm run lint` and `npm run format:check` clean. |
| No `.js` file under `src/locales/` | ✓ HELD | the directory holds only `en.json` and `fr.json`; a guard test asserts it; the icon scan reads `/\.js$/` only, so a JSON catalogue can never contribute a token. |
| `t()` never escapes | ✓ HELD | `i18n.js:121`; a test asserts an interpolated `<b>` comes back raw. |
| No `data-*` / action key translated | ✓ HELD | there is no call site of `t()` in `src/` at all in this phase. |
| The French catalogue is not inlined in the entry chunk | ✓ HELD | byte-level scan: 0 French strings in the entry chunk of the default and the `fr` build. |
| The same file is never imported both statically and dynamically | ✓ HELD | the glob excludes `en.json` (`i18n.js:24`). |
| The default build keeps shipping every locale | ✓ HELD | `npm run build` (no `LOCALES`) → `en,fr`; only the separate `build:en` script narrows the set. |

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| — | — | — | — | — |

Scanned every file the phase added or changed (`src/core/i18n.js`, `src/locales/*.json`,
`scripts/icons.mjs`, `vite.config.js`, `package.json`, `src/main.js`, the three suites, the
baseline fixture) for debt markers (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`), empty
implementations (`return null` / `return {}` / `return []`), hardcoded empty values, and
`console.log`-only implementations. **Nothing found.** The only matches were the constant name
`PLACEHOLDER` (the interpolation regex) and the literal text `\uXXXX` in a comment about escaped
markers — neither is a debt marker. No file carries a debt marker, so no 🔑 Blocker is raised on
that axis.

## Advisory (New Scope, Unevidenced)

| # | Finding | Category | Why Advisory |
| --- | --- | --- | --- |
| 1 | `availableLocales()` (`src/core/i18n.js:71-73`) reports a locale when `Object.hasOwn(loaders, '../locales/<code>.json')` — and the `import.meta.glob` map is **static**, so an **English-only build still lists `fr`** even though that build's French module resolves to an empty object. Selecting French there would silently render English. | architectural | Not covered by any of the five criteria (criterion 4 is explicitly *about bytes*, not about file names or about the registry), and the default build — the one the app ships — carries both catalogues. It is a **phase 8 (LOC-02)** concern: the locale selector must be derived from what the *build* actually ships, not from the static glob map. Recorded so phase 8 inherits it. |
| 2 | The D-07 count placeholder is spelled `{n}`, not the literal `{count, plural, …}` of the decision text. | other | Disclosed in `05-01-PLAN.md` and forced by D-06's CLDR-object shape; the substance of D-07 (no `select`, no `offset`, no `#`, no ICU interpretation) is honoured and the lint actively rejects any ICU argument. Documented, not a gap. |
| 3 | `.planning/REQUIREMENTS.md` still shows I18N-06 / I18N-08 as unchecked with the traceability row reading "Pending". | other | Bookkeeping the plans deliberately left to the orchestrator (see `05-03-SUMMARY.md`, "Next Phase Readiness"). Both requirements are in fact satisfied, as evidenced above; the orchestrator should tick them. |

## Human Verification Required

**None.** Every criterion, every must-have truth and both prohibitions are machine-checkable, and
each was checked by an executable probe (see the tables above). The phase changes no rendered
output, so there is no visual or interaction behaviour for a human to confirm.

## Gaps Summary

**No gaps.** The phase goal is achieved in the codebase, not merely in the summaries:

- The `t()` layer exists as a genuine leaf module (`src/core/i18n.js`, 124 lines, 8 exports, one
  import) over two real JSON catalogues, with the English fallback, the raw pass-through, the
  `Intl.PluralRules` plural engine and the `gr8r:locale` switch.
- The escaping, catalogue-format, plural, registry and dependency contracts are **enforced by
  tests**, and the enforcement was proven non-vacuous by mutation (a `<`, a `>` and a `"` each
  turn the committed suite red) and by an independent re-derivation of the frozen icon baseline
  from the pre-phase source tree.
- The build layout is proven **on the real artifact**: three real `vite build` runs, byte-level
  inspection of every emitted asset, and the French chunk demonstrably separate from the entry
  chunk.
- Both prohibitions hold on the evidence: no runtime dependency (no `dependencies` key, no
  lockfile churn, one relative JSON import) and the interface renders exactly as before (one
  added import line, 98 node tests and 6 Chromium tests green, lint and format clean).
- Both items the executors flagged were independently re-judged and both are **not** gaps: the
  base-locale-always-ships change is required by D-08 and does not weaken criterion 4, and the
  committed markup lint is the correct raw-character rule (the plan's malformed command was a
  defect of the command, never of the contract).

---

_Verified: 2026-10-22T10:56:24Z_
_Verifier: the agent (gsd-verifier)_
