---
status: diagnosed
trigger: "the embedded view in firefox does not show download, its too small, the other things are working"
created: 2026-10-25T00:00:00Z
updated: 2026-10-25T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — Firefox embeds pdf.js (MOZCENTRAL build) for `<iframe src="...pdf">`, and pdf.js hides its direct download/print buttons via `@media all and (max-width: 750px) { #outerContainer .hiddenMediumView { display: none !important; } }`. That media query resolves against the IFRAME's own viewport width. The app's PDF preview iframe is only ~686px wide (modal `.lg` max-width 720px − modal-b padding 32px − wrapper border 2px), so Firefox's viewer is in "medium" mode: `#downloadButton`/`#printButton` are `display:none` and tucked into the "»" secondary menu. The 12-07 height fix (d311687) is present and correct, but it fixed the wrong axis for THIS symptom — toolbar collapse is width-driven, not height-driven.
test: Read app code (modals.js, overlays.css, server.js) + pdf.js upstream source (viewer.html, viewer.css) to trace the exact visibility mechanism.
expecting: iframe width < 750px in the shipped layout.
next_action: Return diagnosis to orchestrator (goal: find_root_cause_only).

## Symptoms

expected: In the file preview modal, the PDF iframe is tall enough in Firefox that the full viewer toolbar (incl. download button) is visible without scrolling, and the embed is comfortably readable.
actual: In Firefox the download button is not visible; the embed is "too small". Upload progress, PDF render, no-stall all work (UAT round 2, test 1).
errors: none (visual/layout issue only)
reproduction: Open a PDF file preview modal in Firefox.
started: Still broken after 12-07 fix (regression re-check of G-12-4).

## Eliminated

- hypothesis: The 12-07 height fix was not applied / targets the wrong element.
  evidence: modals.js:311 carries `height:min(70vh,560px)` exactly as verified in 12-VERIFICATION.md row 15; the modal is `wrap('lg', ...)` (modals.js:58) and `.modal-b`/wrapper grow with the iframe. Height axis is genuinely fixed.
  timestamp: 2026-10-25
- hypothesis: Server-side disposition/Range regression (file serves as attachment or stalls, so no toolbar renders).
  evidence: server.js:1913 maps pdf→application/pdf, :1997 `inline = Boolean(FILE_INLINE_MIME[ext])`, :2014 `fileDisposition(record.name, inline)` → `inline` for PDFs, :2018 `frame-ancestors 'self'` CSP, Range/206 logic :1976-2028 intact. UAT round 2 confirms render + no-stall pass. Ruled out.
  timestamp: 2026-10-25
- hypothesis: Ancestor clipping (overflow/max-height/aspect-ratio) still hides the toolbar.
  evidence: The 16/9 aspect-ratio remains only on the IMG branch (modals.js:309); the PDF iframe wrapper has no fixed height; `.modal` max-height:80vh + `.modal-b` overflow-y:auto only scrolls when header+70vh+footer exceed 80vh (mild on short windows; scroll starts at top so the in-iframe toolbar is initially visible). Not the primary cause.
  timestamp: 2026-10-25

## Evidence

- timestamp: 2026-10-25
  checked: src/overlays/modals.js:293-316
  found: `filePreviewModal` builds the PDF branch at :311: `<iframe src="/w/${D().ws.url}/file/${f.id}" ... style="display:block;width:100%;height:min(70vh,560px);border:0">`. The 12-07 fix (d311687) IS present. IMG branch :309 keeps aspect-ratio:16/9.
  implication: Height fix applied as claimed; the regression must come from another axis.
- timestamp: 2026-10-25
  checked: src/overlays/modals.js:57-58 (modalHtml switch) + src/styles/overlays.css:23-41
  found: `case 'filePreview': return wrap('lg', filePreviewModal(m, H))`. `.modal.lg { max-width: 720px; }` (:39-41). `.modal-b { padding: 14px 16px; }` (:56-57). Preview wrapper div has 1px border (modals.js:297).
  implication: Effective iframe width = min(720px, viewport−32) − 32 (modal-b padding) − 2 (border) = 686px max on any typical desktop window.
- timestamp: 2026-10-25
  checked: pdf.js upstream (Firefox's built-in viewer for iframe/embedded PDFs), web/viewer.html @ mozilla/pdf.js master
  found: `#downloadButton` and `#printButton` are inside `<div class="toolbarHorizontalGroup hiddenMediumView">` within `#toolbarViewerRight`. The "»" secondary toolbar contains `#secondaryPrint`/`#secondaryDownload` inside `<div class="visibleMediumView">` — the medium-mode substitutes.
  implication: The direct download button's visibility is governed by the viewer's "medium" media query.
- timestamp: 2026-10-25
  checked: pdf.js upstream web/viewer.css
  found: `@media all and (max-width: 750px) { #outerContainer .hiddenMediumView { display: none !important; } #outerContainer .visibleMediumView:not(.hidden, [hidden]) { display: contents !important; } }`. Also `#mainContainer { min-width: 350px; }` and secondary-toolbar fallback. Media queries inside an iframe resolve against the iframe's viewport, not the top page's.
  implication: With a 686px iframe, Firefox's viewer collapses the direct download/print buttons into the "»" menu. Users read this as "does not show download". Chrome's PDFium viewer uses a hover overlay unaffected by width — matching the UAT observation that only Firefox fails.
- timestamp: 2026-10-25
  checked: server.js:1900-2024 (serveFileBinary)
  found: D-06 inline map (:1907-1914 pdf→application/pdf), inline disposition (:2014), frame-ancestors 'self' (:2018), single-range 206/416 (:1976-2028). All intact.
  implication: Server path fully rules out the "too slow"/no-render axis; symptom is purely layout.
- timestamp: 2026-10-25
  checked: .planning/phases/12-.../12-VERIFICATION.md rows 15/16 + src/locales/en.json & fr.json
  found: 12-07 item 15 was flagged `PRESENT_BEHAVIOR_UNVERIFIED` — "no test can exercise Firefox's built-in viewer", i.e. the height fix was never validated in real Firefox. Locales have `act.copyLink` (en:526/fr:527) but NO `act.download` key (a footer fallback button needs one).
  implication: The prior fix was code-verified but never behavior-verified in Firefox; the width breakpoint slipped through exactly there.

## Structured Reasoning Checkpoint

```yaml
reasoning_checkpoint:
  hypothesis: "Firefox's embedded pdf.js viewer hides its direct download/print buttons when the iframe viewport is ≤750px wide (viewer.css max-width:750px → .hiddenMediumView display:none); the app's preview iframe is ~686px wide because .modal.lg caps at 720px, so the toolbar renders without the download button — the 12-07 fix corrected height but the collapse is width-driven."
  confirming_evidence:
    - "pdf.js viewer.html: #downloadButton/#printButton sit in a .hiddenMediumView group; #secondaryDownload lives in .visibleMediumView"
    - "pdf.js viewer.css: `@media all and (max-width:750px){ #outerContainer .hiddenMediumView{display:none!important} }` — resolves against the iframe's own viewport"
    - "App math: overlays.css:39-41 .modal.lg max-width:720px; :57 .modal-b padding 14px 16px; modals.js:297 wrapper 1px border → iframe ≤686px < 750px"
    - "Chrome passes UAT: PDFium's toolbar is a width-independent hover overlay — differential evidence"
    - "12-VERIFICATION.md row 15: Firefox behavior explicitly UNVERIFIED — the gap in the previous gate"
  falsification_test: "In Firefox, widen the window/modal so the iframe exceeds 751px (e.g. temporarily max-width:900px): the download + print buttons appear directly in the toolbar. Equivalently, devtools-measure the iframe: if width were already >750px with the button still hidden, this hypothesis dies."
  fix_rationale: "Raising the PDF preview modal width past pdf.js's 750px breakpoint restores the full default toolbar (download visible without hunting the » menu) and simultaneously fixes 'too small to read' by giving the embed more viewport — it addresses the controlling constraint, not a symptom."
  blind_spots: "Exact Firefox release pinning pdf.js with the 750px breakpoint (present upstream since ~2020; user's current Firefox has it — symptom proves the collapse fires). pdf.js could change the breakpoint in future; the footer download fallback makes the outcome robust to that. Small laptops (viewport−32 < 783px) would still be under the breakpoint even at max-width:900px — the footer button covers that case."
  candidate_causes:
    - "code: .modal.lg max-width:720px leaves the iframe 136px under pdf.js's 750px toolbar-collapse breakpoint (overlays.css:39-41, modals.js:58)"
    - "environment: Firefox's built-in pdf.js viewer collapse behavior (viewer.css @media max-width:750px) — not controllable from app CSS, only from iframe sizing"
    - "data/config: none — server headers verified correct (inline, frame-ancestors, 206)"
  and_gate: "no — width ≥751px alone restores the direct toolbar buttons (height axis was already fixed in round 1); single controlling condition, though a footer download fallback is still recommended to harden against breakpoint drift and sub-783px windows"
```

## Resolution

root_cause: The app's PDF preview iframe is ~686px wide (`.modal.lg` 720px − `.modal-b` 32px padding − 2px wrapper border), which is under Firefox's embedded pdf.js viewer width breakpoint of 750px, where `@media all and (max-width:750px)` sets `.hiddenMediumView{display:none!important}` — hiding the direct download/print buttons (they move into the "»" secondary menu, which users read as "no download"); the 12-07 fix raised the iframe HEIGHT, but the download collapse is driven by WIDTH.
fix: (1) Add `.modal.xl { max-width: 900px; }` to src/styles/overlays.css and render the filePreview modal with it for PDFs (modals.js:58, e.g. `wrap(m.file?.type === 'pdf' ? 'xl' : 'lg', ...)`) → iframe ≈866px ≥ 751px, full toolbar with visible download. (2) Fallback/hardening: add a `Download` button to the modal footer for PDFs — `<a class="btn btn-secondary" href="/w/${D().ws.url}/file/${f.id}" download="${esc(f.name)}">` — same-origin so the download attribute is honored over the inline Content-Disposition; requires new i18n keys `act.download` ("Download" / "Télécharger") in src/locales/en.json + fr.json.
verification: diagnosed — not yet fixed (find_root_cause_only)
files_changed: []
