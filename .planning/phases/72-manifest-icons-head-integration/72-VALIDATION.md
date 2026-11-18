---
phase: "72"
slug: "manifest-icons-head-integration"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-18"
---

# Phase 72 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (`node --test`), Playwright e2e |
| **Config file** | Existing repo test harness (see `browser-push.test.mjs` precedent; `package.json` scripts) |
| **Quick run command** | `node --test test/manifest.test.mjs` |
| **Full suite command** | `node --test` (unit) + existing lint/i18n/chunk gates + Playwright e2e |
| **Estimated runtime** | ~10 seconds (unit/contract), ~60 seconds (full incl. Playwright) |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/manifest.test.mjs`
- **After every plan wave:** Run full suite (`node --test` + gates + Playwright)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds (quick run)

---

## Per-Task Verification Map

*Populated by the planner from PLAN.md tasks (fill Task ID / Plan / Wave columns when plans land).*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (planner fills) | 01 | 0 | PWA-01 | — | N/A | static contract test | `node --test test/manifest.test.mjs` | ❌ W0 | ⬜ pending |
| (planner fills) | 01 | 1 | PWA-02 | — | N/A | static asset check | `node --test test/manifest.test.mjs` | ❌ W0 | ⬜ pending |
| (planner fills) | 01 | 1 | PWA-01/PWA-02 | — | N/A | e2e (Playwright) | existing Playwright harness (D-13 header check) | ✅ (harness) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/manifest.test.mjs` — static contract test stubs: manifest MIME (`application/manifest+json`), no-cache header, `name`/`short_name` = "Projects Studio", `display: standalone`, `start_url`/`scope`/`id` = `/`, icon references to the five PNGs under `public/`
- [ ] e2e header-check spec (`e2e/manifest.spec.mjs` recommended by research) — live `GET /manifest.webmanifest` header + `index.html` head-tag assertions
- [ ] No framework install needed — `node:test` + existing Playwright harness cover all phase requirements

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Maskable icons render without clipping on Android adaptive launchers | PWA-02 | Launcher rendering is device/OS-specific; automated checks can verify safe-zone geometry (inner 80% circle), not visual clipping | Install PWA on an Android device/emulator; verify launcher icon shows the padded safe-zone redesign without rim clipping |
| iOS home-screen appearance (apple-touch-icon, meta tags honored) | PWA-02 | iOS Safari icon caching and meta handling is device-only | Add to Home Screen on iOS Safari; verify icon and standalone appearance |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
