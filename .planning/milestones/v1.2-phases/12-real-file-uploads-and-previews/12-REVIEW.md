---
phase: 12-real-file-uploads-and-previews
reviewed: 2026-10-25T16:48:30Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - e2e/flows.spec.mjs
  - src/locales/en.json
  - src/locales/fr.json
  - src/overlays/modals.js
  - src/styles/overlays.css
  - test/fixtures/icons-baseline.json
  - test/i18n-core-features.test.mjs
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 12 (plan 12-08, G-12-6): Incremental Code Review Report

**Reviewed:** 2026-10-25T16:48:30Z
**Depth:** standard
**Files Reviewed:** 7 (diff base `0486d1d`)
**Status:** issues_found

## Summary

Wave-scoped review of plan 12-08 (G-12-6: Firefox PDF toolbar width). The changed surface is small and coherent: a `.modal.xl` (900px) class applied only to PDF file previews, the PDF iframe height raised from `min(70vh,560px)` to `min(75vh,640px)`, a PDF-only footer Download anchor, the `act.download` i18n keys, e2e assertions for the xl class / iframe width / real download event, and the two frozen-guard bumps (catalogue 1531→1532, icon baseline 171→172).

Verified correct during review:

- **Geometry invariant.** At the e2e viewport (1280px) the iframe renders at 900 − 32 (`.modal-b` padding) − 2 (border) = 866px, matching the CSS comment (`overlays.css:42-43`) and crossing pdf.js's 750px breakpoint with headroom.
- **Escaping.** `esc()` is the re-export of `i18n.js`'s `escHtml` (`src/core/utils.js:15`), which escapes `"` → `&quot;` — `download="${esc(f.name)}"` (`modals.js:325`) is attribute-safe (T-12-18 claim confirmed). The href is built only from server-generated `ws.url` (slug-validated) and `f.id` (id-validated) — no injection path.
- **No event-handler interference.** The anchor intentionally carries no `data-a`; the global click delegate (`src/actions/events.js:36-39`) only `preventDefault()`s BUTTON/checkbox elements, so native same-origin download navigation is untouched.
- **Frozen guards are honest.** Ran `lucideIconNames('src')` against the fixture: 172 names, `deepEqual` true, `download` resolves to lucide's `Download` so `ic('download', 14)` renders a real icon (the fallback rect is not hit). Fixture stays sorted. Catalogue: en and fr both carry exactly 1532 top-level keys with `act.download` = "Download"/"Télécharger"; en/fr parity holds (only the `contract.*` sentinels differ, the established pattern). The e2e `suggestedFilename()` assertion is backed by the server's RFC 6266 sanitizer (`server.js:1924`) plus the same-origin `download` attribute override.
- **e2e logic.** `Promise.all([waitForEvent('download'), click])` is the correct Playwright pattern; the `>800px`/`>400px` geometry polls and the xl-class assertion cannot pass while the G-12-6 regression exists; the modal-scroll interplay (75vh iframe inside the 80vh-capped modal) leaves the Firefox toolbar — which sits at the iframe's top — visible.

No blockers found. One warning (the xl invariant silently fails below ~816px viewport width) and two info items.

## Warnings

### WR-01: `.modal.xl` width invariant silently fails below ~816px viewport width — the exact regression G-12-6 fixes reappears on narrow screens

**File:** `src/styles/overlays.css:44-46` (with `src/overlays/modals.js:313` and `e2e/flows.spec.mjs:821-828`)
**Issue:** The plan's stated invariant is "the in-iframe viewport is ≥750px so pdf.js keeps its full toolbar". The CSS delivers that only while the viewport is wide enough: iframe width = min(866, viewport − 66) on desktop (16px `.modal-wrap` side padding + 32px `.modal-b` padding + 2px border; on the mobile breakpoint `.modal-wrap` padding is 0, so min(866, viewport − 34)). Below a **~816px CSS viewport width** (tablet portrait, split view, small windows, phones) the iframe drops back under pdf.js's 750px breakpoint and the direct download/print buttons collapse into the '»' secondary menu — precisely the bug this plan closes. The e2e pins only the 1280px Desktop Chrome viewport, so nothing guards or even documents the narrow-viewport behavior. The new footer Download anchor does preserve the core user need (saving the file) at every width, which is why this is a warning and not a blocker — but the fix's headline claim ("the toolbar stays full") is currently true only above one tested size, and the plan adds no statement that below ~816px the download anchor is the intended fallback.
**Fix:** Either (a) document the accepted limitation at the `.modal.xl` rule and in the e2e comment (the Download anchor is the sub-816px affordance), or (b) restore the affordance at narrow widths — e.g. keep the anchor and add an "open in new tab" entry point, or accept the collapsed toolbar below the breakpoint by design. Minimum: add a narrow-viewport e2e assertion pinning whichever behavior is chosen, so the fallback is contractual rather than incidental.

## Info

### IN-01: G-12-6 is a Firefox-specific behavior proven only in the Chromium project

**File:** `e2e/playwright.config.mjs:31` (projects list) / `e2e/flows.spec.mjs:823-828`
**Issue:** The suite runs a single `chromium` project, yet G-12-6 targets Firefox's embedded pdf.js toolbar. The ≥750px invariant is pure CSS geometry, so the Chromium width/height polls are a sound browser-independent proxy and the fix is not unproven — but no run anywhere exercises the actual Firefox toolbar rendering (button visibility inside the viewer), which is the acceptance criterion the plan names.
**Fix:** Acceptable as-is for this wave if recorded as a known proxy. If Firefox coverage ever matters, add a `firefox` project (even a smoke-only one) that asserts the viewer's download/print buttons are visible in the opened PDF modal.

### IN-02: Width assertion (`toBeGreaterThan(800)`) is looser than the documented ≥866px invariant

**File:** `e2e/flows.spec.mjs:826-828`
**Issue:** The comment above the poll states the viewport is "≥866px at the 900px modal", but the assertion only requires >800. This is still regression-safe — 800 > 750, so the guard can never pass while the G-12-6 bug exists — and the ~66px headroom tolerates scrollbars and subpixel rounding. It is nonetheless a drift between the documented invariant and the pinned value: a future change that shrank `.modal.xl` to ~860px (iframe ≈826px) would pass the guard while eating most of the safety margin, with no test noticing.
**Fix:** Assert the invariant the comment claims, e.g. `toBeGreaterThan(850)` (866 minus scrollbar/rounding tolerance), or update the comment to state the 800px floor and why it is sufficient.

---

## Verified-clean checklist (diff-scoped)

- `modals.js:58` — `wrap(m.file?.type === 'pdf' ? 'xl' : 'lg', …)`: all three `openModal({type:'filePreview'})` call sites (`actions.js:874-882`, `palette.js:173`) always pass `file`; non-PDF previews keep `lg`; the image branch keeps `aspect-ratio:16/9` (D-10 untouched).
- `modals.js:313` — iframe height `min(75vh,640px)` matches the e2e height poll (>400px at the 720px e2e viewport: 75vh = 540px).
- `modals.js:324-326` — Download anchor is PDF-only, `esc()`-escaped filename, icon resolves in the frozen subset, no `data-a` (native navigation by design).
- `overlays.css:44-46` — `.modal.xl` is a new isolated class; no other `.xl` collision in overlays; math comment matches the implementation.
- `en.json` / `fr.json` — single `act.download` each, correct position among `act.*` keys, no key-count drift (1532/1532), parity preserved.
- `icons-baseline.json` — 172 sorted entries; equals `lucideIconNames('src')` exactly (verified by execution, not inspection).
- `i18n-core-features.test.mjs:216-229` — both frozen-guard literals updated consistently with the real catalogue/icon state; title changelog convention maintained.
- `flows.spec.mjs` — download-anchor assertions (visibility, catalogue label, href, real download event, `paper.pdf` suggested name) all correspond 1:1 to implementation facts; the per-language upload workspaces keep en/fr runs isolated.

---

_Reviewed: 2026-10-25T16:48:30Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
