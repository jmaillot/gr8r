# Phase 96 — Discussion Log

**Date:** 2026-11-25 · **Mode:** discuss (4 gray areas, all owner-selected)

| Area | Question | Ruling |
|---|---|---|
| Registry contract | descriptor vs separate fn slots | **D-01** single descriptor `setBackupDestination(name, {upload, verify, probe, fetchToStaged, manualPrefix, label})`; legacy setter name compat-checked at planning |
| /api/config payload | flat keys vs nested object | **D-02** flat additive `ftpEnabled`/`smbEnabled`; `s3Enabled` byte-identical |
| Run truth flags | new columns vs JSON blob | **D-03** additive `ftp_uploaded`/`smb_uploaded`; `uploaded` keeps S3 meaning |
| Badge precedence + dormant slots | priority & empty registry entries | **D-04** fixed s3 > ftp > smb; **D-05** dormant slots enabled=false, no fake probe/UI |
| (derived) S3 byte-identity | how to pin unchanged behavior | **D-06** Wave-0 grep/slice gate + golden-vector suite + MinIO e2e green |

Pre-captured decisions applied without re-asking: R-1..R-4 owner rulings (2026-11-25), D-88 env-only custody, upload_failed single terminal status, probe 400 refusal idiom, i18n ×5 / dual-engine / byte-gate standing constraints.

Owner answers via question tool, 2026-11-25. CONTEXT.md locked with decisions D-01..D-06.
