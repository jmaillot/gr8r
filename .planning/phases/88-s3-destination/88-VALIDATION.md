---
phase: "88"
slug: "s3-destination"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-22"
---

# Phase 88 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (node --test), same idiom as Phases 86–87 (`test/*.test.mjs`) |
| **Config file** | package.json (`"test": "node --test --test-concurrency=2 test/*.test.mjs"`) |
| **Quick run command** | `node --test test/backup-s3.test.mjs` |
| **Full suite command** | `node --test --test-concurrency=2 test/*.test.mjs` |
| **Estimated runtime** | ~60–120 seconds (full suite; MinIO e2e container adds spin-up) |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/backup-s3.test.mjs`
- **After every plan wave:** Run `node --test --test-concurrency=2 test/*.test.mjs`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds (excluding MinIO container e2e, which runs as its own opt-in test file)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 88-01-01 | 01 | 1 | BKBCK-05 | T-88-* (per PLAN) | Credentials from S3_* env only, never stored in task rows | unit (golden vectors) | `node --test test/backup-s3.test.mjs` | ❌ W0 | ⬜ pending |
| 88-01-02 | 01 | 1 | BKBCK-05 | — | Probe-at-save keyed refusal on unreachable endpoint | unit/integration | `node --test test/backup-s3.test.mjs` | ❌ W0 | ⬜ pending |
| 88-02-01 | 02 | 1 | BKBCK-05 | — | Streamed multipart upload, memory-bounded, checksum verified post-upload | e2e (MinIO) | `node --test test/backup-s3-e2e.test.mjs` | ❌ W0 | ⬜ pending |
| 88-02-02 | 02 | 1 | BKBCK-05 | — | Download to staged temp file with streaming-hash verification | e2e (MinIO) | `node --test test/backup-s3-e2e.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*(Task IDs are provisional — planner maps real task IDs into this table.)*

---

## Wave 0 Requirements

- [ ] `test/backup-s3.test.mjs` — stubs: SigV4 golden-vector cases (AWS-published test suites), probe refusal cases, RequestTimeTooSkewed mapping
- [ ] `test/backup-s3-e2e.test.mjs` — stub gated behind env (idiom from `test/pg-matrix.test.mjs:32-43`); MinIO container from pinned quay.io tag
- [ ] No framework install needed — node:test is stdlib

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real AWS S3 / B2 endpoint round-trip | BKBCK-05 | No live cloud credentials in CI/dev by design | Operator configures a real bucket once post-ship; Run now a backup, confirm object + sha256 in run history |
| MinIO e2e against pinned tag pullability | BKBCK-05 | Container image availability is environment-dependent (research flag A1) | `docker pull quay.io/minio/minio:RELEASE.2025-10-15T17-29-55Z` smoke at plan task 0 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
