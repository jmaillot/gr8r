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
| (planner fills) | | | BKUI-01 | — | real table; humanized schedule from `task.schedule`; next_run_at cell; 4-state badge incl. checksum warning | static | `node --test test/backup-history-client.test.mjs` | ✅ extend | ⬜ pending |
| (planner fills) | | | BKUI-02 | — | cronToPreset unit cases; Edit pre-fills preset/fields keeping `cronDirty=false` guard; header above form | unit + static | `node --test test/backup-cron.test.mjs` | ✅ extend | ⬜ pending |
| (planner fills) | | | BKUI-03 | — | 4 retention inputs staged in S.ui.backupTaskForm.retention, sent on save; gfs keys ×5 as labels | static + parity ×5 | `node --test test/backup-history-client.test.mjs` | ✅ extend | ⬜ pending |
| (planner fills) | | | BKUI-04 | — | unified sblock with 3 selects + limit/offset; label rendered verbatim; manual hint; fail-closed (server-side); Restore-Op e2e pin | static + route + e2e | `node --test test/backup-scopes.test.mjs` + Playwright spec | ✅ / ❌ W0 | ⬜ pending |
| (planner fills) | | | i18n ×5 | — | ~13–18 new keys ×5 parity; i18n-scan gate green (add+use same commit) | catalogue-pin + build | `npm run build` + parity asserts | pattern exists | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `e2e/backup-console-restore-op.spec.mjs` — grant Restore-Op via instanceRoleGrant harness, drive unified history fail-closed
- [ ] cronToPreset describeCron-consistency cases in test/backup-cron.test.mjs

---

## Manual-Only Verifications

- Visual pass over the task table + editor header + retention row at verify-work (real eyeball on the rendered page).
