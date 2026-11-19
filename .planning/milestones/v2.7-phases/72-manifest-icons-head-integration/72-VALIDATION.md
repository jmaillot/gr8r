---
phase: "72"
slug: "manifest-icons-head-integration"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-18"
validated: "2026-11-18"
---

# Phase 72 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (`node --test`), Playwright e2e |
| **Config file** | Existing repo test harness (`browser-push.test.mjs` precedent; `package.json` scripts) |
| **Quick run command** | `node --test test/manifest-contract.test.mjs test/icon-contract.test.mjs` |
| **Full suite command** | `npm test` (unit, 1770 tests) + lint/i18n/chunk gates + `npx playwright test --config e2e/playwright.config.mjs e2e/manifest.spec.mjs` |
| **Estimated runtime** | ~2 s (contract tests), ~110 s (full unit suite), ~1 s (e2e manifest spec) |

---

## Sampling Rate

- **After every task commit:** Run the task's contract test (`node --test test/manifest-contract.test.mjs` / `node --test test/icon-contract.test.mjs`)
- **After every plan wave:** Run full suite (`npm test` + gates + Playwright)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds (quick run — actual: ~2 s)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 72-01 T1 (tracer) | 01 | 1 | PWA-01 | T-72-01, T-72-02 | MIME exact, no charset suffix (Chromium rejects annotated types) | e2e (Playwright) + static contract | `npx playwright test --config e2e/playwright.config.mjs e2e/manifest.spec.mjs` · `node --test test/manifest-contract.test.mjs` | ✅ | ✅ green |
| 72-01 T2 | 01 | 1 | PWA-01 | T-72-01 | Exactly one theme-color meta, favicon swap boundary intact | static contract + full unit suite | `node --test test/manifest-contract.test.mjs` · `npm test` (1748 pass incl. favicon-swap tests) | ✅ | ✅ green |
| 72-01 T3 | 01 | 1 | PWA-01 | — | Frozen manifest field values + server three-touch diff (D-13 half one) | static contract test | `node --test test/manifest-contract.test.mjs` (11/11) | ✅ | ✅ green |
| 72-02 T1 | 02 | 2 | PWA-02 | T-72-03 | Opaque apple-touch-icon (alpha=255), exact IHDR dimensions | static asset contract | `node --test test/icon-contract.test.mjs` (IHDR bytes 16–23) | ✅ | ✅ green |
| 72-02 T2 (checkpoint D-07) | 02 | 2 | PWA-02 | T-72-03 | Owner visual approval before icon commit | human checkpoint | — (completed 2026-11-18, pre-commit) | ✅ | ✅ done |
| 72-02 T3 | 02 | 2 | PWA-02 | — | Icon set frozen: dimensions, opacity, manifest cross-check (SC-2) | static contract test | `node --test test/icon-contract.test.mjs` (9/9) | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Static contract test — delivered as `test/manifest-contract.test.mjs` (planner seed hypothesized `test/manifest.test.mjs`; actual executor filename retained, coverage complete: MIME, no-cache, all field values, icon srcs/order) — 11/11 green
- [x] e2e header-check spec — delivered as `e2e/manifest.spec.mjs` (live GET: 200, `application/manifest+json` exact, no-cache, frozen body) — 3/3 green
- [x] Icon contract test — delivered as `test/icon-contract.test.mjs` (dimensions, opacity, manifest cross-check) — 9/9 green
- [x] No framework install needed — `node:test` + existing Playwright harness cover all phase requirements

*Filename note: the plan-phase seed referenced `test/manifest.test.mjs`, which was never created. The planned coverage exists in full under the executor's actual filenames (`manifest-contract`/`icon-contract`); this is a nominal rename, not a coverage gap.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Result |
|----------|-------------|------------|-------------------|--------|
| Maskable icons render without clipping on Android adaptive launchers | PWA-02 | Launcher rendering is device/OS-specific; automated checks verify safe-zone geometry, not visual masking | Install PWA on an Android device; verify launcher icon shows the padded safe-zone redesign without rim clipping | ✅ UAT test 1 passed 2026-11-18 |
| iOS home-screen appearance (apple-touch-icon, meta tags honored) | PWA-02 | iOS Safari icon caching and meta handling is device-only | Add to Home Screen on iOS Safari; verify opaque dark-tile icon, no black flattening | ✅ UAT test 2 passed 2026-11-18 |
| Chromium install prompt (installability end-to-end) | PWA-01 | Real-browser install UX cannot be verified by static checks alone | Desktop Chrome: install prompt available (Lighthouse PWA audit as proxy) | ✅ UAT test 3 passed 2026-11-18 |

---

## Validation Audit 2026-11-18

| Metric | Count |
|--------|-------|
| Gaps found | 0 (1 nominal filename divergence, coverage complete) |
| Resolved | 0 needed |
| Escalated | 0 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a completed human checkpoint
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (delivered under actual filenames)
- [x] No watch-mode flags
- [x] Feedback latency < 15s (actual ~2 s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-18
