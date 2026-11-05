---
phase: 37-reminder-cadence-rework
reviewed: 2026-11-04T16:45:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - server.js
  - src/pages/settings.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/core/notifPrefs.js
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
findings:
  critical: 0
  warning: 0
  info: 1
  total: 1
status: issues_found
---

# Phase 37: Code Review Report

**Reviewed:** 2026-11-04 (standard depth, fresh review covering all phase-37 plans incl. gap-closure 37-03)
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found (info only)

## Summary

Fresh review of the full phase-37 scope, superseding the 2026-11-04 earlier review (its findings are dispositioned in 37-REVIEW-DISPOSITION.md). This pass focuses on the plan 37-03 gap-closure commits (0162837, 43dff9f, 6e79784) — removal of the legacy `push_due` settings row, its i18n keys, and the pref from every whitelist/defaults surface — merged with the already-reviewed 37-01/37-02 scope.

Verification performed:

- **Row removal (0162837):** the `notif-push` case in `src/pages/settings.js:378-386` now renders exactly `push_mention` / `push_assign` / `push_comment` / `due_reminder` / `past_due` — the stale `push_due` srow is gone. `settings.notif.dueReminders`/`settings.notif.dueDesc` deleted from BOTH catalogues atomically; key-set diff EN↔FR yields only the two intentional `contract.*` keys; both catalogues at 1671 keys.
- **Pref retirement (43dff9f):** `push_due` appears NOWHERE in `server.js`, `src/`, `mailer.js`, or `public/` (grep: zero matches). Server `NOTIF_PREF_KEYS` has exactly 16 entries, `NOTIF_PREF_DEFAULTS` exactly 12; client mirror in `src/core/notifPrefs.js:16-40` matches (12 defaults, `NOTIF_PREF_KEYS` derives to 16 = 12 + the 4 undefined-falsy extras). Server PUT whitelist (`server.js:3230`) rejects a `push_due` key with 400 `unknownPrefKey` before any workspace/membership work, and the test at `test/notif-prefs.test.mjs:77-82` proves the rejected PUT writes nothing. Whitelist parity server ≡ client holds.
- **Inert-rows guarantee:** `getUserNotifPrefs` (server.js:1165-1180) spreads stored rows over defaults; `mergeNotifPrefs`/`sanitize`/`getLocalNotifPrefs` all whitelist-filter, so a historical `push_due` value can never reach app state. Zero emission-time consumers confirmed — the reminder producer gates only on `due_reminder`/`past_due`, and `NOTIF_EMAIL_KIND` maps to `email_reminder`.
- **Test pins:** all flipped assertions verified by reading the diff — passthrough cases now use `push_comment`; each sanitizer (mergeNotifPrefs ×2, getLocalNotifPrefs ×2 via setLocalNotifPrefs and direct-blob paths) gained a dropped-key assertion; `migration.test.mjs` `EXPECTED_DEFAULTS` loses the key while `fixturePrefs`/`legacy-fixture.mjs` keep the historical doc shape. Remaining `push_due` occurrences in `test/` are exclusively the dropped-key assertions and historical fixtures — correct.
- **Catalogue pin:** `test/i18n-core-features.test.mjs:218` at 1671 with the G-37-2 comment.
- **dist (6e79784):** rebuilt assets (`dist/assets/*`, mtime after the last commit) contain zero matches for 'Due date reminders', 'Rappels d', 'jour avant l'. dist/ is gitignored per SUMMARY — rebuild verified on disk.
- **Lint-blocker cleanup in 6e79784:** dead `addDaysIso` deleted (this resolves the prior review's WR-01); unused imports/params removed. The replacement comment at server.js:1331-1332 is accurate.
- **Tests run:** `node --test test/i18n-core-features.test.mjs test/i18n-pages.test.mjs test/notif-prefs.test.mjs test/notif-hydration.test.mjs test/local-prefs.test.mjs test/migration.test.mjs` → **97 pass / 0 fail / 0 skipped**.

No critical issues, no warnings. The removal is complete, consistent on both sides of the API boundary, and the inert-rows story is real (no gate reads the retired key). One info item below.

Prior-review carry-over: WR-01 (`addDaysIso` dead code) is **resolved** by commit 6e79784. IN-01 (implicit "Past due" fall-through) and IN-02 (duplicated offset→suffix mapping) were dispositioned as accepted in 37-REVIEW-DISPOSITION.md and are not re-reported — 37-03 does not worsen either.

## Info

### IN-01: GET echoes historical `push_due` from stored rows as an inert extra key

**File:** `server.js:3213` (and `getUserNotifPrefs`, server.js:1179)
**Issue:** `getUserNotifPrefs` returns `{ ...NOTIF_PREF_DEFAULTS, ...stored }` without whitelist-filtering, so a user with a historical `user_notif_prefs` row containing `push_due` gets that key echoed in the `/api/me/notif-prefs` GET payload until the row is rewritten. This is safe — no server or client code reads the key, the client sanitizes it out before app state (T-34-11), and the plan's PREFS DECISION explicitly accepted this inert-extra-property semantics in exchange for zero migration. It is also self-healing: the next PUT (which never includes the key, since the client whitelist dropped it) rewrites the row without it. Noted only so nobody mistakes the echoed key for a supported pref.
**Fix (optional, phase 38+):** if the echoed key ever bothers an audit, filter the stored object through `NOTIF_PREF_KEYS` in `getUserNotifPrefs` (mirroring the client `sanitize`), which also makes the GET shape exactly 12 keys always. Not required for correctness.

---

_Reviewed: 2026-11-04T16:45:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
