---
phase: 15-password-change-end-to-end
verified: 2026-10-27T00:00:00Z
status: gaps_found
score: 5/6 must-haves verified
covered_files:
  - .planning/phases/15-password-change-end-to-end/15-01-PLAN.md
  - .planning/phases/15-password-change-end-to-end/15-02-PLAN.md
  - .planning/phases/15-password-change-end-to-end/15-01-SUMMARY.md
  - .planning/phases/15-password-change-end-to-end/15-02-SUMMARY.md
  - server.js
  - test/password-change.test.mjs
  - test/auth-revoked.test.mjs
  - src/core/api.js
  - src/actions/actions.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/pages/settings.js
covered_digest: "v2:sha256:ab49116e8ec60021e2a99c76739eb2321fa0c5829bb21d3f3ba627a791754950"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Success copy states what actually happened (PASS-03 honest-copy rule) — the success banner `settings.pw.done` renders ABOVE the form at src/pages/settings.js:382 and says the opposite of reality: 'Password updated. Other sessions stay signed in.' while the server revokes every other session in the same transaction (server.js:1365). Same in FR: 'Les autres sessions restent connectées.'"
    status: failed
    reason: "The 15-02 plan explicitly required the existing banner to be made honest ('the existing settings.pw.done banner stays alongside the toast — both honest'), and the 15-02 SUMMARY claims 'banner stays alongside the toast — both honest'. The banner key was never updated. The toast (toast.passwordUpdatedAll) is honest, but the persistent banner directly contradicts it and is the exact 'lying copy' this phase exists to eliminate. This is the opposite of the intended fix on the first thing the user reads after a successful change."
    artifacts:
      - path: src/locales/en.json
        issue: "Line 1242: settings.pw.done = 'Password updated. Other sessions stay signed in.' — false statement"
      - path: src/locales/fr.json
        issue: "Line 1242: settings.pw.done = 'Mot de passe mis à jour. Les autres sessions restent connectées.' — false statement"
      - path: src/pages/settings.js
        issue: "Line 382 renders settings.pw.done whenever S.ui.pwDone is true — the dishonest copy is user-visible"
    missing:
      - "Rewrite settings.pw.done in en.json and fr.json to state the truth, e.g. EN: 'Password updated. Your other sessions were signed out.' / FR: 'Mot de passe mis à jour. Vos autres sessions ont été déconnectées.'"
---

# Phase 15: Password Change End-to-End Verification Report

**Phase Goal:** The password-change form stops lying: the server verifies the current password, the new password works at the next login, and all other sessions die atomically with the rehash — reusing Phase 14's revocation primitive.
**Verified:** 2026-10-27
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | PATCH /api/auth/password rehashes with scrypt and revokes every other session in one transaction; old password fails next login, new one succeeds (PASS-01) | ✓ VERIFIED | server.js:1340–1369 (sameOrigin → requireUser → tooMany → readJson → strength → `transaction()` wrapping re-select + verifyPassword + update + keep-current delete); test/password-change.test.mjs:66–87 asserts B's next request 401, A stays 200, old login 401, new login 200 — 5/5 tests pass |
| 2 | With two live cookies, change in browser A leaves B's next request 401 while A stays signed in (PASS-02) | ✓ VERIFIED | test/password-change.test.mjs:78–81 (`bProbe` 401 `signInRequired`, session A `/api/auth/sessions` still 200) — passes |
| 3 | Wrong current password → 403 wrongCurrentPassword, hash unchanged, sessions untouched (PASS-01) | ✓ VERIFIED | server.js:1367; test:47–63 asserts byte-identical hash and both sessions still 200 — passes |
| 4 | Throttle `pwchange|user.id` 10/15min, generic tooManyAttempts, no Retry-After (D-40/41/42) | ✓ VERIFIED | server.js:1348 (`tooMany('pwchange|' + user.id, 10, 15*60*1000)`), no Retry-After header in the fail() call |
| 5 | Client submits via A.savePassword → api.changePassword → PATCH /api/auth/password; on success honest toast, fields cleared, sessions refreshed (PASS-03) | ✗ FAILED | The wiring is real (actions.js:2377–2431, api.js:250–253, toast.passwordUpdatedAll EN/FR honest, refreshSessions() at actions.js:2424) — but the success BANNER `settings.pw.done` (settings.js:382, shown whenever S.ui.pwDone) still says "Other sessions stay signed in." / "Les autres sessions restent connectées." — the exact lie PASS-03 bans. The 15-02 SUMMARY claim "both honest" is false. |
| 6 | Wrong 403 clears only the current field, keeps the new input (D-39); revoked second browser rides the central 401 intercept (D-44) | ✓ VERIFIED | actions.js:2399–2410 maps wrongCurrentPassword/passwordRequired to e.pwCur; settings.js:384 round-trips S.ui.pwNew through the value binding; test/auth-revoked.test.mjs:82–92 ('D-44' test) — 7/7 tests pass |

**Score:** 5/6 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| server.js PATCH /api/auth/password | Route block with transaction + keep-current | ✓ VERIFIED | server.js:1340–1369, substantive, routed in the /api/auth/* family |
| test/password-change.test.mjs | Real-server integration tests for PASS-01/02 | ✓ VERIFIED | 5 tests, all pass (1.4s) |
| test/auth-revoked.test.mjs (extended) | Central-intercept + D-44 proof | ✓ VERIFIED | 7 tests, all pass |
| src/core/api.js changePassword() | Client entry point | ✓ VERIFIED | api.js:250–253, calls PATCH /api/auth/password |
| src/actions/actions.js A.savePassword | Real call, stub removed | ✓ VERIFIED | actions.js:2377–2431; no fake success |
| err.* + honest toast keys en/fr | Catalogued EN+FR | ⚠️ PARTIAL | err.wrongCurrentPassword, err.passwordRequired, toast.passwordUpdatedAll all present EN+FR — but settings.pw.done is dishonest (the gap) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| transaction() | verify + update + keep-current delete | server.js:1358–1365 | WIRED | One `transaction(fn)`; keep-current excludes the caller's own cookie hash (Pitfall 9 honored — tokenHash from `parseCookies(req.headers.cookie)` at :1357) |
| A.savePassword | api.changePassword | actions.js:2396 | WIRED | `await api.changePassword(cur, nw)` |
| api.changePassword | PATCH /api/auth/password | api.js:251–252 | WIRED | `call('PATCH', '/api/auth/password', { currentPassword, newPassword })` |
| server 403/400 codes | t('err.' + code) | actions.js:2402–2405 | WIRED | Codes map to the catalogue; fr.json:295–296 present |
| success | refreshSessions() | actions.js:2424 | WIRED | `await refreshSessions()` after pwDone=true |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| password route | row.password_hash | `select password_hash from users where id = ?` (server.js:1360) | Yes | ✓ FLOWING |
| sessions revocation | tokenHash | caller's own cookie, sha256 (server.js:1357) | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| PASS-01/02 integration tests | `node test/password-change.test.mjs` | 5 pass / 0 fail | ✓ PASS |
| Central 401 intercept + D-44 | `node test/auth-revoked.test.mjs` | 7 pass / 0 fail | ✓ PASS |
| Full suite | `npm test` | 468 pass / 0 fail (29.4s) | ✓ PASS |

### Probe Execution

No probe scripts declared for this phase (grep of PLAN/SUMMARY found no probe-* paths). SKIPPED — the integration tests above serve as the behavioral evidence.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| PASS-01 | 15-01 | Current password verified server-side, new password works at next login | ✓ SATISFIED (server core) | server.js:1340–1369 + password-change tests 1–3 |
| PASS-02 | 15-01, 15-02 | All other sessions revoked automatically at password change | ✓ SATISFIED | One-transaction revoke-others + keep-current; two-cookie test passes |
| PASS-03 | 15-02 | Success copy states what actually happened | ✗ BLOCKED | Toast honest, but banner `settings.pw.done` states the opposite — see Gap 1 |

No orphaned requirements: REQUIREMENTS.md maps exactly PASS-01/02/03 to Phase 15, all claimed across the two plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| src/locales/en.json | 1242 | False success copy ("Other sessions stay signed in.") | 🛑 Blocker | PASS-03 violated on the banner users actually read |
| src/locales/fr.json | 1242 | Same false copy in French | 🛑 Blocker | Same |

No TBD/FIXME/XXX debt markers in any phase-modified file. No stubs — the former fake-success stub in actions.js is fully replaced.

### Human Verification Required

None beyond the gap. All automated checks passed.

### Gaps Summary

One gap, one root cause: the 15-02 plan ordered the existing `settings.pw.done` banner to be made honest ("both honest") and the SUMMARY claims this was done, but the key was never touched in either locale. The toast is honest; the banner above the form still declares the opposite of what the server does. Fix is a two-line locale edit (en.json/fr.json:1242) plus nothing else — the transaction, route, wiring, and tests are all sound.

This looks intentional only in the sense of an oversight (pre-existing key assumed honest). If the banner is deemed acceptable as-is, add an override to VERIFICATION.md frontmatter — but note it directly contradicts the phase goal ("the form stops lying") and SC4's honest-copy rule, so an override is not recommended.

---

_Verified: 2026-10-27_
_Verifier: the agent (gsd-verifier)_
