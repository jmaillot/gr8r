---
phase: "18"
slug: "closing-verification-i18n-migration-proof-real-device-uat"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-27"
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in `node --test` runner (unit/migration) + Playwright-style Chromium e2e spec runner (`flows.spec.mjs` pattern) |
| **Config file** | `test/` directory; e2e setup in `test/setup.mjs` (from RESEARCH.md — verify exact paths at plan time) |
| **Quick run command** | `node --test test/migration.test.mjs` |
| **Full suite command** | `npm test` + e2e suite (`flows.spec.mjs`) + `node scripts/i18n-scan.mjs` |
| **Estimated runtime** | ~seconds for unit; e2e suite ~minutes (Chromium boot + 3 flows × 2 locales) |

---

## Sampling Rate

- **After every task commit:** Run the plan's task-scoped `<automated>` command (typically `node --test test/migration.test.mjs` or the touched e2e spec)
- **After every plan wave:** Run full gates: `node scripts/i18n-scan.mjs && npm test && e2e suite && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** e2e-only tasks may take minutes; unit/migration tasks seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | AUTH-01 | T-18-01 | N/A (i18n coverage) | gate | `node scripts/i18n-scan.mjs` | ✅ | ⬜ pending |
| 18-01-02 | 01 | 1 | AUTH-02 | T-18-02 | auth fields never leak to workspace JSON; second boot byte-identical | migration | `node --test test/migration.test.mjs` | ✅ | ⬜ pending |
| 18-02-01 | 02 | 1 | AUTH-03 | T-18-03 | e2e proves revocation + 2FA login in EN/FR | e2e | `flows.spec.mjs` run (per-research invocation) | ✅ | ⬜ pending |
| 18-02-02 | 02 | 1 | AUTH-03 | T-18-04 | 2FA login happy path + wrong-code death in both locales | e2e | same spec | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Note:** The planner MUST update this map with the final task IDs, commands (verbatim, including `clientIp(run, tag)`-safe fixtures), and threat refs once plans are written. WR-01/WR-02 fix tasks verify via the e2e suite plus `npm test`.

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* All test files, e2e specs, and the i18n gate already exist and are green per RESEARCH.md — no stubs or installs needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| QR code enrollment verified by human eyes on a real device | AUTH-03 | Physical device + camera; two authenticator apps required | 1. Display TOTP QR in app. 2. Enroll in Google Authenticator on a real phone. 3. Confirm generated 6-digit code accepts. 4. Repeat with a second authenticator app (e.g. Aegis/Authy/1Password). 5. Record which apps passed in UAT notes. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < minutes (e2e accepted as upper bound)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
