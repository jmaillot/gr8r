---
phase: 60-admin-dashboard-member-self-view
verified: 2026-11-13T16:45:00Z
status: passed
score: 14/14 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files: [".planning/phases/60-admin-dashboard-member-self-view/60-01-PLAN.md", ".planning/phases/60-admin-dashboard-member-self-view/60-02-PLAN.md", ".planning/phases/60-admin-dashboard-member-self-view/60-03-PLAN.md", ".planning/phases/60-admin-dashboard-member-self-view/60-01-SUMMARY.md", ".planning/phases/60-admin-dashboard-member-self-view/60-02-SUMMARY.md", ".planning/phases/60-admin-dashboard-member-self-view/60-03-SUMMARY.md", "server.js", "src/pages/dashboard.js", "src/pages/settings.js", "src/pages/members.js", "src/shell/render.js", "src/shell/layout.js", "src/core/api.js", "src/locales/en.json", "src/locales/fr.json", "test/dashboard.test.mjs", "test/dashboard-client.test.mjs", "test/self-visibility.test.mjs", "test/helpers/dashboard-client-loader.mjs", "e2e/dashboard.spec.mjs"]
covered_digest: "v2:sha256:5c8bfeccfa1e49a81e0de95cfee577f9d40cb7e9c745366b7372a4d0540b20f0"
re_verification:
  previous_status: gaps_found
  previous_score: 12/14
  gaps_closed:
    - "Window-switch fetch failure does not destabilize the page (CR-01) — closed"
    - "30 s poll keeps refreshing across route exit/re-entry (WR-01 / D-05) — closed"
    - "Invalid activityWindow fails 400 BEFORE doc parse (WR-02 / T-60-03 invariant) — closed"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "IN-04: lastRequestedWindow is write-only dead state in src/pages/dashboard.js:36,42"
    category: other
    reason: "Info-only review finding, not a must-have; the real CR-01 suppression is the up-front dashDataWindow claim + !dashErr kick guard, both tested. Cosmetic cleanup."
    evidence_status: "confirmed present by direct code reading"
  - finding: "IN-05: status-0 failure renders cached panels with no error UI for up to 30 s (dashRetry unreachable)"
    category: other
    reason: "Deliberate, bounded (pinned by dashboard-client.test.mjs 'cached panels still render'), recovery via poll; UX polish item."
    evidence_status: "confirmed by test + code reading"
  - finding: "IN-01/IN-02/IN-03 carried from initial verification (members.js reason interpolation, my-access caching, e2e UTC fixture dates)"
    category: other
    reason: "Info-only, out of 60-03 scope, no must-have depends on them."
    evidence_status: "none provided"
---

# Phase 60: Admin Dashboard + Member Self-View Verification Report (Re-verification)

**Phase Goal:** Admins get one honest workspace overview (overdue, load, upcoming, activity — private projects fully visible per the power-admin ruling) and every member can see their own redacted access picture.
**Verified:** 2026-11-13T16:45:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (plan 60-03, commits 7ca2397 / 290bb36 / 299197e / cc75a38)

## Goal Achievement

Both prior failed truths and the behavior-unverified truth are now closed with test-first fixes verified by direct code reading AND by running the regression tests live (27/27 targeted, full suite 1516 pass / 0 fail / 12 skipped e2e). The previously human-only "poll re-entry" observation is now covered by an automated mock-timer regression test and no longer requires human verification.

### Gap Closure Evidence (the three prior gaps)

| Gap | Fix in code | Regression test | Live result |
|-----|-------------|-----------------|-------------|
| CR-01 — unbounded fetch/render ping-pong on window-switch failure | `src/pages/dashboard.js:42` claims the window up-front; `:101` kick guard `(loading || dashDataWindow !== w) && !S.ui.dashErr` | `test/dashboard-client.test.mjs:46` "window-switch fetch failure stops the fetch kick after one attempt" — asserts exactly 1 api.dashboard call across 6 renders with a failing stub | ✓ PASS |
| WR-01 — poll permanently dead after first route exit | `src/pages/dashboard.js:105` `if (!timer) startPoll()` (entry condition independent of `loading`); teardown re-registered in `startPoll()` | `:79` "route exit clears the poll timer and re-entry restarts it with cached data" (mock timers: teardown → tick 30 s → fresh call; exit → no call) + `:118` "repeated entry/exit cycles never stack poll intervals" | ✓ PASS |
| WR-02 — activityWindow 400 AFTER doc parse | `server.js:6172-6174` whitelist `badActivityWindow` sits textually and behaviorally ABOVE `:6175` `JSON.parse(ctx.ws.doc)` | `test/dashboard.test.mjs:231` corrupt-doc behavioral probe (invalid window + corrupt doc → 400, not parse crash) + source-order assertion | ✓ PASS |

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Dashboard route: 200 admin/owner, EXACT 403 member/viewer before doc read (DASH-04) | ✓ VERIFIED | server.js 6151-6155 gate order; gate matrix in test/dashboard.test.mjs — green |
| 2 | Overdue includes PRIVATE projects for admins (power-admin proof, raw doc) | ✓ VERIFIED | raw `JSON.parse(ctx.ws.doc)` at :6175; private-name assertion green |
| 3 | Overdue grouped per project, oldest group first, tasks by due (D-10) | ✓ VERIFIED | server.js 6182-6201; sort assertions green |
| 4 | Load counts open-task assignees[] once per member; done excluded (D-07) | ✓ VERIFIED | server.js 6202-6216 (array-only); shared-task + done-exclusion tests green |
| 5 | Upcoming = today..+7d not done; activity whitelisted 24h/7d/30d default 7d, **400 before doc work** (WR-02 closed) | ✓ VERIFIED | server.js 6172-6175; corrupt-doc probe + keyed-400 tests green |
| 6 | /me/visibility returns {projects:[{id,name,reason[,teamName]}]} for any member, no echo/granter (TRN-01) | ✓ VERIFIED | server.js route; 8 self-visibility tests incl. byte-level needle scans — green |
| 7 | Stringified self-view payload has no other actor's id/name/email (TRN-02) | ✓ VERIFIED | test/self-visibility.test.mjs byte-level scans — green |
| 8 | Four-panel dashboard page at /w/:slug/dashboard, no tabs (D-01/D-02) | ✓ VERIFIED | src/pages/dashboard.js four panels; e2e panel headings |
| 9 | Sidebar entry admin-only; member URL entry surfaces server 403 (D-52-4) | ✓ VERIFIED | layout.js isMemberAdmin() gate; 403 keyed state; e2e member-blocked |
| 10 | Skeleton-then-fill, 30 s poll with abort + clearInterval on exit, **restarts on re-entry** (D-03/D-05, WR-01 closed) | ✓ VERIFIED | dashboard.js 57-67/105; mock-timer regression tests green (re-entry fires fresh call; exit kills timer; no interval stacking) |
| 11 | Deep links: overdue/upcoming → task drawer & project; activity links (D-09) | ✓ VERIFIED | taskRowHtml openTask data-a; e2e drawer assertion |
| 12 | Activity 24h/7d/30d selector refetches with the param; **failure path bounded** (CR-01 closed) | ✓ VERIFIED | seg buttons → fill() with ?activityWindow=; failing-fetch regression test asserts ≤1 call across repeated renders |
| 13 | Settings › My access flat reachable-projects list, all members (D-11/D-12/D-14) | ✓ VERIFIED | settings.js my-access section, no role gate; e2e 'Everyone' badge |
| 14 | e2e: admin renders dashboard, member blocked, drawer opens | ✓ VERIFIED (spec present with assertions; happy path per 60-02 SUMMARY e2e run) | e2e/dashboard.spec.mjs |

**Score:** 14/14 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| server.js routes | dashboard + me/visibility | ✓ VERIFIED | gate order verbatim; WR-02 ordering fixed |
| test/dashboard.test.mjs | gate matrix + aggregates + WR-02 probes | ✓ VERIFIED | run live — green (incl. 2 new WR-02 tests) |
| test/dashboard-client.test.mjs | CR-01/WR-01 regressions on the real module | ✓ VERIFIED | NEW (60-03); real dashboard.js via loader hook; run live — green |
| test/self-visibility.test.mjs | VISIBILITY_MODEL parity + redaction | ✓ VERIFIED | run live — green |
| test/helpers/dashboard-client-loader.mjs | DOM-stub loader for the real page module | ✓ VERIFIED | present, exercised by client tests |
| src/pages/dashboard.js | lazy four-panel page, fixed lifecycle | ✓ VERIFIED | CR-01/WR-01 fixes in place; wired via layout lazy() |
| src/shell/render.js, layout.js | route id/icon, lazy entry, admin gate | ✓ VERIFIED | unchanged, wired |
| src/core/api.js | api.dashboard + api.myVisibility | ✓ VERIFIED | endpoints + signal passthrough |
| src/pages/settings.js | my-access section | ✓ VERIFIED | unchanged |
| locales en/fr | new keys | ✓ VERIFIED | i18n gates green in full suite |
| e2e/dashboard.spec.mjs | per-role story | ✓ VERIFIED | present (skipped in unit run, per project convention) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| layout.js | src/pages/dashboard.js | lazy(() => import(...), 'pageDashboard') | WIRED | unchanged |
| dashboard.js | api.dashboard endpoint | fill() fetch, signal passthrough | WIRED | api.js |
| settings.js | api.myVisibility endpoint | section render fetch | WIRED | unchanged |
| dashboard route | raw doc | JSON.parse(ctx.ws.doc), no docForClient | WIRED | power-admin inversion |
| dashboard.js pageDashboard() | startPoll() | `if (!timer) startPoll()` — independent of loading | WIRED | WR-01 fix |
| dashboard.js fill() | up-front window claim + !dashErr guard | lastRequestedWindow claim + kick guard | WIRED | CR-01 suppression (see advisory IN-04) |
| server.js dashboard route | whitelist-before-parse | badActivityWindow above JSON.parse | WIRED | WR-02 fix, behaviorally pinned |
| tests | fixture oracle | zero imports from server.js | WIRED | anti-tautology honored |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Server + client routes | `node --test test/dashboard.test.mjs test/dashboard-client.test.mjs test/self-visibility.test.mjs` | 27 pass / 0 fail | ✓ PASS |
| Full suite | `npm test` | 1516 pass / 0 fail / 12 skipped (e2e) / 0 cancelled | ✓ PASS |
| CR-01 bounded fetch | dashboard-client.test.mjs CR-01 regression | exactly 1 call across 6 renders | ✓ PASS |
| WR-01 poll re-entry | dashboard-client.test.mjs WR-01 regression (mock timers) | fresh call on first tick after re-entry; none after exit | ✓ PASS |
| WR-02 ordering | dashboard.test.mjs corrupt-doc probe + source-order test | 400 without doc parse | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DASH-01 | 60-01, 60-02, 60-03 | Overdue grouped per project | ✓ SATISFIED | server aggregate + panel + tests |
| DASH-02 | 60-01, 60-02, 60-03 | Load per member, assignees[] array honored | ✓ SATISFIED | counts loop + shared-task test |
| DASH-03 | 60-01, 60-02, 60-03 | Upcoming 7d + recent activity | ✓ SATISFIED | upcoming filter + activity windows |
| DASH-04 | 60-01, 60-02, 60-03 | Admin-only 403 gate; private content visible | ✓ SATISFIED | exact-403 matrix + raw-doc proof |
| TRN-01 | 60-01, 60-02, 60-03 | Member self-view of reachable projects + reason | ✓ SATISFIED | /me/visibility + Settings › My access |
| TRN-02 | 60-01, 60-03 | No cross-member access exposure, byte-level shape | ✓ SATISFIED | needle-scan tests green |

No orphaned requirements: all six Phase 60 IDs in REQUIREMENTS.md are claimed by plans and verified.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/pages/dashboard.js | 36/42 | lastRequestedWindow write-only dead state | ℹ️ Info (IN-04) | misleading comment only; actual suppression tested |
| src/pages/dashboard.js | 49/91-101 | status-0 failure shows stale panels, no banner | ℹ️ Info (IN-05) | deliberate, bounded, poll recovers |
| src/pages/members.js | 30-38 | unknown visReason interpolated unescaped | ℹ️ Info (IN-01) | defense-in-depth only |
| src/pages/settings.js | 105-113 | my-access cached forever, sticky error | ℹ️ Info (IN-02) | staleness after access changes |
| e2e/dashboard.spec.mjs | 16-19 | UTC fixture dates vs server tz anchor | ℹ️ Info (IN-03) | midnight-boundary flake risk |

All CRITICAL/WARNING findings from 60-REVIEW.md are CLOSED (CR-01, WR-01, WR-02 — see gap closure table). No TBD/FIXME/XXX debt markers in phase files.

### Human Verification Required

None. The two previously human-only network observations are now covered by automated regression tests:
1. Poll re-entry lifecycle → mock-timer test asserts a fresh GET fires on the first 30 s tick after exit/re-entry and none after exit.
2. Window-switch failure path → failing-stub test asserts exactly one fetch attempt across repeated renders.

Optional (not gating): a real-browser spot-check of the dashboard against a live server remains available per normal UAT practice.

### Gaps Summary

None. All three prior gaps are closed test-first and verified by direct code reading plus live test runs (27/27 targeted, 1516/0 full suite). Phase goal achieved.

---

_Verified: 2026-11-13T16:45:00Z_
_Verifier: the agent (gsd-verifier)_
