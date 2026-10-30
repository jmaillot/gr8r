---
phase: 23-email-deep-links-creator-watching
verified: 2026-10-30T12:00:00Z
status: human_needed
score: 10/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 23: Email Deep Links & Creator Watching Verification Report

**Phase Goal:** A notification email is a door to the task, not the app root — and the people who should hear about a task's activity (including its creator) actually do.
**Verified:** 2026-10-30
**Status:** human_needed (all automated gates pass; visual/real-browser confirmation items remain)

## Goal Achievement

### Observable Truths

| #  | Truth (source)                                                                                                   | Status     | Evidence |
|----|------------------------------------------------------------------------------------------------------------------|------------|----------|
| 1  | Signed-in deep link `/w/:slug/task/:key` opens the task drawer over an underlying page, never page404 (SC-1, D-01) | ✓ VERIFIED | src/main.js:131–163 drawer-open mutations over `go('project', …)`; `go('task'` = 0 matches; e2e/deep-link.spec.mjs passes (79 e2e green) |
| 2  | URL persists across refresh; unknown/permission-hidden keys → workspace view + identical localized not-found toast (D-02/D-03, no oracle) | ✓ VERIFIED | `urlForView` (render.js:109–121) writes task URL in `go()`; toast key `err.taskNotFound` present in en.json:256 & fr.json:257 (JSON-parsed both); e2e covers reload + unknown-key scenarios |
| 3  | Notification emails are `APP_URL + /w/:slug/task/:key` with key resolved at email-build time, workspace-root fallback (LINK-01, SC-1) | ✓ VERIFIED | server.js:714–718 (encodeURIComponent'd key, fallback); test/notif-email-link.test.mjs 6/6 pass incl. static no-appBase(req) check; boot guard message covers invites + notifs (server.js:3001–3008) |
| 4  | Boot refuses when SMTP enabled and APP_URL empty (supports LINK-01) | ✓ VERIFIED | server.js:3005–3008 |
| 5  | Logged-out deep link → sign-in with `?next=` carry, exact-task return, path-only validator (no open redirect) (LINK-02, SC-2) | ✓ VERIFIED | src/main.js:273–281 pathname-only replaceState; test/next-carry.test.mjs green (scheme-relative/absolute/backslash/`://` rejected); e2e sign-in-return scenarios pass |
| 6  | Task creator recorded at creation and in the watcher set (LINK-03) | ✓ VERIFIED | actions.js:84 `creator: D().me`; actions.js:159 Set includes `t.creator`; test/creator-watcher.test.mjs green |
| 7  | Creator === assignee yields ONE watcher entry; no self-notifications; legacy tasks tolerated (SC-3, D-05) | ✓ VERIFIED | Set dedup + `.filter(Boolean)` + `x !== D().me` chain intact (actions.js:159); double exclusion confirmed client + server `n.by === n.to` skip; tests green |
| 8  | Back/forward across SPA views restore views via pushState + single popstate handler (LINK-04, SC-4) | ✓ VERIFIED | render.js:82–92 pushState/replaceState split (`opt.back`/`opt.replace` never push); main.js:180–204 exactly one popstate listener; e2e/back-forward.spec.mjs passes (EN+FR) |
| 9  | No double-push on popstate; drawer-close pushes underlying URL (23-04 must-haves) | ✓ VERIFIED | render.js:91 `opt.back → replaceState`; e2e back-forward spec asserts history-length stability |
| 10 | `/w/:slug/file/:id` byte route still serves bytes; route ordering unchanged (SC-5) | ✓ VERIFIED | test/file-route-ordering.test.mjs green (bytes, 302 `/login?next=`, task path rides SPA fallback) |

**Score:** 10/10 truths verified (0 present-behavior-unverified)

### Test Gates (all run this session)

| Gate | Command | Result |
|------|---------|--------|
| Phase unit tests | `node --test test/notif-email-link.test.mjs test/next-carry.test.mjs test/creator-watcher.test.mjs test/catalogue.test.mjs test/file-route-ordering.test.mjs` | 45/45 pass |
| Full suite | `npm test` | 585/585 pass |
| E2E suite | `npx playwright test --config e2e/playwright.config.mjs` | 79/79 pass (5.6 min) |
| i18n gate | both locale files parsed; `err.taskNotFound` present in en + fr | pass |

### Requirements Coverage

| Requirement | Source Plan(s) | Status | Evidence |
|-------------|----------------|--------|----------|
| LINK-01 | 23-01 | ✓ SATISFIED | Truths 3–4 |
| LINK-02 | 23-02 | ✓ SATISFIED | Truth 5 |
| LINK-03 | 23-03 | ✓ SATISFIED | Truths 6–7 |
| LINK-04 | 23-04 | ✓ SATISFIED | Truths 8–9 |

No orphaned requirements: REQUIREMENTS.md maps exactly LINK-01..04 to Phase 23, all claimed by plans and all verified.

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| src/main.js applyDeepLink | src/overlays/drawer.js | S.ui.drawer mutations (A.openTask path) + render | ✓ WIRED |
| server.js queueNotifEmails | mailer sendNotif | msg.url = APP_URL + /w/:slug/task/:key | ✓ WIRED |
| APP_URL boot guard | all MAILER absolute URLs | server.js:3005 exit when MAILER.enabled && !APP_URL | ✓ WIRED |
| logged-out boot | /login?next= + finishLogin | pathname-only carry, single path-only validator | ✓ WIRED |
| go() → pushState → popstate → applyDeepLink({back:true}) | view restore | single handler, { back: true } | ✓ WIRED |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | no TBD/FIXME/XXX/placeholder markers in phase-modified files | — | — |

### Advisory Open Findings (from 23-REVIEW.md — informational, not verification gaps)

- **CR-01** (applyDeepLink TypeError on key-less segment): the live code guards with `if (key)` at src/main.js:134 — the crash path appears already fixed, but 23-REVIEW-DISPOSITION.md still records it as `open`. Recommend reconciling the disposition (mark `fixed` or re-review). Advisory.
- HIGH-01 / MED-01 / MED-02 / LOW-01..03 remain recorded as open in the disposition; none breaks a must-have (HIGH-01 same-URL duplicate history entries and MED-02 percent-decoding of task keys are edge polish; task keys are URL-safe in practice).

## Human Verification Required

Automated checks all pass; the following need a human pass (e2e covers them, but they are visual/real-browser UX behaviors):

### 1. Email link end-to-end on a real deployment
**Test:** Trigger a real notification email, click its task link in a mail client.
**Expected:** Lands directly on the task drawer (not app root), URL is `/w/:slug/task/:key`.
**Why human:** Requires a live SMTP send and real mail-client rendering of text/HTML bodies.

### 2. Logged-out click → sign-in → return
**Test:** In a private window, click an emailed task link, sign in.
**Expected:** Address bar shows `?next=…` at the sign-in view; after login you land on the exact task; a crafted `//evil.com` next is rejected.
**Why human:** Cross-browser redirect behavior and address-bar UX are not fully observable in Playwright assertions alone.

### 3. Back/forward feel across views with drawer open
**Test:** Navigate several views, open a task drawer, close it, then use browser Back/Forward repeatedly.
**Expected:** Back re-opens the task after close; no dead Back presses; history doesn't accumulate duplicates on repeated same-view navigation.
**Why human:** History-entry bookkeeping across browsers (Safari/Firefox popstate timing) merits a manual pass.

## Gaps Summary

None. All 4 requirements (LINK-01..LINK-04) and all 5 roadmap success criteria are verified in the codebase with passing behavioral tests. Status is human_needed only for the standard post-verification UAT pass on live-email and browser-history UX.

---

_Verified: 2026-10-30T12:00:00Z_
_Verifier: the agent (gsd-verifier)_
