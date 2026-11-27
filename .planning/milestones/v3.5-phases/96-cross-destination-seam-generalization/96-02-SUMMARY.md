---
phase: 96-cross-destination-seam-generalization
plan: 02
subsystem: backup-export-seam
tags: [additive-ddl, dual-engine, flat-config, ordered-badge-scan, i18n, byte-identity]
requires: [destination-registry (96-01)]
provides:
  - 4 additive destination columns (ftp_enabled/smb_enabled on backup_tasks, ftp_uploaded/smb_uploaded on backup_runs) via adapterEnsureColumn, dual-engine lockstep, second-boot no-op proven
  - flat /api/config booleans ftpEnabled/smbEnabled (s3Enabled byte-identical)
  - ordered destLocation(r) badge scan (local > s3 > ftp > smb > missing) replacing 3 hardcoded ternaries
  - RESTORE_LOCATION_KEYS ftp/smb entries + page.restore.locFtp/locSmb ×5 locales
affects: [97-ftp-destination, 98-badge-config, 100-smb-destination]
tech-stack:
  added: []
  patterns: [additive ensureColumn after-rebuild ordering (Pitfall 3), dest-rest input stripping for payload byte-identity, source-slice static gate extension]
key-files:
  created: []
  modified:
    - server.js
    - db-adapter.mjs
    - src/pages/backup.js
    - src/locales/en.json
    - src/locales/fr.json
    - src/locales/de.json
    - src/locales/es.json
    - src/locales/nl.json
    - test/restore-preview.test.mjs
    - test/destination-registry-gate.test.mjs
decisions:
  - destLocation(r) placed in server.js beside the registry install (not export/backup.js) — it needs fs membership + backupsRoot and reads only run rows; the gate pins its ordered shape
  - flag columns added to the 4 history/restore SELECTs as forward-compat inputs, but STRIPPED from the published projections (Rule 1 fix) — D-05 golden byte-identity restored; phases 98/100 own their payload reveal
  - 96-01's known-trap reworded at authoring time (FTP_*/SMB_* never written in SQL block comments — the `*/` closes the comment early; second instance this phase after 96-01 hit the same SyntaxError)
metrics:
  duration: ~2h
  completed: 2026-11-25
status: complete
actuals:
  tokens: 76000
  tasks: 3
  commits: 4
  plan_head_before: 8386a7ed
  plan_head_after: 0b05562e
---

# Phase 96 Plan 02: Destination Data + Read Seams Summary

**One-liner:** The registry gained its data and read seams — 4 additive dual-engine columns (second-boot no-op proven by TDD test), flat `ftpEnabled`/`smbEnabled` /api/config booleans beside a byte-identical `s3Enabled`, and a shared `destLocation(r)` ordered scan (local > s3 > ftp > smb > missing) replacing the three hardcoded badge ternaries — with the new location labels landing ×5 locales in the same commit and the wave-0 gate extended to pin both the scan shape and the flat payload, so phases 98/100 each add exactly one registry entry, one column pair already in place, and one RESTORE_LOCATION_KEYS line.

## What Was Built

### Task 1 — Additive DDL (TDD) — commit 4de4726a
- RED: new test in test/restore-preview.test.mjs (clone of the 89-03 :422-459 no-op boot idiom) — pre-96 db gains all 4 columns at boot with default 0; legacy rows keep 0; second boot touches nothing.
- GREEN: `ftp_enabled`/`smb_enabled` beside `s3_enabled` in the backup_tasks SCHEMA; `ftp_uploaded`/`smb_uploaded` beside `uploaded` in backup_runs SCHEMA (defs byte-identical, Pitfall P-B); 4 `adapterEnsureColumn` calls placed AFTER the 88-2 sqliteOnly rebuild and AFTER the `uploaded` ensureColumn (Pitfall 3). No CHECK rebuild (nothing widens). `uploaded` untouched (D-03); columns dormant in 96 — no new write sites (Pitfall 1).
- 42/42 restore-preview + backup-tasks-api green.

### Task 2 — Flat config + ordered badge scan + i18n ×5 — commit 43cf7714
- `/api/config`: `ftpEnabled: !!(FTP_HOST && FTP_USER && FTP_PASSWORD)` and `smbEnabled: !!(SMB_HOST && ...)` as flat siblings after a byte-identical `s3Enabled` (D-02, T-96-03 mitigated: booleans only, no nesting).
- `destLocation(r)` shared helper in server.js: local fs membership first, then the ordered scan `uploaded===1→'s3'`, `ftp_uploaded===1→'ftp'`, `smb_uploaded===1→'smb'`, else `'missing'` (D-04/OQ-2). All three hardcoded badge ternaries replaced; existing runs (all flags 0) render exactly as before.
- The 4 history/restore SELECTs now also select the flag columns (forward-compat inputs for phases 98/100).
- RESTORE_LOCATION_KEYS gains `ftp: 'page.restore.locFtp'`, `smb: 'page.restore.locSmb'`; the two keys added to all 5 locale files in the SAME commit (i18n ×5 hard rule). No new data-a attributes — the 623 pin untouched.
- Gate extended with 2 tests: the ordered-scan pin (no hardcoded s3-only ternary may return) and the flat-config pin (no `destinations:{}` in the payload).

### Task 3 — Full-suite baseline gate
- S3 golden-vector + upload + xws-gate suites: 35/35 green (SC-1 closed; membershipsOf byte-gate green).
- Full `npm test`: **2503 tests** (2492 documented baseline + 8 gate tests from 96-01 + 2 new gate tests + 1 new boot test), **2 failures — both documented pre-existing**: fr-typography (D-05) and webhook-routes "GET list health" (documented webhook family). The family's third member (webhook-events "no double-fire") was flaky-green this run — consistent with the ~2500/3 documented flake set in 96-01-SUMMARY. Zero new failures.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SQLITE_SCHEMA mirror + golden byte-identity drift (2 NEW full-suite failures)**
- **Found during:** Task 3 (first full-suite run: 4 failures)
- **Issue:** (a) db-adapter.mjs SQLITE_SCHEMA (the pg boot parity mirror) did not carry the 4 new SCHEMA columns — the mirror test failed. (b) The new flag columns leaked into the published `/api/backup/runs` projections (`...pub` spread) — the golden legacy snapshot byte-identity gate failed.
- **Fix:** Mirror updated in lockstep; `ftp_uploaded`/`smb_uploaded` destructured OUT of the published objects at both projection sites (they remain destLocation inputs via the pre-spread row). Commit 0b05562e.
- **Files modified:** server.js, db-adapter.mjs
- **Commit:** 0b05562e

**2. [Rule 1 - Bug] SQL block-comment `*/` inside `FTP_*/SMB_*` (second occurrence of 96-01's documented trap)**
- **Found during:** Task 1 (boot probe)
- **Issue:** The SCHEMA comment "credentials stay in the boot-frozen FTP_*/SMB_* env pairs" closed the SQL block comment early — SCHEMA SyntaxError at boot.
- **Fix:** Reworded to "FTP/SMB env pairs" before any test run consumed it.
- **Commit:** folded into 4de4726a

**3. [Deviation - environment] Full-suite EADDRINUSE cascade (first Task-3 run: 19 failures)**
- A leaked test server held port 34371; 16 notif-i18n tests + restore-overwrite outbox test failed on `server did not start`/EADDRINUSE. All pass standalone (notif-i18n 16/16, restore-overwrite 24/24); the clean re-run shows only the 2 documented failures. Not a code defect; no fix committed.

## Known Stubs

None added by this plan — the columns and scan are dormant plumbing by design (D-05): no UI renders ftp/smb badges until phases 98/100 wire their clients, which is the plan's declared intent, not a stub.

## Threat Flags

None — /api/config gained two flat booleans only (T-96-03 mitigated, gate-pinned); badge scan is read-only over run rows (T-96-04 mitigated by the ordered-scan gate pin); T-96-SC: zero installs.

## Verification (all run)

- `node --test test/restore-preview.test.mjs test/backup-tasks-api.test.mjs` → 42/42 green
- `node --test test/destination-registry-gate.test.mjs` → 10/10 green (8 + 2 new)
- `node --test test/i18n-shell.test.mjs test/i18n-toast.test.mjs test/build-locales.test.mjs test/backup-history-client.test.mjs test/restore-preview.test.mjs` → 84/84 green (data-a 623 pin intact)
- `node --test test/db-adapter.test.mjs test/backup-routes.test.mjs` → 46 pass / 0 fail / 2 skipped (env-gated MinIO e2e — not provisioned, per plan)
- `node --test test/backup-s3-sigv4.test.mjs test/backup-s3-upload.test.mjs test/xws-gate.test.mjs` → 35/35 green
- `npm test` → 2503 tests, 2 failures (fr-typography + webhook-routes GET list — both documented pre-existing), 25 skipped
- `grep -c "adapterEnsureColumn('backup_tasks', 'ftp_enabled'" server.js` → 1 (likewise ×4 total)
- `grep -c "locFtp" src/locales/*.json` → 1 in each of the 5 files

## Self-Check: PASSED

- server.js, db-adapter.mjs, src/pages/backup.js, 5 locale files, test/restore-preview.test.mjs, test/destination-registry-gate.test.mjs — all present and committed.
- Commits 4de4726a, 43cf7714, 0b05562e exist on main.
