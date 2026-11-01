---
phase: 25-keyring-version-aware-envelopes
fixed_at: 2026-10-31T19:20:00Z
review_path: .planning/phases/25-keyring-version-aware-envelopes/25-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 25: Code Review Fix Report

**Fixed at:** 2026-10-31T19:20:00Z
**Source review:** .planning/phases/25-keyring-version-aware-envelopes/25-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (WR-01, WR-02; Info items IN-01..IN-05 out of scope)
- Fixed: 2
- Skipped: 0

**Verification environment:** worktrees are disabled for this project (`workflow.use_worktrees: false`), so all edits, commits, and verification ran in the main checkout on `main`. Syntax checks: `node --check server.js`, `node --check test/totp-encryption.test.mjs`. Full test suite: `npm test` (`node --test --test-concurrency=2 test/*.test.mjs`) — **621 pass / 0 fail** after both fixes.

## Fixed Issues

### WR-01: SQL LIKE and the JS predicate disagree on case — uppercase-prefixed envelope rows silently skipped

**Files modified:** `server.js`, `test/totp-encryption.test.mjs`
**Commit:** 6adcee0
**Status:** fixed
**Applied fix:** Took the reviewer's predicate-side option (smaller change, keeps D-K6's single source of truth): `ENVELOPE_VERSION_RE` is now `/^v\d+:/i`, aligning the shared JS predicate with SQLite `LIKE`'s ASCII case-insensitivity. A `V2:...` row is now recognized by the D-K7 candidate loop and counted/warned instead of being silently dropped; `pendingRows`' `not like 'v_:%'` prefilter already excluded such rows, so there is no double-wrap exposure. The KEY-01 static guard test in `test/totp-encryption.test.mjs` was updated to pin the new `/^v\d+:/i` literal (with a comment explaining the `i` flag), so the anti-drift guard and the predicate cannot diverge.

### WR-02: Permanently-undecryptable rows drive unbounded `projects-preenvelope-*.db` accumulation

**Files modified:** `server.js`
**Commit:** 8391fc8
**Status:** fixed: requires human verification
**Applied fix:** Two-part fix, staying inside phase-25 scope (no re-wrap — that remains Phase 26):

1. **JS predicate made authoritative for the pending set.** `pendingRows()` now applies `.filter(row => !isEnvelopeVersion(row.two_fa_secret))` in addition to the SQL `not like 'v_:%'` prefilter. Even if the SQL and JS layers ever drift (the exact WR-01 drift class), an envelope-shaped row can never re-enter the backup/migration churn.
2. **Retention cap on backups.** New `prunePreenvelopeBackups()` (keep newest `PREENVELOPE_BACKUP_KEEP = 5`) runs after each successful `vacuum into` backup, deleting older `projects-preenvelope-*.db` files. Pruning is best-effort: a failure logs a warning and never blocks the migration. The sibling `projects-premultitenant-*` backups are untouched.

**Deviation from the review's described mechanism (why human verification is requested):** The review stated a permanently-undecryptable `v1:` row "is also still selected by `pendingRows()`", causing a fresh backup on every boot. Empirical verification with `node:sqlite` shows the opposite: the existing `two_fa_secret not like 'v_:%'` prefilter **already excludes** `v1:`/`V2:` rows from the pending set, so the D-83 zero-pending gate returns early and no backup is created for envelope rows (matching the SC-1 test). The real unbounded-accumulation path is a row that legitimately stays in the pending set forever — e.g. a non-base32 plaintext value that the D-75 skip leaves in place — which re-mints a backup every boot. Both fixes above address the flagged symptom (unbounded backup growth) and the flagged drift class regardless of which row class causes the churn, but the mechanism correction should be reconciled against 25-REVIEW-DISPOSITION.md by the orchestrator.

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-10-31T19:20:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
