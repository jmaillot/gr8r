# Phase 56: Delivery Infrastructure - Pattern Map

**Mapped:** 2026-11-12
**Files analyzed:** 13
**Analogs found:** 13 / 13

All analog paths verified git-tracked (`git ls-files` non-empty). No AGENTS.md at repo root.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `test/e2e-server-guard.test.mjs` (NEW) | test | spawn/exit-code | `test/build-locales.test.mjs` (spawnSync harness) | role-match |
| `test/build-chunk-size.test.mjs` (NEW) | test | batch/build-output | `test/build-locales.test.mjs` | exact |
| `test/locale-registry-fixture.test.mjs` (NEW) | test | fixture inject + build | `test/build-locales.test.mjs` + `scripts/icons.mjs` baseline pattern | role-match |
| `e2e/server.mjs` (MOD, guard) | config/harness | file-I/O + fail-closed exit | own existing check at `e2e/server.mjs:19-24` | exact (self) |
| `vite.config.js` (MOD, manifest + derived set) | config | build | `vite.config.js` lucideSubset + `scripts/icons.mjs` shared-scan shape | exact |
| `src/core/i18n.js` (MOD, derived LOCALES) | core module | transform (glob keys → registry) | `scripts/icons.mjs` derived-scan precedent + own loaders at i18n.js:22-27 | exact |
| `src/lib/qr.js` (MOD, dynamic import) | utility | async transform | none (first dynamic import in src/) — see Shared Patterns | no-analog (mechanism in RESEARCH) |
| `src/pages/settings.js` (MOD, async QR render) | component | request-response (async render) | own staged-render shape at settings.js:667-709 | exact (self) |
| `src/actions/actions.js` (MOD, lazy seed) | controller/action table | event-driven | own seed() call sites :3049, :3289 | exact (self) |
| `src/main.js` (MOD, drop seed import) | entry | — | own import block main.js:5-57 | trivial |
| `scripts/i18n-scan.mjs` (MOD, LOCALE_NAMES sync) | script/gate | static scan | own `LOCALE_NAMES` at :182 | exact (self) |
| `package.json` (maybe MOD, stamp script) | config | — | existing script conventions (`prebuild` → `build` chain) | trivial |
| (discretion) shared `scripts/locales.mjs` | script/shared-scan | transform | `scripts/icons.mjs` (whole file) | exact |

## Pattern Assignments

### `test/build-chunk-size.test.mjs` (test, build-output)

**Analog:** `test/build-locales.test.mjs` — the complete, working real-build harness.

**Build harness** (test/build-locales.test.mjs:26-35, verbatim):
```js
function build(locales) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-build-'));
  const result = spawnSync(process.execPath, [VITE_BIN, 'build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: ROOT,
    env: { ...process.env, LOCALES: locales },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `the LOCALES=${locales} build failed\n${result.stdout || ''}\n${result.stderr || ''}`);
  return outDir;
}
```

**Asset listing with sizes** (test/build-locales.test.mjs:38-44, verbatim) — the 500 kB gate reads these (add `fs.statSync` for byte size; filter `.js` only, per RESEARCH Pitfall 7):
```js
function assetsOf(outDir) {
  const dir = path.join(outDir, 'assets');
  return fs
    .readdirSync(dir)
    .sort()
    .map(name => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') }));
}
```

**Imports/header comment convention** (test/build-locales.test.mjs:10-18):
```js
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { ROOT } from './helpers/server.mjs';

const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
```
Copy: `before()` runs the build(s), `after()` rmSync-cleans temp dirs (:146-154); assertions anchored to observable rules, each test message explains WHY.

**Gate rule:** any emitted `.js` asset under `assets/` with size > 512000 bytes fails. Measured baseline: entry ~627 kB, fr chunk ~97 kB (scout, CONTEXT specifics).

---

### `test/e2e-server-guard.test.mjs` (test, spawn/exit-code)

**Analog:** `e2e/server.mjs` existing fail-closed branch (the behavior under test) + build-locales spawnSync harness (the test mechanics).

**Behavior under test** (e2e/server.mjs:19-24, verbatim — the new staleness check must mirror this shape exactly, including dataDir cleanup):
```js
/* The suite serves the built app; a missing build is a setup error, not a test failure. */
if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  console.error('e2e: dist/index.html is missing — run `npm run build` before `npm run e2e`.');
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(1);
}
```
Note: `mkdtempSync(dataDir)` at :17 runs BEFORE the check — the guard must `rmSync` before exiting (Pitfall 5). Message style: `e2e: <diagnosis> — run \`npm run build\`.` names the fix.

**Test shape:** spawn `node e2e/server.mjs` with `E2E_PORT` free against (a) missing dist → exit 1; (b) doctored stale dist (real dist with manifest hash changed) → exit 1 + message on stderr; (c) fresh dist → stays up / serves (kill after). Use `spawnSync` with a short timeout or spawn+kill; assert `status === 1` and stderr contains the actionable message. Env hardening precedent: server.mjs:31-33 (`DB_PATH` forced so an exported var cannot leak in) — tests should likewise pin env.

---

### `test/locale-registry-fixture.test.mjs` (test, fixture inject + build)

**Analog:** `test/build-locales.test.mjs` harness + the icons-baseline fixture mechanics (test/fixtures/icons-baseline.json read at :21, asserted at :208-215).

**Fixture mechanics (from RESEARCH, verified):** `import.meta.glob` resolves at build time — physically copy `src/locales/xx.json` in `before()`, build with `LOCALES=en,fr,xx` AND a default build (proves D-09 auto-ship), assert selector/loader/chunk behavior, delete in `after()` with try/finally (Pitfall 6: a left-behind fixture poisons later builds and the scan).

**Gate proof:** `scripts/i18n-scan.mjs` exports `main(argv, options)` (:1605) — call `main(['--report'])` from the test and assert zero findings with the fixture present (D-08 fourth clause). The scan reads exactly `src/locales/en.json`/`fr.json` (:1609-1612), so xx keys never enter parity/dead-key checks — only the display-name exclusion set matters (see Pitfall 4).

**Plain-Node registry check:** import `src/core/i18n.js` via `pathToFileURL` (precedent: build-locales.test.mjs:225) and assert the derived registry still contains `en` (and ideally fr) with `loaders = {}` — Pitfall 3 guard.

---

### `e2e/server.mjs` — staleness guard (MOD)

**Analog:** itself — extend the check at :19-24. New block slots directly below it, same fail-closed triple: `console.error` with the fix named → `fs.rmSync(dataDir, …)` → `process.exit(1)`.

Detection (D-04, hash-based): enable `build.manifest: true` in vite.config.js; at server boot, sha256 the content of `dist/.vite/manifest.json` and compare against the stamp recorded at build time (stamp file in dist/ or manifest self-hash — plan-time discretion). Hash via `node:crypto` (server.mjs already imports crypto lazily at :53: `(await import('node:crypto')).randomBytes(32)`).

---

### `vite.config.js` — manifest + derived locale set (MOD)

**Analog:** its own `lucideSubset()` plugin + `scripts/icons.mjs` shared-scan shape.

**Shared-scan shape** (vite.config.js:18-21 comment, verbatim — this is the doc contract the derived-locale module must replicate):
```js
/* `virtual:icons` exports only the Lucide icons the source actually names, as inline SVG markup,
   so the bundle carries ~170 icons instead of the full set. The scan is the shared one in
   scripts/icons.mjs, so the build plugin and the test suite can never diverge — and the scan
   lives outside src/, so it can never read itself and add an icon to the bundle. */
```

**Hardcoded default to replace** (vite.config.js:10-16, verbatim):
```js
const BUILD_LOCALES = new Set([
  BASE_LOCALE,
  ...(process.env.LOCALES || 'en,fr')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
]);
```
D-09: replace `'en,fr'` default with a `fs.readdirSync('src/locales')` derivation (config runs in Node — fs available; icons.mjs walk at scripts/icons.mjs:16-20 is the readdir pattern). `LOCALES=en` env override stays. `localeSubset()` regex at :42-58 is untouched — only its set source changes.

**Manifest:** add `build: { manifest: true }` to the `defineConfig({ plugins: […], server: {…} })` object at :60-68. Manifest lands at `dist/.vite/manifest.json` (Vite 6.4.4 default fileName, RESEARCH-verified).

---

### `scripts/locales.mjs` (NEW, discretion — shared derived-locale module)

**Analog:** `scripts/icons.mjs` (whole file, 45 lines). Copy its shape exactly:

**Header contract** (scripts/icons.mjs:1-5):
```js
/* The shared Lucide icon scan.
   It lives outside src/ so the lucideSubset() walk in vite.config.js never reads it: the
   build plugin and the test suite share one implementation, and nothing here can add an
   icon to the bundle. The name scan and the markup serialisation reproduce the plugin's
   own output byte for byte. */
```

**Core export** (scripts/icons.mjs:23-29) — derived scan as a single pure function, sorted, dedup'd:
```js
export function lucideIconNames(srcDir = 'src') {
  const text = walk(path.resolve(srcDir))
    .map(f => fs.readFileSync(f, 'utf8'))
    .join('\n');
  const tokens = [...text.matchAll(/['"`]([a-z][a-z0-9]*(?:-[a-z0-9]+)*)['"`]/g)].map(m => m[1]);
  return [...new Set(tokens)].filter(n => lucide[pascal(n)]).sort();
}
```
`scripts/locales.mjs` should export: `localeCodes(srcDir)` (fs.readdirSync `src/locales`, filter `.json`, sorted) and `LOCALE_NAME_MAP` (known-language native names; unknown code → raw code). Consumers: vite.config.js (BUILD_LOCALES default), scripts/i18n-scan.mjs (LOCALE_NAMES exclusion), tests. Note i18n.js's browser-side registry derives codes from `Object.keys(loaders)` — it cannot import a fs module; the name map is the piece it shares (keep it scan-friendly plain data).

---

### `src/core/i18n.js` — derived LOCALES registry (MOD)

**Analog:** itself. Only lines 9-12 change in spirit; everything below stays.

**What to replace** (src/core/i18n.js:9-12, verbatim):
```js
export const LOCALES = Object.freeze([
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
]);
```

**What must survive untouched** — the invariant D-08/CONTEXT protects:
```js
// :6 — static base import, inlined in entry chunk (NEVER convert):
import en from '../locales/en.json' with { type: 'json' };
// :22-27 — the glob (derivation source):
let loaders = {};
try {
  loaders = import.meta.glob(['../locales/*.json', '!../locales/en.json']);
} catch {
  loaders = {};
}
// :36 — top-level registration, tree-shake-proof:
registerCatalogue(BASE_LOCALE, en);
```

**Derivation rule (Pitfall 3):** derived codes = `Object.keys(loaders)` mapped through the glob key → code regex ∪ `{BASE_LOCALE}`. In plain Node `loaders = {}`, so without the BASE_LOCALE union the registry is empty and `LOCALES.some(l => l.code === …)` (:49, :103, :123, :195) fails even for 'en' — existing catalogue tests break. Unknown language → name falls back to the raw code (D-07). Freeze the result like today.

**Style to preserve:** module-level frozen singletons, leaf-module discipline (imports nothing from the app, header comment :1-5), degrade-don't-throw in every path.

---

### `src/lib/qr.js` — dynamic import wrapper (MOD)

**Analog:** none — zero dynamic imports exist in src/ today (scout-verified). Mechanism comes from RESEARCH Pattern 1; the module's role stays (thin wrapper, vendored file untouched). Shape:
```js
let modPromise = null;
function loadQrcode() {
  if (!modPromise) modPromise = import('./vendor/qrcode.js');
  return modPromise;
}
```
Retry semantics (D-03): on rejection, `modPromise = null` so the next click retries. `renderQrSvg` becomes async (`await loadQrcode()` first). Keep header comments D-15/D-16 verbatim — the vendored-file-only rule is unchanged.

---

### `src/pages/settings.js` — async QR render (MOD)

**Analog:** itself — the two sync template-interpolation sites that must become async (RESEARCH-discovered discrepancy: QR lives here, NOT in modals.js as CONTEXT hinted):

**Site 1** (settings.js:669, inside the `addVerify` stage template):
```js
<div class="field"><span class="label">${t('settings.tfa.scan')} — ${esc(S.ui.tfaLabel || '')}</span><div style="margin-top:8px">${renderQrSvg(S.ui.tfaOtpauth || '')}</div><span class="hint">${t('settings.tfa.appHint')}</span></div>
```
**Site 2** (settings.js:697, in the `verify` stage — note it already computes into a local):
```js
const qr = renderQrSvg(S.ui.tfaOtpauth || '');
```
A Promise interpolated into these templates renders "[object Promise]" (Pitfall 1). Fix pattern: render a placeholder/spinner element, then fill it after `await renderQrSvg(...)` — or await the module before rendering the panel. D-03 anchors the spinner at the initiating click (the action that populates `S.ui.tfaOtpauth`), with error toast on failure (`toast(msg, { kind: 'err' })` — see toast call convention below).

---

### `src/actions/actions.js` — lazy seed (MOD)

**Analog:** its own two seed sites, plus its established toast/error conventions.

**Site 1** (actions.js:3048-3056, inside `A.resetDemo`'s confirmDlg run):
```js
run: () => {
  S.data = seed();
  S.views = {};
  ...
  toast(t('toast.demoRestored'));
},
```
**Site 2** (actions.js:3288-3295, inside `A.delWorkspace`'s confirmDlg run):
```js
run: () => {
  S.data = seed();
  S.views = {};
  save();
  ...
},
```
Both `run:` callbacks are sync — either make `run` async (`run: async () => { const { seed } = await import('../data/seed.js'); S.data = seed(); … }`) or await inside. The toast convention to reuse for D-03's QR failure toast: `toast(t('key'), { kind: 'err' })` / `{ kind: 'info', ms: 5000 }` (:3294, :3040).

---

### `src/main.js` — drop seed import (MOD)

**Trivial:** delete line 10 (`import './data/seed.js';`) from the dependency-order import block (:5-57). Verified side-effect-free: seed.js's only top-level declaration is `export function seed()` (RESEARCH-verified). Keep the block's ordering comment intact. Forgetting this line silently defeats the whole 500 kB gate (Pitfall 2).

---

### `scripts/i18n-scan.mjs` — LOCALE_NAMES sync (MOD)

**Analog:** itself, :180-185 (verbatim):
```js
/* The native names of the registered locales: the name of a language is the
   language's own name, never translated (src/core/i18n.js LOCALES). */
const LOCALE_NAMES = new Set(['English', 'Français']);

/* Every set whose values are excluded wherever they appear. */
const VALUE_EXCLUSIONS = new Set([...STORED_VOCABULARY, ...STORED_VALUES, ...DEMO_VALUES, ...LOCALE_NAMES]);
```
D-07/Pitfall 4: replace the hardcoded list with an import of the shared name map (`scripts/locales.mjs`) so a derived registry's new name (or fixture name) is excluded automatically. A missing exclusion → an `unlisted` display-literal finding → prebuild fails. The scan already degrades gracefully on missing files (try/catch reads, :1598-1603) — fixture tests must prove it stays green with `xx.json` present (call exported `main(['--report'])`, :1605).

---

### `package.json` (maybe MOD)

**Analog:** its own script conventions. The build test joins the existing family rather than CI-only scripts:
```json
"prebuild": "node scripts/i18n-scan.mjs",
"build": "vite build",
"test": "node --test --test-concurrency=2 test/*.test.mjs",
```
If a stamp script is needed (stamp mechanism discretion), slot it as `"postbuild"` mirroring the `prebuild` prefix pattern. New `test/*.test.mjs` files are picked up by the glob automatically — no script change needed.

---

## Shared Patterns

### Fail-closed guard style (console.error with fix named → cleanup → exit 1)
**Source:** `e2e/server.mjs:19-24`
**Apply to:** the staleness guard (same file), mirrored in `test/e2e-server-guard.test.mjs` assertions.
```js
console.error('e2e: dist/ stale — run `npm run build`.');
fs.rmSync(dataDir, { recursive: true, force: true });
process.exit(1);
```
Messages always name the exact command that fixes the condition.

### Shared-scan module outside src/ (one implementation, many consumers)
**Source:** `scripts/icons.mjs` + `vite.config.js:18-21`
**Apply to:** `scripts/locales.mjs` (new) consumed by vite.config.js, scripts/i18n-scan.mjs, and tests. Lives outside src/ so it can never ship in the bundle.

### Build-contract tests on the REAL bundle
**Source:** `test/build-locales.test.mjs:26-54, 146-154`
**Apply to:** all three new Wave-0 tests. Real `vite build` into mkdtemp `--outDir`, `--emptyOutDir`; assert on produced bytes/sizes; developer's dist/ never touched; temp dirs cleaned in `after()`; every assertion message explains the invariant.

### Toast error convention
**Source:** `src/actions/actions.js:3040, 3294`; `src/main.js:123`
**Apply to:** D-03 QR chunk-load failure.
```js
toast(t('toast.someKey'), { kind: 'err', ms: 6000 });
```
i18n key via `t()` always; `kind: 'err'` for failures; optional retry affordance via `{ action, onAction }` (main.js:132-144 precedent — relevant to "retry on next click").

### Degrade-don't-throw in leaf modules
**Source:** `src/core/i18n.js:22-27` (glob try/catch), `:173-180` (Intl try/catch)
**Apply to:** derived registry in plain Node must degrade to `en`-only, identically to today's behavior.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/lib/qr.js` dynamic-import wrapper | utility | async load | Zero dynamic imports exist in src/ today — first conversion; use RESEARCH.md Pattern 1 shape + D-03 retry semantics |
| manifest stamp mechanism (postbuild or closeBundle) | build step | file-I/O | No existing build stamp in the repo; discretion granted (RESEARCH Open Question 1 — stamp-file-in-dist vs manifest self-hash) |

## Metadata

**Analog search scope:** `test/`, `scripts/`, `e2e/`, `src/core/`, `src/lib/`, `src/pages/`, `src/actions/`, `src/main.js`, `vite.config.js`, `package.json`
**Files scanned:** 12 tracked files + targeted reads of i18n-scan.mjs, settings.js, actions.js sections
**Pattern extraction date:** 2026-11-12
