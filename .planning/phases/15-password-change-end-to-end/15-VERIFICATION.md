---
phase: 15-password-change-end-to-end
verified: 2026-10-27T11:00:00Z
status: passed
score: 6/6 must-haves verified
covered_files:
  - .planning/phases/15-password-change-end-to-end/15-01-PLAN.md
  - .planning/phases/15-password-change-end-to-end/15-02-PLAN.md
  - .planning/phases/15-password-change-end-to-end/15-03-PLAN.md
  - .planning/phases/15-password-change-end-to-end/15-01-SUMMARY.md
  - .planning/phases/15-password-change-end-to-end/15-02-SUMMARY.md
  - .planning/phases/15-password-change-end-to-end/15-03-SUMMARY.md
  - server.js
  - test/password-change.test.mjs
  - test/password-copy-honesty.test.mjs
  - test/i18n-pages.test.mjs
  - test/auth-revoked.test.mjs
  - src/core/api.js
  - src/actions/actions.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/pages/settings.js
covered_digest: "v2:sha256:ab49116e8ec60021e2a99c76739eb2321fa0c5829bb21d3f3ba627a791754950"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/6
  gaps_closed:
    - "Success copy states what actually happened (PASS-03) — settings.pw.done now states other sessions were signed out (EN+FR), guarded by test/password-copy-honesty.test.mjs"
  gaps_remaining: []
  regressions: []
---

# Phase 15: Password Change End-to-End Verification Report

**Phase Goal:** The password-change form stops lying: the server verifies the current password, the new password works at the next login, and all other sessions die atomically with the rehash — reusing Phase 14's revocation primitive.
**Verified:** 2026-10-27 (re-verification after gap closure)
**Status:** passed
**Re-verification:** Yes — after gap closure (plan 15-03, commits 1ae336a, 357a4ec, 8ed48c0)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | PATCH /api/auth/password rehashes with scrypt and revokes every other session in one transaction; old password fails next login, new one succeeds (PASS-01) | ✓ VERIFIED | Carried forward from initial verification (server.js:1340–1369 — spot-check confirmed the `transaction()` block, fresh tokenHash from caller cookie, and keep-current `delete from sessions where user_id = ? and token_hash != ?` are unchanged); test/password-change.test.mjs 5/5 pass in this re-run |
| 2 | With two live cookies, change in browser A leaves B's next request 401 while A stays signed in (PASS-02) | ✓ VERIFIED | Carried forward — test/password-change.test.mjs 5/5 pass in this re-run; server transaction spot-checked unchanged |
| 3 | Wrong current password → 403 wrongCurrentPassword, hash unchanged, sessions untouched (PASS-01) | ✓ VERIFIED | Carried forward — test/password-change.test.mjs 5/5 pass in this re-run |
| 4 | Throttle `pwchange|user.id` 10/15min, generic tooManyAttempts, no Retry-After (D-40/41/42) | ✓ VERIFIED | Carried forward (server.js:1348, unchanged — transaction spot-check) |
| 5 | Client submits via A.savePassword → api.changePassword → PATCH /api/auth/password; on success honest toast AND honest banner, fields cleared, sessions refreshed (PASS-03) | ✓ VERIFIED | **Gap 1 closed.** en.json:1242 `settings.pw.done` = "Password updated. Your other sessions were signed out."; fr.json:1242 = "Mot de passe mis à jour. Vos autres sessions ont été déconnectées." — matches the server's revoke-others behavior and the already-honest toast. Render path confirmed at settings.js:382 (the banner div renders `t('settings.pw.done')` when `S.ui.pwDone`). Guard test password-copy-honesty.test.mjs 3/3 pass |
| 6 | Wrong 403 clears only the current field, keeps the new input (D-39); revoked second browser rides the central 401 intercept (D-44) | ✓ VERIFIED | Carried forward — test/auth-revoked.test.mjs D-44 test passes (full suite green) |

**Score:** 6/6 truths verified (0 present, behavior-unverified)

### Oracle Deviation Audit (15-03)

The 15-03 SUMMARY declared one deviation: `test/i18n-pages.test.mjs:483` pinned the falsified EN string and had to be updated. **Verified legitimate:** the oracle now asserts `'Password updated. Your other sessions were signed out.'` — the exact honest value; the FR oracle reads fr.json dynamically (no change needed); test/i18n-pages.test.mjs 17/17 pass. No other oracle line touched.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| server.js PATCH /api/auth/password | Route block with transaction + keep-current | ✓ VERIFIED | server.js:1340–1369, unchanged since initial verification |
| test/password-change.test.mjs | Real-server integration tests for PASS-01/02 | ✓ VERIFIED | 5 pass / 0 fail (this re-run) |
| test/password-copy-honesty.test.mjs | Honesty regression guard (new in 15-03) | ✓ VERIFIED | 3 tests: EN honest phrase present + falsified absent, FR déconnectées present + restent connectées absent, JSON parse guard. Substring-level — future honest rewordings stay green |
| test/auth-revoked.test.mjs (extended) | Central-intercept + D-44 proof | ✓ VERIFIED | Passes within full suite |
| src/core/api.js changePassword() | Client entry point | ✓ VERIFIED | api.js:250–253 (carried forward, untouched) |
| src/actions/actions.js A.savePassword | Real call, stub removed | ✓ VERIFIED | actions.js:2377–2431 (carried forward, untouched) |
| err.* + honest toast + honest banner keys en/fr | Catalogued EN+FR | ✓ VERIFIED | settings.pw.done now honest in both locales; i18n-scan: 0 literals, 0 pending, 0 unlisted, 0 stale, 0 unresolved |

### Key Link Verification

Carried forward from initial verification — all five links (transaction → verify/update/keep-current delete; savePassword → api.changePassword → PATCH; err codes → t('err.'+code); success → refreshSessions) confirmed WIRED and untouched by 15-03 (15-03 modified only en.json, fr.json, test/i18n-pages.test.mjs, and added the guard test).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| i18n catalogue hygiene | `node scripts/i18n-scan.mjs` | 0 literals, 0 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch | ✓ PASS |
| Honesty guard (Gap 1 closure) | `node --test test/password-copy-honesty.test.mjs` | 3 pass / 0 fail | ✓ PASS |
| PASS-01/02 integration tests | `node --test test/password-change.test.mjs` | 5 pass / 0 fail | ✓ PASS |
| EN i18n oracle vs honest banner | `node --test test/i18n-pages.test.mjs` | 17 pass / 0 fail | ✓ PASS |
| Full suite | `npm test` | 471 pass / 0 fail | ✓ PASS |

### Probe Execution

No probe scripts declared for this phase. SKIPPED — integration tests above serve as the behavioral evidence.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| PASS-01 | 15-01 | Current password verified server-side, new password works at next login | ✓ SATISFIED | server.js:1340–1369 + password-change tests (5/5 this re-run) |
| PASS-02 | 15-01, 15-02 | All other sessions revoked automatically at password change | ✓ SATISFIED | One-transaction revoke-others + keep-current; two-cookie test passes |
| PASS-03 | 15-02, 15-03 | Success copy states what actually happened | ✓ SATISFIED | Toast + banner now both honest (EN+FR); honesty guard prevents regression |

No orphaned requirements. REQUIREMENTS.md already marks PASS-01/02/03 `[x]` / Complete.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None. Prior blockers (dishonest banner EN/FR) resolved by 1ae336a. No TBD/FIXME/XXX debt markers in phase-modified files. | — | — |

### Human Verification Required

None. All automated checks pass; the honesty invariant is now guarded by a deterministic test.

### Gaps Summary

**Gap 1 (the only gap) is closed.** Root cause was a two-line locale omission; 15-03 fixed both locales (commit 1ae336a), added a substring-level honesty regression guard (357a4ec), and legitimately updated the one EN oracle that had pinned the falsified string (verified above). The server transaction, wiring, and previously-verified truths were spot-checked and remain intact. Full suite: 471/471. Phase goal achieved — the password-change form no longer lies at any surface.

---

_Verified: 2026-10-27 (re-verification)_
_Verifier: the agent (gsd-verifier)_
