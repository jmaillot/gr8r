---
phase: "49"
slug: "visibility-model-collapse-grant-materialization"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-07"
---

# Phase 49 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in test runner) |
| **Config file** | package.json (`"test"` script) |
| **Quick run command** | `node --test --test-concurrency=2 test/visibility-migration.test.mjs test/privacy.test.mjs test/mcp.test.mjs test/scope.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30–70 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick command above
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 49-01-01 | 01 | 1 | MIG-01 | T-49-01 | 13-cell legacy fixture + hand-derived oracle (VISIBILITY_MODEL/MIRROR_MODEL), zero production-predicate calls in expectation code | unit (fixture) | `node --test --test-concurrency=2 test/visibility-migration.test.mjs` | ✅ | ✅ green |
| 49-01-02 | 01 | 1 | MIG-01/MIG-02 | T-49-SC | Set-equality harness + byte-identity skeleton, green under old model pre-sweep | integration | `node --test --test-concurrency=2 test/visibility-migration.test.mjs` | ✅ | ✅ green |
| 49-01-03 | 01 | 1 | VIS-03 | T-49-06 | Server↔MCP parity harness + 404 body-equality rows (model-neutral) | integration | `node --test --test-concurrency=2 test/mcp.test.mjs test/privacy.test.mjs` | ✅ | ✅ green |
| 49-02-01 | 02 | 2 | MIG-01 | T-49-02/T-49-03 | materializeVisibilityGrants sweep: exact grant set, no p.teams/p.access, no normalizeProjects, backup-before-mutation | integration | `node --test --test-concurrency=2 test/visibility-migration.test.mjs` | ✅ | ✅ green |
| 49-02-02 | 02 | 2 | MIG-01 | — | Sweep wired into boot before request serving (awaited, post-ensureColumns) | integration | `node --test --test-concurrency=2 test/visibility-migration.test.mjs` (tests observe post-sweep state without calling the sweep) | ✅ | ✅ green |
| 49-02-03 | 02 | 2 | MIG-02 | T-49-04 | Scope columns NULL post-sweep; sealed shape preserved (D-49-8); corrupt-scope fail-open cell; second-boot byte-identity, exactly ONE backup (D-49-6) | integration | `node --test --test-concurrency=2 test/visibility-migration.test.mjs` | ✅ | ✅ green |
| 49-03-01 | 03 | 3 | MIG-03 | T-49-07 | Collapsed predicate/funnel: zero references to projectScope/inScopeProject/scopeGrants/teamIntersects/p.access in code (D-49-tagged comments only); assignee guard throws `assigneeOutOfScope` | unit/integration | `grep -rnE "projectScope\|inScopeProject\|scopeGrants\|teamIntersects" --include="*.js" --include="*.mjs" server.js mcp.js src test \| grep -v D-49 \| wc -l` → 0; `node --test --test-concurrency=2 test/scope.test.mjs` | ✅ | ✅ green |
| 49-03-02 | 03 | 3 | MIG-03 | T-49-05 | Send-time consumers single-gate via memberCanReadProject; scope writers retired; MCP mirror collapsed (no team term, no server.js import) | integration | `node --test --test-concurrency=2 test/scope.test.mjs test/mcp.test.mjs test/due-reminders.test.mjs test/digest.test.mjs` (canaries unmodified) | ✅ | ✅ green |
| 49-03-03 | 03 | 3 | VIS-02 | T-49-06 | Membership-removal flip hides private project on next read (through the read path); new-model cells un-skipped | integration | `node --test --test-concurrency=2 test/privacy.test.mjs` (16/16, 0 skipped) | ✅ | ✅ green |
| 49-04-01 | 04 | 4 | MIG-02 | T-49-08 | Repo-wide residual grep gates at expected-zero counts; mcp legacy p.access fallback deleted | smoke (grep) | Gate table recorded in 49-04-SUMMARY §Task 1 Gate Results | ✅ | ✅ green |
| 49-04-02 | 04 | 4 | MIG-01..03, VIS-02, VIS-03 | T-49-09 | Docs describe collapsed model only; all five ROADMAP success criteria individually evidenced | integration | `npm test` → 1090 tests, 1079 pass, 0 fail, 11 skipped (all pre-existing) | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `test/helpers/visibility-fixture.mjs` + `test/visibility-migration.test.mjs` created by Plan 49-01 (independent, hand-derived oracle — anti-tautology prohibition grep-verified: zero memberCanReadProject/canReadProject references outside comments in expectation code)
- [x] Parity harness (mcp.test.mjs) and 404 body-equality rows (privacy.test.mjs) landed pre-sweep; the sanctioned Phase-49 skip block was un-skipped by Plan 49-03 (0 skipped in privacy.test.mjs now)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real pg second-boot no-op (production pg instance) | MIG-02 | Dev suite covers SQLite; the pg matrix lane is environment-gated (`POSTGRES_TEST_URL` unset at repo baseline → 4 skipped in the pg lane). The sweep itself is sqliteOnly for the backup step (A6 fallback documented in server.js + 49-02-SUMMARY). | Boot twice against a staging pg instance, diff normalized project docs; assert zero writes on the second boot |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covered all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-07

---

## Validation Audit 2026-11-07

| Metric | Count |
|--------|-------|
| Gaps found | 0 open (5 stale pending rows; 2 stale file references corrected) |
| Resolved | 5/5 requirements (MIG-01, MIG-02, MIG-03, VIS-02, VIS-03) |
| Escalated | 0 |

Audit method (adversarial, force stance — nothing counted as covered until re-executed):

- `node --test --test-concurrency=2 test/visibility-migration.test.mjs` → **6/6 pass** (set-equality vs hand-derived oracle, scope-NULL, exact grant set incl. sealed-shape D-49-8, corrupt-scope fail-open T-49-04, second-boot byte-identity + ONE backup D-49-6)
- `node --test --test-concurrency=2 test/privacy.test.mjs` → **16/16 pass, 0 skipped** (VIS-02 removal-flip through the read path; byte-identical file-serve/get_task 404 bodies vs nonexistent-id baseline — body string equality, not status)
- `node --test --test-concurrency=2 test/mcp.test.mjs` → **32/32 pass** (server↔mirror parity; admin-bypass residue documented and pinned)
- `node --test --test-concurrency=2 test/scope.test.mjs` → **20/20 pass** (collapsed funnel cells, assignee guard 400 `assigneeOutOfScope`, send-time SMTP gating — email mirror never queues off-list reminders)
- Repo-wide residual gate: `grep -rnE "projectScope|inScopeProject|scopeGrants|teamIntersects" --include="*.js" --include="*.mjs" server.js mcp.js src test | grep -v D-49 | wc -l` → **0**
- Full `npm test` re-run at audit time → **1090 tests, 1079 pass, 0 fail, 11 skipped** (11 pre-existing env-gated skips; 0 phase-caused)
- pg lane: environment-gated, `POSTGRES_TEST_URL` unset — recorded as the manual-only row above (consistent with repo baseline, not a phase regression)

Only remaining non-automated surface: real-pg second-boot no-op (MIG-02) — environment-gated, explicitly manual-only, does not affect `nyquist_compliant` since the SQLite lane pins the full byte-identity behavior and the sweep is documented sqliteOnly for backups.
