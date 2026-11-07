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
| 44-01 checkpoint | 01 | 1 | TZ-01 | T-44-SC | N/A (one-way-door decision: D-09 workspace-tz deletion) | — | — | — | ⬜ pending |
| 44-01 tracer | 01 | 1 | TZ-01 | T-44-01 | Hostile tz cannot throw or inject; funnel-validated zone ids only | integration | `node --test test/due-reminders.test.mjs && node --test test/digest.test.mjs` | ✅ | ⬜ pending |
| 44-01 funnel pins | 01 | 1 | TZ-01 | T-44-01 | Legacy map + Paris fallback + hostile input deterministic | unit | `node --test test/tz-resolve.test.mjs` | ❌ W0 | ⬜ pending |
| 44-01 dedup edges | 01 | 1 | TZ-01 | — | Ledger keys unchanged under tz change (no re-fire); deterministic order | unit | `node --test test/tz-dedup.test.mjs` | ❌ W0 | ⬜ pending |
| 44-02 save carve-out | 02 | 2 | TZ-01 | T-44-03, T-44-04 | Self-tz-only persists; cross-member/cross-field writes ignored; invalid coerces to Paris | unit | `node --test test/settings-tz.test.mjs` | ❌ W0 | ⬜ pending |
| 44-02 regression | 02 | 2 | TZ-01 | — | Save path end-to-end; due-reminders unaffected by merge change | unit | `node --test test/settings-tz.test.mjs && node --test test/due-reminders.test.mjs` | ❌ W0 | ⬜ pending |
| 44-03 zone list | 03 | 3 | TZ-01 | T-44-SC | Generator output: sorted, deduped, ≥300 zones, Paris present | unit | `node scripts/gen-timezones.mjs` + committed-module assertion | ❌ W0 | ⬜ pending |
| 44-03 combobox | 03 | 3 | TZ-01 | T-44-05, T-44-06 | esc() on interpolated labels; real save path to members[*].tz | unit | `npm run build && npm run i18n:scan && node --test test/settings-tz-combobox.test.mjs` | ❌ W0 | ⬜ pending |
| 44-03 wiring test | 03 | 3 | TZ-01 | T-44-05 | data-in/data-a hooks pinned; no runtime supportedValuesOf | unit | `node --test test/settings-tz-combobox.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/tz-resolve.test.mjs` — resolve funnel: legacy 5-label alias map, sixth legacy client default, Paris fallback, hostile input
- [ ] `test/tz-dedup.test.mjs` — dedup-under-tz-change edges (D-12) + ordering determinism
- [ ] `test/settings-tz.test.mjs` — save-path regression (self-tz-only carve-out, coerce-to-Paris)
- [ ] `test/settings-tz-combobox.test.mjs` — wiring regression (data-in/data-a hooks, no runtime supportedValuesOf)
- [ ] `test/tz-resolve.test.mjs` re-pin of `test/due-reminders.test.mjs:380-382` (empty-tz fallback UTC → Paris) with shifted clock instant

*Framework install: none needed — Node built-in test runner.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Timezone picker (searchable combobox, D-01) renders in member-profile Settings > Date & time with browser zone preselected (D-04) | TZ-01 | Browser UI rendering | Open Settings > Date & time; verify searchable combobox with live offsets (D-02), preselect, and explicit-save persistence |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
