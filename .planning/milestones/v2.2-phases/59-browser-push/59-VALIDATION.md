---
phase: "59"
slug: "browser-push"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-13"
---

# Phase 59 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in test runner, Node 18+) |
| **Config file** | none — tests discovered via `npm test` script |
| **Quick run command** | `node --test test/push-*.test.mjs` |
| **Full suite command** | `npm test && npm run lint && node scripts/i18n-scan.mjs` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/push-*.test.mjs`
- **After every plan wave:** Run `npm test && npm run lint`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (populated by planner) | — | — | PUSH-01..05 | T-59-* | N/A | unit/integration | `node --test test/push-*.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/push-subscriptions.test.mjs` — subscription store CRUD + 404/410 sweep (PUSH-04)
- [ ] `test/push-vapid.test.mjs` — VAPID key persistence across restart (PUSH-05)
- [ ] `test/push-send.test.mjs` — fan-out gating on prefs, ticker payload ≤4096 octets (PUSH-02/03)
- [ ] `test/push-g37-2.test.mjs` — `push_due` re-whitelisting assertions (G-37-2 amendment)

*Existing infrastructure (node:test, db-adapter harness from Phase 58) covers framework needs; only phase-specific test files are Wave 0 gaps.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser push arrives with tab closed; click opens deep link | PUSH-02, PUSH-03 | Requires real browser push service round-trip (FCM/Mozilla autopush) and OS notification click | Enable push in Settings, close tab, trigger mention from another session, click notification, verify task opens |
| Per-device test push from Settings | PUSH-01 | Real service-worker registration + permission prompt | Settings → enable notifications → send test push → notification appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
