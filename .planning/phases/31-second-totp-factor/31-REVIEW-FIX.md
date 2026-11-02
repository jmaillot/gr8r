---
phase: 31-second-totp-factor
fixed_at: 2026-11-02T00:00:00Z
review_path: .planning/phases/31-second-totp-factor/31-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 31: Code Review Fix Report

**Fixed at:** 2026-11-02
**Source review:** .planning/phases/31-second-totp-factor/31-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (CR-01, WR-01, WR-02, WR-03)
- Fixed: 4
- Skipped: 0

**Verification:** `node --check` on every touched file after each fix; full suite `npm test` → 681/681 pass (680 prior + 1 new CR-01 regression test) and `npm run lint` clean, run in the **main checkout** (`workflow.use_worktrees: false` — the project config opt-out, so no isolated worktree was used; the numbers are reproducible from this tree). The pre-existing `totp_factors` keyring format (`v2:<key-id>:<iv>:<tag>:<ct>`), the decryptTotpSecret exclusivity pin, and the per-factor replay guards are untouched. Info findings IN-01..03 are out of scope and untouched.

## Fixed Issues

### CR-01: Legacy enroll/enable routes bypass the existing-factor step-up (TOTP2-05 regression)

**Files modified:** `server.js`, `test/tfa-multi-factor.test.mjs`, `test/tfa-enrollment.test.mjs`
**Commit:** 0e922e9
**Applied fix:** Both legacy routes are now first-factor-only. `/api/auth/tfa/enroll` returns 409 `tfaNotEnabled` ("Additional factors use the add-factor flow") when `totp_factors` rows exist for the user (after the password step-up, before any secret generation). `/api/auth/tfa/enable` returns the same 409 when factor rows exist, so a stale legacy pending entry can never stack a second verifiable "Primary authenticator" row. Regression test T8b added: legacy enroll → 409 and legacy enable (with a still-pending first secret) → 409 on an account that gained a factor row. Two pre-existing tests (D-53 rotation, D-59 teardown in `tfa-enrollment.test.mjs`) exercised the now-fenced re-enroll-on-enabled-account flow; they were adapted to the new contract (rotation rides the disable teardown; D-59 derives its code from the already-enrolled secret) while keeping their original assertions intact — this is a logic-shape change, so **requires human verification** that the fenced flow matches intent.

### WR-03: `factors/enable` double-submit race inserts duplicate factor rows

**Files modified:** `server.js`
**Commit:** 61630bc
**Applied fix:** The pending entry is consumed atomically (get+delete in the same synchronous turn) before verification in BOTH enable routes (`factors/enable` and legacy `enable`). A concurrent duplicate submission now finds nothing and bails with `noPendingEnrollment` instead of inserting a second factor row. Failed verifies (wrong code) and the fail-closed MASTER_KEY path re-stash the entry, preserving existing retry semantics; the deletes inside the transactions were removed.

### WR-01: TOCTOU on `factorCount` can strand a user at 0 factors with 2FA enabled

**Files modified:** `server.js`
**Commit:** 320cbdd
**Applied fix:** The factor count is re-read INSIDE the removal transaction (Pitfall 4) and the single-delete vs disable-teardown branch now keys off the fresh count. The outside read feeds only the verify exclusion decision. Two concurrent removes of a 2-factor account can no longer both take the single-delete path into a 0-rows-but-2FA-on lockout state.

### WR-02: Throttled factor-list GET silently empties the client list

**Files modified:** `server.js`
**Commit:** 9296f1e
**Applied fix:** The `tooMany` throttle was removed from the read-only `GET /api/auth/tfa/factors` route — the reviewer's "raise/remove" option, chosen for the client-hammered read. The route leaks nothing (names + last-steps only, owner-gated via requireUser) and now matches the unthrottled `GET /api/auth/sessions` precedent. No client change needed: 429s can no longer occur on this route.

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-11-02_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
