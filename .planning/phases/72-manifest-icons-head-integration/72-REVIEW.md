---
phase: 72-manifest-icons-head-integration
reviewed: 2026-11-18T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - public/manifest.webmanifest
  - e2e/manifest.spec.mjs
  - test/manifest-contract.test.mjs
  - test/icon-contract.test.mjs
  - server.js
  - index.html
  - public/icon-192.png
  - public/icon-512.png
  - public/icon-maskable-192.png
  - public/icon-maskable-512.png
  - public/apple-touch-icon.png
  - public/icon-maskable.svg
findings:
  critical: 0
  warning: 0
  info: 4
  total: 4
status: clean
---

# Phase 72: Code Review Report

**Reviewed:** 2026-11-18
**Depth:** standard
**Files Reviewed:** 12
**Status:** clean

## Summary

Reviewed the manifest/icon/head integration against the phase's locked decisions (D-01…D-14) and milestone standing constraints. Verified independently:

- **server.js three-touch diff (D-12):** MIME map entry `'.webmanifest': 'application/manifest+json'` with no charset suffix (line 8038), `.webmanifest` in the `COMPRESSIBLE` Set literal (line 8040), and `manifest.webmanifest` in the `cacheControl()` no-cache branch alongside `index.html`/`sw.js` (line 8098). No other `server.js` changes; CSP untouched per D-14 (`default-src 'self'` covers manifest + PNGs).
- **PNG binaries (IHDR bytes, not visuals):** all five PNGs carry valid PNG signature + IHDR; dimensions byte-verified as 192×192 / 512×512 / 192×192 / 512×512 / 180×180; all are 8-bit RGB **without alpha** (`file` reports "8-bit/color RGB"), so apple-touch-icon has no transparency for iOS to flatten (Pitfall 3 satisfied). Contract tests parse the same bytes and pass.
- **manifest.webmanifest:** parses as JSON; frozen field set (name/short_name, `id`/`start_url`/`scope` = `/`, standalone, `#1D1338`/`#fbfaf8`) and exactly four icon entries in the pinned order, purposes `any/any/maskable/maskable`; no apple-touch entry in the manifest (D-11). Every icon src resolves to a real committed file.
- **index.html head (D-10/D-11):** exactly one `rel="manifest"` link, exactly one static theme-color meta (`#1D1338`, no media pair), all three iOS metas, apple-touch-icon link; the `rel="icon"` favicon swap target untouched. The runtime per-workspace favicon swap (`src/shell/layout.js:142` `querySelector('link[rel="icon"]')`) is unaffected — the exact-match selector can't collide with the new links.
- **Standing constraints:** `public/sw.js` last touched at commit 6d303a9 (phase 59) — zero phase-72 edits; zero new dependencies; manifest/PNGs live in `public/` (Vite verbatim copy, no chunk-gate impact); no offline caching added.
- **Tests:** `node --test test/manifest-contract.test.mjs test/icon-contract.test.mjs` → 20/20 pass. e2e fixture `e2e/server.mjs` exists; the header assertions (200, exact `application/manifest+json` content-type, `no-cache`) match what `sendFile()`/`cacheControl()` actually emit — the server writes `Content-Type` verbatim from the MIME map with no charset suffix (line 8073), so the exact-match e2e assertion is correct.

No bugs, security issues, or contract violations found. Four minor (Info-level) quality notes below; none block ship.

## Info

### IN-01: `public/icon-maskable.svg` ships to production but is referenced by nothing at runtime

**File:** `public/icon-maskable.svg` (repo-wide: only `test/icon-contract.test.mjs` reads it)
**Issue:** The maskable re-render source (D-03/D-06) sits in `public/`, so Vite copies it into every `dist/` build and it is servable to clients, yet neither the manifest nor `index.html` references it. It is a build-time source asset, not a runtime asset.
**Fix:** Either move it out of `public/` (e.g., `.planning/assets/` or a `tools/` directory) at the next opportunity, or accept the ~4.5 KB dead asset with a comment in the contract test documenting why it stays under `public/`. Not worth a re-review cycle on its own.

### IN-02: `icon-maskable.svg` retains a `prefers-color-scheme: dark` variant diverging from the frozen light render (D-05)

**File:** `public/icon-maskable.svg:6-11`
**Issue:** The SVG still carries the dark-scheme CSS variable overrides, but D-05 freezes the **light-scheme** rendering as the canonical committed PNG set. If someone re-rasterizes the SVG with default (dark-device) settings in the future, the regenerated maskable/apple-touch PNGs will silently diverge from the frozen brand colors — the contract tests pin only dimensions/alpha, not colors.
**Fix:** When re-rendering is ever needed, force the light scheme (`.ps-theme-light` class is already present in the SVG at line 12 — rasterize with that class applied, or strip the media query from this source copy). Optionally note this in a comment at the top of the file.

### IN-03: `apple-touch-icon` head link omits the `sizes` attribute

**File:** `index.html:14`
**Issue:** `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />` declares no `sizes`. Modern iOS scales as needed, but some legacy tooling/launchers default to 57×57 when `sizes` is absent.
**Fix:** `sizes="180x180"` — one attribute; would require updating the byte-pinned substring in `test/manifest-contract.test.mjs:124` in the same change.

### IN-04: Manifest omits `lang`/`dir` fields

**File:** `public/manifest.webmanifest`
**Issue:** The app is EN+FR, but the manifest declares no `lang`/`dir`, so installers use the platform default for rendering `name`/`short_name`. Cosmetic; the frozen field set (D-08/D-09) intentionally pins a minimal manifest, so this may be a deliberate omission.
**Fix:** None required now; if added later, it must be pinned in both `test/manifest-contract.test.mjs` and the e2e `MANIFEST_FIELDS` fixture to keep the double-pinning (D-13) consistent.

---

_Reviewed: 2026-11-18T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
