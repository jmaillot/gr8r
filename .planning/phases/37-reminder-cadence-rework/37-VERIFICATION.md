---
phase: 37-reminder-cadence-rework
verified: 2026-11-04T14:34:42Z
status: human_needed
score: 5/5 must-haves verified
covered_files:
  - .planning/REQUIREMENTS.md
  - .planning/phases/37-reminder-cadence-rework/37-01-PLAN.md
  - .planning/phases/37-reminder-cadence-rework/37-01-SUMMARY.md
  - .planning/phases/37-reminder-cadence-rework/37-02-PLAN.md
  - .planning/phases/37-reminder-cadence-rework/37-02-SUMMARY.md
  - CHANGELOG.md
  - server.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/due-reminders.test.mjs
  - test/notif-i18n.test.mjs
covered_digest: "v2:sha256:140663c136501b9721cf599d308ceeb3cc231a628e8ede4e9c1cce12f12e91a1"
behavior_unverified: 0
overrides_applied: 0
gaps: []
re_verification:
  previous_status: passed
  previous_score: 5/5
  gaps_closed: []
  gaps_remaining: []
  regressions: []
  note: "Re-run solely because the previous report's covered_digest did not reconcile; this report and its digest were regenerated fresh from the current codebase. All previously verified truths re-confirmed."
---

# Phase 37: Reminder Cadence Rework Verification Report

**Phase Goal:** Due-date reminders drop to their honest minimum — at most two per task per assignee ("due today" morning-of, "past due" once the following morning) — with the `day_before` offset removed deploy-safely.
**Verified:** 2026-11-04T14:34:42Z
**Status:** human_needed (all automated checks pass; runtime scheduling behavior routed to human verification)
**Re-verification:** Yes — digest-regeneration re-run after the previous report's covered_digest failed to reconcile

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A task reaching its due date produces exactly one "due today" (morning_of) and one "past due" the next morning — nothing else, inbox + email (REM-01, SC-1) | ✓ VERIFIED | `server.js:1404-1407` — offsets array only ever contains `morning_of` (when `localDate >= due`) and `past_due` (when `localDate > due`); `grep day_before\|dayBefore server.js` → 0 matches. Test evidence: `test/due-reminders.test.mjs:273` replay pin asserts exactly 1 morning_of + 1 past_due; email fan-out tests at :420-435 assert 1 email per morning over SMTP sink. |
| 2 | A past-due task never re-fires on later days — exactly one per task per assignee, regression-pinned (REM-03, SC-2) | ✓ VERIFIED | Dedup claim `insert or ignore into reminders_sent` with key `${ws}:${task}:${assignee}:${offset}:${due}` (`server.js:1432-1434`, `:due` component present — D-02 kept). Regression pin `test/due-reminders.test.mjs:273` ("REM-03: multi-morning replay — exactly one morning_of + one past_due, then silence") asserts 0 emissions on at9('2026-01-17')/at9('2026-01-20'); test passes (17/17). |
| 3 | `due_reminder` preference toggles only "due today"; `past_due` preference unchanged; settings copy updated EN+FR (REM-02, SC-3) | ✓ VERIFIED | `server.js:1404-1407` — `prefs.due_reminder !== false` gates only morning_of; `prefs.past_due !== false` gates only past_due; gate tests at test/due-reminders.test.mjs:288-295 pass. Copy: en.json:1249-1250 `"Due-day reminder"` / `"Get a reminder on the morning a task is due."`; fr.json:1249-1250 `"Rappel le jour d’échéance"` / `"Recevez un rappel le matin de l’échéance d’une tâche."`. Plural push_due pair (en.json:1254-1255) untouched as required by Pitfall 3. `npm run i18n:scan` → 0 findings. |
| 4 | Deploy-safe removal: no migration, no sweep; orphaned `day_before` keys go inert; second boot byte-identical (REM-04, SC-4) | ✓ VERIFIED | No schema change: `reminders_sent` DDL at server.js:298-303 unchanged; no migration/sweep code anywhere (grep `day_before` → 0 in server.js and locales). Orphaned rows inert: they simply never match a produced key again; legacy inbox rows with key `notif.reminder.dayBefore` still render via stored snippet — pinned in test/notif-i18n.test.mjs (exactly 1 `notif.reminder.dayBefore` reference = the inline legacy fixture; suite green 16/16). Second-boot byte-identity: dedup claim INSERT OR IGNORE unchanged; catch-up predicate `localDate >= due` unchanged (D-01). |
| 5 | Release notes document the one-time "due today" catch-up burst at first deploy (SC-5) | ✓ VERIFIED | CHANGELOG.md:31-36 — entry under Unreleased documents the two-reminder cadence, "the day-before reminder is removed", and the explicit **One-time catch-up burst at first deploy** paragraph (framed as designed behavior), plus inert-legacy-rows guarantee. |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `server.js` | two-offset producer, day_before deleted | ✓ VERIFIED | Offsets block :1404-1407, key ternary :1419, dedup claim :1432-1441 all match plan; no day_before refs |
| `src/locales/en.json` | dayBefore entry deleted; singular pair reworded | ✓ VERIFIED | `notif.reminder.dayBefore` gone; :1249-1250 new copy; plural pair :1254-1255 intact |
| `src/locales/fr.json` | dayBefore entry deleted; singular pair reworded | ✓ VERIFIED | Same — FR copy at :1249-1250 |
| `test/due-reminders.test.mjs` | day_before pins rewritten; D-06 replay pin added | ✓ VERIFIED | 0 day_before refs; REM-03 replay pin at :271-277; 17/17 pass |
| `test/notif-i18n.test.mjs` | emission pin keyed on morningOf; legacy dayBefore fixture kept | ✓ VERIFIED | Exactly 1 `notif.reminder.dayBefore` ref (legacy fixture); 16/16 pass |
| `CHANGELOG.md` | SC-5 release note | ✓ VERIFIED | Unreleased → Changed entry with catch-up burst paragraph |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| server.js runReminderPass | reminders_sent dedup claim | `${ws}:${task}:${assignee}:${offset}:${due}` key, INSERT OR IGNORE | ✓ WIRED | server.js:1432-1434 — `:due` component present (D-02) |
| server.js key ternary | notif.reminder.morningOf / pastDue | `notif.reminder.${offset === 'morning_of' ? 'morningOf' : 'pastDue'}` | ✓ WIRED | server.js:1419; both keys present in en.json + fr.json; i18n:scan 0 unresolved |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| runReminderPass notif rows | title/assignee/due | live task docs + workspace clock | Yes | ✓ FLOWING |
| Settings toggle copy | t('settings.notif.dueReminder') | locale JSON catalogue | Yes (static copy — intended) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| day_before fully deleted from source | `grep -nE "day_before\|dayBefore" server.js src/locales/*.json` | exit 1 (0 matches) | ✓ PASS |
| due-reminders suite | `node --test test/due-reminders.test.mjs` | 17 pass / 0 fail (incl. REM-03 replay pin) | ✓ PASS |
| i18n notif suite (legacy-row fallback pin) | `node --test test/notif-i18n.test.mjs` | 16 pass / 0 fail | ✓ PASS |
| i18n parity gate | `npm run i18n:scan` | 0 literals, 0 pending, 0 unresolved, 0 parity | ✓ PASS |
| Catalogue-size / plural-pair pins | covered by full suite per SUMMARIES (930 pass / 0 fail / 3 skips, both plans) | recorded claim, consistent with subset runs run here | ✓ PASS (subset re-run; full-suite claim accepted from SUMMARY commit trail) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or conventional for this phase — SKIPPED (none exist; test files serve as the behavioral probes and were executed above).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| REM-01 | 37-01 | At most two due-date notifications per task per assignee; day-before gone on all channels | ✓ SATISFIED | server.js offsets (:1404-1407); replay + email fan-out tests green |
| REM-02 | 37-02 | `due_reminder` governs due-today only; copy updated EN+FR; key/toggle unchanged | ✓ SATISFIED | server.js:1404-1405 gating; en/fr.json:1249-1250 new copy; i18n gates green |
| REM-03 | 37-01 | Past-due never re-fires; regression pin | ✓ SATISFIED | Dedup claim exactly-once; D-06 replay pin passing |
| REM-04 | 37-01, 37-02 | Deploy-safe: no migration/sweep; orphaned rows inert; release notes announce catch-up burst | ✓ SATISFIED | No schema change; legacy-row snippet-fallback pin; CHANGELOG.md:31-36 burst paragraph |

No orphaned requirements — REQUIREMENTS.md maps exactly REM-01…REM-04 to Phase 37, all claimed across the two plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| src/locales/en.json | 1255 | `"One day before a task is due."` (plural push_due copy) | ℹ️ Info | Pre-existing copy for a *different* preference (`settings.notif.dueDesc`, push_due row) that Phase 37's plan explicitly prohibits touching (Pitfall 3); the day_before *reminder* itself is gone. Not a cadence leak. |
| (all phase files) | — | TBD/FIXME/XXX markers | — | None found (grep exit 1) |

### Human Verification Required

### 1. Live scheduling cadence end-to-end (real clock)

**Test:** On a running instance with a real workspace, set a task due today; wait for the 09:00 scheduled pass (or the boot catch-up). Confirm the assignee's inbox and email each receive exactly one "Due today" notification, then one "Past due" the next morning, and nothing on subsequent days.
**Expected:** Exactly 2 notifications total per task per assignee across the task's lifetime (per due-date value).
**Why human:** The scheduler's real-time trigger (cron/interval boot path) and email delivery are exercised by clock-injected integration tests, not the live scheduling loop; real-time behavior and external email delivery cannot be verified programmatically here.

### 2. Settings page rendering of the new copy

**Test:** Open Settings → notifications in EN and FR; check the due-reminder toggle label/description, and that the inbox filter label shows "Due-day reminder" (shared-label collateral).
**Expected:** EN "Due-day reminder" / "Get a reminder on the morning a task is due."; FR "Rappel le jour d’échéance" / "Recevez un rappel le matin de l’échéance d’une tâche."; toggle still functional.
**Why human:** Visual rendering and toggle interaction are UI-behavior checks.

## Gaps Summary

No gaps. All five roadmap success criteria are verified against actual codebase evidence: the `day_before` offset is deleted outright from producer, snippet, key ternary and both locale catalogues (grep-verified zero references); the dedup key retains its `:${due}` component; the two-offset producer gates match the preferences exactly; the REM-03 multi-morning replay pin and the legacy-row inert-fallback pin both pass; the CHANGELOG documents the one-time catch-up burst. One plan-02 acceptance criterion (zero "day before" matches in en.json) was unachievable as written — the residual match is the push_due plural pair the same plan forbids touching; documented as Info, not a gap.

Status is `human_needed` only because live-clock scheduling and rendered-UI behavior (2 items above) require human observation; nothing blocks.

---

_Verified: 2026-11-04T14:34:42Z_
_Verifier: the agent (gsd-verifier)_
