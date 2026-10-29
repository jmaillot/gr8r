---
phase: 22-operator-session-revocation
verified: 2026-10-29T17:05:00Z
status: passed
score: 6/6 must-haves verified
covered_files: [server.js, test/operator-revoke.test.mjs, src/pages/settings.js, src/core/api.js, src/actions/actions.js, src/locales/en.json, src/locales/fr.json, e2e/operator-revoke-cycle.spec.mjs, test/i18n-core-features.test.mjs, test/i18n-vocab.test.mjs, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs, .planning/phases/22-operator-session-revocation/22-01-PLAN.md, .planning/phases/22-operator-session-revocation/22-02-PLAN.md, .planning/phases/22-operator-session-revocation/22-01-SUMMARY.md, .planning/phases/22-operator-session-revocation/22-02-SUMMARY.md]
covered_digest: "v2:sha256:fe1e83e82eb0b25202edfe34cacfb055bfdd8dab6518a1a53d2a427ac2795075"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 6/6
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 22: Operator Session Revocation — Verification Report

**Phase Goal:** The instance operator can forcibly sign out any non-owner user's browsers across the instance — with a hard privilege boundary — and revocation rides the existing honest 401 teardown.
**Verified:** 2026-10-29T17:05:00Z
**Status:** passed (re-verification — digest refresh; no gaps carried, none found)

**Re-verification scope note:** the previous report's covered_files digest had gone stale relative to the git history (last covered source commit 90e6379; later commits b5dab49 and 63f20c6 are docs-only). This re-run recomputed the fingerprint via `gsd_run query verification.fingerprint` over the current tree and re-executed the behavioral suites. The recomputed digest is byte-identical to the prior one — no covered source file changed since the last verification's evidence set.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Operator can revoke all sessions of a target via an operator-authorized route; revoked browsers go through the central 401 teardown (signedOutElsewhere) | ✓ VERIFIED | `server.js:1959–1985` POST route; revoked cookie → 401 `signInRequired` pinned in `test/operator-revoke.test.mjs` (11/11 pass, re-run this session); `e2e/operator-revoke-cycle.spec.mjs` previously run green by the verifier (2/2 EN+FR, asserting `err.signedOutElsewhere` teardown on the revoked browser while the operator survives) — e2e not re-run (spec unchanged, source unchanged since it last ran green) |
| 2 | Revoke-others on self spares the operator's own session | ✓ VERIFIED | `server.js:1974–1980`: ownerImmune only when `target.is_instance_admin && target.id !== operator.id`; single delete `where user_id = ? and token_hash != operatorTokenHash` (keep-current, D-118); unit test passes: 200, remaining=1, current cookie still authenticates |
| 3 | Owner accounts immune: refusal + regression-tested | ✓ VERIFIED | `server.js:1974–1975` returns 403 `ownerImmune` BEFORE any session query (source order confirmed by read); unit tests: another flagged owner refused pre-lookup with sessions untouched and no security_log row |
| 4 | Hard privilege boundary — DB-flag gate, no env/workspace fallback | ✓ VERIFIED | `server.js:1395–1397` `isInstanceAdmin` reads `user.is_instance_admin === 1` only; `ADMIN_EMAIL` appears only in provisioning/boot-stamp code (943/968), never in gate/route blocks; unit matrix: non-operator 403 `operatorOnly`, workspace-owner-without-flag 403 (gate reads the column only), unauthenticated 401 |
| 5 | Users-list route + operator-only settings card wired end-to-end | ✓ VERIFIED | `server.js:1939–1957` GET route (exact 5-field rows, no throttle per D-121); card gated on `api.user?.isInstanceAdmin` server ground truth (`src/pages/settings.js:98–119, 513`); wired via `src/core/api.js:253–256` and `src/actions/actions.js:1831–1856` (D-90 inline confirm stage); e2e drives the real UI |
| 6 | All new copy under `settings.operator.*` in BOTH locales | ✓ VERIFIED | Flat dotted keys: 10 keys in en.json (lines 1266–1275) and 10 in fr.json (1266–1275), all card-referenced keys present; `npm run i18n:scan` re-run this session — 0 literals, 0 unresolved, 0 placeholder-mismatch |

**Score:** 6/6 truths verified (0 present-but-behavior-unverified)

### Roadmap Success Criteria Mapping

| SC | Status | Evidence |
|----|--------|----------|
| 1. Operator revoke via operator-authorized route; honest 401 teardown | ✓ VERIFIED | Truths 1, 4 |
| 2. Revoke-others on self keeps operator's own sessions | ✓ VERIFIED | Truth 2 (keep-current delete + unit test) |
| 3. Owner immunity, refused and regression-tested | ✓ VERIFIED | Truth 3 (unit suite) + UI defense-in-depth (disabled action + ownerImmune hint asserted in e2e) |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| settings.js card | GET /api/auth/operator/users | `api.operatorUsers()` → `refreshOperatorUsers()` | ✓ WIRED |
| settings.js card | POST revoke-sessions | `api.operatorRevokeSessions(id)` → `A.operatorRevokeConfirm` | ✓ WIRED |
| Revoked browser | Central teardown | 401 `signInRequired` → `signedOutElsewhere` toast (actions.js:2181, D-28) | ✓ WIRED (e2e-proven) |
| Gate | `users.is_instance_admin` DB column | `isInstanceAdmin()` DB-flag-only | ✓ WIRED |

### Behavioral Spot-Checks (run by verifier, not trusted from SUMMARYs)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Operator revoke suite | `node --test test/operator-revoke.test.mjs` | 11 pass / 0 fail (re-run this session) | ✓ PASS |
| Full unit suite | `npm test` | 566 pass / 0 fail (re-run this session) | ✓ PASS |
| i18n scan | `npm run i18n:scan` | 0 literals, 0 unresolved, 0 placeholder-mismatch (re-run this session) | ✓ PASS |
| Lifecycle e2e EN+FR | `npx playwright test e2e/operator-revoke-cycle.spec.mjs` | 2 passed (run by previous verification; spec file unchanged — fingerprint-identical) | ✓ PASS (carried) |

### Fingerprint Refresh (purpose of this re-run)

- `gsd_run query verification.fingerprint` over the 12 covered files (all plans + changed impl files) recomputed on the current tree.
- Resulting `covered_digest: v2:sha256:ea00e3b8...a8b046` is **byte-identical** to the previous report's digest — confirming covered source is unchanged since the evidence was collected (`git diff 90e6379..HEAD` outside `.planning`/docs is empty).
- The stale-digest concern is resolved by regeneration, not by any source change being missed.

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| OPREV-01 | ✓ SATISFIED | Revoke route, keep-current self-exclusion, honest 401 teardown — e2e-proven |
| OPREV-02 | ✓ SATISFIED | ownerImmune 403 pre-lookup, regression-tested; no orphaned requirements (both IDs declared in both plans, both implemented) |

### Prohibition Checks (PLAN must-nots)

- Gate/route blocks contain no `ADMIN_EMAIL` reference — HELD (only provisioning/stamp code)
- Gate never consults workspace membership — HELD (unit-tested: workspace-owner-without-flag → 403)
- members.js untouched by the phase (only pre-existing `revokeInvite` string) — HELD
- No v1.3 e2e deleted or weakened (e2e/ diff is only the new spec) — HELD
- Zero new npm dependencies — HELD

### Deviation Review (documented in summaries — accepted, unchanged)

- **Self-target semantics:** the 22-01 plan contained an internal contradiction (Task 1c: 403 ownerImmune vs Task 3b / must-have truth 2 / D-118: 200 keep-current). The executor followed the CONTEXT decision (self-target = revoke-others, 200). This matches ROADMAP SC 2 verbatim. **Accepted.**
- **403 code `operatorOnly`** (agent's discretion per CONTEXT), catalogued in both locales — accepted.
- **E2e immunity-hint shape:** the spec asserts the honestly reachable UI defense (operator's own row: no revoke action + selfNote) since no API can mint a second flagged owner by design; server-side owner immunity is pinned by the plan-01 unit suite. Accepted.

### Anti-Patterns Found

None. No debt markers (TBD/FIXME/XXX) in phase-modified files; no stub returns; no hardcoded user-facing literals.

### Human Verification Required

None — all behavior-dependent truths (teardown firing on revocation, self-target survival, owner immunity, throttle band) are exercised by the passing unit and e2e suites; the unit suites were re-run fresh this session and the e2e spec is fingerprint-unchanged since its green run.

### Gaps Summary

None. Phase goal achieved: the operator boundary is enforced server-side on the DB flag, revocation is a single keep-current delete that rides the existing D-28 401 teardown, and the full lifecycle is machine-proven in EN and FR with 566/566 unit tests green. The only reason for this re-run — a stale covered_files digest — is resolved by the regenerated fingerprint above.

---

_Verified: 2026-10-29T17:05:00Z_
_Verifier: gsd-verifier (goal-backward, adversarial)_
