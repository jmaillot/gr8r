---
phase: 06-english-extraction-locale-aware-formats
plan: 09
subsystem: i18n
tags: [i18n, catalogue, extraction, pages, settings, onboarding, tdd]

# Dependency graph
requires:
  - phase: 05-i18n-foundation-catalogue-contract
    provides: the t() leaf layer — non-escaping lookup, {name}/{n} interpolation, the catalogue lint
  - phase: 06-05
    provides: the shrinking allow-list device (test/fixtures/i18n-pending.json) and the static scanner (scripts/i18n-scan.mjs)
  - phase: 06-13
    provides: the green scan baseline (975 literals, 874 allow-list entries), the SHORTCUTS key-table renderer, the reuse-don't-duplicate discipline
provides:
  - The three heaviest page modules carry no user-visible literal — src/pages/auth.js (sign-in, sign-up, join, password, verify, the six-step onboarding wizard), src/pages/design-system.js (the token gallery, the component gallery, the system states) and src/pages/settings.js (all eighteen sections) read the catalogue; the scan reports none of them (551 findings swept)
  - The machine identifiers are untouched: the onboarding step keys (data-k/data-v, the stored team-size values), the theme keys (light/dark/system), the token CSS variables (--bg…--red), the state keys, the tab keys, the 87 data-a/data-v sites of the three files
  - The demo values stay data: the Tanjim Islam signup placeholder, the example e-mail placeholders, 'Homepage wireframes', 'alex@', 'hello@projectsstudio.com', '14:30'
  - The settings rows keep their computed date and time previews — formatDate(SAMPLE_DATE)/formatTime(SAMPLE_TIME) render them, never the catalogue; the stored time-zone labels and language names stay byte-identical (STORED_VALUES)
  - 482 new catalogue values (719 → 1201 keys) under page.auth.* / page.design.* / page.states.* / settings.* / a11y.auth.* / a11y.design.* / a11y.settings.* / common.*
  - Scanner machine rules extended: ruleAttribute honors VALUE_EXCLUSIONS (a stored or demo value is data wherever it appears) and the stored plan tier ids (Free/Team/Business) join STORED_VALUES
  - Allow-list 874 → 381 entries, sorted by file::text in code-unit order (the order the prefs suite has always asserted); scan 975 → 424 literals, 0 violations
affects: [06-10, 06-14, phase-7 french translation (I18N-07), phase-8 locale switch, phase-11 build gate]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 70400    # 281428 chars / 4 over the realized diff (8 files, 4 commits)
  tasks: 3
  commits: 4

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Key-table-over-machine-ids: quoted-key lookup tables (SIZES, VIEWS, THEME_NAMES, ACCENT_TIPS, DENSITY_LABELS, the plan-feature arrays) hold catalogue KEYS beside their machine ids — the stored value stays byte-identical and the display calls t() at access time"
    - "Object-ident-key tables dodge the array-element display rule: the plan tiers iterate Object.keys(PLANS) with unquoted ident keys, so the stored name never appears as a quoted display-shaped literal"
    - "Split literal for interleaved markup: a heading with a bolded interpolation ('We sent a reset link to <b>…</b>. It expires in 30 minutes.') becomes two catalogue values around the untouched markup, keeping the DOM byte-identical"
    - "ruleAttribute now honors VALUE_EXCLUSIONS — the scanner's own header rule ('excluded wherever they appear') extended to display attributes"

key-files:
  created:
    - test/i18n-pages.test.mjs
  modified:
    - src/pages/auth.js
    - src/pages/design-system.js
    - src/pages/settings.js
    - src/locales/en.json
    - test/fixtures/i18n-pending.json
    - scripts/i18n-scan.mjs
    - test/i18n-core-features.test.mjs

key-decisions:
  - "The settings nav namespace is settings.*-scoped per the committed oracle (settings.nav.workspace, settings.nav.password, settings.nav.email) even where common.* values exist — the settings nav is its own surface and the RED test is the contract"
  - "The plan tier ids stay stored-and-verbatim: Free/Team/Business join STORED_VALUES and the card names render the stored id, because the plan name is data the document stores (the same rule as the tz labels and the language names); only the feature lists are interface text"
  - "The settings shortcuts renderer's raw ${n} became ${t(n)} — a latent 06-13 bug: SHORTCUTS holds catalogue keys and the settings page was rendering them raw; the 06-13 assertion was satisfied by the nav's own ${t(n)} elsewhere in the file"
  - "The allow-list sort is the code-unit order of file::text (plain Array.sort) — the order test/i18n-prefs.test.mjs has asserted since 06-03; the pages suite's localeCompare assertion was aligned to it"
  - "The team-size values ('Just me', '2-10'…) are translated at render via a quoted-key SIZES table while data-v keeps storing them verbatim — Object.keys() iterates the same order the literal array had"

requirements-completed: []  # I18N-01 stays Pending until phase close (orchestrator instruction)

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "The three heaviest page modules carry no user-visible literal: the scan reports none of auth.js, design-system.js or settings.js, and every extracted value renders byte-identically"
    requirement: I18N-01
    verification:
      - kind: unit
        ref: "test/i18n-pages.test.mjs#the scanner reports no finding for src/pages/auth.js / for src/pages/design-system.js / for src/pages/settings.js"
        status: pass
      - kind: unit
        ref: "test/i18n-pages.test.mjs#the English oracle — the authentication page (172 pins) / the design-system page (132 pins) / the settings page (157 pins)"
        status: pass
      - kind: other
        ref: "node scripts/i18n-scan.mjs → 424 literals, 424 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch"
        status: pass
    human_judgment: false
  - id: D2
    description: "The machine identifiers are untouched: the onboarding step keys and stored team-size values, the theme keys, the token CSS variables, the state keys, the 36/21/30 data-a sites of the three files, the stored time-zone and language values, and the demo values the pages pre-fill their forms with"
    requirement: I18N-01
    verification:
      - kind: unit
        ref: "test/i18n-pages.test.mjs#the auth page data-a and data-v sites are byte-identical / the onboarding step keys are untouched"
        status: pass
      - kind: unit
        ref: "test/i18n-pages.test.mjs#the design-system token names, state keys, theme keys and demo values are untouched / the settings stored preference values are byte-identical"
        status: pass
    human_judgment: false
  - id: D3
    description: "The settings rows keep their computed date and time previews from the formatters; the allow-list lost every entry of the three page files (874 → 381) and stays sorted; the catalogue wave pin moved 719 → 1201"
    requirement: I18N-01
    verification:
      - kind: unit
        ref: "test/i18n-pages.test.mjs#the date-format and time-format rows keep their computed previews / the allow-list lost every entry of the three page files and stays sorted"
        status: pass
      - kind: unit
        ref: "test/i18n-core-features.test.mjs#the catalogue grew to the wave boundary — 1201 keys, none under the reserved namespace"
        status: pass
      - kind: e2e
        ref: "npm run build && npm run e2e — 6/6 Chromium (the English interface renders as it did)"
        status: pass
    human_judgment: false

# Metrics
duration: 95min
completed: 2026-10-22
status: complete
---

# Phase 6 Plan 9: The Three Heaviest Page Modules Summary

**auth.js, design-system.js and settings.js swept into the catalogue — 551 findings extracted across 482 new keys (719 → 1201), allow-list 874 → 381, scan 0 violations, all gates green**

## Performance

- **Duration:** 95 min
- **Started:** 2026-10-22T16:20:00Z
- **Completed:** 2026-10-22T17:54:17Z
- **Tasks:** 3
- **Files modified:** 7 (+1 created)

## Accomplishments
- The authentication page — sign-in, sign-up, join, forgot/reset/verify, no-workspace and the six-step onboarding wizard — reads `page.auth.*` / `a11y.auth.*`; the `Create account &amp; join` entity became a plain `&` in the catalogue and renders unchanged
- The design-system gallery and the system-states page read `page.design.*` / `page.states.*` / `a11y.design.*`; the token names, state keys and theme keys stay machine, and the two prototype routes keep their documented D11 behaviour (English-only in a French interface)
- The settings page's eighteen sections read `settings.*` / `a11y.settings.*`; the date/time previews stay computed by the formatters, the stored tz labels and language names stay byte-identical, and the stored plan tier ids stay the values the document holds
- The scanner grew two machine rules (ruleAttribute honors VALUE_EXCLUSIONS; the plan tier ids in STORED_VALUES), and the allow-list shrank 874 → 381 in the code-unit order
- The whole suite is green: 327/327 node tests (13 new), lint and format:check clean, build ✓, 6/6 Chromium

## Task Commits

Each task was committed atomically (TDD: the RED oracle landed first):

1. **Task 0 (RED):** the page contract — the oracle, the absence and the machine identifiers - `f5a15fd` (test, RED)
2. **Task 1: the authentication page** - `902a206` (feat)
3. **Task 2: the design-system page** - `e942cc1` (feat)
4. **Task 3: the settings page, and the wave's proof** - `1f262ea` (feat)

## Files Created/Modified
- `src/pages/auth.js` — every auth screen and the wizard read the catalogue; the step keys, the stored sizes and the demo values untouched
- `src/pages/design-system.js` — the token/component/state galleries read the catalogue; the token variables and demo values untouched
- `src/pages/settings.js` — all eighteen sections read the catalogue; the stored preference values and computed previews untouched; the shortcuts renderer's raw-key bug fixed
- `src/locales/en.json` — +482 keys (719 → 1201)
- `test/fixtures/i18n-pending.json` — 874 → 381 entries, code-unit sorted
- `scripts/i18n-scan.mjs` — ruleAttribute honors VALUE_EXCLUSIONS; Free/Team/Business in STORED_VALUES
- `test/i18n-pages.test.mjs` (created) — the three-task oracle (461 pins), the absence family, the machine-identifier family
- `test/i18n-core-features.test.mjs` — the catalogue wave pin 719 → 1201

## Decisions Made
- The settings nav keys are `settings.nav.*`-scoped (not `common.*` reuse) per the committed RED oracle — the settings nav is its own translatable surface
- Plan tier names are stored data rendered verbatim (STORED_VALUES), like the tz labels; only the plan feature lists are interface text
- The allow-list sort is code-unit `file::text` order — the order the prefs suite has asserted since 06-03; my suite's localeCompare assertion was aligned to it

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The signup placeholder 'Tanjim Islam' had no machine rule**
- **Found during:** Task 1 (the authentication page)
- **Issue:** ruleAttribute ignored VALUE_EXCLUSIONS, so the stored default member name in a placeholder attribute was an unextractable finding
- **Fix:** ruleAttribute now checks VALUE_EXCLUSIONS — the scanner's own header rule ("excluded wherever they appear") extended to display attributes
- **Files modified:** scripts/i18n-scan.mjs
- **Verification:** scan green; the sweep of the other waves unaffected (no stale entries)
- **Committed in:** 902a206

**2. [Rule 1 - Bug] The settings shortcuts page rendered catalogue keys raw**
- **Found during:** Task 3 (the settings page)
- **Issue:** `<span>${n}</span>` printed keys like `palette.commandMenu` to the user; SHORTCUTS holds keys since 06-13 and the modal calls `t(n)`, but the settings renderer never did (06-13's assertion was satisfied by the nav's `${t(n)}`)
- **Fix:** `<span>${t(n)}</span>`
- **Files modified:** src/pages/settings.js
- **Verification:** scan green, the 06-13 assertion still passes, e2e green
- **Committed in:** 1f262ea

**3. [Rule 3 - Blocking] The stored plan tier ids are unextractable findings**
- **Found during:** Task 3 (the settings page)
- **Issue:** 'Free'/'Team'/'Business' appear as stored values (d.plan fallbacks, card names) the scanner reports; translating them would break the document contract (D-08 family)
- **Fix:** added the three ids to STORED_VALUES (the 06-13 stored-recur-values precedent); the card names render the stored id verbatim while the feature lists read the catalogue
- **Files modified:** scripts/i18n-scan.mjs
- **Verification:** scan green (no stale entries anywhere)
- **Committed in:** 1f262ea

**4. [Rule 1 - Test] The two suites asserted different allow-list sort orders**
- **Found during:** Task 3 (the wave's proof)
- **Issue:** my new pages suite asserted localeCompare order while test/i18n-prefs.test.mjs has always asserted code-unit order of `file::text`
- **Fix:** the pages suite aligned to the code-unit order; the fixture re-sorted accordingly
- **Files modified:** test/i18n-pages.test.mjs, test/fixtures/i18n-pending.json
- **Verification:** both suites green
- **Committed in:** 1f262ea

---

**Total deviations:** 4 auto-fixed (2 blocking, 2 bugs)
**Impact on plan:** All four were required to make the scan and the suite green without weakening any contract. No scope creep.

## Issues Encountered
- The scanner's callVars reads only `key: value` object literals, so the shorthand `{ v, u, m }` failed the placeholder-parity check on `settings.plan.of` — fixed by spelling the keys explicitly (`{ v: v, u: u, m: m }`)
- The wave-boundary catalogue pin (719 keys) in test/i18n-core-features.test.mjs moved to 1201 as part of this wave's proof, the same per-wave pattern 06-12 and 06-13 followed

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The thirteen remaining page modules are plan 06-14's surface; the six view modules and the entry are plan 06-10's
- The scan sits at 424 literals / 381 allow-list entries with 0 violations — the meter is honest for the next waves
- The two prototype design-system routes are documented D11 English-only surfaces for phase 7

---
*Phase: 06-english-extraction-locale-aware-formats*
*Completed: 2026-10-22*
