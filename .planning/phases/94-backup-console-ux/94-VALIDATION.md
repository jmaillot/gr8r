---
phase: "94"
slug: "backup-console-ux"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-24"
---

# Phase 94 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (static source assertions + unit), Playwright e2e |
| **Config file** | package.json scripts; `e2e/playwright.config.mjs` |
| **Quick run command** | `node --test test/backup-cron.test.mjs test/backup-history-client.test.mjs test/backup-tasks-api.test.mjs` |
| **Full suite command** | `npm test` + `npm run build` (i18n-scan prebuild gate) |
| **Estimated runtime** | seconds (target files); build gate per key-changing commit |

---

## Sampling Rate

- **After every task commit:** Run the quick node:test command on touched files
- **After every plan wave:** Run `npm test` + `npm run build`
- **Before `/gsd-verify-work`:** Full suite + e2e green
- **Max feedback latency:** seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 94-T0 | 94-PLAN | 1 | BKUI-02 / BKUI-04 (Wave 0) | — | RED cronToPreset unit cases; e2e scaffold w/ account+Restore-Op grant | unit RED + scaffold | `node --test test/backup-cron.test.mjs` (RED) | ✅ extend / ❌ W0 | ⬜ pending |
| 94-T1 | 94-PLAN | 1 | BKUI-02 | — | cronToPreset in export/cron.js (GREEN) + additive schedule.preset (+dom/mon) on backupTaskShape; no routes touched | unit | `node --test test/backup-cron.test.mjs` | ✅ extend | ⬜ pending |
| 94-T2 | 94-PLAN | 1 | BKUI-01 | — | real table; humanized schedule from `task.schedule`; next_run_at cell; 4-state badge incl. checksum warning | static | `node --test test/backup-history-client.test.mjs && npm run build` | ✅ extend | ⬜ pending |
| 94-T3 | 94-PLAN | 1 | BKUI-02 / BKUI-03 | — | Edit pre-fills preset/fields keeping `cronDirty=false` guard; header above form; 4 retention inputs staged+sent; gfs keys ×5 as labels | unit + static + parity ×5 | `node --test test/backup-history-client.test.mjs test/backup-cron.test.mjs && npm run build` | ✅ extend | ⬜ pending |
| 94-T4 | 94-PLAN | 1 | BKUI-04 | — | unified sblock with 3 selects (status enum excludes interrupted/skipped_overlap) + limit/offset probing; label rendered verbatim; manual hint; historyCard retired; route unchanged | static | `node --test test/backup-history-client.test.mjs && npm run build` | ✅ extend | ⬜ pending |
| 94-T5 | 94-PLAN | 1 | BKUI-04 | — | unified history fail-closed per-row + Restore-Op e2e pin (names-not-ids); static negatives extended (no cron logic under src/) | static + route + e2e | `node --test test/backup-scopes.test.mjs test/backup-history-client.test.mjs && npm run build`; `npm run e2e` | ✅ / ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `e2e/backup-console-restore-op.spec.mjs` — grant Restore-Op via instanceRoleGrant harness, drive unified history fail-closed
- [ ] cronToPreset describeCron-consistency cases in test/backup-cron.test.mjs

---

## Manual-Only Verifications

- Visual pass over the task table + editor header + retention row at verify-work (real eyeball on the rendered page).
