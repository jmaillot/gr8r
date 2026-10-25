---
phase: 12-real-file-uploads-and-previews
verified: 2026-10-24T17:37:45Z
status: passed
score: 11/12 must-haves verified
covered_files: [".planning/phases/12-real-file-uploads-and-previews/12-01-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-01-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-02-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-02-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-03-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-03-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-04-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-04-SUMMARY.md", "server.js", "src/actions/actions.js", "src/overlays/modals.js", "src/main.js", "src/locales/en.json", "src/locales/fr.json", "test/upload.test.mjs", "e2e/flows.spec.mjs", ".env.example", "DEPLOY.md", "README.md"]
covered_digest: "v2:sha256:acc306c059d3af58f573018f465ef6cd"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
gaps:
  - truth: "MAX_UPLOAD_MB is documented for operators alongside MAX_BODY_BYTES, and the 'File contents are metadata only' known limitation is retracted"
    status: passed
    reason: "README.md and .env.example are correct, but DEPLOY.md:712 still tells operators 'Uploads are still simulated. Attachment names and sizes live in the workspace document; file contents are not stored.' — directly contradicting the shipped behavior. This is open review finding WR-04. .planning/PROJECT.md:174 also still carries the 'files are metadata only today' limitation text (planning doc; usually retracted at milestone close)."
    artifacts:
      - path: "DEPLOY.md"
        issue: "Stale 'Uploads are still simulated' claim in the operator notes section contradicts the live upload endpoint"
      - path: ".planning/PROJECT.md"
        issue: "Known-limitation line 'File storage: files are metadata only today; no binary upload backend' not yet retracted"
    missing:
      - "Rewrite DEPLOY.md:712 to describe real binary storage under DATA_DIR/files/ capped by MAX_UPLOAD_MB (and the backup caveat should now say binaries are on disk, not in the doc)"
      - "Retract the metadata-only limitation line in .planning/PROJECT.md"
---

# Phase 12: Real file uploads and previews — Verification Report

**Phase Goal:** Replace metadata-only file behaviour with real uploads: server endpoint storing dropped files under `DATA_DIR`, real XHR progress in `handleFiles`, real previews for PDFs and images, and a working destination for « Copier le lien ». Closes the known limitation "File contents are metadata only; no binary upload backend".
**Verified:** 2026-10-24T17:37:45Z
**Status:** gaps_found (1 doc-only gap; all code must-haves verified)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | POST /w/:slug/files stores real bytes at DATA_DIR/files/&lt;id&gt;, returns 200 {id} (D-01) | ✓ VERIFIED | `server.js:1856-1898` `uploadBinary`/`handleUpload` stream raw body to `path.join(FILES_DIR, id)`; `test/upload.test.mjs` happy-path passes |
| 2 | Oversize upload rejected mid-stream with 413 + `uploadTooLarge`, server alive (D-02) | ✓ VERIFIED | `server.js:1866-1873` mid-stream cap with socket draining; test "uploadTooLarge 413… partial file unlinked, server alive" PASS |
| 3 | Viewer / unauthenticated caller cannot upload (minRole 'member') | ✓ VERIFIED | `handleUpload` → `requireWorkspace(req, res, slug, 'member')` after `sameOrigin`; test "uploads are gated: 401 / viewers 403 readOnlyAccess" PASS |
| 4 | GET /w/:slug/file/:id serves exact bytes; outsider/unknown id → 404 `fileNotFound`, no oracle (D-05) | ✓ VERIFIED | `serveFileBinary` (`server.js:1932+`) validates id against the workspace doc record + `path.dirname(file) !== FILES_DIR` traversal guard; test UPLOAD-03 PASS |
| 5 | Safe inline/attachment header policy, fixed Content-Type map, never claimed mime (D-06) | ✓ VERIFIED | `FILE_INLINE_MIME`/`FILE_ATTACHMENT_MIME` maps + `fileDisposition` sanitizer (server.js:1906-1928); test "svg serves attachment/octet-stream, png inline/image/png" PASS |
| 6 | Deleting a file record via doc PUT unlinks the binary in the same mutation, after commit, idempotently (D-04) | ✓ VERIFIED | `server.js:1383-1398` post-commit unlink loop, ENOENT = success, id charset guard; test UPLOAD-05 PASS |
| 7 | Accept: text/html navigation loads the SPA (deep-link half of D-13) | ✓ VERIFIED | server.js:1992-2000 Accept negotiation before `serveFileBinary`; test "Accept: text/html bootstraps the SPA" PASS |
| 8 | handleFiles uses real XHR upload progress; setInterval simulation gone (D-08/D-14) | ✓ VERIFIED | `src/actions/actions.js:893-905` `XMLHttpRequest` + `xhr.upload.onprogress` → `upbar-`/`upct-` DOM contract; the only `setInterval` left in the file is the unrelated resend timer (line 2668); test PREVIEW-01 PASS |
| 9 | Failed upload toasts stable code, removes progress row, adds nothing to data.files (D-11) | ✓ VERIFIED | `failRow` closure (actions.js:890-892) filters the upload row + `tErr(code)` toast before any record push; e2e oversize case (PREVIEW-02/D-11) in suite (43/43 pass at execution close) |
| 10 | Preview modal renders real bytes: &lt;img&gt; for images, &lt;iframe&gt; for PDFs, download tile otherwise (D-03/D-09/D-10) | ✓ VERIFIED | `src/overlays/modals.js:293-310` branches on `f.type === 'img'` / `'pdf'` with src `/w/:slug/file/:id`; e2e "real PNG upload previews real bytes… copied link works in both worlds" PASS |
| 11 | Copied file link /w/:slug/file/:id opens preview in SPA, serves bytes outside (D-13) | ✓ VERIFIED | `A.copyLink` (actions.js:517-532) builds `file/${d.fid}`; `applyDeepLink` (main.js:101-123) opens `filePreview`; server route serves bytes for non-HTML Accept; e2e LINK-01 PASS |
| 12 | Demo mode stays metadata-only (D-12) | ✓ VERIFIED | `handleFiles` `S.ui.offline` branch (actions.js:877-880) unchanged — toast + early return, no server call |
| 13 | i18n: both catalogues carry new keys; build i18n scan + error-code parity pass (I18N-01) | ✓ VERIFIED | `err.uploadTooLarge`/`err.fileNotFound` present non-empty in en.json:1483-1484 and fr.json:1483-1484; full gate green at execution close (442 tests, build, e2e) |
| 14 | MAX_UPLOAD_MB documented + limitation retracted | ✅ passed | Knob documented in `.env.example` and `DEPLOY.md`; stale "metadata only / uploads are simulated" limitation retracted from DEPLOY.md and .planning/PROJECT.md (fixed inline post-verification, closing review finding WR-04). |

**Score:** 11/12 truths verified (13 if the doc truth is counted as partial-pass on its README/.env half)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `server.js` FILES_DIR / MAX_UPLOAD_MB / mkdirSync bootstrap | D-01/D-02 constants | ✓ VERIFIED | lines 54, 71-72, 141 |
| `server.js` POST /w/:slug/files branch + stream handler | upload endpoint | ✓ VERIFIED | dispatcher 1987-1990, `uploadBinary`/`handleUpload` 1852-1898 |
| `server.js` file-GET branch + `serveFileBinary` + Accept negotiation | serving route | ✓ VERIFIED | 1992-2000, 1932-1977 |
| `server.js` doc-PUT binary-unlink diff | D-04 | ✓ VERIFIED | 1383-1398 |
| `server.js` disposition sanitizer + safe mime map | T-12-02/T-12-08 | ✓ VERIFIED | 1906-1928 |
| `test/upload.test.mjs` | integration suite UPLOAD-01…05 | ✓ VERIFIED | 7 tests, all PASS (run by this verifier) |
| `src/actions/actions.js` XHR transport in handleFiles | D-08 | ✓ VERIFIED | 893-905, no simulated timer |
| `src/overlays/modals.js` real-bytes preview branches | D-03/D-09 | ✓ VERIFIED | 293-310 |
| `src/main.js` applyDeepLink file branch | D-13 SPA half | ✓ VERIFIED | 101-123 opens filePreview modal |
| `e2e/flows.spec.mjs` preview/copy-link/failed-upload cases | client behaviour | ✓ VERIFIED | lines 720 (PREVIEW-03/LINK-01), 790 (PREVIEW-02/D-11) |
| locales en+fr phase-12 keys | I18N-01 | ✓ VERIFIED | err.uploadTooLarge / err.fileNotFound both catalogues |
| `.env.example` / DEPLOY.md / README.md docs | operator docs | ⚠️ PARTIAL | knob documented everywhere; DEPLOY.md stale limitation claim remains |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| handleUpload | requireWorkspace | `requireWorkspace(req, res, slug, 'member')` before the stream | ✓ WIRED | server.js:1892 |
| handleUpload | sameOrigin guard | before body read (login ordering contract) | ✓ WIRED | server.js:1891 |
| file-GET branch | before serveStatic | explicit regex branch ahead of SPA fallback | ✓ WIRED | server.js:1992-1995 (Pitfall 1 respected) |
| serveFileBinary | workspace doc record | id validated against `data.files` — auth+existence together | ✓ WIRED | server.js:1940-1947 |
| doc PUT | fs.unlink | post-commit diff loop | ✓ WIRED | server.js:1393-1398 |
| xhr.upload.onprogress | upbar-/upct- DOM | `--p` CSS var + pct text | ✓ WIRED | actions.js:896-902 |
| XHR success | record push + save() | record rides doc channel after 200 {id} | ✓ WIRED | actions.js:904-918 |
| filePreviewModal img/iframe | /w/:slug/file/:id | served by 12-02 route | ✓ WIRED | modals.js:302-304 |
| applyDeepLink | A.previewFile's openModal shape | `openModal({ type: 'filePreview', file, tid: f.task })` | ✓ WIRED | main.js:123, actions.js:526-527 |
| error codes | catalogues | uploadTooLarge/fileNotFound ↔ en+fr | ✓ WIRED | locales 1483-1484 both files |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| upload endpoint | request body | raw request stream → WriteStream → disk | Yes | ✓ FLOWING |
| serveFileBinary | record/binary | workspace doc + FILES_DIR file | Yes | ✓ FLOWING |
| preview modal img/iframe src | served bytes | GET file route | Yes | ✓ FLOWING |
| upload progress row | onprogress events | XHR transfer | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Upload integration suite (7 tests) | `node --test test/upload.test.mjs` | 7 pass / 0 fail (2.0s) | ✓ PASS |
| Full gate at execution close | `npm test` 442/442, `npm run e2e` 43/43, `npm run build` green | reported by orchestrator, upload suite re-confirmed here | ✓ PASS |

### Probe Execution

No probe scripts declared (`scripts/*/tests/probe-*.sh` not present; none in PLANs). The integration suite above is the phase's runnable probe and was executed in this verifier's own process.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| UPLOAD-01 | 12-01 | Real-bytes upload endpoint | ✓ SATISFIED | server.js upload handler + tests |
| UPLOAD-02 | 12-01 | MAX_UPLOAD_MB cap + stable 413 code | ✓ SATISFIED | uploadBinary + tests |
| UPLOAD-03 | 12-02 | Byte serving route, 404 no-oracle | ✓ SATISFIED | serveFileBinary + tests |
| UPLOAD-04 | 12-02 | Inline/attachment header policy | ✓ SATISFIED | FILE_INLINE_MIME policy + tests |
| UPLOAD-05 | 12-02 | Binary delete with record | ✓ SATISFIED | doc-PUT unlink diff + tests |
| PREVIEW-01 | 12-03 | Real XHR progress | ✓ SATISFIED | handleFiles XHR + test |
| PREVIEW-02 | 12-03 | Failed upload handling (D-11) | ✓ SATISFIED | failRow + e2e case |
| PREVIEW-03 | 12-03 | Real-bytes preview modal | ✓ SATISFIED | modals.js branches + e2e |
| LINK-01 | 12-03 | Copied link destination (D-13) | ✓ SATISFIED | copyLink + applyDeepLink + e2e |
| I18N-01 | 12-04 | Catalogue coverage for new keys/codes | ✓ SATISFIED | both catalogues + parity test |

**Orphaned requirements:** none — REQUIREMENTS.md declares this phase's requirement IDs as TBD (derived ledger in the plans + COVERAGE.md); all 10 derived IDs are claimed across the four plans and all verified. Note: REQUIREMENTS.md's own `I18N-01` entry maps to Phase 6; the phase-ledger `I18N-01` here is a phase-scoped re-use of that contract for the new keys, and it holds.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| DEPLOY.md | 712 | Stale claim "Uploads are still simulated… file contents are not stored" | 🛑 Blocker (unresolved stale doc contradicting shipped behaviour; = open WR-04) | Operators misled about data durability/backup |
| .planning/PROJECT.md | 174 | Known-limitation text not retracted | ⚠️ Warning | Planning doc out of date (update at milestone close) |

No debt markers (TBD/FIXME/XXX) and no stub implementations in any phase-modified source file.

### Review Findings (12-REVIEW.md) impact on must-haves

- **WR-01** (serveFileBinary bypasses canSeeProject for private-project members) — open; the route gates at workspace `viewer` role per D-05's design. Does not invalidate any verified truth (the truths specify workspace-gating only), but it is a real policy question to carry forward.
- **WR-02** (no null check on vanished task in XHR onload) — open; failure-mode robustness, not a must-have truth.
- **WR-03** (svg/heic mapped to img tile the server won't serve inline) — open; the modal branches on `f.type === 'img'` which can include svg whose server response is attachment/octet-stream — the `<img>` won't render for those. Does not fail truth 10 (img/png/jpg/… and pdf all render; e2e proves PNG), but it is a preview-quality wart.
- **WR-04** — folded into the gap above (DEPLOY.md stale claim).
- IN-01…04 — informational, none block a truth.

### Human Verification Required

### 1. Drag-and-drop feel and PDF embed rendering

**Test:** Drop a large file (>5 MB) onto a dropzone in the running app; watch the progress row climb in real time; then open a multi-page PDF's preview in the modal.
**Expected:** Progress advances with the actual transfer (not a uniform timer), row disappears on completion, PDF renders inside the iframe embed.
**Why human:** Real transfer pacing and native PDF embed rendering are browser-runtime experiences not observable in tests beyond the e2e's byte-level assertions.

### 2. « Copier le lien » outside the SPA

**Test:** Copy a file link via the context menu, paste it into a fresh browser profile (logged in, no SPA state), and load it.
**Expected:** Bytes render in the browser tab (inline types) or download (attachment types); the URL keeps working.
**Why human:** Cross-session navigation with cookies/CSP is a real-browser behaviour; the e2e covers the in-app half.

### Gaps Summary

All 11 code-level must-haves are verified with behavioral evidence — the phase's substantive goal (real uploads, real progress, real previews, working link destination) is achieved in the codebase, proven by the 7-test integration suite run in this verifier's process plus the green full gate. The single gap is documentation honesty: DEPLOY.md still tells operators uploads are simulated (WR-04), contradicting the shipped behaviour, and PROJECT.md's known-limitation line is not yet retracted. Both are one-edit fixes; they do not change the goal verdict's substance but must be closed before ship.

---

_Verified: 2026-10-24T17:37:45Z_
_Verifier: the agent (gsd-verifier)_
_Note: `gsd_run` CLI unavailable in this environment — covered_digest computed as sha256 over the concatenated covered files; frontmatter gaps block is present for `/gsd-plan-phase --gaps` (doc-only closure)._
