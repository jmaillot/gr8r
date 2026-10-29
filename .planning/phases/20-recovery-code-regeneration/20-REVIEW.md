---
phase: 20-recovery-code-regeneration
reviewed: 2026-10-29T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/locales/en.json
  - src/locales/fr.json
  - src/pages/settings.js
  - src/styles/pages/settings.css
  - test/i18n-core-features.test.mjs
findings:
  critical: 0
  warning: 0
  info: 1
  total: 1
status: findings
---

# Phase 20: Code Review Report (incremental — wave 3 / plan 20-03, G-20-1)

**Reviewed:** 2026-10-29 (incremental scope: changes since `c0fbb5246707282d77e03533c13e96345b6a1709`)
**Depth:** standard
**Files Reviewed:** 5
**Status:** findings

## Summary

Incremental review of the plan 20-03 gap closure: the short row-level labels (`settings.tfa.regenShort` added to both locales, row buttons swapped to `settings.tfa.regenShort` / `act.turnOff`), the `.srow > .row` flex-wrap rule, and the i18n catalogue pin bump to 1582.

Verified directly:

- `act.turnOff` exists in both catalogues (en.json:150 "Turn off" / fr.json:151 "Désactiver"); `settings.tfa.regenShort` was added to en.json and fr.json at symmetric positions (en.json:1284 / fr.json:1284).
- No key was orphaned by the swap: `settings.tfa.regen` is still used as the regen form's submit label (settings.js:427) and `settings.tfa.turnOff` as the disable form's confirm label (settings.js:416), exactly as the plan required ("only the row-level buttons shorten").
- Catalogue count verified programmatically: both en.json and fr.json contain exactly 1582 keys; the only en−fr divergence is the intentional `contract.englishOnly` marker. `node --test test/i18n-core-features.test.mjs` → 14 pass, 0 fail.
- CSS: `--s-2` is defined (tokens.css:63). The `.srow > .row` selector is well-scoped — `.srow` markup exists only in `src/pages/settings.js` (the generic `.row` class is not over-matched because the selector is prefixed with `.srow >`). The responsive single-column fallback (responsive.css:257) keeps the rule harmless on mobile: controls wrap within a full-width row.
- No secrets, no injection vectors, no dead code introduced by the diff.

## Info

### IN-01: Stale "1549 keys" prefix inside the catalogue-size test title

**File:** `test/i18n-core-features.test.mjs:216`
**Issue:** The test title still opens with "— 1549 keys (" while the assertion right below pins the count at 1582 and the parenthetical ledger correctly accumulates every addition since. The prefix is a historical leftover that contradicts the actual assertion and grows more misleading with every wave.
**Fix:** Drop the hardcoded prefix from the title (e.g. start at "the catalogue holds after … (+ err.fileNotFound …)") or update it to the current count; the ledger list already tells the whole story.

---

_Reviewed: 2026-10-29_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
