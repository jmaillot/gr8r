---
phase: 09-server-messages-activity-history
verified: 2026-10-25T19:08:46Z
status: passed
score: 10/10 must-haves verified
covered_files:
  - ".planning/phases/09-server-messages-activity-history/09-CONTEXT.md"
  - ".planning/phases/09-server-messages-activity-history/09-RESEARCH.md"
  - ".planning/phases/09-server-messages-activity-history/09-PATTERNS.md"
  - ".planning/phases/09-server-messages-activity-history/09-REVIEW.md"
  - ".planning/phases/09-server-messages-activity-history/09-REVIEW-DISPOSITION.md"
  - ".planning/phases/09-server-messages-activity-history/deferred-items.md"
  - ".planning/phases/09-server-messages-activity-history/09-01-PLAN.md"
  - ".planning/phases/09-server-messages-activity-history/09-01-SUMMARY.md"
  - ".planning/phases/09-server-messages-activity-history/09-02-PLAN.md"
  - ".planning/phases/09-server-messages-activity-history/09-02-SUMMARY.md"
  - ".planning/phases/09-server-messages-activity-history/09-03-PLAN.md"
  - ".planning/phases/09-server-messages-activity-history/09-03-SUMMARY.md"
  - ".planning/phases/09-server-messages-activity-history/09-04-PLAN.md"
  - ".planning/phases/09-server-messages-activity-history/09-04-SUMMARY.md"
  - ".planning/phases/09-server-messages-activity-history/09-05-PLAN.md"
  - ".planning/phases/09-server-messages-activity-history/09-05-SUMMARY.md"
  - ".planning/phases/09-server-messages-activity-history/09-06-PLAN.md"
  - ".planning/phases/09-server-messages-activity-history/09-06-SUMMARY.md"
  - ".planning/phases/09-server-messages-activity-history/09-07-PLAN.md"
  - ".planning/phases/09-server-messages-activity-history/09-07-SUMMARY.md"
  - "server.js"
  - "src/core/api.js"
  - "src/core/i18n.js"
  - "src/core/utils.js"
  - "src/overlays/modals.js"
  - "src/overlays/drawer.js"
  - "src/overlays/palette.js"
  - "src/pages/inbox.js"
  - "src/pages/activity.js"
  - "src/pages/auth.js"
  - "src/components/task-list.js"
  - "src/actions/actions.js"
  - "src/actions/archive.js"
  - "src/actions/subtasks.js"
  - "src/data/seed.js"
  - "src/locales/en.json"
  - "src/locales/fr.json"
  - "src/views/files.js"
  - "test/error-codes.test.mjs"
  - "test/activity-verbs.test.mjs"
  - "test/server-boot.test.mjs"
  - "test/i18n-locale.test.mjs"
  - "test/i18n-vocab.test.mjs"
  - "test/catalogue.test.mjs"
  - "DEPLOY.md"
  - ".env.example"
  - "docker-compose.yml"
covered_digest: "v2:sha256:c526e409eaf9059fa0d55f6f835497f6698647e349ecb098ccafe9d089dbdf0a"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 10/10
  gaps_closed: []
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "test/i18n-scan.test.mjs:353 (the build-gate failure proof) mutates the REAL src/views/table.js in place with no cross-process lock; two concurrent `npm test` executions double-append the probe literal, crash unrelated test files (duplicate `export const probe` in i18n-vocab/i18n-search) and can leave the working tree dirty"
    category: other
    reason: "Pre-existing test-isolation defect in a phase-06-10 artifact (not phase 09 scope); only triggers when two suites run simultaneously — e.g. two parallel verifier sessions. A single quiescent run is 446/446 green and restores the tree (verified: final clean run left `git status` clean). Backlog candidate: write the probe to a temp copy or take a lockfile."
    evidence_status: "Observed live during this re-verification: uncommitted probe line found at src/views/table.js:87 (git blame 'Not Committed Yet'), run-2 log shows SyntaxError 'Identifier probe has already been declared' at table.js:89 (double append), and a concurrent verifier session (PID 1726305) was running npm test at the same moment. After waiting for quiescence and restoring the file: node scripts/i18n-scan.mjs exit 0, full suite 446/446, tree clean."
  - finding: "Review IN-05 (readJson drains unbounded memory before writing the 413) and IN-06 (a malformed known-kind extra can echo a literal key) remain open, info-level"
    category: other
    reason: "Non-blocking per the phase's re-review disposition (PASS, 2 info open); backlog candidates, unchanged from the prior report"
    evidence_status: "09-REVIEW-DISPOSITION.md (carried forward from prior verification)"
---

# Phase 09: Server Messages & Activity History — Verification Report

**Phase Goal:** The server speaks the catalogue too — server-generated messages (toasts/errors surfaced from API responses) are locale-aware, and the workspace gains an activity history. Error codes are machine-stable (`err.<code>` keys) with English fallback text server-side by design (D-05).

**Verified:** 2026-10-25T19:08:46Z
**Status:** passed
**Re-verification:** Yes — digest refresh + close-out regression (#4682). The v1.2 milestone close-out commits (2a75275 splice-site translations, be0fdf6 lint fixes, 21725f1 prettier, d1807be deferred-items resolution) touched phase-covered files (server.js, src/actions/actions.js, src/locales/{en,fr}.json, src/core/{api,i18n,utils}.js, src/views/files.js, test files). The prior report's covered_digest no longer matched disk. This re-verification: (1) regression-checked every wiring pin the close-out touched, (2) re-ran the full automated check battery on the current tree, (3) recomputed `covered_digest` via `gsd_run query verification.fingerprint` (adding src/views/files.js, changed by 2a75275). **No regression found** — all 10 must-have truths still hold.

## Automated Checks Results (current tree, HEAD d1807be)

| Check | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| Full test suite | `npm test` | 446 pass / 0 fail / 0 skip / 0 cancelled (prior report: 431 — close-out added/updated tests) | ✓ PASS |
| Lint | `npm run lint` | exit 0 — **clean** (prior report's 3 pre-existing errors resolved by be0fdf6) | ✓ PASS |
| Format | `npm run format:check` | exit 0 — **clean** (prior report's 15-file drift resolved by 21725f1) | ✓ PASS |
| Build (incl. prebuild i18n-scan + fr-parity gates) | `npm run build` | exit 0, built in 2.15 s | ✓ PASS |
| err.* parity | node on both catalogues | 108 keys in en, 108 in fr, identical order (was 106/106 — +2 close-out keys) | ✓ PASS |
| act.* parity | node on both catalogues | 177 keys in en, 177 in fr (was 173/173 — close-out keys incl. plural variants) | ✓ PASS |
| Reserved-placeholder guard | node over err.* values | 0 values interpolate a control field (error/code/status/ok/data/needsSignIn/suggestion/revision) | ✓ PASS |
| i18n scan gate on live tree | `node scripts/i18n-scan.mjs` | exit 0, 0 violations (D-07 gate intact) | ✓ PASS |

## Close-Out Regression Checks (#4682)

Every wiring pin the close-out commits touched, re-verified against the current tree:

| Pin | File:line (now) | Status |
| --- | --------------- | ------ |
| `fail(res, status, code, message, extra)` helper | server.js:1052 | ✓ intact |
| eslint-disable on the intentional T-12-08 control-regex | server.js:1925 | ✓ present, no behaviour change |
| `tErr(data.code, data, data?.error)` whole-payload transport at the single `call()` boundary | src/core/api.js:63 | ✓ intact |
| Filters classify the stored verb — `actCategory(a.verb) === f` | src/pages/activity.js:14 | ✓ intact |
| Drawer renders verbs via shared `verbLabel(a.verb)` | src/overlays/drawer.js:128 | ✓ intact |
| No raw-English `logAct('moved', t, 'from …')` prose writer | grep count = 0 | ✓ intact |
| 6 new close-out splice keys present in BOTH locales (toast.dirUp/dirDown, act.deleteProjectTaskCount, act.removeAccess.losesAccess/unassigns, page.files.browse) | src/locales/{en,fr}.json — 6/6 each | ✓ intact |
| deferred-items.md entry now `**Status:** resolved` (commit be0fdf6) | deferred-items.md | ✓ resolved |

## Goal Achievement

### Observable Truths

Merged from all 7 PLAN frontmatters (roadmap SCs superset; plan truths deduplicated into 10 clusters). All 10 previously verified; re-verification regression confirms they still hold after the close-out commits.

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | Every HTTP error built in server.js carries a camelCase `code` beside its byte-unchanged English `error`; payload shape otherwise unchanged (ERR-01) | ✓ VERIFIED | `fail(res, status, code, message, extra)` at server.js:1052 spreading `extra` last; parity test asserts byte-for-byte English (green in the 446-run); suggestion/revision/needsSignIn extras intact |
| 2  | Every emitted code has a non-empty `err.<code>` in en.json AND fr.json — bidirectional (D-04) | ✓ VERIFIED | 108 err.* keys in each locale, same order; forward-extraction + reverse-parity tests green |
| 3  | The 8 thrown httpError sites emit their code via the 3 catch sites; a code-less 500 emits no `code` field (D-03) | ✓ VERIFIED | All 8 sites carry literal 3rd args; `code: err.code` ×3; named integration tests green in the 446-run |
| 4  | Client translates known codes at the single `call()` boundary; unknown code falls back to the raw server message — never empty, never the literal `err.<code>` key (ERR-02, D-03) | ✓ VERIFIED | api.js:63 `tErr(data.code, data, data?.error)`; i18n.js `has()`/`tErr()`; offline branch intact; unit tests green |
| 5  | Interpolation params actually reach the client — a translated toast never contains a literal `{email}`/`{name}` (CR-02) | ✓ VERIFIED | Integration test green; server sends `{ email }` extra; modals.js uses the same whole-payload transport |
| 6  | The failed-invite-row tooltip translates via `emailSendFailed` (the 201 has no error branch) | ✓ VERIFIED | server.js `row.code = 'emailSendFailed'`; modals.js consumes via tErr with esc() at the sink |
| 7  | New activity writes store machine camelCase verbs + structured `{ kind, …ids }` extras — never t()-derived prose (ACT-01) | ✓ VERIFIED | grep prose-writer count = 0; priority path stores `{ kind: 'prioritySet', value: <id> }`; writer-extraction parity test green |
| 8  | Filters classify the stored verb via `actCategory` — no English includes()/regex at render — with the exact D-06 selection preserved | ✓ VERIFIED | activity.js:14; no `a.verb.includes` remains; old-vs-new equivalence test green |
| 9  | Legacy entries stay listed and filterable with no migration; legacy string extras are dropped at render, never divulged (ACT-02) | ✓ VERIFIED | actExtraHtml string branch returns `''`; suppression test live (0 skips); seed has 4 structured extras, 0 prose |
| 10 | `changed status of project` renders translated in both locales; drawer renders verbs via the shared `verbLabel` | ✓ VERIFIED | VERB_KEYS entry present; act.* 177/177 mirrored; drawer.js:128 |

**Score:** 10/10 truths verified (0 present-behavior-unverified — every behavior-dependent truth is backed by a passing integration test in the verifier-run 446-test suite)

### Required Artifacts

All artifacts from the prior report re-checked at Levels 1–3 on the current tree: server.js fail()/catch sites/row.code, both catalogues, i18n.js has()/tErr(), api.js boundary, task-list.js tables, activity.js filters, overlays/pages wiring, actions writers, seed, and the three test files — all ✓ VERIFIED. Plus `src/views/files.js` (added to covered set: 2a75275 moved its 'browse' literal to `page.files.browse`) — ✓ VERIFIED, wired via tk() at the dropzone site.

### Key Link Verification

All 8 key links from the prior report re-confirmed WIRED on the current tree (fail→catch ×3, api.js tErr transport, tErr→has() gate, row.code→modals tooltip, logAct→actExtraHtml→act.extra.*, actCategory→activity.js filters, ACT_CATEGORIES→task-list export, verbLabel→drawer.js). No link regressed.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Whole suite incl. all phase integration tests | `npm test` (quiescent tree, single runner) | 446 pass / 0 fail / 0 skipped | ✓ PASS |
| Catalogue parity/shape | node against both locales | 108/108 err.*, 177/177 act.*, identical order | ✓ PASS |
| D-07 scan gate on live tree | `node scripts/i18n-scan.mjs` | exit 0 | ✓ PASS |
| Working tree restored after suite | `git status --short` (code files) | clean | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or conventional for this project; the phase's probe role is played by the integration tests inside `npm test` (real servers, real DATA_DIR), which the verifier ran. SKIPPED (no separate probe files).

### Requirements Traceability

| Requirement | Source Plan(s) | Description (REQUIREMENTS.md) | Status | Evidence |
| ----------- | -------------- | ----------------------------- | ------ | -------- |
| ERR-01 | 09-01, 09-02, 09-04, 09-06 | Server error carries a stable machine code next to its English message; client translates; unknown → raw message | ✓ SATISFIED | Truths 1-6; REQUIREMENTS.md marks Complete |
| ERR-02 | 09-02, 09-04, 09-06 | Unknown code still shows the server's message (never empty, never the key literal) | ✓ SATISFIED | Truth 4 + dedicated unit tests |
| ACT-01 | 09-03, 09-05 | Activity log displayed in the interface language; filters classify the stored verb | ✓ SATISFIED | Truths 7-8 |
| ACT-02 | 09-03, 09-05 | Pre-milestone entries still listed and filterable, no migration, legacy prose dropped not leaked | ✓ SATISFIED | Truth 9 |
| LOC-01 (served, not delivered) | 09-07 | Locale switch without reload (phase-08 contract) | ✓ CONSISTENT | REQUIREMENTS.md maps LOC-01 to phase 8; 09-07 removed the last import-frozen label |

Orphaned requirements: none — all four phase-09 IDs in REQUIREMENTS.md are claimed by plans and verified.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| test/i18n-scan.test.mjs | 353 | Real-tree mutation with no cross-process lock (probe literal written into src/views/table.js in place) | 📋 Advisory | Pre-existing (phase-06-10 artifact); only bites when two suites run concurrently — documented in advisory, backlog candidate |

No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER debt markers in any phase-modified file. No stub returns, no empty handlers. Lint and format gates now fully green — the prior report's two pre-existing advisories are **resolved** (be0fdf6, 21725f1).

### Human Verification Required

None. All behavior-dependent truths are exercised by passing integration tests in the verifier-run suite (446/446, 0 skipped).

### Gaps Summary

None. All 10 merged must-have truths verified against the current tree; all key links wired; the close-out commits introduced no regression. The covered digest was recomputed against the current codebase (`v2:sha256:c526e409…`). One new advisory: the phase-06 i18n-scan build-gate test mutates the real tree and is not concurrency-safe (observed live during this re-verification when a parallel verifier session ran the suite simultaneously) — recorded as a backlog candidate, no impact on the phase goal or on quiescent runs.

---

_Verified: 2026-10-25T19:08:46Z (re-verification #4682: digest refresh + close-out regression)_
_Verifier: the agent (gsd-verifier)_
