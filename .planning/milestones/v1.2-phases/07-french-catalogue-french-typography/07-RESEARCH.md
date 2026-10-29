# Phase 7: French Catalogue & French Typography — Research

**Researched:** 2026-10-23
**Domain:** i18n catalogue completion (en→fr), French typographic enforcement, stored-vocabulary display translation, billing removal, layout overflow proof
**Confidence:** HIGH (all claims below verified against the live codebase this session unless tagged otherwise)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**French reachability**
- **D-01:** French becomes reachable now through the existing selector, not through phase 8's persistence work. `applyPrefs()` maps the stored `prefs.lang` display label to a locale code and calls `setLocale()`; the `projects:locale` event re-renders. This mapping is explicitly throwaway — phase 8 replaces the storage format, the selector and this mapping. — Reversibility: reversible.
- **D-02:** `setLocale('fr')` must also set `document.documentElement.lang` to `fr`. `main.js` currently hardcodes `lang="en"`.
- **D-03:** Unknown or unsupported stored values resolve to `en`, matching the existing `setLocale()` contract. The selector's other four labels (English UK, Deutsch, Español, 日本語) keep resolving to `en` this phase.

**French typography**
- **D-04:** The authoritative rule is PROJECT.md D11 / ROADMAP, not the REQUIREMENTS I18N-05 wording: U+00A0 before `:`, U+202F (narrow no-break space) before `; ! ?`, U+00A0 on both sides inside `« »`, curly apostrophe `’`, ellipsis `…` rather than `...`, NFC everywhere. `REQUIREMENTS.md` I18N-05 is corrected to match as part of this phase. — Reversibility: costly — changing the rule after 1,446 values are written means rewriting the whole catalogue.
- **D-05:** A dedicated test (`test/french-typography.test.mjs`) enforces the catalogue rules on every `npm test`: plain space before `; : ! ?`, straight apostrophe `'`, three-dot ellipsis, missing/thin space inside guillemets, and non-NFC. Times (`14:30`), ISO dates and URLs are exempt by pattern. Phase 11 wires the same check into `prebuild`; phase 7 only adds the test.
- **D-06:** Stored vocabulary is displayed, never rewritten. English ids (`todo`, `high`, `Paid`) remain the stored and wire values; `t()` supplies the label. This extends the existing phase-6 pattern in `src/core/constants.js` and `store.roleLabel`.

**Catalogue completeness**
- **D-07:** A failing completeness test enforces en→fr parity: every English key except `contract.*` must exist in `fr.json` with a non-empty string. Plural objects must carry at least `one` and `other`; CLDR categories beyond that are allowed. Values legitimately identical in both languages (`Projects Studio`, `Ctrl`, product names) must be present, never omitted. Additive to `test/catalogue.test.mjs`.
- **D-08:** Translation workflow: a terminology glossary first (`docs/i18n-fr-glossary.md`), then namespaces in batches — `page` 512, `settings` 196, `act` 144, `a11y` 132, `toast` 95, `modal` 67, `err` 64, remaining ~236 — each batch gated by the completeness and typography tests.
- **D-09:** French register is `vous` (PROJECT.md D9), sentence-case headings, no middle-dot gender forms (D10), French-France conventions: lowercase months and weekdays, `1er`/`1re`/`2e`, decimal comma, narrow-NBSP digit grouping.

**Stored vocabulary and seed data**
- **D-10:** Project templates become catalogue data. The 7 templates in `src/overlays/modals.js` (`TEMPLATES`: name, description) and their 42 starter task titles get `project.template.*` keys. Tasks created from a template store the translated title at creation; hand-created tasks are untouched. — Reversibility: costly.
- **D-11:** Task estimates stay stored as ASCII (`30m`, `2d`). A display-only formatter renders `30 min` / `2 j` in French and the existing form in English. No storage change, no migration.
- **D-12:** Notification rows move from stored English fragments (`text: 'mentioned you in'`) to structured data — `{ kind, actor, target }` — rendered through `notif.*` catalogue keys in `notifText()`. Documents still carrying a legacy `text` string render it verbatim; there is no migration.
- **D-13:** Billing and plans are removed end-to-end: the `Billing` settings group (`plan`, `payment`, `invoices`), their page sections, the plan-change modal and upgrade prompts in `src/actions/actions.js`, `perm.billing` and its column in the permission matrix, the `/api/workspaces/:id/plan` endpoint and the stored `plan` field in `server.js`, seeded `invoices`, the `settings.plan.*` / `settings.pay.*` / `settings.inv.*` / `act.*plan*` / `perm.billing` catalogue keys, and the tests that pin them. Legacy documents carrying `plan`/`invoices` load and save without them; no data migration is written. — Reversibility: one-way.
- **D-14:** With billing gone, `popover.roleDescOwner` and any other copy mentioning plans is reworded, not left dangling.

**Layout and acceptance**
- **D-15:** Criterion 4 is proven by one Playwright spec that loads the main routes in French at 1280 px and 390 px and fails on horizontal document overflow or clipped fixed chrome (sidebar, top bar, modal footer, buttons). Phase 10 widens coverage; this spec is the phase-7 proof, plus a manual spot-check.
- **D-16:** The French read-through is the user's: after execution, review the app in French across all main routes and sign off in a short notes file in the phase directory. Wording fixes applied before the phase closes.

### the agent's Discretion
- Glossary contents beyond the core nouns; batch order within the namespace list; the exact overflow heuristic in the Playwright spec; how the settings subnav is re-indexed once the Billing group disappears.

### Deferred Ideas (OUT OF SCOPE)
- Removing remaining demo/seed sample content (project names, comments) — stays English (PROJECT.md D15).
- Per-user locale persistence, selector redesign, locale negotiation — phase 8 (LOC-01…LOC-05).
- Wiring the typography check into `prebuild` — phase 11.
- German, Spanish, Japanese catalogues — the selector's four other labels stay non-functional.
- Billing-adjacent concepts beyond the D-13 inventory (no pricing pages exist).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (REQUIREMENTS.md) | Research Support |
|----|-------------------------------|------------------|
| I18N-02 | The French catalogue covers every key of the English one; every product surface renders in French (navigation, pages, modals, popovers, toasts, empty states, validation messages, command palette, settings, auth pages, 404) | D-07 completeness test + D-08 batch workflow; reachability wiring (D-01/D-02); all render surfaces already read through `t()` since phase 6 |
| I18N-05 | French typography: space before `: ; ! ?`, inside guillemets, curly apostrophe — wording amended by D-04 (U+00A0 before `:`, U+202F before `; ! ?`, U+00A0 inside `« »`, `’`, `…`, NFC) | D-04 rule + D-05 `test/french-typography.test.mjs` with pattern exemptions (times, ISO dates, URLs) |
| I18N-07 | Stored vocabulary (statuses, priorities, roles, permissions, project templates) translated at display without changing stored values | D-06 extends the phase-6 pattern (constants.js lazy getters, `store.roleLabel`); D-10 templates; D-11 estimates; D-12 notifications |
| D-13 (in-scope decision) | Billing/plans removed end-to-end | Full inventory below (settings nav+cases, actions.js `changePlan`, members.js `perm.billing` column, api.js `setPlan`, server.js endpoint+field+seed) |
</phase_requirements>

## Summary

The engine is fully in place: `src/core/i18n.js` already registers `en` and `fr`, lazily loads the French chunk, dispatches `projects:locale`, and supplies locale-aware formatters (French dates `24/07/2026`, 24-hour clock, `il y a 2 jours`, decimal comma, narrow-NBSP grouping — all `Intl`-driven). What Phase 7 adds is (1) 1,440 French values, (2) the wiring that makes the selector actually switch the interface, (3) a typography linter, (4) four stored-vocabulary conversions (templates, estimates display, notifications structure, plus French values for the existing permission/recurrence keys), and (5) the end-to-end removal of billing.

**Critical wiring fact:** nothing in `src/` listens for the `projects:locale` event today — `setLocale()` dispatches it (i18n.js:64) but it is dead code in the browser until phase 7 adds both the `applyPrefs()` label→code mapping and a re-render listener. `document.documentElement.lang` is hardcoded `'en'` at main.js:117 and never updated.

**Primary recommendation:** Build the wiring first (small, testable in node), then the two new tests (completeness + typography) as the gates, then translate namespace batches against those gates, then the four vocabulary conversions and the billing removal, then the Playwright overflow spec. The existing architecture needs **zero new packages**.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Locale selection & `html lang` | `src/core/i18n.js` (`setLocale`) | `src/core/theme.js` (`applyPrefs` mapping), `src/main.js` (boot default) | Leaf layer owns the singleton; mapping reads prefs and delegates |
| Re-render on locale change | `src/shell/render.js` (or main.js) listener | — | Full innerHTML re-render is the house pattern (render.js:160) |
| French values | `src/locales/fr.json` only | — | Catalogue is the single source; no code change per value |
| Typography enforcement | `test/french-typography.test.mjs` | — | Lints the JSON files, not the code |
| Stored vocabulary display | `src/core/constants.js`, `src/core/store.js`, `src/overlays/modals.js`, `src/pages/inbox.js` | — | Ids stay in data; `t()` at render |
| Billing removal | settings.js, actions.js, members.js, api.js, server.js, seed.js | tests | One-way deletion per D-13 |
| Overflow proof | `e2e/*.spec.mjs` (Playwright, chromium) | — | Existing harness in `e2e/playwright.config.mjs` |

## Standard Stack

**No new runtime or dev packages.** The project's zero-runtime-dependency identity is enforced by `test/catalogue.test.mjs` (`package.json` must carry no `dependencies`). Everything needed is present:

| Concern | Tool | Already in repo |
|---------|------|-----------------|
| Plural categories | `Intl.PluralRules('fr')` — cached in i18n.js | ✓ (i18n.js:91-98) |
| Dates/times/numbers | `Intl.DateTimeFormat`/`NumberFormat` via `LOCALE_FORMATS` | ✓ (i18n.js:141-218) |
| Typographic spaces | Unicode escapes `\u00A0`, `\u202F` in JSON (write the literal characters) | — |
| NFC normalization | `String.prototype.normalize('NFC')` (V8 builtin, verified) | — |
| Browser test | Playwright (`e2e/`, chromium project configured) | ✓ |
| Test runner | `node --test --test-concurrency=2 test/*.test.mjs` | ✓ |

**French `Intl` behaviors verified this session [VERIFIED: node Intl on this machine]:**
- `Intl.PluralRules('fr').select(0)` → `'one'` (French says "0 fichier"), `select(1)` → `'one'`, `select(2)` → `'other'`, `select(1000000)` → `'many'`. Matches i18n.js comment; plural objects need `one`+`other` minimum (D-07) and `many` for millions.
- `Intl.DateTimeFormat('fr', {month:'long'})` renders **lowercase** months (`janvier`…`octobre`) — D-09's lowercase-months rule is free from CLDR; never hand-capitalize.
- `Intl.NumberFormat('fr').format(1000000)` → `1 000 000` with **U+202F** (narrow no-break space) as the group separator — verified codepoints `31 202f 30 30 30 202f 30 30 30`. The formatters already produce this; catalogue values must NOT hand-code digit grouping.
- `'e\u0301'.normalize('NFC') === 'é'` — NFC check implementable with plain `String.prototype.normalize`.

## Package Legitimacy Audit

No packages are installed by this phase — the audit table is intentionally empty (nothing to verify). `package.json` gains nothing; the existing devDependencies (vite, playwright) suffice.

## Architecture Patterns

### System Architecture Diagram

```
prefs.lang ('Français' | 'English (US)' | …4 other labels)
      │  stored in the shared workspace document (unchanged storage)
      ▼
applyPrefs()  [src/core/theme.js — runs at the top of every render()]
      │  label→code map (throwaway, D-01): 'Français'→'fr'; every other label→'en' (D-03)
      ▼
setLocale(code)  [src/core/i18n.js]
      │  syncs singleton; lazily imports src/locales/fr.json chunk;
      │  sets document.documentElement.lang (D-02 — NEW);
      │  dispatches CustomEvent('projects:locale') AFTER the catalogue is ready
      ▼
projects:locale listener  (NEW — one line, e.g. in render.js or main.js)
      │  re-render: $('#app').innerHTML = renderShell() (house pattern)
      ▼
Every render surface reads t(key): nav, pages, modals, popovers, toasts,
errors, palette, auth, 404 — all already t()-wired since phase 6.
Stored vocabulary: id → t('namespace.'+id) lookup at render (D-06).
```

**Loop-safety requirement (new finding):** `setLocale()` dispatches `projects:locale` **unconditionally** (even when the code is unchanged) [VERIFIED: src/core/i18n.js:63-65]. If `applyPrefs()` calls `setLocale()` on every render and the listener re-renders, the loop is: render → applyPrefs → setLocale → event → render → … **The mapping must guard:** `if (getLocale() !== target) await setLocale(target)` (or track the last-applied code). Both guards together are safest. Verify no infinite re-render in the Playwright spec.

### Recommended Project Structure (files touched)

```
src/locales/fr.json            # +1,440 values, batch order per D-08
src/core/i18n.js               # setLocale sets documentElement.lang (D-02)
src/core/theme.js              # applyPrefs lang mapping (D-01)
src/main.js                    # lang="en" default stays; listener may live here
src/shell/render.js            # projects:locale listener (alternative home)
src/overlays/modals.js         # TEMPLATES → project.template.* keys (D-10)
src/pages/inbox.js             # notifText() structured kinds (D-12)
src/data/seed.js               # notifs structured; invoices removed (D-12/D-13)
src/pages/settings.js          # language row mapping note; Billing cases deleted (D-13)
src/actions/actions.js         # changePlan + upgrade prompts deleted (D-13)
src/pages/members.js           # perm.billing column deleted (D-13)
src/core/api.js                # setPlan deleted (D-13)
server.js                      # /plan endpoint + plan field + invoices removed (D-13)
test/french-typography.test.mjs # NEW (D-05)
test/catalogue.test.mjs        # extend: en→fr completeness (D-07)
e2e/french-overflow.spec.mjs   # NEW (D-15)
docs/i18n-fr-glossary.md       # NEW glossary (D-08)
```

### Pattern 1: stored-id → catalogue display (established, extend only)

From `src/core/constants.js` (verified verbatim): statuses/priorities/labels/project statuses are already `t()`-backed lazy getters (e.g. `t('task.status.backlog')`); `store.roleLabel` does `t('common.role.' + role.toLowerCase())` with `viewer`→Guest. **Do not invent a new mechanism** — the 20 `nav.route.*` keys, `bucket.*`, and the existing `task.status.*`/`task.priority.*`/`task.label.*`/`project.status.*`/`common.role.*`/`common.perm.*` families follow this shape. New families needed: `project.template.*` (D-10), `notif.*` (D-12), an estimate display formatter (D-11).

### Pattern 2: billing removal (D-13) — exact sites found [VERIFIED]

| Site | What to remove |
|------|----------------|
| `src/pages/settings.js:77-85` | `SET_NAV` group `settings.group.billing` with plan/payment/invoices items |
| `src/pages/settings.js:422-457` | `case 'plan':` entire body (plan cards, prices, `settings.plan.*` keys) |
| `src/pages/settings.js:459-479` | `case 'payment':` and `case 'invoices':` bodies (`settings.pay.*`, `settings.inv.*`) |
| `src/actions/actions.js:2374-2398` | `A.changePlan` (confirm dialog, `act.*plan*` keys, `api.setPlan`) |
| `src/pages/members.js:83` | `[t('perm.billing'), …]` column in the permission matrix |
| `src/core/api.js:236` | `setPlan` → `POST /api/workspaces/:slug/plan` |
| `server.js:1472-1481` | `/plan` endpoint (owner-only, transactional doc write) |
| `server.js:587` | `next.data.plan = stored?.data?.plan;` copy-on-write |
| `server.js:765` | `invoices: []` in new-workspace seed |
| `src/data/seed.js:519-524` | seeded `invoices` rows |
| `src/locales/en.json` | keys `perm.billing`, `settings.plan.*` (~20), `settings.pay.*` (~10), `settings.inv.*` (~8), `act.planCloudBody/planLocalHead/planLocalTail/upgradeToTitle/downgradeToTitle/upgrade/downgrade`, `toast.planChanged`, `err.changePlan` (exact set: grep `plan` in en.json after removals) |
| tests | `grep -c plan` hits: i18n-pages.test.mjs (37), i18n-actions-modules, i18n-core-features, i18n-dates, i18n-modal, i18n-overlays, i18n-toast, membership, revision, tenancy — rewrite/remove the plan-pinning assertions; also `test/helpers/legacy-fixture.mjs` (legacy docs may still carry `plan`/`invoices` → must load+save tolerantly per D-13) |

### Pattern 3: legacy tolerance (D-12, D-13, "Specifics")
- `notifText()` renders `esc(n.text)` verbatim when a legacy row has no `kind` — keep that branch.
- Server + store: a document with `plan`/`invoices` fields must hydrate, save and snapshot without error (fields are simply ignored; `docSnapshot()` should not copy them once removed — check `docSnapshot` for a `plan` copy).
- The scanner's `STORED_VOCABULARY` set in `scripts/i18n-scan.mjs` lists `'Can view' | 'Can comment' | 'Can edit' | 'Full access' | 'Does not repeat' | 'Daily' | 'Weekly' | 'Every 2 weeks' | 'Monthly'` as stored values excluded from the literal scan — display already goes through catalogue keys (`common.perm.*` via `PERM_KEYS` lowercase-bridge in modals.js:180-201, `popover.recur*` via RECUR map popovers.js:34-38). Phase 7 only supplies the **French values** for those keys; no new wiring.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Plural forms | hand-written fr rules | `Intl.PluralRules('fr')` (already cached in i18n.js) | CLDR: 0→one, 1M→many; wrong rules produce "1 millions" bugs |
| Dates/months | lowercasing logic | `Intl.DateTimeFormat('fr')` | CLDR months are already lowercase (verified) |
| Number grouping | space-insertion code | `Intl.NumberFormat('fr')` | produces U+202F automatically (verified) |
| Relative time | `il y a …` templates | existing `formatRelativeTime` (long style for fr) | already locale-aware |
| Typography lint | grep over JS sources | lint the JSON catalogue values directly | values are the only place the rule applies (D-05) |
| Overflow detection | manual pixel math per page | Playwright `document.scrollWidth > innerWidth` + per-chrome `getBoundingClientRect` clipping check | one generic heuristic covers all routes (D-15) |

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `prefs.lang` display labels in documents (`DEFAULT_PREFS.lang = 'English (US)'` store.js:16); template-created task titles (future, translated at creation D-10); notification `text` fragments (legacy tolerated); `plan`/`invoices` fields (ignored after removal) | No migration; display-side only. Tolerate legacy shapes. |
| Live service config | none (single server, no external services) | None — verified: server.js has no i18n config |
| OS-registered state | none | None |
| Secrets/env vars | none for this phase | None |
| Build artifacts | `LOCALES` env var gates which catalogues vite bundles (`build('en,fr')` / `build('en')` / `build('fr')` in build-locales.test.mjs) — the fr chunk already ships in the default build | Keep LOCALES behavior; the completeness test runs on source files, not the bundle |

## Common Pitfalls

1. **Infinite render loop (new).** `setLocale()` always dispatches `projects:locale`; an unguarded listener + per-render `setLocale()` = render→event→render… Guard the mapping (`getLocale() !== target`) and/or the listener (track last code). Verify in e2e that French routes settle.
2. **Typography in the seed catalogue itself.** The current `fr.json` seed values are already non-compliant: `greeting.hello` = `"Bonjour, {name} !"` with a **plain U+0020** before `!` (verified codepoints `… 20 21`). The lint must fire on day one so the first batch fixes the seed too — don't exempt the existing values.
3. **Forgetting `contract.*` exemption** in the completeness test (D-07): `contract.englishOnly` exists only in en, `contract.frenchOnly` only in fr — the parity lint in catalogue.test.mjs already exempts this namespace; the new completeness test must too.
4. **English drift after translation.** Translating a key that phase 6 pinned verbatim (e.g. `en.greeting.hello` = `'Hello, {name}!'`) breaks regression tests that assert English output. Rule: fr.json edits never touch en.json; any en.json key change is a separate flagged delta (compare `test/i18n-prefs.test.mjs` "declared English deltas" pattern).
5. **Placeholders must match exactly.** `test/catalogue.test.mjs` `lintAgainstBase` compares the placeholder sets per key (incl. per plural member). A French value that drops `{n}` or renames it fails. French plural members must include `other` at minimum; adding `many` is allowed (D-07) and recommended for task/file counts (French 1M+ → many).
6. **Billing removal leaves dangling copy (D-14).** `popover.roleDescOwner` and similar strings mention plans — grep `plan` across catalogue values after removal and reword.
7. **Settings subnav re-index.** `pageSettings()` resolves `S.ui.params.sec` against SET_NAV; removing the billing group leaves stale `sec=plan` deep links → the `page404`/fallback path (`settingsBody` returns `page404()` for unknown sec, settings.js:482) must keep working.
8. **`many` member never selected by existing tests:** if you add `many`, placeholder parity compares per-member sets — the union across members must match en's union (lintCatalogue `placeholdersOf` handles this; keep `{n}` in every member).
9. **Guillemets vs catalogue escaping:** `«`/`»` are fine in JSON values (the FORBIDDEN list is only `< > "`) — but remember values are plain text, never HTML; spaces inside guillemets are U+00A0 (D-04), which the typography test asserts on both sides.
10. **Overflow heuristic false positives:** the document title (`pageTitle()`) or long button labels may legitimately scroll on the *content* pane; D-15 scopes failure to *horizontal document overflow* and *clipped fixed chrome* (sidebar/topbar/modal-footer/buttons) — implement both checks separately to avoid flaky failures.

## Code Examples

### D-01 mapping + loop-safe wiring (theme.js)

```js
// src/core/theme.js — extends the existing applyPrefs()
import { setLocale, getLocale } from './i18n.js';
import { S } from './store.js';

const LANG_TO_LOCALE = { 'Français': 'fr' };          // D-01: throwaway map, D-03: everything else → en

export function applyPrefs() {
  const r = document.documentElement, p = S.prefs;
  const target = LANG_TO_LOCALE[p.lang] || 'en';
  if (getLocale() !== target) setLocale(target);       // guard: setLocale dispatches unconditionally
  setDateFormat(p.dateFmt);
  /* …existing theme lines unchanged… */
}
```

### D-02 + re-render listener

```js
// src/core/i18n.js — inside setLocale(), after catalogue resolution, before/with the dispatch:
if (typeof document !== 'undefined' && document?.documentElement) {
  document.documentElement.lang = target;
}
// src/shell/render.js (or main.js) — one listener, guard against loops:
addEventListener('projects:locale', () => render());
```

### D-05 typography lint skeleton (test/french-typography.test.mjs)

```js
const RULES = [
  { name: 'plain space before ; ! ?', re: / \u0000?[;!?]/, exempt: /(?:\d{1,2}:\d{2}|https?:\/\/|[\w-]+\.\w{2,}(?:\/|\s|$))/ },
  { name: 'plain space before :',    re: / \u0000?:/,    exempt: /(?:\d{1,2}:\d{2}|https?:\/\/|[\w-]+\.\w{2,}(?:\/|\s|$))/ },
  { name: 'straight apostrophe',     re: /'/,            exempt: /(?:https?:\/\/|`)/ },
  { name: 'three-dot ellipsis',      re: /\.\.\./,       exempt: /https?:\/\// },
  { name: 'guillemet padding',       re: /«(?!\u00A0)|(?<!\u00A0)»/, exempt: null },
];
// plus NFC check: value === value.normalize('NFC') for every value
```
*(Exempt rules are pattern-based per D-05: times `14:30`, ISO dates, URLs. Final regexes are the planner's/executor's discretion — every exemption must be explicit.)*

### D-07 completeness test (additive to catalogue.test.mjs)

```js
for (const [key, value] of Object.entries(en)) {
  if (key.startsWith('contract.')) continue;
  const frVal = fr[key];
  assert.ok(frVal !== undefined && frVal !== '' && typeof frVal === 'string' || (frVal && typeof frVal === 'object'),
            `missing French value: ${key}`);
  if (frVal && typeof frVal === 'object') assert.ok('one' in frVal && 'other' in frVal, `${key}: plural needs one+other`);
}
```

### D-11 estimate display formatter

```js
// display-only; storage stays '30m'/'2d' (D-11)
export function fmtEstimate(est) {
  const m = /^(\d+)(m|h|d)$/.exec(String(est || ''));
  if (!m) return est || '';
  const [, n, unit] = m;
  return locale === 'fr' ? `${n} ${ {m:'min', h:'h', d:'j'}[unit] }` : est;   // en keeps the raw ASCII form
}
```
Call sites to wrap (verified): `src/overlays/drawer.js:79` (pill label), `src/overlays/popovers.js:195-201` (option `name`), `src/views/table.js:46` (cell display — not the editing input at :48 which stays raw for input).

### D-12 structured notification

```js
// seed: { kind: 'mention', actor: 'm2', target: 't3' }  (legacy { text } tolerated)
export function notifText(n) {
  if (n.kind) {
    const who = n.actor ? `<b …>${esc(mem(n.actor)?.name)}</b>` : '';
    const what = t('notif.' + n.kind);                    // notif.mention / notif.assign / notif.comment / notif.update.*
    const tgt = n.target && task(n.target) ? `<b …>${esc(task(n.target).title)}</b>` : '';
    return `${who} <span class="muted">${esc(what)}</span> ${tgt}`;
  }
  /* …existing legacy-text branches preserved verbatim… */
}
```
Seed fragment kinds found [VERIFIED: src/data/seed.js notifs]: `mention` ('mentioned you in'), `assign` ('assigned you'), `comment` ('commented on'), `update` ('moved to Review'), plus two actor-less rows (`Product Launch is at risk`, `is due today`) → need `notif.update.atRisk` / `notif.update.dueToday`-style keys or a `{kind, target}` variant — the exact key set is a planner decision within D-12's `{ kind, actor, target }` shape.

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Hand-rolled `fmtDate()`/`ago()` | Intl formatters (phases 5-6) | French output free; keep for regression oracle |
| Hardcoded English literals | `t()` everywhere (phase 6, 1446 keys) | Translation is a data-only task |
| `perm.billing` column | removed (D-13) | one-way; tests rewritten |
| `text:` notification fragments | structured `kind` + `notif.*` keys | legacy tolerated verbatim |
| English only | en + fr complete catalogues | typography lint guards quality |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The exact per-namespace key counts in en.json match D-08's numbers (page 512, settings 196, …) — verified total is 1446 and namespace histogram was spot-checked, not every count cross-checked | D-08 batches | Batches split slightly differently; no correctness impact |
| A2 | `test/french-typography.test.mjs` exemption regexes (times/ISO/URLs) as sketched are sufficient for the real catalogue values | D-05 | Some values may need additional explicit exemptions; the lint will name them |
| A3 | Every render surface is already `t()`-wired (phase 6 completed I18N-01) — assumed from the phase-6 verification, not re-verified surface-by-surface | Summary | A missed literal would surface via the scanner's `i18n-pending.json` allow-list — check it is empty before phase start |

## Open Questions

1. **Actor-less notification kinds** (`Product Launch is at risk`, `is due today`): do they fit `{ kind, actor, target }` with a nullable actor, or do they need their own keys? Recommendation: keep `kind` + `target`, actor optional; keys like `notif.update.projectAtRisk` / `notif.update.dueToday`.
2. **`task.count` `many` member**: current fr.json `task.count` lacks `many` (en may too) — if en gains no `many`, adding it to fr alone is allowed by D-07 but the placeholder parity compares the union; verify en's `task.count` members before adding.
3. **Where the `projects:locale` listener lives** (render.js vs main.js): either works; render.js is closer to the house render-loop pattern. Planner's call.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node ≥ 18 (Intl `fr` full-icu) | formatters, plural tests, typography tests | ✓ | (system node this session ran Intl fr successfully) | none — full-icu node is a hard requirement for CLDR-correct output |
| Playwright + chromium | D-15 overflow spec | ✓ (e2e config exists) | project devDependency | manual spot-check only |
| Vite `LOCALES` env | build contract | ✓ | existing | n/a |

## Validation Architecture

**Nyquist validation enabled** (config.json sets only `use_worktrees: false`; no `nyquist_validation: false`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (`node --test --test-concurrency=2 test/*.test.mjs`) + Playwright for D-15 |
| Config file | none needed for node:test; `e2e/playwright.config.mjs` for the browser spec |
| Quick run | `node --test test/catalogue.test.mjs test/french-typography.test.mjs` |
| Full suite | `npm test` |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Command | Exists? |
|-----|----------|-----------|---------|---------|
| I18N-02 (D-07) | every en key has non-empty fr value | unit (new, in catalogue.test.mjs or own file) | `node --test test/catalogue.test.mjs` | ❌ Wave 0 |
| I18N-05 (D-05) | typography rules on every fr value | unit (new `test/french-typography.test.mjs`) | `node --test test/french-typography.test.mjs` | ❌ Wave 0 |
| I18N-07 (D-06/D-10/D-11/D-12) | stored ids unchanged; display translated | unit (extend i18n-vocab.test.mjs + new template/notif/estimate assertions) | `node --test test/i18n-vocab.test.mjs` | ⚠️ extend |
| D-01/D-02/D-03 | applyPrefs mapping, html lang, unknown→en | unit (new, e.g. test/i18n-locale.test.mjs asserting source + behavior) | `node --test test/i18n-*.test.mjs` | ❌ Wave 0 |
| D-13 | billing gone; legacy docs tolerate | unit (rewrite membership/revision/tenancy/i18n-* assertions) | `npm test` | ⚠️ rewrite |
| D-15 | no overflow/clipped chrome in fr @1280/390 | e2e (new `e2e/french-overflow.spec.mjs`) | `npx playwright test` | ❌ Wave 0 |

### Sampling
- Per task commit: the two new gates + `npm test` (fast).
- Per wave merge: full `npm test`.
- Phase gate: full suite green + Playwright spec green + user French read-through (D-16).

### Wave 0 Gaps
- [ ] `test/french-typography.test.mjs` — new
- [ ] completeness test — extend `test/catalogue.test.mjs`
- [ ] `test/i18n-locale.test.mjs` (or equivalent) — new wiring tests
- [ ] `e2e/french-overflow.spec.mjs` — new
- [ ] `docs/i18n-fr-glossary.md` — before the first translation batch (D-08)

## Security Domain

### Applicable ASVS Categories
| Category | Applies | Standard Control |
|----------|---------|------------------|
| V5 Validation | yes — catalogue values render into HTML | existing: FORBIDDEN chars lint (`< > "`) in catalogue.test.mjs; keep enforced on fr values |
| V7 Error handling | no change | existing |
| V14 Config | yes — server endpoint removal | D-13 deletes `/plan`; verify no other endpoint surfaces plan data |

### Known Threat Patterns
| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Catalogue value → markup injection | Tampering | existing FORBIDDEN-char lint + esc() at call sites; do not weaken for French (guillemets are safe) |
| Plan endpoint residual | Elevation of Info | full D-13 removal; grep for `plan` in server.js routes after |

## Sources

### Primary (HIGH confidence)
- [VERIFIED: src/core/i18n.js:1-67] — registry, setLocale dispatch semantics, html-lang gap
- [VERIFIED: src/core/theme.js:5-17] — applyPrefs body, no lang mapping today
- [VERIFIED: src/pages/settings.js:190-198, 422-479] — language row, billing cases
- [VERIFIED: src/locales/en.json + fr.json via node] — key counts, namespace histogram, seed fr values (incl. `greeting.hello` plain-space codepoints)
- [VERIFIED: node Intl session probes] — fr plural categories, lowercase months, U+202F grouping, NFC
- [VERIFIED: grep inventory] — all billing sites listed in Pattern 2; scanner vocab sets in scripts/i18n-scan.mjs
- [CITED: .planning/phases/07-*/07-CONTEXT.md] — all D-decisions verbatim

## Metadata
**Confidence breakdown:** stack/wiring HIGH; pitfalls HIGH (loop risk + seed-typography verified); billing inventory HIGH (grepped); typography-lint regexes MEDIUM (A2).
**Research date:** 2026-10-23
