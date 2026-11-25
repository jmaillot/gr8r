---
phase: 98-ftp-destination-end-to-end
researched: 2026-11-25
confidence: HIGH
note: >
  Written inline by the orchestrator (researcher agent failed twice on this
  phase: one upstream interruption, one silent stall). All anchors verbatim
  against the current tree this session. Referenced research: 97-RESEARCH.md
  (client contract), 96-RESEARCH.md (seam/DDL/badge).
---

# Phase 98 — Research: FTP Destination End-to-End

## 1. The upload slot must be GENERALIZED (top finding — scope correction)

The Phase-96 loop at export/backup.js:852-900 iterates `destinations` in
canonical order and consults `dest.upload(runMeta)` per destination, but the
BODY inside the loop is still S3-hardcoded:

- `:876` `const key = s3BackupKey(runMeta, filename)` — S3 key derivation, no per-dest prefix
- `:878` `uploadArchive(provided.config, ...)` — s3.js import (backup.js:67)
- `:888` `downloadToStaged(...)` + `:889-893` sidecar re-read — S3 read-back (D-88-8)
- `:881..907` `update backup_runs set uploaded = 1` — S3 flag write

Phase 98 therefore generalizes this block into a per-destination body
dispatched off the descriptor (the 96-01 descriptor fields `upload / verify /
manualPrefix` + the 97 client's `fetchToStaged`/`probeFtp`), while PRESERVING
byte-identity for the s3 arm:

- s3 arm keeps: s3BackupKey + uploadArchive + read-back verify + `uploaded = 1`
- ftp arm: key = `manualPrefix + filename` (or task prefix — see §2), stor via
  client, verify = SIZE check + sidecar sha256 upload (R-4), flag write =
  `update backup_runs set ftp_uploaded = 1` at exactly ONE site inside the ftp
  success block (mirrors :881 posture — never in a catch path)
- error composition at :894-899 already handles the OQ-3 payoff: ≥2 failures →
  composed prefix; single failure → raw slice. With ftp wired, a ftp-only
  failure is still a SINGLE failed destination → raw slice (sliced by the ftp
  client's scrub/slice, 97 T7). The composed branch becomes live only when 2+
  destinations fail — SC-4's "naming FTP" is satisfied by the single-failure
  slice + the `upload_failed` stage. NO change needed at :894-899.
- `dest.verify` descriptor field: 96-01 declared it; ftp arm calls the client's
  SIZE-based verify (client exports `size`) — R-4 documented deviation.

## 2. Manual-run exclusion (R-2)

The S3 install closure (server.js:3871-3895) distinguishes task runs
(`meta.taskId` set → `select s3_enabled from backup_tasks`) from manual runs
(`taskId` NULL → upload whenever enabled, prefix `backup-manual/`). FTP must
INVERT the manual leg: R-2 rules manual runs stay LOCAL-ONLY — the ftp install
closure returns null when `!meta.taskId`, and for task runs gates on
`ftp_enabled = 1` (column exists: DDL server.js:1059-1062). Key prefix for task
runs: mirror D-88-6 (task prefix per task) — the descriptor carries
`manualPrefix: 'backup-ftp/'` (declared in 96, now consumed for the probe
marker only, since manual uploads never happen).

## 3. Probe parity (DEST-03) — the pattern SMB reuses

Dedicated route (D-02), cloned from `/api/backup/s3/probe` (server.js:9349-9372):
`POST /api/backup/ftp/probe` with the VERBATIM guard chain — sameOrigin →
requireUser → `tooMany('backupprobe|'+user.id, 10, 15min)` →
`hasInstanceRole(CAP.BACKUP_MANAGE)` → `FTP.enabled` check (keyed
`ftpNotConfigured` 400, audited `backup_probe_refused:ftpNotConfigured`) →
`probeFtp(FTP.config())` → audit `backup_ftp_probe_ok|failed` → json 200.

`probeFtp` (ftp.js:583-594) already returns the keyed shape
`{ ok, key, warning?, httpWarning }` with `httpWarning = secure==='none' ||
insecure` (R-3 parity with S3 httpWarning, ftp.js:591). No client work needed.

Probe-at-save (D-02): mirror the S3 block at server.js:9135-9145 (create) and
:9289-9340 (edit): `body.ftpEnabled === true && FTP.enabled` → probeFtp →
`!ok && key !== 'deleteFailed'` → audited
`backup_task_refused:ftpProbe:${key}` + keyed 400 refusal "task was not saved".
Task row gains `ftp_enabled: body?.ftpEnabled === true ? 1 : 0` in the INSERT
(:9166) and the PUT path; `backupTaskShape` (server.js:9015) gains
`ftp_enabled`; probe outcome audit + response `ftpProbe` mirror :9180/:9184.

## 4. Toggle UI (D-01) — mirror sites

- Render gate: src/pages/backup.js:522 — S3 row keyed on `api.s3Enabled`;
  ftp row clones it after it, keyed on `api.fEnabled` → **use `api.ftpEnabled`**
  (state key from /api/config, added in 96-02), checkbox `data-in="backupTaskFtp"`,
  label key `page.backup.ftpToggle` (×5 locales).
- Form state: src/actions/actions.js:5103 area — add `ftpEnabled: false` beside
  `s3Enabled: false`; checkbox handler beside :5156; task → form hydration
  beside :5219 (`ftpEnabled: task.ftp_enabled === 1`); payload builder beside
  :5263 (`if (api.ftpEnabled) body.ftpEnabled = form.ftpEnabled === true`).
- api.js: state field + getter beside :34/:152, payload read beside :219
  (`state.ftpEnabled = !!r.data?.ftpEnabled`).
- i18n keys to add ×5 (en/fr/nl/de/es, SAME commit): `page.backup.ftpToggle`,
  probe refusal toasts — client already toasts keyed probe outcomes (the S3
  response shape carries `key`; check the toast mapping used at save and add
  the ftp twins: `ftpAuthFailed/ftpTlsFailed/ftpPassiveFailed/ftpPathNotFound/
  ftpQuotaExceeded/ftpNotConfigured` + `insecureTlsWarning` for the
  httpWarning toast, S3 `httpWarning` toast precedent).

## 5. Restore read-back (SC-3)

export/restore.js gates on `uploaded === 1` (S3 seam) at :2069 and :2300 —
both use `opts.s3Config` + `downloadToStaged` + s3BackupKey. The ftp twin:
same two gates on `ftp_uploaded === 1` + `opts.ftpConfig` calling the 97
client's `fetchToStaged` (single-shot + sha256, D-05 — no new client work).
Badge (destLocation server.js:3918-3925) already reads `ftp_uploaded` — zero
new code. Restores of the D-88-16 idiom: run lookup happens BEFORE read-back;
keep the same ordering.

## 6. e2e recipe (TEST-01, D-03) — MinIO pattern

Precedent files: test/backup-s3-e2e.test.mjs, test/restore-s3-e2e.test.mjs
(env gate `MINIO_TEST_URL` :38, skip-when-absent assertion, docker compose
invocation documented in header comment :15-23). The ftp e2e clones the
structure: `VSFTPD_TEST_URL` gate (host:port form), vsftpd container with
pasv config (pasv_min_port/pasv_address), credentials mapped to the FTP_*
env set the server boot-freezes; the e2e exercises backup→FTP→restore full
loop and ALSO asserts the skip path (suite skips silently without env —
standard node --test skip). DEPLOY.md gains `## 21` FTP section (env table +
recipe + R-3/R-4 deviations) in the SAME commit (D-03).
Note: `docs/DEPLOY.md` §20 at :1725 is the S3 template.

## 7. Audit funnel

New audited mutations (all ride auditBackupTask, server.js:9180 precedent):
`backup_ftp_probe_ok`, `backup_ftp_probe_failed`,
`backup_probe_refused:ftpNotConfigured`, `backup_probe_refused:backupManageRequired`
(shared key exists), `backup_task_refused:ftpProbe:<key>`. Upload success /
failure ride the EXISTING run-event + notify funnel (handleBackupTaskOutcome
transition gate untouched — SC-4).

## 8. Pitfalls

1. **Byte-identity trap in the loop generalization**: the s3 arm must remain
   textually-recognizable (destination-registry-gate pins the raw slice branch
   and single `uploaded = 1` site). Generalize by dispatching on the
   descriptor, NOT by rewriting the s3 arm.
2. **Double-verify divergence**: ftp uses SIZE+sidecar (R-4); do NOT reuse the
   S3 `downloadToStaged` read-back for ftp (would double the transfer and
   contradict the documented deviation).
3. **NOOP interplay**: 97's 60s keep-alive runs on the control channel during
   long uploads — client-owned; do not add pipeline-level timers.
4. **Staged cleanup on ftp failure**: the loop's catch must NOT rmStaging (the
   local archive is published) — the existing `failedUploads` break-posture
   already guarantees this; the ftp arm must not introduce its own cleanup
   beyond the client's temp file (fetchToStaged already temp-rm's on mismatch).
5. **Secrets**: 97 scrub covers client-side; the route layer adds nothing that
   logs config; audit detail carries only `result.key`.
6. **PUT-path parity**: probe-at-save exists on BOTH create (:9135) and edit
   (:9289) — clone into both; missing one breaks the 400-refusal parity.
7. **`deleteFailed` semantics**: ftp has no delete-failed analog that maps to
   "accept with warning" — DELE marker failure = `ok:false` (hard refuse),
   documented in the probe route comment; DEPLOY.md notes it.

## 9. Validation Architecture

| Layer | File | Gate |
|---|---|---|
| Unit: ftp install closure (R-2 manual exclusion, task gate) | test/backup-ftp-wiring.test.mjs (NEW, source-slice idiom) | static pins |
| Probe route: guard chain + audit tokens | same file, slice assertions | static pins |
| Toggle/payload: backup.js:522-twin + actions.js gates | same file | static pins |
| i18n ×5: ftp keys present+used, dead-key gate | `npm run build` | build gate |
| e2e full loop: VSFTPD_TEST_URL env-gated, skip-when-absent | test/backup-ftp-e2e.test.mjs (NEW) | opt-in |
| Byte-identity regression: destination-registry-gate + sigv4 + backup suites | existing | full suite |
| Baseline | `npm test` | 2532+ tests / 2 documented failures |

Req→test: FTP-02 → wiring slices + e2e · DEST-03 → probe route slices ×
(refusal keys ×5) · TEST-01 → e2e recipe + DEPLOY.md §21.

## Open Questions (RESOLVED)

1. RESOLVED: generalize the loop body via descriptor dispatch; s3 arm
   textually preserved (Pitfall 1) — ftp verify = SIZE+sidecar per R-4.
2. RESOLVED: ftp manual runs NEVER upload (R-2) — closure returns null for
   taskId-less runs; `manualPrefix` consumed only by the probe marker.
3. RESOLVED: probe marker lives under `backup-ftp/` (the declared 96
   manualPrefix), STOR+DELE; DELE failure = hard refuse (no deleteFailed
   accept-with-warning analog; documented in route comment + DEPLOY.md).

## RESEARCH COMPLETE

1. Upload loop (backup.js:852-900) is descriptor-iterated but S3-hardcoded inside — 98 generalizes per-destination body, s3 arm byte-preserved.
2. ftp flag write `ftp_uploaded = 1` lands in the ftp success block only (one site, :881 posture).
3. OQ-3 composition already live at :894-899 — single ftp failure keeps raw sliced message; NO edit needed there.
4. R-2: ftp install closure returns null for manual runs (invert S3's D-88-4 leg).
5. Probe route clone of :9349-9372 + probe-at-save twins at :9135 (create) AND :9289 (edit).
6. probeFtp (ftp.js:583-594) already returns keyed shape + httpWarning (R-3) — zero client work.
7. Toggle: backup.js:522 / actions.js:5103/:5156/:5219/:5263 / api.js:34/:152/:219 — ftp twins; key `page.backup.ftpToggle` + probe/refusal keys ×5 same commit.
8. Restore: ftp twin gates at restore.js:2069/:2300 with client fetchToStaged; badge destLocation (server.js:3918-3925) already done.
9. e2e: VSFTPD_TEST_URL clone of MinIO recipe (test/restore-s3-e2e.test.mjs header pattern); DEPLOY.md §21 same commit.
10. Audit tokens enumerated (§7); handleBackupTaskOutcome untouched (SC-4).
