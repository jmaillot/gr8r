# Stack Research

**Domain:** Self-hosted project-management workspace — internationalisation layer (client-only, dependency-free)
**Researched:** 2026-10-22
**Confidence:** HIGH

---

## Executive answer

**The owner's decision is correct, and it is more correct than it looks.** The "is there a ~2 kB
zero-dependency library I should know about?" question has an honest answer: *no, not one worth
adding.* Every credible library either (a) is bigger than the entire hand-rolled layer it would
replace, (b) pulls runtime dependencies, or (c) is unmaintained.

**Use the platform `Intl` API. Add zero packages. Write ~120 lines of `src/core/i18n.js` and
~600–900 JSON keys.**

The decisive numbers:

| Option | Ship cost | Verdict |
|---|---|---|
| Hand-rolled on `Intl` (**recommended**) | ~120 lines, ~2.4 kB min / ~0.9 kB gzip | Ships in the milestone |
| `intl-messageformat` 12.1.4 (ICU) | 33.9 kB min / 10.0 kB gzip + **2 runtime deps** | 11× the size, breaks the zero-dep invariant |
| `i18next` 26.5.5 | 43.8 kB min / 13.8 kB gzip | 15× the size, framework-shaped, not a fit |
| `messageformat` 4.1.0 (MF2) | 25.1 kB min / 8.2 kB gzip | 9× the size, and MF2 ≠ ICU syntax |
| `@lingui/core` 6.10.0 | 5.3 kB min but 2 deps + a babel-macro peer dep | Build-tooling tax, no framework here to macro into |
| `@fluent/bundle` 0.19.1 | 11.5 kB min / 4.1 kB gzip, 0 deps | Fluent syntax ≠ JSON; last release 2025-04 |
| `nano-i18n` 1.0.0 | 892 B, 0 deps, ESM, tagged-template API | Unmaintained since 2021-09, 88 downloads/mo, no plurals/dates |
| `@comvi/core` 0.6.0 | MIT, 0 deps, vendor claims 5.6 kB core | Published 2026-10-20, 650 downloads/mo, 9 export subpaths, TS-first, 11.6 kB gzip measured — not the 2 kB library described |
| `@formatjs/intl-pluralrules` / `intl-relativetimeformat` | 953 kB / 12.4 MB unpacked | **Polyfills for browsers this project does not target** |

There *is* a zero-dependency ESM library with a tagged-template API — `nano-i18n` — and it is the
exact shape the owner described. It is also 5 years stale with 88 monthly downloads, does no
plurals, no dates, no numbers, and no locale negotiation. **Do not use it.**

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Platform `Intl` API** | ECMAScript-402, universal | All formatting: plurals, dates, numbers, currency, relative time, list | Already in the browser and in Node 24; zero bytes shipped; the ICU data (CLDR plural rules, locale formats) is maintained by Unicode, not by this project |
| `Intl.PluralRules` | Chrome 63 / FF 58 / Safari 13 | Select the plural form for a count | **The single most important API in this milestone.** Hand-rolled `n === 1` logic is wrong in French: `Intl.PluralRules('fr').select(0) === 'one'` (French treats 0 as singular) and `select(1000000) === 'many'`. French also resolves to *three* categories (`one`, `many`, `other`), English to two, Japanese to one (`other` only). A `n===1` ternary produces wrong French on 0 and on 1 000 000 |
| `Intl.DateTimeFormat` | Chrome 24 / Safari 10 | Date and time formatting | Replaces the hand-rolled `fmtDate()` + `MON`/`MONL`/`WD`/`WDL` arrays in `src/core/utils.js:44-51`. Verified: `fr-FR` `dateStyle:'long'` → `1 octobre 2026`; `en-US` → `October 1, 2026` |
| `Intl.NumberFormat` | Chrome 24 / Safari 10 | Numbers, percentages, currency | Replaces raw `${v}` interpolation. Verified: `fr-FR` → `1 234 567,891`; `en-US` → `1,234,567.891`; `style:'currency', currency:'EUR'` in `fr-FR` → `12,00 €` |
| `Intl.RelativeTimeFormat` | Chrome 71 / FF 65 / Safari 14 | "2 minutes ago" / "hier" | Replaces the hand-rolled `ago()` (`src/core/utils.js:71`). Verified `fr-FR` `numeric:'auto'`: `-1 day` → `hier`, `-2 minutes` → `il y a 2 minutes` |
| `Intl.DisplayNames` | Chrome 81 / FF 86 / **Safari 14.1** | Language names in the selector | `new Intl.DisplayNames(['fr'],{type:'language'}).of('fr')` → `français`; in `['en']` → `French`. **Below the Safari 14.0 floor — needs a fallback** (see Version Compatibility) |
| `Intl.Locale` | Chrome 74 / FF 75 / **Safari 14** | Locale canonicalisation, `baseName`, `maximize()` | `new Intl.Locale('fr-fr').baseName` → `fr-FR`. Below the Safari 14.0 floor — needs a fallback |
| `Intl.ListFormat` | Chrome 72 / FF 78 / **Safari 14.1** | "a, b et c" | Convenient but **below the floor** — use a hand-rolled join with a translated conjunction instead |
| **JSON** (ECMAScript 404) | n/a | Catalogue file format | Native to the platform; `import x from './locales/fr.json'` works in Vite 6 with **no import attribute and no plugin** (verified by building a scratch project) |
| `import.meta.glob` (Vite) | 6.4.4 (installed) | Lazy per-locale chunks | Verified: `import.meta.glob('./locales/*.json')` emits **one separate chunk per locale** (`fr-C8R63KK3.js`) and the French strings are **not** in the main bundle. The EN base catalogue can be statically imported (always in the main chunk) while FR is fetched on demand |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| *(none)* | — | — | — |

There are no supporting libraries. This is the point.

**Deliberately NOT used — with the reason:**

| Library | Why not |
|---|---|
| `intl-messageformat` | 33.9 kB min / 10 kB gzip **plus 2 runtime deps** (`@formatjs/fast-memoize`, `@formatjs/icu-messageformat-parser` → `@formatjs/icu-skeleton-parser`). Shipping 10 kB gzip + a dependency tree to parse a syntax the app uses in ~30 strings is a bad trade. It also *is* the ICU MessageFormat spec, which is the wrong level of complexity for a hand-written template-string renderer |
| `i18next` | 43.8 kB min / 13.8 kB gzip — 15× the whole hand-rolled layer. Built around a `t()`-with-plugins + `i18n.t` namespace model that assumes a framework's reactivity. No framework here |
| `@lingui/core` | Small (5.3 kB) but requires a Babel macro at build time (`babel-plugin-lingui-macro` peer dep). The project has **no Babel** — only Vite. Adding a macro pipeline to translate 800 strings is absurd |
| `messageformat` 4.1.0 (MF2) | 0 deps and modern, but MessageFormat **2.0** is a different syntax from ICU 1 and needs a *parser at runtime* to resolve `{{…}}` expressions. 25 kB min for a spec the app does not need |
| `@fluent/bundle` | Genuinely 0 deps and 4.1 kB gzip, and Fluent is a well-designed localisation format. But Fluent's `.ftl` syntax is not JSON, its plural system is *its own* (not `Intl.PluralRules`), and it was last published 2025-04-02. It would replace one format problem with another |
| `nano-i18n` | The closest match to the owner's description: 892 B, 0 deps, ESM, tagged-template-literal API. **But**: last published 2021-09-02, 88 downloads/month, self-described as "experimental", no plural/date/number support, no per-locale switching, no fallback chain, no interpolation of arbitrary values. It would have to be extended into the thing we are building anyway |
| `tiny-i18n` | 1 dep (`isomorphic-language`), last published 2020-07-03, dead |
| `polyglot` | 2013. Express-only. Dead |
| `i18n-js` | 3 deps incl. `lodash` and `bignumber.js`, 1.7 MB unpacked, Rails-shaped API |
| `@comvi/core` | The only genuinely current, MIT, zero-dependency, ESM, ICU-capable candidate — and it is 2 days old (published 2026-10-20), has 650 downloads/month, 9 export subpaths, is TypeScript-first (the project is plain JS), and measured 11.6 kB gzip — not the 2 kB library imagined. It is a good library for a TS project. It is not a fit here, and betting a milestone on a 2-day-old package is bad practice regardless |
| `@formatjs/intl-pluralrules`, `@formatjs/intl-relativetimeformat`, `@formatjs/intl-displaynames`, `@formatjs/intl-listformat` | **Polyfills for browsers this project does not target.** 953 kB and 12.4 MB unpacked respectively. The project's own floor (Vite 6 `modules` target) already has `PluralRules` (Safari 13), `RelativeTimeFormat` (Safari 14) and `DateTimeFormat`/`NumberFormat` (Safari 10) |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Vite 6.4.4 | Build | **Already installed.** Default `build.target` is `'modules'` → `es2020, edge88, firefox78, chrome87, safari14`. Do **not** change it in this milestone (that would be a separate, larger decision about browser support) |
| `node:test` (Node 24 built-in) | Catalogue validation tests | The project already has 50 `node:test` cases in `test/`. A catalogue test (every FR key exists in EN, no orphan keys, no English left in a FR value) fits here with **zero new dependencies** |
| `@playwright/test` 1.64.1 | Chromium e2e | **Already installed.** Bundled Chromium is 156.0.8078.4 — well past every `Intl` API's support floor. The "interface is in French" regression test belongs in `e2e/` |
| ESLint 9 / Prettier 3 | Lint/format | Already installed. Note `eslint.config.js` sets `ecmaVersion: 'latest'` — fine for `Intl` and for `import.meta.glob` |
| `Intl.supportedValuesOf('timeZone')` | Verify tz data | Node 24 returns 418 zones; browser support is Chrome 99+ / Safari 15.4+ — feature-detect if used |

---

## Installation

```bash
# NOTHING TO INSTALL.
# The i18n layer is platform-only. The zero-runtime-dependency property survives.
#
# Verify the invariant holds:
npm ls --omit=dev --all   # must print only the root project, no dependencies
```

The new files are **source files, not packages**:

```
src/core/i18n.js            # the t()/formatters core (~120 lines, no imports)
src/locales/en.json         # base catalogue (English source strings)
src/locales/fr.json         # French catalogue
```

---

## The recommended design, in detail

### 1. Catalogue format: **JSON, flat keys, ICU-lite plural**

**Use JSON. Not ICU MessageFormat. Not a custom DSL.**

The reason is not ideological — it is that ICU MessageFormat is a *grammar* and the app needs a
*lookup*. A grammar implies a parser (a dependency, or a hand-written one that must handle
`select`, `selectordinal`, `offset`, `#`, escaping, and nested plural-in-select). A lookup is a
property access.

**Shape:** flat dotted keys → string, or an object keyed by CLDR plural category.

```jsonc
// src/locales/en.json
{
  "settings.language.title": "Language",
  "settings.language.hint": "The language used throughout the interface.",
  "task.count": { "one": "{n} task", "other": "{n} tasks" },
  "task.count.overdue": { "one": "{n} task overdue", "other": "{n} tasks overdue" }
}
```

**Why plural-by-object and not a `.one` / `.other` key suffix:** the suffix approach forces the
translator to guess which suffixes the *target* locale needs. The object approach makes the
plural family one visible unit, and lets the code fall back `value[selected] ?? value.other` —
so a French translator who omits `many` still gets a correct string for 1 000 000, and a French
translator who *adds* `many` gets `1 000 000 de tâches` for free.

**Why not ICU MessageFormat syntax inside the JSON** (`"{n, plural, one {# task} other {# tasks}}"`):
it needs a runtime parser. The object form needs `Intl.PluralRules` — which the platform already
has, already knows the CLDR rules for every locale, and already gets right that French `0` is
`one` and Japanese has only `other`. **The plural logic is the one part of ICU you should not
hand-roll, and `Intl.PluralRules` is that part, for free.**

**Why flat keys, not nested objects:** nested keys make lookups a path walk and make the "is this
key present?" test awkward. Flat dotted keys are one property access, sort stably in a diff, and
the "FR has a key EN does not" test is a two-line `Set` difference.

**Interpolation syntax: `{name}`.** A single regex (`/\{(\w+)\}/g`) covers it. ICU's `'` escaping
and `#` are not needed because there is no ICU parser to confuse them with.

**The catalogue is a repo file, edited like code** — which matches the owner's stated scope
("no translation-management UI, catalogues are files in the repository").

### 2. Loading strategy: **static EN base + lazy per-locale chunks**

**Verified locally** by building a scratch Vite 6.4.4 project:

| Approach | Result |
|---|---|
| `import en from './locales/en.json'` | Inlined into the main chunk. No import attribute, no plugin needed. **Works out of the box in Vite 6** |
| `import.meta.glob('./locales/*.json')` (lazy, default) | **One separate chunk per locale.** `fr-C8R63KK3.js` was its own asset; the French strings were **not** in the main bundle |
| `import.meta.glob('./locales/*.json', { eager: true })` | All locales inlined into the main bundle — defeats the purpose |

**Recommended shape:**

```js
// src/core/i18n.js
import en from '../locales/en.json';

const loaders = import.meta.glob('../locales/*.json');  // lazy → one chunk each
```

- **EN is statically imported.** It is the fallback and the base language; it must be present
  synchronously at first paint, with no flash and no await. The base catalogue is also the
  diff target: the English source strings in the templates are the keys.
- **FR is loaded lazily** and cached in a module-level map. The locale switch is
  `await loadLocale('fr')` then re-render.
- **Do not mix a static and a dynamic import of the same file.** Vite warns
  (`dynamically imported … but also statically imported … dynamic import will not move module into
  another chunk`) and keeps it in the main chunk. So: static EN + lazy glob for the *rest*, and
  exclude EN from the glob (`import.meta.glob(['../locales/*.json', '!../locales/en.json'])`) —
  or just accept the warning. **This is a concrete trap the plan-phase must not walk into.**

**Why not fetch the JSON at runtime from `/locales/fr.json`?** It would work (the server's static
handler already serves `.json` with gzip), but it costs a network round trip, breaks the
"static-hosting mode" fallback (the app runs without the server, per `src/core/api.js` — nothing
answers `/api/config` and the app falls back to local-demo mode), and it cannot share the
`import.meta.glob` chunking. Bundling is strictly better here.

**Cost:** a realistic 900-key English catalogue measures **~76 kB raw / ~19 kB gzip**; the French
catalogue adds a similar amount in its own chunk. That is a meaningful but acceptable number on
a 111 kB gzip main bundle — and the FR chunk is only downloaded by users who pick French.

**Size discipline:** a nested catalogue compresses slightly worse than flat (measured 4.1 kB vs
4.0 kB gzip on a synthetic 900-key set) — a rounding error. Choose flat for the ergonomics, not
the bytes.

### 3. `t()` and the template-string renderer — the critical integration

This is the part that will actually break if it is designed badly, so it deserves an explicit
answer.

**The problem.** The renderer is hand-written HTML template strings. `esc()` (`src/core/utils.js:11`)
escapes *dynamic* values, but the translated strings are *static* text spliced straight into
markup. A French translator writing `Le projet « {name} »` or a string containing `&` or `<` can
break the surrounding markup or, worse, inject an attribute.

**The answer: separate text from markup. Never let a catalogue string contain HTML.**

```js
// src/core/i18n.js

/* The catalogue is TEXT. It never contains markup.
   Interpolation values are inserted as TEXT and escaped by the caller
   exactly as they are today (esc()). */
export const t = (key, vars) => {
  const s = resolve(key);
  if (s === undefined) return key;                 // visible, greppable fallback
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
};
```

Then the call sites keep the existing discipline, with the *catalogue* value trusted and the
*interpolated* value escaped:

```js
// ❌ wrong — the translated string and the user value are indistinguishable
srow(t('settings.members.access', { n: d.members.length, name: d.ws.name }), '', '')

// ✅ right — split the two concerns
srow(t('settings.members.access', { n: d.members.length }), '', '')
```

and where a value must appear *inside* a sentence, escape it at the call site:

```js
t('project.renamedTo', { name: esc(p.name) })   // esc() at the boundary, as today
```

**The rule to write down in the plan:**

> **Catalogue values are plain text. `t()` does not escape. Interpolated values are escaped by
> the caller at the point of interpolation, using the existing `esc()`. A catalogue value may
> never contain `<` or an unescaped `&`.**

**Enforce it with a test, not a convention.** The `node:test` suite should assert, for every
locale file: no value contains `<`; every `{placeholder}` in a value is a known key; FR key set
== EN key set. That test is ~40 lines, needs no dependency, and it makes the "translated string
breaking the markup" failure mode *impossible* rather than *unlikely*.

**Three specific traps in this codebase:**

1. **Attribute interpolation.** There are 43 `aria-label="${…}"`, 49 `value="${…}"` and 10
   `title="${…}"` interpolations across `src/`. A translated string containing a double quote
   breaks the attribute. Mitigation: the catalogue lint test should also reject `"` and `'`
   inside values, or the values should be restricted to a safe subset. **Recommendation: reject
   `<`, `>`, `"` in catalogue values.** French typography uses `« »` guillemets, not ASCII quotes,
   so this costs the French translator nothing.
2. **`toast()` already escapes** (`src/ui/toast.js:17` does `esc(msg)`), so toast messages passed
   through `t()` will be double-escaped if `t()` also escapes. **This is a concrete argument for
   `t()` NOT escaping** — keep the escaping at the existing boundaries and let `t()` be a pure
   lookup-plus-interpolate. The lint test then guarantees the catalogue contains nothing that
   could break out of a text node.
3. **`document.title` and the ARIA live region** (`src/shell/render.js:192,194`) are
   `textContent` sinks — they need *unescaped* text. Again: `t()` must not escape, or those two
   lines need a `raw` variant.

**Recommendation: `t()` never escapes. `tEsc()` never exists. The catalogue lint test guarantees
the catalogue is inert.** One function, one behaviour, no double-escape bugs.

### 4. Locale-aware dates, numbers, currency, relative time

Replace the hand-rolled formatters in `src/core/utils.js` — `MON`, `MONL`, `WD`, `WDL` (lines
44-47), `fmtDate` (49), `relDate` (60), `ago` (71) — with `Intl` calls, and **cache the formatter
objects**. `Intl.DateTimeFormat` construction is measurably expensive; a module-level
`Map<locale+options, formatter>` avoids rebuilding on every render (the app re-renders on every
keystroke in some views).

```js
const dtfCache = new Map();
const df = (locale, opts) => {
  const k = locale + JSON.stringify(opts);
  let f = dtfCache.get(k);
  if (!f) { f = new Intl.DateTimeFormat(locale, opts); dtfCache.set(k, f); }
  return f;
};
```

**Verified outputs (Node 24, real ICU 78.3):**

| Call | Result |
|---|---|
| `new Intl.DateTimeFormat('fr-FR',{dateStyle:'long'}).format(d)` | `1 octobre 2026` |
| `new Intl.DateTimeFormat('en-US',{dateStyle:'long'}).format(d)` | `October 1, 2026` |
| `new Intl.DateTimeFormat('fr-FR',{month:'short'}).format(d)` | `oct.` |
| `new Intl.DateTimeFormat('en-US',{month:'short'}).format(d)` | `Oct` |
| `new Intl.NumberFormat('fr-FR').format(1234567.891)` | `1 234 567,891` |
| `new Intl.NumberFormat('en-US').format(1234567.891)` | `1,234,567.891` |
| `new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(12)` | `12,00 €` |
| `new Intl.RelativeTimeFormat('fr-FR',{numeric:'auto'}).format(-1,'day')` | `hier` |
| `new Intl.RelativeTimeFormat('fr-FR',{numeric:'auto'}).format(-2,'minute')` | `il y a 2 minutes` |
| `new Intl.ListFormat('fr-FR',{style:'long'}).format(['a','b','c'])` | `a, b et c` |

**Do not build a currency formatter.** The plan/pricing strings (`$0`, `$12`, `$24` in
`src/pages/settings.js:395`) are USD amounts in a *display* field — the milestone's out-of-scope
note says "the plan stays a display value". If the plan UI is ever translated, the *label* is
translated; the *amount* should stay USD (`Intl.NumberFormat(locale, {style:'currency',
currency:'USD'})` renders `12,00 $US` in French). Translating the currency is a business decision,
not an i18n one.

**Careful with the existing `dateFmt` preference.** `src/core/utils.js:50` has a hand-rolled
format switch (`'MMM d'`, `'d/M'`, `'M/d'`, `'yyyy-MM-dd'`) driven by `prefs.dateFmt`, and
`src/pages/settings.js:191` shows a preview built on it. **Locale-based formatting and a
user-chosen fixed pattern are in tension** — `d/M` is the French pattern, `M/d` the American one.
Recommendation: keep `dateFmt` as an explicit *override* (it is a user preference, and the
Settings page promises it) but implement the four options on top of `Intl.DateTimeFormat` with
explicit `day`/`month`/`year` options rather than a string pattern, and make the *default* for a
new locale come from `Intl`. Do not delete the preference in this milestone — it is a separate
UX decision. Flag this to the roadmapper as a **design tension, not a blocker**.

**Time zone.** `prefs.tz` stores *display labels* like `'(GMT-08:00) Pacific Time'`, and
`Intl.DateTimeFormat` rejects those — verified: `RangeError: Invalid time zone specified:
(GMT-07:00) Pacific Time`. `Intl` needs an **IANA** identifier (`America/Los_Angeles`). So the
`tz` preference needs either an IANA-value migration or a label→IANA lookup table.
**This is a real pitfall for the plan-phase** and it is *not* in the milestone's stated scope —
it should be either deferred explicitly or handled by keeping `tz` display-only (labels rendered
from the pref, formatting done in the browser's own zone). **Recommend: defer. Use the browser's
resolved zone for formatting in v1.2 and leave the `tz` preference as a stored display value.**
Note it in PITFALLS-style for the roadmap.

### 5. Language-preference detection and fallback

**Three layers, in this order:**

1. **The stored per-user preference (authoritative).** The milestone makes the locale a column on
   `users`, returned by the server. The client reads it at boot and applies it. This is the only
   layer that matters after the first sign-in.
2. **`navigator.languages` (first-visit fallback).** `navigator.languages` is an array ordered by
   preference; `navigator.language` is the first entry. Match against the available locales:
   exact match (`fr-FR` → `fr`), then base-language match (`fr-CA` → `fr`), then fall back to `en`.
   Use `Intl.getCanonicalLocales()` to normalise case and separators first
   (verified: `Intl.getCanonicalLocales('FR-fr-u-ca-gregory')` → `['fr-FR-u-ca-gregory']`).
3. **`Accept-Language` (server-side, optional).** The server serves a single `index.html` for
   every route — it does **not** server-render the app, so `Accept-Language` cannot change the
   HTML. It matters only if the server ever localises the *invitation email* (`mailer.js:409` —
   `const subject = \`You're invited to ${workspace}\``) or the initial `document.documentElement.lang`
   attribute. **Recommendation: implement `Accept-Language` parsing only if the email is
   localised. Otherwise skip it entirely** — it is a whole parsing surface (q-values, wildcard
   `*`, malformed headers) for zero user-visible benefit in a client-rendered SPA.

   If it is needed, it is ~15 lines with no dependency: parse `Accept-Language` into
   `[tag, q]` pairs, sort by q descending, and apply RFC 4647 lookup (exact → progressively
   truncate subtags) against the available locale list. Node 24 gives `Intl.getCanonicalLocales`
   and `Intl.Locale` for canonicalisation; there is **no built-in `Accept-Language` parser** in
   Node.

**Where the preference is applied.** `src/main.js:115` currently hardcodes
`document.documentElement.lang = 'en'`. That line becomes
`document.documentElement.lang = <resolved locale>`. This also fixes the `<html lang="en">` in
`index.html:2` for the *initial* paint — but note the initial HTML is static, so the `lang`
attribute is only correct after JS runs. For a client-rendered SPA that is acceptable (and the
`index.html` `lang="en"` should arguably become `lang="en"` still, since EN is the base and
fallback — the real fix is that the *server* knows the user's locale and could serve a
per-locale `lang`, but that is server-rendering, out of scope).

**`document.documentElement.lang` matters for accessibility and for browser features** (Chrome's
translate prompt, `Intl` defaults). Set it.

### 6. Keeping the zero-dependency build

- **Add nothing to `package.json` `dependencies`.** There is no `dependencies` block today at
  all — only `devDependencies`. Do not create one.
- **The i18n layer imports nothing.** `src/core/i18n.js` imports only `src/locales/*.json` (via
  Vite) and, if the split is clean, nothing else. No `Intl` polyfill, no date library, no
  number library.
- **The build stays `npm run build` → Vite → `dist/`.** The Dockerfile copies `dist/` unchanged;
  the FR chunk is just another file in `dist/assets/`, served by the existing static handler
  (which already gzips `.js` — verified `COMPRESSIBLE` includes `.js` and the server has a
  `gzipCache`).
- **Do not add a `build.target` change.** Vite 6's `'modules'` default
  (`es2020/edge88/firefox78/chrome87/safari14`) is the project's de-facto support baseline. Every
  `Intl` API the layer *needs* is available there.
- **CI already runs `npm run lint && npm run format:check && npm run build && npm test`.** The
  catalogue lint test slots into `npm test` with no CI change.
- **Add a guard so the invariant cannot silently regress.** A one-line assertion in the existing
  test suite — e.g. read `package.json`, assert `dependencies` is absent or empty — turns "no
  runtime dependency" from a convention into an enforced property. **Recommendation: add it.**
  It is cheap and it is the whole point of the milestone's constraint.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Hand-rolled `Intl` core (~120 lines) | `intl-messageformat` 12.1.4 | If the catalogue ever needs ICU `select` (gender/context branching) across *many* strings, or if a second locale with complex grammar lands and the ICU grammar is cheaper than hand-rolling it. Costs 10 kB gzip + 2 deps — which the owner has explicitly ruled out |
| Hand-rolled `Intl` core | `i18next` 26.5.5 | In a React/Vue/Svelte app that already ships a framework and wants namespaces, backend loading, or a plugin ecosystem. Not here |
| JSON catalogue, flat keys | ICU MessageFormat strings in JSON | When translators must control sentence structure (gender, complex reordering) and a runtime parser is acceptable. For 2 locales and ~800 mostly-noun phrases, the object-keyed plural form is enough |
| JSON catalogue, flat keys | `@fluent/bundle` / Fluent `.ftl` | When the project grows many locales and needs Fluent's term references, `select` expressions and its built-in gender-aware selection |
| JSON, lazy `import.meta.glob` chunks | Runtime `fetch('/locales/fr.json')` | In a deployment where the server can serve a hashed, cache-busted locale file and the app is guaranteed to have a server (this one also runs serverless/static, so no) |
| `Intl.PluralRules` for plurals | Hand-rolled `n === 1 ? a : b` | **Never, for this project.** French `0` is `one` and `1000000` is `many`; Japanese has only `other` |
| `Intl.RelativeTimeFormat` for "3m ago" | Keep the hand-rolled `ago()` | Never — the hand-rolled version produces `2m ago` in every language, which is not French |
| `Intl.DisplayNames` for the language list | Hard-code `['English','Français']` in the catalogue | `DisplayNames` is below the Safari 14.0 floor. **The hard-coded list is the safer choice** for 2 locales and costs 2 lines |
| `Intl.ListFormat` for "a, b et c" | Join with a translated conjunction | `ListFormat` is below the floor. For 2 locales, `"a" + t('and') + "b"` is adequate — but it is grammatically weaker. Low priority |
| Hand-rolled, no library | `@comvi/core` 0.6.0 | In a TypeScript project that wants typed keys and real ICU with a maintained, MIT-licensed, zero-dependency library. It is 2 days old; the API is stable-looking but unproven. **Not for a milestone** |
| Hand-rolled, no library | `nano-i18n` 1.0.0 | Never for this project — 5 years stale, 88 downloads/month, no plural/date support |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `intl-messageformat`, `i18next`, `@lingui/core`, `messageformat`, `@fluent/bundle` | All break the zero-runtime-dependency invariant; the smallest (`@lingui/core`) requires a Babel macro the project does not have | The platform `Intl` API |
| `nano-i18n`, `tiny-i18n`, `polyglot`, `i18n-js` | Unmaintained (2020-2021) or dependency-laden; would be extended into the thing being built anyway | Hand-rolled |
| `@formatjs/intl-pluralrules` / `intl-relativetimeformat` / `intl-displaynames` / `intl-listformat` | Polyfills for browsers the project does not target (953 kB and 12.4 MB unpacked). `Intl.PluralRules` is in Safari 13; `RelativeTimeFormat` in Safari 14; `DateTimeFormat`/`NumberFormat` in Safari 10 | Nothing — use native `Intl` |
| `@comvi/core` | 2 days old, 650 downloads/month, TS-first, 11.6 kB gzip measured — not the 2 kB library imagined | Hand-rolled, now |
| A **runtime parser** for any message syntax | A parser is a dependency or a liability; the app's needs are lookup + `Intl.PluralRules` | Lookup + `Intl` |
| **HTML inside catalogue values** | A translated `<` or `"` breaks the surrounding template string or an attribute. 43 `aria-label`, 49 `value` and 10 `title` interpolations are exposed | Plain-text catalogue values; escape interpolated values at the call site with the existing `esc()`; enforce with a lint test |
| **`t()` that escapes** | `toast()` (`src/ui/toast.js:17`) already escapes; `document.title` and the ARIA live region (`src/shell/render.js:192,194`) are `textContent` sinks and need raw text. A double-escaping `t()` breaks all three | `t()` returns raw text; the catalogue lint test makes it inert |
| **ICU's `'` escaping and `#`** in a non-ICU parser | They only exist to disambiguate inside ICU. Without ICU there is no ambiguity, and a translator writing `l'{name}'` would get a literal `'` | Plain `{name}` interpolation, one regex |
| **Changing `build.target`** in this milestone | It is a browser-support policy decision, not an i18n decision, and it silently changes the whole app's output | Leave Vite 6's `'modules'` default; feature-detect the two APIs below the floor |
| **A server-rendering / `Accept-Language` layer** | The app is client-rendered; the server serves one `index.html` for all routes. Accept-Language cannot change the HTML | `navigator.languages` client-side + the stored per-user preference |
| **Translating the currency** | The plan is a display value in USD; a translated currency is a business decision | Translate the *label*; format the amount with `currency:'USD'` |

---

## Stack Patterns by Variant

**If only 2 locales (EN, FR) — the v1.2 case:**
- Use a static import for EN and a lazy `import.meta.glob` for FR.
- Store the locale on the `users` row; return it in the `userPayload()` shape
  (`server.js:244`) so the client gets it with the existing `/api/auth/me` round trip — no new
  endpoint needed for *reading*.
- Write the locale via a dedicated endpoint, **not** through the workspace document. The current
  `prefs.lang` lives in the *shared* workspace document (`src/core/store.js:15` in
  `DEFAULT_PREFS`, pushed by `docSnapshot()` at `src/core/store.js:95`) — that is exactly the
  bug the milestone is fixing. The write path must bypass `save()`/`push()` and hit a per-user
  route.
- Use the existing `ensureColumn()` helper (`server.js:127`) for the `users.locale` column — it is
  the same additive mechanism the tenancy migration used, and it is idempotent.
- **Recommendation: keep the locale OUT of the workspace document entirely.** Do not leave a
  `prefs.lang` in `DEFAULT_PREFS`; remove it and let the column own it. A leftover shared copy
  is a second source of truth that will drift.

**If a third locale arrives later (DE, ES, JA — explicitly out of scope):**
- `import.meta.glob` already handles it: each locale becomes its own chunk, nothing to change in
  the build.
- `Intl.PluralRules` already handles it: DE → `one`/`other`, ES → `one`/`many`/`other`,
  JA → `other` only. **Japanese has no plural inflection**, so a catalogue with only `other` is
  correct for JA and the `value[selected] ?? value.other` fallback covers it.
- `Intl.DisplayNames` becomes more useful (self-describing language names: `français`, `日本語`).
  But it is still below the Safari 14.0 floor — keep the fallback.
- **The selector must only list locales that exist.** The owner's decision to drop
  Deutsch/Español/Français/日本語 from `src/pages/settings.js:176` until they are real is
  correct and should be enforced by a test: *the locale list and the catalogue directory must
  have the same members.*

**If the catalogue grows past ~1500 keys or a locale with complex grammar lands:**
- Reconsider `intl-messageformat`. The break-even is real: 10 kB gzip + 2 deps vs. hand-writing
  a parser for `select`/`selectordinal`/`offset`. At 800 flat strings with ~30 plurals, it is not
  worth it. At 3000 strings with gender branching in 8 locales, it probably is.
- **Decide at that point, not now.** The migration cost of switching is low *if the catalogue
  format is kept simple* — which is the argument for JSON-with-objects now.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Platform `Intl` (ES-402) | Node 24.21.0 (verified: full ICU 78.3, `icu_small=false`) | All APIs present: `PluralRules`, `RelativeTimeFormat`, `ListFormat`, `DisplayNames`, `DateTimeFormat`, `NumberFormat`, `Locale`, `Segmenter`, `DurationFormat` |
| Platform `Intl` | Chromium 156 (Playwright 1.64.1, verified `browserVersion: 156.0.8078.4`) | All APIs present |
| `Intl.PluralRules` | Chrome 63 / Firefox 58 / Safari 13 / Edge 18 | ✅ **At or below the Vite 6 `modules` floor.** Use unconditionally |
| `Intl.RelativeTimeFormat` | Chrome 71 / Firefox 65 / Safari 14 | ✅ **At the floor.** Use unconditionally |
| `Intl.DateTimeFormat`, `Intl.NumberFormat` | Chrome 24 / Firefox 29 / Safari 10 | ✅ Well below the floor. Use unconditionally |
| `Intl.DisplayNames` | Chrome 81 / Firefox 86 / **Safari 14.1** | ⚠️ **Above the Safari 14.0 floor.** Feature-detect: `typeof Intl.DisplayNames === 'function'`, else fall back to a hard-coded list |
| `Intl.Locale` | Chrome 74 / Firefox 75 / **Safari 14** | ⚠️ At the floor. Feature-detect, or use `Intl.getCanonicalLocales` (Chrome 64 / FF 75 / Safari 10) instead for canonicalisation |
| `Intl.ListFormat` | Chrome 72 / Firefox 78 / **Safari 14.1** | ⚠️ **Above the floor.** Skip for v1.2; join with a translated conjunction |
| `Intl.Segmenter` | Chrome 87 / Firefox 125 / Safari 14.1 | ⚠️ Firefox 125 is above the Firefox 78 floor. Not needed |
| `Intl.DurationFormat` | Chrome 129 / Firefox 136 / Safari 16.4 | ❌ Far above the floor. Do not use |
| Vite 6.4.4 | Node 24 (`engines.node >= 24`) | ✅ `build.target` default `'modules'` → `es2020, edge88, firefox78, chrome87, safari14`. JSON import needs no attribute and no plugin |
| Vite 7+ | — | Would change the default target to `baseline-widely-available` (chrome111/edge111/firefox114/safari16.4) and remove the Safari 14.0 caveat. **Out of scope for this milestone** — a separate browser-support decision |
| `@playwright/test` 1.64.1 | Chromium 156 | ✅ e2e coverage of every `Intl` API |

**Hard floor summary — what the layer may rely on with no feature detection:**
`Intl.PluralRules`, `Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.RelativeTimeFormat`,
`Intl.getCanonicalLocales`, `Intl.Locale` (at the floor — detect anyway).
**What needs a fallback:** `Intl.DisplayNames`, `Intl.ListFormat`, `Intl.Segmenter`.

---

## Concrete integration checklist for the plan-phase

1. **New file** `src/core/i18n.js` — `t()`, `setLocale()`, `getLocale()`, `availableLocales()`,
   and cached `Intl` formatter helpers. No imports beyond the JSON catalogues.
2. **New files** `src/locales/en.json`, `src/locales/fr.json` — flat dotted keys; values are
   plain text; plurals are objects keyed by CLDR category.
3. **Modify** `src/main.js:115` — `document.documentElement.lang = <resolved locale>`.
4. **Modify** `src/core/store.js:8-22` — **remove `lang` from `DEFAULT_PREFS`.** Leaving it
   creates a second source of truth that will drift from the `users.locale` column.
5. **Modify** `src/pages/settings.js:176` — the selector lists only `EN` and `FR`, with
   self-describing names. The **value** must be a locale code (`en`, `fr`), not a display label —
   the current `sel()` helper stores the *label* (`'English (US)'`) as the value, which is why
   `DEFAULT_PREFS.lang` is a display string. **That is a design bug the locale column fixes**:
   store `'fr'`, display `'Français'`.
6. **Modify** `server.js` — `ensureColumn(db, 'users', 'locale', "text not null default 'en'")`
   next to the existing `ensureColumn` calls (`server.js:141-144`); add `locale` to
   `userPayload()` (`server.js:244`); add a `PUT /api/auth/me/prefs`-style route for the write.
7. **Modify** `src/core/utils.js` — replace `MON`/`MONL`/`WD`/`WDL`/`fmtDate`/`relDate`/`ago`
   with `Intl`-backed versions, **or** keep them as thin wrappers over the new i18n module.
   `MON`/`WD` are used for calendar headers and *must* become locale-aware, not translated.
8. **New test** `test/i18n.test.mjs` — catalogue lint (no `<`/`>`/`"` in values; FR key set ==
   EN key set; no placeholder drift) + a `package.json` assertion that `dependencies` is empty.
9. **New e2e** in `e2e/` — set the locale to `fr`, assert the interface is French and that no
   English string leaks. Chromium 156 has every `Intl` API, so this test exercises the real
   French formatting, not a stub.
10. **Trap to avoid:** do not statically import `en.json` *and* dynamically import it via
    `import.meta.glob`. Vite warns and keeps it in the main chunk. Static EN + lazy glob for the
    rest, with EN excluded from the glob pattern.
11. **Trap to avoid:** `t()` must not escape. `toast()`, `document.title` and the ARIA live region
    already handle their own escaping (or need raw text).

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Platform `Intl` availability & outputs | **HIGH** | Read directly from MDN browser-compat-data (the upstream source, not a blog), and every behaviour verified by running it on the project's actual Node 24.21.0 with full ICU 78.3 |
| Vite 6.4.4 build/JSON/glob behaviour | **HIGH** | Verified empirically by building scratch projects with the project's own installed Vite 6.4.4 — chunk splitting, JSON inlining, and the static/dynamic-import warning were all observed, not inferred |
| Library sizes, deps, versions, maintenance | **HIGH** | npm registry metadata and the bundlephobia size API, queried directly for each candidate; tarball downloaded and measured for `@comvi/core`; `nano-i18n` source read |
| Zero-dep recommendation | **HIGH** | Follows from the measured sizes and the owner's stated invariant; the only genuinely borderline candidate (`@comvi/core`) was measured and found 6× the size advertised and 2 days old |
| Catalogue format choice (JSON vs ICU) | **MEDIUM-HIGH** | The *tradeoff* is well-grounded (measured sizes, real plural-category differences). The judgement that ~800 keys does not need ICU is an opinion, but a well-supported one |
| `t()`-in-template escaping design | **MEDIUM-HIGH** | Grounded in a full grep of the codebase's sinks (43 `aria-label`, 49 `value`, 10 `title`, `toast()`'s own `esc`, the two `textContent` sinks) and in a working prototype. The lint-test approach is sound but the exact lint rules should be settled with the owner |
| `Accept-Language` necessity | **MEDIUM** | The client-rendered architecture argument is verified from `server.js`'s static handler and `index.html`. Whether the *email* should be localised is a scope question, not a research finding |
| The `dateFmt` / `tz` preference tension | **MEDIUM** | The `Intl` rejection of the label-format timezone is verified (`RangeError`). The *product* decision on what to do with it is not a research finding — it needs the owner |

---

## Gaps to Address

- **The `dateFmt` preference vs. locale-aware dates.** Two preferences competing for one
  surface. Needs an owner decision: does `dateFmt` survive as an explicit override, or does the
  locale own the format? Recommend keeping it as an override in v1.2, implemented with
  `Intl.DateTimeFormat` options rather than pattern strings.
- **The `tz` preference stores display labels, not IANA zones.** `Intl` needs IANA. Recommend
  deferring: format in the browser's resolved zone and leave `tz` as a display value. Confirm
  with the owner.
- **Whether the invitation email (`mailer.js:409`) is in scope.** If yes, `Accept-Language` and a
  server-side catalogue become necessary — a materially larger scope. Recommend **out of scope
  for v1.2**.
- **Whether `prefs.lang` should be fully removed from the workspace document**, or kept in sync
  as a mirror. Recommend full removal — one source of truth.
- **Number/date format coverage audit.** This research sizes the catalogues and settles the
  format questions, but it has **not** enumerated all ~1 800 string occurrences across the 37
  files. The exact key inventory is a mechanical extraction task for the plan phase; the
  *mechanism* is settled here.
- **French translation quality.** Out of scope for stack research, but the "no English leaks"
  e2e test is a technical gate that will fail on untranslated strings — it needs a
  completeness definition (key-set equality, which the lint test enforces) rather than a
  subjective one.
- **`Intl.DisplayNames` fallback form.** Recommended: hard-code the 2 language names. If more
  locales land, revisit.

---

## Sources

- **MDN browser-compat-data** (`mdn/browser-compat-data`, `javascript/builtins/Intl/*.json`, fetched 2026-10-22) — every `version_added` figure in the compatibility table — **HIGH**
- **Node 24.21.0, measured on the project interpreter** — `process.versions.icu = 78.3`,
  `icu_small = false`, all `Intl` constructors present, and every formatted output in the
  "Verified outputs" table — **HIGH**
- **Vite 6.4.4, measured by building scratch projects** with the project's own installed Vite —
  JSON import inlining, per-locale chunk splitting via `import.meta.glob`, the static/dynamic
  import warning, and `build.target` default — **HIGH**
- **npm registry metadata** (`registry.npmjs.org/<pkg>`, fetched 2026-10-22) — versions,
  dependency lists, licences, publish dates, monthly download counts — **HIGH**
- **bundlephobia size API** (`bundlephobia.com/api/size`, fetched 2026-10-22) — minified and
  gzip sizes for every candidate — **HIGH**
- **`@comvi/core` 0.6.0 tarball**, downloaded and measured — 126 kB tarball, 536 kB `dist/`,
  11.6 kB gzip for `comvi-core.global.prod.js`, 9 export subpaths, 0 dependencies — **HIGH**
- **`nano-i18n` 1.0.0 tarball**, downloaded and read — 892 B, 0 deps, ESM, tagged-template API,
  last published 2021-09-02 — **HIGH**
- **Vite 6 documentation** (`v6.vite.dev/config/build-options`, `v6.vite.dev/guide/build`) —
  `build.target` default `'modules'` and its browser list — **HIGH**
- **Vite 7 documentation** (`vite.dev/config/build-options`, `vite.dev/guide/migration`) — the
  `'baseline-widely-available'` default and the Chrome 107→111 migration, for the "if we upgrade
  later" note — **HIGH**
- **ICU MessageFormat syntax reference** (`messageformat.github.io/messageformat/guide/`) —
  `plural` vs `selectordinal`, the `#` substitution — **MEDIUM**
- **Unicode CLDR** (via `Intl.PluralRules` on Node 24) — the CLDR plural category set
  (`zero`/`one`/`two`/`few`/`many`/`other`) and the per-locale resolutions for en/fr/de/es/ja —
  **HIGH**
- **The Gr8r Studio codebase itself** — `src/core/utils.js` (formatters, `esc`), `src/core/store.js`
  (`DEFAULT_PREFS`, `docSnapshot`), `src/pages/settings.js` (the selector), `src/ui/toast.js`
  (double-escape trap), `src/shell/render.js` (`textContent` sinks), `src/main.js:115`
  (`documentElement.lang`), `server.js` (`ensureColumn`, `userPayload`, static handler, CSP),
  `mailer.js:409` (the invitation subject) — **HIGH**
- **The project build** — `npm run build` output measured: main chunk 388 kB raw / **111 kB gzip**,
  CSS 75 kB raw / 15 kB gzip — the baseline the catalogue is added to — **HIGH**

---
*Stack research for: Gr8r Studio v1.2 — dependency-free i18n layer*
*Researched: 2026-10-22*
