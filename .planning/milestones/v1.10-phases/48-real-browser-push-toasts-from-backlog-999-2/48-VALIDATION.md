---
phase: "48"
slug: "real-browser-push-toasts-from-backlog-999-2"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-07"
updated: "2026-11-07"
---

# Phase 48 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in) via `npm test` |
| **Config file** | none — glob convention (test/*.test.mjs) |
| **Quick run command** | `node --test test/browser-push.test.mjs` |
| **Full suite command** | `npm test` (+ `npm run i18n:scan` gate) |
| **Estimated runtime** | ~50 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/browser-push.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 50 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 48-01-01 | 01 | 1 | PUSH-01/02 | — | i18n keys localized EN+FR, no raw-sweep breach | unit (catalogue pin) | `node --test test/i18n-core-features.test.mjs` | ✅ | ✅ green |
| 48-01-02 | 01 | 1 | PUSH-01/02 | T-48-02 / T-48-03 | sw.js: NO fetch/install/activate/import; click URL same-origin via `new URL` | unit (structural assert) | `node --test test/browser-push.test.mjs` | ✅ | ✅ green |
| 48-01-03 | 01 | 1 | PUSH-02 | T-48-01 / T-48-04 | toast line is plain text (no markup); per-type pref gates; seen-set dedupe | unit (deriveCandidates seam) | `node --test test/browser-push.test.mjs` | ✅ | ✅ green |
| 48-02-01 | 02 | 2 | PUSH-03 | T-48-06 | badge label from catalogue via esc()ing template path; no user-controlled string | unit | `node --test test/browser-push.test.mjs` + `node --test test/unsubscribe-route.test.mjs` | ✅ | ✅ green |
| 48-02-02 | 02 | 2 | PUSH-03 | — | requestPermission only behind user gesture (RED→GREEN) | unit | `node --test test/browser-push.test.mjs` | ✅ | ✅ green |
| 48-02-03 | 02 | 2 | PUSH-01/02/03 | T-48-07 | one-time blocked toast; live badge clear on poll; D-12: zero installs | unit | `node --test test/browser-push.test.mjs` + `node --test test/dependencies.test.mjs` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Full-suite evidence (2026-11-07, post-wave-2): `npm test` 1084 tests, 1080 pass, 1 fail — the pre-existing totp-rewrap D-74 EACCES environmental failure (STATE.md Deferred Items, v1.9; unrelated to this phase). Build gate `vite build` green.

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements (browser-push.test.mjs harness built by 48-01 Task 2).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real browser permission prompt → enable → hidden-tab Notification | PUSH-01 | Browser Notification/permission APIs cannot run under node:test stubs | Open Settings → Notifications → toggle browser push, accept the browser prompt, hide the tab, trigger a mention from another user, confirm the OS notification appears and clicking it focuses/navigates |
| Blocked-permission UX: derived badge + one-time explanatory toast (D-48-4) | PUSH-03 | Requires real browser permission-denied state | Block notifications for the origin in browser settings, reload, open Settings → confirm the "browser blocked" badge (no reload needed after re-allow + poll) and that the explanatory toast fires exactly once |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none)
- [x] No watch-mode flags
- [x] Feedback latency < 50s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-11-07

## Validation Audit 2026-11-07
| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
