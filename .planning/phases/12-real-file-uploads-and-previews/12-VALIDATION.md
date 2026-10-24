---
phase: "12"
slug: "real-file-uploads-and-previews"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-24"
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from 12-RESEARCH.md § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (Node 24), plus Playwright for browser flows |
| **Config file** | none for node:test (`test/*.test.mjs` glob); `e2e/playwright.config.mjs` for Playwright |
| **Quick run command** | `node --test test/upload.test.mjs test/error-codes.test.mjs -x` |
| **Full suite command** | `npm test` (node --test --test-concurrency=2 test/*.test.mjs) and `npm run e2e` |
| **Estimated runtime** | ~30 seconds (node:test), ~2 min with e2e |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/upload.test.mjs test/error-codes.test.mjs -x`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** `npm test` + `npm run e2e` must be green
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | UPLOAD-01 | T-12-* (V7/V14) | Auth-gated storage under `DATA_DIR/files/<id>` | integration | `node --test test/upload.test.mjs -x` | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 1 | UPLOAD-02 | T-12-* | Oversize → 413 `uploadTooLarge`, both catalogues | integration | `node --test test/upload.test.mjs -x` | ❌ W0 | ⬜ pending |
| 12-02-01 | 02 | 2 | UPLOAD-03 | T-12-* | File route 404s outsiders (no existence oracle) | integration | `node --test test/upload.test.mjs -x` | ❌ W0 | ⬜ pending |
| 12-02-02 | 02 | 2 | UPLOAD-04 | T-12-* | Safe fixed Content-Type; svg never inline | integration | `node --test test/upload.test.mjs -x` | ❌ W0 | ⬜ pending |
| 12-02-03 | 02 | 2 | UPLOAD-05 | T-12-* | Doc-PUT diff unlinks removed binaries (D-04) | integration | `node --test test/upload.test.mjs -x` | ❌ W0 | ⬜ pending |
| 12-03-01 | 03 | 2 | PREVIEW-01 | — | XHR onprogress, no `setInterval` in upload path | static | `npm test` (static assertion) | ❌ W0 | ⬜ pending |
| 12-03-02 | 03 | 2 | PREVIEW-02 | — | Failed upload → no record, toast shown (D-11) | unit | node:test harness | ❌ W0 | ⬜ pending |
| 12-03-03 | 03 | 2 | PREVIEW-03, LINK-01 | — | Real img/pdf preview; copied link opens preview | e2e | `npm run e2e` | ❌ W0 | ⬜ pending |
| 12-04-01 | 04 | 3 | I18N-01 | — | New literals + error codes in en/fr catalogues | static | `npm run build` + `npm test` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/upload.test.mjs` — new integration suite for the endpoint + file route (UPLOAD-01…05), using `test/helpers/server.mjs` `startServer({ dataDir })` harness [VERIFIED]
- [ ] One e2e case in `e2e/flows.spec.mjs` or a new spec for PREVIEW-03 / LINK-01
- [ ] Framework install: none needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PDF renders in-app in a real browser (iframe/CSP interplay) | PREVIEW-03 | Playwright asserts presence, not visual fidelity | Open a workspace with a PDF, confirm the inline preview renders and pages turn |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
