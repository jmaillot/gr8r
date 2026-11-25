---
phase: 99-smb-2-1-client-spike-hardened
captured: 2026-11-25
status: locked
decisions: 4
---

# Phase 99 — Context: SMB 2.1 Client (Spike-Hardened)

**Phase goal (ROADMAP):** A golden-vector-pinned, standalone SMB2.1 client exists — the research-heavy risk item contained to a well-tested module before any wiring.

**Carried forward:** D-88 env-only custody (SMB_* boot-frozen landed in 96) · registry descriptor D-01/96 (smb slot dormant) · client-pattern precedents D-01..D-04/97 (promise API, error classes with `code`, scrub test-pinned) · harness pattern 98. Standing: zero new deps (node:crypto ONLY), i18n ×5 IF any user-facing string lands (client module — likely none, same escalation rule as 97), data-a pin 623, `membershipsOf` byte-gate, baseline 2572 tests / 2 documented pre-existing failures.

## Decisions

- **D-01:** Promise API mirroring ftp.js/s3.js (97 D-01/D-04 style) — `await smb.write(path, buffer)`, `smb.read(path)`, `smb.rm(path)`, `smb.echo()`, `smb.connect()/close()`; no frame-level API, no event-emitter surface. Integrates into the 96 descriptor in 100 without adaptation.
- **D-02:** Test strategy = pure golden vectors (MD4 RFC 1320 vectors, NTLMv2 type-1/2/3 transcript fixtures, SMB2 HMAC-SHA256 signing-key derivation — SigV4-suite idiom) + scripted in-process NBSS mock server (97 fakeFtp idiom, extended to frame sequences with command recording). NO docker, NO samba e2e in 99 — the real-server e2e (dperson/samba, env-gated) is phase 100's recipe.
- **D-03:** The spike report is a formal `99-SPIKE.md` in the phase directory: actual LOC vs the 1,400–1,600 MEDIUM estimate, dialect surprises encountered in RFC/source work, SMB2-min-3.0 fleet exposure stated as known risk, and an explicit go/no-go verdict for phase 100. The 100 discuss-phase reads it.
- **D-04 (derived, technical):** NTLMv2 material scrub follows V14 parity — type-3 blob, NTLM response bytes and password-derived keys never appear in errors/logs (test-pinned); error classes carry `smbClass` + `code` exactly per SC-3 enum.

## Specifics

- Command surface (SC-1): NBSS session + SMB2 header codec, NEGOTIATE (2.1, 2.0.2 fallback), SESSION_SETUP NTLMv2 (hand-rolled MD4), TREE_CONNECT, CREATE, serial ≤60KB WRITE×N, CLOSE, READ, ECHO keep-alive, SESSION_SETUP-retry on sessionExpired.
- Signing unconditional (SC-2) — HMAC-SHA256 with the session key derivation pinned by test.
- npm test baseline: 2572 tests / 2 documented pre-existing failures (fr-typography, webhook-routes GET list).

## Deferred Ideas

- Real-server samba e2e (→ 100, D-02)
- SMB 3.x dialect support (out of scope — dialect risk documented, not absorbed)

## Canonical refs

- .planning/research/SUMMARY.md (SMB dimension — LOC estimate, dialect table)
- .planning/phases/97-ftp-ftps-client-zero-dep/ (client precedent: promise API, keyed errors, scrub, mock-server idiom)
