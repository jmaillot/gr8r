---
phase: 88-s3-destination
verified: 2026-11-22T18:05:00Z
status: passed
score: 16/16 must-haves verified
covered_files:
  - export/s3.js
  - export/backup.js
  - server.js
  - src/pages/backup.js
  - test/backup-s3-sigv4.test.mjs
  - test/backup-s3-upload.test.mjs
  - test/backup-s3-e2e.test.mjs
  - docs/DEPLOY.md
  - .planning/phases/88-s3-destination/88-01-PLAN.md
  - .planning/phases/88-s3-destination/88-02-PLAN.md
  - .planning/phases/88-s3-destination/88-03-PLAN.md
  - .planning/phases/88-s3-destination/88-01-SUMMARY.md
  - .planning/phases/88-s3-destination/88-02-SUMMARY.md
  - .planning/phases/88-s3-destination/88-03-SUMMARY.md
covered_digest: "v2:sha256:b3cebd6331879d5b16bb6b1724e5b1e55f626701ec884a55dd2473bdd9e18d42"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 16/16
  gaps_closed: []
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "A signed single-PUT lands an object on a real S3-compatible endpoint and a signed GET streams it back byte-identical (MinIO e2e, SC-4 second leg)"
    test: "Run a local MinIO container, then MINIO_TEST_URL=http://127.0.0.1:9000 node --test test/backup-s3-e2e.test.mjs"
    expected: "All e2e tests pass: probe → PUT/GET roundtrip → multipart → verify → sidecar → download seam"
    why_human: "Requires a live MinIO service; the e2e suite is env-gated and skips without it — runtime SigV4 interop cannot be proven by file inspection"
human_verification:
  - test: "Run a local MinIO container, then MINIO_TEST_URL=http://127.0.0.1:9001 node --test test/backup-s3-e2e.test.mjs"
    expected: "All e2e tests pass — real MinIO accepts the hand-rolled SigV4 signatures (SC-4: golden vectors + MinIO e2e)"
    result: "PASS 2026-11-22 — executed against gr8r-minio-e2e (pgsty/minio:latest, ratified pin): 4/4 e2e tests green (probe → PUT/GET byte-identical → multipart across threshold → single-PUT small path → sidecar + download seam). RE-CONFIRMED 2026-11-22T18:05Z in re-verification: 4/4 green again on the current tree (post-0226f52b)."
    why_human: "Live S3-compatible service interop; env-gated suite skips without MINIO_TEST_URL"
---

# Phase 88: S3 Destination Verification Report

**Phase Goal:** Backups land on any S3-compatible bucket with the stored checksum verifiable after upload — SigV4 verified in an isolated loop before restore ever depends on it.
**Verified:** 2026-11-22T17:10:00Z
**Status:** PASSED (16/16 must-haves; the MinIO e2e leg was executed 2026-11-22 — 4/4 green against the ratified pgsty/minio pin)
**Re-verification:** Yes — after digest staleness caused by a non-phase-88 change (commit 0226f52b, OIDC_TRUST_TENANT_EMAIL). All prior conclusions re-confirmed on the current tree; no regressions.

## Re-Verification Delta (2026-11-22T18:05:00Z)

The only tree change since the initial verification is commit 0226f52b (OIDC_TRUST_TENANT_EMAIL, server.js + .env.example). Spot-check of the diff: the change is confined to the OIDC linking section of `handleApi` (server.js ~5902-5916) — `verifiedEmail` derivation only. Zero overlapping lines with S3/backup code paths (export/s3.js, export/backup.js, S3_* boot consts, probe routes, upload_failed writer seam are untouched). Diff grep for `s3|backup|upload|export` returns nothing.

Delta checks, all green:

| Check | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| Offline SigV4 + upload suites | `node --test test/backup-s3-sigv4.test.mjs test/backup-s3-upload.test.mjs` | 31 tests, 31 pass, 0 fail, 0 skip | ✓ PASS |
| i18n scan | `node scripts/i18n-scan.mjs` | exit 0 — 0 literals, 0 dead | ✓ PASS |
| MinIO e2e (re-executed, container gr8r-minio-e2e up on :9001, pgsty/minio ratified pin) | `MINIO_TEST_URL=http://127.0.0.1:9001 node --test test/backup-s3-e2e.test.mjs` | 4 tests, 4 pass, 0 skip (probe+download seam, byte-identical PUT/GET, multipart threshold, single-PUT small path) | ✓ PASS |
| OIDC delta blast-radius | `git show 0226f52b -- server.js` | OIDC section only (~5902); no S3/backup lines touched | ✓ CLEAN |

The human-verification item recorded below (MinIO e2e, 4/4 green 2026-11-22, ratified pin) was independently re-executed this run and remains green — the behavior-unverified caveat on Truth 1 is now closed by two direct runs. `covered_digest` recomputed by the orchestrator via `computeCoveredDigest` (v2, authoritative gsd-core build): the initially-recorded `v4:` value was never producible by this build (it only knows v1–v2, so it fail-closed as stale). The stored digest is now a real v2 fingerprint over the covered_files set; server.js's committed OIDC delta (0226f52b) is outside the phase's covered set and does not affect the phase verdict.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SigV4 signatures match AWS-documented golden vectors offline | ✓ VERIFIED | `test/backup-s3-sigv4.test.mjs` — AWS docs example vectors (GET/PUT with real payload hash, never UNSIGNED-PAYLOAD); 31/31 tests pass offline (`node --test` → 0 fail) |
| 2 | Keys with spaces/unicode/'/' URI-encoded per S3 rules with valid signatures | ✓ VERIFIED | URI-encoding tests in sigv4 suite, green; host-construction tests cover path-style + virtual-host + path prefix |
| 3 | RequestTimeTooSkewed → distinct `err.s3ClockSkew` keyed refusal (SC-3) | ✓ VERIFIED | `export/s3.js:265,276,367` — `<Code>` parse maps `RequestTimeTooSkewed: 'clockSkew'` → `err.s3ClockSkew` and probe key `s3ClockSkew`; covered by error-mapping tests in the passing suite |
| 4 | Probe (HeadBucket + write/delete marker) keyed; put-ok/delete-fail = warning not success (D-88-15) | ✓ VERIFIED | `export/s3.js` probe with `deleteFailed` warning key; server.js:8474-8477 refuses save on `!ok && key !== 'deleteFailed'`; MIN-01 NoSuchBucket class test green |
| 5 | Download seam: staged temp file, sha256 on the pipe, refuse on mismatch (SC-5) | ✓ VERIFIED | `downloadToStaged` in export/s3.js; consumed by export/backup.js:~794 (stream-back compare against stored hash, temp cleaned) — Phase 89 consumer ready |
| 6 | S3_* boot-frozen strict-token consts; invalid values boot-refuse | ✓ VERIFIED | server.js:205-262 — module-level consts, `S3_PATH_STYLE` strict boolean, boot throw on invalid; S3_REGION default us-east-1; no scheme guessing |
| 7 | Env unset → s3Enabled refused with keyed error; env set → boolean-only exposure, never endpoints/bucket | ✓ VERIFIED | server.js:8462 keyed refusal; server.js:5807 `s3Enabled: S3.enabled` boolean only in /api/config |
| 8 | Probe-at-save on task create AND update | ✓ VERIFIED | create: server.js:8473-8477; update: server.js:~8623-8628 (post-review fix, probe on edit with same refuse contract); audits `backup_s3_probe_ok/failed` |
| 9 | Schema: `backup_tasks.s3_enabled` additive; `backup_runs` status CHECK widened incl. `upload_failed`; dual-engine lockstep | ✓ VERIFIED | server.js:765, 888-924 (adapterEnsureColumn + table-rebuild idiom for the CHECK widening) |
| 10 | 5-locale parity for all s3 refusal keys | ✓ VERIFIED | `src/locales/{en,fr,nl,de,es}.json` each contain 10 s3 keys; `node scripts/i18n-scan.mjs` exit 0, 0 dead |
| 11 | Upload streamed memory-bounded: single PUT ≤512 MiB, serial 64 MiB parts above, ≤3 retries resuming from immutable staged file, AbortMultipartUpload on failure | ✓ VERIFIED | export/s3.js:441-442 (`S3_MULTIPART_THRESHOLD = 512*1024*1024`, `S3_PART_SIZE = 64*1024*1024`), abort wiring, per-part retry; mechanics tests in passing 31-test suite (min-04 cancellation-abort test green) |
| 12 | succeeded only after stream-back sha256 compare + sidecar upload; upload_failed keeps local archive | ✓ VERIFIED | export/backup.js:~750-810 — upload AFTER verify/publish (ratified slot), stream-back + sidecar compare, upload_failed path leaves published archive intact (distinct from generic catch that rmStaging) |
| 13 | upload_failed rides D-15/D-17 email gate as failed outcome | ✓ VERIFIED | server.js:3445-3453 — upload_failed event writes failed row via writer seam, feeding handleBackupTaskOutcome |
| 14 | D-19 payload carries uploading stage + partsDone/partsTotal; client render-only | ✓ VERIFIED | export/backup.js:779-782 (stage verbatim + progress events); src/pages/backup.js:303 renders s3Enabled toggle and parts progress, no client-side derivation |
| 15 | Manual Run-now archives upload under backup-manual/ with same lifecycle | ✓ VERIFIED | export/backup.js:3485-3486 (task_id NULL path) + `s3BackupKey` D-88-9 prefix |
| 16 | DEPLOY.md documents S3_* env pair, AbortIncompleteMultipartUpload lifecycle rule, plain-http caveat | ✓ VERIFIED (with note) | docs/DEPLOY.md:1658-1663 — S3_* table with plain-http warning + s3NoBucket guidance; §20 (plan truth says §19, content complete — numbering deviation only, ratified in 28ce304c) |

**Score:** 15/16 truths verified (1 present, behavior-unverified)

**Behavior-unverified:** Truth 1 (plan-01 tracer — signed PUT/GET roundtrip against real MinIO). Golden vectors prove the signature bytes; the e2e suite exists (test/backup-s3-e2e.test.mjs, env-gated via MINIO_TEST_URL with explicit skip honesty) but cannot be executed in this environment without a live MinIO. This is the SC-4 second leg and needs one human run of a single command.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `export/s3.js` | S3 client core (630 lines) | ✓ VERIFIED | signer, executor, probe, error mapping, upload executor, download seam; zero npm deps |
| `test/backup-s3-sigv4.test.mjs` | Golden vectors | ✓ VERIFIED | 217 lines, AWS-doc vectors, wired to signer |
| `test/backup-s3-upload.test.mjs` | Multipart/transport mechanics | ✓ VERIFIED | 591 lines, HTTP-sink based |
| `test/backup-s3-e2e.test.mjs` | MinIO e2e (env-gated) | ✓ VERIFIED (presence) | 152 lines, `maybeMinio` gate on MINIO_TEST_URL |
| `server.js` | config surface + migration + CRUD gate + probe routes | ✓ VERIFIED | wired — imports probeS3, reads s3_enabled, refuses+audits |
| `src/locales/*.json ×5` | s3 keys | ✓ VERIFIED | 10 keys each, parity |
| `src/pages/backup.js` | render-only stage/parts UI | ✓ VERIFIED | wired to API payload |
| `docs/DEPLOY.md` | operator docs | ✓ VERIFIED | §20 S3 subsection |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| export/s3.js signer | golden vectors | test/backup-s3-sigv4.test.mjs | ✓ WIRED | 31/31 green |
| `<Code>` parse | keyed refusals consumed by plans 02/03 | server.js fail(res, 400, key) + locale keys | ✓ WIRED | 5-locale parity, audits |
| download seam | Phase 89 restore | downloadToStaged export | ✓ WIRED | already consumed internally by backup.js stream-back verify |
| upload executor | immutable staged file | uploadArchive(s3Dest.config, destination, ...) | ✓ WIRED | publish rename precedes upload |
| runExport | D-19 partsDone/partsTotal | emitRunEvent progress | ✓ WIRED | src/pages/backup.js renders |
| upload_failed | email gate / handleBackupTaskOutcome | server.js:3445 writer seam | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| /api/config | s3Enabled | S3.enabled (boot-frozen env consts) | Yes | ✓ FLOWING |
| Task rows | s3_enabled | create/update body → INSERT/UPDATE | Yes | ✓ FLOWING |
| Run row | upload_failed status/error | emitRunEvent upload_failed → writer seam | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| i18n scan | `node scripts/i18n-scan.mjs` | exit 0, 0 dead literals | ✓ PASS |
| SigV4 + upload suites | `node --test test/backup-s3-sigv4.test.mjs test/backup-s3-upload.test.mjs` | 31 tests, 31 pass, 0 fail, 0 skip | ✓ PASS |
| MinIO e2e | env-gated; MINIO_TEST_URL absent | skipped by design (honest skip) | ? SKIP → human |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| scripts/*/tests/probe-*.sh | find → none declared | n/a | SKIPPED (no phase-declared probe scripts; suites above serve as the probe evidence) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| BKBCK-05 | 88-01, 88-02, 88-03 | S3-compatible destination via boot-frozen env creds, streamed memory-bounded uploads, stored checksum verifiable after upload | ✓ SATISFIED (behavior leg pending MinIO e2e run) | Truths 1-15; REQUIREMENTS.md:38, tracked "Phase 88" at :78 — no orphaned requirements |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (all phase files) | — | TBD/FIXME/XXX/PLACEHOLDER scan | — | Clean — no debt markers, no stub returns |

### Human Verification Required

### 1. MinIO e2e — signed PUT/GET roundtrip (SC-4)

**Test:** Start a local MinIO container, create a bucket, then run `MINIO_TEST_URL=http://127.0.0.1:9000 MINIO_TEST_BUCKET=<bucket> ... node --test test/backup-s3-e2e.test.mjs`.
**Expected:** All e2e tests pass — probe, single-PUT, multipart, stream-back verify, sidecar, download seam against real MinIO.
**Why human:** Requires a live S3-compatible service; the suite skips without the env and signature interop with a real server cannot be proven by file inspection. (Golden-vector leg of SC-4 is already machine-verified green.)

### Gaps Summary

No gaps. All code contracts from the automated_checks list verified directly in source: real-payload-hash signing (no UNSIGNED-PAYLOAD, enforced both in signer and as a refusal on stream bodies), ETag used only as protocol datum and never for integrity, 64 MiB parts / 512 MiB threshold with abort wiring, S3_* boot-frozen strict-token consts, probe-at-save on both create and update (post-review fix present), no secrets in rows/logs (error text sliced via s3SliceError), uploading stage after verify/publish with upload_failed preserving the local archive. The only outstanding item is the runtime MinIO e2e leg, which is env-gated by design.

---

_Verified: 2026-11-22T18:05:00Z (re-verification)_
_Verifier: the agent (gsd-verifier)_
