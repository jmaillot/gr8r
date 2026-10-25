---
phase: 12-real-file-uploads-and-previews
verified: 2026-10-25T10:09:01Z
status: human_needed
score: 18/19 must-haves verified
covered_files: [".planning/phases/12-real-file-uploads-and-previews/12-01-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-01-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-02-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-02-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-03-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-03-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-04-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-04-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-05-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-05-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-06-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-06-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-07-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-07-SUMMARY.md", "server.js", "src/actions/actions.js", "src/main.js", "src/overlays/modals.js", "src/overlays/context-menu.js", "src/views/files.js", "src/core/api.js", "src/locales/en.json", "src/locales/fr.json", "test/upload.test.mjs", "e2e/flows.spec.mjs", "e2e/server.mjs", ".env.example", "DEPLOY.md", "README.md"]
covered_digest: "v2:sha256:4efaba43d564df31e67d7a3ab4f5013b9adf5d5a5b3fdb01bcd5423adc0597cb"
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 14/14 (G-12-1..3 closed; UAT re-run pending)
  gaps_closed:
    - "G-12-4: Firefox PDF preview stall + clipped toolbar — single-range 206/416 serving in serveFileBinary (commit 49e28bb) + tall scrollable PDF iframe height:min(70vh,560px) (commit d311687)"
    - "G-12-5: logged-out paste of a file URL showed raw signInRequired JSON — anonymous document/metadata-absent navigations now 302 to /login?next=<path> before any lookup, with validated ?next= consumption in A.doLogin (commit 6c99fcf)"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "CR-01 (12-REVIEW.md, critical, disposition open): suffix Range on a zero-byte stored file produces a malformed 206 (`Content-Range: bytes 0--1/0`) and a synchronous ERR_OUT_OF_RANGE throw after headers are sent (server.js:1982-1985 suffix branch has no stat.size === 0 guard)"
    category: other
    reason: "Confirmed by this verifier: the guard covers only bytes=-0 and explicit-start forms; Node reproduces ERR_OUT_OF_RANGE for createReadStream({start:0,end:-1}). Zero-byte uploads are a legitimate accepted state (IN-02), so any authenticated member can trigger a protocol-invalid response with one header; no crash and no data exposure. It does not fail any must-have truth (the range truths hold for their asserted scope and pass their tests), so it is an advisory review item — but it should be explicitly triaged (one-line guard + one zero-byte range test) before ship, not silently carried."
    evidence_status: "confirmed deterministically by verifier (branch trace + ERR_OUT_OF_RANGE reproduction)"
behavior_unverified_items:
  - truth: "Firefox's built-in PDF viewer renders its toolbar — including the download button — fully visible inside the modal's tall (~70vh) scrollable iframe (G-12-4 clip half)"
    test: "Open a multi-page PDF's preview modal in real Firefox (12-UAT.md test 1 re-run)"
    expected: "The whole in-iframe PDF toolbar is visible with a working download button, and the document lays out incrementally (no whole-file stall) now that Range/206 serving + the tall viewport are in"
    why_human: "The Chromium e2e pins the iframe geometry (>400px) and headers, but whether Firefox's built-in viewer fits its toolbar inside the taller viewport and streams via ranges is browser-runtime rendering only a human can confirm"
coincidental_reliance_items: []
human_verification:
  - test: "Re-run 12-UAT.md test 1 in real Chrome AND Firefox (G-12-1 + G-12-4 closure re-check): drop a file >5 MB onto a dropzone, watch the progress row, then open a multi-page PDF's preview modal"
    expected: "Progress advances with real transfer pace and the row disappears on completion; the PDF renders inside the tall scrollable iframe, the full viewer toolbar (with download button) is visible in Firefox, and large PDFs paint without the old whole-file stall ('refused to connect' / 'ne peut pas ouvrir cette page' must stay gone)"
    why_human: "Native PDF viewer rendering, toolbar fit, and range-streaming feel are browser-runtime experiences; e2e pins geometry/headers, not the embedded viewer's behavior"
  - test: "Re-run 12-UAT.md test 2 (G-12-2 + G-12-5 closure re-check): copy a file link from BOTH « ... » context menu and the modal footer; paste each into a fresh signed-in browser profile; then paste one into a LOGGED-OUT profile"
    expected: "Both entry points copy the identical /w/:slug/file/:id URL; a signed-in paste renders the bytes (inline types) or downloads (attachment types); a logged-out paste now lands on the LOGIN PAGE (not raw signInRequired JSON), and after signing in the browser returns to the same file URL and the bytes render"
    why_human: "Cross-session navigation with cookies/headers and the login round trip are real-browser behaviour; e2e covers the Chromium round trip but the genuine UAT scenario is a real Firefox profile"
  - test: "Re-run 12-UAT.md test 3 (G-12-3 closure re-check): set MAX_UPLOAD_MB to a distinctive value (e.g. 7), restart the server, open the files tab"
    expected: "Dropzone hint reads the configured value («— jusqu'à 7 Mo chacun» / «— up to 7 MB each»), not the old hardcoded 250"
    why_human: "Operator-visible knob reflection in a running app with a changed env value; automated layers pin the payload and rendered text at boot value, not a manual env change"
---

# Phase 12: Real file uploads and previews — Verification Report (re-verification, round 3)

**Phase Goal:** Replace metadata-only file behaviour with real uploads: server endpoint storing dropped files under `DATA_DIR`, real XHR progress in `handleFiles`, real previews for PDFs and images, and a working destination for « Copier le lien ». Closes the known limitation "File contents are metadata only; no binary upload backend".
**Verified:** 2026-10-25T10:09:01Z
**Status:** human_needed (18/19 truths verified with behavioral evidence; the single behavior-unverified truth is the Firefox-native PDF rendering, folded into the UAT re-run; open advisory: CR-01)
**Re-verification:** Yes — after gap-closure round 2 (plan 12-07: G-12-4, G-12-5)

## Goal Achievement

### Observable Truths

Truths 1–14 are the previously verified set — quick regression this round (existence + the integration suite re-run in this verifier's process covers most of them behaviorally). Truths 15–19 are the 12-07 gap-closure set — full 3-level verification.

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | POST /w/:slug/files stores real bytes at DATA_DIR/files/&lt;id&gt;, returns 200 {id} | ✓ VERIFIED | server.js upload handler unchanged; integration test PASS in this verifier's run (10/10) |
| 2 | Oversize upload rejected mid-stream with 413 + `uploadTooLarge`, server alive | ✓ VERIFIED | integration test PASS in this verifier's run |
| 3 | Viewer/unauthenticated caller cannot upload (minRole 'member') | ✓ VERIFIED | "uploads are gated" test PASS in this verifier's run |
| 4 | /w/:slug/file/:id is byte-only (G-12-1, closed round 1) | ✓ VERIFIED | "byte-only file route" test PASS in this verifier's run |
| 5 | Safe inline/attachment header policy, fixed Content-Type map | ✓ VERIFIED | D-06 test PASS in this verifier's run; map untouched by 12-07 |
| 6 | Doc-PUT file deletion unlinks the binary idempotently | ✓ VERIFIED | UPLOAD-05 test PASS in this verifier's run |
| 7 | handleFiles uses real XHR upload progress; simulated timer gone | ✓ VERIFIED | PREVIEW-01 test PASS in this verifier's run |
| 8 | Failed upload toasts a stable code, removes the progress row, adds no record | ✓ VERIFIED | failRow unchanged; e2e 45/45 (executor run) incl. oversize case |
| 9 | Preview modal renders real bytes: img / pdf iframe / download tile | ✓ VERIFIED | modals.js:309-312 read this round; PDF branch now tall viewport; e2e PDF block green |
| 10 | Both « Copier le lien » entry points copy the identical file URL (G-12-2, closed round 1) | ✓ VERIFIED | no regression: copyLink branches unchanged; e2e clipboard-equality tests green (45/45) |
| 11 | The SPA no longer claims /file/:id — pastes get bytes (G-12-2, closed round 1) | ✓ VERIFIED | main.js:100-127 re-read this round: no 'file' branch, D-13 revised comment present |
| 12 | Dropzone cap hint interpolates live MAX_UPLOAD_MB (G-12-3, closed round 1) | ✓ VERIFIED | five-hop chain re-grepped this round: server.js:1222 → api.js:21/95-96/132 → files.js:43 → en/fr.json:1409; /api/config test PASS; e2e/server.mjs MAX_UPLOAD_MB='1' |
| 13 | Demo mode stays metadata-only | ✓ VERIFIED | handleFiles offline branch untouched by 12-05/12-06/12-07 |
| 14 | i18n: both catalogues carry phase keys; parity gates green | ✓ VERIFIED | err.uploadTooLarge present in both catalogues (line 1483, re-grepped); build gate green in executor's 45/45 run |
| 15 | **[G-12-4a]** The PDF preview iframe is a tall scrollable viewport (~70vh): Firefox's built-in viewer renders its toolbar — including download — fully visible inside the modal | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | modals.js:311: `height:min(70vh,560px)`, 16/9 kept for images (:309), .modal width untouched — present and wired; e2e asserts rendered height >400px in Chromium (flows.spec.mjs:816+); **no test can exercise Firefox's built-in viewer** — see behavior_unverified_items / Human Verification item 1 |
| 16 | **[G-12-4b]** Byte-range requests return 206 + Content-Range and stream only the requested slice; unsatisfiable → 416 `bytes */size`; multi-range/malformed/absent → unchanged 200 full body; Accept-Ranges: bytes on every answer; ranged HEAD | ✓ VERIFIED | server.js:1976-2028 implements exactly the plan's parsing rules (single-range only, ignore-permission fallback); integration test "single-range serving: 206 slices with exact math, 416 unsatisfiable, ignored ranges keep 200 (G-12-4)" PASS in this verifier's process |
| 17 | **[G-12-5a]** An anonymous top-level navigation (Sec-Fetch-Dest: document or metadata-absent) to /w/:slug/file/:id 302-redirects to /login?next=&lt;path&gt; BEFORE any workspace/record lookup — byte-identical for unknown slugs | ✓ VERIFIED | server.js:2074-2081: `currentUser(req)` + dest check precedes `serveFileBinary`; next built from url.pathname only with leading-slash/`//`/backslash/`://` defense; reopened T-12-13 comment recorded (server.js:2040-2073); integration test PASS in this verifier's process (302 shape, metadata-absent, unknown-slug no-oracle, iframe/empty 401, outsider 404, member 200) |
| 18 | **[G-12-5b]** After signing in from the redirect, the browser returns to the same file URL and gets the bytes | ✓ VERIFIED | actions.js:2510-2519: A.doLogin validates ?next= (single /, no //, no backslash, no ://) and full-navigates before the queued-invite block; e2e "logged-out paste → login → return-to-bytes round trip" green in Chromium, both languages (flows.spec.mjs:870+, executor run 45/45) |
| 19 | Every other consumer keeps its contract: iframe/frame/empty destinations keep JSON 401 signInRequired; authenticated-but-unauthorized callers keep the D-05 404 regardless of destination | ✓ VERIFIED | dispatcher discrimination is scoped to `!currentUser(req) && (document or absent)`; requireUser/requireWorkspace untouched; asserted in the G-12-5 integration test PASS in this verifier's run |

**Score:** 18/19 truths verified (1 present-but-behavior-unverified: Firefox-native PDF toolbar rendering — routed to the UAT re-run)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| server.js serveFileBinary range support | 200/206/416 + Accept-Ranges + sliced stream | ✓ VERIFIED | lines 1976-2028; header-only 416; HEAD extended; If-Range declined with comment |
| server.js file-route dispatcher redirect | 302 /login?next= for anonymous document/absent, before lookup | ✓ VERIFIED | lines 2074-2081 + reopened-decision comment 2040-2073 |
| src/overlays/modals.js tall PDF iframe | height:min(70vh,560px); img keeps 16/9 | ✓ VERIFIED | lines 309-312; D-03/D-09 comment records the G-12-4 decision |
| src/actions/actions.js ?next= consumption | validated path-only navigation after login | ✓ VERIFIED | lines 2510-2519; falls through to wantedSlug flow otherwise |
| test/upload.test.mjs | range suite + redirect suite | ✓ VERIFIED | 10/10 tests PASS in this verifier's process (incl. G-12-4 and G-12-5 named tests) |
| e2e/flows.spec.mjs | PDF-iframe height assertion + anon-paste round trip | ✓ VERIFIED | lines 816+, 865-910; 45/45 both locales (executor run) |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| Range header → sliced stream | fs.createReadStream({start,end}) | 206 + Content-Range + Content-Length override | ✓ WIRED | server.js:2016-2028 |
| Anonymous document navigation | /login?next=<pathname> | dispatcher 302 before requireWorkspace | ✓ WIRED | server.js:2074-2081 |
| /login?next= → post-login return | A.doLogin location.assign(next) | URLSearchParams + path-only validation | ✓ WIRED | actions.js:2516-2519 |
| pdf.js range requests | 206 slices | Accept-Ranges: bytes on every serveFileBinary answer | ✓ WIRED | server.js:2004, 2016 |
| (round-1 links) | upload route, byte route, copy-link, knob chain | all re-grepped / re-tested — no regression | ✓ WIRED | see truths 1–14 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| 206 slice | range.start/end | parsed Range header vs stat.size | Yes | ✓ FLOWING |
| redirect Location | next | server's own url.pathname (never client input) | Yes | ✓ FLOWING |
| post-login navigation | next param | server-built ?next= re-validated client-side | Yes | ✓ FLOWING |
| (round-1 traces) | bytes/progress/knob/clipboard | unchanged | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full phase integration suite (upload, 413, auth, byte-only, D-06, delete-unlink, knob, ranges, redirect) | `node --test test/upload.test.mjs` | 10 pass / 0 fail (2.9s), run in this verifier's process | ✓ PASS |
| CR-01 failure mechanism | `node -e "fs.createReadStream(f,{start:0,end:-1})"` | THROWS ERR_OUT_OF_RANGE — confirms the review's zero-byte suffix-range diagnosis | ✓ CONFIRMED (finding, not regression) |
| Gap-closure round-2 commits exist | `git cat-file -t` | 49e28bb, d311687, 6c99fcf, 1942bd3, cedb495 all present | ✓ PASS |
| Debt markers in 12-07 files | grep TBD/FIXME/XXX/HACK/PLACEHOLDER over server.js, modals.js, actions.js, upload.test.mjs, flows.spec.mjs | none | ✓ CLEAN |

Per constraints, the full unit suite was not re-run by this verifier (executor-recorded 445/445 after 12-07; the phase's own integration suite was re-run here). E2e 45/45 (executor run, full build first per the 12-06 run-order rule).

### Probe Execution

No probe scripts declared (`scripts/*/tests/probe-*.sh` absent; none in PLANs). The integration suite above is the phase's runnable probe and was executed in this verifier's own process.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| UPLOAD-01 | 12-01 | Real-bytes upload endpoint | ✓ SATISFIED | tests re-run green this round |
| UPLOAD-02 | 12-01 | MAX_UPLOAD_MB cap + stable 413 code | ✓ SATISFIED | tests re-run green this round |
| UPLOAD-03 | 12-02 | Byte serving route, 404 no-oracle | ✓ SATISFIED | tests re-run green this round; no-oracle extended to the 302 (T-12-16) |
| UPLOAD-04 | 12-02 | Inline/attachment header policy | ✓ SATISFIED | D-06 map untouched; test green |
| UPLOAD-05 | 12-02 | Binary delete with record | ✓ SATISFIED | test green |
| PREVIEW-01 | 12-03 | Real XHR progress | ✓ SATISFIED | test green |
| PREVIEW-02 | 12-03 | Failed upload handling | ✓ SATISFIED | e2e green |
| PREVIEW-03 | 12-03, 12-05, 12-07 | Real-bytes preview modal; PDF iframe fixed, then Firefox stall/clip closed | ✓ SATISFIED | ranges + tall viewport + tests; Firefox-native rendering → human item |
| LINK-01 | 12-03, 12-05, 12-07 | Copied link destination; one URL; login redirect for logged-out pastes | ✓ SATISFIED | byte-only route + copy-link unification + 302/?next= round trip, all tested |
| I18N-01 | 12-04, 12-06 | Catalogue coverage/parity | ✓ SATISFIED | keys re-grepped; build gate green |

**Orphaned requirements:** none. REQUIREMENTS.md declares phase 12 as TBD; traceability lives in plan `requirements` frontmatter and SUMMARY `requirements-completed`. All 10 derived IDs claimed and verified.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| server.js | 1982-1985 | CR-01 (12-REVIEW.md): suffix range on zero-byte file → malformed 206 `bytes 0--1/0` + ERR_OUT_OF_RANGE after headersSent | ⚠️ Warning (advisory — see frontmatter) | Deterministic, reproducible by any authenticated member against a zero-byte stored file; no crash, no data exposure; does not fail any must-have truth; one-line guard + one test closes it |

Pre-existing repo-wide lint (8) and format drift (~19 files) remain logged in deferred-items.md — outside this phase's file set, unchanged by 12-07 (verified identical at its base commit per 12-07-SUMMARY).

### Review Findings still open

CR-01 (critical — see advisory above and Anti-Patterns). Standing findings from earlier reviews (H-1 dupFile, H-2 delete-undo, M-1 svg/heic, M-2 client cap, M-3 non-numeric knob, L-1..L-5, IN-01..04) remain open in 12-REVIEW-DISPOSITION.md as documented follow-ups; none invalidates a verified truth.

### Human Verification Required

See frontmatter `human_verification` for full detail:

1. **UAT test 1 re-run (Chrome AND Firefox)** — drag-drop feel + multi-page PDF embed; Firefox must now show the full viewer toolbar with a working download button and no whole-file stall. (G-12-1 + G-12-4 re-check; also closes behavior_unverified truth 15)
2. **UAT test 2 re-run (both copy-link entry points + logged-out paste)** — identical URL, bytes render/download; logged-out paste lands on the login page and returns to the bytes after sign-in. (G-12-2 + G-12-5 re-check)
3. **UAT test 3 re-check** — MAX_UPLOAD_MB knob reflected in the dropzone hint. (G-12-3 re-check)

The Sessions / password-change / 2FA issues the user reported remain out of phase-12 scope, deferred in 12-UAT.md.

### Gaps Summary

No code gaps. Round-2 gap closure (12-07) is fully implemented and behaviorally pinned: G-12-4 by single-range 206/416 serving (integration test green in this verifier's process) plus the tall PDF viewport (e2e geometry assertion in Chromium); G-12-5 by the pre-lookup 302 with a pathname-only return URL and the validated client-side consumption (integration + e2e round trip green). All locked contracts survived: D-05 no-oracle (extended to the redirect), D-06 header map, iframe/fetch 401, byte-only routing, and the round-1 closures (G-12-1..3) show no regression. The full gate is green (445/445 unit, 45/45 e2e — executor runs; 10/10 upload suite — this verifier's process). The phase goal is achieved at code level. What remains before `passed`: the human UAT re-run of the three items above (chiefly the Firefox-native PDF rendering, the one behavior-unverified truth), and an explicit triage decision on advisory CR-01 (recommended: one-line zero-byte suffix guard + one range test, as specified in 12-REVIEW.md).

---

_Verified: 2026-10-25T10:09:01Z_
_Verifier: the agent (gsd-verifier)_
_covered_digest via `gsd_run query verification.fingerprint`_
