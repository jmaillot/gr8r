---
phase: 12-real-file-uploads-and-previews
plan: 05
subsystem: api
tags: [file-serving, content-negotiation, deep-links, clipboard, x-frame-options, iframe, playwright]

requires:
  - phase: 12-real-file-uploads-and-previews (12-02, 12-03)
    provides: the /w/:slug/file/:id byte-serving route, serveFileBinary's D-06 header map, the preview modal and its copy-link button
provides:
  - A byte-only /w/:slug/file/:id route — every consumer (modal iframe, pasted top-level navigation, fetch) receives the D-06-governed bytes; the Accept:text/html SPA branch is gone
  - A single copy-link URL form — the « ... » file context menu resolves the file link from its data-id-only button
  - The SPA no longer claims /file/:id — applyDeepLink's file-modal bootstrap is deleted
  - Integration + e2e proofs: Accept/Sec-Fetch-Dest negotiation tests, bytes-on-paste, PDF-iframe response assertions, context-menu clipboard equality
affects: [12-06, phase verification, UAT re-run]

actuals:
  tokens: 4437
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "byte-only published route: a record-backed file URL serves bytes to every navigation destination; header policy lives in one function (serveFileBinary/D-06)"
    - "same-dataset branch resolution: a context-menu item that stamps only data-id can resolve its entity inside the action when id-spaces are provably disjoint"

key-files:
  created: []
  modified:
    - server.js
    - src/actions/actions.js
    - src/main.js
    - e2e/flows.spec.mjs
    - test/upload.test.mjs

key-decisions:
  - "Top-level paste of a file URL serves the bytes directly (inline renders, attachment downloads) — the UAT truth wins over the old D-13 modal bootstrap; the in-app destination stays A.previewFile's preview modal"
  - "The SPA deep-link branch for files is deleted, not gated: no code path pretends the SPA owns /file/:id"
  - "The context-menu copyLink is fixed inside A.copyLink with a data-id file branch, not by stamping data-fid in context-menu.js (one code site, e2e asserts the output directly)"
  - "An unauthenticated paste of a file URL now answers 404 for text/html navigations too — D-05 no-oracle extended, documented as the locked isolation decision (T-12-13 accept), not a regression"

patterns-established:
  - "Fetch-metadata never routes: the dispatcher ignores Accept/Sec-Fetch-Dest for /file/:id and delegates wholly to the byte server"

requirements-completed: [PREVIEW-03, LINK-01]

coverage:
  - id: D1
    description: "The preview modal's PDF iframe displays the PDF — byte-only route, application/pdf, no framing-denial headers"
    requirement: PREVIEW-03
    verification:
      - kind: integration
        ref: "test/upload.test.mjs#byte-only file route: Accept: text/html and Sec-Fetch-Dest: document receive the bytes, never the SPA (G-12-1)"
        status: pass
      - kind: e2e
        ref: "e2e/flows.spec.mjs#file uploads and previews › a real PNG upload previews real bytes in the modal and its copied link works in both worlds (en+fr) — G-12-1 PDF iframe block"
        status: pass
    human_judgment: false
  - id: D2
    description: "Pasting a copied /w/:slug/file/:id URL into a fresh signed-in session renders the bytes (inline) or downloads (attachment)"
    requirement: LINK-01
    verification:
      - kind: e2e
        ref: "e2e/flows.spec.mjs#file uploads and previews › top-level paste renders the image document (naturalWidth) + text/html fetch carries the exact byte payload"
        status: pass
      - kind: integration
        ref: "test/upload.test.mjs#byte-only file route — attachment type under Accept: text/html serves attachment,application/octet-stream"
        status: pass
    human_judgment: false
  - id: D3
    description: "Both « Copier le lien » entry points copy the identical {base}/w/{slug}/file/{id} URL"
    requirement: LINK-01
    verification:
      - kind: e2e
        ref: "e2e/flows.spec.mjs#file uploads and previews › context-menu copyLink clipboard equality (en+fr) + modal copyLink clipboard equality"
        status: pass
    human_judgment: false
  - id: D4
    description: "Manual UAT re-run of 12-UAT.md tests 1 and 2 in real Chrome and Firefox (multi-page PDF rendering feel, fresh-profile paste)"
    verification: []
    human_judgment: true
    rationale: "Browser-engine-specific rendering behavior (Firefox PDF viewer) and fresh-profile UX are human-verifiable only; automated coverage pins the network/headers."

# Metrics
duration: 8min
completed: 2026-10-25
status: complete
---

# Phase 12 Plan 5: Gap closure — byte-only file route & one copy-link URL Summary

**`/w/:slug/file/:id` is now byte-only (no Accept:text/html SPA branch), and both « Copier le lien » entry points put the identical published URL on the clipboard — the PDF iframe renders and a top-level paste delivers the bytes.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-25T07:43:27Z
- **Completed:** 2026-10-25T07:52:04Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- G-12-1 closed: the file GET/HEAD dispatcher calls `serveFileBinary` unconditionally — iframe navigations (which send `Accept: text/html` exactly like top-level navigations) now receive the PDF/image bytes with `frame-ancestors 'self'` and no `X-Frame-Options`, never the SPA shell with its DENY
- G-12-2 defect 1 closed: `A.copyLink` resolves the file link from the `« ... »` context menu's `data-id`-only button via a new file branch between the `d.fid` and `d.id && proj(d.id)` branches (id-spaces provably disjoint — deterministic miss-first order)
- G-12-2 defect 2 closed (client half): the `applyDeepLink 'file'` modal-bootstrap block is deleted with an updated D-13 comment; the copied pathname serves raw bytes server-side, in-app previews go through `A.previewFile`'s modal
- Proof layers updated: `test/upload.test.mjs` proves Accept:text/html and Sec-Fetch-Dest:document receive inline bytes with no X-Frame-Options (attachment types still serve attachment/octet-stream); `e2e/flows.spec.mjs` proves a real top-level paste renders the image document, a two-page PDF iframe loads `application/pdf` with no framing-denial headers, and both copy-link entry points produce byte-identical clipboard URLs — in both locales

## Task Commits

Each task was committed atomically:

1. **Task 1: Byte-only file route — delete the Accept:text/html SPA branch** - `2147c91` (feat)
2. **Task 2: One copied URL — context-menu copyLink, SPA delegation, e2e proofs** - `de467cb` (feat)

## Files Created/Modified

- `server.js` — the `/w/:slug/file/:id` dispatch branch is byte-only; branch comment documents D-13 revised, D-06 header authority, D-05 no-oracle for document navigations
- `src/actions/actions.js` — `A.copyLink` file branch keyed on the context menu's `data-id`
- `src/main.js` — `applyDeepLink 'file'` block removed, D-13 comment rewritten, now-unused `openModal` import dropped
- `e2e/flows.spec.mjs` — phase-12 file test re-pinned to the byte-only behavior; adds context-menu copyLink clipboard equality and the two-page PDF (`PDF_2PAGES` fixture) iframe response assertions
- `test/upload.test.mjs` — SPA-negotiation test replaced by the byte-only negotiation suite; `fileFetch` accepts extra headers

## Decisions Made

- **Top-level paste serves bytes directly** (the behavior decision G-12-2 was missing): inline types render in the tab, attachment types download. The UAT truth is the second clause of D-13 read literally; the SPA-side destination remains the preview modal.
- **Delete, don't gate**: no code path claims `/file/:id` for the SPA anymore — the deleted `applyDeepLink 'file'` branch mirrors the deleted server Accept branch.
- **Fix site choice**: the context-menu copyLink is fixed in `A.copyLink` (one site), not by stamping `data-fid` in `context-menu.js`; branch order is safe because task/pid/fid id-spaces are disjoint from file ids.
- **404 no-oracle extended to document navigations** for unauthenticated pastes (T-12-13, severity low, disposition accept) — strictly narrower disclosure than the SPA-shell alternative.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed the now-unused `openModal` import in src/main.js**
- **Found during:** Task 2 (deleting the `applyDeepLink 'file'` block)
- **Issue:** The block was the only `openModal` caller in `src/main.js`; the orphaned import would break `npm run lint` (`no-unused-vars`)
- **Fix:** Dropped the named import (the side-effect import of `modals.js` remains)
- **Files modified:** src/main.js
- **Verification:** eslint clean on the changed file set (pre-existing repo-wide lint failures see deferred-items.md)
- **Committed in:** de467cb (Task 2 commit)

**2. [Rule 1 - Bug] e2e clipboard-toast strict-mode violation**
- **Found during:** Task 2 (first e2e run)
- **Issue:** Two « Lien copié » toasts are stacked when the context-menu copy follows the modal copy, so `getByText(d.linkCopied)` resolved to 2 elements (strict-mode failure)
- **Fix:** Assert `.first()` on the toast locator
- **Files modified:** e2e/flows.spec.mjs
- **Verification:** full e2e suite green (43/43)
- **Committed in:** de467cb (Task 2 commit)

**3. [Rule 3 - Blocking] prettier format on src/main.js**
- **Found during:** Task 2 (format check after edits)
- **Issue:** The replacement comment block deviated from prettier's continuation indentation (the file was prettier-clean pre-plan)
- **Fix:** `prettier --write src/main.js`
- **Files modified:** src/main.js
- **Verification:** `npx prettier --check src/main.js` clean
- **Committed in:** de467cb (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug — none expanded plan scope)
**Impact on plan:** All fixes were consequences of the planned deletions; no behavioral scope change.

## Issues Encountered

- `npm run lint` and `npm run format:check` fail repo-wide with **pre-existing** errors (8 lint / 19 format files), all present at the pre-plan commit `8b93d88` and confined to files outside this plan's declared set — except `server.js:1924 no-control-regex`, which is 12-02's intentional T-12-08 strip regex. Logged with a recommended cleanup to [deferred-items.md](./deferred-items.md); plan files are individually eslint-clean.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both UAT gaps G-12-1 and G-12-2 are closed at code level and pinned by integration + e2e proofs; `12-UAT.md` tests 1 and 2 should re-run clean in real Chrome/Firefox
- Coverage D4 (multi-engine manual rendering feel) remains a human UAT item by design
- Pre-existing repo-wide lint/format drift (deferred-items.md) will trip the phase verification line unless cleaned up first

---
*Phase: 12-real-file-uploads-and-previews*
*Completed: 2026-10-25*
