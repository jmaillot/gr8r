# Phase 62: E2E Baseline Repair - Pattern Map

**Mapped:** 2026-11-14
**Files analyzed:** 4 (2 specs to rewrite, 1 helper file to extend, 1 config locked-untouched)
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `e2e/helpers/setup.mjs` (modify: add `openSettings`, `selectLanguage`, D-02 guard) | test-helper (utility) | request-response | itself (existing export style) + `e2e/demo-locale.spec.mjs:88-99` (select contract) | exact |
| `e2e/french-overflow.spec.mjs` (modify: 7 specs, remove sleep cluster :144-182) | e2e spec (test) | event-driven (UI interaction) | `e2e/locale.spec.mjs:122-177` (same drift shape) + its own non-drifted parts | exact |
| `e2e/locale.spec.mjs` (modify: :122 spec) | e2e spec (test) | event-driven (UI interaction) | `e2e/demo-locale.spec.mjs:77-108` (post-Phase-56 contract, green) | exact |
| `e2e/playwright.config.mjs` (LOCKED — verify only, no edit) | config | — | none needed | n/a (anti-feature) |

**Important HEAD observation (differs from RESEARCH assumption A):** `e2e/french-overflow.spec.mjs:144-163` and `e2e/locale.spec.mjs:131-150` at HEAD **already use role-based queries** (`getByRole('option', ...)`, `expanded: false`) — the language trigger is already the post-56 ARIA shape, not a bare `<select>`. The actual failing region may be narrower (e.g., the settings entry point, chunk timing, or the loop-safety sleeps). Executors MUST run each spec first (`npx playwright test --config e2e/playwright.config.mjs e2e/french-overflow.spec.mjs`) and triage the real failure before rewriting — D-07 flag-and-stop applies if the app broke.

## Pattern Assignments

### `e2e/helpers/setup.mjs` (test-helper, request-response) — new `openSettings` / `selectLanguage` / D-02 guard

**Analog:** the file's own export conventions + `e2e/demo-locale.spec.mjs:88-99` for the select contract.

**Import/export pattern** (lines 1-20): file is plain-Node ESM, no Playwright imports today — helpers use `fetch` and return data; keep it that way for the D-02 guard (plain `fetch`, not `page.request`):

```javascript
import { createHash } from 'node:crypto';
export const BASE_URL = `http://127.0.0.1:${process.env.E2E_PORT || 4317}`;
```

⚠️ **Decision point for the planner:** `openSettings`/`selectLanguage` take `page` and use `expect()` — that means `import { expect } from '@playwright/test'` at the top of setup.mjs (first Playwright import in this file). Fine per D-03/D-05, but call it out in the plan.

**Error-message pattern** (lines 81-85) — the house style for helper failures (step name + status + detail); D-02 guard should match:

```javascript
function expectStatus(step, res, allowed) {
  if (allowed.includes(res.status)) return res.data;
  const detail = res.data?.error ? `: ${res.data.error}` : '';
  throw new Error(`${step} failed with HTTP ${res.status}${detail}`);
}
```

**Comment contract** (lines 94-98, 137-144) — every helper carries a provenance comment naming the phase/decision; new helpers must do the same (D-03/D-05/D-08 references):

```javascript
/* Phase 23 (post-merge gate fix): read-modify-write of the shared acme
   document with revision-conflict retry. ... */
```

**Select-driving contract to lift** (`e2e/demo-locale.spec.mjs:88-99`, verbatim — the STATE.md-named fix pattern):

```javascript
await page.getByRole('button', { name: fmt('settings.language.title') }).click();
/* The design-system select (src/ui/select.js) enhances the native <select>
   into a trigger button + role=listbox menu — the native control is
   aria-hidden, so drive the real UI: open the trigger, pick the option
   whose label the registry gives to code 'en' (label read from the DOM,
   never transcribed). */
await page.locator('.set-body .select-btn').click();
const enLabel = await page.evaluate(() => [...document.querySelectorAll('select[data-in="langSel"] option')].find(o => o.value === 'en')?.text);
if (!enLabel) throw new Error('no en option in the language select');
await page.getByRole('option', { name: enLabel }).click();
```

For API-mode specs the drift-proof variant already exists in french-overflow :153-155 (trigger button carries the current language label and `expanded` state):

```javascript
const language = page.getByRole('button', { name: 'Language', exact: true, expanded: false });
await language.click();
await expect(page.getByRole('option')).toHaveText(['English', 'Français']);
```

**PATCH-wait pattern to wrap in `selectLanguage`** (french-overflow :156-157, locale :145-146 — already correct at HEAD):

```javascript
const saved = page.waitForResponse(r => r.url().endsWith('/api/auth/me') && r.request().method() === 'PATCH');
await page.getByRole('option', { name: 'Français' }).click();
/* caller side: */ expect((await saved).status(), 'the account locale write failed').toBe(200);
```

**D-02 guard skeleton** (from RESEARCH.md, assert-once, no loop — planner pastes into setup.mjs near the top, after `BASE_URL`):

```javascript
async function assertServerUp(base = BASE_URL) {
  let res;
  try {
    res = await fetch(`${base}/api/health`);
  } catch (e) {
    throw new Error(`e2e server not ready at ${base}/api/health (webServer.url should have gated this): ${e.message}`);
  }
  if (!res.ok) throw new Error(`e2e server /api/health answered HTTP ${res.status} — server not ready`);
}
```

**Anti-pattern:** never write `page.getByRole('combobox')` — no element carries that role (`src/ui/select.js` exposes button + listbox + option; native select is `aria-hidden`, line 31).

---

### `e2e/french-overflow.spec.mjs` (e2e spec, event-driven) — 7 specs

**Analog:** its own already-correct regions (imports, isolation, non-drifted specs) + `e2e/locale.spec.mjs:122-177` (identical drift shape).

**Imports pattern** (lines 13-16) — specs import helpers + locale JSON catalogues directly; keep this shape:

```javascript
import { test, expect } from '@playwright/test';
import { BASE_URL, PASSWORD, apiClient, clientIp, createAccount, inviteToken, newRunId } from './helpers/setup.mjs';
import en from '../src/locales/en.json' with { type: 'json' };
import frCatalogue from '../src/locales/fr.json' with { type: 'json' };
```

**Per-account isolation pattern** (lines 18-42) — MUST be preserved in the rewrite (Pitfall 5; do not share accounts/contexts):

```javascript
let fr;
test.beforeAll(async () => {
  const run = newRunId();
  const account = { email: `french-${run}@e2e.local`, ..., ip: clientIp(run, 'french'), slug: `french-${run}` };
  const client = apiClient(BASE_URL, { name: 'french', ip: account.ip });
  /* signup + dedicated workspace, explicit status checks */
});
```

**Settings navigation + chunk wait pattern** (lines 144-147) — exactly what `openSettings(page, { tab: 'language' })` lifts:

```javascript
await page.getByRole('button', { name: 'Settings' }).click();
await page.getByRole('button', { name: 'Language', exact: true }).click();
await expect(page.getByRole('heading', { name: 'Language', level: 1 })).toBeVisible();
```

**Drift region to repair** (lines 166-182) — the sleep cluster D-08 replaces. Keep the *assertion* (loop safety), replace the *sleeps* (start the MutationObserver BEFORE the click, arm `waitForResponse`, assert French re-render, then `expect.poll` on `window.__mutations === 0`):

```javascript
await page.waitForTimeout(300);                    // ← remove (settle)
await page.evaluate(() => { window.__mutations = 0; new MutationObserver(...).observe(document.getElementById('app'), {...}); });
const before = await page.evaluate(() => document.getElementById('app').innerHTML);
await page.waitForTimeout(500);                    // ← bounded measurement — restructure with expect.poll
const after = await page.evaluate(() => document.getElementById('app').innerHTML);
expect(after, 'the rendered interface drifts after the switch').toBe(before);
await page.waitForTimeout(1000);                   // ← remove (poll instead)
expect(await page.evaluate(() => window.__mutations), '... (render loop)').toBe(0);
```

⚠️ Pitfall 3: a mechanical "delete all waitForTimeout" sweep here **weakens a real assertion**. The loop-safety proof must survive; only the *wait strategy* changes.

**Re-render assertion anchors that must survive** (lines 161-163):

```javascript
await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('fr');
await expect(page.getByRole('heading', { name: 'Langue', level: 1 })).toBeVisible();
await expect(page.getByRole('button', { name: 'Projets' }).first()).toBeVisible();
```

---

### `e2e/locale.spec.mjs` (e2e spec, event-driven) — :122 spec

**Analog:** `e2e/demo-locale.spec.mjs:77-108` (green, post-Phase-56) + the french-overflow excerpts above (its drift region :122-177 is line-for-line the same shape: Settings click → Language tab → trigger click → option → PATCH wait → `documentElement.lang` poll → loop-safety sleeps :154-162 → reload persistence).

**Difference from french-overflow:** this spec also covers sign-out/sign-in locale fallback (:170-177, `'Menu du compte'` / `'Se déconnecter'` in French after the switch) — do not touch that part beyond the wait repair.

---

### `e2e/playwright.config.mjs` (config — LOCKED, verify-only)

**No edit.** The webServer block must remain byte-identical (RESEARCH.md verified `:32-40`):

```javascript
webServer: {
  command: 'node e2e/server.mjs',
  cwd: ROOT,
  url: `${BASE_URL}/api/health`,
  reuseExistingServer: process.env.E2E_REUSE_SERVER === 'true',
  timeout: 120_000,
  gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
},
```

Plan 1's only config interaction is the reproduce-first task (`npm run build && npm run e2e`, grep for ECONNREFUSED emitter) — Pitfall 1: ECONNREFUSED lines *before* the first test = Playwright's own probe noise (not a code bug); lines mid-run = investigate before touching anything.

---

## Shared Patterns

### Helper error style
**Source:** `e2e/helpers/setup.mjs:81-92`
**Apply to:** D-02 guard, `openSettings`, `selectLanguage`
Named step + concrete status/detail in every thrown Error; never bare `throw e`.

### Provenance comment contract
**Source:** `e2e/helpers/setup.mjs:1-13, 94-98` and `e2e/demo-locale.spec.mjs:90-94`
**Apply to:** every new helper and every rewritten spec block
Comments pin the D-decision (D-01…D-08) and the app-side source (`src/ui/select.js`, `src/shell/layout.js:67`).

### Label-from-DOM, never transcribed
**Source:** `e2e/demo-locale.spec.mjs:96-98`
**Apply to:** `selectLanguage(page, lang)` — resolve the option label from `select[data-in="langSel"] option` (or locale registry) instead of hard-coding `Français`; survives catalogue edits and i18n gate.

### One browser context per account, run-unique clientIp
**Source:** `e2e/french-overflow.spec.mjs:18-42`
**Apply to:** all 9 rewritten specs — never share accounts/contexts across specs (Pitfall 5).

### Web-first waits only
**Source:** suite-wide (`expect.poll` at french-overflow:161, `waitForResponse` at :156)
**Apply to:** everywhere the phase touches — no `waitForTimeout` settles, no `networkidle`, no timeout/retry inflation (locked anti-features).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| — | — | — | None. Every modified file has an exact in-repo analog; the config is locked and needs none. |

## Metadata

**Analog search scope:** `e2e/**` (all tracked specs, helpers, config) + app contract sources (`src/ui/select.js`, `src/shell/layout.js`, `src/pages/settings.js` per RESEARCH)
**Files scanned:** 8 read directly this session; all named paths verified git-tracked via `git ls-files e2e/`
**Pattern extraction date:** 2026-11-14
