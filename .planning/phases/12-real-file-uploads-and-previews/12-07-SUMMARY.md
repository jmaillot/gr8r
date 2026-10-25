---
phase: 12-real-file-uploads-and-previews
plan: 07
subsystem: api, ui
tags: [http-range, 206-partial-content, pdf-preview, iframe, sec-fetch-dest, login-redirect, open-redirect, firefox]

# Dependency graph
requires:
  - phase: 12-05
    provides: the byte-only /w/:slug/file/:id route with the D-06 header map, serveFileBinary, and the D-05 404 no-oracle gate
  - phase: 12-06
    provides: sequential access to the shared files (server.js, test/upload.test.mjs, e2e/flows.spec.mjs) and the full-build-before-e2e run-order rule
provides:
  - Single-range HTTP serving in serveFileBinary: Accept-Ranges: bytes advertised on every answer, 206 + exact Content-Range + Content-Length slice streamed via fs.createReadStream({start,end}), 416 with bytes */size on unsatisfiable ranges, multi-range/malformed/wrong-unit headers ignored with the unchanged 200 full body, ranged HEAD, If-Range deliberately not honored
  - A tall scrollable PDF preview iframe (height:min(70vh,560px)) replacing the 16/9 clip, so Firefox's built-in PDF toolbar (with its download button) is fully visible inside the modal
  - An anonymous top-level navigation to a file URL (Sec-Fetch-Dest: document or metadata-absent) 302-redirects to /login?next=<path-only> before any workspace/record lookup — no existence oracle — while iframe/frame/empty destinations keep the JSON 401 signInRequired and authenticated-but-unauthorized callers keep the D-05 404
  - A.doLogin consumes a strictly validated same-origin path-only ?next= (single leading /, no //, no backslash, no ://) and full-navigates to it, returning the browser to the file bytes after sign-in
  - The reopened T-12-13 decision recorded in the route comment (user instruction, UAT test 2)
affects: [verify-work phase 12, file-serving route consumers, pdf viewers, future range-based features]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 5800        # chars/4 over the realized diff (23198 chars across the 5 plan files)
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Range parsing: ignore (never 400) anything that is not a single bytes range — RFC 7233 ignore-permission keeps the parser total and DoS-free (T-12-17)"
    - "Navigation discrimination at the route dispatcher, upstream of requireWorkspace: Sec-Fetch-Dest document/absent + no session = 302, everything else keeps the existing contract; the redirect answers 'no session' only, never 'not a member'"
    - "Return-URL construction from url.pathname only, with a client-side mirror validation — open redirect structurally impossible (T-12-15)"

key-files:
  created: []
  modified:
    - server.js
    - src/overlays/modals.js
    - src/actions/actions.js
    - test/upload.test.mjs
    - e2e/flows.spec.mjs

key-decisions:
  - "T-12-13 reopened on user instruction (UAT test 2, G-12-5): anonymous document navigations to file URLs now 302 to /login?next=<path>; recorded in the route comment; the D-05 404 no-oracle is preserved for every authenticated caller and every non-document destination"
  - "If-Range is deliberately not honored: Cache-Control: private, max-age=3600 bounds a stale 206 to a self-healing hour, and pdf.js does not require the validator"
  - "The .modal width and styles/overlays.css are untouched — the depressed viewport, not the width, was the clipping cause; the image branch keeps aspect-ratio:16/9"
  - "next is built ONLY from url.pathname server-side and re-validated client-side (leading single /, no //, no backslash, no ://) — a hostile value cannot become an open redirect (T-12-15)"
  - "A.doLogin navigates with location.assign(next) BEFORE the queued-invite block: a full navigation is deliberate so the server re-evaluates the now-authenticated document navigation"

patterns-established:
  - "Range contract: 200-full-body fallback for anything unparseable, header-only 416 with no stream, single stream slice only — no multipart/byteranges assembler"
  - "Redirect-no-oracle: the session+dest check runs before requireWorkspace so real, unknown and foreign slugs produce a byte-identical 302"

requirements-completed: [PREVIEW-03, LINK-01]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "serveFileBinary advertises Accept-Ranges: bytes and answers a valid single byte range with 206 + exact Content-Range + Content-Length slice + createReadStream({start,end}); unsatisfiable ranges get 416 with bytes */size and no stream; multi-range/malformed/absent keep the 200 full body; ranged HEAD matches the GET status/headers"
    requirement: PREVIEW-03
    verification:
      - kind: integration
        ref: "test/upload.test.mjs#single-range serving: 206 slices with exact math, 416 unsatisfiable, ignored ranges keep 200 (G-12-4)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The preview modal's PDF iframe is a tall scrollable viewport (height:min(70vh,560px)) instead of the ~287px 16/9 pane, so Firefox's PDF toolbar is fully visible; the image branch and .modal width are unchanged"
    requirement: PREVIEW-03
    verification:
      - kind: e2e
        ref: "e2e/flows.spec.mjs#file uploads and previews (Phase 12) — PDF iframe rendered box height > 400px assertion (both languages)"
        status: pass
    human_judgment: true
    rationale: "The e2e pins the iframe geometry in Chromium only; whether Firefox's built-in viewer shows its whole toolbar inside the taller viewport is browser-specific and needs the manual Firefox re-run of 12-UAT.md test 1"
  - id: D3
    description: "An anonymous document navigation (or metadata-absent navigation) to /w/:slug/file/:id 302-redirects to /login?next=<path> before any lookup — byte-identical for unknown slugs; iframe/empty destinations keep the JSON 401 signInRequired; the outsider keeps the D-05 404; an authenticated member keeps receiving bytes"
    requirement: LINK-01
    verification:
      - kind: integration
        ref: "test/upload.test.mjs#anonymous document navigation to a file URL redirects to login with the path preserved; iframe/empty keep 401 (G-12-5)"
        status: pass
    human_judgment: false
  - id: D4
    description: "After signing in from the redirect, the browser returns to the same file URL and the bytes render — the A→Z round trip through A.doLogin's validated ?next= consumption"
    requirement: LINK-01
    verification:
      - kind: e2e
        ref: "e2e/flows.spec.mjs#a logged-out paste of a file URL shows the login page and returns to the bytes after sign-in (G-12-5) (en + fr)"
        status: pass
    human_judgment: true
    rationale: "Proven in Chromium (the e2e browser); the genuine UAT scenario is a real Firefox profile paste → login → bytes, which the plan's verification section assigns to the manual UAT re-run"

# Metrics
duration: 20 min
completed: 2026-10-25
status: complete
---

# Phase 12 Plan 07: Gap closure G-12-4/G-12-5 Summary

**Byte-range serving (206/416) in serveFileBinary plus a ~70vh PDF preview iframe close the Firefox stall/clip, and anonymous file-URL navigations now land on the login page with a path-preserving return trip — with the D-05 no-oracle, the D-06 header map and the iframe/fetch 401 contract intact.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-10-25T09:12:34Z
- **Completed:** 2026-10-25T09:33:32Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- G-12-4 (stall half): `serveFileBinary` advertises `Accept-Ranges: bytes` on every answer and answers a valid single range with 206 + exact `Content-Range`/`Content-Length` + a sliced `fs.createReadStream({start,end})`, so Firefox pdf.js lays out incrementally instead of buffering the whole file; unsatisfiable ranges get a header-only 416 (`bytes */size`, no stream), and multi-range/malformed/wrong-unit headers are ignored with the unchanged 200 full body (RFC 7233 ignore-permission).
- G-12-4 (clip half): the preview modal's PDF iframe swaps `aspect-ratio:16/9` (~296px) for `height:min(70vh,560px)`, giving Firefox's in-iframe PDF viewer room for its whole toolbar and a scrollable page area; the image branch keeps 16/9 and `.modal` is untouched.
- G-12-5: an anonymous `Sec-Fetch-Dest: document` (or metadata-absent) navigation to `/w/:slug/file/:id` is 302-redirected to `/login?next=<url.pathname>` BEFORE any workspace/record lookup — byte-identical for real, unknown and foreign slugs (T-12-16 no-oracle holds; `next` is server-built from the pathname only, T-12-15 mitigated). `A.doLogin` consumes the validated `?next=` and full-navigates to it; iframe/frame/empty destinations keep the JSON 401 `signInRequired` and the outsider keeps the D-05 404.
- The reopened T-12-13 decision is recorded in the route comment; the locked contracts (D-05 no-oracle, D-06 header map, frame-ancestors policy, 12-05 byte-only behavior for every other consumer) are preserved and pinned by the extended suites.

## Task Commits

Each task was committed atomically:

1. **Task 1: Single-range support in serveFileBinary — Accept-Ranges, 206 + Content-Range with stream slicing, 416 on unsatisfiable** - `49e28bb` (feat)
2. **Task 2: Tall scrollable PDF iframe — swap the 16/9 clip for a ~70vh viewport, proven by e2e** - `d311687` (feat)
3. **Task 3: Anonymous document navigations to /w/:slug/file/:id redirect to login — T-12-13 reopened (G-12-5)** - `6c99fcf` (feat)

## Files Created/Modified

- `server.js` — range parsing + 206/416 paths in serveFileBinary; the file-route dispatcher's anonymous-document 302 with the reopened T-12-13 comment
- `src/overlays/modals.js` — the PDF iframe's tall viewport (`height:min(70vh,560px)`); image branch and download tile untouched
- `src/actions/actions.js` — `A.doLogin` consumes the validated same-origin path-only `?next=` before the queued-invite block
- `test/upload.test.mjs` — the single-range suite (200/206/416/HEAD with exact math and slice bytes) and the redirect suite (302 + Location shape, 401 iframe/empty, 404 outsider, 302-no-oracle, 200 member bytes); `fileFetch` gained a `redirect` pass-through
- `e2e/flows.spec.mjs` — the PDF-iframe rendered-height assertion (>400px) in the phase-12 PDF block, and the logged-out paste → login → return-to-bytes round-trip test (both languages)

## Decisions Made

- T-12-13 reopened deliberately, on user instruction from UAT test 2 — the redirect is the product answer to a pasted file URL; recorded in the route comment and scoped to anonymous document navigations only.
- `If-Range` not honored: `Cache-Control: private, max-age=3600` bounds a stale 206 to one self-healing hour; pdf.js does not require the validator (comment in code).
- No modal widening: the diagnosis identifies the depressed viewport as the clipping cause; overlays.css untouched.
- `next` is built only from `url.pathname` (never the query string, never a client parameter), and the client re-validates before `location.assign` — open redirect structurally impossible.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `redirect: 'manual'` needed on the 302 assertions**
- **Found during:** Task 3
- **Issue:** `fetch` follows redirects by default, so the node 302 assertions observed the post-redirect 200 (the SPA at /login), not the redirect itself.
- **Fix:** Added a `redirect` pass-through to the `fileFetch` helper and `redirect: 'manual'` on the three 302 assertions (document, metadata-absent, unknown-slug) plus the ranged-HEAD 302.
- **Files modified:** test/upload.test.mjs
- **Verification:** the redirect suite passes; Location shape asserted exactly
- **Committed in:** 6c99fcf (part of Task 3 commit)

**2. [Rule 1 - Bug] Unique upload name in the e2e round-trip test**
- **Found during:** Task 3
- **Issue:** the shared upload project already holds `pixel.png` from the PREVIEW-03 test in the same worker, so the `.fcard hasText: 'pixel.png'` locator resolved to 2 elements (strict-mode violation).
- **Fix:** the round-trip test uploads a run/language-unique name (`paste-${lang}.png`).
- **Files modified:** e2e/flows.spec.mjs
- **Verification:** 45/45 e2e tests pass in both languages
- **Committed in:** 6c99fcf (part of Task 3 commit)

**3. [Rule 1 - Bug] Anon e2e context must carry the run language**
- **Found during:** Task 3
- **Issue:** the fresh logged-out context defaulted to `en-US`, so in the French test the login form rendered English and the fr-labelled field lookup failed.
- **Fix:** pass `lang: lang === 'fr' ? 'fr-FR' : 'en-US'` when creating the anon context (the /join test's convention).
- **Files modified:** e2e/flows.spec.mjs
- **Verification:** the round-trip test passes in en and fr
- **Committed in:** 6c99fcf (part of Task 3 commit)

---

**Total deviations:** 3 auto-fixed (3 × Rule 1 bugs in test code)
**Impact on plan:** All three were test-harness corrections required to observe/assert the planned behavior; no production code changed beyond the plan.

## Issues Encountered

- JS block comments cannot contain the literal `bytes */size` (the `*/` terminates the comment) — two comments reworded; caught by the first test run.
- `npm run lint` (8 errors) and `npm run format:check` (18 files) are dirty, but verified identical at the plan base commit (2804166) — the pre-existing drift logged in deferred-items.md at 12-05; this plan introduces zero new violations (same file list, same server.js:1925 no-control-regex). Out of scope per the deviation scope boundary.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 12 is fully executed (7/7 plans): all verification gaps from the UAT run are closed. Ready for `/gsd-verify-work` and the manual Firefox re-run of 12-UAT.md tests 1 and 2 (the Chromium e2e cannot exercise Firefox's built-in PDF viewer; the geometry and the redirect round trip are pinned in Chromium, the Firefox rendering is the human step).
- No blockers; no stubs; all three threat mitigations (T-12-15 open redirect, T-12-16 oracle, T-12-17 range DoS) are implemented and tested.

---
*Phase: 12-real-file-uploads-and-previews*
*Completed: 2026-10-25*

## Self-Check: PASSED

- All 5 files modified by the plan exist on disk; SUMMARY.md exists in the phase directory.
- All 4 commits verified in history: `49e28bb` (Task 1), `d311687` (Task 2), `6c99fcf` (Task 3), `1942bd3` (docs/metadata).
- Commits measured from the plan base (2804166): 4 total — 3 task commits + 1 docs commit.
- `npm test` 445/445 pass; `npm run build && npm run e2e` 45/45 pass (full build first per the 12-06 run-order rule).
- REQUIREMENTS.md untouched by `mark-complete`: PREVIEW-03/LINK-01 are phase-12 gap IDs with no rows in the v1.2 requirements table (ROADMAP records them as the phase's TBD requirement set) — they are recorded in this SUMMARY's `requirements-completed`.
