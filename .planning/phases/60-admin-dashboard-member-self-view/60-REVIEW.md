---
phase: 60-admin-dashboard-member-self-view
reviewed: 2026-11-13T12:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - server.js
  - src/pages/dashboard.js
  - src/pages/settings.js
  - src/pages/members.js
  - src/shell/render.js
  - src/shell/layout.js
  - src/core/api.js
  - src/actions/actions.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/dashboard.test.mjs
  - test/self-visibility.test.mjs
  - e2e/dashboard.spec.mjs
findings:
  critical: 1
  warning: 2
  info: 3
  total: 6
status: issues_found
---

# Phase 60: Code Review Report

**Reviewed:** 2026-11-13T12:00:00Z
**Depth:** standard
**Files Reviewed:** 13 (12 substantive + 2 locale files as one i18n check)
**Status:** issues_found

## Summary

Reviewed the Phase 60 server routes (admin dashboard aggregate, member self-view), the client dashboard page with its poll lifecycle, the Settings › My access section, the shared `visReasonLabel` refactor, the api seams, and the new unit/e2e tests. The server gates are correctly ordered (regex → requireWorkspace → sameOrigin → fail before doc parse for the *gate*), the whitelist on `activityWindow` is present, self-view redaction is byte-tested, and client rendering is escaped consistently.

The main defect is in the dashboard page's fill loop: a failed fetch while a different activity window is selected produces an unbounded fetch/render ping-pong. Two warnings follow: the poll timer dies permanently after the first route exit, and the server's `400 badActivityWindow` check runs **after** the full doc parse and aggregation, contradicting the route comment, the SUMMARY, and the test's own title ("BEFORE any doc work") — a claim no test can actually observe.

## Critical Issues

### CR-01: Infinite fetch/render loop when a window-switch fetch fails

**File:** `src/pages/dashboard.js:93` (with `fill()` at 34–46)
**Issue:** `pageDashboard` kicks `fill()` whenever `S.ui.dashDataWindow !== w`. `fill()` only advances `dashDataWindow` **on success** (line 42). If the user switches the activity window (e.g. 7d → 24h) and the fetch fails, `dashErr` is set with `status` 0 (network error from `call()`, `src/core/api.js:67`), which is falsy, so both error early-returns at lines 84 and 86 are skipped; `loading` is false (stale `dashData` present); `dashDataWindow` still differs from `w`; `fill()` calls `render()` — which re-enters `pageDashboard`, which re-kicks `fill()`. Result: an unbounded, immediate fetch→render→fetch loop that hammers the server until navigation away. The route guard (`S.ui.route !== 'dashboard'`) is the only thing that eventually stops it.

**Fix:**
```js
// In fill(): claim the window up-front so a failure can't re-trigger the kick
async function fill() {
  const my = ++fillSeq;
  const w = S.ui.dashWindow || '7d';
  inflight?.abort();
  inflight = new AbortController();
  S.ui.dashDataWindow = w;            // claim before awaiting
  const res = await api.dashboard(w, { signal: inflight.signal });
  ...
}
// and in pageDashboard, guard the kick:
if ((loading || S.ui.dashDataWindow !== w) && !S.ui.dashErr) fill();
```
(or track a separate `lastRequestedWindow` so the kick fires once per window selection, not once per render.)

## Warnings

### WR-01: Poll lifecycle dies permanently after the first route exit

**File:** `src/pages/dashboard.js:52–62, 93–94`
**Issue:** `startPoll()` is only invoked under `if (loading)`. On route exit, `ROUTE_TEARDOWN.dashboard` clears the timer, bumps `fillSeq`, aborts and nulls `inflight` — but `S.ui.dashData` is retained. Re-entering `/w/:slug/dashboard` later: `loading` is false (data cached), `dashDataWindow === w`, so neither `fill()` nor `startPoll()` runs. The 30 s poll is silently dead for the rest of the session; the page shows indefinitely stale data with no indication. Additionally, `ROUTE_TEARDOWN.dashboard` remains a stale entry (a re-enter via deep link with no `go()` call leaves the registry entry pointing at a no-op closure).

**Fix:** register the teardown at module load, and restart the poll on entry:
```js
ROUTE_TEARDOWN.dashboard = () => { if (timer) clearInterval(timer); timer = null; fillSeq++; inflight?.abort(); inflight = null; };
// in pageDashboard, regardless of loading state:
if (!timer) startPoll();
```

### WR-02: `400 badActivityWindow` fires AFTER full doc parse and aggregation — contradicts the documented T-60-03 mitigation

**File:** `server.js:6183–6190` (dashboard route block, added lines); `test/dashboard.test.mjs:224`
**Issue:** The route comment, the 60-01 SUMMARY ("other values → keyed `400 badActivityWindow` before any doc work"), and the test title all claim the invalid-window 400 happens **before** any doc work. The code does the opposite: `JSON.parse(ctx.ws.doc)`, `normalizeProjects`, the full overdue grouping/sorting, the load counting, and the upcoming scan all execute first; the whitelist check (`if (!(windowParam in WINDOW_MS)) return fail(res, 400, ...)`) sits below all of it. The test only asserts status and code — it cannot observe evaluation order, so the claim is untested. The whitelist still holds (no injection), but the documented threat-mitigation invariant is not honored, and every malformed request pays a full doc parse of an arbitrarily large document.

**Fix:** hoist the two lines above `const doc = JSON.parse(ctx.ws.doc);`:
```js
const windowParam = String(url.searchParams.get('activityWindow') || '7d');
const WINDOW_MS = { '24h': 864e5, '7d': 6048e5, '30d': 2592e6 };
if (!(windowParam in WINDOW_MS)) return fail(res, 400, 'badActivityWindow', 'activityWindow must be one of 24h, 7d, 30d');
```

## Info

### IN-01: Unknown visibility reason rendered unescaped (defense-in-depth gap)

**File:** `src/pages/members.js:30–38`
**Issue:** In `visReasonLabel`, an unknown `p.reason` is interpolated into the i18n key `page.members.visReason.${p.reason}`; `t()` returns the raw key string when the catalogue lacks it (`src/core/i18n.js:228+` fallback returns `key`), and the callers (`members.js:96`, `settings.js:my-access` rows) render the label into `${label}` **without** `esc()`. `projectAccessReason` currently emits a fixed vocabulary, so this is not exploitable today, but any future server-side reason value with HTML metacharacters would flow to the DOM unescaped.
**Fix:** in the unknown branch, escape before composing: `esc(t(\`page.members.visReason.${p.reason}\`))` — or drop the interpolation and render `esc(String(p.reason))` for anything not in `VIS_REASON_KNOWN`.

### IN-02: My-access section never re-reads and has no error retry, contradicting its own comment

**File:** `src/pages/settings.js:105–113, 529–547`
**Issue:** The comment says the list is "re-read when re-entered", but the guard `if (api.enabled && !S.ui.myAccessData && !S.ui.myAccessErr)` means once data (or an error) is cached for the session, `refreshMyAccess()` never runs again — access changes made after first view are invisible until a full reload. The error state (`settings.myAccess.error`) has no retry affordance.
**Fix:** re-read on every section entry (or add a seq/staleness guard), and add a retry row wired to a small action that clears `S.ui.myAccessErr`/`myAccessData`.

### IN-03: e2e fixture dates use UTC while the server anchors on the workspace timezone

**File:** `e2e/dashboard.spec.mjs:16–19`
**Issue:** `isoDay()` computes `new Date().toISOString()` (UTC day) while the server's overdue/upcoming windows anchor on `localParts('', ...)` (resolveTz default, Europe/Paris per the unit test). Around the UTC/Paris midnight boundary the fixture's `-3d`/`+2d` offsets can shift a day relative to the server's "today", flipping an overdue row into upcoming (or off-panel) and flaking the assertions.
**Fix:** derive fixture dates with the same Europe/Paris `Intl.DateTimeFormat('en-CA')` math the unit tests use (as `test/dashboard.test.mjs:29–38` already does).

---

Additional observations (no finding): the e2e fixture sets `assignees: [memberUserId]` (auth user id) while project `members`/`lead` use the doc membership id — the server's load panel counts via the doc-members map, so these id spaces must remain identical for the Load panel to show the member; the e2e only asserts panel headers, not row contents, so a future divergence would go unnoticed there. The unit tests already cover it (`byId.m_team.count === 2`), so this is a coverage note only.

_Reviewed: 2026-11-13T12:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
