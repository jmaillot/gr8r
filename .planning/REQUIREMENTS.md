# Requirements: Milestone v3.5 — Backup Destinations SMB & FTP

**Defined:** 2026-11-25 — from owner request ("Destination smb et ftp") + research SUMMARY.md (4 dimensions, HIGH confidence on protocol mechanics and in-repo anchors; MEDIUM on SMB LOC estimate and fleet dialect coverage).

**Core Value:** Self-hosted, zero-dependency, multi-tenant project-management workspace. v3.5 extends the backup destination family (local + S3) with SMB/CIFS and FTP/FTPS mirrors on the existing v1 pipeline — zero new npm dependencies, env-only credential custody (D-88 unchanged).

## Owner Rulings (2026-11-25)

- **R-1 Remote prune:** best-effort follow-local — the server deletes SMB/FTP copies of runs whose local status becomes `deleted` by rotation; failure is logged, never fatal.
- **R-2 Manual runs:** scheduled runs ONLY are mirrored; manual runs (Run now) stay local-only.
- **R-3 FTPS certificates:** system CA validation by default; `FTP_INSECURE=true` escapes for self-signed NAS certs with a keyed probe warning (parity with S3 `httpWarning`).
- **R-4 Upload verify:** SIZE check + existing sidecar sha256 (lightweight; documented deviation from S3's full read-back D-88-8).

## v3.5 Requirements

### Cross-destination semantics (DEST)

- [x] **DEST-01**: The S3 single-slot seam (`setBackupS3Destination`, export/backup.js:635-645) becomes a destination registry; per-task opt-in via flat boolean columns (`ftp_enabled`, `smb_enabled` added beside `s3_enabled`, dual-engine DDL `adapterEnsureColumn`), env-only custody (`FTP_*`, `SMB_*` frozen at boot mirroring `S3_*` server.js:208-219). Mirror failure keeps the single terminal `upload_failed` status naming the failed destination(s); local publish stays valid; alerts ride the existing `handleBackupTaskOutcome` transition gate verbatim.
- [x] **DEST-02**: Scheduled runs only are mirrored (R-2); best-effort follow-local prune removes SMB/FTP copies of rotated-out runs (R-1); every refusal keyed and audited ×5 locales.
- [x] **DEST-03**: Probe parity — probe-at-save is a hard 400 refusal while the destination is enabled-but-unreachable; write+delete marker probe route per destination with typed error classes ×5 locales (S3 classes preserved; FTP: authFailed/unreachable/tlsFailed/passiveFailed/pathNotFound/quotaExceeded + insecureTls warning; SMB: authFailed/shareNotFound/treeConnectFailed/unreachable/signingRequired/noSpace/nameConflict + guestSession info).

### FTP/FTPS destination (FTP)

- [x] **FTP-01**: Hand-rolled FTP/FTPS client (export/ftp.js, ~350 LOC, node:net/node:tls only) — `FTP_SECURE` enum `explicit`(default)/`implicit`/`none`; USER/PASS, TYPE I, EPSV with PASV fallback (control-host rule + `FTP_PASV_HOST` override), STOR, DELE, PBSZ/PROT P, QUIT; NOOP keep-alive against idle timeouts; REST resume mirroring the D-88-16 retry idiom; TLS session-reuse on the data channel.
- [x] **FTP-02**: FTP destination wired end-to-end — toggle in the task editor (render-gated on `/api/config` payload flag), staged upload after local publish, SIZE+sidecar verify (R-4), location badge in run rows and restore list (RESTORE_LOCATION_KEYS extended), restore read-back via `fetchToStaged` on the shared contract.

### SMB destination (SMB)

- [x] **SMB-01**: Hand-rolled SMB2.1-only client (export/smb.js, ~1,400–1,600 LOC, node:crypto only) — NEGOTIATE/SESSION_SETUP (NTLMv2, hand-rolled MD4 pinned by RFC 1320 vectors)/TREE_CONNECT/CREATE/serial 60KB WRITE×N/CLOSE + READ for staged download; unconditional HMAC-SHA256 signing; NTLM type-3 material scrubbed from errors/logs (V14 parity).
- [x] **SMB-02**: SMB destination wired end-to-end — same seams as FTP-02 (toggle, staged upload after local publish, SIZE+sidecar verify per R-4, badges, restore read-back, probe with SMB error classes).

### Verification & tests (TEST)

- [x] **TEST-01**: Golden-vector discipline — MD4 RFC 1320 vectors, NTLM transcript pins, FTP response-parser pins, mirroring the SigV4 suite; env-gated docker e2e recipes (vsftpd, dperson/samba) mirroring the MinIO recipe; `membershipsOf` byte-gate and existing suites stay green.

## Future Requirements (deferred)

- SMB 3.x dialects (AES-CMAC signing, encryption) if a 2.1-min fleet surfaces
- Per-destination run-status granularity (single `upload_failed` retained for v3.5)
- Destination config UI (in-app credential management) — rejected for v3.5, D-88 env-only stands

## Out of Scope (explicit exclusions)

- **No new npm dependencies** — SMB/FTP clients hand-rolled on node stdlib (s3.js precedent)
- **No cifs/loop mounts** — rejected in research (container capabilities + unprobeable fail modes)
- **No Kerberos** — NTLMv2 only
- **No LIST/MLST directory parsing** — probe = write+delete marker on a known path
- **No per-destination archive format change** — same tar.gz + sha256 sidecar

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEST-01 | Phase 96 | Complete |
| DEST-02 | Phase 100 | Complete |
| DEST-03 | Phase 98 (FTP classes + pattern), Phase 100 (SMB classes) | Complete |
| FTP-01 | Phase 97 | Complete |
| FTP-02 | Phase 98 | Complete |
| SMB-01 | Phase 99 | Complete |
| SMB-02 | Phase 100 | Complete |
| TEST-01 | Distributed — byte-gate pin Phase 96; golden vectors Phases 97/99; e2e recipes Phases 98/100 | Complete |
