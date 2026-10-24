# Roadmap — Localization (v1.2)

Goal: the interface stops lying about languages — the language selector becomes real, the app
speaks French, every user has their own locale, and the whole app journey is covered by a
browser test.

Milestone: **v1.2 — Localization**. This milestone continues the phase numbering of v1.1
(phases 1–4, shipped and archived in `milestones/v1.1-ROADMAP.md`): it owns **phases 5–11**.

Ordering rationale: the i18n foundation and the catalogue contract come first, because they
block the browser and the server; the English extraction is a behaviour-preserving refactor and
comes before the French translation, so any visual regression is unambiguously in the catalogue;
the French catalogue lands before the per-user locale, because the acceptance criteria of the
selector (switch without a reload, no English flash) are only observable once French exists; the
browser proof and the shipped-artifact proof come last.

Requirements:

### Internationalisation

- **I18N-01** — Every user-visible string comes from a catalogue lookup; the English catalogue is
  the base and no user-visible literal is left inline in the source.
- **I18N-02** — The French catalogue covers every key of the English one, and the whole interface
  renders in French — navigation, pages, modals, popovers, toasts, empty states, validation
  messages, the command palette, the settings, the authentication pages and the 404 page.
- **I18N-03** — Dates, times, durations and numbers are formatted for the active locale: a 24-hour
  clock and `JJ/MM/AAAA` in French, a decimal comma, a narrow no-break thousands separator, and
  relative times ("il y a 2 jours").
- **I18N-04** — Plural forms follow the locale's CLDR categories, so French says "0 fichier" where
  English says "0 files" and a million takes its own category.
- **I18N-05** — French typography is respected: a narrow no-break space before `: ; ! ?` and inside
  guillemets, and the curly apostrophe.
- **I18N-06** — A catalogue value can never inject markup — catalogue values are plain text, and a
  test rejects any value containing `<`, `>` or a double quote.
- **I18N-07** — The vocabulary the app stores as data — statuses, priorities, roles, permissions,
  project templates — is translated where it is displayed, without changing the stored values.
- **I18N-08** — The French catalogue is built as its own chunk, so an English-only build carries no
  French string.

### Language preference

- **LOC-01** — The language selector switches the interface language immediately, without a reload.
- **LOC-02** — The selector offers only the languages that are actually translated: English and
  French. The four other languages it listed until now are gone until they exist.
- **LOC-03** — The language is a per-user preference, stored on the account, and it survives signing
  out, signing in again and opening the app from another browser.
- **LOC-04** — The language is no longer part of the shared workspace document — the account is the
  only source of truth for it.
- **LOC-05** — An existing installation gains the per-user language without data loss, without
  writing a migration backup, and without touching the workspace row: a second boot stays a
  byte-identical no-op.
- **LOC-06** — The account's language is applied before the first render, so the interface never
  flashes English.

### Search

- **SEARCH-01** — Search matches an accented name from an unaccented query — "elodie" finds
  "Élodie" — by normalising both sides before the comparison. The sort order does not change in
  this milestone.

### Server messages

- **ERR-01** — A server error carries a stable machine code next to its English message, and the
  interface shows the translated message.
- **ERR-02** — An error whose code is unknown to the client still shows the server's message, so no
  toast is ever empty.

### Activity

- **ACT-01** — The activity log is displayed in the interface language, and its filters — comments,
  status changes, project changes — keep selecting the right entries.
- **ACT-02** — Activity entries written before this milestone are still displayed and still
  filterable.

### Browser coverage

- **UAT-01** — The onboarding wizard that creates a workspace is covered by a browser test.
- **UAT-02** — The invite modal is covered by a browser test.
- **UAT-03** — The `/join` page that accepts an invitation is covered by a browser test.
- **UAT-04** — The project share modal is covered by a browser test.
- **UAT-05** — Removing a member from the members page is covered by a browser test.
- **UAT-06** — Switching between two workspaces is covered by a browser test.
- **UAT-07** — Changing the workspace plan is covered by a browser test.
- **UAT-08** — Creating a project from the interface is covered by a browser test.
- **UAT-09** — The existing Chromium tests are pinned to English, so they keep asserting what they
  assert today.
- **UAT-10** — A French sweep over the 21 routes proves no untranslated English string is served, and
  a static scan of the sources fails the build on a new user-visible literal that was never put in a
  catalogue.

## Phase 5: i18n foundation & catalogue contract ✅ complete

The `t()` layer, the catalogue format, the escaping contract, the plural engine and the build
layout — fixed before a single string moves, because changing any of them later means redoing 37
files. A leaf module `src/core/i18n.js` (locale singleton, `t()`, `getLocale()`/`setLocale()`,
plural selection, cached `Intl` wrappers, the locale registry) over `src/locales/{en,fr}.json`. No
runtime dependency is added.

The contract: catalogue values are plain text and `t()` never escapes (interpolated values are
escaped at the call site with the existing `esc()`); plurals are objects keyed by CLDR category,
selected with `Intl.PluralRules`; the catalogue is JSON — never a `.js` file under `src/` — so the
`lucideSubset()` icon scan cannot swallow it, and every key is dotted and namespaced. The build
layout keeps the catalogue importable by plain Node and ships French as its own chunk, so an
English-only build carries no French string.

Requirements: **I18N-06**, **I18N-08**

Success criteria (what must be TRUE):

1. A catalogue lookup returns the English base string, and a key with no value in the active
   catalogue falls back to English instead of rendering empty text.
2. The test suite rejects any catalogue value containing `<`, `>` or `"`, so no catalogue value can
   inject markup into a rendered page.
3. A count is selected by the locale's CLDR categories — 0 resolves to `one` in French and `other`
   in English, 1 000 000 resolves to `many` in French — never by a hand-written `n > 1` rule.
4. The build emits the French catalogue as its own chunk, and a build configured for English only
   contains none of the French catalogue's bytes.
5. The catalogue is importable by plain Node and by the browser build, and no catalogue key added an
   icon to the bundle.

Deliverable: one `t()` over JSON catalogues, with the escaping, plural and build contracts pinned by
tests before any string moves. — met, see
`phases/05-i18n-foundation-catalogue-contract/05-VERIFICATION.md` (5/5 success criteria, 20/20
must-haves) and the three plan summaries.

## Phase 6: English extraction & locale-aware formats ✅ complete

~1 800 string occurrences across 37 files move into the catalogue as a **pure, behaviour-preserving
refactor**: no string changes its meaning, and the existing Chromium tests stay green. Alongside
it, the hand-rolled `MON`/`MONL`/`WD`/`WDL` arrays, `fmtDate()`, `relDate()`, `ago()`, `dayBucket()`
and `fsize()` are replaced by `Intl`-backed, per-locale cached formatters, and the 16 measured
English plural sites are converted to catalogue plural objects. `dateFmt`/`timeFmt` gain an `'auto'`
sentinel so an unset preference follows the locale while an explicit choice still wins. The one
intentional behaviour change is the search comparison, which normalises both sides so an accented
name is found from an unaccented query.

Requirements: **I18N-01**, **I18N-03**, **I18N-04**, **SEARCH-01**

Progress: 1 of 14 plans done. Plan `06-01` built the measuring device the phase trusts —
`scripts/i18n-scan.mjs` (the static source scan, its position-scoped machine exclusions and the
catalogue-key family), `test/fixtures/i18n-pending.json` (the allow-list: 1700 entries over the
49 files that carry a user-visible literal) and the `prebuild` / `prebuild:en` build gate — and
proved it on one literal (`a11y.dismiss`). The phase's success criterion 1 is measured by the EMPTY
allow-list, which plan `06-10` proves; `I18N-01` stays pending until then.

Success criteria (what must be TRUE):

1. No user-visible literal is left inline in the interface sources: the static scan finds none, and
   the build fails when a new one is added. The scan reports every user-visible literal CLASS the
   interface renders — prose, attributes, toasts, helper arguments, display tables and the
   single-word capitalised display labels — and a raw coverage sweep proves that no class is
   left unreported.
2. The interface behaves exactly as it did before the extraction: every existing Chromium test
   stays green and no string changed its meaning. **Declared exception:** the settings page's
   time-format selector now shows the new `'auto'` option as selected when the preference is
   unset, because an unset preference follows the locale (D-04). The revert is real — removing
   the `'auto'` option from that row restores the previous rendering exactly. The exception is
   recorded in `06-CONTEXT.md` under "Declared English deltas".
3. The formatters are locale-driven — a test proves the French formatter produces `24/07/2026`, a
   24-hour clock and « il y a 2 jours », and the English build renders exactly as it did before.
4. Item counts use the locale's plural form rather than an English `+ 's'` rule.
5. Search finds an accented name from an unaccented query — "elodie" finds "Élodie" — and the sort
   order does not change.

**Plans:** 14 plans

Plans:
- [ ] 06-01-PLAN.md — the static source scan, the catalogue-key resolution, the shrinking
  allow-list, the build gate and the end-to-end tracer on one literal (wave 1)
- [ ] 06-02-PLAN.md — the `Intl` primitives, the per-locale format table and the ten formatters;
  the hand-rolled date API delegates (wave 2)
- [ ] 06-03-PLAN.md — the `'auto'` sentinel, the settings date/time rows and the preference write
  path (wave 3)
- [ ] 06-04-PLAN.md — the locale-driven weekday and month names; the four English arrays are
  deleted (wave 4)
- [ ] 06-05-PLAN.md — the accent-insensitive search, with the highlight window mapped back to the
  original text (wave 5)
- [ ] 06-06-PLAN.md — the 16 measured plural expressions become catalogue plural objects (wave 6)
- [ ] 06-07-PLAN.md — the sweep of the toast surface of the action module (wave 7)
- [ ] 06-11-PLAN.md — the sweep of the action module's modals, confirmations and accessible
  names, and of the six small action modules (wave 8)
- [ ] 06-08-PLAN.md — the sweep of the shell chrome and the shared ui helpers (wave 9)
- [ ] 06-12-PLAN.md — the sweep of the stored vocabulary, the core modules and the three feature
  modules (wave 10)
- [ ] 06-13-PLAN.md — the sweep of the task list and the five overlays (wave 11)
- [ ] 06-09-PLAN.md — the sweep of the three heaviest page modules (wave 12)
- [ ] 06-14-PLAN.md — the sweep of the thirteen remaining page modules (wave 13)
- [ ] 06-10-PLAN.md — the sweep of the six views and the entry; the allow-list reaches zero and
  the five success criteria are proven (wave 14)

Deliverable: the interface carries no inline user-visible string and formats dates, numbers and
counts for the active locale, with its English behaviour unchanged.

## Phase 7: French catalogue & French typography

The milestone's headline deliverable: a complete `fr.json` covering every key of the English
catalogue, in a consistent register, with the French typography rules applied by a linter rather
than by the eye — no-break and narrow no-break spaces before `: ; ! ?`, no-break space inside
guillemets, the curly apostrophe, the ellipsis, NFC-normalised accents, lowercase months. The
vocabulary the app stores as data (statuses, priorities, roles, permissions, project templates) is
keyed on its stable English id and translated at render, so the stored values never change. A
French-speaking read-through of the catalogue is an exit criterion.

Requirements: **I18N-02**, **I18N-05**, **I18N-07**

Success criteria (what must be TRUE):

1. Every key of the English catalogue has a French value, and every product surface — navigation,
   pages, modals, popovers, toasts, empty states, validation messages, the command palette, the
   settings, the authentication pages and the 404 page — renders in French.
2. French typography is applied throughout: a no-break space before `:`, a narrow no-break space
   before `; ! ?`, a no-break space inside guillemets, and the curly apostrophe.
3. Values the app stores as data are shown translated — a status reads "À faire", a role reads
   "Membre" — while the stored values stay exactly what they were.
4. The longer French strings fit the fixed-size chrome: the sidebar, the buttons and the modal
   footers are unbroken at 1280 px and at 390 px.

Deliverable: the whole interface reads as a French product, from the sidebar to the 404 page.

## Phase 8: Per-user locale & the honest selector

The locale leaves the shared workspace document and becomes an account property: a **nullable**
`users.locale` column added with the existing `ensureColumn()` helper, delivered by
`userPayload()` and settable through `PATCH /api/auth/me`. The server never writes it at boot, so
the second-boot byte-identical no-op guarantee survives; the column stays `NULL` until the user
chooses. On the client, the account locale is applied before the first render, the selector offers
only the languages that exist, and switching it re-renders without a reload. `prefs.lang` leaves
`DEFAULT_PREFS`, `docSnapshot()` and `applyDoc()`.

Requirements: **LOC-01**, **LOC-02**, **LOC-03**, **LOC-04**, **LOC-05**, **LOC-06**

Success criteria (what must be TRUE):

1. Choosing a language in the selector re-renders the interface in that language immediately, with
   no reload, and the account's language is applied before the first paint — the interface never
   flashes English.
2. The selector offers exactly two languages — English and Français — and no other language
   appears anywhere in the interface.
3. The language belongs to the account: it survives signing out, signing in again and opening the
   app from another browser, and two members of the same workspace each see their own language.
4. The language is gone from the shared workspace document: the document carries no language field,
   and changing the language does not touch the workspace row or move its revision.
5. An existing installation gains the column without data loss and without a migration backup, and
   a second boot stays a byte-identical no-op.

Deliverable: two members of one workspace see the interface in their own language, and the shared
workspace document no longer carries a language.

Plans: 4/4 plans complete + 1 gap-closure plan
**Wave 1**
- [x] 08-01-PLAN.md — the account owns the language: `users.locale` column, `PATCH /api/auth/me`, legacy `prefs.lang` stripped from the document pipeline (LOC-03, LOC-04, LOC-05)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 08-02-PLAN.md — boot negotiation, silent prime, lifecycle application and the guarded migration seed (LOC-06, LOC-03)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 08-03-PLAN.md — the honest two-option selector, instant no-reload switch, browser proof (LOC-01, LOC-02)

**Wave 4** *(gap closure — G-08-1, from 08-UAT.md)*
- [x] 08-04-PLAN.md — cold-start boot regression: default admin fallback email passes `emailOk` (G-08-1)

## Phase 9: Server messages & activity history

The two remaining sources of English. Server errors gain a **stable machine code** beside their
unchanged English message — the payload shape does not change, the client translates the code and
falls back to the English string when it does not know it. The activity log is restructured to
machine verbs with structured `extra`: the filters stop parsing English and classify the stored
verb instead, so existing documents keep filtering correctly with no migration, and legacy English
prose detail is suppressed at render rather than leaked.

Requirements: **ERR-01**, **ERR-02**, **ACT-01**, **ACT-02**

Success criteria (what must be TRUE):

1. A failed action shows its message translated in the interface language, from a stable machine
   code carried beside the server's unchanged English message.
2. An error whose code the client does not know still shows the server's message — no toast is ever
   empty.
3. The activity log renders in the interface language, and the comments, status-change and
   project-change filters still select exactly the right entries.
4. Activity entries written before this milestone are still listed and still filterable; their
   legacy English prose detail is dropped rather than leaked.

Deliverable: server errors and the shared activity log no longer leak English into a French
interface.

## Phase 10: Browser coverage in both locales

The eight untested flows become Chromium tests. They are selected by visible text, so translating
the interface translates the selector — which is why the milestone couples the French UI and the
browser coverage. Each flow asserts at least one `aria-label`, `data-tip` or toast, because that
is where leaks live. The existing tests are pinned to English so they keep asserting what they
assert today, and a two-account test proves two members of the same workspace see their own
language across a reload, a workspace switch and a second browser context.

Requirements: **UAT-01**, **UAT-02**, **UAT-03**, **UAT-04**, **UAT-05**, **UAT-06**, **UAT-07**,
**UAT-08**, **UAT-09**

Success criteria (what must be TRUE):

1. Each of the eight untested flows — onboarding wizard, invite modal, `/join` page, share modal,
   member removal, workspace switcher, plan change and project creation — completes in a Chromium
   test that asserts a visible label or toast, not only a click.
2. The same eight flows pass with the interface in French.
3. The existing Chromium tests stay pinned to English and assert what they assert today.
4. Two accounts in the same workspace — one English, one French — each see their own language
   across a reload, a workspace switch and a second browser context.

Deliverable: the eight unproven flows are proven by a real browser, in English and in French.

**Plans:** 3 plans

Plans:
- [ ] 10-01-PLAN.md — English pin (UAT-09), helper promotion (D-06), criterion-4 extension (UAT-06 exercised)
- [ ] 10-02-PLAN.md — flows spec: onboarding, invite modal, /join, share modal (UAT-01..04, en+fr)
- [ ] 10-03-PLAN.md — flows spec: switcher, member removal, project creation, billing-free proof (UAT-05..08, en+fr)

## Phase 11: French sweep, build gate & ship hardening

The guarantee becomes a shipped property. A sweep over the 21 product routes in French proves no
untranslated English string is served — with a coverage assertion beside it, so an empty page
cannot pass. A static scan of the sources fails the build on a new user-visible literal that never
reached a catalogue. The shipped artifact is verified: the French catalogue is in the built bundle
and in the Docker image, demo mode without a server is French and can switch language, and the app
still ships with no runtime dependency. The documentation states plainly what is translated (the
interface) and what is not (the demo seed content, the two prototype pages).

Requirements: **UAT-10**

Success criteria (what must be TRUE):

1. A sweep over the 21 product routes in French finds no untranslated English string in the served
   page, and the same surfaces are proven to contain French values.
2. The static scan fails the build when a user-visible literal is added without a catalogue entry.
3. The shipped image carries the French catalogue, demo mode without a server is French and can
   switch language, and the application still ships with no runtime dependency.
4. The documentation states what is translated (the interface) and what is not (the demo seed
   content, the two prototype pages), and the release notes record the milestone.

Deliverable: no route serves an untranslated English string, and the guarantee holds in the shipped
image.

## Phase list

- [x] **Phase 5: i18n foundation & catalogue contract** — `t()`, JSON catalogues, the escaping,
  plural and build contracts, pinned by tests
- [x] **Phase 6: English extraction & locale-aware formats** — every user-visible string in the
  catalogue, every date and number formatted for the locale, English behaviour unchanged, search
  finds an accented name from an unaccented query
- [x] **Phase 7: French catalogue & French typography** — a complete, correctly punctuated French (completed 2026-10-23)
  interface, stored vocabulary translated at render
- [x] **Phase 8: Per-user locale & the honest selector** — the language on the account, applied (completed 2026-10-24)
  before the first render, out of the shared document
- [x] **Phase 9: Server messages & activity history** — stable error codes, machine activity verbs,
  both rendered in the interface language
- [ ] **Phase 10: Browser coverage in both locales** — the eight untested flows proven in Chromium,
  in English and in French
- [ ] **Phase 11: French sweep, build gate & ship hardening** — the no-English-leak proof over the
  21 routes, the build gate, and the shipped artifact

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| I18N-01 | Phase 6 | Complete |
| I18N-02 | Phase 7 | Complete |
| I18N-03 | Phase 6 | Complete |
| I18N-04 | Phase 6 | Complete |
| I18N-05 | Phase 7 | Complete |
| I18N-06 | Phase 5 | Pending |
| I18N-07 | Phase 7 | Complete |
| I18N-08 | Phase 5 | Pending |
| LOC-01 | Phase 8 | Pending |
| LOC-02 | Phase 8 | Pending |
| LOC-03 | Phase 8 | Pending |
| LOC-04 | Phase 8 | Pending |
| LOC-05 | Phase 8 | Pending |
| LOC-06 | Phase 8 | Pending |
| SEARCH-01 | Phase 6 | Complete |
| ERR-01 | Phase 9 | Complete |
| ERR-02 | Phase 9 | Complete |
| ACT-01 | Phase 9 | Complete |
| ACT-02 | Phase 9 | Complete |
| UAT-01 | Phase 10 | Pending |
| UAT-02 | Phase 10 | Pending |
| UAT-03 | Phase 10 | Pending |
| UAT-04 | Phase 10 | Pending |
| UAT-05 | Phase 10 | Pending |
| UAT-06 | Phase 10 | Pending |
| UAT-07 | Phase 10 | Pending |
| UAT-08 | Phase 10 | Pending |
| UAT-09 | Phase 10 | Pending |
| UAT-10 | Phase 11 | Pending |

**Coverage:**
- v1.2 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0 ✓
- Phases: 7 (5–11) — every phase carries at least one requirement, every requirement appears in
  exactly one phase

### Phase 12: Real file uploads and previews

**Goal:** Replace the metadata-only file behaviour with real uploads: a server
endpoint that stores dropped files under `DATA_DIR`, real upload progress in
`handleFiles` (no simulated timer), real previews for PDFs and images, and a
working destination for « Copier le lien » (a served `file/:id` route or a link
to the parent task). Closes the known limitation "File contents are metadata
only; no binary upload backend".
**Requirements**: TBD
**Depends on:** Phase 11
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 12 to break down)
