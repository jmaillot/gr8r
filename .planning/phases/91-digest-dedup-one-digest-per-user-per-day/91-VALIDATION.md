---
phase: "91"
slug: "digest-dedup-one-digest-per-user-per-day"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-23"
---

# Phase 91 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (`.test.mjs`), existing `test/digest.test.mjs` harness with local SMTP capture |
| **Config file** | none — node:test convention |
| **Quick run command** | `node --test test/digest.test.mjs` |
| **Full suite command** | `npm test` (`node --test --test-concurrency=2 test/*.test.mjs`) |
| **Estimated runtime** | ~seconds for digest file; full suite per v3.3 baseline |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/digest.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled by planner) | | | NOTIF-01 SC1/SC2 | — | 4-ws user → exactly 1 email / 1 aggregated outbox row (`digest:user:{id}:{date}`) | integration (SMTP capture) | `node --test test/digest.test.mjs` | ✅ (extend) | ⬜ pending |
| (filled by planner) | | | NOTIF-01 SC3 | — | restart after partial claims → 1 email, all sections; MAILER-disabled → no enqueue | integration | `node --test test/digest.test.mjs` | ✅ | ⬜ pending |
| (filled by planner) | | | NOTIF-01 SC4 | — | per-ws `reminders_sent` keys unchanged (byte-compat) | assertion ×4 | `node --test test/digest.test.mjs` | ✅ | ⬜ pending |
| (filled by planner) | | | D-02 | — | 0x02 token POST disables digest across all workspaces | route test | `node --test test/unsubscribe-route.test.mjs` | ✅ (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- None — existing harness (`test/digest.test.mjs`, `test/unsubscribe-route.test.mjs`) covers all phase requirements; the pinned red regression test is itself Task 1 of the plan.

---

## Manual-Only Verifications

- Visual check of the aggregated email rendering (header app + ws-titled sections + single footer, D-03) — SMTP capture shows raw body; final human eyeball at verify-work.
