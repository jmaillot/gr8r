---
phase: 12-real-file-uploads-and-previews
verified: 2026-10-25T18:53:59Z
status: passed
score: 22/22 must-haves verified
covered_files: [".planning/phases/12-real-file-uploads-and-previews/12-01-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-01-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-02-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-02-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-03-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-03-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-04-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-04-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-05-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-05-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-06-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-06-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-07-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-07-SUMMARY.md", ".planning/phases/12-real-file-uploads-and-previews/12-08-PLAN.md", ".planning/phases/12-real-file-uploads-and-previews/12-08-SUMMARY.md", "server.js", "src/actions/actions.js", "src/main.js", "src/overlays/modals.js", "src/overlays/context-menu.js", "src/views/files.js", "src/core/api.js", "src/core/i18n.js", "src/core/utils.js", "src/styles/overlays.css", "src/locales/en.json", "src/locales/fr.json", "test/upload.test.mjs", "test/i18n-core-features.test.mjs", "test/fixtures/icons-baseline.json", "e2e/flows.spec.mjs", "e2e/server.mjs", "e2e/demo-locale.spec.mjs", "e2e/locale.spec.mjs", ".env.example", "DEPLOY.md", "README.md"]
covered_digest: "v2:sha256:17652ecc278fd52fc66552c0f5720b5028c0b320bda7bff3ec4eba319fe6c583"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed # as canonicalized by 0c09e70 after UAT round 3 (round-4 verifier output: human_needed 21/22)
  previous_score: 21/22
  gaps_closed:
    - "Truth 15 (Firefox-native pdf.js toolbar at the xl width): human-verified in UAT round 3 test 4 — pass in real Firefox AND Chrome, toolbar un-collapsed, footer Download saves under the original name in both browsers (commits 906f376, 3da5d5b; 12-UAT.md test 4 result: pass)"
    - "Round-4 human item 2 (WR-01 triage at ~700-800px): resolved — user accepted the narrow-viewport fallback (toolbar collapses, footer Download still saves); decision recorded in 12-REVIEW-DISPOSITION.md (disposition: skipped)"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "CR-01 (critical, disposition open, carried from rounds 3-4): suffix Range on a zero-byte stored file produces a malformed 206 (`Content-Range: bytes 0--1/0`) and a synchronous ERR_OUT_OF_RANGE throw after headers are sent (server.js zero-byte suffix branch has no stat.size === 0 guard)"
    category: other
    reason: "Re-confirmed present this round: the close-out server.js diff (be0fdf6/21725f1 range) is eslint-disable comment + prettier reflows only — the zero-byte suffix branch is untouched. One-line guard + one zero-byte range test should land before ship or the disposition must record an explicit accept; 12-REVIEW-DISPOSITION.md still lists it open."
    evidence_status: "round-3 deterministic branch trace + ERR_OUT_OF_RANGE reproduction; code byte-verified unchanged this round (git diff 509b105..HEAD -- server.js)"
  - finding: "IN-02 (info, disposition open): the e2e width assertion (toBeGreaterThan(800)) is looser than the documented ≥866px invariant"
    category: other
    reason: "Prettier re-wrapped the assertion this round but tightened nothing; 800 > 750 keeps it regression-safe against the pdf.js breakpoint. Cosmetic — pin the documented value or accept."
    evidence_status: "git diff 509b105..HEAD -- e2e/flows.spec.mjs re-read this round"
  - finding: "WORKING-TREE HAZARD (foreign, uncommitted): src/views/table.js carries an uncommitted line `export const probe = 'A literal that was never extracted'` — the i18n negative-control example. With it present, `npm run i18n:scan` exits 1 and 5 unit tests fail (i18n-scan D-07 live-tree test + i18n-vocab module). NOT a phase-12 file (untouched by every phase-12 commit; verified git log 509b105..HEAD -- src/views/table.js is empty)"
    category: other
    reason: "Injected by an in-flight experiment (concurrent session) and left dirty. All gates in this verification were run against the committed HEAD state (scrubbed copy) and are green. The line must be reverted before any full-tree gate run — recommend `git checkout -- src/views/table.js` and a scrub of whatever probe harness left it."
    evidence_status: "git diff src/views/table.js re-read this round; 445/445 restored in the scrubbed copy (node --test test/); scan failure reproduced and root-caused to table.js:87"
coincidental_reliance_items: []
---

# Phase 12: Real file uploads and previews — Verification Report (re-verification, round 5 — close-out digest refresh)

**Phase Goal:** Replace metadata-only file behaviour with real uploads: server endpoint storing dropped files under `DATA_DIR`, real XHR progress in `handleFiles`, real previews for PDFs and images, and a working destination for « Copier le lien ». Closes the known limitation "File contents are metadata only; no binary upload backend".
**Verified:** 2026-10-25T18:53:59Z
**Status:** passed (22/22 truths verified with behavioral evidence; 0 behavior-unverified — the last one was human-verified in UAT round 3; open advisories: CR-01, IN-02, one foreign working-tree hazard)
**Re-verification:** Yes — #4682: stale covered digest after v1.2 close-out commits; regenerated against the current codebase

## Goal Achievement

### What this round verified

The triggers were: (1) close-out commits after round 4 touched phase-covered files (server.js eslint-disable + prettier, D-16 locale/actions changes, prettier over tests/e2e, catalogue guard 1532→1538, debug-session close-outs, deferred-items resolutions); (2) the covered digest had to be recomputed. Round-4's truth table is the standing must-haves set (plan-merged with the roadmap contract from rounds 1-4, unchanged — no plan frontmatter changed this round).

**Commit-range audit (git diff 509b105..HEAD, 41 files):**
- `server.js` — eslint-disable comment for the intentional T-12-08 control-regex + prettier reflows (ternary joining, string wrapping, ext-chain reformat). **No logic change** — diff re-read line by line this round.
- `src/overlays/modals.js`, `src/styles/overlays.css`, `src/overlays/context-menu.js`, `src/main.js` — **untouched** since round 4's baseline.
- `src/actions/actions.js`, `src/views/files.js`, `src/locales/*.json` — D-16 (deferred phase-07 i18n literals): additive keys (`toast.dirUp/dirDown`, `act.deleteProjectTaskCount`, `act.removeAccess.losesAccess/unassigns`, `page.files.browse`) replacing raw-English splices. **All phase-12 keys and wiring intact**: `act.download` (en:535/fr:536), `err.uploadTooLarge` (both :1493), `page.files.dropLimit` interpolation `{ n: api.maxUploadMb }` (:1419) preserved; the dropzone still renders `t('page.files.dropLimit', { n: api.maxUploadMb })` (files.js:43).
- `e2e/flows.spec.mjs`, test files — prettier reflows only; every phase-12 assertion survives (width >800, height >400, `%PDF-` header sniff, footer-anchor href/label/download-event, oversize 413 flow). Catalogue guard advanced **1532→1538 with the documented D-16 delta** (test/i18n-core-features.test.mjs:216-218).
- Debug close-outs (d1807be) — `.planning/debug/*.md` notes + deferred-items resolutions; docs only.
- `0c09e70` — canonicalized this report's status to `passed` after UAT round 3 clean.

**Gate evidence, all in this verifier's own process (against the committed HEAD, via scrubbed copy):** lint exit 0; format:check exit 0; unit+integration **445/445**; production build exit 0 (2.33s, includes the i18n-scan prebuild gate); full e2e **45/45** (1.4m, Chromium, both locales).

### Observable Truths

Truths 1-14 (round-1 set), 15-19 (12-07 set) and 20-22 (12-08 set) keep their round-4 evidence, spot-re-grepped this round (all code paths re-grepped ✱):

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | POST /w/:slug/files stores real bytes at DATA_DIR/files/&lt;id&gt;, returns 200 {id} | ✓ VERIFIED | upload handler untouched by close-outs (diff audit); integration test PASS (445/445, this process) |
| 2 | Oversize upload rejected mid-stream with 413 + `uploadTooLarge`, server alive | ✓ VERIFIED | integration test PASS (445/445, this process) |
| 3 | Viewer/unauthenticated caller cannot upload (minRole 'member') | ✓ VERIFIED | "uploads are gated" test PASS (445/445, this process) |
| 4 | /w/:slug/file/:id is byte-only (Sec-Fetch-Dest discrimination; G-12-1) | ✓ VERIFIED | "byte-only file route" test PASS; Sec-Fetch-Dest dispatcher re-grepped ✱ (server.js:2078-2080) |
| 5 | Safe inline/attachment header policy, fixed Content-Type map | ✓ VERIFIED | D-06 test PASS; fileDisposition body unchanged — only the eslint-disable comment added ✱ |
| 6 | Doc-PUT file deletion unlinks the binary idempotently | ✓ VERIFIED | UPLOAD-05 test PASS (445/445, this process) |
| 7 | handleFiles uses real XHR upload progress; simulated timer gone | ✓ VERIFIED | PREVIEW-01 test PASS (445/445, this process) |
| 8 | Failed upload toasts a stable code, removes the progress row, adds no record | ✓ VERIFIED | e2e oversize block re-run green this round (45/45) |
| 9 | Preview modal renders real bytes: img / pdf iframe / download tile | ✓ VERIFIED | modals.js untouched since round 4; e2e PDF/img blocks green (45/45, this run) |
| 10 | Both « Copier le lien » entry points copy the identical file URL (G-12-2) | ✓ VERIFIED | e2e clipboard-equality green (45/45, this run); context-menu.js untouched ✱ |
| 11 | The SPA no longer claims /file/:id — pastes get bytes (G-12-2) | ✓ VERIFIED | main.js untouched by close-outs (diff audit) ✱ |
| 12 | Dropzone cap hint interpolates live MAX_UPLOAD_MB (G-12-3) | ✓ VERIFIED | five-hop chain re-grepped ✱ (server → api.js → files.js:43 → en/fr.json:1419); /api/config + knob tests PASS; files.js D-16 edit is adjacent (browse label), interpolation untouched |
| 13 | Demo mode stays metadata-only | ✓ VERIFIED | handleFiles offline branch untouched by every close-out commit |
| 14 | i18n: both catalogues carry phase keys; parity gates green | ✓ VERIFIED | act.download + err.uploadTooLarge present in both catalogues ✱; catalogue guard **1538** keys PASS (this run, with the documented D-16 delta) |
| 15 | **[G-12-4/6]** Firefox's built-in pdf.js viewer renders its full toolbar — direct download/print un-collapsed — at the xl width, and the footer Download saves in Firefox and Chrome | ✓ VERIFIED (human-verified, UAT round 3 test 4: pass in real Firefox AND Chrome) | 12-UAT.md test 4 result: pass (commits 906f376, 3da5d5b); closes the round-4 behavior-unverified item |
| 16 | **[G-12-4b]** Byte-range: 206 + Content-Range, 416 `bytes */size`, multi/malformed/absent → 200 full, Accept-Ranges on every answer, ranged HEAD | ✓ VERIFIED | server.js range code untouched by close-outs (diff audit) ✱ at :1961-2024; integration test PASS (this process) |
| 17 | **[G-12-5a]** Anonymous top-level navigation (Sec-Fetch-Dest document/absent) 302s to /login?next=&lt;path&gt; before any lookup — byte-identical for unknown slugs | ✓ VERIFIED | re-grepped ✱ (server.js:2059-2080); G-12-5 integration test PASS (this process) |
| 18 | **[G-12-5b]** After sign-in from the redirect, the browser returns to the same file URL and gets the bytes | ✓ VERIFIED | actions.js ?next= validation untouched (D-16 edits are in other handlers); e2e round trip green both locales (45/45, this run) |
| 19 | Other consumers keep contracts: iframe/frame/fetch keep JSON 401; unauthorized keeps the D-05 404 | ✓ VERIFIED | discrimination-matrix test PASS (445/445, this process) |
| 20 | **[G-12-6, width]** PDF previews render in `.modal.xl` (900px → ≈866px iframe ≥ 751px, crossing pdf.js's 750px toolbar breakpoint) | ✓ VERIFIED | overlays.css:44-46 + modals.js:58 re-grepped ✱ (both untouched by close-outs); e2e `.modal.xl` + width >800 assertions green (45/45, this run) |
| 21 | **[G-12-6, hardening]** PDF-only footer Download anchor — same-origin `<a href download=<esc(f.name)>>`, no data-a; non-PDF footers unchanged; act.download in both locales | ✓ VERIFIED | modals.js:325 re-grepped ✱; e2e asserts anchor, label, exact href, real download event `paper.pdf` — green both locales (45/45, this run) |
| 22 | **[G-12-6]** Non-PDF previews unchanged: images keep 'lg' + 16/9; other types keep the tile | ✓ VERIFIED | modals.js ternary + img/tile branches untouched (diff audit); e2e img assertions green (45/45, this run) |

**Score:** 22/22 truths verified (0 present-but-behavior-unverified — truth 15 human-verified in UAT round 3)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| src/styles/overlays.css `.modal.xl` | max-width:900px + width-math comment | ✓ VERIFIED | lines 44-46, unchanged since round 4 |
| src/overlays/modals.js xl-class + tall iframe + footer anchor | pdf→'xl', height:min(75vh,640px), esc()-escaped download anchor | ✓ VERIFIED | :58, :313, :325 — untouched by close-outs |
| src/locales/en.json + fr.json | act.download beside act.copyLink; dropLimit {n} form; D-16 additions | ✓ VERIFIED | act.download en:535/fr:536; dropLimit en:1419/fr:1419; page.files.browse added in both; parity 1538/1538 (guard green this run) |
| e2e/flows.spec.mjs | xl-class + width/height polls + download event + oversize flow | ✓ VERIFIED | prettier-reflowed only; all phase-12 assertions intact; 45/45 this run |
| test/i18n-core-features.test.mjs | frozen catalogue guard at the documented size | ✓ VERIFIED | 1532→1538 with the D-16 delta named in the test title; PASS |
| server.js upload/range/redirect/disposition code | unchanged semantics | ✓ VERIFIED | diff audit: comments + prettier only; 31 file tests re-run green |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| filePreview case | .modal.xl | `m.file?.type === 'pdf' ? 'xl' : 'lg'` | ✓ WIRED | modals.js:58 → overlays.css:44-46; e2e green this run |
| Dropzone label | api.maxUploadMb | t('page.files.dropLimit', { n }) | ✓ WIRED | files.js:43; D-16 edit adjacent, interpolation preserved; knob chain tested (unit) |
| Footer anchor | serveFileBinary bytes | same-origin href + download attr | ✓ WIRED | e2e exact-href + real download event (45/45, this run) |
| act.download key | footer label | t('act.download') | ✓ WIRED | both catalogues (en:535/fr:536); catalogue guard green |
| Anonymous document nav | 302 /login?next=path | Sec-Fetch-Dest discrimination | ✓ WIRED | server.js:2078-2080; e2e logged-out-paste round trip green (45/45, this run) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| Download attribute / anchor href | f.name / ws url + f.id | server-side file record | Yes — e2e download event carried the uploaded name this run | ✓ FLOWING |
| Dropzone cap | api.maxUploadMb | /api/config from MAX_UPLOAD_MB | Yes — knob test green | ✓ FLOWING |
| Range slices / redirect next / clipboard URL | (rounds 1-4 traces) | unchanged | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full unit+integration suite (committed HEAD) | `npm test` (scrubbed copy) | 445 pass / 0 fail | ✓ PASS |
| Production build incl. i18n prebuild gate | `npm run build` | exit 0, 2.33s | ✓ PASS |
| Full e2e (Chromium, both locales) | `npx playwright test` (scrubbed copy, port 4400) | 45 passed (1.4m) | ✓ PASS |
| Lint gate | `npm run lint` | exit 0 (close-out be0fdf6 fixed the 8 pre-existing errors) | ✓ PASS |
| Format gate | `npm run format:check` | exit 0 (close-out 21725f1 cleared the drift) | ✓ PASS |
| Close-out no-logic-change claim | `git diff 509b105..HEAD` line-by-line over phase files | server.js: comments+prettier; locales/actions/files: additive D-16 keys; tests/e2e: prettier; modals/css/menu/main untouched | ✓ CONFIRMED |
| Phase keys survived D-16 | grep act.download / err.uploadTooLarge / dropLimit in both catalogues | all present, both locales | ✓ PASS |

Probe execution: no probe scripts declared (`scripts/*/tests/probe-*.sh` absent; none in PLANs). The suites above are the phase's runnable probes and were executed in this verifier's own process.

**Working-tree caveat:** the unit suite run against the RAW working tree fails 5 tests because of the uncommitted foreign probe line in `src/views/table.js:87` (see advisory 3). All gates in this report ran against the committed HEAD (probe scrubbed in a copy) and are green. The dirty line breaks the repo's own i18n gate and must be reverted.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| UPLOAD-01 | 12-01 | Real-bytes upload endpoint | ✓ SATISFIED | tests green this round (445/445) |
| UPLOAD-02 | 12-01 | MAX_UPLOAD_MB cap + stable 413 code | ✓ SATISFIED | tests green this round |
| UPLOAD-03 | 12-02 | Byte serving route, 404 no-oracle | ✓ SATISFIED | no-oracle extended to the 302 (T-12-16); tests green |
| UPLOAD-04 | 12-02 | Inline/attachment header policy | ✓ SATISFIED | D-06 map untouched by close-outs; test green |
| UPLOAD-05 | 12-02 | Binary delete with record | ✓ SATISFIED | test green |
| PREVIEW-01 | 12-03 | Real XHR progress | ✓ SATISFIED | test green |
| PREVIEW-02 | 12-03 | Failed upload handling | ✓ SATISFIED | oversize e2e green (this run) |
| PREVIEW-03 | 12-03, 12-05, 12-07, 12-08 | Real-bytes preview modal; PDF iframe fixed, Firefox stall/clip closed, width breakpoint + footer Download | ✓ SATISFIED | all pinned by unit+e2e; Firefox-native toolbar human-verified (UAT round 3 test 4) |
| LINK-01 | 12-03, 12-05, 12-07 | Copied link destination; one URL; login redirect | ✓ SATISFIED | e2e copy-link + logged-out-paste round trip green (this run) |
| I18N-01 | 12-04, 12-06 | Catalogue coverage/parity | ✓ SATISFIED | 1538-key parity guard green; act.download present both locales |

**Orphaned requirements:** none. The REQUIREMENTS.md bookkeeping gap (no table rows for the phase-12 IDs; ROADMAP says "Requirements: TBD") is pre-existing documentation debt, carried unchanged from rounds 1-4 — all 10 plan-declared IDs are accounted for and verified.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| server.js (zero-byte suffix branch) | ~1982-1996 | CR-01 (open, carried): suffix range on zero-byte file → malformed 206 + ERR_OUT_OF_RANGE after headersSent | ⚠️ Warning (advisory — see frontmatter) | Reproducible by any authenticated member on a zero-byte file; no crash, no data exposure; does not fail any must-have; one-line guard + one test closes it |
| e2e/flows.spec.mjs | G-12-6 width poll | IN-02 (open): assertion >800 vs documented ≥866 | ℹ️ Info | Regression-safe (800 > 750); cosmetic tightening only |
| src/views/table.js (uncommitted) | 87 | Foreign probe literal left dirty by an in-flight experiment; breaks i18n gate + 5 tests in the raw tree | ⚠️ Warning (working-tree hazard, NOT a phase artifact — excluded from covered_files per #4155) | Must be reverted (`git checkout -- src/views/table.js`); zero effect on the committed phase state |

No debt markers in any phase-12 file this round.

### Deferred Follow-Ups

The three UAT deferred follow-ups (sessions-disconnect button, password-change session revocation, real TOTP 2FA) are auth/sessions scope, out of phase 12, and routed to backlog phases 999.1-999.3. The deferred lint/format items were fully resolved by the close-out (be0fdf6 + 21725f1; deferred-items.md both entries `**Status:** resolved`; both gates re-run green this round).

### Review Findings still open

In 12-REVIEW-DISPOSITION.md: CR-01 (critical, open — advisory above), IN-02 (info, open — advisory above). WR-01 and IN-01 are now `skipped` with user-recorded rationale from UAT round 3 (narrow-viewport fallback accepted; Firefox test-4 pass supersedes the Chromium-proxy concern). Standing H-1..L-5 follow-ups remain documented, out of phase scope.

### Human Verification Required

None. Both round-4 human items were resolved in UAT round 3: test 4 (Firefox + Chrome PDF toolbar/Download re-run) — **pass**; test 5 (WR-01 triage) — **pass**, decision recorded. UAT frontmatter: `status: complete`, 4 passed / 1 historic issue (superseded by test 4), 0 pending.

### Gaps Summary

No gaps. The close-out commits are semantics-preserving on every phase-covered file (line-by-line diff audit): server.js gained only the T-12-08 eslint-disable plus prettier reflows; the D-16 i18n work is additive keys with every phase-12 key and the cap-interpolation chain preserved; the catalogue guard was advanced 1532→1538 with the delta documented; the e2e/test changes are prettier reflows with all phase assertions intact; modals.js, overlays.css, context-menu.js and main.js are untouched. The full pipe is green in this verifier's own process against the committed HEAD — lint 0, format 0, 445/445 unit, build exit 0, 45/45 e2e across both locales. The last behavior-unverified truth was human-verified in UAT round 3 (Firefox toolbar + footer Download in both browsers), and the WR-01 triage decision is recorded. Covered digest regenerated over the current codebase: `17652ecc278fd52fc66552c0f5720b5028c0b320bda7bff3ec4eba319fe6c583`. Remaining before milestone ship: the CR-01 zero-byte range guard (explicit fix or accepted-disposition) and reversion of the dirty probe line in src/views/table.js — neither is a phase-goal gap.

---

_Verified: 2026-10-25T18:53:59Z_
_Verifier: the agent (gsd-verifier)_
_covered_digest via `gsd_run query verification.fingerprint` over 38 phase files (round-5 refresh)_
