---
phase: 97
plan: 97-01
subsystem: export/backup-destinations
tags: [ftp, ftps, zero-dep, node-net, node-tls, tls-session-reuse, passive-mode]
requires:
  - "Phase 96 D-05 dormant-custody unlock (export/ftp.js permitted)"
provides:
  - "export/ftp.js — zero-dep FTP/FTPS client: parseReply/parseEpsvPort/parsePasvPort, ftpErrorFrom, scrubFtpLine, FTP_NOOP_INTERVAL_S, connectFtp (connect/stor/dele/size/noop/quit/end), fetchToStaged, rest(), probeFtp"
  - "test/backup-ftp-parser.test.mjs — golden-vector parser contract (13 tests)"
  - "test/backup-ftp-client.test.mjs — in-process net/tls mock harness + client/probe tests (16 tests)"
affects:
  - "Phase 98 (destination wiring, UI mapping of keyed error codes, vsftpd docker e2e)"
tech-stack:
  added: []           # SC-5: zero new dependencies — node:net/node:tls only
  patterns:
    - "promise-API client factory mirroring export/s3.js (D-01)"
    - "keyed err.code error classes mirroring s3ErrorFrom (D-04)"
    - "scripted in-process mock server (fakeSmtp idiom)"
key-files:
  created:
    - export/ftp.js
    - test/backup-ftp-parser.test.mjs
    - test/backup-ftp-client.test.mjs
  modified:
    - test/export-prohibition.test.mjs          # node:net/node:tls allow-list (97 unlock)
    - test/destination-registry-gate.test.mjs   # ftp.js existence pin flip
decisions:
  - "EPSV parse regex /\\(\\|\\|\\|(\\d+)\\|\\)/ — matches real wire format (|||port|); acceptance pin 31745 wins over plan text"
  - "P8 session reuse: control getSession() captured once post-handshake, passed as the session option of every data-channel tls.connect"
  - "P6/T10: STOR retry = fresh passive channel + whole-file re-read from byte 0; REST is RETR-only, zero REST lines on the upload transcript"
  - "D-03 NOOP keep-alive: 60s const, fires only while a transfer is in flight; stray 2xx swallowed + counted (OQ-2)"
  - "Mock harness tracks and force-destroys sockets in close() — node closeAllConnections alone deadlocks with un-QUITed clients"
  - "Mock TLS pair pinned to maxVersion TLSv1.2 for session-reuse observability (node TLS 1.3 tickets not resumable cross-server in-process)"
metrics:
  duration: "~2 sessions (Task 1 tracer through phase gates)"
  completed: "2026-11-25"
status: complete
plan_head_before: 42d1115f8f9ed3ed9db22580b698f3571d7cda12
plan_head_after: dbcfd630
commits: 5
actuals:
  tokens: 314000   # chars/4 over the realized diff (1685 lines ftp.js+tests + gate-test edits)
  tasks: 4
  commits: 5
---

# Phase 97 Plan 01: FTP/FTPS Client Zero-Dep Summary

Hand-rolled zero-dependency FTP/FTPS client (`export/ftp.js`, 827 LOC on node:net/node:tls only) with golden-vector parser tests and an in-process scripted mock-server suite — no wiring, Phase 98 consumes it.

## What Was Built

1. **Parser SM (T1/T3/T4/T7):** `parseReply` multiline state machine (bare-code terminator, `NNN-` body accumulation, partial-feed via `consumed`), `parseEpsvPort`/`parsePasvPort` (control-host rule: never dial the server-announced address), `ftpErrorFrom` keyed classes with `ftpTransient` 4xx/5xx flags, `scrubFtpLine`/`scrubTranscript` (PASS/USER lines AND mid-line credential tokens never reach err.message; ≤300-char slice).
2. **Client (D-01):** `connectFtp(config, opts)` promise API — connect/stor/dele/size/noop/quit/end + `rest()` (RETR-only, P6) and `__debug` accessor (noopSwallowed/sessionCaptured). STOR retry: fresh passive channel + whole-file re-read from byte 0 per attempt, transient-only, `attempts`/`backoffMs` (s3.js idiom); zero REST on the upload path (T10).
3. **TLS (T5, P8/P9):** explicit mode (AUTH TLS → same-socket upgrade → PBSZ 0 → PROT P, order test-pinned, never EPSV ALL/PROT C), implicit mode (TLS from byte 0, port ?? 990, zero AUTH/PBSZ/PROT), data-channel TLS with session reuse (server-side `isSessionReused` asserted), `minVersion TLSv1.2`, `rejectUnauthorized` from `insecure`, keyed `ftpTlsFailed`.
4. **Resilience (P1/P5/T6/T9):** timeout → destroy sockets + keyed rejection (no hang), control error/close → data sockets destroyed + `ftpTransferAborted` mid-transfer, NOOP keep-alive only in-flight with stray-2xx swallow counter, EPSV→PASV fallback once → keyed `ftpPassiveFailed`.
5. **Seams:** `fetchToStaged(config, path, sha256, stagingDir)` (D-02, OQ-1 single-shot RETR, keyed `ftpSha256Mismatch`/`ftpChecksumFailed`, temp rm on failure) and `probeFtp` (OQ-3, probeS3 keyed shape, `gr8r-probe/probe-<ts>-<uuid8>.probe` marker, deleteFailed warning, httpWarning = secure none/insecure).

## Verification

- FTP file suite: 29 tests, deterministic green (3 consecutive runs).
- Phase gates: `git diff` on package.json vs plan start EMPTY (SC-5 zero deps); server.js/export/backup.js untouched; no i18n keys; imports = node builtins only.
- Full `npm test`: **2532 tests / 2505 pass / 2 fail** — exactly the two documented pre-existing failures (fr-typography, webhook-routes GET list). The suite grew from 2503 tests by the 29 new FTP tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Phase-96 gate tests pinned the pre-97 world**
- **Found during:** Task 4 full-suite run
- **Issue:** `test/destination-registry-gate.test.mjs` asserted `export/ftp.js must NOT exist in 96`; `test/export-prohibition.test.mjs` allow-list lacked `node:net`/`node:tls`.
- **Fix:** ftp.js existence pin flipped to "exists since Phase 97" (smb.js dormancy pin kept); allow-list extended with the two builtins SC-1 mandates.
- **Files:** test/destination-registry-gate.test.mjs, test/export-prohibition.test.mjs
- **Commit:** dbcfd630

**2. [Rule 1 - Bug] Buffer stor source would fail pipeline**
- **Found during:** Task 4 (probeFtp passes a Buffer)
- **Issue:** `Buffer.prototype.read` is a function, so the legacy stream duck-check skipped Buffer normalization; `pipeline(Buffer, sock)` throws.
- **Fix:** `Buffer.isBuffer(source) ? Readable.from([source])` in storWithRetry.
- **Commit:** d5d8b207

### Auth Gates

None — no external services touched.

## Known Stubs

None. All seams (`probeFtp`, `fetchToStaged`, `rest`) are fully implemented; Phase 98 owns wiring, UI key mapping, and the docker vsftpd e2e (explicitly deferred by plan).

## TDD Gate Compliance

Not applicable — plan type is `auto`/`tracer` (Tasks 2–3 written test-first in practice: failing vectors added before GREEN implementation, but the phase did not run under TDD_MODE).

## Self-Check: PASSED

- export/ftp.js, test/backup-ftp-parser.test.mjs, test/backup-ftp-client.test.mjs exist on disk.
- All 5 commits found in `git log 42d1115f..HEAD` (5cee0525, eb13c33a, 0767915a, d5d8b207, dbcfd630).
