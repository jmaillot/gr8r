---
phase: 38
plan: 01
subsystem: notifications
tags: [digest, reminder-pass, mailer, i18n]
requires: [Phase 36 tFor server i18n frame, Phase 37 two-offset reminder cadence + reminders_sent ledger]
provides:
  - Daily digest send path in runReminderPass (opt-in, scoped, claimed, localized)
  - MAILER.buildDigestMessage / MAILER.sendDigest
  - notif.digest.* catalogue keys EN+FR
  - Additive `digests` field on POST /api/internal/reminder-pass
affects: [38-02 (suppression gate + default inversion collapses the stored-prefs read), Phase 39 audit]
tech-stack:
  added: []
  patterns: [claim-then-send (T-27-03 analog, no updateDoc), authority-join recipients (D-05), one visibility pipeline (D-06), tFor email frame with SC-5 fallback]
key-files:
  created: [test/digest.test.mjs]
  modified: [server.js, mailer.js, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs]
key-decisions:
  - "Digest window is hour >= 9 (catch-up-eligible all day), not the reminder hour === 9 gate — D-01/D-02 'late, never lost, content at send instant' is unimplementable behind the strict gate; reminder loop keeps hour === 9 byte-identical"
  - "Digest opt-in reads the STORED email_digest value (strictly === true) rather than the merged accessor — the pre-38-02 default true would opt out no-row users against Task 1's acceptance; 38-02's default deletion collapses this to getUserNotifPrefs"
  - "due-today/overdue split is disjoint (localDate === due / > due) — the plan's literal '>=' would list overdue tasks in both sections"
requirements-completed: [DIGEST-01, DIGEST-02]
commits: 2
plan_head_before: 1d9fbdd9e7acb2d95e8d8620567781ddf4416df2
plan_head_after: 7371399
actuals:
  tokens: 29000
  tasks: 2
  commits: 2
duration: 11 min
completed: 2026-11-04
status: complete
---

# Phase 38 Plan 01: Daily Digest Send Path Summary

**One-liner:** Opt-in daily digest — one localized 09:00-window email per member listing due-today + overdue tasks with deep links, exactly-once via a `ws:{userId}:digest:{localDate}` ledger claim, proven by a 5-test integration suite on the reminder-pass harness.

## Accomplishments

- Digest loop inside `runReminderPass` (server.js): recipients from the memberships⋈users authority join (D-05), strict stored `email_digest === true` opt-in (D-14 undefined-falsy), task filter copies the reminder loop's SCOPE-04 checks + `remindable()` verbatim (D-06, no second pipeline), disjoint due-today/overdue split on the same string compares, D-03 claim `ws:{userId}:digest:{localDate}` via insert-or-ignore inside `transaction()`, NO notif row / NO revision bump, `MAILER.sendDigest` strictly post-commit fire-and-forget.
- Digest window: fires at the first tick at-or-after 09:00 workspace-local and stays catch-up-eligible (D-01/D-02 — a missed 09:00 delivers late with content computed at the send instant); the reminder loop keeps its strict `hour === 9` gate and its body untouched.
- mailer.js: `buildDigestMessage` sibling of `buildNotifMessage` — tFor `notif.digest.*` frame with SC-5 English-literal fallback, escapeHtml after interpolation, encodeWord subject (accented FR), base64 text+HTML alternative parts, `Auto-Submitted: auto-generated`, deep links `${appUrl}/w/${slug}/task/${key}` with workspace-root fallback; `sendDigest` with SmtpSession try/finally destroy; disabled-MAILER stub added.
- Catalogue: `notif.digest.subject|dueToday|overdue|footer` EN+FR (FR typography lint-clean, U+00A0 before `:`).
- `test/digest.test.mjs`: 5 integration tests on the REMINDER_TEST_TOKEN clock-injection harness with loopback SMTP capture — happy path (subject count var, both sections, deep links, exactly one claim, no inbox row, no revision bump), opt-out (no stored row → nothing), no-double-send (simulated restart, `digests === 0` on replay), D-12 empty-digest honesty, 14:00 catch-up with a rescheduled-to-today task appearing (D-07), idle-tick purity.
- `POST /api/internal/reminder-pass` now returns `{ emitted, digests }` (additive).

## Verification

| Check | Result |
|---|---|
| `node --test test/digest.test.mjs` | 5/5 pass |
| `node --test test/due-reminders.test.mjs` | 17/17 pass UNCHANGED |
| `node --test test/notif-i18n.test.mjs` | 16/16 pass UNCHANGED |
| `node scripts/i18n-scan.mjs` | green (0 unresolved, parity OK) |
| `npm test` | 939 pass, 0 fail |
| `grep -c notif.digest` en/fr.json | 6 ≥ 4 each |

## Deviations from Plan

**1. [Rule 3 - Blocker] Digest window `hour >= 9` instead of riding the `hour === 9` gate**
- **Found during:** Task 1 design
- **Issue:** Plan Task 1 places the digest behind the reminder hour gate, but Task 2 pin 3 (and D-01/D-02: "late 14:00 catch-up... content reflects the 14:00 instant") requires a post-09:00 catch-up delivery — impossible behind `if (hour !== 9) continue`.
- **Fix:** Reminder emission wrapped in `if (hour === 9)` (body byte-identical); digest loop gated `if (hour >= 9)` with exactly-once from the per-day claim.
- **Files:** server.js — **Commit:** f35ca92

**2. [Rule 3 - Blocker] Opt-in reads the STORED prefs value, not the merged accessor**
- **Found during:** Task 1
- **Issue:** `NOTIF_PREF_DEFAULTS` still carries `email_digest: true` (38-02 deletes it), so `getUserNotifPrefs` would merge no-row users to opt-in, contradicting the acceptance criterion "member WITHOUT the stored pref receives no digest".
- **Fix:** Digest gate parses the stored `user_notif_prefs` row directly (strict `=== true`, unparseable → off); commented for 38-02 to collapse into the accessor after its default-layer deletion.
- **Files:** server.js — **Commit:** f35ca92

**3. [Rule 1 - Bug] Plan's due-today predicate `localDate >= t.due` implemented disjointly**
- **Found during:** Task 1
- **Issue:** As written, an overdue task satisfies both `>= due` (due-today) and `> due` (overdue) — duplicate listing.
- **Fix:** `localDate === t.due` → dueToday; `localDate > t.due` → overdue; future-dated tasks excluded.
- **Files:** server.js — **Commit:** f35ca92

**4. [Rule 1 - Bug] npm test: two catalogue pins tripped by the new keys**
- **Found during:** Task 2 full-suite verify
- **Issue:** Catalogue-size pin expected 1671 (got 1675); FR lint flagged a plain space before `:` in `notif.digest.subject`.
- **Fix:** Pin → 1675 with the +4 keys annotated; U+00A0 inserted (D-05).
- **Files:** test/i18n-core-features.test.mjs, src/locales/fr.json — **Commit:** 7371399

**5. [Process] Task 2's digest-suite pins were committed in the Task 1 commit** (written up-front with the tracer slice); the Task 2 commit carries the pin fixes (item 4).

**Total deviations:** 4 auto-fixed (2 blockers, 2 bugs) + 1 process note. **Impact:** none on scope — all plan truths and SC-1/SC-2 send-half criteria verified; server default `email_digest: true` removal deliberately left to 38-02.

## Coverage

- verification: kind tests, ref "test/digest.test.mjs#DIGEST-01 happy path (one localized digest, deep links, one claim, no notif row, no revision bump)", status pass, human_judgment false
- verification: kind tests, ref "test/digest.test.mjs#opt-out (no stored prefs row → no digest)", status pass, human_judgment false
- verification: kind tests, ref "test/digest.test.mjs#SC-2 no-double-send (simulated restart)", status pass, human_judgment false
- verification: kind tests, ref "test/digest.test.mjs#D-12 empty digest honesty", status pass, human_judgment false
- verification: kind tests, ref "test/digest.test.mjs#D-01/D-02 14:00 catch-up with content at send instant", status pass, human_judgment false
- verification: kind tests, ref "test/digest.test.mjs#idle-tick purity before the window", status pass, human_judgment false
- verification: kind tests, ref "test/due-reminders.test.mjs (17/17, reminder loop regression pin)", status pass, human_judgment false
- verification: kind command, ref "node scripts/i18n-scan.mjs (notif.digest.* EN+FR parity)", status pass, human_judgment false
- verification: kind command, ref "npm test (939 pass, 0 fail)", status pass, human_judgment false
- human_judgment: true, rationale "Real SMTP deliverability/rendering in a production mailbox (MIME clients, spam placement) is not provable by the loopback capture — verifier/UAT to classify"

## Threat Mitigations Applied

- T-38-01: digest task filter copies the reminder loop's SCOPE-04 checks + remindable() verbatim per (recipient, task) — one visibility pipeline.
- T-38-02: catalogue renders raw, escapeHtml after interpolation in HTML, encodeWord subject, encodeURIComponent on task keys, Auto-Submitted preserved.
- T-38-03: claim is insert-or-ignore inside transaction(); send strictly post-commit.

## Self-Check: PASSED

- test/digest.test.mjs exists on disk.
- Commits f35ca92, 7371399 present in `git log`.
- All task acceptance criteria re-run and passing (see Verification table).
