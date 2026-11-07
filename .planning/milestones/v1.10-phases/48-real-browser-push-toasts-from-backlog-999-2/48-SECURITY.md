---
phase: "48"
slug: "real-browser-push-toasts-from-backlog-999-2"
status: secured
threats_total: 8
threats_closed: 8
threats_open: 0
threats_accepted: 1
register_authored_at_plan_time: true
asvs_level: 1
block_on: high
verified: "2026-11-07"
---

# Phase 48 — Security Threat Verification

> STRIDE register authored at plan time in 48-01/48-02 PLAN.md `<threat_model>` blocks.
> Verified post-execution at ASVS L1 grep depth (each mitigation backed by an automated assertion in `test/browser-push.test.mjs` or `test/dependencies.test.mjs`).

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Status | Evidence |
|-----------|----------|-----------|----------|-------------|--------|----------|
| T-48-01 | Tampering | src/core/push.js toast path + showNotification body | high | mitigate | ✅ CLOSED | Toast/notification text is a plain composed catalogue line (`t('toast.push*')`); toast.js applies `esc()` itself. Asserted: `browser-push.test.mjs:177` (toast line contains no `<`). |
| T-48-02 | Tampering | public/sw.js | high | mitigate | ✅ CLOSED | Structural elimination: sw.js has NO fetch/install/activate handlers and no imports. Asserted: `browser-push.test.mjs:126` + L1 scan (banned tokens: false). Served `no-cache` (server.js). |
| T-48-03 | Tampering | public/sw.js notificationclick | medium | mitigate | ✅ CLOSED | Click URL built only via `new URL(data?.url \|\| '/', self.location.origin)` — same-origin resolution. Asserted: `browser-push.test.mjs:124,156`. |
| T-48-04 | DoS | notifyNewEvents | low | mitigate | ✅ CLOSED | Per-type `push_*` pref gates (`deriveCandidates`, push.js:68-72), seen-set dedupe, 30s poll rate limit, `tag: gr8r-<id>` collapse (push.js:123). |
| T-48-05 | Information disclosure | notification title/body | low | accept | ✅ CLOSED (accepted) | Body mirrors inbox/email snippet exposure — same audience, same device. Accepted risk; see Accepted Risks below. |
| T-48-06 | Tampering | settings.js badge markup | low | mitigate | ✅ CLOSED | Badge label from catalogue via `t('settings.notif.pushBrowserBlocked')` in the esc()ing settings template path (settings.js:508); no user-controlled string reaches the badge. |
| T-48-07 | Tampering | public/sw.js (inherited) | high | mitigate | ✅ CLOSED | Renumbered from 48-02's inherited duplicate of T-48-02 (`ab3628c`). Plan 02 touched no SW file; SW structural prohibition re-verified post-both-waves. |
| T-48-SC | Tampering | npm installs (supply chain) | high | mitigate | ✅ CLOSED | Zero installs (D-12): `node --test test/dependencies.test.mjs` 2/2 green; package.json/Dockerfile untouched. |

## Accepted Risks

| Threat | Risk | Accepted | Rationale |
|--------|------|----------|-----------|
| T-48-05 | Notification body/title expose the same snippet text the user already receives in inbox + email | 2026-11-07 | No new information surface: same audience (workspace member), same device, no comment text beyond the existing 70-char snippet precedent. |

## Security Audit 2026-11-07
| Metric | Count |
|--------|-------|
| Threats found | 8 |
| Closed | 8 |
| Open | 0 |
