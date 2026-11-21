---
phase: "86"
slug: "export-core-gr8r-backup-v1"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-21"
---

# Phase 86 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`node --test`), Node 24 |
| **Config file** | none — `npm test` script in package.json |
| **Quick run command** | `node --test test/<new-test-file>.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30–90 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/<touched-test-file>.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (planner fills from PLAN.md tasks) | 01 | 1 | BKBCK-01 | T-86-* | role-gated export route (Backup Operator / Super Admin only) | unit/integration | `node --test test/<file>.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/backup-export.test.mjs` (or planner-chosen name) — archive format, manifest schema, sha256 verification, memory/atomic-rename behavior for BKBCK-01
- [ ] Dual-mirror pin test — SQLite (`wal_checkpoint` + `VACUUM INTO`) and Postgres (`REPEATABLE READ, READ ONLY` checked-out client) paths through the same export code
- [ ] Role-gate test — export route refuses non-Backup-Operator callers (extends Phase 85 guard-chain tests)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Memory ceiling (~65 MiB) under production-scale data | BKBCK-01 | Unit-test datasets are small; real RSS profile only observable with large archives | Run export against a production-scale instance, observe RSS in `process.memoryUsage()` |
| Archive inspectability with `tar tzf` on real deployment | BKBCK-01 | Requires deployed environment | Download an export, run `tar tzf` and spot-check entry 0 + per-table NDJSON |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
