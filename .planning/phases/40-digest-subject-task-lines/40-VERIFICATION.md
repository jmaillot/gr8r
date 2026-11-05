---
phase: 40-digest-subject-task-lines
verified: 2026-11-05T12:00:00Z
status: passed
score: 9/9 must-haves verified
covered_files:
  - .planning/phases/40-digest-subject-task-lines/40-01-PLAN.md
  - .planning/phases/40-digest-subject-task-lines/40-02-PLAN.md
  - .planning/phases/40-digest-subject-task-lines/40-01-SUMMARY.md
  - .planning/phases/40-digest-subject-task-lines/40-02-SUMMARY.md
  - mailer.js
  - server.js
  - test/subject-encode.test.mjs
  - test/digest.test.mjs
  - test/i18n-core-features.test.mjs
  - src/locales/en.json
  - src/locales/fr.json
covered_digest: "v2:sha256:814bbbd665af9fefbeef7bfe99ccf8e2ef75bbd1eb960aef9fe3cd8679583af0"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 9/9
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 40: Digest Subject & Task Lines Verification Report

**Phase Goal:** A digest email is instantly identifiable per workspace and each task line names its parent project — with user-controlled names safe in SMTP headers
**Verified:** 2026-11-05
**Status:** passed
**Re-verification:** Yes — digest staleness re-run (#4682); previous verification had no gaps, this run is a full regression pass

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Member of two workspaces gets two same-morning digests, each subject `[{ws}] …` localized EN+FR | ✓ VERIFIED | mailer.js:571 renders `notif.digest.subjectWs` with `truncate(ws,64)`; test/digest.test.mjs two-ws bracketed-subject case passes (16/16); FR value at src/locales/fr.json:1688 |
| 2 | `reminders_sent` claim key `${ws.id}:${user_id}:digest:${localDate}` byte-identical; no-double-send tests unmodified | ✓ VERIFIED | server.js insert-or-ignore claim block matches frozen shape; existing digest tests pass unmodified (16/16 in test/digest.test.mjs) |
| 3 | Task lines read `Project Name — Task Name` (em dash, HTML-escaped in HTML part); degrade to title-only when project unknown/invisible via single memberCanReadProject funnel — no leak | ✓ VERIFIED | mailer.js:600 taskLabel join with em dash; HTML `<a>` escapeHtml'd at mailer.js:608; server.js resolves `project` only after inScopeProject+memberCanReadProject (server.js ~1561-1563, mapping `projects.get(...)?.name`); no-leak test passes |
| 4 | CRLF/emoji/accents/200+ char names → exactly one well-formed RFC 2047 Subject through one tested builder; no injection, no mojibake in FR | ✓ VERIFIED | mailer.js:52-95 hardened encodeWord (C0+DEL strip before encode decision, folding at 900 octets); test/subject-encode.test.mjs 10/10 pass (CRLF tracer, 400-char emoji round-trip, FR accents, tab/DEL, empty) |
| 5 | `truncate(name, cap)` caps and appends single U+2026 only on truncation | ✓ VERIFIED | mailer.js:103-106; cap tests in test/subject-encode.test.mjs pass |
| 6 | `notif.digest.subjectWs` catalogued EN+FR with {ws}/{count}; `npm run i18n:scan` green | ✓ VERIFIED | en.json:1688 + fr.json:1688; i18n scan: 0 literals, 0 pending, 0 mismatch |
| 7 | Existing `notif.digest.subject` key and SC-5 English-literal fallback still render | ✓ VERIFIED | subject key retained in both locales; SC-5 fallback pinned by poisoned-catalogue test (test/digest.test.mjs, passes) |
| 8 | WS capped 64 chars, project/task capped ~80, truncated independently before join | ✓ VERIFIED | mailer.js:571 (64) and 600 (80/80 independent) |
| 9 | All new subject strings catalogued, i18n scan green server-side | ✓ VERIFIED | `npm run i18n:scan` — 0 literals, 0 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch |

**Score:** 9/9 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `mailer.js` | hardened encodeWord, truncate, subjectWs render, taskLabel | ✓ VERIFIED | All present, substantive, wired into buildDigestMessage |
| `server.js` | project field on dueToday+overdue mappings | ✓ VERIFIED | Resolved post-visibility-funnel (inScopeProject + memberCanReadProject) |
| `src/locales/en.json` / `fr.json` | `notif.digest.subjectWs` | ✓ VERIFIED | Line 1688 both, EN+FR values correct |
| `test/subject-encode.test.mjs` | hostile-name suite | ✓ VERIFIED | 10/10 pass |
| `test/digest.test.mjs` | additive SUBJ tests | ✓ VERIFIED | 16/16 pass incl. 5 new cases |
| `test/i18n-core-features.test.mjs` | i18n regression coverage | ✓ VERIFIED | 14/14 pass |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| mailer.js encodeWord | All Subject call sites | `Subject: ${encodeWord(subject)}` | WIRED | Every Subject emission passes through the single hardened builder |
| server.js visibility funnel | digest send mapping | inScopeProject + memberCanReadProject before `projects.get(...)?.name` | WIRED | Names reach the mailer pre-cleared |
| mailer.js truncate | subject/task-line caps | truncate(ws,64) / truncate(project,80)/truncate(title,80) | WIRED | Render-time application confirmed (mailer.js:571, 600) |
| locale keys | buildDigestMessage render | tFor('notif.digest.subjectWs', {ws,count}) | WIRED | Interpolation verified by test assertions |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Hostile-name suite | `node --test test/subject-encode.test.mjs` | 10 tests, 10 pass, 0 fail | ✓ PASS |
| Digest suite (claim-key, subjects, no-leak, SC-5) | `node --test test/digest.test.mjs` | 16 tests, 16 pass, 0 fail | ✓ PASS |
| i18n core suite | `node --test test/i18n-core-features.test.mjs` | 14 tests, 14 pass, 0 fail | ✓ PASS |
| i18n phase gate | `npm run i18n:scan` | 0 literals, 0 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| SUBJ-01 | 40-02 | One digest per workspace with ws name in subject; claim key byte-identical | ✓ SATISFIED | Truths 1-2, test-pinned |
| SUBJ-02 | 40-02 | `Project Name — Task Name` lines; degrade without leak via memberCanReadProject funnel | ✓ SATISFIED | Truth 3, no-leak test passes |
| SUBJ-03 | 40-01 | CRLF-stripped, RFC 2047-encoded names via one tested builder | ✓ SATISFIED | Truth 4, hostile-name suite green |

No orphaned requirements: REQUIREMENTS.md maps SUBJ-01/02/03 to Phase 40 (all marked Complete); all three claimed by plans and satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| mailer.js | ~592 | "placeholder" in comment (describes the D-06 no-placeholder rule) | ℹ️ Info | None — descriptive, not a debt marker |
| test/digest.test.mjs | ~586, 602 | "placeholder" in test name/assertion (negative assertion for D-06) | ℹ️ Info | None — asserts absence of placeholder text |

No TBD/FIXME/XXX debt markers. No stub patterns.

### Human Verification Required

None — every truth is exercised by a passing behavioral test (SMTP-harness round-trips, poisoned-catalogue fallback, no-leak raw-payload assertion). Visual/UX aspects of the digest email are pinned by decoded-payload assertions.

### Gaps Summary

None. All roadmap success criteria 1-4 are met and test-pinned; the claim block is byte-identical; the i18n gate is green; the regression pass reproduces all previously reported results with zero failures and zero regressions.

---

_Verified: 2026-11-05_
_Verifier: the agent (gsd-verifier)_
