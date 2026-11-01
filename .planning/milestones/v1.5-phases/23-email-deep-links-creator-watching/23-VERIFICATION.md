---
phase: 23-email-deep-links-creator-watching
verified: 2026-10-31T13:20:00Z
status: passed
score: 12/12 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files: [.planning/phases/23-email-deep-links-creator-watching/23-01-PLAN.md, .planning/phases/23-email-deep-links-creator-watching/23-01-SUMMARY.md, .planning/phases/23-email-deep-links-creator-watching/23-02-PLAN.md, .planning/phases/23-email-deep-links-creator-watching/23-02-SUMMARY.md, .planning/phases/23-email-deep-links-creator-watching/23-03-PLAN.md, .planning/phases/23-email-deep-links-creator-watching/23-03-SUMMARY.md, .planning/phases/23-email-deep-links-creator-watching/23-04-PLAN.md, .planning/phases/23-email-deep-links-creator-watching/23-04-SUMMARY.md, .planning/phases/23-email-deep-links-creator-watching/23-05-PLAN.md, .planning/phases/23-email-deep-links-creator-watching/23-05-SUMMARY.md, .planning/phases/23-email-deep-links-creator-watching/23-06-PLAN.md, .planning/phases/23-email-deep-links-creator-watching/23-06-SUMMARY.md, server.js, test/notif-email-link.test.mjs, test/file-route-ordering.test.mjs, src/shell/render.js, src/main.js, e2e/deep-link.spec.mjs, e2e/back-forward.spec.mjs]
covered_digest: "v2:sha256:5bf77cae04a73ca33c1444009991a818563b6b72137c966a9a7298dd28fc67bc"
behavior_unverified_items: []
re_verification:
  previous_status: human_needed
  previous_score: 12/12
  gaps_closed:
    - "G-23-1: notification email byline/recipient resolved from memberships⋈users authority rows (plans 23-05, commits c75c6ac + d2caf49)"
    - "G-23-4: /w/:slug/team/:id resolvable deep link via urlForView/applyDeepLink (plan 23-06, commits a660379 + 87947d5)"
    - "Human verification closed: live-deployment UAT re-tests passed (23-UAT.md complete, 4/4)"
  gaps_remaining: []
  regressions: []
---

# Phase 23: Email Deep Links & Creator Watching Verification Report (final — human verification complete)

**Phase Goal:** A notification email is a door to the task, not the app root — and the people who should hear about a task's activity (including its creator) actually do.
**Verified:** 2026-10-31
**Status:** passed
**Re-verification:** Yes — after gap closure (23-05, 23-06) and completion of the live-deployment UAT (23-UAT.md, 4/4 pass)

## Goal Achievement

### Observable Truths

| #  | Truth (source)                                                                                                   | Status     | Evidence |
|----|------------------------------------------------------------------------------------------------------------------|------------|----------|
| 1  | Signed-in deep link `/w/:slug/task/:key` opens the task drawer over an underlying page, never page404 (SC-1, D-01) | ✓ VERIFIED | src/main.js drawer-open mutations over `go('project', …)`; e2e/deep-link.spec.mjs task-drawer scenarios pass (14/14) |
| 2  | URL persists across refresh; unknown/permission-hidden keys → workspace view + localized not-found toast (D-02/D-03) | ✓ VERIFIED | `urlForView` writes task URL in `go()`; `err.taskNotFound` in en+fr locales; e2e reload + unknown-key scenarios green |
| 3  | Notification emails are `APP_URL + /w/:slug/task/:key`, key resolved at email-build time, workspace-root fallback (LINK-01) | ✓ VERIFIED | server.js queueNotifEmails URL construction (pinned by notifUrlBuilder tests); test/notif-email-link.test.mjs 17/17 |
| 4  | Boot refuses when SMTP enabled and APP_URL empty (supports LINK-01) | ✓ VERIFIED | server.js boot guard (untouched by 23-05/06) |
| 5  | Logged-out deep link → sign-in with `?next=` carry, exact-task return, path-only validator (LINK-02) | ✓ VERIFIED | pathname-only replaceState; test/next-carry.test.mjs; UAT test 2 passed on real deployment |
| 6  | Task creator recorded at creation and in the watcher set (LINK-03) | ✓ VERIFIED | actions.js `creator: D().me`; watcher Set includes creator; test/creator-watcher.test.mjs |
| 7  | Creator === assignee yields ONE watcher entry; no self-notifications (SC-3, D-05) | ✓ VERIFIED | Set dedup + `x !== D().me` chain intact; double exclusion client + server |
| 8  | Back/forward across SPA views restore via pushState + single popstate handler (LINK-04) | ✓ VERIFIED | render.js pushState/replaceState split; one popstate listener; e2e/back-forward.spec.mjs 10/10 (seam canary incl.) |
| 9  | No double-push on popstate; drawer-close pushes underlying URL (23-04) | ✓ VERIFIED | `opt.back → replaceState`; back-forward spec asserts history-length stability |
| 10 | `/w/:slug/file/:id` byte route still serves bytes; route ordering unchanged (SC-5) | ✓ VERIFIED | test/file-route-ordering.test.mjs 3/3 |
| 11 | **G-23-1 closed:** email byline and recipient email resolve from memberships⋈users authority rows first, doc-profile fallback retained, "Un membre" only as last resort (23-05) | ✓ VERIFIED | server.js:709–723 — authority Map from workspace-scoped join; `by = authority.get(n.by)?.name ‖ profiles.get(n.by)?.name ‖ 'Un membre'` (line 723, sole occurrence); `to = authority.get(n.to)?.email ‖ …` (line 719). notif-email-link suite green (17/17). **UAT test 1 re-test on live deployment: pass** |
| 12 | **G-23-4 closed:** `/w/:slug/team/:id` is a first-class deep link — urlForView emits the keyed URL, applyDeepLink resolves id → team view; unknown id → silent workspace-home fallback (no existence oracle); bare `/w/:slug/team` → teams list, never 404 (23-06) | ✓ VERIFIED | src/shell/render.js:124–127 team branch before ROUTE_IDS catch-all; src/main.js:181–187 team branch + bare-seg hardening. e2e/deep-link.spec.mjs 14/14. **UAT test 4 re-test on live deployment (direct load / F5): pass** |

**Score:** 12/12 truths verified (0 present-behavior-unverified)

### Re-Verification Notes

- **G-23-1** closed at code level (server.js authority-first resolution) and confirmed on the live deployment by UAT re-test 1 (byline shows author name) — 23-UAT.md.
- **G-23-4** closed at code level (render.js + main.js team branches) and confirmed on the live deployment by UAT re-test 4 (team URL survives F5) — 23-UAT.md.
- **Regressions:** none — deep-link e2e 14/14, back-forward e2e 10/10, notif + file-route unit tests 17/17, `npm test` 593/593 (at plan head 87947d5).

### Test Gates

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

### Human Verification — COMPLETE

All four UAT items passed on the live deployment (23-UAT.md, `status: complete`, 0 issues), including the two previously-human-needed gap re-tests:

1. **Email link end-to-end on real deployment** — pass (re-test of G-23-1 scope)
2. **Logged-out click → sign-in → return** — pass
3. **Back/forward feel across views with drawer open** — pass
4. **Team page survives refresh (direct load / F5)** — pass (re-test of G-23-4 scope)

## Gaps Summary

None. Both UAT-reported gaps (G-23-1 byline, G-23-4 team 404) are closed with code + passing behavioral tests AND confirmed on the live deployment. All 4 requirements (LINK-01..LINK-04) verified. Phase goal achieved.

---

_Verified: 2026-10-31T13:20:00Z_
_Verifier: the agent (gsd-verifier)_
