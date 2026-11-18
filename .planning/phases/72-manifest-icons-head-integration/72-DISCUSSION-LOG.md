# Phase 72 Discussion Log — Manifest, Icons & Head Integration

**Date:** 2026-11-18
**Mode:** default (interactive, no flags)

## Gray areas presented (multiSelect)

Options: Icon source & maskable design / How PNGs get produced / theme & background
colors / Manifest delivery & MIME.
**Selected: all four.**

## Area: Icon source & maskable design

| Q | Options | Selected |
|---|---|---|
| Which brand mark becomes the launch icon? | favicon.svg monogram (rec) / logo-v4 monogram no wordmark / new dedicated artwork | favicon.svg monogram |
| Maskable treatment of full-bleed gradient tile | Full-bleed tile, inset rim (rec) / plain tile glyph only / light maskable variant | Full-bleed tile, inset rim |
| apple-touch-icon background | Dark tile same as maskable (rec) / light tile / let iOS squash | Dark tile |
| `purpose: any` icons look | Faithful to favicon.svg (rec) / same artwork as maskable | Faithful to favicon.svg |

Continuation check → Next area.

## Area: How PNGs get produced

| Q | Options | Selected |
|---|---|---|
| Production method (zero new dev deps) | Agent renders + owner review (rec) / owner provides PNGs / agent renders no review | Agent renders + owner review |
| Which theme rendering frozen into PNGs | Light-scheme render (rec) / dark-scheme render | Light-scheme |
| Review checkpoint mechanics | Per-PNG embed in chat (rec) / self-review after commit | Per-PNG embed in chat |

Continuation check → Next area.

## Area: Theme & background colors

| Q | Options | Selected |
|---|---|---|
| theme_color / background_color combo | Dark frame + light splash (rec) / all light / all dark | Dark frame + light splash |
| `<meta theme-color>` form | Static single value (rec) / light/dark media pair | Static single value |
| iOS meta tags | Capable + black-translucent (rec) / capable only / minimal | Capable + black-translucent |
| Exact theme_color hex | #1D1338 tile-a (rec) / #0A0714 tile-b | #1D1338 |

Continuation check → Next area.

## Area: Manifest delivery & MIME

Scout finding surfaced before questions: `server.js` MIME map has no `.webmanifest`
entry (falls through to `application/octet-stream`); `cacheControl()` no-cache branch
covers only index.html and sw.js.

| Q | Options | Selected |
|---|---|---|
| server.js diff width | MIME + COMPRESSIBLE + no-cache (rec) / MIME + compress only / MIME only | MIME + compress + no-cache |
| Header pinning | Static pin + e2e live check (rec) / e2e only / static only | Static pin + e2e live check |
| CSP stance | Verify-only, no CSP edit (rec) / explicit manifest-src directive | Verify-only |

Continuation check → Next area (done).

## Wrap-up

Final check: "I'm ready for context" — no additional gray areas.

## Agent's discretion items

- Exact safe-zone percentages within the stated ~60–66% glyph / ~80% safe zone.
- Icon filenames under `public/` (research default: `icon-{192,512}.png`,
  `icon-maskable-{192,512}.png`, `apple-touch-icon.png`).
- Manifest field ordering; e2e spec structure for the live header check.

## Deferred ideas

None.
