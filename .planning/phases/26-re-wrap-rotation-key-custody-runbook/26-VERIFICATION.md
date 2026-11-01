---
phase: 26-re-wrap-rotation-key-custody-runbook
verified: 2026-11-01T09:06:31Z
status: passed
score: 4/4 roadmap success criteria verified (11/11 plan must-have truths verified, 32/32 tests pass)
behavior_unverified: 0
human_verification:
  - test: "Follow DEPLOY.md section 14 end-to-end on a staging deployment: generate key, set MASTER_KEY + MASTER_KEY_PREVIOUS in /opt/projects/.env, reboot, run the D-K13 verification query against the live DB"
    expected: "One boot re-wraps all stale envelopes; query returns 0; 2FA logins work without re-enrollment; second boot is a no-op"
    why_human: "Real-deployment operator flow (env file, reboot, live DB) cannot be exercised by the test suite"
gaps: []
deferred: []
---

# Phase 26: Re-Wrap Rotation & Key-Custody Runbook — Verification Report

**Phase Goal:** An operator can rotate MASTER_KEY by setting an env var and rebooting — no 2FA re-enrollment — with a documented runbook for the whole custody lifecycle
**Verified:** 2026-11-01T09:06:31Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (roadmap success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | One boot re-wraps every old-envelope secret to the new key id; 2FA users log in without re-enrolling | ✓ VERIFIED | `migrateTotpReWrap()` at server.js:1424, called from bootstrap at server.js:1170 after `migrateTotpEncryption()`; tests: "tracer: one v1-under-previous row re-wraps to v2 under the NEW key id", "seed matrix" (7 fleet shapes), "SC-1 tail: a real 2FA login verifies with the SAME enrolled device secret after a rotation boot" — all pass |
| 2 | Second boot is a no-op (idempotent); zero stale envelopes remain — verified programmatically | ✓ VERIFIED | Idempotency asserted in the tracer test ("then idempotent"); D-K13 verification query parity test proves "≥1 on a stale fixture and 0 after a rotation boot (both directions)"; in-transaction re-check uses the same `isStaleEnvelope` predicate (server.js:1241, used at scan :1437 and re-check :1486) |
| 3 | Pre-migration backup guarantee holds for the re-wrap pass (backup before rewrite, transactional, rollback-safe) | ✓ VERIFIED | Test "D-74: a failed pre-migration backup leaves every stale row byte-identical and logs the skip line" passes; backup-skip ordering also covered by D-K12(d) ("zero envelope rows … pass returns before any backup") |
| 4 | DEPLOY.md runbook covers generation/injection, adding new key alongside old, rotation, zero-stale verification, backup-before-rotation, and the compromise policy | ✓ VERIFIED | DEPLOY.md `## 14. Key custody & rotation` (line 724) through "If a key is compromised — rotation alone is not sufficient" (line 870, prescribes full honest re-enrollment, never rotation-as-mitigation); key-id one-liner parity and D-K13 query parity both proven by tests |

**Score:** 4/4 truths verified (0 present-but-behavior-unverified)

### Plan 01 must-have truths (KEY-03)

All 7 truths verified by the 12-test suite in test/totp-rewrap.test.mjs (32/32 pass including the totp-encryption regression suite): re-wrap of v1/stale-v2 under previous AND current material (decryptV1WithMaterial at server.js:363, try-both fallback at :1496), idempotent second boot, backup-failure skip, undecryptable rows left byte-identical/counted/warned, D-K14 gate (only-MASTER_KEY boots never scan — dedicated test), D-K12 nudge (4 sub-tests), SC-1 tail login. Key links hold: bootstrap order :1170, shared predicate scan/re-check, writes only via `encryptTotpSecret(plaintext, 'v2')`.

Prohibitions (judgment tier) reviewed by grep: no plaintext-row touching, no v1→v1 re-key, no destructive mutation, no key material in summaries (D-76 discipline), no manual trigger/endpoint — consistent with code and tests. No silent pass: none contradicted by evidence.

### Plan 02 must-have truths (KEY-04)

All 4 truths verified: runbook end-to-end (generation → injection via env only → alongside-old → rotation → verification → backup back-out → keyring convergence), copy-pasteable one-liner parity (test), D-K13 query proven against real fixture DB both directions (test), compromise subsection stark and unmissable (DEPLOY.md:870). Prohibitions honored: one-generation-at-a-time policy documented, keys never on argv, printf/env invocation pinned, `like` convention.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `server.js` | migrateTotpReWrap(), decryptV1WithMaterial(), isStaleEnvelope() | ✓ VERIFIED | All present, substantive, wired into bootstrap |
| `test/totp-rewrap.test.mjs` | Seed-matrix + rotation + runbook-parity suite | ✓ VERIFIED | 12 tests, all pass |
| `DEPLOY.md` | Numbered "Key custody & rotation" section | ✓ VERIFIED | Section 14, line 724, includes compromise policy |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| bootstrap() | migrateTotpEncryption() → migrateTotpReWrap() | server.js:1170 call order | ✓ WIRED | Order guarantees mixed-plaintext-fleet SC-1 |
| isStaleEnvelope | scan + in-transaction re-check | shared closure | ✓ WIRED | server.js:1241/1437/1486 — no predicate drift |
| re-wrap writer | encryptTotpSecret(plaintext, 'v2') | single v2 writer | ✓ WIRED | No second writer found |
| DEPLOY.md one-liner | keyIdFor() | parity test | ✓ WIRED | Test "runbook parity: key-id one-liner equals keyIdFor" |
| DEPLOY.md D-K13 query | users.two_fa_secret v2 shape | parity test on fixture DB | ✓ WIRED | Both directions (≥1 stale, 0 converged) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full phase test suite | `node --test test/totp-rewrap.test.mjs test/totp-encryption.test.mjs` | 32 tests, 32 pass, 0 fail | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| KEY-03 | 26-01 | Boot-time re-wrap rotation pass (idempotent, transactional, backup-guaranteed) | ✓ SATISFIED | migrateTotpReWrap() + 10 core tests |
| KEY-04 | 26-02 | DEPLOY.md key-custody runbook | ✓ SATISFIED | DEPLOY.md §14 + 2 parity tests |

No orphaned requirements: REQUIREMENTS.md traceability table maps exactly KEY-03 and KEY-04 to Phase 26, both marked Complete, both verified.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| (none) | — | No TBD/FIXME/XXX/placeholder markers in server.js, DEPLOY.md, or test/totp-rewrap.test.mjs | — | — |

### Human Verification Required

### 1. End-to-end operator runbook walkthrough on staging

**Test:** Follow DEPLOY.md §14 on a staging deployment: generate key, set MASTER_KEY + MASTER_KEY_PREVIOUS in /opt/projects/.env, reboot, run the documented D-K13 verification query, confirm 2FA logins, reboot again.
**Expected:** First boot re-wraps everything; query returns 0; no re-enrollment; second boot changes nothing.
**Why human:** Live-deployment flow (env file, process restart, real DB) is outside the test suite's reach.

### Gaps Summary

None. All four roadmap success criteria are verified in code and exercised by passing tests; KEY-03 and KEY-04 are fully covered. One residual human item (live-deployment runbook walkthrough) is inherent to the goal and does not block.

---

_Verified: 2026-11-01T09:06:31Z_
_Verifier: the agent (gsd-verifier)_
