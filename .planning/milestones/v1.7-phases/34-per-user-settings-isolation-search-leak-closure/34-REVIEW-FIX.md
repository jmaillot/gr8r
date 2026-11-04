---
phase: 34-per-user-settings-isolation-search-leak-closure
fixed_at: 2026-11-03T15:05:00Z
review_path: .planning/phases/34-per-user-settings-isolation-search-leak-closure/34-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 34: Code Review Fix Report

**Fixed at:** 2026-11-03T15:05:00Z
**Source review:** .planning/phases/34-per-user-settings-isolation-search-leak-closure/34-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3 (WR-01, WR-02, WR-03 — Info items IN-01/02/03 excluded per `fix_scope: critical_warning`)
- Fixed: 3
- Skipped: 0

**Verification:** syntax checks (`node --check`) on every modified JS file; targeted `node --test` for `test/redaction.test.mjs` (26/26) and `test/notif-prefs.test.mjs` (12/12); full `npm test`: 885 tests, 881 pass, 3 skipped, 1 fail — the single failure is the known pre-existing `test/dependencies.test.mjs` Dockerfile COPY allowlist failure (not touched by this run; the allowlist diff it reports is the phase-34 `src/` directory, which predates these fixes). All tests ran in the main checkout (no worktree — `workflow.use_worktrees: false`).

## Fixed Issues

### WR-01: PUT `/api/me/notif-prefs` replaces the whole stored row

**Files modified:** `server.js`, `test/notif-prefs.test.mjs`
**Commit:** 3edf0b0
**Applied fix:** The route now reads the existing `user_notif_prefs` row, JSON-parses it defensively (corrupt blob → `{}`), spreads it as the base, then applies the whitelisted incoming keys with Boolean coercion. A partial body can no longer erase stored keys. Added test (c2): a single-key PUT preserves a previously stored `false` and other stored keys. Adapted test (i): under merge semantics, the cross-user full-object equality test now writes the same full 13-key object for both users (different key insertion order preserved) so the comparison stays well-defined.

### WR-02: `migrateUserNotifPrefs` guard can leave `data.notifPrefs` in the stored doc forever

**Files modified:** `server.js`, `test/notif-prefs.test.mjs`
**Commit:** f0a95a7
**Applied fix:** The eligibility guard is now "the doc carries `data.notifPrefs`" alone; the per-member missing-row scan was removed from the guard. Row backfill stays in the same transaction and relies on the existing `insert or ignore` to keep any per-user row the user already set. The strip still happens in the same `begin immediate` transaction (D-11), and the guard is false forever after the first migrating boot (byte-identical second boot preserved). Added test (i2): plants a legacy doc field while every member already has a row, restarts the server, and asserts the field is stripped and the per-user row survives un-overwritten.

### WR-03: Tokenized matcher misses hidden names with no letter/number tokens

**Files modified:** `src/lib/redaction.js`, `test/redaction.test.mjs`
**Commit:** beb9138
**Applied fix:** `referencesHidden` keeps the tokenized matcher as the primary path but adds a substring fallback for tokenless hidden names (NFC-normalize + lowercase + trim both sides, `includes`). Symbol-only names (`###`, `***`) and names whose distinguishing part is symbolic (`###-internal`) regain the pre-34-03 protection without reintroducing substring false-positives for tokenized names. Added four table rows (section i) pinning the fallback and its non-over-match boundary.

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-11-03T15:05:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
