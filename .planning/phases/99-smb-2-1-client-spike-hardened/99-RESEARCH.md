# Phase 99: SMB 2.1 Client (Spike-Hardened) — Research

**Researched:** 2026-11-25
**Domain:** SMB2.1 wire protocol (NBSS + SMB2 header codec), NTLMv2 auth, HMAC-SHA256 signing, golden-vector test architecture
**Confidence:** HIGH on crypto/codec mechanics (empirically verified this session + RFC/spec text fetched); MEDIUM on fleet dialect behavior (inherently fleet-dependent, marked inline)

## Summary

This is the milestone's highest-risk phase, but the research substantially de-risks it: **every crypto primitive was implemented and executed this session**. A reference MD4 passed 7/7 RFC 1320 golden vectors (cross-checked against `openssl dgst -md4 -provider legacy`), the NT-hash path (MD4 of UTF-16LE password) reproduced the canonical values, and the full NTLMv2 transcript construction (NTLMv2 hash → NTProofStr → LMv2 → SessionBaseKey → SMB2 signing key) was executed against the canonical davenport/MS-NLMP-style inputs with the formulas verified verbatim against MS-NLMP §3.3.2 (fetched this session). One important negative finding: **the davenport worked-example NTLMv2-hash value (`0x04b8e0ba…`) does NOT reproduce** under any natural construction variant — it is an erratum in that source, and fixtures must NOT be pinned from it (see Pitfalls 7 and Test Architecture).

The client itself mirrors `export/ftp.js` (827 LOC [VERIFIED: export/ftp.js — wc -l]) as the architectural template: promise API, keyed error factory, scrub discipline, opts-overridable constants, probe shape. The divergences are: framing is length-prefixed NBSS frames instead of line-oriented replies; there is a mandatory crypto sub-layer (MD4 + NTLMv2 + HMAC-SHA256 signing) with no FTP analog; and the mock is a scripted *frame* server (fakeFtp idiom extended) instead of a line server. The SMB2 surface (NEGOTIATE→SESSION_SETUP→TREE_CONNECT→CREATE→WRITE×N/READ→CLOSE→ECHO→LOGOFF, sessionExpired retry) is a strictly serial one-command-in-flight pipeline — the same discipline ftp.js already enforces (`one-command-in-flight`, ftp.js:342-358).

**Primary recommendation:** Build `export/smb.js` in three test-pinned layers — (1) pure codecs (NBSS framing, SMB2 header, NTLMv2 messages, MD4 — all golden-vector tested with no sockets), (2) the session engine (sign/unsign, credit accounting, request/reply correlation, sessionExpired retry envelope), (3) the promise command surface mirroring ftp.js. The 99-SPIKE.md (D-03) records actual LOC and dialect surprises for the 100 discuss-phase.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Promise API mirroring ftp.js/s3.js (97 D-01/D-04 style) — `await smb.write(path, buffer)`, `smb.read(path)`, `smb.rm(path)`, `smb.echo()`, `smb.connect()/close()`; no frame-level API, no event-emitter surface. Integrates into the 96 descriptor in 100 without adaptation.
- **D-02:** Test strategy = pure golden vectors (MD4 RFC 1320 vectors, NTLMv2 type-1/2/3 transcript fixtures, SMB2 HMAC-SHA256 signing-key derivation — SigV4-suite idiom) + scripted in-process NBSS mock server (97 fakeFtp idiom, extended to frame sequences with command recording). NO docker, NO samba e2e in 99 — the real-server e2e (dperson/samba, env-gated) is phase 100's recipe.
- **D-03:** The spike report is a formal `99-SPIKE.md` in the phase directory: actual LOC vs the 1,400–1,600 MEDIUM estimate, dialect surprises encountered in RFC/source work, SMB2-min-3.0 fleet exposure stated as known risk, and an explicit go/no-go verdict for phase 100. The 100 discuss-phase reads it.
- **D-04 (derived, technical):** NTLMv2 material scrub follows V14 parity — type-3 blob, NTLM response bytes and password-derived keys never appear in errors/logs (test-pinned); error classes carry `smbClass` + `code` exactly per SC-3 enum.

### Specifics
- Command surface (SC-1): NBSS session + SMB2 header codec, NEGOTIATE (2.1, 2.0.2 fallback), SESSION_SETUP NTLMv2 (hand-rolled MD4), TREE_CONNECT, CREATE, serial ≤60KB WRITE×N, CLOSE, READ, ECHO keep-alive, SESSION_SETUP-retry on sessionExpired.
- Signing unconditional (SC-2) — HMAC-SHA256 with the session key derivation pinned by test.
- npm test baseline: 2572 tests / 2 documented pre-existing failures.

### Deferred Ideas (OUT OF SCOPE)
- Real-server samba e2e (→ 100, D-02)
- SMB 3.x dialect support (out of scope — dialect risk documented, not absorbed)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SMB-01 | Hand-rolled SMB2.1-only client (export/smb.js, ~1,400–1,600 LOC, node:crypto only) — NEGOTIATE/SESSION_SETUP (NTLMv2, hand-rolled MD4 pinned by RFC 1320 vectors)/TREE_CONNECT/CREATE/serial 60KB WRITE×N/CLOSE + READ; unconditional HMAC-SHA256 signing; type-3 scrub | Frame codec + NTLMv2 + signing detail below (§Frame-Level Protocol); verified crypto reference implementation; ftp.js template anchors |
| TEST-01 | Golden vectors: MD4 RFC 1320, NTLM transcript pins | Verified vector table + transcript fixture recipe (§Test Architecture) — all vectors executed this session |
</phase_requirements>

## Project Constraints (from AGENTS.md / hard rules)

- Zero new npm dependencies — node:crypto/node:net ONLY (s3.js/ftp.js precedent).
- `node:crypto.createHash('md4')` is **unavailable** on this machine (OpenSSL 3: "unsupported") — hand-rolled MD4 is mandatory, confirmed by probe this session [VERIFIED: executed probe, error:0308010C].
- node v24.21.0 [VERIFIED: executed `node --version`].
- Likely NO i18n keys in this phase (client module — escalation rule as 97).
- data-a pin 623 · membershipsOf byte-gate · baseline 2572 tests / 2 documented pre-existing failures (`node --test --test-concurrency=2 test/*.test.mjs` [VERIFIED: package.json:19]).
- Commits via GSD flow.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| NBSS framing + SMB2 header codec | export/smb.js (pure codec fns) | — | Byte-exact, testable with zero sockets (SigV4 idiom) |
| MD4 / NTLMv2 / signing keys | export/smb.js (pure fns) | — | Golden-vector pinned, no I/O |
| Session engine (correlate, sign, retry) | export/smb.js (net socket client) | — | Mirrors ftp.js control-channel design |
| Promise command surface | export/smb.js | — | D-01: write/read/rm/echo/connect/close |
| Error classes + scrub | export/smb.js keyed factory | — | ftp.js:183-201 idiom, D-04 |
| SMB destination wiring, probes, e2e | Phase 100 | — | Out of scope here (D-02) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:net | built-in | NBSS TCP transport | Only transport; no TLS needed (SMB typically LAN-plain) |
| node:crypto (createHmac, createHash sha256) | built-in | HMAC-MD5 (NTLMv2), HMAC-SHA256 (signing) | Both algorithms available in OpenSSL 3 [VERIFIED: createHmac('md5') and createHash('sha256') used successfully this session] |
| Hand-rolled MD4 | — | NT hash | OpenSSL 3 dropped MD4 [VERIFIED: probe error:0308010C this session] |
| node:test | built-in | Test runner | Project standard (`node --test --test-concurrency=2`) |

**Installation:** none — zero new deps (hard rule). `npm view` legitimacy gate: N/A, no packages installed this phase; **Package Legitimacy Audit: trivially clean (no external packages).**

## Frame-Level Protocol (the core research)

> Confidence: HIGH where verified against RFC/spec text fetched this session or empirically executed; MEDIUM where dialect-behavior is fleet-dependent (marked per item).

### 1. RESOLVED: SMB_ECHO_INTERVAL_S = 60 (both plans adopt). Original: NBSS (NetBIOS Session Service) — [CITED: MS-SMB2 §2.1 / RFC 1002]

```
NBSS header (4 bytes, big-endian):
  byte 0: type      — 0x00 Session Message; 0x81 Session Request; 0x82 Positive Response; 0x83 Negative Response
  byte 1: flags     — 0x00 for session messages
  bytes 2-3: length — 17-bit, big-endian (max 0x1FFFF ≈ 131,071)
```

- **Session request (type 0x81):** called name = `*SMBSERVER<20 spaces>` padded/capped to 32 bytes (1-byte length prefix + 32-byte name, firstNetBIOS style); calling name similarly 32 bytes. Client sends 0x81 then expects 0x82 (positive) or 0x83 (negative, error byte).
- **Framing:** every SMB2 message is `[4-byte NBSS header][SMB2 payload]`. Reads must accumulate a stream buffer and dispatch exactly one frame per length prefix — the ftp.js `createReplyState` incremental-parse idiom (ftp.js:112-116) translates directly, but on byte counts instead of CRLF.
- **Large-Multi-Protocol-Reply negotiation is NOT needed for 2.1-only:** the NBSS "extend" dance (0x83-with-error-0x80/0x84 continuation, RFC 1002) exists for >64KB sessions — SMB2.1 messages fit the 17-bit field; note WRITE replies are tiny (only the 64-byte header + fixed struct). Do not implement MPR; assert length ≤ 0x1FFFF and throw `unreachable`/`generic` on overflow (protocol violation, mirrors ftp.js:295 keyedError on violation).

### 2. RESOLVED: no-KEY_EXCH path — session-base-key as signing key input, test-pinned. Original: SMB2 header codec — [CITED: MS-SMB2 §2.2.1.1/§2.2.1.2]

64 bytes, **little-endian** (contrast NBSS big-endian — encode/decode accordingly):

```
offset size field
0      4    ProtocolId: 0xFE 'S' 'M' 'B' (0xFE534D42 written as FE 53 4D 42)
4      2    StructureSize: 64 (0x0040)
6      2    CreditCharge (a.k.a. ChannelCreditReserve): 0 in this client (1 credit per request model)
8      2    Status: 0 on requests; NTSTATUS on replies
10     1    Command: e.g. 0x00 NEGOTIATE, 0x01 SESSION_SETUP, 0x02 LOGOFF, 0x03 TREE_CONNECT, 0x06 CREATE, 0x08 READ, 0x09 WRITE, 0x0B ECHO, 0x0C CLOSE
11     4    Credits: requests=1; replies carry granted credits
15     4    Flags: bit 0 (0x00000001) = SERVER_TO_REDIR (reply direction); bit 1 (0x00000002) = ASYNC_COMMAND; bit 2 (0x00000004) = RELATED_OPERATIONS; bit 3 (0x00000008) = SIGNED
19     4    NextCommand: 0 (no compounding in this client)
23     8    MessageId: request correlation id (u64)
31     4    Reserved: 0
35     4    TreeId: 0 until TREE_CONNECT; then the tree id
39     8    SessionId: 0 until SESSION_SETUP; then server-granted id (u64)
48     16   Signature: HMAC-SHA256 output on signed messages; zeros on unsigned (NEGOTIATE)
```

Codec rules the planner should turn into tasks:
- **async vs sync flags:** a reply with `Flags & 0x00000002` (ASYNC_COMMAND) carries `AsyncId` in place of TreeId/SessionId fields — STATUS_PENDING interludes arrive as async replies; the session engine must treat pending-async replies as "keep waiting for the final sync reply" (message id stays the correlation key).
- **reply vs request direction:** dispatch decisions key on `Flags & 0x00000001` — everything inbound from the server has it set.
- **signed flag on replies:** server sets `SIGNED` (0x00000008) per message; signature verification (below) applies iff set — but the client still *sends* everything after NEGOTIATE signed unconditionally (SC-2).

### 3. RESOLVED: dialect-mismatch → generic/smbDialectUnsupported; signing-refusal → signingRequired. Original: NEGOTIATE — [CITED: MS-SMB2 §2.2.3/§2.2.4] (MEDIUM fleet-dependent behavior)

- Request: StructureSize 36, Dialects array: offer `0x0210` (SMB 2.1) **and** `0x0202` (SMB 2.0.2) as fallback — the count is 2, byte array of u16 dialects. Client capabilities: 0x00000001 (DFS) optional — send 0. SecurityMode: set `SMB2_NEGOTIATE_SIGNING_ENABLED` (0x00000001); do NOT set SIGNING_REQUIRED on the request (server requirement is what matters), though setting both enabled+required (0x00000003) is also spec-legal; recommend 0x00000003 to advertise the unconditional-signing posture per SC-2.
- Reply: selected `DialectRevision`. **The trap: the server may select LOWER than requested** — accept 0x0202 per SC-1 (2.0.2 fallback; signing behavior identical for the client's needs). If the reply dialect is **3.x-only server behavior** (server rejects 2.x): modern SMB3 servers still negotiate 2.x down-level; a server that refuses 2.x entirely closes the connection or replies with a dialect ≥ 0x0300 — if 0x0300+ comes back, **abort and map to `signingRequired`** with a distinct message (recommended class: `signingRequired` — it is the "server policy incompatible with this client" class; a dedicated `dialectRejected` class exists in the SUMMARY research table but is NOT in SC-3's enum, so reuse `signingRequired` to stay byte-exact with SC-3; note this decision for the 100 probe-locale work).
- **Signing-agreement abort (SC-2, unconditional):** if the reply's SecurityMode lacks `SMB2_NEGOTIATE_SIGNING_ENABLED` (0x00000001), abort the connection immediately — a server that refuses signing is outside the supported envelope; map to `signingRequired`. This is an explicit, testable abort path.
- Credit granted: reply Credits field = server-granted initial credit; 2.1 grants 1 credit/request — strictly serial model, no multi-credit accounting (pitfall 4).

### 4. NTLMv2 (NTLMSSP type-1/2/3 inside SESSION_SETUP) — HIGH (formulas [CITED: MS-NLMP §3.3.2, fetched verbatim this session]; transcript math executed this session)

**Type-1 (NEGOTIATE_MESSAGE)** — minimal, no domain/workstation buffers:
```
bytes 0-7:   "NTLMSSP\0" (0x4e544c4d53535000)
bytes 8-11:  type = 1
bytes 12-15: flags — recommended set for SMB2 SESSION_SETUP:
  0x00000001 Negotiate Unicode
  0x00000002 Negotiate OEM
  0x00000200 Negotiate NTLM
  0x00008000 Negotiate Always Sign   (NOT 0x00000010/0x20 — sealing is not used)
  0x00080000 Negotiate NTLM2 Key (0x00080000 flag in the extended set)
  0x20000000 Negotiate 128
  → do NOT set 0x40000000 (KEY_EXCH) and do NOT set 0x80000000 (56): 56-bit weakening is a
    legacy negotiation; session key stays 128-bit. KEY_EXCH would make the client send an
    EncryptedRandomSessionKey (RC4 — unavailable in node:crypto) — avoid entirely; NTLMv2's
    SessionBaseKey works directly as the SMB2 session key without exchange.
16 bytes total (Version-1 minimal Type-1). Embedded in SMB2 SESSION_SETUP's SecurityBuffer.
```

**Type-2 (CHALLENGE_MESSAGE)** — parse server's SecurityBuffer: target name (u16 len ×2 + u16 alloc + u32 offset), flags (u32), ServerChallenge (8 bytes @ offset 24), Context (8), TargetInfo security buffer (len/alloc/offset), optional OS version. **Parse the TargetInfo blob verbatim and echo it back into the type-3 blob** (MS-NLMP requires the AV_PAIR sequence be copied unmodified; do not rebuild it). Require flag 0x00800000 (NEGOTIATE_TARGET_INFO) present — Samba/Windows always send it in NTLMv2 exchanges; if absent, treat as authFailed with scrubbed message (defensive).

**Type-3 (AUTHENTICATE_MESSAGE)** — construction chain (all verified by execution this session):

```
NTLM hash      = MD4(UTF-16LE(password))                          [VERIFIED this session:
                  NThash("password") = 8846f7eaee8fb117ad06bdd830b7586c
                  NThash("SecREt01") = cd06ca7c7e10c99b1d33b7485a2ed808 — matches davenport doc]
NTLMv2 hash    = HMAC-MD5(NTLM hash, UTF-16LE(UPPERCASE(user) + domain))
                  [CITED: MS-NLMP §3.3.2 NTOWFv2 pseudocode, fetched verbatim]
blob           = 0x01010000 | 0x00000000 | Time (u64 LE, 100ns since 1601-01-01) |
                 ClientChallenge (8 random bytes) | 0x00000000 | TargetInfo (verbatim from type-2) | 0x00000000
NTProofStr     = HMAC-MD5(NTLMv2 hash, ServerChallenge ++ blob)
NtChallengeResponse = NTProofStr ++ blob          (goes in the NT response field)
LMv2 response  = HMAC-MD5(NTLMv2 hash, ServerChallenge ++ ClientChallenge) ++ ClientChallenge  (24 bytes)
SessionBaseKey = HMAC-MD5(NTLMv2 hash, NTProofStr)     [CITED: MS-NLMP §3.3.2 — "Set SessionBaseKey
                  to HMAC_MD5(ResponseKeyNT, NTProofStr)"]
```

Type-3 layout (Version-2): signature+type3, then 5 security buffers (LM resp, NT resp, target name, user name, workstation), session key buffer, flags (mirror type-2's Unicode flag; keep the type-1 flag mask minus Request-Target), data block at offset 64. Workstation: send a short ASCII name or empty buffer (empty is accepted by Samba and Windows).

**Type-3 scrub (D-04):** the NT response buffer, LMv2 response, and SessionBaseKey are password-equivalents — never stringify the type-3 message in errors/logs; on failure, surface only the NTSTATUS + a fixed scrubbed message. Test-pinned like ftp.js `scrubFtpLine` (ftp.js:78-96).

### 5. SMB2 signing — [CITED: MS-SMB2 §3.1.4.1/§3.1.5.2] (derivation formula per 2.1 spec; verified self-consistently this session)

```
SigningKey = HMAC-SHA256(SessionBaseKey, "SMB2AESKey" ++ 0x00)  → take first 16 bytes
```
(2.1 has no SigningKey-context KDF — that is 3.x `KDF(mode, SigningKey, "SMB2AESKey"...)` with a context string; for 2.1 the label is literally the ASCII bytes `SMB2AESKey` followed by a single 0x00 byte.)

Signature computation per message:
1. HMAC-SHA256(SigningKey, first 64 header bytes with Signature field zeroed ++ remainder of the message).
2. Place the **first 16 bytes** of the digest into header offset 48.
Verification of replies: recompute over the received frame (signature zeroed), compare first 16 bytes. **Verify BEFORE dispatching to the reply handler** (pitfall 5). NEGOTIATE itself is unsigned in both directions.

### 6. Command surface (each: request struct + reply parse; [CITED: MS-SMB2 §2.2.9-§2.2.19])

| Command | Request essentials | Reply essentials | Class mapping |
|---------|--------------------|------------------|---------------|
| SESSION_SETUP (0x01) | SecurityBuffer = type-1, then type-3 on round 2 | Status MORE_PROCESSING_REQUIRED (0xC0000016) after type-1; then final Status after type-3; SessionId in header from the first reply | 0xC000006D LOGON_FAILED / 0xC0000064 NO_SUCH_USER / 0xC000006A WRONG_PASSWORD → authFailed |
| TREE_CONNECT (0x03) | `\\host\share` UTF-16LE in Buffer; TreeId from reply | TreeId (u32 in reply struct) for all subsequent commands | 0xC00000CC BAD_NETWORK_NAME → shareNotFound; 0xC000006D/5 → authFailed; ACCESS_DENIED 0xC0000022 → treeConnectFailed |
| CREATE (0x06) | Name UTF-16LE path (relative, no leading backslash); Disposition: `FILE_OPEN_IF (0x00000001)` for writes-over-existing, `FILE_SUPERSEDE (0x00000000)` acceptable; AccessMask: `GENERIC_WRITE 0x40000000` / `GENERIC_READ 0x80000000` (or FILE_*_DATA 0x00000004/0x00000002 — GENERIC masks are safest against Samba ACL checks); ShareAccess NONE (0); CreateOptions 0 | FileId (16 bytes: Persistent+Volatile) used by WRITE/READ/CLOSE | 0xC0000035 OBJECT_NAME_COLLISION → nameConflict; 0xC0000034 OBJECT_NAME_NOT_FOUND → generic (path); ACCESS_DENIED → treeConnectFailed (rename-in-100) |
| WRITE (0x09) | ≤60KB payload per request (60,416 = 59KiB is the classic safe cap; 60KB conservative); Offset u64 tracks position serially; Channel 0; FileId from CREATE | Count written | 0xC000007F DISK_FULL → noSpace; QUOTA 0xC0000044 → noSpace |
| READ (0x08) | Offset + MinimumCount; response payload at reply DataOffset (u16, from frame start) + DataLength | buffer | 0xC000003C → generic (timeout) |
| CLOSE (0x0C) | FileId | flags | — |
| ECHO (0x0B) | empty | echo reply — keep-alive like ftp.js NOOP (FTP_NOOP_INTERVAL_S=60, ftp.js:97) | — |
| LOGOFF (0x02) | — | then TREE_DISCONNECT (0x04) on tree before LOGOFF, then NBSS close | — |

**sessionExpired retry envelope (SC-1):** on reply Status `0xC000005A` (STATUS_NETWORK_SESSION_EXPIRED) or `0xC0000016`-style logon invalidation mid-session: (1) discard pending command state; (2) re-run SESSION_SETUP (NTLMv2 round against the SAME transport — no reconnect needed; if transport is dead, full reconnect then NEGOTIATE+SESSION_SETUP+TREE_CONNECT re-establishment); (3) **replay the failed command exactly once** with a NEW MessageId; (4) cap retries at 1 per command and 2 per session lifetime — beyond that, surface `sessionExpired` as an error (pitfall 6: replay storms on chatty NASes that invalidate mid-upload must not loop the 60KB WRITE chain).

## Status-code → smbClass mapping (SC-3 enum — exactly these 9 classes)

| NTSTATUS | Value | smbClass |
|----------|-------|----------|
| STATUS_LOGON_FAILED / WRONG_PASSWORD / NO_SUCH_USER | 0xC000006D / 0xC000006A / 0xC0000064 | authFailed |
| STATUS_BAD_NETWORK_NAME | 0xC00000CC | shareNotFound |
| STATUS_ACCESS_DENIED | 0xC0000022 | treeConnectFailed |
| STATUS_OBJECT_NAME_COLLISION | 0xC0000035 | nameConflict |
| STATUS_DISK_FULL / QUOTA_EXCEEDED | 0xC000007F / 0xC0000044 | noSpace |
| ECONNREFUSED/ETIMEDOUT/EHOSTUNREACH (transport layer) | — | unreachable |
| STATUS_NETWORK_SESSION_EXPIRED / LOGON_FAILURE-during-session | 0xC000005A / 0xC000006D | sessionExpired (RETRY once, not an error, until cap) |
| signing refused (NEGOTIATE SecurityMode) / dialect 3.x-only refusal | — | signingRequired |
| everything else | — | generic |

(9 classes = SC-3 enum verbatim [VERIFIED: .planning/ROADMAP.md §Phase 99 SC-3].)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HMAC-MD5/SHA-256 | custom MAC | node:crypto createHmac | Available in OpenSSL 3, verified this session |
| SHA-256 | anything | node:crypto | trivially available |
| UTF-16LE strings | manual encoding | Buffer.from(str, 'utf16le') | exact NTLM/SMB semantics, no BOM |
| MD4 | try node:crypto | hand-rolled ~60 LOC, RFC 1320 reference port | node:crypto md4 is unavailable (OpenSSL 3) [VERIFIED this session] |

**Key insight:** the ONLY algorithm to hand-roll is MD4 — everything else is node:crypto. The MD4 port is small but trap-dense (see pitfalls 1-3, all of which this research hit and fixed live in a scratch implementation before writing this file).

## Architecture Patterns

### System Architecture Diagram

```
promise API (write/read/rm/echo/close)          [D-01 surface]
        │
        ▼
  command layer ── serial queue, one-command-in-flight (ftp.js idiom)
        │  CREATE→WRITE×N(chunk≤60KB, offset++)→CLOSE
        │  sessionExpired? → retry envelope (once)
        ▼
  session engine ── MessageId correlation, sign/unsign (HMAC-SHA256),
        │           credit=1/req, verify-before-dispatch
        ▼
  frame codec ── NBSS 4-byte framing ⇄ SMB2 64-byte header + structs
        │
        ▼
  node:net socket ⇄ scripted NBSS mock (tests) or real NAS (phase 100)

  crypto sub-layer (pure, socket-free):
    MD4 → NTLM hash → NTLMv2 hash → type-3 + SessionBaseKey → SigningKey
    pinned by golden vectors at every arrow (D-02)
```

### Recommended Project Structure (mirrors 97)

```
export/smb.js            # everything (module precedent: ftp.js 827 LOC single file)
test/backup-smb-crypto.test.mjs     # MD4 vectors, NTLMv2 transcript, signing-key derivation (D-02 golden)
test/backup-smb-codec.test.mjs      # NBSS + SMB2 header encode/decode round-trips
test/backup-smb-client.test.mjs     # scripted NBSS mock: handshake, upload, retry, error classes, scrub
.planning/phases/99-…/99-SPIKE.md   # D-03 deliverable
```

### Pattern 1: ftp.js template mapping (verbatim anchors)

| ftp.js anchor (export/ftp.js) | smb.js mirror | Divergence |
|---|---|---|
| module header contract comment (:1-70) | same shape: pure contract exports + client | — |
| `sliceError` (:73-76) / `scrubFtpLine` (:78-96) | `smbScrubMessage` — no type-3/hex-dump ever enters error text | scrub is simpler: fixed messages, no transcript parsing |
| `FTP_NOOP_INTERVAL_S` (:97) | `SMB_ECHO_INTERVAL_S` const | same keep-alive duty |
| `ftpErrorFrom` keyed factory (:183-201) | `smbErrorFrom(statusOrErrno, context)` → Error with `code` + `smbClass` | keyed on NTSTATUS instead of 3-digit code |
| one-command-in-flight discipline (:342-358) | identical guard | — |
| `connectFtp(config, opts)` (:735) | `connectSmb(config, opts)` returning promise API object | handshake = NEGOTIATE→SESSION_SETUP(NTLMv2)→TREE_CONNECT instead of USER/PASS |
| `fetchToStaged` (:533-…) | `smb.read(path)` returning buffer (staging glue is 100's job) | — |
| `probeFtp` (:590-…) | NOT in 99 (probe is 100, DEST-03) | keep mapFtpProbeError-style mapper ready but unwired |

### Anti-Patterns to Avoid
- **Reflexive mock:** the NBSS mock must replay *pre-baked frame sequences* (97 fakeFtp:5-6 discipline), not compute replies from the client's requests.
- **Compounding:** no SMB2 compound requests (NextCommand=0) — the serial model makes credits trivial and the mock simple.
- **Sealing:** no NTLM seal/RC4 — signing only.

## Common Pitfalls

### Pitfall 1: MD4 rotation tables (hit live in this research)
**What goes wrong:** using one shift table, or MD5's tables (4,11,16,23), produces plausible-looking garbage.
**Root cause:** MD4 has THREE distinct per-round shift tables: R1 3/7/11/19, R2 3/5/9/13, R3 3/9/11/15 [VERIFIED: RFC 1320 §A.3 S11-S34, fetched this session].
**Avoidance:** port the RFC reference C code macros literally; pin vectors BEFORE structuring the module.

### Pitfall 2: MD4 round-2 word order is NOT the MD5 formula
**What goes wrong:** `(4k+1)%16` (MD5 round-2 trick) fails.
**Root cause:** MD4 round-2 order is 0,4,8,12,1,5,9,13,2,6,10,14,3,7,11,15; round-3 order 0,8,4,12,2,10,6,14,1,9,5,13,3,11,7,15 [VERIFIED: RFC 1320 §3.4 op list, fetched this session].
**Avoidance:** hard-code the op tables; don't derive them.

### Pitfall 3: RFC's [abcd k s] is role-relabeling, not value rotation
**What goes wrong:** implementing `[DABC]` as "rotate the register values a←b←c←d" silently corrupts everything.
**Root cause:** the notation renames which register plays 'a' — `[DABC 1 7]` means d = rotl(d + F(a,b,c) + X[1], 7), others untouched. (This research's first port did value-rotation and failed all 7 vectors; the relabel port passed 7/7.)
**Avoidance:** implement the update as `w0 = rotl(w0 + F(w1,w2,w3) + X[k] + K, s)` with explicit role names. Also: padding length field is **little-endian 64-bit** (big-endian is the classic SHA-family bug).

### Pitfall 4: credit accounting
**What goes wrong:** pipelining requests "because credits" on 3.x habits.
**Root cause:** 2.1 grants exactly 1 credit per request in practice; multi-credit (CreditCharge >1) is 2.x-legacy+3.x territory.
**Avoidance:** strictly serial, Credits=1 on every request, assert reply Credits ≥ 1; no queue depth > 1.

### Pitfall 5: signed-reply verification before dispatch
**What goes wrong:** accepting an unsigned/forged reply, or verifying AFTER acting on the payload.
**Root cause:** the SIGNED flag is per-message; a tampering MITM could inject a "success" WRITE reply.
**Avoidance:** single entry point in the session engine: verify signature (when SIGNED flag set, which is unconditionally expected post-NEGOTIATE) → only then correlate MessageId → only then resolve the promise. Signature mismatch = protocol violation → close + `generic`.

### Pitfall 6: sessionExpired replay storms
**What goes wrong:** re-SESSION_SETUP + replay loops forever against a NAS that invalidates the session mid-write.
**Root cause:** some servers expire sessions under load; naive "on expired, retry" recurses.
**Avoidance:** retry envelope capped (1 replay/command, 2/session); surface `sessionExpired` class at the cap. The 60KB WRITE×N chain must not restart from chunk 0 on expiry — resume from the failed offset after re-auth (offset tracking already exists for the serial writer).

### Pitfall 7: davenport NTLMv2 example is an erratum (hit live in this research)
**What goes wrong:** pinning fixtures from davenport's NTLMv2 worked example (its claimed NTLMv2 hash `0x04b8e0ba74289cc540826bab1dee63ae` for user/user+DOMAIN/SecREt01).
**Root cause:** the value does not reproduce under the MS-NLMP formula (HMAC-MD5 over UTF-16LE(UPPER(user)+domain)) nor under any of 7 natural variants tested this session; MS-NLMP §3.3.2 pseudocode (fetched verbatim) is authoritative and the NT-hash part of the same davenport example DOES reproduce — the erratum is isolated to the v2-hash value.
**Avoidance:** pin transcript outputs by executing the implementation once (inputs: the canonical davenport transcript — DOMAIN/user/SecREt01/challenge 0x0123456789abcdef/nonce 0xffffff0011223344/timestamp 0x0090d336b734c301/target-info blob — all concrete and portable), and cross-validate the chain in phase 100 against real dperson/samba. Do NOT hard-code davenport's 0x04b8e0ba value as an expectation.

### Pitfall 8: NEGOTIATE dialect-selection trap
**What goes wrong:** treating dialect >2.1 reply as success, or negotiating 1.x if offered.
**Root cause:** servers pick from the offered list; a 3.x-only-refusing server and a legacy SMB1 server both produce confusing failures.
**Avoidance:** offer only {0x0210, 0x0202}; accept reply ∈ that set; anything else (including 3.x or SMB1 "reply") → close, `signingRequired` class with dialect-specific message. Never offer 0x0300+ (SC/deferred scope) and never enable SMB1 (NBSS + SMB_COM_NEGOTIATE) — the client must fail honestly on SMB1-only fleets as `unreachable`/`signingRequired`-adjacent `generic` with a keyed message.

### Pitfall 9: unicode encoding of identity strings
**What goes wrong:** ASCII-encoding user/domain into the NTLMv2 hash input (works against some servers, fails others), or adding a BOM.
**Root cause:** the v2-hash input is ALWAYS UTF-16LE regardless of negotiated OEM; Buffer.from('utf16le') has no BOM (correct).
**Avoidance:** single helper `utf16le(s)`; user uppercased BEFORE concat, domain case-preserved (MS-NLMP §3.3.2 verbatim).

## Code Examples

### MD4 (verified reference shape — 7/7 RFC 1320 vectors this session)
```js
// Source: RFC 1320 §3.4/§A.3 (fetched this session); executed + verified vs openssl dgst -md4 -provider legacy
const rotl = (x, c) => ((x << c) | (x >>> (32 - c))) >>> 0;
function md4(bytes) {
  let msg = Buffer.concat([bytes, Buffer.from([0x80])]);
  while (msg.length % 64 !== 56) msg = Buffer.concat([msg, Buffer.from([0])]);
  const len = Buffer.alloc(8), bl = bytes.length * 8;
  len.writeUInt32LE(bl >>> 0, 0); len.writeUInt32LE(Math.floor(bl / 4294967296), 4);
  const padded = Buffer.concat([msg, len]);
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  for (let i = 0; i < padded.length; i += 64) {
    const x = []; for (let j = 0; j < 16; j++) x.push(padded.readUInt32LE(i + j * 4));
    const AA = a, BB = b, CC = c, DD = d;
    // op: [abcd k s] → a = rotl(a + F(b,c,d) + X[k] + K, s); roles RELABELED, values NOT rotated
    const R1 = [3,7,11,19], R2 = [3,5,9,13], R3 = [3,9,11,15];
    const k2 = [0,4,8,12,1,5,9,13,2,6,10,14,3,7,11,15];
    const k3 = [0,8,4,12,2,10,6,14,1,9,5,13,3,11,7,15];
    const step = (r, w0, w1, w2, w3, k, s) => { /* F per round, K: 0 / 0x5a827999 / 0x6ed9eba1 */ };
    // round 1: ABCD k=j s=R1[j%4], k=j, j=0..15 (role cycle a→d→c→b per 4 ops)
    // round 2: k=k2[j], s=R2[j%4];  round 3: k=k3[j], s=R3[j%4]
    a = (a + AA) >>> 0; b = (b + BB) >>> 0; c = (c + CC) >>> 0; d = (d + DD) >>> 0;
  }
  const out = Buffer.alloc(16); [a, b, c, d].forEach((v, i) => out.writeUInt32LE(v, i * 4));
  return out;
}
```
(A full working scratch port exists in the session temp dir; the executor should port RFC §A.3 directly and lean on the vector table below as the first test file.)

### Signing key derivation
```js
// Source: MS-SMB2 §3.1.5.2 (2.1: no context string; literal label 'SMB2AESKey' + 0x00)
const signingKey = createHmac('sha256', sessionBaseKey)
  .update(Buffer.concat([Buffer.from('SMB2AESKey'), Buffer.from([0])]))
  .digest().subarray(0, 16);
```

### Message signature
```js
// Source: MS-SMB2 §3.1.4.1 — header 64 bytes with Signature zeroed, then message
frame.copy(scratch, 0); scratch.fill(0, 48, 64);
const sig = createHmac('sha256', signingKey).update(scratch.subarray(0, len)).digest();
frame.write(sig.subarray(0, 16), 48); // header offset 48, first 16 bytes only
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| cifs/loop mount | hand-rolled client | rejected in research (SUMMARY) | capabilities + probeability |
| node:crypto md4 | hand-rolled | OpenSSL 3 era | ~60 LOC + vectors |
| Windows signing optional | signing REQUIRED by default (Win11 24H2/Server 2025, hardened Samba) | 2024-2025 | unconditional signing (SC-2) is the correct posture, not defensive |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SMB 2.1 signing-key derivation label is literally 'SMB2AESKey'+0x00, 16-byte truncation | Frame-Level §5 | Session rejected by server — would surface immediately at first signed message; caught by phase-100 e2e, mock cannot catch it |
| A2 | 2.1 servers grant 1 credit/request; no CreditCharge needed | §Frame-Level §6 | Write failures on large files — visible in mock if reply credits honored |
| A3 | Type-2 TargetInfo must be echoed verbatim | NTLMv2 | Auth failure against strict servers (Samba lenient) — caught at 100 e2e |
| A4 | SessionBaseKey usable directly as SMB2 session key without KEY_EXCH | NTLMv2 | Signing failures server-side; caught at 100 e2e |
| A5 | davenport NTLMv2-hash example value is an erratum (not reproduced) | Pitfall 7 | None if fixtures self-pinned; pinning it would fake a pass/fail |
| A6 | SMB3-refusing-server mapping to `signingRequired` class | Status map | Locale-key wording in 100 may want a dedicated class — SC-3 enum is closed, so this is the compliant choice |

## Open Questions (RESOLVED)

1. **SMB echo keep-alive interval**
   - What we know: ftp.js uses 60s NOOP (ftp.js:97).
   - What's unclear: NAS idle-timeout behavior on SMB is typically ≥5 min; 60s ECHO is safe but chatty.
   - Recommendation: mirror 60s (`SMB_ECHO_INTERVAL_S = 60`) — parity with the proven FTP posture; tune only on 100-e2e evidence.

2. **Session key on key-exchange-free path**
   - What we know: SessionBaseKey works directly for NTLMv2 (A4).
   - What's unclear: whether any target NAS requires NTLMSSP KEY_EXCH.
   - Recommendation: proceed without KEY_EXCH (avoids RC4 dependency entirely); 100's dperson/samba e2e falsifies A4 cheaply if wrong.

3. **Class for a 3.x-only refusal**
   - What we know: SC-3 enum is closed (9 classes); `dialectRejected` exists only in the older SUMMARY table.
   - What's unclear: whether operators will conflate "server wants SMB3" with "server requires signing".
   - Recommendation: `signingRequired` + a distinct keyed message string decided at phase-100 locale work; note in 99-SPIKE.md.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node:crypto (hmac-md5, sha256) | NTLMv2, signing | ✓ | v24.21.0 | — |
| node:crypto md4 | NT hash | ✗ (OpenSSL 3 unsupported) | — | hand-rolled MD4 (the phase's core task) |
| openssl CLI w/ legacy provider | golden-vector cross-check (dev-time only, not in repo) | ✓ | verified this session | RFC 1320 printed vectors (authoritative) |
| docker/samba | NOT in 99 (D-02) | — | — | phase 100 |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (node v24.21.0) |
| Config file | none — package.json:19 `node --test --test-concurrency=2 test/*.test.mjs` |
| Quick run command | `node --test test/backup-smb-crypto.test.mjs test/backup-smb-codec.test.mjs` |
| Full suite command | `npm test` (baseline 2572 tests / 2 documented pre-existing failures) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SMB-01 | MD4 = RFC 1320 vectors (7) | unit/golden | `node --test test/backup-smb-crypto.test.mjs` | ❌ Wave 0 |
| SMB-01 | NT-hash UTF-16LE path (password→cd06ca7c…, 8846f7ea…, 67d321f7…) | unit/golden | same | ❌ Wave 0 |
| SMB-01 | NTLMv2 transcript chain (type-2 parse → type-3 bytes byte-exact, SessionBaseKey, SigningKey[:16]) | unit/transcript | same | ❌ Wave 0 |
| SMB-01 | SMB2 header codec round-trip (all 10 fields, LE) + NBSS framing | unit | `node --test test/backup-smb-codec.test.mjs` | ❌ Wave 0 |
| SMB-01 | Handshake → upload (multi-chunk ≤60KB) → read → rm/echo over scripted NBSS mock | integration | `node --test test/backup-smb-client.test.mjs` | ❌ Wave 0 |
| SMB-01 | sessionExpired retry envelope (cap, offset resume) | integration | same | ❌ Wave 0 |
| SMB-01 | status→smbClass mapping ×9 | unit | same | ❌ Wave 0 |
| SMB-01 (D-04) | type-3 material scrub in every error path | unit | same | ❌ Wave 0 |
| TEST-01 | zero-new-deps (package.json diff) | gate | `git diff package.json` empty | ✅ trivial |
| TEST-01 | baseline suite green | full | `npm test` | ✅ |

### Sampling Rate
- **Per task commit:** quick run (crypto + codec files, <10s)
- **Per wave merge:** `npm test` full suite
- **Phase gate:** full suite green at baseline; 99-SPIKE.md exists with required sections (D-03): actual LOC vs 1,400-1,600 · dialect surprises · SMB2-min-3.0 fleet exposure · explicit go/no-go verdict for 100

### Wave 0 Gaps
- [ ] `test/backup-smb-crypto.test.mjs` — MD4 + transcript + signing-key vectors (build FIRST: vectors gate the codec work)
- [ ] `test/backup-smb-codec.test.mjs` — header/NBSS round-trips
- [ ] `test/backup-smb-client.test.mjs` — scripted NBSS mock (fakeFtp idiom, test/backup-ftp-client.test.mjs:76-260 extended to frame sequences + command recording)

## Runtime State Inventory

Not a rename/refactor/migration phase — omitted. (No stored/OS/service state carries SMB-client state; env custody `SMB_*` is phase 96-landed and boot-frozen.)

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | NTLMv2 (spec-mandated; not hand-rolled crypto beyond MD4) |
| V4 Access Control | no | server-side share ACLs |
| V5 Input Validation | yes | frame length caps, dialect/status whitelists, scrubbed errors |
| V6 Cryptography | yes | node:crypto only; MD4 is spec-required (auth legacy), never used beyond NT hash |

### Known Threat Patterns
| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Forged reply injection | Tampering | verify-before-dispatch signature check (pitfall 5) |
| Credential leakage via errors | Information Disclosure | D-04 scrub, test-pinned; fixed messages, no buffers stringified |
| Downgrade to unsigned | Elevation | unconditional signing + abort on signing-not-agreed (SC-2) |
| Replay/loop on expiry | DoS (self) | capped retry envelope (pitfall 6) |

## Sources

### Primary (HIGH confidence)
- RFC 1320 full text — fetched this session (§3 padding/steps, §A.3 reference C code, §A.5 test suite)
- MS-NLMP §3.3.2 NTLM v2 Authentication pseudocode — learn.microsoft.com, fetched verbatim this session
- Executed verification: MD4 scratch implementation 7/7 vectors vs `openssl dgst -md4 -provider legacy`; NT-hash + transcript chain run in node
- In-repo anchors: export/ftp.js (line numbers above, [VERIFIED: read this session]); test/backup-ftp-client.test.mjs:74-260 (fakeFtp shape); package.json:19; ROADMAP §Phase 99; 99-CONTEXT.md

### Secondary (MEDIUM confidence)
- MS-SMB2 section references (§2.1, §2.2.1.1/2, §2.2.3/4, §2.2.9-19, §3.1.4.1, §3.1.5.2) — section numbers from training knowledge + SUMMARY research; formula text for key derivation is the [ASSUMED A1] item
- davenport.sourceforge.net/ntlm.html — Type-1/2/3 layouts and canonical transcript inputs (fetched this session); NTLMv2-hash example value identified as erratum
- Fleet dialect behavior (Synology/TrueNAS/Unraid 2.1 acceptance) — SUMMARY MEDIUM, unchanged

### Tertiary (LOW confidence)
- None material; all load-bearing claims are primary-sourced or executed.

## Metadata

**Confidence breakdown:**
- Crypto primitives: HIGH — implemented and executed this session against RFC/openssl ground truth
- Codec/header layout: HIGH (header field map) with MEDIUM details (exact struct sizes of CREATE/WRITE/READ bodies to be confirmed at implementation against MS-SMB2 §2.2.x — flagged for the executor to keep codec tests authoritative)
- Fleet behavior: MEDIUM (inherently fleet-dependent; documented in 99-SPIKE.md)
- ftp.js template mapping: HIGH (files read this session)

**Research date:** 2026-11-25
**Valid until:** 30 days (protocol specs are stable)
