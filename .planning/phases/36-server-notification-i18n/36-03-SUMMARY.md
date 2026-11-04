---
phase: 36-server-notification-i18n
plan: 03
subsystem: i18n
tags: [i18n, server-notifications, inbox, keyed-rows, tdd]
requires:
  - src/core/i18n.js (t/has viewer-locale singleton; notif.reminder.* keys from 36-01)
  - server.js runReminderPass (reminders_sent dedup, D-27 transaction)
  - src/pages/inbox.js notifText (three-branch render)
provides:
  - Keyed reminder rows: new notif rows carry { key: 'notif.reminder.dayBefore|morningOf|pastDue', vars: { title } } + the unchanged EN snippet (D-05 snapshot values, D-06 dual store)
  - Three-branch inbox render: legacy prose verbatim → keyed localized (viewer locale) → structured composed
  - Client-row purity pins (T-36-03): notifyMembers never emits keyed fields; tampered keys fall back to the snippet
affects:
  - Phase 37 (producer rework keeps the keyed-row contract; day_before key stays render-covered)
  - Phase 38 (digest renders localized text through the same t(n.key, n.vars) layer)
tech-stack:
  added: []
  patterns: [keyed-row-dual-store, snapshot-vars-no-ids, viewer-locale-singleton-render, catalogue-unknown-key-snippet-fallback, static-extraction-compile]
key-files:
  created: []
  modified: [server.js, src/pages/inbox.js, test/notif-i18n.test.mjs]
decisions:
  - "Keyed branch renders the full catalogue sentence (title embedded via vars) as a muted span rather than the bold-title + muted-label split — the structured split would duplicate the title; unknown-key fallback keeps the same shape with the stored snippet prose (D-06)"
  - "Key names use the 36-01 camelCase keys (dayBefore/morningOf/pastDue) — the plan's underscore names failed the KEY_SHAPE gate in 36-01"
  - "Snippet preview localizes keyed rows through has() gating: has(n.key) ? t(n.key, n.vars) : fmtComment(n.snippet) — a client-supplied unknown key can never blank the preview"
  - "Task-2 sweep pin: grep over src/pages/inbox.js shows zero un-localized display literals — every kind label and by-line routes through t() (D-11)"
metrics:
  duration: ~10m
  completed: 2026-11-04
  tasks: 2
status: complete
estimate:
  tokens: 70000
  tasks: 2
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 9673fee6e95daa14c85557d1852ca9ee99a40b00
plan_head_after: 8fd5883
requirements: [I18N-03]
---

# Phase 36 Plan 03: Keyed reminder rows + localized inbox render Summary

**One-liner:** Reminder rows now store `key` + send-time `vars` snapshot alongside the unchanged English snippet, and the inbox localizes keyed rows per viewer locale (sentence AND preview) with byte-identical legacy rendering and snippet fallback for unknown keys.

## What Was Built

**Task 1 (tracer, TDD):** RED-first tests (row-shape integration via `/api/internal/reminder-pass` + FR/EN render tests using the house static-extraction pattern — the notifText/notifIcon/inboxItem block compiled with the REAL i18n t()/has()/esc() singleton injected, since inbox.js imports the bundler-only `virtual:icons`). GREEN: (1) server.js `runReminderPass` notif object gains `key` (`notif.reminder.dayBefore`/`morningOf`/`pastDue`) and `vars: { title }` — snapshot VALUES, no ids (D-05); the `snippet` write and the claim+append transaction are untouched (additive only, dedup guarantee inherited from reminders_sent); (2) inbox.js `notifText` gains the keyed branch between the legacy prose branch and the structured branch — `has(n.key) ? t(n.key, n.vars) : n.snippet` (D-06 fallback), viewer-locale singleton, no new plumbing; (3) `inboxItem`'s snippet preview localizes keyed rows through the same has() gate. No test/due-reminders.test.mjs updates needed — its assertions are snippet-string based and the snippet write is unchanged.

**Task 2:** Contract edges pinned: unknown catalogue key → stored snippet prose (never blank, never the raw key, D-06); pre-upgrade reminder row AND legacy prose row pinned byte-identical with exact-string assertions (SC-3, Pitfall 6); client-row purity (T-36-03) pinned twice — a static pin that notifyMembers' row literal contains no key/vars fields, and a runtime pin that a caller-supplied key/vars is never copied into the row; tampered client key falls back through the snippet in the preview; day_before key render covered in FR+EN for Phase 37 gate continuity; keyed row proven localized in both list sentence and preview.

## Deviations from Plan

**[Rule 3 - Blocking] camelCase keys (carried from 36-01)**
- **Found during:** Task 1 implementation
- **Issue:** The plan text names `notif.reminder.day_before`/`morning_of`/`past_due`; 36-01 renamed them to camelCase after the catalogue KEY_SHAPE gate rejected underscores.
- **Fix:** Used `dayBefore`/`morningOf`/`pastDue` — the keys 36-01 shipped in both catalogues.
- **Files modified:** server.js
- **Commit:** 625ff58

**[Decision] Keyed-branch markup shape**
- **Found during:** Task 1 implementation
- **Issue:** The plan says the keyed branch composes "the same task-title markup shape" — but the catalogue sentence already embeds the title via `vars.title`, so a bold-title + muted-sentence split would render the title twice.
- **Fix:** Keyed rows render the full localized sentence as one muted span (title visible inside it); unknown-key fallback keeps the identical shape with the snippet prose.
- **Files modified:** src/pages/inbox.js
- **Commit:** 625ff58

## D-11 Sweep Pin (Task 2, item 5)

`grep -nE "by Reminders|'by '|kind-label literals"` over src/pages/inbox.js → zero un-localized display literals. All kind labels route through `t('settings.notif.*')`/`t('page.inbox.cat.*')` (tabs, lines 13-18) and the structured-type fragment branch (`t('notif.update')`/`t('notif.${type}')`, line 72). No fix needed; expected per the plan.

## Verification

- `node --test test/notif-i18n.test.mjs` — 16/16 green (RED confirmed before implementation: 3/3 new Task-1 tests failed; row lacked key/vars and notifText returned the structured branch for keyed rows)
- `node --test test/due-reminders.test.mjs` — 16/16 green; `node --test test/notif-hydration.test.mjs` — 9/9 green (no regression)
- `npm test` — 921 tests, 918 pass, 0 failures, 3 skipped (pre-existing skips)

## Notes

- Zero packages installed (T-36-SC zero-dependency invariant held).
- Assumptions I18N-03-idempotency and I18N-03-concurrency held as written: no new idempotency surface (reminders_sent dedup untouched), row writes stayed inside the existing transaction.
- Known pre-existing latent issue carried from 36-02 (out of scope): test/notif-email-link.test.mjs's fakeSmtp shares connection state — untouched here.

## Self-Check: PASSED

- server.js reminder rows carry key+vars+snippet; src/pages/inbox.js has the keyed branch (notifText) and the has()-gated preview; test/notif-i18n.test.mjs = 16 tests green
- Commits 625ff58 and 8fd5883 exist on main
