---
phase: 40
plan: 02
subsystem: mailer+digest
tags: [smtp, digest, i18n, security, visibility]
requires: [40-01]
provides:
  - workspace-bracketed digest subjects via notif.digest.subjectWs (EN+FR)
  - `Project Name — Task Name` digest task lines with mailer-side truncate caps (64 ws / 80 project+title)
  - buildDigestMessage exported for unit tests
affects: [41, 42]
tech-stack:
  added: []
  patterns: [server-resolved-names-then-pure-renderer, catalogue-poisoning-fallback-test]
key-files:
  created: []
  modified: [server.js, mailer.js, src/locales/en.json, src/locales/fr.json, test/digest.test.mjs, test/i18n-core-features.test.mjs]
decisions:
  - "SC-5 fallback test strategy: buildDigestMessage exported (Plan 01 A2 precedent) and the catalogue poisoned with a throwing getter for notif.digest.subjectWs, restored in finally — a behavioral fallback test without a live SMTP round-trip"
  - "Degrade-path test fixture: a project row with NO name (not an invisible project) drives the `|| ''` title-only path — an invisible project is dropped by the visibility funnel before the mapping, so `|| ''` is snapshot defense only (D-05/D-06 verified)"
  - "FR digest subjects use NBSP (U+00A0) before ':' — the pre-existing subject key breached the french-typography pin at HEAD; fixed alongside the new key"
metrics:
  duration: ~35 min
  completed: 2026-11-05
status: complete
commits: 3
plan_head_before: 96bc70285ba916f66a7f4cf7955beb8a50955a3a
plan_head_after: 80b50df
actuals:
  tokens: 5400
  tasks: 3
  commits: 3
---

# Phase 40 Plan 02: Digest Subject Brackets & Task Lines (SUBJ-01/02) Summary

**One-liner:** `[WS]`-bracketed localized digest subjects plus `Project Name — Task Name` em-dash task lines with mailer-side truncate caps, server names resolved only after the visibility funnel — leak-free degrading lines pinned by five additive tests.

## What Was Built

1. **`notif.digest.subjectWs`** (en.json + fr.json, after `notif.digest.subject`): `"[{ws}] Daily digest: {count} task(s)"` / `"[{ws}] Résumé quotidien : {count} tâche(s)"` — brackets live inside the catalogue values; `notif.digest.subject` kept (D-02). `buildDigestMessage` renders it with `truncate(ws, 64)` inside the EXISTING try frame (D-11); the SC-5 catch literal keeps the count and gains the `[ws]` prefix.
2. **Server-side project resolution** (server.js send mapping): `project: projects.get(t?.project)?.name || ''` added to BOTH dueToday and overdue item mappings — one identical literal shape (Pitfall 5). Names resolved here because the inScopeProject + memberCanReadProject checks already ran for THIS recipient (D-05). The claim block at server.js:1572-1579 verified byte-identical via `git hash-object` comparison (SUBJ-01).
3. **Task lines** (mailer.js): `taskLabel = t => t.project ? truncate(t.project,80) + ' — ' + truncate(t.title,80) : truncate(t.title,80)` (em dash U+2014, caps applied independently before the join — D-12; falsy project ⇒ silent title-only, no placeholder — D-06). Text part plain (`- ${label}`), HTML part one `<a>` covering the whole label with escapeHtml after interpolation (T-40-07). Phase 40 comment block mimics the Phase 38 style.
4. **Tests** (test/digest.test.mjs, five additive cases, pre-existing assertions untouched): two-workspace bracketed subjects (per-ws, distinct), em-dash lines in both MIME parts (due + overdue sections), nameless-project title-only degrade with no-placeholder assertions, invisible private project name absent from a non-member's raw payload (T-40-06, with a positive control on the member who CAN read it), and the SC-5 fallback exercised through the now-exported `buildDigestMessage` with a poisoned catalogue (restored in `finally`) plus EN/FR happy-path and the 64-char ws cap.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-existing FR subject breached the D-05 typography pin**
- **Found during:** Task 3 (`npm test` full-suite gate)
- **Issue:** `notif.digest.subject` in fr.json uses a plain U+0020 before `:` — `test/french-typography.test.mjs` requires U+00A0. Verified pre-existing at HEAD (test fails on the unmodified file); my new subjectWs key would have added a second breach.
- **Fix:** NBSP before `:` in both FR digest subject values; the new unit-test expectation updated to match.
- **Files modified:** src/locales/fr.json, test/digest.test.mjs
- **Commit:** 80b50df

**2. [Rule 3 - Blocking] Catalogue-size pin updated for the new key**
- **Found during:** Task 3 (`npm test` full-suite gate)
- **Issue:** `test/i18n-core-features.test.mjs` pins the EN catalogue size (1675); the new key moved it to 1676.
- **Fix:** House additive-ledger convention: pin bumped to 1676 and `+ notif.digest.subjectWs, phase 40 plan 2` appended to the test title and inline comment.
- **Files modified:** test/i18n-core-features.test.mjs
- **Commit:** 80b50df

**3. [Planned-gap] buildDigestMessage exported for tests**
- **Found during:** Task 3
- **Issue:** The SC-5 fallback case needs to force a catalogue render throw; tFor never throws on a missing key from outside, and the builder is a module-private function.
- **Fix:** `buildDigestMessage` added to the existing test-surface export block (Plan 01's A2 precedent); send API unchanged.
- **Files modified:** mailer.js
- **Commit:** 80b50df

## Verification

- `node --test test/digest.test.mjs` — 16/16 pass (11 pre-existing + 5 new; pre-existing assertions byte-unmodified)
- `npm test` — 961 tests, 958 pass, 0 fail (3 skips pre-existing)
- `npm run i18n:scan` — green (0 issues, phase gate per 40-VALIDATION.md)
- `git diff 96bc702..HEAD -- server.js` — ONLY the two send-mapping lines; claim block byte-identical
- `node --test test/subject-encode.test.mjs` — 10/10 (Plan 01 suite unaffected)

## Commits

- `572caca` feat(40-02): workspace-bracketed digest subject via notif.digest.subjectWs (EN+FR)
- `8c860d6` feat(40-02): Project Name — Task Name digest lines with server-resolved project
- `80b50df` test(40-02): pin bracketed digest subjects, Project — Task lines, no-leak degrade and SC-5 fallback

## Known Stubs

None — all rendering paths wired and test-pinned; no placeholder data paths.

## Threat Flags

None — no new attack surface beyond the plan's `<threat_model>`; T-40-05..T-40-08 mitigations implemented (subjectWs rides the Plan 01 hardened encodeWord; escapeHtml after interpolation; no-leak pinned by test).

## Self-Check: PASSED

- Files exist: server.js, mailer.js, src/locales/en.json, src/locales/fr.json, test/digest.test.mjs — all FOUND
- Commits 572caca, 8c860d6, 80b50df — all FOUND in git log
