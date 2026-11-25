# Phase 99 — SPIKE Report: SMB 2.1 Client (D-03)

**Written:** 2026-11-25 · **Read by:** phase 100 discuss-phase
**Deliverable:** `export/smb.js` (standalone SMB2.1 client) + `test/backup-smb-crypto.test.mjs` (20) + `test/backup-smb-client.test.mjs` (17)

## 1. Actual LOC vs estimate

| Artifact | Estimate (planning SUMMARY) | Actual | Delta |
|----------|------------------------------|--------|-------|
| `export/smb.js` (crypto + codec + session engine + client) | 1,400–1,600 LOC | **1,106 LOC** | −18% under the low bound |
| `test/backup-smb-crypto.test.mjs` | (not estimated) | 430 LOC | — |
| `test/backup-smb-client.test.mjs` | (not estimated) | 773 LOC | — |

**Honest read of the miss (MEDIUM estimate honored):** the client came in ~300 LOC lighter than the 1,400–1,600 band for three concrete reasons: (a) the no-KEY_EXCH NTLMv2 path eliminates RC4 sealing and the session-key buffer entirely (research A4 held); (b) strict one-command-in-flight serialism makes credit accounting a single assert, not a manager; (c) fixed-message scrub (D-04) removed any transcript-parsing/error-formatting layer. The estimate implicitly priced in KEY_EXCH + credit management + retry queueing that the design deliberately does not carry. What the estimate did NOT undercharge: NTLMv2 type-3 byte layout and the SMB2 header offset map both cost debugging time (see §2) — LOC is a poor proxy here; the effort went into byte-exactness, not volume.

## 2. Dialect / spec surprises found during implementation

1. **SMB2 header byte trap (wave 1, replayed here):** the research §2 field map was mis-transcribed by one byte (Command@10/Credits@11-style vs the true MS-SMB2 §2.2.1.1 layout Command u16@12, Credits u16@14, Flags@16, MessageId@24, SessionId@40, Signature@48). The spec layout is implemented and pinned by round-trip tests. Any hand-rolled map must be checked against the spec section, not the research table.
2. **MD4 davenport erratum (wave 1):** the davenport NTLMv2-hash worked-example value `0x04b8e0ba…` DOES reproduce once MD4 is correct — the research's scratch port carried a double-op bug. The value is still NOT pinned as a literal expectation (independent hand-written HMAC-MD5 chain asserts the v2 hash instead — stronger than a literal pin).
3. **NBSS 17-bit length carry:** the 17th length bit rides in byte-1 bit 0 (RFC 1002), not a `length & 0x1FFFF` single field — subtle, test-pinned in the codec round-trip.
4. **Signing begins before the session exists:** the round-2 SESSION_SETUP (type-3) is the first SIGNED request — the client must derive the signing key from the type-3 SessionBaseKey BEFORE the frame goes on the wire. A naive "sign only after success" ordering stalls against signing-required servers.
5. **Dialect selection is boringly correct in-spec (MEDIUM marks honored):** offer `{0x0210, 0x0202}`, accept only those two. The interesting behavior is fleet-side, not protocol-side (see §3). OQ-3 adopted resolution implemented and test-pinned: **dialect-mismatch → `generic` class + `smbDialectUnsupported` code; signing-agreement refusal → `signingRequired`**. Both refusal paths are distinct, keyed errors.
6. **Session-expiry replay envelope** needed no speculative machinery: re-SESSION_SETUP on the same transport, replay once with a fresh MessageId, resume at the failed WRITE offset. Caps (1 replay/command + 2/session lifetime) are structural — the envelope cannot loop.

## 3. SMB2-min-3.0 fleet exposure (known risk — documented, NOT absorbed)

The client speaks **SMB 2.0.2/2.1 only**. SMB3-only fleets (hardened TrueNAS/Synology profiles with `min protocol = SMB3`, Windows Server 2025 defaults in some hardened baselines) will fail at NEGOTIATE with a keyed, non-cryptic error: `smbDialectUnsupported` (generic class). This is a **deployment-time risk**, not a code risk: the failure is explicit and typed, never a silent downgrade (the client never offers SMB1, never accepts a dialect outside the offered set, and never proceeds without a signing agreement — SC-2 posture held unconditionally).

**DEPLOY note for phase 100:** the real-server e2e recipe (dperson/samba, env-gated) must pin BOTH a `min protocol = SMB2` happy path AND a `SMB3-min` refusal path asserting the `smbDialectUnsupported` keyed result, so operator-facing locale work in 100 has a real string to attach to. A1 (the 'SMB2AESKey'+0x00 derivation label), A2 (1 credit/request), A3 (verbatim TargetInfo echo), A4 (SessionBaseKey direct-use without KEY_EXCH) all remain mock-verified only — the samba e2e is their first real-server falsification point.

## 4. OQ-3 decision record (for 100's locale work)

- Dialect-mismatch (server refuses 2.x): `smbClass: 'generic'`, `code: 'smbDialectUnsupported'` — NOT `signingRequired`. Rationale: conflating "wants SMB3" with "requires signing" would mislead operators; the SC-3 enum is closed, so the distinction rides the `code` field until 100 decides whether a locale key warrants surfacing it.
- Signing-refusal (SecurityMode lacks SIGNING_ENABLED): `smbClass: 'signingRequired'`, `code: 'smbSigningRequired'`.
- 100's locale work may add a dedicated message string keyed on `smbDialectUnsupported`; the class stays generic per the closed-enum ruling.

## 5. Go/No-Go verdict for phase 100

**GO.**

- The risk item (hand-rolled protocol client on a binary protocol) is contained to a single, zero-dependency, 1,106-LOC module with 37 automated tests (20 golden/codec + 17 client/mock), no wiring touched, suite at baseline (2,609 tests, exactly the 2 documented pre-existing failures).
- Every acceptance truth of the phase is test-pinned: signed serial session, verify-before-dispatch, D-01 promise surface, offset-resumed capped retry envelope, 9-class typed errors, D-04 scrub on every error path.
- Known-unknowns are honest and bounded: the four spec assumptions (A1–A4) and the struct byte-layouts are mock-pinned, not server-verified — phase 100's first samba e2e run is the falsification gate, and its failure mode is a keyed error at a specific command, not ambiguity.
- Condition attached to the GO: 100 must run the real-server e2e BEFORE wiring the destination into user-visible flows, and must keep the SMB3-min refusal path in the recipe (§3).
