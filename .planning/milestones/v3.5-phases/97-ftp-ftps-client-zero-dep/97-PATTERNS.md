# Phase 97: FTP/FTPS Client (Zero-Dep) - Pattern Map

**Mapped:** 2026-11-25
**Files analyzed:** 3
**Analogs found:** 3 / 3

## Tracked-source verification

All analogs verified git-tracked this session:
`git ls-files export/s3.js test/backup-s3-sigv4.test.mjs test/backup-s3-e2e.test.mjs` → all present, no mirror paths. No gitignored installs involved.

## Standalone-module claim verification

ROADMAP.md:26 — "Hand-rolled `export/ftp.js` (~350 LOC) on node:net/node:tls with golden-vector tests, **no wiring**". RESEARCH.md:38 — "pure-module phase". Registry descriptor slots stay dormant; 98 wires them. **Minimal files_modified confirmed: `export/ftp.js` + 2 test files only. No other source file is touched in 97.**

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `export/ftp.js` | service (protocol client, module at repo ROOT — never `src/`) | streaming + request-response (promisified command/reply) | `export/s3.js` | role-match (same author discipline, different transport: socket state machine vs HTTP) |
| `test/backup-ftp-parser.test.mjs` | test (golden vectors, offline always-on) | transform (pure parser in → assertions) | `test/backup-s3-sigv4.test.mjs` | exact (same idiom: pure-function contract bytes as tests) |
| `test/backup-ftp-client.test.mjs` | test (mock-server scripted tests, in-process) | event-driven (socket I/O over 127.0.0.1) | `test/subject-encode.test.mjs` (fakeSmtp harness) + `test/backup-s3-e2e.test.mjs` (gate idiom reference) | role-match (net-server harness exists; no FTP-flavored precedent) |

## Pattern Assignments

### `export/ftp.js` (service / protocol client, streaming + request-response)

**Analog:** `export/s3.js` — self-analogy dominant; copy structure section by section.

**Header comment block** (s3.js:1-47):
The file opens with a `/* ===... */` banner stating: zero-dep rule (s3.js:4-6: "Zero npm deps (D-33-11). Lives at the repository ROOT beside export/backup.js — never under src/ (the prohibition test)"), frozen decisions (D-01..D-04 here), scrub discipline (s3.js:36-38), and the request surface consumed by later phases (s3.js:40-47). ftp.js must mirror: D-01..D-04, command surface (USER/PASS, TYPE I, AUTH TLS→PBSZ→PROT P, EPSV/PASV, STOR, DELE, SIZE, REST, NOOP, QUIT), scrub rule, and the 98-consumed surface (`fetchToStaged`, optional `probeFtp`).

**Imports pattern** (s3.js:49-55):
```js
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
```
ftp.js: same shape with `import net from 'node:net'; import tls from 'node:tls';` replacing http/https. Keep relative import count zero — s3.js has NO intra-repo imports; ftp.js must not import s3.js (copy `sliceError` verbatim, D-04 "no separate error-module" spirit: each destination module is self-contained).

**Error slicing** (s3.js:57-60, copy verbatim):
```js
export function sliceError(error) {
  return String(error?.message || error).slice(0, 300);
}
```

**Pure contract surface** (sigv4Sign :77-116 → parseReply/parseEpsvPort/parsePasvPort/classifyReply):
The SigV4 signer is exported BECAUSE its bytes are the test contract. ftp.js exports its parser identically: `parseReply(buffer) → { complete, code, lines, consumed }`, `parseEpsvPort(line) → port|null`, `parsePasvPort(line) → port|null` (port = p1*256+p2), `classifyReply(code)`. These are golden-vector-tested without sockets — same rationale as sigv4 golden vectors. **DIVERGENCE:** the signer is a pure one-shot transform; the reply parser is a feed-accumulating STATE MACHINE (multiline `NNN-` open, terminator `NNN␠`/bare `NNN\r\n`, interim 1xx drain). This state machine is the one structure s3.js has no analog for — no HTTP response needs mid-reply statefulness. Follow the state machine spec in RESEARCH.md Pattern 2, not any s3.js shape.

**Keyed error factory** (s3ErrorFrom :260-278 → ftpErrorFrom, D-04):
```js
export function s3ErrorFrom(status, bodyText, fallbackCode = null) {
  const text = String(bodyText ?? '');
  const codeMatch = /<Code>([^<]+)<\/Code>/.exec(text);
  const s3Code = codeMatch ? codeMatch[1] : fallbackCode;
  const CLASSES = { RequestTimeTooSkewed: 'clockSkew', InvalidAccessKeyId: 'badCreds', ... };
  const s3Class = (s3Code && CLASSES[s3Code]) || 'generic';
  const err = new Error(sliceError(new Error(`s3 ${status}: ${text.slice(0, 300)}`)));
  err.s3Status = status;
  err.s3Code = s3Code;
  err.s3Class = s3Class;
  err.s3ClockSkew = s3Class === 'clockSkew';
  return err;
}
```
ftp.js shape (RESEARCH.md code example): `ftpErrorFrom(code, text, context)` with class table `{530:'ftpAuthFailed', 550:'ftpPathNotFound', 552:'ftpQuotaExceeded', 426:'ftpTransferAborted', 421:'ftpUnreachable'}`, plus `err.ftpCode = code` and `err.ftpTransient = code >= 400 && code < 500` (4xx retryable / 5xx permanent). Message construction goes through `sliceError(new Error(...))` exactly like s3.js:272.

**Stream destroyed on early failure** (consumeAndThrowS3Error :287-299, P5 analog):
```js
if (body && typeof body.destroy === 'function') body.destroy();
```
s3.js destroys the piped body stream the moment an early error response arrives. ftp.js must destroy the DATA socket when the control channel errors/closes mid-transfer (P5) — same discipline, different socket.

**Executor constants + opts-overridable testability** (s3.js:441-442 and :602-605):
```js
export const S3_MULTIPART_THRESHOLD = 512 * 1024 * 1024;
export const S3_PART_SIZE = 64 * 1024 * 1024;
...
const thresholdBytes = opts.thresholdBytes ?? S3_MULTIPART_THRESHOLD;
const attempts = opts.attempts ?? 3;
const backoffMs = opts.backoffMs ?? (attempt => 500 * 2 ** (attempt - 1));
```
ftp.js: `export const FTP_NOOP_INTERVAL_S = 60;` (D-03 — a const, NOT env) plus opts-overridable timeouts, attempts, backoffMs in the same `opts.x ?? CONST` idiom so tests can shrink intervals without waiting 60s.

**Retry idiom — immutable staged file re-read** (uploadSinglePut :483-514, D-88-16 → STOR retry):
```js
for (let attempt = 1; attempt <= attempts; attempt++) {
  ensureNotCancelled();
  try {
    const stream = fs.createReadStream(stagedPath, { highWaterMark: 1024 * 1024 });
    await s3Request(config, { ... body: stream ... });
    return { mode: 'single', partsTotal: 1 };
  } catch (err) {
    lastErr = err;
    if (attempt < attempts) await sleep(backoffMs(attempt));
  }
}
throw lastErr;
```
**DIVERGENCE (P6 ruling):** STOR retry re-sends the WHOLE file from byte 0 (fresh passive channel, no REST); REST is RETR-only. The *idiom* (re-read immutable file per attempt, sleep between) carries; the *command* differs per direction.

**Download seam** (downloadToStaged :380-408 → fetchToStaged, D-02) — copy structure verbatim:
```js
export async function downloadToStaged(config, key, expectedSha256, stagingDir) {
  const res = await getObject(config, key);
  fs.mkdirSync(stagingDir, { recursive: true });
  const tmpPath = path.join(stagingDir, `s3-download-${process.pid}-${crypto.randomUUID().slice(0, 8)}.tmp`);
  const hash = crypto.createHash('sha256');
  const hashTap = new Transform({
    transform(chunk, _enc, cb) { hash.update(chunk); cb(null, chunk); },
  });
  const out = fs.createWriteStream(tmpPath);
  try {
    await pipeline(res.stream, hashTap, out);
  } catch (e) {
    fs.rmSync(tmpPath, { force: true });
    throw e;
  }
  const sha256 = hash.digest('hex');
  if (sha256 !== expectedSha256) {
    fs.rmSync(tmpPath, { force: true });
    const err = new Error(sliceError(new Error(`s3 download: sha256 mismatch ...`)));
    err.s3Class = 'sha256Mismatch';
    throw err;
  }
  return { tmpPath, sha256 };
}
```
ftp.js: `export async function fetchToStaged(config, path, expectedSha256, stagingDir)` — identical structure (mkdir, pid+uuid tmp name, hashTap Transform, pipeline, rm-on-failure, keyed mismatch). Signature `fetchToStaged(config, path, expectedSha256, stagingDir)` mirrors s3.js:380 exactly. Divergence: source is the RETR data socket instead of `res.stream`. Use `ftp-` prefix in tmp filename. Mismatch error: `err.code = 'ftpSha256Mismatch'`.

**Probe keyed-result shape** (probeS3 :344-364 + mapProbeError :366-371 → probeFtp, optional in 97):
```js
export async function probeS3(config) {
  const httpWarning = String(config.endpoint).startsWith('http://');
  const base = { ok: false, key: null, warning: false, httpWarning };
  try { await headBucket(config); } catch (e) { return mapProbeError(e, base); }
  const marker = `gr8r-probe/probe-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.probe`;
  try { await putObject(config, marker, Buffer.from('gr8r probe'), { contentType: 'text/plain' }); }
  catch (e) { return mapProbeError(e, base); }
  try { await deleteObject(config, marker); }
  catch (e) { return { ...base, key: 'deleteFailed', warning: true }; }
  return { ...base, ok: true, key: 'success' };
}
```
If `probeFtp` lands in 97 (research recommends; planner's call): keyed result shape copied verbatim — `{ ok, key, warning, httpWarning }`; ftp analog of `httpWarning` is the R-3 insecure/plain-FTP warning (`FTP_SECURE='none'` or `insecure` → keyed `tlsInsecure`-style warning parity). Marker = stor + dele of a `gr8r-probe/` file.

**DIVERGENCES where s3.js has NO analog (socket-era patterns, follow RESEARCH.md Patterns 2-7):**
1. Reply-parser state machine (multiline/1xx drain) — Pattern 2. No HTTP analog.
2. EPSV/PASV + control-host rule + `FTP_PASV_HOST` override + never EPSV ALL — Pattern 3.
3. Explicit vs implicit TLS transport swap (`AUTH TLS` → tls.connect({socket}) upgrade vs tls.connect-from-byte-0 on :990) — Pattern 4.
4. TLS session reuse: `tlsControl.getSession()` captured once, passed as `session` option to every data-channel `tls.connect`, `servername` kept honest — Pattern 5.
5. `socket.setTimeout` fires event only — handler must destroy; NOOP keep-alive interval fires only while a transfer is in flight; stray 2xx swallowed with expectation-qualified dispatch — Pattern 6 / P1/P4.
6. One-command-in-flight discipline (never pipeline on the control channel) — Pattern 2.4. HTTP allows concurrent requests; FTP control channel does not.

### `test/backup-ftp-parser.test.mjs` (test, golden vectors)

**Analog:** `test/backup-s3-sigv4.test.mjs` — exact idiom match.

**Suite header + imports** (:1-25):
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { sigv4Sign, s3UriEncode, s3ErrorFrom } from '../export/s3.js';
```
ftp parser test: `import { parseReply, parseEpsvPort, parsePasvPort, ftpErrorFrom } from '../export/ftp.js';`. Header banner states the suite is offline, ungated, always-on (sigv4 :4: "Offline, ungated, always-on (D-88-18)").

**Golden-vector test shape** (:34-52):
```js
test('golden vector: GET object with Range header', () => {
  const headers = sigv4Sign({ ... });
  assert.equal(headers.authorization, 'AWS4-HMAC-SHA256 Credential=...,Signature=f0e8...');
});
```
ftp vectors (SC-4 / T1-T4): multiline 2xx with embedded same-code body line + bare-code terminator (P2 pin: `'200-Command okay\r\n200-body starts with 200- digits\r\n200 done\r\n'`), 229 EPSV parse `(|||31745|)`, 227 PASV parse `(192,168,1,5,123,78)` → port 31566 = 123*256+78, 4xx-vs-5xx classification per `ftpErrorFrom`.

**Keyed-error + scrub test shape** (:209-217, V14 pin — T7 mirrors this):
```js
test('error mapping: unmapped body → generic class, message sliced, no secrets (V14)', () => {
  const err = s3ErrorFrom(500, `<Error><Code>InternalError</Code>${'x'.repeat(1000)}</Error>`);
  assert.equal(err.s3Class, 'generic');
  assert.ok(err.message.length <= 320, 'message sliced to 300 chars');
  const secret = 'gr8rtest-password';
  assert.equal(err.message.includes(secret), false);
});
```
ftp version: `ftpErrorFrom(530, ...)` transcript containing a `PASS secret` line → scrubbed; raw password never appears even in a 530 reply transcript.

### `test/backup-ftp-client.test.mjs` (test, mock-server scripted)

**Analog:** `test/subject-encode.test.mjs` fakeSmtp harness (:17-58) — nearest existing in-process net-server idiom (copied-verbatim-from-digest discipline noted in its header :2-8). Also `test/notif-email-link.test.mjs:169`, `test/due-reminders.test.mjs:520` follow the same pattern. **No FTP-specific or s3 precedent exists for scripted-socket tests — this is the cite.**

**Scripted net server idiom** (subject-encode.test.mjs:17-58):
```js
function fakeSmtp() {
  const payloads = [];
  const smtpServer = net.createServer(socket => {
    socket.write('220 test ESMTP\r\n');
    let buf = '';
    socket.on('data', chunk => {
      buf += chunk.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (cmd.startsWith('EHLO') || cmd.startsWith('HELO')) socket.write('250-test\r\n250 8BITMIME\r\n');
        else if (cmd.startsWith('QUIT')) { socket.write('221 bye\r\n'); socket.end(); }
        else socket.write('250 ok\r\n');
      }
    });
  });
  return {
    payloads,
    listen: () => new Promise(resolve => smtpServer.listen(0, '127.0.0.1', resolve)),
    port: () => smtpServer.address().port,
    close: () => new Promise(resolve => smtpServer.close(resolve)),
  };
}
```
ftp analog: a `fakeFtp(scenario)` helper (~40 LOC, per RESEARCH.md Wave 0) — greet `220`, echo keyed replies per command (`331`→`230` on PASS, `234` on AUTH TLS, `200` PBSZ/PROT/TYPE/NOOP, `229 (|||port|)`, `227`, `150`→`226` on STOR/RETR, `530`/`550`/`426` error scenarios), a second ephemeral listener for the data channel, `listen(0, '127.0.0.1')` + close in `finally` exactly as :115-117. **DIVERGENCE:** SMTP harness is request→response reflexive; the FTP mock must be SCRIPTED (pre-baked reply sequences, delays) to test interim 1xx drain (T2), NOOP stray-200 swallow during in-flight STOR (T6), timeout-destroy (T9), and STOR-restart-without-REST (T10) — behaviors a reflexive server cannot exercise. It must also RECORD received command lines for ordering assertions (T10: assert no `REST ` appears before STOR on the upload path).

**Session-reuse pin (T5)** — no repo analog; nearest is the harness idiom above with `tls.createServer` (self-signed, generated in-test via node:crypto) asserting `socket.isSessionReused()` on the server-accepted data socket. Env-gated live e2e is explicitly NOT this phase (Phase 98 owns the vsftpd docker recipe).

**Gate idiom reference (not used in 97):** `test/backup-s3-e2e.test.mjs:28-30` — `const maybeMinio = minioUrl ? test : test.skip;` — cited only to show why 97 tests are NOT gated: mock-server tests bind 127.0.0.1 in-process, always runnable (RESEARCH.md Environment Availability).

## Shared Patterns

### Error text hygiene (V14)
**Source:** `export/s3.js:36-38, 57-60` + `test/backup-s3-sigv4.test.mjs:209-217`
**Apply to:** `export/ftp.js` (every error path), both test files (scrub pin)
`sliceError` copied verbatim; PASS/USER lines scrubbed before any error/log capture; test asserts the raw password never appears.

### Keyed-error contract
**Source:** `export/s3.js:260-278`
**Apply to:** `export/ftp.js` — `err.code` classes ('ftpAuthFailed', 'ftpPathNotFound', 'ftpQuotaExceeded', 'ftpTransferAborted', 'ftpUnreachable', 'ftpGeneric', 'ftpSha256Mismatch', 'ftpPassiveFailed'), message always through sliceError. No separate error-module (D-04).

### Root-not-src module placement
**Source:** `export/s3.js:5-6`
**Apply to:** `export/ftp.js` — lives at repository root beside s3.js. The prohibition test guards `src/`.

### opts-overridable constants for testability
**Source:** `export/s3.js:441-442, 602-605`
**Apply to:** `export/ftp.js` — `FTP_NOOP_INTERVAL_S = 60` exported const (D-03), `opts.noopIntervalS ?? FTP_NOOP_INTERVAL_S * 1000`, opts.attempts/backoffMs/timeouts same idiom.

### In-process server harness discipline
**Source:** `test/subject-encode.test.mjs:17-58, 115-117`
**Apply to:** `test/backup-ftp-client.test.mjs` — `listen(0,'127.0.0.1')` ephemeral port, close in `finally`, captured payload/command arrays for assertions.

## No Analog Found

| File / Concern | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Reply-parser state machine | (within ftp.js) | streaming stateful | No HTTP analog in s3.js; follow RESEARCH.md Pattern 2 spec directly |
| TLS session-reuse capture (T5) | (within ftp.js/test) | event-driven | No repo precedent for getSession()/session-option reuse; Pattern 5 + node:tls docs |
| Scripted-delay mock server (T2/T6/T9) | test harness | event-driven | fakeSmtp is reflexive only; FTP mock needs pre-baked sequences — extend the harness idiom |
| NOOP expectation-qualified dispatch (P4) | (within ftp.js) | request-response | s3.js dispatch is per-request/per-response; FTP needs one-in-flight + stray-reply swallow |

## Metadata

**Analog search scope:** `export/`, `test/` (grep for createServer across test/ — 20 hits in 14 files, top-3 idioms read: subject-encode, digest-style SMTP harness references, s3-sigv4/s3-e2e)
**Files scanned:** 5 read in full/part (export/s3.js, test/backup-s3-sigv4.test.mjs, test/subject-encode.test.mjs, test/backup-s3-e2e.test.mjs:1-30, planning docs)
**Pattern extraction date:** 2026-11-25
