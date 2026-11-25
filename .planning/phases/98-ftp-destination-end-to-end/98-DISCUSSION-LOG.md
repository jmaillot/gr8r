# Phase 98 — Discussion Log

**Date:** 2026-11-25 · **Mode:** discuss (3 owner-selected areas + 2 derived)

| Area | Question | Ruling |
|---|---|---|
| Toggle UI placement | mirror S3 vs dedicated section | **D-01** mirror S3 toggle exactly, keys `ftp*` parallel to `s3*` |
| Probe route shape | dedicated mirror vs generic | **D-02** dedicated `POST /api/backup/tasks/ftp-probe`, guard-chain parity, generic deferred post-SMB |
| e2e recipe | env-gated now vs deferred | **D-03** `VSFTPD_TEST_URL` skip-when-absent + DEPLOY.md §FTP same commit |
| Pipeline slot + run truth | (derived, technical) | **D-04** after local publish+verify, one-site `ftp_uploaded = 1`, composed-prefix `upload_failed` reachable |
| Restore read-back | (derived, technical) | **D-05** 97 `fetchToStaged` as-is; badge flag made real |

Owner answers via question tool, 2026-11-25. CONTEXT.md locked with D-01..D-05.
