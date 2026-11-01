---
phase: 27-due-date-reminder-scheduler
verified: 2026-11-01T13:20:00Z
status: gaps_found
score: 10/11 must-haves verified
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
covered_digest: "v2:sha256:3da8f326c647936b43c1e48239002c585e5a7631185830946e526fada55a9ee1"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Reminder rows delivered to assignees render correctly in the inbox — the server row shape matches the client notif contract (`at` timestamp + `read` flag) and selecting a reminder whose task was deleted does not crash the inbox preview"
    status: failed
    reason: "CR-01: runReminderPass emits rows with `ts` (no `at`, no `read`) — inbox sort `b.at - a.at` yields NaN, `ago(n.at)` renders a blank timestamp, and rows stay unread forever (src/pages/inbox.js:23,81; server.js:972-980). CR-02: inboxPreview throws TypeError on `p.id` when a reminder's task was deleted (src/pages/inbox.js:86-90). Server rows are correct for dedup/prefs/email purposes; the client delivery of those rows is broken. Both findings are OPEN in 27-REVIEW-DISPOSITION.md."
    artifacts:
      - path: server.js
        issue: "Reminder row shape uses `ts`, missing `at` and `read: false` required by the client contract (server.js:972-980)"
      - path: src/pages/inbox.js
        issue: "inboxPreview crashes on reminder rows whose task no longer exists (inbox.js:86-90)"
    missing:
      - "Emit reminder rows with `at: at.getTime()` and `read: false` (keep `ts` for test assertions); extend a due-reminders test to assert the doc row carries `at` (number) and `read === false`"
      - "Guard inboxPreview's `!tk` branch against null/undefined project and empty `n.text` (fallback to `t('notif.'+n.type)` / `n.snippet`); guard the project button on `p`"
---

# Phase 27: Due-Date Reminder Scheduler Verification Report

**Phase Goal:** Assignees hear about approaching due dates from the server itself — exactly once per offset per due date, honoring prefs, restart-safe, without disturbing active clients.
**Verified:** 2026-11-01T13:20:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

The scheduler engine is real, correct, and fully tested server-side: the pass exists, the dedup ledger is transactional, idle ticks are provably pure reads, prefs gates work end-to-end, and 15 dedicated tests plus the 648-test suite are green. What fails is the **last inch of delivery**: the two open CRITICAL review findings (CR-01, CR-02) mean the in-app reminder rows an assignee actually sees are mis-rendered (blank timestamp, broken sort, permanent unread) and selecting one whose task was deleted crashes the inbox. The server "hears" nothing wrong; the assignee's client experience of the reminder is compromised.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | day_before + morning_of rows generated at 09:00 workspace-local tz (D-27-1) | ✓ VERIFIED | server.js:946-968 (hour gate `hour !== 9` at :955 precedes all writes; windows at :966-968); TZ_BY_LABEL/localParts (:885-894, UTC fallback); DST test `REM-02: Pacific label maps through DST` in test/due-reminders.test.mjs:302 |
| 2 | Overdue task → exactly one past_due nudge, never repeating | ✓ VERIFIED | server.js:970 (`localDate > due` window) + dedup key carrying due date; past-due exactly-once test green |
| 3 | Run twice / restart → exactly one row per (task, assignee, offset, due) | ✓ VERIFIED | transaction() INSERT OR IGNORE claim (server.js:983-992) before updateDoc append; boot catch-up + window-open predicates (server.js:3651-3656); restart/dedup/re-arm tests green |
| 4 | Off-hour tick writes nothing, revision unchanged | ✓ VERIFIED | `if (hour !== 9) continue` at server.js:955 before any write; test `REM-01: a run outside the 09:00 hour writes nothing — revision unchanged` (test:112-117) asserts revision via real SQLite |
| 5 | done/archived/project-archived tasks never reminded | ✓ VERIFIED | remindable() server.js:927-932; gating matrix tests green |
| 6 | SMTP on → email queued post-commit, gated by email_reminder, deep link APP_URL/w/:slug/task/:key | ✓ VERIFIED | NOTIF_EMAIL_KIND entries due_reminder/past_due → 'email_reminder' (server.js:812-813); `by: null` bypasses self-skip (server.js:848); fan-out strictly post-commit (server.js:995-1000); email gate + exact deep-link test captured through real minimal SMTP sink |
| 7 | Three Settings toggles, ON by default, persisted via existing notifPrefs path | ✓ VERIFIED | settings.js:374-384 (srow/tog 'np' rows); server.js:507-509 (normalize merge) + 1263-1265 (emptyDoc seeds) |
| 8 | Legacy workspaces with pre-phase notifPrefs behave all-ON | ✓ VERIFIED | normalizeDoc on-read merge overrides only ABSENT keys (server.js:507-511 region); test "legacy doc reads all-ON through docForClient AND still reminds through the real pass" |
| 9 | Inbox filter list and notification text render due_reminder/past_due in EN+FR | ✓ VERIFIED | chips inbox.js:16-17; notifText reminder guard before generic `!n.by` branch (inbox.js:59-60); 8 catalogue-key hits across en.json/fr.json |
| 10 | Default notifPrefs for new workspaces include the three keys as true | ✓ VERIFIED | server.js:1263-1265; bootstrap test green |
| 11 | Reminder rows are delivered in the client's row contract (`at` + `read`) and the inbox preview survives deleted-task reminders | ✗ FAILED | **CR-01 + CR-02 (open per 27-REVIEW-DISPOSITION.md)** — server.js:972-980 emits `ts` without `at`/`read`; inbox.js:23 sort → NaN, inbox.js:81 `ago(undefined)` → blank timestamp, unread forever; inbox.js:86-90 inboxPreview TypeError on deleted task |

**Score:** 10/11 truths verified (0 present, behavior-unverified)

Note on truth 1/SC-1's "delivered" dimension: rows ARE generated and pushed to clients, but their in-client rendering is compromised (truth 11, FAILED). Truth 1 is verified as stated (row generation); the delivery defect is carried by truth 11 and the gap below.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `reminders_sent` table + index (server.js SCHEMA) | create-if-not-exists dedup ledger | ✓ VERIFIED | server.js:215-220, additive DDL |
| `localParts(tzLabel, date)` + TZ_BY_LABEL | pure tz helper, UTC fallback | ✓ VERIFIED | server.js:885-894; UTC fallback for unknown/empty labels; DST-tested |
| `runReminderPass()` + boot call + 60s unref'd try/catch interval | injectable-clock scheduler wired in main() | ✓ VERIFIED | server.js:946, 3656-3663; `{ now }` injection; boot pass + wrapped interval |
| `test/due-reminders.test.mjs` | REM-01..REM-05 coverage | ✓ VERIFIED | 15/15 green; revision assert, dedup/restart/re-arm, DST, email sink, prefs gates |
| notifPrefs defaults + normalize-on-read | three keys ON, legacy merge | ✓ VERIFIED | server.js:507-509, 1263-1265 |
| 3 srow/tog rows in settings.js | existing pattern | ✓ VERIFIED | settings.js:374-384 |
| inbox.js chips + i18n keys EN+FR | filterable, no raw keys | ✓ VERIFIED | inbox.js:16-17, 59-60; 8 locale hits |
| Client contract on emitted rows (`at`+`read`) | inbox renders rows correctly | ✗ FAILED | CR-01 — see gap |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| runReminderPass | notif append + ledger | transaction() claim INSERT OR IGNORE then updateDoc | ✓ WIRED | server.js:983-992; commit-or-neither; `r.changes === 0` skips |
| runReminderPass | queueNotifEmails | post-commit fan-out, NOTIF_EMAIL_KIND map | ✓ WIRED | server.js:812-813, 995-1000; `by: null` self-skip handled at :848 |
| runReminderPass | workspace tz | member profile tz (first membership), UTC fallback | ✓ WIRED | workspaceTzLabel server.js:920-921; A1 documented in SUMMARY |
| Settings toggles | notifPrefs PUT → scheduler prefs read | existing tog('…','np') save path | ✓ WIRED | settings.js:374-384; toggle-off tests drive the real pass |
| Scheduler rows | inbox rendering | `n.type` → notifText + chips | ⚠️ PARTIAL | Type/chips/copy wired (inbox.js:16-17,59-60) but row FIELD contract broken (`at`/`read` missing — CR-01) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| runReminderPass rows | tasks/due/assignee/prefs | parsed workspace doc (SQLite) | Yes | ✓ FLOWING |
| Settings toggles | np.email_reminder/due_reminder/past_due | workspace doc notifPrefs via existing PUT | Yes | ✓ FLOWING |
| Inbox reminder row timestamp | `n.at` | scheduler emits `ts` instead | No — field mismatch | ✗ DISCONNECTED (CR-01) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Reminder suite | `node --test test/due-reminders.test.mjs` | 15 pass, 0 fail | ✓ PASS |
| Full suite | `npm test` | 648 pass, 0 fail | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| — | none declared in PLANs (no scripts/*/tests/probe-*.sh for this phase) | — | N/A |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| REM-01 | 27-01 | In-process pass, notification rows + optional email, restart-safe, no idle revision bumps | ✓ SATISFIED | server.js:946-1004, 3651-3663; revision-unchanged test; boot catch-up |
| REM-02 | 27-01, 27-02 | day_before + morning_of, pref-selectable, ON by default, workspace-shared tz | ✓ SATISFIED | server.js:966-968; settings toggles; TZ_BY_LABEL; DST test |
| REM-03 | 27-01 | Exactly one per (task, assignee, offset, due), transactional, re-arm on due-date change | ✓ SATISFIED | server.js:983-992; key carries due date; dedup/restart tests |
| REM-04 | 27-01 | done/archived never reminded; exactly one past_due nudge | ✓ SATISFIED | remindable() server.js:927-932; past-due exactly-once test |
| REM-05 | 27-01, 27-02 | email_reminder gate + task deep link, same prefs surface | ✓ SATISFIED | server.js:812-813, 848, 995-1000; SMTP-sink deep-link test; email_reminder toggle |

No orphaned requirements — REQUIREMENTS.md maps exactly REM-01..REM-05 to Phase 27 and all five are claimed by plans and evidenced.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| server.js | 972-980 | Client contract break: `ts` without `at`/`read` (CR-01, open) | 🛑 Blocker | Reminder rows render blank-timestamped, mis-sorted, permanently unread |
| src/pages/inbox.js | 86-90 | TypeError on deleted-task reminder preview (CR-02, open) | 🛑 Blocker | Whole inbox render crashes on a reachable path |
| server.js | 2102 | `===` token comparison, not timing-safe (WR-01) | ⚠️ Warning | Test-only route; low real risk, still open |
| server.js | 927-932 | Assignee-less due-dated tasks → `to: null` rows + phantom revision bumps (WR-02) | ⚠️ Warning | One phantom revision bump per offset; gating error invisible |
| server.js | 3656 | Boot pass uncaught (IN-01) | ℹ️ Info | Pre-loop failure would crash startup |
| server.js | 848 | Hardcoded EN 'Reminders' byline (IN-02) | ℹ️ Info | FR users see EN byline in emails |
| server.js | 215-220 | Ledger grows unbounded (IN-03) | ℹ️ Info | Tiny rows; sweep candidate |

No TBD/FIXME/XXX debt markers in any phase-touched file.

### Human Verification Required

### 1. Reminder delivery end-to-end on a live workspace (post-fix)

**Test:** Once CR-01/CR-02 are fixed, set a task due tomorrow and one due today for a real assignee, force a 09:00-local pass (or wait), then open the inbox as the assignee.
**Expected:** Reminder rows show a correct relative timestamp, correct sort position, unread state that clears via mark-read, and selecting a reminder whose task was deleted shows a graceful fallback instead of a blank/crashed preview.
**Why human:** Visual rendering, sort feel, and crash-free interaction on the real client are not observable by grep or the server-side test harness.

### 2. Toggles in the running Settings UI

**Test:** Toggle email_reminder / due_reminder / past_due off in Settings → notifications, reload, verify persistence.
**Expected:** Values round-trip and suppressions are visible in the next reminder pass.
**Why human:** The tog widget's actual DOM/save behavior in the browser isn't covered by a client-side test (server round-trip is tested).

### Gaps Summary

One gap, one root cause family: the server↔client notification contract for reminder rows. The scheduler engine (windows, dedup, restart-safety, prefs, email, revision purity — REM-01..REM-05) is verified in code and by 15 passing dedicated tests inside a 648-green suite. But because CR-01 emits rows in a shape the inbox can't read (`ts` vs `at`, no `read`) and CR-02 leaves a reachable crash in inboxPreview, the assignee-facing delivery of reminders — the "assignees hear about it" half of the phase goal — is not reliably achieved. Both findings are OPEN in 27-REVIEW-DISPOSITION.md and the fixes are small and precisely specified in 27-REVIEW.md. Warnings WR-01/WR-02 and infos IN-01..03 are non-blocking and can ride the same closure plan or later cleanup.

Structured in frontmatter `gaps:` for `/gsd-plan-phase --gaps`.

---

_Verified: 2026-11-01T13:20:00Z_
_Verifier: the agent (gsd-verifier)_
