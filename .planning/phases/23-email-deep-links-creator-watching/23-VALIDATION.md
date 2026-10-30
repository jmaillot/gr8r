---
phase: "23"
slug: "email-deep-links-creator-watching"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-30"
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (built-in) + Playwright e2e |
| **Config file** | `package.json` `test` script; `e2e/playwright.config.mjs` |
| **Quick run command** | `node --test test/<file>.test.mjs` |
| **Full suite command** | `npm test` then `npx playwright test --config e2e/playwright.config.mjs` |
| **Estimated runtime** | ~30 seconds (full suite), ~2s (single file) |

---

## Sampling Rate

- **After every task commit:** Run the relevant `node --test` file(s) for the touched domain
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite (`npm test` + Playwright) must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 23-01-xx | 01 | 1 | LINK-01 | — | N/A | unit | `node --test test/notif-email-link.test.mjs` | ❌ W0 | ⬜ pending |
| 23-01-xx | 01 | 1 | LINK-01 | — | N/A | unit | `node --test test/app-url-guard.test.mjs` | ❌ W0 | ⬜ pending |
| 23-xx-xx | xx | x | LINK-02 | — | `?next=` is path-only validated (no open redirect) | unit + e2e | `node --test test/next-carry.test.mjs`; Playwright flow | ❌ W0 | ⬜ pending |
| 23-xx-xx | xx | x | LINK-03 | — | No self-notify on own comment/update | unit | `node --test test/creator-watcher.test.mjs` | ❌ W0 | ⬜ pending |
| 23-xx-xx | xx | x | LINK-04 | — | N/A | e2e | Playwright spec (back/forward) | ❌ W0 | ⬜ pending |
| 23-xx-xx | xx | x | SC-5 | — | Logged-out byte route → 302 `/login?next=` | unit + e2e | extend existing file-route tests + Playwright | ❌ W0 | ⬜ pending |
| 23-xx-xx | xx | x | D-02 | — | No existence oracle on unknown/hidden task deep link | unit + e2e | new | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/notif-email-link.test.mjs` — LINK-01 URL builder + message embedding
- [ ] `test/creator-watcher.test.mjs` — LINK-03 semantics incl. self-notify exclusion
- [ ] `test/next-carry.test.mjs` — LINK-02 validator + carry (reuse rules from `finishLogin`)
- [ ] e2e deep-link + back-forward Playwright spec (EN+FR per project convention)
- [ ] Route-ordering regression test for the file byte route (extends existing coverage)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none expected) | — | — | — |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
