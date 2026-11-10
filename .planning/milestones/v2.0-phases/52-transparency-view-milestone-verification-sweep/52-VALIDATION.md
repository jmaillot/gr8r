---
phase: "52"
slug: "transparency-view-milestone-verification-sweep"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-08"
---

# Phase 52 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in), `--test-concurrency=2` |
| **Config file** | none — glob-based (`test/*.test.mjs`) |
| **Quick run command** | `node --test test/transparency.test.mjs` |
| **Full suite command** | `npm test` (~1133 tests, green at Phase 51 close) |
| **Estimated runtime** | ~10–30 seconds (target file); full suite per project convention |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/transparency.test.mjs` (+ `npm run i18n:scan` when UI strings changed)
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green (`npm test && npm run i18n:scan && node --check server.js`)
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 52-01-01 | 01 | 1 | TRN-01 | T-52-01 / — | Endpoint computed via `memberCanReadProject` funnel only, never from redacted doc | unit/integration (fixture server) | `node --test test/transparency.test.mjs` | ❌ W0 | ⬜ pending |
| 52-01-02 | 01 | 1 | TRN-01 | T-52-02 / — | Admin/owner-only gate; member/viewer refused; self-expansion blocked server-side | integration | `node --test test/transparency.test.mjs` | ❌ W0 | ⬜ pending |
| 52-0x-xx | — | — | TRN-01 (D-52-8) | — | Parity: endpoint list == VISIBILITY_MODEL == complement of redacted hidden set, extended matrix | integration (permanent) | `node --test test/transparency.test.mjs` | ❌ W0 | ⬜ pending |
| sweep | — | — | SC-3 | — | 404-matrix / Phase 38 suppression + no-double-send invariants unmodified | regression (existing) | `node --test test/privacy.test.mjs test/digest.test.mjs` | ✅ | ⬜ pending |
| sweep | — | — | SC-3 | — | i18n gate EN+FR, 0 dead keys (new keys added) | existing gate | `npm run i18n:scan` | ✅ | ⬜ pending |
| sweep | — | — | SC-3 | — | zero new runtime dependencies | existing test | `node --test test/dependencies.test.mjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/transparency.test.mjs` — endpoint gate/shape/parity (TRN-01, D-52-8)
- [ ] `test/helpers/visibility-fixture.mjs` — extended cells: lead-only access, lost-visibility, admin-viewing-admin (D-52-9)
- [ ] Catalogue pin update in `test/catalogue.test.mjs` if it asserts an exact key count

*Framework install: none needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual/UX correctness of the transparency view rendering (labels, ordering, empty states) | TRN-01 (UX) | Automated tests cover data parity, not rendering quality | Open the view as admin/owner for a member with 0, 1, and many accessible projects; verify reasons display correctly in EN and FR |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
