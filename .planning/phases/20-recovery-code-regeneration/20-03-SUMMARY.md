---
phase: 20-recovery-code-regeneration
plan: 03
subsystem: settings-ui/i18n
tags: [g-20-1, gap-closure, 2fa, css, i18n]
requires: [20-02]
provides:
  - short row-level labels for the 2FA on-state card (G-20-1 resolved)
  - wrap-tolerant .srow control cluster
affects: [phase-21-disable-route]
key-files:
  created: []
  modified:
    - src/pages/settings.js
    - src/locales/en.json
    - src/locales/fr.json
    - src/styles/pages/settings.css
    - test/i18n-core-features.test.mjs
decisions:
  - reused existing act.turnOff key for the row-level disable button (no new key)
  - scoped the wrap rule to .srow > .row (the srow() control-cell container), grid template untouched
  - i18n catalogue pin bumped 1581→1582 (found during Task 2 npm test, Rule 3)
metrics:
  duration: 12m
  tasks: 2
  commits: 3
status: complete
---

# Phase 20 Plan 03: 2FA On-State Card Text Fix (G-20-1) Summary

**One-liner:** Shortened the 2FA on-state row buttons (settings.tfa.regenShort + reused act.turnOff) and made the .srow control cluster wrap so the description text renders on readable lines instead of one word per line.

## What Was Done

- **Task 1:** Added `settings.tfa.regenShort` ("Regenerate" / "Régénérer") adjacent to the existing `settings.tfa.regen` block in both locales. The on-state srow buttons (settings.js) now use `t('settings.tfa.regenShort')` and `t('act.turnOff')` — data attributes and button classes unchanged. Step-up form labels untouched.
- **Task 2:** Added `.srow > .row { flex-wrap: wrap; justify-content: flex-end; row-gap: var(--s-2); }` in settings.css. The `.srow` grid template (`minmax(0,1fr) auto`) is unchanged; responsive.css untouched.

## Verification

- `npm run i18n:scan` — green (0 issues; new key present in EN + FR).
- `npm test` — green: 547 pass, 0 fail.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] i18n catalogue pin bumped 1581→1582**
- **Found during:** Task 2 (npm test revealed the pinned count in test/i18n-core-features.test.mjs:216)
- **Issue:** Plan Task 1 step 4 anticipated a pinned key count; the grep in Task 1 missed it (it lives in the test suite, not src/scripts), so Task 2's npm test failed with `1582 !== 1581`.
- **Fix:** Bumped `assert.equal(keys.length, …)` to 1582 and appended `+ settings.tfa.regenShort, phase 20 plan 3` to the test title ledger.
- **Files modified:** test/i18n-core-features.test.mjs
- **Commit:** 6f01fc4

## Notes

- No disable-route (Phase 21) behavior touched, per plan prohibitions.
- i18n-scan itself is the primary gate; the pinned count test is the secondary catalogue-size guard, now consistent.
- Visual confirmation (per plan verification step 3) remains for the user: Settings → 2FA enabled, French UI, text wraps naturally with short "Régénérer" / "Désactiver" buttons.

## Self-Check: PASSED

- src/pages/settings.js, src/locales/en.json, src/locales/fr.json, src/styles/pages/settings.css — all modified as specified.
- Commits bd31a9b, b3d2a3d, 6f01fc4 verified in git log.
