---
phase: "36"
slug: "server-notification-i18n"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-04"
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node --test` (Node built-in runner), `--test-concurrency=2` |
| **Config file** | none — glob `test/*.test.mjs` via package.json `test` script |
| **Quick run command** | `node --test test/i18n-tfor.test.mjs` (or the touched phase test file) |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run the touched test file(s) via `node --test <file>`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green + `npm run i18n:scan` exit 0
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {36-xx-xx} | TBD | TBD | I18N-01 | — | N/A | integration | `node --test test/notif-i18n.test.mjs` | ❌ W0 | ⬜ pending |
| {36-xx-xx} | TBD | TBD | I18N-02 | — | N/A | unit | `node --test test/i18n-tfor.test.mjs` | ❌ W0 | ⬜ pending |
| {36-xx-xx} | TBD | TBD | I18N-03 | — | N/A | unit | `node --test test/notif-i18n.test.mjs` | ❌ W0 | ⬜ pending |
| {36-xx-xx} | TBD | TBD | I18N-04 | — | N/A | unit | `node --test test/i18n-scan.test.mjs` | ✅ (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Task IDs to be filled in by the planner; requirements mapped per 36-RESEARCH.md "Validation Architecture".)*

---

## Wave 0 Requirements

- [ ] `test/i18n-tfor.test.mjs` — tFor/t delegation, locale clamping, throw-guard (I18N-02, SC-5)
- [ ] `test/notif-i18n.test.mjs` — keyed rows server+client, per-recipient email locale (I18N-01, I18N-03)
- [ ] `test/i18n-scan.test.mjs` — extend with server-family + parity cases (I18N-04)
- [ ] `test/fixtures/i18n-pending.json` — unchanged; verify no new src findings (regression pin)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real email delivery renders FR subject/body | I18N-01 | SMTP capture covers content, not actual MUA rendering | Send a test reminder to a FR-locale account and inspect the received email |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
