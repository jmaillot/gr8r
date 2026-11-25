---
phase: 98
plan: 03
subsystem: backup-ui
tags: [backup, ftp, destinations, toggle, i18n, toast]
requires: [96-02 /api/config ftpEnabled server field, 98-02 ftpProbe response twins + err.ftp* family, 97 probeFtp keyed shape]
provides: [backupTaskFtp toggle row (D-01 mirror of S3), api.ftpEnabled state/getter/apply trio, actions.js four mirror sites (default/handler/hydration/payload), ftpProbe toast mapping incl. insecureTlsWarning emitter, i18n ×5 (ftpToggle + ftpProbe toasts + insecureTlsWarning)]
affects: [98-04 e2e vs vsftpd (UI leg now wired), Phase 100 SMB toggle clone]
tech-stack:
  added: []
  patterns: [D-01 exact mirror clone (row markup token-identical except names/keys), staged checkbox posture (no re-render), strict-boolean fail-closed payload gate, same-commit i18n ×5 with key-order parity, tErr keyed refusal toasts with unreachable fallback]
key-files:
  created: []
  modified: [src/pages/backup.js, src/actions/actions.js, src/core/api.js, src/locales/en.json, src/locales/fr.json, src/locales/nl.json, src/locales/de.json, src/locales/es.json, test/backup-ftp-wiring.test.mjs, test/error-codes.test.mjs, test/backup-history-client.test.mjs]
decisions:
  - "ftpProbe refusal keys toast via tErr over the 98-02 err.ftp* catalogue with toast.ftpProbeUnreachable fallback — only ftpProbeSuccess/ftpProbeUnreachable needed NEW toast.* keys"
  - "NO deleteFailed branch in the ftp toast block (hard-refusal parity with the 98-02 probe-at-save twins; DELE marker failure never reaches the client as a warning)"
  - "insecureTlsWarning allowlisted in error-codes.test.mjs as client-side-only — it is emitted by the ftpProbe toast mapping (R-3), never a server refusal code"
metrics:
  duration: 31m
  completed: 2026-11-25T14:09Z
status: complete
commits: 3
plan_head_before: a77c3c7d4135708d069e2eb1f8187b2cf3b88803
plan_head_after: d0af633c93dbd3bf2ca1cdb71f91c2589bb86a3d
actuals:
  tokens: 12000
  tasks: 3
  commits: 3
---

# Phase 98 Plan 03: FTP Toggle UI + Client Wiring Summary

The operator-facing FTP leg is live: the task editor renders a `backupTaskFtp` checkbox token-identical to the S3 row (immediately after it, render-gated on `api.ftpEnabled` from `/api/config`), form state round-trips through the four actions.js mirror sites (fail-closed strict-boolean payload), and save responses carrying `ftpProbe` toast via the s3Probe twin mapping — success, per-key refusals over the 98-02 err.ftp* catalogue, and the R-3 insecureTlsWarning on httpWarning. The 98-02 deferred key landed in THIS plan's emitting commit as required.

## What Was Built

- **src/pages/backup.js** — the ftp toggle row cloned exactly from the S3 row (D-01): same section, immediately after S3, `api.ftpEnabled ?` render gate, `data-in="backupTaskFtp"`, checked from `form.ftpEnabled`, label `page.backup.ftpToggle`. No destinations-section refactor; data-a pin 623 untouched (the checkbox is `data-in`, not `data-a`).
- **src/core/api.js** — ftpEnabled trio: state default `false` (fail-closed), `get ftpEnabled()`, and `/api/config` apply `state.ftpEnabled = !!r.data?.ftpEnabled` (V5 strict-boolean idiom), each beside its s3 analog.
- **src/actions/actions.js** — four mirror sites: form default `ftpEnabled: false`; `IN.backupTaskFtp` staged handler (no re-render, checkbox IS the state); edit hydration `ftpEnabled: task.ftp_enabled === 1`; payload `if (api.ftpEnabled) body.ftpEnabled = form.ftpEnabled === true`. Plus the ftpProbe toast twin beside the s3Probe block: `success` → toast.ftpProbeSuccess; ftpAuthFailed/ftpTlsFailed/ftpPassiveFailed/ftpPathNotFound/ftpQuotaExceeded → tErr over the existing catalogue with toast.ftpProbeUnreachable fallback; `unreachable` → toast.ftpProbeUnreachable; `httpWarning` → tErr('insecureTlsWarning') (R-3). NO deleteFailed branch.
- **src/locales/{en,fr,nl,de,es}.json** — `page.backup.ftpToggle` (Task 1 commit), `err.insecureTlsWarning` + `toast.ftpProbeSuccess` + `toast.ftpProbeUnreachable` (Task 2 commit, same-commit rule with the emitting code; fr uses typographic apostrophes).
- **test/backup-ftp-wiring.test.mjs** — 20 → 27 tests: toggle-row pin (position after S3, gate, key), api-trio pin, four-mirror-sites pin, ftpProbe-toast pin (per-key coverage + NO deleteFailed), locale ×5 pins, client↔server twin contract pin (body.ftpEnabled ↔ server reads).
- **test/error-codes.test.mjs** — insecureTlsWarning added to CLIENT_ONLY_ERR_CODES allowlist (client-emitted by design).
- **test/backup-history-client.test.mjs** — A.backupTaskSave byte windows 4200/4000 → 5600 (the ftpProbe twin block pushed refreshBackupTasks/refresh semantics past the old windows).

## Verification

- `node --test test/backup-ftp-wiring.test.mjs` — 27/27 green
- `node --test test/destination-registry-gate.test.mjs` — 10/10 green
- `npm run build` — exit 0 (dead-key + reverse-parity gates: every new key emitted, every emitted key translated)
- `npm test` — 2572 tests / 2542 pass / exactly the 2 documented pre-existing failures (fr-typography, webhook-routes GET list) + the known scheduler-overlap load-flake (backup-scheduler passes standalone 13/13, documented since v3.3)
- data-a pin 623 green in the full run (i18n-shell + i18n-toast suites pass)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] i18n key-order parity: ftpProbe toast keys inserted at diverging positions**
- **Found during:** Task 3 (catalogue key-order gate red)
- **Issue:** en placed toast.ftpProbeSuccess/Unreachable after s3ProbeHttpWarning; fr/nl/de/es placed them after s3ProbeUnreachable — positional drift broke the fr-order-mirrors-en gate.
- **Fix:** moved the two keys after s3ProbeHttpWarning in fr/nl/de/es.
- **Files modified:** src/locales/{fr,nl,de,es}.json
- **Commit:** d0af633c

**2. [Rule 2/3] Client-emitted key + byte windows: reverse-parity allowlist + widened test windows**
- **Found during:** Task 3 (error-codes + backup-history-client gates red)
- **Issue:** err.insecureTlsWarning is catalogued and emitted in actions.js only — the reverse-parity gate requires a client-side-only allowlist entry; the A.backupTaskSave test byte windows (4200/4000) predate the ftpProbe toast block and no longer reach refreshBackupTasks/s3Probe assertions.
- **Fix:** allowlisted insecureTlsWarning; widened both windows to 5600 with a comment.
- **Files modified:** test/error-codes.test.mjs, test/backup-history-client.test.mjs
- **Commit:** d0af633c

### Notes
- Wave-3 parallel sibling 98-04 interleaved its commits on main (2c6f56a1, 405bcf30) between this plan's commits — no file overlap; `plan_head_after` records this plan's last own commit (d0af633c), not shared HEAD.
- probeFtp CAN emit `deleteFailed` (warning) but the server's probe-at-save twins hard-refuse before it ever rides a 200 response — hence no deleteFailed toast branch, matching the plan's hard-refusal parity.

## Auth Gates

None.

## Known Stubs

None — the toggle, payload, and toasts are fully functional. (Real-vsftpd e2e + DEPLOY §21 are 98-04's deliverables, landed in its interleaved commits.)

## Threat Flags

None — body.ftpEnabled stays a strict boolean gated on api.ftpEnabled client-side (T-98-05 defense-in-depth; the server type-gate remains the enforcement point). Zero new dependencies (T-98-SC).

## Self-Check: PASSED

- FOUND: src/pages/backup.js (backupTaskFtp row), src/actions/actions.js (four sites + ftpProbe block), src/core/api.js (trio), 5 locale files (ftpToggle + ftpProbe toasts + insecureTlsWarning), wiring test at 27 tests
- FOUND commits: 21d093a3, 138ba780, d0af633c
