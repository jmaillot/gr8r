---
phase: "66"
slug: "task-project-templates"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-15"
---

# Phase 66 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (unit, `npm test` = `node --test --test-concurrency=2 test/*.test.mjs`) + Playwright e2e (115/115 baseline) |
| **Config file** | none — follow `test/subtask-tree.test.mjs` + `test/notif-prefs.test.mjs` patterns |
| **Quick run command** | `node --test test/templates.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30–60 seconds (full suite; quick run <5 s) |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/templates.test.mjs` (+ lint)
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green (incl. chunk gate + i18n EN+FR scan)
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| *(filled by planner per plan tasks)* | | | TMPL-01 | — | per-kind whitelist sanitizer; unknown fields silently dropped server-side | unit (funnel) | `node --test test/templates.test.mjs` | ❌ W0 | ⬜ pending |
| — | — | — | TMPL-01 | — | embedded tree cycles rejected via existing subtaskCycle gate | unit (funnel) | `node --test test/templates.test.mjs` | ❌ W0 | ⬜ pending |
| — | — | — | TMPL-02 | — | builder: fresh ids, parentId remap, dOff offsets (neg/zero/missing) | unit (pure) | `node --test test/templates.test.mjs` | ❌ W0 | ⬜ pending |
| — | — | — | TMPL-03 | — | single doc-PUT revision bump; picker-in-modal EN+FR; entry chunk under 500 kB | e2e + gate | `npm test` (chunk gate runs vite build) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/templates.test.mjs` — TMPL-01/02 funnel round-trip + builder pins (red first)
- [ ] Extend `test/mcp.test.mjs` — writeDoc templates treatment (Pitfall 2: MCP does NOT ride mergeClientDoc)
- [ ] Chunk-gate + i18n gates are existing infrastructure — no new setup

*Existing infrastructure covers framework/config; only the templates test file is Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual polish of drawer-style template editor tree (offset column alignment) | TMPL-03 | Aesthetic judgment not machine-checkable | Open Settings › Templates, edit a template with a 3-level subtask tree, confirm tree renders with offsets and Phase 65 promote/demote/re-parent actions |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
