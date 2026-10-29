# Phase 5: i18n foundation & catalogue contract - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the **i18n layer and its contract** — a `t()` over JSON catalogues, the
catalogue format, the escaping rule, the plural engine and the build layout — and pins every
one of them with a test **before a single string moves**.

It does not move any string out of the sources (that is phase 6), does not write a single
French word (phase 7), does not touch the per-user locale (phase 8), and does not change what
the interface shows. Its deliverable is the floor everything else stands on: a later regression
must be unambiguously in the catalogue, because this phase is behaviour-preserving by
construction.

Requirements: **I18N-06** (a catalogue value can never inject markup) and **I18N-08** (the
French catalogue is built as its own chunk, so an English-only build carries no French string).

</domain>

<decisions>
## Implementation Decisions

The four research documents under `.planning/research/` already answered the gray areas; the
decisions below are the ones that bind the implementation. The owner validated the direction;
the detail was defaulted from the research (`SUMMARY.md` D1–D12).

### The module and its shape

- **D-01:** The layer lives in a new **leaf module `src/core/i18n.js`** holding a module-level
  mutable locale singleton, `t()`, `getLocale()`/`setLocale()`, the plural selection, the cached
  `Intl` wrappers and the locale registry. The repository already owns this pattern:
  `dateFormat` / `setDateFormat()` in `src/core/utils.js:44-48`, with the comment *"Set from
  preferences on every render, so utils never depends on the store."* The locale is threaded the
  same way — never through every function signature.
  — **Reversibility:** costly — the import site of every caller changes; undoing it touches all
  37 files.
- **D-02:** `setLocale()` notifies the renderer through a **`projects:locale` CustomEvent** instead
  of importing it, mirroring the existing `projects:save-error` pattern. The dependency graph stays
  acyclic: `i18n.js` imports the catalogues and nothing else from the app.
- **D-03:** The module keeps its own **one-line `escHtml`** rather than importing `esc` from
  `src/core/utils.js`, so the leaf stays a leaf. `esc` itself stays where it is
  (`src/core/utils.js:10`); the duplication is three characters wide and buys the acyclic graph.

### The catalogue

- **D-04:** The catalogues are **JSON files under `src/locales/{en,fr}.json`** — never a `.js`
  file under `src/`. `vite.config.js`'s `lucideSubset()` plugin walks `src/` and collects
  **only `/\.js$/` files** (`vite.config.js:12-15`), then matches every quoted lowercase
  kebab-case token against the Lucide icon names. A catalogue authored as `.js` would have its
  *values* swept into the icon bundle.
- **D-05:** Every key is **flat, dotted and namespaced** (`nav.projects`, `act.moved`). The same
  icon regex cannot match a dotted token, so the key format is the second layer of defence
  behind the file format.
- **D-06:** A plural value is an **object keyed by CLDR category** (`one`, `many`, `other`),
  selected with `Intl.PluralRules`. French resolves to three categories and selects `0 → one`
  ("0 fichier", where English says "0 files") and `1000000 → many`; a hand-written `n > 1` rule
  is wrong in French, and a `.one`/`.other` suffix scheme would be wrong in Japanese.
  — **Reversibility:** one-way — the plural shape is referenced by every catalogue entry; undoing
  it rewrites the whole French catalogue.
- **D-07:** The interpolation subset is **`{name}` plus `{count, plural, …}`**. No `select`, no
  `selectordinal`, no `offset`, no `#`: `Intl.MessageFormat` is `undefined` in Node 24 and in
  Chromium (measured), so any richer ICU syntax would need a hand-written parser — a permanent
  liability for a layer that must stay under ~150 lines.
  — **Reversibility:** one-way — same reason as D-06: the subset is the catalogue's schema.
- **D-08:** A key with no value in the active catalogue **falls back to English** rather than
  rendering empty text.

### The escaping contract

- **D-09:** **`t()` never escapes.** `toast()` already escapes its message
  (`src/ui/toast.js:14`), `empty()` does the same, and `document.title` plus the ARIA live
  region (`src/shell/render.js:192,194`) are `textContent` sinks that need raw text. An escaping
  `t()` would double-escape the first group and mangle the second.
  — **Reversibility:** costly — the contract is baked into every call site; undoing it means
  re-deciding every sink.
- **D-10:** **Catalogue values are plain text, made inert by a test** — no `<`, no `>`, no `"`
  (the requirement I18N-06). Interpolated values are escaped **at the call site** with the
  existing `esc()`.
- **D-11:** **`data-*` attributes and action keys are never translated.** `data-a` is the key of
  the action table (`src/actions/events.js:35`), so translating it makes a control silently
  dead — the click does nothing and nothing is logged. The same holds for `data-r` (route),
  `data-v` (value) and every other machine identifier.

### The build

- **D-12:** The **English catalogue is imported statically; the other locales are pulled in with
  `import.meta.glob`**, so Vite emits one chunk per locale and the French strings stay out of
  the English bundle. Never statically *and* dynamically import the same file: Vite warns and
  keeps it in the main chunk.
- **D-13:** The catalogue stays a **plain JSON file importable by bare Node 24**, so the server
  can read it later — the invitation email is out of scope for v1.2 but the catalogue is
  positioned for it (research decision D2) without relocating anything.
- **D-14:** **No runtime dependency is added.** Every candidate library measured is larger than
  the layer it would replace (`i18next` 43.8 kB, `intl-messageformat` 33.9 kB + 2 deps, against
  a ~2 kB hand-rolled layer) and each would break the project's zero-runtime-dependency
  identity.
- **D-15:** The **locale registry** — the list of locales that exist — lives in
  `src/core/i18n.js`, not in the settings page. The selector is derived from it, so a locale
  can never be offered without a catalogue behind it (LOC-02, phase 8, consumes this).

### the agent's Discretion

The internal shape of the module: the exact function names beyond `t()` / `getLocale()` /
`setLocale()`, whether the `Intl` wrappers live in the module or a sibling, the cache strategy
for the `Intl` formatter instances, and the exact key taxonomy. The planner should pick
something consistent and small; none of it is observable from outside the module.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The phase's own scope
- `.planning/ROADMAP.md` § Phase 5 — the goal, the requirements and the five success criteria
- `.planning/REQUIREMENTS.md` — I18N-06, I18N-08, and the traceability row

### The research that answers this phase
- `.planning/research/SUMMARY.md` — the synthesis: the resolved conflicts, the phase list, the
  twelve owner decisions (D1–D12) with their defaults
- `.planning/research/STACK.md` — the measured stack decision, the catalogue format, the
  loading strategy, the `t()`/markup integration, and the 11-item integration checklist
- `.planning/research/ARCHITECTURE.md` — the integration points, the new and modified files,
  the data flows and the nine-step build order
- `.planning/research/PITFALLS.md` — the 20 pitfalls, each with its warning sign, its
  prevention and the phase that must address it
- `.planning/research/FEATURES.md` — the localisation surface inventory, the pseudo-strings, and
  the server-emitted strings

### The code this phase touches or must not break
- `src/core/utils.js:10` — `esc()`, the escape helper the call sites use
- `src/core/utils.js:44-48` — the `dateFormat` / `setDateFormat()` singleton pattern to mirror
- `src/ui/toast.js:14` — a sink that already escapes, which is why `t()` must not
- `src/shell/render.js:192,194` — the `textContent` sinks that need raw text
- `src/actions/events.js:35` — the action table whose keys must never be translated
- `vite.config.js:12-15` — the `lucideSubset()` walk that only reads `.js` files
- `test/migration.test.mjs` — the guarantees a build change must not break

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `esc(s)` (`src/core/utils.js:10`) — the escape helper, used at every call site that
  interpolates a value into markup.
- The `dateFormat` / `setDateFormat()` singleton (`src/core/utils.js:44-48`) — the exact
  pattern the locale singleton mirrors, including its stated reason for not depending on the
  store.
- `Intl` — Node 24 ships full ICU (78.3): `PluralRules`, `DateTimeFormat`, `NumberFormat`,
  `RelativeTimeFormat`. `Intl.MessageFormat` and `Intl.DisplayNames` need a fallback.
- The action table (`src/actions/events.js:35`) — the machine-identifier registry that defines
  what "never translate" means.

### Established Patterns
- The app renders HTML from **hand-written template strings**; there is no framework, no JSX and
  no runtime dependency. The i18n layer must fit that shape, not introduce a new one.
- Preferences live in `prefs` and are applied on every render (`core/theme.js` sets the date
  format on each render) — the locale will follow the same path in phase 8.
- Tests are `node:test` against real servers and real SQLite; no HTTP or database is mocked.

### Integration Points
- `src/core/i18n.js` is imported by every module that renders a string — the 37 files of the
  extraction sweep.
- `src/core/store.js` holds the preferences; phase 8 removes `lang` from it.
- `src/main.js` boots the app and is where the locale is resolved before the first render
  (phase 8).
- `src/shell/render.js` re-renders on the `projects:locale` event.

</code_context>

<specifics>
## Specific Ideas

- The phase is worth a **catalogued registry test**: a test that asserts the locale registry
  and the catalogue files agree — every registered locale has a catalogue file, every catalogue
  file is registered, and the English catalogue is the base. That test is what makes LOC-02
  ("the selector offers only what exists") cheap to enforce in phase 8.
- The **plural contract deserves its own table-driven test** with the French cases that break a
  hand-written rule: `0 → one`, `1 → one`, `2 → other`, `1000000 → many`, and the English
  `0 → other` — because a rule that is only ever exercised with `1` and `2` passes in both
  languages and is wrong in both.

</specifics>

<deferred>
## Deferred Ideas

- The invitation email in a language (research decision D2) — out of the milestone; the
  catalogue stays Node-importable so v1.3 needs no relocation.
- The French catalogue itself (phase 7), the extraction sweep (phase 6), the per-user locale
  (phase 8).
- Accent-insensitive matching (SEARCH-01, phase 6) and the `Intl.Collator` sort order (deferred
  beyond this milestone).
- The four other languages (Deutsch, Español, 日本語, English UK) — the registry makes adding
  one a matter of dropping in a catalogue file.

</deferred>

---

*Phase: 5-i18n foundation & catalogue contract*
*Context gathered: 2026-10-22*
