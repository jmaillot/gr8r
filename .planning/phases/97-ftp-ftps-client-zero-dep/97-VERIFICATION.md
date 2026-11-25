---
phase: 97-ftp-ftps-client-zero-dep
verified: 2026-11-25T00:00:00Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - .planning/phases/97-ftp-ftps-client-zero-dep/97-01-PLAN.md
  - .planning/phases/97-ftp-ftps-client-zero-dep/97-01-SUMMARY.md
  - export/ftp.js
  - test/backup-ftp-parser.test.mjs
  - test/backup-ftp-client.test.mjs
  - test/export-prohibition.test.mjs
  - test/destination-registry-gate.test.mjs
covered_digest: "v2:sha256:67d99d16d8962cd377690b1c263d9b0a8cc76e5430edce3e3915ff75be22ad25"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 97: FTP/FTPS Client Zero-Dep Verification Report

**Phase Goal:** A tested, standalone FTP/FTPS client module exists — parser, transfers, TLS — with no pipeline wiring yet.
**Verified:** 2026-11-25
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | export/ftp.js implements USER/PASS, TYPE I, EPSV with PASV fallback (control-host rule + pasvHost), STOR, DELE, PBSZ/PROT P, QUIT, NOOP keep-alive (FTP_NOOP_INTERVAL_S=60) and REST — node builtins only (SC-1) | ✓ VERIFIED | `export/ftp.js:64-70` imports only node:net/tls/fs/path/crypto/stream — no npm specifier, no s3.js import; `FTP_NOOP_INTERVAL_S = 60` at line 97; `export-prohibition.test.mjs:125-126` allow-lists node:net/node:tls and passes in suite |
| 2 | FTP_SECURE explicit(default)/implicit/none works; session reuse captured from control socket, passed to every data-channel tls.connect, test-pinned (SC-2) | ✓ VERIFIED | `ftp.js:400` `session: ctl.session` on every data tls.connect; session captured once at `ftp.js:698-704`; T5 test asserts server-side `isSessionReused()` (client.test.mjs:284) — passing |
| 3 | Golden vectors for multiline 2xx, 227/229 pasv parse, 4xx-vs-5xx classification as first-class tests mirroring SigV4 idiom (SC-3) | ✓ VERIFIED | `test/backup-ftp-parser.test.mjs` — 13 offline ungated tests incl. T1 multiline terminator, T3 EPSV/PASV port math, T4 transient flags; all green (29/29 FTP suite) |
| 4 | PASS/credential lines never in errors/logs (scrub test-pinned); all 10 keyed error classes present (SC-4) | ✓ VERIFIED | T7 test: raw password absent from err.message, slice ≤300; runtime export probe confirmed all 10 codes resolve via ftpErrorFrom; scrubFtpLine pins pass |
| 5 | package.json diff empty; suite at baseline + 29 new FTP tests; data-a pin 623 (SC-5) | ✓ VERIFIED | `git log 42d1115f..HEAD -- package.json server.js export/backup.js` = EMPTY; `npm test`: 2532 tests / 2505 pass / exactly the 2 documented failures (fr-typography, webhook-routes GET list); i18n-shell + i18n-toast both pin 623 (unchanged) |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `export/ftp.js` | zero-dep client, all exports | ✓ VERIFIED | 827 LOC; runtime import probe: parseReply/parseEpsvPort/parsePasvPort/ftpErrorFrom/scrubFtpLine/FTP_NOOP_INTERVAL_S/connectFtp/fetchToStaged/probeFtp — none missing |
| `test/backup-ftp-parser.test.mjs` | golden vectors (SC-3) | ✓ VERIFIED | 13 tests, all pass |
| `test/backup-ftp-client.test.mjs` | mock-server client/probe suite | ✓ VERIFIED | 16 tests incl. T5/T6/T9/T10 pins, all pass |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| control socket | data-channel tls.connect | `session: ctl.session` (P8) | WIRED | ftp.js:400 + T5 server-side isSessionReused pin |
| control 'error'/'close' | data socket destroy + ftpTransferAborted (P5) | close handler | WIRED | implemented; T-suite green, no hang |
| STOR retry | fresh passive channel + byte-0 re-send (P6) | storWithRetry | WIRED | T10 pins: two attempts, zero `REST ` lines in upload transcript (client.test.mjs:591) |
| fetchToStaged | hashTap → sha256 → keyed mismatch + temp rm (D-02) | pipeline | WIRED | ftp.js:533-559, err.code='ftpSha256Mismatch' keyed; T8 green |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| FTP module suites | `node --test test/backup-ftp-parser.test.mjs test/backup-ftp-client.test.mjs` | 29 tests, 0 fail | ✓ PASS |
| Exports contract | `node -e import('./export/ftp.js')` | all 9 exports present, NOOP=60 | ✓ PASS |
| Full baseline | `npm test` | 2532/2505/2 (fr-typography, webhook GET list — documented) | ✓ PASS |

### Probe Execution

None declared — no `scripts/*/tests/probe-*.sh` for this phase. Not applicable.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| FTP-01 | 97-01 | Hand-rolled FTP/FTPS client, node:net/node:tls only, FTP_SECURE enum, full command surface, NOOP keep-alive, REST, TLS session-reuse | ✓ SATISFIED | Truths 1-2 + key links; client suite green |
| TEST-01 | 97-01 | Golden-vector discipline — FTP response-parser pins mirroring SigV4 suite | ✓ SATISFIED | Truth 3; 13 parser vectors green (e2e recipes explicitly deferred to 98/100 per REQUIREMENTS.md) |

No orphaned requirements: REQUIREMENTS.md maps FTP-01 → Phase 97 (Complete), TEST-01 golden vectors → Phase 97.

### Anti-Patterns Found

None blocking. No TBD/FIXME/XXX markers in the three phase files. No stubs — all seams fully implemented.

### Deviation Review

1. **Phase-96 gate test updates** — pin-strengthening, not weakening: `export-prohibition.test.mjs` allow-list EXTENDED with node:net/node:tls (SC-1 mandates these builtins); `destination-registry-gate.test.mjs:98` ftp.js existence pin flipped to "exists since Phase 97" with the smb.js dormancy pin kept. Both pass in the suite. Accepted.
2. **Buffer stor normalization** — `Buffer.isBuffer(source) ? Readable.from([source])` fixes a real pipeline bug; STOR transcript semantics (command order, byte-0, zero REST) unchanged and T10-pinned. Accepted.

### Observations (non-blocking)

- **LOC:** export/ftp.js is 827 lines vs the ~350 research estimate. Inspection shows the growth is header banner/contract comments, keyed error table, opts injection (`noopIntervalS/attempts/backoffMs`), `__debug` accessor, and retry/TLS plumbing — test-support and D-01/D-04 surface, not scope creep. No missing feature, no extra feature.
- **Standalone claim:** verified — no import of ftp.js in server.js (only a pre-existing prohibition comment mentioning it) or export/backup.js.

### Human Verification Required

None — every must-have is test-pinned and runnable in-process; no UI, external-service, or real-time behavior is exposed in this phase (Phase 98 owns wiring/UI/docker e2e).

### Gaps Summary

None. Phase goal achieved: a tested, standalone zero-dep FTP/FTPS client exists (parser, transfers, TLS, session reuse, scrub, keyed errors, fetchToStaged, probeFtp) with zero pipeline wiring and suite at baseline.

---

_Verified: 2026-11-25_
_Verifier: the agent (gsd-verifier)_
