---
phase: "44"
slug: "per-member-timezones-v1-10"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-06"
---

# Phase 44 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`node --test`) |
| **Config file** | none — `test/*.test.mjs` convention (see `package.json` scripts) |
| **Quick run command** | `node --test test/due-reminders.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10–60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/due-reminders.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 44-01-01 | 01 | 1 | TZ-01 | T-44-01 / — | tz fallback never throws on hostile/unknown IANA input | unit | `node --test test/due-reminders.test.mjs` | ✅ | ⬜ pending |
| 44-01-02 | 01 | 1 | TZ-01 | — | ledger keys unchanged under tz change (no re-fire) | unit | `node --test test/due-reminders.test.mjs && node --test test/digest.test.mjs` | ✅ | ⬜ pending |
| 44-02-01 | 02 | 2 | TZ-01 | — | save-path merge: non-admin self-tz persists; others' fields not writable | unit | `node --test test/workspace-tz.test.mjs` (new — Wave 0) | ❌ W0 | ⬜ pending |
| 44-02-02 | 02 | 2 | TZ-01 | — | i18n keys for picker catalogued | lint | `npm run i18n:scan` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Map is provisional — planner/task IDs may shift; the contract is: every task carries an `<automated>` verify or a Wave-0 dependency.)*

---

## Wave 0 Requirements

- [ ] `test/workspace-tz.test.mjs` — covers tz resolve-on-read, Paris fallback, alias map, save-path regression
- [ ] Re-pin `test/due-reminders.test.mjs:380-382` (empty-tz fallback UTC → Paris) with shifted clock instant

*Framework install: none needed — Node built-in test runner.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Timezone picker renders common IANA zones with Paris preselected | TZ-01 | Browser UI rendering | Open Workspace Settings > Date & time; verify picker lists common zones, Paris default |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
