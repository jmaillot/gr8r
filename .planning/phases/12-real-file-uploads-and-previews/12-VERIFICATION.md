---
phase: 12-real-file-uploads-and-previews
verified: 2026-10-25T08:18:05Z
status: human_needed
score: 14/14 must-haves verified
covered_files: [".planning/phases/12-real-file-uploads-and-previews/12-01-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-01-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-02-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-02-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-03-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-03-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-04-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-04-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-05-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-05-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-06-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-06-SUMMARY.md", "server.js", "src/actions/actions.js", "src/main.js", "src/overlays/modals.js", "src/overlays/context-menu.js", "src/views/files.js", "src/core/api.js", "src/locales/en.json", "src/locales/fr.json", "test/upload.test.mjs", "e2e/flows.spec.mjs", "e2e/server.mjs", ".env.example", "DEPLOY.md", "README.md"]
covered_digest: "v2:sha256:2e944e8c8efc1d9b257d0b7dfd94acda17b6c8b43bc90d306caede5bb2d4fd52"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 12/12 (post-inline-doc-fix; superseded by 3 UAT gaps G-12-1..3)
  gaps_closed:
    - "G-12-1: PDF iframe refused in Chrome and Firefox — byte-only /w/:slug/file/:id route (12-05, commit 2147c91)"
    - "G-12-2: two divergent copy-link entry points — A.copyLink file branch keyed on data-id + SPA deep-link 'file' block retired (12-05, commit de467cb)"
    - "G-12-3: dropzone cap label static build-time text — maxUploadMb exposed via /api/config and interpolated live (12-06, commits e0a40e5 + 73cb414)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Re-run 12-UAT.md test 1 in real Chrome AND Firefox ( closure re-check): drop a file >5 MB onto a dropzone, watch the progress row climb, then open a multi-page PDF's preview modal"
    expected: "Progress advances with real transfer pace, row disappears on completion, PDF renders inside the iframe embed (Chrome 'refused to connect' and Firefox 'ne peut pas ouvrir cette page' must be gone)"
    why_human: "Native PDF viewer rendering and transfer pacing are browser-runtime experiences; the e2e pins network/headers, not the embedded viewer's feel"
  - test: "Re-run 12-UAT.md test 2 (G-12-2 closure re-check): copy a file link from BOTH « ... » context menu and the modal footer, paste each into a fresh signed-in browser profile"
    expected: "Both entry points copy the identical /w/:slug/file/:id URL; the paste renders the bytes in the tab (inline types) or downloads (attachment types)"
    why_human: "Cross-session navigation with cookies/headers is real-browser behaviour; e2e covers the in-app half and the clipboard only"
  - test: "Re-run 12-UAT.md test 3 (G-12-3 closure re-check): set MAX_UPLOAD_MB to a distinctive value (e.g. 7), restart the server, open the files tab"
    expected: "Dropzone hint reads the configured value («— jusqu'à 7 Mo chacun» / «— up to 7 MB each»), not the old hardcoded 250"
    why_human: "Operator-visible knob reflection in a running app with a changed env value; automated layers pin the payload (7) and the rendered e2e text (1), not a manual env change"
---

# Phase 12: Real file uploads and previews — Verification Report (re-verification)

**Phase Goal:** Replace metadata-only file behaviour with real uploads: server endpoint storing dropped files under `DATA_DIR`, real XHR progress in `handleFiles`, real previews for PDFs and images, and a working destination for « Copier le lien ». Closes the known limitation "File contents are metadata only; no binary upload backend".
**Verified:** 2026-10-25T08:18:05Z
**Status:** human_needed (all 14 code must-haves verified with behavioral evidence; the 3 closed UAT gaps await a human browser re-run)
**Re-verification:** Yes — after gap closure by plans 12-05 and 12-06

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | POST /w/:slug/files stores real bytes at DATA_DIR/files/&lt;id&gt;, returns 200 {id} | ✓ VERIFIED | server.js:1857-1898 `uploadBinary` streams body to `path.join(FILES_DIR, id)`; integration test run by this verifier: "handleFiles uploads real bytes via XMLHttpRequest…" PASS |
| 2 | Oversize upload rejected mid-stream with 413 + `uploadTooLarge`, server alive | ✓ VERIFIED | server.js:1866-1880 (drain-on-overflow, unlink partial, reject 413); test "uploadTooLarge 413…" PASS in this verifier's run |
| 3 | Viewer/unauthenticated caller cannot upload (minRole 'member') | ✓ VERIFIED | server.js:1892-1894 sameOrigin + `requireWorkspace(…,'member')`; gating test PASS |
| 4 | **[G-12-1 CLOSED]** /w/:slug/file/:id is byte-only — iframe navigations (Accept: text/html, Sec-Fetch-Dest: document) receive the bytes, never the SPA shell | ✓ VERIFIED | server.js:1991-2006: the dispatcher calls `serveFileBinary` unconditionally — no Accept/Sec-Fetch-Dest branch survives (comment documents the 12-05 deletion); serveFileBinary inline headers carry `frame-ancestors 'self'` and NO X-Frame-Options (server.js:1960-1967); test "byte-only file route: Accept: text/html and Sec-Fetch-Dest: document receive the bytes, never the SPA (G-12-1)" PASS in this verifier's run |
| 5 | Safe inline/attachment header policy, fixed Content-Type map, never the claimed mime | ✓ VERIFIED | FILE_INLINE_MIME/FILE_ATTACHMENT_MIME + `fileDisposition` sanitizer (server.js:1907-1928); test "svg serves attachment/octet-stream, png serves inline/image/png" PASS |
| 6 | Deleting a file record via doc PUT unlinks the binary in the same mutation, idempotently | ✓ VERIFIED | server.js:~1383-1398 post-commit unlink loop; test UPLOAD-05 PASS |
| 7 | handleFiles uses real XHR upload progress; the simulated timer is gone | ✓ VERIFIED | actions.js:897-921 XMLHttpRequest + `xhr.upload.onprogress` → `upbar-`/`upct-` contract; integration test PREVIEW-01 PASS |
| 8 | Failed upload toasts a stable code, removes the progress row, adds nothing to data.files | ✓ VERIFIED | `failRow` closure (actions.js:909-912) filters the row + `tErr(code)` toast before any record push; e2e oversize case green (43/43) |
| 9 | Preview modal renders real bytes: &lt;img&gt; for images, &lt;iframe&gt; for PDFs, download tile otherwise | ✓ VERIFIED | modals.js:293-310 branches on `f.type === 'img'`/`'pdf'` with src `/w/:slug/file/:id`; e2e asserts a two-page PDF iframe loads `application/pdf` with no framing-denial headers (flows.spec.mjs:802+) |
| 10 | **[G-12-2 CLOSED]** Both « Copier le lien » entry points copy the identical {base}/w/{slug}/file/{id} URL | ✓ VERIFIED | A.copyLink (actions.js:517-537) resolves the context menu's data-id-only button via the file branch (`file` lookup between the d.fid and proj(d.id) branches, disjoint id-spaces asserted); modal button stamps `data-fid` (modals.js) — both produce `file/:id`; e2e "context-menu copyLink clipboard equality + modal copyLink clipboard equality" green |
| 11 | **[G-12-2 CLOSED]** The SPA no longer claims /file/:id — top-level paste serves the bytes directly (inline renders, attachment downloads) | ✓ VERIFIED | main.js:100-127 `applyDeepLink` has NO 'file' branch (D-13 revised comment at lines 116-122 documents the 12-05 deletion); the byte-only route is the sole authority; e2e "top-level paste renders the image document (naturalWidth) + text/html fetch carries the exact byte payload" green |
| 12 | **[G-12-3 CLOSED]** The dropzone cap hint interpolates the live MAX_UPLOAD_MB knob across the full five-hop chain | ✓ VERIFIED | All hops in code: server.js:1222 `maxUploadMb: MAX_UPLOAD_MB` in /api/config → api.js:21/95-96/132 `state.maxUploadMb` (25 fallback) + `api.maxUploadMb` getter → files.js:43 `t('page.files.dropLimit', { n: api.maxUploadMb })` → en/fr.json:1409 `"— up to {n} MB each"` / `"— jusqu'à {n} Mo chacun"`; integration test run by this verifier boots MAX_UPLOAD_MB=7 and asserts /api/config carries exactly 7 PASS; e2e asserts the rendered hint contains the boot knob (1) and NOT 250 (flows.spec.mjs:757-760, e2e/server.mjs MAX_UPLOAD_MB='1') |
| 13 | Demo mode stays metadata-only | ✓ VERIFIED | actions.js `S.ui.offline` branch in `handleFiles` (lines ~875-880) unchanged — toast + early return, no server call |
| 14 | i18n: both catalogues carry the phase keys; placeholder-parity and error-code gates green | ✓ VERIFIED | `page.files.dropLimit` in {n} placeholder form in both catalogues; `err.uploadTooLarge`/`err.fileNotFound` present non-empty in both; build (i18n scan) green in this verifier's process |

**Score:** 14/14 truths verified (0 present-but-behavior-unverified — every truth has a passing integration or e2e behavioral test, most run in this verifier's own process)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| server.js upload/serving/dispatch code | D-01…D-07 endpoint + byte route | ✓ VERIFIED | uploadBinary/handleUpload 1857-1898; serveFileBinary 1933-1974; dispatcher 1987-2006 |
| server.js /api/config maxUploadMb | G-12-3 server hop | ✓ VERIFIED | line 1222, payload otherwise unchanged |
| src/core/api.js knob state | G-12-3 client hop | ✓ VERIFIED | state default 25 (:21), getter (:95-96), init read (:132) |
| src/views/files.js rendered hint | G-12-3 render hop | ✓ VERIFIED | line 43 passes `{ n: api.maxUploadMb }` |
| src/locales en+fr dropLimit | G-12-3 catalogue hop | ✓ VERIFIED | line 1409 both files, {n} placeholder form |
| src/actions/actions.js A.copyLink file branch | G-12-2 | ✓ VERIFIED | lines 517-537, data-id file resolution |
| src/main.js applyDeepLink | G-12-2 SPA half | ✓ VERIFIED | no 'file' branch; D-13 revised comment |
| test/upload.test.mjs | integration proofs incl. G-12-1/G-12-3 | ✓ VERIFIED | 8 tests, all PASS in this verifier's run |
| e2e/flows.spec.mjs | byte-only, clipboard equality, knob hint, PDF iframe | ✓ VERIFIED | lines 681-823 (+MAX_UPLOAD_MB='1' in e2e/server.mjs) — 43/43 both locales (orchestrator run) |
| .env.example / DEPLOY.md / README.md | operator docs | ✓ VERIFIED | MAX_UPLOAD_MB documented in all three (env:96; DEPLOY:157,176,713; README:143); no stale "simulated / metadata only" claims found |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| GET /w/:slug/file/:id dispatch | serveFileBinary | unconditional byte-only branch, before serveStatic | ✓ WIRED | server.js:1991-2006 — no Accept/Sec-Fetch-Dest escape to the SPA |
| serveFileBinary headers | iframe embed | inline → `frame-ancestors 'self'`, no X-Frame-Options | ✓ WIRED | server.js:1960-1967 |
| filePreview modal iframe | /w/:slug/file/:id | src on the byte-only route | ✓ WIRED | modals.js:302-304 |
| context menu copyLink (data-id) | A.copyLink file branch | id lookup in `D().files` | ✓ WIRED | context-menu.js:80-86 stamps data-id; actions.js:523 resolves |
| modal copyLink (data-fid) | A.copyLink d.fid branch | `file/${d.fid}` | ✓ WIRED | modals.js footer + actions.js:532-533 |
| applyDeepLink pasted file URL | SPA fallback → server | no 'file' branch — bytes served by route | ✓ WIRED | main.js:100-127 |
| /api/config | api.init() | `maxUploadMb: MAX_UPLOAD_MB` → `Number(r.data?.maxUploadMb) \|\| 25` | ✓ WIRED | server.js:1222; api.js:132 |
| api.maxUploadMb | dropzone label | `t('page.files.dropLimit', { n: api.maxUploadMb })` ↔ `{n}` placeholder | ✓ WIRED | files.js:43; en/fr.json:1409 |
| upload endpoint | doc channel | 200 {id} → record push → save() | ✓ WIRED | actions.js:921-935 |
| error codes | catalogues | uploadTooLarge/fileNotFound ↔ en+fr | ✓ WIRED | both catalogues |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| upload endpoint | request body | raw request stream → WriteStream → disk | Yes | ✓ FLOWING |
| serveFileBinary | record + bytes | workspace doc + FILES_DIR file | Yes | ✓ FLOWING |
| dropzone cap hint | api.maxUploadMb | MAX_UPLOAD_MB env → /api/config → state → t() call site | Yes | ✓ FLOWING |
| copy-link clipboard | file id | resolved from D().files or data-fid | Yes | ✓ FLOWING |
| upload progress | onprogress events | XHR transfer | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Upload/serve integration suite incl. G-12-1 and G-12-3 regression tests | `node --test test/upload.test.mjs` | 8 pass / 0 fail (2.3s), run in this verifier's process | ✓ PASS |
| Full unit suite | `npm test` | 443 pass / 0 fail (17.1s), run in this verifier's process | ✓ PASS |
| Build + e2e 43/43 both locales | `npm run build && npm run e2e` | green (orchestrator run; run-order rule respected — full build last before e2e); built dist bundle confirmed to carry `maxUploadMb` | ✓ PASS |
| Gap-closure commits exist | `git cat-file -t` ×4 | 2147c91, de467cb, e0a40e5, 73cb414 all present in HEAD history | ✓ PASS |

### Probe Execution

No probe scripts declared (`scripts/*/tests/probe-*.sh` not present; none in PLANs). The integration suite above is the phase's runnable probe and was executed in this verifier's own process.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| UPLOAD-01 | 12-01 | Real-bytes upload endpoint | ✓ SATISFIED | server.js upload handler + tests (re-run green) |
| UPLOAD-02 | 12-01 | MAX_UPLOAD_MB cap + stable 413 code | ✓ SATISFIED | uploadBinary + tests |
| UPLOAD-03 | 12-02 | Byte serving route, 404 no-oracle | ✓ SATISFIED | serveFileBinary + tests |
| UPLOAD-04 | 12-02 | Inline/attachment header policy | ✓ SATISFIED | D-06 policy + tests |
| UPLOAD-05 | 12-02 | Binary delete with record | ✓ SATISFIED | doc-PUT unlink diff + tests |
| PREVIEW-01 | 12-03 | Real XHR progress | ✓ SATISFIED | handleFiles XHR + test |
| PREVIEW-02 | 12-03 | Failed upload handling | ✓ SATISFIED | failRow + e2e case |
| PREVIEW-03 | 12-03, 12-05 | Real-bytes preview modal (PDF iframe fixed) | ✓ SATISFIED | modals.js branches + byte-only route + e2e PDF assertions |
| LINK-01 | 12-03, 12-05 | Copied link destination (one URL, bytes on paste) | ✓ SATISFIED | copyLink unification + deleted SPA branch + e2e clipboard equality |
| I18N-01 | 12-04, 12-06 | Catalogue coverage/parity (phase-scoped reuse) | ✓ SATISFIED | {n} placeholder form both catalogues; build gate green |

**Orphaned requirements:** none. REQUIREMENTS.md declares phase 12 as TBD; traceability lives in plan `requirements` frontmatter and SUMMARY `requirements-completed` (12-05: PREVIEW-03, LINK-01; 12-06: none new — I18N-01 phase-scoped reuse). All 10 derived IDs claimed and verified.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (none) | — | No TBD/FIXME/XXX/HACK/PLACEHOLDER markers in any phase-modified file | ℹ️ Info | scan clean |

Note: pre-existing repo-wide lint (8 incl. intentional 12-02 no-control-regex) and format drift (~19 files) are logged in deferred-items.md — outside this phase's file set, not re-flagged here (12-05/12-06 issue notes; a dedicated cleanup task is recommended before ship).

### Review Findings (12-REVIEW.md) still open

WR-01 (canSeeProject bypass for private-project members — route gates at workspace viewer role, per D-05 design), WR-02 (no null check on vanished task in XHR onload), WR-03 (svg/heic render as <img> the server marks attachment) — all remain open as policy/robustness follow-ups; none invalidates a verified truth.

### Human Verification Required

The three UAT items were diagnosed as gaps G-12-1/G-12-2/G-12-3 and are code-closed with automated proofs, but the real-browser UAT re-run has NOT happened — the automated checks do not auto-approve them. Re-run (see frontmatter human_verification for full detail):

1. **PDF embed + drag-drop feel** — real Chrome AND Firefox; "refused to connect"/"ne peut pas ouvrir cette page" must be gone. (G-12-1 re-check)
2. **Copy-link fresh-profile paste from both entry points** — identical URL, bytes render or download. (G-12-2 re-check)
3. **MAX_UPLOAD_MB knob → visible hint change** — set a distinctive value, restart, read the label. (G-12-3 re-check)

Additionally, the Sessions / password-change / 2FA items the user reported during UAT are out of phase-12 scope and recorded as deferred follow-ups in 12-UAT.md.

### Gaps Summary

No code gaps remain. All three UAT gaps are closed and behaviorally pinned: G-12-1 by the unconditional byte-only dispatch (server.js:1991-2006) + frame-ancestors 'self' inline headers, proven by a G-12-1-named integration test run in this verifier's process and an e2e PDF-iframe assertion; G-12-2 by A.copyLink's data-id file branch + the deleted applyDeepLink 'file' block, proven by e2e clipboard-equality and top-level-paste assertions; G-12-3 by the complete five-hop knob chain, proven by an integration test at MAX_UPLOAD_MB=7 asserting exactly 7 and an e2e rendered-hint assertion (knob 1, never 250). The full gate is green in this verifier's process (443/443 unit; upload suite 8/8) plus orchestrator-run build and e2e (43/43, both locales). The phase goal is achieved at code level; the remaining work is the human UAT re-run of the three items above before status flips to passed.

---

_Verified: 2026-10-25T08:18:05Z_
_Verifier: the agent (gsd-verifier)_
_Note: `gsd_run` CLI unavailable in this environment — covered_digest computed as sha256 over the concatenated covered files_
