# Phase 88: S3 Destination — Context

**Phase:** 88 (S3 Destination) · v3.3 Instance Operations — Backup, Restore & Roles
**Date:** 2026-11-22
**Status:** complete
**Feeds:** 88-RESEARCH, 88-PLAN (gsd-phase-researcher, gsd-planner)

<domain>
Backups land on any S3-compatible bucket (AWS S3, MinIO, Backblaze B2) via a hand-rolled SigV4 client on Node stdlib (zero npm deps, D-33-11) — streamed memory-bounded uploads, post-upload checksum verification, boot-frozen env credentials, probe-at-save keyed refusal, and the restore-direction download seam Phase 89 (BKRST) consumes. The archive format (86 freeze) and the run pipeline (87) are consumed unchanged.
</domain>

<canonical_refs>
- `docs/DEPLOY.md` — deployment surface; §19 (backup archive location/BACKUPS_DIR) gains the S3 env-pair section this phase; env var docs follow the VAPID §16 pattern.
- `.planning/phases/86-export-core-gr8r-backup-v1/86-CONTEXT.md` — frozen archive format, manifest schema, checksum canonical statement, run pipeline + D-19 status payload, D-16 frozen API surface.
- `.planning/phases/87-scheduler-tasks-run-history-rotation/87-CONTEXT.md` — task schema (cron/tz/retention/last_notified_state), D-15/D-17 transition-email gate, D-11 manual-archives-never-rotated, writer seam.
- `.planning/REQUIREMENTS.md` — BKBCK-05 (this phase), D-33-3/D-33-11 (destinations v1, zero npm deps).
</canonical_refs>

<prior_decisions>
## Project-Level
- **D-33-3:** Destinations v1 = local mapped volume + S3-compatible (AWS/MinIO/B2). SMB/FTP deferred to v2.
- **D-33-11:** Zero new npm dependencies — S3 client hand-rolled on Node stdlib.
- **D-33-12:** Backup encryption at rest ratified out of scope.

## From Phase 86
- Destination interface frozen in the run pipeline; `destination_cfg = config-not-credentials` (secrets never in task rows).
- D-19 run-status payload is render-only client-side; stage labels come verbatim from the server.
- D-16: `/api/backup/runs` API surface frozen.
- Archive filenames: `backup-task-…`/`backup-instance-…`/`backup-workspace-…`/`backup-project-…` + `.sha256` sidecar (87 UAT r3 added friendly slugs).

## From Phase 87
- D-11: manual Run-now archives are outside every task's rotation and never auto-deleted in v1.
- D-15/D-17: failure email = transition-gated via `last_notified_state`, recipients resolved at send time from instance_roles + Super Admins, recovery email on failed→recovered.
- GFS rotation operates per task over local archives; refuse-to-empty floor.
</prior_decisions>

<decisions>

### Destination model
- **D-88-1:** S3 beside local — **local-first doctrine**. The archive ALWAYS lands in `BACKUPS_DIR` (rotation, history, refuse-to-empty floor untouched), then S3 receives a streamed copy. An S3 failure never endangers the local archive. Rotation stays local-only in v1; bucket pruning is not the app's job. — **Reversibility:** reversible (S3-only tasks could come later).
- **D-88-2:** Single history row, upload in lifecycle — the run row records running→uploading→succeeded, with `succeeded` only when S3 confirms the checksum; a failed upload lands as **`upload_failed`** (local archive kept). No second row.
- **D-88-3:** `upload_failed` counts as a failed state for the D-15/D-17 transition-email gate — failure email on entering it, recovery email when a later run succeeds again.
- **D-88-4:** Manual Run-now archives (task_id NULL) upload to S3 too — same lifecycle. Rotation still never touches them (D-11 preserved).
- **D-88-5:** `uploading` is a first-class visible stage in the D-19 run-status payload (collecting→archiving→verifying→uploading→done) with multipart progress (parts done/total). The render-only client doctrine holds.

### Object layout & retention
- **D-88-6:** Per-task prefix keys — `backup-task-<taskId>/<filename>.tar.gz`; task-scoped listing and lifecycle rules natural.
- **D-88-7:** **The app never deletes S3 objects.** Rotation stays local-only (D-88-1); bucket pruning is the operator's job via S3 lifecycle rules, documented in DEPLOY.md with recommended rules per cadence. In-app S3 deletes = v2 capability.
- **D-88-8:** Checksum verifiability (SC-2) — upload a `<key>.sha256` sidecar object (mirrors the local sidecar convention) AND keep the whole-archive sha256 in the run row; post-upload verification streams the uploaded object and compares against the stored sha256 (never trusts ETag).
- **D-88-9:** Manual archives land under `backup-manual/` prefix (no task id) — lifecycle rules can exempt the prefix, consistent with D-11's manual-archives-are-special stance.
- **D-88-10:** Minimal upload headers — Content-Type `application/gzip` + Content-Length; NO SSE/storage-class headers (D-33-12); bucket-level defaults apply untouched. Keeps the SigV4 canonical request minimal and provider-agnostic.

### Credential custody
- **D-88-11:** Single `S3_*` env pair per instance — `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_KEY`, `S3_REGION`, `S3_PATH_STYLE` — strict-token consts, boot-frozen like MAILER/TOTP. All tasks + manual uploads share it. Task rows never carry endpoint/keys. — **Reversibility:** one-way in the sense that env naming is a deployment contract; additive keys later are cheap.
- **D-88-12:** Per-task opt-in is a boolean `s3_enabled` column. Env pair set → toggle available; env unset → toggle hidden and create/edit refuses `s3Enabled` with a keyed refusal.
- **D-88-13:** Path-style PUT by default (MinIO/B2 need it; AWS accepts), `S3_REGION` defaults `us-east-1`, `S3_ENDPOINT` optional (absent = AWS native host). No provider auto-detection, no scheme guessing.
- **D-88-14:** `http://` endpoints allowed (LAN MinIO audience) with a probe-time warning surfaced to the operator + DEPLOY.md caveat; https recommended.

### Probe & failure semantics
- **D-88-15:** Probe-at-save (SC-1) = **write+delete marker**: upload a tiny object under a `.probe/` key then delete it, plus HeadBucket. Proves write permission and SigV4 correctness end-to-end — the exact operations uploads will use. Probe result keyed (success / unreachable / bad creds / clock skew / http warning).
- **D-88-16:** Upload failure = **in-run retry** with exponential backoff (≈3 attempts per part, per-part retry resumes from the immutable staged file — no re-read of local state), then `upload_failed`; the run row's error field carries the last attempt's error. Abort-on-failure for the multipart transaction (abort the pending parts) per roadmap SC-2.
- **D-88-17:** `RequestTimeTooSkewed` (SC-3) surfaces as a **distinct keyed refusal** (`err.s3ClockSkew`, ×5 locales) in probe responses and run rows — server clock drift is a classic self-host trap worth naming.
- **D-88-18:** Test posture (SC-4) — golden-vector SigV4 tests always run offline; MinIO e2e against a pinned MinIO version via **env-gated Docker MinIO** (pattern: existing PG matrix env-gated tests, skipped when env absent). Provider quirks re-checked at plan time (research flag from roadmap).

</decisions>

<code_context>
- Run pipeline + writer seam: `export/backup.js` (`runExport`, stages, staging dir, atomic rename, verifyStagedBackup) — the upload stage slots between verify and finalize or after finalize (planner decides, constrained by D-88-1/2/5).
- Boot-frozen strict-token env consts: MAILER/TOTP patterns in `server.js` (S3_* consts mirror them).
- Task schema + CRUD + keyed refusal funnel: `server.js` backup_tasks routes (87-01), `s3_enabled` column joins this migration.
- Transition-email gate: `last_notified_state` machinery (87-03) — `upload_failed` must ride the same gate.
- History card + D-19 payload rendering: `src/pages/backup.js` (render-only doctrine; add 'uploading' stage label + parts progress ×5 locales).
- Env-gated test pattern: `test/pg-matrix.test.mjs` (skip-when-env-absent) — template for the MinIO e2e.
- Sidecar convention: `<archive>.tar.gz.sha256` locally; `<key>.sha256` object in S3 (D-88-8).
</code_context>

<specifics>
- Multipart: serial 64 MiB parts above 512 MiB total (roadmap SC-2); single PUT below the threshold.
- Checksum: sha256 stored separately from ETag — ETag is never trusted for verification.
- Download seam (Phase 89 consumes): GET object → staged temp file → streaming-hash verification against the stored/sidecar sha256.
</specifics>

<deferred>
- In-app S3 object deletion (rotation-mirrored or lifecycle-managed) — v2.
- S3-only tasks (skip local disk entirely) — after Phase 89 proves downloads.
- Multi-profile S3 (several buckets/endpoints per instance) — v2; D-88-11 env naming is additive-friendly.
- SMB/FTP destinations — v2 (D-33-3).
- SSE/storage-class headers per upload — out of scope (D-33-12).
</deferred>

<discretion>
Areas the agent decided without asking (technical, per prior doctrine): exact retry backoff constants, probe key naming (`gr8r-probe/…`), SigV4 canonical-request implementation details, part-size buffer mechanics, test file layout, audit action names for probe/save events (follow the `backup_*` funnel convention).
</discretion>
