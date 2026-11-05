---
phase: "38"
slug: "daily-digest-reminder-suppression"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-04"
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in), zero-dependency |
| **Config file** | none — `package.json` script: `npm test` (`node --test --test-concurrency=2 test/*.test.mjs`) |
| **Quick run command** | `node --test test/digest.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds (phase file); full suite ~40s |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/digest.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds (quick), 40s (full)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 38-01-01 | 01 | 1 | DIGEST-01 | T-38-01 / — | Digest recipients only via authority rows; scope checks copied from reminder loop (V4) | integration | `node --test test/digest.test.mjs` | ❌ W0 | ⬜ pending |
| 38-01-02 | 01 | 1 | DIGEST-02 | T-38-02 / — | Transactional claim (insert or ignore) — exactly-once across restarts | integration | `node --test test/digest.test.mjs` | ❌ W0 | ⬜ pending |
| 38-01-03 | 01 | 1 | DIGEST-02 | T-38-03 / — | Suppression at email fan-out only; inbox + push rows untouched (V4) | integration | `node --test test/digest.test.mjs` | ❌ W0 | ⬜ pending |
| 38-01-04 | 01 | 1 | DIGEST-03 | T-38-04 / — | Default inversion undefined-falsy both sides; 16-key whitelist unchanged (V5) | unit/integration | `node --test test/digest.test.mjs test/notif-prefs.test.mjs` | partial | ⬜ pending |
| 38-01-05 | 01 | 1 | DIGEST-03 | T-38-05 / — | EN+FR copy parity; server `notif.digest.*` keys resolve (i18n gate) | suite | `npm run i18n:scan` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/digest.test.mjs` — covers all DIGEST pins (harness: `startServer` + `REMINDER_TEST_TOKEN` + `fakeSmtp` pattern from test/notif-i18n.test.mjs; prefs seeding per due-reminders.test.mjs:100-108 shape)
- [ ] Regression guard: `node --test test/due-reminders.test.mjs` must stay green UNCHANGED with digest off (existing exactly-once / idle-tick / revision pins)
- [ ] Framework install: none needed (node:test built-in)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Stored `email_digest: true` historical rows count as opt-in (D-14 literal ruling vs SC-4 tension — client PUT echoes hydrated prefs) | DIGEST-03 | Owner policy decision, not a code behavior | Reviewer confirms release-note + D-14 reading at `checkpoint:human-verify` in plan; verify settings UI toggle round-trips on a real account |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 40s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
