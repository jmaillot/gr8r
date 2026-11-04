---
phase: 37-reminder-cadence-rework
plan: 03
subsystem: i18n/settings/prefs
tags: [push-due, gap-closure, i18n, settings, whitelist, dist]
requires:
  - phase: 37-01
    provides: two-offset cadence + deleted day_before keys (37-03 reverses 37-02's leave-untouched decision on the plural pair)
  - phase: 37-02
    provides: renamed singular dueReminder copy + CHANGELOG entry (untouched here)
provides:
  - push_due fully removed end-to-end: settings row, both locale keys, server whitelist/defaults, client defaults
  - historical stored push_due values proven inert via spread-then-sanitize (no migration)
  - catalogue at 1671 keys, dist rebuilt without stale copy
affects: [Phase 38 digest, phase-37 re-verification (UAT test 2 re-runnable)]
tech-stack:
  added: []
  patterns: [remove-from-whitelist-both-sides + drop-assertion pins; retired-key PUT rejected 400 unknownPrefKey]
key-files:
  created: []
  modified:
    - src/pages/settings.js
    - src/locales/en.json
    - src/locales/fr.json
    - server.js
    - src/core/notifPrefs.js
    - test/i18n-pages.test.mjs
    - test/i18n-core-features.test.mjs
    - test/notif-prefs.test.mjs
    - test/notif-hydration.test.mjs
    - test/local-prefs.test.mjs
    - test/migration.test.mjs
    - test/notif-i18n.test.mjs
key-decisions:
  - "PUT carrying the retired key is rejected 400 unknownPrefKey (whitelist semantics) — stronger than the plan's 'not echoed back' wording; asserted as such"
  - "migration.test.mjs EXPECTED_DEFAULTS loses the key (assertion of survival flipped) while fixturePrefs/legacy-fixture keep the historical doc shape untouched"
  - "dist/ is gitignored in this repo — rebuilt locally and grep-verified; not committed (plan files_modified listed it)"
requirements-completed: [REM-02, REM-04]
coverage:
  - id: D1
    description: "Settings notif-push case renders without the push_due row in EN+FR (only due_reminder + past_due rows remain)"
    requirement: REM-02
    verification:
      - kind: other
        ref: "command: grep -rn 'dueReminders|dueDesc|push_due' src/pages/settings.js src/locales/en.json src/locales/fr.json → 0 matches"
        status: pass
      - kind: unit
        ref: "test/i18n-pages.test.mjs#the English oracle — the settings page"
        status: pass
    human_judgment: false
  - id: D2
    description: "push_due absent from server.js NOTIF_PREF_KEYS/NOTIF_PREF_DEFAULTS and src/core/notifPrefs.js NOTIF_PREF_DEFAULTS (whitelist parity server ≡ client)"
    requirement: REM-04
    verification:
      - kind: other
        ref: "command: grep -n 'push_due' server.js src/core/notifPrefs.js → 0 matches"
        status: pass
      - kind: unit
        ref: "test/notif-prefs.test.mjs#PUT carrying the retired push toggle key is rejected 400 (G-37-2 — removed from the whitelist, never echoed back)"
        status: pass
      - kind: unit
        ref: "test/local-prefs.test.mjs#whitelist is the 12 defaults plus the 4 undefined-falsy extras"
        status: pass
    human_judgment: false
  - id: D3
    description: "Historical stored push_due values are inert: dropped by every sanitizer (mergeNotifPrefs, getLocalNotifPrefs, PUT whitelist), legacy fixtures unchanged"
    requirement: REM-04
    verification:
      - kind: unit
        ref: "test/notif-hydration.test.mjs#(c) a server row fills the client empty store — the F5 case (G-34-4) [dropped assertion]"
        status: pass
      - kind: unit
        ref: "test/local-prefs.test.mjs#(d) non-whitelisted keys and non-boolean values are rejected on read [dropped assertion]"
        status: pass
      - kind: unit
        ref: "test/migration.test.mjs#a later workspace joiner reads the all-default prefs, never the stale workspace object (D-11)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Catalogue at 1671 keys; i18n parity gate green; dist bundle carries none of the four stale strings"
    verification:
      - kind: unit
        ref: "test/i18n-core-features.test.mjs#the catalogue holds … (keys.length === 1671 with G-37-2 note)"
        status: pass
      - kind: other
        ref: "command: npm run i18n:scan → 0 findings; grep -rl 'Due date reminders'/'Rappels d'/'jour avant l' dist/assets/ → 0 files"
        status: pass
    human_judgment: false
duration: 11 min
completed: 2026-11-04
commits: 3
plan_head_before: 207a4bbc48a197009ad53868e040fb78833e3400
plan_head_after: 6e79784
status: complete
---

# Phase 37 Plan 03: push_due gap closure Summary

Removed the legacy `push_due` settings row and its i18n keys from BOTH locales, retired the pref from every whitelist/defaults surface (server 16-key whitelist / 12-key defaults, client mirrored), flipped the affected pins with dropped-key assertions, and rebuilt dist so the stale copy is gone from the shipped bundle — gap G-37-2 closed, full suite 931 pass / 0 fail / 3 skips, lint clean.

## Performance

- **Duration:** 11 min
- **Started:** 2026-11-04T15:26:37Z
- **Completed:** 2026-11-04T15:37:57Z
- **Tasks:** 3
- **Files modified:** 12 (+ dist/ rebuilt, gitignored)

## Accomplishments

- **Task 1 (commit 0162837):** deleted the push_due srow from `src/pages/settings.js` notif-push case (case now starts with the due_reminder row); deleted `settings.notif.dueReminders`/`settings.notif.dueDesc` from EN+FR catalogues atomically; removed the two pin rows from `test/i18n-pages.test.mjs` (only the singular dueReminder/dueReminderDesc pins remain); catalogue-size pin 1673 → 1671 with the G-37-2 note in `test/i18n-core-features.test.mjs`.
- **Task 2 (commit 43dff9f):** removed the key from `server.js` NOTIF_PREF_KEYS (17→16) and NOTIF_PREF_DEFAULTS (13→12) and from `src/core/notifPrefs.js` NOTIF_PREF_DEFAULTS (NOTIF_PREF_KEYS derives → 16), with the PREFS/D-27-5 mirror comments updated without spelling the retired token; confirmed zero emission-time consumers (producer gates on due_reminder/past_due only). Flipped pins: surviving-pref passthrough cases now use `push_comment`; each sanitizer gains a dropped-key assertion; PUT with the retired key → 400 `unknownPrefKey`; migration `EXPECTED_DEFAULTS` loses the key while `fixturePrefs`/`legacy-fixture.mjs` keep the historical shape.
- **Task 3 (commit 6e79784):** production build green (i18n:scan gate 0 findings); fresh `dist/assets` bundle has zero matches for 'Due date reminders', 'One day before a task is due.', 'Rappels d…', '…jour avant l…'; full suite 931 pass / 0 fail / 3 skips; lint clean.

## Task Commits

1. **Task 1: Remove the stale push_due settings row and its i18n keys (G-37-2 UI + catalogue)** - `0162837` (feat)
2. **Task 2: Retire the push_due pref from all whitelists/defaults and flip the affected pins** - `43dff9f` (feat)
3. **Task 3: Rebuild dist and run the full suite green** - `6e79784` (feat + lint blockers)

## Files Created/Modified

- `src/pages/settings.js` - notif-push case: push_due row deleted
- `src/locales/en.json`, `src/locales/fr.json` - plural pair keys deleted (byte-parity preserved, both sides atomic)
- `server.js` - whitelist 16 keys / defaults 12 keys; dead `addDaysIso` helper removed (see Deviations)
- `src/core/notifPrefs.js` - 12-key defaults mirror; header comment updated
- `test/i18n-pages.test.mjs` - two plural-pair pins removed
- `test/i18n-core-features.test.mjs` - catalogue pin 1671
- `test/notif-prefs.test.mjs` - retired-key PUT → 400 case; passthrough pins on push_comment; 12-key comments
- `test/notif-hydration.test.mjs` - dropped-key assertions; 12-key shape pins
- `test/local-prefs.test.mjs` - dropped-key assertions; 16-key whitelist pin
- `test/migration.test.mjs` - EXPECTED_DEFAULTS without the key; fixture untouched
- `test/notif-i18n.test.mjs` - unused imports dropped (see Deviations)
- `dist/` - rebuilt locally (gitignored; not committed)

## Decisions Made

- **PUT rejection instead of silent drop:** with the key off the server whitelist, a PUT body carrying it is rejected 400 `unknownPrefKey` (existing D-03 semantics) — asserted as the proof the value can never be stored/echoed, stronger than the plan's "not echoed back by the GET" wording.
- **Migration pin split:** `fixturePrefs` (historical doc blob, migration.test.mjs:493) and `legacy-fixture.mjs:137` keep their push_due entry per plan (historical shape is the point); the `EXPECTED_DEFAULTS` deep-equal (an assertion that the key survives a defaults merge) was flipped to the 12-key reality.
- **dist/ not committed:** the path is in .gitignore; the rebuild was run and grep-verified on disk.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-existing lint errors blocked the Task 3 verify gate**
- **Found during:** Task 3 (`npm run lint` in the verify chain)
- **Issue:** 4 `no-unused-vars` errors at the plan-start commit (verified by checking out the three files at 207a4bb and re-linting — identical 4 errors), introduced by earlier plans: dead `addDaysIso` in server.js (orphaned by 37-01's day_before deletion), unused `client`/`enLocale` imports in test/notif-i18n.test.mjs, unused `t` callback param in test/notif-prefs.test.mjs. They predate 37-03 but the plan's done-criterion is "lint clean".
- **Fix:** removed the dead helper and the unused imports/params. One self-inflicted misstep during the fix (initially also dropped the genuinely-used `t` import) was caught by the test rerun and reverted before commit.
- **Files modified:** server.js, test/notif-i18n.test.mjs, test/notif-prefs.test.mjs
- **Verification:** `npm run lint` → clean; `node --test test/notif-i18n.test.mjs test/notif-prefs.test.mjs test/due-reminders.test.mjs` → 46 pass / 0 fail; full suite re-run green.
- **Committed in:** 6e79784 (Task 3 commit)

**Total deviations:** 1 auto-fixed (1 blocking, out-of-scope-but-gate-blocking origin). **Impact on plan:** none on shipped behavior — the fixes delete dead code only; all plan actions executed exactly as written.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Gap G-37-2 closed: UAT test 2 (Settings page rendering, EN+FR) is re-runnable and the third stale row is gone from source and shipped bundle.
- Phase 37 fully executed (3/3 plans incl. this gap closure). Ready for phase re-verification, then Phase 38 (Daily Digest) — note `email_digest` default inversion is a Phase-38 spec decision.
- Historical `push_due` values in existing `user_notif_prefs` rows are inert (never read, dropped client-side) — no migration, per the REM-04 invariant.

---
*Phase: 37-reminder-cadence-rework*
*Completed: 2026-11-04*
