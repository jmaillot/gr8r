---
phase: "56"
slug: "delivery-infrastructure"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-12"
---

# Phase 56 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in), Node ≥24 |
| **Config file** | none (convention: `test/*.test.mjs`, `--test-concurrency=2`) |
| **Quick run command** | `npm test` (full; per-file: `node --test test/<file>.test.mjs`) |
| **Full suite command** | `npm test && npm run lint && node scripts/i18n-scan.mjs` |
| **Estimated runtime** | ~90 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run targeted `node --test test/<touched>.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green (incl. lint + i18n scan)
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (assigned at plan time) | — | 0 | DELIV-01 | — | fail-closed guard: stale dist → exit non-zero + actionable message | unit (spawn server.mjs against doctored dist) | `node --test test/e2e-server-guard.test.mjs` | ❌ W0 | ⬜ pending |
| (assigned at plan time) | — | 0 | DELIV-02 | — | no chunk > 500 kB after split | unit (real vite build; assert asset sizes) | `node --test test/build-chunk-size.test.mjs` | ❌ W0 (harness: test/build-locales.test.mjs) | ⬜ pending |
| (assigned at plan time) | — | 0 | DELIV-02 | — | EN catalogue stays in entry chunk | unit | existing `node --test test/build-locales.test.mjs` | ✅ | ⬜ pending |
| (assigned at plan time) | — | 0 | I18N-01 | — | fixture locale offered/loaded, en-fr untouched, gate clean | unit (fixture inject + real build + scan main()) | `node --test test/locale-registry-fixture.test.mjs` | ❌ W0 | ⬜ pending |
| (assigned at plan time) | — | 0 | I18N-01 | — | derived registry parity with old behavior | unit | existing catalogue/i18n suites via `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/e2e-server-guard.test.mjs` — DELIV-01 (guard spawn test against doctored dist)
- [ ] `test/build-chunk-size.test.mjs` — DELIV-02 (real build, assert ≤500 kB per chunk)
- [ ] `test/locale-registry-fixture.test.mjs` — I18N-01 (D-08 proof: fixture locale end-to-end)

*Build-test harness precedent: `test/build-locales.test.mjs`.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| QR spinner UX at click (D-03) | DELIV-02 | visual/loading-state behavior in real browser | Open 2FA settings QR, observe spinner during chunk load; error toast on simulated failure; retry works |
| e2e suite green on split build end-to-end | DELIV-01/02 | full browser suite | `npm run e2e` (109/109 expected) after rebuild |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
