# Phase 6: English extraction & locale-aware formats - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase moves **every user-visible string out of the interface sources and into the English
catalogue**, and replaces the hand-rolled English date/number/plural machinery with `Intl`-backed,
per-locale cached formatters — as a **pure, behaviour-preserving refactor**. No string changes its
meaning, the English interface renders exactly as it did before, and the existing Chromium tests
stay green. The catalogue grows from its 9 seed keys to the full English set.

Alongside the sweep: the hand-rolled `MON`/`MONL`/`WD`/`WDL` arrays and the `fmtDate()`,
`relDate()`, `ago()`, `dayBucket()` and `fsize()` functions are replaced by locale-driven
formatters; the 16 measured English plural sites become catalogue plural objects; and
`dateFmt`/`timeFmt` gain an `'auto'` sentinel so an unset preference follows the locale while an
explicit user choice still wins.

The **one intentional behaviour change** is the search comparison: both sides are normalised so an
accented name is found from an unaccented query ("elodie" finds "Élodie"). The `Intl.Collator`
sort order is **not** changed here.

In scope: the interface sources under `src/` (the shell, pages, views, overlays, components,
actions, features and `src/ui/`), `src/core/utils.js`, `src/core/constants.js` display names,
`src/locales/en.json`, and the search comparison.

Out of scope: the French catalogue (phase 7), the per-user locale and the language selector
(phase 8), server error codes and the activity log (phase 9), the browser coverage (phase 10),
the build gate and the shipped-artifact proof (phase 11). The French catalogue is **not** touched
in this phase, and `fr.json` therefore stays at its 6 seed keys.

Requirements: **I18N-01**, **I18N-03**, **I18N-04**, **SEARCH-01**.

</domain>

<decisions>
## Implementation Decisions

The four research documents under `.planning/research/` and the phase-5 decision record already
answered the gray areas. The decisions below are the ones that bind the implementation; they are
recorded, not invented.

### The extraction

- **D-01:** The extraction is **mechanical and behaviour-preserving**. Every user-visible literal
  in the swept source files moves to the English catalogue, and the call site becomes
  `t('key')` returning exactly the literal it replaced. The existing Chromium tests stay green
  and no string changes its meaning, so any regression is unambiguously in the catalogue.
  — **Reversibility:** costly — undoing the sweep restores a literal at every extracted call site
  and drops the catalogue keys, so the cost is the whole 37-file diff; nothing is migrated, no
  stored data changes and no contract is broken, so it is always possible.
- **D-02:** **The English catalogue is the base** and the French one is **not touched in this
  phase** — that is phase 7. The catalogue contract was frozen in phase 5, so the lint must not be
  weakened to make the incomplete French catalogue look green. The parity lint reports a key a
  non-base catalogue carries that the base does not (`english-base`, `test/catalogue.test.mjs:128-136`)
  and a placeholder drift on a shared key (`:137-145`); the English catalogue may legitimately
  carry keys the French one does not, because a missing French value falls back to English.
  — **Reversibility:** costly — the lint's rules are pinned by the 23 phase-5 tests and by
  `05-VERIFICATION.md`; silencing a breach by relaxing a rule changes a verified contract, and
  every later French value inherits the weaker rule.
- **D-09:** The sweep is done **file by file**: each file's strings move to the catalogue and the
  call site becomes `t('key')`. The key taxonomy is **dotted and namespaced per surface** —
  `nav.*`, `page.*`, `modal.*`, `act.*`, `toast.*`, `err.*`, `a11y.*`, `settings.*` — and it extends
  the taxonomy the phase-5 seed already uses (`app.*`, `common.*`, `greeting.*`, `task.*`,
  `file.*`), plus the reserved `contract.*` namespace the catalogue lint exempts from the
  English-base rule (`test/catalogue.test.mjs:42-45`).
  — **Reversibility:** reversible — the taxonomy is a naming convention inside a JSON file; a
  rename is a one-line change in the catalogue plus the same change at each call site, and the
  phase-5 lint enforces only the *shape* (`^[a-z][a-z0-9]*(\.[a-z][a-zA-Z0-9]*)+$`,
  `test/catalogue.test.mjs:29`), never the specific names.
- **D-10:** The **build keeps the catalogue out of the icon bundle**. The catalogue stays JSON —
  `lucideSubset()` walks only `/\.js$/` files (`scripts/icons.mjs:20-24`, `vite.config.js:22-35`)
  — every key is dotted (the icon scan matches quoted lowercase kebab-case tokens, so a dotted
  token can never match), and the **frozen icon baseline of 174 names**
  (`test/fixtures/icons-baseline.json`, asserted by `test/build-locales.test.mjs:206`) must not
  change.
  — **Reversibility:** reversible — the catalogue format is a file extension and one Vite plugin
  rule; the tripwires (`test/catalogue.test.mjs:353-361` and the 174-name baseline fixture) fail
  loudly the moment the format or the token set drifts.

### The formatters

- **D-03:** The formatters are **`Intl`-backed and per-locale cached**: `Intl.DateTimeFormat`,
  `Intl.NumberFormat`, `Intl.RelativeTimeFormat`, `Intl.PluralRules`. The hand-rolled
  `MON`/`MONL`/`WD`/`WDL` arrays (`src/core/utils.js:40-43`) and the `fmtDate()` (`:49-57`),
  `relDate()` (`:58-66`), `ago()` (`:67-76`), `dayBucket()` (`:78-84`) and `fsize()`
  (`src/ui/helpers.js:95-99`) functions are replaced — **61 call sites and 9 array references**,
  measured. `Intl.DisplayNames` and `Intl.ListFormat` sit **above** the browser floor (Safari
  14.1 against Vite 6's `modules` target of safari14) and need a fallback.
  — **Reversibility:** costly — undoing it restores the four arrays and the five functions and
  re-proves the English output byte for byte at 70 sites; the cached-formatter cache itself is
  local, but the English output guarantee is the expensive part.
- **D-04:** **`dateFmt`/`timeFmt` gain an `'auto'` sentinel.** Unset means "follow the locale"
  (French → `JJ/MM/AAAA` and a 24-hour clock); an explicit user choice still wins. `weekStart`
  already defaults to Monday (`src/core/store.js:13`), which is already correct for France, so
  only its labels change. **`tz` stays a display-only value** — it stores `'(GMT-07:00) Pacific
  Time'` (`src/core/store.js:16`), which `Intl` rejects with a `RangeError` (measured on Node
  24.21.0: `Invalid time zone specified: (GMT-07:00) Pacific Time`) — the browser's resolved zone
  is used for formatting and the IANA migration is deferred.
  — **Reversibility:** costly — `dateFmt` and `lang` live in the **shared** workspace document
  (`docSnapshot()`, `src/core/store.js:95`; `applyDoc()`, `:173`), so `'auto'` is a persisted
  value, not just a default: an existing document already stores `dateFmt: 'MMM d'`, which reads
  as an explicit choice and would keep an English date pattern in a French interface. Migrating
  `tz` to IANA identifiers would need a label→IANA mapping plus a rewrite of the stored
  preference in every workspace document — a data migration that must respect the
  "second boot is a byte-identical no-op" guarantee (`test/migration.test.mjs:164-183`).
  - **Resolution — the stored default IS the sentinel.** The document cannot distinguish "never
    touched" from "explicitly picked the default", and `'MMM d'` **is** the default
    (`src/core/store.js:13`). So `'MMM d'` is treated as `'auto'` — it means "follow the
    locale" — while `'d/M'`, `'M/d'` and `'yyyy-MM-dd'` stay explicit choices that always win.
    No document is rewritten, no revision moves, and the shared document is not written at all:
    the phase stays behaviour-preserving where it claims to be. A user who explicitly picked
    `'MMM d'` sees the locale format instead — an acceptable trade for a preference the
    document cannot distinguish from the default, and the only one available without a data
    migration. `timeFmt` is genuinely unset today (absent from `DEFAULT_PREFS`, read only at
    `src/pages/settings.js:219,224`), so it needs no sentinel mapping at all.

### Grammar and search

- **D-05:** The **plural sites** become catalogue plural objects. The codebase encodes the
  English rule in `n > 1 ? 's' : ''`; **16 such sites are measured** (below). The French rule
  differs — `Intl.PluralRules('fr').select(0) === 'one'` (French says "0 fichier" where English
  says "0 files") and `select(1000000) === 'many'` — which is why the rule must come from
  `Intl.PluralRules` and **never from the source**. The phase-5 `t()` already implements this:
  the category comes from a per-locale cached `Intl.PluralRules` (`src/core/i18n.js:91-112`), the
  count placeholder is spelled `{n}`, and a selected member falls back to `other`.
  — **Reversibility:** costly — the 16 call sites change shape and every plural value in the
  catalogue is rewritten; the plural *shape* itself (an object keyed by CLDR category) is the
  phase-5 contract and stays.
- **D-06:** **Search normalisation**: both sides are normalised with
  `normalize('NFD').replace(/[\u0300-\u036f]/g, '')` before the substring comparison, so "elodie"
  finds "Élodie". This is the **one intentional behaviour change of the phase**. The
  `Intl.Collator` sort order is **not** changed here — it is deferred, because it changes an
  order the existing tests assume.
  — **Reversibility:** costly — undoing the normalisation restores the plain
  `toLowerCase().includes` comparison at the search sites, but the deferred `Intl.Collator` work
  is the expensive half: introducing it later changes the sort order under the existing
  Chromium assertions and the e2e selectors must then be re-pinned.

### The contracts that must not move

- **D-07:** **Escaping stays with the call site.** `t()` never escapes; the interpolated values
  are escaped with the existing `esc()` at the point of interpolation. A catalogue value can
  never inject markup, and the phase-5 lint keeps it that way (no `<`, no `>`, no `"` in any
  value or plural member, `test/catalogue.test.mjs:19-23`).
  — **Reversibility:** one-way — the contract is published and verified in
  `phases/05-i18n-foundation-catalogue-contract/05-VERIFICATION.md` and pinned by the phase-5
  tests; an escaping `t()` would double-escape the sinks that already escape (`toast()` at
  `src/ui/toast.js:14`, `empty()` at `src/ui/helpers.js:59`) and mangle the two `textContent`
  sinks (`document.title` and the ARIA live region, `src/shell/render.js:191-195`), so undoing
  it means re-deciding every sink and breaking a verified contract.
- **D-08:** **`data-*` attributes and action keys are never translated** — `data-a` is the key of
  the action table (`A[el.dataset.a]`, `src/actions/events.js:35`), `data-r` the route, `data-v`
  the value. Translating them makes controls **silently dead**: the click dispatches to nothing
  and nothing is logged, so no test fails and no screenshot shows it. The *visible label* of a
  control is a separate expression and is translated.
  — **Reversibility:** costly — there are **438 `data-a=` sites, 58 `data-r=` and 76 `data-v=`**
  (measured); a translated identifier resolves `A[el.dataset.a]` to `undefined`, and the failure
  is invisible to the whole suite.

### the agent's Discretion

The exact key names inside each namespace, the order in which the files are swept, the internal
shape of the formatter cache (a `Map` keyed by locale + options is the obvious choice), whether
the `Intl` wrappers live in `src/core/i18n.js` or in a sibling module, and the internal
organisation of the catalogue file. None of it is observable from outside the module, as long as
the phase-5 catalogue contract keeps holding.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The phase's own scope
- `.planning/ROADMAP.md` § Phase 6 — the goal, the requirements (**I18N-01**, **I18N-03**,
  **I18N-04**, **SEARCH-01**) and the five success criteria
- `.planning/REQUIREMENTS.md` — the four requirements above and their traceability rows
- `.planning/PROJECT.md` — the milestone scope: ~1 800 string occurrences across 37 files, and
  the decision that the catalogues are repository files

### The phase-5 decisions this phase inherits
- `.planning/phases/05-i18n-foundation-catalogue-contract/05-CONTEXT.md` — D-05 (dotted keys),
  D-06 (plural objects), D-09/D-10 (the escaping contract), D-11 (`data-*` never translated),
  D-12 (static EN + lazy `import.meta.glob`)
- `.planning/phases/05-i18n-foundation-catalogue-contract/05-VERIFICATION.md` — the 5/5 success
  criteria and 20/20 must-haves this phase must not break
- `src/core/i18n.js` — the leaf layer this phase calls: `t()` (`:114-124`), the base fallback
  (`:115-120`), the cached `Intl.PluralRules` (`:91-100`), `resolvePlural()` (`:105-112`), the
  `{name}`/`{n}` interpolation regex (`:81`), `escHtml()` (`:77`), `setLocale()` (`:47-67`),
  `availableLocales()` (`:71-73`), the lazy locale glob (`:24`)
- `src/locales/en.json` — the 9 seed keys this phase grows into the full English set
- `src/locales/fr.json` — the 6 seed keys, **untouched by this phase**

### The research that answers this phase
- `.planning/research/PITFALLS.md` — Pitfall 2 (a half-extracted interface leaks English),
  Pitfall 3 (a translation breaks the markup it is dropped into — the attribute contexts),
  Pitfall 5 (English plurals baked into the string, and French disagrees about zero),
  Pitfall 6 (dates, relative times, numbers and day buckets are not locale-aware),
  Pitfall 18 (French search breaks on accents) and Pitfall 19 (the `t()` layer quietly becomes
  a dependency)
- `.planning/research/STACK.md` — the format surface and the measured `Intl` outputs, the browser
  floor (`Intl.DisplayNames` and `Intl.ListFormat` need a fallback), the `tz` `RangeError`, and
  the 11-item integration checklist
- `.planning/research/ARCHITECTURE.md` — the integration points, the per-site table of the
  hand-rolled formats and their `Intl` replacements, the `data-*` rule, the build order
  (English before French) and the static source scan
- `.planning/research/FEATURES.md` — the surface inventory (§ B), the pseudo-strings (§ C), the
  format surface (§ D) and the anti-features (§ anti-features)

### The code this phase touches
- `src/core/utils.js` — `esc()` (`:10`), `MON`/`MONL`/`WD`/`WDL` (`:40-43`),
  `dateFormat`/`setDateFormat()` (`:45-48`), `fmtDate()` (`:49-57`), `relDate()` (`:58-66`),
  `ago()` (`:67-76`), `dayBucket()` (`:78-84`)
- `src/core/store.js` — `DEFAULT_PREFS` (`:8-22`, with `weekStart` `:13`, `dateFmt` `:14`,
  `lang` `:15`, `tz` `:16`), `docSnapshot()` (`:95`), `applyDoc()` (`:168-173`), `ROLE_LABELS`
  (`:250`)
- `src/core/theme.js` — `applyPrefs()` (`:5-17`), the per-render `setDateFormat(p.dateFmt)` (`:8`)
- `src/ui/helpers.js` — `empty()` (`:58-60`), `hl()` (`:61-66`), `FT` (`:74-83`), `fsize()`
  (`:95-99`), the hard-coded `data-tip="Unassigned"` (`:9`)
- `src/ui/toast.js` — `toast()` (`:7-27`), the `esc(msg)` boundary (`:14`), the `Dismiss`
  `aria-label` (`:14`), `mutate()` (`:29-38`)
- `src/shell/render.js` — `ROUTE_NAMES` (`:15-36`), `pageTitle()` (`:108-117`), the render loop
  (`:126-197`), `applyPrefs()` (`:127`), the `innerHTML` replace (`:154-155`), the `textContent`
  sinks (`:191-195`)
- `src/actions/events.js` — the `A[el.dataset.a]` dispatch (`:35`)
- `src/actions/actions.js` — the 9 plural sites (`:1010, 1015, 1017, 1634, 1660, 1662, 1664,
  1666, 1798`), `A.setPref` (`:268-272`), `IN.prefSel` (`:2140-2146`)
- `src/pages/search.js` — `searchAll()` (`:7-20`), the lower-cased comparison (`:8-10`), the
  category labels (`:25-32`)
- `src/pages/activity.js` — the English-parsing filters (`:11-20`), the `dayBucket` object key
  (`:23`), the bucket heading (`:40`)
- `src/pages/settings.js` — the six-language selector (`:176`), the date/time rows (`:180-227`),
  the hard-coded English date previews (`:190-200`)
- `src/overlays/popovers.js` — the sliced English weekday abbreviation (`:96`), `MONL` (`:98`)
- `src/views/calendar.js` — the weekday header (`:20`), `MONL` (`:32`), `WD` (`:60`)

### The tests this phase must keep green
- `test/i18n.test.mjs` — the `t()` contract, the plural engine in both locales, the leaf-module
  assertion (16 tests)
- `test/catalogue.test.mjs` — the catalogue lint: the forbidden characters (`:19-23`), the key
  shape (`:29`), the CLDR categories (`:32`), the ICU rejection (`:37`), the placeholder parity
  (`:128-146`), the `contract.` exemption (`:45`), the registry ⇄ files agreement (`:333-342`),
  the JSON-only rule (`:353-361`), the no-runtime-dependency guard (`:376-382`) (23 tests)
- `test/build-locales.test.mjs` — the real-build contract and the 174-name icon baseline (`:206`)
  (9 tests)
- `test/fixtures/icons-baseline.json` — the frozen icon set
- `e2e/tenancy.spec.mjs` — the 6 Chromium tests that select on English text and must stay green

</canonical_refs>

<code_context>
## Existing Code Insights

Everything below was measured on the tree at `2026-10-22` (`grep -ro` over `src/**/*.js`,
`node -e` on Node 24.21.0 / ICU 78.3, `npm test`).

### Reusable Assets

- **`src/core/i18n.js` — the leaf layer, already shipped.** `t(key, vars)` (`:114-124`) already
  implements the base-catalogue fallback (`:115-120`: active catalogue → English → the key
  itself), the plural-object resolution (`:105-112`, with the `other` fallback and the key
  returned when the value is unresolvable) and the interpolation subset (`:81`,
  `/\{(\w+)\}/g`). The **per-locale cache pattern the phase needs already exists**:
  `pluralRules` is a `Map<locale, Intl.PluralRules>` built once per locale (`:91-100`) — the
  date/number/relative-time formatters follow the same shape. `escHtml()` (`:77`) is the
  module's own copy of the escape table. `setLocale()` (`:47-67`) resolves an unknown code to
  the base locale and announces the change with a `gr8r:locale` CustomEvent (`:63-65`).
- **`esc(s)` (`src/core/utils.js:10`)** — the escape helper every call site already uses for
  interpolated values; the extraction reuses it and adds nothing.
- **`setDateFormat()` (`src/core/utils.js:46-48`)** and its caller
  **`applyPrefs()` (`src/core/theme.js:5-17`)** — the house pattern for a mutable rendering
  preference that is set on every render. `applyPrefs()` already runs at the top of every
  `render()` (`src/shell/render.js:127`), so it is the natural place to feed the locale into the
  formatters.
- **`toast()` (`src/ui/toast.js:7-27`)** — escapes its own message at `:14` (`esc(msg)`), so a
  `t()` value passed to it is escaped exactly once. `empty()` (`src/ui/helpers.js:58-60`) does
  the same for its title and text.
- **`hl(text, q)` (`src/ui/helpers.js:61-66`)** — computes the highlight window with
  `text.toLowerCase().indexOf(q.toLowerCase())`; it is the one helper whose offsets must stay
  consistent with whatever normalisation the search applies.
- **`fsize(b)` (`src/ui/helpers.js:95-99`)** — the one number formatter today: `b + ' B'`,
  `Math.round(b/1024) + ' KB'`, `(b/1048576).toFixed(1) + ' MB'`.
- **`Intl` on the project interpreter** — Node 24.21.0 with ICU 78.3, `icu_small=false`:
  `PluralRules`, `DateTimeFormat`, `NumberFormat`, `RelativeTimeFormat`, `DisplayNames` and
  `ListFormat` are all present. `Intl.MessageFormat` is `undefined` — no platform shortcut.

### Established Patterns

- **The module-level mutable singleton** — the locale (`src/core/i18n.js:16`) and the date format
  (`src/core/utils.js:45-48`) are both read at call time and changed through one setter. The
  i18n layer does the same; no locale is threaded through a signature.
- **The full re-render** — `render()` replaces `#app`.innerHTML` wholesale
  (`src/shell/render.js:154-155`), so a locale or format change is one setter plus one
  `render()`; there is no partial-update machinery to reconcile.
- **The `data-*` machine-identifier convention** — `A[el.dataset.a]`
  (`src/actions/events.js:35`), `ROUTE_NAMES` keys, `data-k`/`data-v` for preferences
  (`src/actions/actions.js:269`). **438 `data-a=`, 58 `data-r=`, 76 `data-v=`** sites exist.
- **The phase-5 catalogue contract, pinned by tests** — the forbidden characters
  (`test/catalogue.test.mjs:19-23`), the key shape (`:29`), the CLDR category set (`:32`), the
  structural ICU rejection (`:37`), the mandatory `other` member (`:116-118`), the placeholder
  parity (`:128-146`), the `contract.` namespace exemption (`:45`), the registry ⇄ files
  agreement (`:333-342`), the JSON-only rule for `src/locales/` (`:353-361`) and the
  no-runtime-dependency guard (`:376-382`).
- **The icon scan** — `scripts/icons.mjs` walks `src/` and keeps only `/\.js$/` files, then
  matches quoted lowercase kebab-case tokens against the Lucide names. The baseline is
  **174 names**, frozen in `test/fixtures/icons-baseline.json` and asserted by
  `test/build-locales.test.mjs:206`.
- **`node:test` against real servers and real SQLite** — no HTTP or database is mocked; the
  catalogue tests import the same module the browser runs.

### Integration Points

- **`src/core/utils.js` → `src/core/i18n.js`** — one direction only. `i18n.js` imports nothing
  but `../locales/*.json`, asserted by the leaf test in `test/i18n.test.mjs`; `utils.js` keeps
  the date *API* while `i18n.js` owns the locale and the `Intl` primitives.
- **61 formatter call sites and 9 array references** — `fmtDate(` **34** (excludes
  `src/core/utils.js`), `ago(` **17**, `relDate(` **5**, `dayBucket(` **3**, `fsize(` **2** call
  sites plus its definition; `MON` **1** (`src/views/timeline.js:74`), `MONL` **4**
  (`src/overlays/popovers.js:98`, `src/pages/home.js:40`, `src/views/timeline.js:136`,
  `src/views/calendar.js:32`), `WD` **3** (`src/overlays/popovers.js:96`,
  `src/views/calendar.js:20`, `src/views/calendar.js:60`), `WDL` **1** (`src/pages/home.js:40`).
- **The 16 measured plural sites** — `src/overlays/drawer.js:64`,
  `src/overlays/modals.js:58`, `src/pages/auth.js:171`, `src/actions/drag-drop.js:265`,
  `src/actions/teams.js:102`, and nine in `src/actions/actions.js` (`:1010, :1015, :1017,
  :1634, :1660, :1662, :1664, :1666, :1798`). They span a toast, two modal labels, a toast
  body, an onboarding line and nine action messages.
- **`dayBucket()` is used as an object key, not only as a label** —
  `b[dayBucket(a.at)] ||= []` at `src/pages/activity.js:23`, `src/pages/notifications.js:16` and
  `src/views/project-overview.js:64`, with the key rendered as the heading at
  `src/pages/activity.js:40`. It must return a stable id (`today` / `yesterday` / `week` /
  `earlier`); the label is mapped at render.
- **`src/overlays/popovers.js:96` slices the English abbreviation** —
  `WD[(i + S.prefs.weekStart) % 7].slice(0, 2)` — so the two-letter weekday header must become
  `Intl`'s `weekday: 'narrow'`, not merely be wrapped. `src/views/calendar.js:20` uses the same
  array without slicing.
- **The search comparison** — `searchAll()` in `src/pages/search.js:7-20` lower-cases the query
  once (`:8`) and compares with `has = s => (s || '').toLowerCase().includes(q)` (`:10`); the
  match is highlighted by `hl()` (`src/ui/helpers.js:61-66`). The other substring sites are
  `src/pages/members.js:16`, `src/pages/projects.js:26`, `src/views/files.js:12`,
  `src/shell/view-engine.js:93`, `src/overlays/popovers.js:87`, `src/overlays/palette.js:71,82`
  and `src/overlays/modals.js:201`.
- **The sort order is a separate thing** — the only `localeCompare` in the tree is
  `src/views/files.js:13`; the other orders are plain comparisons
  (`src/pages/projects.js:28`, `src/shell/view-engine.js:114`). The `Intl.Collator` change is
  deferred, so none of these move in this phase.
- **The activity filters parse English** — `src/pages/activity.js:11-20` matches
  `a.verb.includes('comment')` (`:14`), `/moved|completed|reopened/.test(a.verb)` (`:16`) and
  `a.verb.includes('project')` (`:18`). Those verbs are **stored data**, and phase 9 restructures
  them; this phase must not translate the verb at write time.
- **The preferences bag** — `DEFAULT_PREFS` (`src/core/store.js:8-22`) is merged with the
  shared document on every `applyDoc()` (`:173`), and `docSnapshot()` (`:95`) writes it back.
  `dateFmt` (`:14`) and `lang` (`:15`) live there today; `timeFmt` is **not** in
  `DEFAULT_PREFS` at all — it is only read at `src/pages/settings.js:219,224` as
  `P.timeFmt || '12'`, so it is genuinely unset today.
- **The date/time settings rows** — `src/pages/settings.js:180-227` hold the `tz` selector
  (`:186`), the `dateFmt` selector with its four **hard-coded English previews** `'Oct 1'`,
  `'1/10'`, `'10/1'`, `'2026-10-01'` (`:190-200`), the `weekStart` selector (`:202-214`) and the
  `timeFmt` selector (`:215-226`). `IN.prefSel` (`src/actions/actions.js:2140-2146`) writes
  `S.prefs[k] = el.value` and must accept `'auto'` verbatim.
- **The sink inventory** — **175 `aria-label=`**, **49 `data-tip`** (44 written with `=`),
  **33 `placeholder=`**, **15 `title=`** and **137 `toast(`** occurrences (135 real call sites;
  **118 in `src/actions/actions.js`**). Of the `aria-label` sites, 27 are interpolations
  (`aria-label="${…}"`); `value="${…}"` appears 49 times, `title="${…}"` 10,
  `placeholder="${…}"` 2 and `data-tip="${…}"` 17. The two `textContent` sinks are
  `src/shell/render.js:191` (`document.title`) and `:194` (the ARIA live region).
- **The `gr8r:locale` event** — `src/core/i18n.js:63-65` dispatches it; the renderer listens.
  A format change does not need it: the formatters read the locale at call time.

### Measured `Intl` outputs (Node 24.21.0, ICU 78.3)

| Call | Result |
|---|---|
| `Intl.DateTimeFormat('fr-FR', {dateStyle:'short'}).format(2026-07-24)` | `24/07/2026` |
| `Intl.DateTimeFormat('en-US', {dateStyle:'short'}).format(2026-07-24)` | `7/24/26` |
| `Intl.DateTimeFormat('en-US', {month:'short', day:'numeric'})` | `Jul 24` |
| `Intl.DateTimeFormat('fr-FR', {month:'short', day:'numeric'})` | `24 juil.` |
| `Intl.DateTimeFormat('fr-FR', {timeStyle:'short'})` | `20:30` |
| `Intl.DateTimeFormat('en-US', {timeStyle:'short'})` | `8:30 PM` |
| `Intl.RelativeTimeFormat('fr-FR').format(-2, 'day')` | `il y a 2 jours` |
| `Intl.RelativeTimeFormat('fr-FR', {numeric:'auto'}).format(-1, 'day')` | `hier` |
| `Intl.RelativeTimeFormat('fr-FR', {numeric:'auto'}).format(-2, 'day')` | `avant-hier` |
| `Intl.NumberFormat('fr-FR').format(1250000)` | `1 250 000` (U+202F) |
| `Intl.NumberFormat('fr-FR', {style:'percent'}).format(0.45)` | `45 %` (U+00A0) |
| `Intl.PluralRules('fr').select(0)` / `.select(1000000)` | `one` / `many` |
| `new Intl.DateTimeFormat('en-US', {timeZone:'(GMT-07:00) Pacific Time'})` | `RangeError: Invalid time zone specified: (GMT-07:00) Pacific Time` |

Two consequences for the plan: the English `'auto'` output must remain **`Jul 24`** (the
current `MMM d` default, `src/core/utils.js:14,56`) and **not** `dateStyle:'short'`'s `7/24/26`,
or the English interface changes; and the roadmap's « il y a 2 jours » needs
`Intl.RelativeTimeFormat` **without** `numeric:'auto'` — with `auto`, `-2 day` is `avant-hier`.

</code_context>

<specifics>
## Specific Ideas

- **The extraction needs a progress meter.** `.planning/research/ARCHITECTURE.md` § "the static
  source scan" proposes a **shrinking allow-list** (`test/fixtures/i18n-pending.json`) listing
  the literals not yet extracted; each extracted literal leaves the list, and the list is the
  proof that the sweep is finished. The phase-6 success criterion 1 — *"the static scan finds
  none, and the build fails when a new one is added"* — is what makes the allow-list a device
  rather than a permanent hole. The file does not exist yet; `test/fixtures/` holds only
  `icons-baseline.json`.
- **The key taxonomy must extend phase 5's seed namespaces.** The taxonomy named for this phase
  (`nav.*`, `page.*`, `modal.*`, `act.*`, `toast.*`, `err.*`, `a11y.*`, `settings.*`) does not
  cover the four namespaces the seed already uses: `app.*` (`app.name`), `common.*`
  (`common.cancel`, `common.save`), `greeting.*` (`greeting.hello`) and `task.*`/`file.*` (the
  two plural seeds). The phase-5 lint's key shape
  (`^[a-z][a-z0-9]*(\.[a-z][a-zA-Z0-9]*)+$`, `test/catalogue.test.mjs:29`) already accepts all
  of them; the taxonomy must be written so the seed keys stay where they are.
- **`contract.*` is a reserved namespace** — it is the documented exception to the
  English-base rule (`test/catalogue.test.mjs:42-45, 268-272`), so a phase-6 key must never be
  placed under it.
- **The plural seeds are already in the right shape.** `task.count` and `file.count` in
  `src/locales/en.json` are `{one, other}` objects, and `fr.json`'s `task.count` already carries
  the `many` member. The 16 measured sites can be converted to the same shape without touching
  the plural engine.
- **The count placeholder is `{n}`, not `{count}`.** The interpolation regex is
  `/\{(\w+)\}/g` (`src/core/i18n.js:81`) and the plural resolver reads `vars.n`
  (`:106-108`); the phase-5 lint compares the placeholder *sets* between the catalogues
  (`test/catalogue.test.mjs:137-145`), so a `{count}` spelling would be caught only after the
  French value existed.
- **`hl()` must follow the normalisation.** If the query is normalised (NFD, diacritics
  stripped) before the comparison, the highlight window computed against the *original* string
  (`src/ui/helpers.js:62`) no longer maps to the same offsets in the normalised string. The
  two must be computed from the same normalised text, or the `<mark>` lands in the wrong place.
- **The date-format previews are English literals in the settings page** —
  `'Oct 1'`, `'1/10'`, `'10/1'`, `'2026-10-01'` (`src/pages/settings.js:194-197`). They are
  catalogue values, not hard-coded strings, and the `'auto'` option needs a preview of its own.
- **`A.setPref` writes the pref value verbatim** (`src/actions/actions.js:268-272`) and
  `IN.prefSel` does the same with a `+` coercion for `weekStart` only (`:2140-2146`). Both must
  carry `'auto'` through untouched, or the sentinel is lost on the first save.
- **The English output is the regression oracle.** The `Intl` formatters must reproduce today's
  English exactly — `fmtDate`'s `MMM d` branch appends the year only when it differs from the
  current year (`src/core/utils.js:56`), `ago()` returns `'just now'` below one minute and
  `'5m ago'` / `'3h ago'` / `'2d ago'` up to a week (`:67-76`), and `dayBucket()` returns
  `'Today'` / `'Yesterday'` / `'This week'` / `'Earlier'` (`:78-84`). Those four strings are the
  spec the new formatters are measured against.

</specifics>

<deferred>
## Deferred Ideas

- **The `Intl.Collator` sort order** — deferred by D-06. The roadmap's SEARCH-01 says explicitly
  that "the sort order does not change in this milestone". Changing it later re-orders results
  under the existing Chromium assertions, so it must be a separate, re-pinned change.
- **The IANA time-zone migration** — deferred by D-04. `prefs.tz` stores display labels
  (`src/core/store.js:16`) that `Intl` rejects with a `RangeError`; the browser's resolved zone
  is used for formatting and the preference stays a display value.
- **Moving `dateFmt` off the shared workspace document** — phase 8. It is a *shared* preference
  today (`src/core/store.js:95,173`), so one member's date format changes it for everybody; that
  is the same defect as `prefs.lang` and it is phase 8's migration.
- **The French catalogue and the French typography lint** — phase 7 (I18N-02, I18N-05,
  I18N-07). The house style (NBSP before `:`, narrow NBSP before `; ! ?`, NBSP inside `« »`, the
  curly apostrophe, `…`, lowercase months) is settled in
  `.planning/research/PITFALLS.md` Pitfall 16.
- **The stored vocabulary** — statuses, priorities, roles, permissions, project templates and
  the notification fragments (`src/data/seed.js` `notifs[].text`, spliced by
  `src/pages/inbox.js` `notifText()`) are *data*, not templates; they are translated at render
  in phase 7 (I18N-07), and the stored values never change.
- **The activity log's machine verbs** — phase 9. The filters parse English
  (`src/pages/activity.js:11-20`), so the verb must not be translated at write time in this
  phase.
- **The server error codes and the invite email** — phase 9 and beyond. The server's English
  messages are not touched here.
- **The build gate and the French sweep** — phase 11 (UAT-10). The *static scan* belongs to this
  phase (success criterion 1); the CI gate that fails the build and the 21-route French sweep
  belong to phase 11.
- **The seed content** — `src/data/seed.js` is demo *content*, not interface. Whether a French
  seed exists is a product decision (PITFALLS Pitfall 13) and is out of this phase.

</deferred>

## Declared English deltas

The phase is behaviour-preserving (D-01) and the roadmap's success criterion 2 says the interface
behaves exactly as it did before the extraction. One delta is declared here, so the phase's own
verification reads it where it matters — in the roadmap criterion itself and in this file.

### The time-format selector's default

`prefs.timeFmt` is genuinely unset today: it is not in `DEFAULT_PREFS` at all, and it is read
only at `src/pages/settings.js:219,224` as `P.timeFmt || '12'`. D-04 says an unset preference
follows the locale, so the settings page's time-format row shows the new `'auto'` option as
selected instead of the `'12-hour'` one.

- The English clock is still 12-hour: the English locale's `timeStyle: 'short'` is a 12-hour
  clock, so the rendered time is unchanged.
- No stored document changes: the preference is only written when the user picks an option.
- The revert is real: removing the `'auto'` option from the time-format row restores the previous
  rendering exactly. The date-format row's `'auto'` option is NOT a delta — it replaces the
  `'MMM d'` option, which was the stored default anyway, and the rendered English text of the row
  does not change.

The roadmap's success criterion 2 carries the same carve-out inline, and plan 06-03 records the
delta in its plan summary.

## Corrections to the research

The four research documents were written before the code was measured. These figures were
**re-measured on this repository** and the research is wrong on them. Take the measured value,
not the research value.

| The research says | Measured | Where |
|---|---|---|
| "37 English plural concatenations" | **16** `? 's' : ''` sites, across 6 files | the "37" was the *file* count, conflated with the site count |
| "43 `aria-label="${…}"` interpolations" | **27** | `src/` today; the `value` (49) and `title` (10) figures are correct |
| "~1 800 string occurrences across 37 files" | 54 `.js` files under `src/`, **49** carry a user-visible literal, 47 excluding the infra modules | no definition of "37 files" is reproducible |
| "`t()` escapes by default, plus a `tText()`" | phase 5 shipped **`t()` non-escaping**, with a separate `escHtml()` | `src/core/i18n.js:77-79`; ARCHITECTURE.md contradicts the shipped code — D-07 follows the code |
| "both catalogues statically imported" | phase 5 shipped a **lazy `import.meta.glob`** for the non-base locales | `src/core/i18n.js:22-27`; this matches STACK.md, not ARCHITECTURE.md |
| "the lint reports the French catalogue as incomplete until phase 7" | the lint has **no** "English key missing in French" rule — it stays **green** after the sweep | `test/catalogue.test.mjs:128-146`; the risk is a silent one, not a red test |
| "`dateFmt` is unset by default" | it already stores `'MMM d'` in **every** existing document | resolved in D-04: `'MMM d'` **is** the `'auto'` sentinel |
| — | `Intl.RelativeTimeFormat` with `numeric:'auto'` turns −2 days into `avant-hier`, not `il y a 2 jours` | use it **without** `numeric:'auto'` |
| — | the English `'auto'` output must stay **`Jul 24`**, not `dateStyle:'short'`'s `7/24/26` | or the English behaviour changes |

---

*Phase: 6-English extraction & locale-aware formats*
*Context gathered: 2026-10-22*
