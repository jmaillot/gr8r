---
phase: "74"
slug: "service-worker-verification-milestone-acceptance"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-11-18"
---

# Phase 74 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in), Playwright for e2e — zero new deps |
| **Config file** | none — node:test source-as-text style; e2e: `e2e/playwright.config.mjs` |
| **Quick run command** | `node --test test/sw-contract.test.mjs` |
| **Full suite command** | `npm test` (unit baseline: 1737 pass / 13 accepted failures per STATE.md) |
| **Estimated runtime** | ~74 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/sw-contract.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be at or above the accepted baseline (no NEW failures vs 13)
- **Max feedback latency:** 74 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 74-01-01 | 01 | 1 | PWA-03 | T-74-01 / T-74-02 | sw.js byte-identity pin (STOP-and-justify on drift) | contract (tracer) | `node --test test/sw-contract.test.mjs` | ❌ W0 | ⬜ pending |
| 74-01-02 | 01 | 1 | PWA-03 | T-74-03 | registration call-site + scope agreement pins | contract + suite | `node --test test/sw-contract.test.mjs && npm test > /tmp/74-suite.log 2>&1; awk '/^pass /{p=$2} /^fail /{f=$2} END{exit (p>=1738 && f<=13 && p+f>0)?0:1}' /tmp/74-suite.log && grep -c "sw-contract" /tmp/74-suite.log` | ✅ | ⬜ pending |
| 74-02-01 | 02 | 2 | PWA-03 | T-74-03 | deployment constraint documentation (root-domain-only) | docs grep | `grep -n "^## 18\. Installable app (PWA)" docs/DEPLOY.md && grep -c "beforeinstallprompt\|Add to Home Screen\|STOP-and-justify\|Lighthouse" docs/DEPLOY.md` | ✅ | ⬜ pending |
| 74-02-02 | 02 | 2 | PWA-03 | — | real-device acceptance (human UAT) | human checkpoint | `[ "$(grep -c '^### [1-4]\.' .planning/phases/74-service-worker-verification-milestone-acceptance/74-UAT.md)" -ge 4 ]` | ❌ task-created | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/sw-contract.test.mjs` — created by 74-01 Task 1 (tracer) before any other pin assertions run

*Existing infrastructure covers all other phase requirements (node:test, no framework install).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Desktop Chrome install + standalone launch | PWA-03 | Requires real browser install UX + OS-level standalone window | Install on desktop Chrome; verify prompt, install, standalone launch (74-02 Task 2, test 1) |
| Android Chrome install + standalone launch | PWA-03 | Requires real device A2HS flow | On Android Chrome: complete install flow, launch standalone (74-02 Task 2, test 2) |
| iOS Safari honest manual-install path | PWA-03 | Safari never fires `beforeinstallprompt` | iOS Safari: no prompt shown; manual Share → Add to Home Screen works; no back button (74-02 Task 2, test 3) |
| Push notifications still fire after all changes | PWA-03 | Requires real device push subscription | Trigger a push to an existing subscription; notification appears (74-02 Task 2, test 4) |

These four map 1:1 to the `checkpoint:human-verify` task in 74-02 (74-UAT.md).

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 74s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** {pending / approved YYYY-MM-DD}
