---
phase: 27-due-date-reminder-scheduler
verified: 2026-11-01T14:30:00Z
status: passed
score: 11/11 must-haves verified
covered_files:
  - .planning/phases/27-due-date-reminder-scheduler/27-01-PLAN.md
  - .planning/phases/27-due-date-reminder-scheduler/27-02-PLAN.md
  - .planning/phases/27-due-date-reminder-scheduler/27-01-SUMMARY.md
  - .planning/phases/27-due-date-reminder-scheduler/27-02-SUMMARY.md
  - server.js
  - src/pages/inbox.js
  - src/pages/settings.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/due-reminders.test.mjs
  - test/i18n-core-features.test.mjs
covered_digest: "v2:sha256:a9019a0929fe78b7dad8204d8be0c52e1f8560c413becc1910c3a2f79c262ad7"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 10/11
  gaps_closed:
    - "Reminder rows are delivered in the client's row contract (`at` + `read`) and the inbox preview survives deleted-task reminders"
  gaps_remaining: []
  regressions: []
gaps: []
---

# Phase 27: Due-Date Reminder Scheduler Verification Report

**Phase Goal:** Assignees hear about approaching due dates from the server itself — exactly once per offset per due date, honoring prefs, restart-safe, without disturbing active clients.
**Verified:** 2026-11-01T14:30:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (commit 8402e18)

## Goal Achievement

Both blocking criticals from the initial verification (CR-01, CR-02) are fixed in commit 8402e18 and the fix is verified in the actual code, not just narrated. The server now emits reminder rows in the client's notif contract (`at` epoch-ms number + `read: false`, with `ts` retained for legacy test assertions), and a new contract-drift test (test/due-reminders.test.mjs, now 16 tests) asserts the contract on both emitted rows and doc-persisted rows. The inbox preview guards the deleted-task path: the `!tk` branch falls back to a locale catalogue title (`notif.<type>` camelCased → `notif.dueReminder`/`notif.pastDue`, both present in en.json:1632-1633 and fr.json:1632-1633) and only renders the project button when the project resolves; the normal branch renders the project dot/name only when `p` exists. Reminder suite is 16/16 green and the full suite is 649/649 green (up from 648 with the new test). 27-REVIEW-DISPOSITION.md marks both CR-01 and CR-02 `fixed @ 8402e18`.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | day_before + morning_of rows generated at 09:00 workspace-local tz (D-27-1) | ✓ VERIFIED | server.js:946-968 (hour gate `hour !== 9` precedes all writes; windows at :966-968); TZ_BY_LABEL/localParts; DST test green (regression-checked — quick re-run in suite) |
| 2 | Overdue task → exactly one past_due nudge, never repeating | ✓ VERIFIED | server.js:970 window + dedup key carrying due date; past-due exactly-once test green (regression) |
| 3 | Run twice / restart → exactly one row per (task, assignee, offset, due) | ✓ VERIFIED | transaction() INSERT OR IGNORE claim (server.js:983-992); dedup/restart/re-arm tests green (regression) |
| 4 | Off-hour tick writes nothing, revision unchanged | ✓ VERIFIED | `if (hour !== 9) continue` before any write; revision-unchanged test green (regression) |
| 5 | done/archived/project-archived tasks never reminded | ✓ VERIFIED | remindable() server.js:927-932; gating matrix tests green (regression) |
| 6 | SMTP on → email queued post-commit, gated by email_reminder, deep link APP_URL/w/:slug/task/:key | ✓ VERIFIED | NOTIF_EMAIL_KIND map, `by: null` self-skip bypass, post-commit fan-out; SMTP-sink test green (regression) |
| 7 | Three Settings toggles, ON by default, persisted via existing notifPrefs path | ✓ VERIFIED | settings.js:374-384; server.js normalize merge + emptyDoc seeds (regression) |
| 8 | Legacy workspaces with pre-phase notifPrefs behave all-ON | ✓ VERIFIED | normalize-on-read merge of absent keys; legacy-doc test green (regression) |
| 9 | Inbox filter list and notification text render due_reminder/past_due in EN+FR | ✓ VERIFIED | chips + notifText guard (inbox.js:16-17,59-60); 8 locale hits incl. `notif.dueReminder`/`notif.pastDue` en.json:1632-1633, fr.json:1632-1633 (regression) |
| 10 | Default notifPrefs for new workspaces include the three keys as true | ✓ VERIFIED | server.js:1263-1265; bootstrap test green (regression) |
| 11 | Reminder rows are delivered in the client's row contract (`at` + `read`) and the inbox preview survives deleted-task reminders | ✓ VERIFIED | **FIXED @ 8402e18.** CR-01: server.js runReminderPass now emits `at: at.getTime()` and `read: false` alongside `ts` (~:979-983) — matches the store.js notifyMembers contract that inbox.js:23 (`b.at - a.at` sort), :81 (`ago(n.at)`) and :24/:26 (`!n.read`) read. New contract-drift test `CR-01: emitted rows match the client notif contract (at + read)` asserts `typeof n.at === 'number'`, valid epoch, `read === false` on emitted rows AND on doc-persisted rows via notifRows(). CR-02: inbox.js inboxPreview `!tk` branch now guards `p` (`${p ? ... : ''}` on the project button) and falls back `n.text \|\| t('notif.'+camelType) \|\| n.type`; the task-open branch renders project dot/name only when `p` exists — the `p.id`/`p.name` TypeError on a deleted task/project is no longer reachable. |

**Score:** 11/11 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `reminders_sent` table + index (server.js SCHEMA) | create-if-not-exists dedup ledger | ✓ VERIFIED | additive DDL (regression) |
| `localParts(tzLabel, date)` + TZ_BY_LABEL | pure tz helper, UTC fallback | ✓ VERIFIED | DST-tested (regression) |
| `runReminderPass()` + boot call + 60s unref'd try/catch interval | injectable-clock scheduler wired in main() | ✓ VERIFIED | `{ now }` injection; boot pass + wrapped interval (regression) |
| `test/due-reminders.test.mjs` | REM-01..REM-05 coverage | ✓ VERIFIED | **16/16 green** (was 15; new CR-01 contract-drift test) |
| notifPrefs defaults + normalize-on-read | three keys ON, legacy merge | ✓ VERIFIED | (regression) |
| 3 srow/tog rows in settings.js | existing pattern | ✓ VERIFIED | (regression) |
| inbox.js chips + i18n keys EN+FR | filterable, no raw keys | ✓ VERIFIED | (regression) |
| Client contract on emitted rows (`at`+`read`) | inbox renders rows correctly | ✓ VERIFIED | FIXED — `at`+`read` emitted and contract-drift-tested |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| runReminderPass | notif append + ledger | transaction() claim INSERT OR IGNORE then updateDoc | ✓ WIRED | commit-or-neither; `r.changes === 0` skips (regression) |
| runReminderPass | queueNotifEmails | post-commit fan-out, NOTIF_EMAIL_KIND map | ✓ WIRED | `by: null` self-skip handled (regression) |
| runReminderPass | workspace tz | member profile tz, UTC fallback | ✓ WIRED | (regression) |
| Settings toggles | notifPrefs PUT → scheduler prefs read | existing tog('…','np') save path | ✓ WIRED | toggle-off tests drive the real pass (regression) |
| Scheduler rows | inbox rendering | row fields `at`+`read`+`type` → sort/ago/unread + notifText + chips | ✓ WIRED | **FIXED** — emitted fields now exactly match the inbox's reads (inbox.js:23,24,26,81); contract-drift test locks the shape |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| runReminderPass rows | tasks/due/assignee/prefs | parsed workspace doc (SQLite) | Yes | ✓ FLOWING |
| Settings toggles | np.email_reminder/due_reminder/past_due | workspace doc notifPrefs via existing PUT | Yes | ✓ FLOWING |
| Inbox reminder row timestamp | `n.at` | scheduler emits `at: at.getTime()` | Yes — contract-drift test asserts numeric epoch on emitted and persisted rows | ✓ FLOWING (was DISCONNECTED) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Reminder suite incl. new CR-01 contract test | `node --test test/due-reminders.test.mjs` | 16 pass, 0 fail | ✓ PASS |
| Full suite | `npm test` | 649 pass, 0 fail | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| — | none declared in PLANs (no scripts/*/tests/probe-*.sh for this phase) | — | N/A |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| REM-01 | 27-01 | In-process pass, notification rows + optional email, restart-safe, no idle revision bumps | ✓ SATISFIED | server.js runReminderPass + boot wiring; revision-unchanged test |
| REM-02 | 27-01, 27-02 | day_before + morning_of, pref-selectable, ON by default, workspace-shared tz | ✓ SATISFIED | windows; settings toggles; DST test |
| REM-03 | 27-01 | Exactly one per (task, assignee, offset, due), transactional, re-arm on due-date change | ✓ SATISFIED | transactional claim; dedup/restart tests |
| REM-04 | 27-01 | done/archived never reminded; exactly one past_due nudge | ✓ SATISFIED | remindable() gating; past-due exactly-once test |
| REM-05 | 27-01, 27-02 | email_reminder gate + task deep link, same prefs surface | ✓ SATISFIED | NOTIF_EMAIL_KIND; SMTP-sink deep-link test |

No orphaned requirements — REQUIREMENTS.md maps exactly REM-01..REM-05 to Phase 27, all claimed and evidenced.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| server.js | ~2102 | `===` token comparison, not timing-safe (WR-01, open) | ⚠️ Warning | Test-only route; low real risk |
| server.js | 927-932 | Assignee-less due-dated tasks → `to: null` rows + phantom revision bumps (WR-02, open) | ⚠️ Warning | One phantom revision bump per offset |
| server.js | ~3656 | Boot pass uncaught (IN-01) | ℹ️ Info | Pre-loop failure would crash startup |
| server.js | ~848 | Hardcoded EN 'Reminders' byline (IN-02) | ℹ️ Info | FR users see EN byline in emails |
| server.js | 215-220 | Ledger grows unbounded (IN-03) | ℹ️ Info | Tiny rows; sweep candidate |

No TBD/FIXME/XXX debt markers in any phase-touched file. The two 🛑 Blockers from the initial report are RESOLVED (CR-01/CR-02 fixed @ 8402e18 per 27-REVIEW-DISPOSITION.md, verified in code and by the new contract test). Remaining warnings/infos are non-blocking and unchanged since the prior report.

### Human Verification Required (post-ship UAT, non-blocking)

### 1. Reminder delivery end-to-end on a live workspace

**Test:** Set a task due tomorrow and one due today for a real assignee, force a 09:00-local pass (or wait), then open the inbox as the assignee. Also select a reminder whose task was deleted.
**Expected:** Correct relative timestamps and sort order; unread state clears via mark-read; deleted-task reminder shows the graceful fallback title (`notif.dueReminder`/`notif.pastDue`) with no crash and no project button when the project is gone.
**Why human:** Visual rendering and crash-free interaction on the real client are not observable by the server-side test harness. (CR-02's guard is verified in code; this is confirmation UX.)

### 2. Toggles in the running Settings UI

**Test:** Toggle email_reminder / due_reminder / past_due off in Settings → notifications, reload, verify persistence.
**Expected:** Values round-trip and suppressions are visible in the next reminder pass.
**Why human:** The tog widget's browser DOM behavior isn't covered by a client-side test (server round-trip is).

### Gaps Summary

None. The single gap from the initial verification — the server↔client notification row contract (CR-01) and the inboxPreview deleted-task crash (CR-02) — is closed in commit 8402e18: server rows now carry `at`+`read` (locked by a new contract-drift test, 16/16 green), inboxPreview guards both the deleted-task fallback path and null-project rendering, and the fallback catalogue keys exist in both locales. Full suite 649/649 green. All eleven must-have truths verified; REM-01..REM-05 satisfied. Phase goal achieved.

---

_Verified: 2026-11-01T14:30:00Z_
_Verifier: the agent (gsd-verifier)_
