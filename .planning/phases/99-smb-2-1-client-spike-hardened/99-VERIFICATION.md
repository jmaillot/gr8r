---
phase: 99-smb-2-1-client-spike-hardened
verified: 2026-11-25T18:05:00Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - .planning/phases/99-smb-2-1-client-spike-hardened/99-01-PLAN.md
  - .planning/phases/99-smb-2-1-client-spike-hardened/99-01-SUMMARY.md
  - .planning/phases/99-smb-2-1-client-spike-hardened/99-02-PLAN.md
  - .planning/phases/99-smb-2-1-client-spike-hardened/99-02-SUMMARY.md
  - export/smb.js
  - test/backup-smb-crypto.test.mjs
  - test/backup-smb-client.test.mjs
  - test/destination-registry-gate.test.mjs
covered_digest: "v2:sha256:de468a906f154a7ee425d3f7f236efa43cfe9b9bdd4095610ef0089349906075"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 99: SMB 2.1 Client (Spike-Hardened) Verification Report

**Phase Goal:** A golden-vector-pinned, standalone SMB2.1 client exists — the research-heavy risk item contained to a well-tested module before any wiring.
**Verified:** 2026-11-25T18:05:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (roadmap SC-1..SC-5, goal-backward)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC-1: full command surface (NEGOTIATE 2.1/2.0.2, SESSION_SETUP NTLMv2 hand-rolled MD4, TREE_CONNECT, CREATE, serial ≤60KB WRITE×N, CLOSE, READ, ECHO keep-alive, SESSION_SETUP-retry on sessionExpired), node:crypto only | ✓ VERIFIED | export/smb.js 1,106 LOC; `import crypto from 'node:crypto'` + `node:net` only (grep, lines 48-49). Behavior exercised: `node --test test/backup-smb-crypto.test.mjs test/backup-smb-client.test.mjs` → 37/37 pass, incl. handshake ordering (NEGOTIATE→SESSION_SETUP×2→TREE_CONNECT→ECHO), multi-chunk offset continuity, partial-write re-issue, expiry replay (fresh MessageId, offset resume proven in recording), expiry-storm caps |
| 2 | SC-2: MD4 pinned by RFC 1320 vectors; NTLMv2 transcripts + signing-key derivation first-class tests; signing unconditional | ✓ VERIFIED | test:41-56 pins all 7 RFC 1320 §A.5 vectors — verified AUTHENTIC (md4('a')=`bde52cb31de33e46245e05fbdbd6fb24`, md4('abc')=`a448017aaf21d8525fc10ae87aa6729d`, empty=`31d6cfe0…`; the PLAN's typos correctly corrected per openssl cross-check). NT-hash pins (8846f7ea…, cd06ca7c…) test:77-78; hand-written HMAC-MD5 chain pin test:116-126 (independent construction, not implementation reflex); signing-key derivation test; signing unconditional in smb.js (signs before session exists, per §2 surprise 4) |
| 3 | SC-3: 9 smbClass enum + NTLM type-3 scrub, test-pinned | ✓ VERIFIED | smbErrorFrom closed 9-enum in smb.js; ×11 status→class map test + per-class scenarios all green (authFailed/shareNotFound/treeConnectFailed/noSpace/nameConflict/unreachable/signingRequired/sessionExpired/generic asserted in test:448-721); D-04 scrub test test:725+ asserts no type-3/NT-response/password bytes in ANY surfaced error |
| 4 | SC-4: 99-SPIKE.md with LOC actual vs estimate + dialect surprises + SMB2-min-3.0 risk documented | ✓ VERIFIED | 99-SPIKE.md: 1,106 vs 1,400-1,600 (−18%, honest reasons); 6 dialect/spec surprises; §3 SMB2-min-3.0 fleet exposure as explicit known risk with DEPLOY note for 100; OQ-3 record; explicit **GO** verdict conditioned on real-server e2e before wiring |
| 5 | SC-5: package.json zero new deps; suite at baseline | ✓ VERIFIED | `git diff --stat package.json` empty; full suite re-run by verifier: **2609 tests / 2580 pass / 2 fail** — exactly the 2 documented pre-existing failures (fr-typography, webhook-routes GET list) |

**Score:** 5/5 truths verified (0 present-behavior-unverified — every behavior-dependent truth has a passing test)

### Wave-1 Deviation Scrutiny (required by orchestrator)

| Deviation | Verdict | Evidence |
|-----------|---------|----------|
| (a) MD4 hex typos → authentic RFC values pinned | ✓ LEGITIMATE | Test pins are the authentic RFC 1320 §A.5 values (cross-checked; e.g. MD4('a') = `bde52cb31de33e46245e05fbdbd6fb24`); openssl-verified claim consistent |
| (b) SMB2 header map fixed to MS-SMB2 §2.2.1.1 | ✓ LEGITIMATE | smb.js:346-356: Status u32@8, Command u16@12, Credits u16@14, Flags@16, NextCommand@20, MessageId u64@24, AsyncId@32, TreeId@36, SessionId@40 — matches spec §2.2.1.1 exactly |
| (c) davenport erratum REVERSED, value not pinned | ✓ LEGITIMATE | `04b8e0ba` appears ONLY in provenance comments as "never an expectation"; 0 occurrences in export/smb.js; v2 hash asserted via independent hand-written HMAC-MD5 chain (test:116-126) — stronger than a literal pin, as claimed |
| (d) registry-gate time-bomb → pin-strengthening | ✓ LEGITIMATE | test/destination-registry-gate.test.mjs:103-108 now asserts smb.js EXISTS since Phase 99 AND asserts server.js/export/backup.js/export/restore.js must NOT import smb until phase 100. 10/10 gate tests pass — strengthening, not weakening |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `export/smb.js` | Complete standalone SMB2.1 client | ✓ VERIFIED | 1,106 LOC, node stdlib only, no stubs; connectSmb full D-01 surface |
| `test/backup-smb-crypto.test.mjs` | 20 golden/round-trip/scrub tests | ✓ VERIFIED | 430 LOC, 20/20 pass |
| `test/backup-smb-client.test.mjs` | Scripted fakeSmb mock client tests | ✓ VERIFIED | 773 LOC, 17/17 pass, non-reflexive (pre-baked frames + server-side signature validation) |
| `99-SPIKE.md` | D-03 deliverable | ✓ VERIFIED | All sections present, GO verdict |
| `test/destination-registry-gate.test.mjs` | Updated gate | ✓ VERIFIED | 10/10 pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| session engine sign path | deriveSigningKey/sessionBaseKey | smb.js internal chain | ✓ WIRED | exercised in transcript + signed-wire tests |
| client error paths | smbErrorFrom 9-class map | keyed NTSTATUS mapping | ✓ WIRED | 5-class + dialect + signing + expiry scenarios all asserted |
| 99-SPIKE.md go/no-go | phase 100 discuss-phase input | documented handoff | ✓ WIRED | GO + conditions stated for 100 |

### Standalone / No-Wiring Gate

- `grep` of server.js, export/backup.js, export/restore.js: **no import of smb.js anywhere** (only a comment and the dormant phase-96 descriptor registration). Standalone claim holds — wiring is phase 100.
- destination-registry-gate enforces this programmatically (asserts no `from '…smb'`/`require('…smb')` in the three wiring files).
- data-a pin 623 + membershipsOf byte-gate: untouched, green inside full suite (2580 pass).

### Behavioral Spot-Checks (run by verifier, this session)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Crypto + codec + client suites | `node --test test/backup-smb-crypto.test.mjs test/backup-smb-client.test.mjs` | 37/37 pass | ✓ PASS |
| Registry gate (incl. no-wiring + smb-exists) | `node --test test/destination-registry-gate.test.mjs` | 10/10 pass | ✓ PASS |
| Full suite baseline | `npm test` | 2609 tests / 2580 pass / 2 fail (documented pre-existing) | ✓ PASS |
| Zero-dep gate | `git diff --stat package.json` | empty | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SMB-01 | 99-01, 99-02 | Hand-rolled SMB2.1-only client, node:crypto only, full command surface, unconditional signing, scrubbed errors | ✓ SATISFIED | Truths 1-3 |
| TEST-01 | 99-01, 99-02 | MD4 RFC vectors, NTLM transcript pins, byte-gate stays green | ✓ SATISFIED | Truths 2, 5; (docker samba e2e recipe explicitly deferred to phase 100 per TEST-01 "Phases 98/100" mapping and D-02) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | no TBD/FIXME/TODO/stub markers in phase files | — | — |

### Human Verification Required

None. All behavior-dependent truths are exercised by the 37 passing mock tests. Real-server (dperson/samba) falsification of the A1–A4 assumptions is explicitly assigned to phase 100's env-gated e2e by the SPIKE GO conditions — not a phase-99 obligation.

### Gaps Summary

None. Phase goal achieved: a golden-vector-pinned, standalone (unwired), well-tested SMB2.1 client exists with all wave-1 deviations verified legitimate and the suite at baseline.

---

_Verified: 2026-11-25T18:05:00Z_
_Verifier: the agent (gsd-verifier)_
