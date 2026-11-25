---
phase: 98
plan: 02
subsystem: backup-pipeline
tags: [backup, ftp, probe, i18n, audit]
requires: [98-01 FTP closure + FTP.config(), 97 probeFtp keyed shape, 88 s3 probe funnel (D-88-15)]
provides: [POST /api/backup/tasks/ftp-probe (verbatim S3 guard-chain clone + audit funnel), probe-at-save hard-400 twins (create + edit), ftp_enabled persistence (INSERT + UPDATE), err.ftp* i18n key family ×5]
affects: [98-03 UI toggle + ftpProbe toast mapping, 98-04 e2e vs vsftpd, Phase 100 SMB probe pattern]
tech-stack:
  added: []
  patterns: [guard-chain clone token-for-token, probe-at-save twin pairs, same-commit i18n ×5 beside the s3 family]
key-files:
  created: []
  modified: [server.js, test/backup-ftp-wiring.test.mjs, src/locales/en.json, src/locales/fr.json, src/locales/nl.json, src/locales/de.json, src/locales/es.json]
decisions:
  - "err.insecureTlsWarning deferred to 98-03's emitting commit — the error-codes reverse-parity gate refuses catalogued-but-emitted-nowhere keys (Task 3's keep-only-server-referenced-keys rule)"
  - "ftp probe-at-save has NO deleteFailed exemption — ANY !ok (marker DELE failure included) is a hard 400 'task was not saved' refusal, diverging from the S3 D-88-15 accept-with-warning (documented in the route comment)"
  - "fr ftp keys use typographic apostrophes (’) — the fr-typography gate stays at its pre-existing findings"
metrics:
  duration: 38m
  completed: 2026-11-25T14:01Z
status: complete
commits: 3
plan_head_before: 47facf57e48bf34bdfaa1e2b0288f38e3fed4639
plan_head_after: fb0ee75f
actuals:
  tokens: 960
  tasks: 3
  commits: 3
---

# Phase 98 Plan 02: FTP Probe Layer Summary

The FTP probe layer is live: POST /api/backup/tasks/ftp-probe clones the S3 probe funnel token-for-token (sameOrigin → requireUser → backupprobe throttle → CAP.BACKUP_MANAGE → FTP.enabled → probeFtp(FTP.config())), probe-at-save hard-refuses on BOTH create and edit, ftp_enabled persists through the INSERT and UPDATE paths, and the err.ftp* key family ships ×5 locales in the same commits as the emitting code.

## What Was Built

- **server.js** — `/api/backup/tasks/ftp-probe` POST route cloned verbatim from the S3 probe funnel with keyed+audited refusals (`backup_probe_refused:backupManageRequired` shared token, `backup_probe_refused:ftpNotConfigured`) and outcome audits `backup_ftp_probe_ok`/`backup_ftp_probe_failed` carrying `result.key` only (Pitfall 5); route comment documents the Pitfall-7 divergence (DELE marker failure = HARD refuse, no deleteFailed accept-with-warning analog). Probe-at-save twins: CREATE (`invalidFtpEnabled`/`ftpNotConfigured` refusals + `body.ftpEnabled === true && FTP.enabled` → probeFtp → hard 400 keyed `backup_task_refused:ftpProbe:<key>`) and EDIT (same block keyed/audited with the task id). `ftp_enabled` added to the task object, INSERT columns/bindings, and UPDATE SET/bindings beside `s3_enabled`; `backupTaskShape` comment notes it rides the `{ ...row }` spread. `ftpProbe` rides both save responses beside `s3Probe` with MIN-07 outcome-audit symmetry.
- **src/locales/{en,fr,nl,de,es}.json** — `err.ftpNotConfigured`, `err.invalidFtpEnabled`, `err.ftpAuthFailed`, `err.ftpTlsFailed`, `err.ftpPassiveFailed`, `err.ftpPathNotFound`, `err.ftpQuotaExceeded` placed beside the s3 family (all server-emitted → reverse-parity + dead-key gates green).
- **test/backup-ftp-wiring.test.mjs** — +7 static slice pins (20 total): route pathname/order after the s3 probe, guard-chain tokens matched against the s3 route text, audit funnel + key-only detail, BOTH twins (Pitfall 6), exactly-two deleteFailed-exemption sites (s3-only), persistence SQL/binding counts, response/audit symmetry.

## Verification

- `node --test test/backup-ftp-wiring.test.mjs` — 20/20 green
- `node --test test/destination-registry-gate.test.mjs` — 10/10 green (98-01 pins intact; s3 arm untouched)
- `npm run build` — exit 0 (dead-key gate)
- `npm test` — 2552 tests / 2525 pass / exactly the 2 documented pre-existing failures (fr-typography, webhook-routes GET list); membershipsOf/error-codes/i18n-locale suites green
- error-codes reverse-parity green after deferring the unused UI key

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] err.insecureTlsWarning tripped the error-codes reverse-parity gate**
- **Found during:** Task 3 (full suite)
- **Issue:** `err.insecureTlsWarning is catalogued but emitted nowhere` — it is a UI toast key (R-3) whose emitting tErr call site is 98-03's ftpProbe toast mapping; the plan's own Task-3 contingency ("keep ONLY keys referenced by this plan's server code in this commit — UI keys land with 98-03's emitting commit") resolves the Task-1 acceptance conflict.
- **Fix:** removed the key ×5; tracked below as deferred to 98-03.
- **Files modified:** src/locales/{en,fr,nl,de,es}.json
- **Commit:** fb0ee75f

**2. [Rule 1 - Bug] fr ftp keys would have added straight-apostrophe findings**
- **Found during:** Task 3 (fr-typography)
- **Fix:** typographic apostrophes (’) in the new fr values; the pre-existing findings list is unchanged.
- **Commit:** fb0ee75f

### Notes
- Plan line anchors had drifted ~60 lines from 98-01's edits; the structural anchors (S3 probe funnel, s3Probe blocks, INSERT/UPDATE SQL) matched exactly.
- The plan's Task-1 acceptance lists insecureTlsWarning ×5; per the Task-3 dead-key/reverse-parity gate rule it lands with 98-03 (see Deviation 1). Every other acceptance item is met verbatim.

## Auth Gates

None.

## Known Stubs

None in this plan's deliverables. Tracked for **98-03**: `err.insecureTlsWarning` (×5 locales) must be added in the same commit as the ftpProbe toast mapping that emits it; the toggle UI keys (`page.backup.ftpToggle` etc.) likewise belong to 98-03 per the i18n same-commit rule.

## Threat Flags

None — the route surface matches the plan's threat model: T-98-03 mitigated (verbatim guard chain incl. CAP.BACKUP_MANAGE + operator-keyed throttle, order slice-pinned), T-98-04 mitigated (audit detail = result.key only, pinned by slice; route body never touches credential consts).

## Self-Check: PASSED

- FOUND: server.js (ftp-probe route + twins + ftp_enabled persistence), 5 locale files (err.ftp* family), test/backup-ftp-wiring.test.mjs (20 tests)
- FOUND commits: 90184e2a, a83ba5ce, fb0ee75f
