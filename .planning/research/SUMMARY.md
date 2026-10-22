# Project Research Summary

**Project:** Gr8r Studio
**Domain:** Self-hosted project-management workspace — plain-ES-module SPA + single-Node/SQLite API
**Milestone:** v1.2 Localization (dependency-free i18n layer, complete French, per-user locale)
**Researched:** 2026-10-22
**Confidence:** HIGH

---

## Executive Summary

Gr8r Studio is a self-hosted project-management workspace: a hand-templated SPA (~1 800 user-visible
string occurrences across 37 files under `src/`), a single `server.js` on Node 24 with `node:sqlite`,
and one Docker image. Experts localise an app like this by *not* introducing a framework: the
platform `Intl` API already carries CLDR plural rules, locale date/number formats and relative time,
and a hand-written `t()` over JSON catalogues costs ~120 lines and zero bytes of dependency. The
research confirms the owner's decision emphatically — every credible i18n library measured
(`intl-messageformat` 10 kB gzip + 2 deps, `i18next` 13.8 kB gzip, `@lingui/core` needs a Babel macro
the project does not have, `@fluent/bundle` uses a different syntax and plural system, `nano-i18n`
is 5 years stale, `@comvi/core` is 2 days old and 6× its advertised size) is worse than the ~2.4 kB
hand-rolled layer. The recommended stack is: platform `Intl` only, JSON catalogues imported at build
time, `Intl.PluralRules` for plurals, and a CI-enforced catalogue lint.

The recommended architecture is a **leaf module `src/core/i18n.js`** that imports nothing but the
catalogues, holding the locale in a module-level mutable singleton — the exact house pattern
`src/core/utils.js` already uses for `dateFormat`/`setDateFormat()`. The locale becomes a **nullable
`users.locale` column** added with the existing `ensureColumn()` helper and delivered by
`userPayload()`; the server must **never** write it at boot, because `test/migration.test.mjs`
asserts that a second boot is a byte-identical no-op and a boot-time seed would break a guarantee
v1.1 shipped. The load-bearing ordering is **extract English first (a pure, behaviour-preserving
refactor), translate to French second** — so any visual regression is unambiguously in the catalogue
rather than half in the extraction.

The main risks are not technical but *editorial and mechanical*. Three of them dominate: (1) the
extraction sweep can silently bloat the icon bundle, because `vite.config.js`'s `lucideSubset()`
plugin scans every quoted lowercase token in `src/**/*.js` — so **every key must be dotted and
namespaced** and the catalogue must be `.json`, never `.js`, under `src/`; (2) French is ~20–30 %
longer than English and the CSS is sized in fixed units (252 px sidebar, fixed button heights, a
non-wrapping modal footer) — a length-budget test plus a CSS relaxation pass is mandatory; (3) the
shared workspace document stores English *prose* in three places (activity verbs + `extra`,
notification fragments, role display strings) whose filters parse that English — these must be
restructured to machine keys at write time and translated at render, never translated at write time.

---

## Key Findings

### Recommended Stack

The stack is settled: **platform `Intl` only, zero runtime dependencies.** The whole layer is
`src/core/i18n.js` (~120–150 lines, a documented ceiling) plus `src/locales/en.json` and
`src/locales/fr.json`. `Intl` is already in the browser and in Node 24 with full ICU 78.3, and every
behaviour the milestone needs was measured on this machine's interpreter. Nothing is added to
`package.json`; there is not even a `dependencies` block today, and one should not be created.

**Core technologies:**

- **Platform `Intl` API** (ECMAScript-402): plurals, dates, numbers, relative time, list formatting —
  free, Unicode-maintained, already present in both runtimes.
- **`Intl.PluralRules`**: the one part of ICU that must not be hand-rolled. French resolves to
  `one`/`other`/`many`; `select(0) === 'one'` (French says "0 fichier", English says "0 files") and
  `select(1000000) === 'many'`. A `n > 1 ? 's' : ''` ternary is wrong in French.
- **`Intl.DateTimeFormat` / `Intl.NumberFormat` / `Intl.RelativeTimeFormat`**: replace the
  hand-rolled `MON`/`MONL`/`WD`/`WDL` arrays, `fmtDate()`, `relDate()`, `ago()` and the raw
  `${n}` interpolation. Formatter objects **must be cached per locale** — construction is expensive
  and the board/table views call them 50+ times per render.
- **JSON catalogues, flat dotted keys**: a *lookup*, not a grammar. No runtime parser, no ICU
  escaping ambiguity, one property access per key, a two-line `Set` difference for the
  completeness test. Plurals are objects keyed by CLDR category (`{"one": …, "other": …}`) with the
  fallback `value[selected] ?? value.other`.
- **Build-time static import** (`import x from './locales/en.json'`): Vite 6 inlines JSON natively
  with no import attribute and no plugin; the catalogue travels inside `dist/assets/index-*.js`,
  which the Dockerfile already copies. No runtime fetch → no 404 class of bug, no flash of English,
  and demo mode (no server at all) still works.
- **Existing dev tooling only**: `node:test` for catalogue lint and unit tests, `@playwright/test`
  1.64.1 (Chromium 156 — every `Intl` API available) for the browser proof, ESLint 9 / Prettier 3
  for the no-literal-string gate. Vite's `build.target` stays at the `'modules'` default.

**What was deliberately rejected, with reasons:** `intl-messageformat` (ICU grammar ⇒ runtime
parser ⇒ dependency; 11× the size for ~30 plural strings), `i18next` (framework-shaped, 15×),
`@lingui/core` (needs a Babel macro; the project has no Babel), `messageformat` (MF2 ≠ ICU, runtime
parser), `@fluent/bundle` (own syntax, own plural system, last release 2025-04), `nano-i18n`
(unmaintained since 2021, no plurals/dates), `@comvi/core` (2 days old, TS-first, 11.6 kB gzip
measured), and all `@formatjs/intl-*` polyfills (953 kB–12.4 MB unpacked, for browsers this project
does not target).

### Expected Features

A "complete localisation surface" for this app is **five classes**, not one: (1) literal strings in
templates, (2) pseudo-strings — English *values* stored as data, (3) formats — dates, numbers,
plurals, sizes, durations, (4) server-emitted text — 62 error payloads and one invite email, (5)
document metadata and seed content. Missing any one produces a half-translated app that fails the
milestone's own no-English-leak test.

**Must have (table stakes):** the `t()` layer + JSON catalogues with no runtime dependency; English as
the base catalogue (~600–900 keys); `{name}` interpolation; CLDR-correct plurals; a missing-key
fallback to English; the per-user locale column + migration; a selector that offers **only EN and
FR**; `<html lang>` following the locale; every user-visible surface translated (sidebar/topbar, 13
page routes, 5 view routes, 10 modal types, ~22 popover types, the context menu, the drawer, 135+
toasts, notifications, empty states, client validation, the command palette, 18 settings sections,
10 auth states, the 6-step onboarding wizard, 404/403 pages); locale-aware dates, relative times,
day buckets, numbers, file sizes, durations and plurals; French typography (NBSP before `:`, narrow
NBSP before `;!?`, NBSP inside `« »`, `’`, `…`, sentence case, `N°`, 24-hour clock, `JJ/MM/AAAA`);
the 8 untested flows covered in Chromium in both locales; and the no-English-leak regression proof.

**Should have (differentiators):** the locale follows the *person* inside a *shared* workspace — the
document stays language-neutral and each member renders the stored English ids in their own
language; locale-correct *values* (statuses, priorities, roles, labels) displayed from stable
English ids; French typography done properly, which is the difference between a French UI and a
translated one; a locale-aware date *picker*, not just date display; a French UI that survives
15–20 % longer strings.

**Explicitly out (anti-features):** a translation-management UI; runtime machine translation; a
selector offering untranslated languages; per-string user overrides; RTL; locale-specific currency
(the billing is fake — the plan is a display value); a third language "because the file exists";
translating *user* content; translating the internal `design-system` / `states` prototype pages;
fetching the catalogue over HTTP.

### Architecture Approach

One new **leaf module** `src/core/i18n.js` (imports only the catalogues — no `utils.js`, no
`store.js`, no `render.js`, so the graph stays acyclic), plus `src/locales/*.json`, plus a locale
registry constant. The locale is a module-level mutable singleton read at call time — the same
pattern as `dateFormat`/`setDateFormat()` — never threaded through 1 800 call sites. `setLocale()`
sets `<html lang>`, writes the `localStorage` cache, and dispatches a `gr8r:locale` event that
`main.js` listens to and re-renders on (mirroring the existing `gr8r:save-error` pattern). Boot
order: a synchronous guess (`localStorage` → `navigator.languages` → `en`) covers the signed-out
screens, then `applyUser()` upgrades it to the account locale *before* the first `render()` — so
there is no flash of English, because nothing is painted before `render()`.

**Major components:**

1. `src/core/i18n.js` — locale singleton, `t()`, plural selection, cached `Intl` wrappers.
2. `src/locales/{en,fr}.json` — the catalogues; the single source of user-facing English.
3. `src/core/api.js` / `src/main.js` — the single integration point (`applyUser()`) and the boot order.
4. `src/core/store.js` — drops `prefs.lang` from `DEFAULT_PREFS`, `docSnapshot()` and `applyDoc()`.
5. `src/core/utils.js` — locale-aware `fmtDate`/`relDate`/`ago`/`dayBucket`/`fsize`, still
   store-free (a module-level `setLocale()` called from `theme.js:applyPrefs()`, like
   `setDateFormat()`).
6. `server.js` — `users.locale` (nullable, `ensureColumn`), `userPayload().locale`,
   `PATCH /api/auth/me {locale}` with `sameOrigin` + allowlist; **never** touches `workspaces.doc`
   or its revision.
7. `test/i18n.test.mjs` + `e2e/i18n.spec.mjs` — the unit/lint layer and the runtime proof.

### Critical Pitfalls

1. **The extraction sweep can silently bloat the icon bundle.** `vite.config.js`'s `lucideSubset()`
   scans every `src/**/*.js` file for quoted lowercase tokens matching a Lucide icon name
   (`['"`]([a-z][a-z0-9]*(?:-[a-z0-9]+)*)['"`]`). A key like `t('cancel')` pulls in the `Cancel`
   icon; `t('search')`, `t('copy')`, `t('filter')`, `t('user')`, `t('mail')`, `t('settings')`,
   `t('home')`, `t('list')`, `t('lock')`, `t('send')`, `t('check')`, `t('info')`, `t('archive')`,
   `t('eye')`, `t('plus')`, `t('star')`, `t('link')`, `t('share')` do the same. **Every key must be
   dotted and namespaced** (`action.cancel`, `nav.home`), and the catalogue must be `.json` under
   `src/locales/` — a `.js` catalogue would be swept into the icon set by any single-word French
   value. Verify the ICONS set size after the sweep.
2. **The server must never write the locale at boot.** `test/migration.test.mjs:164-183` asserts a
   second boot is a byte-identical no-op (same `doc`, `updated_at`, `revision`, member ids, exactly
   one backup file). A boot-time locale seed, a locale written into `workspaces.doc`, a revision bump
   or a reuse of `migrateTenancy()` (which writes a second `vacuum into` backup) all break it. The
   additive `ensureColumn()` path touches no workspace row and is already proven.
3. **Translating the activity log at write time silently breaks the Activity filters.**
   `src/pages/activity.js:12-19` matches `a.verb.includes('comment')`,
   `/moved|completed|reopened/.test(a.verb)` and `a.verb.includes('project')`. `logAct()`
   (`src/core/store.js:244`) writes English verbs and a free-text `extra` that mixes data
   interpolations (`to ${fmtDate(nv)}`) with literal English fragments. Translate at write time and
   the filters return the wrong subset with no error.
4. **French is ~20–30 % longer and the CSS is fixed-size.** `--side-w: 252px`, `.btn { height: var(--h) }`,
   `.modal-f { display: flex }` with **no `flex-wrap`**, table headers with `white-space` rules.
   A "complete" French catalogue that is not length-budgeted produces a visually broken UI.
5. **A translated string can break the markup it is dropped into.** 175 `aria-label`, 49 `data-tip`,
   33 `placeholder` and 15 `title` attributes; `H()` (`modals.js:31`) interpolates raw. A `"` or `<`
   in a French value corrupts the element or breaks out of an attribute.
6. **The English-plural idiom.** 16 occurrences of `? 's' : ''` on 14 lines in `src/` (measured; the
   research documents estimated 37) plus a dozen other `n === 1` idioms. English treats 0 as plural,
   French does not.
7. **The half-extracted interface leaks English** because a hand-templated app has no framework to
   fail loudly: a missed string is simply an English word on a French page, invisible in code review.

---

## Resolved Conflicts

The four research documents disagreed on seven points. Each is decided here, with the reason.

### 1. Phase count and boundaries — **8 phases**

ARCHITECTURE proposed 9, PITFALLS proposed 5, FEATURES implied a 9-step order. **8 phases** are
adopted below. The reconciliation rules:

- **Extract English BEFORE translating to French** (non-negotiable; PITFALLS' Phase 2 merged the two
  and is wrong). The English sweep is a pure refactor with zero behaviour change; the French pass
  then touches one file. A visual regression is therefore unambiguously in the catalogue.
- **The catalogue location decision lands in Phase 1**, because it blocks the browser bundle *and*
  any future server-side use (the invite email). It cannot be deferred to a later phase.
- **The server never writes the locale at boot** — this splits the server work (Phase 2) from the
  catalogue work (Phase 1) and keeps both independently verifiable.
- PITFALLS' "Ship hardening" phase (5) is kept as Phase 8, because the guarantees only matter in the
  shipped artifact (Docker image, demo mode, CI).
- ARCHITECTURE's P1/P4/P5/P6/P7/P8/P9 collapse into Phases 1, 3, 4, 5, 6, 7, 8 below; its P2/P3
  (server + client wiring) merge into Phase 2.

### 2. Escaping contract — **`t()` returns plain text and never escapes**

ARCHITECTURE proposed `t()` escapes + a second `tText()`. STACK and PITFALLS proposed `t()` returns
raw text and every insertion point escapes. **The STACK/PITFALLS position wins, for a decisive
technical reason:** `toast()` (`src/ui/toast.js:14`) and `empty()` (`src/ui/helpers.js:59`) already
escape their own arguments, so an escaping `t()` double-escapes them; and a `t()` that escapes its
template but not its parameters forces `esc()` on each parameter at every call site, which
collides with `esc(t('key'))` at the attribute sites. One function, one behaviour:

> **Catalogue values are plain text. `t()` never escapes. Interpolated values are escaped by the
> caller with the existing `esc()` at the point of interpolation. A catalogue value may never
> contain `<`, `>` or `"`.**

This is enforced, not merely documented: the catalogue lint test rejects `<`/`>`/`"`; an ESLint local
rule (warn → error) flags a `t(` inside an attribute without `esc(`; and the French DOM render is
compared node-for-node against the English render to catch a broken attribute. French typography
uses `« »`, so rejecting the ASCII quote costs the French author nothing.

### 3. Server error strings — **additive `code`, English `error` kept as fallback**

FEATURES recommended the server return `{ error: { code, params } }`; the "no breaking API change"
constraint forbids replacing the `error` string that the client (and any API consumer) relies on.
**Resolution:** `{ error: '<the existing English sentence>', code: '<stable_code>' }`. The English
`error` stays — it is the fallback, the log line, and the non-French client's answer. The client
translates the **code** when it has a key and falls back to the English `error` when it does not. No
existing payload changes shape, so nothing breaks; the FR catalogue gains 58 error keys. The 62
`error:` payloads in `server.js` become 58 stable codes (`email_taken`, `workspace_changed`,
`invite_expired`, …). Client-side validation strings (`S.ui.errors.*`) become ordinary catalogue
keys. **Never translate a server message** — only a code, because a message is untrusted input.

### 4. The activity log — **machine verbs + structured `extra`, translate at render, no document migration**

The stored verbs are *already* short English tokens (`'moved'`, `'completed'`, `'created'`,
`'archived'`, `'restored'`, `'commented on'`, `'renamed'`) — 23 `logAct()` call sites, ~20 distinct
verbs — but the `extra` field mixes data interpolations (`to ${fmtDate(nv)}`, `from ${ST[old].name}
to ${ST[nv].name}`) with literal English fragments. Recommended approach, in order of cost:

1. **Never translate at write time.** The shared document stays language-neutral; the history is not
   frozen in the author's language.
2. **Convert the filters from English parsing to an explicit classification.** The three filters
   become a `verb → kind` lookup (`'moved' → 'status'`, `'commented on' → 'comments'`, …) keyed on
   the *stored* value. Because the stored values do not change, **existing documents keep working
   and no migration is required** — the English-regex dependency disappears without touching the
   shared document.
3. **Stop writing prose into `extra`.** New entries store structured params
   (`{ from: 'todo', to: 'done' }`); the renderer composes a localized sentence from a catalogue
   key. French past participles with *avoir* do not agree with the subject, so
   "Marie a déplacé" and "Jean a déplacé" are both correct — no gender agreement problem.
4. **Legacy entries (which stored English prose) are rendered with the verb localized and the prose
   suppressed** rather than shown in English. The raw data stays in the document; only the display
   is dropped. This is the one deliberate data-display compromise of the milestone and it must be
   recorded in the milestone notes. Reconstructing legacy prose is deferred — it would need a
   document rewrite, which is exactly what the second-boot guarantee forbids.

### 5. Pseudo-strings — **translate at render, never migrate the stored value**

Statuses (`STATUSES`), priorities (`PRIOS`), project statuses (`PSTAT`), labels (`LABELS`), roles,
permission levels, recurrence values, estimate values, sort/group field names, filter operators and
file-type names are stored as English **display values**. The rule: **the catalogue is keyed on the
stable English id** (`status.todo`, `role.owner`), the stored value stays as it is, and the renderer
maps id → localized label. The constants already separate `id` from `name`, so only `name` needs a
catalogue entry.

Two exceptions need a decision, and both are decided without a bulk document rewrite:

- **`memberProfile()` writes the role *display* string** (`'Owner'`) into the document, and so does
  the seed. **Recommendation:** change `memberProfile()` to write the machine key
  (`owner|admin|member|viewer`) for newly written member rows, keep a `label → key` fallback map for
  legacy documents, and change the seed to store keys. The seed is regenerated at Docker build time
  (`node scripts/export-seed.mjs`), so it is free. **No bulk document rewrite** — that is what would
  endanger the no-op guarantee. The existing e2e assertions (`getByRole('button', {name:'Member'})`)
  keep passing because the **EN** catalogue still renders "Member".
- **Project templates** (`TEMPLATES`: 7 names, 7 descriptions, 42 starter-task titles) are app-authored
  content, not user content. **Recommendation: in scope** — the picker is interface chrome, and a
  French user who creates a project from a French template and gets six English task titles has the
  most visible remaining leak in the product. They are the **designated first cut** if the milestone
  is at risk.

### 6. Seed content and the prototype pages — **decided, with reasons**

- **Seed / demo content stays English** (member names, job titles, project names, task titles,
  comments, file names, invoice rows). It is *user content*, and translating it would mean the demo
  no longer demonstrates a workspace whose members write in their own language — which is the whole
  point of a per-user locale. The **app-authored** exceptions inside the seed are translated: the
  notification fragments (which become catalogue keys, not prose) and the role values (which become
  machine keys). The product docs must state plainly: *the interface is translated; the demo
  content is English sample data.* This is PITFALLS' option (a), chosen deliberately.
- **`design-system` and `states` are excluded from the French catalogue.** They are internal
  prototype surfaces reached from the Help popover, not product screens; translating them doubles the
  key count for zero user value. Their **link labels are translated** (they are chrome), and the two
  routes are **excluded from the leak test by explicit route allow-list** — the proof must be
  scoped to product routes, and the exclusion is written down rather than hidden.

### 7. The plural rule and the catalogue format — **`Intl.PluralRules`, object-keyed plurals, no `select`**

`Intl.MessageFormat` is `undefined` in Node 24 **and** in Chromium (measured on both) — there is no
platform ICU MessageFormat, so a hand-written parser is required if the catalogue uses ICU syntax.
**Recommendation: confirm the subset as `{name}` interpolation + `{count, plural, one/other}` and
no `select`, and express it in the catalogue as an object keyed by CLDR category**
(`{"one": "{n} fichier", "other": "{n} fichiers"}`), not as inline ICU text. Rationale: the object
form needs no parser (which is the thing the zero-dependency constraint exists to avoid), has no
escaping ambiguity (`'` and `#` are ICU-only), and degrades gracefully —
`value[selected] ?? value.other` means a French author who omits `many` still gets a correct string
for 1 000 000, and one who adds `many` gets it for free. The **16 measured plural sites**
(14 lines) are converted to catalogue plural objects; French `0` is `one` ("0 fichier"), English `0`
is `other` ("0 files") — the two locales legitimately differ, and the plural unit test pins
`n = 0, 1, 2, 1 000 000` in both.

### 8. The `lucideSubset` build trap — **`.json` catalogues, dotted keys, verify the icon set**

**Recommendation, three rules, enforced:** (1) catalogues live in `src/locales/*.json` — the plugin's
walk is `/\.js$/.test(e.name)`, so JSON is invisible to it; (2) **no `.js` file may live in
`src/locales/`** — which means the locale registry constant lives in `src/core/i18n.js`, not in
`src/locales/registry.js` as ARCHITECTURE proposed; (3) **every key is dotted and namespaced**,
never a bare word. After the extraction sweep, the built `ICONS` set size must be compared against
the baseline — a key like `t('search')` would otherwise add a dozen icons nobody asked for.

### 9. Catalogue location — **`src/locales/{en,fr}.json`, importable by Vite *and* plain Node**

FEATURES wanted a path importable by plain Node (for the server-side invite email); ARCHITECTURE
wanted a browser-only path; STACK wanted `src/locales/*.json`. **Resolution:**
`src/locales/{en,fr}.json`. The browser imports it as `../locales/en.json` (Vite 6 inlines JSON
natively); the server, if it ever needs it, imports it as `./src/locales/en.json` with
`with { type: 'json' }` (stable in Node 24) — the same file, no duplication, no relocation later.
**Phase 1 must verify both import paths**; that verification is load-bearing for the test strategy,
because `test/i18n.test.mjs` then imports `src/core/i18n.js` directly in Node with no bundler. If
the server ever reads the catalogue (the invite email), the Dockerfile runtime stage must add
`COPY --from=build /app/src/locales ./src/locales`.

### 10. Catalogue loading — **both catalogues statically imported**

STACK recommends static EN + lazy `import.meta.glob` chunks for FR (verified: one chunk per locale,
French strings not in the main bundle). ARCHITECTURE recommends both static. **Resolution: both
static**, for three reasons: the catalogue must remain importable by plain Node (a Vite-only
`import.meta.glob` cannot be), two locales cost ~10 kB gzip on a 111 kB bundle (<10 %), and static
imports have no 404 / no-flash / no-demo-mode failure mode. The STACK-measured trap still applies
if a third locale ever lands: **do not statically import `en.json` *and* dynamically import it via
`import.meta.glob`** — Vite warns and keeps it in the main chunk. Revisit lazy loading at the third
locale, not before.

---

## Open Owner Decisions (recommended defaults recorded so the milestone is not blocked)

Each of these is a genuine product/editorial decision the research could not settle. A recommended
default is given so planning can proceed; none of them blocks Phase 1.

| # | Decision | Recommended default | Why | Cost to change later |
|---|----------|--------------------|-----|----------------------|
| D1 | **Server error strategy** | Additive `{ error: '<English>', code: '<stable>' }`; the client translates the code and falls back to the English string. | Resolves the FEATURES-vs-no-breaking-API conflict; the English message stays the fallback and the log line. | Low — adding codes later is additive. |
| D2 | **Invite-email language rule** | The email ships in the **inviter's locale** (the server has `ctx.user.locale`; the recipient may have no account). **Recommended: defer the email translation out of v1.2** (it is not in the milestone scope list) but design for it — the catalogue path is Node-importable from Phase 1, so v1.3 needs no relocation. If it must ship in v1.2, it additionally needs a Dockerfile `COPY src/locales`, a Node-side `t()`, and the replacement of `mailer.js:401`'s hard-coded `'en-US'` date format. | The email is the first French sentence a recipient sees, but it is also a sentence most recipients read once — and it drags in a Dockerfile change and a server-side catalogue read. `Accept-Language` parsing is **not** needed either way (the SPA is client-rendered). | Medium — a Dockerfile + server change. |
| D3 | **Plan display names** | Keep the **wire value** English (`'Free'`, `'Team'`, `'Business'` — the server validates against those ids) and translate only the **displayed label** (`Gratuit`, `Équipe`, `Entreprise`). The select stores the id, renders the translated label. | The server validates English ids; translating the stored value would break the change-plan request. | Low. |
| D4 | **Vouvoiement vs tutoiement** | **Vouvoiement**, applied consistently across the whole catalogue. | Enterprise/project-management tone; one editorial decision applied to ~900 keys. Changing it later invalidates the entire FR catalogue. | **High** — a full re-read of the catalogue. |
| D5 | **Inclusive written forms** | **Avoid the middle-dot forms** (`invité·e`, `connecté·e`). Prefer noun forms ("Invité", "Membre"), invariable constructions ("Bienvenue {name}", "Session ouverte en tant que {email}"), and "personne invitée" where a person is referenced. | The dot forms are typographically noisy in chips, table cells and `aria-label`s; the noun forms are gender-free and read naturally. This is a style choice, not a correctness one. | Medium — a targeted re-read of ~20 strings. |
| D6 | **French house style (France vs Canadian)** | **France** (AZERTY Global): U+00A0 before `:`, U+202F before `;!?`, U+00A0 inside `« »`, `’` apostrophes, `…` ellipsis, NFC-normalised accents, lowercase months, sentence-case headings. Canadian French follows English spacing for those marks. | Pick one and lint it; the typography lint is the highest-leverage CI guard in the milestone. The narrow NBSP is invisible in editors — the catalogue authoring notes must list the characters. | Medium — a mechanical re-lint plus a re-read. |
| D7 | **`Intl.MessageFormat` subset** | **Confirmed:** `{name}` interpolation + `{count, plural, one/other}`; **no `select`**, no `selectordinal`, no `offset`, no `#`. `Intl.MessageFormat` is `undefined` in Node 24 and Chromium (measured), so any ICU syntax requires a hand-written parser. Keep `src/core/i18n.js` under ~150 lines. | The zero-dependency identity of the project. | High — a catalogue-wide rewrite. |
| D8 | **Accent-insensitive search** | **In scope, contained:** normalise both sides with `normalize('NFD').replace(/[\u0300-\u036f]/g,'')` before the substring compare (so "elodie" finds "Élodie"). **`Intl.Collator('fr')` sorting is deferred** to a separate, order-sensitive work item with its own test, because it changes sort order and could break existing e2e order assumptions. | Searching "elodie" finding "Élodie" is a basic usability expectation; changing sort order is a behavioural change that must not ride along silently. Note the separate Active requirement ("close the substring-based recent-search leak") — same code path, but a different defect, and its documentation stays separate. | Low. |
| D9 | **`dateFmt` / `weekStart` / `tz` stay workspace-shared?** | **Yes — they stay workspace-shared in v1.2.** This milestone must not half-solve the open "per-user settings isolation" requirement. Two consequences: (a) introduce an **`'auto'` sentinel** for `dateFmt` and `timeFmt` so an unset value follows the locale (FR → `JJ/MM/AAAA` and 24-hour) while an explicit user choice always wins; `weekStart` default `1` (Monday) is already correct for France. (b) keep `tz` as a **display-only** value — it stores `'(GMT-07:00) Pacific Time'`, which `Intl.DateTimeFormat` rejects with a `RangeError`; format dates in the browser's resolved zone and defer the IANA migration. | Making them per-user is a different, larger requirement. The sentinel gives French defaults without touching the shared-pref model. | Medium — adding a sentinel to a shared pref. |
| D10 | **Seed content language** (decided) | Seed stays English; the app-authored fragments inside it (notification fragments, role values) are converted to keys/machine keys. Documented in README/DEPLOY. | See § Resolved Conflicts 6. | High. |
| D11 | **`design-system` / `states` pages** (decided) | Out of the French catalogue; link labels translated; the two routes are excluded from the leak test by an explicit allow-list. | See § Resolved Conflicts 6. | Low. |
| D12 | **Activity-log legacy detail** (decided) | Legacy English prose in `extra` is suppressed at render (verb still localized); no document migration. Recorded as a known limitation. | See § Resolved Conflicts 4. | Medium — a legacy-parsing pass later. |

---

## Implications for Roadmap

### Phase 1 — i18n foundation & catalogue contract

**Rationale:** every later phase depends on the `t()` contract, the escaping rule, the plural subset,
the catalogue format and its location. Changing any of them later means redoing 37 files. The
catalogue-location decision lands here because it blocks both the browser bundle and any future
server-side use.

**Delivers:** `src/core/i18n.js` (locale singleton, `t()`, `getLocale`/`setLocale`, plural selection,
cached `Intl` wrappers, the EN/FR registry constant); `src/locales/en.json` (seed) and
`src/locales/fr.json` (skeleton); `test/i18n.test.mjs` (plural unit test for `n = 0/1/2/1 000 000` in
both locales; catalogue lint: no `<`/`>`/`"`, placeholder parity, identical key sets, no
byte-identical FR value except an allow-list; a `package.json` assertion that `dependencies` is
absent); the French typography linter skeleton; the ESLint no-literal rule in **warn** mode; the
Node-import + Vite-bundle + `lucideSubset`-immunity verification.

**Addresses:** the `t()` layer and the catalogue format of the "selector changes the interface"
requirement.

**Avoids:** Pitfall 19 (the `t()` layer becomes a dependency), 3 (markup breakage — the contract is
defined here), 5 (plural engine), 15 (the `.js`-under-`src/` lucide trap), 16 (the typography lint
is written here, applied later).

**Uses:** platform `Intl`; `node:test`; ESLint local rule.

**Implements:** ARCHITECTURE Patterns 1, 2, 3, 5.

### Phase 2 — Per-user locale: schema, endpoint, client boot

**Rationale:** the locale must be per-user and the server must never write it at boot. This phase is
independent of Phase 1's *contents* and can be developed in parallel with it, but it is sequenced
here because the client wiring consumes the i18n module.

**Delivers:** `users.locale` as a **nullable** `text` column via `ensureColumn()` (no `NOT NULL
DEFAULT 'en'` — a default writes a value into every existing row and pre-chooses a preference the
user never expressed; `NULL` means "not chosen"); `userPayload().locale` (reaching `/api/auth/me`,
`/login`, `/signup`, `/invites/:token/accept` in one field); `PATCH /api/auth/me { locale }` with
`sameOrigin` + session + allowlist validation, which must **not** touch `workspaces.doc` or move its
revision; the client boot wiring (`applyUser()` as the single integration point, resolution order
server → `localStorage` → `navigator.languages` → `en`, `<html lang>` + `data-locale`, the
`gr8r:locale` event and re-render); removal of `prefs.lang` from `DEFAULT_PREFS`, `docSnapshot()` and
`applyDoc()`; normalization of the legacy `'English (US)'` value on read; the honest selector
(EN + FR only, values are locale *codes*, options derived from the registry); `test/locale.test.mjs`;
and `test/migration.test.mjs` extended with `users.locale` (asserting the column is `NULL` after the
first boot of a legacy database and that the second boot is still a byte-identical no-op).

**Addresses:** the "locale is a per-user preference, stored on the account and returned by the
server, with a migration" requirement, in full.

**Avoids:** Pitfalls 7, 8, 9, 17, 20 and 1 (the selector mechanism).

**Uses:** `ensureColumn()`, `userPayload()`, `sameOrigin()`; the Phase 1 registry.

**Implements:** ARCHITECTURE Pattern 4.

### Phase 3 — English extraction sweep (behaviour-preserving)

**Rationale:** ~1 800 occurrences across 37 files. A pure refactor first, translation second, so any
regression is unambiguously attributable. This is also where the catalogue becomes the single source
of user-facing English and the gates become meaningful.

**Delivers:** every user-facing literal moved to `t()`; `en.json` as the complete base catalogue; the
source-scan allow-list shrunk to empty; the ESLint rule flipped to **error**; pseudo-strings keyed on
their stable ids; `dayBucket()` returning a stable id instead of a visible string; the activity verbs
converted to keys with structured `extra`; the notification fragments converted to keys;
`TEMPLATES` moved to catalogue data; **the ICONS set size verified against the baseline** and every
key dotted/namespaced.

**Addresses:** the extraction half of "the selector changes the interface".

**Avoids:** Pitfalls 2, 3, 11, 14 and the lucideSubset trap.

**Uses:** the Phase 1 `t()` contract, lint rule and catalogue.

**Implements:** ARCHITECTURE Pattern 3.

### Phase 4 — Locale-aware formats, plurals & units

**Rationale:** dates, times, numbers and plurals are *behaviour*, not strings. This must land before
the French catalogue so the French author writes against a frozen surface (`24/07/2026`, `20:30`,
`1 250 000` with U+202F, `il y a 5 min`).

**Delivers:** `Intl`-backed `fmtDate`/`relDate`/`ago`/`dayBucket`/`fsize` with per-locale formatter
caching; `MON`/`MONL`/`WD`/`WDL` removed; `overlays/popovers.js:96` rewritten with
`weekday:'narrow'` (slicing a localized abbreviation is broken); the **16 plural sites** converted;
percentages, file sizes, estimates and durations formatted; the `'auto'` sentinel for `dateFmt` /
`timeFmt`; `tz` left display-only. **The English output is unchanged** — verified by the 6 existing
Chromium tests staying green.

**Addresses:** the format half of "the selector changes the interface".

**Avoids:** Pitfalls 5, 6 and the "constructing `Intl` objects per call" performance trap.

**Uses:** Phase 1's formatters; the `setDateFormat()` house pattern (`theme.js:applyPrefs()`).

### Phase 5 — French catalogue & French typography

**Rationale:** the milestone's headline deliverable. It lands only after the English extraction is
complete and the format strings are final.

**Delivers:** a complete `fr.json` (~600–900 keys) with plural objects; the French typography rules
(U+00A0 before `:`, U+202F before `;!?`, U+00A0 inside `« »`, `’`, `…`, sentence case, NFC,
lowercase months, `N°`, `Mo`/`Go`); the length-budget check (`fr.length <= en.length * 1.4`) as a
worklist; the vouvoiement register applied consistently; the inclusive-form decisions applied; the
French values for the pseudo-strings, the 7 templates and the 42 starter-task titles; the French
role phrases ("Propriétaire", "Administrateur", "Membre", "Invité").

**Addresses:** the translation half of "the selector changes the interface".

**Avoids:** Pitfalls 4 (length), 16 (typography) — the lint, not the eye, is the gate.

**Uses:** the frozen catalogue schema from Phase 1 and the format strings from Phase 4.

### Phase 6 — Error codes, activity history & the shared-data decisions

**Rationale:** the shared workspace document and the server payloads are the two remaining sources of
English leaks, and both need decisions that must not endanger the second-boot guarantee.

**Delivers:** the 62 `server.js` error payloads carry a stable `code` alongside the unchanged English
`error` (58 codes) with the client mapping code → FR key and falling back to the English string; the
client-side validation strings moved into the catalogue; the activity log restructured to machine
verbs + structured `extra` with a `verb → kind` classification replacing the English regex filters and
legacy prose suppressed at render; the notification-fragment legacy map (unknown fragments
suppressed, never leaked); `memberProfile()` writing the machine role key with a `label → key`
fallback for legacy documents; the seed's role values converted to keys; the D10/D11 scope decisions
implemented; the plan labels translated while the wire ids stay English.

**Addresses:** the "no English leaks" requirement for every non-template source.

**Avoids:** Pitfalls 11, 12, 13, 14 and the second-boot guarantee (no bulk document rewrite).

### Phase 7 — Browser coverage: the 8 flows in both locales + the French regression proof

**Rationale:** the milestone's acceptance criteria. All eight untested flows are selected in Chromium
by visible text, so translating the interface translates the selector — which is exactly why the
milestone couples "French UI" and "browser coverage".

**Delivers:** the 8 flows (onboarding wizard, invite modal, `/join`, share modal, member removal,
workspace switcher, plan change, project creation) covered **in EN and FR**, each asserting at least
one `aria-label` / `data-tip` / toast (that is where leaks live); the existing 6 Chromium tests
pinned to `locale: 'en'` in the fixtures; a dedicated French account; the **sentinel sweep** (every
EN catalogue value whose FR counterpart differs must be absent from the FR DOM) plus the
**FR-coverage assertion** (the same surfaces must contain FR values — otherwise an empty page would
pass) plus the **DOM node-count comparison** against the EN render (markup integrity); the
two-account different-locale test (one `en`, one `fr`, in the same workspace, across a reload, a
workspace switch and a second browser context); the `<html lang>` assertion; the accent-normalised
search.

**Addresses:** "the remaining UI flows are covered by Chromium" and "a regression test that proves the
interface is in French when the locale is `fr`, and that no English string leaks".

**Avoids:** Pitfalls 10, 18 and the visual half of Pitfall 4 (a 1280 px / 390 px pass).

### Phase 8 — Ship hardening, layout & docs

**Rationale:** the milestone's guarantees must hold in the *shipped artifact*, not just in the repo.

**Delivers:** verification that the French strings are inside `dist/assets/index-*.js`; the Docker
image carries them (and, if D2 pulls the email in, `COPY src/locales`); the demo mode (no server)
is French and can switch language; `npm ls --omit=dev --all` shows no runtime dependency; the CI gate
documented (lint in error mode + catalogue tests + e2e); the **layout hardening** — `.modal-f`
`flex-wrap`, `.btn` `min-width: 0` + `nowrap`, `.sitem` truncation — driven by the length-budget
worklist, plus a 1280 px / 390 px visual pass; the docs stating what is translated (the interface)
and what is not (demo seed content, the two prototype pages), plus the free-text search limitation;
the v1.2 changelog entry.

**Addresses:** the leak-proof requirement as a shipped property; the documentation half of the
Active requirements.

**Avoids:** Pitfalls 4, 15 and the "demo mode is English-only" operational trap.

### Phase Ordering Rationale

- **Phase 1 first** because every later phase depends on the `t()` contract, the escaping rule, the
  plural subset and the catalogue location; changing them later means redoing 37 files.
- **Phase 2 second** because the locale is the input the whole layer needs, and it is independent of
  the catalogue's *contents* (it can be developed in parallel with Phase 1 in practice).
- **Phase 3 before Phase 5** — the load-bearing ordering decision. The English sweep is a
  behaviour-preserving refactor verified by the existing 6 Chromium tests; the French pass then
  touches one file. PITFALLS' original Phase 2 merged the two and is therefore rejected.
- **Phase 4 before Phase 5** so the French author writes against frozen French date/time strings.
- **Phase 6 after Phase 5** so the error codes, the activity restructure and the legacy maps are
  written once, against a complete catalogue, and so any shared-document decision is made with the
  French surface visible.
- **Phase 7 after Phases 5 and 6** — the browser proof needs the French catalogue, the error codes
  and the selector.
- **Phase 8 last** — the guarantees only matter in the built artifact.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 1:** the `with { type: 'json' }` import must be verified in *both* Vite 6 and plain Node 24
  in the first commit of the phase — it is load-bearing for the test strategy (if it fails, the
  fallback is ESM catalogues, a two-line change). The exact escaping boundary at 1 800 call sites
  and the ESLint rule's detection heuristic also need a spike before the sweep.
- **Phase 2:** the `users.locale` write path touches the auth surface — the `sameOrigin` guard, the
  allow-list, the "must not move the revision" assertion and the extended `migration.test.mjs`
  snapshot are all non-obvious. Needs a plan-time check of the auth middleware's behaviour.
- **Phase 3:** the highest-risk phase by volume (37 files, ~1 800 sites). Needs a plan-time decision
  on how the sweep is sequenced so it stays reviewable and revertible, and a verification that the
  ICONS bundle did not grow.
- **Phase 4:** the `dateFmt`/`timeFmt` `'auto'` sentinel touches a *shared* preference and the
  `weekStart`/`tz` surfaces. Needs plan-time confirmation of how the sentinel round-trips through the
  shared document.
- **Phase 6:** the activity-log restructure touches the shared document's write path and the
  document's backward compatibility. Needs plan-time confirmation of the legacy-suppression UX and
  the role-key fallback.
- **Phase 7:** the 8 flows are the least-specified part of the milestone (their assertions do not
  exist yet). Needs a plan-time pass to write the flow specs before the tests.

Phases with standard patterns (skip research-phase):

- **Phase 5:** catalogue authoring is content work with a frozen schema and a linter; the risk is
  editorial (French quality), not architectural. A French-speaking review pass is needed, not more
  research.
- **Phase 8:** standard build/Docker/docs hardening with an established pattern.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | Every `Intl` output measured on the project's own Node 24.21.0 (ICU 78.3); every Vite behaviour (JSON inlining, chunk splitting, `build.target`) verified by building scratch projects with the installed Vite 6.4.4; every library size/dependency/maintenance figure taken from the npm registry and bundlephobia and measured from the tarball where it mattered. The only judgement (JSON-with-objects over ICU) is well-grounded but is still a judgement. |
| Features | **HIGH** | The inventory was read directly out of the repository — every file, route, modal, popover, string and count named in FEATURES.md exists in the tree. The 8 flows and their assertions were verified against the current code. |
| Architecture | **HIGH** for the structure (every boundary anchored to a file and line; the leaf-module/singleton pattern mirrors an existing house pattern; the migration constraint is proven by a named existing test). **MEDIUM** for the escaping contract, which was contested between two documents and is resolved here on technical grounds, not on evidence. |
| Pitfalls | **HIGH** for the code-anchored claims (measured `Intl` behaviours, verified grep counts, read line ranges). **MEDIUM-HIGH** for the French typography rules, which come from one style guide (AZERTY Global) plus the Canadian variant — a style decision, not a fact. |

**Overall confidence:** **HIGH** for the mechanism, the phase structure and the risk list;
**MEDIUM** for the editorial decisions (house style, inclusive forms, register) — those need a
French-speaking reviewer, not more research.

### Gaps to Address

- **The key inventory was not enumerated.** The research sized the work (~1 800 occurrences, 37
  files) and settled the *mechanism*, but did not extract the exact key list. The plan phase must do
  the mechanical extraction; the catalogue will not be ~600–900 keys by estimate, it will be whatever
  the sweep produces. Where the research estimated 37 plural sites, **16 occurrences on 14 lines
  were measured** — treat the plural count as 16, not 37.
- **No French native reviewer has validated the catalogue.** The typography lint catches the
  mechanical errors (NBSP, apostrophes, ellipsis, NFC); it cannot catch an idiom that reads wrong. A
  French-speaking read-through of the catalogue is a milestone exit criterion and should be scheduled
  as part of Phase 5 or Phase 8.
- **`Intl.DisplayNames` is below the Safari 14.0 floor** (Safari 14.1). The registry hard-codes the
  two native names ("English", "Français") — no feature detection needed.
- **`Accept-Language` parsing is deliberately skipped.** The SPA is client-rendered, so the header
  cannot change the HTML; it would only matter for the invite email, which is deferred under D2.
- **The activity log's legacy detail is dropped from the display.** If the owner wants it back, it
  needs a legacy-parsing pass or a careful document migration — both deferred.
- **`tz` needs an IANA migration** before it can drive `Intl.DateTimeFormat`. Deferred under D9.
- **The icon-bundle delta is asserted, not measured per key.** Phase 3 must compare the built ICONS
  set against the baseline; a bare-word key is the failure mode and it is invisible in review.
- **The length budget is a proxy, not a visual test.** `fr.length <= en.length * 1.4` produces a
  worklist; the actual proof is the 1280 px / 390 px visual pass in Phase 8.
- **A carried-over Active requirement is out of scope here:** "harden the membership surface"
  (`sameOrigin` on invite accept, no admin link-only invites, no `firstWorkspace()` fallback, no
  guest-profile spoof) is a v1.1-audit item, not a localisation item. It is listed in
  `PROJECT.md`'s Active requirements and needs an owner decision: carry it in this milestone as a
  separate phase, or defer it to v1.3. **Recommendation: defer** — it shares no code with the
  localisation surface except `server.js`'s auth middleware, and mixing it in would muddy the
  milestone's acceptance proof.

---

## Sources

### Primary (HIGH confidence)

- **The Gr8r Studio codebase** — `src/core/utils.js` (`esc`, `MON`/`MONL`/`WD`/`WDL`, `setDateFormat`,
  `fmtDate`, `relDate`, `ago`, `dayBucket`), `src/core/store.js` (`DEFAULT_PREFS.lang`, `docSnapshot`,
  `applyDoc`, `logAct`, `ROLE_LABELS`), `src/core/constants.js` (`STATUSES`, `PRIOS`, `LABELS`,
  `PSTAT`, `ROLES`), `src/core/api.js` (`applyUser`, the `me`/`login`/`signup`/`acceptInvite` funnel),
  `src/main.js` (boot order, `documentElement.lang`), `src/core/theme.js` (`applyPrefs`),
  `src/shell/render.js` (the full-re-render loop, `ROUTE_NAMES`, `pageTitle`),
  `src/shell/layout.js` (the route table), `src/pages/*` (13 pages + 10 auth states + the 6-step
  onboarding + 18 settings sections + `notifText`), `src/views/*` (5 views), `src/overlays/*`
  (10 modals, ~22 popovers, drawer, context menu, palette, `PERMS`, `SHORTCUTS`, `TEMPLATES`),
  `src/actions/*` (135+ toast sites, the English validation strings, the `logAct` call sites),
  `src/ui/helpers.js` (`empty`, `fsize`, `data-tip`), `src/ui/toast.js` (`toast` and its own `esc`),
  `src/components/task-list.js` (`actHtml`), `src/data/seed.js` (539 lines of demo content),
  `server.js` (`SCHEMA`, `ensureColumn`, `openDb`, `userPayload`, 62 `error:` payloads, 9
  `httpError` sites, `migrateTenancy`, `backfillMemberships`, `memberProfile`, `ROLE_LABEL`),
  `mailer.js` (`buildInviteMessage`, the `'en-US'` date format), `vite.config.js` (the
  `lucideSubset()` plugin and its `.js`-only walk), `Dockerfile`, `index.html`,
  `test/migration.test.mjs` (the second-boot no-op assertion), `e2e/tenancy.spec.mjs` and
  `e2e/helpers/setup.mjs` (the English-selected assertions), `src/styles/*` (`--side-w`, `.btn`,
  `.modal-f`, `[data-tip]`).
- **Node 24.21.0 measured on the project interpreter** (`process.versions.icu = 78.3`) — every
  `Intl` output quoted in this summary: `PluralRules('fr')` (`one` for 0 and 1, `many` at 1 000 000),
  `NumberFormat('fr-FR')` (U+202F grouping, decimal comma, U+00A0 before `%`),
  `DateTimeFormat('fr-FR')` (`24/07/2026`, `20:30`), `RelativeTimeFormat('fr')` (`hier`,
  `avant-hier`), `DisplayNames`, `Collator('fr')` (e before é), and
  `typeof Intl.MessageFormat === 'undefined'`.
- **Vite 6.4.4 measured by building scratch projects** — JSON inlining, per-locale chunk splitting
  via `import.meta.glob`, the static/dynamic-import warning, the `'modules'` build target.
- **npm registry metadata + the bundlephobia size API** — versions, dependency lists, licences,
  publish dates, monthly downloads and minified/gzip sizes for every candidate library.
- **MDN browser-compat-data** — every `version_added` figure in the Safari/Chrome/Firefox support
  tables (the source of the `Intl.DisplayNames` / `Intl.ListFormat` / `Intl.Segmenter` fallbacks).

### Secondary (MEDIUM–HIGH confidence)

- **AZERTY Global, *French Typography: The Complete Guide*** (reviewed 2026-07-25) — NBSP before
  `:`, narrow NBSP before `;!?`, NBSP inside `« »`, `’`, `…`, accented capitals, lowercase months,
  sentence-case headings, `1er`/`2e` ordinals.
- **Government of Canada, *Punctuation: standard spacing in English and French*** — the
  Canadian-French spacing variant, the alternative considered under D6.
- **Unicode CLDR** — the per-language plural categories and the `one`/`many`/`other` model.
- **MDN / ICU MessageFormat syntax reference** — the plural model and the `select`/`selectordinal`
  constructs the hand-rolled parser must *not* implement.
- **Competitor observation** (Linear, GitLab, Notion, Taiga, Plane) — the completeness bar (Taiga and
  Plane both ship a complete French) and the GitLab failure mode (offering languages that are not
  genuinely translated).

### Tertiary (LOW confidence — needs validation)

- **The French catalogue's idiomatic quality** — no native reviewer has read it; the typography lint
  is a mechanical proxy only.
- **The length budget (`en.length * 1.4`)** — an estimated heuristic; the real proof is the visual
  pass at 1280 px / 390 px in Phase 8.
- **The `lucideSubset` icon-bloat magnitude** — asserted as a risk; the actual delta is only known
  after Phase 3 and must be measured against the baseline.

---

*Research completed: 2026-10-22*
*Ready for roadmap: yes*
