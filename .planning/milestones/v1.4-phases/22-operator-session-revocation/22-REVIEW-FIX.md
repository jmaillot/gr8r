---
phase: 22-operator-session-revocation
fixed_at: 2026-10-29T00:00:00Z
review_path: .planning/phases/22-operator-session-revocation/22-REVIEW.md
iteration: 2
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 22: Code Review Fix Report (second pass)

**Fixed at:** 2026-10-29
**Source review:** .planning/phases/22-operator-session-revocation/22-REVIEW.md
**Iteration:** 2 (WR-01 was fixed in the first pass at commit 5a80b21; this pass covers the Info tier)

**Summary:**
- Findings in scope: 4 (IN-01, IN-02, IN-03 this pass; WR-01 already fixed at 5a80b21)
- Fixed: 4 (3 this pass + 1 prior pass)
- Skipped: 0

**Verification environment:** fixes were applied and verified in the main checkout (`workflow.use_worktrees=false` — no worktree).

## Fixed Issues

### WR-01: `stampInstanceAdmin()` silently no-ops when no user matches ADMIN_EMAIL

**Status:** already fixed in the first pass (commit `5a80b21`) — no action needed this pass.

### IN-01: `logSecurity` records a verb even when the revoke deleted zero rows

**Files modified:** `server.js`, `test/operator-revoke.test.mjs`
**Commit:** `33abedd`
**Applied fix:** Gated the security verb on actual rows deleted — `if (del.changes > 0) logSecurity(target.id, 'sessions_revoked_by_operator')` — so a 200 no-op (`revoked: 0`) no longer inserts an audit row claiming a revocation. The D-116 throttle test pinned the old semantics (4 log rows for 4 × 200 responses, three of which deleted 0 rows); its auxiliary log-count assertion was updated to expect exactly 1 real revocation row (the 200 statuses above it already assert the throttling behavior). The D-117 test at `test/operator-revoke.test.mjs:86` (real revoke, 2 rows deleted) is unchanged and still passes.

### IN-02: `refreshOperatorUsers()` fires on the tfa settings tab although the card lives only on the sessions tab

**Files modified:** `src/actions/actions.js`
**Commit:** `9923d01`
**Applied fix:** Wrapped the call — `if (p.sec === 'sessions') refreshOperatorUsers()` — so opening the Two-step sign-in tab no longer issues a wasted `GET /api/auth/operator/users`. `refreshSessions()`/`refreshTfa()` behavior on both tabs is unchanged.

### IN-03: e2e `loginWith2fa` retry assumes failure mode is `err.invalidTfaCode`

**Files modified:** `e2e/operator-revoke-cycle.spec.mjs`
**Commit:** `22c1a9b`
**Applied fix:** The retry-path visibility assertion now accepts either rejection copy (`err.invalidTfaCode` OR `err.challengeExpired`) via an alternation regex, with a new local `escapeRe()` helper so catalogue strings are matched literally. No locale string changes — no i18n pin bumps needed.

## Verification

- `node --check server.js` — pass
- `node --check src/actions/actions.js` — pass
- `node --check e2e/operator-revoke-cycle.spec.mjs` — pass
- `node --test test/operator-revoke.test.mjs` — 11/11 pass (run in the main checkout after the IN-01 fix and test update)
- The edited e2e spec was not executed (full Playwright run is out of scope for per-fix verification and the spec is not quick to run solo — server spin-up + up-to-300s TOTP-window waits); syntax check plus the spec-only reasoning above is the verification for IN-03.

## Human-verification note

IN-01 is a logic change to audit-trail semantics (success-only now means "rows actually deleted", not "200 response"). Reviewers should confirm the stricter D-117 interpretation is the intended one before ship.

---

_Fixed: 2026-10-29_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 2_
