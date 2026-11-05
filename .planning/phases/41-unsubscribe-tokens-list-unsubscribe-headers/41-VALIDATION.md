---
phase: "41"
slug: "unsubscribe-tokens-list-unsubscribe-headers"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-05"
---

# Phase 41 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (built-in, Node v24.21.0) |
| **Config file** | none — glob via package.json `"test": "node --test --test-concurrency=2 test/*.test.mjs"` [VERIFIED: package.json:18] |
| **Quick run command** | `node --test test/unsubscribe-token.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | <30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test` (full suite is fast — pure node:test, no heavy deps)
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite green + `npm run i18n:scan` green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (to be filled by planner) | 01 | 1 | UNSUB-01 | T-41-01 | token deterministic; base64url alphabet; version byte first; purpose-tag separation | unit | `node --test test/unsubscribe-token.test.mjs` | ❌ W0 | ⬜ pending |
| (to be filled by planner) | 01 | 1 | UNSUB-01 | T-41-02 | tamper (flip payload/MAC byte) → verification fails; timing-safe compare | unit | `node --test test/unsubscribe-token.test.mjs` | ❌ W0 | ⬜ pending |
| (to be filled by planner) | 02 | 1 | UNSUB-01 | T-41-03 | digest with https URL carries both RFC 8058 headers | integration | `node --test test/digest.test.mjs` | ⚠️ extend | ⬜ pending |
| (to be filled by planner) | 02 | 1 | UNSUB-01 | — | missing/unsub URL or `http://` → NO List-Unsubscribe headers; footer still renders | integration | `node --test test/digest.test.mjs` | ⚠️ extend | ⬜ pending |
| (to be filled by planner) | 02 | 1 | UNSUB-03 | — | footer link text + settings URL in both text and HTML parts | integration | `node --test test/digest.test.mjs` | ⚠️ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/unsubscribe-token.test.mjs` — unit stubs for UNSUB-01 (token format pinning, tamper, purpose separation, timing-safe verify)
- [ ] https `APP_URL` fixture variant in `test/digest.test.mjs` — header-positive tests (existing fixture is `http://app.test`, which lands on the header-omitted path)
- [ ] Framework install: none needed — node:test is built-in

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live DKIM-authenticated relay honors one-click POST | UNSUB-01 (SC-4) | DKIM signing happens at the user's relay, not in the repo | Deploy to a staging instance with `MASTER_KEY` set; send a digest through the real relay; verify `List-Unsubscribe*` headers survive DKIM and that the one-click POST in a mail client flips `email_digest` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
