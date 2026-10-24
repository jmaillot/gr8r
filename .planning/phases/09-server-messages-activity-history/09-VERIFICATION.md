---
phase: 09-server-messages-activity-history
verified: 2026-10-24T16:35:00Z
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
  - "test/error-codes.test.mjs"
  - "test/activity-verbs.test.mjs"
  - "test/server-boot.test.mjs"
  - "test/i18n-locale.test.mjs"
  - "test/i18n-vocab.test.mjs"
  - "test/catalogue.test.mjs"
  - "DEPLOY.md"
  - ".env.example"
  - "docker-compose.yml"
covered_digest: "v2:sha256:0438665e76ed6e7b3537d2303cd9b4b7f8d54c0c1eae996efd23b0d7d3aa700c"
behavior_unverified: 0
overrides_applied: 0
advisory:
  - finding: "npm run lint reports 3 pre-existing errors in test files (test/locale-negotiate.test.mjs:76,79 no-undef `document`; test/server-boot.test.mjs:26 no-regex-spaces)"
    category: other
    reason: "Pre-existing, documented in the phase's own deferred-items.md (09-07) as untouched per the scope-boundary rule; test-only, no runtime impact"
    evidence_status: "npm run lint re-run by the verifier: 3 errors, all in the two documented test files"
  - finding: "npm run format:check reports style issues in 15 files, including phase-modified files (server.js, src/core/api.js, src/core/i18n.js, src/core/utils.js, test/error-codes.test.mjs, test/activity-verbs.test.mjs)"
    category: other
    reason: "Verified pre-existing: prettier --check fails on the same core files at commit 4f7cc34^ (before phase 09 began); the drift predates the phase, the plans' 'format:check green' claims were inherited-red, not phase-introduced"
    evidence_status: "git show 4f7cc34^ + npx prettier --check reproduction"
  - finding: "Review IN-05 (readJson drains unbounded memory before writing the 413) and IN-06 (a malformed known-kind extra can echo a literal key) remain open, info-level"
    category: other
    reason: "Non-blocking per the phase's re-review disposition (PASS, 2 info open); backlog candidates"
    evidence_status: "09-REVIEW-DISPOSITION.md, recheck commit 15401dc"
---

# Phase 09: Server Messages & Activity History — Verification Report

**Phase Goal:** The two remaining sources of English. Server errors gain a stable machine code beside their unchanged English message — payload shape unchanged, client translates the code and falls back to the English string when unknown. Activity log restructured to machine verbs with structured extra: filters stop parsing English and classify the stored verb, existing documents keep filtering correctly with no migration, legacy English prose detail is suppressed at render rather than leaked.

**Verified:** 2026-10-24T16:35:00Z
**Status:** passed
**Re-verification:** Yes — digest refresh only. The prior report (commit 0b5f7f8) was flagged stale because its covered_digest was computed against a pre-docs working state and no longer matched disk state after the review-disposition documentation commits (15401dc, b98ad3f). No source files changed since the passing verification — `git log 0b5f7f8..HEAD` is empty (0b5f7f8 is HEAD), and only `.planning/**.md` docs were touched by those commits. Spot-checks re-run at refresh time: `npm test` 431/431 green, `fail()` at server.js:1048 + `sameOrigin()` at :1084 with 4 guard call-sites intact, `tErr(data.code, data, data?.error)` on the whole payload at src/core/api.js:62. Findings and structure unchanged; only `verified:` and `covered_digest:` recomputed via gsd-tools verification.fingerprint.

## Automated Checks Results

| Check | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| Full test suite | `npm test` | 431/431 pass, 0 fail, 0 skip, ~16 s | ✓ PASS |
| Lint | `npm run lint` | 3 errors — all pre-existing, documented in deferred-items.md (test/locale-negotiate ×2, test/server-boot:26) | ⚠️ pre-existing |
| Format | `npm run format:check` | 15 files — verified pre-existing (same core files fail at 4f7cc34^, before the phase) | ⚠️ pre-existing |
| Build (incl. prebuild i18n-scan + fr-parity gates) | `npm run build` | green, built in 1.28 s | ✓ PASS |
| err.* parity | node on both catalogues | 106 keys in en, 106 in fr, identical key order | ✓ PASS |
| act.* parity | node on both catalogues | 173 keys in en, 173 in fr | ✓ PASS |
| Reserved-placeholder guard | node over err.* values | 0 values interpolate a control field (error/code/status/ok/data/needsSignIn/suggestion/revision) | ✓ PASS |

## Goal Achievement

### Observable Truths

Merged from all 7 PLAN frontmatters (roadmap SCs superset; plan truths deduplicated into 10 clusters).

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | Every HTTP error built in server.js carries a camelCase `code` beside its byte-unchanged English `error`; payload shape otherwise unchanged (ERR-01) | ✓ VERIFIED | `fail(res, status, code, message, extra)` at server.js:1048 spreading `extra` last; `grep -cE "json\(res, *[0-9]+, *\{ error"` = 0; parity test asserts byte-for-byte English (`a failed login keeps the English message byte-for-byte…` green); suggestion/revision/needsSignIn extras intact (payload-shape pin) |
| 2  | Every emitted code has a non-empty `err.<code>` in en.json AND fr.json — bidirectional (D-04) | ✓ VERIFIED | 106 err.* keys in each locale, same order; forward-extraction + reverse-parity-with-allowlist tests both green in test/error-codes.test.mjs |
| 3  | The 8 thrown httpError sites emit their code via the 3 catch sites; a code-less 500 emits no `code` field (D-03) | ✓ VERIFIED | All 8 sites carry literal 3rd args (lastPrivateMember:715, workspaceNotFound, noWorkspaceReady, enterValidEmail, passwordTooShort, accountExists ×2 incl. TOCTOU:987/998, bodyTooLarge:1183, invalidJson:1194); `code: err.code` ×3; integration tests named lastPrivateMember/bodyTooLarge/invalidJson/accountExists all green |
| 4  | Client translates known codes at the single `call()` boundary; unknown code falls back to the raw server message — never empty, never the literal `err.<code>` key (ERR-02, D-03) | ✓ VERIFIED | api.js:62 `tErr(data.code, data, data?.error)` (whole-payload transport); i18n.js:188/196 `has()`/`tErr()`; offline branch untouched (api.js:47, no `code`); unit tests: known-code interpolation, unknown-code raw echo, undefined-raw, key-echo-never — all green |
| 5  | Interpolation params actually reach the client — a translated toast never contains a literal `{email}`/`{name}` (CR-02) | ✓ VERIFIED | Integration test `alreadyMember ships its flat payload and renders in French without braces` green; server sends `{ email }` extra on inviteForOtherEmail; modals.js:225 uses the same whole-payload transport `tErr(l.code, l, l.error \|\| '')` |
| 6  | The failed-invite-row tooltip translates via `emailSendFailed` (the 201 has no error branch) | ✓ VERIFIED | server.js `row.code = 'emailSendFailed'` ×1; modals.js:225 consumes it via tErr with esc() at the sink |
| 7  | New activity writes store machine camelCase verbs + structured `{ kind, …ids }` extras — never t()-derived prose (ACT-01) | ✓ VERIFIED | `grep 'logAct(.moved., t, .from '` = 0; priority path stores `{ kind: 'prioritySet', value: <id> }`; both bypass sites (actions.js ~332/~1348) carry `projectStatusChanged`/`createdProject` with object extras; writer-extraction parity test green |
| 8  | Filters classify the stored verb via `actCategory` — no English includes()/regex at render — with the exact D-06 selection preserved | ✓ VERIFIED | activity.js:14 `actCategory(a.verb) === f`; no `a.verb.includes` / `/moved\|completed/` remains; old-vs-new equivalence test over 25 legacy + 25 machine verbs green with the single documented exception (createdProject — WR-01 restoration) |
| 9  | Legacy entries stay listed and filterable with no migration; legacy string extras are dropped at render, never divulged (ACT-02) | ✓ VERIFIED | actExtraHtml string branch returns `''` (task-list.js); unknown-kind branch also `''`; test `a legacy string extra renders nothing — suppressed, never divulged` is live (0 skips in the file); seed converted: 4 structured extras (statusMoved ×2, prioritySet, assignedTo), 0 prose extras, legacy verb fragments preserved; seed-compat classification test green |
| 10 | `changed status of project` renders translated in both locales; drawer renders verbs via the shared `verbLabel` | ✓ VERIFIED | VERB_KEYS entry `'changed status of project' → act.verb.projectStatusChanged`; key present in both catalogues (act.* 173/173); drawer.js:128 calls `verbLabel(a.verb)` — no `replace(/ of$/` remains |

**Score:** 10/10 truths verified (0 present-behavior-unverified — every behavior-dependent truth has a dedicated passing integration test, run by the verifier in `npm test`)

### Security hardening co-delivered (plans 09-06/09-07, from the review)

| Truth | Status | Evidence |
| ----- | ------ | -------- |
| TRUST_PROXY is opt-in (`=== 'true'`); XFF rotation cannot escape the login throttle | ✓ VERIFIED | server.js:67; integration tests WR-03 (429 on 11th rotated attempt without opt-in; no throttle with opt-in) green |
| SMTP_HOST without APP_URL refuses to boot (exit 1) | ✓ VERIFIED | Boot gate at server.js (~1925, before listen); negative + positive boot tests green; DEPLOY.md/.env.example document it; docker-compose.yml untouched |
| Login and signup reject hostile Origin with 403 crossOriginRejected | ✓ VERIFIED | Guard before body read and throttle on both session routes; integration tests (hostile origin ×2 + positive control) green |
| modKey() is a lazy getter evaluated at render; single esc table; crypto-backed uid() | ✓ VERIFIED | utils.js:47 `export const modKey = () => …`; esc re-exports escHtml (single table); uid uses crypto.getRandomValues; source assertions in test/i18n-locale.test.mjs green |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `server.js` fail()/httpError(code)/catch sites/row.code | All error paths coded | ✓ VERIFIED | fail():1048, 0 inline survivors, 3 catch transfers, emailSendFailed ×1, 8 coded throw sites, readJson drain-on-overflow, createUser TOCTOU mapping |
| `src/locales/{en,fr}.json` err.*/act.* keys | ~44 err.* + 4 act.* new, mirror positions, fr typography | ✓ VERIFIED | 106/106 err.* mirrored; act.* 173/173; fr typography gates (prebuild) green |
| `src/core/i18n.js` has()/tErr() | Gate + translate helpers | ✓ VERIFIED | lines 188/196, unit-tested |
| `src/core/api.js` call() boundary | tErr translation at the single return | ✓ VERIFIED | line 62; offline branch intact |
| `src/components/task-list.js` | VERB_KEYS machine entries, EXTRA_VARS table, ACT_CATEGORIES/actCategory, suppression branch | ✓ VERIFIED | All present and exported; assignedTo `?? ''` fallback |
| `src/pages/activity.js` | Filters on actCategory | ✓ VERIFIED | line 14 |
| `src/overlays/{drawer,modals,palette}.js`, `src/pages/{inbox,auth}.js` | verbLabel unification, tErr tooltip, modKey() call sites, esc(e.login) | ✓ VERIFIED | All grep-confirmed |
| `src/actions/{actions,archive,subtasks}.js`, `src/data/seed.js` | Machine verbs + structured extras; seed prose converted | ✓ VERIFIED | 4 structured seed extras; safe member access at the subtask site |
| `test/error-codes.test.mjs` | Parity + shape + no-survivor + reverse parity + 8 mandatory named tests | ✓ VERIFIED | All 8 canonical name markers present; 25 tests total, green |
| `test/activity-verbs.test.mjs` | Verb parity, equivalence, suppression, seed compat, no skips | ✓ VERIFIED | 10 tests, 0 skip, green |
| `test/server-boot.test.mjs` | Boot-gate cases | ✓ VERIFIED | Negative + positive cases green |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| fail()/httpError(code) | catch sites | `code: err.code` ×3 | ✓ WIRED | Counted in source + pinned by test |
| server error payload | api.js call() | `tErr(data.code, data, data?.error)` | ✓ WIRED | Line 62, whole-payload transport |
| tErr | has() → Object.hasOwn | gate against key echo | ✓ WIRED | Unit test pins never-echo |
| row.code (server 201) | modals.js invite row | `tErr(l.code, l, l.error \|\| '')` | ✓ WIRED | Line 225 |
| logAct writers | actExtraHtml | `{ kind, … }` → EXTRA_VARS → act.extra.* | ✓ WIRED | Priority/statusMoved/seed extras render translated (tests green) |
| actCategory | activity.js filters | `actCategory(a.verb) === f` | ✓ WIRED | Import at line 6, use at line 14 |
| ACT_CATEGORIES | task-list export | two-vocabulary sets incl. D-06 quirk | ✓ WIRED | Equivalence test over both vocabularies |
| verbLabel | drawer.js | shared helper, no divergent fallback | ✓ WIRED | drawer.js:128 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| Error toasts | data.code / data.error | Real server responses (integration harness, real DATA_DIR) | Yes | ✓ FLOWING |
| alreadyMember payload | email/name | Real invite flow over the harness | Yes | ✓ FLOWING |
| Activity extras | status/priority/project ids | Stored documents; resolved via t('task.status.'+id) etc. at render | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Whole suite incl. all phase integration tests | `npm test` | 431 pass / 0 fail / 0 skipped | ✓ PASS |
| Mandatory named tests exist | grep of 8 canonical markers in test/error-codes.test.mjs | all present | ✓ PASS |
| No skip left in activity tests | grep `skip:` | none | ✓ PASS |
| Catalogue parity/shape | node against both locales | 106/106 err.*, 173/173 act.*, mirrored | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or conventional for this project; the phase's own probe role is played by the integration tests inside `npm test` (real servers, real DATA_DIR), which the verifier ran. SKIPPED (no separate probe files).

### Requirements Traceability

| Requirement | Source Plan(s) | Description (REQUIREMENTS.md) | Status | Evidence |
| ----------- | -------------- | ----------------------------- | ------ | -------- |
| ERR-01 | 09-01, 09-02, 09-04, 09-06 | Server error carries a stable machine code next to its English message; client translates; unknown → raw message | ✓ SATISFIED | Truths 1-6; REQUIREMENTS.md marks Complete |
| ERR-02 | 09-02, 09-04, 09-06 | Unknown code still shows the server's message (never empty, never the key literal) | ✓ SATISFIED | Truth 4 + dedicated unit tests |
| ACT-01 | 09-03, 09-05 | Activity log displayed in the interface language; filters classify the stored verb | ✓ SATISFIED | Truths 7-8 |
| ACT-02 | 09-03, 09-05 | Pre-milestone entries still listed and filterable, no migration, legacy prose dropped not leaked | ✓ SATISFIED | Truth 9 |
| LOC-01 (served, not delivered) | 09-07 | Locale switch without reload (phase-08 contract) | ✓ CONSISTENT | 09-07 removes the last import-frozen label (modKey); REQUIREMENTS.md maps LOC-01 to phase 8 — no orphaned requirement |

Orphaned requirements: none — all four phase-09 IDs in REQUIREMENTS.md are claimed by plans and verified.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| test/locale-negotiate.test.mjs | 76, 79 | `document` no-undef (lint) | 📋 Advisory | Pre-existing, documented in deferred-items.md |
| test/server-boot.test.mjs | 26 | no-regex-spaces (lint) | 📋 Advisory | Pre-existing, documented in deferred-items.md |
| (15 files) | — | Prettier drift | 📋 Advisory | Verified pre-existing at 4f7cc34^; not phase-introduced |

No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER debt markers in any phase-modified file. No stub returns, no empty handlers, no console.log-only implementations.

### Human Verification Required

None blocking. The phase's behavior-dependent truths (throttle spoof, 413 delivery, signup race, cross-origin rejection, brace-free French rendering, filter equivalence) are all exercised by passing integration tests over real servers. A visual sanity check of a French session (translated toasts with interpolated email/name, suppressed legacy extras in the feed/drawer) is available to the user but is covered by the e2e French no-braces test and the equivalence/suppression pins.

### Gaps Summary

None. All 10 merged must-have truths verified against source, all key links wired, all behavior-dependent truths backed by passing integration tests the verifier re-ran (431/431, 0 skipped). The three lint/format/review advisories are pre-existing or info-level and do not touch the phase goal; the open review items IN-05/IN-06 are recorded as backlog candidates in 09-REVIEW-DISPOSITION.md.

---

_Verified: 2026-10-24T16:35:00Z (digest refresh)_
_Verifier: the agent (gsd-verifier)_
