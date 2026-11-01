---
phase: 25-keyring-version-aware-envelopes
verified: 2026-10-31T18:40:00Z
status: passed
score: 9/9 must-haves verified
covered_files:
  - .planning/phases/25-keyring-version-aware-envelopes/25-01-PLAN.md
  - .planning/phases/25-keyring-version-aware-envelopes/25-01-SUMMARY.md
  - .planning/phases/25-keyring-version-aware-envelopes/25-02-PLAN.md
  - .planning/phases/25-keyring-version-aware-envelopes/25-02-SUMMARY.md
  - server.js
  - test/migration.test.mjs
  - test/totp-encryption.test.mjs
  - test/tfa-enrollment.test.mjs
covered_digest: "v2:sha256:d6151b4526dddcc81224241f949cb801e9777e1e5cc64ac83eef0d4e0e3a1a2e"
behavior_unverified: 0
overrides_applied: 0
prohibitions_verified: 5
---

# Phase 25: Keyring & Version-Aware Envelopes Verification Report

**Phase Goal:** The database can hold a `v2:` envelope without corrupting itself on boot, and secrets decrypt by key id through a keyring — the prerequisite that makes rotation possible
**Verified:** 2026-10-31T18:40:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (roadmap SCs + PLAN must_haves, deduplicated)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | DB with `v2:`/`v3:` (any `v\d+:`) rows boots without re-wrapping, mutating, or treating as plaintext — proven by test BEFORE any v2-writing code (SC-1 / KEY-01) | ✓ VERIFIED | `isEnvelopeVersion()` predicate at server.js:1199; SQL filter broadened to `like 'v_:%'` (line 1225/1250); test `KEY-01 SC-1: v2:/v3: envelope rows boot byte-identical…` (migration.test.mjs:533) asserts byte-identity + zero `projects-preenvelope-*.db` backups across two boots — passes |
| 2 | Boot output counts and warns about unrecognized version rows — never silent (D-K7) | ✓ VERIFIED | `unrecognizedVersion` counter (server.js:1220-1237) + warn line quoting only version tags; D-76 summary line includes the counter (line 1319); test `KEY-01 D-K7: mixed DB…` (migration.test.mjs:566) passes |
| 3 | Plaintext base32 rows still migrate to `v1:` exactly as before (no regression) | ✓ VERIFIED | ENC-01 test (migration.test.mjs:489) passes; migration writer stays v1 (server.js:1307 default) |
| 4 | Filter and in-txn re-check share ONE predicate helper (D-75 no-drift) | ✓ VERIFIED | Both `!isEnvelopeVersion(value)` at server.js:1230 and :1298; static drift-guard test in totp-encryption.test.mjs passes; old shapes (`not like 'v1:%'`, `startsWith('v1:')`) grep to zero in server.js |
| 5 | `v2:<key-id>:<iv>:<tag>:<ct>` secret verifies at login when matching key is in the keyring (SC-2 / KEY-02) | ✓ VERIFIED | decryptTotpSecret v2 branch (server.js:333-344) → KEYRING.get(kid) → AES-GCM; planted-envelope round-trip test through the real login path + real enable-path enroll test (totp-encryption.test.mjs:399, tfa-enrollment.test.mjs:112) pass |
| 6 | Previous-key v2 row decrypts when MASTER_KEY_PREVIOUS configured (D-K1) | ✓ VERIFIED | KEYRING seeded from both keys (server.js:82-88); previous-key decrypt/503-pair test (totp-encryption.test.mjs:331) passes |
| 7 | Unresolvable v2 (unknown id, malformed id, corrupt tag, missing key) → fail-closed 503 masterKeyMissing, no plaintext fallback (SC-3) | ✓ VERIFIED | Strict `/^[0-9a-f]{8}$/` (server.js:336), `KEYRING.get` miss → null (339), single `catch { return null; }` — no third error shape; negative tests (totp-encryption.test.mjs:361-370) all assert 503 masterKeyMissing with rows unmutated |
| 8 | MASTER_KEY_PREVIOUS without MASTER_KEY fails boot loudly (D-K2) | ✓ VERIFIED | `throw new Error('MASTER_KEY_PREVIOUS is set but MASTER_KEY is not…')` at server.js:86, during boot init; D-K2 boot-failure test passes |
| 9 | v1 secrets, 2FA login/enrollment/disable unchanged; requireTotpSecret signature unchanged (SC-4) | ✓ VERIFIED | requireTotpSecret (server.js:356-359) byte-unchanged, static proof test passes; v1 decrypt branch untouched (server.js:325-332); tfa-login/disable/enrollment/recovery-regen suites green (621/621 full suite, orchestrator run + regression gate 134 prior-phase tests) |

**Score:** 9/9 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| server.js | isEnvelopeVersion predicate, D-K7 counter/warn, MASTER_KEY_PREVIOUS, keyIdFor, KEYRING, v2 decrypt dispatch, v2 enable-path writer | ✓ VERIFIED | All present and substantive (lines 75-93, 294-310, 321-349, 1199, 1220-1237, 1888) |
| test/migration.test.mjs | SC-1 negative-proof + D-K7 warn tests | ✓ VERIFIED | Lines 486-587; 45/45 phase tests pass |
| test/totp-encryption.test.mjs | keyring/v2 round-trip + negative tests + static drift guards | ✓ VERIFIED | Lines 267-400; passes |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| keyIdFor | sha256 (ONE call) | id = hex first 8, AES key = raw digest | ✓ WIRED | server.js:81 (single `createHash().update().digest()`; writer at 297-304 uses same derivation); determinism test passes |
| decryptTotpSecret v2 | KEYRING.get(kid) → null → requireTotpSecret ok:false → 503 | fail-closed chain | ✓ WIRED | server.js:338-339 → 356-359; requireTotpSecret remains sole decrypt boundary (D-78c static proof) |
| SQL filter | in-txn re-check | shared isEnvelopeVersion | ✓ WIRED | server.js:1230 + :1298 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase test files (SC-1, D-K7, SC-2/3/4, D-K2, D-K5) | `node --test test/totp-encryption.test.mjs test/migration.test.mjs` | 45 pass / 0 fail (3.65s) | ✓ PASS |
| Full suite + prior-phase regression | orchestrator-run `npm test` | 621 pass / 0 fail; 134 prior-phase tests pass | ✓ PASS |

### Prohibitions (must_haves.prohibitions — 5/5 verified, judgment-tier with deterministic code evidence)

| Prohibition | Evidence | Status |
|-------------|----------|--------|
| No known-versions list — generic `/^v\d+:/` only (D-K6) | server.js:1199-1201: single regex predicate, no version array | ✓ VERIFIED |
| No key material / ciphertext in boot-warn logs | server.js:1237 quotes only counts + version tags | ✓ VERIFIED |
| No third error shape on decrypt failure | Every v2 failure returns null (server.js:335-345, single catch) | ✓ VERIFIED |
| No logging of key material in keyring paths; key id max | Only 8-hex fingerprints appear (server.js:81,93) | ✓ VERIFIED |
| No open-ended keyring chain (no `_2`/`_3`) | grep `MASTER_KEY_2\|MASTER_KEY_3\|_PREVIOUS_2` → 0 matches | ✓ VERIFIED |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| KEY-01 | 25-01 | Version-aware boot migration filter — existing `v2:` (any `v<n>:`) rows never re-wrapped/corrupted, proven by test | ✓ SATISFIED | Truths 1-4; test migration.test.mjs:533 |
| KEY-02 | 25-02 | Self-describing key-version envelope `v2:<key-id>:…` decrypted via keyring, fail-closed | ✓ SATISFIED | Truths 5-9 |

No orphaned requirements: ROADMAP maps exactly KEY-01, KEY-02 to Phase 25; both plans claim them.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TBD/FIXME/TODO/stub patterns in phase-modified files | — | None |

### Human Verification Required

None. Every behavior-dependent truth (boot no-re-wrap, D-K2 throw, fail-closed transitions, previous-key round-trip) is exercised by a named passing test; no visual, external-service, or real-time surface added by this phase.

### Gaps Summary

None. All roadmap success criteria, PLAN must-haves, and prohibitions verified against actual code (not SUMMARY claims). The 25-02 writer-flip deviation (version param defaulting to v1, enable path passing 'v2') is a faithful interpretation that preserves D-82/D-83 migration semantics and all must-have truths; format freeze (D-K3/D-K4) confirmed by the recorded user checkpoint. Code review warnings (25-REVIEW.md) are advisory and dispositioned in 25-REVIEW-DISPOSITION.md — no gap impact. Phase 26 (KEY-03/KEY-04) builds rotation on the frozen format.

---

_Verified: 2026-10-31T18:40:00Z_
_Verifier: the agent (gsd-verifier)_
