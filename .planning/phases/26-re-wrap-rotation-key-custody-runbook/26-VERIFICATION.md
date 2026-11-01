---
phase: 26-re-wrap-rotation-key-custody-runbook
verified: 2026-11-01T13:05:00Z
status: passed
score: 5/5 roadmap success criteria verified (15/15 plan must-have truths verified — 12 from plans 01/02 via regression, 3 from plan 03; 632/632 tests pass)
behavior_unverified: 0
covered_files:
  - .planning/phases/26-re-wrap-rotation-key-custody-runbook/26-01-PLAN.md
  - .planning/phases/26-re-wrap-rotation-key-custody-runbook/26-01-SUMMARY.md
  - .planning/phases/26-re-wrap-rotation-key-custody-runbook/26-02-PLAN.md
  - .planning/phases/26-re-wrap-rotation-key-custody-runbook/26-02-SUMMARY.md
  - .planning/phases/26-re-wrap-rotation-key-custody-runbook/26-03-PLAN.md
  - .planning/phases/26-re-wrap-rotation-key-custody-runbook/26-03-SUMMARY.md
  - DEPLOY.md
  - server.js
  - test/totp-rewrap.test.mjs
covered_digest: "v2:sha256:4c27b4937144a947f915b230e452cc87e93067edbf9eee10c62cfe3ab3644bad"
behavior_unverified_items: []
overrides_applied: 0
human_verification:
  - test: "Follow DEPLOY.md §14 end-to-end on a staging deployment — including the new 'Before you rotate — two checks' gate: image-currency grep, key-id coverage check, then rotate, reboot, run the D-K13 verification query against the live DB, and reboot again"
    expected: "Both preconditions pass; one boot re-wraps all stale envelopes; query returns 0; 2FA logins work without re-enrollment; second boot is a no-op"
    why_human: "Real-deployment operator flow (env file, reboot, live DB) cannot be exercised by the test suite"
gaps: []
deferred: []
---

# Phase 26: Re-Wrap Rotation & Key-Custody Runbook — Verification Report

**Phase Goal:** An operator can rotate MASTER_KEY by setting an env var and rebooting — no 2FA re-enrollment — with a documented runbook for the whole custody lifecycle
**Verified:** 2026-11-01T13:05:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (plan 26-03 closed G-26-1 from UAT Test 1: live rotation on staging locked the user out; diagnosed root cause was deployment env/image, not code)

Note: the prior VERIFICATION.md in this directory was already a post-26-03 artifact showing `passed` with empty gaps; this report independently re-proves G-26-1 closure against the live codebase rather than trusting that frontmatter.

## Goal Achievement

### Observable Truths (roadmap success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | One boot re-wraps every old-envelope secret to the new key id; 2FA users log in without re-enrolling | ✓ VERIFIED (regression) | `migrateTotpReWrap()` at server.js:1424, wired at bootstrap server.js:1170 after `migrateTotpEncryption()`; `node --test test/totp-rewrap.test.mjs` → 11/11 pass (tracer, seed matrix, SC-1 login-after-rotation tail) |
| 2 | Second boot is a no-op (idempotent); zero stale envelopes remain | ✓ VERIFIED (regression) | Idempotency + D-K13 parity tests pass; shared `isStaleEnvelope` predicate at server.js:1241 used at scan :1437 and in-transaction re-check :1486 |
| 3 | Pre-migration backup guarantee holds for the re-wrap pass (backup before rewrite, transactional, rollback-safe) | ✓ VERIFIED (regression) | D-74 backup-failure skip test passes; no server.js changes since the prior verification (26-03 touched DEPLOY.md only) |
| 4 | DEPLOY.md runbook covers generation/injection, adding new key alongside old, rotation, zero-stale verification, backup-before-rotation, and the compromise policy | ✓ VERIFIED (regression) | DEPLOY.md §14 (line 724) through the compromise subsection (line 958); subsections re-confirmed intact |
| 5 | **G-26-1 closure:** §14 gates a rotation on two pre-rotation preconditions (deployed image contains the re-wrap pass; envelope key id resolves under MASTER_KEY_PREVIOUS) and carries a keyring-miss recovery note with copy-pasteable commands | ✓ VERIFIED | Read directly from DEPLOY.md:774–897 — see detail below |

**Score:** 5/5 truths verified (0 present-but-behavior-unverified)

### G-26-1 Gap Closure — Verified (not trusted)

Claim: plan 26-03 hardened DEPLOY.md §14 with two pre-rotation preconditions and a recovery note. Verified against the actual file:

1. **Precondition block present** (DEPLOY.md:780–784) at the top of "Running a rotation", before step 1 (edit the .env), with the stated failure mode (re-wrap never runs → 2FA fail-closed 503 `masterKeyMissing` — the exact G-26-1 staging incident) and a stop rule.
2. **Image-currency check** (DEPLOY.md:786–796): copy-pasteable `docker compose exec projects sh -c 'grep -c migrateTotpReWrap server.js'`, expected output ≥ 1, `0` ⇒ rebuild first. The command targets the `migrateTotpReWrap` symbol, which exists in the shipped server.js:1424 — the doc and code link holds. `grep -c migrateTotpReWrap DEPLOY.md` → **2** (check + recovery-note cross-reference).
3. **Key-id coverage check** (DEPLOY.md:798–830): id of `MASTER_KEY_PREVIOUS` read from the **container env only** via `node -e` (no argv key material — T-26-05/T-26-08 mitigation stands), compared against distinct DB-stamped `substr(two_fa_secret, 1, 11)` prefixes (`v2:` + 8 hex = 11 chars) with both a host sqlite3 one-liner and a container `node:sqlite` one-liner (D-K13 query style). Stop rule stated: neither key id matching a stamped id ⇒ stop, one-generation policy, manual recovery. Current-generation case (`v2:<new-id>` rows) explicitly fine.
4. **Recovery note present** (DEPLOY.md:864–897, own subsection): conditions on the verbatim D-K7 log line — byte-identical wording checked against server.js:1308 (`TOTP encryption: N row(s) carry unrecognized secret envelope version(s) (v2) — left as-is; decryption attempts fail closed (D-K7).`) **and** the absence of any `TOTP re-wrap:` line; states rows are byte-identical, **no data loss** (`grep -ci "no data loss" DEPLOY.md` → 1); recovery step 1 restores login (old key back as MASTER_KEY, remove PREVIOUS, `docker compose up -d`); step 2 fixes the deployment via the precondition checks and re-runs §14 from the top. Correctly cross-references the neither-key manual-recovery path for the *different* failure signature (T-26-09 disposition honored).
5. **No collateral damage:** commit `a4e28fc` diff is **88 insertions in DEPLOY.md only** — no server.js changes (prohibition honored), no renumbering of other §14 subsections (heading list identical: image-currency/recovery additions are inside existing subsections plus one new one after "Running a rotation"). `MASTER_KEY_PREVIOUS` count 11 (was 7).
6. **Suite green:** `node --test test/totp-rewrap.test.mjs` → 11 tests, 11 pass, 0 fail (doc-parsing runbook-parity tests intact — no test changes were needed, matching the 26-03 summary claim); full `npm test` → **632 pass / 0 fail**.

### Plan 01 must-have truths (KEY-03) — regression re-check

All 7 truths previously verified with behavioral test evidence; codebase unchanged (server.js untouched by 26-03, confirmed via commit diff). Wiring re-confirmed by grep: bootstrap order server.js:1170, `migrateTotpReWrap` :1424, shared predicate :1241/:1437/:1486, `decryptV1WithMaterial` :363. Tests pass (11/11). Status: VERIFIED (regression).

### Plan 02 must-have truths (KEY-04) — regression re-check

All 4 truths re-confirmed: §14 subsection structure intact (Key generation & injection :731, Discover a key's id :752, Running a rotation :774, recovery :864, Verifying zero stale envelopes :900, Backup-before-rotation :921, Completing rotation :946, compromise policy :958). Compromise subsection still stark ("rotation alone is not sufficient"). Parity tests green. Status: VERIFIED (regression).

### Plan 03 must-have truths (G-26-1 closure)

All 3 truths VERIFIED — see the closure section above:
1. Preconditions catch a stale image / keyring missing the old key **before** rotation → VERIFIED
2. Recovery note explains D-K7-line-with-no-re-wrap-line and restores login without data loss → VERIFIED
3. Both are copy-pasteable commands in §14's prose+dotenv style (D-K18) → VERIFIED

Plan 03 prohibitions honored: no server.js changes (diff is DEPLOY.md-only); no key material on argv (env-only `node -e` pattern); no renumbering of other sections.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `server.js` | migrateTotpReWrap(), decryptV1WithMaterial(), isStaleEnvelope(), D-K7 scan line | ✓ VERIFIED | All present and wired; unchanged by 26-03 |
| `test/totp-rewrap.test.mjs` | Rotation + runbook-parity suite | ✓ VERIFIED | 11/11 pass against the edited §14 |
| `DEPLOY.md` | §14 with preconditions + recovery note | ✓ VERIFIED | Lines 774–897; +88 lines in commit a4e28fc |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| bootstrap() | migrateTotpEncryption() → migrateTotpReWrap() | server.js:1170 call order | ✓ WIRED | Unchanged since prior verification |
| isStaleEnvelope | scan + in-transaction re-check | shared closure | ✓ WIRED | server.js:1241/1437/1486 |
| §14 image-currency command | migrateTotpReWrap symbol | grep-target in doc = real symbol | ✓ WIRED | DEPLOY.md:791 ↔ server.js:1424 |
| §14 key-id precondition | id(MASTER_KEY_PREVIOUS) ↔ v2: envelope prefix | env `node -e` sha256-slice command | ✓ WIRED | DEPLOY.md:806–830; matches keyIdFor one-liner style |
| §14 recovery note | actual boot log lines | verbatim D-K7 quote | ✓ WIRED | DEPLOY.md:869 == server.js:1308 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Re-wrap suite (incl. runbook parity) | `node --test test/totp-rewrap.test.mjs` | 11 tests, 11 pass, 0 fail | ✓ PASS |
| Full project suite | `npm test` | 632 pass, 0 fail | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| KEY-03 | 26-01 | Boot-time re-wrap rotation pass (idempotent, transactional, backup-guaranteed) | ✓ SATISFIED | migrateTotpReWrap() + passing test suite (regression-verified) |
| KEY-04 | 26-02, 26-03 | DEPLOY.md key-custody runbook (incl. preconditions + recovery from 26-03) | ✓ SATISFIED | DEPLOY.md §14 lines 724–960 + green parity tests |

No orphaned requirements: REQUIREMENTS.md maps exactly KEY-03 and KEY-04 to Phase 26, both marked Complete; both plans' frontmatter `requirements` fields account for them.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| (none) | — | No unresolved TBD/FIXME/XXX/placeholder markers in DEPLOY.md, server.js, or test/totp-rewrap.test.mjs (the one grep hit in the test file is the documented `<CURRENT_KEY_ID>` substitution placeholder of the D-K13 query, not a stub) | — | — |

### Human Verification Required

### 1. End-to-end operator runbook walkthrough on staging (incl. new precondition gate)

**Test:** Follow DEPLOY.md §14 on staging: run both "Before you rotate — two checks" (image-currency grep, key-id coverage), generate key, set MASTER_KEY + MASTER_KEY_PREVIOUS in /opt/projects/.env, reboot, run the documented D-K13 verification query, confirm 2FA logins, reboot again. Optionally also drill the recovery note on a deliberately broken env.
**Expected:** Preconditions pass; first boot re-wraps everything; query returns 0; no re-enrollment; second boot changes nothing. On the drill: D-K7 line present, no re-wrap line, restore-old-key recovers login with zero data loss.
**Why human:** Live-deployment flow (env file, process restart, real DB) is outside the test suite's reach. Note UAT already exposed the gap this closure addresses — the preconditions are the documented fix; a human walkthrough confirms they actually stop the incident.

### Gaps Summary

None. G-26-1 is closed and independently re-proven: §14 now carries both pre-rotation preconditions and the keyring-miss recovery note, each with copy-pasteable commands and expected outputs, quoting the real server.js log line; the only diff in the closure commit is DEPLOY.md (+88 lines); both suites are green (11/11, 632/632). KEY-03 and KEY-04 fully covered. One residual human item (live-deployment runbook walkthrough, now including the precondition gate) is inherent to the goal and does not block.

---

_Verified: 2026-11-01T13:05:00Z_
_Verifier: the agent (gsd-verifier)_
