---
phase: 12-real-file-uploads-and-previews
plan: 08
subsystem: ui
tags: [pdf-preview, modal-width, pdfjs-breakpoint, firefox, download-attribute, i18n, e2e]

# Dependency graph
requires:
  - phase: 12-07
    provides: the byte-only /w/:slug/file/:id route with its inline Content-Disposition + D-06 header map, the tall PDF iframe, and the full-build-before-e2e run-order rule
provides:
  - .modal.xl (max-width: 900px) — PDF previews render in it, putting the in-iframe viewport at ≈866px, at or above Firefox pdf.js's 750px WIDTH breakpoint so the embedded viewer keeps its full default toolbar (download/print direct buttons visible, not collapsed into the '»' secondary menu)
  - A PDF-only footer Download anchor in the preview modal — a native same-origin <a href="/w/:slug/file/:id" download="..."> (no data-a) whose download attribute overrides the route's inline Content-Disposition client-side, giving a viewer-independent save affordance
  - The act.download i18n key in both catalogues ("Download" / "Télécharger"), en/fr parity intact at 1532 keys
  - e2e proofs: the xl modal class on the PDF modal, a rendered iframe width >800px (old 'lg' was ~686px), and a real browser download event carrying the uploaded filename
affects: [verify-work phase 12, file-preview modal consumers, modal width variants, icon baseline]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 2656        # chars/4 over the realized diff (10627 chars across 7 files)
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Width-class-per-content-type: the modal wrapper's width class is chosen at the switch site (PDF→'xl', everything else→'lg') so widening one content type cannot perturb the others"
    - "Viewer-independent affordance fallback: any affordance that depends on an embedded third-party viewer's toolbar is duplicated in the app's own chrome (the footer anchor), robust to viewer breakpoint drift and sub-783px windows"
    - "Frozen-baseline discipline: the catalogue-size and icon-baseline guards moved deliberately with the change, each documented in its assertion message (+ act.download, phase 12 plan 8; + 'download' icon, 171→172)"

key-files:
  created: []
  modified:
    - src/styles/overlays.css
    - src/overlays/modals.js
    - src/locales/en.json
    - src/locales/fr.json
    - e2e/flows.spec.mjs
    - test/i18n-core-features.test.mjs
    - test/fixtures/icons-baseline.json

key-decisions:
  - "PDFs alone get .modal.xl: the width class is selected per file type at the filePreview case (wrap(m.file?.type === 'pdf' ? 'xl' : 'lg', ...)), so images keep the 'lg' modal and their 16/9 embed and other types keep the download tile — byte-identical non-PDF layout"
  - "The footer download anchor is a native anchor with NO data-a: events.js only preventDefaults buttons and an unknown data-a would be a silent no-op; the click must stay a same-origin navigation that the download attribute turns into a save, overriding the route's inline Content-Disposition client-side (D-03/D-09 route untouched)"
  - "The filename is esc()-escaped at the point of interpolation into the double-quoted download attribute (T-12-18) — the same table that guards the iframe title one line above"
  - "PDF iframe height raised to min(75vh,640px) (the diagnosis's optional bump): more document area under the now-visible toolbar; at the 720px e2e viewport 75vh = 540px, so the height>400 e2e assertion stays valid"

requirements-completed: [PREVIEW-03]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "PDF previews render in .modal.xl (max-width 900px) whose iframe is ≈866px wide — at or above pdf.js's 751px requirement — while images and other preview types keep the 'lg' modal and their exact current layout"
    requirement: PREVIEW-03
    verification:
      - kind: e2e
        ref: "e2e/flows.spec.mjs#file uploads and previews (Phase 12) — .modal.xl visibility + iframe rendered width >800px assertions (both languages)"
        status: pass
    human_judgment: true
    rationale: "The e2e pins the iframe geometry in Chromium only; whether Firefox's embedded viewer actually shows its full toolbar with the direct download button needs the manual Firefox re-run of 12-UAT.md test 1"
  - id: D2
    description: "The PDF preview modal's footer shows a Download button labelled Download/Télécharger that saves the file under its original name via a real browser download event — independent of the embedded viewer's toolbar — while image and other-type footers are unchanged and both locale catalogues stay in parity"
    requirement: PREVIEW-03
    verification:
      - kind: e2e
        ref: "e2e/flows.spec.mjs#file uploads and previews (Phase 12) — footer anchor label/href assertions + waitForEvent('download') with suggestedFilename 'paper.pdf' (both languages)"
        status: pass
      - kind: integration
        ref: "npm test — catalogue parity suites (en/fr 1532 keys incl. act.download), 445/445 pass"
        status: pass
    human_judgment: true
    rationale: "Proven in Chromium (acceptDownloads); the plan's verification section assigns the real-Firefox confirm (both browsers save the file) to the manual UAT re-run of test 1"

# Metrics
duration: 16 min
completed: 2026-10-25
status: complete
---

# Phase 12 Plan 08: Gap closure G-12-6 Summary

**PDF previews widen to a 900px `.modal.xl` whose iframe crosses pdf.js's 750px Firefox toolbar breakpoint, and a PDF-only footer Download button provides a viewer-independent save affordance — with images, other preview types, the byte-only route and every locked D-03/D-05/D-06/D-09 contract exactly as they were.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-10-25T16:04:09Z
- **Completed:** 2026-10-25T16:20:16Z
- **Tasks:** 2
- **Files modified:** 7 (5 planned + 2 baseline guards)

## Accomplishments

- G-12-6 (width half): `.modal.xl { max-width: 900px }` sits directly after `.modal.lg` in overlays.css with the width math in a comment (900 − 32 − 2 = 866px ≥ 751px); the `filePreview` case selects the width class per type — `wrap(m.file?.type === 'pdf' ? 'xl' : 'lg', ...)` — so PDFs alone get the wide modal and images/other types keep `'lg'` exactly. The PDF iframe height rose to `min(75vh,640px)`; the stale "the .modal width is NOT widened" sentence in the D-03/D-09 comment is rewritten to record the G-12-6 decision.
- G-12-6 (hardening half): the preview modal's footer renders a PDF-only `<a class="btn btn-secondary" href="/w/:slug/file/:id" download="${esc(f.name)}">` before the copy-link button — no `data-a`, so the click stays a native same-origin navigation whose `download` attribute overrides the route's inline Content-Disposition client-side. Non-PDF footers are unchanged. `act.download` ("Download"/"Télécharger") was added beside `act.copyLink` in both catalogues.
- e2e pins all of it in the phase-12 PDF block: the `.modal.xl` class is visible on the PDF modal (fails against the old unconditional `'lg'`), the rendered iframe width is >800px (the old `'lg'` iframe measured ~686px; the image branch cannot satisfy it), the anchor's label and exact href are asserted, and `waitForEvent('download')` proves a real download event carrying the uploaded filename `paper.pdf`. Every prior phase-12 assertion (height, content-type, no x-frame-options, %PDF- magic, img naturalWidth) stayed green.
- The two frozen baselines moved deliberately with the sanctioned change: the catalogue guard now reads 1532 keys (`+ act.download, phase 12 plan 8` documented in its message) and the icon baseline 172 names (`download` is now referenced in src — the `virtual:icons` scan bundles only what the source names).

## Task Commits

Each task was committed atomically:

1. **Task 1: Widen PDF previews to .modal.xl — cross pdf.js's 750px toolbar breakpoint, proven by e2e width** - `97aad5d` (feat)
2. **Task 2: Footer Download button for PDFs + act.download i18n keys — a viewer-independent download affordance, proven by a real download event** - `509b105` (feat)

## Files Created/Modified

- `src/styles/overlays.css` — the `.modal.xl { max-width: 900px }` rule with the breakpoint math comment
- `src/overlays/modals.js` — the per-type width class at the `filePreview` case; the taller PDF iframe; the rewritten D-03/D-09 comment; the PDF-only footer download anchor with the T-12-18 esc() note
- `src/locales/en.json` + `src/locales/fr.json` — `act.download` beside `act.copyLink`
- `e2e/flows.spec.mjs` — uploadDict gains the download label; the PDF block pins the xl class, the >800px iframe width, the anchor's label/href, and the real download event
- `test/i18n-core-features.test.mjs` — catalogue-size guard 1531→1532 and icon-baseline guard 171→172, each delta documented in the assertion
- `test/fixtures/icons-baseline.json` — `download` added to the frozen source-scan baseline

## Decisions Made

- Width class per content type at the switch site: widening one content type cannot perturb the others; the image branch keeps 16/9 and the other-type branch keeps the download tile (12-07's deliberate decisions preserved).
- The footer button is a native anchor, not an action-dispatch button: `events.js` only preventDefaults buttons, and an unknown `data-a` would be a silent no-op — the download must work through plain navigation semantics.
- Both frozen guards moved in the same commit as the change that justifies them, with the reason in the assertion text — the baseline never moves silently.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Frozen baselines advanced: catalogue 1531→1532 keys, icon baseline 171→172**
- **Found during:** Task 2
- **Issue:** the plan's `must_haves` did not list the two pinned guards: `test/i18n-core-features.test.mjs` asserts the exact catalogue key count (en.json grew by `act.download`), and the icon-baseline test plus fixture assert the exact set of Lucide names the source scan finds (`ic('download', 14)` adds `download`). Both suites failed as designed.
- **Fix:** advanced both guards deliberately with the delta documented in each assertion message (`+ act.download, phase 12 plan 8`; baseline fixture gains `"download"`). This is the guards tracking a sanctioned change, not a bypass.
- **Files modified:** test/i18n-core-features.test.mjs, test/fixtures/icons-baseline.json
- **Verification:** `npm test` 445/445 pass
- **Committed in:** 509b105 (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 × Rule 1 — pinned-baseline maintenance required by the planned i18n key + icon reference).
**Impact on plan:** Test-fixture bookkeeping only; no production behavior beyond the plan.

## Issues Encountered

- None new. `npm run lint` (8 errors) and `npm run format:check` (18 files) remain at exactly the pre-existing drift documented at 12-05 and re-confirmed byte-identical at this plan's base commit `ece1ff3` (verified `e2e/flows.spec.mjs` was already unformatted at base; the file list and error counts are unchanged). Out of scope per the deviation scope boundary.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-12-6 is code-closed: the plan's `<verification>` items are all green except the deliberate manual step — re-run 12-UAT.md test 1 in a real Firefox (toolbar fully visible with the direct download button at iframe ≥751px, and the footer Download saving in both Firefox and Chrome). The Chromium e2e cannot exercise Firefox's built-in pdf.js viewer; geometry and download semantics are pinned in Chromium, the Firefox rendering is the human step.
- No blockers; no stubs. Threat mitigations T-12-18 (attribute injection → esc()) and T-12-19 (accept, layout only) implemented per the plan's threat model; T-12-SC vacuous (zero package installs).

---
*Phase: 12-real-file-uploads-and-previews*
*Completed: 2026-10-25*

## Self-Check: PASSED

- All 7 files modified by the plan exist on disk; SUMMARY.md exists in the phase directory.
- Both task commits verified in history: `97aad5d` (Task 1), `509b105` (Task 2).
- Commits measured from the plan base (`ece1ff3`): 2 total — 2 task commits; SUMMARY commit follows this write.
- `npm test` 445/445 pass; `npm run build && npm run e2e` 45/45 pass (full build first per the 12-06 run-order rule).
- REQUIREMENTS.md not marked: PREVIEW-03 is a phase-12 gap ID with no row in the v1.2 requirements table (same handling as 12-07); it is recorded in this SUMMARY's `requirements-completed`.
