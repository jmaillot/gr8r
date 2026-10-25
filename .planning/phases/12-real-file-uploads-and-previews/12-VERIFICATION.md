---
phase: 12-real-file-uploads-and-previews
verified: 2026-10-25T17:06:30Z
status: passed
score: 21/22 must-haves verified
covered_files: [".planning/phases/12-real-file-uploads-and-previews/12-01-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-01-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-02-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-02-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-03-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-03-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-04-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-04-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-05-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-05-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-06-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-06-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-07-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-07-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-08-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-08-SUMMARY.md", "server.js", "src/actions/actions.js", "src/main.js", "src/overlays/modals.js", "src/overlays/context-menu.js", "src/views/files.js", "src/core/api.js", "src/styles/overlays.css", "src/locales/en.json", "src/locales/fr.json", "test/upload.test.mjs", "test/i18n-core-features.test.mjs", "test/fixtures/icons-baseline.json", "e2e/flows.spec.mjs", "e2e/server.mjs", ".env.example", "DEPLOY.md", "README.md"]
covered_digest: "v2:sha256:e5213475a47c4e1939abba788ceeac7a847fc3c36f4bd821c3cc1a0030925779"
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 18/19 (round 3; UAT round 2 then found G-12-6, closed by 12-08)
  gaps_closed:
    - "G-12-6 (width half): PDF previews render in .modal.xl (max-width 900px, overlays.css:44-46) so the in-iframe viewport is ≈866px ≥ pdf.js's 750px toolbar breakpoint; PDF iframe height raised to min(75vh,640px) (commit 97aad5d)"
    - "G-12-6 (hardening half): PDF-only footer Download anchor (viewer-independent save affordance, download attribute overriding the route's inline Content-Disposition) + act.download i18n keys in both catalogues, proven by a real e2e download event (commit 509b105)"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "CR-01 (critical, disposition open, carried from round 3): suffix Range on a zero-byte stored file produces a malformed 206 (`Content-Range: bytes 0--1/0`) and a synchronous ERR_OUT_OF_RANGE throw after headers are sent (server.js:1982-1985 suffix branch has no stat.size === 0 guard)"
    category: other
    reason: "Re-confirmed present this round (server.js:1976-1992 re-read; the zero-byte suffix branch still computes end=stat.size-1=-1). server.js was NOT touched by 12-08 (verified via git diff --stat ece1ff3..509b105: 7 files, no server.js), so the finding predates this round unchanged. Zero-byte uploads are a legitimate accepted state; any authenticated member can trigger a protocol-invalid response. No crash, no data exposure; does not fail any must-have truth (the range truths hold for their asserted scope and pass their tests). Should be explicitly triaged (one-line guard + one zero-byte range test) before ship, not silently carried — 12-REVIEW-DISPOSITION.md lists it open."
    evidence_status: "confirmed deterministically in round 3 (branch trace + ERR_OUT_OF_RANGE reproduction); code unchanged this round (git diff)"
  - finding: "WR-01 (warning, 12-REVIEW.md, disposition open): the .modal.xl width invariant silently fails below ~816px viewport width — iframe = min(866, viewport − 66), so tablet portrait / split view / small windows drop back under pdf.js's 750px breakpoint and the toolbar collapses again"
    category: other
    reason: "The e2e pins only the 1280px Desktop Chrome viewport; nothing documents or guards the narrow-viewport behavior. The new footer Download anchor preserves the core need (saving the file) at every width, which is why the reviewer rated it warning not blocker. Needs an explicit triage decision: document the accepted limitation (footer anchor = sub-816px affordance) or restore the affordance at narrow widths, plus a narrow-viewport e2e assertion pinning whichever is chosen."
    evidence_status: "confirmed by reviewer's CSS math (overlays.css:44-46 + .modal-b padding); consistent with this verifier's read of the same rules"
behavior_unverified_items:
  - truth: "Firefox's built-in pdf.js viewer renders its full default toolbar — including the direct download button — un-collapsed inside the now-wider (.modal.xl, ≈866px) and taller (min(75vh,640px)) preview iframe (G-12-4 + G-12-6 closure re-check)"
    test: "Open a multi-page PDF's preview modal in real Firefox (12-UAT.md test 1 re-run, post-12-08)"
    expected: "The whole in-iframe pdf.js toolbar is visible with the direct download/print buttons NOT collapsed into the '»' secondary menu (the xl width crosses the 750px hiddenMediumView breakpoint), the document lays out incrementally, and the modal-footer Download button saves the file in both Firefox and Chrome"
    why_human: "The Chromium e2e pins the geometry (xl class visible, rendered iframe width >800px, height >400px) and the download semantics, but whether Firefox's built-in viewer actually keeps its toolbar un-collapsed at that width is browser-runtime rendering only a human can confirm (IN-01: no Firefox e2e project exists)"
coincidental_reliance_items: []
human_verification:
  - test: "Re-run 12-UAT.md test 1 in real Firefox AND Chrome (G-12-1 + G-12-4 + G-12-6 closure re-check): drop a file >5 MB onto a dropzone, watch the progress row, then open a multi-page PDF's preview modal; click the modal-footer Download button in both browsers"
    expected: "Progress advances with real transfer pace and the row disappears on completion; the PDF renders inside the wide (~866px) tall (~75vh) scrollable iframe; Firefox's full viewer toolbar is visible with the direct download/print buttons NOT collapsed into '»'; the footer Download button (Download/Télécharger) saves the file under its original name in both browsers; large PDFs paint without the old whole-file stall ('refused to connect' / 'ne peut pas ouvrir cette page' must stay gone)"
    why_human: "Native pdf.js toolbar rendering at a given iframe width, and cross-browser download behavior, are browser-runtime experiences; e2e pins geometry/headers/download-event in Chromium only (IN-01)"
  - test: "Triage WR-01 while the app is open: resize the browser window to ~700-800px CSS width and open a PDF preview"
    expected: "Decide the intended behavior below the ~816px threshold: today the toolbar collapses again (iframe <750px) but the footer Download button still saves the file — either accept that as the documented narrow-viewport fallback or request a fix; record the decision in 12-REVIEW-DISPOSITION.md"
    why_human: "Product-level acceptance of a responsive-layout trade-off plus real-browser rendering at intermediate widths; not decidable by grep or a single-viewport e2e"
---

# Phase 12: Real file uploads and previews — Verification Report (re-verification, round 4)

**Phase Goal:** Replace metadata-only file behaviour with real uploads: server endpoint storing dropped files under `DATA_DIR`, real XHR progress in `handleFiles`, real previews for PDFs and images, and a working destination for « Copier le lien ». Closes the known limitation "File contents are metadata only; no binary upload backend".
**Verified:** 2026-10-25T17:06:30Z
**Status:** human_needed (21/22 truths verified with behavioral evidence; the single behavior-unverified truth is the Firefox-native pdf.js toolbar rendering post-widening, folded into the UAT re-run; open advisories: CR-01, WR-01)
**Re-verification:** Yes — after gap-closure round 3 (plan 12-08: G-12-6 Firefox PDF toolbar width + footer Download hardening)

## Goal Achievement

### Observable Truths

Truths 1–14 are the round-1 verified set, truths 15–19 the 12-07 gap-closure set — quick regression this round: full unit suite (445/445, this verifier's process) re-exercises all named integration tests, full e2e (45/45, this verifier's process) re-exercises the client flows, plus spot re-greps. Truths 20–22 are the 12-08 (G-12-6) set — full 3-level verification.

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | POST /w/:slug/files stores real bytes at DATA_DIR/files/&lt;id&gt;, returns 200 {id} | ✓ VERIFIED | upload handler unchanged; integration test PASS in this verifier's run (445/445) |
| 2 | Oversize upload rejected mid-stream with 413 + `uploadTooLarge`, server alive | ✓ VERIFIED | integration test PASS in this verifier's run |
| 3 | Viewer/unauthenticated caller cannot upload (minRole 'member') | ✓ VERIFIED | "uploads are gated" test PASS in this verifier's run |
| 4 | /w/:slug/file/:id is byte-only (G-12-1, closed round 1) | ✓ VERIFIED | "byte-only file route" test PASS in this verifier's run; D-13 comment intact (main.js:115-119) |
| 5 | Safe inline/attachment header policy, fixed Content-Type map | ✓ VERIFIED | D-06 test PASS in this verifier's run; map untouched by 12-08 |
| 6 | Doc-PUT file deletion unlinks the binary idempotently | ✓ VERIFIED | UPLOAD-05 test PASS in this verifier's run |
| 7 | handleFiles uses real XHR upload progress; simulated timer gone | ✓ VERIFIED | PREVIEW-01 test PASS in this verifier's run |
| 8 | Failed upload toasts a stable code, removes the progress row, adds no record | ✓ VERIFIED | failRow unchanged; oversize e2e green (45/45, this run) |
| 9 | Preview modal renders real bytes: img / pdf iframe / download tile | ✓ VERIFIED | modals.js:301-313 re-read this round (img 16/9, pdf tall iframe, other keeps filePrev tile); e2e PDF/img blocks green |
| 10 | Both « Copier le lien » entry points copy the identical file URL (G-12-2, closed round 1) | ✓ VERIFIED | copyLink branches unchanged; e2e clipboard-equality green (45/45, this run) |
| 11 | The SPA no longer claims /file/:id — pastes get bytes (G-12-2, closed round 1) | ✓ VERIFIED | main.js:115-119 re-grepped this round: no 'file' branch, D-13 revised comment present |
| 12 | Dropzone cap hint interpolates live MAX_UPLOAD_MB (G-12-3, closed round 1) | ✓ VERIFIED | five-hop chain re-grepped this round: server.js:1222 → api.js:21/95-96/132 → files.js:43 → en/fr.json; /api/config + knob tests PASS |
| 13 | Demo mode stays metadata-only | ✓ VERIFIED | handleFiles offline branch untouched by 12-05..12-08 |
| 14 | i18n: both catalogues carry phase keys; parity gates green | ✓ VERIFIED | err.uploadTooLarge + act.download present in both catalogues; catalogue guard 1532 keys PASS (this run) |
| 15 | **[G-12-4a]** The PDF preview iframe is a tall scrollable viewport — Firefox's built-in viewer renders its toolbar un-clipped inside the modal | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED (height half proven; native-viewer rendering needs human) | modals.js:313: `height:min(75vh,640px)` (upgraded by 12-08 from 70vh/560px); e2e height poll >400px green (this run); **no test can exercise Firefox's built-in viewer** — see behavior_unverified_items / Human Verification item 1 |
| 16 | **[G-12-4b]** Byte-range requests return 206 + Content-Range and stream only the requested slice; unsatisfiable → 416 `bytes */size`; multi-range/malformed/absent → unchanged 200 full body; Accept-Ranges: bytes on every answer; ranged HEAD | ✓ VERIFIED | server.js:1976-2028 (re-read this round; unchanged by 12-08); integration test PASS in this verifier's process |
| 17 | **[G-12-5a]** An anonymous top-level navigation (Sec-Fetch-Dest: document or metadata-absent) to /w/:slug/file/:id 302-redirects to /login?next=&lt;path&gt; BEFORE any workspace/record lookup — byte-identical for unknown slugs | ✓ VERIFIED | server.js dispatcher + pathname-only next (re-grepped this round, unchanged); G-12-5 integration test PASS in this verifier's process |
| 18 | **[G-12-5b]** After signing in from the redirect, the browser returns to the same file URL and gets the bytes | ✓ VERIFIED | actions.js ?next= validation + full navigation (re-grepped this round, unchanged); e2e round trip green both locales (45/45, this run) |
| 19 | Every other consumer keeps its contract: iframe/frame/empty destinations keep JSON 401 signInRequired; authenticated-but-unauthorized callers keep the D-05 404 regardless of destination | ✓ VERIFIED | G-12-5 integration test asserts the discrimination matrix — PASS in this verifier's run |
| 20 | **[G-12-6, width]** PDF previews render in `.modal.xl` (max-width 900px) so the in-iframe viewport (≈866px at desktop) crosses pdf.js's 750px WIDTH breakpoint — the condition that keeps Firefox's default toolbar un-collapsed | ✓ VERIFIED (geometry; native rendering → truth 15/human) | overlays.css:44-46 `.modal.xl { max-width: 900px }` with the 900−32−2=866px math comment; modals.js:58 `wrap(m.file?.type === 'pdf' ? 'xl' : 'lg', ...)`; e2e asserts `.modal.xl` visible AND rendered iframe width >800px (old 'lg' was ~686px — the assertion cannot pass against the pre-fix code), green both locales in this run; width is pure CSS geometry, browser-independent |
| 21 | **[G-12-6, hardening]** Every PDF preview modal footer has a Download button that saves the file under its original name, independent of any viewer toolbar — native same-origin `<a href="/w/:slug/file/:id" download="<esc(f.name)>">` with no data-a; non-PDF footers unchanged; `act.download` in both locales | ✓ VERIFIED | modals.js:315-326 (anchor PDF-only, esc()-escaped attribute per T-12-18, no data-a → native navigation); en.json:527 "Download" / fr.json:528 "Télécharger"; e2e asserts anchor visibility, locale label, exact href, and a real `waitForEvent('download')` carrying `paper.pdf` — green both locales in this run; catalogue + icon frozen guards advanced with documented deltas (1532 keys; 'download' icon, 172 names) and PASS |
| 22 | **[G-12-6]** Non-PDF previews keep today's layout exactly: images keep the 'lg' modal class and 16/9 embed; other types keep the download tile | ✓ VERIFIED | modals.js:58 ternary + :311 img branch (aspect-ratio:16/9 intact) + :313 filePrev tile; e2e img assertions (naturalWidth, 'lg'-scoped copy-link flow) green in this run |

**Score:** 21/22 truths verified (1 present-but-behavior-unverified: Firefox-native pdf.js toolbar rendering at the new width — routed to the UAT re-run)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| src/styles/overlays.css `.modal.xl` | max-width:900px directly after .modal.lg, width-math comment | ✓ VERIFIED | lines 44-46; comment matches implementation |
| src/overlays/modals.js per-type width class | filePreview case: PDF→'xl', else 'lg' | ✓ VERIFIED | line 58; D-03/D-09 comment rewritten to record the G-12-6 decision (stale "width is NOT widened" sentence gone) |
| src/overlays/modals.js taller PDF iframe | height:min(75vh,640px) | ✓ VERIFIED | line 313; img keeps 16/9 (:311) |
| src/overlays/modals.js footer Download anchor | PDF-only, btn-secondary, esc()-escaped download attr, no data-a, before copy-link | ✓ VERIFIED | lines 315-326 with T-12-18 comment |
| src/locales/en.json + fr.json | act.download beside act.copyLink | ✓ VERIFIED | en.json:527, fr.json:528; parity 1532/1532 |
| e2e/flows.spec.mjs | xl-class + width>800 + anchor label/href + real download event | ✓ VERIFIED | lines 818-852; uploadDict gains the label (:721); 45/45 both locales in this verifier's process |
| test/i18n-core-features.test.mjs + fixtures/icons-baseline.json | frozen guards advanced with documented deltas | ✓ VERIFIED | :216-218 (1532, "+ act.download, phase 12 plan 8"); baseline gains "download" (:51); both PASS in this run |
| (rounds 1-3 artifacts) | server.js ranges/redirect, actions.js ?next=, upload suite | ✓ VERIFIED | unchanged by 12-08 (git diff ece1ff3..509b105 touches none of them); tests re-run green |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| filePreview case | .modal.xl (900px) | `m.file?.type === 'pdf' ? 'xl' : 'lg'` | ✓ WIRED | modals.js:58 → overlays.css:44-46; e2e xl-visibility assertion green |
| .modal.xl width | iframe ≥ 751px | 900 − 32 (.modal-b padding) − 2 (border) ≈ 866px | ✓ WIRED | reviewer-verified at the 1280px e2e viewport; e2e width poll >800 green |
| Footer anchor | serveFileBinary inline bytes | `<a href="/w/:slug/file/:id" download="...">` same-origin | ✓ WIRED | e2e: exact href asserted + real download event with suggestedFilename 'paper.pdf' (download attribute overrides inline Content-Disposition client-side) |
| act.download key | footer label | t('act.download') | ✓ WIRED | both catalogues; catalogue parity guard green |
| (round-3 links) | ranges, 302/?next= round trip, knob chain, copy-link | all re-tested in this verifier's process — no regression | ✓ WIRED | see truths 1-19 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| Download attribute | f.name | the uploaded file's server-side record (esc-escaped) | Yes — e2e suggestedFilename() returned the uploaded name | ✓ FLOWING |
| Anchor href | D().ws.url + f.id | server-generated workspace url + file id | Yes — e2e asserts the exact published URL | ✓ FLOWING |
| (round-3 traces) | bytes/progress/knob/clipboard/range slices/redirect next | unchanged | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full phase unit+integration suite | `npm test` | 445 pass / 0 fail (17.6s), run in this verifier's process — includes all named G-12-1..G-12-5, UPLOAD-01..05, D-06 tests | ✓ PASS |
| Production build (full, never build:en — 12-06 rule) | `npm run build` | exit 0, built in 1.14s | ✓ PASS |
| Full e2e suite (built dist first) | `npm run e2e` | 45 passed (53.3s), run in this verifier's process — includes the extended G-12-6 PDF block (xl class, width >800, download event) in both locales | ✓ PASS |
| 12-08 commits exist | `git cat-file -t` | 97aad5d, 509b105 both commits; diff ece1ff3..509b105 = 7 files/60 insertions matching the SUMMARY | ✓ PASS |
| Debt markers in 12-08 files | grep TBD/FIXME/XXX/HACK/PLACEHOLDER over the 7 changed files | none | ✓ CLEAN |
| CR-01 code state | re-read server.js:1976-1992 | zero-byte suffix branch unchanged (still computes end=-1) — finding stands, server.js untouched this round | ✓ CONFIRMED (advisory, not regression) |

Probe execution: no probe scripts declared (`scripts/*/tests/probe-*.sh` absent; none in PLANs). The suites above are the phase's runnable probes and were executed in this verifier's own process.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| UPLOAD-01 | 12-01 | Real-bytes upload endpoint | ✓ SATISFIED | tests re-run green this round (445/445, this process) |
| UPLOAD-02 | 12-01 | MAX_UPLOAD_MB cap + stable 413 code | ✓ SATISFIED | tests re-run green this round |
| UPLOAD-03 | 12-02 | Byte serving route, 404 no-oracle | ✓ SATISFIED | tests re-run green this round; no-oracle extended to the 302 (T-12-16) |
| UPLOAD-04 | 12-02 | Inline/attachment header policy | ✓ SATISFIED | D-06 map untouched; test green |
| UPLOAD-05 | 12-02 | Binary delete with record | ✓ SATISFIED | test green |
| PREVIEW-01 | 12-03 | Real XHR progress | ✓ SATISFIED | test green |
| PREVIEW-02 | 12-03 | Failed upload handling | ✓ SATISFIED | oversize e2e green (this run) |
| PREVIEW-03 | 12-03, 12-05, 12-07, 12-08 | Real-bytes preview modal; PDF iframe fixed, then Firefox stall/clip closed, then width breakpoint crossed + footer Download hardening | ✓ SATISFIED | ranges + tall viewport + .modal.xl + footer download, all pinned by tests; Firefox-native rendering → human item |
| LINK-01 | 12-03, 12-05, 12-07 | Copied link destination; one URL; login redirect for logged-out pastes | ✓ SATISFIED | byte-only route + copy-link unification + 302/?next= round trip, all green this run |
| I18N-01 | 12-04, 12-06 | Catalogue coverage/parity | ✓ SATISFIED | keys re-grepped (incl. act.download); catalogue guard 1532 keys green |

**Orphaned requirements:** none. **REQUIREMENTS.md gap (documentation, pre-existing):** REQUIREMENTS.md is the v1.2 Localization milestone — its traceability table has no rows for the phase-12 IDs (UPLOAD-01..05, PREVIEW-01..03, LINK-01 were derived locally in the plans; I18N-01 is a v1.2 requirement satisfied by phases 5-7 and re-asserted here). ROADMAP declares phase 12 "Requirements: TBD". All 10 plan-declared IDs are accounted for and verified against the codebase; the missing table rows are a REQUIREMENTS.md bookkeeping gap, not an implementation gap — carried unchanged from rounds 1-3.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| server.js | 1982-1985 | CR-01 (12-REVIEW-DISPOSITION.md, critical, open): suffix range on zero-byte file → malformed 206 `bytes 0--1/0` + ERR_OUT_OF_RANGE after headersSent | ⚠️ Warning (advisory — see frontmatter; carried from round 3, code unchanged by 12-08) | Deterministic, reproducible by any authenticated member against a zero-byte stored file; no crash, no data exposure; does not fail any must-have truth; one-line guard + one test closes it |
| src/styles/overlays.css | 44-46 | WR-01 (warning, open): width invariant fails below ~816px viewport — toolbar collapses again on narrow screens | ⚠️ Warning (advisory — see frontmatter) | The exact regression G-12-6 fixes reappears on narrow viewports; the footer Download anchor preserves the core need at every width; needs a triage decision (document vs fix) |

Pre-existing repo-wide lint (8 errors) and format drift (~19 files) remain logged in deferred-items.md — outside this phase's file set, unchanged by 12-08 (byte-identical at its base commit ece1ff3 per 12-08-SUMMARY). No debt markers in any 12-08 file.

### Review Findings still open

In 12-REVIEW-DISPOSITION.md (all open, none invalidates a verified truth): CR-01 (critical — advisory above), WR-01 (warning — advisory above), IN-01 (info: G-12-6 proven only in the Chromium project — accepted as a known proxy; the native-viewer confirm is human item 1), IN-02 (info: e2e width assertion >800 vs documented ≥866 — regression-safe since 800 > 750, headroom tolerates scrollbars). Standing findings from earlier reviews (H-1 dupFile, H-2 delete-undo, M-1 svg/heic, M-2 client cap, M-3 non-numeric knob, L-1..L-5) remain documented follow-ups.

### Human Verification Required

See frontmatter `human_verification` for full detail:

1. **UAT test 1 re-run in real Firefox AND Chrome (post-12-08)** — drop >5 MB, watch progress, open a multi-page PDF: full toolbar visible (not collapsed into '»'), no stall, and the footer Download button saves the file in both browsers. (G-12-1 + G-12-4 + G-12-6 re-check; closes behavior-unverified truth 15)
2. **WR-01 triage at ~700-800px window width** — observe the collapsed toolbar + working footer Download; decide accept-as-documented-fallback vs fix, and record in 12-REVIEW-DISPOSITION.md.

UAT tests 2 (copy-link both entry points + logged-out paste) and 3 (MAX_UPLOAD_MB knob) **passed** in the round-2 UAT re-run and are untouched by 12-08 (which changed only the PDF modal's width class, iframe height, and footer); the e2e re-proves both flows green in this round, so no new human item is raised for them.

### Gaps Summary

No code gaps. Round-3 gap closure (12-08) is fully implemented and behaviorally pinned: G-12-6's width half by the `.modal.xl` (900px → ≈866px iframe, crossing pdf.js's 750px breakpoint) with an e2e width assertion that cannot pass against the pre-fix code, and its hardening half by the PDF-only footer Download anchor proven by a real browser download event in both locales. All locked contracts survived: D-03/D-09 real-bytes preview, D-05 no-oracle, D-06 header map, byte-only routing, image/other-type layouts (truth 22), and every prior closure (G-12-1..G-12-5) re-tested green. The full gate is green in this verifier's own process (445/445 unit, 45/45 e2e, build exit 0). The phase goal — real uploads, real progress, real previews, a working « Copier le lien » destination — is achieved at code level. What remains before `passed`: the human UAT re-run of item 1 (the Firefox-native pdf.js toolbar at the new width — the one behavior-unverified truth) and the two open triage decisions (CR-01 zero-byte range guard; WR-01 narrow-viewport policy). The three deferred auth/sessions/2FA UAT follow-ups are out of phase-12 scope and already routed to backlog phases 999.1-999.3 in ROADMAP.md.

---

_Verified: 2026-10-25T17:06:30Z_
_Verifier: the agent (gsd-verifier)_
_covered_digest via `gsd_run query verification.fingerprint`_
