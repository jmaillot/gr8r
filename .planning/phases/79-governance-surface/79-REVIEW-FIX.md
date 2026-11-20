---
phase: 79-governance-surface
fixed_at: 2026-11-20T00:00:00Z
review_path: .planning/phases/79-governance-surface/79-REVIEW.md
iteration: 3
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 79: Code Review Fix Report

**Fixed at:** 2026-11-20
**Source review:** .planning/phases/79-governance-surface/79-REVIEW.md
**Iteration:** 3 (this pass fixes the single standing IN-04; prior findings carried forward)

**Summary:**
- Findings in scope: 8
- Fixed: 8
- Skipped: 0

## Fixed Issues

### IN-04: Orphan modal allows selecting "reassign" when zero destinations exist

**Files modified:** `src/actions/actions.js`, `src/locales/en.json`, `src/locales/fr.json`, `src/locales/de.json`, `src/locales/es.json`, `src/locales/nl.json`, `test/i18n-core-features.test.mjs`
**Commit:** c0b1de50
**Applied fix:** The keyed-refusal path (the reviewer's option B), consistent with the existing `err.*` toast patterns. `A.govOrphanPick` now refuses `reassign` client-side when `S.ui.govOrphan.targets` is empty — it shows a keyed `err.noReassignTargets` toast and leaves the member unresolved (the D-06 footer stays disabled), instead of producing the generic `notFound` 404 toast after a doomed round-trip. The new key was added to all 5 locale catalogues; the French copy uses curly apostrophes per the D-05 typography gate ("n'est", verified byte-level: 0 straight `'` in the value). The catalogue-size pin in `test/i18n-core-features.test.mjs` was bumped 2008 → 2009 with a ledger comment.
**Status:** fixed (logic is a simple guard; the disposition state is untouched when the refusal fires — verified by re-read)

### CR-01: Members read route (carried forward)

**Commit:** a0e61849 — verified in re-review (server.js:7018-7042, guard order D-09, 404-before-listing, targets exclude delete target + archived).

### CR-02: Orphan modal title XSS (carried forward)

**Commit:** ee9c9397 — verified in re-review (governance.js:187 escapes `ws.name` before `t()`; safe per tFor/interpolate).

### WR-01: Parameter-free memberAlreadyMember (carried forward)

**Commit:** 7706e4a0 (+ f52704ea fr.json typography follow-up) — verified in re-review.

### WR-02: Archived reassign refusal (carried forward)

**Commit:** 53278ea3 — verified in re-review (both paths, 409 pre-transaction, test (e)).

### IN-01: Dead code (carried forward)

**Commit:** 6bf55c6d — verified in re-review (dead action/api methods + 4 orphaned locale keys removed; counters green).

### IN-02: a11y labels (carried forward)

**Commit:** 14674145 — verified in re-review (dedicated `page.governance.searchWs` key).

### IN-03: Stale comment (carried forward)

**Commit:** c1f02722 — verified in re-review (settings.js pointer updated).

## Skipped Issues

None.

## Verification

All verification ran in the **main checkout** (workflow.use_worktrees=false — no worktree was created):

- JSON validity: all 5 locale files parse (`node -e "JSON.parse(...)"` — no BAD output)
- Syntax: `node --check src/actions/actions.js` — clean
- Touched suites: `node --test test/governance.test.mjs test/governance-client.test.mjs test/i18n-core-features.test.mjs` — 56 pass, 0 fail
- Catalogue parity: `node --test test/build-locales.test.mjs` — 0 fail
- French typography (D-05): the new `err.noReassignTargets` value contains only curly apostrophes (byte-level grep: 1 `’`, 0 `'`)

---

_Fixed: 2026-11-20_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 3_
