# Phase 8: Per-user locale & the honest selector - Pattern Map

**Mapped:** 2026-10-23
**Files analyzed:** 14 (4 new, 10 modified)
**Analogs found:** 13 / 14 (one partial: the negotiation helper has no behavioral analog; it
follows the module's pure-function style)

**Note on tracked paths:** every analog named below was verified with `git ls-files` — all are
tracked source files, no gitignored mirrors involved.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` — new `PATCH /api/auth/me` block | route handler | request-response | `server.js` `POST /api/workspaces` (lines 1271-1291) | exact (same guard sequence) |
| `server.js` — `users.locale` column (SCHEMA + `ensureColumn`) | model/migration | batch | `server.js` `ensureColumn()` (127-130) + SCHEMA (79-87) | exact (the helper itself is the analog) |
| `server.js` — `userPayload()` gains `locale` | model | transform | `server.js:244-251` (the file being modified) | exact |
| `src/core/api.js` — `api.patchMe()` | client service | request-response | `api.patchWorkspace()` (`src/core/api.js:178-188`) + `applyUser()` (63-67) | exact |
| `src/core/i18n.js` — `primeLocale()` (silent boot variant) | utility | event-driven (no-dispatch variant) | `setLocale()` itself (`src/core/i18n.js:47-75`) | exact (variant-of-self) |
| `src/core/i18n.js` — `negotiate()` helper | utility | transform | none behavioral; style analog `isAutoDateFmt()` (`src/core/i18n.js:304-306`) | partial |
| `src/core/theme.js` — delete `LANG_TO_LOCALE` + locale block | utility | — | the code being removed (`theme.js:6-20`) | exact (removal target) |
| `src/core/store.js` — strip `lang` at merge points | store | CRUD | the merge points themselves (`store.js:39, 96, 174`) | exact |
| `src/pages/settings.js` — two-option selector row | component | event-driven | `sel()` (`src/pages/settings.js:83-89`) + language case (182-191) | exact |
| `src/actions/actions.js` — `IN.langSel` handler | controller | event-driven | `IN.prefSel` (`src/actions/actions.js:2180-2186`) | role-match (shape copied, `save()` removed) |
| `src/actions/actions.js` — sign-out/in locale steps | controller | event-driven | `A.signOut` (`src/actions/actions.js:2046-2063`) | exact |
| `src/main.js` — boot ordering (negotiate → me → hydrate → seed → render) | controller/boot | event-driven | the existing `init()` itself (`src/main.js:121-194`) | exact |
| `test/locale-account.test.mjs` (NEW) | test (integration) | CRUD | `test/membership.test.mjs` harness pattern + `test/migration.test.mjs` `snapshot()` | exact |
| `test/i18n-locale/pages/prefs.test.mjs` — updated contracts | test | — | existing source-assertion style (`test/i18n-locale.test.mjs:1-46`) | exact |
| `test/migration.test.mjs` — extend `snapshot()` with `users` | test | batch | `snapshot()` (`test/migration.test.mjs:166-190`) | exact |
| NEW e2e spec (negotiation + no-flash, `fr-FR` context) | test (e2e) | event-driven | `e2e/french-overflow.spec.mjs` (signIn, no-reload sentinel, MutationObserver) | exact |
| `e2e/french-overflow.spec.mjs` — persistence-path updates | test (e2e) | — | the spec itself (139-179) | exact |
| `src/locales/en.json` + `fr.json` — one failure-toast key | config (catalogue) | — | existing catalogue pairs | exact |

## Pattern Assignments

### `PATCH /api/auth/me` (added inside `server.js`) — route handler, request-response

**Analog:** `POST /api/workspaces` (`server.js:1271-1291`) — the same guard sequence the new
PATCH must replicate; placement immediately after `GET /api/auth/me` (`server.js:1225-1231`).

**Guard + validation + write pattern** (lines 1271-1291):
```js
if (pathname === '/api/workspaces' && method === 'POST') {
  const user = requireUser(req, res);
  if (!user) return;
  if (!sameOrigin(req)) return json(res, 403, { error: 'Cross-origin request rejected' });
  ...
  const body = await readJson(req);
  const name = String(body?.name || '').trim().slice(0, 60);
  if (!name) return json(res, 400, { error: 'Enter a workspace name' });
  ...
  return json(res, 201, { workspace: workspacePayload(ws, membershipOf(ws.id, user.id)) });
}
```

**Auth primitives** (lines 1059-1064, 1105-1112):
```js
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // curl / non-browser clients; CSRF needs a browser
  const host = (TRUST_PROXY && req.headers['x-forwarded-host']) || req.headers.host;
  return origin === `${proto(req)}://${host}`;
}

function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) {
    json(res, 401, { error: 'Sign in to continue' });
    return null;
  }
  return user;
}
```

**The GET the PATCH sits beside** (lines 1225-1231):
```js
if (pathname === '/api/auth/me' && method === 'GET') {
  // Probe endpoint: answer 200 with null instead of 401 so a signed-out
  // boot doesn't log a console error in every browser.
  const user = currentUser(req);
  if (!user) return json(res, 200, { user: null });
  return json(res, 200, { user: userPayload(user) });
}
```

**Mutation write style** — prepared statement, as in the login path (line 1213):
```js
db.prepare('update users set last_login_at = ? where id = ?').run(t, row.id);
// the new PATCH mirrors: db.prepare('update users set locale = ? where id = ?').run(locale, user.id)
```

Key constraints from research (Pitfall 4/5): the whitelist validates against exactly the
registry codes (`'en'`/`'fr'`); `users.locale` is written from **this endpoint only** — never at
boot, never in `createUser` (server.js:985 inserts without locale → NULL by default).

### `users.locale` column (`server.js`) — migration

**Analog:** `ensureColumn()` (`server.js:127-130`) and the SCHEMA duality (lines 79-87):
```js
function ensureColumn(conn, table, name, def) {
  const cols = conn.prepare(`pragma table_info(${table})`).all();
  if (!cols.some(c => c.name === name)) conn.exec(`alter table ${table} add column ${name} ${def}`);
}
```
The call to add: `ensureColumn(db, 'users', 'locale', 'text')` — inside `openDb()` alongside the
existing calls. **Both paths needed:** add `locale text` to the `create table if not exists
users` SCHEMA string (fresh installs) AND the `ensureColumn` call (legacy DBs); either alone
leaves one install shape without the column.

### `userPayload()` locale field (`server.js:244-251`)

**Analog:** the payload shaper itself — the single point that feeds login (1215), signup (1261),
me (1230), and the workspaces list (1268):
```js
function userPayload(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    workspaces: membershipsOf(user.id).map(row => workspacePayload(row, row)),
  };
}
```
Add `locale: user.locale ?? null` — one line; every auth response then carries it.

### `api.patchMe()` (`src/core/api.js`) — client service

**Analog:** `api.patchWorkspace()` (lines 178-188) for the PATCH-then-adopt-response shape, and
`applyUser()` (63-67) for the cache write:
```js
async patchWorkspace(patch) {
  const slug = state.workspace?.slug;
  if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
  const r = await call('PATCH', `/api/workspaces/${encodeURIComponent(slug)}`, patch);
  if (r.ok) {
    const next = r.data.workspace;
    state.workspace = { ...state.workspace, ...next };
    ...
  }
  return r;
}

function applyUser(data) {
  state.user = data?.user || null;
  state.workspaces = Array.isArray(state.user?.workspaces) ? state.user.workspaces : [];
  return state.user;
}
```
`patchMe(patch)` mirrors this: `call('PATCH', '/api/auth/me', patch)`, and on `r.ok` call
`applyUser(r.data)` so `state.user.locale` stays fresh (research Open Question 1). The transport
underneath is `call()` (lines 38-61) — cookie credentials, JSON body, `{ ok, status, data, error }`
normalised; no new plumbing.

### `primeLocale()` (silent boot variant) (`src/core/i18n.js`)

**Analog:** `setLocale()` itself (lines 47-75) — copy the resolution + catalogue-load +
`documentElement.lang` contract, drop ONLY the `gr8r:locale` dispatch:
```js
export async function setLocale(code) {
  const known = LOCALES.some(l => l.code === code);
  const target = known ? code : BASE_LOCALE;
  locale = target;
  if (!catalogues.has(target)) {
    const loader = loaders[`../locales/${target}.json`];
    if (loader) {
      const mod = await loader();
      registerCatalogue(target, (mod && mod.default) || mod);
    }
  }
  if (typeof document !== 'undefined' && document && typeof document.dispatchEvent === 'function') {
    if (document.documentElement) document.documentElement.lang = target;
    document.dispatchEvent(new CustomEvent('gr8r:locale', { detail: { code: target }, bubbles: true }));
  }
  return target;
}
```
Why the variant exists (research Pitfall 2): the `gr8r:locale` listener at `main.js:68`
(`addEventListener('gr8r:locale', () => render());`) registers at module load, before `init()`.
A dispatching call during boot renders the shell while `S.ui.auth` is null → demo-data flash.
Every pre-render application (negotiation, account adoption, seed) uses the silent variant; the
first dispatching switch is the user's selector click.

### `negotiate()` helper (`src/core/i18n.js`) — NO behavioral analog

**Style analog:** pure, DOM-free functions in the same module (`isAutoDateFmt()`, lines 304-306)
— bare-Node testable. Per D-09: subtag-prefix split + clamp (`fr*`→`'fr'`, `en*`→`'en'`,
anything else→`'en'`), input `navigator.languages` falling back to `navigator.language`.
Research Pattern 4 gives the exact reference implementation — copy it; do not hand-roll a
BCP-47 parser.

### The selector row (`src/pages/settings.js`) — component

**Analog:** the `sel()` helper (lines 83-89) and its existing use in the motion row (168-179):
```js
export const sel = (k, opts, v) =>
  `<select class="select" style="width:auto;min-width:180px" data-in="prefSel" data-k="${k}" aria-label="${k}">${opts
    .map(o => {
      const [val, n] = Array.isArray(o) ? o : [o, o];
      return `<option value="${val}" ${String(v) === String(val) ? 'selected' : ''}>${n}</option>`;
    })
    .join('')}</select>`;
```
The language row today (lines 182-191) — the code being replaced:
```js
case 'language':
  return (
    H(t('settings.language.lead')) +
    srow(
      t('settings.language.title'),
      t('settings.language.rowDesc'),
      sel('lang', ['English (US)', 'English (UK)', 'Deutsch', 'Español', 'Français', '日本語'], P.lang),
    ) +
    srow(t('settings.language.spellcheck'), t('settings.language.spellcheckDesc'), tog('spell', P.spell !== false))
  );
```
The change: a dedicated `data-in` key (e.g. `langSel`, NOT `prefSel`) with options derived from
`availableLocales().map(l => [l.code, l.name])` (`src/core/i18n.js:79-81`) — the registry's
`name` values are already exactly 'English'/'Français' (lines 8-12). The selected value shown
when the account locale is NULL is the negotiated value (D-14). The spellcheck row stays.

### `IN.langSel` handler (`src/actions/actions.js`) — controller

**Analog:** `IN.prefSel` (lines 2180-2186) — the shape to copy MINUS `save()`:
```js
IN.prefSel = el => {
  const k = el.dataset.k;
  S.prefs[k] = prefValue(k, el.value);
  save();
  render();
  toast(t('toast.prefSaved'), { ms: 1500 });
};
```
The new handler: `setLocale(code)` (the `gr8r:locale` event drives the re-render — no explicit
`render()` needed) → background `api.patchMe({ locale })` in server mode, or a
`localStorage['gr8r.locale']` write in demo mode (D-15). **Never `S.prefs` / `save()`** (Pitfall
3 — the doc write and revision bump are exactly what LOC-04 forbids). Failure path (D-16):
keep the applied language for the session + error toast; a 401 rides the existing
session-expired branch. Note `A.setPref` (lines 281-285) is the same doc-write trap via
`data-a` — the language row must not use it either:
```js
A.setPref = el => {
  S.prefs[el.dataset.k] = prefValue(el.dataset.k, el.dataset.v);
  save();
  render();
};
```

### Sign-out/in locale lifecycle (`src/actions/actions.js`) — controller

**Analog:** `A.signOut` (lines 2046-2063) — the fallback lands after `clearLocalCache()`,
before the closing `render()`:
```js
A.signOut = async () => {
  if (api.enabled) {
    await flushPending();
    await api.logout();
    api.revision = 0;
    clearLocalCache();
    history.replaceState(null, '', '/');
  }
  S.ui.conflict = false;
  ...
  S.ui.auth = 'login';
  S.ui.errors = {};
  render();
};
```
D-10: insert the silent locale fallback (to the negotiated value) just before that `render()`.
Mirror step after login/signup/accept-invite success (those paths already end in `render()`):
adopt `api.user.locale` when non-NULL, keep negotiated when NULL (D-11) — silent apply, then the
existing render.

### Boot ordering (`src/main.js`) — controller

**Analog:** the existing `init()` (lines 121-194) — the structure is preserved, the steps are
interleaved:
```js
(async function init() {
  ...
  const withServer = await api.init();          // line 132
  if (joinToken) { ... await api.me() ... }     // lines 138-155 (signed-in join calls me())
  if (withServer) {
    const user = await api.me();                // line 157-158
    if (!user) { S.ui.auth = 'login'; render(); return; }   // unauthenticated early-return
    ...
    const ws = await hydrateFromServer(slug);   // line 178
    ...
  }
  ...
  render();                                     // line 192 — the FIRST render
})();
```
New order per D-07/D-06: **negotiate + silent-prime at the very top** (before `api.init()`'s
await) → account-locale silent apply right after `api.me()` → legacy-label capture + seed PATCH
after `hydrateFromServer()` → first `render()`. The join early-return (138-155) and the
unauthenticated early-return (159-165) both render AFTER the top-of-function negotiation, so
they come up in the negotiated language (D-07/D-08).

### `gr8r:save-error` reuse (D-16 401 path) (`src/main.js:70-97`)

**Analog:** the existing session-expired handler — reused, not duplicated:
```js
addEventListener('gr8r:save-error', e => {
  const { status, error } = e.detail || {};
  if (status === 401) {
    S.ui.auth = 'login';
    S.ui.errors = {};
    render();
    toast(tk('err.sessionExpired'), { kind: 'err' });
    return;
  }
  ...
});
```
The locale PATCH failure path either dispatches this event with `{status}` or mirrors the
non-401 branch inline as a warning toast (research A3: either is acceptable).

### `lang` removal from the prefs pipeline (`src/core/store.js`, `src/core/theme.js`)

**Analog (removal targets, verified verbatim):**
```js
// src/core/theme.js:6-20 — DELETE both the map and the guarded switch
const LANG_TO_LOCALE = { Français: 'fr' };
...
const target = LANG_TO_LOCALE[p.lang] || 'en';
if (getLocale() !== target) setLocale(target);
```
```js
// src/core/store.js:16 — remove from DEFAULT_PREFS
lang: 'English (US)',
// src/core/store.js:39   — module init merge (strip `lang` AFTER capturing for the seed)
prefs: Object.assign({}, DEFAULT_PREFS, saved?.prefs || {}),
// src/core/store.js:174  — applyDoc merge (same strip)
S.prefs = Object.assign({}, DEFAULT_PREFS, doc.prefs || {});
// src/core/store.js:96   — docSnapshot serialises all of S.prefs (why the strip is mandatory)
const docSnapshot = () => ({ data: S.data, prefs: S.prefs, views: S.views, collapsed: S.ui.collapsed });
```
**Critical (Pitfall 1):** removing the key from `DEFAULT_PREFS` only stops seeding it — the
additive merges copy `lang` back from every legacy blob/doc, and `docSnapshot()` writes it back
to `workspaces.doc` on the next save. `delete S.prefs.lang` at BOTH merge points, with the
legacy value captured before the strip (the seed's input, D-04). `applyPrefs()` (theme.js:12-30)
keeps theme/accent/side/density/motion/dateFmt and stops touching the locale entirely — locale
application moves to explicit lifecycle moments (research Pattern 2).

### `test/locale-account.test.mjs` (NEW) — integration test

**Analog 1 — harness shape:** `test/membership.test.mjs:1-46`:
```js
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, client, inviteToken, login, signup, startServer, withDb } from './helpers/server.mjs';
...
let server;
before(async () => {
  server = await startServer();
  const signedIn = await login(server.base, ADMIN.email, ADMIN.password);
  ...
});
after(async () => { await server?.stop(); });
```
**Analog 2 — second-boot snapshot mechanics:** `test/migration.test.mjs:166-190`:
```js
function snapshot() {
  const row = workspaceRow();
  const invite = withDb(server.dbPath, db => db.prepare('select workspace_id from invites').get());
  return { backups: backups(), slug: row.slug, name: row.name, color: row.color,
           revision: row.revision, doc: row.doc, updatedAt: row.updated_at, ... };
}
test('a second boot is a no-op and both accounts keep access', async () => {
  const firstBoot = snapshot();
  await server.stop();
  server = await startServer({ dataDir });
  const secondBoot = snapshot();
  assert.deepEqual(secondBoot, firstBoot, 'no slug/doc/member_id/revision drift');
  ...
});
```
The new suite reuses `startServer`/`login`/`signup`/`withDb`; the LOC-05 extension adds the
`users` rows (incl. `locale`) to the snapshot. The HTTP client already has `.patch()`
(`test/helpers/server.mjs:123`):
```js
patch: (pathname, body) => request('PATCH', pathname, body),
```
House rule: real servers, real SQLite, nothing mocked.

### Updated wiring contracts (`test/i18n-locale.test.mjs`, `i18n-pages`, `i18n-prefs`)

**Analog:** the source-assertion style of `test/i18n-locale.test.mjs:18-21` (reads SOURCE files
because the wiring needs the DOM) and the `inFrench` discipline (lines 25-33):
```js
const THEME_SOURCE = path.join(ROOT, 'src', 'core', 'theme.js');
const I18N_SOURCE = path.join(ROOT, 'src', 'core', 'i18n.js');
const MAIN_SOURCE = path.join(ROOT, 'src', 'main.js');
async function inFrench(fn) {
  registerCatalogue('fr', fr);
  try { await setLocale('fr'); await fn(); } finally { await setLocale('en'); }
}
```
Contracts to update (research Pitfall 6): `i18n-locale.test.mjs:95` asserts `/LANG_TO_LOCALE/`
EXISTS → invert (assert it's gone; assert `applyPrefs` no longer references `lang`);
`i18n-pages.test.mjs:619` asserts the six-label array → rewrite for the two registry-derived
options; `i18n-prefs.test.mjs:272` asserts `prefValue('lang', 'English (US)')` → drop the `lang`
case. These are contract updates required by the phase, not regressions.

### NEW e2e spec (negotiation + no-flash) — test (e2e)

**Analog:** `e2e/french-overflow.spec.mjs` — the selector-interaction and proof patterns:
```js
// line 14: shared helpers
import { BASE_URL, PASSWORD, apiClient, clientIp, newRunId } from './helpers/setup.mjs';
// line 70: signIn(browser, account) helper (defined in-spec)
// lines 143-154: no-reload sentinel + documentElement.lang proof
await page.evaluate(() => { window.__survived = 'no-reload'; });
await page.getByRole('option', { name: 'Français' }).click();
await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('fr');
expect(await page.evaluate(() => window.__survived), 'the switch re-rendered in place').toBe('no-reload');
// lines 160-172: loop-safety MutationObserver + DOM-snapshot equality
```
The new spec adds the Playwright negotiation input (`newContext({ locale: 'fr-FR' })` —
research A4) and asserts the FIRST paint is French (no English/demo flash) for both the
unauthenticated login surface and the authenticated boot.

### Catalogue additions (`src/locales/en.json` + `fr.json`)

**Analog:** the existing paired catalogues. Exactly ONE new user-visible string expected (the
D-16 failure toast). Selector labels are registry `name` values, NOT catalogue strings. Every
new key must land in both files in the same task — `scripts/i18n-scan.mjs` (build gate) fails on
hardcoded literals and `scripts/fr-parity.mjs` fails on en-only keys (Pitfall 8).

## Shared Patterns

### CSRF + auth gate on every mutating endpoint
**Source:** `server.js:1271-1274` (requireUser → sameOrigin → readJson sequence)
**Apply to:** the new `PATCH /api/auth/me` — identical sequence; read ONLY `body.locale`
(mass-assignment guard), whitelist `'en'`/`'fr'` before the UPDATE.

### Silent-prime vs dispatching switch
**Source:** `src/core/i18n.js:47-75` (`setLocale`) + `src/main.js:68` (the listener)
**Apply to:** every pre-render locale application (boot negotiation, account adoption, seed,
sign-out fallback). Runtime selector keeps the dispatching `setLocale()`.

### Optimistic UI + failure toast, 401 → login
**Source:** `src/main.js:70-97` (`gr8r:save-error`), `src/ui/toast.js` toast API
**Apply to:** the background `api.patchMe()` failure path (D-16): keep the applied language for
the session, warn-toast on network/5xx, route to login on 401 via the existing branch.

### Registry as single truth
**Source:** `src/core/i18n.js:8-12` (`LOCALES`), 79-81 (`availableLocales`)
**Apply to:** selector options (settings.js), server whitelist (server.js), the agreement test
(registry ↔ `src/locales/*.json` ↔ settings.js source). Never hardcode option arrays or code
lists in a second place.

### Whole-document save pipeline (what the language must avoid)
**Source:** `src/core/store.js:96,126` (`docSnapshot`/`save`), `src/actions/actions.js:2180-2186`
(`IN.prefSel`)
**Apply to:** negatively — the language never enters `S.prefs`, `docSnapshot()`, `IN.prefSel`,
`A.setPref`, or any `save()` call. Its write path is exactly `PATCH /api/auth/me` (server) or
`localStorage['gr8r.locale']` (demo).

### Real-server test harness
**Source:** `test/helpers/server.mjs` (client/login/signup/startServer/withDb), 
`test/membership.test.mjs:33-46` (before/after shape)
**Apply to:** the new `test/locale-account.test.mjs` and the extended `migration.test.mjs`
snapshot. `node --test --test-concurrency=2 test/*.test.mjs` invocation.

## No Analog Found

| File/Concern | Role | Data Flow | Reason | Fallback |
|------|------|-----------|--------|----------|
| `negotiate()` helper | utility | transform | No browser-language negotiation exists anywhere in the codebase | RESEARCH.md Pattern 4 gives the exact reference implementation (pure function, bare-Node testable, ~8 lines) |
| The migration seed (D-04/D-06) | controller glue | event-driven | No client-side migration seed exists; the closest lifecycle glue (`applyDeepLink`, `main.js:100-119`) is unrelated | RESEARCH.md Pattern 5 specifies guard (NULL + `'Français'` only), timing (post-hydration, pre-render), failure (log/ignore, retry next boot) |
| Demo-mode localStorage persistence (D-15) | storage | CRUD | No precedent for a second localStorage key outside `STORE_KEY` (`store.js:8`, `'gr8r.v2'`) | A separate `gr8r.locale` key owned by the i18n module — deliberately NOT inside the `gr8r.v2` blob, so it can never re-enter the prefs/doc pipeline |

## Metadata

**Analog search scope:** `src/core/`, `src/pages/`, `src/actions/`, `src/shell/`, `server.js`,
`test/`, `e2e/` (project root repo; no submodules)
**Files read in full or in targeted ranges:** 13 (`i18n.js`, `api.js`, `theme.js`, `store.js`,
`settings.js`, `actions.js` ×4 ranges, `main.js`, `server.js` ×4 ranges, `migration.test.mjs`,
`membership.test.mjs`, `helpers/server.mjs`, `i18n-locale.test.mjs`, `french-overflow.spec.mjs`)
**Pattern extraction date:** 2026-10-23
