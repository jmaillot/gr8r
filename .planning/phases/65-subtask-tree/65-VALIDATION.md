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
> Source: 65-RESEARCH.md § Validation Architecture (verified against `package.json:19` and `test/`).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in test runner (`node --test --test-concurrency=2 test/*.test.mjs`) + Playwright e2e |
| **Config file** | `package.json` scripts; `e2e/playwright.config.mjs` |
| **Quick run command** | `node --test test/subtask-tree.test.mjs` (new file, Wave 0) |
| **Full suite command** | `npm test` (1524-test baseline — grow, never shrink) then `npm run e2e` (115/115) |
| **Estimated runtime** | ~60s full unit suite (per existing suite) |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/subtask-tree.test.mjs` + tests touching modified files
- **After every plan wave:** Run `npm test` (full suite, incl. FTS SQLite+pg parity)
- **Before `/gsd-verify-work`:** Full suite green + e2e 115/115 + `npm run build` (i18n scan + chunk gate) + `npm run lint`
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (planner fills task IDs) | — | 0 | SUB-01 | — | tree render/collapse/badge | e2e + client unit | `npm run e2e -- --grep subtask` | ❌ W0 | ⬜ pending |
| — | — | 0 | SUB-02 | — | cycle + depth-cap rejection at server funnel; delete cascade | unit (funnel) | `node --test test/subtask-tree.test.mjs` | ❌ W0 | ⬜ pending |
| — | — | 0 | SUB-03 | — | parent-done cascade; rollup without double-count | unit | `node --test test/subtask-tree.test.mjs` | ❌ W0 | ⬜ pending |
| — | — | 0 | SUB-04 | — | parentId survives sweeps; FTS titles SQLite+pg parity; MSPDI OutlineLevel; xlsx/CSV; MCP round-trip | unit | `node --test test/db-adapter.test.mjs test/export-mspdi.test.mjs test/export-model.test.mjs test/mcp-*.test.mjs` | ❌ extend existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/subtask-tree.test.mjs` — funnel validators (depth cap 5, cycle check), auto-complete cascade, rollup `progressOf` no-double-count, removal sweeps keep `parentId`/id (SUB-02/03/04)
- [ ] Extend `test/db-adapter.test.mjs` + `test/search-fts.test.mjs` — subtask-title indexing parity (SUB-04, D-06/D-08); follow existing pg-parity skip convention if pg env unavailable
- [ ] Extend `test/export-model.test.mjs` / `test/export-mspdi.test.mjs` — nested rows + depth-based OutlineLevel (SUB-04)
- [ ] New e2e spec — tree navigation, restructure error toast (SUB-01/02)
- [ ] MCP writeDoc round-trip parity test — `parentId` survives server→MCP→server (SUB-04)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Collapse carets / indent rendering in list/table views | SUB-01 | Visual layout | Expand/collapse at depth 3+ in each view |
| Board card child-count badge + popover checklist | SUB-01 | Visual layout | Badge count matches open subtasks; tap opens checklist |
| Timeline indented subtask bars, date inheritance | SUB-01 | Visual layout | Subtask without dates renders under parent's range |
| Localized depth-cap/cycle error copy (EN+FR) | SUB-02 | Copy review | Trigger rejection; check both locales same commit |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
