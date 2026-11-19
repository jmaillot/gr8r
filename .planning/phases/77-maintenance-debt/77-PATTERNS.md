# Phase 77: Maintenance Debt - Pattern Map

**Mapped:** 2026-11-19
**Files analyzed:** 15 (13 modified/created code+test files, 1 config, 1 phase artifact)
**Analogs found:** 13 / 15

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `eslint.config.js` | config | — | self (extend Node-globals block, lines 11-17) | exact |
| `server.js:2628` (delete `WEBHOOK_MAX_ATTEMPTS`) | service | CRUD | self — targeted single-line deletion, sibling `WEBHOOK_RETENTION_MS` stays | n/a (deletion) |
| `src/components/task-list.js:10` (remove unused param) | component | transform | other param-removal lint sites | n/a (deletion) |
| `src/features/subtask-detail.js:8` (delete unused imports) | component | transform | `src/overlays/drawer.js` import-line cleanup | n/a (deletion) |
| `src/overlays/drawer.js:4,10` (delete `relDate`, `avStack`) | component | transform | self — delete-from-import idiom | n/a (deletion) |
| `src/features/install-banner.js` (WR-01/02, 73-IN-01..04) | component | event-driven | self + `src/ui/toast.js` (kill() shape, module-state idioms) | exact |
| `src/main.js:80-88` (73-IN-03 surface chunk-load failure) | entry/ wiring | event-driven | `test/pwa-banner.test.mjs:502-516` static pin constrains the exact shape | exact |
| `test/pwa-banner.test.mjs` (IN-05 + new pins) | test (node:test) | source-scrape + stubbed-DOM | self — static-contract-pin block at lines 500-539 | exact |
| `test/sw-contract.test.mjs` (74-IN-01/02) | test (node:test) | source-scrape | self — gate-line test at lines 139-153 | exact |
| `test/email-outbox.test.mjs:284` (drop assignment, keep fixture call) | test | fixture setup | `test/visibility-team.test.mjs` dead-initial restructure | role-match |
| `test/mcp.test.mjs:78,1067` (dead-initial restructure) | test | try/catch JSON parse | `test/visibility-team.test.mjs:77-83` | exact |
| `test/visibility-team.test.mjs:77` (dead-initial restructure) | test | try/catch parse | self | exact |
| `e2e/mobile-card-hidden.spec.mjs`, `e2e/subtask-align.spec.mjs` (unused vars) | e2e spec | browser | sibling e2e specs | n/a (deletion) |
| `e2e/locale-refusal.spec.mjs` (NEW, name at discretion) | e2e spec | browser, request-response | `e2e/french-overflow.spec.mjs` + `e2e/locale.spec.mjs` | exact |
| `77-REVIEW-DISPOSITION.md` (NEW) | phase artifact | — | `.planning/phases/75-domain-admission-core/75-REVIEW-DISPOSITION.md` | exact |

## Pattern Assignments

### `eslint.config.js` (config, no-undef fix — D-77-3)

**Analog:** self, Node-globals block lines 11-17 (verbatim, tracked):

```js
  {
    /* e2e specs are Node at the module level (the Playwright import and the
       fixture plumbing) and browser inside the test bodies, so they carry
       both environments' globals. */
    files: ['vite.config.js', 'eslint.config.js', 'server.js', 'domains.js', 'mailer.js', 'totp.js', 'oidc.js', 'mcp.js', 'db-adapter.mjs', 'export/**/*.js', 'scripts/**/*.mjs', 'test/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
```

**Change:** append `'webhook-formats.js', 'webhook-ssrf.js'` to the `files` array; add a comment in the existing style explaining these are standalone root-level scripts run by node directly. Zero `eslint-disable` comments (SC1). No code changes to the two scripts.

---

### `src/features/install-banner.js` (component, event-driven — WR-01/02, 73-IN-01..04)

**Analog:** self (all anchors verified live) + `src/ui/toast.js` for the hide/kill shape.

**Module-state idiom** (lines 29-33):
```js
/* The currently mounted strip (either flavour) — onInstalled() and the
   outcome handlers hide through this reference. */
let strip = null;
/* The captured beforeinstallprompt event: one shot per event (D-02). */
let deferred = null;
```
WR-02 fix pattern: add `let stripFlavour = null;` alongside `strip`; set it in `renderStrip` (line 150 `strip = el;`), keep the reference until `el.remove()` fires *inside* the 160 ms timeout in `hide()` (lines 89-93 — currently `if (strip === el) strip = null;` runs immediately), and clear `deferred` in the give-up-retry path (`onBip` frames-budget exhaustion at line 173, `checkIos` at line 210).

**hide/exit-animation pattern** (lines 88-93; source convention shared with `src/ui/toast.js:16-19`):
```js
/* Exit animation then remove (toast.js kill() shape). */
function hide(el) {
  el.classList.add('out');
  setTimeout(() => el.remove(), 160);
  if (strip === el) strip = null;
}
```

**Duplicate CTA site (WR-01)** (lines 112-117):
```js
const text = flavour === 'ios' ? t('pwa.install.iosHint') : t('pwa.install.cta');
el.innerHTML = `<span class="grow">${esc(text)}</span>`;
if (flavour === 'cta') {
  const btn = document.createElement('button');
  btn.className = 'btn btn-primary install-cta';
  btn.textContent = t('pwa.install.cta');
```
Fix: grow-span for `cta` flavour renders `t('pwa.install.hint')`; button keeps `cta`. New key lands in **all 5 catalogues** (`src/locales/{en,fr,nl,de,es}.json`, pwa.install block) in the same commit — D-08 discipline (see pin pattern at `test/pwa-banner.test.mjs:532-539`).

**Double-hide site (73-IN-01)** (lines 129-136): `try { await ev.userChoice; } catch { hide(el); }` followed by fall-through `hide(el);` — remove one call.

**160 ms constant (73-IN-02)** (line 91 `setTimeout(() => el.remove(), 160);` vs `src/styles/overlays.css:791` `transition: opacity 160ms ease-out;`). Grep across `src/` shows **no shared CSS↔JS token convention exists** — the codebase duplicates the value (`toast.js:18` same 160). Discretion-approved mechanism: a module-level named constant in `install-banner.js` (e.g. `const EXIT_MS = 160;` next to `COOLDOWN_MS` at line 27) so the JS side has a single named source; do NOT touch `toast.js` (out of scope). The CSS side stays as-is unless a trivially safe token exists — prefer the JS-named-constant shape; forecloses nothing.

**Frame-budget → wall-clock (73-IN-04)** (lines 166-178 `onBip`, 203-215 `checkIos`):
```js
let frames = 0;
...
if (++frames < 300) requestAnimationFrame(attempt);
```
Replace with a `performance.now()` deadline; keep the "no further frames on any path" contract documented at lines 159-162.

---

### `src/main.js:80-88` (entry wiring, event-driven — 73-IN-03)

**Analog:** self, verbatim current block [VERIFIED 80-88]:
```js
const bannerMod = () => import('./features/install-banner.js');
addEventListener('beforeinstallprompt', e => {
  e.preventDefault?.();
  bannerMod().then(m => m.onBip(e)).catch(() => {});
});
addEventListener('appinstalled', () => {
  bannerMod().then(m => m.onInstalled()).catch(() => {});
});
bannerMod().then(m => m.checkIos()).catch(() => {});
```
**Hard constraint (research Pitfall 2):** `test/pwa-banner.test.mjs:510-513` pins the boot line verbatim:
```js
assert.ok(
  main.includes('bannerMod().then(m => m.checkIos())'),
  'the boot-time call is the exact bannerMod().then(m => m.checkIos()) shape (D-06 runtime reachability, plan-02 pin)',
);
```
Any `.catch` change must update this pin in the **same commit**. Fix shape: `catch(err => console.warn('install banner chunk failed', err))` — static prefix string only, no raw error internals (ASVS V5 note). Deliberate exception to the house `.catch(() => {})` convention — record in the ledger.

---

### `test/pwa-banner.test.mjs` (test, node:test — IN-05 + new pins)

**Analog:** self. Pin style — **static contract pins** block (lines 500-539):
```js
/* ---------- static contract pins ---------- */

test('main.js wires the banner through the [73-01] lazy-import block only', () => {
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(/\/\* \[73-01\]/.test(main), 'the banner block carries the [73-01] comment tag');
  ...
});

test('both locale files catalogue the banner keys in the same commit (D-08)', () => {
  for (const f of ['en.json', 'fr.json']) {
    const cat = JSON.parse(fs.readFileSync(new URL(`../src/locales/${f}`, import.meta.url), 'utf8'));
    assert.ok(typeof cat['pwa.install.cta'] === 'string' && cat['pwa.install.cta'], `${f}: pwa.install.cta present`);
    ...
```
New WR-01 catalogue pin should extend the D-08 loop to all 5 catalogues for `pwa.install.hint` and assert the grow-span no longer duplicates `pwa.install.cta` (e.g. count occurrences in `install-banner.js` source). Behavior pins (WR-02, IN-01, IN-04) use the stubbed-DOM harness at lines 39-80 (`fakeEl` tracks children/classes/`removed`; localStorage backed by a Map; stub order is load-bearing before the dynamic import — `browser-push.test.mjs` precedent). Header comment (IN-05, lines 1-27) is comment-only: drop the stale "e2e stub lands in plan 02" phrasing (line 21-22).

---

### `test/sw-contract.test.mjs` (test, node:test — 74-IN-01/02)

**Analog:** self. 74-IN-01 anchor (lines 139-153) — fix anchors `gateIdx` to the exact line already asserted verbatim:
```js
test('the api.enabled gate is intact inside the registerSw registration path', () => {
  const push = source('src/core/push.js');
  assert.ok(
    push.includes("if (!('serviceWorker' in navigator) || !api.enabled) return;"),
    'registerSw must gate registration on the api.enabled check — the push-gated registration contract',
  );
  /* the gate lives on the registerSw export, before the register call */
  const exportIdx = push.indexOf('export const registerSw');
  const gateIdx = push.indexOf('!api.enabled');   // ← 74-IN-01: first-substring; anchor to the full gate line instead
  ...
```
Fix: `const gateIdx = push.indexOf("if (!('serviceWorker' in navigator) || !api.enabled) return;");` and make the assertion fail if the full-line anchor misses (distinct from the verbatim includes assert above).

74-IN-02 anchor (line 42): `const ROOT = path.join(import.meta.dirname, '..');` → `path.dirname(fileURLToPath(import.meta.url))` (add `fileURLToPath` to the existing `node:url` import). Pinned file only; ~24 other `import.meta.dirname` sites repo-wide are out of scope (ledger observation).

---

### `test/email-outbox.test.mjs` / `test/mcp.test.mjs` / `test/visibility-team.test.mjs` (test hygiene — lint sites #8-#10, #13)

**Analog:** `test/visibility-team.test.mjs:77-83` dead-initial pattern (`let parsed = null` reassigned in try and catch). **Never blind-delete** — the RHS/try-blocks are load-bearing. Site #8 (`test/email-outbox.test.mjs:283-292`): keep the call, drop the binding → `await makeDigestFixture(...);` (fixture sets DB state read later). Sites #9/#10 (`test/mcp.test.mjs:74-86, 1063-1071`): remove the dead initial assignment, keep the try-branch parse.

---

### `e2e/locale-refusal.spec.mjs` (NEW — e2e spec, browser + catalogue cross-check, D-77-4..7)

**Analog:** `e2e/french-overflow.spec.mjs` (closest: catalogue imports + per-account fixtures + signup flow) and `e2e/locale.spec.mjs` (structure, language switching).

**Header + catalogue-import pattern** (`e2e/french-overflow.spec.mjs:13-16`):
```js
import { test, expect } from '@playwright/test';
import { BASE_URL, PASSWORD, apiClient, clientIp, createAccount, inviteToken, newRunId, openSettings, selectLanguage } from './helpers/setup.mjs';
import en from '../src/locales/en.json' with { type: 'json' };
import frCatalogue from '../src/locales/fr.json' with { type: 'json' };
```
Import `../src/locales/{nl,de,es}.json` the same way — read at spec-parse time in Node, satisfying D-77-7 without a duplicate string table.

**selectLanguage helper** (`e2e/helpers/setup.mjs:107-123`):
```js
export async function selectLanguage(page, lang) {
  const label = await page.evaluate(l => {
    const opt = [...document.querySelectorAll('select[data-in="langSel"] option')].find(o => o.value === l);
    if (!opt) throw new Error(`selectLanguage: no option with value "${l}" in select[data-in="langSel"]`);
    return opt.text;
  }, lang);
  const saved = page.waitForResponse(r => r.url().endsWith('/api/auth/me') && r.request().method() === 'PATCH');
  await page.locator('.set-body .select-btn').click();
  await page.getByRole('option', { name: label }).click();
  return saved;
}
```

**Fixture + signup pattern** (`e2e/french-overflow.spec.mjs:27-42`): `newRunId()` run-unique `@e2e.local` emails (helpers/setup.mjs:231), `apiClient(BASE_URL, { name, ip })`, status-code throws with the server error in the message.

**Refusal assertion target (D-77-5/6/7, per research reconciliation):** signup DP-1 renders as an **inline form-field error, not a toast** — `src/actions/actions.js:4281-4285` sets `S.ui.errors.email` from `res.error || t('err.accountCreateFailed')`; rendered at `src/pages/auth.js:90` via `ferr('email')` inside `<span class="err">` with `aria-describedby="email-err"`. Server gate: `server.js:6766` `if (domainRefusal) return fail(res, 400, 'signupDomainNotAllowed', domainRefusal.message);`; client maps the code at `src/core/api.js:86` `error: data?.code ? tErr(data.code, data, data?.error) : ...`. The catalogue string is static in all 5 locales — parity = full-string equality against the imported catalogue entry (subsumes "no raw `{token}`"). Verbatim catalogue values for reference (research § Code Examples): nl.json:339 / de.json:339 / es.json:339 / en.json:339 / fr.json:340, key `err.signupDomainNotAllowed`.

**Environment (owner decision):** run-wide `ALLOW_SIGNUP_DOMAINS=e2e.local` (all fixtures are `@e2e.local`, e2e/server.mjs passes `...process.env` through; `.env.example:53` documents the var) + a Wave-0 dry run of the full e2e suite. **Pitfall:** any value excluding `@e2e.local` breaks every signup fixture. **Pitfall:** `npm run build` before `npm run e2e` — the wrapper fails closed on stale dist (`e2e/server.mjs:21-54`), and Plan 2 edits `src/main.js`/`install-banner.js`, so build at the start of Plan 3.

---

### `77-REVIEW-DISPOSITION.md` (NEW — phase artifact)

**Analog:** `.planning/phases/75-domain-admission-core/75-REVIEW-DISPOSITION.md` (the richer shape; 76's is a stub skeleton). Copy the 75 shape:

```markdown
---
phase: 75-domain-admission-core
recorded: 2026-11-19
severity: critical
source: 75-REVIEW.md
open: 4
fixed: 2
skipped: 0
deferred: 0
---

# Code Review Disposition — Phase 75

One row per finding from `75-REVIEW.md` ... Dispositions:
`open` (needs a decision) / `fixed` / `skipped` / `deferred`. ...

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | ... — fixed: ...; regression test in `test/domain-admission.test.mjs` |
| WR-01 | warning | fixed | ... — fixed: ...; regression test added |
| IN-01 | info | open | ... |
```

For phase 77: source = `73-REVIEW.md` + `74-REVIEW.md` advisories (WR-01, WR-02, 73-IN-01..05, 74-IN-01, 74-IN-02 — all `fixed` with their regression-pin suite named, mirroring the "regression test in …" phrasing). Also record the two owner notes: the D-77-6 placeholder reconciliation (full-string equality) and the 73-IN-03 deliberate `.catch(() => {})` convention exception. Counters: `open: 0, fixed: 11, skipped: 0, deferred: 0`.

---

## Lint deletion sites (no analog needed — deletion-only, D-77-2)

Pattern for the executor: re-read each site's surroundings, confirm zero side effects, delete. Research § Lint Site Enumeration carries the verified file:line list and the four side-effectful cautions (#8 fixture call, #9/#10/#13 dead-initials). Sibling hazard on `server.js:2628`: `WEBHOOK_RETENTION_MS` on the next line IS used — delete only `WEBHOOK_MAX_ATTEMPTS = 5`.

## Shared Patterns

### D-08 catalogue discipline
**Source:** `test/pwa-banner.test.mjs:532-539` (pin) + STATE.md house rule.
**Apply to:** WR-01 fix and any copy change — locale keys land in ALL 5 catalogues in the same commit as the emitting code; the pin asserts key presence per file.

### Regression-pin placement
**Source:** `test/pwa-banner.test.mjs` (banner pins), `test/sw-contract.test.mjs` (source-scrape pins).
**Apply to:** every advisory fix gets its pin in the nearest existing suite, same commit (D-77 decision § MAINT-03). Static pins read source via `fs.readFileSync(new URL('../src/...', import.meta.url), 'utf8')` and assert on exact strings — which is why Pitfall 2 (exact-string pin at pwa-banner.test.mjs:511) is a same-commit co-change.

### Full suite per commit-group (D-77-18)
**Source:** package.json scripts — `npm test` (node --test --test-concurrency=2 test/*.test.mjs), `npm run lint`, `npm run e2e` (build first).
**Apply to:** every plan's commit discipline.

### Verbatim gate-line / catalogue-equality assertions
**Source:** `test/sw-contract.test.mjs:142` (exact-string includes), `e2e/french-overflow.spec.mjs` fmt()/catalogue-import assertions.
**Apply to:** 74-IN-01 fix and the locale e2e — assert against the asserted source, never a transcribed copy.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | Every file has a direct in-repo analog; deletion-only lint sites need none by nature |

## Metadata

**Analog search scope:** `src/`, `test/`, `e2e/`, `eslint.config.js`, `.planning/phases/{75,76}-*/`
**Files scanned:** ~20 (all analog paths verified git-tracked via `git ls-files`)
**Pattern extraction date:** 2026-11-19
