# Phase 99: SMB 2.1 Client (Spike-Hardened) - Pattern Map

**Mapped:** 2026-11-25
**Files analyzed:** 5 (4 new + 99-SPIKE.md deliverable)
**Analogs found:** 3 / 4 (99-SPIKE.md is a phase-directory doc — no codebase analog, format per D-03)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `export/smb.js` (NEW, est. 1,400–1,600 LOC) | service (protocol client) | streaming + request-response over NBSS frames | `export/ftp.js` (827 LOC) | exact for architecture, **3 divergences** (framing, crypto sub-layer, mock coupling) |
| `test/backup-smb-crypto.test.mjs` (NEW) | test (pure golden vectors) | transform | `test/backup-s3-sigv4.test.mjs` (217 LOC) | exact idiom |
| `test/backup-smb-codec.test.mjs` (NEW — research adds it; frame round-trips) | test (pure unit) | transform | `test/backup-s3-sigv4.test.mjs` | role-match (SigV4 idiom applied to byte codecs) |
| `test/backup-smb-client.test.mjs` (NEW) | test (integration, scripted mock) | event-driven (frame sequences) | `test/backup-ftp-client.test.mjs` (737 LOC) | good idiom, **mock extended** to NBSS frames |
| `99-SPIKE.md` (NEW, phase-dir deliverable per D-03) | doc | — | none | no analog |

**Tracked-source gate:** `git ls-files` returns empty for all new paths (`export/smb.js`, all three test files, `99-SPIKE.md`) — all intended-new, no mirror-path risk. All analogs are git-tracked repo files.

**No wiring touched in 99:** `server.js`, `export/backup.js`, `export/restore.js` are NOT modified — the client is standalone (phase 100 wires it). Planner must not add wiring tasks.

---

## Pattern Assignments

### `export/smb.js` (service, streaming + request-response over NBSS)

**Primary analog:** `export/ftp.js` — copy architecture, not protocol. Mirror these anchors verbatim in shape:

**1. Module header contract comment + pure-contract exports** (ftp.js:1-70)
The header comment block lists frozen decisions (99 D-01..D-04), command surface, scrub rule, and the export contract consumed later by 100. Mirror this: `connectSmb(config, opts)` factory + pure exports (`md4`, `ntlmHash`, `buildNtlmType1/3`, `parseNtlmType2`, `deriveSigningKey`, `encodeNbssHeader`/frame codecs, `smbErrorFrom`, `SMB_ECHO_INTERVAL_S`) golden-vector tested.

**2. Scrub discipline (D-04)** — ftp.js:73-96:
```js
export function sliceError(error) {
  return String(error?.message || error).slice(0, 300);
}
export function scrubFtpLine(line) {
  return String(line).replace(/^(PASS|USER)\s+.*/i, (_m, cmd) => `${cmd.toUpperCase()} ***`);
}
```
**Divergence:** SMB scrub is SIMPLER but stricter — never stringify the type-3 message, NT/LMv2 response bytes, or session keys. Use fixed messages keyed on NTSTATUS; no transcript parsing at all (there is no reply text to scrub — statuses are numeric). Test-pinned: no password/NT-response hex in any error message.

**3. Keep-alive const** — ftp.js:96-97:
```js
export const FTP_NOOP_INTERVAL_S = 60;
```
Mirror as `export const SMB_ECHO_INTERVAL_S = 60;` (OQ-1 recommendation; const, NOT env).

**4. Keyed error factory (D-04, SC-3 enum)** — ftp.js:183-204:
```js
export function ftpErrorFrom(code, text, context = '') {
  const CLASSES = { 530: 'ftpAuthFailed', 550: 'ftpPathNotFound', ... };
  const scrubbed = scrubTranscript(text);
  const raw = `ftp ${code}: ${scrubbed}${context ? ` ${context}` : ''}`.trim();
  const err = new Error(sliceError(new Error(raw)));
  err.code = CLASSES[code] || 'ftpGeneric';
  err.ftpCode = code;
  err.ftpTransient = code >= 400 && code < 500;
  return err;
}
```
**Divergence:** keyed on NTSTATUS (u32) instead of 3-digit reply code; every error carries `err.code = 'smb<Class>'` and `err.smbClass` per the SC-3 9-class enum (research §Status-code table: authFailed / shareNotFound / treeConnectFailed / nameConflict / noSpace / unreachable / sessionExpired / signingRequired / generic). Slice message to 300 chars same as `sliceError`.

**5. Incremental stream parser (feed-accumulating, violation → keyed, never crash)** — ftp.js:112-162 (`createReplyState` / `parseReply`) and drain loop ftp.js:289-305:
```js
export function createReplyState() { return { code: null, lines: [] }; }
export function parseReply(buffer, state = createReplyState()) { /* ... returns { complete, code, lines, consumed, violation } */ }
```
**Divergence (the big one):** SMB framing is **length-prefixed NBSS frames** (4-byte big-endian header: type byte, flags byte, 17-bit length), not `\r\n`-line replies. Accumulate a byte buffer; dispatch exactly one frame per length prefix; assert length ≤ 0x1FFFF else keyed `generic` protocol violation (mirrors ftp.js:293-299 violation path). Parser must be pure (buffer-in, {frame, consumed}-out) for codec round-trip tests.

**6. One-command-in-flight discipline** — ftp.js:339-352:
```js
function sendCommand(ctl, line, { expect = null, context = '' } = {}) {
  return new Promise((resolve, reject) => {
    if (ctl.pending) {
      reject(new Error('ftp: a command is already in flight (one-command-in-flight discipline)'));
      return;
    }
    if (ctl.fatal || ctl.closed) { reject(ctl.fatal || keyedError(421, 'control channel is closed')); return; }
    armPending(ctl, { resolve, reject, expect, context, line });
    ctl.socket.write(line + '\r\n');
  });
}
```
**Divergence:** SMB enforces the same serial discipline structurally (2.1 = 1 credit/request, research Pitfall 4), but correlation is by **MessageId (u64)** not "the pending slot", and the dispatch path is: verify signature (if SIGNED flag) → correlate MessageId → handle status → resolve (research Pitfall 5 — verify BEFORE dispatch). `sendCommand` becomes `sendRequest(ctl, command, body, context)` that encodes a 64-byte SMB2 header (LE) + body, signs it, writes `[NBSS header][frame]`.

**7. Timeout / error / close ownership (Node doesn't destroy for you)** — ftp.js:242-270: socket.setTimeout arms per pending command; the timeout handler DESTROYS sockets and rejects keyed; error/close reject pending with `unreachable` (or `sessionExpired`-adjacent classes per the status map). Mirror exactly; transport errors (ECONNREFUSED/ETIMEDOUT/EHOSTUNREACH) map to `unreachable`.

**8. Async factory returning the promise client (D-01)** — ftp.js:735-827:
```js
export function connectFtp(config, opts = {}) {
  const ctlP = establish(config, opts);
  const ensure = () => ctlP;
  const ftp = {
    connect: async () => { await ctlP; },
    stor: async (targetPath, source, storOpts = {}) => { const ctl = await ensure(); ... },
    dele: async (targetPath) => { const ctl = await ensure(); await cmdExpect(...); return true; },
    noop: async () => { ... },
    quit: async () => { /* best-effort QUIT, destroy socket */ },
    end: async () => ftp.quit(),
  };
  return ftp;
}
```
Mirror as `connectSmb(config, opts)` → `{ connect, write, read, rm, echo, close }` (D-01 exact surface; no frame-level API, no event emitter). Handshake `establish()` mirrors ftp.js:634-733: dial → NBSS session request (0x81 → expect 0x82) → NEGOTIATE → SESSION_SETUP type-1 (expect MORE_PROCESSING_REQUIRED) → type-3 (final) → TREE_CONNECT. Keep-alive ECHO timer mirrors ftp.js:725-731 (`unref`'d interval).

**9. Chunked write / retry loop** — ftp.js `storWithRetry` :750-771 (attempt loop, transient-only retry, backoff). SMB divergence: WRITE×N chunk chain (≤60KB, serial, offset++ per chunk — offset state already exists conceptually in the serial writer); retry envelope is NOT a reconnect loop but the sessionExpired envelope (research §6): re-SESSION_SETUP on the same transport, replay the failed command ONCE with a NEW MessageId, resume from the FAILED OFFSET (never restart from chunk 0), caps 1 replay/command + 2/session, then surface `sessionExpired`.

**10. New crypto sub-layer (NO analog — research is the source):**
The only wholly new layer. `node:crypto` for HMAC-MD5/HMAC-SHA256/SHA-256; **hand-rolled MD4 only** (node:crypto md4 unavailable on OpenSSL 3, probe error:0308010C verified in research). Copy the verified reference shape from 99-RESEARCH.md §Code Examples: MD4 (RFC 1320 port — role-RELABELING not value rotation, three distinct shift tables, LE 64-bit length field), signing-key derivation (`HMAC-SHA256(SessionBaseKey, 'SMB2AESKey' ++ 0x00)[:16]`), message signature (header 64 bytes with Signature zeroed + body; first 16 digest bytes at header offset 48). NTLMv2 chain per research §4 — **do NOT pin davenport's 0x04b8e0ba… NTLMv2 hash (erratum, Pitfall 7)**; echo type-2 TargetInfo verbatim; `utf16le()` single helper, no BOM.

**Layer order (research recommendation):** build in three test-pinned layers — (1) pure codecs + crypto (socket-free), (2) session engine (sign/unsign, correlate, retry), (3) promise command surface.

---

### `test/backup-smb-crypto.test.mjs` (test, pure golden vectors)

**Analog:** `test/backup-s3-sigv4.test.mjs` — copy the idiom exactly:

**Header comment declaring vector provenance** (sigv4:1-20): state where every vector comes from (RFC 1320 §A.5 for MD4 ×7; NTLM transcript inputs from the canonical davenport transcript with outputs SELF-PINNED by executing the implementation once — per Pitfall 7 erratum finding; signing-key derivation per MS-SMB2 §3.1.5.2, self-consistency-pinned).

**Imports + pure-call shape** (sigv4:22-25):
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { sigv4Sign, s3UriEncode, s3ErrorFrom } from '../export/s3.js';
```
→ `import { md4, ntlmHash, buildNtlmType3, parseNtlmType2, deriveSigningKey, smbErrorFrom, ... } from '../export/smb.js';`

**Golden-vector assert style** (sigv4:34-52): call the pure fn, `assert.equal(bytes.toString('hex'), '8846f7eaee8fb117ad06bdd830b7586c')`. Cover: MD4 RFC 1320 ×7 (incl. empty string, 'a', 'abc', 448-bit and 512-bit-span messages), NT-hash UTF-16LE path (`password` → 8846f7ea…, `SecREt01` → cd06ca7c…), full NTLMv2 transcript (type-2 parse → byte-exact type-3, NTProofStr, LMv2, SessionBaseKey), SigningKey[:16] derivation, status→smbClass mapping ×9.

**Error-shape + scrub test** (sigv4:188-217): assert keyed class fields and that messages stay sliced and secret-free — same triple-assert style (`err.smbClass`, `err.code`, message ≤ ~320 chars, password/NT-response bytes absent).

**Cross-validation note:** openssl CLI with legacy provider was used at research time only — NOT in tests (portability).

---

### `test/backup-smb-codec.test.mjs` (test, pure unit round-trips)

**Analog:** same SigV4 suite idiom (pure fns, no sockets): NBSS header encode/decode (big-endian), SMB2 64-byte header encode/decode round-trip of all 10 fields (LE — contrast NBSS), signed-flag / async-flag / status field handling, frame split-across-chunks reassembly (the parser's `consumed` contract, mirroring ftp.js parseReply's partial-feed behavior).

---

### `test/backup-smb-client.test.mjs` (test, integration — scripted NBSS mock)

**Analog:** `test/backup-ftp-client.test.mjs` — the `fakeFtp` factory (:76-254). Copy its discipline:

**Non-reflexive scripted server** (backup-ftp-client:1-9 header + fakeFtp :76-79):
```js
function fakeFtp(scenario = {}) {
  const commands = [];     // recorded command lines (ordering assertions)
  const dataReceived = []; // buffers captured from data connections
```
**Divergence:** the SMB mock (`fakeSmb(scenario)`) is a **frame** server, not a line server: instead of `\r\n`-line dispatch (:126-136), it records/replays whole NBSS frames. Scenario supplies **pre-baked frame sequences** (NEGOTIATE reply with chosen dialect + credits, SESSION_SETUP MORE_PROCESSING_REQUIRED then final, TREE_CONNECT, CREATE, WRITE×N counters, READ payload, sessionExpired-then-success interleave). Command recording becomes **frame/command recording** (`commands` array of decoded SMB2 headers for ordering assertions — pin command order, MessageId freshness on replay, offset progression).

**Scenario knobs** mirror fakeFtp's flag style (:140-216): dialect-reply knob (0x0210 / 0x0202 / 3.x-refusal), signing-not-agreed knob, `sessionExpired` injection point (then success on replay; second expiry → error at cap), WRITE reply with truncated count, error-status replies per class, malformed-frame knob (bad length / bad signature → `generic` violation).

**Harness lifecycle** (:238-254): `listen()` on ephemeral 127.0.0.1 port, `port()` accessor, `close()` destroying all sockets + `closeAllConnections?.()` — copy verbatim shape. No TLS, no key/cert pair needed (SMB is plain LAN transport — the TEST_KEY/TEST_CERT block :23-72 has NO SMB analog; mock is substantially simpler there).

**Test scenarios to port:** handshake + upload (multi-chunk ≤60KB, offset ordering via recorded frames), read, rm/echo, sessionExpired replay envelope (resume at failed offset, MessageId new, cap enforced), every status→smbClass mapping, D-04 scrub assertions on every error path.

---

### `99-SPIKE.md` (phase-dir deliverable, D-03)

**No codebase analog.** Fixed sections per D-03: (1) actual LOC vs 1,400–1,600 MEDIUM estimate, (2) dialect surprises from RFC/source work, (3) SMB2-min-3.0 fleet exposure stated as known risk, (4) explicit go/no-go verdict for phase 100. The 100 discuss-phase reads it. Also record OQ-3's `signingRequired`-for-dialect-refusal decision per research recommendation.

---

## Shared Patterns

### Keyed error classes (`err.code` + domain-class field)
**Source:** `export/ftp.js:183-204` (`ftpErrorFrom`), `test/backup-s3-sigv4.test.mjs:188-217` (assertion shape)
**Apply to:** `export/smb.js` — every error carries `err.code = 'smb<Class>'` and `err.smbClass` (SC-3 closed 9-enum); messages sliced, scrubbed, test-pinned.

### Scrub / V14 parity (D-04)
**Source:** `export/ftp.js:73-96`
**Apply to:** smb.js error construction + one test in each test file asserting password-derived material never appears in error text.

### Zero-new-deps module discipline
**Source:** `export/ftp.js:64-70` (imports: node stdlib only)
**Apply to:** smb.js — `node:net` + `node:crypto` ONLY. Gate: `git diff package.json` empty.

### Offline, ungated, always-on tests
**Source:** `test/backup-s3-sigv4.test.mjs` header, `test/backup-ftp-client.test.mjs:1-9`
**Apply to:** all three new test files — in-process only, no docker/samba (that is phase 100's D-02 recipe).

### Scripted non-reflexive mock harness
**Source:** `test/backup-ftp-client.test.mjs:76-254`
**Apply to:** `test/backup-smb-client.test.mjs` — pre-baked frame sequences + command recording; NEVER compute replies from client requests.

### One-command-in-flight / verify-before-dispatch serial engine
**Source:** `export/ftp.js:339-352` (guard), :289-305 (drain + violation path)
**Apply to:** smb.js session engine — serial requests, MessageId correlation, signature verification before payload handling.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `export/smb.js` — crypto sub-layer | utility (pure crypto) | transform | No MD4/NTLMv2/SMB-signing code exists in the codebase; source is 99-RESEARCH.md §Frame-Level Protocol + §Code Examples (executed-verified this session) |
| `99-SPIKE.md` | doc | — | Phase-directory deliverable; format fixed by D-03 |

## Metadata

**Analog search scope:** `export/`, `test/` (backup-* suite)
**Files read in full:** export/ftp.js (827), test/backup-s3-sigv4.test.mjs (217), test/backup-ftp-client.test.mjs (mock region :1-300 of 737)
**Tracked-source gate:** all new paths verified absent from `git ls-files` (intended-new)
**Pattern extraction date:** 2026-11-25
