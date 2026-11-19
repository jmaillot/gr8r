# Phase 74: Service Worker Verification & Milestone Acceptance - Pattern Map

**Mapped:** 2026-11-18
**Files analyzed:** 3 (new/modified artifacts this phase)
**Analogs found:** 3 / 3

**Zero-code-change constraint:** `public/sw.js`, `server.js`, `src/main.js`, `src/core/push.js`,
and the Phase 73 banner module are read-only this phase. All excerpts below from those files
are PIN TARGETS (bytes to assert against), never edit targets.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `test/sw-contract.test.mjs` | test (static contract, node:test) | transform (file-as-text → assertions) | `test/manifest-contract.test.mjs` | exact |
| `docs/DEPLOY.md` §18 (append) | docs (numbered operator section) | — | `docs/DEPLOY.md` §§16–17 (same file) | exact (in-file convention) |
| `.planning/phases/74-.../74-UAT.md` | process artifact (UAT record) | — | `.planning/phases/73-install-hint-banner/73-UAT.md` | exact |

No production files are created or modified. All three artifacts are tracked-repo paths
(git-tracked verified for every analog).

## Pattern Assignments

### `test/sw-contract.test.mjs` (test, static contract)

**Analog:** `test/manifest-contract.test.mjs` (Phase 72, 131 lines — copy this structure wholesale)

**Header comment + imports pattern** (manifest-contract.test.mjs lines 1–29):
```js
/* =====================================================================
   test: manifest-contract — the static half of the D-13 double pinning
   ... (explain WHAT is pinned, WHY, and which decisions/IDs apply)
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..');
const source = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
```
For the hash pin, add `import { createHash } from 'node:crypto';` (RESEARCH.md Pattern 1).

**describe/test organization** (lines 31–61): group pins under `describe` blocks keyed to
decision IDs, each `test` with a human-readable name and a trailing assertion message:
```js
describe('server.js manifest serving contract (D-12)', () => {
  const server = source('server.js');

  test('cacheControl() no-cache branch includes manifest.webmanifest alongside index.html and sw.js', () => {
    const fn = server.slice(server.indexOf('function cacheControl('), server.indexOf('function serveStatic('));
    assert.ok(fn.includes("path.basename(file) === 'sw.js'"), 'no-cache branch must keep sw.js');
  });
});
```
This last excerpt is the model for the D-01-recommended **cross-check** that `server.js` still
no-caches `sw.js` (substring assertion, not ownership — the full cacheControl contract stays in
manifest-contract.test.mjs).

**Substring / count / JSON assertion styles** to reuse (lines 108–129):
```js
// exact-substring pin:
assert.ok(html.includes('<link rel="manifest" href="/manifest.webmanifest" />'));
// occurrence-count pin (call-site counting — D-04 uses this on navigator.serviceWorker.register):
assert.equal((html.match(/rel="manifest"/g) || []).length, 1, 'exactly one manifest link');
// JSON field pin (manifest-scope↔SW-scope agreement — D-01):
assert.equal(manifest.scope, '/');
```

**Forbidden-token style** — from `test/browser-push.test.mjs:134` (D-04 stylistic model; do NOT
duplicate the whole browser-push contract, RESEARCH.md Pitfall 4):
```js
assert.ok(!/\b(fetch|install|activate|import)\b/.test(sw), 'sw.js must carry no fetch/install/activate/import token (T-48-02)');
```
Source-as-text helper in browser-push (lines 98–99) matches manifest-contract's — one `source()`
closure is the repo convention.

**Concrete pin targets (verbatim, verified this session — quote these bytes):**

`public/sw.js` handlers (sw.js:10, 29):
```js
self.addEventListener('notificationclick', (e) => {
self.addEventListener('push', (e) => {
```

SHA-256 of `public/sw.js`: `7a700dd8cc70ccb20c444707ac0d86871f9abe24999a40497fc22e5a55cc5b8d`
(RESEARCH.md Pitfall 3: re-derive at plan AND authoring time with
`node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('public/sw.js')).digest('hex')"`)

`src/core/push.js:161-163` — registration call site + api.enabled gate:
```js
export const registerSw = () => {
  if (!('serviceWorker' in navigator) || !api.enabled) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
};
```

`src/main.js:134-137` — boot path 1:
```js
const registerSw = () => import('./core/push.js').then(m => m.registerSw()).catch(() => {});
addEventListener('load', registerSw);
```

`src/main.js:323` — boot path 2:
```js
  registerSw(); // 59-UAT fix: register after api.enabled can be true (idempotent; no-ops in demo mode)
```

`public/manifest.webmanifest` agreement fields (Pattern 3, RESEARCH.md):
```js
const manifest = JSON.parse(source('public/manifest.webmanifest'));
assert.equal(manifest.scope, '/');
assert.equal(manifest.start_url, '/');
```

**Critical pitfall (RESEARCH.md Pitfall 1):** count the exact expression
`navigator\.serviceWorker\.register` (repo-wide count = 1, only in `src/core/push.js`) —
never the name `registerSw`, which also appears as a local wrapper in `src/main.js` (≥3 hits).
**Pitfall 2:** substring pins only on src files; line numbers drift (they are doc anchors here,
not assertion targets).

---

### `docs/DEPLOY.md` §18 append (docs, numbered operator section)

**Analog:** the same file's newest sections — `## 16. Browser push: VAPID key custody (Phase 59)` (line 1304) and `## 17. Outbound webhooks (Microsoft Teams)` (line 1368); file is 1397 lines, append `## 18. Installable app (PWA)` at end of file.

**Numbered-section + context-annotated heading convention** (line 1304, 1368):
```markdown
## 16. Browser push: VAPID key custody (Phase 59)
...
## 17. Outbound webhooks (Microsoft Teams)
```
→ Headings are plain `## N. Title`, sometimes with a `(Phase NN)` annotation. §18 = `## 18. Installable app (PWA)`.

**Prose style** (section 17 excerpt, lines 1370+): declarative operator prose, bold for the one
load-bearing claim, bulleted "Operational notes" list:
```markdown
Per-project outbound webhooks ... deliver 8 event types to **Microsoft Teams incoming webhooks
— that is the only supported target right now.** ...

Operational notes for the operator:

- No environment configuration is required. ...
- URLs are SSRF-guarded: https-only, ...
```
§18 must be self-contained prose covering: root-domain-only deployment constraint, iOS
limitations (no `beforeinstallprompt`, manual Share → Add to Home Screen), standalone
no-back-button stance, strictly-online/no-caching decision, short "why no custom SW" note,
and one Lighthouse troubleshooting paragraph (D-02). Do NOT overstate support (Pitfall 6):
Chromium desktop/Android = prompted install; iOS = manual A2HS, no back button; Firefox
desktop does not fire `beforeinstallprompt`. Do not touch §16 (VAPID custody) or any other section — append-only.

---

### `.planning/phases/74-.../74-UAT.md` (process artifact, UAT record)

**Analog:** `.planning/phases/73-install-hint-banner/73-UAT.md` (committed, 28 lines — copy the format exactly)

**Frontmatter pattern** (73-UAT.md lines 1–7):
```yaml
---
status: complete
phase: 73-install-hint-banner
source: [73-VERIFICATION.md]
started: 2026-11-18T23:40:00Z
updated: 2026-11-18T23:55:00Z
---
```
→ 74-UAT.md: `phase: 74-service-worker-verification-milestone-acceptance`, `source: [74-VERIFICATION.md]`.

**Numbered-test pattern** (lines 9–17) — `## Current Test` → `## Tests` → `### N. Title` blocks
with `expected:` / `result:` lines:
```markdown
## Current Test

[testing complete]

## Tests

### 1. Real Chromium install flow (CR-01 closure)
expected: Cold-load on an install-eligible Chromium desktop/Android profile; the banner appears within ~2 s of load ...; clicking Install triggers the native prompt.
result: pass

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
```
D-03: four numbered tests — (1) desktop Chrome install + standalone launch, (2) Android
Chrome install + standalone launch, (3) iOS Safari honest manual-install path, (4) push
notifications still fire. Evidence = short result line + optional screenshot per test.
During execution, pending human tests are recorded as `human_needed` items (Phase 73 pattern)
until the owner runs them; status starts accordingly, not `complete`.

## Shared Patterns

### Source-as-text contract testing
**Source:** `test/manifest-contract.test.mjs` lines 23–29 (imports + `source()` helper); same
helper re-declared in `test/browser-push.test.mjs` lines 98–99.
**Apply to:** `test/sw-contract.test.mjs` (all pins are file-as-text; no browser, no src imports).
```js
const ROOT = path.join(import.meta.dirname, '..');
const source = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
```

### Decision-ID traceability
**Source:** `test/manifest-contract.test.mjs` header + describe names (`D-12`, `D-08/D-09`),
and `73-UAT.md` test titles referencing `CR-01`.
**Apply to:** sw-contract.test.mjs describe/test names reference D-01/D-04 and PWA-03;
74-UAT.md tests reference the roadmap success criteria.

### Zero-dependency verification
**Source:** `package.json` `"test": "node --test --test-concurrency=2 test/*.test.mjs"` — any
`test/*.test.mjs` file is auto-discovered; only built-ins (`node:test`, `node:assert/strict`,
`node:fs`, `node:path`, `node:crypto`).
**Apply to:** sw-contract.test.mjs only. Quick run: `node --test test/sw-contract.test.mjs`;
phase gate: full `npm test` (baseline 1737 pass / 1750, 13 pre-existing failures accepted).

### UAT evidence commitment
**Source:** `.planning/phases/73-install-hint-banner/73-UAT.md` (committed in-repo, `human_needed` persistence).
**Apply to:** `74-UAT.md` — evidence lines and screenshots live in the phase directory, digested later by VERIFICATION.

## No Analog Found

None — all three artifacts have exact in-repo analogs.

## Metadata

**Analog search scope:** `test/*.test.mjs`, `docs/DEPLOY.md`, `.planning/phases/73-install-hint-banner/`
**Files scanned:** 4 (manifest-contract.test.mjs, browser-push.test.mjs, DEPLOY.md §§16–17, 73-UAT.md) — all `git ls-files`-verified as tracked
**Pattern extraction date:** 2026-11-18
