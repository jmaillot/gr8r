---
phase: 05-i18n-foundation-catalogue-contract
verified: 2026-10-25T12:00:00Z
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
covered_digest: "v2:sha256:dc09b97f749b3b40df1d970c61d128e5d8ae84b904fb7a0c030ed83b3b7f2e16"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 5/5
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 5: i18n foundation & catalogue contract — Verification Report

**Phase Goal:** The `t()` layer, the catalogue format, the escaping contract, the plural engine and
the build layout — fixed before a single string moves… A leaf module `src/core/i18n.js` (locale
singleton, `t()`, `getLocale()`/`setLocale()`, plural selection, cached `Intl` wrappers, the locale
registry) over `src/locales/{en,fr}.json`, with the catalogue contract (plain-text values, `t()`
never escapes, CLDR plurals, JSON catalogue importable by plain Node, French as its own chunk)
pinned by tests.
**Verified:** 2026-10-25T12:00:00Z
**Status:** passed
**Re-verification:** Yes — stale-covered-digest re-run (#4682). The previous report's `covered_digest` no longer matched the tree: post-phase commits (phases 07, 09, 12 and the 21725f1 format pass) edited `src/core/i18n.js` (124 → 523 lines) and grew both catalogues (9/6 seed keys → 1538 keys each, including the six keys added today). This report regenerates all must-have verdicts against the CURRENT tree; the prior verdicts that still hold were re-evidenced, not carried on trust.

## What changed since the last verification — and what was re-derived

| Change | Source | Re-verification action taken |
| --- | --- | --- |
| `src/core/i18n.js` grew 124 → 523 lines (the `Intl` formatter surface, `negotiate()`, `primeLocale()`, the locale storage API — phase 06/07/08 work, all layered *on top of* the contract surface) | `21725f1`, `2ea5438`, `fcabcfe`, … | The contract surface was re-read line by line (`t()`, fallback, plural engine, glob exclusion, leaf imports, raw pass-through) and re-probed live |
| Both catalogues grew to **1538 keys each**, strictly parallel | `12-*`, `2a75275` | Key counts, en/fr parity, forbidden-character scan over **all 3076 values**, and a live lookup of the six keys added today |
| 6 new keys today: `toast.dirUp`, `toast.dirDown`, `act.deleteProjectTaskCount`, `act.removeAccess.losesAccess`, `act.removeAccess.unassigns`, `page.files.browse` | today's close-out commits | All six verified present in BOTH locales, all plain text, the plural value CLDR-shaped; the catalogue lint (in `test/catalogue.test.mjs`, 26/26 green) covered them by running over the actual files — no allow-list, no exemption |
| `.planning/REQUIREMENTS.md` now shows **I18N-06 and I18N-08 checked / Complete** | orchestrator close-out | The prior report's advisory #3 (bookkeeping pending) is resolved; re-confirmed |

## Verification stance

Nothing was trusted from SUMMARYs or from the prior report. Independent evidence gathered this run:

| Probe | Command | Result |
| --- | --- | --- |
| Catalogue contract suite | `node --test test/catalogue.test.mjs` | **26 pass / 0 fail** (grew from 23: the suite now embeds its own lint mutations — "✔ the lint rejects a value carrying a left/right angle bracket" ran green inside the suite) |
| Layer contract suite | `node --test test/i18n.test.mjs` | **16 pass / 0 fail** |
| Build contract suite (3 real `vite build` runs) | `node --test test/build-locales.test.mjs` standalone | **9 pass / 0 fail** (11.4 s — three real builds executed and byte-asserted) |
| Whole node suite, canonical invocation | `npm test` (`node --test --test-concurrency=2`) | 432–443 pass; failures analysed below — **none in phase 5's contract suites under standalone runs** |
| Bare-Node importability (D-13) | `node -e "import('./src/locales/fr.json',{with:{type:'json'}})"` (Node v24.21.0) | OK — **1538 keys** |
| Layer module import in bare Node | `import('./src/core/i18n.js')` | 27 exports resolved; `t('nav.projects')` → `'Projects'` |
| Live plural/CLDR probe (bare Node) | `setLocale('fr')` then `t('act.deleteProjectTaskCount',{n:0}/{n:1000000})` | fr **0 → one** member, **1000000 → many→other** — the French `Intl.PluralRules` selection drove the member choice even with the fr catalogue absent in Node (documented bare-Node behaviour), then `en` fallback supplied the value — the fallback path and the CLDR engine exercised in one probe |
| Live fallback probe | under an active `fr` locale, `t('nav.projects')` | `'Projects'` (English fallback, never empty) |
| Raw pass-through (D-09) | code read + committed test | `interpolate()` (`i18n.js:142-147`) substitutes `{name}` only; `t()` returns at `i18n.js:182` with **no escaper on the path**; `escHtml` (`i18n.js:138-140`) is exported but never called by `t()` |
| Forbidden-character scan (I18N-06) | script over **all 1538 values of both locales**, strings and plural members | **0 violations** — including today's 6 new keys (`fr dirUp = "vers le haut"`, `fr losesAccess = "{name} perdra immédiatement l'accès à {ws}."` — plain text with `{}` placeholders only) |
| Key parity | en vs fr key sets | **1538 = 1538**, strict subset rule holds |
| Leaf contract | read of `i18n.js` import list | the ONLY import is `../locales/en.json with { type: 'json' }` (`i18n.js:6`); the `import.meta.glob` (`i18n.js:24`) still excludes `en.json` and is caught under Node (`i18n.js:23-27`) |
| Zero runtime dependency | `grep '"dependencies"' package.json` → absent; tests committed | holds |
| Wiring of the layer | `src/main.js:7` `import './core/i18n.js';` + `:63` (render-side import of `t`, `LOCALES`, `negotiate`, …) | wired |

### Suite-run analysis (honesty clause)

Under `npm test` (445 tests), failures appeared that do **not** touch phase 5's contract, and their
pattern was investigated rather than waved away:

- `test/build-locales.test.mjs`, `test/i18n-vocab.test.mjs`, `test/activity-verbs.test.mjs`
  **fail under concurrency but pass standalone** (build-locales 9/9 in 11.4 s; i18n-vocab 15/15;
  activity-verbs 10/10). The concurrent mode runs two files while each `build-locales` run spawns
  three `vite build` processes; the observed failures ("the LOCALES=fr build failed", server-port
  file-level failure) are resource interference between parallel builds/servers, not contract
  regressions — the same binaries pass when not overlapped.
- **`test/i18n-scan.test.mjs` fails standalone (21/25)** — a real, reproducible failure: `node
  scripts/i18n-scan.mjs` exits 1 on `src/views/table.js:87  ruleProse  "A literal that was never
  extracted"`. **Provenance:** `git diff` shows this literal is an **uncommitted working-tree
  addition** (`+export const probe = 'A literal that was never extracted';`) — not committed by any
  phase. It reads as a scanner mutation-probe left in the working tree. The scanner is a
  **phase 6** gate (`scripts/i18n-scan.mjs` and `test/i18n-scan.test.mjs` are declared in
  `06-01-PLAN.md`), not a phase 5 must-have. Moreover, the scanner detecting it is *evidence the
  gate works*. Phase 5 explicitly required that NO string move and NO `t()` call site be added —
  this probe literal violates the phase 6 extraction contract, not the phase 5 foundation. The
  working-tree literal should be removed (it corrupts every phase's CI signal while it sits
  there), but it does not block *this* phase's goal.

## Goal Achievement

### Roadmap success criteria (the contract) — re-verified on the current tree

| # | Criterion | Status | Evidence (current tree) |
| --- | --- | --- | --- |
| 1 | A catalogue lookup returns the English base string, and a key with no value in the active catalogue falls back to English instead of rendering empty text | **✓ VERIFIED** | `t()` (`i18n.js:175-185`): active catalogue → `catalogues.get(BASE_LOCALE)` → return the key, never empty. Exercised live: under an active `fr` locale (bare Node, fr catalogue absent by design) `t('nav.projects')` → `'Projects'`. The `projects:locale` fallback test still runs green in `test/i18n.test.mjs` (16/16). |
| 2 | The test suite rejects any catalogue value containing `<`, `>` or `"`, so no catalogue value can inject markup | **✓ VERIFIED** | `test/catalogue.test.mjs` 26/26 on the **1538-key** catalogues; the suite now embeds the rejection mutations (left/right angle bracket tests green in-run); independent scan over all 3076 values (strings + plural members, both locales, incl. the 6 new keys): **0 violations**. The lint lints every file in `src/locales/`, so today's keys were covered the moment they landed — no exemption existed to soften. |
| 3 | A count is selected by the locale's CLDR categories — 0 → `one` in French and `other` in English, 1 000 000 → `many` in French — never by a hand-written `n > 1` rule | **✓ VERIFIED** | `resolvePlural()` + cached `Intl.PluralRules` (`i18n.js:149-173`) unchanged and re-probed live: fr 0 → `one`, fr 1000000 → `many` (→ `other` member when the value lacks `many`); en 1000000 → `other`. The new `act.deleteProjectTaskCount` is a CLDR-keyed object with an `other` member in both locales (`{"one":"{n} tâche","other":"{n} tâches"}` in fr). No `n > 1` rule exists in the layer. The committed plural tests (`test/i18n-plural.test.mjs`, plus `i18n.test.mjs`'s table) run green. |
| 4 | The build emits the French catalogue as its own chunk, and a build configured for English only contains none of the French catalogue's bytes | **✓ VERIFIED** | `test/build-locales.test.mjs` **9/9 standalone** — three real `vite build` runs into a temp dir (default, `LOCALES=en`, `LOCALES=fr`), byte-asserted, with the markers computed from the **current** catalogue files (the suite's design: "survives the catalogue growing in phase 6 and phase 7" — it survived the growth to 1538). `vite.config.js` `localeSubset()` + `BUILD_LOCALES` unchanged in contract (`en` always shipped; non-base locales outside the set emptied). `build:en` still in `package.json` (`LOCALES=en vite build`). |
| 5 | The catalogue is importable by plain Node and by the browser build, and no catalogue key added an icon to the bundle | **✓ VERIFIED** | Bare Node v24.21.0 imports `fr.json` (1538 keys) with the `json` attribute; the layer itself imports in bare Node (27 exports). Browser-build coverage: the build suite's importability + entry-anchored assertions pass (the markers come from the built `index.html`'s own script tag). Icon baseline: `test/fixtures/icons-baseline.json` unchanged since freeze; the icon assertions inside `build-locales.test.mjs` (source scan == baseline; bundle scan == baseline) pass in the standalone 9/9 run; the scan reads `/\.js$/` only, so 1538×2 JSON keys can structurally never contribute a token. |

**Score: 5/5 roadmap success criteria.**

### Plan must-have truths (union of the three plans' frontmatter) — re-verified

| # | Truth (abridged) | Plan | Status (current tree) |
| --- | --- | --- | --- |
| 1 | `t('nav.projects')` returns the English base string, never empty | 05-01 | ✓ VERIFIED (live probe + `i18n.test.mjs`) |
| 2 | `t()` returns the value raw — `<b>` comes back as `<b>` | 05-01 | ✓ VERIFIED (no escaper on the `t()` path; `escHtml` never called by `t()`; committed raw-`<b>` test green) |
| 3 | Missing key in active catalogue falls back to English | 05-01 | ✓ VERIFIED (live under active `fr`) |
| 4 | A key only in the active catalogue resolves from it | 05-01 | ✓ VERIFIED (`contract.frenchOnly` test green; `x.only` probe) |
| 5 | Plural chosen by `Intl.PluralRules`, never `n > 1`: fr 0→one, 1000000→many | 05-01 | ✓ VERIFIED (live probe; cached per locale, `i18n.js:154-161`) |
| 6 | `setLocale('fr')` switches the singleton and announces `projects:locale` | 05-01 | ✓ VERIFIED (`i18n.js:74-80`; dispatch after catalogue ready, bubbling — commit 3a62a35 refined the listener side without touching the contract) |
| 7 | `src/core/i18n.js` imports nothing but the JSON catalogues (leaf) | 05-01 | ✓ VERIFIED (single import: `en.json`; glob guarded; even at 523 lines the layer still imports nothing from the app) |
| 8 | Layer in the entry's module graph; default build inlines en, emits fr as its own chunk | 05-01 | ✓ VERIFIED (`src/main.js:7`; build suite 9/9) |
| 9 | Suite rejects any value with `<`, `>` or `"` | 05-02 | ✓ VERIFIED (26/26; embedded mutation tests green) |
| 10 | Keys flat/dotted/namespaced; plural values CLDR objects with `other` | 05-02 | ✓ VERIFIED (suite green over today's `act.deleteProjectTaskCount` object too) |
| 11 | French strict subset of English (less `contract.`), same placeholders on shared keys | 05-02 | ✓ VERIFIED (1538 = 1538 parity; suite green) |
| 12 | `src/locales/` holds JSON only | 05-02 | ✓ VERIFIED (directory listing: `en.json`, `fr.json` only; guard test green) |
| 13 | Registry and catalogue files agree both ways | 05-02 | ✓ VERIFIED (`LOCALES` frozen array unchanged: `en`,`fr`; test green) |
| 14 | No runtime dependency | 05-02 | ✓ VERIFIED (no `dependencies` key) |
| 15 | Lint rejects an ICU argument but passes legitimate plain text | 05-02 | ✓ VERIFIED (the new French values — `l'accès`, ellipses, `{name}`/`{ws}` placeholders — pass; suite green) |
| 16 | Default build emits fr chunk ≠ entry chunk | 05-03 | ✓ VERIFIED (build suite standalone 9/9) |
| 17 | English-only build contains none of fr's bytes | 05-03 | ✓ VERIFIED (build suite, markers computed from the current 1538-key files) |
| 18 | English catalogue inlined in the entry chunk in every build | 05-03 | ✓ VERIFIED (`i18n.js:36` top-level `registerCatalogue` survives; base-locale-ships test green) |
| 19 | No catalogue key added an icon: bundle icons == frozen pre-phase baseline | 05-03 | ✓ VERIFIED (baseline fixture unchanged; assertion pair green in the standalone build run; JSON files structurally invisible to the `/\.js$/` scan) |
| 20 | Build ships with no runtime dependency | 05-03 | ✓ VERIFIED |

**Score: 20/20 plan truths.**

### Layer growth is additive, not contract-breaching

The 124 → 523-line growth added: cached `Intl` formatters (`formatDate`/`formatRelativeTime`/
`formatFileSize`/`formatTime`/…), `negotiate()`, `primeLocale()`, locale persistence
(`LOCALE_STORAGE_KEY`, `storeLocale`/`readStoredLocale`), `has()`/`tErr()`, and the shared
escaping table (`escHtml` re-exported by `core/utils.js` per IN-02). None of this touches the
phase 5 contract invariants: the import list is still the catalogue alone; `t()` still never
escapes; the fallback order is unchanged; the plural engine is unchanged; the glob still excludes
`en.json`. The phase-5 truth that "no `t()` call site is added in phase 5" describes phase 5's
diff, which history shows was honoured (`main.js` only gained the import line in that phase); the
call sites that exist today were added by phases 6-8, each with its own gates.

### Locked decisions D-01…D-15 spot-conformance (current tree)

| Decision | Verdict | Evidence |
| --- | --- | --- |
| D-01 leaf module + locale singleton | ✓ | single import; `let locale` (`i18n.js:16`) |
| D-02 `projects:locale` on document, no renderer import | ✓ | `i18n.js:76-78`, plus D-02's `document.documentElement.lang` follow (`i18n.js:63`) |
| D-04 JSON only under `src/locales/` | ✓ | two files, both `.json` |
| D-06 CLDR object plurals via `Intl.PluralRules` | ✓ | `i18n.js:152-173`; live-probed |
| D-08 English fallback, never empty | ✓ | `i18n.js:176-184`; live-probed under active `fr` |
| D-09 `t()` never escapes | ✓ | no escaper on the path; `escHtml` export is for call sites |
| D-12 static en, dynamic others, never both | ✓ | `i18n.js:6` static; `i18n.js:24` glob excludes `en.json` |
| D-13 bare-Node importability | ✓ | re-run on Node v24.21.0, 1538 keys |
| D-14 / D-15 no runtime dependency; registry in `i18n.js` | ✓ | no `dependencies` key; frozen `LOCALES` export |

## Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/core/i18n.js` | the leaf layer | ✓ VERIFIED | 523 lines (contract surface + the phases 6-8 formatter surface); all phase-5 exports present; substantive; wired by `src/main.js:7` |
| `src/locales/en.json` / `src/locales/fr.json` | the base seed / French catalogue | ✓ VERIFIED | 1538 flat dotted keys each, strict parity; the six keys added today present in both; plain text throughout |
| `src/main.js` | the entry imports the layer | ✓ VERIFIED | `import './core/i18n.js'` at line 7 |
| `scripts/icons.mjs` | the shared Lucide scan | ✓ VERIFIED | still the one implementation shared by plugin and tests |
| `test/fixtures/icons-baseline.json` | the frozen pre-phase icon list | ✓ VERIFIED | unchanged since freeze; both sides of the comparison still pass |
| `test/i18n.test.mjs` | the layer contract suite | ✓ VERIFIED | 16/16 |
| `test/catalogue.test.mjs` | the catalogue contract suite | ✓ VERIFIED | 26/26 (now self-mutating, non-vacuous by construction) |
| `test/build-locales.test.mjs` | the build contract suite | ✓ VERIFIED | 9/9 standalone (three real vite builds) |
| `vite.config.js` | `localeSubset()` + shared `lucideSubset()` | ✓ VERIFIED | contract unchanged; base locale always shipped (judged correct in the prior report — unchanged) |
| `package.json` | `build:en`, no runtime deps | ✓ VERIFIED | `"build:en": "LOCALES=en vite build"` (line 13, now preceded by a phase-6 `prebuild:en` scan hook — additive), no `dependencies` key |

## Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/main.js` | `src/core/i18n.js` | side-effect import | ✓ WIRED | `main.js:7`; render modules also import named symbols (`main.js:63`) |
| `src/core/i18n.js` | `src/locales/en.json` | static JSON import + top-level `registerCatalogue` | ✓ WIRED | `i18n.js:6`, `i18n.js:36` — bare-Node import of the module resolves and serves English values |
| `src/core/i18n.js` | `src/locales/*.json` (non-base) | `import.meta.glob` in try/catch, excluding `en.json` | ✓ WIRED | `i18n.js:22-27`; Node path degrades to the documented empty-loader state |
| `src/core/i18n.js` | `Intl.PluralRules` | cached per locale | ✓ WIRED | `i18n.js:152-161`; live-probed |
| `src/core/i18n.js` | `document` | `projects:locale` CustomEvent | ✓ WIRED | `i18n.js:76-78` |
| `test/catalogue.test.mjs` | `src/locales/*.json` | fs + bare-Node JSON import | ✓ WIRED | lint runs on the real 1538-key files today |
| `test/catalogue.test.mjs` | `src/core/i18n.js` | `LOCALES`/`BASE_LOCALE` import | ✓ WIRED | registry agreement test green |
| `test/catalogue.test.mjs` | `package.json` | manifest read | ✓ WIRED | zero-dependency guard green |
| `vite.config.js` | `process.env.LOCALES` / `scripts/icons.mjs` / baseline fixture | build set + shared scan | ✓ WIRED | exercised by the 9/9 build suite |
| `test/build-locales.test.mjs` | the built `index.html` | entry-chunk anchor | ✓ WIRED | part of the standalone green run |

## Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Produces real data | Status |
| --- | --- | --- | --- | --- |
| `src/core/i18n.js` | `catalogues` | the real JSON files on disk (1538 keys each) | ✓ | ✓ FLOWING |
| `src/core/i18n.js` | `locale` | `setLocale`/`primeLocale` singleton | ✓ | ✓ FLOWING |
| `test/*` inputs | catalogue files, built assets, fixture | real fs reads and 3 real vite builds | ✓ | ✓ FLOWING |

No static return, hardcoded literal or mock terminates a contract chain.

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Catalogue contract over today's 1538-key catalogues | `node --test test/catalogue.test.mjs` | 26/26 | ✓ PASS |
| Layer contract | `node --test test/i18n.test.mjs` | 16/16 | ✓ PASS |
| Build contract (3 real builds) | `node --test test/build-locales.test.mjs` | 9/9 (11.4 s) | ✓ PASS |
| Bare-Node catalogue import | `node -e "import('./src/locales/fr.json',{with:{type:'json'}})"` | 1538 keys | ✓ PASS |
| Live fallback + CLDR + new keys | bare-Node `setLocale('fr')` + `t()` probes | fallback `Projects`; fr 0→one member, 1M→many; new keys resolve both locales (fr values served in the browser path; en values correct in the bare-Node path by design) | ✓ PASS |
| Whole suite, canonical command | `npm test` | 432–443/445 (see the run analysis above); no phase-5 contract failure outside the concurrency/build-interference pattern; the `i18n-scan` standalone failure is an uncommitted probe literal in `src/views/table.js` (phase-6 gate, not phase 5) | ⚠️ NOTED — see analysis |

## Probe Execution

No `scripts/*/tests/probe-*.sh` probes exist or are declared. The equivalent executable checks are
the three `node:test` suites, executed above. The repository-level scanner (`scripts/i18n-scan.mjs`)
was also run directly (exit 1 — see the working-tree probe literal analysis).

## Requirements Coverage

| Requirement | Source plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| **I18N-06** | 05-01, 05-02 | A catalogue value can never inject markup — plain-text values, a test rejects `<`, `>`, `"` | ✓ SATISFIED | Catalogue lint 26/26 over the 1538-key files (including today's 6 keys); independent full value scan: 0 violations; `t()` returns raw by code path; interpolations escaped at call sites (`esc()`/`escHtml`). |
| **I18N-08** | 05-03 | The French catalogue is built as its own chunk; an English-only build carries no French string | ✓ SATISFIED | `localeSubset()` + `build:en` unchanged; build suite 9/9 standalone with markers derived from the current files. |
| I18N-01…05, I18N-07, LOC-*, SEARCH-01 | — | — | n/a | Mapped to later phases; no orphaned Phase-5 requirement — REQUIREMENTS.md now marks I18N-06 and I18N-08 Complete (prior advisory #3 resolved). |

## Prohibitions

| Prohibition | Verdict | Evidence (current tree) |
| --- | --- | --- |
| No runtime dependency added | ✓ HELD | no `dependencies` key in `package.json`; the layer's only import is the catalogue JSON |
| No `.js` under `src/locales/` | ✓ HELD | directory holds `en.json`/`fr.json` only; guard test green |
| `t()` never escapes | ✓ HELD | no escaper on the `t()` path |
| No `data-*`/action key translated | ✓ HELD | machine identifiers never pass through `t()`; view-module key gates assert it |
| No same file imported statically and dynamically | ✓ HELD | glob excludes `en.json` |
| Default build keeps shipping every locale | ✓ HELD | default locale set still `en,fr`; only `build:en` narrows (its own script) |
| The same lint rule never softened/allow-listed to pass | ✓ HELD | the lint passed over 3076 values with zero exemptions — including `l'accès`, ellipses, and 6 brand-new keys |

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `src/views/table.js` | 87 | uncommitted probe literal (`export const probe = 'A literal that was never extracted'`) trips the phase-6 `i18n-scan` gate (scanner exit 1, 4 test failures) | ⚠️ Warning — **out of phase-5 scope** (phase 6 gate; uncommitted working-tree change, not made by any phase) | Does not break any phase-5 must-have; the scanner catching it is evidence the gate works. Remedy: delete the two working-tree lines (or land them intentionally through phase tooling). |
| — | — | no debt markers (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`), no empty implementations, no console-log-only code in `i18n.js`, the catalogues, `main.js` | — | — |

## Advisory (New Scope, Unevidenced)

| # | Finding | Category | Why Advisory |
| --- | --- | --- | --- |
| 1 | `test/build-locales.test.mjs`, `test/i18n-vocab.test.mjs` and `test/activity-verbs.test.mjs` fail when run concurrently with the rest of the suite but pass standalone (parallel `vite build`/server interference). The suite's CI invocations that overlap these files will read false reds. | other | Not a phase-5 must-have (each file passes in isolation; the interference pattern was reproduced and characterised). Worth a suite-serialization or resource-cap fix owned by whichever phase owns the test harness. |
| 2 | The `availableLocales()` static-glob caveat from the prior report stands (an English-only build still lists `fr`); unchanged, still a phase 8 (LOC-02) concern. | architectural | Carried forward; unchanged by this re-verification. |

## Human Verification Required

**None.** Every criterion, must-have truth and prohibition is machine-checkable and was checked by
an executable probe on the current tree. The phase's build/behaviour claims are covered by
committed suites that perform the real builds; no visual or interaction behaviour belongs to this
phase (no rendered string changed in phase 5 itself).

## Gaps Summary

**No gaps.** The stale-covered-digest cause (post-phase commits growing the layer to 523 lines and
the catalogues to 1538 keys, including the six keys added today) was re-verified item by item and
every phase-5 must-have still holds on the current tree: the contract surface of `i18n.js` is
byte-level intact in its invariants (leaf import, raw `t()`, English fallback, cached CLDR
plurals, glob exclusion, `projects:locale`), the catalogue contract passes over the full 3076 values
with zero violations and zero exemptions, the build contract passes on three real vite builds, the
catalogues remain bare-Node importable (1538 keys), and no runtime dependency exists. Both
roadmap requirements (I18N-06, I18N-08) are satisfied and now marked Complete in
`.planning/REQUIREMENTS.md`.

The only red observed anywhere belongs to other phases' gates: the phase-6 scanner is correctly
rejecting an uncommitted probe literal in `src/views/table.js` (delete those two working-tree
lines to restore the suite's green), and three test files race each other under full-suite
concurrency though each passes standalone.

---

_Verified: 2026-10-25T12:00:00Z_
_Verifier: the agent (gsd-verifier)_
