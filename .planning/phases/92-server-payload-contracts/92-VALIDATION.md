---
phase: "92"
slug: "server-payload-contracts"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-24"
---

# Phase 92 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (stdlib) |
| **Config file** | none — glob convention (`node --test --test-concurrency=2 test/*.test.mjs`) |
| **Quick run command** | `node --test test/backup-export.test.mjs test/backup-rotation.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | seconds (target files); full suite per v3.3/91 baseline |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/backup-export.test.mjs test/backup-rotation.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (planner fills) | | | BKNAME-01 | — | filename `<instance>-<scope>-<slug>-<gfs>-<date>`; manual runs no marker; collision `-2`; sidecar from final name | unit+integration | `node --test test/backup-export.test.mjs` | ✅ extend | ⬜ pending |
| (planner fills) | | | BKNAME-02 | — | one pure GFS fn; bucket stored at creation; backfill; rotation reads stored; dual-engine DDL | unit+integration | `node --test test/backup-rotation.test.mjs test/db-adapter.test.mjs test/migration.test.mjs` | ✅ | ⬜ pending |
| (planner fills) | | | BKNAME-02 (dates) | — | pure fn vs known dates: ISO week boundaries, year rollover; UTC-pure (DST-irrelevant) | unit | `node --test test/gfs-kept-until.test.mjs` | ✅ extend | ⬜ pending |
| (planner fills) | | | D-04 | — | describeCron daily/weekly/monthly/yearly/custom from parseCron sets; honest raw | unit | `node --test test/backup-cron.test.mjs` | ✅ | ⬜ pending |
| (planner fills) | | | D-05 | — | `?all=1` filters + per-run fail-closed scope; legacy byte-identical (golden differential) | integration | `node --test test/backup-routes.test.mjs` | ✅ | ⬜ pending |
| (planner fills) | | | D-06 | — | scopes gate (3 roles) + minimal payload; `workspacesForUser` byte-unchanged | integration | new scopes test file | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] New test file for `/api/backup/scopes` (or backup-routes extension)
- [ ] Golden snapshot differential test pinning legacy `GET /api/backup/runs` responses BEFORE the route is touched (D-05 byte-identity)

---

## Manual-Only Verifications

- Visual check that a real archive filename reads correctly on disk (naming is best eyeballed once at verify-work).
