---
phase: 38-daily-digest-reminder-suppression
verified: 2026-11-04T12:00:00Z
status: gaps_found
score: 6/7 must-haves verified
covered_files:
  - .planning/phases/38-daily-digest-reminder-suppression/38-01-PLAN.md
  - .planning/phases/38-daily-digest-reminder-suppression/38-02-PLAN.md
  - .planning/phases/38-daily-digest-reminder-suppression/38-01-SUMMARY.md
  - .planning/phases/38-daily-digest-reminder-suppression/38-02-SUMMARY.md
  - server.js
  - mailer.js
  - src/core/notifPrefs.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/digest.test.mjs
covered_digest: "v2:39a3b49db0fa60dc2be0fadcfbfd10c87c44a1469f820249227fb8972dbfe4cd" # computed manually (gsd_run unavailable in this session): sha256 over sorted "path:sha256" lines of covered_files
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "An opted-in member receives ONE localized email listing THEIR due-today and overdue tasks (DIGEST-01: 'lists the recipient's tasks'; 38-01 must-have: filter copies the reminder loop's visibility pipeline — recipient-scoped)"
    status: failed
    reason: |
      CR-01 (38-REVIEW.md) independently confirmed at server.js:1495-1511. The
      digest loop iterates the workspace-wide `tasks` array and filters each
      task by the ASSIGNEE's membership (projectScope(assigneeMembership),
      memberCanReadProject(project, ws.id, t.assignee), and remindable()'s
      canSeeProject(project, task.assignee)). There is NO filter tying the
      task to the recipient (no `t.assignee === r.member_id` / user_id check)
      and NO recipient-visibility check. Consequences:
        1. DIGEST-01 content violation — the digest lists every workspace
           member's due/overdue tasks, not "the recipient's tasks".
        2. Confidentiality leak — a recipient receives titles + deep links
           for tasks in private/scoped projects they cannot read, because the
           scope checks are evaluated against the assignee, never the
           recipient.
      The test suite cannot catch this: every fixture is single-member
      (WR-01), and the planned recipient-scope test was never written.
    artifacts:
      - path: server.js
        issue: "Digest task filter (1495-1511) keys scope on t.assignee's membership; recipient r is never intersected with the task."
      - path: test/digest.test.mjs
        issue: "All fixtures single-member (WR-01) — no multi-member visibility/scope pin exists."
    missing:
      - "Filter digest tasks to the recipient: t.assignee maps to the recipient's member_id (or run the recipient's user_id → membership row and apply projectScope/inScopeProject/memberCanReadProject/canSeeProject against the RECIPIENT)."
      - "Add a multi-member test pin: scoped recipient must NOT receive out-of-scope tasks; non-assignee tasks must not appear in the digest."
      - "Close WR-02 vacuous assertions (test/digest.test.mjs:246,248,279,351) while touching the suite."
---

# Phase 38: Daily Digest & Reminder Suppression — Verification Report

**Phase Goal:** Users can opt into a single daily digest email (09:00 workspace-local) listing tasks due today and overdue, which replaces individual reminder emails when enabled — mentions, assignments and comment emails flow unchanged.
**Verified:** 2026-11-04T12:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Opted-in member receives ONE localized digest at 09:00 workspace-local with due-today + overdue tasks, deep-linked | ⚠️ → ✗ FAILED (content, not delivery) | Delivery path works (test pass #1), but the content is NOT "the recipient's tasks" — see Gap CR-01 below |
| 2 | Empty digest → no email, no ledger claim (D-12) | ✓ VERIFIED | server.js:1513-1514; test "D-12" passes |
| 3 | Idempotent across restarts — one `ws:{userId}:digest:{localDate}` claim, post-commit send | ✓ VERIFIED | server.js:1515-1533 transaction insert-or-ignore; test "SC-2" passes |
| 4 | Catch-up after missed 09:00 delivers late with content at send instant | ✓ VERIFIED | `hour >= 9` gate (server.js:1492); test "D-01/D-02" passes |
| 5 | Digest user loses reminder emails; notif rows + revision intact; push/inbox never suppressed (DIGEST-02) | ✓ VERIFIED | server.js:1247 suppression branch after `=== false` gate; rows appended before fan-out; tests "DIGEST-02", "D-11", "D-08" pass |
| 6 | Mention/assignment/comment emails unchanged for digest users | ✓ VERIFIED | Suppression branch keys on `prefKey === 'email_reminder'` only; test "SC-3" passes |
| 7 | `email_digest` undefined-falsy default; settings toggle + "digest replaces reminder emails" copy EN+FR (DIGEST-03) | ✓ VERIFIED | `email_digest` in whitelist only (server.js:1128, src/core/notifPrefs.js:36 with "NOT defaulted" comment); copy at locales:1245-1246 EN+FR; test "DIGEST-03" passes |

**Score:** 6/7 truths verified (0 present-behavior-unverified)

Note: SC-1 ("listing their due-today and overdue tasks") is the failing truth — delivery mechanics verified, content correctness failed. Truth #1 above records it as FAILED; the codebase-side delivery invariant is proven by the integration suite.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `test/digest.test.mjs` | Integration suite | ✓ VERIFIED (partial coverage) | 10/10 tests pass; but single-member fixtures structurally miss the scope bug (WR-01) and 4 vacuous assertions (WR-02) |
| `server.js` digest loop | runReminderPass digest block | ✓ VERIFIED (with gap) | present, wired, claimed transactionally — but recipient-scope filter wrong (CR-01) |
| `mailer.js` buildDigestMessage/sendDigest | Sibling methods | ✓ VERIFIED | mailer.js:525, 848-852 |
| `src/locales/*.json` notif.digest.* | 4 keys EN+FR | ✓ VERIFIED | en.json/fr.json:1687-1690 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| Digest loop | reminders_sent ledger | transaction insert-or-ignore `ws:{userId}:digest:{localDate}` | ✓ WIRED | server.js:1515-1521 |
| Digest loop | MAILER.sendDigest | post-commit fire-and-forget | ✓ WIRED | server.js:1528-1535 |
| buildDigestMessage | tFor notif.digest.* + deep link | literal keys; `${APP_URL}/w/{slug}/task/{key}` | ✓ WIRED | mailer.js:525+, locales present |
| queueNotifEmails | suppression gate | `prefKey==='email_reminder' && stored email_digest===true` | ✓ WIRED | server.js:1247, distinct branch after `=== false` check |
| Digest task filter | recipient visibility pipeline | assignee-scope checks "copied verbatim" | ✗ MISWIRED | Filter evaluates the ASSIGNEE's scope, never the recipient's — the very link D-06 promised ("recipient sees exactly what the assignee sees" is wrong; the recipient should see only their own visible tasks) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Digest suite (10 pins) | `node --test test/digest.test.mjs` | 10 pass, 0 fail | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| DIGEST-01 | 38-01 | Opt-in 09:00 digest lists THE RECIPIENT'S due-today + overdue tasks, deep-linked, localized; silent when nothing due | ✗ BLOCKED | Delivery + i18n + deep links verified; content filter does not scope to the recipient (CR-01) — a digest of everyone's tasks violates the "recipient's tasks" clause and leaks unseen private/scoped tasks |
| DIGEST-02 | 38-01, 38-02 | Reads tasks directly; transactional claim (idempotent); type-scoped suppression; push/inbox untouched | ✓ SATISFIED | Ledger claim, catch-up window, suppression branch; rows/revision intact; mention/assign/comment verified |
| DIGEST-03 | 38-02 | email_digest removed from default layer (opt-in); settings toggle + copy EN+FR | ✓ SATISFIED | Whitelist-only key, notifPrefs comment, locales:1245-1246 |

No orphaned requirements — REQUIREMENTS.md maps exactly DIGEST-01/02/03 to Phase 38 and every plan claims them.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| server.js | 1495-1511 | Scope checks keyed on assignee, never recipient; no assignee===recipient filter | 🛑 Blocker | Digest content wrong + confidentiality leak (CR-01) |
| test/digest.test.mjs | (all) | Single-member fixtures — suite cannot observe cross-member leakage | ⚠️ Warning | WR-01; the blocker is invisible to CI |
| test/digest.test.mjs | 246,248,279,351 | Vacuous `\|\| true` / tautological assertions | ⚠️ Warning | WR-02; pins assert nothing |

### Human Verification Required

None beyond the gap — no UI/visual/real-time items outstanding. (Settings toggle rendering is covered by the DIGEST-03 test pin.)

### Gaps Summary

One blocking gap, confirmed independently and matching 38-REVIEW.md CR-01: the digest loop reuses the reminder loop's SCOPE-04 checks but keys them on each task's ASSIGNEE, never on the digest recipient. Result: an opted-in member's digest lists every member's due-today and overdue tasks, including tasks in private/scoped projects the recipient cannot read — violating DIGEST-01's "recipient's tasks" clause and D-06's "one visibility pipeline" intent. All delivery, idempotence, suppression, and opt-in mechanics are verified working (10/10 integration pins pass). The fix is scoped to the digest task filter in server.js (filter by recipient membership / assignee===recipient) plus a multi-member test pin (also closes WR-01/WR-02 while in the file).

This looks like a genuine implementation error, not an intentional deviation — no override suggested. Structured gaps in VERIFICATION.md frontmatter for `/gsd-plan-phase --gaps`.

---

_Verified: 2026-11-04T12:00:00Z_
_Verifier: the agent (gsd-verifier)_
