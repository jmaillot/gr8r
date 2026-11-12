---
phase: "57"
slug: "views-columns-general-access"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-12"
---

# Phase 57 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (`node --test test/*.test.mjs`), Playwright e2e |
| **Config file** | package.json test scripts (none dedicated) |
| **Quick run command** | `node --test test/views.test.mjs test/catalogue.test.mjs` |
| **Full suite command** | `npm test && npm run lint && node scripts/i18n-scan.mjs && npm run e2e` |
| **Estimated runtime** | ~60 s (unit), ~5 min (full incl. e2e) |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run `npm test` (full unit suite + build gate)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 57-01-1 | 01 | 1 | VIEW-01 | T-57-01, T-57-03 | user_id from session; blob whitelist/merge | unit | `node --test test/views-columns.test.mjs` | ❌ W0 | ⬜ pending |
| 57-01-2 | 01 | 1 | VIEW-01 | T-57-02 | three-site strip / no doc.views resurrection | unit | `node --test test/views-migration.test.mjs` | ❌ W0 | ⬜ pending |
| 57-01-3 | 01 | 1 | VIEW-01 | — | — | full chain | `node --test test/build-chunk-size.test.mjs && npm test && npm run lint && node scripts/i18n-scan.mjs && npm run e2e` | ✅ | ⬜ pending |
| 57-02-1 | 02 | 2 | VIEW-02 | T-57-04, T-57-05 | caps (20/2 kB), name uniqueness, member-boundary | unit | `node --test test/saved-views.test.mjs` | ❌ W0 | ⬜ pending |
| 57-02-2 | 02 | 2 | VIEW-02 | T-57-06 | snapshot whitelist (no `q`/`_` transients) | unit + gates | `npm test && node scripts/i18n-scan.mjs && npm run lint` | ✅ | ⬜ pending |
| 57-02-3 | 02 | 2 | VIEW-02 | — | — | full chain + e2e | `node --test test/build-chunk-size.test.mjs && npm test && npm run lint && node scripts/i18n-scan.mjs && npm run e2e` | ✅ | ⬜ pending |
| 57-03-1 | 03 | 2 | VIEW-03 | T-57-07 | stored-doc-only pref read; fail-closed normalize | unit | `node --test test/default-private.test.mjs` | ❌ W0 | ⬜ pending |
| 57-03-2 | 03 | 2 | VIEW-03 | — | — | full chain + e2e | `node --test test/build-chunk-size.test.mjs && npm test && npm run lint && node scripts/i18n-scan.mjs && npm run e2e` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Planner fills the full map; Wave 0 creates any MISSING test scaffolds.)*

---

## Wave 0 Requirements

- [ ] `test/views-columns.test.mjs` — sanitize/merge/live-row contract (VIEW-01, tracer)
- [ ] `test/views-migration.test.mjs` — doc.views → owner rows sweep + strip (VIEW-01)
- [ ] `test/saved-views.test.mjs` — caps, uniqueness, lenient load, DELETE (VIEW-02)
- [ ] `test/default-private.test.mjs` — stored-doc pref read + createProject seed (VIEW-03)
- [ ] Existing suite: `npm test` covers build gates + i18n scan from Phase 56

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Column visibility choice survives sign-in on a second device | VIEW-01 | Cross-device | Sign in on device A, hide column; sign in on device B; verify column hidden |
| Named saved view applied + deleted from another device | VIEW-02 | Cross-device | Save view on A; apply then delete on B |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
