---
phase: 96-cross-destination-seam-generalization
captured: 2026-11-25
status: locked
decisions: 6
---

# Phase 96 — Context: Cross-Destination Seam Generalization

**Phase goal (ROADMAP):** The S3 single-slot seam becomes a destination registry so FTP and SMB can plug in without S3 behavior changing one byte.

**Owner rulings carried forward (v3.5, 2026-11-25):** R-1 remote prune best-effort follow-local · R-2 scheduled-only mirroring · R-3 CA + FTP_INSECURE flag · R-4 SIZE+sidecar verify (SMB/FTP only — S3 keeps full read-back D-88-8). Standing: D-88 env-only custody, zero new dependencies, i18n ×5 same-commit, dual-engine DDL lockstep, `membershipsOf` byte-gate.

## Decisions

<decisions>
- **D-01:** Registry = single descriptor. `setBackupDestination(name, dest)` where `dest = { upload, verify, probe, fetchToStaged, manualPrefix, label }` — one extension point; wiring in phases 97/100 becomes one install call each. The manual-run prefix is DECLARED BY the destination (S3 keeps `backup-manual/` byte-identically). The legacy `setBackupS3Destination(fn)` signature is replaced by the registry call with a thin compat shim if any test pins the old name — checked during planning, updated knowingly if so.
- **D-02:** /api/config payload = flat additive keys. `s3Enabled` stays byte-identical; `ftpEnabled` and `smbEnabled` are added as flat sibling booleans. No nested `destinations:{}` object. Existing pins (client state.s3Enabled api.js:219, render gate backup.js:522) untouched.
- **D-03:** Run truth = additive integer flags. `ftp_uploaded` and `smb_uploaded` columns are added beside `uploaded`, which KEEPS its meaning as the S3/local-published truth exactly as today — existing runs and consumers unchanged. Both new columns via `adapterEnsureColumn` (dual-engine lockstep, second boot no-op, invites-rebuild idiom).
- **D-04:** Badge precedence = fixed s3 > ftp > smb. The restore location badge derives from the highest-priority destination holding a verified copy — S3 first, so existing runs render exactly as today. `RESTORE_LOCATION_KEYS` gains `ftp`/`smb` entries and the server-side flag derivation becomes an ordered scan over the registry (one-line extension per new destination).
- **D-05:** Dormant slots. In phase 96 the registry declares `ftp` and `smb` entries with `enabled=false` derived from env (no client exists yet — phases 97/100 install them). NO fake probe, NO UI render: the task-editor toggle gates stay keyed on the real enabled flags, so nothing is visible until wired. `/api/config` exposes the flags as false.
- **D-06:** S3 byte-identity gate. The S3 upload/verify/sidecar/probe/restore path must be diff-verified unchanged: the S3 golden-vector suite and the MinIO env-gated e2e stay green, and a Wave-0 grep/slice gate pins `setBackupDestination('s3', …)` shape + the `upload_failed` error composition ("upload failed: <dest names>") so later phases cannot silently drift it.
</decisions>

## Specifics

- Anchors (from seam-map research): env custody server.js:208-219 · `S3.config()` :351-365 · THE seam export/backup.js:635-645 installed server.js:3821-3828 · upload slot export/backup.js:832-838 · `s3_enabled` DDL :768 + `adapterEnsureColumn` :966 · `backup_runs.uploaded` :806/:1009 · probe routes :9040/:9194/:9245 · restore flag derivation server.js:9508/9650 · RESTORE_LOCATION_KEYS src/pages/backup.js:545.
- `npm test` baseline: 2492 tests / 2 documented pre-existing failures (D-05 fr-typography, D-06 webhook-routes).
- Registry order is canonical: registration order = `s3`, `ftp`, `smb` (matches D-04 precedence); iteration for upload/prune/badge uses registry order.

## Deferred Ideas

(none this session)

## Canonical refs

- .planning/research/SUMMARY.md (v3.5 synthesis — seam map + semantics)
- /tmp/opencode/seam-map.md is superseded by .planning/research/SUMMARY.md §seams
- docs/DEPLOY.md §19-20 (naming + S3 destination operator docs — DEPLOY.md gains FTP/SMB sections in phases 98/100, not 96)
