---
phase: 48-real-browser-push-toasts-from-backlog-999-2
verified: 2026-11-07T19:30:00Z
status: passed
score: 6/6 must-haves verified
covered_files:
  - public/sw.js
  - src/core/push.js
  - src/main.js
  - src/pages/settings.js
  - src/actions/actions.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/browser-push.test.mjs
  - test/i18n-core-features.test.mjs
  - test/unsubscribe-route.test.mjs
  - .planning/phases/48-real-browser-push-toasts-from-backlog-999-2/48-01-PLAN.md
  - .planning/phases/48-real-browser-push-toasts-from-backlog-999-2/48-02-PLAN.md
  - .planning/phases/48-real-browser-push-toasts-from-backlog-999-2/48-01-SUMMARY.md
  - .planning/phases/48-real-browser-push-toasts-from-backlog-999-2/48-02-SUMMARY.md

covered_digest: "v2:sha256:0f9a569ee55403170fba1225667e2792fc5ffe27800b22d342c0b571ab768d30"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 6/6
  gaps_closed:
    - "CR-01 advisory: sw.js click URL now structurally rejects absolute cross-origin / malformed URLs (d16e559 — origin equality check with '/' fallback)"
    - "WR-01 advisory: push seen-set re-primes per user+workspace seen key, so an SPA workspace switch seeds the target workspace backlog silently (5e3e4af — _primed boolean → _primedFor key memo)"
  gaps_remaining: []
  regressions: []
  note: "Re-run triggered by a stale covered_digest: three covered files changed after the prior 16:55Z stamp — public/sw.js (d16e559, CR-01 fix), src/core/push.js + test/browser-push.test.mjs (5e3e4af, WR-01 fix). Both commits are phase-48 review-disposition closure work, not regressions. Changed items got full re-verification; unchanged items got regression checks (all four test suites re-run green). Deploy-chain changes (Dockerfile 17:37, server.js 18:24) belong to Phase 45 (D-03 pg adapter) — server.js still serves sw.js no-cache (line 5272) and Dockerfile still COPYs dist/; package.json's new 'pg' dependency is the Phase 45 D-03 addition, not a D-12 violation for this phase."
human_verification:
  - test: "Real permission flow: open Settings → Notifications, toggle a push_* pref ON, accept the browser permission prompt, hide the tab, trigger a mention from another user, confirm the OS notification appears and clicking it focuses/navigates to the task"
    expected: "Browser prompt appears inside the click gesture; hidden tab yields exactly one OS notification per event; click focuses the existing tab or opens the same-origin deep link"
    why_human: "Browser Notification/permission APIs cannot run under node:test stubs; requires a real browser and a second user"
  - test: "Blocked-permission UX: block notifications for the origin in browser settings, reload, open Settings → Notifications, then re-allow and wait one poll tick"
    expected: "Each push_* row shows the derived 'Browser blocked'/'Navigateur bloqué' badge; the one-time explanatory toast fires exactly once on a denied toggle; the badge clears on the next poll render without a reload"
    why_human: "Requires a real browser permission-denied state and live Notification.permission reads that stubs cannot reproduce"
---

# Phase 48: Real browser push toasts from backlog 999.2 — Verification Report

**Phase Goal:** Real browser notifications replace the inert push_* toggles, and toast feedback lands for mention/assign events.
**Verified:** 2026-11-07T19:30:00Z
**Status:** human_needed (all must-haves re-verified; two live-browser flows remain manual-only)
**Re-verification:** Yes — stale digest refresh after CR-01/WR-01 closure commits; full goal-backward re-check on changed files, regression checks on the rest

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | New unseen mention/assign/comment row, gated by its push_* pref, produces exactly ONE feedback — browser Notification (via SW) when `document.hidden`, in-app toast when visible — never both (D-48-2) | ✓ VERIFIED | Re-read push.js post-5e3e4af: visible → `showToast(line)` + `continue`; hidden → permission check then `reg.showNotification()` with constructor fallback. Branches mutually exclusive. Behavioral tests pass in the re-run (18/18): hidden-tab mention → exactly ONE showNotification; visible-tab mention → toast seam once, never showNotification |
| 2 | Seen rows, read rows, and update/reminder rows never notify; push-pref=false swallows rows; session prime is silent — now PER user+workspace seen key | ✓ VERIFIED | `deriveCandidates` filters `read || seen.includes(id)` and requires a mapped type with truthy pref; prime now keyed: `_primedFor !== seenKey(wsId, userId)` seeds and returns silently — an SPA workspace switch re-primes silently (5e3e4af). Tests: re-prime test (WR-01, new), second-call-no-notify, push_assign=false gate, update/due_reminder never dispatch, read row never dispatch, first-call prime — all green in 18/18 |
| 3 | sw.js registered from main.js at absolute scope `/sw.js`, contains `notificationclick` and NO fetch/install/activate handler or imports | ✓ VERIFIED | Re-read public/sw.js post-d16e559 (26 lines): single `notificationclick` listener, zero imports, zero fetch/install/activate handlers, zero user-visible strings. Click URL now origin-CHECKED: `new URL(data?.url || '/', origin)` inside try/catch, `u.origin === self.location.origin` gate, else '/'. main.js:108 `navigator.serviceWorker.register('/sw.js')` behind feature check, `.catch(() => {})` — unchanged, regression-passed |
| 4 | "Coming soon" badge removed; push_* toggles persist via the EXISTING single-branch `IN.npToggle` path (D-48-3) | ✓ VERIFIED | Regression re-check: `grep -r "pushComingSoon\|coming soon" src/ public/` → zero hits (rc=1). settings.js/actions.js unchanged since prior verification (last touched 14:11/14:15, before prior stamp); i18n catalogue pin test (14/14) and coming-soon-removal regression test (15/15) green in re-run |
| 5 | Toggle-ON with permission `default` calls `requestPermission()` inside the user gesture; denied → pref still saves + one-time explanatory toast; denied badge is derived per render and clears without reload (D-48-4) | ✓ VERIFIED | Regression re-check: actions.js pre-step + push.js `blockedToastOnce()` + settings.js fresh `Notification.permission` read + main.js `permChanged` memo all unchanged since prior full verification; behavioral tests green in the 18/18 run (requestPermission-once, blocked-toast-once, permChanged-flip, memo wiring) |
| 6 | Zero new runtime dependencies (D-12) — SW + Notification API are browser built-ins | ✓ VERIFIED | `node --test test/dependencies.test.mjs` green (2/2 re-run). package.json's `pg` dependency is the Phase 45 D-03 addition (commit 52506c0, 12:30, predates this phase's prior verification) — no dependency was added BY Phase 48; sw.js imports nothing; push.js imports only pre-existing project modules |

**Score:** 6/6 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `public/sw.js` | Minimal notificationclick router | ✓ VERIFIED | 26 lines re-read post-d16e559; single handler; origin-equality click-URL guard added; still zero imports/fetch/install/activate |
| `src/core/push.js` | Dispatch core: notifyNewEvents, per-key seen-set, deriveCandidates, toast-vs-notification branch | ✓ VERIFIED | Substantive; `_primedFor` key memo replaces session boolean (5e3e4af); exports test seams; all logic real |
| `src/core/push.js` wiring | Poll hook in main.js | ✓ VERIFIED | main.js unchanged since prior full check; import + poll call site intact (regression-passed via suite) |
| `src/pages/settings.js` | Derived blocked badge swap | ✓ VERIFIED | Unchanged since prior verification; i18n test 14/14 re-run green |
| `src/actions/actions.js` | requestPermission pre-step in npToggle | ✓ VERIFIED | Unchanged since prior verification; behavioral tests green |
| `test/browser-push.test.mjs` | Behavioral harness | ✓ VERIFIED | Now 18 tests (WR-01 re-prime test added), 18 pass / 0 fail in re-run |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| src/main.js poll | src/core/push.js notifyNewEvents() | one dispatch site inside pollNotifs, after hydration, behind poll guards | ✓ WIRED | Unchanged; regression-passed |
| src/core/push.js | myNotifs() from store.js | import | ✓ WIRED | Unchanged; regression-passed |
| src/core/push.js | registration.showNotification(title, options) | hidden branch | ✓ WIRED | body/tag/icon + `data.url`; sw.js holds zero strings/imports |
| src/core/push.js toast branch | toast() from src/ui/toast.js | exported live binding | ✓ WIRED | Unchanged |
| src/pages/settings.js | fresh Notification.permission per render | derived `blocked` const | ✓ WIRED | Unchanged; clears via permChanged memo |
| IN.npToggle | Notification.requestPermission() | prepended pre-step | ✓ WIRED | Unchanged; persistence body intact |
| src/main.js | service worker registration | absolute `/sw.js` (main.js:108) | ✓ WIRED | Failure silently ignored; poll+email remain the delivery guarantee |
| Build/deploy chain | dist/sw.js served no-cache | vite publicDir copy + server.js | ✓ WIRED | server.js:5272 still returns `no-cache` for sw.js (re-checked post-Phase-45 refactor); Dockerfile still `COPY --from=build /app/dist ./dist` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| push.js candidates | `myNotifs()` + `S.notifPrefs` | server-hydrated store (30s poll) | Yes | ✓ FLOWING |
| Notification title/body | `t('toast.push*', {name, title})` | i18n catalogue + task store | Yes | ✓ FLOWING |
| sw.js click URL | `e.notification.data?.url` | `buildNotifUrl(n)` — live ws slug + task key; now origin-checked | Yes | ✓ FLOWING |
| Blocked badge | `Notification.permission` | live browser API read per render | Yes | ✓ FLOWING |

No static/hardcoded data paths found.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Push slice harness (incl. new WR-01 re-prime test) | `node --test test/browser-push.test.mjs` | 18 pass / 0 fail | ✓ PASS |
| i18n catalogue pin (EN+FR parity) | `node --test test/i18n-core-features.test.mjs` | 14 pass / 0 fail | ✓ PASS |
| Coming-soon removal regression | `node --test test/unsubscribe-route.test.mjs` | 15 pass / 0 fail | ✓ PASS |
| D-12 dependency gate | `node --test test/dependencies.test.mjs` | 2 pass / 0 fail | ✓ PASS |

All four commands re-run this verification (2026-11-07, HEAD 4bf2c2a). Full suite reported green today by orchestrator (1126 tests, 1112 pass, 0 fail, 14 skipped).

### Probe Execution

None declared (no scripts/*/tests/probe-*.sh for this phase; not a migration/tooling phase). The VALIDATION.md per-task map is covered by the automated tests above plus the two human-verification flows.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| PUSH-01 | 48-01, 48-02 | Three inert push toggles gain real behavior: minimal SW + Notification API from the existing poll cycle; "coming soon" badge removed | ✓ SATISFIED | Truths 3, 4, 6 |
| PUSH-02 | 48-01 | Foreground tab → toast; background tab → SW notification; never both, never already-seen, gated by each push_* pref (D-48-2) | ✓ SATISFIED | Truths 1, 2 |
| PUSH-03 | 48-02 | Denied permission: toggle still persists, "browser blocked" badge + explanatory toast, badge clears when permission returns (D-48-4); zero schema migration (D-48-3) | ✓ SATISFIED | Truth 5 |

No orphaned requirements: REQUIREMENTS.md lines 114-116 map PUSH-01..03 to Phase 48, all Complete.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | No TBD/FIXME/XXX/HACK/PLACEHOLDER/coming-soon markers in any phase-modified file (grep re-run on current HEAD: clean) | — | Clean |

### Review Findings Awareness (from 48-REVIEW.md — status updated this run)

- **CR-01 (sw.js same-origin guard) — CLOSED.** Commit d16e559 adds the origin-equality check with '/' fallback for malformed/cross-origin `data.url`. The T-48-03 claim is now structural, not producer-trust.
- **WR-01 (workspace-switch re-prime storm) — CLOSED.** Commit 5e3e4af keys the prime memo on `seenKey(wsId, userId)`; a workspace switch re-primes the target workspace silently. Covered by a new behavioral test (18/18 green).
- IN-01 (fallback notification inert click — plan-pinned), IN-02 (200-id seen-set truncation edge), IN-03 (no `.catch` on the fire-and-forget poll call; internal awaits guarded) — informational, unchanged.
- Pre-existing totp-rewrap D-74 EACCES environmental test failure (STATE.md Deferred Items) predates this phase — not a phase gap.

### Human Verification Required

### 1. Real permission flow end-to-end (PUSH-01)

**Test:** Open Settings → Notifications → toggle a push_* pref ON; accept the browser prompt; hide the tab; trigger a mention from another user; confirm the OS notification and click-through navigation.
**Expected:** One prompt inside the click gesture; exactly one OS notification per event; click focuses/navigates to the same-origin deep link.
**Why human:** Real Notification/permission APIs cannot execute under node:test stubs; recorded as manual-only in 48-VALIDATION.md.

### 2. Blocked-permission UX (PUSH-03, D-48-4)

**Test:** Block notifications for the origin in browser settings, reload, open Settings → Notifications; toggle a pref (observe the one-time explanatory toast); re-allow permission and wait one poll tick.
**Expected:** Derived "Browser blocked" badge on all three push_* rows; toast fires exactly once; badge clears on the next poll render without reload.
**Why human:** Requires a real browser permission-denied state and live `Notification.permission` reads.

### Gaps Summary

No gaps. The stale-digest delta was two phase-48 closure commits (d16e559 CR-01, 5e3e4af WR-01), both re-verified in full against the live code — they strengthen the phase and close both review findings without regressions (18+14+15+2 tests re-run green, coming-soon grep clean, sw.js still minimal and now origin-hardened, server no-cache header and Dockerfile dist/ copy intact after the Phase 45 deploy-chain changes). The `pg` runtime dependency belongs to Phase 45's D-03 decision, not this phase; D-12 holds for Phase 48's own scope. The two live-browser flows remain manual-only and route to human verification, exactly as before.

---

_Verified: 2026-11-07T19:30:00Z_
_Verifier: the agent (gsd-verifier)_
