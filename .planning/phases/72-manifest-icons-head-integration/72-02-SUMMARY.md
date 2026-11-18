---
phase: 72-manifest-icons-head-integration
plan: 02
subsystem: pwa-icons
tags: [pwa, icons, png, manifest, maskable, apple-touch-icon, contract-test]
requires:
  - public/favicon.svg (D-01 source artwork, light-scheme CSS vars)
  - public/manifest.webmanifest (icon srcs from plan 72-01)
  - index.html apple-touch-icon head link (plan 72-01)
provides:
  - public/icon-192.png, public/icon-512.png (purpose any)
  - public/icon-maskable-192.png, public/icon-maskable-512.png (purpose maskable)
  - public/apple-touch-icon.png (180×180 opaque dark tile)
  - public/icon-maskable.svg (re-render source)
  - test/icon-contract.test.mjs (binary-level icon contract)
affects: [PWA installability (PWA-02), Android/iOS launcher icons]
tech-stack:
  added: []
  patterns: [in-session Playwright element-screenshot rasterization (no committed tooling), PNG IHDR byte-level contract assertions]
key-files:
  created:
    - public/icon-192.png
    - public/icon-512.png
    - public/icon-maskable-192.png
    - public/icon-maskable-512.png
    - public/apple-touch-icon.png
    - public/icon-maskable.svg
    - test/icon-contract.test.mjs
  modified: []
decisions:
  - D-07 owner approval obtained before commit (all five PNGs + circle-crop maskable preview reviewed, "Approve")
  - Maskable variants rendered from the inset-rim icon-maskable.svg redesign, not padded any-icon copies (safe-zone ~80%)
  - apple-touch-icon baked opaque (color-type 2 truecolor RGB, no tRNS) to defeat iOS black-flatten (Pitfall 3)
  - Zero JS/deps (D-06): Playwright render script ran in-session only, never committed
metrics:
  duration: continuation session (Tasks 3 + deferred commits)
  completed: 2026-11-18
status: complete
actuals:
  tokens: 20000
  tasks: 3
  commits: 2
commits: 2
plan_head_before: 835d275
plan_head_after: 11bffba
---

# Phase 72 Plan 02: Install Icon Set (5 PNGs + Maskable Source + Contract Test) Summary

**One-liner:** Five owner-approved opaque PNG install icons (any 192/512, maskable 192/512, apple-touch 180×180) rendered from favicon.svg's light-scheme palette plus the maskable SVG re-render source, frozen by a byte-level PNG contract test (exact IHDR dimensions, apple-touch opacity, manifest cross-check).

## What Was Done

- **Task 1 (render):** Rendered all five PNGs via Playwright element-screenshots in-session (light-scheme favicon.svg renders for `any`; inset-rim full-bleed icon-maskable.svg for `maskable`; opaque dark-tile 180×180 for iOS). Verified IHDR dimensions byte-exact, colorType=2, no tRNS. icon-maskable.svg committed as the re-render source.
- **Task 2 (D-07 checkpoint):** Owner reviewed all five PNGs plus a circle-crop preview of the maskable 512 and approved. Confirmed: any-icons match the tab favicon look, no maskable clipping, apple-touch-icon dark-tile opaque, light-scheme colors canonical.
- **Task 3 (contract test):** `test/icon-contract.test.mjs` (node:test, sibling style of test/manifest-contract.test.mjs) asserts: file existence/non-emptiness for all five PNGs; exact IHDR width/height from bytes 16–23 (big-endian uint32); apple-touch-icon opacity via IHDR color-type 2 + absence of tRNS; every manifest icon src resolves to a real PNG under public/; every committed install PNG referenced by manifest or index.html; icon-maskable.svg exists.

## Verification

- `node --test test/icon-contract.test.mjs` — 9 tests, 9 pass, 0 fail
- `npm test` (full suite) — 1770 tests, 1757 pass, 0 fail, 13 skipped (pre-existing skips), exit 0
- `git log` shows the icon commit after owner approval (`01904e4`)
- `git status` clean; no render scripts committed; package.json untouched (zero-new-deps, D-06)

## Commits

| Task | Commit | Files |
| ---- | ------ | ----- |
| 1+2 (icons, post-approval) | 01904e4 | public/icon-192.png, public/icon-512.png, public/icon-maskable-192.png, public/icon-maskable-512.png, public/apple-touch-icon.png, public/icon-maskable.svg |
| 3 (contract test) | 11bffba | test/icon-contract.test.mjs |

## Deviations from Plan

None — plan executed exactly as written (Tasks 1–3; Task 2 checkpoint approved by owner).

## Requirements Completed

- PWA-02 (SC-2): real PNG icons exist at correct sizes, referenced by the manifest; maskable variants owner-verified under circle crop.

## Known Stubs

None.

## Self-Check: PASSED

- All seven created files exist on disk (six in public/, one test file).
- Commits 01904e4 and 11bffba present in git log.
- Full test suite green at commit time.
