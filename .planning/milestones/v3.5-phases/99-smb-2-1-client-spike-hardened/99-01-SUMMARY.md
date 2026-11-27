---
phase: 99-smb-2-1-client-spike-hardened
plan: 01
subsystem: backup-destinations
tags: [smb, smb2.1, ntlnv2, ntlmv2, md4, crypto, codec, nbss, golden-vectors]
requires: ["node:crypto (md5/sha256 HMACs)", "phase-96 registry descriptor (dormant smb slot)"]
provides: ["export/smb.js pure crypto+codec layer (md4, ntlmHash, ntlmv2Hash, buildNtlmType1, parseNtlmType2, buildNtlmType3, sessionBaseKey, deriveSigningKey, utf16le, encodeNbssHeader, createFrameParser, encodeNbssSessionRequest, encodeSmb2Header, decodeSmb2Header, smbErrorFrom, smbScrubMessage)", "test/backup-smb-crypto.test.mjs (20 golden/round-trip/scrub tests)"]
affects: ["99-02 (session engine builds on pinned primitives)", "phase 100 (descriptor wiring + real-server e2e)"]
tech-stack:
  added: ["hand-rolled MD4 (RFC 1320 port — node:crypto md4 unavailable on OpenSSL 3)"]
  patterns: ["SigV4 golden-vector idiom", "feed-accumulating pure parser (ftp.js idiom on byte counts)", "keyed error factory (smbErrorFrom, SC-3 9-enum)", "fixed-message scrub with defensive redaction"]
key-files:
  created: [export/smb.js, test/backup-smb-crypto.test.mjs]
  modified: [test/destination-registry-gate.test.mjs]
decisions:
  - "MD4 ported with role-relabeling op table; F/H results coerced unsigned; vectors = authentic RFC 1320 §A.5 (two hex values quoted in the PLAN must_haves were typos — openssl-verified values pinned)"
  - "SMB2 header offsets follow MS-SMB2 §2.2.1.1 spec layout (Command u16@12, Credits u16@14, Flags@16, NextCommand@20, MessageId@24, AsyncId@32, TreeId@36, SessionId@40, Signature@48) — 99-RESEARCH §2 field map was mis-transcribed by one byte; spec layout implemented and pinned"
  - "Type-3 Version-2 layout: LM/NT/user/workstation descriptors + flags @60, data block @64 (target-name and session-key buffers absent — the davenport 64-byte-offset layout; the key never travels)"
  - "davenport NTLMv2-hash value 04b8e0ba… is NOT pinned as an expectation (acceptance gate); the v2 hash is asserted via an independent hand-written HMAC-MD5 construction in the test (stronger than a literal pin). Note: it DOES reproduce with the correct MD4 — research's scratch port likely carried the same double-op bug fixed here"
  - "NBSS 17-bit length: 17th bit carried in byte-1 bit 0 per RFC 1002"
metrics:
  duration: 37m
  completed: 2026-11-25T15:51:33Z
  tasks: 3
  commits: 3
  plan_head_before: b327fbaa074ad4e6a17b4295c96c209306f4a233
  plan_head_after: 156f9e71
actuals:
  tokens: 58000
  tasks: 3
  commits: 3
status: complete
---

# Phase 99 Plan 01: Golden-Vector Crypto + Codec Layer Summary

**One-liner:** Socket-free SMB2.1 foundation in export/smb.js — hand-rolled RFC 1320 MD4 (7/7 vectors + openssl cross-check), the full NTLMv2 chain (type-1/2/3, NTProofStr, LMv2, SessionBaseKey, no-KEY_EXCH), HMAC-SHA256 signing-key derivation, NBSS/SMB2 byte-exact codecs with a pure feed-accumulating parser, and the SC-3 keyed error factory with D-04 scrub — all pinned by 20 tests.

## What Was Built

- **export/smb.js (layer 1, pure)**: MD4 (role-relabeling RFC 1320 port, three shift tables, LE 64-bit length field), ntlmHash/ntlmv2Hash/sessionBaseKey (HMAC-MD5 via node:crypto), buildNtlmType1 (16-byte minimal, no KEY_EXCH/56-bit flags), parseNtlmType2 (challenge + flags + TargetInfo verbatim), buildNtlmType3 (byte-exact NTProofStr++blob, TargetInfo echoed verbatim, data block @64), deriveSigningKey (HMAC-SHA256 'SMB2AESKey'+0x00 [:16]), NBSS codec (17-bit length with RFC 1002 bit-0 carry; 0x20000 → keyed generic refusal), createFrameParser (buffer-in → {frames, consumed}, never crashes on partial input), encodeNbssSessionRequest, SMB2 64-byte LE header encode/decode (spec offsets), smbErrorFrom (SC-3 closed 9-enum, OQ-3 split honored), smbScrubMessage.
- **test/backup-smb-crypto.test.mjs**: 20 tests — MD4 RFC vectors ×7 + 56-byte boundary pin, NT-hash pins, hand-written-chain v2-hash pin, type-1 flags, type-2 parse, byte-exact type-3 transcript chain, signing-key derivation, NBSS/SMB2 round-trips, chunk-split reassembly with consumed accounting, async-flag decode, ×11 status→class map, errno→unreachable, poisoned-fixture scrub.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PLAN must_have MD4 hex values for 'a' and 'abc' are typos**
- **Found during:** Task 1 (RED phase)
- **Issue:** Plan quoted `bde52cb31de33bec4634912736ff31b2` / `a448017aaf21d8525fc10ae00aa6722d`; authentic RFC 1320 §A.5 values are `bde52cb31de33e46245e05fbdbd6fb24` / `a448017aaf21d8525fc10ae87aa6729d` (verified via `openssl dgst -md4 -provider legacy`)
- **Fix:** pinned the openssl/RFC-verified values
- **Files modified:** test/backup-smb-crypto.test.mjs

**2. [Rule 1 - Bug] 99-RESEARCH §2 SMB2 header field map mis-transcribed (offsets shifted by one byte)**
- **Found during:** Task 2
- **Issue:** research map (Command@10 u8, Credits@11 u32, MessageId@23…) contradicts MS-SMB2 §2.2.1.1 (Command u16@12, Credits u16@14, Flags@16, NextCommand@20, MessageId@24, AsyncId@32, TreeId@36, SessionId@40, Signature@48); a wire-format built on the research map would fail against every real server
- **Fix:** implemented and pinned the spec layout (deviation noted in test provenance comment; falsifiable at phase-100 e2e)
- **Files modified:** export/smb.js, test/backup-smb-crypto.test.mjs

**3. [Rule 3 - Blocking] destination-registry-gate time-bomb ("export/smb.js must NOT exist yet")**
- **Found during:** Task 3 (npm test)
- **Issue:** the 96-era gate hard-refused smb.js existence — directly falsified by this plan's deliverable
- **Fix:** gate now asserts smb.js EXISTS (since phase 99) plus new no-wiring assertions (server.js/export/backup.js/export/restore.js must not import smb until phase 100); all 10 gate tests green
- **Files modified:** test/destination-registry-gate.test.mjs

**4. [Rule 1 - Bug] davenport NTLMv2-hash "erratum" finding revisited**
- **Issue:** research reported 0x04b8e0ba… does not reproduce; with the correct MD4 it DOES reproduce — research's scratch port likely carried the double-op bug fixed in this plan's MD4
- **Fix:** honored the acceptance gate anyway — the value is NOT pinned as a literal expectation; the v2 hash is asserted via an independent hand-written HMAC-MD5 chain in the test (stronger than a literal pin)

### Task-completion notes
- Tracer feedback gate (Task 1): verify chain re-run end-to-end before expansion — 9/9 green at the time; final file state 20/20 green.
- One MD4 implementation bug found live by the vectors (double application of the round op via role closures) and fixed; exactly the failure mode the golden-vector-first strategy exists to catch.

## Verification

- `node --test test/backup-smb-crypto.test.mjs` — 20/20 pass
- `npm test` — 2592 tests, 2563 pass, exactly the 2 documented pre-existing failures (fr-typography, webhook-routes GET list)
- `git diff package.json` — empty (T-99-SC Package Legitimacy Audit trivially clean: node stdlib only)
- destination-registry-gate: 10/10; xws-gate: 4/4
- export/smb.js imports node:crypto ONLY

## Known Stubs

None — every export is a final, tested implementation (session engine and command surface are 99-02's scope by design, not stubs).

## Threat Flags

None — no new trust-boundary surface beyond the plan's threat model (17-bit length refusal = T-99-01, scrub tests = T-99-02, zero installs = T-99-SC, all mitigated and test-pinned).

## Self-Check: PASSED

- export/smb.js, test/backup-smb-crypto.test.mjs — exist on disk
- Commits 443c1c89, b1f29e92, 156f9e71 — present in git log
