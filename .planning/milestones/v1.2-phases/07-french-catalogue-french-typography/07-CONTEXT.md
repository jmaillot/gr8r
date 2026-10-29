# Phase 7: French Catalogue & French Typography - Context

**Gathered:** 2026-10-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a complete French product: `src/locales/fr.json` carries a French value for every English catalogue key, the interface can be switched to French and every surface renders it, stored vocabulary displays translated without changing stored ids, French typography is mechanically enforced, and longer French strings fit the fixed chrome at 1280 px and 390 px.

Also in scope, by explicit decision: remove billing and plans from the product end-to-end (settings screens, plan-change flow, permission column, server endpoint, stored field, seeded invoices, catalogue keys and tests).

Out of scope: choosing the user's language per account, persisting the choice, and the language selector redesign — phase 8 owns those. The demo seed's sample content stays English (PROJECT.md D15), except notification rows, which become structured data. Removing legacy `plan`/`invoices` data from existing documents is not a migration task: the fields are ignored.

</domain>

<decisions>
## Implementation Decisions

### French reachability
- **D-01:** French becomes reachable now through the existing selector, not through phase 8's persistence work. `applyPrefs()` maps the stored `prefs.lang` display label to a locale code and calls `setLocale()`; the `projects:locale` event re-renders. This mapping is explicitly throwaway — phase 8 replaces the storage format, the selector and this mapping. — **Reversibility:** reversible — phase 8 deletes the mapping and the test that pins it.
- **D-02:** `setLocale('fr')` must also set `document.documentElement.lang` to `fr`. `main.js` currently hardcodes `lang="en"`.
- **D-03:** Unknown or unsupported stored values resolve to `en`, matching the existing `setLocale()` contract. The selector's other four labels (English UK, Deutsch, Español, 日本語) keep resolving to `en` this phase.

### French typography
- **D-04:** The authoritative rule is PROJECT.md D11 / ROADMAP, not the REQUIREMENTS I18N-05 wording: U+00A0 before `:`, U+202F (narrow no-break space) before `; ! ?`, U+00A0 on both sides inside `« »`, curly apostrophe `’`, ellipsis `…` rather than `...`, NFC everywhere. `REQUIREMENTS.md` I18N-05 is corrected to match as part of this phase. — **Reversibility:** costly — changing the rule after 1,446 values are written means rewriting the whole catalogue.
- **D-05:** A dedicated test (`test/french-typography.test.mjs`) enforces the catalogue rules on every `npm test`: plain space before `; : ! ?`, straight apostrophe `'`, three-dot ellipsis, missing/thin space inside guillemets, and non-NFC. Times (`14:30`), ISO dates and URLs are exempt by pattern. Phase 11 wires the same check into `prebuild`; phase 7 only adds the test.
- **D-06:** Stored vocabulary is displayed, never rewritten. English ids (`todo`, `high`, `Owner`, `Paid`) remain the stored and wire values; `t()` supplies the label. This extends the existing phase-6 pattern in `src/core/constants.js` and `store.roleLabel`.

### Catalogue completeness
- **D-07:** A failing completeness test enforces en→fr parity: every English key except `contract.*` must exist in `fr.json` with a non-empty string. Plural objects must carry at least `one` and `other`; CLDR categories beyond that are allowed. Values legitimately identical in both languages (`Projects Studio`, `Ctrl`, product names) must be present, never omitted. This is additive to `test/catalogue.test.mjs`, not a replacement.
- **D-08:** Translation workflow: a terminology glossary is written first (`docs/i18n-fr-glossary.md`), then namespaces are translated in batches — `page` 512, `settings` 196, `act` 144, `a11y` 132, `toast` 95, `modal` 67, `err` 64, remaining ~236 — each batch gated by the completeness and typography tests.
- **D-09:** French register is `vous` (PROJECT.md D9), sentence-case headings, no middle-dot gender forms (D10), French-France conventions: lowercase months and weekdays, `1er`/`1re`/`2e`, decimal comma, narrow-NBSP digit grouping.

### Stored vocabulary and seed data
- **D-10:** Project templates become catalogue data. The 7 templates in `src/overlays/modals.js` (`TEMPLATES`: name, description) and their 42 starter task titles get `project.template.*` keys. Tasks created from a template store the translated title at creation; hand-created tasks are untouched. — **Reversibility:** costly — reverting means rewriting the titles of every task already created from a template in a French workspace.
- **D-11:** Task estimates stay stored as ASCII (`30m`, `2d`). A display-only formatter renders `30 min` / `2 j` in French and the existing form in English. No storage change, no migration.
- **D-12:** Notification rows move from stored English fragments (`text: 'mentioned you in'`) to structured data — `{ kind, actor, target }` — rendered through `notif.*` catalogue keys in `notifText()`. Documents still carrying a legacy `text` string render it verbatim; there is no migration.
- **D-13:** Billing and plans are removed end-to-end: the `Billing` settings group (`plan`, `payment`, `invoices`), their page sections, the plan-change modal and upgrade prompts in `src/actions/actions.js`, `perm.billing` and its column in the permission matrix, the `/api/workspaces/:id/plan` endpoint and the stored `plan` field in `server.js`, seeded `invoices`, the `settings.plan.*` / `settings.pay.*` / `settings.inv.*` / `act.*plan*` / `perm.billing` catalogue keys, and the tests that pin them. Legacy documents that still carry `plan`/`invoices` load and save without them; no data migration is written. — **Reversibility:** one-way — the endpoint and field are deleted and the seeded data is gone; undoing needs the endpoint restored, the field re-added to documents, and the catalogue re-extracted.
- **D-14:** With billing gone, `popover.roleDescOwner` and any other copy mentioning plans are reworded, not left dangling.

### Layout and acceptance
- **D-15:** Criterion 4 is proven by one Playwright spec that loads the main routes in French at 1280 px and 390 px and fails on horizontal document overflow or clipped fixed chrome (sidebar, top bar, modal footer, buttons). Phase 10 widens browser coverage; this spec is the phase-7 proof, plus a manual spot-check.
- **D-16:** The French read-through is the user's: after execution, review the app in French across all main routes and sign off in a short notes file in the phase directory. Any wording fixes are applied before the phase closes.

### the agent's Discretion
- Glossary contents beyond the core nouns, batch order within the namespace list, the exact overflow heuristic in the Playwright spec, and how the settings subnav is re-indexed once the Billing group disappears.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and roadmap
- `.planning/ROADMAP.md` §Phase 7 — success criteria 1–4 and the French read-through exit criterion.
- `.planning/REQUIREMENTS.md` — I18N-02, I18N-05, I18N-07; I18N-05 is amended by D-04.
- `.planning/PROJECT.md` — D9 (vouvoiement), D10 (no middle-dot forms), D11 (French-France house style), D13 (wire values stay English), D14 (date prefs workspace-shared), D15 (demo seed content stays English).
- `.planning/research/PITFALLS.md` §Pitfall 16 — French typography table, the case for a catalogue lint, and "never normalise accents away".

### Prior phase contracts
- `.planning/phases/05-i18n-foundation-catalogue-contract/05-CONTEXT.md` — catalogue shape, namespaced flat keys, plural object contract, `t()` semantics, no runtime dependency.
- `.planning/phases/06-english-extraction-locale-aware-formats/06-CONTEXT.md` — extraction contract, `'MMM d'` auto-date sentinel, stable `dayBucket` ids, NFD search normalisation, English as regression oracle.

### Code and tests
- `src/core/i18n.js` — `setLocale`, `t`, plural engine, formatters, `LOCALE_FORMATS`, `availableLocales`.
- `src/locales/en.json` — 1,446 keys, the source of truth for parity.
- `test/catalogue.test.mjs` — existing catalogue linter; extend, do not duplicate.
- `test/i18n-vocab.test.mjs` — pins stored vocabulary ids and their labels.
- `scripts/i18n-scan.mjs` — literal allow-list and the prebuild gate phase 11 will extend.
- `e2e/playwright.config.mjs`, `e2e/tenancy.spec.mjs` — existing browser harness the overflow spec joins.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `t(key, vars)` with EN fallback then key: gives a safe partial catalogue at every step; no need to translate before wiring.
- `LOCALE_FORMATS.fr`: 2-digit day/month/year dates, long relative style, `['o','ko','Mo']` bytes — already locale-aware, reuse for estimates and any number formatting.
- Plural engine via cached `Intl.PluralRules` — French `one`/`other` works without new code.
- Lazy getters in `src/core/constants.js` and `store.roleLabel` — the pattern to extend to templates and notification kinds.

### Established Patterns
- Catalogue values are plain text: no `<`, `>`, `"`, no HTML. UI helpers escape; `t()` never does.
- `data-*` and wire values stay English; only the displayed label goes through `t()`.
- English output is the phase-6 regression oracle: every refactor keeps English identical.
- One test file per contract, run by `node --test --test-concurrency=2 test/*.test.mjs`.

### Integration Points
- `src/main.js` — hardcoded `document.documentElement.lang='en'`; locale event wiring lives here.
- `src/pages/settings.js` — language row (`sel('lang', …)`) and the Billing sections to delete; `SET_NAV` group removal re-indexes section lookup.
- `src/actions/actions.js` — `setPref`/`prefValue` for `prefs.lang`; `changePlan` modal to delete.
- `src/overlays/modals.js` — `TEMPLATES` (7 templates, 42 starter titles) with `${t.name}` variable shadowing to rename.
- `src/data/seed.js` — `notifs[].text` fragments and `invoices`; `src/pages/inbox.js` `notifText()` is the renderer.
- `server.js` — `/plan` endpoint (lines ~1472–1481), `plan` copy on workspace writes (~586), seeded `plan: 'Team'`, `invoices: []`.
- `test/membership.test.mjs`, `test/revision.test.mjs`, `test/tenancy.test.mjs`, `test/i18n-*.test.mjs`, `test/helpers/legacy-fixture.mjs` — plan/billing assertions to remove or rewrite.

</code_context>

<specifics>
## Specific Ideas

- Typography exemptions must be explicit: `14:30`, ISO `2026-10-23`, URLs and code snippets keep their plain ASCII.
- Identical-value keys are a feature of a correct catalogue, not a gap — the completeness test must not flag them.
- Starter task titles are stored translated by design; a mixed-language workspace is accepted (an English member sees the French titles the template created).
- Legacy `text` notifications and legacy `plan`/`invoices` fields must not crash the app — tolerate and ignore.

</specifics>

<deferred>
## Deferred Ideas

- Removing the remaining demo/seed sample content (project names, comments, invoice-like rows) — PROJECT.md D15 keeps it English.
- Per-user locale persistence, selector redesign and locale negotiation — phase 8.
- Wiring the typography check into `prebuild` — phase 11.
- Additional locales (German, Spanish, Japanese) — future milestone; their labels stay non-functional this phase.
- Any broader removal of billing-adjacent concepts (pricing pages, marketing copy) beyond the inventory in D-13.

</deferred>

---

*Phase: 7-French Catalogue & French Typography*
*Context gathered: 2026-10-23*
