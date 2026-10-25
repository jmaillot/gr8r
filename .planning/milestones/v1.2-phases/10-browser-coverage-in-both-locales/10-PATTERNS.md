# Phase 10: Browser coverage in both locales - Pattern Map

**Mapped:** 2026-10-24
**Files analyzed:** 4
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `e2e/flows.spec.mjs` (NEW) | test (Playwright spec, 8 flow describes × en/fr) | event-driven (UI interactions) + request-response assertions | `e2e/french-overflow.spec.mjs` + `e2e/locale.spec.mjs` | exact |
| `e2e/helpers/setup.mjs` (MODIFY — promote `createAccount`, export `inviteToken`) | utility (fixture helper) | CRUD (real API fixtures) | `e2e/locale.spec.mjs:22-36` (the code being promoted) + `e2e/helpers/setup.mjs` itself | exact |
| `e2e/locale.spec.mjs` (MODIFY — criterion-4 extension) | test (Playwright spec, multi-context) | event-driven + multi-context browser | itself (`e2e/locale.spec.mjs`) | exact (self-extension) |
| `e2e/playwright.config.mjs` (MODIFY — `use.locale` pin) | config | config | itself (`e2e/playwright.config.mjs:16-21`) | exact (self-edit) |

There is no product code in this phase. Every analog is the suite's own e2e code — the planner
should treat the existing spec files as the templates.

## Pattern Assignments

### `e2e/flows.spec.mjs` (NEW — test, event-driven browser flows)

**Analog:** `e2e/locale.spec.mjs` (fixtures, selector dictionaries, helpers) and
`e2e/french-overflow.spec.mjs` (modal-driving, structural-selector rules, in-browser fixture
creation). Both were read in full this session.

**Header comment + imports pattern** (`locale.spec.mjs:1-15`):
```js
/* =====================================================================
   PHASE 8 BROWSER PROOF (LOC-01, LOC-03, LOC-06): ...
   Conventions follow the rest of the suite: role/label/text selectors for
   every visibility claim, one browser context per account, fixtures only
   through the real API (helpers/setup.mjs). Every account here is
   throwaway and owns a run-unique client address, ...
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, PASSWORD, apiClient, clientIp, newRunId } from './helpers/setup.mjs';

let run;
let alice; // workspace owner, account locale 'fr'
```
`flows.spec.mjs` copies this shape: a banner comment naming the phase and the eight UAT ids,
imports from `./helpers/setup.mjs`, module-level fixture holders filled in `test.beforeAll`.

**The per-flow selector dictionary (en/fr)** (`locale.spec.mjs:55-58`):
```js
/* The login form in either language; the context's locale decides which one renders. */
const LOGIN = {
  en: { email: 'Email', password: 'Password', submit: 'Sign in' },
  fr: { email: 'E-mail', password: 'Mot de passe', submit: 'Se connecter' },
};
```
Every flow gets one such object (INVITE, SHARE, REMOVE, SWITCHER, NEWPROJECT, …), one key per
locale, carrying the catalogue strings that flow asserts. RESEARCH.md Code Examples shows the
same pattern applied to the invite flow (`INVITE = { en: {...}, fr: {...} }`).

**The describe × locale loop** (RESEARCH.md "The flows spec shape", D-01/D-03):
```js
test.describe('invite modal', () => {
  for (const [loc, L] of Object.entries(INVITE)) {
    test(`invite flow asserts labels and toast (${loc})`, async ({ browser }) => { /* ... */ });
  }
});
```
The English and French variants run identical steps; only `L` differs — a flow that fails fails
identically in both languages (CONTEXT § Specifics).

**Browser-context-per-account + run-unique IP** (`locale.spec.mjs:60-62`):
```js
async function newContext(browser, account, locale) {
  return browser.newContext({ baseURL: BASE_URL, locale, extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
}
```
and `french-overflow.spec.mjs:73-86` (`signIn`) — the context creation with
`extraHTTPHeaders: { 'x-forwarded-for': account.ip }`, then goto `/`, `getByLabel` email/password,
click submit, `await expect(page).toHaveURL(new RegExp(\`/w/${account.slug}$\`))`. Copy this
`signIn`/`signInPage` helper verbatim into `flows.spec.mjs`.

**In-browser fixture creation precedent (F1, F8)** (`french-overflow.spec.mjs:127-130`):
```js
await page.getByRole('button', { name: 'New project' }).first().click();
await page.getByLabel('Project name').fill('Probe');
await page.getByRole('button', { name: 'Create project' }).click();
await expect(page.getByText('Probe').first()).toBeVisible();
```
This is the exact UAT-08 precedent: open the modal by role/name, fill by label, submit by
role/name, assert visible result. The phase-10 version deepens it (toast + fr dictionary).

**Modal + structural-selector rules** (`french-overflow.spec.mjs:229-249`): modals are
`page.getByRole('dialog')` with a level-2 heading; `.modal-wrap .modal` / `.modal-f` structural
locators exist only for box math, never for product visibility claims (header comment lines 6-11
state the rule). The confirm dialog in F5 (member removal) is the app's own `.modal-wrap .modal`
— no Playwright `dialog` event handler needed.

**Toast assertion** (`french-overflow.spec.mjs` never needs one; the convention comes from
`src/ui/toast.js:8-27` via RESEARCH.md Pattern 3):
```js
await expect(page.getByRole('status').filter({ hasText: L.toast }).first()).toBeVisible();
```
Toast lifetime ≈4.2 s — assert immediately after the triggering click, no waits before.

**Loop/settle guards** (`locale.spec.mjs:151-160`): only if a flow needs it; reuse the
MutationObserver-on-`#app` pattern rather than inventing new observers.

**API-fixture-through-spec pattern** (`locale.spec.mjs:44-49`): the invite + accept chain —
`a.client.post(\`/api/workspaces/${alice.slug}/invites\`, ...)` → parse the `/join/` token →
`b.client.post(\`/api/invites/${token}/accept\`, {})` with explicit status checks and thrown
errors carrying the HTTP status. F3's fixture needs exactly this; `inviteToken()` in
`setup.mjs:87-92` is the same slice, currently unexported (D-06 exports it).

---

### `e2e/helpers/setup.mjs` (MODIFY — utility, CRUD fixtures)

**Analog:** itself, plus the `createAccount` body being promoted from `locale.spec.mjs:22-36`.

**The code being promoted (verbatim, `locale.spec.mjs:22-36`):**
```js
async function createAccount(tag, name, { locale, workspace } = {}) {
  const account = { email: `${tag}-${run}@e2e.local`, password: PASSWORD, name, ip: clientIp(run, tag), slug: workspace };
  const client = apiClient(BASE_URL, { name: tag, ip: account.ip });
  const signup = await client.post('/api/auth/signup', { name, email: account.email, password: account.password });
  if (signup.status !== 201) throw new Error(`${tag} signup failed with HTTP ${signup.status}: ${signup.data?.error || ''}`);
  if (workspace) {
    const ws = await client.post('/api/workspaces', { name: `Locale ${tag} ${run}`, slug: workspace });
    if (ws.status !== 201) throw new Error(`${tag} workspace failed with HTTP ${ws.status}: ${ws.data?.error || ''}`);
  }
  if (locale) {
    const patched = await client.patch('/api/auth/me', { locale });
    if (patched.status !== 200) throw new Error(`${tag} locale failed with HTTP ${patched.status}: ${patched.data?.error || ''}`);
  }
  return { account, client };
}
```
Promotion notes for the helper version:
- take `run` as a parameter (or the account build takes the email/ip as params) instead of
  closing over the spec's module-level `run` — `setup.mjs` functions already take `(base, run)`
  params this way (see `setupTenants(base = BASE_URL, run = newRunId())`, setup.mjs:138).
- **Error-handling pattern:** the file's own `expectStatus(step, res, allowed)` (setup.mjs:81-85)
  is the canonical status check — prefer rewriting the promoted body against `expectStatus`
  (`expectStatus(`${tag} signup`, await client.post(...), [201])`) so the helper uses one
  convention. Alternatively keep the inline throws; either way, explicit status checks are
  mandatory (D-06).

**Export pattern** (setup.mjs:16-39): `export const BASE_URL = ...`, `export function clientIp(run, tag)`,
`export function newRunId()`, `export function apiClient(base, { name, ip })` — new exports
(`createAccount`, `inviteToken`) follow the same top-level `export` style. `inviteToken`
(setup.mjs:87-92) just needs `export` added:
```js
export function inviteToken(url) {
  const marker = '/join/';
  const at = String(url || '').lastIndexOf(marker);
  if (at === -1) throw new Error(`invite response has no join link: ${url}`);
  return String(url).slice(at + marker.length);
}
```

**Banner-comment convention** (setup.mjs:1-13): the file header documents the throttle budget
(signup 5/hour/IP, invite accept 5/hour/IP, login 10/15min/IP+email) and the
fixtures-only/no-assertions rule. The promoted helper's comment must restate that locale is an
account property written via `PATCH /api/auth/me` before any browser opens (D-02).

**Untouched code:** `setupTenants`, `acceptInvite`, `OWNER`, `PREFIX`, `project()` stay exactly
as they are — tenancy's bare fixtures are deliberately not touched (D-06).

---

### `e2e/locale.spec.mjs` (MODIFY — test, criterion-4 extension)

**Analog:** itself. The new assertions extend the final test
(`locale.spec.mjs:181-206`, "two members of one workspace each see their own language") or a
sibling test reusing its fixtures.

**Fixtures available for reuse** (`locale.spec.mjs:38-52`): `alice` (fr, owns `loc-${run}`),
`bob` (en, member of alice's workspace), `carol` (own workspace `carol-${run}`, NULL locale).
D-04 adds a **second workspace for alice, created via API in `test.beforeAll`** — copy the
workspace-creation block already inside `createAccount` (locale.spec.mjs:27-30) or a direct
`client.post('/api/workspaces', ...)` with a status check, same as line 44-49's invite pattern.

**Second browser context pattern** (`locale.spec.mjs:184-187`):
```js
const aliceCtx = await newContext(browser, alice, 'en-US');
const bobCtx = await newContext(browser, bob, 'fr-FR');
const alicePage = await aliceCtx.newPage();
const bobPage = await bobCtx.newPage();
```
with `try { ... } finally { await aliceCtx.close(); await bobCtx.close(); }` (lines 202-204).
The criterion-4 scenario is exactly this shape plus: reload (lines 197-201 show the reload +
re-assert pattern), workspace switch (F6's `data-a="switchWs"` path), and a third context
created after the switch to prove the persisted locale.

**Workspace-switch assertion targets** (RESEARCH.md F6): after clicking
`button[data-a="switchWs"][data-v=slug]`, assert `expect(page).toHaveURL(new RegExp(\`/w/${slug}$\`))`
— the same URL assertion `signInPage` uses (locale.spec.mjs:69) — plus the new workspace's name
rendered.

**Language-durability assertion vocabulary** (locale.spec.mjs:146, 163-166):
```js
await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('fr');
...
expect((await saved).status(), 'the account locale write failed').toBe(200);
await page.reload();
await expect(page.getByRole('button', { name: 'Projets' }).first()).toBeVisible();
expect(await page.evaluate(() => document.documentElement.lang)).toBe('fr');
```
Use `document.documentElement.lang` polls and the `saved = page.waitForResponse(r =>
r.url().endsWith('/api/auth/me') && r.request().method() === 'PATCH')` pattern when the switch
happens through the UI.

---

### `e2e/playwright.config.mjs` (MODIFY — config)

**Analog:** itself, `use:` block at lines 16-21:
```js
use: {
  baseURL: BASE_URL,
  trace: 'retain-on-failure',
  screenshot: 'only-on-failure',
  video: 'off',
},
```
The edit adds exactly one key plus a comment, per RESEARCH.md Code Examples:
```js
use: {
  baseURL: BASE_URL,
  locale: 'en-US', // UAT-09: the existing specs are pinned to English. Fixture accounts
                   // patched to 'fr' still boot French — the account locale wins over the
                   // negotiated one (LOC-03); this pin only fixes the negotiated default.
  trace: 'retain-on-failure',
  ...
},
```
Nothing else in the file changes: `fullyParallel: false`, single `chromium` project,
`gracefulShutdown` and the `webServer` block are load-bearing (comment at line 29).

---

## Shared Patterns

### Fixtures only through the real API; assertions only in the browser
**Source:** `e2e/helpers/setup.mjs:1-13` (header), `e2e/locale.spec.mjs:7-12`
**Apply to:** `flows.spec.mjs` (all 8 describes) and the locale extension
Every fixture (accounts, workspaces, invites, projects, the second criterion-4 workspace) is
created via `apiClient` with explicit status checks. Visibility claims use role/label/text
selectors only; `.side`/`.topbar`/`.modal-wrap` structural locators are allowed only for box
math (french-overflow convention, lines 6-11).

### Run-unique client IP per account
**Source:** `e2e/helpers/setup.mjs:32-35` (`clientIp`), used at locale.spec.mjs:23, french-overflow.spec.mjs:31
**Apply to:** every account in `flows.spec.mjs` — tag must be unique per *account*, not per flow
(Pitfall 4: 8×2 accounts on one shared IP exhausts the 5/hour/IP signup throttle).

### Sign-in bootstrap
**Source:** `e2e/locale.spec.mjs:64-70` (`signInPage`), `e2e/french-overflow.spec.mjs:73-86` (`signIn`)
**Apply to:** every flow test that starts signed-in
goto `/` → `getByLabel` email/password → submit → `toHaveURL(/\/w\/{slug}$/)`. Parameterize the
labels from the flow's en/fr dictionary.

### Selector dictionary per flow (en/fr)
**Source:** `e2e/locale.spec.mjs:55-58` (`LOGIN`)
**Apply to:** all eight flow describes in `flows.spec.mjs`
One object per flow with `en`/`fr` keys; identical test body per locale; assert only strings
that exist in `src/locales/en.json`/`fr.json` (catalogue-backed surfaces: titles, buttons,
`aria-label`, `data-tip`, toasts) — never raw-English splices like the member-removal confirm
body (actions.js:1844, deferred literal).

### Toast assertion
**Source:** `src/ui/toast.js:8-27` (`.toast[role=status]` in `#toasts`, ≈4.2 s lifetime)
**Apply to:** every flow's outcome step
`getByRole('status').filter({ hasText: L.toast }).first()` immediately after the triggering
click.

## No Analog Found

None — all four files have exact in-repo analogs. Note for the planner: the per-flow UI
selectors themselves (onboarding wizard, invite modal, `/join`, share modal, switcher popover)
are inventoried in 10-RESEARCH.md § "Flow-by-flow selector inventory" with `src/` line
citations; use that as the selector source, not the spec analogs.

## Metadata

**Analog search scope:** `e2e/` (all 6 files listed), project root (no AGENTS.md,
no .claude/skills directory found)
**Files scanned:** 6 (4 read in full: config, setup, locale.spec, french-overflow.spec;
2 skipped as not analogous: tenancy.spec, server.mjs)
**Pattern extraction date:** 2026-10-24
