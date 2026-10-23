---
phase: "07"
slug: "french-catalogue-french-typography"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: true
created: "2026-10-23"
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (unit/contract) + Playwright Chromium (browser) |
| **Config file** | `package.json` scripts; `e2e/playwright.config.mjs` |
| **Quick run command** | `node --test test/catalogue.test.mjs test/french-typography.test.mjs` |
| **Full suite command** | `npm test` · `npm run build` (prebuild gate) · `npm run e2e` |
| **Estimated runtime** | ~11 s unit · ~2 s build · ~20 s e2e |

---

## Sampling Rate

- **After every task commit:** Run the task's `<automated>` command (see map below)
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 s (unit) / ~25 s (e2e)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | I18N-05 | T-07-03 | D-04 typography rules enforced on the catalogue | unit | `node --test test/french-typography.test.mjs` | ✅ | ✅ green (9/9) |
| 07-01-02 | 01 | 1 | I18N-02 | — | D-01 label→locale mapping, loop guard, D-02 `<html lang>` | unit | `node --test test/i18n-locale.test.mjs` | ✅ | ✅ green (9/9) |
| 07-01-03 | 01 | 1 | I18N-02 | — | D-07 en→fr completeness gate (RED until batch C) | unit | `node --test test/catalogue.test.mjs` | ✅ | ✅ green (26/26 since 07-06) |
| 07-02-01 | 02 | 2 | I18N-02 | T-07-05/06 | billing removed end-to-end; legacy `plan`/`invoices` tolerated | unit | `npm test` (membership/revision/tenancy rewritten) | ✅ | ✅ green |
| 07-03-01 | 03 | 3 | I18N-07 | — | stored vocabulary ids pinned; labels via `t()` | unit | `node --test test/i18n-vocab.test.mjs` | ✅ | ✅ green (15/15) |
| 07-03-02 | 03 | 3 | I18N-07 | — | templates/notifications/estimates render translated | unit | `node --test test/i18n-format.test.mjs` | ✅ | ✅ green (27/27) |
| 07-04-01 | 04 | 4 | I18N-02 | T-07-10 | batch A translated; en.json untouched | unit | `node scripts/fr-parity.mjs page a11y` | ✅ | ✅ green |
| 07-05-01 | 05 | 5 | I18N-02 | T-07-12 | batch B translated; en.json untouched | unit | `node scripts/fr-parity.mjs settings act toast modal err` | ✅ | ✅ green |
| 07-06-01 | 06 | 5 | I18N-02 | T-07-13/14/15 | 100 % en→fr parity; plural one+other | unit | `npm test` (362/362) | ✅ | ✅ green |
| 07-07-01 | 07 | 6 | I18N-02, I18N-07 | — | French renders in a browser, fits the chrome at 1280/390 px, no render loop | e2e | `npm run e2e -- --grep french-overflow` | ✅ | ✅ green (6/6) |
| 07-07-02 | 07 | 6 | I18N-02, I18N-05, I18N-07 | — | full phase chain green | suite | `npm test` · `npm run build` · `npm run e2e` | ✅ | ✅ green (362 / gate clean / 12/12) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Roadmap Success Criteria → Proof

| # | Criterion | Proven by |
|---|-----------|-----------|
| 1 | Every English key has a French value; every surface renders French | `node --test test/catalogue.test.mjs` (26/26 completeness) + `npm run e2e -- --grep french-overflow` (browser render proof) |
| 2 | French typography throughout (NBSP/NNBSP, guillemets, curly apostrophe) | `node --test test/french-typography.test.mjs` (9/9 over 1,449 values) |
| 3 | Stored vocabulary shown translated, stored ids unchanged | `node --test test/i18n-vocab.test.mjs` (15/15) + the I18N-07 browser test (`data-drop-col="todo"` with « À faire » rendered) |
| 4 | Longer French strings fit the fixed chrome at 1280 px and 390 px | `npm run e2e -- --grep french-overflow` (document-overflow and fixed-chrome checks per route, both viewports) + the D-16 human read-through |

---

## Wave 0 Requirements

Existing infrastructure covered all phase requirements — no Wave 0 scaffolding was needed
(the unit harness, the e2e server wrapper and Playwright Chromium predate this phase).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| The French reads as a French product (register, wording, tone) across all main routes | I18N-02 / D-16 | Register judgment cannot be automated | Follow `07-READ-THROUGH.md` in this directory: run the app, switch to Français, review each listed route, record wording fixes, sign off |
| Manual overflow spot-check on a real screen | D-15 | Browser heuristics do not cover font rendering quirks on real displays | Same session: eyeball the sidebar, top bar, modal footers and buttons at a small window width |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none existed)
- [x] No watch-mode flags
- [x] Feedback latency < 30 s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-23 (plan 07-07 execution; the D-16 human read-through remains the phase's exit criterion)
