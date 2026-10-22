# Pitfalls Research

**Domain:** Adding internationalisation to an existing, framework-free, hand-templated SPA + Node/SQLite backend (Gr8r Studio v1.2)
**Researched:** 2026-10-22
**Confidence:** HIGH (every claim below was read out of the live codebase or measured with Node 24's ICU; web sources confirm the French typography and CLDR plural rules)

## How this document was built

This is not generic localisation advice. Every pitfall names a file, a line, a count or a
measured behaviour in **this** repository:

| Evidence used | Where it came from |
|---|---|
| ~1 800 string occurrences / 37 files | `.planning/PROJECT.md` (milestone scope) |
| 175 `aria-label="…"`, 49 `data-tip`, 33 `placeholder`, 137 `toast(` | `grep -ro` over `src/**/*.js` |
| 37 English plural concatenations (`? 's' : ''`) | `grep -ro "? 's' : ''" src/**/*.js` |
| `Intl.PluralRules('fr')`: `one` for 0 and 1, `other` otherwise, `many` at 1 000 000 | measured with `node -e` on Node 24 |
| `Intl.NumberFormat('fr-FR')` groups with **U+202F**, decimal comma, `%` preceded by **U+00A0** | measured with `node -e` |
| `Intl.DateTimeFormat('fr-FR', {dateStyle:'short'})` → `24/07/2026`; `timeStyle:'short'` → `20:30` | measured with `node -e` |
| `Intl.RelativeTimeFormat('fr')` → `hier`, `avant-hier` | measured with `node -e` |
| `Intl.MessageFormat` is **undefined** in Node 24 and Chromium | measured with `node -e` |
| `Intl.Collator('fr')` sorts `e` before `é` | measured with `node -e` |
| NBSP before `:`, narrow-NBSP before `; ! ?`, NBSP inside `« »`, curly apostrophe `’`, accented capitals, sentence-case headings, lowercase months | AZERTY Global, *French Typography: The Complete Guide* (reviewed 2026-07-25) |

---

## Critical Pitfalls

### Pitfall 1: The selector keeps offering languages that do not exist

**What goes wrong:**
`src/pages/settings.js:176` offers six languages —
`['English (US)', 'English (UK)', 'Deutsch', 'Español', 'Français', '日本語']` — and
`DEFAULT_PREFS.lang` in `src/core/store.js:15` is the *display string* `'English (US)'`.
Nothing behind that selector is translated: `prefs.lang` is a stored value only. A French
user who picks "Français" sees a byte-identical English interface. Worse, this is the exact
failure the milestone exists to kill ("the interface stops lying about languages"), and it is
the failure the owner already called out.

**Why it happens:**
The list is hand-written inline in the page. Nothing derives it from what actually exists,
so adding a language is a one-line edit that lies by default.

**How to avoid:**
- **Derive the option list from the catalogue files, not from a hand-written array.** The
  catalogue directory *is* the list of offered languages; a locale with no catalogue never
  appears. Delete the four phantom languages (Deutsch, Español, Français, 日本語) from the
  source, and English UK with them — only `en` and `fr` remain.
- Store the language **code** (`'en'`, `'fr'`), never the display name. `sel('lang', …, P.lang)`
  compares `String(v) === String(val)`, so a display string as a stored value is a bug waiting
  to happen; use `value="en"` / `value="fr"` and render the label with
  `new Intl.DisplayNames(['en'], {type:'language'}).of(code)` (verified: `en` → `English`,
  `fr` → `French`; `Intl.DisplayNames(['fr'],…).of('en')` → `anglais` — French is lowercase).
- **A test that fails the build** if the selector's option count ≠ the number of catalogue
  files. That is the only mechanism that makes the selector impossible to lie about.

**Warning signs:**
- A `<option>` whose value has no matching `locales/<code>.json`.
- The option list and the catalogue directory disagree in count.
- A locale code appears in `DEFAULT_PREFS` with no catalogue.
- `prefs.lang` still holds `'English (US)'` after the migration.

**Phase to address:** **Phase 3 — Per-user locale & the honest selector** (the catalogue
mechanism is built in Phase 1; the selector rewrite and the removal of the four phantom
languages land in Phase 3).

---

### Pitfall 2: Untranslated strings leak through a half-extracted interface

**What goes wrong:**
The interface ends up bilingual — French headings with English buttons, an English toast in
a French modal, an English `aria-label` on a French icon button. In a hand-templated app
there is **no framework to fail loudly**: a missed string is simply an English word on a
French page. It ships, and it is invisible in code review because each individual line looks
correct.

**Why it happens:**
The extraction is mechanical over ~1 800 occurrences in 37 files, and mechanical extraction
misses exactly the strings that are not literals in a template:
concatenations, values passed through helpers, and anything computed.

**How to avoid — three mechanical gates, all runnable in CI today:**

1. **A catalogue-completeness test (highest value, lowest cost).**
   Every key referenced by `t('…')` must exist in `en.json`; `en.json` and `fr.json` must
   have **identical key sets**; no orphans in either direction; and the placeholder sets
   (`{name}`, `{count}`) must match key-for-key between locales. This single test catches
   "translated but under a different key", "French missing", "placeholder dropped".
   It also produces the honest number the milestone needs (~600–900 keys).

2. **A lint rule that fails the build on a literal user-visible string.**
   `eslint.config.js` already exists and already runs in CI (`npm run lint`). A custom
   **local** rule (no dependency — the project has zero runtime deps and the tooling should
   match) can flag a literal string inside a template literal or inside an
   `aria-label=` / `placeholder=` / `title=` / `data-tip=` attribute in `src/**/*.js`.
   Run it in **warn** mode first to measure the blast radius, then flip to **error** once
   the catalogue is complete. This is the "no literal user-visible string outside a
   catalogue" gate the milestone asks for, and it is the only gate that keeps the catalogue
   from rotting *after* the milestone.

3. **A rendered-DOM leak test.**
   Render every route in `fr`, then assert the DOM contains no word that appears in the
   English catalogue and not in the French one. Build the forbidden-word list **from the
   catalogues themselves** (English values not present in French), not from a hand-written
   list of English words — that keeps it maintainable and catches exactly the leak. Also
   assert the reverse on the `en` render, so the English base stays English.

**Warning signs:**
- `grep -ro "t('" src | wc -l` disagrees with the number of keys in `en.json`.
- A key exists in `en.json` but is never called (orphan → the English text is invisible).
- The DOM-leak test's forbidden list is hand-maintained instead of derived.
- A French screenshot shows an English fragment in a corner (toast, tooltip, empty state).

**Phase to address:** **Phase 1** (the `t()` layer + the catalogue-completeness test + the
lint rule in warn mode) and **Phase 2** (the extraction and the French catalogue; the lint
rule flips to error at the end of Phase 2).

---

### Pitfall 3: A translation breaks the markup it is dropped into

**What goes wrong:**
The app builds HTML by hand. `t()` output lands in three different contexts and each has a
different escaping rule:

| Context | Example in this repo | What breaks |
|---|---|---|
| Raw HTML text node | `modals.js:31` — `H = (title, sub) => \`<h2 …>${title}</h2>\`` — **no `esc()`** | a `"` or `<` in a French string corrupts the element; `&` starts an entity |
| Attribute value | `aria-label="${esc(label)}"` (`modals.js:64`), 175 `aria-label` sites, 33 `placeholder`, 15 `title` | an unescaped `"` closes the attribute early and the rest of the string becomes DOM text |
| CSS tooltip | `data-tip="…"` → `content: attr(data-tip)` (`src/styles/components.css:167`) | the attribute breaks; the tooltip text leaks into the page |

A French string containing `"` — `"Créer une tâche"` with straight quotes, a quoted status
name, `«` used with a straight `"` — breaks the attribute. A French string with `&`
(`"Rechercher & filtrer"`) becomes an entity. A string with `<` (`"< 5 jours"`) opens a tag.

**Why it happens:**
The renderer has **no escaping discipline** today: `H()` interpolates raw, some call sites
escape and some do not, and there is no framework to normalise it. A `t()` layer that
returns raw text inherits that chaos. Conversely, a `t()` that returns *pre-escaped* text
cannot be used in a text node without double-escaping, and cannot be used for a
non-HTML context at all (a `data-*` attribute, an `Intl` argument, a `title` used as a key).

**How to avoid:**
- **One rule: `t()` returns raw text; every insertion point escapes.** Add `esc(t('key'))`
  in text nodes and attribute values alike. The lint rule from Pitfall 2 should also flag
  `t('…')` appearing inside an attribute without `esc()`.
- **Catalogue validation test:** every value in every catalogue must contain none of
  `<`, `>`, `"` and must not contain a bare `&` that is not part of an entity. A French
  catalogue that needs a quotation mark uses `« »` or `“ ”`, not `"`.
- **Placeholder validation:** a `{` in a French value that is not in the English value's
  placeholder set must fail the build (otherwise the UI shows a literal `{count}`).
- **A DOM-parses test:** render each page in `fr` and assert the resulting DOM has no
  unexpected extra elements and no text fragments that came from a broken attribute —
  e.g. assert `document.querySelectorAll('[aria-label]')` count equals the English render's
  count. A broken attribute shows up as an *extra* element or as text leaking into the body.
- Note `esc()` (`src/core/utils.js:10`) escapes `'` → `&#39;` but not `’` (U+2019). The
  French catalogue should use `’` (the curly apostrophe, standard in published French per
  AZERTY); a straight `'` in a catalogue is legal but stylistically wrong for French prose.

**Warning signs:**
- Any `t(` inside an attribute value without `esc(`.
- A catalogue value containing `<`, `>`, `"` or a raw `&`.
- `H(t('…'))` — `H` does not escape.
- The French DOM has more nodes than the English DOM for the same route.

**Phase to address:** **Phase 1** (define the escaping contract and the catalogue validator)
and **Phase 2** (apply it at every extraction site).

---

### Pitfall 4: French is ~30% longer and the layout is fixed-size

**What goes wrong:**
The CSS is sized in fixed units that were tuned against English strings:

| Element | Rule | Failure with French |
|---|---|---|
| Sidebar | `--side-w: 252px`, `--side-row: 30px`, `.side { overflow: hidden }` (`src/styles/shell.css:18`, `tokens.css:87`) | "Mes tâches" / "Vue d'ensemble" clipped at the panel edge |
| Buttons | `.btn { height: var(--h) }` — fixed height, `padding: 0 11px` (`components.css:4`) | "Enregistrer les modifications" overflows the footer |
| Modal footer | `.modal-f { display: flex }` — **no `flex-wrap`** (`overlays.css:63`) | two French buttons + `.sp` overflow the modal width |
| Table headers | `.th` cells with `white-space` rules | "Date d'échéance" wraps or truncates |
| Segmented controls | `.seg` buttons | "Statut" → "Statut du projet" |

**Why it happens:**
English was the only language the CSS was ever checked against, and the fixed heights are
invisible until a string grows. A French catalogue that is "complete" but not length-budgeted
produces a UI that is technically translated and visually broken.

**How to avoid:**
- **A length-budget test in the catalogue:** for every key, assert
  `fr.length <= en.length * 1.4` (allow a little headroom; French averages +20–30 %).
  A key that fails is a key that must be shortened *or* whose container must be widened.
  This is a static, cheap, CI-able proxy for the visual bug — and it produces a worklist.
- **Allow the layout to breathe before translating:** add `flex-wrap: wrap` to `.modal-f`,
  allow `.btn` to grow with `min-width: 0` and `white-space: nowrap`, and give `.sitem`
  labels `overflow: hidden; text-overflow: ellipsis; min-width: 0` (the `.trunc` class
  already exists in `base.css:91`).
- **Visual review at two widths** — 1280 px and 390 px — on the surfaces with the longest
  strings: the modal footers (`Save changes` → `Enregistrer les modifications`), the sidebar
  (`Overview` → `Vue d'ensemble`), the project tabs, and the table headers.
- Keep French short where French allows it: `Enregistrer` is a fine `Save`; prefer
  `Créer` over `Créer une tâche` where the context is already a form titled "Nouvelle tâche".

**Warning signs:**
- The length-budget test reports > 5 % of keys over budget.
- A French button's label is visually cut or overlaps its neighbour.
- The sidebar shows an ellipsis on a nav label in French but not in English.

**Phase to address:** **Phase 2** (catalogue authoring with the budget in the loop) and
**Phase 4** (the Chromium pass that catches the visual regressions at 1280/390 px).

---

### Pitfall 5: English plurals baked into the string — and French disagrees about zero

**What goes wrong:**
The codebase pluralises by appending `s` in 37 places, e.g.

- `src/actions/actions.js:1010` — `toast(\`Updated ${ids.length} task${ids.length > 1 ? 's' : ''}\`)`
- `src/actions/actions.js:1015` — `title: \`Delete ${ids.length} task${ids.length > 1 ? 's' : ''}?\``
- `src/overlays/modals.js:58` — `${m.nf} filter${m.nf > 1 ? 's' : ''} will be saved with this view.`
- `src/pages/auth.js:171` — `${n} invite${n > 1 ? 's' : ''} sent`
- `src/actions/teams.js:102` — `${n} member${n > 1 ? 's' : ''} will have no team`

The pattern is `n > 1 ? 's' : ''`, i.e. **English treats 0 as plural** ("0 files"). French
does not: `Intl.PluralRules('fr').select(0) === 'one'` (verified) — French says
**"0 fichier"**, singular. The `n > 1` idiom translated literally produces "0 fichier"
in English and, if mechanically converted, "0 fichier" in French while the French grammar
wants "0 fichier" — but the real breakage is the *word choice*: French needs
"fichier" / "fichiers" chosen by the CLDR rule, not by `n > 1`. French also has a `many`
category: `select(1000000) === 'many'` (verified), which a two-form catalogue cannot express.

**Why it happens:**
English's two forms collapse into a ternary that no one flags. It reads as a formatting
detail, not a grammar rule.

**How to avoid:**
- **Use `Intl.PluralRules` and a bounded message subset.** `Intl.MessageFormat` does **not**
  exist in Node 24 or Chromium (verified `undefined`), so a hand-rolled parser is required.
  Implement exactly this subset and nothing more:
  `{count, plural, one{<msg>} other{<msg>}}` — sufficient for `en` and `fr`, whose categories
  are `one`/`other` (+ `many` for `fr` at 1 000 000, which `other` can safely absorb if the
  wording is chosen to be number-agnostic).
- **Cap the complexity of `src/core/i18n.js`.** The project's identity is "no runtime
  dependency"; a hand-rolled `t()` must not grow into an ICU clone. A ceiling of ~120 lines
  with a documented subset is the right size for a two-locale app.
- **A plural unit test** that asserts the rendered string for `n = 0, 1, 2, 1 000 000` in
  **both** locales, and that English and French use different word forms where they should.
  This is the test that would have caught `n > 1`.

**Warning signs:**
- Any remaining `? 's' : ''` or `` `${n} ${word}${n>1?'s':''}` `` in `src/`.
- A French toast reading "0 tâche" where the French rule wants "0 tâche" but English logic
  produced "0 tasks"→"0 tâche" by accident — the real tell is a French string that still
  contains a Latin `s` at the end of a noun.
- A count interpolated directly into a French sentence (`"${n} invitation envoyée"`).

**Phase to address:** **Phase 1** (the plural subset in the `t()` layer) and **Phase 2**
(every one of the 37 sites converted; the plural unit test lives in Phase 1).

---

### Pitfall 6: Dates, relative times, numbers and day buckets are not locale-aware

**What goes wrong:**
`src/core/utils.js` hardcodes a whole English date system:

- `MON` / `MONL` / `WD` / `WDL` — English month and weekday names (`utils.js:40-43`).
- `fmtDate(s, long)` (`utils.js:49`) — hand-rolled `MMM d` / `d/M` / `M/d` / `yyyy-MM-dd`,
  driven by the shared pref `prefs.dateFmt`. Its `d/M` branch is `d/m` — **day/month with
  no year**, which is not `JJ/MM/AAAA`.
- `relDate(s)` (`utils.js:58`) — returns `'Today'`, `'Tomorrow'`, `'Yesterday'`, or a
  weekday name.
- `ago(ts)` (`utils.js:67`) — returns `'just now'`, `'5m ago'`, `'3h ago'`, `'2d ago'`.
  These are **abbreviations**, not translatable words: `ago` has no grammatical subject in
  French ("il y a 5 min").
- `dayBucket(ts)` (`utils.js:78`) — returns `'Today'`, `'Yesterday'`, `'This week'`,
  `'Earlier'`. These strings are used **as map keys** (`src/pages/activity.js:23` —
  `b[dayBucket(a.at)] ||= []`) **and** as the visible heading (`activity.js:40` —
  `<div class="day-h">${k}</div>`). Translating the function's return value breaks the
  grouping; translating it at the render site is correct.
- Numbers: file sizes, percentages, member counts, progress — all rendered with plain
  `String(n)` or template interpolation.

**Why it happens:**
The date code predates the locale concept and lives in `utils.js`, which **deliberately has
no store dependency** (`utils.js:44` — *"Set from preferences on every render (core/theme.js),
so utils never depends on the store"*). The i18n layer must respect that boundary.

**How to avoid:**
- Use the platform APIs, not hand-rolled arrays:
  `new Intl.DateTimeFormat(locale, {dateStyle:'short'})` → `fr` gives **`24/07/2026`**
  (JJ/MM/AAAA) versus `en-US` `7/24/26`; `{timeStyle:'short'}` → **`20:30`** (24-hour
  clock, no AM/PM) for `fr`; `new Intl.RelativeTimeFormat('fr', {numeric:'auto'})` →
  `hier`, `avant-hier` (not "Yesterday"); `new Intl.NumberFormat('fr-FR')` → **`1 250 000`**
  with **U+202F narrow no-break space** as the group separator, decimal **comma**, and
  `4 %` with **U+00A0** before the percent sign (all measured on Node 24).
- **Keep the machine keys English.** `dayBucket` should return `'today' | 'yesterday' |
  'week' | 'earlier'` and the *render* maps them to labels. Same for `relDate`.
- **Keep `utils.js` store-free:** add a module-level `setLocale(locale)` next to the
  existing `setDateFormat(f)` and have `core/theme.js:applyPrefs()` call it on every render,
  exactly like `setDateFormat(p.dateFmt)` (`theme.js:8`). `applyPrefs()` already sets
  `data-theme`, `data-accent`, `data-side`, `data-density`, `data-motion` on `<html>` —
  a `data-locale` attribute fits the pattern and gives CSS a locale hook.
- **`dateFmt` must become per-user.** It is currently `prefs.dateFmt` — a *shared
  workspace* pref. One member setting `JJ/MM/AAAA` would change it for everybody. In French
  the format is dictated by the locale, so the French catalogue should not offer the
  English `M/d` option at all.

**Warning signs:**
- `MON`, `MONL`, `WD`, `WDL` still present in `utils.js`.
- `ago()` still returns `'m ago'` / `'h ago'`.
- `dayBucket` returns a string that is also used as an object key.
- A French date rendered as `Oct 1` or `10/1/2026`.
- A French file size rendered as `1250000` or `1,250,000`.

**Phase to address:** **Phase 1** (`setLocale`, `Intl`-based formatters, the plural and
date unit tests) and **Phase 3** (moving `dateFmt` off the shared document onto the account).

---

### Pitfall 7: The locale lands in the shared workspace document and changes everyone's language

**What goes wrong:**
`prefs.lang` today lives in the **shared** workspace document. `src/core/store.js:95`:

```js
const docSnapshot = () => ({ data: S.data, prefs: S.prefs, views: S.views, collapsed: S.ui.collapsed });
```

`prefs` — including `lang` — is written into the shared `workspaces.doc` JSON and pushed to
every member. And `applyDoc()` (`store.js:173`) does:

```js
S.prefs = Object.assign({}, DEFAULT_PREFS, doc.prefs || {});
```

So if the per-user locale is applied **before** `applyDoc()`, the shared document's
`prefs.lang` overwrites it; if applied **after**, it works — but the shared `prefs.lang`
is still being written on every save, so the last member to change a *different* preference
still ships their language to the document. Either way the shared copy is a live bug.

**Why it happens:**
`prefs` was designed as a single shared bag of workspace preferences. Moving one field out
of it requires *removing* it from the bag, not just adding a new source.

**How to avoid:**
- **Remove `lang` (and `dateFmt`) from `docSnapshot()`** and from `applyDoc()`. The
  per-user locale must be the only source of truth.
- Add `users.locale` (server) and return it from `userPayload()` (`server.js:244`, which
  currently returns only `id`, `email`, `name`, `workspaces`).
- **Apply the server locale after `applyDoc()`** and after `hydrateFromServer()`; make the
  ordering explicit and comment it, because the failure mode is silent.
- **The old `prefs.lang` value must be ignored, not migrated into the document.** Any
  attempt to backfill the new per-user locale from the shared `prefs.lang` would write to
  the document and break Pitfall 9.
- **A two-member test:** two accounts in the same workspace, one `en`, one `fr`; each must
  see its own language after a reload and after a workspace switch. This is the only test
  that catches it, and it must be in the browser suite (a server test cannot see the
  document's `prefs`).

**Warning signs:**
- `prefs.lang` still appears in `docSnapshot()`'s output.
- `applyDoc()` runs after the locale is set.
- Two members of one workspace report different languages on different pages.
- The `workspaces.doc` JSON contains a `prefs.lang` key after the change.

**Phase to address:** **Phase 3 — Per-user locale end-to-end** (column, `userPayload`,
selector, removal from the shared document).

---

### Pitfall 8: A localStorage-only locale does not follow the user to another browser

**What goes wrong:**
The demo/offline path persists the whole snapshot under `STORE_KEY = 'gr8r.v2'` in
`localStorage` (`store.js:7`, `store.js:25-33`). If the locale is only ever written there,
then: the user's language does not follow them to a second browser or a second machine; a
signed-out browser keeps the last user's language; and the demo mode and the server mode
disagree about where the truth lives.

**Why it happens:**
`localStorage` is already the demo-mode persistence layer, so it is the path of least
resistance for a new preference — but in server mode the server must win.

**How to avoid:**
- **One source of truth per mode, and one rule:** in server mode (`api.enabled`), the
  locale comes from the server (`users.locale`) and the local copy is a cache only. In
  demo mode (no server), `localStorage` is the only place it can live.
- The demo mode must still be able to change the language — otherwise "the demo has no
  French" is a support question on day one.
- `clearLocalCache()` (`store.js:203`) already removes `gr8r.v2` on sign-out; the locale
  must not survive it in a way that leaks one user's language to the next.
- **A test that signs in on one context, changes the language, opens a second context,
  signs in again, and asserts the second context shows the new language.** localStorage
  alone fails this test; the server column passes it.

**Warning signs:**
- The locale is written to `localStorage` but never to the server in server mode.
- The demo language resets on reload.
- Two browser profiles on the same machine show different languages for the same account.

**Phase to address:** **Phase 3** (server-backed in server mode, localStorage in demo mode,
with the two-context test).

---

### Pitfall 9: The locale migration breaks the "second boot is a byte-identical no-op" guarantee

**What goes wrong:**
`test/migration.test.mjs` is the milestone's most valuable existing guarantee. It asserts,
at line 164-172:

```js
test('a second boot is a no-op and both accounts keep access', async () => {
  const firstBoot = snapshot();
  await server.stop();
  server = await startServer({ dataDir });
  const secondBoot = snapshot();
  assert.deepEqual(secondBoot, firstBoot, 'no slug/doc/member_id/revision drift');
  assert.equal(secondBoot.backups.length, 1, 'no second backup');
```

and `snapshot()` (line 148-162) compares `slug`, `name`, `color`, **`revision`**, **`doc`**,
**`updated_at`**, `memberIds`, `inviteWorkspaceId` and the backup list. Three ways to break
it with a locale migration:

1. **Writing the locale into the workspace document.** If the migration backfills
   `doc.prefs.lang = 'en'`, then `doc` and `updated_at` differ between boots → the test
   fails, and worse, it means the locale is shared again (Pitfall 7).
2. **Reusing `migrateTenancy()`.** That function writes a `vacuum into` backup whenever
   `rows.some(row => !row.slug)` and then rewrites `workspaces` rows — a second backup
   would break `assert.equal(secondBoot.backups.length, 1)`. A locale migration must be a
   **separate, additive** path with its own prefix (or none).
3. **Bumping the revision.** `backfillMemberships()` deliberately avoids moving the revision
   (the comment at `server.js:906` explains why: *"a session that is open across the restart
   would lose its next write"*). A locale migration must not touch `revision` either.

**Why it happens:**
The existing migration machinery is tenancy-specific and its trigger condition is
`!row.slug`. A new migration added "alongside" it tends to reuse it.

**How to avoid:**
- **Add the column with the existing additive helper.** `openDb()` (`server.js:132-147`)
  already does exactly this for `workspaces.slug`, `workspaces.color`,
  `memberships.member_id`, `invites.workspace_id`:
  ```js
  ensureColumn(db, 'users', 'locale', "text not null default 'en'");
  ```
  `ensureColumn` (`server.js:127-130`) checks `pragma table_info` first, so it is
  idempotent. SQLite accepts `ADD COLUMN ... NOT NULL DEFAULT 'en'` without rewriting rows.
  **This path touches no workspace row, so the snapshot is unchanged** — the existing test
  passes unchanged.
- **Do not write the locale into `workspaces.doc`, and do not touch `revision` or
  `updated_at`.**
- **Keep the locale out of `backfillMemberships()`**, which *does* rewrite the document
  (it deletes `doc.data.workspaces` and nulls `doc.data.me`) and updates `updated_at`.
- **Add a test to `test/migration.test.mjs`**, not a new file: after the locale column
  exists, the second boot must still be a no-op, and `users.locale` must default to `'en'`
  for the legacy accounts. Extend `snapshot()` with the user rows' locale so drift is
  caught.
- The `premultitenant-` backup prefix is bound to the tenancy migration; a locale
  migration should not create a `gr8r-premultitenant-*.db` file (the test counts those).

**Warning signs:**
- `snapshot()` in the test starts including a `prefs.lang` key.
- A second `gr8r-premultitenant-*.db` appears in the data directory.
- `workspaces.revision` changes on boot.
- The migration writes anything inside `workspaces.doc`.

**Phase to address:** **Phase 3** (the `users.locale` column + the extended
`test/migration.test.mjs`).

---

### Pitfall 10: The Chromium suite asserts English labels, and the 8 uncovered flows are where the bug hides

**What goes wrong:**
`e2e/tenancy.spec.mjs` selects on English text throughout:

- `page.getByLabel('Email')` and `page.getByLabel('Password', { exact: true })` (line 25-26)
- `page.getByRole('button', { name: 'Sign in' })` (line 27)
- `page.getByRole('heading', { name: 'Members', level: 1 })` (line 119)
- `page.getByRole('button', { name: 'New project' })` (line 128)
- `page.getByRole('button', { name: 'Create project' })` (line 130)
- `page.getByRole('button', { name: 'Projects' })` (line 90)
- `page.getByRole('heading', { name: 'Page not found' })` (line 52)
- `page.getByText(/Carol Member is now an Admin/)` (line 124)

If the locale becomes anything other than English by default, **every one of these breaks**.
And the eight flows that still have no browser test — the onboarding wizard, the invite
modal, the `/join` page, the share modal, member removal, the workspace switcher, the plan
change and project creation — are precisely the modal-, invite- and toast-driven surfaces
where untranslated strings, `aria-label`/`data-tip` attributes, plural counts and
date formats live. **The untested flows are the bug's favourite hiding place.**

**Why it happens:**
The suite was written against the only language the app had. Nothing pins the locale, so
it inherits whatever the app defaults to.

**How to avoid:**
- **Pin the locale explicitly in the fixtures, never implicitly.** `e2e/helpers/setup.mjs`
  creates the accounts; it must set each account's `locale` to `'en'` (server-side, via
  the account row / API) so the existing assertions keep working. Never depend on the
  browser's `navigator.language`, on an ambient preference, or on a default.
- **Write the eight new flows in both locales.** A French variant of each flow catches
  what an English variant cannot: a toast with a bad plural, an `aria-label` left in
  English, a date in `MMM d`, a placeholder that overflows.
- **Assert on more than visible headings.** For each of the eight flows, assert at least
  one `aria-label` / `data-tip` / toast text, because that is where leaks live.
- **A whole-app French regression test:** sign in as a French account, visit every route
  (`ROUTE_NAMES` in `src/shell/render.js` lists 21 routes), and assert the DOM leak check
  from Pitfall 2 finds nothing.
- **Decide what happens to the `<html lang>` attribute** — `index.html` hardcodes
  `<html lang="en">`. Screen readers pronounce French with an English voice, browsers use
  `:lang()` for hyphenation and line-breaking, and Chrome uses it for the translation
  prompt. `document.documentElement.lang` must be set to the active locale on every locale
  change (it fits the existing `applyPrefs()` pattern).

**Warning signs:**
- The Chromium suite fails only in the French run.
- A French test passes while an English test fails — the locale is leaking between
  accounts.
- A French render still has `<html lang="en">`.
- The eight new flows are tested in English only.

**Phase to address:** **Phase 4 — Browser coverage and the French regression** (the eight
flows in both locales, the DOM-leak regression, the `<html lang>` fix).

---

## Moderate Pitfalls

### Pitfall 11: The activity log persists English — and the code parses that English

**What goes wrong:**
`logAct(verb, t, extra)` (`store.js:244`) writes into the **shared workspace document**:

```js
D().activity.unshift({ id: uid('a'), by: D().me, verb, task: …, project: …, at: Date.now(), extra });
```

Callers pass English prose: `logAct('moved', t, \`from ${ST[old].name} to ${ST[nv].name}\`)`
(`actions.js:96`), `logAct('renamed', t, \`to “${nv}”\`)` (`actions.js:122`),
`logAct('changed due date of', t, \`to ${fmtDate(nv)}\`)` (`actions.js:115`).
`actHtml` renders them raw: `<span class="muted">${esc(a.verb)}</span> … ${esc(a.extra)}`
(`src/components/task-list.js:134`).

Two failure modes at once:

1. **If you translate at write time**, the history is frozen in the language of whoever
   performed the action, and a French user sees an English history for actions done by an
   English user (and vice versa) — permanently, in a shared document.
2. **The filter code parses the English.** `src/pages/activity.js:12-19`:
   ```js
   f === 'comments' ? a.verb.includes('comment')
   : f === 'status'   ? /moved|completed|reopened/.test(a.verb)
   : f === 'projects' ? a.verb.includes('project')
   ```
   Translate the verb at write time and the **Activity filters silently stop working** —
   the comments/status/projects tabs all return the wrong subset, with no error.

Also `extra` embeds a *formatted date* (`to ${fmtDate(nv)}`) — a date written while the
author was in French is stored as `24/07/2026` and is never re-rendered in the reader's
locale. `ST[old].name` embeds the **status display name**, so the stored history depends on
the status vocabulary at write time.

**How to avoid:**
- **Never translate at write time.** Store a stable machine verb (`'moved'`, `'renamed'`,
  `'commented'`) and translate it at render time. That means the regex filters must become
  key lookups (`a.verbKey` / a `verb` enum) — and because existing documents already contain
  the English prose, the migration must map the legacy strings to keys
  (`'moved'` → `'moved'`, `'commented on'` → `'commented'`, …).
- **Store dates as ISO and format at render.** `logAct` should store the raw date; the
  renderer formats it in the reader's locale.
- **Do not store display names of statuses.** Store the status id (`'todo'`) and map it to
  a label at render.

**Warning signs:**
- `logAct(` called with a literal string that is not a stable key.
- `a.verb.includes('…')` or a regex over `a.verb` still in the code.
- `fmtDate(...)` inside a `logAct` call.
- An activity entry whose `extra` contains a slash-formatted date.

**Phase to address:** **Phase 2** (extract the verbs, keep them as keys) — and the
**legacy-verb mapping is part of the Phase 3** document migration, because it writes to
the shared document and therefore must respect Pitfall 9's no-op guarantee.

---

### Pitfall 12: Server-side and store-side error messages stay English

**What goes wrong:**
`server.js` answers with English prose: `throw httpError(409, 'An account with that email
already exists')` (`server.js:982`), `httpError(400, 'Enter a valid email address')`
(`server.js:980`), `httpError(413, 'Request body too large')` (`server.js:1155`),
`httpError(409, 'Promote someone before removing the last member of a private project')`
(`server.js:709`). The client surfaces them directly:
`src/main.js:72` → `toast(error || 'Your account has read-only access.')`.
`src/core/api.js:47` also returns `error: 'Could not reach the server'`.
Client-side validation errors are hardcoded English too: `S.ui.errors.title = 'Give the
task a name'` (`actions.js:652`), `S.ui.errors.pname = 'Give the project a name'`
(`actions.js:1345`), `S.ui.errors.tname = 'Give the team a name'` (`teams.js:57`),
`A team called “${f.name}” already exists` (`teams.js:63`).

The result is a French screen with an English error toast — the single most visible
"half-done localisation" signal.

**How to avoid:**
- **Return a machine `code` next to every server error** — `{ error: '…', code: 'email_taken' }`
  — and translate the **code** in the client. Keep the English `error` for logs and for
  the API's own consumers. There are only 9 `httpError(` sites in `server.js`; this is a
  half-day change.
- Move every client-side validation string into the catalogue (`errors.task_title_required`,
  `errors.team_name_taken`, …) — they are ordinary catalogue keys.
- A French regression test should include at least one error path (duplicate email, empty
  task title) so this cannot regress.

**Warning signs:**
- `toast(error …)` where `error` is a server string.
- `S.ui.errors.x = '…'` with an English literal.
- A French screenshot of a validation error showing English.

**Phase to address:** **Phase 2** (client-side validation strings) and **Phase 4**
(the server error `code` + the error-path assertion in the French regression test).

---

### Pitfall 13: The seed data is English demo content that ships with the product

**What goes wrong:**
`src/data/seed.js` (539 lines) is *user-visible content*, not UI: member names and titles
(`'Head of Product'`, `'Design Lead'`), project names, ~99 `title:`/`name:`/`desc:` fields,
19 comment texts, event titles (`'Sprint planning'`, `'Launch sync'`), and — importantly —
**role display strings** `role: 'Owner' | 'Admin' | 'Member' | 'Guest'`. The server seeds a
fresh database from it (`server.js:816`), via `seed.json` produced at Docker build time
(`node scripts/export-seed.mjs > seed.json` in the `Dockerfile`).

A French user on a fresh install opens a workspace whose entire content is English, under
French chrome. Whether that is acceptable is a product decision that must be *made
explicitly* — left undecided, it reads as a half-done localisation.

**How to avoid:**
- **Decide, in writing, before Phase 2:** either (a) the seed stays English and the product
  docs say "the interface is translated; the demo content is English sample data", or
  (b) a second French seed (`seed.fr.json`) is selected at first boot from the bootstrap
  admin's locale, or (c) the seed is translated per-locale at seed time (impossible — the
  seed is written once, at DB creation, and the DB is long-lived).
- Option (b) is the only one that gives a genuinely French first run, and it costs a second
  seed file plus an export step. Option (a) is free.
- **Whatever is chosen, the seed's `role` values must be reconciled with the role-display
  decision below** — they are the same problem.

**Warning signs:**
- A fresh install in French shows English task titles and comments.
- `seed.json` in the Docker image is stale relative to `src/data/seed.js`.
- The product docs make no claim about demo content.

**Phase to address:** **Phase 2** (the decision + the seed variant if chosen) —
**explicitly out of scope if option (a)**.

---

### Pitfall 14: Role, status and priority names are *data*, not UI — and they are stored in English

**What goes wrong:**
The role vocabulary appears in four places, in two different forms:

| Location | Form | Example |
|---|---|---|
| `src/core/store.js:250` | `ROLE_LABELS = { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Guest' }` | machine key → English display |
| `server.js:72` | `ROLE_LABEL = { owner: 'Owner', … }` | same map, server-side |
| `server.js:920` (`memberProfile`) | `role: ROLE_LABEL[row.role]` | the **English display string is written into the shared document** |
| `src/data/seed.js` | `role: 'Owner'` | the English display string is written into the shared document |
| `src/core/constants.js:2` | `STATUSES = [{ id: 'backlog', name: 'Backlog' }, …]` | machine key → English display |

Two consequences:

1. **`memberProfile()` and the seed store the *display* string**, not the machine key. So
   the role shown in the members table is stored English text inside the shared document.
   Translating it means a data migration of every member row in every workspace — or
   switching the storage to the machine key (`owner`/`admin`/`member`/`viewer`) and
   translating only at render.
2. **The Chromium suite depends on the English display string**:
   `page.getByRole('row').filter({ hasText: 'Carol Member' })` and
   `page.getByRole('button', { name: 'Member', exact: true })` (`e2e/tenancy.spec.mjs:121-122`).
   The same is true of the status vocabulary: `ST[t.status].name` is rendered in
   `data-tip="${ST[t.status].name}"` (`task-list.js:140`) and persisted into the activity
   log (`actions.js:96`).

**How to avoid:**
- **Store the machine key; translate at render.** Change `memberProfile()` and the seed to
  store `'owner' | 'admin' | 'member' | 'viewer'`, and map key → label in the renderer.
  This is a **data migration** touching every member row in every workspace document — which
  means it writes to the shared document and therefore must respect **Pitfall 9** (no
  revision bump, no `updated_at` change on the second boot).
  The alternative — keep the English display strings as data and translate the *keys* only —
  means the members table shows "Owner" in a French workspace, which is worse than either.
- **Decide explicitly and record the decision.** This is a semantic change to the data
  model, not a translation detail.
- The status vocabulary (`Backlog`, `To do`, `In progress`, `Done`, `Review`) has the same
  shape: `STATUSES` already separates `id` from `name`, so only `name` needs a catalogue
  entry — but the seed and `memberProfile` need the same treatment as roles.

**Warning signs:**
- The members table shows "Owner" in French.
- `role:` in `seed.js` holds a capitalised display string.
- A migration wrote to `workspaces.doc` to change role strings (→ Pitfall 9).

**Phase to address:** **Phase 3** (the role-key data migration, bundled with the locale
migration so it is one document rewrite, and therefore one careful pass against
`test/migration.test.mjs`).

---

### Pitfall 15: The catalogue must be bundled, not fetched — and the demo mode has no server

**What goes wrong:**
The Docker image ships a **built** bundle: the `Dockerfile` copies only
`server.js`, `mailer.js`, `seed.json` and `dist/` into the runtime image, and the server
serves `dist/` (`server.js:50`, `const ROOT = path.resolve(process.env.STATIC_DIR || path.join(HERE, 'dist'))`).
If the catalogues are `fetch()`ed at runtime from `/locales/fr.json`:

- the file is **not in the image** — the `COPY --from=build /app/dist ./dist` line copies
  only `dist/`, so unless the catalogues are emitted into `dist/`, the fetch 404s in
  production and the app falls back to English (or throws);
- the **demo mode has no server at all** (`api.enabled === false`), so there is no API to
  serve a locale file — a runtime fetch from `/locales/fr.json` works only if the file is
  a static asset next to `index.html`;
- a runtime fetch adds a **flash of English** on first paint and a network failure mode.

**A second, non-obvious trap in the same area:** `vite.config.js`'s `lucideSubset()`
plugin walks `src/`, reads **every `.js` file**, and extracts every quoted lowercase
kebab-case token that matches a Lucide icon name, then inlines those icons into the
bundle. A catalogue authored as **`src/locales/fr.js`** would be scanned, and any single
lowercase word in a French value that happens to be a Lucide icon name (`'copy'`, `'user'`,
`'filter'`, `'search'`, `'share'`, `'link'`, `'plus'`, `'star'`, `'x'`, `'eye'`, `'mail'`,
`'archive'`, `'settings'`, `'home'`, `'list'`, `'lock'`, `'send'`, `'check'`, `'info'`)
would be silently swept into the icon set — and, worse, an English catalogue written as
`.js` with single-word values would inject dozens of bogus icons. The plugin only reads
`.js` files, so **JSON catalogues are unaffected**.

**How to avoid:**
- **Import the catalogues at build time.** `import fr from './locales/fr.json'` — Vite
  inlines the JSON into the bundle. There is then no runtime fetch, no missing-asset class
  of bug, no flash of English, and the Docker image needs no change because the catalogue
  travels inside `dist/assets/index-*.js`.
- **Keep the catalogues as `.json`, not `.js`**, so `lucideSubset()` cannot scan them
  (the plugin's walk is `/\.js$/.test(e.name)`). If they must be `.js`, exclude
  `src/locales/` from the plugin's walk.
- **Namespace the keys** (`modal.share.title`, `settings.language.name`) so a key can never
  collide with an icon name or with a Lucide-derived token.
- If a runtime fetch is nevertheless chosen, the `Dockerfile` must `COPY` the locale
  directory into the runtime image, the server must serve it with the right content type
  and cache headers, and the demo mode must have its own copy — and then the flash-of-English
  and the 404-in-production paths have to be tested. **Prefer the build-time import.**

**Warning signs:**
- The Docker image has no locale files and the app fetches them.
- `dist/assets/index-*.js` does not contain the French strings (⇒ runtime fetch).
- The icon bundle grew unexpectedly after the catalogues were added.
- The demo mode (`npm run dev` with no server) shows English while the server mode shows
  French.

**Phase to address:** **Phase 1** (the catalogue format and the build-time import) and
**Phase 5 — Ship hardening** (verify the Docker image contains the French strings and that
the demo mode works).

---

### Pitfall 16: French typography breaks the text in ways that are invisible in code

**What goes wrong:**
French has typographic rules that English does not, and the app renders raw HTML strings —
so a catalogue written with English habits produces visibly wrong French even though every
key is present:

| Rule | French | English default in the code today |
|---|---|---|
| Space before `:` | **U+00A0** (NBSP) | `': '` |
| Space before `;` `!` `?` | **U+202F** (narrow NBSP) | `'; '`, `'! '`, `'? '` |
| Space inside `« »` | **U+00A0** on both sides | `"…"` (straight quotes) — `modals.js:186` uses `Share “${…}”` with curly English quotes |
| Apostrophe | **`’` U+2019** | `'` — `modals.js:47` `"Save"` is fine, but `actions.js:1664` `"couldn't be emailed"` uses a straight quote |
| Ellipsis | **`…` U+2026** | `...` — `modals.js:58` `'No filters are active — the view will show all tasks.'` uses an em dash; `auth.js` uses `…` already |
| Capital accents | **`É`, `À`, `Ç` keep their accents** | n/a |
| Headings | **sentence case** — `Écrire correctement en français`, not Title Case | the app's headings are Title Case in English: `'Language and regional formats.'`, `'Keyboard shortcuts'` |
| Months / weekdays | **lowercase** | `MON = ['Jan', …]` (capitalised, and English) |
| Ordinals | `1er`, `1re`, `2e` | `2nd`, `3rd` |
| Decimal / grouping | **comma**, **U+202F** group separator | `.` and `,` |

A catalogue with a plain ASCII space before a colon is *wrong* in French: the colon can
wrap to the next line. A plain ASCII space inside `« »` allows a line break between the
quote and the word.

**How to avoid:**
- **A catalogue-typography test** (a lint on the French catalogue, not on the code):
  - no ` : `, ` ; `, ` ! `, ` ? ` with a plain space → require U+00A0 before `:` and
    U+202F before `; ! ?`;
  - no straight `'` in prose values → require `’`;
  - `«` and `»` must be surrounded by U+00A0;
  - no `...` → require `…`;
  - capitals must keep their accents (hard to test automatically; review by eye).
- **A deliberate house style**, written down once, because the sources disagree: AZERTY
  Global recommends NBSP before `:` and *narrow* NBSP before `; ! ?`; Canadian French
  follows English spacing for those marks. Pick one, apply it to the whole catalogue, and
  note that the choice is a *style* decision, not a correctness one. A narrow NBSP is
  invisible in most editors — make it easy to type by providing the characters in the
  catalogue-authoring notes.
- **The `« »` vs `“ ”` decision must be made globally.** The codebase already uses curly
  English quotes (`Share “${p.name}”`, `modals.js:186`; `renamed … to “${nv}”`,
  `actions.js:122`). French uses `« … »`. A mixed catalogue is visible.
- **Headings in sentence case.** The app has headings like `'Language and regional formats.'`,
  `'Keyboard shortcuts'`, `'Save the current filters as a tab on this project.'` — these
  are already sentence case, which suits French. The *buttons* are Title Case
  (`'Save changes'`, `'Create task'`) and French would want `Enregistrer les modifications`,
  `Créer une tâche` — sentence case with a capital first letter.
- **Never normalise accents away.** The French catalogue must be stored in **NFC**
  (precomposed `é` as one code point, not `e` + combining accent) so search, sorting and
  counting behave.

**Warning signs:**
- A `grep` for `' : '` in the French catalogue finds hits.
- A straight `'` appears inside a French value.
- `«` without a following U+00A0.
- The catalogue contains combining diacritics (visible as a box in some editors).

**Phase to address:** **Phase 2** (the house style + the typography linter on the
catalogue), with the linter script written in **Phase 1**.

---

## Minor Pitfalls

### Pitfall 17: `<html lang>` stays `"en"`

**What goes wrong:** `index.html` hardcodes `<html lang="en">`. Screen readers pronounce
French with an English voice; Chrome offers to translate the page; `:lang()` CSS and
hyphenation do not apply.

**How to avoid:** set `document.documentElement.lang = locale` whenever the locale changes,
inside the existing `applyPrefs()` pattern (`src/core/theme.js:5-17`, which already sets
`data-theme`, `data-accent`, `data-side`, `data-density`, `data-motion`). Also set
`data-locale` for CSS hooks.

**Warning signs:** a French render still reports `<html lang="en">`.

**Phase to address:** **Phase 1**.

---

### Pitfall 18: French search and sorting break on accents

**What goes wrong:** the recent-search / member match is a plain substring test:
`x.name.toLowerCase().includes(S.ui.shareQ.toLowerCase())` (`modals.js:201`) and
`x.email.includes(S.ui.shareQ.toLowerCase())`. A French user typing "elodie" will not
match "Élodie", and typing "ele" will not match "Élise". Sorting uses the default
UTF-16 code-unit order, which places `é` after `z`; `Intl.Collator('fr')` places `e`
before `é` (verified).

**How to avoid:** normalise both sides with `String.prototype.normalize('NFD').replace(/[\u0300-\u036f]/g, '')`
before comparing, and use `new Intl.Collator(locale).compare` for any user-visible
ordering. Note the pre-existing free-text limitation already tracked in `PROJECT.md`
("Close the substring-based recent-search leak") — the accent normalisation is a cheap
improvement to the same code path, not a new feature.

**Warning signs:** a French user cannot find "Élodie" by typing "elodie".

**Phase to address:** **Phase 4** (a small, contained improvement alongside the French
regression test) — or explicitly out of scope.

---

### Pitfall 19: The `t()` layer quietly becomes a dependency

**What goes wrong:** the project's identity is *"plain ES modules, NO framework, NO runtime
dependency"*. A hand-rolled `t()` that grows ICU MessageFormat support, a plural engine, a
`select` type, nested placeholders and a fallback chain is a dependency in everything but
name — and it will have bugs nobody has tests for.

**How to avoid:**
- Implement **exactly** the subset EN+FR need: `{name}` interpolation, and
  `{count, plural, one{…} other{…}}`. `Intl.MessageFormat` does not exist in Node 24 or
  Chromium (verified), so there is no platform shortcut and no excuse for a full engine.
- **Cap the file.** A ceiling of ~150 lines for `src/core/i18n.js` is a design constraint
  worth stating in the plan, so a future contributor knows where the line is.
- Fallback chain: `fr` → `en` → the key itself, with the key visibly marked in dev so a
  missing translation is obvious.

**Warning signs:** `src/core/i18n.js` exceeds ~150 lines; the plural parser grows a
`select` branch; a third locale is added before the second is complete.

**Phase to address:** **Phase 1**.

---

### Pitfall 20: The old stored value `'English (US)'` survives the migration

**What goes wrong:** `DEFAULT_PREFS.lang` is the display string `'English (US)'`
(`store.js:15`) and it is persisted in **two** places: the shared workspace document
(`prefs.lang`) and `localStorage` under `gr8r.v2` (`store.js:25-33`, `docSnapshot()` at
line 95). After the change to a locale code, a browser with an old localStorage entry will
load `prefs.lang = 'English (US)'` and the selector will show **nothing selected** (the
`sel()` helper compares `String(v) === String(val)`), and `t()` will fall back to English
forever with no visible cause.

**How to avoid:**
- Change `DEFAULT_PREFS.lang` to the code `'en'`.
- **Normalise on read**: when loading, map `'English (US)'` and `'English (UK)'` → `'en'`,
  and any unknown value → `'en'`. Normalise in `applyDoc()` *and* in the `load()` path.
- Since `prefs.lang` is being removed from the document entirely, the shared-document copy
  is simply ignored — but the **localStorage** copy must still be normalised, because
  `load()` merges `saved.prefs` over `DEFAULT_PREFS` (`store.js:38`).

**Warning signs:** the language selector renders with no selected option for a user who
was on the app before the upgrade.

**Phase to address:** **Phase 3** (the value normalisation, tested by a fixture with an
old `gr8r.v2` localStorage payload).

---

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|---|---|---|---|
| Translate only the *visible* text, leave `aria-label` / `data-tip` / `title` English | Halves the extraction work | Screen readers announce English on a French page; the CSS tooltips (`content: attr(data-tip)`) stay English; the DOM-leak test fails | **Never** for a milestone whose goal is "no English leaks" |
| Translate at write time (activity verbs, toasts baked into stored data) | One call site per string | History is frozen in one language; the English-verb regex filters in `activity.js` break silently | **Never** |
| Store translated strings in the shared workspace document | No new server state | The locale becomes shared again — the exact defect v1.1 → v1.2 is meant to remove | **Never** |
| Keep a `prefs.lang` in the document "for backwards compatibility" | Old clients keep working | Two sources of truth; whichever loads last wins | **Never** |
| Hand-roll the full ICU MessageFormat grammar | Full flexibility | A 1000-line untested parser in a zero-dependency project | **Never** — implement `{n, plural, one/other}` only |
| Fetch the catalogues at runtime | Tiny bundle; hot-fixable without a rebuild | 404 in the Docker image (only `dist/` is copied); flash of English; a new failure mode in demo mode | Only if the `Dockerfile` and the demo path are both updated and tested |
| Add the locale column by rewriting `workspaces.doc` | One place to store it | Breaks the second-boot no-op guarantee and re-shares the locale | **Never** |
| Keep the French catalogue as `src/locales/fr.js` | Syntax highlighting | `lucideSubset()` scans `.js` files and sweeps catalogue values into the Lucide icon set | Use `.json` instead |
| Keep English plurals (`n > 1 ? 's' : ''`) and let the translator fix it by hand | No plural engine | French `0` is singular; every count site is a manual trap; 37 sites | **Never** |
| Leave `dateFmt` as a shared workspace pref | One pref, one place | One member's date format changes for everyone — a shared-pref leak identical to the locale one | **Never** — move it with the locale |
| Translate the demo seed lazily "later" | Saves time now | A French first run is an English workspace — reads as half-done | Acceptable **only if** the decision is written down and the docs say so |
| Skip the French typography lint | Saves an afternoon | Invisible NBSP/apostrophe errors ship and are read as low-quality French | **Never** for a milestone that claims "French" |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|---|---|---|
| **Server → client errors** | Shipping the English `error` string to a French toast | Return `{ error, code }`; translate the **code** client-side; keep the English for logs |
| **Shared document → per-user locale** | Leaving `prefs.lang` in `docSnapshot()` while adding `users.locale` | Remove `lang` and `dateFmt` from `docSnapshot()` and `applyDoc()`; apply the server locale *after* `applyDoc()` |
| **`users.locale` ↔ `test/migration.test.mjs`** | Writing the locale anywhere inside `workspaces.doc` | `ensureColumn(db, 'users', 'locale', "text not null default 'en'")` — additive, touches no workspace row, second boot stays a no-op |
| **`prefs` ↔ `applyDoc()` ordering** | Setting the locale before `applyDoc()` | `applyDoc()` does `Object.assign({}, DEFAULT_PREFS, doc.prefs)` — it overwrites. Apply the locale **after** |
| **Catalogue ↔ Vite build** | `fetch('/locales/fr.json')` at runtime | `import fr from './locales/fr.json'` — inlined into `dist/assets/index-*.js`, which the Docker image already ships |
| **Catalogue ↔ `lucideSubset()`** | Authoring the catalogue as `.js` under `src/` | Keep it `.json`; the plugin only reads `.js` files and would sweep single-word values into the icon bundle |
| **E2E fixtures ↔ locale** | Letting the suite inherit the app's default locale | Set `locale: 'en'` on the fixture accounts explicitly; add French variants alongside |
| **`activity.verb` ↔ filters in `activity.js`** | Translating the verb at write time | Store a stable key; map legacy English verbs to keys in the document migration; filter on the key |
| **`index.html` ↔ screen readers** | Leaving `<html lang="en">` | `document.documentElement.lang = locale` on every locale change |
| **`Intl` ↔ `utils.js` store-free design** | Importing the store into `utils.js` | `setLocale(locale)` module-level, called from `applyPrefs()` — same pattern as the existing `setDateFormat()` |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|---|---|---|---|
| **Rebuilding every string on every keystroke** | The search box lags; typing in the task title stutters | The app re-renders the whole shell on every action (`render()` replaces `#app`); if `t()` parses ICU on every call, every render re-parses every message | Immediately — the render loop is full-shell (`src/shell/render.js`) |
| **Constructing `Intl` objects per call** | `fmtDate` called 200× per render allocates 200 formatters | `Intl.DateTimeFormat` / `NumberFormat` / `PluralRules` / `Collator` are expensive to construct. **Cache them per locale** in a module-level map, rebuilt only when the locale changes | At ~50+ calls per render, which the board and table views reach |
| **Bundling the catalogue into every route** | The initial JS payload grows | The app has no code splitting (single `index-*.js`, 388 KB). The full French catalogue (~600–900 keys) is maybe 30–60 KB — acceptable, but the *English* base does not need to ship if `fr` is the only other locale | Acceptable now; revisit if a third locale lands |
| **Sorting large lists with a fresh `Collator` per comparison** | The members/projects list janks | `new Intl.Collator(locale)` allocates a collator; reuse one instance | At ~1 000+ items in a list |
| **Fetching the catalogue per page** | A flash of English on every navigation | Build-time import (Pitfall 15) | Immediately |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---|---|---|
| **Interpolating `t()` output into HTML without `esc()`** | A catalogue value becomes HTML — and if the catalogue is ever fed from an external source (a translation-management UI is explicitly out of scope but may come later), it becomes a stored XSS | `t()` returns raw text; every insertion point escapes; the catalogue linter rejects `<`/`>`/`"` |
| **Interpolating `t()` output into an attribute without `esc()`** | Attribute break-out; the remainder of the string lands in the DOM as text (visible garbage, and a possible injection vector if the value is attacker-influenced) | `esc(t('key'))` in all attribute positions; the lint rule flags bare `t(` in attributes |
| **Treating a translated string as a CSS selector or an `id`** | Injection into `querySelector` | Never build selectors from `t()`; the app already uses `data-a` action names and `data-*` attributes — keep action names as stable English keys, translated only in their *labels* |
| **Trusting the server's error prose as a translation key** | An attacker-controlled error string could reach a `t()` lookup | Translate **codes**, never messages (Pitfall 12) |
| **Letting the locale come from a query string or `Accept-Language` without validation** | Locale injection into `Intl` constructors (a malformed tag throws `RangeError`) and into the catalogue lookup (path traversal if the catalogue is fetched by name) | Validate the locale against a **fixed allow-list** derived from the catalogue files; `Intl` constructors throw on an invalid tag, so a bad value must never reach them unchecked |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---|---|---|
| **A language selector that lies** | The user picks Français, nothing changes, and they conclude the app is broken | Derive the options from the catalogue files; ship only what exists (the milestone's decision) |
| **A French page with one English button** | Reads as unfinished; destroys trust in the translation | The DOM-leak test (Pitfall 2) plus the lint gate |
| **Truncated French labels in the sidebar** | The user cannot read the navigation | Length budget + `.trunc` + a wider `--side-w` if needed |
| **Dates that stay in English (`Oct 1`)** | A French user misreads the date; `10/1` is ambiguous between 10 January and 1 October | `Intl.DateTimeFormat` per locale (JJ/MM/AAAA for `fr`) |
| **`0 tasks` becoming `0 tâche` in French** | Grammatically wrong | `Intl.PluralRules` (verified: `fr` `select(0) === 'one'`) |
| **"3h ago" in a French interface** | Meaningless in French | `Intl.RelativeTimeFormat('fr')` → `il y a 3 heures` |
| **English `aria-label`s on French icon buttons** | Screen-reader users hear English; the button's purpose is announced in the wrong language | Translate all 175 `aria-label`s — they are the highest-value, lowest-visibility strings |
| **A mixed-language activity history** | The audit trail is inconsistent | Store machine verbs, translate at render (Pitfall 11) |
| **French dates written into the activity log and frozen** | A teammate in another locale reads `24/07/2026` and has to guess the year | Store ISO dates, format at render |
| **An English demo workspace under French chrome** | First impression is "not really translated" | Decide explicitly (Pitfall 13) and say so in the docs |
| **Switching the language re-renders mid-typing and loses the draft** | The user loses what they wrote | The app keeps drafts in `S.ui.drafts`; a locale change triggers a full `render()` — verify the draft survives |

---

## "Looks Done But Isn't" Checklist

- [ ] **The selector:** every `<option>` in the language selector maps to a catalogue file that
      exists; the count of options equals the count of catalogues; the four phantom languages
      (Deutsch, Español, Français, 日本語) are gone from the source. — *verify by opening
      Settings → Language and by the selector-vs-catalogue test*
- [ ] **Catalogue completeness:** `en.json` and `fr.json` have identical key sets; every key
      called by `t()` exists; every placeholder set matches. — *verify by the catalogue test*
- [ ] **Lint gate:** the no-literal-string rule is in **error** mode, not warn, and `npm run
      lint` fails on a deliberate English literal. — *verify by inserting one and watching CI fail*
- [ ] **DOM leak:** every route renders in `fr` with zero English strings from the catalogue. —
      *verify by the leak test and by eye on the board, table, calendar, timeline, files, settings,
      auth and every modal*
- [ ] **Markup safety:** no catalogue value contains `<`, `>` or `"`; every `t()` in an
      attribute is wrapped in `esc()`. — *verify by the catalogue validator and a French DOM
      parse*
- [ ] **French typography:** NBSP before `:`, narrow NBSP before `; ! ?`, NBSP inside `« »`,
      curly `’`, `…`, accented capitals, lowercase months, sentence-case headings. — *verify by
      the typography linter and by reading a rendered page*
- [ ] **Plurals:** 0, 1, 2 and 1 000 000 render correctly in both locales; no `? 's' : ''`
      remains in `src/`. — *verify by the plural unit test and by `grep`*
- [ ] **Dates/numbers:** French dates are `JJ/MM/AAAA`; the clock is 24-hour; grouping uses
      U+202F and the decimal is a comma; relative times are French. — *verify by the formatter
      unit test*
- [ ] **Per-user locale:** two accounts in one workspace see different languages; the language
      survives a reload, a workspace switch and a new browser. — *verify by the two-account
      browser test*
- [ ] **Shared document is clean:** `workspaces.doc` contains no `prefs.lang` and no
      `prefs.dateFmt`; `docSnapshot()` does not emit them. — *verify by dumping the row*
- [ ] **Migration:** `users.locale` exists with a default; the second boot is still a
      byte-identical no-op; exactly one backup exists. — *verify by `npm test` and by
      `test/migration.test.mjs` extended with the locale*
- [ ] **Activity history:** stored verbs are machine keys; the Activity filters still work;
      dates in history render in the reader's locale. — *verify by the legacy-verb mapping test*
- [ ] **Errors:** a French user sees a French validation error and a French server error; the
      server error carries a `code`. — *verify by triggering a duplicate email in French*
- [ ] **Accessibility:** `<html lang>` follows the locale; all `aria-label`s are translated;
      the CSS tooltips (`data-tip`) are translated. — *verify with a screen reader or by
      inspecting the DOM*
- [ ] **The 8 untested flows:** onboarding, invite modal, `/join`, share modal, member
      removal, workspace switcher, plan change, project creation — each covered, and each
      covered **in French**. — *verify by the Chromium suite*
- [ ] **Operations:** the French strings are inside `dist/assets/index-*.js`; the Docker
      image contains them; the demo mode (no server) is French. — *verify by building the
      image and by opening `dist/index.html` without a server*
- [ ] **Docs:** the product docs state what is translated (interface) and what is not (demo
      seed content), and which locales exist. — *verify by reading `README.md` / `DEPLOY.md`*

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---|---|---|
| The selector offers an untranslated language | LOW | Remove the option; the catalogue test prevents recurrence |
| English strings leaking into a French page | MEDIUM | Add the offending key to `fr.json`; tighten the leak test's forbidden list (it is derived from the catalogues, so it grows automatically) |
| A translation breaks the markup | LOW | Fix the catalogue value (remove `<`/`>`/`"`) or add `esc()` at the call site; the catalogue validator finds it |
| French overflows a fixed-size control | MEDIUM | Shorten the French string **or** relax the CSS (`flex-wrap`, `min-width: 0`, `--side-w`); run the length-budget test to find every offender at once |
| Wrong plural in French | LOW | Fix the catalogue's `one`/`other` forms; the plural unit test pins 0/1/2/1 000 000 |
| A date renders in the wrong format | LOW | Fix the formatter, not the catalogue; the formatter unit test pins it |
| The locale is shared between members | HIGH | Remove `lang` from `docSnapshot()`/`applyDoc()`, apply the server locale after `applyDoc()`, then re-test the two-account scenario. If a document was already written with a shared `prefs.lang`, that copy is now ignored — no data loss |
| The migration broke the second-boot no-op | MEDIUM | The test tells you exactly which field drifted (`doc`, `updated_at`, `revision`, or the backup count). Move the write out of `workspaces.doc`; the `ensureColumn` path is proven |
| The locale did not follow the user to another browser | MEDIUM | Move the source of truth to `users.locale`; keep `localStorage` as a cache only; re-test with two browser contexts |
| Activity filters stopped working | MEDIUM | Revert to storing machine verbs and restore the legacy English→key mapping in the document migration; the filters then read a key, not prose |
| The Docker image serves no catalogue | MEDIUM | Switch to a build-time `import` of the JSON (Pitfall 15); rebuild; the catalogue is inside `dist/assets/` |
| The demo mode is English-only | LOW | The demo stores the locale in `localStorage`; make sure the demo path writes it and that `clearLocalCache()` does not wipe it at the wrong moment |

---

## Pitfall-to-Phase Mapping

The v1.2 roadmap does not exist yet. The phase names below are **proposed** by this research
and should be adopted (or renamed consistently) by the roadmapper, so that every pitfall
below has an owner. If a phase is renamed, the mapping transfers with it.

**Proposed v1.2 phases**

| # | Phase | Deliverable |
|---|---|---|
| 1 | **i18n core** | `src/core/i18n.js` (`t()`, `{name}` interpolation, `{count, plural, one/other}`), the catalogue format (`src/locales/en.json`, `fr.json`) with a **build-time import**, `setLocale()` + `Intl`-based date/number/relative-time formatters, the catalogue-completeness test, the plural/date unit tests, the catalogue validators (markup, placeholders, French typography), the lint rule in **warn** mode |
| 2 | **Extraction & French catalogue** | the ~1 800 occurrences across 37 files converted to `t()`; `en.json` as the base catalogue; a **complete** `fr.json`; the length budget; the lint rule flipped to **error**; the decision on the seed and on role/status display strings; the server error `code`s |
| 3 | **Per-user locale & the honest selector** | `users.locale` column + `ensureColumn`, `userPayload` returns the locale, removal of `prefs.lang`/`prefs.dateFmt` from the shared document, the selector derived from the catalogue files (EN + FR only), the `localStorage` normalisation of the legacy `'English (US)'` value, the role-key data migration, the legacy-verb mapping, the extension of `test/migration.test.mjs` |
| 4 | **Browser coverage & the French regression** | the 8 untested flows (onboarding, invite modal, `/join`, share modal, member removal, workspace switcher, plan change, project creation) **in English and French**; the DOM-leak regression across all 21 routes; the two-account different-locale test; the `<html lang>` fix; the accent-normalised search |
| 5 | **Ship hardening** | the Docker image carries the French catalogue; the demo mode is French; the lint rule and the tests run in CI; the docs state what is and is not translated; the v1.2 changelog |

**Mapping**

| Pitfall | Prevention Phase | Verification |
|---|---|---|
| 1 — The selector lies | 3 (mechanism in 1) | Selector-vs-catalogue test; Settings → Language shows exactly EN + FR |
| 2 — Untranslated strings leak | 1 (gates) + 2 (the work) | Catalogue-completeness test; the lint rule in error mode; the DOM-leak test |
| 3 — A translation breaks the markup | 1 (contract + validators) + 2 (call sites) | The catalogue validator; the French DOM-parse test; the node-count comparison |
| 4 — French is longer, layout is fixed | 2 (budget) + 4 (visual) | The length-budget test; the Chromium run at 1280 px and 390 px |
| 5 — English plurals baked in | 1 (engine) + 2 (the 37 sites) | The plural unit test (0/1/2/1 000 000); `grep "? 's' : ''"` returns nothing |
| 6 — Dates/numbers not locale-aware | 1 (formatters) + 3 (`dateFmt` per user) | The formatter unit test (`24/07/2026`, `20:30`, `1 250 000` with U+202F) |
| 7 — Locale in the shared document | 3 | The two-account browser test; a dump of `workspaces.doc` showing no `prefs.lang` |
| 8 — LocalStorage-only locale | 3 | The two-browser-context test; the demo-mode language test |
| 9 — The migration breaks the no-op guarantee | 3 | `test/migration.test.mjs` extended with `users.locale`; `npm test` green |
| 10 — The Chromium suite asserts English | 4 | The suite runs in both locales; the eight flows exist in both |
| 11 — The activity log persists English | 2 (verbs as keys) + 3 (legacy mapping) | The Activity filter test; the legacy-verb mapping test |
| 12 — Server/store errors stay English | 2 (client errors) + 4 (server `code`s) | The French error-path assertions |
| 13 — English seed content | 2 (the decision) | A fresh install in French; the docs |
| 14 — Role/status names are data | 3 (the data migration) | The members table in French; the existing role assertions still pass |
| 15 — Catalogues must be bundled | 1 (the import) + 5 (the image) | `grep` the French string inside `dist/assets/index-*.js`; the demo without a server |
| 16 — French typography | 2 (the house style) | The catalogue typography linter; a rendered page read by a French speaker |
| 17 — `<html lang>` stays "en" | 1 | The DOM attribute after switching to French |
| 18 — French search/sorting | 4 (or out of scope) | Searching "elodie" finds "Élodie" |
| 19 — `t()` becomes a dependency | 1 | The line count of `src/core/i18n.js`; no `select` branch |
| 20 — The legacy `'English (US)'` value | 3 | An old-`localStorage` fixture renders a selected, working language |

**Ordering rationale:** Phase 1 must come first — every other phase depends on the `t()`
contract, the escaping rule, the plural subset and the validators, and changing them later
means redoing 37 files. Phase 2 is the bulk of the work and cannot start before the
catalogue format is frozen. Phase 3 is the risky one (a migration that touches a shared
document) and belongs after Phase 2 so the French catalogue is complete when the document
migration runs. Phase 4 needs both. Phase 5 is last.

---

## Sources

**Codebase (primary, HIGH confidence — read directly from this repository)**
- `.planning/PROJECT.md` — v1.2 scope, the three validated decisions, the "interface is
  English-only in practice" statement, the ~1 800 / 37-files extraction estimate
- `src/core/store.js` — `DEFAULT_PREFS.lang` (line 15), `STORE_KEY` (7), `docSnapshot`
  (95), `applyDoc` (173), `logAct` (244), `ROLE_LABELS` (250), `DEFAULT_PREFS.dateFmt`
- `src/core/utils.js` — `esc` (10), `MON`/`MONL`/`WD`/`WDL` (40-43), `setDateFormat` (46),
  `fmtDate` (49), `relDate` (58), `ago` (67), `dayBucket` (78), the store-free design note (44)
- `src/overlays/modals.js` — `H` without `esc` (31), `formChip` (64), the plural in
  `saveView` (58), `PERMS` (176), `shareModal` (177-231), `SHORTCUTS` (268-308)
- `src/pages/activity.js` — the English-verb filters (12-19), `dayBucket` as a map key (23)
- `src/components/task-list.js` — `actHtml` rendering the stored verb/extra (134)
- `src/actions/actions.js` — `logAct` calls with English prose (96, 115, 122),
  the English validation errors (652, 1345), the plural toasts (1010, 1015, 1634-1666)
- `src/pages/settings.js` — the six-language selector (176), `sel`/`srow` (66-77)
- `src/pages/auth.js` — the login labels asserted by the e2e suite (31-35)
- `src/ui/toast.js` — `toast(msg)` and its `esc()` (7-14)
- `src/core/theme.js` — `applyPrefs()` and the `setDateFormat` pattern (5-17)
- `src/core/constants.js` — `STATUSES` id/name split (2-9)
- `src/data/seed.js` — 539 lines of English demo content; `role: 'Owner'` display strings
- `src/shell/render.js` — `ROUTE_NAMES` (21 routes) and the full-shell render loop
- `src/shell/layout.js` — the sidebar, breadcrumbs, `ROUTE_NAMES` usage
- `server.js` — `SCHEMA` (78-125), `ensureColumn` (127-130), `openDb` (132-147),
  `userPayload` (244-251), `httpError` call sites (9), `migrateTenancy` (844-874),
  `backfillMemberships` (886-911), `memberProfile` (913-925), `ROLE_LABEL` (72),
  the static root (50)
- `test/migration.test.mjs` — `snapshot()` (148-162) and the second-boot no-op assertion
  (164-183)
- `e2e/tenancy.spec.mjs` — the English selectors (25-27, 52, 90, 119, 121-124, 128-130)
- `vite.config.js` — the `lucideSubset()` plugin and its `.js`-only scan
- `Dockerfile` — the build-time `npm run build` + `export-seed.mjs`, and the runtime
  `COPY --from=build /app/dist ./dist`
- `src/styles/` — `--side-w: 252px`, `--side-row: 30px` (tokens.css 87-88), `.btn`
  fixed height (components.css 4), `.modal-f` no wrap (overlays.css 63),
  `[data-tip] { content: attr(data-tip) }` (components.css 167), `.trunc` (base.css 91)

**Platform behaviour (measured on this machine's Node 24, HIGH confidence)**
- `Intl.PluralRules('fr')` → categories `one, many, other`; `select(0)='one'`,
  `select(1)='one'`, `select(2)='other'`, `select(1000000)='many'`
- `Intl.NumberFormat('fr-FR').format(1250000)` → `1 250 000` with **U+202F** separators;
  `style:'percent'` → `4 %` with **U+00A0** before the sign
- `Intl.DateTimeFormat('fr-FR', {dateStyle:'short'})` → `24/07/2026`; `{timeStyle:'short'}`
  → `20:30` (24-hour); `en-US` short → `7/24/26`
- `Intl.RelativeTimeFormat('fr', {numeric:'auto'})` → `hier`, `avant-hier`
- `Intl.DisplayNames(['en'],{type:'language'}).of('fr')` → `French`;
  `Intl.DisplayNames(['fr'],…).of('en')` → `anglais`
- `Intl.Collator('fr')` sorts `e` before `é`
- `typeof Intl.MessageFormat` → **`undefined`** (no platform ICU MessageFormat available)

**External (MEDIUM–HIGH confidence)**
- AZERTY Global, *French Typography: The Complete Guide*
  (https://azerty.global/en/french-typography, reviewed 2026-07-25) — NBSP before `:`,
  narrow NBSP before `; ! ?`, NBSP inside `« »`, curly apostrophe `’`, `…`, accented
  capitals, lowercase months and weekdays, sentence-case headings, decimal comma,
  U+202F digit grouping, `1er`/`2e` ordinals, NBSP before `%` and `h`
- Government of Canada, *Punctuation: standard spacing in English and French*
  (https://our-languages.canada.ca/en/writing-tips-plus/punctuation-standard-spacing-in-english-and-french)
  — the Canadian-French variant of the spacing rules
- MDN, *Intl.PluralRules* and *Intl.DateTimeFormat*
  (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules)
  — the plural-category model and the `dateStyle`/`timeStyle`/`hourCycle` options
- Unicode CLDR, *Language Plural Rules*
  (https://www.unicode.org/cldr/charts/43/supplemental/language_plural_rules.html) — the
  authoritative per-language plural categories
- ICU MessageFormat syntax (https://messageformat.github.io/messageformat/guide/,
  https://formatjs.github.io/docs/core-concepts/icu-syntax/) — the reference syntax the
  hand-rolled parser must **not** fully implement
- ESLint custom-rule practice for hardcoded UI strings — the pattern behind the no-literal
  lint gate

---

*Pitfalls research for: adding internationalisation to Gr8r Studio (existing app, hand-templated SPA, shared-document multi-tenant backend)*
*Researched: 2026-10-22*
