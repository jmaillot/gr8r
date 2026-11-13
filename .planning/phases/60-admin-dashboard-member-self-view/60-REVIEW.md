---
phase: 60-admin-dashboard-member-self-view
reviewed: 2026-11-13T16:10:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/pages/dashboard.js
  - server.js
  - test/helpers/dashboard-client-loader.mjs
  - test/dashboard-client.test.mjs
  - test/dashboard.test.mjs
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
status: issues_found
---

# Phase 60: Code Review Report (RE-REVIEW after gap-closure plan 60-03)

**Reviewed:** 2026-11-13T16:10:00Z
**Depth:** standard
**Files Reviewed:** 5 (60-03 changed files) + re-read of the open Info findings' targets
**Status:** issues_found (no criticals; all three targeted findings CLOSED)

## Summary

Re-review after gap-closure plan 60-03. The three findings from the previous review are all genuinely closed, each with a regression test that fails against the pre-fix code (RED commit `7ca2397` per 60-03-SUMMARY) and passes now:

- **CR-01 (fetch/render ping-pong) — CLOSED.** `fill()` claims the window up-front (`src/pages/dashboard.js:42`) and the kick guard at line 101 carries `!S.ui.dashErr`. I traced the failure path end-to-end: a network error returns `{ok:false, status:0}` (`src/core/api.js:72–73`), `dashErr` is set to a truthy object, both fullstate early-returns are skipped (status 0 is falsy) so cached panels render, and the kick is suppressed — no re-entry into `fill()` from `render()`. Aborted in-flight fills drop on the `my !== fillSeq` check before any render. Pinned by `test/dashboard-client.test.mjs:46–59` (exactly 1 call across 6 renders).
- **WR-01 (dead poll after route exit) — CLOSED.** `if (!timer) startPoll()` at `src/pages/dashboard.js:105` runs unconditionally of `loading`; `startPoll()` re-registers `ROUTE_TEARDOWN.dashboard` on every entry, so there is no stale-closure entry. Re-entry with cached data restarts the 30 s rhythm; repeated entry/exit cycles cannot stack intervals (`if (timer) return`). Pinned by `test/dashboard-client.test.mjs:79–136` with `mock.timers`.
- **WR-02 (whitelist after doc parse) — CLOSED.** The `windowParam`/`WINDOW_MS`/`badActivityWindow` check now sits at `server.js:6172–6174`, above `JSON.parse(ctx.ws.doc)` at line 6175. The invariant is now pinned **behaviorally**, not just by title: `test/dashboard.test.mjs:234–249` corrupts the stored doc so a parse would throw and asserts the keyed 400 still answers; a belt-and-braces source-order pin follows at lines 253–263.

Live run: `node --test test/dashboard.test.mjs test/dashboard-client.test.mjs test/self-visibility.test.mjs` → 27 pass / 0 fail.

The test harness (`test/helpers/dashboard-client-loader.mjs`) loads the real client module with data-URL stubs by resolved-path suffix — sound pattern, no dependency added (zero-dependency discipline respected). The new server-side corrupt-doc probe restores the original doc in a `finally`. No new criticals found. One new warning and four info items below.

## Warnings

### WR-03: `windowParam in WINDOW_MS` passes the whitelist for inherited Object prototype keys

**File:** `server.js:6172–6174`
**Issue:** `in` walks the prototype chain. `?activityWindow=constructor` (also `toString`, `valueOf`, `hasOwnProperty`, …) passes the whitelist check, then `WINDOW_MS[windowParam]` resolves to the inherited `Object` function; `Date.now() - fn` is `NaN`, so the activity filter (`a?.at >= NaN`) rejects every row and the route answers `200` with an empty activity panel instead of the documented keyed `400 badActivityWindow` ("any other value fails 400"). No injection — the value never reaches the doc or a sink — but it silently violates the whitelisting contract the route comment and tests pin.
**Fix:**
```js
if (!Object.hasOwn(WINDOW_MS, windowParam))
  return fail(res, 400, 'badActivityWindow', 'activityWindow must be one of 24h, 7d, 30d');
```
(or a plain `switch` / `Set`). Add `'constructor'` to the invalid-window test matrix.

## Info

### IN-01: Unknown visibility reason rendered unescaped (defense-in-depth gap) — OPEN, unchanged

**File:** `src/pages/members.js:38`
**Issue:** Carried from the previous review — not in 60-03's scope, still present. An unknown `p.reason` is interpolated into the i18n key `page.members.visReason.${p.reason}` and the result is rendered into the badge without `esc()`. Not exploitable today (fixed server-side vocabulary), but a future reason value with metacharacters would reach the DOM unescaped.
**Fix:** escape the fallback: `esc(t(\`page.members.visReason.${p.reason}\`))`.

### IN-02: My-access section cached forever, sticky error, no retry — OPEN, unchanged

**File:** `src/pages/settings.js`
**Issue:** Carried from the previous review — not in 60-03's scope, still present. Once `myAccessData`/`myAccessErr` is set, `refreshMyAccess()` never re-runs for the session; no retry affordance on error.
**Fix:** re-read on every section entry, or add a retry action clearing the cached state.

### IN-03: e2e fixture dates use UTC while the server anchors on the workspace timezone — OPEN, unchanged

**File:** `e2e/dashboard.spec.mjs`
**Issue:** Carried from the previous review — not in 60-03's scope, still present. `isoDay()` uses UTC day math while the server anchors on `resolveTz`'s default zone; midnight-boundary flake risk.
**Fix:** derive fixture dates with the same `Intl.DateTimeFormat('en-CA')` zone math the unit tests use.

### IN-04: `lastRequestedWindow` is write-only dead state

**File:** `src/pages/dashboard.js:36, 42`
**Issue:** The 60-03 fix declares and assigns `lastRequestedWindow` but nothing ever reads it — the actual ping-pong suppression comes from the up-front window claim in `S.ui.dashDataWindow` semantics plus the `!S.ui.dashErr` guard (and, more precisely, from the error screen's early-returns plus the guard). The variable is dead code that suggests a mechanism it does not provide, and will mislead the next reader of the CR-01 fix.
**Fix:** delete the declaration and its assignment, or actually use it in the kick guard if the intent was one-kick-per-selection.

### IN-05: A status-0 (network) failure shows stale panels with no error UI — dashRetry unreachable until the poll recovers

**File:** `src/pages/dashboard.js:49, 91–101`
**Issue:** On a network failure `dashErr = { status: 0 }`; both fullstate early-returns key on the falsy `status`, so the cached panels render with no failure indication and the `dashRetry` button is not mounted. Recovery rides the still-running 30 s poll (which clears `dashErr` on success). This is deliberate (pinned by `test/dashboard-client.test.mjs:61–77`'s "cached panels still render" assertion) and is bounded, so it is info-only — but the user gets zero signal that a window switch failed for up to 30 s.
**Fix:** when `dashErr` is set with a falsy status while cached data exists, render a thin inline banner (e.g. reuse `page.loadFailedBody`) with the existing `dashRetry` action instead of silently showing stale panels.

---

## Findings Closed This Round (verified)

| ID | Title | Verdict | Evidence |
|----|-------|---------|----------|
| CR-01 | Infinite fetch/render loop on window-switch failure | **CLOSED** | dashboard.js:42/101; regression test dashboard-client.test.mjs:46–59 (RED→GREEN per 60-03-SUMMARY) |
| WR-01 | Poll lifecycle dies after first route exit | **CLOSED** | dashboard.js:105 + startPoll re-registration; tests dashboard-client.test.mjs:79–136 |
| WR-02 | 400 badActivityWindow after doc parse | **CLOSED** | server.js:6172–6174 above 6175; behavioral corrupt-doc probe dashboard.test.mjs:234–249 + source-order pin 253–263 |

---

_Reviewed: 2026-11-13T16:10:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
