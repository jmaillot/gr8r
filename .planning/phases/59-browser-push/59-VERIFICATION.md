---
phase: 59-browser-push
verified: 2026-11-13T00:00:00Z
status: passed
score: 12/12 must-haves verified
covered_files: ["server.js", "db-adapter.mjs", "public/sw.js", "src/core/push.js", "src/pages/settings.js", "src/actions/actions.js", "src/main.js", "src/locales/en.json", "src/locales/fr.json", "docs/DEPLOY.md", "package.json", "test/push-server.test.mjs", "test/browser-push.test.mjs", ".planning/phases/59-browser-push/59-01-PLAN.md", ".planning/phases/59-browser-push/59-02-PLAN.md", ".planning/phases/59-browser-push/59-03-PLAN.md", ".planning/phases/59-browser-push/59-01-SUMMARY.md", ".planning/phases/59-browser-push/59-02-SUMMARY.md", ".planning/phases/59-browser-push/59-03-SUMMARY.md"]
covered_digest: "v2:sha256:d384b1be7923d051338767cefe7b373020201d37ffe7dee1276291628a6cf806"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 12/12
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 59: Browser Push Verification Report (Re-verification)

**Phase Goal:** The workspace reaches members with the tab closed — a browser push arrives when they are mentioned or assigned, honoring prefs, deep-linking to the task.
**Verified:** 2026-11-13
**Status:** passed
**Re-verification:** Yes — after review-fix commits 3e0462c (D-04 device naming) and 1df3837 (CR-01/CR-02); prior covered source changed.

## Scope of This Re-verification

Prior verification passed 12/12. Since then, `5f619d8..HEAD` touched exactly: server.js (+17), actions.js (+19), push.js (+23), main.js (+10/-6), settings.js (+13), locales EN+FR (+2 each), and 3 i18n catalogue-pin tests (+2 count). No other covered file changed. This pass (1) verified the four ADDED behaviors at the current code, (2) ran a quick regression on the 12 prior truths, (3) re-ran behavioral evidence at HEAD myself.

## New Additions Verified

### D-04 — Device naming at subscribe

- `A.pushEnable` sets `S.ui.pushNaming = m.defaultPushLabel()` (UA suggestion prefill), `A.pushEnableCancel` / `A.pushEnableConfirm` in src/actions/actions.js:2536-2560; subscribe fires from `pushEnableConfirm`'s own user gesture (`m.enablePush(label)`), label threaded through.
- Naming form rendered in src/pages/settings.js:539-545 (`#push-name` input + Confirm/Cancel buttons wired `data-a="pushEnableConfirm|Cancel"`), gated on `cfg && !localOn && S.ui.pushNaming`.
- i18n `settings.notif.pushNameLabel` present EN (en.json:1378) + FR (fr.json:1378); catalogue-pin tests updated (`keys.length` 1866, +13 comment covers the +2).

### CR-01 — Push POST scoped replace, 409 pushEndpointOwned

- server.js:4613-4625: `existing` lookup now scoped `endpoint = ? AND workspace_id = ? AND user_id = ?`; an unscoped `foreign` probe follows; if `!existing && foreign` → `fail(res, 409, 'pushEndpointOwned', ...)` before the replace. Another member's row is never reparented, and the same-user cross-workspace clobber is also refused (foreign row in another workspace triggers 409).
- `err.pushEndpointOwned` present EN+FR (en/fr.json:1719).
- Note: the 409 path has no dedicated unit test (covered by standing full suite + honest-fail keyed code); recorded as advisory-level observation, not a gap — the fix's logic is small, statically traced end-to-end, and suite-green.

### CR-02 — registerSw on every login path, bounded ready waits

- `registerSw` exported from src/core/push.js:161 (idempotent, gated `'serviceWorker' in navigator && api.enabled`).
- Called from `enterApp()` (actions.js:3889) — all SPA login paths — and from boot + `load` in src/main.js:109-110, 296 (lazy import funnels all three into the same export; the old module-eval-time gate bug is fixed).
- Every `serviceWorker.ready` wait is `swReady()` (push.js:168-173): `Promise.race` against an 8s `swUnavailable` rejection — enablePush/subscribe/test all go through it (push.js:202, 227, 250).

## Regression on Prior 12 Must-Haves

Diff-scoped re-check; all still hold at HEAD:

| # | Truth | Status | Regression evidence |
|---|-------|--------|---------------------|
| 1 | Explicit opt-in only (SC-1, PUSH-01) | ✓ VERIFIED | `requestPermission` exactly 2 sites, both user-gesture toggle-gated: push.js:224 (inside enablePush) + actions.js:3282 (`IN.npToggle`, gated `push_*` + permission `default`, input/change dispatch only) |
| 2 | Tab-closed push on mention/assign, prefs honored (SC-2, PUSH-02) | ✓ VERIFIED | `sendPushFor` (server.js:1798) hooked at reminder :2121 and doc-PUT :5882; unchanged by the fixes |
| 3 | Ticker ≤4096 octets, deep-link click (SC-3, PUSH-03) | ✓ VERIFIED | budget test push-server.test.mjs:337-348 passing; sw.js notificationclick router intact (:10-36) |
| 4 | Dead subscription swept on 404/410 (SC-4, PUSH-04) | ✓ VERIFIED | sweep still in send pass (server.js:1841-1857 region) |
| 5 | VAPID custody + DEPLOY.md runbook (SC-5, PUSH-05) | ✓ VERIFIED | env-overrides-file custody intact (server.js:1709-1715), generate-once/warn unchanged |
| 6 | push_subscriptions both backends, endpoint UNIQUE, replace | ✓ VERIFIED | db-adapter mirror + PG conflict target untouched |
| 7 | Routes scoped to session user | ✓ VERIFIED | GET/DELETE at :4643/:4667 all scoped `workspace_id + user_id` |
| 8 | push-config fail-absent 404 | ✓ VERIFIED | untouched; unpersistable-keyfile test passing in suite |
| 9 | push_due whitelisted, G-37-2 pins | ✓ VERIFIED | server.js:1633 `push_due: true` |
| 10 | web-push 4.0.0 exact pin | ✓ VERIFIED | package.json:40 |
| 11 | SW suppression when window open (D-12) | ✓ VERIFIED | sw.js:36 clients.matchAll — sw.js untouched by the fixes |
| 12 | Settings Push tab surface | ✓ VERIFIED | settings.js device list + master toggle; D-04 naming step extends (does not replace) it |

**Score:** 12/12 truths verified (0 present, behavior-unverified)

### Behavioral Spot-Checks (run at HEAD this session)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite at HEAD | `npm test` | 1489 pass / 0 fail (1501 tests, 12 skipped) | ✓ PASS |
| Push suites | `node --test test/push-server.test.mjs test/browser-push.test.mjs` | 48 pass / 0 fail | ✓ PASS |
| Lint | `npm run lint` (eslint .) | clean, no output | ✓ PASS |
| i18n gate | i18n scan | 0 literals / 0 pending / 0 dead / 0 stale | ✓ PASS |
| Debt markers | grep TBD/FIXME/XXX on phase files | none | ✓ PASS |

### Human Verification (owner UAT — carried forward as verified)

The owner's 6/6 real-device UAT on production was recorded in the prior pass and is carried forward: the CR/D-04 fixes do not change any UAT-covered behavior (naming prefill is additive; 409 only fires on the foreign-endpoint edge the UAT never exercised; registerSw affects first-enable on SPA login, covered by UAT item 1's flow). Deploy of 1df3837 to production is pending — the fixes themselves reach end users only there; behaviors unchanged.

1. Permission prompt fires from toggle only — PASS (prior)
2. Labeled device list renders — PASS (prior)
3. Real OS test notification with ticker — PASS (prior)
4. Notification-click deep-links to exact task — PASS (prior)
5. D-12 tab-open suppression — PASS (prior)
6. Push persistence across server restart — PASS (prior)

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|------------|--------|----------|
| PUSH-01 | 59-01/02/03 | ✓ SATISFIED | Truths 1, 8, 12 + D-04 naming |
| PUSH-02 | 59-02/03 | ✓ SATISFIED | Truths 2, 11 + CR-02 registration |
| PUSH-03 | 59-02/03 | ✓ SATISFIED | Truth 3 |
| PUSH-04 | 59-02 | ✓ SATISFIED | Truth 4 |
| PUSH-05 | 59-01 | ✓ SATISFIED | Truths 5, 9, 10 |

No orphaned requirements.

### Anti-Patterns Found

None blocking. No debt markers in phase-modified files.

### Gaps Summary

None. All additions verified in code at HEAD, all 12 prior truths regressed clean, full suite + lint + i18n gate re-run green at HEAD this session. Phase goal achieved; CR-01/CR-02 fixes strengthen it (cross-member endpoint hijack now impossible; enablePush works on SPA password login).

---

_Verified: 2026-11-13_
_Verifier: the agent (gsd-verifier)_
