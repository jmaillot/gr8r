---
phase: 56-delivery-infrastructure
reviewed: 2026-11-12T12:41:04Z
depth: standard
files_reviewed: 17
files_reviewed_list:
  - test/build-chunk-size.test.mjs
  - test/e2e-server-guard.test.mjs
  - test/locale-registry-fixture.test.mjs
  - e2e/server.mjs
  - scripts/i18n-scan.mjs
  - scripts/locales.mjs
  - src/actions/actions.js
  - src/core/i18n.js
  - src/core/locale-names.js
  - src/core/searchall.js
  - src/core/store.js
  - src/data/seed.js
  - src/main.js
  - src/overlays/palette.js
  - src/shell/layout.js
  - src/ui/strength.js
  - vite.config.js
findings:
  critical: 1
  warning: 4
  info: 5
  total: 10
status: issues_found
---

# Phase 56: Code Review Report

**Reviewed:** 2026-11-12T12:41:04Z
**Depth:** standard
**Files Reviewed:** 17
**Status:** issues_found

## Summary

The phase delivers its three goals mechanically: the entry chunk measures 499,981 B against the 500,000 B gate, all seven split-existence assertions name real chunks on disk (`dist/assets/` verified), the stale-dist guard fails closed on missing/manifest-mismatching dist, and the locale registry is genuinely derived from the glob keys with the name map shared through `scripts/locales.mjs`. The full `node --test` suite passes (1403 tests, 0 fail), the i18n scan gate reports 0 violations, and the seed-lazy migration contract was executed properly (test suites seed explicitly, `A.confirmOk` gained a rejection handler).

The one critical defect is in the async-render contract itself: for async-loader routes **every** `render()` paints a skeleton into `#main-content` and re-runs the dynamic import, so any interaction that re-renders per keystroke on a split page (search box, member filter, timezone search) loses the input's focus and caret after the first character — a functional regression the pre-split synchronous `renderPage()` did not have. The remaining findings are robustness gaps in the boot-time seed promise, a razor-thin gate margin, and flaky tmpdir-window assertions.

Verified positive notes (no action): `e2e/server.mjs` never reads mtime and refuses a manifest-less dist (fail-closed on absent evidence); `test/e2e-server-guard.test.mjs` proves all three branches against the real process; `vite.config.js` correctly pins `enforce: 'pre'` for both virtual modules and stamps its own `--outDir`; `src/ui/strength.js` and `src/core/searchall.js` are clean verbatim extractions with no residual entry→lazy import edges (grep-verified).

## Critical Issues

### CR-01: Per-keystroke inputs on async routes lose focus and caret after the first character

**File:** `src/shell/layout.js:62-107` (with `src/shell/render.js:213-231` and `src/actions/actions.js:2936-2939, 2798-2801, 3207-3225`)
**Issue:** For every route in `ASYNC_ROUTES`, `renderPageSync()` returns `null`, so the shell template (`layout.js:117`) paints `skeleton()` into `#main-content` on **every** render, and the real page HTML only arrives when `fillPage()`'s dynamic import resolves. But `render()` restores focus synchronously (`render.js:227-236`: `getElementById(fid)` / `tryFocus(fkey)`) *before* the awaited import resolves — at that moment the skeleton DOM has no matching element, so restoration silently no-ops, and `fillPage()` swaps in the page HTML afterwards with no focus/caret restoration at all (`layout.js:96-99` writes `innerHTML` only).

Three shipped surfaces have inputs whose `IN.*` handlers call `render()` per keystroke and sit on async routes:
- Search page `#search-page-q` → `IN.searchQ` (`actions.js:2936-2939`)
- Members page `#mem-q` → `IN.memQ` (`actions.js:2798-2801`)
- Settings timezone search `#tz-q` → `IN.tzSel` (`actions.js:3207-3225`)

Chain verified line-by-line: keystroke → `IN.x` sets state → `render()` → skeleton painted → `fillPage()` starts an async boundary → focus restore runs against the skeleton (element absent) → import resolves → `innerHTML` swap → activeElement is `<body>`, caret gone. Typing more than one character is impossible without re-clicking the field on each keystroke. The pre-phase synchronous `renderPage()` re-created the element with the same `id` before the focus-restore block ran, which is why this worked before.

**Fix:** Serve the warm page synchronously and restore focus across the async swap. Minimal shape — cache the last resolved HTML and have `fillPage()` restore focus/caret after the swap:

```js
/* layout.js */
const warm = new Map(); // route -> last html
export function renderPageSync() {
  const r = S.ui.route;
  if (ASYNC_ROUTES.has(r)) return warm.get(r) ?? null; // warm: paint instantly, no skeleton
  ...
}
export async function fillPage() {
  ...
  const html = await renderPage();
  if (seq !== _fillSeq || S.ui.auth || S.ui.route !== r || S.ui.loading) return;
  const el = document.getElementById('main-content');
  if (el) {
    const a = document.activeElement;
    const s0 = a && 'selectionStart' in a ? a.selectionStart : null;
    el.innerHTML = html;
    warm.set(r, html);
    /* re-restore focus+caret the render() pass could not place on the skeleton */
    const k = a && (a.id ? `#${a.id}` : null);
    if (k) { const n = el.querySelector(k); if (n) { n.focus({ preventScroll: true }); if (s0 != null) n.setSelectionRange(s0, s0); } }
  }
}
```

(Also clear the cache entry when `go()` navigates to a *different* async route, so a stale page never paints before its chunk resolves.)

## Warnings

### WR-01: Every full render on an async route flashes the skeleton and refills the page

**File:** `src/shell/layout.js:90-107, 117`
**Issue:** Same root cause as CR-01, the non-input symptom: any full `render()` while on `settings`/`members`/`member`/`teams`/`team`/`system`/`states`/`activity`/`search` — receiving a notification (30 s poll re-render on unread flip), opening/closing the command palette, a toast-triggering action, locale switch — repaints the whole `#main-content` as a skeleton and re-runs the loader, then swaps (nearly) identical HTML back in. Visible churn on every notification-driven re-render; also defeats `render()`'s `data-keep` scroll restoration for content painted after it. No HTML cache exists: `fillPage()` re-awaits and re-writes every time.
**Fix:** The `warm`-map cache from CR-01 resolves this too — a re-render of an already-loaded route paints the cached HTML synchronously and `fillPage()` becomes a no-op unless the HTML changed (recompute and compare before writing).

### WR-02: Boot-path seed fetch is unguarded and its failure is memoized forever

**File:** `src/main.js:292` and `src/core/store.js:78-88`
**Issue:** `main.js` init runs `if (!withServer && !saved?.data) await ensureSeedData();` inside the boot IIFE with no catch. `ensureSeedData()` memoizes the promise: `seedPromise = import('../data/seed.js').then(...)`. If the seed-chunk fetch fails once (offline preview, transient network, corrupt cache), the promise is a **permanently rejected** memo — every later call re-throws, `init()` aborts before its first `render()`, and the demo boot is a blank page for the whole session (the error is an unhandled rejection, surfacing only in the console). The pre-phase synchronous seed could never fail this way. The action paths are fine (`A.confirmOk` at `actions.js:3100-3108` catches and toasts), but the boot path has no degrade.
**Fix:** Degrade to the empty state instead of aborting boot, and do not poison the memo on failure:

```js
export async function ensureSeedData() {
  if (!seedPromise) {
    seedPromise = import('../data/seed.js')
      .then(m => { S.data = m.seed(); })
      .catch(e => { seedPromise = null; throw e; }); // allow retry; caller decides
  }
  try { await seedPromise; } catch (e) {
    console.error(e);
    toast(e?.message || t('toast.errGeneric'), { kind: 'err' }); // boot continues on emptyState()
  }
}
```

### WR-03: The 500 kB gate has 19 bytes of headroom — a hair-trigger regression gate

**File:** `test/build-chunk-size.test.mjs:20` (entry measured at 499,981 B in the current `dist/`)
**Issue:** The entry chunk sits 19 bytes under `MAX_CHUNK_BYTES` (0.004% margin). Any unrelated one-line commit that shifts a few bytes, or any Vite patch update changing minified output, re-fails DELIV-02 in CI with no code-level cause. The gate working as designed is good; a margin this thin makes the failure indistinguishable from "someone added a string" versus "toolchain drift", and invites a reflexive limit bump.
**Fix:** Either (a) leave the gate at 500,000 but land a small deliberate reduction to open working headroom (e.g. move one more lazy edge), or (b) at minimum, record the measured entry size and headroom in a comment next to `MAX_CHUNK_BYTES` so the next gate failure is diagnosable, and keep the split-existence assertions as the structural guard they already are.

### WR-04: tmpdir-window assertions in the guard test are flaky under any concurrent e2e run

**File:** `test/e2e-server-guard.test.mjs:136-143, 161-165`
**Issue:** Both cleanup assertions scan the *shared* `os.tmpdir()` for `projects-e2e-*` directories younger than 60 s and require the list to be empty. A developer (or CI job) running `npm run e2e` concurrently — or another worktree of the same repo — legitimately owns a live `projects-e2e-*` dir, which fails these assertions although this suite's own cleanup worked. The 60 s birthtime window is a heuristic over shared state; it tests the machine, not the wrapper.
**Fix:** Make the wrapper observable instead of scanning the shared tmpdir: expose the dataDir to the test via an env pin (e.g. the test sets `E2E_DATA_DIR` and the wrapper rmSync's exactly that path, with the test asserting non-existence), or assert on a run-unique prefix derived from the spawned child's own env. That keeps the cleanup proof exact and removes the cross-run race.

## Info

### IN-01: Duplicate `node:crypto` import in the e2e wrapper

**File:** `e2e/server.mjs:10, 84`
**Issue:** `createHash` is imported statically at line 10, then line 84 does `(await import('node:crypto')).randomBytes(32)` — a second resolution of the same module on the critical boot path.
**Fix:** `import { createHash, randomBytes } from 'node:crypto';` and use `randomBytes(32)` directly.

### IN-02: `renderPageSync` is exported but never imported

**File:** `src/shell/layout.js:62`
**Issue:** Only `fillPage` is consumed by `src/shell/render.js`; `renderPageSync` is used exclusively inside this module. The export is dead surface (grep-verified: single definition, no importers).
**Fix:** Drop `export`, or keep it only if a follow-up task (the CR-01 cache) plans to consume it.

### IN-03: `localeCodes()` resolves `'src'` against `process.cwd()`

**File:** `scripts/locales.mjs:13-20` (consumed by `vite.config.js:17-23, 66`)
**Issue:** `path.resolve(srcDir)` with the default `'src'` is CWD-dependent. `vite build` is always invoked from the repo root today, but running vite from a subdirectory (or any future script importing `localeCodes` from elsewhere) silently yields a wrong/empty locale set — the English-only build would then embed no locales and only the base catalogue would save it. A silent divergence, not a crash.
**Fix:** Anchor to the module's own location: `const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');` and `path.join(ROOT, srcDir, 'locales')` — the same pattern `scripts/i18n-scan.mjs:34` already uses for `REPO_ROOT`.

### IN-04: The guard test's `after()` restore assertion is tautological

**File:** `test/e2e-server-guard.test.mjs:94-98`
**Issue:** `after()` writes `pristineManifest` back and then asserts the file equals `pristineManifest` — a comparison against the value it just wrote. The meaningful protection is the `finally` inside the stale test (line 130-132), which restores before anything else observes the doctored state; the `after()` assert can never fire independently of that write.
**Fix:** Either remove the redundant assert, or make it meaningful by reading the manifest *before* restoring (assert the on-disk bytes were restored by the stale test's `finally`, not by `after()` itself).

### IN-05: `scanCatalogueKeys` re-runs the full structure analysis once per `t()` call

**File:** `scripts/i18n-scan.mjs:1161-1186` (specifically `analyse(tokens)` inside the per-key loop at line 1177)
**Issue:** For every literal `t('…')` call site, the whole token stream is re-analysed (`analyse(tokens)`) just to extract `callVars`. On a large file with many `t()` sites this repeats identical work N times; the result is always the same for the stream. Correctness is unaffected, but the redundancy is easy to misread as intentional scoping.
**Fix:** Hoist `const info = analyse(tokens);` above the loop (the caller `scanTokens` already computed an `info` it could pass down instead).

---

_Reviewed: 2026-11-12T12:41:04Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
