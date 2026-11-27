---
phase: 98-ftp-destination-end-to-end
captured: 2026-11-25
status: locked
decisions: 5
---

# Phase 98 — Context: FTP Destination End-to-End

**Phase goal (ROADMAP):** An operator can enable FTP/FTPS mirroring per backup task and the full pipeline — upload, verify, probe, restore, badges — works against a real FTP server.

**Carried forward:** R-2 (manual Run-now stays local-only), R-3 (CA + FTP_INSECURE keyed warning, httpWarning parity), R-4 (SIZE + sidecar sha256 — documented deviation from S3 read-back), D-88 env-only custody, registry descriptor D-01/96, dormant-slot flags from 96-02, client D-01..D-04/97 (promise API, fetchToStaged in client, probeFtp exists). Standing: zero new deps, i18n ×5 same-commit, dual-engine lockstep, `membershipsOf` byte-gate, data-a pin 623, baseline 2532 tests / 2 documented pre-existing failures.

## Decisions

- **D-01:** The FTP toggle in the task editor MIRRORS the S3 toggle exactly — same section position (after S3), same confirmation helper at save, i18n keys `ftp*` parallel to the `s3*` family. No destinations-section UI refactor; SMB will clone this pattern in 100.
- **D-02:** Dedicated probe route `POST /api/backup/tasks/ftp-probe` mirroring the S3 probe route (server.js:9040): write+delete marker under the FTP manual prefix, typed error classes from 97, refusal-keyed ×5. Probe-at-save hard 400 refusal rides the SAME guard-chain as S3 ("task was not saved" parity). The generic `/probe {destination}` shape is deferred until SMB exists (two consumers before generalizing).
- **D-03:** e2e recipe = vsftpd docker, env-gated `VSFTPD_TEST_URL`, skip-when-absent, mirroring the MinIO recipe (`MINIO_TEST_URL`) — same file structure, same gate idiom. DEPLOY.md gains its FTP section (env table + recipe) in the SAME commit as the recipe.
- **D-04 (derived):** FTP upload lands AFTER local publish+verify in the pipeline slot (staged, local-first preserved, SC-1); success writes `ftp_uploaded = 1` at exactly one site following the 96-02 one-site-per-destination rule; failure → single terminal `upload_failed` naming FTP through the composed-prefix hook 96 made reachable, alerts via `handleBackupTaskOutcome` verbatim.
- **D-05 (derived):** Restore read-back uses the 97 client's `fetchToStaged` as-is (single-shot + sha256); badge already derives from `ftp_uploaded` via the 96-02 ordered scan — 98 only makes the flag real.

## Specifics

- Wiring points: registry install (server.js:3871 area, ftp slot exists dormant), `handleBackupTaskOutcome` transition gate untouched, probe guard-chain S3 at :9040 is the mirror source, RESTORE_LOCATION_KEYS already extended in 96 (labels land real values here).
- i18n: toggle copy + probe refusals + insecure-tls warning ×5 en/fr/nl/de/es, same commit as emitting code; data-a pin 623 must NOT move.
- e2e: backup→FTP→restore full loop vs real vsftpd; skip-when-absent gate test proves the skip path too.
- Baseline: 2532 tests / 2 documented pre-existing failures (fr-typography, webhook-routes GET list).

## Deferred Ideas

- Generic multi-destination probe route (post-SMB, v3.5+ revisit)

## Canonical refs

- .planning/phases/97-ftp-ftps-client-zero-dep/97-RESEARCH.md (client contract)
- .planning/phases/96-cross-destination-seam-generalization/96-RESEARCH.md (seam anchors)
- docs/DEPLOY.md §19-20 (S3 posture FTP sections mirror here)
