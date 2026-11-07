---
phase: "45"
slug: "database-adapter-optional-postgres-backend-via-env-sqlite-de"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
reconciled: "2026-11-07 — v1.10 milestone debt pass: validate-phase was never run for this
phase, but the validation contract is de facto satisfied — Phase 45 VERIFICATION.md passed
8/8 (re-verification post-reconciliation), UAT 2/2, full suite 1126/0-fail, db-adapter 26/26
vs live pg, copy contract 4/4, static audit 4/4. Marked validated with owner consent via the
milestone debt pass; no VALIDATION.md content changed."
created: "2026-11-07"
---

# Phase 45 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in test runner (`node --test`), 1042-test suite |
| **Config file** | none — `test/` directory convention, `npm test` script |
| **Quick run command** | `node --test test/dependencies.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run the touched test file(s), plus `node --test test/dependencies.test.mjs` when Dockerfile/package.json/COPY pins change
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled at execute time — plans in flight) | — | — | CONTEXT D-01..D-14 | T-45-SC/T-45-01.. | parameterized queries only; fail-closed boot; copy-script refuses non-empty target | unit/integration | `npm test` + `POSTGRES_TEST_URL=… npm test` (opt-in matrix) | ❌ W0 for new pg-matrix files | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/db-adapter.test.mjs` — adapter facade (get/all/run/tx) unit tests against SQLite path
- [ ] `test/dependencies.test.mjs` amendment — D-12 pins updated for conditional `pg` + new Dockerfile COPY targets
- [ ] pg-matrix harness files (gated on `POSTGRES_TEST_URL`, skip when unset): adapter, claims, auth subset, migrations
- [ ] `withDb` fixture stays SQLite-default; pg sibling fixture added

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real pg boot fail-closed (D-04) | D-04 | needs a live unreachable Postgres endpoint | set DB_URL to a dead host, boot, observe clear startup error and exit |
| pg_dump operator backup doc | D-09 | operator-side procedure | follow DEPLOY.md runbook on a live deployment |
| SQLite→pg copy on real install | D-12/D-13 | destructive against real data | dry-run on a copy of projects.db, verify per-table counts |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
