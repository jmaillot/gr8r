# Phase 7: French Catalogue & French Typography - Pattern Map

**Mapped:** 2026-10-23
**Files analyzed:** 18 (new + modified, from CONTEXT.md D-01…D-16 and RESEARCH.md wave plan)
**Analogs found:** 17 / 18 (only `docs/i18n-fr-glossary.md` has no codebase analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/locales/fr.json` | config | transform | `src/locales/fr.json` (seed) + `src/core/i18n.js` contract | exact |
| `src/core/theme.js` | hook/provider | event-driven | `src/core/theme.js` itself (extend `applyPrefs`) | exact |
| `src/main.js` | config | event-driven | `src/main.js` init block (lines 116-124) | exact |
| `src/pages/settings.js` | controller | request-response | `src/pages/settings.js` itself (SET_NAV, sections) | exact |
| `src/actions/actions.js` | controller | event-driven | `src/actions/actions.js` itself (`A.setPref`, `A.changePlan`) | exact |
| `src/overlays/modals.js` | component | transform | `src/core/constants.js` lazy-getter tables | role-match |
| `src/pages/inbox.js` | component | transform | `src/pages/inbox.js` itself (`notifText`) | exact |
| `src/data/seed.js` | model | transform | `src/data/seed.js` itself (`notifs` array) | exact |
| `server.js` | controller | request-response | `server.js` itself (plan endpoint, doc guards) | exact |
| `test/french-typography.test.mjs` | test | transform | `test/catalogue.test.mjs` (lint + synthetic fixtures) | exact |
| `test/catalogue.test.mjs` (extend) | test | transform | itself (add en→fr completeness rule) | exact |
| `test/i18n-locale.test.mjs` (new) | test | transform | `test/i18n-prefs.test.mjs` (source + behavior split) | exact |
| `test/i18n-vocab.test.mjs` (extend) | test | transform | itself (oracle table pattern) | exact |
| `test/membership.test.mjs`, `test/revision.test.mjs`, `test/tenancy.test.mjs` (rewrite) | test | request-response | `test/i18n-prefs.test.mjs` (allow-list/rewrite discipline) | role-match |
| `e2e/french-overflow.spec.mjs` (new) | test | request-response | `e2e/tenancy.spec.mjs` | exact |
| `e2e/playwright.config.mjs` | config | — | no change needed (testMatch covers new spec) | — |
| `docs/i18n-fr-glossary.md` (new) | docs | — | none | no-analog |
| `.planning/REQUIREMENTS.md` (I18N-05 correction) | docs | — | none (doc edit per D-04) | no-analog |

## Pattern Assignments

### `src/locales/fr.json` (config, transform — complete the 1,446-key catalogue)

**Analog:** the existing seed `src/locales/fr.json` (5 keys) + the contract enforced by `test/catalogue.test.mjs`.

**Value shape rules** — copy exactly (`test/catalogue.test.mjs:17-40`):
```javascript
const FORBIDDEN = [
  { char: '<', name: 'a left angle bracket' },
  { char: '>', name: 'a right angle bracket' },
  { char: '"', name: 'a double quote' },
];
const KEY_SHAPE = /^[a-z][a-z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;
const CLDR_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];
```

**Existing seed values to keep byte-identical** (`src/locales/fr.json:1-15`):
```json
{
  "nav.projects": "Projets",
  "greeting.hello": "Bonjour, {name} !",
  "settings.language.title": "Langue",
  "task.count": {
    "one": "{n} tâche",
    "other": "{n} tâches",
    "many": "{n} de tâches"
  },
  "contract.frenchOnly": "Français seulement"
}
```
Note the existing typography: U+00A0-style spaces before `!` in `Bonjour, {name} !` — the lint (below) will enforce this. `contract.*` keys stay English-only/french-only (lint exempts the namespace).

**Batch workflow (D-08):** translate namespace by namespace — `page` (512), `settings` (196), `act` (144), `a11y` (132), `toast` (95), `modal` (67), `err` (64), remaining (~236) — each batch gated by the completeness test and the typography test. The glossary `docs/i18n-fr-glossary.md` is written FIRST.

---

### `src/core/theme.js` (hook, event-driven — D-01/D-03 lang mapping in `applyPrefs`)

**Analog:** itself. `applyPrefs` (`src/core/theme.js:5-17`) is where every stored pref maps to a DOM effect:
```javascript
export function applyPrefs() {
  const r = document.documentElement,
    p = S.prefs;
  setDateFormat(p.dateFmt);
  if (p.theme === 'system') r.removeAttribute('data-theme');
  else r.setAttribute('data-theme', p.theme);
  /* ... accent, side, density, motion ... */
}
```

**The mapping to add** (D-01/D-03, throwaway until phase 8): map the stored display label to a locale code, call `setLocale()`, and resolve unknown values to `en`:
```javascript
// throwaway: phase 8 replaces the storage format, the selector and this map
const LANG_TO_LOCALE = {
  'English (US)': 'en',
  'Français': 'fr',
};
// inside applyPrefs():
const code = LANG_TO_LOCALE[p.lang] || 'en';
if (getLocale() !== code) setLocale(code); // projects:locale event re-renders
```
Constraint (D-03): the four other labels (`English (UK)`, `Deutsch`, `Español`, `日本語`) resolve to `en` — they simply do not appear in the map, so the `|| 'en'` default covers them.

---

### `src/main.js` (config, event-driven — D-02 html lang)

**Analog:** itself. The hardcoded line (`src/main.js:117`):
```javascript
(async function init() {
  document.documentElement.lang = 'en';
```
Replace with a read of the active locale. Pattern decision (research open question 3): either set it inside `setLocale()` when `document` exists, or in `main.js` after `applyPrefs()` — `render.js` is also acceptable. The value must be `getLocale()`-derived, never a literal.

---

### `src/pages/settings.js` (controller, request-response — D-13 billing removal, language row stays)

**Analog:** itself.

**SET_NAV billing group to delete** (`src/pages/settings.js:77-84`):
```javascript
  [
    'settings.group.billing',
    [
      ['plan', 'settings.nav.plan', 'gem'],
      ['payment', 'settings.nav.payment', 'credit-card'],
      ['invoices', 'settings.nav.invoices', 'receipt'],
    ],
  ],
```
After removal, re-index section lookup (`pageSettings()` at line 98-99 reads `S.ui.params.sec`) so no stale `sec` value breaks rendering.

**Sections to delete** (`src/pages/settings.js:422-479`): `case 'plan': {` … `case 'invoices':` — both render `settings.plan.*` / `settings.inv.*` keys.

**Language row that STAYS** (`src/pages/settings.js:196`):
```javascript
sel('lang', ['English (US)', 'English (UK)', 'Deutsch', 'Español', 'Français', '日本語'], P.lang),
```
Five labels keep resolving to `en` (D-03); `Français` becomes live via the theme.js map.

**Selector helper pattern** (`src/pages/settings.js:91-97`) — reuse for any new rows:
```javascript
export const sel = (k, opts, v) =>
  `<select class="select" style="width:auto;min-width:180px" data-in="prefSel" data-k="${k}" aria-label="${k}">${opts
    .map(o => {
      const [val, n] = Array.isArray(o) ? o : [o, o];
      return `<option value="${val}" ${String(v) === String(val) ? 'selected' : ''}>${n}</option>`;
    })
    .join('')}</select>`;
```

---

### `src/actions/actions.js` (controller, event-driven — D-13 delete `A.changePlan`, keep setPref)

**Analog:** itself.

**Delete** (`src/actions/actions.js:2374-2396`) — the whole `A.changePlan` arrow including its `fetch`/`toast` body and the `S.data.plan = v;` / `D().plan = v;` writes.

**Keep — the pref write path** (`src/actions/actions.js:280-281, 2182`):
```javascript
A.setPref = el => {
  S.prefs[el.dataset.k] = prefValue(el.dataset.k, el.dataset.v);
```
```javascript
S.prefs[k] = prefValue(k, el.value);
```
With `prefValue` (`src/core/prefs.js:14`): `export const prefValue = (key, value) => (key === 'weekStart' ? +value : value);` — `lang` passes through verbatim; no coercion, no mapping at write time (the pinned contract in `test/i18n-prefs.test.mjs:262-287`).

---

### `src/overlays/modals.js` (component, transform — D-10 TEMPLATES → catalogue keys)

**Analog:** `src/core/constants.js` lazy-getter vocab tables. The house pattern for "stored id, translated display" (`src/core/constants.js:9-16`):
```javascript
export const STATUSES = [
  {
    id: 'backlog',
    get name() {
      return t('task.status.backlog');
    },
  },
  ...
];
export const ST = Object.fromEntries(STATUSES.map(s => [s.id, s]));
```

**Current literal table to convert** (`src/overlays/modals.js:99-121`):
```javascript
export const TEMPLATES = [
  { id: 'blank', name: 'Blank project', icon: 'file', desc: 'Start from scratch', tasks: [] },
  {
    id: 'product',
    name: 'Product Development',
    icon: 'target',
    desc: 'Discovery to launch',
    tasks: ['Define problem statement', 'User research plan', 'Write PRD', 'Design exploration', 'Build MVP', 'Beta launch'],
  },
  ...
```
(7 templates, 42 starter titles total.)

**Conversion pattern:** each display field becomes a lazy `t()` getter; ids and icon stay wire values:
```javascript
{
  id: 'product',
  get name() { return t('project.template.product.name'); },
  icon: 'target',
  get desc() { return t('project.template.product.desc'); },
  tasks: ['Define problem statement', ...] → get tasks() { return TPL_TASKS.product.map(n => t(`project.template.product.task${n}`)); }
}
```
Or simpler: keep `tasks` as an array of key names and render `t(key)` at use site. **Stored tasks created from a template store the translated title at creation** (D-10) — so the call site in the create flow (`src/actions/actions.js` around line 1334 where `status: 'planning'` is built) must call `t()` on the chosen template's task entries at creation time, not at render time.

Also fix the inline literal in the template radio (`src/overlays/modals.js:176`):
```javascript
${t.tasks.length ? t.tasks.length + ' starter tasks' : t.desc}
```
`' starter tasks'` is an extracted-literal candidate — route it through a catalogue key (with plural form) or verify it is already in en.json.

---

### `src/pages/inbox.js` (component, transform — D-12 structured notifications)

**Analog:** itself. Current renderer (`src/pages/inbox.js:42-49`):
```javascript
export function notifText(n) {
  const t = n.task ? task(n.task) : null;
  const p = n.project ? proj(n.project) : t ? proj(t.project) : null;
  const who = n.by ? `<b style="font-weight:600">${esc(mem(n.by)?.name)}</b>` : '';
  if (!n.by && p && !t) return `<b style="font-weight:600">${esc(n.text)}</b>`;
  if (!n.by && t) return `<b style="font-weight:600">${esc(t.title)}</b> <span class="muted">${esc(n.text)}</span>`;
  return `${who} <span class="muted">${esc(n.text)}</span> ${t ? `<b style="font-weight:500">${esc(t.title)}</b>` : ''}`;
}
```
House discipline: escape at the call site (`esc()`), never inside `t()`.

**New shape (D-12):** `{ kind, actor, target }` + `notif.*` catalogue keys:
```javascript
// structured row: the fragment comes from the catalogue, keyed on the stored kind
if (n.kind) {
  // e.g. t('notif.mention.verb'), t('notif.assign.verb'), t('notif.update.dueToday')
  // actor (member id) renders the name span; target renders title bold span
}
// legacy rows: a document still carrying n.text renders it verbatim — no migration
return `<b style="font-weight:600">${esc(n.text)}</b>`;
```
Research recommendation (open question 1): keep `kind` + `target`, actor optional; actor-less kinds get keys like `notif.update.projectAtRisk` / `notif.update.dueToday`.

**Icon map stays id-keyed** (`src/pages/inbox.js:58`) — unchanged wire values:
```javascript
const typeIc = { mention: 'at-sign', assign: 'user-plus', comment: 'message-square', update: 'refresh-cw' }[n.type];
```

---

### `src/data/seed.js` (model, transform — D-12 structured seed rows, D-13 invoices removal)

**Analog:** itself. Current rows (`src/data/seed.js:419-475`) carry English fragments:
```javascript
const notifs = [
  {
    id: 'n1',
    type: 'mention',
    by: 'm2',
    task: 't3',
    text: 'mentioned you in',
    snippet: 'Updated in v3 — @Tanjim Islam can you review before Thursday?',
    at: minsAgo(210),
    read: false,
  },
  ...
  { id: 'n5', type: 'update', by: 'm2', task: 't3', text: 'moved to Review', snippet: 'To Do → Review', at: minsAgo(38), read: true },
  { id: 'n6', type: 'update', by: null, project: 'p4', text: 'Product Launch is at risk', snippet: '...', at: minsAgo(600), read: false },
  { id: 'n10', type: 'update', by: null, task: 't28', text: 'is due today', snippet: '...', at: minsAgo(20), read: false },
];
```
**Conversion:** replace `text: 'mentioned you in'` with structured fields, e.g. `kind: 'mention'` (+ `actor: 'm2'`, `target: 't3'`); actor-less rows (`n6`, `n10`) drop `by` and carry only kind + target. `snippet` stays as-is (sample content, English per PROJECT.md D15).

**Delete:** the `invoices: [...]` seed array (`src/data/seed.js:519+`). Comments (`text:` lines 384-401) stay English — demo content (D15).

---

### `server.js` (controller, request-response — D-13 one-way removal)

**Analog:** itself. Three sites:

**1. The plan endpoint** (`server.js:1472-1481`) — delete:
```javascript
const wsPlanMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/plan$/);
...
const plan = String(body?.plan || '');
if (!['Free', 'Team', 'Business'].includes(plan)) return json(res, 400, { error: 'Unknown plan' });
transaction(() => updateDoc(ctx.ws.id, doc => (doc.data.plan = plan)));
return json(res, 200, { plan: ..., revision: wsRevision(ctx.ws.id) });
```

**2. The plan-preservation guard on workspace writes** (`server.js:586-587`) — delete:
```javascript
// The plan is a label with its own owner-only endpoint; the document never sets it.
next.data.plan = stored?.data?.plan;
```
After deletion, legacy documents carrying `plan`/`invoices` simply load and save without them (no migration — D-13).

**3. Seeded defaults** (`server.js:752, 765`) — delete `plan: 'Team',` and `invoices: [],` from the workspace creation seed.

**Post-removal verification pattern** (RESEARCH.md threat table): grep `plan` in `server.js` routes after the change to prove no residual surface.

---

### `test/catalogue.test.mjs` (test, transform — D-07 completeness rule, additive)

**Analog:** itself. The lint pipeline to extend (`test/catalogue.test.mjs:101-176`):
```javascript
function lintCatalogue(name, data) { /* per-file rules: key shape, plural shape, value rules */ }
function lintAgainstBase(name, data, base) { /* cross-file rules */ }
function lintSynthetic(data, name = 'fr.json', base = {}) {
  return [...lintCatalogue(name, data), ...lintAgainstBase(name, data, base)];
}
function lintAll() {
  const files = catalogueFiles();
  const catalogues = new Map(files.map(name => [name, readCatalogue(name)]));
  const base = catalogues.get(BASE_FILE) || {};
  const violations = [];
  for (const [name, data] of catalogues) {
    violations.push(...lintCatalogue(name, data), ...lintAgainstBase(name, data, base));
  }
  return { files, violations };
}
```

**The completeness rule to add** (D-07): a NEW rule `french-completeness` — every English key except `contract.*` must exist in fr.json with a non-empty string. The existing `lintAgainstBase` only checks fr→en direction (fr keys must exist in en); add the reverse: en keys missing from fr. Plural objects need at least `one` + `other` (`CLDR_CATEGORIES` + `plural-other` rule at lines 116-118 already validates shape; completeness only requires presence of the key). Identical values (`Projects Studio`, `Ctrl`) are PRESENT keys, never omissions — the rule checks existence, not difference.

**Violation-reporting style to copy** (`test/catalogue.test.mjs:49-55`):
```javascript
function violation(file, key, rule, where, detail) {
  return { file, key, rule, where, detail };
}
function describeViolation(v) {
  return `${v.file} → ${v.key} (${v.where}): ${v.detail}`;
}
```

**Test style — synthetic fixtures prove the rule, never edit real catalogues** (`test/catalogue.test.mjs:180-187`):
```javascript
test('the lint rejects a value carrying a left angle bracket', () => {
  const breaches = lintSynthetic({ 'nav.projects': 'a < b' }, 'en.json').filter(v => v.rule === 'markup');
  assert.equal(breaches.length, 1, `the breach is reported once (${breaches.map(describeViolation).join(' | ') || 'no breach reported'})`);
  assert.equal(breaches[0].key, 'nav.projects');
});
```

---

### `test/french-typography.test.mjs` (new — D-05 lint, same architecture as catalogue lint)

**Analog:** `test/catalogue.test.mjs` (structure above). Copy its architecture:

1. **Imports** (`test/catalogue.test.mjs:5-12`):
```javascript
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };
```
2. **Pure lint function over one value** — analog of `lintValue` (`test/catalogue.test.mjs:85-98`). Rules (D-04/D-05):
   - plain space before `; : ! ?` (must be U+00A0 before `:`, U+202F before `; ! ?`)
   - straight apostrophe `'` (must be `’` U+2019)
   - three-dot `...` (must be `…` U+2026)
   - missing/wrong space inside `« »` (U+00A0 on both sides)
   - non-NFC codepoints
3. **Explicit exemptions by pattern** (D-05 / SPECIFICS): times `14:30`, ISO dates `2026-10-23`, URLs, code snippets. Build the rule set as a table of `{ pattern, name, fix }` entries, mirroring `FORBIDDEN`:
```javascript
const RULES = [
  { re: / [\s?:;]/, name: 'a plain space before a colon' }, ...
];
```
   Suggested regexes (verify against real fr values; A2 flagged MEDIUM):
   - `/\s(?=[:])/` before `:` but exempt `/\d:\d/` (time) and `^\s*https?:/`
   - `/\s(?=[;!?])/`
   - `/'/`
   - `/\.\.\./`
   - `/«\s|\s»/` and `/«(?!\u00A0)|(?<!\u00A0)»/` variants
   - NFC: `value !== value.normalize('NFC')`
4. **Test both layers** like the catalogue test: synthetic fixtures for each rule + one `test` walking every fr.json string value (walk plural members too — copy `placeholdersOf`-style recursion at `test/catalogue.test.mjs:66-74`).
5. **Exemption mechanism:** explicit per-key allow-list (like the scanner's `test/fixtures/i18n-pending.json`) or regex-exempt tokens (times/ISO/URLs). Prefer regex-exempt first; add a documented per-key list only for survivors.

**Never normalise accents away** (PITFALLS.md §16) — the lint reports, it does not rewrite.

---

### `test/i18n-locale.test.mjs` (new — D-01/D-02/D-03 wiring tests)

**Analog:** `test/i18n-prefs.test.mjs` — the established split between behavior on the leaf layer (bare-Node importable) and source assertions (DOM/browser-only files):

**Header + helpers to copy** (`test/i18n-prefs.test.mjs:17-65`):
```javascript
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };
import { registerCatalogue, setLocale } from '../src/core/i18n.js';
```
```javascript
/* The French assertions run inside the French locale and leave the module in the base one. */
async function inFrench(fn) {
  registerCatalogue('fr', fr);
  try {
    await setLocale('fr');
    await fn();
  } finally {
    await setLocale('en');
  }
}
```
```javascript
/* The body of an exported function, read from the source. */
function functionBody(source, name) {
  const m = new RegExp(`export function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`).exec(source);
  assert.ok(m, `${name}() is still exported`);
  return m[1];
}
```

**Why source assertions:** bare Node cannot import `src/actions/actions.js` (Vite virtual module) — document this in the header comment (`test/i18n-prefs.test.mjs:10-15`).

**Tests to write:**
1. Behavioral: `setLocale('fr')` returns `'fr'`; unknown codes (`'de'`, garbage) resolve to `'en'` and `t()` falls back (`t()` contract, `src/core/i18n.js:47-67, 114-124`).
2. Behavioral: `t('nav.projects')` returns `Projets` under `inFrench()`.
3. Source: `theme.js` `applyPrefs` body contains the label→code map and a `setLocale(` call (use `functionBody(source, 'applyPrefs')`).
4. Source: `applyPrefs` never calls `save()` / never writes `S.prefs` (mirror `test/i18n-prefs.test.mjs:106-119`).
5. Source: `main.js` no longer carries a hardcoded `lang = 'en'` literal; the lang attr derives from the active locale (D-02).
6. Source: the lang pref is written verbatim (`prefValue('lang', …)` — mirror `test/i18n-prefs.test.mjs:262-276`).

---

### `test/i18n-vocab.test.mjs` (extend — D-06/D-10/D-11/D-12 display-not-rewrite)

**Analog:** itself. The oracle-table pattern to extend (`test/i18n-vocab.test.mjs:32-75`):
```javascript
/* [stored id, the display name the old tables carried] — the ids are what
   the document holds and they never change (D-08). */
const STATUS_ORACLE = [
  ['backlog', 'Backlog'],
  ['todo', 'To Do'],
  ...
];
```
And the source-coverage assertions (`test/i18n-vocab.test.mjs:166-174`):
```javascript
for (const [id] of STATUS_ORACLE) assert.ok(constantsSrc.includes(`t('task.status.${id}')`), `the status display of ${id} is not a catalogue lookup`);
...
assert.ok(storeSrc.includes("t('common.role.' +"), 'the role display is not an id-keyed lookup');
```

**Extensions:**
- **Template oracle (D-10):** every template id in `src/overlays/modals.js` TEMPLATES has a `project.template.*` lookup; the modals source no longer carries literal `name: 'Product Development'` (mirror the "old display tables are gone" test at lines 215-221).
- **Notif kind oracle (D-12):** seed notif kinds map to `notif.*` keys; `notifText()` source contains the kind-keyed lookup and the legacy-`text` verbatim branch.
- **Estimate oracle (D-11):** stored estimates stay ASCII (`'30m'`, `'2d'`); the display formatter reads the store, never writes it. Formatter analog: `formatFileSize` / `byteUnit` (`src/core/i18n.js:387-404`) — number + unit token formatted separately, unit from a per-locale table entry or `t()`:
```javascript
function byteUnit(fmts, index) {
  if (fmts.bytes) return fmts.bytes[index];
  if (index === 0) return t('unit.byte');
  ...
}
```
  A display-only estimate formatter belongs in `src/core/i18n.js` next to the other formatters, with a `fr` entry (`30 min`, `2 j`) — exactly the LOCALE_FORMATS pattern at lines 193-226.

---

### `test/membership.test.mjs`, `test/revision.test.mjs`, `test/tenancy.test.mjs` (rewrite billing assertions)

**Analog:** `test/i18n-prefs.test.mjs` rewrite discipline — when a literal/feature is removed, the test both (a) asserts the removal and (b) verifies no stale allow-list or fixture entries remain (`test/i18n-prefs.test.mjs:253-258`):
```javascript
test('the allow-list lost exactly the literal this plan removed, and stays sorted', () => {
  const pending = JSON.parse(fs.readFileSync(PENDING_FIXTURE, 'utf8'));
  assert.ok(!pending.some(e => e.file === 'src/pages/settings.js' && e.text === 'Oct 1'), 'the stale entry is gone');
  const keys = pending.map(e => `${e.file}::${e.text}`);
  assert.deepEqual(keys, [...keys].sort(), 'the allow-list stays sorted by file then text');
});
```
For each test touching `plan`/`invoices`/`/plan`: delete the assertion, and where the test pinned the endpoint's existence, replace it with a pin of its absence (e.g. server fixture request expecting 404/405). Legacy documents carrying `plan`/`invoices` must still load and save (D-13 tolerance) — add a fixture proving it (`test/helpers/legacy-fixture.mjs` pattern).

---

### `e2e/french-overflow.spec.mjs` (new — D-15 layout proof)

**Analog:** `e2e/tenancy.spec.mjs` + `e2e/playwright.config.mjs`.

**Config** (`e2e/playwright.config.mjs:8-14`) — no change needed; the new spec is picked up by `testMatch: '**/*.spec.mjs'`:
```javascript
testDir: import.meta.dirname,
testMatch: '**/*.spec.mjs',
```

**Spec pattern to copy** (`e2e/tenancy.spec.mjs:1-30`):
```javascript
import { test, expect } from '@playwright/test';
import { BASE_URL, acceptInvite, clientIp, setupTenants } from './helpers/setup.mjs';

let fixtures;

test.beforeAll(async () => {
  fixtures = await setupTenants(BASE_URL);
});

/* One browser context per account: its own cookies, never the other tenant's. */
async function signIn(browser, account) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { 'x-forwarded-for': account.ip },
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${account.slug}$`));
  return { context, page };
}
```
House discipline: role/label/text selectors only — no CSS implementation details (header comment, lines 4-6).

**Adaptations for the overflow spec:**
1. Sign in, then switch language via the settings selector (role-based selectors: navigate to settings → select `Français` in the language row) — the persisted switch is NOT phase 8, so the spec must do it through the UI each session.
2. Loop the main routes at both 1280 px and 390 px (`page.setViewportSize`).
3. Overflow heuristic (agent's discretion, D-15): `document.documentElement.scrollWidth <= document.documentElement.clientWidth`, plus visibility/bounding-box checks on fixed chrome (sidebar, top bar, modal footer, buttons).
4. Assertions in French (e.g. headings named from fr.json values) — this also doubles as an I18N-02 spot proof.

---

## Shared Patterns

### 1. Lazy-getter vocabulary (id stays stored, display is `t()`)
**Source:** `src/core/constants.js:9-16`, `src/core/store.js:258-262`
**Apply to:** `src/overlays/modals.js` TEMPLATES, notification kinds, any new vocab.
```javascript
export const roleLabel = role => {
  const id = String(role || '').toLowerCase();
  return ROLE_KEYS.has(id) ? t('common.role.' + id) : t('common.role.member');
};
```
The id-keyed lookup lowercases the stored id before building the key; an unknown id falls back to a sensible default, never the raw key.

### 2. English is the regression oracle
**Source:** phase-6 contract (CONTEXT.md), `test/i18n-prefs.test.mjs:193-236`
**Apply to:** every refactor in this phase. English rendering must stay byte-identical; renames of catalogue keys are forbidden (the phase-5 parity lint pins the 24 base keys). New keys are additions only.

### 3. Read-only preference resolution — never write at read time
**Source:** `src/core/i18n.js:296-298` (sentinel), `test/i18n-prefs.test.mjs:106-128`
**Apply to:** the `applyPrefs()` lang mapping. `applyPrefs` reads `S.prefs.lang`, maps and calls `setLocale()`; it never saves, never rewrites the stored label. The stored value stays the English display label (`'Français'`) until phase 8.

### 4. The lint reports, never rewrites
**Source:** `test/catalogue.test.mjs:1-4` header
**Apply to:** `test/french-typography.test.mjs` and the completeness rule. Both tests READ the catalogue files and REPORT breaches; a value that cannot pass is rewritten in the catalogue, not soft-waved in the test.

### 5. Escape at the call site
**Source:** `src/pages/inbox.js:45-48`, `src/core/i18n.js:75-79`
**Apply to:** every render site of catalogue values. `t()` never escapes; callers wrap interpolated/external content in `esc()`. Catalogue values carry no `<`, `>`, `"` (guillemets `«»` are safe).

### 6. Bare-Node importability of tests
**Source:** `test/i18n-prefs.test.mjs:10-15`
**Apply to:** new test files. Tests run via `node --test --test-concurrency=2 test/*.test.mjs`; code reaching Vite virtual modules (`src/actions/actions.js`) is asserted on SOURCE, behavior is asserted on the leaf layer (`src/core/i18n.js`, `src/core/prefs.js`).

### 7. One test file per contract
**Source:** test/ directory listing
**Apply to:** `test/french-typography.test.mjs` (typography contract), `test/i18n-locale.test.mjs` (locale wiring contract). Do not duplicate the catalogue lint — extend `test/catalogue.test.mjs` for completeness.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `docs/i18n-fr-glossary.md` | docs | — | First documentation file in the repo (`docs/` is empty); format is free — a terminology table (English term → French term → register note) per D-08/D-09 |
| `.planning/REQUIREMENTS.md` I18N-05 correction | docs | — | Planning-document edit per D-04, no code analog |

## Metadata

**Analog search scope:** `src/core/`, `src/pages/`, `src/overlays/`, `src/actions/`, `src/data/`, `src/locales/`, `test/`, `e2e/`, `server.js`
**Files scanned:** ~35 (all git-tracked; tracked-source gate verified via repo source, no gitignored mirrors exist)
**Pattern extraction date:** 2026-10-23
