---
phase: "69"
slug: "exports-verification-test-11"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-17"
---

# Phase 69 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (Node v24.21.0), `--test-concurrency=2` |
| **Config file** | none — glob `test/*.test.mjs` via package.json `test` script |
| **Quick run command** | `node --test test/export-mspdi.test.mjs test/export-model.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~60 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/export-{mspdi,model,xlsx,csv}.test.mjs`
- **After every plan wave:** Run `npm test` + `npm run lint` (15-error baseline) + `npm run build` (chunk ≤500000 gate)
- **Before `/gsd-verify-work`:** Full suite must be green AND owner UAT verdict recorded
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 69-01-01 | 01 | 1 | REQ-EXP-01 (model) | — | N/A | unit | `node --test test/export-model.test.mjs` | ✅ (extend) | ⬜ pending |
| 69-01-02 | 01 | 1 | REQ-EXP-01 (MSPDI) | — | N/A | unit (serialized-XML string asserts) | `node --test test/export-mspdi.test.mjs` | ✅ (extend) | ⬜ pending |
| 69-01-03 | 01 | 1 | REQ-EXP-01 (xlsx) | — | N/A | unit | `node --test test/export-xlsx.test.mjs` | ✅ (extend) | ⬜ pending |
| 69-01-04 | 01 | 1 | REQ-EXP-01 (CSV) | — | N/A | unit | `node --test test/export-csv.test.mjs` | ✅ (extend) | ⬜ pending |
| 69-01-05 | 01 | 1 | NFR-03 | — | escapeXml + CSV `'` guard remain pinned (V5) | regression | `npm test` | ✅ | ⬜ pending |
| 69-02-01 | 02 | 1 | REQ-EXP-02 | — | N/A | manual-only (owner UAT, real MS Project) | — | n/a | ⬜ pending |
| 69-02-02 | 02 | 1 | REQ-EXP-03 | — | N/A | manual (verdict doc + A1 closure) | — | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — existing test infrastructure covers all phase requirements; the phase itself *is* the extension. (Generator run `node test/make-export-samples.mjs` is a task action, not a gap.)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Owner MS Project import per format | REQ-EXP-02 | Real MS Project Desktop is the verdict authority; automation would require MPXJ — rejected by NFR-01 (zero new deps) | Per `.planning/research/VERIFICATION.md` Part 2: MSPDI via XML Import Wizard "as new project" (primary verdict); xlsx via Excel paste (flat expected, recorded as such); CSV via import wizard (flat expected, recorded as such). Evidence: wizard/repair dialogs verbatim, 3-level Gantt screenshot. |
| Verdict recorded + A1 closed | REQ-EXP-03 | Documentation artifact, not automatable | Record pass/fail per format in the phase verification doc; check off Phase 65 item A1; close Phase 999.1 backlog entry. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

---

## Security Domain

Phase is verification-only with no new attack surface: no new inputs parsed (assertions read writer output), no new routes, no UI changes, no new deps. Writers' existing escaping (`escapeXml`, CSV formula-injection guard `'` prefix) is already pinned by the suites and must remain untouched (NFR-03). The fixture keeps the existing injection/escaping probe tasks (`=1+1`, `A & <B>`, script-tag desc) so escaping is re-exercised on the 3-level output — no new ASVS category applies beyond V5 input validation, covered by these existing escapes.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes (keep pinned) | escapeXml (mspdi.js:44-51), CSV `'` guard — existing suites |
| V2/V3/V4/V6 | no | n/a — no auth/session/access/crypto surface in this phase |
