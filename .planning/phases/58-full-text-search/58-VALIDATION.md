---
phase: "58"
slug: "full-text-search"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-12"
---

# Phase 58 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (`node --test`) — existing project convention (Phase 57 verified commands) |
| **Config file** | none — existing `test/*.test.mjs` layout |
| **Quick run command** | `node --test test/fts-search.test.mjs` (new; adjust to planner's file names) |
| **Full suite command** | `npm test && npm run lint && node scripts/i18n-scan.mjs && npm run e2e` |
| **Estimated runtime** | ~60–120 seconds (full suite incl. e2e) |

---

## Sampling Rate

- **After every task commit:** Run the plan's quick `node --test` command
- **After every plan wave:** Run `npm test && npm run lint`
- **Before `/gsd-verify-work`:** Full suite must be green (incl. e2e)
- **Max feedback latency:** 30 seconds (quick run)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD by planner | — | 0/1 | SEARCH-01 | — | N/A | unit/e2e | `node --test test/fts-search.test.mjs` | ❌ W0 | ⬜ pending |
| TBD by planner | — | 0/1 | SEARCH-02 | T-58-xx | Search results leak-tested byte-level via `memberCanReadProject` | unit (leak tests) | `node --test test/fts-leak.test.mjs` | ❌ W0 | ⬜ pending |
| TBD by planner | — | 0/1 | SEARCH-03 | — | Index freshness across doc-PUT / bulk / MCP write paths + boot sweep | unit (parity) | `node --test test/fts-sync.test.mjs` | ❌ W0 | ⬜ pending |
| TBD by planner | — | 0/1 | SEARCH-04 | — | Accent folding ("elodie" → "Élodie") on SQLite + pg | unit (parity) | `node --test test/fts-accents.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/fts-search.test.mjs` — stubs for SEARCH-01 (palette query → grouped results)
- [ ] `test/fts-leak.test.mjs` — byte-level cross-project leak tests for SEARCH-02
- [ ] `test/fts-sync.test.mjs` — write-path freshness + boot sweep heal for SEARCH-03
- [ ] `test/fts-accents.test.mjs` — diacritic-folding parity SQLite/pg for SEARCH-04
- [ ] No framework install needed — `node --test` is built in

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Ctrl-K palette UX feel (grouping, latency perception) | SEARCH-01 | subjective UX | Open palette, type keywords, confirm grouped results + results page render |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
