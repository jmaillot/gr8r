# Phase 56: Delivery Infrastructure - Research (REVISED)

**Researched:** 2026-11-12 (revision 2 — post-executor chunk measurements)
**Domain:** Vite 6 chunk composition, dist-staleness guarding, derived i18n locale registry
**Confidence:** HIGH

> **Revision 2 reason:** The original research's DELIV-02 premise (two dynamic-import edges reach 500 kB) was **refuted by execution**. The lazy-QR conversion is committed (7e45d82/7d6da16); the entry is still 606 kB. This revision adds *measured* chunk-composition data, per-edge splitting deltas, and a recommended combination. **CONTEXT.md D-01 ("no page-level splitting") cannot survive this data — the planner must revise it deliberately.** DELIV-01 and I18N-01 sections were re-verified and remain accurate.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Split strategy is vendor + seed only: dynamic-import `src/lib/vendor/qrcode.js` (2187 lines) and `src/data/seed.js` (515 lines, demo-mode only). `src/actions/actions.js` and the rest of the app stay in the entry chunk — no page-level splitting. **⚠ REFUTED by measurement — see "Measured Chunk Composition"; planner must revise D-01. The user has already ruled (Rule-4 checkpoint, option B) that the phase must actually hit 500 kB.**
- **D-02:** Acceptance guard is a build test: a unit test (test/ or scripts/) runs `vite build` and fails if any chunk exceeds 500 kB. ✅ unchanged.
- **D-03:** QR chunk loading UX: spinner at click, error toast on failure, retry on next click, no idle preloading. ✅ **already implemented and committed** (7e45d82, 7d6da16).
- **D-04:** Content-hash based staleness detection via Vite `build.manifest: true`; mtime never trusted. ✅ unchanged.
- **D-05:** Fail-closed refusal in `e2e/server.mjs` with actionable message. ✅ unchanged.
- **D-06:** Guard lives inside `e2e/server.mjs`, no pretest hook. ✅ unchanged.
- **D-07:** LOCALES registry derived from `import.meta.glob('../locales/*.json')` keys + name map. ✅ unchanged.
- **D-08:** Fixture-locale end-to-end proof test. ✅ unchanged.
- **D-09:** Glob is the build's source of truth; `LOCALES=en` opt-out kept; `localeSubset` set derived. ✅ unchanged.

### the agent's Discretion
- Exact stamp mechanism for D-04 (constraint: hash-based, mtime never trusted) — 56-02 Task 1 settled on stamp file inside dist/ via closeBundle
- Test file placement/naming (house conventions in `test/`)
- Spinner visual design ✅ shipped
- `registerCatalogue`/fallback order under the derived registry, provided en stays static-imported in the entry chunk
- *(new, from this revision)* which page-split combination to adopt, within the measured viability map below

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DELIV-01 | e2e server refuses stale dist/ (fail-closed) | Guard insertion point re-verified at `e2e/server.mjs:19-24`; Vite 6 `build.manifest` verified (default `false`, path `.vite/manifest.json`) |
| DELIV-02 | No chunk over 500 kB via dynamic imports, EN catalogue stays in entry | **Measured this session:** entry 606,073 B as-committed; per-edge deltas measured (seed −14.7 kB, settings −55.0 kB, six-page set −118.9 kB); recommended combination reaches ≈472–496 kB |
| I18N-01 | Add-a-locale by one JSON file, proven by fixture test | Registry/glob/plugin/scan integration points re-verified, quoted below |
</phase_requirements>

## Summary

Phase 56 is three infrastructure deliverables on an existing, well-instrumented codebase. The project is on **Vite 6.4.4** (Rollup-based): every dynamic `import()` auto-splits into its own chunk with zero config, and `chunkSizeWarningLimit: 500` is already the default — the acceptance gate is literally the default warning.

**The measured reality (this session, fresh `vite build` on main at 733074c):** the entry chunk is **606,073 B** with the lazy-QR conversion already applied. The qrcode edge split correctly (21,140 B lazy chunk). The seed edge did **not** split — `src/core/store.js:5` statically imports `seed` for a *synchronous* storage-corruption fallback (`data: saved?.data || seed()` at store.js:56), which the original research wrongly declared irrelevant. Making seed lazy everywhere gets the entry to **591,380 B** — still over the limit — and breaks the plain-Node test suites that depend on the synchronous fallback. Even removing the six heaviest page modules from the graph entirely only reaches **487,150 B**. **Conclusion: D-01's "two edges only" cannot reach 500 kB; page-module splitting is required, and the user has already ruled (Rule-4, option B) that the gate must actually pass.**

**Primary recommendation:** Keep DELIV-01 and I18N-01 exactly as planned (unchanged designs). For DELIV-02, revise D-01 to: seed-lazy with an explicit async seeding contract for Node tests, plus dynamic-import splitting of the heaviest page modules (settings, design-system, members, and auth if margin is needed) via an async `renderPage()` with the existing skeleton as the loading state, keeping the EN catalogue inline and the home/first-paint route static. The D-02 build gate is the arbiter — the plan needs a build-verification checkpoint after each split edge.

## Measured Chunk Composition (VERIFIED this session)

All numbers from fresh `vite build` runs (Vite 6.4.4) on this working tree; experiments applied then reverted (`git checkout`), tree clean afterwards.

### Baseline (main @ 733074c, lazy QR committed)
| Chunk | Bytes | Notes |
|-------|-------|-------|
| `index-*.js` (entry) | **606,073** | over the 500 kB gate by ~106 kB (500,000 B) / ~94 kB (512,000 B) |
| `qrcode-*.js` | 21,140 | lazy chunk — conversion committed, works, no config |
| `fr-*.js` | 97,285 | already lazy via glob loaders |
| CSS | 84,110 | not a JS chunk; outside the gate |

Modules transformed: 71. Zero config needed for any of this — Rollup auto-splits.

### Why seed didn't split — the store.js static edge
- [VERIFIED: src/core/store.js:5] `import { seed } from '../data/seed.js';`
- [VERIFIED: src/core/store.js:56] `data: saved?.data || seed(),` — the storage-corruption/absence fallback runs **synchronously at module init** in plain Node too (no localStorage → `saved` null → seed() called). This is what populates `S.data` for every node-side suite.
- [VERIFIED: src/main.js:10] `import './data/seed.js';` — bare import, still present.
- [VERIFIED: src/actions/actions.js:7] `import { seed } from '../data/seed.js';` — call sites at actions.js:3049 and :3289, both inside `confirmDlg({ run: () => { S.data = seed(); … } })` callbacks — **not async contexts**; the conversion must make those `run` callbacks `async` (verified: a bare `await` there fails the build).

### Measured per-edge deltas (each measured independently, everything else static)
| Edge | Conversion | Entry after | Δ |
|------|-----------|-------------|---|
| baseline | — | 606,073 B | — |
| seed lazy (store fallback neutralized + actions async + main.js bare import dropped) | build ✅, 3 node suites ❌ | **591,380 B** | −14,693 |
| settings.js removed from graph (layout pageSettings, actions.js strengthMeter, main.js bare) | build ✅ | **551,080 B** | −54,993 |
| six pages removed (settings, auth, design-system, members, search, activity) | build ✅ | **487,150 B** | −118,923 |

The prior executor's figure of ~591,543 B for seed-lazy matches this measurement (±163 B — module-count noise; treat ~591.4 kB as the seed-lazy entry size).

**What the six-page experiment does and doesn't prove:** stubbing removed 10 modules from the 71-module graph (62 transformed with the stub file counted), so some shared deps got orphaned — a real dynamic-import conversion **keeps shared deps in the entry** (Rollup hoists them), so the real gain per edge is somewhat smaller than the stub delta. The deltas are upper bounds per edge; the D-02 gate is the arbiter. The plan must re-run `vite build` after each edge and add edges until the gate passes.

### Remaining entry weight (what splitting cannot remove)
- EN catalogue (~92 kB raw en.json) — **inlined by house invariant, protected** (i18n.js:6 static import + registerCatalogue). Untouchable.
- `actions.js` is 148.6 kB raw — the largest module — but it is the app's shared action registry (`A`), imported by main.js, palette.js, events.js and reached by every page via `data-a` delegation. Splitting it is a feature-level refactor, not phase-56 infrastructure. It stays in the entry (consistent with the revised D-01's spirit: split *page modules*, not the action core).
- app shell (layout, render, store, i18n, ui helpers, toast, icons virtual module ~25 kB) — first-paint surface, stays.

### The async-seed migration contract (what breaks and the fix)
With store.js's seed fallback neutralized, a fresh `node --test` run shows:
- ❌ `test/browser-push.test.mjs` — fails (needs seeded S.data)
- ❌ `test/demo-workspace.test.mjs` — `TypeError: Cannot read properties of null (reading 'ws')` at store.js:462 `workspaceList` (S.data null)
- ❌ `test/i18n-search.test.mjs` — fails
- ✅ `test/catalogue.test.mjs` — passes (the original research's list of 4 was conservative; measure again when implementing)

**Migration contract for the plan:** keep store.js's fallback *synchronous but tiny* — `data: saved?.data || emptyState()` where `emptyState()` is an inline minimal shape — and export an explicit `async ensureSeedData()` (dynamic-imports seed.js, applies `seed()`, renders) called from main.js init in demo mode. Node suites that need demo-shaped data import `seed()` from `src/data/seed.js` directly (it is a pure, side-effect-free function — [VERIFIED: src/data/seed.js:5] sole top-level declaration is `export function seed()`) and apply it in their setup. This preserves the corruption-fallback *behavior* (app never boots null) while leaving seed.js out of the entry. Each of the 3 broken suites needs this setup-line change; the planner should list them as explicit tasks, not "run npm test and see".

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Stale-dist detection | Build tooling (Vite manifest) | e2e harness (`e2e/server.mjs`) | Vite owns hashes; the guard only compares them |
| Chunk splitting | Frontend build (Rollup via Vite 6) | Shell async render (`renderPage`) | Dynamic `import()` edges in src; async render drives page-chunk loading |
| QR lazy-load UX | Client (renderer) | — | ✅ shipped — spinner/toast/retry at the settings 2FA site |
| Derived locale registry | Client core (`src/core/i18n.js`) | Build plugin (`vite.config.js`) + gate (`scripts/i18n-scan.mjs`) | Three consumers derive from the same source |
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
| Plain dynamic `import()` (auto-split) | `build.rollupOptions.output.manualChunks` | manualChunks unnecessary for *creating* chunks — Rollup already makes one chunk per dynamic import; adding it risks moving the EN catalogue out of the entry (violates the invariant). Don't. |
| Async `renderPage()` + dynamic page imports | Full router refactor | The route map in layout.js:46-68 is already a name→function table; converting its values to loader functions is the minimal change. No router library. |
| mtime staleness check | manifest-hash stamp (D-04 locks this) | mtime false-positives on `git checkout`/`touch` — locked decision |
| Separate pretest staleness hook | Guard in server.mjs (D-06 locks this) | A hook can be bypassed by invoking server.mjs directly — locked decision |

**Installation:** none. No new packages. (Package Legitimacy Audit: not applicable — no installs.)

## Architecture Patterns

### System Architecture Diagram

```
vite build
   │  (1) auto-splits each dynamic import() into its own chunk
   │  (2) emits dist/.vite/manifest.json (build.manifest: true)
   │  (3) writes build stamp = sha256 of manifest (closeBundle hook)
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
  boot ──► entry chunk (shell + EN catalogue + actions core) ──► first paint (unchanged)
  route change ──► renderPage(): P[r] is a loader ──► skeleton (existing) ──► await import page chunk ──► render
  click (2FA QR) ──► spinner ──► await import vendor/qrcode chunk   ✅ shipped
  demo-mode init ──► ensureSeedData() ──► await import seed chunk ──► seed() applied
  language select ──► LOCALES (derived from glob keys) ──► glob loader for code.json
```

### Pattern 1: Rollup auto-split of dynamic imports (Vite 6 — NO config needed)
**What:** Every dynamic `import('...')` becomes its own chunk automatically. Proven twice in this repo: the committed qrcode chunk (21,140 B) and the seed chunk (`seed-BwvhI4F3.js`) emitted during the seed-lazy experiment.
```js
// committed shape — src/lib/qr.js (7e45d82)
let modPromise = null;
function loadQrcode() {
  if (!modPromise) {
    modPromise = import('./vendor/qrcode.js').catch(err => {
      modPromise = null; // retry-reset: next call re-attempts the import
      throw err;
    });
  }
  return modPromise;
}
```

### Pattern 2: Async renderPage with loader map (the page-split contract)
**What:** `renderPage()` (layout.js:43-74) becomes async: the `P` map's values become loader functions; layout renders the existing `skeleton()` while the chunk resolves.
```js
// shape — layout.js renderPage
const P = {
  settings: () => import('../pages/settings.js').then(m => m.pageSettings),
  system:   () => import('../pages/design-system.js').then(m => m.pageSystem),
  // home stays static: first-paint route must never wait on a network fetch
  home:     () => pageHome,
  …
};
const load = P[r] || (() => Promise.resolve(page404));
// caller: render skeleton, await load(), then fill #main-content
```
**Constraints the plan must encode:**
- **First paint stays identical:** `home` (and whatever route the boot lands on) must resolve from the entry chunk — statically imported, loader returns it synchronously. EN catalogue inline invariant untouched.
- **Cross-module edges to decouple before splitting settings.js:** `actions.js:45` imports `strengthMeter` from settings.js (used at actions.js:3328 in the password-change flow) — move `strengthMeter` (settings.js:814, a pure template function) into a shared ui module or inline it, or settings cannot leave the entry graph.
- **Cross-module edge for search.js:** `overlays/palette.js:12` imports `searchAll` from search.js (Ctrl-K palette is first-paint surface) — either keep search.js in the entry or decouple `searchAll`.
- `render.js:15` imports `renderAuth` from auth.js (login shell) — if auth.js splits, the logged-out boot render must await it (acceptable: one fetch before the login form) or auth stays in entry.
- main.js's bare page imports (lines 21-47) are **side-effect-free** — pages export pure template functions only [VERIFIED this session: settings/auth/design-system/members/search/activity have no top-level A.* registration] — so deleting the bare imports is safe; no handler-registration deferral risk.
- **i18n scan compatibility:** page modules are scanned by `scripts/i18n-scan.mjs` regardless of import style (it scans `src/` files, not the bundle) — dynamic import does not change gate results.

### Pattern 3: Build-time stamp for staleness (D-04) — unchanged from revision 1
Stamp-file-in-dist via a closeBundle hook writing `dist/.vite/build-stamp.json` containing the sha256 of `dist/.vite/manifest.json`; the guard recomputes and compares. Chosen in 56-02 Task 1; discretion covers the exact shape.

### Pattern 4: Shared scan module consumed by build + gate + tests (icons.mjs precedent) — unchanged
Derived-locale mechanism follows `scripts/icons.mjs`: a shared module exporting `localeCodes(srcDir)` (fs.readdirSync of `src/locales`) and the known-language name map; consumed by `vite.config.js`, `src/core/i18n.js`, and the scan's exclusion set.

### Recommended Project Structure (touchpoints only)
```
e2e/server.mjs            # guard insertion after line 24 (existing check at :19-24)
vite.config.js            # BUILD_LOCALES default derived from fs (config runs in Node)
src/core/i18n.js          # LOCALES derived from Object.keys(loaders) ∪ {en} + name map
src/core/store.js         # seed fallback → tiny inline emptyState() + async ensureSeedData()
src/lib/qr.js             # ✅ already converted (committed)
src/lib/vendor/qrcode.js  # ✅ already a lazy chunk
src/data/seed.js          # becomes a lazy chunk via ensureSeedData + demo-reset sites
src/main.js               # drop bare seed import (line 10); drop bare page imports as they split; call ensureSeedData in demo init
src/actions/actions.js    # seed sites (:3049, :3289) → async run callbacks; strengthMeter edge decoupled
src/shell/layout.js       # renderPage → async loader map (P at :46-68)
src/pages/settings.js     # split candidate #1 (−55 kB measured)
src/pages/design-system.js# split candidate #2
src/pages/members.js      # split candidate #3
src/pages/auth.js         # split candidate #4 (check login-shell boot constraint first)
scripts/i18n-scan.mjs     # LOCALE_NAMES exclusion set fed from the shared name map
test/<new>.test.mjs       # 500 kB build test + fixture-locale test (build-locales.test.mjs is the template)
```

## In-Repo Facts (verbatim, read this session)

### Already-shipped DELIV-02 work (do not redo)
- [VERIFIED: src/lib/qr.js, whole file read] async `renderQrSvg` with cached promise + retry-reset on rejection — D-03 fully implemented; the settings 2FA render sites are already async (7d6da16 fixed the fixture suite to await).
- The entry at main HEAD is 606,073 B **with** this work included.

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
The staleness block slots directly below, same fail-closed shape (`dataDir` cleanup + `process.exit(1)`). The mkdtemp at :17 happens *before* the check — the guard must keep cleaning it up.

### Vite 6 build options (D-04 / DELIV-02)
- [VERIFIED: node_modules/vite/dist/node/chunks/dep-3O3b9SCF.js:46250] `chunkSizeWarningLimit: 500,` — the 500 kB default is live; the baseline build emits this exact warning at 606.07 kB.
- [VERIFIED: node_modules/vite/dist/node/chunks/dep-3O3b9SCF.js:46243] `manifest: false,` — must be enabled.
- [VERIFIED: node_modules/vite/dist/node/chunks/dep-3O3b9SCF.js:10759] `fileName: typeof buildOptions.manifest === "string" ? buildOptions.manifest : ".vite/manifest.json",` — manifest lands at `dist/.vite/manifest.json`.
- **Vite major correction (carried from rev 1):** installed vite is 6.4.4; `.planning/research/STACK.md`'s "Vite 8.3.x / advancedChunks" guidance is inapplicable. Use neither advancedChunks nor manualChunks.

### The i18n integration surface (D-07 / D-08 / D-09) — re-verified, unchanged
- [VERIFIED: src/core/i18n.js:9-12] hardcoded registry: `LOCALES = Object.freeze([{ code: 'en', name: 'English' }, { code: 'fr', name: 'Français' }]);`
- [VERIFIED: src/core/i18n.js:24] `loaders = import.meta.glob(['../locales/*.json', '!../locales/en.json']);` inside try/catch; plain Node leaves `loaders = {}`. Derived codes must be `Object.keys(loaders) ∪ {BASE_LOCALE}` so plain-Node behavior is preserved.
- [VERIFIED: src/core/i18n.js:36] `registerCatalogue(BASE_LOCALE, en);` — static en invariant. Untouched by all splitting work (i18n.js is first-paint shell).
- Registry consumers: i18n.js:49, :103, :123, :195; `availableLocales()` :131-133; language select rendered from `availableLocales()` [VERIFIED: src/pages/settings.js:96].
- [VERIFIED: vite.config.js:10-16] `BUILD_LOCALES` from `process.env.LOCALES || 'en,fr'` — the `'en,fr'` default is what D-09 removes.
- [VERIFIED: scripts/i18n-scan.mjs:182] `const LOCALE_NAMES = new Set(['English', 'Français']);` — feed from the shared name map.
- [VERIFIED: scripts/i18n-scan.mjs:1609-1612] scan main() reads only en.json and fr.json — a fixture `xx.json` is invisible to parity/dead-key gates provided its display name string doesn't appear unexcluded in scanned src.
- [VERIFIED: test/build-locales.test.mjs:26-35] the spawn-real-build harness (`spawnSync(process.execPath, [VITE_BIN, 'build', '--outDir', outDir, …])`) — reuse for the 500 kB gate and the fixture test.

### Standing invariants the plan must not break
- EN base catalogue statically imported and inlined in the entry chunk (proven by test/build-locales.test.mjs:171-178). **No splitting edge touches i18n.js or the en.json import.**
- Full suite green: `npm test` = `node --test --test-concurrency=2 test/*.test.mjs`; lint (`eslint .`) and `prebuild` i18n scan also gate builds.
- e2e suite (109/109 at v2.1 close) exercises every route — the async renderPage change is validated by it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chunk hashing | Custom dist hashing | `build.manifest: true` + `.vite/manifest.json` | Vite already content-hashes every asset; the manifest IS the hash table |
| Chunk splitting | `manualChunks` grouping | Plain dynamic `import()` | Rollup auto-splits; manualChunks risks dragging the EN catalogue out of the entry |
| Async page loading | Router library / transition framework | async `renderPage()` + existing `skeleton()` | The route table already exists (layout.js:46-68); skeleton is the established loading state |
| staleness diffing | mtime/`stat` comparison | manifest-content hash vs build-time stamp | D-04; mtime lies under git checkout |
| scanning src for locale files | new glob/regex walker | `fs.readdirSync(src/locales)` in config; `Object.keys(loaders)` in client | Two proven surfaces already exist |
| build-contract tests | new test framework | node:test + spawnSync vite build | build-locales.test.mjs is a complete working template |

**Key insight:** every mechanism this phase needs already has a house precedent. The new work is *measured* splitting — apply edges incrementally and let the D-02 gate decide when to stop.

## Common Pitfalls

### Pitfall 1: ✅ RESOLVED (was: sync QR render site) — committed in 7e45d82/7d6da16. Kept for history.

### Pitfall 2: The seed edge has THREE static consumers, not two
**What goes wrong:** converting only actions.js leaves store.js:5 pulling seed.js into the entry (the original plan's exact failure). Also, `confirmDlg({ run: () => { S.data = seed(); } })` callbacks are not async — a bare `await` there is a **build error** (verified this session).
**How to avoid:** store.js gets `emptyState()` + `ensureSeedData()`; actions.js run callbacks become `async`; main.js:10 bare import is deleted (verified side-effect-free).
**Warning signs:** seed still in entry (`ls dist/assets/ | grep seed` shows nothing after a correct build — the seed chunk only exists when fully converted).

### Pitfall 3: Derived registry breaks plain-Node i18n (unchanged)
Derive codes = glob keys ∪ {BASE_LOCALE}; keep static en + `registerCatalogue(BASE_LOCALE, en)`. Regression net: catalogue/i18n unit tests.

### Pitfall 4: The i18n-scan flags new name-map strings (unchanged)
Feed `LOCALE_NAMES` (i18n-scan.mjs:182) from the shared name map; fixture test must prove the gate stays green with the fixture present.

### Pitfall 5: Guard skips its cleanup on exit (unchanged)
Mirror the missing-dist branch exactly (rmSync + exit 1) — mkdtemp precedes the check.

### Pitfall 6: Fixture file left behind poisons later runs (unchanged)
try/finally around fixture write/build/assert; assert absence in `after()` too.

### Pitfall 7: Trusting the manifest filename list for chunk sizes (unchanged)
Measure `.js` files under `assets/` (or manifest `chunk`-type entries); rule: any emitted `.js` asset > 500 kB fails.

### Pitfall 8 (NEW): Stub-style estimates overstate real page-split gains
**What goes wrong:** planning from the stub deltas (−119 kB for six pages) and stopping one edge early — shared dependencies hoisted back into the entry shrink each real edge's gain; the gate fails by a few kB.
**How to avoid:** treat the deltas as upper bounds; after each edge, run the real build; add the next edge until the gate passes. Recommended order by measured value: settings (−55.0) → design-system+members (from the −63.9 kB remainder for auth+design-system+members+search+activity) → seed (−14.7) → auth/search/activity as needed.
**Warning signs:** `(!) Some chunks are larger than 500 kB` still in build output after the planned edges.

### Pitfall 9 (NEW): Page-split breaks first paint or the login shell
**What goes wrong:** making `renderPage` async delays the boot route; splitting auth.js delays the logged-out login render; users see a blank/skeleton flash where paint used to be instant.
**How to avoid:** keep the boot route's page (home; auth shell if unauthenticated boot is a served state) statically in the entry — loader map values may be sync for those routes; other routes render the existing skeleton while loading. Verify with e2e: all 109 specs must stay green.
**Warning signs:** e2e navigation specs flake/fail on missing content; visual regression on boot.

### Pitfall 10 (NEW): Node suites silently lose seeded data
**What goes wrong:** suites relying on store's implicit sync seed fallback get `S.data` null (measured: demo-workspace throws at store.js:462).
**How to avoid:** the `emptyState()` + `ensureSeedData()` contract (see Measured Chunk Composition) plus explicit `seed()` imports in the 3 affected suites' setups.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vite 8 `advancedChunks` (prior milestone research) | Vite 6.4.4; dynamic import() auto-split | measured | STACK.md §Vite-8 guidance inapplicable |
| Two-edge split reaching 500 kB (rev 1 premise) | **Refuted** — page-module splitting required | measured this session | D-01 must be revised by the planner |
| Hardcoded LOCALES array | Glob-derived registry + name map | this phase | Adding a locale = one JSON file |

**Deprecated/outdated for this repo:**
- `.planning/research/STACK.md` Vite-8 advancedChunks guidance — ignore.
- STATE.md flag "verify Vite major" — resolved: 6.4.4.
- Original research's Pitfall 1 (sync QR templates) — shipped/resolved.

## Recommended DELIV-02 combination (for the planner's D-01 revision)

Target: entry ≤ 500,000 B (Vite gate; 512,000 B KiB reading is met automatically).

| Step | Edge | Measured/estimated entry | Cumulative Δ |
|------|------|--------------------------|--------------|
| 0 | baseline (committed) | 606,073 B | — |
| 1 | settings.js dynamic (decouple strengthMeter first) | ~551,080 B | −55.0 kB |
| 2 | design-system.js + members.js dynamic | ~490–505 kB (est. from remainder delta −63.9 kB across 5 pages) | −46 to −60 kB |
| 3 | seed lazy via emptyState/ensureSeedData contract | −14.7 kB more | |
| 4 | auth.js / search.js / activity.js dynamic — only if gate still red | each small (auth ~−20 kB raw…) | |

Steps 1-3 land ≈ **472–496 kB** — under the gate with modest margin, even with shared-dep hoisting losses. Keep `home` (and the login shell if needed) static; EN catalogue inline throughout. The D-02 build test is the acceptance arbiter at every step; each step is an independent commit with `vite build` proof.

**What stays in the entry by design:** shell (layout/render/store/i18n/ui), actions core (`actions.js` + events/keyboard/drag-drop), home page, EN catalogue, icons module. What leaves: settings, design-system, members, seed, qrcode (done), and (if needed) auth/search/activity.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `build.manifest: true` works with `--outDir` overrides in test builds | build tests | Minor — harness can read assets dir directly |
| A2 | sha256-of-manifest stamp detects staleness reliably (identical rebuild = acceptable no-op false-negative) | Pattern 3 | Low — discretion covers variants |
| A3 | Real dynamic-import page splits retain shared deps in entry, so per-edge gains land between 0 and the stub deltas; steps 1-3 still clear the gate | Recommended combination | Medium — mitigated by build-verify after each edge (D-02 gate + checkpoint) |
| A4 | Only 3 node suites (browser-push, demo-workspace, i18n-search) break on seed-lazy; catalogue passes | Migration contract | Low — run full `npm test` when implementing; the contract lists them as explicit tasks |
| A5 | Unauthenticated boot renders via renderAuth in the same entry boot path (auth.js may need to stay static if e2e logs out mid-suite) | Pitfall 9 | Medium — planner should confirm with a grep of boot flow before choosing auth.js as a split edge |
| A6 | No page module has load-time side effects (verified for the six candidates by reading exports) | Pattern 2 | Low |

## Open Questions (RESOLVED / CARRIED)

1. **Stamp mechanism** — RESOLVED: stamp file inside dist/ via closeBundle hook (56-02 Task 1).
2. **QR async UX placement** — RESOLVED and SHIPPED (7e45d82).
3. **How to reach 500 kB** — RESOLVED BY MEASUREMENT: two edges insufficient; page-split combination above. The planner revises D-01 accordingly (user already ruled the gate must pass).
4. **auth.js split viability** — CARRIED (A5): planner confirms boot/login render path before listing auth.js as an edge.

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
| Quick run command | `npm test` (full; per-file: `node --test test/<file>.test.mjs`) |
| Full suite command | `npm test && npm run lint && node scripts/i18n-scan.mjs` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DELIV-01 | guard exits non-zero on stale dist | unit (spawn server.mjs against doctored dist, assert exit 1 + message) | `node --test test/<new-e2e-guard>.test.mjs` | ❌ Wave 0 |
| DELIV-02 | no chunk > 500 kB | unit (spawn real vite build; assert asset sizes) | `node --test test/<new-build-size>.test.mjs` | ❌ Wave 0 (harness: test/build-locales.test.mjs) |
| DELIV-02 | EN catalogue stays in entry chunk | unit | existing build-locales.test.mjs assertions | ✅ |
| DELIV-02 | seed/qrcode/page chunks actually split | unit (assert seed chunk exists in build output) | same new build-size test | ❌ Wave 0 |
| I18N-01 | fixture locale offered/loaded/en-fr untouched/gate clean | unit (fixture inject + real build + scan main()) | `node --test test/<new-locale-fixture>.test.mjs` | ❌ Wave 0 |
| I18N-01 | derived registry parity with old behavior | unit | existing catalogue/i18n suites | ✅ |
| DELIV-02 | e2e green on async-render shell | e2e (all routes navigated) | `npm run e2e` | ✅ (109 specs) |
| DELIV-02 | seed-lazy contract keeps node suites green | unit | `node --test test/browser-push.test.mjs test/demo-workspace.test.mjs test/i18n-search.test.mjs` | ✅ (need setup updates) |

### Sampling Rate
- **Per task commit:** targeted `node --test test/<touched>.test.mjs` + `npx vite build` size check
- **Per wave merge:** `npm test`
- **Phase gate:** `npm test` + lint + i18n scan + `npm run e2e` green on the split build

### Wave 0 Gaps
- [ ] `test/e2e-server-guard.test.mjs` (or house naming) — DELIV-01
- [ ] `test/build-chunk-size.test.mjs` — DELIV-02 (incl. split-chunk existence assertions)
- [ ] `test/locale-registry-fixture.test.mjs` — I18N-01 (D-08 proof)
- [ ] setup updates in browser-push / demo-workspace / i18n-search for the async-seed contract

## Security Domain

No new inputs, endpoints, auth, crypto or storage this phase. The e2e guard is a fail-closed integrity check; the i18n-scan gates protect against unescaped/unknown literals. `security_enforcement` treated as enabled; nothing new to mitigate.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | no (no new inputs) | existing escHtml discipline unchanged |
| V6 Cryptography | no (hashing for integrity only, not secrecy) | node:crypto sha256 of manifest |

## Sources

### Primary (HIGH confidence — read/measured this session)
- Fresh `vite build` runs (baseline 606,073 B; seed-lazy 591,380 B; settings-only 551,080 B; six-page stub 487,150 B) — all experiments applied and reverted, tree clean
- `src/core/store.js`, `src/lib/qr.js`, `src/main.js`, `src/shell/layout.js`, `src/shell/render.js`, `src/actions/actions.js`, `src/pages/settings.js` (+ exports of the six page candidates), `e2e/server.mjs`, `src/core/i18n.js`, `vite.config.js`, `scripts/i18n-scan.mjs`, `test/build-locales.test.mjs`, `package.json`
- Installed Vite 6.4.4 source (`node_modules/vite/dist/node/chunks/dep-3O3b9SCF.js:46243,46250,10759`)
- Git history: 7e45d82, 7d6da16, 733074c (committed QR work + replan decision)

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` / `ARCHITECTURE.md` / `PITFALLS.md` — rationale useful; Vite-8 API guidance corrected by this document

## Metadata

**Confidence breakdown:**
- Measured chunk composition: HIGH — every number is from a build run this session
- Standard stack: HIGH — installed versions read directly
- Architecture/patterns: HIGH — integration points read and quoted verbatim; async-render contract derived from actual source shapes
- Recommended combination: MEDIUM — real dynamic-import gains sit below stub upper bounds (A3); D-02 gate + per-edge build verification is the designed mitigation
- DELIV-01 / I18N-01 designs: HIGH — re-verified unchanged from rev 1

**Research date:** 2026-11-12 (revision 2)
**Valid until:** 2026-12-12 (stable — no new deps; Vite pinned)
