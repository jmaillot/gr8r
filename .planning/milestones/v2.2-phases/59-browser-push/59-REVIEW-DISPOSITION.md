---
phase: 59-browser-push
disposition: 2026-11-13
source: 59-REVIEW.md
summary: 2 critical fixed in-phase, 6 warnings open (documented), 3 info open
---

# 59-REVIEW-DISPOSITION.md

One row per finding from `59-REVIEW.md`. `fixed` rows carry their fix commit; `open` rows remain documented for a future wave — none block.

| Finding | Severity | Disposition | Detail |
|---------|----------|-------------|--------|
| CR-01 cross-owner endpoint hijack (POST replace unscoped) | critical | **fixed** | `server.js` POST now scopes the replace lookup to (endpoint, workspace, session user); any foreign row → honest 409 `pushEndpointOwned` (EN+FR key, catalogue pin 1865→1866). Also closes the same-user cross-workspace silent clobber. |
| CR-02 SW never registered on SPA-login path + `_enabling` latch | critical | **fixed** | `registerSw()` moved to `push.js`; `enterApp()` re-fires it on every login path; every `serviceWorker.ready` waiter bounded by `swReady()` (8s) so failures toast (`err.pushSubscribeFailed`) and `finally` always runs. |
| VAPID file 0600 applied only at creation | warning | open | Documented; DEPLOY.md §16 runbook is owner-operated. |
| Half-set VAPID env silently ignored | warning | open | Loud warn on regen exists; partial-env guard deferred. |
| Hardcoded French `'Un membre'` fallback in push titles | warning | open | Cosmetic locale fallback; catalogue path otherwise localized. |
| Fixed SW tag `'gr8r-push'` collapses notification bursts | warning | open | Deliberate D-12 trade-off candidate; needs owner UX ruling. |
| Disable/unsubscribe toast success on failed calls | warning | open | Minor honesty gap in error toasts. |
| `sendPushFor` awaited in doc-PUT response path, no timeout | warning | open | Contract says never block; measured latency small; needs a bounded-send wrapper. |
| (info ×3) | info | open | See 59-REVIEW.md. |
