# Phase 56: Delivery Infrastructure - Research

**Researched:** 2026-11-12
**Domain:** Vite 6 build chunking, dist-staleness guarding, derived i18n locale registry
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Split strategy is vendor + seed only: dynamic-import `src/lib/vendor/qrcode.js` (2187 lines) and `src/data/seed.js` (515 lines, demo-mode only). `src/actions/actions.js` and the rest of the app stay in the entry chunk — no page-level splitting.
- **D-02:** Acceptance guard is a build test: a unit test (test/ or scripts/) runs `vite build` and fails if any chunk exceeds 500 kB.
- **D-03:** QR chunk loading UX: spinner shown at click while the dynamic import resolves; on failure, error toast and retry on next click. No idle preloading of the QR chunk.
- **D-04:** Detection is content-hash based via Vite `build.manifest: true` — compare the dist manifest hashes against a stamp recorded at build time. mtime is never trusted.
- **D-05:** Behavior is fail-closed refusal: `e2e/server.mjs` exits non-zero with a clear message ("dist/ stale — run `npm run build`"). No auto-rebuild, no env opt-in.
- **D-06:** Location: inside `e2e/server.mjs`, next to the existing `dist/index.html` existence check (line ~20). No separate pretest hook.
- **D-07:** The `LOCALES` registry becomes derived: locale codes come from the files found by the existing `import.meta.glob('../locales/*.json')`, display names come from a known-language name map, unknown languages fall back to the raw code as name. Adding a locale = adding one JSON file.
- **D-08:** Proof is an end-to-end fixture test: a fake locale (e.g. `xx.json`) is offered by the selector, loaded by the loader, en/fr behavior is untouched, and the `scripts/i18n-scan.mjs` gate does not flag its keys as dead.
- **D-09:** Build contract: the glob is the source of truth — the default build ships every locale present in `src/locales/`; `LOCALES=en` remains the EN-only opt-out. The `localeSubset` plugin stays but its set is derived the same way.

### the agent's Discretion
- Exact stamp mechanism for D-04 (separate stamp file vs manifest self-hash) — plan-time choice, constraint is "hash-based, mtime never trusted"
- Test file placement and naming for D-02/D-08 (house conventions in `test/`)
- Spinner visual design (reuse existing loading patterns)
- How `registerCatalogue`/fallback order changes (if any) under the derived registry, provided en stays static-imported in the entry chunk

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DELIV-01 | e2e server refuses stale dist/ (fail-closed) | Guard inserted at `e2e/server.mjs:20-24`; Vite 6 `build.manifest` verified (default `false`, path `.vite/manifest.json`) |
| DELIV-02 | No chunk over 500 kB via dynamic imports, EN catalogue stays in entry | Vite 6.4.4 auto-splits every dynamic `import()`; `chunkSizeWarningLimit: 500` default verified; import sites located exactly |
| I18N-01 | Add-a-locale by one JSON file, proven by fixture test | Registry/glob/plugin/scan integration points all read and quoted below |
</phase_requirements>

## Summary

Phase 56 is three infrastructure deliverables on an existing, well-instrumented codebase. The critical correction to prior milestone research: **the project is on Vite 6.4.4, not Vite 8.x** — `.planning/research/STACK.md` was written against Vite 8 and its `advancedChunks` guidance does not apply. On Vite 6 (Rollup-based), no chunking config is needed at all: Rollup emits every dynamic `import()` as its own chunk automatically, and the default `chunkSizeWarningLimit` is already 500 kB — the acceptance gate is literally the default warning. Verified in the installed Vite source.

**Primary recommendation:** Convert exactly two import edges to dynamic `import()` (qr.js → vendor/qrcode.js; actions.js/main.js → seed.js), add a post-build stamp + manifest-hash guard inside `e2e/server.mjs`, and derive the LOCALES registry from the glob keys with a shared name map — no new packages, no config rewrites.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Stale-dist detection | Build tooling (Vite manifest) | e2e harness (`e2e/server.mjs`) | Vite owns hashes; the guard only compares them |
| Chunk splitting | Frontend build (Rollup via Vite 6) | — | Dynamic `import()` edges in src; no runtime involvement |
| QR lazy-load UX | Client (renderer) | — | Spinner/toast live at the settings render site |
| Derived locale registry | Client core (`src/core/i18n.js`) | Build plugin (`vite.config.js`) + gate (`scripts/i18n-scan.mjs`) | Three consumers must derive from the same source |
| 500 kB gate | Test suite (`test/`) | — | Runs real `vite build` (build-locales.test.mjs precedent) |

## Standard Stack

### Core (all already installed — zero new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vite | 6.4.4 (installed, `package.json` `^6.4.4`) [VERIFIED: node_modules/vite/package.json] | Build; auto-splits dynamic imports; manifest emission | Existing |
| node:test | Node ≥24 (engines) [VERIFIED: package.json engines] | Build tests, fixture tests | Existing house runner (`npm test`) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plain dynamic `import()` (auto-split) | `build.rollupOptions.output.manualChunks` | manualChunks unnecessary — Rollup already makes one chunk per dynamic import; adding it risks moving the EN catalogue out of the entry (violates the invariant). Don't. |
| mtime staleness check | manifest-hash stamp (D-04 locks this) | mtime false-positives on `git checkout`/`touch` — locked decision |
| Separate pretest staleness hook | Guard in server.mjs (D-06 locks this) | A hook can be bypassed by invoking server.mjs directly — locked decision |

**Installation:** none. No new packages. (Package Legitimacy Audit: not applicable — no installs.)

## Architecture Patterns

### System Architecture Diagram

```
vite build
   │  (1) auto-splits each dynamic import() into its own chunk
   │  (2) emits dist/.vite/manifest.json (build.manifest: true)
   │  (3) writes build stamp = hash of manifest content (discretion: file vs self-hash)
   ▼
dist/  ──hashes──►  STAMP (recorded at build time)
   │                        │
   │ e2e/server.mjs boot:   │
   │  a. dist/index.html exists?  (existing check, e2e/server.mjs:20)
   │  b. manifest present? → recompute manifest content hash
   │  c. stamp ≠ recomputed → console.error("dist/ stale — run `npm run build`"); exit(1)
   ▼                        ▼
Playwright suite  ◄── serves dist only if hashes match

Client runtime:
  click (2FA QR) ──► spinner ──► await import vendor/qrcode chunk
       ├── success → render QR, kill spinner
       └── failure → error toast; next click retries
  demo-mode init ──► await import seed chunk ──► seed()
  language select ──► LOCALES (derived from glob keys) ──► glob loader for code.json
```

### Pattern 1: Rollup auto-split of dynamic imports (Vite 6 — NO config needed)
**What:** Every dynamic `import('...')` becomes its own chunk automatically.
**Verified in-repo:** zero dynamic imports exist in `src/` today; `fr` already sits in its own chunk because the glob loaders compile to dynamic imports.
```js
// src/lib/qr.js — conversion shape
let modPromise = null;
function loadQrcode() {
  if (!modPromise) modPromise = import('./vendor/qrcode.js'); // dedupe; retry = clear on failure
  return modPromise;
}
```
Retry semantics (D-03): on rejection, reset `modPromise = null` so the next click retries the import; show toast, kill spinner.

### Pattern 2: Build-time stamp for staleness (D-04)
The manifest itself is content-addressed by Vite (keys are hashed filenames). Recording a stamp of the manifest's own content hash at build time and comparing on server boot detects *any* content change — source edits without a rebuild change nothing in dist, so a stale dist fails hash comparison only when the manifest itself is rewritten. **Recommended variant:** a `postbuild`-adjacent step (or Vite `closeBundle` hook) writes the sha256 of `dist/.vite/manifest.json` to a stamp file inside `dist/`; the guard recomputes and compares. Simpler self-hash variant: store the hash *inside* the manifest via `generateBundle` mutation — one file, no stamp-drift risk. Plan-time choice per discretion.

### Pattern 3: Shared scan module consumed by build + gate + tests (icons.mjs precedent)
[VERIFIED: vite.config.js:2, scripts/icons.mjs via lucideIconNames('src') usage at vite.config.js:31 and test/build-locales.test.mjs:17]
The derived-locale mechanism should follow the same shape: a shared module (e.g. `scripts/locales.mjs` or constants inside `scripts/`) exporting `localeCodes(srcDir)` (fs.readdirSync of `src/locales`) and the known-language name map. Consumers: `vite.config.js` (BUILD_LOCALES default + localeSubset), `src/core/i18n.js` (registry derivation is browser-side via glob keys; name map can live there if scan-friendly), and the scan's exclusion set.

### Recommended Project Structure (touchpoints only)
```
e2e/server.mjs            # guard insertion after line 24 (existing check at :19-24)
vite.config.js            # BUILD_LOCALES default derived from fs (config runs in Node — fs available)
src/core/i18n.js          # LOCALES derived from Object.keys(loaders) + name map
src/lib/qr.js             # dynamic import wrapper, async renderQrSvg
src/lib/vendor/qrcode.js  # stays verbatim; now a lazy chunk
src/data/seed.js          # stays; now a lazy chunk
src/actions/actions.js    # seed() call sites become lazy (lines 3049, 3289)
src/main.js               # DROP bare seed import (line 10)
src/pages/settings.js     # QR render sites become async (lines 669, 697)
scripts/i18n-scan.mjs     # LOCALE_NAMES exclusion set synced with the name map
test/<new>.test.mjs       # 500 kB build test + fixture-locale test (build-locales.test.mjs is the template)
```

## In-Repo Facts (verbatim, read this session)

### The import edges to convert (D-01)
- [VERIFIED: src/lib/qr.js:10] `import qrcode from './vendor/qrcode.js';` — static. `renderQrSvg(otpauthUri)` is the only export (qr.js:12).
- [VERIFIED: src/pages/settings.js:9] `import { renderQrSvg } from '../lib/qr.js';` — used at settings.js:669 (inline in a template literal: `${renderQrSvg(S.ui.tfaOtpauth || '')}`) and settings.js:697. **These are synchronous template interpolations** — the render path must become async (placeholder/spinner element, then fill after the awaited import), or the 2FA flow must await the module before rendering the panel.
- [VERIFIED: src/actions/actions.js:7] `import { seed } from '../data/seed.js';` — call sites at actions.js:3049 and :3289 (`S.data = seed();`).
- [VERIFIED: src/main.js:10] `import './data/seed.js';` — bare import. [VERIFIED: src/data/seed.js:5] seed.js's only top-level declaration is `export function seed()` — no side effects, so the bare import contributes nothing but bundle weight and can simply be deleted.
- **Discrepancy flag:** CONTEXT.md said "QR click site in the share/invite modal (`src/overlays/modals.js`)". Measured: grep finds QR usage only in `src/pages/settings.js` (2FA TOTP). The D-03 spinner attaches at the settings 2FA render/flow, not a share modal. Planner should anchor D-03 UX to the settings 2FA site.

### The e2e guard insertion point (D-06)
[VERIFIED: e2e/server.mjs:19-24, quoted verbatim:]
```js
/* The suite serves the built app; a missing build is a setup error, not a test failure. */
if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  console.error('e2e: dist/index.html is missing — run `npm run build` before `npm run e2e`.');
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(1);
}
```
The staleness block slots directly below, same fail-closed shape (`dataDir` cleanup + `process.exit(1)`). Note the mkdtemp at :17 happens *before* the check — the guard must keep cleaning it up.

### Vite 6 build options (D-04 / DELIV-02)
- [VERIFIED: node_modules/vite/dist/node/chunks/dep-3O3b9SCF.js:46250] `chunkSizeWarningLimit: 500,` — the 500 kB default is live; no config change.
- [VERIFIED: node_modules/vite/dist/node/chunks/dep-3O3b9SCF.js:46243] `manifest: false,` — must be enabled.
- [VERIFIED: node_modules/vite/dist/node/chunks/dep-3O3b9SCF.js:10759] `fileName: typeof buildOptions.manifest === "string" ? buildOptions.manifest : ".vite/manifest.json",` — manifest lands at `dist/.vite/manifest.json`.
- **Vite major correction:** installed vite is 6.4.4 [VERIFIED: node_modules/vite/package.json]. `.planning/research/STACK.md`'s "Vite 8.3.x / `advancedChunks` / rolldownOptions" guidance is **inapplicable**. STATE.md's flag "verify Vite major (8.x → advancedChunks vs ≤7 → manualChunks)" resolves to: **neither — plain dynamic import() auto-split, no chunking config**. Do not upgrade Vite in this phase.

### The i18n integration surface (D-07 / D-08 / D-09)
- [VERIFIED: src/core/i18n.js:9-12, quoted verbatim:]
```js
export const LOCALES = Object.freeze([
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
]);
```
- [VERIFIED: src/core/i18n.js:24] `loaders = import.meta.glob(['../locales/*.json', '!../locales/en.json']);` — inside a try/catch; plain Node leaves `loaders = {}` (:22-27). **Derivation must degrade identically:** derive codes from `Object.keys(loaders)` PLUS the static-imported base (`en`) — in plain Node the derived registry must still contain en (existing plain-Node test expectations, e.g. test/catalogue.test.mjs, must not break).
- [VERIFIED: src/core/i18n.js:36] `registerCatalogue(BASE_LOCALE, en);` — top-level static en, the invariant D-08/CONTEXT protects. Keep untouched.
- Registry consumers (all read `LOCALES.some(l => l.code === …)`): i18n.js:49, :103, :123, :195; `availableLocales()` at :131-133. The language `<select>` renders from `availableLocales()` [VERIFIED: src/pages/settings.js:96].
- [VERIFIED: vite.config.js:10-16] `BUILD_LOCALES` derives from `process.env.LOCALES || 'en,fr'` — the `'en,fr'` string default is the hardcoded bit D-09 removes; replace with a readdir of `src/locales` (config file runs in Node, fs is available).
- [VERIFIED: vite.config.js:42-58] `localeSubset()` regex `/(?:^|\/)locales\/([A-Za-z0-9_-]+)\.json$/` — untouched; only its set source changes.
- [VERIFIED: scripts/i18n-scan.mjs:182, quoted verbatim:]
```js
const LOCALE_NAMES = new Set(['English', 'Français']);
```
  This value-exclusion set must stay in sync with the derived registry's names. **Gotcha:** the name map's strings live in source code; if a name like `English`/`Français` weren't excluded, the display-literal scan would flag it (hasCapitalWord rules). A new name (or the fixture's name) needs the set extended — best done by importing the shared name map rather than a second hardcoded list.
- **Gate-vs-fixture (D-08):** `main()` reads exactly `src/locales/en.json` and `src/locales/fr.json` [VERIFIED: scripts/i18n-scan.mjs:1609-1612]; dead-key check runs on the EN catalogue only (:1645); notif parity is en↔fr only (:1633). So a fixture `xx.json` placed in `src/locales/` is invisible to parity and dead-key gates **provided the fixture's display name string doesn't appear in scanned src/ code unexcluded**.
- **Fixture mechanics:** `import.meta.glob` is resolved at build time — a fixture locale must physically exist in `src/locales/` during the test's build. The build-locales.test.mjs pattern (spawn real `vite build` into a temp `--outDir`, assert on produced bytes, cleanup in `after()`) is exactly the right harness: copy `xx.json` in at `before()`, build with `LOCALES=en,fr,xx` (and one default build to prove D-09 auto-ship), assert registry/loader/chunk behavior, delete the file in `after()` (and in a failure-safe finally).
- [VERIFIED: test/build-locales.test.mjs:26-35, quoted verbatim (the build harness to reuse):]
```js
function build(locales) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-build-'));
  const result = spawnSync(process.execPath, [VITE_BIN, 'build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: ROOT,
    env: { ...process.env, LOCALES: locales },
    encoding: 'utf8',
  });
```
  Note: this test spawns builds with `--outDir` override — `build.manifest: true` will emit the manifest into those temp dirs too; the 500 kB test can read chunk sizes either from the manifest (asset names + file sizes) or from the `assets/` directory listing directly (simpler, matches `assetsOf()` at :38-44).
- [VERIFIED: scripts/i18n-scan.mjs:1267-1276] `DEAD_KEY_ALLOWLIST` — if the fixture test needs catalogue keys referenced only by tests, existing entries (`contract.`, `greeting.hello`) are the precedent for prefix entries; but fixture keys living only in xx.json never enter the EN dead check, so no allowlist change should be needed.

### Standing invariants the plan must not break
- EN base catalogue statically imported and inlined in the entry chunk (i18n.js:6, :36; proven by test/build-locales.test.mjs:171-178). Dynamic-import conversions must not touch this edge.
- The existing build-locales suite builds three times in `before()` (default, en, fr — :146-150) and asserts the French catalogue is its own chunk not the entry (:163-169). The 500 kB gate joins this file's family or a sibling file using the same harness.
- Full suite must stay green: `npm test` runs `node --test --test-concurrency=2 test/*.test.mjs` [VERIFIED: package.json scripts]; lint (`eslint .`) and `prebuild` i18n scan also gate builds.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chunk hashing | Custom dist hashing | `build.manifest: true` + `.vite/manifest.json` | Vite already content-hashes every asset; the manifest IS the hash table [VERIFIED: dep-3O3b9SCF.js:10759] |
| Chunk splitting | `manualChunks` grouping | Plain dynamic `import()` | Rollup auto-splits; manualChunks risks dragging the EN catalogue out of the entry chunk |
| staleness diffing | mtime/`stat` comparison | manifest-content hash vs build-time stamp | D-04; mtime lies under git checkout |
| scanning src for locale files | new glob/regex walker | `fs.readdirSync(src/locales)` in config; `Object.keys(import.meta.glob loaders)` in client | Two proven surfaces already exist (vite.config plugin, i18n.js loaders) |
| build-contract tests | new test framework | node:test + spawnSync vite build | build-locales.test.mjs is a complete working template |

**Key insight:** every mechanism this phase needs already has a house precedent — the work is wiring three consumers (registry, plugin, scan) to one derived source, not inventing infrastructure.

## Common Pitfalls

### Pitfall 1: Sync QR render site breaks under dynamic import
**What goes wrong:** `renderQrSvg` is interpolated directly into two template literals (settings.js:669, :697). Converting the underlying module to dynamic import makes these calls async — naively returning a Promise into the template yields "[object Promise]".
**How to avoid:** make the 2FA flow await the module before rendering the panel (spinner per D-03 at the initiating click), or render a placeholder element and fill it after `await`. Check every caller of `renderQrSvg` (grep shows only settings.js).
**Warning signs:** e2e 2FA specs fail on a missing SVG.

### Pitfall 2: The bare seed import in main.js hides the real consumers
**What goes wrong:** deleting only actions.js's static import leaves main.js:10 pulling seed.js into the entry chunk — the 500 kB gate's purpose silently defeated.
**How to avoid:** delete main.js:10 (verified side-effect-free) AND make actions.js:3049/:3289 lazy (`const { seed } = await import('../data/seed.js')` at each demo-init site).

### Pitfall 3: Derived registry breaks plain-Node i18n
**What goes wrong:** deriving codes purely from `Object.keys(loaders)` yields an EMPTY registry in plain Node (loaders = {} in the try/catch, i18n.js:22-27) — server-side tFor clamps everything to base... but the registry lookup at :195 would fail even for 'en' if en isn't statically seeded.
**How to avoid:** derived codes = glob keys ∪ {BASE_LOCALE}; keep the static en import and top-level `registerCatalogue(BASE_LOCALE, en)` untouched. Run existing catalogue/i18n unit tests as the regression net.

### Pitfall 4: The i18n-scan flags the new name-map strings
**What goes wrong:** language display names are capitalised literals in src; the scan's `LOCALE_NAMES` exclusion set (i18n-scan.mjs:182) is hardcoded to English/Français. A derived registry adding names (or a fixture's name like "Testlang") becomes an `unlisted` finding → prebuild fails.
**How to avoid:** feed the scan's exclusion set from the shared name map (import it), extending rather than duplicating. The fixture test should also run `main()` (or scanSource) to prove the gate stays green with the fixture present (D-08's fourth clause).

### Pitfall 5: Guard skips its cleanup on exit
**What goes wrong:** the staleness check runs after `dataDir` is created (server.mjs:17); exiting without `fs.rmSync(dataDir…)` leaks temp dirs.
**How to avoid:** mirror the existing missing-dist branch exactly (rmSync + exit 1), as quoted above.

### Pitfall 6: Fixture file left behind poisons later runs
**What goes wrong:** a failing assertion between `before()` and `after()` (or a crash) leaves `src/locales/xx.json` in the tree → the next real build ships a test locale; the scan may flag its name; git status is dirty.
**How to avoid:** write/delete the fixture with try/finally around the build+assert block; assert the file is absent in `after()` too (belt and braces).

### Pitfall 7: Trusting the manifest filename list for chunk sizes
**What goes wrong:** manifest entries don't map 1:1 to "chunks" conceptually (CSS, html also appear); summing wrong entries mislabels the gate.
**How to avoid:** the 500 kB test should measure `.js` files under `assets/` (or filter manifest entries to `chunk` type with `.js` file names) — keep the rule simple: any emitted `.js` asset > 500 kB fails.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vite 8 `advancedChunks` (prior research assumption) | Vite 6.4.4 in this repo; dynamic import() auto-split | measured this session | Prior STACK.md §Vite-8 guidance inapplicable; no chunk config needed |
| Hardcoded LOCALES array | Glob-derived registry + name map | this phase | Adding a locale = one JSON file |

**Deprecated/outdated for this repo:**
- `.planning/research/STACK.md` "If the project is on Vite 8, use `build.rolldownOptions.output.advancedChunks`" — project is on 6; ignore.
- STATE.md flag "verify Vite major" — resolved: 6.4.4, use neither advancedChunks nor manualChunks.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `build.manifest: true` in Vite 6 works with `--outDir` overrides in test builds (manifest emitted in temp dirs) | I18N/build tests | Minor — test harness reads assets dir directly instead |
| A2 | sha256-of-manifest stamp detects staleness reliably for this workflow (manifest rewrites on every content change; identical rebuild is a no-op false-negative, acceptable) | Pattern 2 | Low — alternative self-hash variant exists; discretion covers it |
| A3 | Existing plain-Node i18n unit tests only require en in the registry (not fr) under derived registry | Pitfall 3 | Medium — planner should add a checkpoint to run `npm test` early in execution; if fr is expected in Node, derive must seed both (fr only has a loader, not a catalogue, in Node — same as today's `LOCALES` which lists fr regardless) |

## Open Questions (RESOLVED)

1. **Stamp mechanism final shape** — RESOLVED: stamp-file-in-dist via a closeBundle hook writing `dist/.vite/build-stamp.json`; chosen in 56-02 Plan Task 1 (stamp ships inside dist/, survives `git checkout` of src/, one file pair answers "does dist match what was built").
2. **QR async UX placement** — RESOLVED: spinner anchored at the 2FA-initiating click, per D-03; implemented in 56-01 Plan Task 1 (settings 2FA site).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | tests, vite, e2e server | ✓ | engines: >=24 | — |
| vite | build, build tests | ✓ | 6.4.4 | — |
| @playwright/test | e2e suite | ✓ | ^1.64.1 | — |
| eslint / prettier | gates | ✓ | 9 / 3.9.9 | — |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in), Node ≥24 |
| Config file | none (convention: `test/*.test.mjs`, `--test-concurrency=2`) |
| Quick run command | `npm test` (full; no per-file filter script exists — use `node --test test/<file>.test.mjs`) |
| Full suite command | `npm test && npm run lint && node scripts/i18n-scan.mjs` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DELIV-01 | guard exits non-zero on stale dist | unit (spawn server.mjs against doctored dist, assert exit 1 + message) | `node --test test/<new-e2e-guard>.test.mjs` | ❌ Wave 0 |
| DELIV-02 | no chunk > 500 kB | unit (spawn real vite build; assert asset sizes) | `node --test test/<new-build-size>.test.mjs` | ❌ Wave 0 (harness: test/build-locales.test.mjs) |
| DELIV-02 | EN catalogue stays in entry chunk | unit | existing build-locales.test.mjs assertions | ✅ |
| I18N-01 | fixture locale offered/loaded/en-fr untouched/gate clean | unit (fixture inject + real build + scan main()) | `node --test test/<new-locale-fixture>.test.mjs` | ❌ Wave 0 |
| I18N-01 | derived registry parity with old behavior | unit | existing catalogue/i18n suites | ✅ |

### Sampling Rate
- **Per task commit:** targeted `node --test test/<touched>.test.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** `npm test` + lint + i18n scan + `npm run e2e` green on the split build

### Wave 0 Gaps
- [ ] `test/e2e-server-guard.test.mjs` (or per house naming) — DELIV-01
- [ ] `test/build-chunk-size.test.mjs` — DELIV-02
- [ ] `test/locale-registry-fixture.test.mjs` — I18N-01 (D-08 proof)

## Security Domain

No new inputs, endpoints, auth, crypto or storage this phase. Applicable note: the e2e guard is a fail-closed integrity check (defense against silently testing stale artifacts) — no ASVS category adds a control beyond the existing suite. The scan gates (i18n-scan) already protect against unescaped/unknown literals. `security_enforcement` treated as enabled; nothing new to mitigate.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | no (no new inputs) | existing escHtml discipline unchanged |
| V6 Cryptography | no (hashing for integrity only, not secrecy) | node:crypto sha256 of manifest |

## Sources

### Primary (HIGH confidence — read this session)
- `src/core/i18n.js`, `vite.config.js`, `e2e/server.mjs`, `scripts/i18n-scan.mjs`, `src/lib/qr.js`, `src/data/seed.js`, `src/main.js`, `src/pages/settings.js`, `src/actions/actions.js`, `test/build-locales.test.mjs`, `package.json` — all quoted verbatim above
- Installed Vite 6.4.4 source (`node_modules/vite/dist/node/chunks/dep-3O3b9SCF.js:46243,46250,10759`)

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` / `ARCHITECTURE.md` / `PITFALLS.md` — useful for rationale (guard location, chunk-race pitfalls) but their Vite-8 API guidance is corrected by this document

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — installed versions read directly
- Architecture/patterns: HIGH — all integration points read and quoted verbatim
- Pitfalls: HIGH — derived from the actual source shapes (sync QR templates, bare import, scan exclusion sets)
- Stamp mechanism details: MEDIUM (A2) — discretion-granted plan choice

**Research date:** 2026-11-12
**Valid until:** 2026-12-12 (stable — no new deps; Vite pinned)
