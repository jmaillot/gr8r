---
phase: 37-reminder-cadence-rework
verified: 2026-11-05T09:55:00Z
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
  - .planning/phases/37-reminder-cadence-rework/37-04-PLAN.md
  - .planning/phases/37-reminder-cadence-rework/37-04-SUMMARY.md
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
covered_digest: "v2:sha256:ffd83997e83c2ff749df5273e82b409d1746793191eeacb94937ba31f95b5882"
behavior_unverified: 0
overrides_applied: 0
gaps: []
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  gaps_closed:
    - "G-37-3: reminder emission gate widened to `if (hour >= 9)` (server.js:1396) — a post-09:00 boot restart now delivers the missed 'Due today' reminder exactly once, carried by the transactional reminders_sent claim; zero `hour === 9` occurrences remain; all three stale comment blocks rewritten to describe the at-or-after-09:00 catch-up window; REM-01 re-scoped to pre-09:00 idle purity; new REM-06 regression test pins the 14:30 late catch-up + 18:00 no-op"
  gaps_remaining:
    - "UAT test 2 live-clock confirmation — human UAT still records 'issue' (G-37-3); the fix landed with automated 3-boot evidence (37-04-SUMMARY UAT Test 2 Evidence) but the human re-run on a live instance has not yet re-passed. Carried as a human_verification item, not a code gap."
  regressions: []
---

# Phase 37: Reminder Cadence Rework Verification Report

**Phase Goal:** Due-date reminders drop to their honest minimum — at most two per task per assignee ("due today" morning-of, "past due" once the following morning) — with the `day_before` offset removed deploy-safely.
**Verified:** 2026-11-05T09:55:00Z
**Status:** human_needed (all automated checks pass; live-clock UAT re-confirmation outstanding — see Human Verification)
**Re-verification:** Yes — after gap closure G-37-3 (plan 37-04, commits 5e092c5 / 8f6de5f / 624ec4c). #4682 stale re-verification: supersedes the 2026-11-04T16:20:00Z report.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A task reaching its due date produces exactly one "due today" (morning_of) and one "past due" the next morning — nothing else, inbox + email (REM-01, SC-1) | ✓ VERIFIED | `server.js:1419-1421` — offsets array contains only `morning_of` (`localDate >= due`) and `past_due` (`localDate > due`), gated on `hour >= 9` (server.js:1396). `grep -rnE "day_before\|dayBefore" server.js src/` → only a historical comment (server.js:1346). Replay pin passes in the re-run (`test/due-reminders.test.mjs` REM-02/03: exactly 1 morning_of, second pass no-op). |
| 2 | A past-due task never re-fires on later days — exactly one per task per assignee, regression-pinned (REM-03, SC-2) | ✓ VERIFIED | Dedup claim `insert or ignore into reminders_sent` with key `${ws}:${task}:${assignee}:${offset}:${due}` (server.js:1450-1454, `:due` component intact — not regressed by 37-04). REM-03 replay pin passes; REM-06 repeat-tick pin (`repeat.length === 0`, test:202) extends exactly-once to the widened window. |
| 3 | `due_reminder` preference toggles only "due today"; `past_due` preference unchanged; settings copy updated EN+FR (REM-02, SC-3) | ✓ VERIFIED | server.js:1419-1421 — `prefs.due_reminder !== false` gates only morning_of; `prefs.past_due !== false` gates only past_due. Copy present in both locales (en.json:1249 / fr.json:1249 `"Due-day reminder"` / `"Rappel le jour d’échéance"`); `grep -rn "push_due\|dueReminders\|dueDesc" server.js src/ dist/assets/` → 0 matches (G-37-2 closure intact, not regressed). settings.js notif-push case renders 5 rows, due_reminder row present. |
| 4 | Deploy-safe removal: no migration, no sweep; orphaned `day_before` keys AND legacy `push_due` pref values go inert (REM-04, SC-4) | ✓ VERIFIED | No schema change; legacy inbox rows render via stored snippet (I18N-03 pin passes); push_due absent from server whitelist/defaults and client mirror; retired-key PUT rejected 400 unknownPrefKey (test/notif-prefs.test.mjs). Unchanged by 37-04 — regression check only. |
| 5 | Release notes document the one-time "due today" catch-up burst at first deploy (SC-5) | ✓ VERIFIED | CHANGELOG.md Unreleased → Changed entry with the One-time catch-up burst paragraph (untouched by 37-04). |

**Score:** 5/5 truths verified (0 present, behavior-unverified). The 37-04 must_haves (gate widened, REM-06 pin, comments truthful) are folded into truths 1–2 above and independently confirmed below.

### G-37-3 Closure Evidence (this re-verification's focus)

| Check | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| Strict gate gone | `grep -n "hour === 9" server.js` | 0 matches | ✓ PASS |
| Widened gate present | `grep -n "hour >= 9" server.js` | :1396 (reminders) + :1495 (digest) — both loops share the window | ✓ PASS |
| Claim transaction unchanged | read server.js:1449-1460 | insert-or-ignore claim commits inside the same `transaction()` as the notif append; `changes === 0` → skip | ✓ PASS |
| Comments truthful | read server.js:1301-1313, ~1390-1395, ~1417-1419, ~1481-1492 | header describes at-or-after-09:00 late-delivery catch-up; window-predicate comment rewritten; digest note says both loops share the window — no "hour === 9 IS the catch-up" or "hour !== 9 pure reads" remains | ✓ PASS |
| REM-01 re-scoped | test/due-reminders.test.mjs:121-131 | "pre-09:00 ticks are pure reads (G-37-3)" — revision unchanged, zero rows, zero claims at 08:00 — passes | ✓ PASS |
| REM-06 regression pin | test/due-reminders.test.mjs:177-202 (at1430 helper :43) | 14:30 emits EXACTLY ONE `Due today: Ship it` (dedup key `...:morning_of:2026-01-15`, revision +1); 18:00 repeat tick emits nothing — passes | ✓ PASS |
| UAT test 2 automated evidence | 37-04-SUMMARY "UAT Test 2 Evidence" | 3-boot real-server scenario on scratch data dir: boot 2 (post-09:00 restart) emits exactly 1; boot 3 emits nothing; revision unchanged | ✓ PASS |
| Commits landed | `git log` | 5e092c5 (fix), 8f6de5f (tests), 624ec4c (docs) present, files match SUMMARY | ✓ PASS |
| No regression of G-37-2 | grep server.js/src/dist | 0 push_due / dueReminders / dueDesc matches; catalogue + settings intact | ✓ PASS |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `server.js` | two-offset producer, `hour >= 9` gate, truthful comments, 16-key whitelist, no day_before/push_due | ✓ VERIFIED | Gate :1396; offsets :1419-1421; claim :1449-1460; comments rewritten; whitelists intact from 37-03 |
| `src/pages/settings.js` | notif-push case without the push_due row | ✓ VERIFIED | Regression check — unchanged, still 5 rows |
| `src/core/notifPrefs.js` | 12-key defaults mirror, push_due absent | ✓ VERIFIED | Unchanged by 37-04 |
| `src/locales/en.json` / `fr.json` | singular copy present; stale keys deleted | ✓ VERIFIED | :1249 both sides; 0 stale-key matches |
| `test/due-reminders.test.mjs` | REM-01 re-scoped pre-09:00; REM-06 late-catch-up pin | ✓ VERIFIED | 18/18 pass in targeted re-run |
| `CHANGELOG.md` | SC-5 release note | ✓ VERIFIED | Catch-up burst paragraph present |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| server.js:1396 gate | reminders_sent claim (~:1449) | widened window safe because the claim commits transactionally with the notif append | ✓ WIRED | `:due` key component intact — exactly-once under the widened window |
| test trigger() harness | clock injection | at1430 helper (test:43) injects post-09:00 instant the same way at9/at8 do | ✓ WIRED | REM-06 passes through the same /api/internal/reminder-pass path |
| server.js key ternary | notif.reminder.morningOf / pastDue | both keys in en.json + fr.json | ✓ WIRED | Unchanged, i18n gates green in prior run |
| settings.js notif-push case | due_reminder row | srow(...dueReminder...) | ✓ WIRED | Stale row still gone (G-37-2 regression check) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| runReminderPass notif rows | title/assignee/due | live task docs + workspace clock | Yes | ✓ FLOWING |
| Settings toggle copy | t('settings.notif.dueReminder') | locale JSON catalogue | Yes (static copy — intended) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Targeted suite incl. G-37-3 flips | `node --test test/due-reminders.test.mjs` | 18 pass / 0 fail | ✓ PASS |
| Full suite (run once, this verification) | `npm test` | 943 pass / 0 fail / 3 pre-existing skips | ✓ PASS |
| Lint on changed files | `npx eslint server.js test/due-reminders.test.mjs` | clean | ✓ PASS |
| Stale-string sweep (G-37-2 regression) | `grep -rn "push_due\|dueReminders\|dueDesc" server.js src/ dist/assets/` | 0 matches | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or conventional for this phase — SKIPPED (test files serve as the behavioral probes and were executed above; the 37-04 3-boot UAT scenario evidence is recorded in the SUMMARY).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| REM-01 | 37-01, 37-04 | At most two due-date notifications per task per assignee; day-before gone; post-09:00 restart catch-up delivers the missed one | ✓ SATISFIED | `hour >= 9` gate + transactional claim; REM-01/02/03/06 pins green |
| REM-02 | 37-02, 37-03 | `due_reminder` governs due-today only; copy updated EN+FR; stale row removed | ✓ SATISFIED | server.js gating; en/fr singular copy; 0 stale matches in source + dist |
| REM-03 | 37-01, 37-04 | Past-due never re-fires; exactly-once holds under the widened window | ✓ SATISFIED | Dedup claim with `:due` component; REM-03 + REM-06 repeat-tick pins |
| REM-04 | 37-01, 37-02, 37-03 | Deploy-safe removal; orphaned keys and legacy push_due inert; release notes | ✓ SATISFIED | No schema change; inert pins; CHANGELOG burst paragraph |

All four requirement IDs are accounted for: REQUIREMENTS.md maps exactly REM-01…REM-04 to Phase 37; plans claim [37-01: REM-01/03/04], [37-02: REM-02/04], [37-03: REM-02/04], [37-04: REM-01/02/03/04]. No orphaned requirements. (The "REM-06" label is a test-case name in test/due-reminders.test.mjs, not a REQUIREMENTS.md ID.)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| server.js | 1346 | historical comment mentioning the retired day_before offset | ℹ️ Info | Historical note only — intentional |
| test/notif-i18n.test.mjs | ~446-454 | legacy dayBefore fixture + pin | ℹ️ Info | Intentional REM-04 inert-legacy-row coverage |
| test/migration.test.mjs / legacy-fixture.mjs | — | push_due in historical fixtures | ℹ️ Info | Plan-directed historical data shape |
| (all phase files) | — | TBD/FIXME/XXX markers | — | None found |

### Human Verification Required

### 1. Live scheduling cadence end-to-end on a real instance (UAT test 2 re-run — carried forward from 37-UAT.md, still recorded as `issue`/G-37-3 there)

**Test:** On a running instance with a real workspace, set a task due today. Confirm the assignee's inbox and email each receive exactly one "Due today" notification. Then restart the server AFTER 09:00 local with a second due-today task (or a new due date) and confirm the missed reminder is delivered exactly once; a second restart delivers nothing more. On subsequent days, exactly one "Past due" fires the next morning and nothing later.
**Expected:** Exactly 2 notifications total per task per assignee across the task's lifetime (per due-date value), including after a post-09:00 restart (the G-37-3 fix).
**Why human:** UAT test 2 is the user-reported defect that spawned G-37-3. The fix is covered by an automated 3-boot server scenario (37-04-SUMMARY, PASS) and the REM-06 regression pin, but the 37-UAT.md record has not been re-passed by the human, and real email delivery + live clock cannot be verified programmatically here.

~~### 2. Settings page rendering of the new copy~~ — CLOSED: 37-UAT.md test 3 records `pass` (automated); dist/source greps confirm zero stale strings in both locales.

### Gaps Summary

No code gaps. All five must-haves are verified in the codebase; G-37-3 is closed and independently confirmed (gate widened to `hour >= 9` at server.js:1396 with zero strict-gate remnants, transactional exactly-once claim intact, REM-01 re-scoped, REM-06 regression pin green, truthful comments, commits landed). Full suite 943/943 pass (3 pre-existing skips), lint clean. Status remains `human_needed` solely because UAT test 2 — the user-reported live-clock defect — has not been re-passed by the human after the fix, even though automated 3-boot evidence exists. Nothing blocks planning of the next phase; route to `{phase}-UAT.md` re-run for the single outstanding item.

---

_Verified: 2026-11-05T09:55:00Z_
_Verifier: the agent (gsd-verifier)_
