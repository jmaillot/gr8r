---
phase: "13"
slug: "investigation-invariant-pinning"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-26"
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (Node built-in, Node ≥24); docs-only phase — verification is grep-based doc review |
| **Config file** | none needed for node:test (`node --test test/*.test.mjs`); `e2e/playwright.config.mjs` for e2e |
| **Quick run command** | `grep` verify commands per task (below) |
| **Full suite command** | `npm test` (35-file suite — must stay green; phase adds no code) |
| **Estimated runtime** | ~10 seconds (grep + suite) |

---

## Sampling Rate

- **After every task commit:** Run the task's automated grep verify commands (below) + `npm run lint && npm run format:check`
- **After every plan wave:** Run `npm test` (must stay green — phase adds no code)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

Phase 13 has no requirement IDs (ROADMAP assigns none to the foundation phase) and ships no
runtime code — the deliverable is `13-DECISIONS.md`, the canonical D-01…D-17 citation target
for Phases 14–18. The contracts it pins are tested in consuming phases (Phase 14 migration
test, Phase 16 unit/fixture tests, Phase 17 e2e 401-matrix, Phase 18 device UAT).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | — (foundation) | T-13-01 / — | D-01…D-04 pending-2FA contracts + diagnosis evidence present | doc grep | `grep -cE '^[[:space:]]*-[[:space:]]*\*\*D-0[1-4]:' .planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md` = 4; `grep -c '\[VERIFIED: '` ≥ 10 | ❌ created by task | ⬜ pending |
| 13-01-02 | 01 | 1 | — (foundation) | T-13-02 / T-13-03 / T-13-04 | D-05…D-14 crypto/throttle/QR contracts + removal scope + prohibitions present | doc grep | `grep -cE '^[[:space:]]*-[[:space:]]*\*\*D-(0[5-9]\|1[0-4]):' …` = 10; `grep -c 'too many attempts'` ≥ 1; `grep -c 'server.js:1241'` ≥ 1 | ❌ created by task 1 | ⬜ pending |
| 13-01-03 | 01 | 1 | — (foundation) | — | D-01…D-17 complete, ≥3 Reversibility clauses, no unfinished-work markers | doc grep | `grep -oE '\*\*D-[0-9]{2}:' … \| sort -u \| wc -l` = 17; `grep -c 'Reversibility'` ≥ 3; `grep -cE 'TODO\|TBD\|\bFIXME\b'` exits 1 | ❌ created by tasks 1–2 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Non-grep gate: `npm test` after each task (docs-only phase — the 35-file suite is the
no-regression gate) and doc reviewed against 13-CONTEXT.md D-01…D-17 at the phase gate.

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — Phase 13 introduces no code and no
new test infrastructure; the grep verifies above run against the doc the tasks create.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Decision-entry contract text matches 13-CONTEXT.md in substance | — (foundation) | Semantic equivalence, not machine-checkable | Spot-check D-03, D-09, D-13 (most paraphrase-prone) against CONTEXT.md `<decisions>` at phase gate |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none — no code in this phase)
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter (set by validate-phase §6 after execution)

**Approval:** pending
