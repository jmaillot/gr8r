---
phase: "8"
slug: "per-user-locale-the-honest-selector"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-23"
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (node --test) |
| **Config file** | none — test/*.test.mjs discovered by the runner |
| **Quick run command** | `node --test test/i18n-locale.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/i18n-locale.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

*Regenerated from the plans' `<automated>` verify blocks — plan 08-01 Task 1, 08-01 Task 2, 08-02 Task 1, 08-02 Task 2, 08-03 Task 1, 08-03 Task 2.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 1 | LOC-03, LOC-04, LOC-05 | T-8-01 / T-8-02 / T-8-03 / T-8-04 | SameOrigin 403 gate; mass-assignment guard; server-side locale whitelist; session-scoped UPDATE | unit (real server + SQLite) | `node --test test/locale-account.test.mjs test/migration.test.mjs` + `grep -c "auth/me' && method === 'PATCH'" server.js` | ⬜ | ⬜ pending |
| 8-01-02 | 01 | 1 | LOC-04 | T-8-SC | Legacy key stripped at both merge points; throwaway map deleted | unit + source grep | `node --test test/i18n-locale.test.mjs test/i18n-prefs.test.mjs` + `! grep -q "LANG_TO_LOCALE" src/core/theme.js && grep -c "lang:" src/core/store.js \| grep -qx "0"` | ⬜ | ⬜ pending |
| 8-02-01 | 02 | 2 | LOC-03, LOC-06 | T-8-05 | Negotiation is client-only; navigator.languages never transmitted | unit (bare Node) | `node --test test/locale-negotiate.test.mjs` | ⬜ | ⬜ pending |
| 8-02-02 | 02 | 2 | LOC-03, LOC-06 | T-8-06 | Seed calls only the gated PATCH with a hardcoded registry code; never touches the workspace row | unit + source-order assertions | `node --test test/locale-negotiate.test.mjs test/i18n-locale.test.mjs` + `grep -q "primeLocale" src/main.js` | ⬜ | ⬜ pending |
| 8-03-01 | 03 | 3 | LOC-01, LOC-02 | T-8-07 | langSel handler sends only {locale: code} to the gated endpoint; no doc write path reachable | unit + source assertion + build gates | `node --test test/i18n-pages.test.mjs test/i18n-locale.test.mjs && npm run build` + `test "$(grep -rE 'Deutsch\|English \(UK\)\|English \(US\)\|Español\|日本語' src --exclude-dir=locales \| wc -l)" = "0"` | ⬜ | ⬜ pending |
| 8-03-02 | 03 | 3 | LOC-01, LOC-06 | T-8-08 | No-flash first paint, no-reload switch, per-IP throttle-safe fixtures | e2e (Chromium) | `npm run e2e -- --grep locale` then `npm run e2e` | ⬜ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/i18n-locale.test.mjs` — existing; extended for LOC-01..LOC-06 (08-01 Task 2, 08-02 Task 2)
- [ ] `test/i18n-prefs.test.mjs` — existing; update the language pass-through case (08-01 Task 2)
- [ ] `test/migration.test.mjs` — existing; extend snapshot() to include users rows (08-01 Task 1, LOC-05)
- [ ] `test/locale-account.test.mjs` — new suite seeded in Wave 0 alongside Task 1 (08-01)
- [ ] `test/locale-negotiate.test.mjs` — new suite seeded in Wave 0 alongside Task 1 (08-02)
- [ ] `e2e/locale.spec.mjs` — new spec seeded in Wave 0 alongside Task 2 (08-03)
- [ ] No framework install needed — node:test is built in; Playwright already configured

*New suites are stubbed/seeded in Wave 0 so their `<automated>` commands never fail on a missing file.*

---

## Manual-Only Verifications

*None — every behavior in the register is covered by an automated check. The second-boot byte-identical no-op (previously listed as manual) is automated under **LOC-05**: the extended snapshot() in `test/migration.test.mjs` deep-equals the full data dir (including users.locale) across a second boot (08-01 Task 1). LOC-06's no-flash/no-reload timing is automated in the e2e spec (08-03 Task 2).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
