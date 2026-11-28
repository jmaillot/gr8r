---
phase: 104-restore-source-backend-source-param-probe-route
plan: 02
subsystem: restore-pipeline (server.js routes + backups list GET)
tags: [restore, probe, rsrc-03, sources, d-89-14, throttle, audit]
requires: [RSRC-03, R-4, D-89-14, GD-1..GD-8, 104-01 keyed refusal keys]
provides:
  - POST /api/backup/restore/probe { runId, source: s3|ftp|smb } — verbatim seam result, keyed refusals, dedicated restoreprobe|<uid> throttle (10/15min), CAP.RESTORE_USE ∥ CAP.BACKUP_MANAGE
  - sources[] per run on GET /api/backup/restore/backups (local first, registry order, enabled-only dormant-slot contract)
  - D-89-14 pin test (12 probe-seam call sites asserted inside config-save/probe-route handlers; list GET slice probe-free)
affects: [Phase 105 restore dialog source picker]
tech-stack:
  added: []
  patterns: [probe-funnel clone (Phase 98/100 idiom), flags-are-truth R-4, enabled-filters-display D-23, key-only audit detail (Pitfall 5/T-98-04)]
key-files:
  created: []
  modified:
    - server.js
    - test/restore-source-param.test.mjs
    - test/backup-prune.test.mjs
    - test/restore-preview.test.mjs
decisions:
  - "Probe route: NO destination-config enabled gate — a probe of a disabled/unreachable destination returns the seam's own keyed unreachable/auth class, which IS the availability answer (104-RESEARCH guard-table ruling); flags-not-mirrored is the only pre-seam refusal"
  - "Audit detail = result.key ONLY (target_name column), never config; audit tokens restore_probe_ok / restore_probe_failed:<source> / restore_probe_refused:<code>"
  - "sources[] implemented inline in the row map (additive spread arrays) — no helper, no new truth source; NOT added to preview (GD-8)"
  - "Route source enum restricted to s3/ftp/smb directly (GD-4) — parseRestoreSource's 4-value enum (incl. local) deliberately not used here; local probe 400s restoreSourceInvalid"
metrics:
  duration: ~50 min
  completed: 2026-11-28
status: complete
plan_head_before: e6cd54699fa5fab1040ae5a61d7eb9572d497cb1
plan_head_after: d69898c7cba5a5e3a5a09ea2ae30886d58f7aff3
commits: 3
actuals:
  tokens: 88000
  tasks: 3
  commits: 3
estimate:
  tokens: 70000
  tasks: 3
---

# Phase 104 Plan 02: Restore-Source Backend — Probe Route & sources[] Summary

A dedicated throttled availability-check POST (restoreprobe budget) probing the run's chosen mirror through the existing probeS3/probeFtp/probeSmb seams — never on GET, never mutating run state — plus server-derived `sources[]` on the restore backups list GET under the dormant-slot contract.

## What Was Built

1. **POST /api/backup/restore/probe** — verbatim clone of the ftp-probe funnel family (server.js, after the smb-probe route): sameOrigin → requireUser → dedicated `restoreprobe|<uid>` throttle (10/15min, consume-on-refusal D-89-22, SEPARATE from `backupprobe|`) → dual-role gate `CAP.RESTORE_USE ∥ CAP.BACKUP_MANAGE` (GD-1) → runId regex → flag-only row read → source enum restricted to s3/ftp/smb (GD-4; `local` → keyed restoreSourceInvalid) → flag≠1 → keyed `restoreSourceNotMirrored`; missing row → 404 `restoreArchiveMissing`. Per-source dispatch through the EXISTING seams (s3 → probeS3, ftp → probeFtp, smb → probeSmb with the family onError logWarn idiom) — results returned VERBATIM, no reshaping, no new wire protocol. NO destination-config enabled gate (unreachable IS the answer). Zero run-state mutation (T-104-06). Audit: `restore_probe_ok` / `restore_probe_failed:<source>`, detail = result.key ONLY (Pitfall 5/T-98-04); `restore_probe_refused:<code>` on refusals.
2. **sources[] on GET /api/backup/restore/backups** — per run, additive: `local` when fs.existsSync(backupsRoot()+filename) on a truthy filename, then s3/ftp/smb gated on flag===1 AND destination `.enabled` (dormant-slot contract, D-23; flags ARE the truth R-4). Raw flags, location, filename, sizeBytes, sha256, timestamps untouched. NOT added to preview (GD-8).
3. **Tests** (test/restore-source-param.test.mjs, 19 → 29): live fake-FTP seam ok path (marker STOR/DELE observed, verbatim shape incl. httpWarning, flags unchanged, key-only audit), dead-endpoint ftp unreachable, s3 ok through a live HTTP sink (HeadBucket + marker PUT/DELETE observed), s3+smb unreachable classes (smb carries NO httpWarning — R-3), keyed refusals incl. local (GD-4) + missing run, throttle-key separation (11th restore probe 429; backupprobe budget untouched), per-source audit tokens + no-credential audit rows, D-89-14 static pin (all 12 seam call sites inside config-save/probe-route handlers; list GET slice zero seams), sources[] full-order/dormant-slot/local-fs-truth/additivity cases.
4. **Pin updates** (deviation, see below): backup-prune SELECT count 11→12; restore-preview payload-shape key set gains `sources` (+ sources deepEqual assert).

## Verification (all executed, results quoted)

- Task 1 verify: `node --test --test-concurrency=2 test/restore-source-param.test.mjs && grep -c "restoreprobe" server.js` → **23/23 pass** (then), grep count **2**.
- Task 2 verify: `node --test --test-concurrency=2 test/restore-source-param.test.mjs test/backup-routes.test.mjs` → **41/41 pass**.
- Task 3 verify: param + goldens + backup-history-client + backup-prune + restore-preview → **103/103 pass**.
- Goldens: `node --test test/restore-source-resolution.test.mjs` → **16/16 pass**; `git diff --exit-code test/restore-source-resolution.test.mjs` → **clean**.
- Full suite `npm test` (final run): **2757 tests, 2724 pass, 2 fail** — french-typography + webhook-routes GET list, the documented pre-existing failures (webhook-events due.reminder did not fire this run; the two run-1 concurrency flakes — backup-scheduler sweep-overlap, 89-05 overwrite — passed). **Zero new failures.**
- Zero new deps: `git diff package.json package-lock.json` → **empty**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Stale structural pin] backup-prune SELECT-count pin 11 → 12**
- **Found during:** Task 3 full suite
- **Issue:** the pin counts every server.js SELECT line carrying `uploaded, ftp_uploaded, smb_uploaded`; the probe route's flag-only row read legitimately adds a 12th.
- **Fix:** count updated to 12 (comment documents the restore-probe SELECT); the `!checksum_ok` untouched count 8 → 9.
- **Files modified:** test/backup-prune.test.mjs
- **Commit:** d69898c7

**2. [Rule 1 - Stale structural pin] restore-preview list payload-shape pin gains `sources`**
- **Found during:** Task 3 full suite
- **Issue:** the pin deepEquals the exact sorted key set of a list-GET row; sources[] is additive per the plan's must_haves, so the golden-set pin needed the new key.
- **Fix:** `sources` added to the pinned key list + a deepEqual assert pinning `sources: ['local']` for that fixture; message documents RSRC-03/D-23.
- **Files modified:** test/restore-preview.test.mjs
- **Commit:** d69898c7

### Process notes (not deviations)

- **Task 1 "ok result (fake seam)" for ftp** realized with a minimal scripted mock FTP server (~60 lines, USER/PASS/TYPE/EPSV/STOR/DELE/QUIT only — same shape as test/backup-ftp-client.test.mjs's fakeFtp, stripped to the probe transcript); the test asserts the marker STOR/DELE appeared on the mock's transcript, proving the route hit the REAL probeFtp seam.
- **SMB ok/guest passthrough at the route level** is covered structurally (the route returns `json(res, 200, result)` verbatim — wiring-pinned by the funnel clone) plus the seam-level guest tests already in test/backup-smb-client.test.mjs (:924-985). A route-level guest case would need the full NBSS fakeSmb harness (a 400+-line protocol server) — out of proportion; the unreachable route case + verbatim-response contract pin the surface. The probe route's logInfo also carries the family's `(guest session)` marker.
- **Audit-no-leak asserts** narrowed to the config-bearing text fields (action/target_id/actor_name/actor_email/target_name/target_email): the audit row's `ip` column legitimately carries the client loopback (127.0.0.1), which is not config disclosure.

## Known Stubs

None.

## Threat Flags

None — the probe route implements exactly the plan's `<threat_model>` mitigations: T-104-04 (dedicated operator-keyed restoreprobe throttle + dual-role cap gate + flag precondition — no unauthenticated oracle), T-104-05 (audit detail = result.key only; test-pinned), T-104-06 (zero run-state mutation; flags-unchanged asserts on ok, refused, and failed probes), T-104-07 (sources[] operator-gated behind the existing RESTORE_USE ladder, filtered stricter than the raw flags). List GETs remain probe-free (D-89-14, static + behavioral pin).

## Commits

- 8bb81803 — feat(104-02): POST /api/backup/restore/probe — ftp path end-to-end
- cd2b8b7b — feat(104-02): s3 + smb probe branches + D-89-14 list-GET probe-free pin
- d69898c7 — feat(104-02): server-derived sources[] on the restore backups list GET

## Self-Check: PASSED

- server.js route + sources[] present ✓ (`grep -c restoreprobe server.js` → 2; backups GET carries sources)
- commits 8bb81803 / cd2b8b7b / d69898c7 present ✓ (3 = measured rev-list count from plan_head_before e6cd5469)
- golden file diff clean ✓ (16/16)
- zero new deps ✓
