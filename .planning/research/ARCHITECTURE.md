# Architecture Research — i18n integration for Gr8r Studio

**Domain:** Self-hosted project-management SPA (plain ES modules + Vite) with a single-Node API and SQLite
**Researched:** 2026-10-22
**Confidence:** HIGH — every recommendation below is anchored to a named file, line and existing mechanism in this repository
**Scope:** How a hand-made, dependency-free i18n layer (`t()` + JSON catalogues) integrates with Gr8r Studio's existing architecture. No framework, no bundler plugin, no runtime dependency.

---

## Answers at a glance

| # | Question | Recommendation | Where it lands |
|---|----------|----------------|----------------|
| 1 | Where does `t()` live, and how is it reached? | A **new leaf module `src/core/i18n.js`** that imports nothing but the JSON catalogues. Every module imports it directly (`import { t } from '../core/i18n.js'`). The locale is a **module-level mutable singleton** — *not* threaded through function signatures. | new `src/core/i18n.js` |
| 2 | How is the locale resolved at boot, and how is the flash of English avoided? | Resolution order: **server `user.locale` → `localStorage['gr8r.locale']` → `navigator.languages` → `'en'`**. The workspace's legacy `prefs.lang` is **ignored** (it was never functional and is shared by every member). There is **no flash**: the app renders nothing until `render()` is called, so the locale must be resolved *before* the first `render()`. | `src/main.js`, `src/core/api.js` |
| 3 | Bundled, lazy-fetched, or both? | **Bundled as static JSON imports.** English statically imported (always present = the fallback), French statically imported too. No HTTP catalogue route, no lazy chunk, no new Docker `COPY`, no new server route. | new `src/locales/*.json`; `vite.config.js` and `Dockerfile` **unchanged** |
| 4 | Where is the per-user locale stored and delivered? | **A new `users.locale` column** (nullable), added with the existing `ensureColumn()` helper. Delivered in `userPayload()`, so `GET /api/auth/me` already returns it. **No `migrateTenancy()` change** — a nullable column is a schema change, not a data migration. Accounts with `NULL` are seeded by the client on first sign-in. | `server.js:79`, `server.js:127`, `server.js:244`, `server.js:1226` |
| 5 | How do translated strings compose with hand-written HTML? | **`t()` returns HTML-escaped text** and may be interpolated anywhere in a template literal (text nodes *and* attribute values). A second function **`tText()`** returns raw text for sinks that escape themselves (`empty()`, `toast()`, `document.title`). `data-*` attribute values are **never** translated — they are machine identifiers. | new `src/core/i18n.js` |
| 6 | How do dates, relative times, numbers and plurals get the locale? | **The same module-level singleton**, composed with `Intl.*`. `utils.js` already owns a mutable `dateFormat` + `setDateFormat()` — the i18n layer follows that exact house pattern. `Intl.PluralRules` for plurals, `Intl.DateTimeFormat` for month/weekday names, `Intl.NumberFormat` for numbers. | `src/core/utils.js`, `src/core/i18n.js` |
| 7 | How is "the interface is in French" regression-tested? | **Two-sided proof.** (a) A *sentinel sweep* in Chromium: every English catalogue value whose French counterpart differs must be **absent** from the rendered DOM. (b) A *coverage assertion*: the same surfaces must contain French catalogue values. Plus a **static source scan** in `node:test` that every user-facing literal in `src/` is present in `en.json` — this is what catches a newly added button that was never translated. | new `test/i18n.test.mjs`, new `e2e/i18n.spec.mjs` |

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  src/locales/  —  static, bundled by Vite, no network, no runtime dep │
│  ├── registry.js   (code + native label of every locale that exists)  │
│  ├── en.json       (base catalogue — always present, the fallback)    │
│  └── fr.json       (French catalogue)                                  │
└──────────────────────────────────────────────────────────────────────┘
             ▲ static import                    │ static import
             │                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│  src/core/i18n.js   —  LEAF MODULE (imports only the catalogues)       │
│  ├── locale singleton  (getLocale / setLocale)                        │
│  ├── t(key, params)      → HTML-escaped text   (95 % of call sites)   │
│  ├── tText(key, params)  → raw text            (title, toast, empty()) │
│  ├── plural(n) / fmtNumber(n) / dt(opts)  → Intl wrappers            │
│  └── setLocale() → updates state, <html lang>, localStorage,          │
│                    dispatches `gr8r:locale` (same pattern as           │
│                    `gr8r:save-error` in src/core/store.js:97)          │
└──────────────────────────────────────────────────────────────────────┘
             ▲                                   ▲
             │ import { t }                     │ import { getLocale, dt }
             │                                   │
┌────────────────────────┐        ┌──────────────────────────────────────┐
│  RENDER LAYER           │        │  src/core/utils.js                   │
│  pages/ views/ overlays/│        │  fmtDate / relDate / ago / dayBucket│
│  actions/ components/   │        │  MON,WD,MONL,WDL → locale-aware fns  │
│  features/ ui/ shell/   │        └──────────────────────────────────────┘
│  (~1 800 call sites)    │
└────────────────────────┘
             ▲
             │  setLocale() / PATCH /api/auth/me
┌──────────────────────────────────────────────────────────────────────┐
│  src/core/api.js — applyUser() adopts `user.locale` in ONE place     │
│  src/main.js  — resolves the locale BEFORE the first render()          │
└──────────────────────────────────────────────────────────────────────┘
             ▲                                    ▲
             │ GET /api/auth/me                   │ PATCH /api/auth/me
             │ (user.locale)                      │ { locale: 'fr' }
┌──────────────────────────────────────────────────────────────────────┐
│  server.js  (Node 24, node:sqlite)                                   │
│  users.locale  text null   ← ensureColumn(), same helper as           │
│                                workspaces.slug / memberships.member_id│
│  userPayload() gains `locale` → reaches GET /api/auth/me,             │
│                                POST /api/auth/login, /signup,          │
│                                POST /api/invites/:token/accept         │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical implementation |
|-----------|----------------|------------------------|
| `src/core/i18n.js` (new) | Owns the current locale; resolves keys; escapes; interpolates; plural selection; locale-aware number/date primitives. **Imports nothing from `src/` except the catalogues** — this is what keeps the dependency graph acyclic. | A plain ES module with module-level `let _locale = 'en'`, a `Map` of loaded catalogues, and exported functions. |
| `src/locales/registry.js` (new) | The list of locales that *actually exist* — `[{ code: 'en', label: 'English' }, { code: 'fr', label: 'Français' }]`. Drives the language selector. | A hand-maintained list, enforced by a test that asserts registry ⇄ files agreement. |
| `src/locales/en.json`, `fr.json` (new) | The catalogues. Flat, dotted, namespaced keys. Values are either a string or a plural object `{ one, other }`. | JSON, imported with `with { type: 'json' }` so **both** Vite and bare Node 24 can read them. |
| `src/core/api.js` (modified) | Carries the server's locale into the client. `applyUser()` — already the single funnel for `me()`, `login()`, `signup()`, `acceptInvite()` — becomes the single place the locale lands. Adds `api.setLocale(code)`. | `import { setLocale } from './i18n.js'`; `applyUser()` calls `setLocale(user.locale)`. |
| `src/main.js` (modified) | Boot ordering. Resolves the locale before the first `render()`; replaces the hard-coded `document.documentElement.lang = 'en'` (`main.js:115`); listens for `gr8r:locale` and re-renders. | ~15 changed lines. |
| `src/core/store.js` (modified) | Drops `DEFAULT_PREFS.lang` (`store.js:15`) and stops round-tripping the legacy field. The locale no longer lives in the shared workspace document. | One key removed, one `delete` in `applyDoc()`. |
| `src/core/utils.js` (modified) | Locale-aware date/relative-time rendering built on `Intl`, replacing the hand-rolled `MON`/`MONL`/`WD`/`WDL` arrays (`utils.js:40-43`). | `import { getLocale, dt } from './i18n.js'` — one direction, no cycle. |
| `server.js` (modified) | Owns the account's locale: the column, the payload field, the write endpoint, the allowlist. | `ensureColumn(db, 'users', 'locale', 'text')` + a `PATCH /api/auth/me` branch. |
| `src/pages/settings.js`, `src/actions/actions.js` (modified) | The language selector becomes a **per-account** control instead of a workspace preference. | `sel()` gains a `src` argument (mirroring the existing `tog(k, on, src)`); new `IN.localeSel`. |

---

## Recommended Project Structure

### New files

```
src/core/i18n.js              the layer: locale singleton, t(), tText(), Intl wrappers
src/locales/registry.js       [{ code, label }] for every locale that exists
src/locales/en.json           base catalogue (English)
src/locales/fr.json           French catalogue
test/i18n.test.mjs            unit tests + catalogue parity + static source scan
e2e/i18n.spec.mjs             Chromium regression: French present, English absent
test/fixtures/i18n-pending.json  TEMPORARY shrinking allow-list of literals
                                not yet extracted (deleted when it reaches {})
```

### Modified files

| File | Change | Size |
|------|--------|------|
| `server.js` | `users.locale` column (`ensureColumn`), `userPayload().locale`, `PATCH /api/auth/me` branch, `SUPPORTED_LOCALES` allowlist, `sameOrigin` guard | ~40 lines |
| `src/core/api.js` | `applyUser()` adopts the locale; new `api.setLocale()`; `api.me()` unchanged otherwise | ~20 lines |
| `src/main.js` | Resolve the locale before the first `render()`; `document.documentElement.lang`; `gr8r:locale` listener | ~15 lines |
| `src/core/store.js` | Remove `DEFAULT_PREFS.lang`; `delete S.prefs.lang` in `applyDoc()` | ~3 lines |
| `src/core/utils.js` | Locale-aware `fmtDate` / `relDate` / `ago` / `dayBucket`; `MON`/`WD`/`MONL`/`WDL` → functions | ~60 lines |
| `src/core/constants.js` | Status / priority / label / project-status **display names** move to the catalogue (ids stay) | ~30 lines |
| `src/shell/render.js` | `pageTitle()` (`:108`) uses `t('route.*')`; `ROUTE_NAMES` keeps the machine keys | ~10 lines |
| `src/shell/layout.js` | Sidebar / topbar labels | ~40 occurrences |
| `src/pages/*.js` (15 files) | `t()` / `tText()` calls | ~500 occurrences |
| `src/views/*.js` (6 files) | `t()` calls; `MONL`/`WD` → functions | ~250 occurrences |
| `src/overlays/*.js` (5 files) | `t()` calls in modals, popovers, drawer, context menu, palette | ~300 occurrences |
| `src/actions/*.js` (5 files) | Toast messages, activity verbs, `IN.localeSel` | ~200 occurrences |
| `src/components/task-list.js` | `t()` calls | ~30 occurrences |
| `src/features/*.js` (3 files) | `t()` calls | ~40 occurrences |
| `src/ui/helpers.js` | `data-tip="Unassigned"`, `empty()` call sites, `fsize()` → locale number | ~20 occurrences |
| `src/ui/toast.js` | The "Dismiss" `aria-label` (`:14`) | 1 occurrence |

### Files that must NOT change

| File | Why |
|------|-----|
| `vite.config.js` | Vite bundles `.json` natively. The `lucideSubset()` plugin only walks `*.js` (`vite.config.js:26-30`), so `src/locales/*.json` is invisible to it. Dotted keys are never matched by its token regex, so no icon is pulled in accidentally. |
| `Dockerfile` | `COPY --from=build /app/dist ./dist` already copies the whole bundle. The French catalogue is inside the JS bundle. The image grows by ~40 KB. |
| `index.html` | `<html lang="en">` stays as the pre-JS default; `i18n.js` corrects it before the first paint. The app renders into an empty `<div id="app">`, so there is no server-rendered flash to fix. |
| `package.json` | No new dependency. `npm test` globs `test/*.test.mjs`, so the new test file is picked up automatically. |
| `src/core/theme.js` | Keeps owning `setDateFormat()` (`theme.js:8`). Locale and date *pattern* are orthogonal: the pattern pref stays, the names become locale-aware. |

---

## Architectural Patterns

### Pattern 1: A leaf i18n module with a mutable locale singleton

**What:** `src/core/i18n.js` holds the current locale in a module-level variable and exports `getLocale()` / `setLocale(code)`. `t()` reads the variable **at call time**. Every consumer imports the module directly — there is no context object, no injection, no barrel re-export.

**When to use:** Always, in this codebase.

**Trade-offs:**
- *For:* `t()` is called from inside template-literal expressions in ~1 800 places. Threading a locale argument would mean `t(locale, 'key', …)` at every call site **and** a locale parameter on every function that produces a label — roughly tripling the diff and the review surface. The render loop is a full `innerHTML` replace (`src/shell/render.js:154`), so a locale change is exactly one `setLocale()` + one `render()`. A per-call parameter buys nothing.
- *For:* the repository already owns this exact pattern. `src/core/utils.js:45-48` exports `let dateFormat = 'MMM d'` plus `setDateFormat(f)`, and `src/core/theme.js:8` calls it on every render. The i18n layer is the same idea, one level up.
- *Against:* a singleton can be read stale. The mitigation is a hard convention: **never call `t()` at module top level** — only inside a render function. Every current call site is inside a function, so this costs nothing.
- *Against:* no per-call locale override. That is acceptable in v1.2 (nothing renders a string in someone else's language) and is the documented extension point if a future feature needs it.

**The cycle rule.** `i18n.js` must import **only** the JSON catalogues. It must not import `utils.js` (for `esc`), `store.js` (for `S`) or `render.js` (for `render()`). Consequences:
- It carries its own one-line `escHtml()` rather than importing `esc` from `utils.js`. One duplicated line buys a completely acyclic graph.
- `utils.js` imports `i18n.js` (one direction): `src/core/utils.js` → `src/core/i18n.js` → `src/locales/*.json`.
- `i18n.js` cannot call `render()` directly. It dispatches a DOM event instead — `window.dispatchEvent(new CustomEvent('gr8r:locale'))` — and `src/main.js` listens and re-renders. This mirrors the existing `gr8r:save-error` pattern (`src/core/store.js:97-99`, consumed at `src/main.js:63`).

**Example:**

```js
// src/core/i18n.js  —  a leaf: the only imports are the catalogues.
import en from '../locales/en.json' with { type: 'json' };
import fr from '../locales/fr.json' with { type: 'json' };

const CATALOGUES = { en, fr };
let _locale = 'en';

export const getLocale = () => _locale;

export function setLocale(code) {
  if (!code || !CATALOGUES[code] || code === _locale) return _locale;
  _locale = code;
  if (typeof document !== 'undefined') document.documentElement.lang = code;
  try {
    localStorage.setItem('gr8r.locale', code);
  } catch { /* storage blocked — the server copy stays authoritative */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('gr8r:locale', { detail: code }));
  return _locale;
}

/* HTML-safe: this is what 95 % of call sites want. */
export function t(key, params) {
  const raw = lookup(key);
  return escapeHtml(interpolate(raw, params));
}

/* Raw text: for sinks that escape themselves (toast(), empty(), document.title). */
export function tText(key, params) {
  return interpolate(lookup(key), params);
}
```

### Pattern 2: `t()` escapes by default; `tText()` does not

**What:** Two functions with an explicit, non-overlapping contract.

| Function | Returns | Use in |
|----------|---------|--------|
| `t(key, params?)` | HTML-escaped text | Any template literal: text nodes, `aria-label="…"`, `placeholder="…"`, `title="…"`, `data-tip="…"`, `<option>` labels, `srow()` title/description |
| `tText(key, params?)` | Raw text | `document.title`, `toast()` (which calls `esc()` itself at `src/ui/toast.js:14`), `empty()` (which calls `esc()` itself at `src/ui/helpers.js:59`) |

**Why escape by default:** the catalogue is edited like code by non-authors. A translator typo containing `"` or `<` would break an attribute or inject markup. Escaping at the call site makes that structurally impossible. The existing codebase already distinguishes the two cases — `esc()` is applied to *user data* (names, titles) but not to the app's own static strings, and `empty()` escapes its own arguments.

**Interpolation:** `{name}` placeholders, replaced in a **single pass** so a parameter value can never be re-substituted. The catalogue string is escaped first, then the parameters are escaped and substituted — so both the template and the data are safe.

**Plurals:** a catalogue entry may be a string *or* an object of CLDR categories.

```json
{
  "task.count": { "one": "{n} task", "other": "{n} tasks" },
  "date.today": "Today",
  "time.minutesAgo": { "one": "{n} minute ago", "other": "{n} minutes ago" }
}
```

`t('task.count', { n: 3 })` picks the category with `Intl.PluralRules(getLocale()).select(3)`. French needs only `one` and `other` — `Intl.PluralRules('fr').select(0) === 'one'`, which is the correct French rule ("0 tâche").

**The `data-*` rule — the single most important convention.** Attribute values that the code dispatches on are **machine identifiers and are never translated**:

- `data-a` → looked up in the action table `A[el.dataset.a]` (`src/actions/events.js:35`)
- `data-r` → route name, looked up in `ROUTE_NAMES`
- `data-k` / `data-v` → preference key / value (`S.prefs[el.dataset.k] = el.dataset.v`, `src/actions/actions.js:269`)
- `data-pop`, `data-ctx`, `data-id`, `data-in`, `data-submit`, `data-blur`, `data-keep`, `data-sid`, `data-hover-i`
- `class`, `id`, `href`, `type`, icon names passed to `ic()`

The *visible label* of a control is a separate expression and **is** translated. `ROUTE_NAMES` keeps its machine keys and gains a parallel catalogue of labels:

```js
// src/shell/render.js
export const ROUTE_NAMES = { home: 'Home', inbox: 'Inbox', /* ... unchanged keys ... */ };
// src/shell/render.js — pageTitle()
const t = ROUTE_NAMES[u.route] || 'Not found';
return `${tText('route.' + u.route, { fallback: t })} · ${D().ws.name}`;
```

**Key naming:** dotted and namespaced — `nav.home`, `action.save`, `settings.language.title`, `status.todo`, `priority.urgent`, `role.owner`, `label.design`, `projectStatus.active`, `date.today`, `time.minutesAgo`, `toast.saved`, `a11y.close`, `modal.invite.title`. This is not cosmetic: the `lucideSubset()` plugin in `vite.config.js:30` matches quoted lowercase tokens against Lucide icon names, and a **dotted** key can never match it (the regex requires a quote immediately before the token). A bare `'search'` would pull the Lucide `Search` icon into the bundle for nothing.

**The `sel()` / `tog()` accessibility detail.** `src/pages/settings.js:69-77` currently writes `aria-label="${k}"` — the machine key. That is not an English-string leak, but it is poor a11y. Give `sel()` and `tog()` an optional trailing `label` argument used for `aria-label`, defaulting to `k`, and pass a translated label for the language control. Low cost, correct output.

### Pattern 3: The catalogue is the only source of user-facing English

**What:** After the extraction sweep, **no user-facing English literal remains in `src/`**. Everything is `t('key')`. The catalogue is the single place where the interface's words live.

**Scope boundary — what is *not* translated:**

- **User content**: project names, task titles, member names, team names, comments, file names, invoice ids, project keys. A project-management app must never translate a customer's data. `src/data/seed.js` stays English for the same reason.
- **Machine identifiers**: everything in the `data-*` list above, plus route names, status ids, priority ids, label ids, role ids, preference values (`'comfortable'`, `'MMM d'`, `'indigo'`).
- **Brand and format names**: "Gr8r Studio", "Figma", "PDF", "KBD".

**The two-sided consequence.** Because the catalogue is the only source, a leak detector has a well-defined target: *the English catalogue is the set of strings that must not appear in a French page*.

### Pattern 4: The locale lives on the account, not in the document

**What:** `users.locale` (nullable `text`) is the authoritative per-user locale. It is delivered by `userPayload()`, which already feeds `GET /api/auth/me`, `POST /api/auth/login`, `POST /api/auth/signup` and `POST /api/invites/:token/accept` — so **one field in one function** reaches all four client paths.

**Why a column and not a JSON blob or a new table:**
- The milestone's per-user scope is *exactly one scalar*. A `users.prefs` JSON column would be a half-built general mechanism; the broader "per-user settings isolation" requirement is still an open Active item and should not be half-solved here.
- A `user_prefs` table adds a join to the hot `/api/auth/me` path for one value.
- `ensureColumn()` (`server.js:127-130`) **already exists** and is **already proven** — v1.1 used it for `workspaces.slug`, `workspaces.color`, `memberships.member_id` and `invites.workspace_id` (`server.js:141-144`).

**Why `migrateTenancy()` must NOT be touched.** `migrateTenancy()` (`server.js:844`) is a **data** migration: it derives slugs, rewrites documents, links memberships and drops the demo array. It writes a `vacuum into` backup first (`:852`) because it *rewrites rows*. A nullable column adds no data, rewrites no row, moves no revision, and needs no backup.

**And here is the load-bearing consequence:** `test/migration.test.mjs:164-183` asserts that **a second boot is a byte-identical no-op** — same slug, doc, member ids, revision, invite scope, and exactly one backup file. If the server seeded `users.locale` at boot, the users table would change on the first boot and that test would fail. **Therefore the locale must never be written by the server during boot.** The client seeds it explicitly, through the API, after the user signs in. This also means an install that is never opened in a browser keeps `users.locale = NULL` forever and behaves exactly as before.

**What `NULL` means.** "Not chosen" — a valid, well-defined state. The client resolves it and persists the choice:

```
resolution order (client-side, server mode):
  1. user.locale                      ← authoritative, per account
  2. localStorage['gr8r.locale']      ← demo mode; a fast hint in server mode
  3. navigator.languages              ← primary subtag: 'fr-*' → 'fr', else 'en'
  4. 'en'
```

The legacy workspace `prefs.lang` is **deliberately excluded** from this chain. It never changed anything on screen, it is shared by every member of the workspace, and honouring it would import a value that was never real. A user who had selected "Français" never saw French, so there is no expectation to preserve. The field is removed from `DEFAULT_PREFS` (`src/core/store.js:15`) and dropped in `applyDoc()` so it stops round-tripping in the document.

**Note the deliberate deviation from the order in the brief.** The brief proposed `localStorage → server → workspace pref → navigator → English`. In **server mode the server value must outrank `localStorage`**: `localStorage` is per *browser*, not per *account*, so on a shared machine the previous account's locale would leak into the next one. `localStorage` is the *bootstrap* value (demo mode, and the pre-`/api/auth/me` screen), and the server value *overrides* it as soon as the account is known. In demo mode there is no server, so `localStorage` is the top of the chain — which is exactly the right behaviour for a local-first demo.

**The write path.** A new branch on the existing resource:

```
PATCH /api/auth/me   { "locale": "fr" }
  → 400 if the locale is not in SUPPORTED_LOCALES
  → 403 if sameOrigin(req) fails        (same guard as POST /api/workspaces, server.js:1275)
  → 401 if there is no session
  → 200 { "user": { ...userPayload } }
```

**This must not touch the workspace document.** The v1.1 audit closed three defects in one family — *the workspace revision moved without the client being able to follow it*, locking the workspace out of writing. A locale write that touched `workspaces.doc` or bumped `workspaces.revision` would recreate that family. The locale is a column on `users`; the write is a single-column `UPDATE` and moves no revision. **This must be asserted in the server test.**

### Pattern 5: Locale-aware formatting is composed from `Intl`, not hand-rolled arrays

**What:** `src/core/utils.js` already owns `fmtDate`, `relDate`, `ago`, `dayBucket` and the month/weekday arrays. The i18n layer changes *what fills them*, not *where they live* — so the 5 modules that import `MON`/`WD`/`MONL`/`WDL` (`views/calendar.js`, `views/timeline.js`, `overlays/popovers.js`, `pages/home.js`, `core/utils.js`) change their import, not their call sites' shape.

```js
// src/core/utils.js — before
export const MON  = ['Jan', 'Feb', /* ... */];
export const WD   = ['Sun', 'Mon', /* ... */];
export function fmtDate(s, long) {
  return `${MON[d.getMonth()]} ${d.getDate()}${long ? ', ' + d.getFullYear() : ''}`;
}

// src/core/utils.js — after
import { getLocale, dt } from './i18n.js';

/* Locale-aware month / weekday names. The English output is unchanged. */
export const monthShort  = m => dt({ month: 'short' }).format(new Date(2000, m, 1));
export const monthLong   = m => dt({ month: 'long'  }).format(new Date(2000, m, 1));
export const weekdayShort = d => dt({ weekday: 'short' }).format(new Date(2000, 0, 7 + d));
export const weekdayLong  = d => dt({ weekday: 'long'  }).format(new Date(2000, 0, 7 + d));
export const weekdayNarrow = d => dt({ weekday: 'narrow' }).format(new Date(2000, 0, 7 + d));
```

**Concrete cases in this codebase:**

| Site | Today | Locale-aware form |
|------|-------|-------------------|
| `utils.js:56` `fmtDate` | `MON[m] + ' ' + d` | `Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })` → "Oct 1" (en) / "1 oct." (fr) |
| `utils.js:64` `relDate` | `'Today' / 'Tomorrow' / 'Yesterday' / WD[day]` | `t('date.today')`, `t('date.tomorrow')`, `t('date.yesterday')`, `weekdayShort(d)` |
| `utils.js:67` `ago` | `'just now' / '5m ago' / '3h ago' / '2d ago'` | `t('time.justNow')`, `t('time.minutesAgo', { n })`, `t('time.hoursAgo', { n })`, `t('time.daysAgo', { n })` — French "il y a 5 min" |
| `utils.js:78` `dayBucket` | returns `'Today' / 'Yesterday' / 'This week' / 'Earlier'` — **used as an object key** (`b[dayBucket(a.at)] ||= []`, `pages/activity.js:23`, `views/project-overview.js:64`) | must return a **stable id** (`'today' / 'yesterday' / 'week' / 'earlier'`); the heading renders `t('date.bucket.' + id)` |
| `overlays/popovers.js:96` | `WD[(i + weekStart) % 7].slice(0, 2)` — slices the English 3-letter abbreviation | `weekdayNarrow(d)` → "L M M J V S D" in French. **Slicing a localized abbreviation is broken** — this line must change, not just be wrapped. |
| `ui/helpers.js:95` `fsize` | `b + ' B'`, `Math.round(b/1024) + ' KB'`, `toFixed(1) + ' MB'` | `fmtNumber(value, { maximumFractionDigits: 1 })` + unit → "1,2 MB" in French |
| `pages/home.js:73`, `views/project-overview.js:29` | `${pr}%` | `Intl.NumberFormat(locale, { style: 'percent' })` → "45 %" in French (narrow no-break space) |
| `overlays/drawer.js:64` | `` `Overdue by ${n} day${n > 1 ? 's' : ''}` `` | `t('task.overdueBy', { n })` with a plural object |
| `features/archive.js:35` | `` `${n} tasks · ...` `` | `t('project.taskCount', { n })` |
| `views/project-overview.js:29` | `` `${daysLeft} days until ${fmtDate(p.due)}` `` | `t('project.daysUntil', { n })` + `fmtDate(...)` |
| `overlays/modals.js:315` | `` `${t.n} · ${f.size} · Uploaded by ...` `` | `t('file.meta', { n, size, who })` |

**The date-format preference stays.** `S.prefs.dateFmt` (`'MMM d' | 'd/M' | 'M/d' | 'yyyy-MM-dd'`) is a *pattern* choice, not a language choice. The three numeric patterns are hand-composed and stay locale-independent; the `'MMM d'` pattern delegates ordering to the locale. The preview labels in `Settings → Date & time` (`src/pages/settings.js:191-200`) must become locale-aware (they currently hard-code `'Oct 1'`, `'1/10'`, `'10/1'`, `'2026-10-01'`).

### Pattern 6: Leak detection is a two-sided proof

**What:** "No English leaks" is proven by two complementary tests that fail for different reasons.

**(a) The sentinel sweep — English absent (Chromium).** For every catalogue key whose French value *differs* from its English value, the English string must not appear in the rendered DOM. Keys whose values are identical in both languages (brand names, "PDF", "KBD") are excluded by construction, which removes almost every false positive.

```js
// e2e/i18n.spec.mjs
import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };

const SENTINELS = Object.keys(en)
  .filter(k => typeof en[k] === 'string' && typeof fr[k] === 'string')
  .filter(k => en[k] !== fr[k] && en[k].trim().length >= 3)
  .map(k => en[k]);
```

The DOM text is collected and each sentinel is asserted absent. User content (project names, member names) is excluded with an explicit list of the fixture's own strings — the e2e fixtures use distinctive names (`Acme Roadmap`, `Secret Roadmap`, `Beta Roadmap`, `E2E Owner`, `Carol Member`, `Tenant Two`, `e2e-owner@e2e.local`), none of which is a catalogue value. A future collision fails loudly, which is the right failure direction.

**(b) The coverage assertion — French present (Chromium).** The same surfaces must contain values *from the French catalogue*. This is what distinguishes "the interface is in French" from "the interface contains no English". Without it, a page that rendered nothing would pass (a).

**(c) The static source scan — no untranslated literal (node:test).** Neither runtime check can catch a string that was never put in the catalogue — a button added last week that nobody translated. So the node test scans `src/**/*.js` for user-facing literals and asserts each one is present in `en.json`:

- HTML text nodes: `>([^<>{}]{2,60})<` where the content begins with a capital letter
- Attribute values: `aria-label="…"`, `placeholder="…"`, `title="…"`, `alt="…"`, `data-tip="…"`
- Exclusions: `src/data/seed.js` (user content), `class=`/`style=`/`href=`/`id=`/`data-*` values, strings starting with `$ { < # /`, pure-symbol strings, and the machine-identifier set.

This test is introduced as a **shrinking allow-list** (`test/fixtures/i18n-pending.json`) during the extraction sweep and becomes a hard assertion (empty allow-list) when the sweep finishes. That device is what makes a 1 800-occurrence mechanical extraction finishable: each extracted literal leaves the list, and the list is the progress meter.

---

## Data Flow

### Boot sequence — there is no flash, because nothing is painted before `render()`

The whole interface is client-rendered into an empty `<div id="app">` (`index.html:19`). The server serves only the shell HTML. **No English is ever painted.** The only real problem is the opposite one: rendering once in English and then re-rendering in French. The fix is to resolve the locale *before* the first `render()`.

```
module evaluation (synchronous, before any await)
  └─ i18n.js: setLocale(guess)          ← localStorage['gr8r.locale'] → navigator.languages → 'en'
     · document.documentElement.lang = guess
     · the login / join / onboarding screens render in the guess locale (correct:
       a signed-out visitor has no account locale)

main.js IIFE (async)
  ├─ await api.init()                    → /api/config  (is a server there?)
  ├─ await api.me()                      → /api/auth/me
  │    └─ applyUser()  ←─── THE SINGLE INTEGRATION POINT ───┐
  │         if (user.locale) setLocale(user.locale)        │  src/core/api.js
  │         else { setLocale(guess); api.setLocale(guess) } │  (4 call paths:
  │                                                          │   me / login /
  └─ await hydrateFromServer(slug)       → /api/workspaces/:slug  signup / accept)
  └─ render()                            ← FIRST PAINT, in the final locale
```

Three properties fall out of this ordering:

1. **No flash of English.** The locale is known before the first `render()`.
2. **No double render.** Switching locale is one `setLocale()` + one `render()` — the render loop is a full `innerHTML` replace, so there is no partial update to reconcile.
3. **A locale change is one event.** `setLocale()` dispatches `gr8r:locale`; `src/main.js` listens and calls `render()`. The i18n module never imports `render.js`.

`document.documentElement.lang` (`src/main.js:115` is hard-coded `'en'` today) becomes `getLocale()`, set inside `setLocale()` so it is correct for the very first paint and for every later change.

### Locale change (user action)

```
Settings → Language → select 'fr'
  └─ IN.localeSel (src/actions/actions.js)
       ├─ await api.setLocale('fr')   → PATCH /api/auth/me { locale: 'fr' }
       │    ├─ 200 → api.user.locale = 'fr'
       │    └─ !200 → toast(server error); the select reverts; the locale does NOT change
       └─ setLocale('fr')
            ├─ document.documentElement.lang = 'fr'
            ├─ localStorage['gr8r.locale'] = 'fr'
            └─ dispatch 'gr8r:locale' → main.js → render()
```

**Failure handling is explicit:** if the server rejects the write, the interface stays in the old language and the user is told why. A locale that changes on screen but fails to persist would be worse than one that does not change at all — the next sign-in would silently revert it.

**This is not a document change.** `save()` is *not* called: the locale is not part of the workspace document, so there is no `PUT /api/workspaces/:slug`, no revision movement, and no chance of a 409 conflict.

### Catalogue loading

```
build time (vite build)
  └─ i18n.js ──import──> src/locales/en.json   → inlined in dist/assets/index-*.js
  └─ i18n.js ──import──> src/locales/fr.json   → inlined in dist/assets/index-*.js

run time
  └─ zero network requests. The catalogue is already in the module graph.
```

**Why bundled and not fetched:**

- **No failure mode.** A lazily fetched catalogue can 404 (a stale `index.html` against an old asset set, a mis-proxied path, a Docker image with a mismatched `dist/`). A missing catalogue degrades to English *silently* — producing exactly the mixed-language UI this milestone exists to prevent. Bundling makes that impossible.
- **No new server route, no new Docker layer.** `server.js` would need a new static route and `Dockerfile` a new `COPY`; the static handler already serves `/assets/*` with `public, max-age=31536000, immutable` (`server.js:1751`), but the catalogue would need a *different* cache policy than a hashed chunk (it must be revalidated), which means either a new route or a new hashing scheme.
- **The demo mode works with no server at all.** This is the decisive argument: Gr8r's demo mode is a static build with no backend (`api.init()` fails → `api.enabled` stays false). A fetched catalogue needs a server. A bundled catalogue is present in the demo, the `vite dev` server, and the production build, identically.
- **The cost is ~10 KB gzipped.** The current bundle is 388 KB raw / 111 KB gzipped. A ~700-key French catalogue adds roughly 35 KB raw / 10 KB gzipped — under 10 %.

**The import form must work in two runtimes.** Vite bundles `.json` natively, but bare Node needs an import attribute:

```js
import en from '../locales/en.json' with { type: 'json' };   // Vite 6 ✓, Node 24 ✓
```

This is why `test/i18n.test.mjs` can import `src/core/i18n.js` **directly in Node with no bundler** — the same module the browser runs. (`assert { type: 'json' }` is removed in Node 24; `with { type: 'json' }` is the current form.) **Verify this in the very first phase**, because it is load-bearing for the test strategy. If Vite were to object to the attribute, the fallback is to make the catalogues ESM modules (`export default { … }`) — a two-line change that keeps one file per locale and removes all doubt.

### Storage flow

| | Server mode | Demo mode (no server) |
|---|---|---|
| Authority | `users.locale` column | `localStorage['gr8r.locale']` |
| Written by | `PATCH /api/auth/me` (client-driven, after sign-in) | `setLocale()` |
| Read at boot | `GET /api/auth/me` → `userPayload().locale` | `localStorage` → `navigator.languages` → `'en'` |
| Survives a new browser | yes | no — the browser guess is used, which is correct for a local demo |
| Server involvement in boot | none — the server never writes the locale | none |

The workspace document is **not** involved. `prefs.lang` is removed from `DEFAULT_PREFS` and dropped in `applyDoc()`.

---

## Scaling Considerations

Gr8r is a self-hosted, single-Node, single-SQLite application. The i18n layer must not introduce a scaling axis. It does not: the catalogue is a static asset, the locale is one column.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–1k users | Nothing changes. The catalogue is in the bundle; `users.locale` is one nullable column; `PATCH /api/auth/me` is a single-column `UPDATE`. The `users` table grows by 4–8 bytes per row. |
| 1k–100k users | Still nothing structural. The only consideration is that `userPayload()` (`server.js:244`) now reads one more column — it already does `select *` on the user row, so there is no extra query. |
| 100k+ users | Out of scope. If it ever mattered, the locale could move to the `sessions` table (per device rather than per account) — but that would break the milestone's explicit decision that "the locale is per user". |

### Scaling priorities

1. **First bottleneck: the catalogue size.** 700 keys is ~35 KB raw. At 20 languages it would be ~700 KB — at which point lazy loading becomes worthwhile. At two languages it is not.
2. **Second bottleneck: the extraction sweep's review cost.** Not a runtime cost — a *human* cost. 1 800 call sites across 37 files is the largest single risk in this milestone, and it is mitigated by the ordering in the build order below (extract English first, behaviour-preserving; translate second), not by any runtime mechanism.

---

## Anti-Patterns

### Anti-Pattern 1: Threading the locale through function signatures

**What people do:** `t(locale, 'key')`, or `render(locale, params)`, or passing a `locale` argument down through every helper that builds a label.

**Why it's wrong:** at ~1 800 call sites this multiplies the diff by an order of magnitude, forces every helper that returns a string to grow a parameter (`av()`, `stPill()`, `prPill()`, `dueHtml()`, `empty()`, `pStatus()`, `lbl()`, …), and makes every reviewer verify two things at once. The render loop is a full re-render, so there is no performance argument for it either. The repository already solved this for the date format with `setDateFormat()` — the i18n layer should not invent a second, worse mechanism.

**Do this instead:** a module-level locale in `src/core/i18n.js`, read at call time, changed through one `setLocale()` that dispatches an event.

### Anti-Pattern 2: A `t()` that returns raw text

**What people do:** `t()` returns the catalogue value untouched and the caller is expected to call `esc()`.

**Why it's wrong:** the catalogue is edited by translators, and the failure mode is an attribute breakout or an injected tag in a page the user trusts. It also puts the escaping decision at 1 800 call sites instead of in one function. And it is inconsistent with the codebase: `empty()` (`src/ui/helpers.js:59`) and `toast()` (`src/ui/toast.js:14`) already escape their own arguments, so callers of those two would have to *not* escape — a trap.

**Do this instead:** `t()` escapes; `tText()` does not and is only used where the sink escapes for you. Document the split at the top of `i18n.js`.

### Anti-Pattern 3: Translating machine identifiers

**What people do:** translate the value of `data-a`, `data-r`, `data-k`, `data-pop` — "because it is a string in the template".

**Why it's wrong:** `data-a` is the key of the action table (`A[el.dataset.a]`, `src/actions/events.js:35`); `data-r` is the key of `ROUTE_NAMES`; `data-k`/`data-v` are the preference key and value (`src/actions/actions.js:269`). Translating any of them makes the control **silently dead** — the click still dispatches, but to nothing, or to the wrong action. This is the most likely catastrophic mistake in a 1 800-site sweep, and it is invisible in a screenshot.

**Do this instead:** a hard rule — *`data-*` values are identifiers; the label is a separate expression.* Put the rule in the i18n module's header comment and in the phase brief for the extraction sweep.

### Anti-Pattern 4: The server seeds the locale at boot

**What people do:** `migrateTenancy()` (or a new `migrateLocale()`) writes `users.locale = 'en'` for every account.

**Why it's wrong:** it mutates the `users` table on every boot, which breaks `test/migration.test.mjs:164-183` ("a second boot is a byte-identical no-op") and breaks the promise that an untouched install stays untouched. It also picks a value *for* the user, before the user has expressed a preference, and freezes it forever.

**Do this instead:** leave the column `NULL`; the client seeds it through `PATCH /api/auth/me` after sign-in, once.

### Anti-Pattern 5: Fetching the catalogue over HTTP

**What people do:** `await fetch('/locales/fr.json')` before the first render.

**Why it's wrong:** it breaks demo mode (no server), it adds a network round-trip to the critical path of the first paint, it introduces a silent-English-fallback failure mode, and it forces a new static route with a cache policy that differs from the hashed assets. The stated constraint — no runtime dependency, no framework, no bundler plugin — is satisfied either way, but the bundled form has no failure modes.

**Do this instead:** static imports. If a future milestone adds many languages, revisit with Vite's dynamic `import()` — but then the chunk must be awaited *before* the first render in that locale, and a load failure must be surfaced, not swallowed.

### Anti-Pattern 6: A locale parameter on `t()` "for flexibility"

**What people do:** `t(key, params, locale)`.

**Why it's wrong:** nothing in v1.2 renders a string in another locale's language. The parameter is speculative, it complicates every call site's signature, and it invites the mistake of passing a *workspace* locale where an *account* locale is meant. The account locale is the only locale.

**Do this instead:** document the extension point in the module header; add the parameter when a real requirement appears.

### Anti-Pattern 7: A runtime-only leak test

**What people do:** write the Chromium sentinel sweep, call it done.

**Why it's wrong:** the sweep can only catch strings that are *in the catalogue*. A developer who adds `>Export CSV<` to a template and never adds a key produces a page that is partly English with **no test failure at all** — the sentinel sweep passes because "Export CSV" was never a catalogue value.

**Do this instead:** pair the runtime sweep with the **static source scan** in `test/i18n.test.mjs`. The runtime test proves the *translated* strings are French; the static test proves there are *no untranslated strings left*. Only the pair covers the requirement.

---

## Integration Points

### External services

None. The i18n layer talks to no external service, needs no CDN, and adds no runtime dependency. `Intl.*` is built into the browser and into Node 24 — the same runtime that already runs the server.

### Internal boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `src/core/i18n.js` → `src/locales/*.json` | static import | One direction. The i18n module imports nothing else from `src/`. |
| `src/core/utils.js` → `src/core/i18n.js` | direct import of `getLocale` / `dt` | `utils.js` owns the date *API*; `i18n.js` owns the locale and the `Intl` primitives. No cycle: `i18n.js` has no `src/` imports besides the catalogues. |
| `src/core/api.js` → `src/core/i18n.js` | `setLocale()`, `preferredLocale()` | `applyUser()` is the single funnel for the server's locale. |
| `src/main.js` → `src/core/i18n.js` | `setLocale()`, `getLocale()` | Boot ordering and the `gr8r:locale` listener. |
| `src/main.js` → `src/core/render.js` | event | `gr8r:locale` → `render()`. The i18n module never imports `render.js`. |
| `server.js` → `users.locale` | SQLite column | `ensureColumn()` — the same helper v1.1 already used. |
| `server.js` → client | `userPayload().locale` | Reaches `/api/auth/me`, `/api/auth/login`, `/api/auth/signup`, `/api/invites/:token/accept` in one field. |
| client → `server.js` | `PATCH /api/auth/me { locale }` | `sameOrigin` + session + allowlist validated server-side. Never touches the workspace document. |
| every UI module → `src/core/i18n.js` | `import { t, tText } from '../core/i18n.js'` | Path depth: `'./i18n.js'` inside `src/core/`, `'../core/i18n.js'` everywhere else. |

### The seven questions, resolved

**1. Where `t()` lives.** `src/core/i18n.js`. Reached by direct import from every module. The locale is a **module-level mutable singleton** in that file; it is *not* threaded through function signatures. Rationale and the cycle rule are in Pattern 1.

**2. Locale resolution at boot and the flash.** Order: **server `user.locale` → `localStorage['gr8r.locale']` → `navigator.languages` → `'en'`**; the legacy workspace `prefs.lang` is deliberately excluded. The server value outranks `localStorage` because `localStorage` is per-browser, not per-account. There is **no flash**: nothing is painted before `render()`, and the locale is resolved before the first `render()` — the module-load synchronous guess covers the signed-out screens, and `applyUser()` upgrades it to the account locale before the shell renders. `document.documentElement.lang` is set inside `setLocale()`.

**3. Catalogue delivery.** **Bundled**, as static JSON imports, both locales. No HTTP route, no lazy chunk, no Dockerfile change (the whole `dist/` is already copied), no server change. Demo mode works because the catalogue is in the bundle — a fetched catalogue would need a server the demo does not have.

**4. Per-user locale storage and delivery.** **A new `users.locale` column**, added with `ensureColumn()` in `openDb()` — the same additive mechanism v1.1 used for `workspaces.slug` / `workspaces.color` / `memberships.member_id` / `invites.workspace_id` (`server.js:141-144`). Delivered by `userPayload()`, so `GET /api/auth/me` returns it. **`migrateTenancy()` is not modified**: a nullable column rewrites no row and needs no `vacuum into` backup. The write path is a new `PATCH /api/auth/me` branch with a `sameOrigin` guard and an allowlist; it must not touch the workspace document or move its revision. **Accounts with no locale set** (`NULL`) are a valid state: on first sign-in the client resolves the locale (browser guess), applies it immediately, and persists it through the API. The server never writes the locale at boot, so an install that is never opened in a browser keeps `NULL` and the "second boot is a byte-identical no-op" property in `test/migration.test.mjs` holds.

**5. Composition with the hand-written HTML.** `t()` returns HTML-escaped text and is safe to interpolate anywhere in a template literal, including attribute values. `tText()` returns raw text for sinks that escape themselves (`empty()`, `toast()`, `document.title`). Placeholders use `{name}` and are substituted in a single pass with escaping. `data-*` attribute values are **never** translated — they are machine identifiers (`data-a` → the action table, `data-r` → the route table, `data-k`/`data-v` → preference keys and values). The safest convention for this codebase is: **the catalogue is the only source of user-facing English, `t()` is the only way to reach it, and identifiers are never routed through it.** User content (project names, task titles, seed data) is never translated.

**6. Locale-aware dates, relative times, numbers and plurals.** They read the **same module-level singleton**, exactly like the existing `dateFormat` / `setDateFormat()` pair in `src/core/utils.js:45-48`. `Intl.DateTimeFormat` supplies month and weekday names (replacing the hand-rolled `MON`/`MONL`/`WD`/`WDL` arrays), `Intl.NumberFormat` supplies numbers and percentages, `Intl.PluralRules` selects the plural category. The date-format *preference* (`S.prefs.dateFmt`) stays and stays orthogonal: the three numeric patterns are hand-composed, the `'MMM d'` pattern delegates ordering to the locale. One concrete trap: `overlays/popovers.js:96` slices the English weekday abbreviation to two characters — that line must be rewritten with `Intl`'s `weekday: 'narrow'`, not merely wrapped.

**7. Regression-testing "the interface is in French".** Two-sided, in two test tiers:
- **`e2e/i18n.spec.mjs` (Chromium, real server, real SQLite).** A dedicated French account — *not* the shared `e2e-owner@e2e.local`, so the existing `e2e/tenancy.spec.mjs` stays English and order-independent. The spec sets the locale through the real API, signs in, and then (a) asserts the French values are present on the chrome surfaces and (b) runs the **sentinel sweep**: every English catalogue value whose French counterpart differs must be absent from the rendered DOM. User content is excluded with an explicit list of the fixture's own strings.
- **`test/i18n.test.mjs` (`node:test`, no browser).** Unit tests for `t()` / `tText()` / plural selection / escaping / fallback; catalogue parity (`en.json` and `fr.json` must have identical key sets, identical placeholder sets, and no value that is byte-identical to its English counterpart except an explicit allow-list); registry ⇄ files agreement; and the **static source scan** that every user-facing literal in `src/` is present in `en.json` — this is the only check that catches a newly added, never-translated string.

---

## Build order

The extraction touches ~1 800 string occurrences across 37 files. The order below exists to keep every step verifiable and to make any regression unambiguous.

**The two load-bearing ordering decisions:**

1. **Extract English *before* translating French.** The English sweep is a pure refactor with **zero behaviour change** (`t('key')` returns exactly the literal it replaced). It is verified by the existing 6 Chromium tests staying green. The French pass then only touches one file, `src/locales/fr.json`. If a visual regression appears, it is unambiguously in the catalogue — not half in the extraction and half in the translation.
2. **Never let the server write the locale at boot.** Otherwise the "second boot is a byte-identical no-op" assertion in `test/migration.test.mjs` fails, and the milestone breaks a property v1.1 shipped.

### Phase table

| # | Phase | Depends on | New files | Modified files | Done when |
|---|-------|-----------|-----------|----------------|-----------|
| **P1** | **i18n core** — the module, the registry, a 40-key English seed, the unit test | — | `src/core/i18n.js`, `src/locales/registry.js`, `src/locales/en.json` (seed), `test/i18n.test.mjs` | — | `node --test` proves `t()`, `tText()`, plurals, escaping and fallback; `vite build` accepts the `with { type: 'json' }` import in both runtimes; one real page (e.g. `src/pages/settings.js`) renders through `t()` with no visual change |
| **P2** | **Server: per-user locale** — column, payload, endpoint, validation | — | `test/locale.test.mjs` | `server.js` | A legacy database boots with `users.locale` present and `NULL`; `GET /api/auth/me` returns `locale: null`; `PATCH /api/auth/me { locale: 'fr' }` → 200 and `GET` → `'fr'`; `'de'` → 400; no session → 401; cross-origin → 403; **and the workspace document and revision are byte-identical after the write** |
| **P3** | **Client boot wiring** — resolution order, `<html lang>`, `applyUser()` | P1, P2 | — | `src/core/api.js`, `src/main.js`, `src/core/store.js` | Signing in as a French account paints French on the first frame; the `gr8r:locale` event re-renders on change; `localStorage['gr8r.locale']` is written and read back; `prefs.lang` no longer round-trips in the document |
| **P4** | **English extraction sweep A** — core, shell, ui, components, features, actions, overlays (~900 occurrences) | P1 | `test/fixtures/i18n-pending.json` | `src/core/constants.js`, `src/core/utils.js` (labels only), `src/shell/*`, `src/ui/*`, `src/components/*`, `src/features/*`, `src/actions/*`, `src/overlays/*` | Every user-facing literal in the swept files is in `en.json`; the app renders **identically** in English; the existing 6 Chromium tests are still green |
| **P5** | **English extraction sweep B** — pages and views (~900 occurrences) | P4 | — | `src/pages/*.js` (15), `src/views/*.js` (6) | Same, for the pages and views; the source-scan allow-list is empty for the swept files |
| **P6** | **Locale-aware formatting** — dates, relative time, numbers, plurals | P1 | — | `src/core/utils.js`, `src/ui/helpers.js`, `src/core/constants.js` | `MON`/`WD`/`MONL`/`WDL` are gone; `fmtDate`/`relDate`/`ago`/`dayBucket`/`fsize` are locale-aware; `overlays/popovers.js:96` uses `weekday: 'narrow'`; the **English output is unchanged** (the date-format pref still selects the pattern) |
| **P7** | **French catalogue** | P5, P6 | `src/locales/fr.json` | — | Every key has a French value; the parity test passes; plural objects cover every count-bearing key; a French user sees no English on the main surfaces |
| **P8** | **Per-account language selector** | P2, P3, P7 | — | `src/pages/settings.js`, `src/actions/actions.js` | The selector lists only EN and FR (from the registry); choosing one persists through `PATCH /api/auth/me`; a failed write reverts the control and shows an error; the change does **not** touch the workspace document or its revision |
| **P9** | **Regression tests** | P5, P7, P8 | `e2e/i18n.spec.mjs` | `test/i18n.test.mjs` (hard assertions) | The sentinel sweep and the French-coverage assertions pass in Chromium; the static source scan asserts an empty allow-list; the tenancy spec is unaffected and order-independent |

### Dependency graph

```
P1 (i18n core) ──┬─────────────────────────────► P4 ──► P5 ──┐
                 │                                   │        │
                 ├─────────────────────────────► P6 ──┘        ├──► P7 ──► P8 ──► P9
                 │                                    │        │      ▲
P2 (server) ─────┴────► P3 ─────────────────────────┘        │      │
                            │                                 │      │
                            └────────────────────────────────► P3 ──┘
```

P2 is **independent of P1** and can be developed in parallel — it is a self-contained schema + endpoint change. P6 is independent of P4/P5 except that it must land before P7 (the French catalogue has to know the final French date strings).

### Parallelism

- **P1 ∥ P2** — the foundation and the server change do not touch each other.
- **P4 ∥ P6** — the extraction sweep and the formatting work touch different files, except that both touch `src/core/utils.js`; sequence P6 *after* P4's `utils.js` changes to keep the conflict trivial, or give P6 its own pass.
- **P7 and P8** — P7 (authoring 700 French strings) is content work that can run while P8 (the selector) is built, provided P8 is developed against the registry rather than against the French file's contents.

### What is deliberately *not* a phase

- **A translation-management UI, a machine-translation pipeline, or a translation editor.** Out of scope per `PROJECT.md` — the catalogues are files in the repository, edited like code.
- **Translating Deutsch, Español, 日本語, English UK.** The registry lists only what exists. The four languages disappear from the selector (`src/pages/settings.js:176` currently offers six) and their absence is enforced by the registry ⇄ files test.
- **Per-user settings isolation beyond the locale.** The `dateFmt`, `weekStart` and `tz` preferences remain workspace-shared, exactly as today. That inconsistency is already tracked as an open Active requirement; this milestone must not half-solve it.

---

## Sources

- `src/core/store.js` — `DEFAULT_PREFS.lang` (`:15`), `applyDoc()` prefs merge (`:173`), the `gr8r:save-error` event pattern (`:97`)
- `src/core/api.js` — `applyUser()` (`:61`), the `me()` / `login()` / `signup()` / `acceptInvite()` funnel (`:123`, `:129`, `:134`, `:263`)
- `src/core/utils.js` — the `dateFormat` singleton precedent (`:45-48`), `MON`/`MONL`/`WD`/`WDL` (`:40-43`), `fmtDate` (`:49`), `relDate` (`:58`), `ago` (`:67`), `dayBucket` (`:78`)
- `src/core/theme.js` — `applyPrefs()` calling `setDateFormat()` on every render (`:8`)
- `src/shell/render.js` — the full-re-render loop (`:126-197`), `pageTitle()` (`:108`), `ROUTE_NAMES` (`:15`)
- `src/main.js` — boot order and the hard-coded `document.documentElement.lang = 'en'` (`:115`), the `gr8r:save-error` listener (`:63`)
- `src/ui/helpers.js` — `empty()` escaping its own arguments (`:59`), `fsize()` (`:95`), the hard-coded `data-tip="Unassigned"` (`:9`)
- `src/ui/toast.js` — `toast()` escaping its message (`:14`)
- `src/pages/settings.js` — `srow()` / `tog()` / `sel()` (`:66-77`), the six-language selector (`:176`), the date-format options (`:191-200`), `SET_NAV` (`:13`)
- `src/actions/events.js` — the `A[el.dataset.a]` dispatch that makes `data-a` a machine identifier (`:35`)
- `src/actions/actions.js` — `A.setPref` (`:268`), `IN.prefSel` (`:2140`)
- `src/overlays/popovers.js` — `WD[...].slice(0, 2)` (`:96`)
- `src/views/project-overview.js` — `dayBucket()` used as an object key (`:64`)
- `server.js` — the `users` table (`:79`), `ensureColumn()` (`:127`) and its four existing uses (`:141-144`), `userPayload()` (`:244`), `migrateTenancy()` and its `vacuum into` backup (`:844`, `:852`), `GET /api/auth/me` (`:1226`), `sameOrigin` usage (`:1275`), `cacheControl()` (`:1750`)
- `test/migration.test.mjs` — the "second boot is a byte-identical no-op" assertion that forbids a server-side locale seed (`:164-183`)
- `test/helpers/server.mjs` — the real-server harness (`startServer`, `client`, `login`, `withDb`)
- `e2e/tenancy.spec.mjs`, `e2e/helpers/setup.mjs`, `e2e/playwright.config.mjs` — the browser-test conventions (real server, role/label/text selectors only) that the i18n spec must follow
- `vite.config.js` — the `lucideSubset()` plugin and its token regex (`:9-47`), which is why dotted keys are safe
- `Dockerfile` — `COPY --from=build /app/dist ./dist` (`:21`), which is why bundling needs no image change
- `index.html` — the empty `#app` mount (`:19`) that makes a server-rendered flash impossible
- Node 24 JSON modules with `with { type: 'json' }`; Vite 6 JSON imports; `Intl.PluralRules` / `Intl.DateTimeFormat` / `Intl.NumberFormat`

---
*Architecture research for: Gr8r Studio v1.2 — Localization*
*Researched: 2026-10-22*

