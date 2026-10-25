---
phase: 12-real-file-uploads-and-previews
verified: 2026-10-25T20:40:00Z
status: passed
score: 22/22 must-haves verified
covered_files: [".planning/phases/12-real-file-uploads-and-previews/12-01-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-01-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-02-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-02-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-03-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-03-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-04-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-04-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-05-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-05-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-06-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-06-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-07-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-07-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-08-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-08-SUMMARY.md", "server.js", "src/actions/actions.js", "src/main.js", "src/overlays/modals.js", "src/overlays/context-menu.js", "src/views/files.js", "src/core/api.js", "src/core/i18n.js", "src/core/utils.js", "src/styles/overlays.css", "src/locales/en.json", "src/locales/fr.json", "test/upload.test.mjs", "test/i18n-core-features.test.mjs", "test/fixtures/icons-baseline.json", "e2e/flows.spec.mjs", "e2e/server.mjs", "e2e/demo-locale.spec.mjs", "e2e/locale.spec.mjs", ".env.example", "DEPLOY.md", "README.md"]
covered_digest: "v2:sha256:8f67bfa87c34290719d27831a15a695ec17749807aec912e03fce15ddc8fae93"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 22/22
  gaps_closed:
    - "CR-01 advisory (carried from rounds 3-5, critical): zero-byte suffix range produced a malformed 206 (`Content-Range: bytes 0--1/0`) + synchronous ERR_OUT_OF_RANGE after headersSent — FIXED by commit 54cead4: serveFileBinary now ignores the Range header on zero-byte files (`rawRange` computed only when `stat.size > 0`, RFC 9110 §14.2 allows ignoring), and a new integration test ('zero-byte file: any Range header is ignored, clean 200 with empty body (CR-01)') exercises bytes=-5/0-/0-9 against a zero-byte file. Guard read this round (server.js:1979-1986); named test run in this verifier's process — PASS; full suite now 446/446. 12-REVIEW-DISPOSITION.md row updated to `fixed` with the commit pointer (1692ab8)."
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "IN-02 (info, disposition open): the e2e width assertion (toBeGreaterThan(800)) is looser than the documented ≥866px invariant"
    category: other
    reason: "Unchanged this round; 800 > 750 keeps it regression-safe against the pdf.js breakpoint. Cosmetic — pin the documented value or record an accept. The only remaining open item in 12-REVIEW-DISPOSITION.md (open: 1)."
    evidence_status: "grep of 12-REVIEW-DISPOSITION.md this round (IN-02 disposition: open; CR-01 now fixed)"
coincidental_reliance_items: []
---

# Phase 12: Real file uploads and previews — Verification Report (re-verification, round 6 — CR-01 closure)

**Phase Goal:** Replace metadata-only file behaviour with real uploads: server endpoint storing dropped files under `DATA_DIR`, real XHR progress in `handleFiles`, real previews for PDFs and images, and a working destination for « Copier le lien ». Closes the known limitation "File contents are metadata only; no binary upload backend".
**Verified:** 2026-10-25T20:40:00Z
**Status:** passed (22/22 truths verified with behavioral evidence; 0 behavior-unverified; CR-01 fixed — one cosmetic advisory remains: IN-02)

## Goal Achievement

### What this round verified

The trigger was commit **54cead4** landing inside the covered set: the CR-01 fix (zero-byte Range guard in `serveFileBinary`) plus its new test, with the disposition row flipped to `fixed`. This round verified the CR-01 change itself and re-ran the full gate battery at current HEAD (a2c79c4); commits after 54cead4 (1692ab8, 4d28537, 4d7f412, a2c79c4) are planning-docs only — `git log` audit confirmed no impl file touched.

**CR-01 verification (the trigger for this round):**
- **Guard** (server.js:1979-1986, read this round): `const rawRange = typeof req.headers.range === 'string' && stat.size > 0 ? req.headers.range.trim() : ''` — on a zero-byte file any Range header is dropped, `range` stays `null`, and the response is a clean 200 with `Content-Length: 0`. The preceding comment documents the RFC 9110 §14.2 rationale. Downstream branches (206/Content-Range, createReadStream offsets) are unreachable for size 0.
- **Test** (test/upload.test.mjs:286-309): plants a zero-byte file, sends `bytes=-5`, `bytes=0-`, `bytes=0-9`, and asserts 200, no `Content-Range`, `Content-Length: 0`, empty body — exactly the invariant the fix guarantees.
- **Named test run in this verifier's own process:** `node --test --test-name-pattern="zero-byte file: any Range header is ignored" test/upload.test.mjs` → **1 pass / 0 fail** (350ms).
- **Disposition** (12-REVIEW-DISPOSITION.md): CR-01 row now `fixed` — "Zero-byte suffix range now ignores the Range header (RFC 9110 allows it) → clean 200 with empty body; guard + test in commit 54cead4, suite 446/446" — with frontmatter `disposition: fixed` and the commit pointer recorded (1692ab8).

**No regression on the 22 must-haves:** every code path spot re-grepped this round (✱ markers below); the full gate battery re-run green.

**Gate evidence, all in this verifier's own process, at current HEAD, working tree clean of probe debris (`git status`: only planning docs modified/untracked; `src/views/table.js` clean):**
- lint (`npm run lint`): exit 0
- format (`npm run format:check`): "All matched files use Prettier code style!", exit 0
- unit+integration (`npm test`): **446/446** (was 445 — grew by exactly the CR-01 test), 19.0s
- production build (`npm run build`): exit 0, 1.22s, includes the i18n-scan prebuild gate
- full e2e (`npm run e2e` → playwright --config e2e/playwright.config.mjs, Chromium, both locales): **45 passed** (57.0s) — all Phase 12 blocks green (PNG/PDF preview + copy-link both locales, oversize 413 both locales, logged-out-paste round trip both locales)

(Note: a bare `npx playwright test` without `--config e2e/playwright.config.mjs` discovers the specs without the webServer and fails with ECONNREFUSED — invocation error, not a regression; the wired `npm run e2e` is the correct command.)

### Observable Truths

Truths 1-14 (round-1 set), 15-19 (12-07 set) and 20-22 (12-08 set) keep their rounds-1-5 evidence, spot re-grepped this round (✱ = re-grepped this round; the CR-01 guard shifted server.js line numbers by +6 after :1976):

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | POST /w/:slug/files stores real bytes at DATA_DIR/files/<id>, returns 200 {id} | ✓ VERIFIED | integration test PASS (446/446, this process) |
| 2 | Oversize upload rejected mid-stream with 413 + `uploadTooLarge`, server alive | ✓ VERIFIED | integration test PASS (446/446); e2e oversize block green (45/45) |
| 3 | Viewer/unauthenticated caller cannot upload (minRole 'member') | ✓ VERIFIED | "uploads are gated" test PASS (446/446, this process) |
| 4 | /w/:slug/file/:id is byte-only (Sec-Fetch-Dest discrimination; G-12-1) | ✓ VERIFIED | "byte-only file route" test PASS; route interception + discrimination re-grepped ✱ (server.js:2097-2115) |
| 5 | Safe inline/attachment header policy, fixed Content-Type map | ✓ VERIFIED | D-06 test PASS (446/446); fileDisposition + FILE_INLINE_MIME map re-grepped ✱ (server.js:1999-2002) |
| 6 | Doc-PUT file deletion unlinks the binary idempotently | ✓ VERIFIED | UPLOAD-05 test PASS (446/446, this process) |
| 7 | handleFiles uses real XHR upload progress; simulated timer gone | ✓ VERIFIED | PREVIEW-01 test PASS (446/446, this process) |
| 8 | Failed upload toasts a stable code, removes the progress row, adds no record | ✓ VERIFIED | e2e oversize block green both locales (45/45, this run) |
| 9 | Preview modal renders real bytes: img / pdf iframe / download tile | ✓ VERIFIED | modals.js re-grepped ✱ (:58 pdf→'xl' ternary intact); e2e PDF/img blocks green (45/45, this run) |
| 10 | Both « Copier le lien » entry points copy the identical file URL (G-12-2) | ✓ VERIFIED | e2e clipboard-equality green (45/45, this run); context-menu.js unchanged |
| 11 | The SPA no longer claims /file/:id — pastes get bytes (G-12-2) | ✓ VERIFIED | main.js D-13 comment + routing re-grepped ✱ (:115-119) |
| 12 | Dropzone cap hint interpolates live MAX_UPLOAD_MB (G-12-3) | ✓ VERIFIED | five-hop chain re-grepped ✱ (server MAX_UPLOAD_MB → api.js:21,95-96,132 → files.js:43 `t('page.files.dropLimit', { n: api.maxUploadMb })` → en/fr.json:1419); knob tests PASS |
| 13 | Demo mode stays metadata-only | ✓ VERIFIED | handleFiles offline branch untouched (diff audit, rounds 1-5) |
| 14 | i18n: both catalogues carry phase keys; parity gates green | ✓ VERIFIED | act.download (en:535/fr:536) ✱, err.uploadTooLarge (both :1493) ✱, dropLimit (both :1419) ✱; catalogue guard 1538 keys PASS (this run) |
| 15 | **[G-12-4/6]** Firefox's built-in pdf.js viewer renders its full toolbar — direct download/print un-collapsed — at the xl width, and the footer Download saves in Firefox and Chrome | ✓ VERIFIED (human-verified, UAT round 3 test 4: pass in real Firefox AND Chrome) | 12-UAT.md test 4 result: pass (commits 906f376, 3da5d5b) |
| 16 | **[G-12-4b]** Byte-range: 206 + Content-Range, 416 `bytes */size`, multi/malformed/absent → 200 full, Accept-Ranges on every answer, ranged HEAD | ✓ VERIFIED | range code re-read this round ✱ (server.js:1970-2041); **CR-01 zero-byte edge now guarded + tested** (54cead4, named test PASS this process); integration tests PASS (446/446) |
| 17 | **[G-12-5a]** Anonymous top-level navigation (Sec-Fetch-Dest document/absent) 302s to /login?next=<path> before any lookup — byte-identical for unknown slugs | ✓ VERIFIED | re-grepped ✱ (server.js:2105-2114); G-12-5 integration test PASS (446/446) |
| 18 | **[G-12-5b]** After sign-in from the redirect, the browser returns to the same file URL and gets the bytes | ✓ VERIFIED | actions.js ?next= validation unchanged; e2e round trip green both locales (45/45, this run) |
| 19 | Other consumers keep contracts: iframe/frame/fetch keep JSON 401; unauthorized keeps the D-05 404 | ✓ VERIFIED | discrimination-matrix test PASS (446/446, this process) |
| 20 | **[G-12-6, width]** PDF previews render in `.modal.xl` (900px → ≈866px iframe ≥ 751px, crossing pdf.js's 750px toolbar breakpoint) | ✓ VERIFIED | overlays.css:43-46 + modals.js:58 re-grepped ✱; e2e `.modal.xl` + width >800 assertions green (45/45, this run) |
| 21 | **[G-12-6, hardening]** PDF-only footer Download anchor — same-origin `<a href download=<esc(f.name)>>`, no data-a; non-PDF footers unchanged; act.download in both locales | ✓ VERIFIED | modals.js:325 re-grepped ✱; e2e asserts anchor, label, exact href, real download event — green both locales (45/45, this run) |
| 22 | **[G-12-6]** Non-PDF previews unchanged: images keep 'lg' + 16/9; other types keep the tile | ✓ VERIFIED | modals.js ternary + img/tile branches unchanged; e2e img assertions green (45/45, this run) |

**Score:** 22/22 truths verified (0 present-but-behavior-unverified — truth 15 human-verified in UAT round 3)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| src/styles/overlays.css `.modal.xl` | max-width:900px + width-math comment | ✓ VERIFIED | lines 43-46, unchanged |
| src/overlays/modals.js xl-class + tall iframe + footer anchor | pdf→'xl', height:min(75vh,640px), esc()-escaped download anchor | ✓ VERIFIED | :58, :313, :325 — re-grepped this round |
| src/locales/en.json + fr.json | act.download beside act.copyLink; dropLimit {n} form; D-16 additions | ✓ VERIFIED | act.download en:535/fr:536; dropLimit both :1419; uploadTooLarge both :1493; parity 1538/1538 (guard green this run) |
| e2e/flows.spec.mjs | xl-class + width/height polls + download event + oversize flow | ✓ VERIFIED | all phase-12 assertions intact; 45/45 this run |
| test/i18n-core-features.test.mjs | frozen catalogue guard at the documented size | ✓ VERIFIED | 1538 keys with the D-16 delta named in the test title (:216-218); PASS |
| server.js upload/range/redirect/disposition code | unchanged semantics + CR-01 zero-byte guard | ✓ VERIFIED | CR-01 guard read this round (54cead4); everything else unchanged since round 5's line-by-line diff audit |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| filePreview case | .modal.xl | `m.file?.type === 'pdf' ? 'xl' : 'lg'` | ✓ WIRED | modals.js:58 → overlays.css:44-46; e2e green this run |
| Dropzone label | api.maxUploadMb | t('page.files.dropLimit', { n }) | ✓ WIRED | files.js:43; chain re-grepped ✱; knob chain tested (unit) |
| Footer anchor | serveFileBinary bytes | same-origin href + download attr | ✓ WIRED | e2e exact-href + real download event (45/45, this run) |
| act.download key | footer label | t('act.download') | ✓ WIRED | both catalogues (en:535/fr:536); catalogue guard green |
| Anonymous document nav | 302 /login?next=path | Sec-Fetch-Dest discrimination | ✓ WIRED | server.js:2105-2114; e2e logged-out-paste round trip green (45/45, this run) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| Download attribute / anchor href | f.name / ws url + f.id | server-side file record | Yes — e2e download event carried the uploaded name this run | ✓ FLOWING |
| Dropzone cap | api.maxUploadMb | /api/config from MAX_UPLOAD_MB | Yes — knob test green | ✓ FLOWING |
| Range slices / redirect next / clipboard URL | (rounds 1-5 traces) | unchanged | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| CR-01 zero-byte range invariant (named test) | `node --test --test-name-pattern="zero-byte file: any Range header is ignored" test/upload.test.mjs` | 1 pass / 0 fail (350ms) | ✓ PASS |
| Full unit+integration suite (current HEAD) | `npm test` | **446 pass / 0 fail** (19.0s) | ✓ PASS |
| Production build incl. i18n prebuild gate | `npm run build` | exit 0, 1.22s | ✓ PASS |
| Full e2e (Chromium, both locales) | `npm run e2e` (port 4317) | **45 passed** (57.0s) | ✓ PASS |
| Lint gate | `npm run lint` | exit 0 | ✓ PASS |
| Format gate | `npm run format:check` | "All matched files use Prettier code style!", exit 0 | ✓ PASS |
| CR-01 disposition flipped | grep 12-REVIEW-DISPOSITION.md | `disposition: fixed` + commit pointer 54cead4 (recorded via 1692ab8) | ✓ CONFIRMED |
| Commits after 54cead4 touch no impl file | `git log 54cead4..HEAD --oneline` + paths | 1692ab8, 4d28537, 4d7f412, a2c79c4 — planning docs only | ✓ CONFIRMED |

Probe execution: no probe scripts declared (`scripts/*/tests/probe-*.sh` absent; none in PLANs). The suites above are the phase's runnable probes and were executed in this verifier's own process, solo (no parallel sessions).

**Working-tree note:** round 5's foreign probe hazard (`src/views/table.js:87`) is **resolved** — the line is gone (`git status` shows no table.js modification). All gates this round ran against the raw working tree at HEAD and are green; no scrub needed.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| UPLOAD-01 | 12-01 | Real-bytes upload endpoint | ✓ SATISFIED | tests green this round (446/446) |
| UPLOAD-02 | 12-01 | MAX_UPLOAD_MB cap + stable 413 code | ✓ SATISFIED | tests green this round |
| UPLOAD-03 | 12-02 | Byte serving route, 404 no-oracle | ✓ SATISFIED | no-oracle extended to the 302 (T-12-16); tests green |
| UPLOAD-04 | 12-02 | Inline/attachment header policy | ✓ SATISFIED | D-06 map unchanged; test green |
| UPLOAD-05 | 12-02 | Binary delete with record | ✓ SATISFIED | test green |
| PREVIEW-01 | 12-03 | Real XHR progress | ✓ SATISFIED | test green |
| PREVIEW-02 | 12-03 | Failed upload handling | ✓ SATISFIED | oversize e2e green (this run) |
| PREVIEW-03 | 12-03, 12-05, 12-07, 12-08 | Real-bytes preview modal; PDF iframe fixed, Firefox stall/clip closed, width breakpoint + footer Download | ✓ SATISFIED | all pinned by unit+e2e; Firefox-native toolbar human-verified (UAT round 3 test 4) |
| LINK-01 | 12-03, 12-05, 12-07 | Copied link destination; one URL; login redirect | ✓ SATISFIED | e2e copy-link + logged-out-paste round trip green (this run) |
| I18N-01 | 12-04, 12-06 | Catalogue coverage/parity | ✓ SATISFIED | 1538-key parity guard green; act.download present both locales |

**Orphaned requirements:** none. The REQUIREMENTS.md bookkeeping gap (no table rows for the phase-12 IDs; ROADMAP says "Requirements: TBD") is pre-existing documentation debt, carried unchanged from rounds 1-5 — all 10 plan-declared IDs are accounted for and verified.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| e2e/flows.spec.mjs | G-12-6 width poll | IN-02 (open): assertion >800 vs documented ≥866 | ℹ️ Info | Regression-safe (800 > 750); cosmetic tightening only — the sole remaining open disposition item |

CR-01 is now **fixed** (54cead4) and removed from the anti-pattern list. No debt markers in any phase-12 file (grep count 0 across server.js, files.js, modals.js, upload.test.mjs, flows.spec.mjs). The round-5 working-tree hazard is resolved.

### Review Findings still open

In 12-REVIEW-DISPOSITION.md: only **IN-02** (info, open — advisory above). CR-01 is `fixed` (54cead4). WR-01 and IN-01 are `skipped` with user-recorded rationale from UAT round 3. Standing H-1..L-5 follow-ups remain documented, out of phase scope.

### Human Verification Required

None. Both round-4 human items were resolved in UAT round 3 (test 4 Firefox/Chrome toolbar+Download pass; test 5 WR-01 triage recorded). UAT frontmatter: `status: complete`, 0 pending. The CR-01 fix needed no human check — its invariant is deterministic and integration-tested.

### Gaps Summary

No gaps. The CR-01 closure is verified end-to-end this round: the `stat.size > 0` guard in serveFileBinary is read and correct (zero-byte files ignore any Range header per RFC 9110 §14.2), the named integration test exercises it and passes, the disposition row is `fixed` with the commit pointer, and the suite grew 445→446 with exactly that test. The full gate battery is green at current HEAD in this verifier's own process — lint 0, format 0, 446/446 unit, build exit 0, 45/45 e2e across both locales — with no regression on any of the 22 standing must-haves (all code paths re-grepped). The round-5 working-tree hazard (src/views/table.js probe line) is resolved. Covered digest regenerated via the official CLI verb over the 38 covered files (all paths verified to exist): `v2:sha256:8f67bfa87c34290719d27831a15a695ec17749807aec912e03fce15ddc8fae93`. Sole remnant before milestone ship: the cosmetic IN-02 e2e-assertion tightening (or an explicit accept) — not a phase-goal gap.

---

_Verified: 2026-10-25T20:40:00Z_
_Verifier: the agent (gsd-verifier)_
_covered_digest via `gsd-tools query verification.fingerprint` over 38 phase files (round-6 refresh)_
