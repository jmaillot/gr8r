---
phase: "80"
slug: "group-mapping-core-parser-resolver-overage-detection"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-20"
---

# Phase 80 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test + node:assert/strict (built-in runner) |
| **Config file** | none — house style (domains-*.test.mjs family) |
| **Quick run command** | `node --test test/groups-core.test.mjs test/groups-config-api.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5s (phase files), ~minutes (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/groups-core.test.mjs test/groups-config-api.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 80-01-01 | 01 | 1 | GM-02, GM-03 | T-80-01 | Four-outcome fail-closed resolver contract (overage/missing never `[]`) | unit (tracer) | `node --test test/groups-core.test.mjs` | ✅ | ✅ green |
| 80-01-02 | 01 | 1 | GM-02, GM-03 | T-80-01, T-80-02, T-80-03, T-80-06 | Full four-fixture contract, GUID canonicalization, 3-token role allow-list, resolver ranking (D-82-1), operator flag surface | unit | `node --test test/groups-core.test.mjs` | ✅ | ✅ green |
| 80-01-03 | 01 | 1 | GM-02, GM-03 | T-80-02, T-80-06 | Mirror test table list + in-memory DDL: 3-token CHECK (viewer insert fails), (guid, workspace) unique index, insert round-trip | integration | `node --test test/db-adapter.test.mjs test/groups-core.test.mjs` | ✅ | ✅ green |
| 80-02-01 | 02 | 1 | GM-01 | T-80-04, T-80-05, T-80-06, T-80-07 | Save route: keyed 400 refusals, no-oracle operator gate ordering, 5-locale parity, dead-mapping survival + boot warning | integration | `node --test test/groups-config-api.test.mjs` | ✅ | ✅ green |
| 80-02-02 | 02 | 1 | GM-01, GM-02 | T-80-SC | Boot-time dead-mapping warning quiet/off on empty config; dependencies contract test (groups.js in Dockerfile COPY array); full suite green | integration + contract | `node --test test/groups-config-api.test.mjs test/dependencies.test.mjs && npm test` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements (node:test house style, `test/helpers/server.mjs` integration harness, locale-registry parity test auto-covers new err.* keys).

---

## Manual-Only Verifications

| Verification | Requirement | Rationale |
|--------------|-------------|-----------|
| pg-matrix suite (`test/db-adapter.test.mjs:567`) | GM-02, GM-03 | Opt-in POSTGRES_TEST_URL gate (D-08 idiom) — requires a live PostgreSQL instance; skipped by design in default runs |

---

## Validation Audit 2026-11-20

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All phase requirements (GM-01, GM-02, GM-03) map to existing automated tests targeting the behavior under test. Phase test files: 62 tests, 61 pass, 0 fail, 1 by-design skip (pg-matrix, gated).

---

## Sign-Off

- [x] Every requirement has automated verification targeting the behavior
- [x] Threat mitigations (T-80-*) have test-level pins
- [x] Phase test files green
- [x] Full suite green
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-20
