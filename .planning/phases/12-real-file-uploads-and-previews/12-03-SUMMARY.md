---
phase: 12-real-file-uploads-and-previews
plan: 03
subsystem: client
tags: [uploads, xhr, preview-modal, deep-link, e2e, i18n-scan]
requires: ["POST /w/:slug/files (12-01)", "GET /w/:slug/file/:id + Accept negotiation (12-02)", "upbar-/upct- DOM contract", "openModal/filePreviewModal", "applyDeepLink"]
provides: ["XHR upload transport with real progress in handleFiles", "failure toasts with no orphan record (D-11)", "real-bytes filePreviewModal (img/iframe branches)", "file deep link /w/:slug/file/:id opens the preview modal (D-13)", "3 Chromium e2e cases + PREVIEW-01 static guard"]
affects: [12-04 (preview polish), /gsd-verify-work (UAT for PREVIEW-01..03, LINK-01)]
tech-stack:
  added: []   # zero-runtime-dependency guarantee held (XHR, native img/iframe)
  patterns: [success-first record push (D-11 ordering), tErr stable-code toast, esc-then-template, Playwright Accept-negotiation testing via route header rewrite]
key-files:
  created: []
  modified: [src/actions/actions.js, src/overlays/modals.js, src/main.js, test/upload.test.mjs, e2e/flows.spec.mjs, e2e/server.mjs, scripts/i18n-scan.mjs]
decisions:
  - "Record uses the server-assigned id (xhr.response.id), not a client uid — the binary on disk and the doc record agree by construction"
  - "Deep-link SPA half tested with a Playwright route header rewrite: Chromium's automated navigations send a star-slash Accept, so text/html is forced explicitly (a manual navigation would send it on its own)"
  - "In-page negotiation fetches cache-bust: the HTTP cache keys without Accept and would mask the negotiated response"
  - "i18n scan: new machine RULE (not an allow-list entry) — an HTTP verb as first arg of an .open() transport call is a machine method name"
metrics:
  duration: ~35 min
  completed: 2026-10-24
  commits: 3
plan_head_before: fdb8c15d8fab9da43918630f65c06a6a546f3a21
plan_head_after: 6f8461d
actuals:
  tokens: 53000
  tasks: 3
  commits: 3
status: complete
---

# Phase 12 Plan 03: Client swap — XHR uploads, real previews, deep link Summary

**One-liner:** `handleFiles` now uploads real bytes over XHR with real progress (the simulated timer is gone), failures toast the stable error code and leave no record, the preview modal renders real bytes (`<img>`/native `<iframe>`), and the copied `/w/:slug/file/:id` link opens that modal inside the SPA while the server serves bytes outside it.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Tracer — handleFiles XHR swap with real progress (D-08, D-11, D-12, D-14) | f415e9c |
| 2 | Real-bytes preview modal + deep-link destination (D-03, D-09, D-10, D-13) | 7644522 |
| 3 | Chromium e2e — preview, copy-link, failed upload (PREVIEW-02, PREVIEW-03, LINK-01) | 6f8461d |

## What Was Built

- `src/actions/actions.js` `handleFiles`: the `setInterval` simulation replaced by one `XMLHttpRequest` per file (`POST /w/:slug/files?name=&project=&task=`, raw body, `responseType 'json'`). `xhr.upload.onprogress` drives the preserved `upbar-<id>` `--p` CSS var + `upct-<id>` pct contract. **Success-first ordering (D-11):** only after XHR resolves does the record (`id` from the server) join `data.files`/`task.attachments`, then `logAct`/`save()`/`render()`/`toast.uploaded`. **Failure:** toast via `tErr(code)` (incl. `uploadTooLarge` from 12-01), progress row removed, nothing pushed. `onerror` → `err.serverUnreachable`. The `S.ui.offline` demo early-return is byte-preserved (D-12); entry points untouched (D-14).
- `src/overlays/modals.js` `filePreviewModal`: `f.type === 'img'` → `<img src="/w/…/file/…">` in the bordered aspect-ratio box; `pdf` → native `<iframe>` (no PDF library, D-09); every other type keeps the `filePrev(f)` download tile (D-03). All user-controlled values pass `esc()` (T-12-09). Lists/grids untouched (D-10).
- `src/main.js` `applyDeepLink`: the dead `go('file', …)` call replaced by opening the preview modal exactly like `A.previewFile` — `openModal({ type: 'filePreview', file: f, tid: f.task })` — on the landed route (D-13's one destination in both worlds). No new ROUTE_ID, no new page. `A.dupFile` stays metadata-only (documented 404 → toast behaviour; no code change).
- `test/upload.test.mjs`: PREVIEW-01 static guard — `handleFiles` region must contain `XMLHttpRequest` + `upload.onprogress`, must not contain `setInterval`, and must keep the progress contract and the offline branch.
- `e2e/flows.spec.mjs` (+ per-lang upload fixture workspace/project in `beforeAll`): three cases in the existing catalogue-driven style — real PNG upload → success toast → modal img decodes (naturalWidth > 0); clipboard equals `{base}/w/{slug}/file/{id}`, deep-link navigation opens the modal, in-page fetches prove image bytes vs SPA HTML; oversize drop (2 MB vs `MAX_UPLOAD_MB=1` in `e2e/server.mjs`) toasts `err.uploadTooLarge`, removes the row, adds no record, and a subsequent upload succeeds.

## Verification

- `npm run build` → green (i18n scan clean over new literals)
- `node --test test/upload.test.mjs -x` → 7 pass, 0 fail (static PREVIEW-01 included)
- `npm test` full suite → 442 pass, 0 fail
- `npm run e2e` → 43 pass, 0 fail (39 pre-existing green + 4 new: 3 cases × en/fr)
- No new dependency in package.json

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] i18n sweep flagged `'POST'` as an unexplained capitalised literal**
- **Found during:** Task 3 (`npm test`, `test/i18n-scan.test.mjs` raw coverage sweep)
- **Issue:** The new `xhr.open('POST', …)` call introduced a capitalised single-word literal at a position no machine rule covered — the scan's philosophy is that such a value means a missing RULE, not an allow-list entry.
- **Fix:** Added the position rule to `scripts/i18n-scan.mjs` (both the findings guard and the sweep's classifier): an HTTP verb as the first argument of an `.open()` transport call is `HTTP_VERBS`.
- **Files modified:** scripts/i18n-scan.mjs
- **Commit:** 6f8461d

**2. [Rule 1 - Test bug] E2E deep-link assertion raced the doc channel and the HTTP cache**
- **Found during:** Task 3
- **Issue:** (a) the record rides the async doc channel — the modal's `<img>` could request bytes before the server doc held the record (404 → naturalWidth 0, and the fixture client's record count read stale); (b) Chromium's automated `page.goto` sends a non-HTML Accept so the server (correctly) served raw bytes and Chromium rendered its image viewer instead of the SPA; (c) in-page negotiation fetches hit the HTTP cache keyed without Accept.
- **Fix:** (a) `expect.poll` on the server-side doc before opening the modal / counting records; (b) force `text/html` with a Playwright route header rewrite for the deep-link navigation (documented in the spec — a manual navigation would send it on its own); (c) cache-busted fetches with `cache: 'no-store'`.
- **Files modified:** e2e/flows.spec.mjs
- **Commits:** 6f8461d

## Known Stubs

None — no placeholder data paths introduced.

## Self-Check: PASSED

- `src/actions/actions.js`, `src/overlays/modals.js`, `src/main.js`, `test/upload.test.mjs`, `e2e/flows.spec.mjs` modified as claimed; commits f415e9c, 7644522, 6f8461d present on HEAD (main, allow_default_branch_commits: true).
