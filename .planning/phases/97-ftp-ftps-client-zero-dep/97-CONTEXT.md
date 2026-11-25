---
phase: 97-ftp-ftps-client-zero-dep
captured: 2026-11-25
status: locked
decisions: 4
---

# Phase 97 — Context: FTP/FTPS Client (Zero-Dep)

**Phase goal (ROADMAP):** A tested, standalone FTP/FTPS client module exists — parser, transfers, TLS — with no pipeline wiring yet.

**Carried forward:** R-3 (CA + FTP_INSECURE flag, keyed probe warning parity httpWarning) · R-4 (SIZE + sidecar verify) · D-88 env-only custody (FTP_* boot-frozen, landed in 96) · registry descriptor D-01 (96) with `upload/verify/probe/fetchToStaged` slots to fill in 98. Standing: zero new deps, ×5 locales, `membershipsOf` byte-gate.

## Decisions

- **D-01:** Promise API, style s3.js — `await ftp.stor(path, stream)`, `await ftp.dele(path)`, `await ftp.connect()/end()`, promisified control flow; no event-emitter surface. Integrates into the 96-01 descriptor without adaptation.
- **D-02:** The restore primitive `fetchToStaged(config, path, expectedSha256, stagingDir)` lives IN the client (sha256-on-pipe inside) — wiring in 98 is one descriptor field.
- **D-03:** NOOP keep-alive interval is 60s (below the 300s vsftpd idle default with margin) and configurable via const, not env.
- **D-04:** Error classes are plain `Error` subclasses with a `code` field (e.g. `err.code = 'ftpAuthFailed'`) — same shape s3.js uses for keyed mapping; no separate error-module.

## Specifics

- Client file: `export/ftp.js` (~350 LOC target; research estimate). Command surface: USER/PASS, TYPE I, AUTH TLS→PBSZ→PROT P (explicit), transport swap (implicit 990), EPSV with PASV fallback (control-host rule + `FTP_PASV_HOST` override; never EPSV ALL), STOR, DELE, SIZE, PBSZ/PROT P, REST, NOOP, QUIT. No LIST/MLST.
- TLS session-reuse: capture `controlSocket.getSession()` and pass to every data-channel `tls.connect` — pinned by test.
- Scrub rule: PASS line and any credential-bearing command line never appear in errors/logs (test-pinned, V14 parity).
- Golden vectors: multiline 2xx, 227/229 pasv parse, 4xx-vs-5xx classification — first-class tests mirroring the SigV4 suite idiom.
- `npm test` baseline: 2503 tests / 2 documented pre-existing failures (fr-typography, webhook-routes GET list). data-a pin 623.

## Deferred Ideas

(none this session)

## Canonical refs

- /home/jmaillot/Projects/gr8r/.planning/research/SUMMARY.md (FTP dimension)
- /home/jmaillot/Projects/gr8r/docs/DEPLOY.md §20 (S3 operator-doc posture FTP sections mirror in 98)
