---
phase: 100-smb-destination-end-to-end-remote-prune
plan: 04
subsystem: backup-remote-prune
tags: [backup, rotation, prune, ftp, smb, audit, i18n]
requires: [100-01 (smbPathNotFound class), 100-02 (SMB upload arm + capability), 100-03 (client trio + probes)]
provides: [remote prune of rotated-out mirrors (ftp+smb), D-01 floor-guard, prune audit tokens, remote_pruned column + payload reveal, pruned badge, SMB_PORT env seam, test/helpers/mock-smb-server.mjs]
affects: [backup rotation pass, runs payload, backup history UI, DEPLOY §22 (plan 05 documents prune semantics + SMB_PORT)]
tech-stack:
  added: []
  patterns: [per-destination best-effort containment inside a rotation pass, not-found→success idempotent delete (TOCTOU-free), additive payload reveal via rest-spread, shared scripted SMB mock helper]
key-files:
  created: [test/backup-prune.test.mjs, test/helpers/mock-smb-server.mjs]
  modified: [server.js, db-adapter.mjs, src/pages/backup.js, src/locales/en.json, src/locales/fr.json, src/locales/nl.json, src/locales/de.json, src/locales/es.json, test/backup-smb-wiring.test.mjs, test/fixtures/backup-runs-legacy-golden.json]
decisions:
  - "SMB_PORT boot-frozen env const (default 445) added — the prune suite's client-port seam (research-sanctioned additive option; DEPLOY documents it in plan 05)"
  - "failed-prune audit detail rides the action column as backup_prune_failed:<dest>:<keyOrCode> (house T-87-08 convention, key-only per Pitfall 5); skipped token has NO dest suffix (OQ-2)"
  - "fakeSmb extracted verbatim to test/helpers/mock-smb-server.mjs with a creds override (domain: '' matches the real client's unset-domain) so the prune suite drives real idempotency/success scenarios"
  - "delete-set SELECT widened additively (uploaded/ftp_uploaded/smb_uploaded) — rotation suite stayed green without pin changes"
metrics:
  duration: ~2.5h
  completed: 2026-11-25
  tasks: 3
  files: 12
actuals:
  tokens: 45000
  tasks: 3
  commits: 4
status: complete
commits: 4
plan_head_before: 844d8846461e926df3ee7ff082809d0461215efb
plan_head_after: 5b0ad4f6461e926df3ee7ff082809d0461215efb
estimate:
  tokens: 84000
  tasks: 3
---

# Phase 100 Plan 04: Remote Prune (DEST-02) Summary

**One-liner:** Rotated-out backup runs' FTP/SMB mirrors are now best-effort pruned inside the rotation pass — D-01 sole-copy floor-guard on fresh rows, not-found→success idempotency, per-destination containment with D-03 audit tokens, a dual-engine `remote_pruned` column revealed additively through the runs payload, and a pruned badge in the Rotated-filter history.

## What Was Built

- **Task 1 (a2f7959e):** `remote_pruned integer not null default 0` dual-engine DDL (server.js SCHEMA + boot `adapterEnsureColumn` + db-adapter pg mirror), added to the three runs SELECTs (all=1 / manual / task); both strip lists untouched — the key rides `...pub` (byte-identity of existing keys pinned by the regenerated golden fixture, exactly one new key per run). `test/backup-prune.test.mjs` (NEW) pins DDL alignment, SELECT coverage, payload identity, and second-boot idempotency.
- **Task 2 (48a8f146):** the prune hook — delete-set SELECT widened additively (pin-neutral, rotation suite green unchanged); `pruneFtp`/`pruneSmb` wrappers (connect→delete, `ftpPathNotFound` / smb `pathNotFound` 0xc0000034 → already-pruned SUCCESS, TOCTOU-free); `pruneRunMirrors` runs immediately AFTER the rotation status commit + audit (D-05): D-01 `soleCopy = row.uploaded !== 1 && S3.enabled` computed per-run on the pass's fresh rows, per-destination try/catch as PRIMARY containment (failures logged, never fatal; `remote_pruned` stays 0 on failure — the badge never lies), keys mirror the upload arm exactly (`backup-task-<taskId>/<filename>`, manualPrefixes never), one-site success-only `remote_pruned = 1`, audits `backup_prune_ok:<dest>` / `backup_prune_failed:<dest>:<keyOrCode>` / `backup_prune_skipped:soleCopy`. Report shape unchanged.
- **Task 3 (ae9b1172):** `pruned` badge in statusCell, two-condition gate (`remote_pruned === 1 && status === 'deleted'`), never coupled to the location ternary; `page.backup.pruned` ×5 locales in the same commit (en "pruned" / fr "purgé à distance" / nl "extern opgeruimd" / de "remote gelöscht" / es "purgado en remoto").
- **5b0ad4f6:** explicit `return` in the prune audit helper — released the static-db-audit await-hygiene pin.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Golden fixture regenerated additively**
- **Found during:** Task 1 — the golden legacy GET (backup-routes) asserts byte-identity and `remote_pruned` rides `...pub` into the legacy payload.
- **Fix:** regenerated `test/fixtures/backup-runs-legacy-golden.json` via the sanctioned `GOLDEN_CAPTURE=1` cell; diff is exactly `remote_pruned: 0` added per run, no existing key changed.
- **Commit:** a2f7959e

**2. [Rule 3 - Blocking] `SMB_PORT` boot-frozen const added**
- **Found during:** Task 2 — `SMB.config()` hard-coded port 445, so no test could reach an in-process SMB mock (the release assert pins 445).
- **Fix:** `SMB_PORT` env const (default 445) feeding `SMB.config()`; the wiring pin updated to pin `port: SMB_PORT`. Research-sanctioned additive option; documented in DEPLOY by plan 05.
- **Commit:** a2f7959e

**3. [Rule 3 - Blocking] `fakeSmb` extracted to a shared helper**
- **Found during:** Task 2 — the prune suite needs the scripted SMB mock (idempotency + success scenarios); it lived inline in the wiring test.
- **Fix:** moved verbatim to `test/helpers/mock-smb-server.mjs` (exports `fakeSmb` + `SMB2_COM`), with a creds override so tests can match the real client's unset-domain NTLM derivation (`domain: ''`).
- **Commit:** a2f7959e / 48a8f146

**4. [Rule 1 - Bug] Prune audit helper failed the static await-hygiene gate**
- **Found during:** full-suite gate — `static-db-audit` requires every `db.run(` prefix to end in await/return; the arrow-expression helper read as an un-awaited call.
- **Fix:** explicit `return` block form. Rotation + prune suites re-verified.
- **Commit:** 5b0ad4f6

## Verification

- `node --test test/backup-prune.test.mjs` — 10/10 green (floor-guard matrix: sole-copy never deleted + 2 skipped audits / no-S3 open guard both ok; idempotency DELE-550 + 0xc0000034 → prune_ok; containment: unreachable mirrors → 2 keyed failed audits, rotation proceeds, report shape intact; key shape mirrors the upload arm; payload identity; badge gate; DDL idempotency).
- `node --test test/backup-rotation.test.mjs` — 12/12 green (widened SELECT pin-neutral).
- `node --test test/backup-smb-wiring.test.mjs` — 23/23 green (refactored import; port pin updated).
- `npm run build` + i18n suites green; `npm test` — 2651 tests / 2622 pass / exactly the 2 documented pre-existing failures (fr-typography, webhook-routes GET list). One unrelated concurrency flake observed once (`restore-overwrite` outbox claim count, pass standalone and on the next full run).

## Known Stubs

None — no stub patterns introduced.

## Threat Flags

None — no security surface beyond the plan's threat model; T-100-07/08/09 mitigations are implemented and test-pinned (sole-copy rows never deleted; audit detail = keyed code only; per-destination containment with rotation proceeding).

## Self-Check: PASSED

All 4 commits verified in git log (a2f7959e, 48a8f146, ae9b1172, 5b0ad4f6); both created files exist on disk; SUMMARY written at `.planning/phases/100-smb-destination-end-to-end-remote-prune/100-04-SUMMARY.md`.

