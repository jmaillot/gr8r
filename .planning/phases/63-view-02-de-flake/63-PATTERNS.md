# Phase 63: VIEW-02 De-Flake - Pattern Map

**Mapped:** 2026-11-14
**Files analyzed:** 5 (2 modified, 3 conditional/new)
**Analogs found:** 4 / 5 (the triage artifact has no code analog by design — its format is fully specified by D-05 in 63-CONTEXT.md)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `e2e/saved-views.spec.mjs` (modify) | test (e2e spec) | event-driven (UI actions → debounced network writes) | self + `e2e/helpers/setup.mjs` `selectLanguage()` (waitForResponse convention) | exact |
| `e2e/helpers/setup.mjs` (modify, only if triage proves a shared need — 63-RESEARCH Pattern 1 says scope to VIEW-02 otherwise) | test helper (navigation + waits) | request-response | itself — `selectLanguage()` lines 107-123 | self |
| `.planning/phases/63-view-02-de-flake/63-TRIAGE.md` (new) | doc (evidence artifact) | n/a | none — format mandated by D-05 (hypothesis × evidence table, trace excerpts, exact commands, verdict) | none |
| `src/core/viewSync.js` (modify, conditional on D-03 app bug proven) | service (client write-through, event-driven) | pub-sub/debounced network write | self + debounce analogs in repo (see note) | self |
| `test/viewSync-debounce.test.mjs` or extension of `test/saved-views.test.mjs` (new, conditional) | test (unit regression) | CRUD against real server / in-process | `test/saved-views.test.mjs` | role-match (exact domain) |

All named analog paths verified git-tracked (`git ls-files`, this session).

## Pattern Assignments

### `e2e/saved-views.spec.mjs` (test spec, event-driven)

**Analog:** `e2e/helpers/setup.mjs` (Phase 62 D-08 awaited-signal convention) + the file's own existing structure.

**Import/header pattern** (spec lines 15-21 — keep as-is):
```js
import { test, expect } from '@playwright/test';
import { BASE_URL, OWNER, apiClient, clientIp, newRunId } from './helpers/setup.mjs';
import en from '../src/locales/en.json' with { type: 'json' };

const run = newRunId();
const VIEW_NAME = `Runbook ${run}`;
```
⚠️ **Pitfall 3 (63-RESEARCH):** `newRunId()` runs once per module load — triage must confirm `--repeat-each` yields a unique `VIEW_NAME` per repetition.

**The code being replaced — coordinate-click dismissal** (spec lines 50-59, `setColumn`; same pattern repeated inline at lines 116-117):
```js
async function setColumn(page, label, checked) {
  await page.getByRole('button', { name: fmt('act.columns') }).click();
  const box = page.locator('.pop.floating label').filter({ hasText: label }).getByRole('checkbox');
  if ((await box.isChecked()) !== checked) await box.click();
  await page.mouse.click(5, 400);                       // ← replace
  await expect(page.locator('.pop.floating')).toHaveCount(0);  // ← KEEP as completion proof
}
```

**Replacement pattern — semantic dismissal** (analog: `src/actions/keyboard.js:162-166` Escape → `closePop()`, `src/overlays/popovers.js:87-92` synchronous `render()`):
```js
await page.keyboard.press('Escape');
await expect(page.locator('.pop.floating')).toHaveCount(0);
```
Keep the `toHaveCount(0)` assertion — it is the real completion signal (a swallowed Escape, e.g. when the palette is open, fails fast visibly — RESEARCH Pitfall 4).

**waitForResponse pattern** (analog `e2e/helpers/setup.mjs:107-123`, verbatim convention):
```js
export async function selectLanguage(page, lang) {
  const label = await page.evaluate(/* ... resolve label from DOM ... */);
  const saved = page.waitForResponse(r => r.url().endsWith('/api/auth/me') && r.request().method() === 'PATCH');
  await page.locator('.set-body .select-btn').click();
  await page.getByRole('option', { name: label }).click();
  return saved;
}
```
Phase-63 instantiation (live-PUT wait — distinguish from the named PUT by `postData` having **no** `name` field, per `src/core/viewSync.js:12-13`):
```js
const livePut = page.waitForResponse(
  r => r.url().endsWith('/api/me/views')
    && r.request().method() === 'PUT'
    && !JSON.parse(r.request().postData() || '{}').name
);
await page.keyboard.press('Escape');
await expect(page.locator('.pop.floating')).toHaveCount(0);
await livePut;
```
**Arming subtlety (RESEARCH Pattern 1):** arm AFTER the FINAL re-arming toggle — the 450 ms trailing debounce (`clearTimeout` + `setTimeout` in `viewSync.js:25-34`) means a waiter armed before a later toggle hangs past timeout or binds a stale PUT. Never place the wait where an earlier toggle can re-arm the timer past it.

**Error handling pattern** (spec lines 84-96 — spec-side throws with context, already the convention):
```js
if (login.status !== 200) throw new Error(`owner login failed with HTTP ${login.status}`);
if (!saved) throw new Error(`named view "${VIEW_NAME}" not in saved_views rows: ${JSON.stringify(got.data.views.named)}`);
```
Assertions strengthened, never weakened (standing constraint) — new waits ADD completion signals; the kept `toHaveCount(0)` assertions stay.

**Comment provenance pattern** (spec lines 48-49, 81-82): every changed line gets a `/* ... D-xx / Phase-63 SC-3 ... */` comment citing the decision, same as Phase 62 lines.

---

### `e2e/helpers/setup.mjs` (test helper — MODIFY ONLY IF SHARED-NEED PROVEN)

**Analog:** itself. The convention to extend lives at lines 107-123 (`selectLanguage`, quoted above). 63-RESEARCH Pattern 1: *"Do NOT put the wait in a global helper that changes other specs' behavior unless triage proves they need it; this phase scopes to VIEW-02."* Default: keep the live-PUT wait spec-side.

Helper conventions if a `waitForViewSync(page)` helper is added:
- Helpers own navigation and waits only; assertions stay spec-side (file header lines 80-82, D-04)
- Auto-retrying `expect()` or `waitForResponse`, never sleep (D-05)
- Provenance comment per helper (lines 70-83 block style)

---

### `src/core/viewSync.js` (service — CONDITIONAL app fix under D-03)

**Analog:** itself. Existing debounce (lines 22-35) — the suspect:
```js
let _viewsT;
export function persistLiveView(key) {
  if (!key) return;
  clearTimeout(_viewsT);
  _viewsT = setTimeout(async () => {
    const wsId = api.enabled ? api.workspace?.id : D().ws.url;
    const blob = sanitizeViewBlob(S.views[key]);
    if (!api.enabled) return setLocalSavedViews(wsId, key, blob);
    const r = await putViews(wsId, key, blob);
    if (r.status === 401) {
      window.dispatchEvent(new CustomEvent('projects:save-error', { detail: { status: 401, error: r.error } }));
    }
  }, 450);
}
```
Discipline to preserve (file header lines 15-21): failures silent except 401, mirroring `hydrateNotifPrefs`; a failed view save must never block the UI. **Any fix must not change this contract** — e.g. a "don't drop the last-armed write" fix keeps silent-failure semantics.

**Re-arm suspect** (`src/views/savedViewsUi.js:128`, inside `applyTableView`): `persistLiveView` called after applying a named view — a subsequent toggle's `clearTimeout` cancels it silently (H1's silent-drop variant; triage decides bug-vs-by-design).

Fire-and-forget caller pattern (`src/actions/actions.js:1402`, `toggleCol2`): dynamic `import('viewSync.js')` then `persistLiveView(key)` — lazy-chunk discipline (DELIV-02 500 kB gate) must survive any fix; do not convert to a static import.

---

### Unit regression test (conditional — `test/`)

**Analog:** `test/saved-views.test.mjs` (exact domain: `/api/me/views` rows on a real server).

**Structure pattern** (lines 8-14, 39-60):
```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { signup, startServer, withDb } from './helpers/server.mjs';
import { NAMED_VIEW_BLOB_MAX_BYTES, NAMED_VIEW_KEYS, NAMED_VIEW_MAX, VIEW_BLOB_KEYS } from '../src/core/savedViews.js';
// ...
let server; let tempDir;
before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-named-views-'));
  server = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'projects-named-views-key' } });
});
```
Conventions: `node:assert/strict`, real server via `startServer` + temp dir, `withDb(server.dbPath, db => ...)` for direct row inspection, `owner.put('/api/me/views', ...)` style request helpers. A pure-debounce regression (last-armed write never dropped) that doesn't need the server should use plain `node:test` + fake/manual timers instead — `viewSync.js` has no server dependency for `persistLiveView`'s scheduling itself (only `api.enabled` branches at fire time).

**Note:** `viewSync.js` imports browser-side modules (`store.js`, `api.js`) — check how `test/views-columns.test.mjs` / `test/palette-filter.test.mjs` stub or load client modules before writing a unit test that imports it; the e2e pin inside the stabilized spec is the fallback placement per 63-RESEARCH §Code Examples.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `63-TRIAGE.md` | doc (evidence) | n/a | Format fully prescribed by D-05 (hypothesis × evidence table, trace excerpts, exact run commands, verdict); no existing triage artifact in repo to copy. Build from the D-05 spec directly. |

## Shared Patterns

### Awaited network completion (Phase 62 D-08)
**Source:** `e2e/helpers/setup.mjs:119-123`
**Apply to:** every new/changed wait in the spec — arm `waitForResponse` with a URL+method(+body) predicate immediately before the trigger action, await it after; never sleep, never `networkidle`.
```js
const saved = page.waitForResponse(r => r.url().endsWith('/api/auth/me') && r.request().method() === 'PATCH');
await /* trigger */;
return saved;
```

### Semantic dismissal over coordinate clicks
**Source:** `src/actions/keyboard.js:162-166` + `src/overlays/popovers.js:87-92`
**Apply to:** all three `mouse.click(5,400)` sites in `e2e/saved-views.spec.mjs` (lines 57, 116) — `Escape` + kept `toHaveCount(0)` assertion.

### Run-unique state through the real API
**Source:** `e2e/saved-views.spec.mjs:19-21` (`newRunId()` → `VIEW_NAME`, `clientIp(run, tag)`)
**Apply to:** any new fixture/state the triage fix introduces — no fixed names, no isolation (D-04).

### Decision provenance comments
**Source:** `e2e/helpers/setup.mjs:15-21`, spec lines 48-49/81-82
**Apply to:** every changed line in spec, helper, and app files — `/* ... Phase 63 D-xx / SC-n ... */`.

### Command form (standing trap)
**Source:** 63-RESEARCH Standard Stack + STATE.md
**Apply to:** all triage/proof invocations — always `npm run e2e -- <spec> [flags]`, never bare `npx playwright test`; clean stale `test-results/` between rounds.
```bash
npm run e2e -- e2e/saved-views.spec.mjs --repeat-each=10 --workers=1 --retries=0 --trace on
```

## Metadata

**Analog search scope:** `e2e/`, `src/core/`, `src/actions/`, `src/views/`, `src/overlays/`, `test/`
**Files read this session:** `e2e/saved-views.spec.mjs` (full), `src/core/viewSync.js` (full), `e2e/helpers/setup.mjs` (1-160), `test/saved-views.test.mjs` (1-60); tracked-status verified via `git ls-files`
**Pattern extraction date:** 2026-11-14
