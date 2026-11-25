---
phase: 96-cross-destination-seam-generalization
plan: 01
subsystem: backup-export-seam
tags: [destination-registry, s3, byte-gate, wave-0-gate, dormant-slots]
requires: []
provides:
  - destination registry (setBackupDestination name/descriptor, export/backup.js)
  - Wave-0 static gate (test/destination-registry-gate.test.mjs) pinning seam shape, D-04 order, raw-error branch, single uploaded=1 write site
  - dormant ftp/smb slots with FTP_*/SMB_* boot-frozen env custody (server.js)
affects: [97-ftp-destination, 100-smb-destination, 98-badge-config]
tech-stack:
  added: []
  patterns: [insertion-ordered Map registry, descriptor seam (D-01), dormant-slot skip contract, source-slice static gate]
key-files:
  created:
    - test/destination-registry-gate.test.mjs
  modified:
    - export/backup.js
    - server.js
    - test/backup-export.test.mjs
    - test/restore-preview.test.mjs
decisions:
  - OQ-1 honored strictly: legacy setBackupS3Destination removed with NO shim; test twins updated in the SAME commit as the rename (project rule, strengthened from plan's Task-3 split)
  - descriptor.enabled gates registry iteration; dormant slots skipped by the typeof upload check — the contract phases 97/100 fill
  - manualPrefix declared per-destination (D-01) while key derivation stays s3BackupKey (byte-identical output); descriptor field is authoritative documentation at the seam for phases 98/100
metrics:
  duration: ~50m
  completed: 2026-11-25
status: complete
actuals:
  tokens: 42000
  tasks: 3
  commits: 2
  plan_head_before: 56c7a40278c6283cb3ae0369541dc33e5e8d14d5
  plan_head_after: d0c245f6
---

# Phase 96 Plan 01: Destination Registry Seam Summary

**One-liner:** The S3 single-slot seam became an insertion-ordered destination registry (`setBackupDestination(name, dest)`, D-01 descriptor) with the S3 path byte-preserved inside it, dormant env-derived ftp/smb slots in canonical s3>ftp>smb order (D-04/D-05), and a Wave-0 static gate pinning the seam shape, registration order, raw single-destination error path and the single `uploaded = 1` write site so phases 97/98/100 cannot silently drift them.

## What Was Built

### Task 1 — Registry refactor end-to-end (tracer) — commit 75602023
- `export/backup.js`: `s3DestinationProvider` + `setBackupS3Destination` replaced by an insertion-ordered `destinations` Map + exported `setBackupDestination(name, dest)` with the D-01 descriptor `{ label, enabled, upload, verify, probe, fetchToStaged, manualPrefix }`. NO compat shim (OQ-1).
- Upload slot re-expressed as ordered registry iteration; dormant-slot skip contract (`!dest?.enabled || typeof dest.upload !== 'function'` → continue). The S3 branch body (staged upload, D-88-8 read-back verify, sidecar compare, `setStage('uploading')`, cancellation→upload_failed routing, RAW `s3SliceError` message, single `uploaded = 1` mark) preserved verbatim in behavior; the OQ-3 composition (`upload failed: <names> — first error: <sliced>`) exists but is gated behind `failedUploads.length >= 2` — unreachable in 96 by design (D-06).
- `server.js`: S3 install re-expressed as `setBackupDestination('s3', { label, enabled: S3.enabled, manualPrefix: 'backup-manual/', upload: <verbatim closure> })`.
- `test/destination-registry-gate.test.mjs`: Wave-0 static gate (node:test + source-slice regex + verbatim structure pins) — 8 tests.
- Test twins (backup-export.test.mjs, restore-preview.test.mjs) knowingly updated to registry form in the SAME commit as the rename per the project OQ-1 rule; no assertion weakened.

### Task 2 — Dormant FTP/SMB slots (D-05) — commit d0c245f6
- `server.js`: boot-frozen `FTP_HOST/FTP_PORT/FTP_USER/FTP_PASSWORD/FTP_SECURE/FTP_PASV_HOST/FTP_INSECURE` and `SMB_HOST/SMB_SHARE/SMB_USER/SMB_PASSWORD` consts beside the S3 block (read once at boot; values never leave the consts).
- Partial-config warn parity at boot via logWarn (SC-4) — deliberately NOT the S3 `S3_PATH_STYLE` hard boot-refuse; absent/partial FTP/SMB env never exits the process.
- Dormant `ftp`/`smb` registry entries registered after s3 (canonical order s3>ftp>smb, D-04) with env-derived `enabled` and declared `manualPrefix` (`backup-ftp/`, `backup-smb/` — never used in 96). NO export/ftp.js or export/smb.js (D-05).
- Gate extended with the full D-04 order pin and dormant-custody pins (consts, derivations, warn parity, no-client-modules).

### Task 3 — S3 regression suites green (verification-only, zero-diff)
- `setBackupS3Destination` grep: 3 remaining hits are the gate file's own NEGATIVE assertions (the enforcement mechanism) — zero usage in export/, server.js, or any behavioral test.
- Regression set: backup-export + restore-preview + backup-s3-sigv4 + backup-s3-upload → 70/70 pass. Gate 8/8. xws-gate (membershipsOf byte-gate) 4/4.
- Full `npm test`: **2500 tests** (baseline 2492 + 8 new gate tests), 3 failures — ALL verified pre-existing by re-running the same suites at HEAD~3 in a scratch worktree: fr-typography (D-05 documented), webhook-events "no double-fire" and webhook-routes "GET list health" (both members of the documented webhook family, present at HEAD~3 identically). **Zero new failures.**

## Deviations from Plan

1. **[Rule 1 - Bug] Block-comment `*/` inside `S3_*/FTP_*/SMB_*`** — the first draft of the seam comment closed the block comment early (`*/` of `FTP_*/`), a SyntaxError. Reworded to "S3/FTP/SMB env consts". Found and fixed during Task 1.
2. **[Deviation - commit structure]** The plan split twins (Task 3) from the rename (Task 1), but the project rule mandates twins in the SAME commit as the rename (OQ-1) — followed the project rule: twins landed in commit 75602023; Task 3 became a zero-diff verification task.
3. **[Deviation - gate staging]** The full gate file pins ftp/smb order+custody, which cannot pass before Task 2 lands. The gate was committed in two stages matching the surface: s3-only pins in commit 1, ftp/smb pins added in commit 2 — every commit is green.

## SC-3 Deferral (per plan footer)

SC-3 output-level verification ("error text names the failed destination(s)") is deferred to phases 98/100 by ratified OQ-3/D-06 — in 96 only the branch structure is pinned: the composition literal `upload failed: ${failedUploads.map(f => f.name).join(', ')} — first error: ${msg}` exists verbatim in export/backup.js, gated behind `failedUploads.length >= 2` (single active destination; composed prefix unreachable by design). The gate pins the literal and its guard.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| ftp/smb descriptors carry no `upload/verify/probe/fetchToStaged` | server.js (install block) | Intentional — D-05 dormant slots; phases 98/100 install the clients. Gate pins the skip contract. |

## Threat Flags

None — no new network endpoints, auth paths, or file-access patterns. FTP/SMB creds cross env→boot-consts via the existing custody pattern (T-96-01 accepted: dormant slots emit nothing). T-96-02 mitigated by the Wave-0 gate. T-96-SC: zero installs.

## Verification (all run)

- `node --test test/destination-registry-gate.test.mjs` → 8/8 green
- `node --test test/backup-export.test.mjs test/restore-preview.test.mjs test/backup-s3-sigv4.test.mjs test/backup-s3-upload.test.mjs` → 70/70 green
- `node --test test/xws-gate.test.mjs` → 4/4 green (membershipsOf byte-gate)
- `npm test` → 2500 tests, only the 3 verified pre-existing failures (see Task 3)
- `grep -c "setBackupS3Destination" export/backup.js` → 0; `grep -c "setBackupDestination" export/backup.js` → ≥1; `grep -c "setBackupDestination('s3'" server.js` → 1; `grep -c "update backup_runs set uploaded = 1" export/backup.js` → 1
- `ls export/ftp.js export/smb.js` → none

## Self-Check: PASSED

- export/backup.js, server.js, test/destination-registry-gate.test.mjs, test/backup-export.test.mjs, test/restore-preview.test.mjs — all present and committed.
- Commits 75602023, d0c245f6 exist on main.
