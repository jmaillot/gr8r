---
phase: "65"
slug: "subtask-tree"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-15"
---

# Phase 65 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node --test` (node:test), `--test-concurrency=2`; Playwright ^1.64.1 for e2e |
| **Config file** | package.json scripts (`test`, `e2e` → e2e/playwright.config.mjs) |
| **Quick run command** | `node --test test/subtask-tree.test.mjs` |
| **Full suite command** | `npm test` (1524 baseline — grow, never shrink) · `npm run e2e` (115/115) |
| **Estimated runtime** | ~30 s quick · ~3 min full |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/subtask-tree.test.mjs` + touched suites
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite (`npm test` + `npm run e2e`) must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 65-01-* | 01 | 1 | SUB-01/02/04 | T-65-01 | Server never trusts client tree shape (normalize whitelist) | unit | `node --test test/subtask-tree.test.mjs` | ❌ W0 | ⬜ pending |
| 65-02-* | 02 | 2 | SUB-02/03 | T-65-02 | Cycle/depth reject fail-closed, tx-atomic | unit | `node --test test/subtask-tree.test.mjs test/error-codes.test.mjs` | ❌/✅ (error-codes extend) | ⬜ pending |
| 65-02-* | 02 | 2 | SUB-03 | — | Cascade + leaf-only rollup, never double-counts | unit | `node --test test/export-model.test.mjs test/subtask-tree.test.mjs` | ✅/❌ | ⬜ pending |
| 65-03-* | 03 | 3 | SUB-01 | — | Depth-aware render, carets, badge | unit + e2e | `node --test test/subtask-tree.test.mjs` + e2e spec | ❌ W0 | ⬜ pending |
| 65-04-* | 04 | 4 | SUB-01/02 | — | One-level restructure UX, pre-validation | unit + e2e | e2e spec + `node --test test/i18n-scan` | ❌/✅ | ⬜ pending |
| 65-05-* | 05 | 4 | SUB-04 | T-65-03 | FTS parity, export rows, MCP round-trip | unit | `node --test test/search-fts.test.mjs test/copy-sqlite-to-pg.test.mjs test/export-mspdi.test.mjs test/export-xlsx.test.mjs test/export-csv.test.mjs test/mcp.test.mjs` | ✅ (extend) | ⬜ pending |
| gates | all | all | standing | — | chunk ≤500 kB, i18n EN+FR | unit | `node --test test/build-chunk-size.test.mjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/subtask-tree.test.mjs` — normalize/validate/cascade/rollup/idempotency stubs (covers SUB-01/02/03 core)
- [ ] Extend `test/search-fts.test.mjs` + pg parity for subtask titles (SUB-04)
- [ ] Extend `test/export-mspdi.test.mjs`, `test/export-model.test.mjs`, `test/mcp.test.mjs` for depth rows + round-trip (SUB-04)
- [ ] Extend `test/error-codes.test.mjs` with `subtaskCycle`/`subtaskDepth`
- [ ] e2e spec: tree render + restructure via popover + board badge (SUB-01/02 UX path)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Collapse/expand visual smoothness in drawer | SUB-01 | Session-only component state, aesthetic | Expand/collapse at depth 5 in list view; verify carets and indent |
| Localized error toast wording (EN+FR) | SUB-02 | Wording review is human | Trigger cycle/depth reject; check EN and FR toasts |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
