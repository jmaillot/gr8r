---
phase: 37-reminder-cadence-rework
verified: 2026-11-04T16:20:00Z
status: human_needed
score: 5/5 must-haves verified
covered_files:
  - .planning/REQUIREMENTS.md
  - .planning/phases/37-reminder-cadence-rework/37-01-PLAN.md
  - .planning/phases/37-reminder-cadence-rework/37-01-SUMMARY.md
  - .planning/phases/37-reminder-cadence-rework/37-02-PLAN.md
  - .planning/phases/37-reminder-cadence-rework/37-02-SUMMARY.md
  - .planning/phases/37-reminder-cadence-rework/37-03-PLAN.md
  - .planning/phases/37-reminder-cadence-rework/37-03-SUMMARY.md
  - server.js
  - src/pages/settings.js
  - src/core/notifPrefs.js
  - src/locales/en.json
  - src/locales/fr.json
  - CHANGELOG.md
  - test/due-reminders.test.mjs
  - test/notif-i18n.test.mjs
  - test/i18n-core-features.test.mjs
  - test/i18n-pages.test.mjs
  - test/notif-prefs.test.mjs
  - test/notif-hydration.test.mjs
  - test/local-prefs.test.mjs
  - test/migration.test.mjs
  - test/helpers/legacy-fixture.mjs
covered_digest: "v2:sha256:4a803c84fa03054a6d278e5d0095b6c6e2754b62771ff9998b5fa47bb03a7391"
behavior_unverified: 0
overrides_applied: 0
gaps: []
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  gaps_closed:
    - "G-37-2: legacy push_due settings row + i18n keys removed from both locales; push_due retired from server (16-key whitelist / 12-key defaults) and client (12-key defaults) whitelists; retired-key PUT rejected 400 unknownPrefKey; dist rebuilt with zero stale strings; catalogue pin 1673 → 1671"
  gaps_remaining: []
  regressions: []
  note: "The prior report carried no explicit gaps: [] entry because plan 37-03 (gap closure for G-37-2) executed after that verification ran over plans 01–02 only. This re-verification covers all three plans, independently re-confirmed G-37-2 closure in the codebase, and re-ran the full gates: no regression of the plans 01/02 fixes (G-37-1/G-37-3 equivalents — two-offset producer, dedup `:due` key, day_before deletion, legacy-row inert pin) was found."
---

# Phase 37: Reminder Cadence Rework Verification Report

**Phase Goal:** Due-date reminders drop to their honest minimum — at most two per task per assignee ("due today" morning-of, "past due" once the following morning) — with the `day_before` offset removed deploy-safely.
**Verified:** 2026-11-04T16:20:00Z
**Status:** human_needed (all automated checks pass; live-clock scheduling and rendered-UI behavior routed to human verification)
**Re-verification:** Yes — after gap closure G-37-2 (plan 37-03, commits 0162837 / 43dff9f / 6e79784)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A task reaching its due date produces exactly one "due today" (morning_of) and one "past due" the next morning — nothing else, inbox + email (REM-01, SC-1) | ✓ VERIFIED | `server.js:1404-1407` — offsets array contains only `morning_of` (when `localDate >= due`) and `past_due` (when `localDate > due`); `grep -rnE "day_before\|dayBefore" server.js src/` → only a historical comment + the legacy-fixture pin in test/notif-i18n.test.mjs (no producer/catalogue/whitelist references). `test/due-reminders.test.mjs:273` replay pin (exactly 1 morning_of + 1 past_due, then silence) passes. |
| 2 | A past-due task never re-fires on later days — exactly one per task per assignee, regression-pinned (REM-03, SC-2) | ✓ VERIFIED | Dedup claim `insert or ignore into reminders_sent` with key `${ws}:${task}:${assignee}:${offset}:${due}` (`server.js:1432-1434`, `:due` component present — D-02 kept, not regressed by 43dff9f/6e79784). REM-03 multi-morning replay pin passes in the re-run (130/130 across the 8 targeted suites; 17/17 in due-reminders). |
| 3 | `due_reminder` preference toggles only "due today"; `past_due` preference unchanged; settings copy updated EN+FR (REM-02, SC-3) | ✓ VERIFIED | `server.js:1404-1407` — `prefs.due_reminder !== false` gates only morning_of; `prefs.past_due !== false` gates only past_due. Copy: en.json/fr.json `"Due-day reminder"` / `"Rappel le jour d’échéance"` confirmed present; the plural `settings.notif.dueReminders`/`dueDesc` pair now **deleted** (G-37-2 closure — supersedes the prior Info note). `npm run i18n:scan` → 0 findings. `src/pages/settings.js` notif-push case renders only mentions/assign/comments/due_reminder/past_due rows — no third stale row. |
| 4 | Deploy-safe removal: no migration, no sweep; orphaned `day_before` keys AND legacy `push_due` pref values go inert; second boot byte-identical (REM-04, SC-4) | ✓ VERIFIED | No schema change; no migration/sweep code. day_before: orphaned ledger rows never match a produced key; legacy inbox rows render via stored snippet (I18N-03 pin passes). push_due (G-37-2): removed from `server.js NOTIF_PREF_KEYS` (16 keys — verified by reading the array, no push_due) and `NOTIF_PREF_DEFAULTS` (12 keys), and from `src/core/notifPrefs.js` defaults (12-key mirror, NOTIF_PREF_KEYS derives); `mergeNotifPrefs`/`getLocalNotifPrefs`/PUT whitelist all drop the key — dropped-key assertions pass (`test/local-prefs.test.mjs:56-68`, `test/notif-hydration.test.mjs:112-123`, `test/notif-prefs.test.mjs:78` PUT → 400 unknownPrefKey); historical fixtures in migration.test.mjs:493 / legacy-fixture.mjs:137 kept as data, with the survival assertion flipped. PUT of the retired key is rejected 400 `unknownPrefKey` (stronger than plan wording). |
| 5 | Release notes document the one-time "due today" catch-up burst at first deploy (SC-5) | ✓ VERIFIED | CHANGELOG.md Unreleased → Changed entry with the explicit One-time catch-up burst paragraph (re-confirmed present; not touched by 37-03). |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### G-37-2 Closure Evidence (this re-verification's focus)

| Check | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| push_due gone from server + src | `grep -rn "push_due" server.js src/` | 0 matches | ✓ PASS |
| Plural-pair keys gone from both locales | `grep -rn "dueReminders\|dueDesc" src/ server.js` | 0 matches | ✓ PASS |
| Stale settings row gone | read of `src/pages/settings.js` notif-push case | starts directly with due_reminder row | ✓ PASS |
| Server whitelist/defaults retired | read of server.js:1124-1160 | 16 keys / 12 defaults, no push_due | ✓ PASS |
| Client mirror retired | read of src/core/notifPrefs.js | 12-key defaults mirror, no push_due | ✓ PASS |
| Retired-key PUT rejected | test/notif-prefs.test.mjs:78 case | 400 unknownPrefKey — passes | ✓ PASS |
| Catalogue pin | test/i18n-core-features.test.mjs:218 | `keys.length === 1671` with G-37-2 note — passes | ✓ PASS |
| dist rebuilt clean | `grep -rl "Due date reminders"/"Rappels d"/"jour avant l"/push_due dist/assets/` | 0 files; fresh FR bundle contains the new singular copy (1 match for "Rappel le jour d’échéance") | ✓ PASS |
| Commits landed | `git show --stat 0162837 43dff9f 6e79784` | all three present, files match SUMMARY | ✓ PASS |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `server.js` | two-offset producer, day_before + push_due deleted, 16-key whitelist | ✓ VERIFIED | Offsets :1404-1407, dedup claim :1432-1434, whitelist :1124-1141 (16), defaults :1143-1157 (12) |
| `src/pages/settings.js` | notif-push case without the push_due row | ✓ VERIFIED | Case renders exactly 5 rows; due_reminder row present with new copy keys |
| `src/core/notifPrefs.js` | 12-key defaults mirror, push_due absent | ✓ VERIFIED | Defaults :16-29 (12 keys, no push_due); derived whitelist comment updated |
| `src/locales/en.json` / `fr.json` | dayBefore + plural pair deleted; singular pair reworded | ✓ VERIFIED | 0 matches for dayBefore/dueReminders/dueDesc; new singular copy present both sides |
| `dist/assets/*` | no stale strings in shipped bundle | ✓ VERIFIED | 0 stale-string matches; new FR copy present |
| `test/due-reminders.test.mjs` | day_before pins rewritten; REM-03 replay pin | ✓ VERIFIED | Passes in re-run |
| `test/notif-i18n.test.mjs` | legacy dayBefore fixture pin kept | ✓ VERIFIED | Exactly the legacy-fixture references remain (comment + fixture + test name); passes |
| `test/i18n-core-features.test.mjs` | catalogue pin 1671 | ✓ VERIFIED | Passes |
| `CHANGELOG.md` | SC-5 release note | ✓ VERIFIED | Catch-up burst paragraph present |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| server.js runReminderPass | reminders_sent dedup claim | `${ws}:${task}:${assignee}:${offset}:${due}` key, INSERT OR IGNORE | ✓ WIRED | `:due` component present — not regressed by 37-03 |
| server.js key ternary | notif.reminder.morningOf / pastDue | ternary at server.js:1419 | ✓ WIRED | Both keys in en.json + fr.json; i18n:scan 0 unresolved |
| settings.js notif-push case | due_reminder row only | srow(...dueReminder...) | ✓ WIRED | Stale row gone; past_due row intact |
| server.js PUT whitelist | client NOTIF_PREF_KEYS | parity after removal | ✓ WIRED | Server 16 keys ≡ client defaults-12 + 4 undefined-falsy extras (local-prefs pin passes) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| runReminderPass notif rows | title/assignee/due | live task docs + workspace clock | Yes | ✓ FLOWING |
| Settings toggle copy | t('settings.notif.dueReminder') | locale JSON catalogue | Yes (static copy — intended) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| 8 targeted suites (incl. all gap-closure flips) | `node --test test/{due-reminders,notif-i18n,i18n-core-features,i18n-pages,notif-prefs,notif-hydration,local-prefs,migration}.test.mjs` | 130 pass / 0 fail | ✓ PASS |
| Full suite | `npm test` | 931 pass / 0 fail / 3 skips (934 total) | ✓ PASS |
| Lint | `npm run lint` | clean (no output) | ✓ PASS |
| i18n parity gate | `npm run i18n:scan` | 0 literals, 0 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch | ✓ PASS |
| dist bundle clean | grep of dist/assets | 0 stale matches | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or conventional for this phase — SKIPPED (none exist; test files serve as the behavioral probes and were executed above).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| REM-01 | 37-01 | At most two due-date notifications per task per assignee; day-before gone on all channels | ✓ SATISFIED | server.js offsets (:1404-1407); replay + email fan-out tests green |
| REM-02 | 37-02, 37-03 | `due_reminder` governs due-today only; copy updated EN+FR; key/toggle unchanged; stale row removed | ✓ SATISFIED | server.js gating; en/fr singular copy; settings.js clean; i18n gates green |
| REM-03 | 37-01 | Past-due never re-fires; regression pin | ✓ SATISFIED | Dedup claim exactly-once; D-06 replay pin passing |
| REM-04 | 37-01, 37-02, 37-03 | Deploy-safe: no migration/sweep; orphaned day_before keys and legacy push_due values inert; release notes announce catch-up burst | ✓ SATISFIED | No schema change; legacy-row snippet-fallback pin; dropped-key sanitizer assertions; PUT 400 unknownPrefKey; CHANGELOG burst paragraph |

No orphaned requirements — REQUIREMENTS.md maps exactly REM-01…REM-04 to Phase 37; all four are claimed across plans 37-01 [REM-01, REM-03, REM-04], 37-02 [REM-02, REM-04], 37-03 [REM-02, REM-04].

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| server.js | 1331 | comment mentioning "addDaysIso retired with the day_before offset" | ℹ️ Info | Historical note only — no code reference; intentional. |
| test/notif-i18n.test.mjs | 446-454 | legacy dayBefore fixture + pin | ℹ️ Info | Intentional REM-04 coverage-continuity pin (inert legacy rows still render). |
| test/migration.test.mjs:493, test/helpers/legacy-fixture.mjs:137 | — | push_due in historical fixtures | ℹ️ Info | Plan-directed: historical data shape is the point; survival assertions flipped. |
| (all phase files) | — | TBD/FIXME/XXX markers | — | None found |

### Human Verification Required

### 1. Live scheduling cadence end-to-end (real clock)

**Test:** On a running instance with a real workspace, set a task due today; wait for the 09:00 scheduled pass (or the boot catch-up). Confirm the assignee's inbox and email each receive exactly one "Due today" notification, then one "Past due" the next morning, and nothing on subsequent days.
**Expected:** Exactly 2 notifications total per task per assignee across the task's lifetime (per due-date value).
**Why human:** The scheduler's real-time trigger (cron/interval boot path) and email delivery are exercised by clock-injected integration tests, not the live scheduling loop; real-time behavior and external email delivery cannot be verified programmatically here.

### 2. Settings page rendering of the new copy (re-runnable after G-37-2)

**Test:** Open Settings → notifications in EN and FR; check the due-reminder toggle label/description, and that the inbox filter label shows "Due-day reminder" (shared-label collateral). Confirm the legacy push_due row is gone in BOTH locales.
**Expected:** EN "Due-day reminder" / "Get a reminder on the morning a task is due."; FR "Rappel le jour d’échéance" / "Recevez un rappel le matin de l’échéance d’une tâche."; toggle still functional; exactly two reminder rows (due-day + overdue nudges), no third stale row.
**Why human:** Visual rendering and toggle interaction are UI-behavior checks. The stale-row deletion is grep-verified in source and dist, but rendered-page confirmation closes UAT test 2.

## Gaps Summary

No gaps. Gap G-37-2 is closed and independently verified: the legacy push_due settings row, both plural-pair i18n keys, and the pref itself are deleted from every surface (settings.js, both locales, server 16-key whitelist / 12-key defaults, client 12-key mirror), the retired-key PUT is rejected 400 unknownPrefKey, the catalogue pin is 1671, and the rebuilt dist bundle carries zero stale strings. No regression of the plans 01/02 fixes: the two-offset producer, the `:${due}` dedup key component, the day_before deletion, and the legacy-row inert pin are all intact and passing. Full suite 931/931 pass (3 pre-existing skips), lint clean, i18n:scan 0 findings.

Status is `human_needed` only because live-clock scheduling and rendered-UI behavior (2 items above) require human observation; nothing blocks.

---

_Verified: 2026-11-04T16:20:00Z_
_Verifier: the agent (gsd-verifier)_
