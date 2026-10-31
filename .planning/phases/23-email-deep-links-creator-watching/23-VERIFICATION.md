---
phase: 23-email-deep-links-creator-watching
verified: 2026-10-31T12:30:00Z
status: human_needed
score: 12/12 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files: [23-01-PLAN.md, 23-01-SUMMARY.md, 23-02-PLAN.md, 23-02-SUMMARY.md, 23-03-PLAN.md, 23-03-SUMMARY.md, 23-04-PLAN.md, 23-04-SUMMARY.md, 23-05-PLAN.md, 23-05-SUMMARY.md, 23-06-PLAN.md, 23-06-SUMMARY.md, server.js, test/notif-email-link.test.mjs, test/file-route-ordering.test.mjs, src/shell/render.js, src/main.js, e2e/deep-link.spec.mjs, e2e/back-forward.spec.mjs]
covered_digest: "unavailable — verification.fingerprint query tool not present in this environment"
re_verification:
  previous_status: human_needed
  previous_score: 10/10
  gaps_closed:
    - "G-23-1: notification email byline/recipient resolved from memberships⋈users authority rows (plans 23-05, commits c75c6ac + d2caf49)"
    - "G-23-4: /w/:slug/team/:id resolvable deep link via urlForView/applyDeepLink (plan 23-06, commits a660379 + 87947d5)"
  gaps_remaining: []
  regressions: []
---

# Phase 23: Email Deep Links & Creator Watching Verification Report (refreshed)

**Phase Goal:** A notification email is a door to the task, not the app root — and the people who should hear about a task's activity (including its creator) actually do.
**Verified:** 2026-10-31
**Status:** human_needed (all automated gates pass; only the real-deployment email/UAT re-confirmation remains)
**Re-verification:** Yes — after gap closure (23-05, 23-06)

## Goal Achievement

### Observable Truths

| #  | Truth (source)                                                                                                   | Status     | Evidence |
|----|------------------------------------------------------------------------------------------------------------------|------------|----------|
| 1  | Signed-in deep link `/w/:slug/task/:key` opens the task drawer over an underlying page, never page404 (SC-1, D-01) | ✓ VERIFIED | src/main.js drawer-open mutations over `go('project', …)`; e2e/deep-link.spec.mjs task-drawer scenarios pass this session (14/14) |
| 2  | URL persists across refresh; unknown/permission-hidden keys → workspace view + localized not-found toast (D-02/D-03) | ✓ VERIFIED | `urlForView` writes task URL in `go()`; `err.taskNotFound` in en+fr locales; e2e reload + unknown-key scenarios green |
| 3  | Notification emails are `APP_URL + /w/:slug/task/:key`, key resolved at email-build time, workspace-root fallback (LINK-01) | ✓ VERIFIED | server.js queueNotifEmails URL construction unchanged (pinned by notifUrlBuilder tests); test/notif-email-link.test.mjs 17/17 this session |
| 4  | Boot refuses when SMTP enabled and APP_URL empty (supports LINK-01) | ✓ VERIFIED | server.js boot guard (prior evidence, untouched by 23-05/06) |
| 5  | Logged-out deep link → sign-in with `?next=` carry, exact-task return, path-only validator (LINK-02) | ✓ VERIFIED | pathname-only replaceState; test/next-carry.test.mjs; UAT test 2 passed on real deployment |
| 6  | Task creator recorded at creation and in the watcher set (LINK-03) | ✓ VERIFIED | actions.js `creator: D().me`; watcher Set includes creator; test/creator-watcher.test.mjs (prior evidence, untouched) |
| 7  | Creator === assignee yields ONE watcher entry; no self-notifications (SC-3, D-05) | ✓ VERIFIED | Set dedup + `x !== D().me` chain intact; double exclusion client + server |
| 8  | Back/forward across SPA views restore via pushState + single popstate handler (LINK-04) | ✓ VERIFIED | render.js pushState/replaceState split; one popstate listener; e2e/back-forward.spec.mjs 10/10 this session (seam canary incl.) |
| 9  | No double-push on popstate; drawer-close pushes underlying URL (23-04) | ✓ VERIFIED | `opt.back → replaceState`; back-forward spec asserts history-length stability |
| 10 | `/w/:slug/file/:id` byte route still serves bytes; route ordering unchanged (SC-5) | ✓ VERIFIED | test/file-route-ordering.test.mjs 3/3 this session |
| 11 | **G-23-1 closed:** email byline and recipient email resolve from memberships⋈users authority rows first (account-backed authors never render "Un membre"; account-backed recipients never silently skipped), doc-profile fallback retained, "Un membre" only as last resort (23-05) | ✓ VERIFIED | server.js:709–723 — authority Map built from `memberships join users … where m.workspace_id = ?`; `by = authority.get(n.by)?.name ‖ profiles.get(n.by)?.name ‖ 'Un membre'` (line 723, sole "Un membre" occurrence); `to = authority.get(n.to)?.email ‖ …` (line 719). test/notif-email-link.test.mjs: byline authority ×3, recipient ×3, precedence — all green this session (17/17) |
| 12 | **G-23-4 closed:** `/w/:slug/team/:id` is a first-class deep link — urlForView emits the keyed URL, applyDeepLink resolves id → team view; unknown id → silent workspace-home fallback (no existence oracle); bare `/w/:slug/team` → teams list, never 404 (23-06) | ✓ VERIFIED | src/shell/render.js:124–127 team branch before ROUTE_IDS catch-all (`team` + id → `/w/:slug/team/:id`, no id → `/teams`); src/main.js:181–187 team branch mirroring member + bare-seg hardening. e2e/deep-link.spec.mjs direct-load + F5 + unknown-id (toast count 0) + bare-/team scenarios — 14/14 green this session |

**Score:** 12/12 truths verified (0 present-behavior-unverified)

### Re-Verification Notes (gap-closure focus)

- **G-23-1 (UAT test 1, "Un membre" byline):** code-level fix confirmed in server.js (authority-first byline/recipient resolution, workspace-scoped query) and pinned by 14-test notif-email-link suite (RED-first TDD per 23-05-SUMMARY). The UAT item itself stays a human item until the next real email on the live deployment shows the author's name.
- **G-23-4 (UAT test 4, team F5 404):** now behaviorally proven by e2e (direct load, F5 persistence, unknown-id no-leak, bare /team — EN+FR). Real-deployment re-check folded into the remaining human item.
- **Regressions:** none — deep-link (14/14) and back-forward (10/10) e2e green this session; notif + file-route unit tests 17/17; `npm test` reported 593/593 at 23-06 plan head (87947d5).

### Test Gates (this session unless noted)

| Gate | Command | Result |
|------|---------|--------|
| Notif + route unit tests | `node --test test/notif-email-link.test.mjs test/file-route-ordering.test.mjs` | 17/17 pass |
| Deep-link e2e (G-23-4 scenarios incl.) | `npx playwright test --config e2e/playwright.config.mjs e2e/deep-link.spec.mjs` | 14/14 pass |
| Back-forward e2e | `… e2e/back-forward.spec.mjs` | 10/10 pass |
| Full suite | `npm test` (per 23-05/23-06 summaries at plan head 87947d5) | 593/593 pass |

### Requirements Coverage

| Requirement | Source Plan(s) | Status | Evidence |
|-------------|----------------|--------|----------|
| LINK-01 | 23-01, 23-05 | ✓ SATISFIED | Truths 3, 4, 11 |
| LINK-02 | 23-02 | ✓ SATISFIED | Truth 5 |
| LINK-03 | 23-03 | ✓ SATISFIED | Truths 6–7 |
| LINK-04 | 23-04, 23-06 | ✓ SATISFIED | Truths 8–10, 12 |

No orphaned requirements: REQUIREMENTS.md maps exactly LINK-01..04 to Phase 23, all claimed by plans and all verified.

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| src/main.js applyDeepLink | src/overlays/drawer.js + go() | drawer mutations + render | ✓ WIRED |
| src/main.js applyDeepLink team branch | go('team', {id}) → urlForView | render.js:124–127 team URL branch | ✓ WIRED |
| server.js queueNotifEmails | mailer sendNotif | msg.url = APP_URL + /w/:slug/task/:key | ✓ WIRED |
| server.js queueNotifEmails | memberships⋈users authority rows | workspace-scoped join (server.js:709–712) | ✓ WIRED |
| APP_URL boot guard | all MAILER absolute URLs | exit when MAILER.enabled && !APP_URL | ✓ WIRED |
| logged-out boot | /login?next= + finishLogin | pathname-only carry, path-only validator | ✓ WIRED |
| go() → pushState → popstate → applyDeepLink({back:true}) | view restore (task + team) | single handler; back-forward e2e green | ✓ WIRED |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | no TBD/FIXME/XXX/placeholder markers in phase-modified files (server.js, src/shell/render.js, src/main.js, e2e/deep-link.spec.mjs, test/notif-email-link.test.mjs) | — | — |

### Advisory Open Findings (from 23-REVIEW.md — informational, not verification gaps)

- CR-01 / HIGH-01 / MED-01 / MED-02 / LOW-01..03 remain recorded in 23-REVIEW-DISPOSITION.md; none breaks a must-have (unchanged from prior report).

## Human Verification Required

One item remains — the real-deployment UAT re-check after both gap fixes:

### 1. Live-deployment email byline + team URL re-check
**Test:** On the live deployment, trigger a notification email from a named account-backed user and click its task link; separately, F5 on `/w/:slug/team/:id`.
**Expected:** Email byline shows the author's real name (not "Un membre"); link lands on the task drawer with URL `/w/:slug/task/:key`; team page survives F5 (renders the team view, no 404).
**Why human:** Requires a live SMTP send and real mail-client rendering; the byline fix (23-05) and team URL fix (23-06) are code- and e2e-verified but the UAT report's issue was observed on the real deployment, so closure should be confirmed there.

(Prior UAT items 2 — logged-out sign-in return — and 3 — back/forward feel — already passed per 23-UAT.md and are not re-raised.)

## Gaps Summary

None. Both UAT-reported gaps (G-23-1 byline, G-23-4 team 404) are closed with code + passing behavioral tests; all 4 requirements (LINK-01..LINK-04) verified. Status is human_needed solely for the single live-deployment confirmation item above.

---

_Verified: 2026-10-31T12:30:00Z_
_Verifier: the agent (gsd-verifier)_
