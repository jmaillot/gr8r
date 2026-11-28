---
phase: 104-restore-source-backend-source-param-probe-route
plan: 01
subsystem: restore-pipeline (server.js routes + export/restore.js engine)
tags: [restore, source-param, keyed-refusals, rsrc-02, locales, golden-contract]
requires: [RSRC-02, R-4, R-5, GD-1..GD-8, Phase 103 resolveRestoreSource]
provides:
  - opts.source on resolveRestoreSource (explicit-source ladder override)
  - source param on all 6 restore call sites (preview/download query; verify-checksum + 3 trigger POST bodies)
  - keyed restoreSourceInvalid / restoreSourceNotMirrored refusals ×5 locales
  - test/restore-source-param.test.mjs (19 tests)
affects: [104-02 (probe route + sources[]), Phase 105 restore dialog]
tech-stack:
  added: []
  patterns: [structured-reason-helper + caller-owned envelopes, pre-lock synchronous validation (D-89-23 position), flags-are-truth (R-4)]
key-files:
  created:
    - test/restore-source-param.test.mjs
  modified:
    - export/restore.js
    - server.js
    - src/locales/en.json
    - src/locales/de.json
    - src/locales/es.json
    - src/locales/fr.json
    - src/locales/nl.json
decisions:
  - "Helper explicit path reuses the legs array's OWN gates (no duplicated gate expressions) — keeps the 103-02 once-only gate pins and the 96-02 ordered-scan count pins exact"
  - "Invalid-enum check placed BEFORE local-first (a bogus value never resolves anything); explicit-local success rides the existing local-first block, explicit-local missing returns 'missing' directly (GD-2)"
  - "Caller-owned refusal texts hoisted to shared NOT_RECOGNIZED_ERR / NO_SURVIVING_COPY_ERR module constants (wording unchanged, drift-proof)"
  - "Sync routes map the helper-side GD-5 refusal (flag=1, destination disabled) to the same keyed source family — never the default-path GONE_ALL envelope"
  - "Unit refusal branches ordered fetchFailed-first so the 103-02 800-char dropStagedTmp/failWith window pins hold"
metrics:
  duration: ~37 min
  completed: 2026-11-28
status: complete
plan_head_before: 13dd21551240debbed90eaeb37bf3f2ffe8f4ce3
plan_head_after: 93114390
commits: 3
actuals:
  tokens: 197000
  tasks: 3
  commits: 3
estimate:
  tokens: 95000
  tasks: 3
---

# Phase 104 Plan 01: Restore-Source Backend — `source` Param Summary

Explicit `source` (local/s3/ftp/smb) accepted on all 6 restore call sites, validated against the run's mirror flags before the ladder and before the restore lock, keyed refusals localized ×5, default (omitted-param) path byte-identical behind the goldens.

## What Was Built

1. **Helper (export/restore.js — resolveRestoreSource):** `opts.source` handling — invalid enum → structured `sourceInvalid` (before local-first, so a bogus value never resolves anything); explicit local → the existing local-first block, missing file → `reason:'missing'` DIRECTLY (GD-2, no registry walk); requested leg flag ≠ 1 → `sourceNotMirrored`; flag = 1 + config absent → `sourceNotMirrored` regardless of `disabledBehavior` (GD-5 — skip-mode divergence resolved for explicit source only); valid → ONLY the requested leg visited through the same staged seams / key derivations / mirrorMissing→clearMirrorFlag contract. The explicit path reuses the legs array's own gates — zero duplicated gate expressions, zero new `ftp_uploaded`/`smb_uploaded` mentions (103-02/96-02 count pins stay exact). err.code stays `restoreArchiveMissing` (golden contract); envelope text stays at callers.
2. **Routes (server.js):** preview + download read `?source=` (query), verify-checksum + restore + restore/instance + restore/overwrite read `body.source` (camelCase, GD-4). All validate synchronously AFTER the row read, BEFORE resolveRestoreSource and BEFORE claimRestoreLock (D-89-23 position — a refused trigger never consumes the lock). Keyed 400 `restoreSourceInvalid` / `restoreSourceNotMirrored` with per-family audit prefixes (`restore_refused:` / `backup_download_refused:` / `backup_verify_refused:`). Sync routes also map the helper's helper-side GD-5 answer to the same keyed family (never GONE_ALL). Omitted source → today's behavior verbatim; sha-mismatch RESULT semantics untouched.
3. **Units (export/restore.js):** runRestore / restoreInstanceUnit / restoreOverwriteUnit pass `opts.source` into the helper and map the structured reasons through their OWN keyed funnels (`failWith(keyed(...))` / `throw keyed(...)` — never a raw throw past the funnel, 89-05).
4. **Locales:** `err.restoreSourceInvalid` + `err.restoreSourceNotMirrored` added to en/de/es/fr/nl in the SAME commit as the first emitting fail() codes (GD-7 — commit 28ecace6).
5. **Tests:** test/restore-source-param.test.mjs — 19 tests: route refusals per family + audit tokens, pre-lock trigger refusal (re-issued refusal, never 409), engine single-leg selection, explicit+disabled in BOTH disabledBehavior modes, explicit-local no-fall-through, success through the REQUESTED leg via a fake S3 seam serving the real fixture archive, unit keyed mappings, ×5 locale presence.

## Verification (all executed, results quoted)

- Goldens: `node --test --test-concurrency=2 test/restore-source-resolution.test.mjs test/restore-source-param.test.mjs` → **34/34 pass** (16 golden + new), `git diff --exit-code test/restore-source-resolution.test.mjs` → **clean** (golden untouched).
- Task 3 verify: param + build-locales + catalogue + goldens together → **95/95 pass**.
- Full suite `npm test` (run 2): **2747 tests, 2744 pass, 3 fail** — exactly the documented pre-existing failures (french-typography, webhook-routes GET list, webhook-events due.reminder date-boundary). Run 1 showed 2 extra failures (backup-scheduler sweep-overlap, restore-overwrite 89-05 e2e) that pass in isolation and in run 2 → concurrency flakes, not regressions (documented per execution rule 4).
- Stage vocabulary: `grep "source_failed|source_unreachable|restore_stage" export/restore.js server.js` → **no matches** (frozen).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Sync routes leaked the helper's GD-5 refusal into the default GONE_ALL envelope**
- **Found during:** Task 3 matrix writing
- **Issue:** preview/download/verify-checksum's `src.ok === false` else-branches only handled `fetchFailed`/`disabled`/missing — a helper-side `sourceNotMirrored` (flag = 1, destination disabled, GD-5) would have answered the default-path 404 GONE_ALL envelope instead of the keyed source family.
- **Fix:** each sync route's else-branch answers `sourceInvalid`/`sourceNotMirrored` with the keyed 400 + family audit prefix before falling through to the default envelopes.
- **Files modified:** server.js
- **Commit:** 93114390

**2. [Rule 3 - Blocking] 103-02 structural pins conflicted with the first helper draft**
- **Found during:** Task 3 full suite
- **Issue:** the first helper draft duplicated the flag gates (`flag: ftp_uploaded === 1, config: configs.ftp` count 2 ≠ 1, ordering pin localCheck < s3Gate < ftpGate broken) and pushed the DR units' `dropStagedTmp()`/`failWith(keyed('restoreArchiveMissing'` beyond the 800-char window pins.
- **Fix:** helper restructured to reuse the single legs array for the explicit path (semantics identical); unit refusal branches reordered fetchFailed-first (branch order carries no behavioral difference — reasons are mutually exclusive).
- **Files modified:** export/restore.js
- **Commit:** 93114390

### Process notes (not deviations)

- Task 1's planned "preview source=ftp succeeds through the FTP leg" seed case was realized as the **engine-harness fake-S3 success test** (explicit source fetches through the REQUESTED leg with digest re-verified) — the harness has no live FTP destination; the fake-seam route is exactly what 104-RESEARCH.md's Golden Impact table prescribes ("engine-harness test with fake seams").
- Task 1's planned Task-3-content download/verify edits were briefly applied, then reverted before the Task 1 commit to keep the commit scoped to preview + helper + locales; re-landed in Task 2 as planned.

## Known Stubs

None.

## Threat Flags

None — no new trust-boundary surface beyond the plan's `<threat_model>` (T-104-01 mitigated: enum allow-list + flag validation before lock claim + helper re-validation as funnel-of-record; T-104-02 mitigated: keyed refusals carry code + generic text only).

## Commits

- 28ecace6 — feat(104-01): explicit restore source through the helper + preview route (helper + preview + locales ×5 + new test file)
- a7783d43 — feat(104-01): wire source into the remaining 5 call sites (pre-lock trigger validation + units)
- 93114390 — test(104-01): complete the explicit-source matrix + GD-5 route-level envelopes

## Self-Check: PASSED

- test/restore-source-param.test.mjs exists ✓
- commits 28ecace6 / a7783d43 / 93114390 present ✓ (3 = measured rev-list count from plan_head_before 13dd2155)
- golden file diff clean ✓
