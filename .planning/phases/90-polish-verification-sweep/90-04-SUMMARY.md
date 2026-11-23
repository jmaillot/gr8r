---
phase: 90
plan: 90-04
subsystem: backup-scheduling
tags: [dst, cron, e2e, postgres, s3, dr-restore, deploy-docs, verification-sweep]
requires: [90-01, 90-02, 90-03]
provides:
  - test/dst-cron-boundaries.test.mjs (pure DST matrix on nextRunAt — 18 tests, no server boot)
  - test/backup-restore-fullcycle-e2e.test.mjs (env-gated PG+MinIO full cycle)
  - restoreInstanceUnit S3 fetching seam (DR restores uploaded-only archives)
  - DEPLOY.md §9 subsections: backup engines + NTP/clock posture
affects: [export/restore.js, server.js, docs/DEPLOY.md]
tech-stack:
  added: []
  patterns: [env-gated live-container e2e (dropPgSchema-before-boot), live-probe-then-pin test authoring, child-process fs-patch probe debugging, transition-day local-midnight seeding]
key-files:
  created:
    - test/dst-cron-boundaries.test.mjs
    - test/backup-restore-fullcycle-e2e.test.mjs
  modified:
    - export/restore.js
    - server.js
    - docs/DEPLOY.md
decisions:
  - D-90-18 verified with corrected US facts (live probe): the US ambiguous hour is 01:xx (transition 02:00 EDT → 01:00 EST), so a US 02:30 cron occurs exactly once — the earlier-of-two contract is pinned non-vacuously with explicit 01:30 probes (first EDT 05:30Z, never EST 06:30Z)
  - The full-cycle scenario rides the INSTANCE scope end-to-end (Rule 3): the DR route refuses non-instance archives (restoreTargetMismatch), so the single scenario's task and Run-now both use scope kind 'instance'
  - The staged S3 temp is dropped POST-commit — it must survive the D-89-30 in-tx re-hash (sha256File(archivePath)); a post-extract drop fails that re-hash with ENOENT on any S3-located archive
metrics:
  duration: 49m
  completed: 2026-11-23
status: complete
actuals:
  tokens: 8013
  tasks: 3
  commits: 3
commits: 3
plan_head_before: d7f5a07d7b1a537680d55ad340e27fcb4d6aea9d
plan_head_after: 14317a16
requirements-completed: [SC-4, SC-5]
coverage:
  - "must-have: DST boundaries hold (EU+US × spring/fall × 2026/2027, no 03:30 substitute, first fall-back occurrence, digest 08:00 control, localParts wall-time reads) → test/dst-cron-boundaries.test.mjs 18/18 green, 0 skips"
  - "must-have: full-cycle PG-parity e2e (task → run → S3 → local delete → s3 badge → preview → DR on PG → run report + zero sessions) → test/backup-restore-fullcycle-e2e.test.mjs 1/1 on live gr8r-pg-test:5433 + gr8r-minio-e2e:9001"
  - "must-have: e2e cleans before boot + skips cleanly + per-file only → dropPgSchema idiom, `const maybe = url ? test : test.skip`, file header discipline"
  - "must-have: DEPLOY.md NTP posture + engine distinction → docs/DEPLOY.md §9 'The two backup engines' + 'Timezone & clock posture (NTP)' subsections; grep gates chrony×3 / --backup non-heading"
  - "must-have: npm test full suite green (D-90-20) → 2359 pass / 2 known pre-existing failures / 24 skipped; 0 new failures"
---

# Phase 90 Plan 04: Verification Sweep — DST Matrix + Full-Cycle PG E2E + DEPLOY Trust Docs Summary

**One-liner:** 18-test DST boundary matrix on the pure cron contract (EU+US, spring+fall, 2026+2027, instants computed live through `nextRunAt` itself), one env-gated PG-parity e2e that drove the whole backup→S3→DR-restore cycle through the live containers — and exposed + fixed a real DR bug (uploaded-only archives were unrestorable) — plus the DEPLOY.md trust documentation (backup engines, NTP posture).

## What Was Built

### Task 1 — DST boundary matrix on the pure cron contract (D-90-18)

- `test/dst-cron-boundaries.test.mjs` — direct-import pure suite (no server boot, the `backup-cron.test.mjs` idiom) pinning `nextRunAt(cron, tz, fromMs)` (export/cron.js:135) with `resolveTz`/`localParts` wall-time reads (never offset math).
- Matrix: Europe/Paris + America/New_York × spring-forward + fall-back × 2026 + 2027, plus an `0 8 * * *` digest control firing on every transition day.
- **Live-probed first, pinned second:** every expected instant was computed through `nextRunAt` itself before being hard-coded — which corrected two plan-text assumptions: EU spring 2027's fire lands 2027-03-29 (transition day 03-28), and the US ambiguous hour is **01:xx**, not 02:xx (transition 02:00→01:00), so the US 02:30 case occurs once and the earlier-of-two semantics is pinned non-vacuously via explicit 01:30 probes.
- Seeds = transition-day local midnight (research Pitfall 5); spring-forward anti-case asserted (never a 03:30 substitute); EU fall-back asserts the FIRST (CEST 00:30Z) of two occurrences against the exact later instant.
- Verified: `node --test test/dst-cron-boundaries.test.mjs` — 18/18 pass, 0 fails, 0 skips.
- **Commit:** `4e2a27a3`

### Task 2 — Full-cycle PG-parity e2e + the DR S3 seam fix (D-90-17)

- `test/backup-restore-fullcycle-e2e.test.mjs` — env-gated (`POSTGRES_TEST_URL` + `MINIO_TEST_URL`, clean-skip idiom), ONE scenario against the live containers: backup task (instance scope, S3-enabled probe-at-save) → manual run → poll to done → local archive deleted → history badge `s3` from run-row truth → preview through the downloadToStaged stream-back seam (staging-empty rm-finally assert) → DR restore ON PG (Super Admin, `RESTORE-INSTANCE` phrase) → run report size_bytes + sha256 on the PG row → zero session rows post-commit (D-89-25) → initiator cookie 401s (live revocation proof).
- `dropPgSchema` before `startServer` (T-90-07, pg-matrix idiom); per-file execution only; never prints DSN values.
- **[Rule 1 — Bug] The DR unit could not restore an uploaded-only archive.** `restoreInstanceUnit` resolved only the local path and returned keyed `restoreArchiveMissing` when the local copy was rotated away, while its sibling `runRestore` pipeline had the 88-01 `downloadToStaged` seam. Survival-in-S3 was unreachable end-to-end for DR — the primary disaster-recovery scenario. Fix (mirrors the established sibling idiom exactly): local-first resolution, then the seam when `uploaded === 1 && opts.s3Config`, the throw routed through the `failWith` funnel (the restore_lock is never stranded — the 89-05 CR contract), and the DR route wires `s3Config: S3.enabled ? S3.config() : null` into the unit.
- **[Rule 1 — Bug] Staged-temp lifecycle:** the D-89-30 pre-commit verification re-hashes `sha256File(archivePath)` INSIDE the tx — the staged S3 temp must live through that re-hash. The drop is now POST-commit, with failure-path drops in the extract-failure, tx-failure, and outer catches.
- Debugging method (documented for future executors): the harness boots the server as a child process with stdout/stderr captured — server-side `console.*` is invisible unless dumped via `server.output()`. A temporary `fs.rmSync`/`fs.unlinkSync` patch (logging paths containing `restore-staging` with stacks) named the re-hash re-open; all probes removed before commit.
- Verified: e2e 1/1 on live containers (probe-free re-run); regression: restore-instance + restore-routes + restore-preview + restore-import 56/56; restore-s3-e2e (PG+MinIO) 1/1.
- **Commit:** `5c65d09a`

### Task 3 — DEPLOY.md trust documentation (D-90-21)

- `docs/DEPLOY.md` §9 gained two `###` subsections (matching the section's existing pattern, no renumbering):
  - **"The two backup engines"** — gr8r backup v1 (in-app, Phases 86-89): tar+gzip archives carrying DB dump + files/logos, sha256 at three levels, 5-field cron + IANA tz per task, per-task GFS retention, stream-back-verified S3 destination, run history, failure-transition emails to backup operators, DR restore (pre-restore snapshot, session revocation), the only engine supporting Postgres; the legacy `node server.js --backup` CLI documented as the one-shot SQLite-only escape hatch. Cross-references §19 (archive placement/volume) and §20 (S3 destination).
  - **"Timezone & clock posture (NTP)"** — chrony on the host (containers share the kernel clock), `chronyc tracking`/`timedatectl` verification, seconds-scale drift consequences (delayed/early fires, GFS rotation bucket misassignment), and the DST contract of the cron evaluator pinned by `test/dst-cron-boundaries.test.mjs`.
- Final gate (D-90-20): `npm test` — 2385 tests, **2359 pass / 2 fail / 24 skipped**; the 2 failures are the known pre-existing pair (french-typography Phase-88 S3 keys, webhook-routes health). Zero new failures.
- **Commit:** `14317a16`

## Deviations from Plan

**1. [Rule 1 - Bug] DR restore could not fetch an S3-located archive**
- **Found during:** Task 2 (the new e2e failed at the DR leg with `restoreArchiveMissing`)
- **Issue:** `restoreInstanceUnit` had no S3 fallback — an uploaded-only run (the survival-in-S3 norm) was unrestorable, while the sibling `runRestore` pipeline had the seam
- **Fix:** added the fetching idiom to the unit (local → `downloadToStaged` when `uploaded === 1 && opts.s3Config`), wired `s3Config` from the DR route, guarded the lock-release funnel, fixed the staged-temp lifecycle against the D-89-30 in-tx re-hash
- **Files modified:** export/restore.js, server.js
- **Commit:** 5c65d09a (with the proving e2e)

**2. [Rule 3 - Blocking] Scenario scope corrected to instance**
- **Found during:** Task 2 (planning)
- **Issue:** the plan text said task (project/workspace scope), but the DR route refuses non-instance archives (`restoreTargetMismatch`, server.js:9519 region)
- **Resolution:** the single scenario's task and Run-now both ride `scope { kind: 'instance' }` — the only scope that completes through the DR leg

**3. [Observation, not fixed] One-off concurrency flake in the first full-suite run**
- The first `npm test` run failed one 89-05 overwrite-outbox assertion (`restore-routes.test.mjs`); the suite passes standalone repeatedly (19/19 twice) and the second full-suite run had exactly the 2 known pre-existing failures. Artifact of `--test-concurrency=2` shared-state, same family as the known webhook flake. Logged here, not in deferred-items (non-reproducible in the gate run).

## Pre-existing Failures (NOT fixed, in deferred-items.md)

- `test/french-typography.test.mjs` — 6 fr.json D-05 breaches, all Phase-88 S3 keys
- `test/webhook-routes.test.mjs` — health 'active' vs 'failing' (env-dependent family)

## Known Stubs

None — both test files are fully wired (pure contract pins / live-container scenario) and both DEPLOY.md sections document shipped behavior.

## Commits

| Task | Commit | Subject |
|------|--------|---------|
| 1 | 4e2a27a3 | test(90-04): DST boundary matrix on the pure cron contract (D-90-18) |
| 2 | 5c65d09a | fix(90-04): DR restore fetches a rotated-away archive through the S3 seam + full-cycle PG-parity e2e |
| 3 | 14317a16 | docs(90-04): DEPLOY.md — backup engines explainer + NTP/clock posture (SC-5) |

## Self-Check: PASSED

- test/dst-cron-boundaries.test.mjs, test/backup-restore-fullcycle-e2e.test.mjs, docs/DEPLOY.md — FOUND on disk
- Commits 4e2a27a3, 5c65d09a, 14317a16 — FOUND in `git log d7f5a07d..HEAD` (3 commits over the plan ledger base)
- DST suite re-confirmed 18/18 pass / 0 fail at summary time
