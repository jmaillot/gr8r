# Phase 97: FTP/FTPS Client (Zero-Dep) - Research

**Researched:** 2026-11-25
**Domain:** Hand-rolled FTP/FTPS wire client on node:net/node:tls (RFC 959/2228/4217/2428/3659), modeled on the in-repo `export/s3.js` precedent
**Confidence:** HIGH (in-repo anchors verified by read this session; protocol details from stable RFCs + milestone research; some wire details tagged ASSUMED where not probed)

<user_constraints>
## User Constraints (from CONTEXT.md 97-CONTEXT.md)

### Locked Decisions
- **D-01:** Promise API, style s3.js — `await ftp.stor(path, stream)`, `await ftp.dele(path)`, `await ftp.connect()/end()`, promisified control flow; no event-emitter surface. Integrates into the 96-01 descriptor without adaptation.
- **D-02:** The restore primitive `fetchToStaged(config, path, expectedSha256, stagingDir)` lives IN the client (sha256-on-pipe inside) — wiring in 98 is one descriptor field.
- **D-03:** NOOP keep-alive interval is 60s (below the 300s vsftpd idle default with margin) and configurable via const, not env.
- **D-04:** Error classes are plain `Error` subclasses with a `code` field (e.g. `err.code = 'ftpAuthFailed'`) — same shape s3.js uses for keyed mapping; no separate error-module.

### Specifics (verbatim, from 97-CONTEXT.md)
- Client file: `export/ftp.js` (~350 LOC target). Command surface: USER/PASS, TYPE I, AUTH TLS→PBSZ→PROT P (explicit), transport swap (implicit 990), EPSV with PASV fallback (control-host rule + `FTP_PASV_HOST` override; never EPSV ALL), STOR, DELE, SIZE, PBSZ/PROT P, REST, NOOP, QUIT. No LIST/MLST.
- TLS session-reuse: capture `controlSocket.getSession()` and pass to every data-channel `tls.connect` — pinned by test.
- Scrub rule: PASS line and any credential-bearing command line never appear in errors/logs (test-pinned, V14 parity).
- Golden vectors: multiline 2xx, 227/229 pasv parse, 4xx-vs-5xx classification — first-class tests mirroring the SigV4 suite idiom.
- `npm test` baseline: 2503 tests / 2 documented pre-existing failures (fr-typography, webhook-routes GET list). data-a pin 623.

### Deferred Ideas (OUT OF SCOPE)
(none this session)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FTP-01 | Hand-rolled FTP/FTPS client (export/ftp.js, ~350 LOC, node:net/node:tls only) — `FTP_SECURE` enum `explicit`(default)/`implicit`/`none`; USER/PASS, TYPE I, EPSV with PASV fallback (control-host rule + `FTP_PASV_HOST` override), STOR, DELE, PBSZ/PROT P, QUIT; NOOP keep-alive; REST resume mirroring the D-88-16 retry idiom; TLS session-reuse on the data channel. | §s3.js Anatomy (template), §Protocol Implementation Detail, §Node specifics, §Pitfalls |
| TEST-01 (FTP portion) | Golden-vector discipline — FTP response-parser pins mirroring the SigV4 suite; suite stays at baseline. e2e recipe belongs to Phase 98. | §Test Architecture, §Validation Architecture |
</phase_requirements>

## Summary

Phase 97 is a pure-module phase: build `export/ftp.js` next to `export/s3.js` (repository root, never `src/` — the prohibition test, `export/s3.js:5-6`) with the same discipline the S3 client established: exported pure functions carrying the wire contract (`sigv4Sign` analog = `parseReply`/`parseEpsv`/`parsePasv`/`classifyReply`), a keyed error surface (`s3ErrorFrom` analog), scrubbed error text (`sliceError` at s3.js:58-60), and an env-gated staging download seam (`downloadToStaged` at s3.js:380-408 → `fetchToStaged` per D-02). No npm deps; `node:net` + `node:tls` only.

The two technically hard parts are (1) the control-channel reply parser state machine — multiline replies terminated by `code + space`, interim 1xx replies that must be drained, and (2) the FTPS data-channel TLS session reuse, which must capture `tlsSocket.getSession()` from the control socket and feed it as the `session` option of every data-channel `tls.connect` (pure-ftpd/FileZilla/hardened vsftpd refuse data handshakes without it — milestone research, MEDIUM confidence, live-verified in 98).

One significant correction to the requirement text is documented below (§Pitfall P6): **REST is a RETR-only command in RFC 3659** — "REST followed by STOR" is undefined behavior. The D-88-16 retry idiom for *uploads* (re-read the immutable staged file, re-send from byte 0) maps to FTP as **full STOR restart on retry**, with REST reserved for RETR (restore path) where the D-88-16 part-range idiom applies legitimately.

**Primary recommendation:** Export a pure parser API (`parseReply`, `parseEpsvPort`, `parsePasvPort`, `ftpErrorFrom`, plus scrub helper) for golden-vector testing exactly like `sigv4Sign`/`s3ErrorFrom`; drive the live client against an **in-process `node:net` mock FTP server** in tests (no external dependency, no env gate — phase 97 tests are unit/golden only); pin session-reuse with a self-signed in-process `node:tls` server pair; defer the vsftpd docker e2e to Phase 98 as planned.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Reply parsing / classification | Module (export/ftp.js pure exports) | — | Pure functions, golden-vector testable without sockets (sigv4Sign idiom) |
| Control-channel lifecycle (connect/auth/TLS/QUIT) | Module | node:net/node:tls | Promisified request/reply correlation per D-01 |
| Data-channel transfers (STOR/RETR/EPSV/PASV) | Module | node:net/node:tls | Parallel-connection protocol belongs inside the client |
| Restore staging + sha256 | Module (`fetchToStaged`) | node:fs/node:crypto | D-02 — mirrors s3.js:380-408 |
| Keyed errors ×5 locales | NOT this phase | Phase 98 wiring (DEST-03) | 97 emits English `err.code` classes only; no user-facing UI strings are added in 97 → ×5 locales NOT needed this phase (verified: error `code` fields are translation keys, translated when 98 renders them; s3.js precedent has English internal messages at :272, :402). **If the executor adds any operator-facing doc/UI copy in 97, escalate — ×5 applies.** |
| Probe (upload+delete marker) | NOT this phase | Phase 98 | Descriptor slot filled in 98 per carried-forward D-01 (96) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:net | runtime (no install) | Control channel (explicit FTPS plaintext phase + plain FTP), PASV data channel | Zero-dep hard rule; s3.js uses node:http/https the same way [VERIFIED: export/s3.js:52-53] |
| node:tls | runtime | Explicit upgrade (`AUTH TLS` via TLSSocket upgrade / reconnect), implicit 990 transport, data-channel TLS with session reuse | Required for FTPS; `session` option is the reuse mechanism |
| node:crypto / node:fs / node:stream/promises | runtime | sha256-on-pipe, staged file, pipeline | s3.js precedent [VERIFIED: export/s3.js:49-55] |
| node:test + node:assert/strict | runtime | Test runner (suite idiom: `test/backup-s3-sigv4.test.mjs:22-25`) | Existing baseline |

**Installation:** none — zero new deps (SC-5). Verify with `git diff package.json` empty at phase gate.

**No external packages are proposed — Package Legitimacy Audit: N/A (nothing installed).**

## Architecture Patterns

### System Architecture Diagram

```
 caller (98 wiring / tests)
        │  await ftp.connect(config) / stor() / dele() / size() / fetchToStaged()
        ▼
 ┌─────────────────────── export/ftp.js ────────────────────────┐
 │  config: { host, port, user, password, secure:'explicit'      │
 │            |'implicit'|'none', pasvHost?, insecure? }         │
 │                                                               │
 │  CONTROL CHANNEL (node:net → node:tls on AUTH TLS)            │
 │   connect ─► 220 ─► USER/PASS ─► TYPE I ─► [AUTH TLS ─►       │
 │     PBSZ 0 ─► PROT P]  (explicit)  | tls.connect :990         │
 │     (implicit)                                                │
 │   reply parser SM: read lines ─► [code- vs code-space] ─►     │
 │     1xx = interim (drain, keep waiting)                       │
 │     code- = multiline (accumulate until code-space)           │
 │     code-space = final reply → resolve pending command        │
 │   NOOP keep-alive timer (60s const, D-03) fires only while    │
 │     a transfer is in flight; stray 2xx replies are swallowed  │
 │                                                               │
 │  DATA CHANNEL (per transfer)                                  │
 │   EPSV → "229 (|||port|)" → net/tls connect to CONTROL HOST   │
 │     (+ FTP_PASV_HOST override) with session=ctrl.getSession() │
 │   fallback: PASV → "227 (h1,h2,h3,h4,p1,p2)" → port = p1*256+p2│
 │   STOR: pipe stream → data sock; close write; await 226/250   │
 │   RETR: REST n → RETR path → pipe data sock → hashTap → stage │
 └───────────────────────────────────────────────────────────────┘
        │ keyed Error(code='ftpAuthFailed'|…) or result value
        ▼
 caller maps code → refusal/toast in Phase 98 (×5 locales then)
```

### Recommended Project Structure
```
export/ftp.js                 # the client — root, beside s3.js, never src/
test/backup-ftp-client.test.mjs   # golden vectors + mock-server tests (97 only)
```

### Pattern 1: s3.js Anatomy — the template (verbatim anchors)

The planner should mirror these verified structures:

| s3.js anchor | Verified location | FTP analog |
|---|---|---|
| Header comment block stating frozen decisions + request surface | export/s3.js:1-47 | ftp.js header: D-01..D-04, command surface, scrub rule |
| `sliceError` — 300-char slice, V14 | export/s3.js:57-60 | same helper, reused (import or copy — s3.js:58-60: `String(error?.message \|\| error).slice(0, 300)`) |
| Pure signer carrying the contract | `sigv4Sign` :77-116 | `parseReply` / `parseEpsvPort` / `parsePasvPort` / `classifyReply` |
| Keyed error factory | `s3ErrorFrom(status, bodyText, fallbackCode)` :260-278 — sets `s3Status/s3Code/s3Class/s3ClockSkew` | `ftpErrorFrom(code, lines, context)` — sets `err.code = 'ftpAuthFailed'` etc. (D-04) |
| Scrub enforcement | comment :36-38 + test backup-s3-sigv4.test.mjs:209-217 | scrub PASS/USER-pass lines from any stored error text; test-pinned |
| Probe keyed-result shape | `probeS3` :344-364, `mapProbeError` :366-371 | Phase 98 fills the descriptor slot; ftp.js may export a thin `probeFtp` early (optional, planner's call) |
| Download seam | `downloadToStaged(config, key, expectedSha256, stagingDir)` :380-408 — mkdir staging, temp file `s3-download-${pid}-${uuid}.tmp`, Transform hashTap, pipeline, rm-on-failure, keyed `s3Class='sha256Mismatch'` | `fetchToStaged(config, path, expectedSha256, stagingDir)` per D-02 — identical structure, RETR stream instead of res.stream |
| Executor constants + opts-overridable testability | `S3_MULTIPART_THRESHOLD`/`S3_PART_SIZE` :441-442, `opts.thresholdBytes ?? …` :602-605 | `FTP_NOOP_INTERVAL_S = 60` const (D-03), opts-overridable timeouts |
| Error lifecycle: stream destroyed on early failure | `consumeAndThrowS3Error` :287-299 — `body.destroy()` after reject handlers attached | data socket destroyed on control-channel error (P5) |

**Signature contract to mirror (D-02), from s3.js:380 verbatim:**
```js
export async function downloadToStaged(config, key, expectedSha256, stagingDir)
// → ftp.js: export async function fetchToStaged(config, path, expectedSha256, stagingDir)
//   returns { tmpPath, sha256 }; rmSync(tmpPath,{force:true}) on any failure;
//   keyed mismatch error (s3.js:399-405 idiom) with err.code='ftpSha256Mismatch'.
```

### Pattern 2: Reply-parser state machine (the core pure surface)

FTP replies (RFC 959 §4.2): a reply is either single-line `NNN text\r\n` or multiline:
```
NNN-<first line>\r\n
...any lines...\r\n
NNN <last line>\r\n     ← terminator: same code + SPACE (RFC 959: the terminating line's code is followed by a space, not hyphen)
```
**Trailing-space rule matters:** a body line that merely *starts* with digits is not a terminator; only `NNN` + space (or `NNN` + CRLF, allowed by RFC 959 for a bare-code terminator) closes the reply. Golden vectors must include a body line like `200-hello 200-looks-final` to pin this.

State machine for `parseReply(buffer) → { complete, code, lines, consumed }` (feed-accumulating; client keeps a leftover buffer):

1. On a complete CRLF line: if current multiline state open and line matches `^(sameCode)[ -]` → close on the space variant (or bare `NNN\r\n`).
2. Otherwise if line matches `^(\d{3})([ -])` → hyphen opens multiline, space/bare is final.
3. **Interim 1xx:** codes 100-199 are preliminary — the client must keep awaiting the *next* final reply (e.g. `150 Opening BINARY mode data connection` precedes the `226 Transfer complete` after STOR). Parser exposes code; the command dispatcher loops on 1xx.
4. Anything non-matching in a fresh state = protocol violation → keyed `ftpGeneric` with sliced text.

**Async command dispatch pattern** (one command in flight at a time — never pipeline on one control channel; milestone research, D-10 carry-over): a `sendCommand(line)` promise resolves on the next *final* (non-1xx, non-multiline-open) reply; 1xx replies are drained (optionally logged). NOOP (P4) must tolerate its 200 arriving while a transfer's final reply is pending — swallow any 2xx arriving when no command is awaiting *except* the awaited one (queue by expectation: while `awaiting='STOR-final'`, ignore stray `200`).

### Pattern 3: EPSV / PASV parse + control-host rule

- **EPSV (RFC 2428):** `229 Entering Extended Passive Mode (|||31745|)`. Parse: `\(\|\|\|(\d+)\|\)\)` — the port is the ONLY datum; the address is always the control connection's host (NAT-safe rule from milestone research). Do **not** send `EPSV ALL` (P7).
- **PASV (RFC 959):** `227 Entering Passive Mode (192,168,1,5,123,78)`. Parse six decimals; port = `p1*256 + p2`. Per the control-host rule, ignore the embedded h1-h4 address for connection purposes (trust only the port) and dial the control host — `FTP_PASV_HOST` env override replaces the dial host when set (NAT case, milestone research; boot-frozen in 98 custody, but the client must accept a `pasvHost` config option now).
- Fallback order: try EPSV; on 5xx reply to EPSV (some servers pre-2004 only) retry PASV once. A failed parse of *both* → keyed `ftpPassiveFailed` with the firewall/port-range hint text (milestone research parity, s3.js:341 `unreachable`-style sliced hint).

### Pattern 4: Implicit FTPS transport swap order

- `FTP_SECURE='explicit'` (default): `net.connect` to 21 → greeting → `AUTH TLS` → on `234`, wrap the **same socket** via `tls.connect({ socket, servername, rejectUnauthorized: !insecure, minVersion: 'TLSv1.2' })` → `PBSZ 0` → `PROT P` → then USER/PASS. Order is fixed: AUTH **before** auth creds, PBSZ **before** PROT (RFC 2228/4217; PROT without PBSZ is an error on compliant servers) [CITED: RFC 4217 §4 — transport-security handshake order].
- `FTP_SECURE='implicit'`: **no** AUTH TLS exchange — the socket is `tls.connect` from byte zero on port 990 (config `port ?? 990` in implicit mode; explicit defaults 21). The "transport swap" is therefore: choose `node:tls` as the constructor, skip the upgrade path entirely. Data channels behave identically (PROT P already implied; session reuse still required).
- `FTP_SECURE='none'`: plain net sockets; no PBSZ/PROT; operator warning surfaces in 98 probe (`tlsInsecure` parity — not this phase).
- Never `PROT C` (milestone research — credentials would cross the data channel in cleartext; also plain-FTP-mode parity hazard).

### Pattern 5: TLS session reuse capture point

```js
// after control-channel TLS is established:
const session = tlsControl.getSession();   // Buffer | undefined — [ASSUMED: exact return shape Buffer; verify at implementation with a 1-line probe]
// every data channel:
const dataSock = tls.connect({
  host: dialHost, port: epsvPort,
  session,                                  // ← the reuse mechanism (tls.connect 'session' option)
  servername: dialHost,                     // keep SNI honest even when dialing a pasvHost override
  rejectUnauthorized: !config.insecure,
  minVersion: 'TLSv1.2',
});
```
Node's `tls.connect` accepts a `session` option (Buffer from `socket.getSession()`) that resumes the TLS session [CITED: nodejs.org/api/tls.html#tlsconnectoptions-callback — `session` option and `TLSSocket.getSession()`]. Pin with an in-process self-signed TLS server test asserting the data handshake reports `reused` (via server-side `'session'`/`isSessionReused()` on the accepted socket) — see §Test Architecture T5.

### Pattern 6: Socket timeouts and keep-alive (Node semantics)

- `socket.setTimeout(ms)` fires a `'timeout'` **event only** — Node does NOT destroy the socket; the handler must call `socket.destroy()` (or resolve/reject the pending promise and destroy) [CITED: nodejs.org/api/net.html — "the 'timeout' event … the socket is not destroyed automatically"]. Client discipline (P1): every pending command promise arms a timeout → on fire, reject keyed `ftpUnreachable` (or `ftpTransferAborted`) and **destroy the socket** — never resolve without destroy.
- The NOOP keep-alive (D-03: 60s const) is separate from socket timeout: a `setInterval` that, **only while a data transfer is in flight** (control channel idle awaiting final reply), sends `NOOP` and swallows the stray `200` (P4). Idle-beyond-transfer long waits do not need NOOP (commands resolve in seconds); the vsftpd `idle_session_timeout=300` hazard applies precisely during long STOR/RETR streams (milestone research: "control-channel idle timeout during long data transfers").
- `socket.setKeepAlive(true)` (TCP-level) is a belt-and-braces addition, not a substitute for NOOP (application-level FTP idle counters ignore TCP keepalives) [ASSUMED: server idle timers are application-level — standard vsftpd behavior, community-documented].

### Pattern 7: REST resume sequence

- **RETR (restore):** `TYPE I` → `REST <offset>` → expect `350` → `RETR <path>` → server sends `150` then byte stream from offset → `226`. The staged-file part-range idiom mirrors D-88-16 (s3.js:451-459 `sha256Range`) and s3.js:527-536 (range re-read per attempt).
- **STOR retry (upload):** DO NOT use REST (P6). Retry = destroy data socket, re-open a fresh passive data channel, re-send the whole STOR from the immutable staged file — exactly the D-88-16 whole-file re-read idiom (s3.js:483-514 `uploadSinglePut`). Attempt budget/backoff mirrors `attempts`/`backoffMs` (:604-605).
- A `426 Connection closed; transfer aborted` mid-STOR → keyed `ftpTransferAborted` → retry path. Exhausted budget → terminal error to the caller (98 maps to `upload_failed`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TLS handshake / session resumption | custom crypto | `node:tls` `connect(session)` + `getSession()` | Session state machine is nontrivial; stdlib owns it |
| Stream hashing on pipe | manual chunk accumulation | `node:stream` `Transform` hashTap (s3.js:384-390 verbatim) | Memory-bounded, one pass |
| Promise-safe file streaming | manual write tracking | `stream/promises.pipeline` (s3.js:393) | Correct backpressure + error propagation + cleanup |
| Test server protocol harness | real docker FTP in 97 | in-process `node:net`/`node:tls` scripted server | Deterministic golden vectors; docker e2e is Phase 98's deliverable |
| Timeout semantics | polling | `socket.setTimeout` + destroy-on-'timeout' | Stdlib event, but the destroy is YOUR responsibility (P1) |

## Runtime State Inventory

**Omitted — greenfield module phase.** No rename/refactor/migration; no runtime systems carry FTP state yet (registry dormant slots from Phase 96 are code, filled in 98).

## Common Pitfalls

### P1: Promise resolution without socket destroy (hangs forever)
**What goes wrong:** a rejected/errored command promise leaves the socket half-open; the next command awaits a reply that never comes → silent hang worse than a crash.
**Why:** Node sockets don't auto-close on promise rejection; `setTimeout` doesn't destroy (Pattern 6).
**Avoid:** every rejection path calls `socket.destroy()`; a `finally`-style teardown on the promise executor. **Warning signs:** test that aborts mid-STOR must not leave the process hanging — add a suite-level process exit sanity check.

### P2: Multiline terminator matched by a body line
**What goes wrong:** parser closes a multiline reply early on a body line starting with the same digits (`200-…` inside a multiline `200-` block), corrupting the reply stream.
**Avoid:** terminator = same code **followed by space or bare code + CRLF** (RFC 959 §4.2); golden-vector pin both cases.

### P3: Trusting the PASV-embedded IP address
**What goes wrong:** dialing the 227-announced private/NAT address fails (`connection refused` to 10.x.x.x from outside) — the classic NAT pasv failure.
**Avoid:** control-host rule (Pattern 3) + `FTP_PASV_HOST` override; keyed `ftpPassiveFailed` carries the port-forwarding hint (Synology pasv range, milestone research).

### P4: NOOP reply colliding with the awaited final reply
**What goes wrong:** during a long STOR, the NOOP's `200` arrives before the `226`; a naive "resolve on next 2xx" dispatcher resolves the STOR early with transfer incomplete.
**Avoid:** expectation-qualified dispatch (Pattern 2.4): while awaiting a final reply for X, 2xx replies to NOOP are swallowed; only the expected completion code resolves X. Never send NOOP when a *control* command (not transfer) is pending.

### P5: Orphaned data socket on control-channel error
**What goes wrong:** control socket errors/closes mid-transfer; the data socket keeps streaming into the void until server timeout.
**Avoid:** control 'error'/'close' handler destroys the data socket immediately and rejects the pending transfer with keyed `ftpTransferAborted` — mirror of `consumeAndThrowS3Error` destroying the body (s3.js:298: `body.destroy()`).

### P6: REST used for STOR resume (protocol violation)
**What goes wrong:** RFC 3659 defines REST only for RETR restart points; "REST then STOR" is undefined — servers either ignore REST (silently truncating/wrong offset) or 504 it.
**Avoid:** STOR retry = full restart (Pattern 7); REST only on the RETR/restore path. **This refines the FTP-01 wording "REST resume mirroring the D-88-16 retry idiom": the *idiom* (immutable-file re-read per attempt) carries over; the *command* differs per direction.** [CITED: RFC 3659 §5 — REST "sets the restart point for RETR"; no STOR restart semantics defined]

### P7: `EPSV ALL` lock-in
**What goes wrong:** sending `EPSV ALL` (RFC 2428) commits the session to EPSV-only; if the NAT path then only supports PASV forwarding, there is no fallback — permanent `ftpPassiveFailed`.
**Avoid:** per locked Specifics — never EPSV ALL; per-transfer EPSV with PASV fallback.

### P8: Session-reuse skipped on the data channel
**What goes wrong:** handshake succeeds against lax servers but pure-ftpd/FileZilla Server/hardened vsftpd abort the data TLS session → opaque `handshake failure`, indistinguishable from cert problems.
**Avoid:** capture `getSession()` once after control TLS, pass to every data connect (Pattern 5); pinned by test (T5). Live-server verification is Phase 98's vsftpd e2e (milestone research: MEDIUM confidence on server-quirk specifics).

### P9: Implicit-mode port confusion
**What goes wrong:** implicit FTPS on port 21, or sending AUTH TLS over an implicit connection (servers hang or 5xx).
**Avoid:** implicit = `tls.connect` from byte 0 on `config.port ?? 990`, no AUTH/PBSZ/PROT exchange; explicit = port ?? 21 + upgrade chain (Pattern 4).

### P10: Server quirks (milestone research, MEDIUM — live-verified in 98)
| Server | Quirk | Covered by |
|---|---|---|
| vsftpd | `idle_session_timeout=300` kills idle control channel mid-transfer | NOOP keep-alive (T6); default 300s config in 98 e2e recipe |
| pure-ftpd / FileZilla Server | TLS session reuse REQUIRED on data channel | T5 session-reuse pin + Pattern 5 |
| hardened vsftpd (`ssl_ciphers`/requirereuse) | same as above + strict ciphers | `minVersion TLSv1.2`, no PROT C |
| Old servers (pre-RFC 2428) | EPSV unsupported → must fall back | PASV fallback test (T3) |
| Interim-heavy servers | `150` before every data final reply, `4xx` transient vs `5xx` permanent | parser 1xx-drain tests (T2), classification tests (T4) |

## Code Examples

### Keyed error factory (mirror of s3.js:260-278)
```js
// ftp.js — classification table (RFC 959 codes; milestone-research classes)
function ftpErrorFrom(code, text, context = '') {
  const CLASSES = {
    530: 'ftpAuthFailed',       // login incorrect
    550: 'ftpPathNotFound',     // file/dir unavailable (carry path context)
    552: 'ftpQuotaExceeded',    // exceeded storage allocation
    426: 'ftpTransferAborted',  // connection closed; transfer aborted
    421: 'ftpUnreachable',      // service not available / idle timeout kicked us
  };
  const err = new Error(sliceError(new Error(`ftp ${code}: ${text} ${context}`)));
  err.code = (code >= 400 && code < 500 && CLASSES[code]) || (code >= 500 && CLASSES[code]) || 'ftpGeneric';
  err.ftpCode = code;
  err.ftpTransient = code >= 400 && code < 500;   // 4xx retryable, 5xx permanent
  return err;
}
```
**4xx-vs-5xx mapping table** (SC-4 golden vectors): `400s` = transient → `err.ftpTransient=true` (retry path, P-idiom); `500s` = permanent → map immediately; both carry keyed `err.code`; 1xx never resolves; 2xx success codes are command-specific (226/250 transfer, 200 generic OK, 229/227 passive, 234 AUTH, 331/350 interim-creds/REST-ok are handled per-command, not generic).

### Scrub helper (V14 parity)
```js
export function scrubFtpLine(line) {
  // USER/PASS lines never survive into errors/logs
  return String(line).replace(/^(PASS|USER)\s+.*/i, (_m, cmd) => `${cmd.toUpperCase()} ***`);
}
```
Every reply-text capture and every log emission passes through it; test asserts the raw password never appears even in a `530` reply transcript.

### Parser golden vector (suite idiom, backup-s3-sigv4.test.mjs:34-52 style)
```js
test('golden vector: multiline 2xx with embedded same-code body line', () => {
  const r = parseReply('200-Command okay\r\n200-body starts with 200- digits\r\n200 done\r\n');
  assert.equal(r.complete, true); assert.equal(r.code, 200);
  assert.deepEqual(r.lines, ['Command okay', 'body starts with 200- digits', 'done']);
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| PORT (active) transfers | EPSV-first with PASV fallback | RFC 2428 (1998), universal since | Client implements EPSV/PASV only — no active mode (locked Specifics) |
| AUTH TLS followed by PBSZ later | AUTH → PBSZ → PROT in strict order | RFC 4217 (2005) | Fixed handshake chain (Pattern 4) |
| REST for both directions | REST = RETR-only; upload retry = restart | RFC 3659 (2007) clarified | P6 ruling |
| FTP clients skipping data session reuse | Session reuse mandatory on hardened servers | TLS 1.2+ era / server hardening | Pattern 5 pinned by test |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `tls.TLSSocket.getSession()` returns a Buffer usable as `tls.connect({session})` | Pattern 5 | LOW — documented API; test T5 verifies behaviorally, so a wrong assumption fails at test time, not in production |
| A2 | Explicit-mode socket upgrade via `tls.connect({ socket })` wrapping the existing net socket works with FTP servers | Pattern 4 | LOW — standard Node idiom; the vsftpd e2e in 98 is the definitive check |
| A3 | Server idle timers ignore TCP keepalive (application-level NOOP required) | Pattern 6 | LOW — NOOP is locked (D-03) regardless |
| A4 | `minVersion:'TLSv1.2'` is accepted by all target NAS servers | Pattern 4/5 | MEDIUM — very old NAS firmwares may be TLS1.0-only; surfaced as `ftpTlsFailed` in the field, config-const so trivially adjustable |
| A5 | Interim `331` (USER ok) / `350` (REST ok) treated per-command, not generic 3xx | Pattern 2 / error table | LOW — per-command dispatch makes it testable in T2 |
| A6 | No user-facing strings are added in phase 97 (×5 locales not needed) | Architectural Map | LOW — executor must not add UI copy; if it does, escalate (already stated inline) |

## Open Questions

1. **Does `fetchToStaged` RETR use REST resume at all in 97, or simple single-shot RETR?**
   - What we know: D-02 mirrors `downloadToStaged` (s3.js:380-408), which is single-shot; RETR resume via REST adds partial-file plumbing that only matters for very large archives.
   - Recommendation: single-shot RETR + keyed sha256 mismatch on failure (D-88-8 parity); REST command *implemented and vector-tested* (SC-1 requires it), but resume-loop wiring deferred until a size need appears. Planner should confirm with the owner if cheap.
2. **NOOP swallow window scope.** While a transfer's final reply is pending, do NOOP stray-2xx replies get silently dropped, or counted? Recommendation: silently dropped with a debug counter — no user-visible surface exists in 97.
3. **Where does `probeFtp` live — 97 or 98?** The descriptor slot is 98's deliverable, but a thin `probeFtp(config)` in ftp.js (mirroring `probeS3` :344-364) would de-risk 98. Recommendation: implement in 97 (cheap, reuses stor/dele), keyed result shape copied verbatim from `probeS3`; 98 wires it. Planner may also descope it cleanly to 98 without touching 97's SCs.

## Environment Availability

Phase is code/config-only on Node stdlib — probes:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node:test | all tests | ✓ (existing suite: 2503 tests) | runtime | — |
| node:net / node:tls | client | ✓ stdlib | runtime | — |
| in-process net server (localhost ephemeral port) | mock-FTP tests | ✓ (127.0.0.1 binding is CI-safe) | — | — |
| docker/vsftpd | e2e | NOT required this phase | — | Phase 98 env-gated recipe |

No missing dependencies. (Probes of `node --version` etc. not run — the repo already runs the 2503-test baseline on this machine, which is the operative environment fact.)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test + node:assert/strict (suite idiom: test/backup-s3-sigv4.test.mjs:22-25) |
| Config file | none — node --test convention |
| Quick run command | `node --test test/backup-ftp-client.test.mjs` |
| Full suite command | `npm test` (baseline 2503 / 2 documented pre-existing failures; data-a pin 623) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01/T1 | Multiline 2xx parse: hyphen-open, terminator `NNN␠`, embedded-code body line, bare-code terminator | golden vector (unit) | `node --test test/backup-ftp-client.test.mjs` | ❌ Wave 0 |
| TEST-01/T2 | Interim 1xx drain (150 before 226; 331/350 per-command) | unit via mock server | same | ❌ Wave 0 |
| TEST-01/T3 | 229 EPSV parse + 227 PASV parse (port math p1*256+p2) + EPSV→PASV fallback on 5xx; control-host rule + pasvHost override | golden vector (unit) | same | ❌ Wave 0 |
| TEST-01/T4 | 4xx-vs-5xx keyed classification (530/550/552/426/421 + generic; `ftpTransient` flag) | golden vector (unit) | same | ❌ Wave 0 |
| FTP-01/T5 | TLS session reuse: in-process self-signed TLS server; data handshake reports session reused | unit (in-process TLS) | same | ❌ Wave 0 |
| FTP-01/T6 | NOOP keep-alive: scripted slow transfer; NOOP sent during flight; stray 200 swallowed; 226 still resolves STOR | unit via mock server | same | ❌ Wave 0 |
| SC-4/T7 | Scrub: PASS line + password never appear in any error/log text (mirrors sigv4 V14 test :209-217) | unit | same | ❌ Wave 0 |
| D-02/T8 | fetchToStaged: happy path writes staged file + returns sha256; corrupt stream → keyed mismatch + temp removed | unit via mock server | same | ❌ Wave 0 |
| P1/T9 | Timeout → rejection AND socket destroyed (process doesn't hang; transfer aborted class) | unit via mock server | same | ❌ Wave 0 |
| P6/T10 | STOR retry restarts from byte 0 (no REST sent on STOR path); REST only precedes RETR | unit via mock server | same | ❌ Wave 0 |
| SC-5 | package.json unchanged; full suite baseline | gate | `git diff package.json && npm test` | — |

### Sampling Rate
- **Per task commit:** `node --test test/backup-ftp-client.test.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** full suite at baseline + zero package.json diff before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/backup-ftp-client.test.mjs` — new file (all of T1-T10)
- [ ] Mock-server helper (scripted reply-sequence net server, ~40 LOC) inside the test file
- No framework install needed.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | FTP USER/PASS via env custody (98); scrub rule in 97; TLS for credential transport (explicit/implicit) |
| V3 Session Management | yes (FTP sense) | TLS session reuse (data channel), one-command-in-flight discipline |
| V4 Access Control | no | server-side, out of scope |
| V5 Input Validation | yes | reply parser rejects malformed lines → keyed error, never crashes; path args encoded verbatim (FTP paths are raw strings; no shell) |
| V6 Cryptography | yes | node:tls only; `minVersion TLSv1.2`; `rejectUnauthorized` controlled by `insecure` flag (R-3 parity); never hand-rolled crypto |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Credentials in error text/logs | Info. Disclosure | scrubFtpLine + sliceError + T7 pin (V14) |
| Cleartext creds on plain FTP (`FTP_SECURE=none`) | Info. Disclosure | allowed by config, flagged as keyed `tlsInsecure` warning in 98 probe (R-3) |
| MITM data channel / rogue passive server | Spoofing/Tampering | TLS session reuse + control-host rule + optional pasvHost override only |
| Malformed server reply crashing parser | DoS/Tampering | parser returns violation → keyed `ftpGeneric`, sliced text |

## Sources

### Primary (HIGH confidence)
- `export/s3.js` — read this session; all line cites above (template anatomy, downloadToStaged :380-408, s3ErrorFrom :260-278, probe :344-371, scrub discipline :36-38/:57-60)
- `test/backup-s3-sigv4.test.mjs` — read this session; golden-vector idiom + V14 scrub test (:209-217) + env-gated e2e gate idiom (`test/backup-s3-e2e.test.mjs:12-15`, read this session)
- `.planning/phases/97-ftp-ftps-client-zero-dep/97-CONTEXT.md`, `.planning/ROADMAP.md` §Phase 97 (:51-63), `.planning/REQUIREMENTS.md` (FTP-01 :24, TEST-01 :34) — read this session
- `.planning/research/SUMMARY.md` Dimension 2 — read this session (milestone protocol research: session-reuse trap, PASV/NAT rule, error-class list, vsftpd idle, server-quirk confidence MEDIUM)
- RFC 959 §4.2 (reply format), RFC 2228 (AUTH/PBSZ/PROT), RFC 4217 (FTPS handshake order), RFC 2428 (EPSV), RFC 3659 (REST/RETR, EPSV clarification) [CITED: RFC texts — stable specs, milestone-research confirmed]

### Secondary (MEDIUM confidence)
- Node API docs semantics (tls `session` option / `getSession()`, net `'timeout'` event non-destroy) [CITED: nodejs.org/api/tls.html, nodejs.org/api/net.html — not re-fetched this session; behavior pinned by tests T5/T9 regardless]
- Server-quirk table (vsftpd/pure-ftpd/FileZilla) — community-documented, version-variable; live verification is Phase 98 vsftpd e2e [CITED: milestone research, MEDIUM]

### Tertiary (LOW)
- None — no web searches needed; domain covered by RFCs + in-repo precedent.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — stdlib only, in-repo precedent read this session
- Architecture: HIGH — s3.js anatomy verified verbatim; parser state machine from stable RFCs
- Pitfalls: HIGH for in-module traps (P1-P9 testable in 97); MEDIUM for server-quirk field behavior (P10 — 98's e2e owns live confirmation)

**Research date:** 2026-11-25
**Valid until:** 30 days (RFCs stable; Node stdlib stable)
