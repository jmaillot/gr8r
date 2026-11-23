---
phase: 88-s3-destination
verified: 2026-11-23T19:22:09Z
status: passed
score: 16/16 must-haves verified
covered_files:
  - export/s3.js
  - export/backup.js
  - server.js
  - src/pages/backup.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/locales/nl.json
  - src/locales/de.json
  - src/locales/es.json
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
covered_digest: "v4:sha256:d24d6216b3ce7055a1733ccdd9cded821491ecce624279171097dce82c703f87"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 16/16
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Run a local MinIO container, then MINIO_TEST_URL=http://127.0.0.1:9000 node --test test/backup-s3-e2e.test.mjs"
    expected: "All e2e tests pass — real MinIO accepts the hand-rolled SigV4 signatures (SC-4: golden vectors + MinIO e2e)"
    result: "PASS 2026-11-22 — executed against gr8r-minio-e2e (pgsty/minio:latest, ratified pin): 4/4 e2e tests green (probe → PUT/GET byte-identical → multipart across threshold → single-PUT small path → sidecar + download seam). Carried into this freshness pass: git proves export/s3.js and test/backup-s3-e2e.test.mjs have ZERO commits since that execution (44a60b37..HEAD empty), so the recorded behavioral evidence is bit-identical-evidence for the current tree."
    why_human: "Live S3-compatible service interop; env-gated suite skips without MINIO_TEST_URL"
---

# Phase 88: S3 Destination Verification Report

**Phase Goal:** Backups land on any S3-compatible bucket with the stored checksum verifiable after upload — SigV4 verified in an isolated loop before restore ever depends on it.
**Verified:** 2026-11-23T19:22:09Z
**Status:** PASSED (16/16 must-haves on the live tree at HEAD b18462be)
**Re-verification:** Yes — MILESTONE-CLOSE FRESHNESS PASS. The prior report's `covered_digest` went stale because phases 89 (restore) and 90 (polish/verification sweep) touched shared surfaces (server.js, export/backup.js, src/pages/backup.js, docs/DEPLOY.md). This pass regenerates the report against the CURRENT tree with a fresh fingerprint. Full suites were NOT re-run — known pre-existing failures live in deferred-items.md (incl. the fr-catalogue french-typography keys, a Phase-88-locale DOCUMENTED pre-existing failure that does not implicate S3 behavior); per the freshness-pass contract only the phase's own fast test files plus seam greps are the evidence.

## Freshness Delta (2026-11-23T19:22:09Z, milestone v3.3 close)

Range inspected: 44a60b37 (tree at last verify) → HEAD b18462be — phases 89-06…90-04 + UAT fixes.

**Core engine untouched (git-identity proof):**
- `export/s3.js` — ZERO commits in the range. The 630-line S3 engine, its SigV4 signer, probe, error mapping, upload executor, and download seam are bit-identical to the tree on which the MinIO e2e ran 4/4 green (2026-11-22).
- `test/backup-s3-sigv4.test.mjs`, `test/backup-s3-upload.test.mjs`, `test/backup-s3-e2e.test.mjs` — ZERO commits in the range.

**Shared surfaces changed by 89-90 — S3 seams re-verified present at their new line numbers:**

| Seam | Old evidence | Live tree evidence | Status |
| ---- | ------------ | ------------------ | ------ |
| S3_* boot-frozen strict-token consts | server.js:205-262 | server.js:207-214 (S3_PATH_STYLE strict-token at :212-214) | ✓ INTACT |
| `s3Enabled` boolean-only exposure | server.js:5807 | server.js:6115 (`s3Enabled: S3.enabled`) | ✓ INTACT |
| Probe-at-save, create + update, keyed refuse | server.js:8473/:8623 | server.js:8782 (create) + :8936 (update); probe route :9007 | ✓ INTACT |
| `upload_failed` terminal-status CHECK widening | server.js:888-924 | server.js:959-994 (rebuild idiom, D-88-2) | ✓ INTACT |
| `upload_failed` writer seam → outcome gate | server.js:3445-3453 | server.js:3531-3539 | ✓ INTACT |
| Upload-after-verify slot + stream-back + sidecar | export/backup.js:~750-810 | export/backup.js:795-804 (`uploadArchive` :797, `downloadToStaged` :804) | ✓ INTACT |
| backup-manual/ prefix (D-88-9) | export/backup.js:3485 | export/backup.js:795 (`s3BackupKey`) | ✓ INTACT |
| Render-only stage/parts UI | src/pages/backup.js:303 | src/pages/backup.js:91-95 (verbatim `run.partsDone/partsTotal`, no client derivation) + :378 (s3Enabled toggle) | ✓ INTACT |
| DEPLOY.md S3_* table + lifecycle rule | docs/DEPLOY.md:1658-1663 | docs/DEPLOY.md:1707-1756 (S3_ENDPOINT plain-http warning :1707, secret :1710, AbortIncompleteMultipartUpload :1756) | ✓ INTACT |

**Phase-90 extension (informational, not a regression):** export/backup.js now also imports `getObject` from s3.js (:66) — the DR-restore consumer added by 5c65d09a ("DR restore fetches a rotated-away archive through the S3 seam"). This EXTENDS the Phase-88 download seam's consumer set; it does not modify the seam itself. Phases 89-03 (`uploaded=1` only after full S3 upload verification, 6584dba8) likewise builds ON the phase-88 contract, honoring it.

Delta checks, all green on the live tree:

| Check | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| Fast suites (phase's own) | `node --test test/backup-s3-sigv4.test.mjs test/backup-s3-upload.test.mjs` | 31 tests, 31 pass, 0 fail, 0 skip, 0 cancelled (255 ms) | ✓ PASS |
| i18n scan | `node scripts/i18n-scan.mjs` | exit 0 — 0 literals, 0 dead | ✓ PASS |
| S3 seam greps (table above) | grep over live server.js / export/backup.js / src/pages/backup.js / docs/DEPLOY.md | every seam present at shifted offsets | ✓ PASS |
| 5-locale parity (re-checked with exact key list) | node flatten across en/fr/nl/de/es | 10 s3 keys + backup-page s3 keys identical in all 5 (s3Toggle, statusUploadFailed, stageUploading, partsProgress, s3NotConfigured, invalidS3Enabled, s3ClockSkew, s3NoBucket, s3ProbeSuccess/DeleteFailed/Unreachable/BadCreds/HttpWarning, restore.locS3) | ✓ PASS |
| Core engine git identity | `git log 44a60b37..HEAD -- export/s3.js test/backup-s3-*.test.mjs` | empty — no commits | ✓ CLEAN |
| Fresh digest | `gsd_run query verification.fingerprint` over the 19 covered files | `v4:sha256:d24d6216b3ce7055a1733ccdd9cded821491ecce624279171097dce82c703f87` | ✓ COMPUTED |

Full `npm test` deliberately NOT run: known pre-existing failures are tracked in deferred-items.md and are out of scope for this freshness pass (per orchestrator contract). The fr french-typography locale keys are a documented pre-existing fr-catalogue failure — the S3 behavior surface is not implicated (the i18n scan itself exits 0 with 0 dead keys, and S3 key parity across all 5 locales is exact).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence (live tree) |
|---|-------|--------|----------------------|
| 1 | SigV4 signatures match AWS-documented golden vectors offline; signed PUT/GET roundtrip on real MinIO | ✓ VERIFIED | Golden vectors: `test/backup-s3-sigv4.test.mjs` (bit-identical since last run), 31/31 green today. MinIO e2e leg: 4/4 green 2026-11-22 (human verification result recorded in frontmatter) — evidence carried forward by git identity (zero commits to s3.js + e2e test since execution) |
| 2 | Keys with spaces/unicode/'/' URI-encoded per S3 rules with valid signatures | ✓ VERIFIED | URI-encoding tests in sigv4 suite, green on live tree |
| 3 | RequestTimeTooSkewed → distinct `err.s3ClockSkew` keyed refusal (SC-3) | ✓ VERIFIED | export/s3.js:265 (`RequestTimeTooSkewed: 'clockSkew'`), :192 (refusing UNSIGNED-PAYLOAD on stream bodies); file bit-identical |
| 4 | Probe (HeadBucket + write/delete marker) keyed; put-ok/delete-fail = warning not success (D-88-15) | ✓ VERIFIED | export/s3.js:337,361 (`deleteFailed` warning); server.js:9007 probe route; MIN-01 test green |
| 5 | Download seam: staged temp file, sha256 on the pipe, refuse on mismatch (SC-5) | ✓ VERIFIED | `downloadToStaged` in export/s3.js (bit-identical); consumed by export/backup.js:804 AND now phase-90 DR restore via `getObject` (backup.js:66) — consumer set grew, seam intact |
| 6 | S3_* boot-frozen strict-token consts; invalid values boot-refuse | ✓ VERIFIED | server.js:207-214 live |
| 7 | Env unset → s3Enabled refused with keyed error; env set → boolean-only exposure | ✓ VERIFIED | server.js:8766-8770 (boolean check + keyed refusal), :6115 (boolean-only exposure) |
| 8 | Probe-at-save on task create AND update | ✓ VERIFIED | server.js:8782 (create) + :8936 (update), same refuse contract |
| 9 | Schema: `backup_tasks.s3_enabled` additive; `backup_runs` CHECK widened incl. `upload_failed` | ✓ VERIFIED | server.js:782, :792, :959-994 live |
| 10 | 5-locale parity for all s3 refusal keys | ✓ VERIFIED | Exact key-set match across en/fr/nl/de/es (13 s3 keys + backup-page keys); i18n scan exit 0 |
| 11 | Upload streamed memory-bounded: single PUT ≤512 MiB, serial 64 MiB parts above, ≤3 retries, AbortMultipartUpload on failure | ✓ VERIFIED | export/s3.js:441-442 (bit-identical), min-04 cancellation-abort + min-05 stream-destroy + min-06 Complete-200-Error tests green today |
| 12 | succeeded only after stream-back sha256 compare + sidecar upload; upload_failed keeps local archive | ✓ VERIFIED | export/backup.js:795-804 live |
| 13 | upload_failed rides D-15/D-17 email gate as failed outcome | ✓ VERIFIED | server.js:3531-3539 live |
| 14 | D-19 payload carries uploading stage + partsDone/partsTotal; client render-only | ✓ VERIFIED | export/backup.js progress events; src/pages/backup.js:91-95 render verbatim, :378 toggle |
| 15 | Manual Run-now archives upload under backup-manual/ with same lifecycle | ✓ VERIFIED | export/backup.js:795 (`s3BackupKey`, D-88-9 prefix) live |
| 16 | DEPLOY.md documents S3_* env pair, AbortIncompleteMultipartUpload lifecycle rule, plain-http caveat | ✓ VERIFIED | docs/DEPLOY.md:1707-1756 live (numbering deviation §19→§20 ratified in 28ce304c) |

**Score:** 16/16 truths verified (0 present, behavior-unverified — Truth 1's behavior leg closed by the recorded 2026-11-22 MinIO run, carried by git identity)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `export/s3.js` | S3 client core (630 lines) | ✓ VERIFIED | bit-identical since last verify — zero commits in range |
| `test/backup-s3-sigv4.test.mjs` | Golden vectors | ✓ VERIFIED | bit-identical; 31/31 green today |
| `test/backup-s3-upload.test.mjs` | Multipart/transport mechanics | ✓ VERIFIED | bit-identical; green today |
| `test/backup-s3-e2e.test.mjs` | MinIO e2e (env-gated) | ✓ VERIFIED (presence + recorded run) | bit-identical; 4/4 green 2026-11-22, carried by git identity |
| `server.js` | config surface + migration + CRUD gate + probe routes | ✓ VERIFIED | wired on live tree — all seams at shifted offsets (see delta table) |
| `src/locales/*.json ×5` | s3 keys | ✓ VERIFIED | exact parity re-verified today |
| `src/pages/backup.js` | render-only stage/parts UI | ✓ VERIFIED | wired on live tree (:91-95, :378) |
| `docs/DEPLOY.md` | operator docs | ✓ VERIFIED | §20 S3 subsection live (:1707-1756); phase-90 additions coexist |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| export/s3.js signer | golden vectors | test/backup-s3-sigv4.test.mjs | ✓ WIRED | 31/31 green on live tree |
| `<Code>` parse | keyed refusals consumed by plans 02/03 | server.js fail(res, 400, key) + locale keys | ✓ WIRED | 5-locale parity re-verified; probe route :9007 |
| download seam | restore consumers (Phase 89 + 90 DR) | downloadToStaged + getObject exports | ✓ WIRED | backup.js:66 imports both; internal stream-back consumer at :804 |
| upload executor | immutable staged file | uploadArchive(s3Dest.config, destination, key, sha256, …) | ✓ WIRED | backup.js:797, publish rename precedes upload |
| runExport | D-19 partsDone/partsTotal | emitRunEvent progress | ✓ WIRED | src/pages/backup.js:91-95 renders |
| upload_failed | email gate / handleBackupTaskOutcome | server.js:3531 writer seam | ✓ WIRED | live |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| /api/config | s3Enabled | S3.enabled (boot-frozen env consts) | Yes | ✓ FLOWING |
| Task rows | s3_enabled | create/update body → INSERT/UPDATE | Yes | ✓ FLOWING |
| Run row | upload_failed status/error | emitRunEvent upload_failed → writer seam (:3531) | Yes | ✓ FLOWING |
| Restore list (phase-90 consumer) | backup_runs.uploaded / uploaded status | run-row truth (:9326 `uploaded = 1` leg) | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| SigV4 + upload suites | `node --test test/backup-s3-sigv4.test.mjs test/backup-s3-upload.test.mjs` | 31 tests, 31 pass, 0 fail, 0 skip | ✓ PASS |
| i18n scan | `node scripts/i18n-scan.mjs` | exit 0, 0 dead literals | ✓ PASS |
| MinIO e2e | env-gated; MINIO_TEST_URL absent in this run | skipped by design (honest skip) — recorded 4/4 PASS 2026-11-22 carried by git identity | ✓ CARRIED |
| Full npm test | deliberately not run | pre-existing failures in deferred-items.md, out of scope for freshness pass | ⊘ EXCLUDED |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| scripts/*/tests/probe-*.sh | find → none declared | n/a | SKIPPED (no phase-declared probe scripts; suites above serve as the probe evidence) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| BKBCK-05 | 88-01, 88-02, 88-03 | S3-compatible destination via boot-frozen env creds, streamed memory-bounded uploads, stored checksum verifiable after upload | ✓ SATISFIED | Truths 1-16 on live tree; REQUIREMENTS.md tracked "Phase 88" — no orphaned requirements; phases 89-90 build ON the contract (uploaded=1 gate, DR via seam) without regressing it |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (all phase files) | — | TBD/FIXME/XXX/PLACEHOLDER scan | — | Clean — no debt markers, no stub returns on live tree |

### Human Verification Required

None outstanding. The single MinIO e2e item was executed and PASSED (4/4 green, 2026-11-22, ratified pgsty/minio pin) and re-confirmed once the same day; the involved files are bit-identical in the current tree (git-identity proof in the delta table), so the behavioral evidence stands without a re-run.

### Gaps Summary

No gaps. This freshness pass confirms the phase-89/90 workstreams — which reworked shared surfaces (server.js grew ~1140 lines, backup page ~296, DEPLOY.md +49, backup.js +44) — left the S3 destination contract fully intact. The S3 engine itself (export/s3.js) and all three of its test files have zero commits since the last verification; every seam re-exported into the changed files was located and verified at its new offset; the fast suites pass 31/31; locale parity is exact across 5 locales; and phase 89/90 new consumers (uploaded=1 gate, DR restore via the S3 seam) extend rather than violate the phase-88 contract. Milestone v3.3 is clear to close with Phase 88 at 16/16 on the current tree.

---

_Verified: 2026-11-23T19:22:09Z (re-verification — milestone-close freshness pass)_
_Verifier: the agent (gsd-verifier)_
