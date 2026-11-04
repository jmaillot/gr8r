---
phase: 37-reminder-cadence-rework
reviewed: 2026-11-04T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - server.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/due-reminders.test.mjs
  - test/notif-i18n.test.mjs
  - test/i18n-core-features.test.mjs
  - CHANGELOG.md
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 37: Code Review Report

**Reviewed:** 2026-11-04 (standard depth)
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed the Phase 37 diff (base `36d30bbc^..HEAD`): deletion of the `day_before` reminder offset across producer (`server.js`), both locale catalogues, the settings copy update in EN+FR, the rewritten test pins, and the CHANGELOG release-notes entry.

The deletion is executed correctly and completely:
- All three server arms removed (offset push, snippet branch, key-ternary arm) — no `day_before`/`dayBefore` references remain in `server.js` or either catalogue.
- The `localDate >= due` catch-up predicate, prefs gates, scope predicates, and dedup-key shape are byte-identical to before (D-01/D-02 honored).
- Settings copy updated consistently in EN and FR; the old "day before + morning" wording is gone everywhere consumer-facing.
- The legacy-`dayBefore`-row i18n test was rewritten honestly: it now pins the D-06 snippet fallback (never blank, never raw-key) instead of the pre-deletion FR localization, plus a new guard that the raw key string never leaks into the render.
- Catalogue-count pin updated correctly (1674 → 1673, matching the single key deletion).
- I ran `node --test test/due-reminders.test.mjs test/notif-i18n.test.mjs test/i18n-core-features.test.mjs` — **47/47 pass**.
- CHANGELOG entry accurately describes the one-time boot catch-up burst and the inert-rows guarantee; it matches the actual code semantics (`>=` predicate + absent dedup key).

No critical issues found. One warning (dead helper) and two info items.

## Warnings

### WR-01: `addDaysIso` is now dead code in server.js

**File:** `server.js:1331-1335`
**Issue:** The only runtime caller of `addDaysIso` was the deleted `day_before` arm (`localDate >= addDaysIso(due, -1)`). After Phase 37 it has zero references in server.js — it compiles and ships but is never invoked. The planning docs indicate the upcoming digest phase will reuse it, but shipping a dead helper now means the "unused" signal is live in production source until then (lint/death-audit tools will flag it, and it can silently drift from correctness before its next consumer appears).
**Fix:** Either delete the helper with the offset (restore it in the digest phase when actually needed), or add a one-line comment tying it to its planned consumer:
```js
/* Pure YYYY-MM-DD string arithmetic via Date.UTC — never local-midnight Date
   math, which is DST-fragile. Currently unused after Phase 37 removed the
   day_before arm; the digest phase (next) is its planned consumer. */
```

## Info

### IN-01: `reminderSnippet` fall-through returns "Past due" copy for any non-`morning_of` offset

**File:** `server.js:1355-1359`
**Issue:** With `day_before` gone, the function is only ever called with `morning_of` or `past_due`, so the unguarded `return \`Past due: ${title}\`` is fine today. But it is an implicit catch-all: a future offset value (or a typo at a call site) would silently render "Past due" copy. Harmless now, a small trap later.
**Fix (optional):** Make the mapping exhaustive:
```js
function reminderSnippet(offset, task) {
  const title = task?.title || 'a task';
  return offset === 'morning_of' ? `Due today: ${title}` : `Past due: ${title}`;
}
```
(equivalent semantics, same shape as the key ternary at line 1419 — consistency).

### IN-02: Key-mapping ternary at the producer duplicates the offset→camelCase mapping logic

**File:** `server.js:1419`
**Issue:** `offset === 'morning_of' ? 'morningOf' : 'pastDue'` is correct, but the offset→catalogue-suffix mapping now exists independently in two places (the key ternary and, implicitly, `reminderSnippet`'s branch). Adding a third offset later requires touching both, and missing one yields either a raw-key render (caught by the i18n gate) or wrong snippet copy (not caught). Purely a maintainability note — no current defect.
**Fix (optional):** Hoist a single constant, e.g. `const REMINDER_OFFSETS = { morning_of: 'morningOf', past_due: 'pastDue' };` and derive both `key` and `snippet` from it.

## Verification performed

- Full read of the phase diff across all 7 files.
- `grep day_before|dayBefore` over tracked source: zero hits in `server.js`, both catalogues; remaining hits confined to planning docs and the intentional legacy-row test fixture (`test/notif-i18n.test.mjs:455`, exactly one reference as required by Plan 01).
- `test/i18n-pages.test.mjs:452` references `settings.notif.dueReminders` (plural — a different, pre-existing allow-listed undefined key with inline fallback), NOT the updated `settings.notif.dueReminder`; unaffected by the copy change.
- `node --test test/due-reminders.test.mjs test/notif-i18n.test.mjs test/i18n-core-features.test.mjs` → 47 pass, 0 fail.
- Cross-checked the catch-up semantics claim in CHANGELOG against `runReminderPass` (server.js:1366-1455): accurate.

---

_Reviewed: 2026-11-04T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
