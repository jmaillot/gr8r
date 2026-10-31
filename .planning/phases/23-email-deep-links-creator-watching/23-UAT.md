---
status: diagnosed
phase: 23-email-deep-links-creator-watching
source: [23-VERIFICATION.md]
started: 2026-10-30T16:57:37+01:00
updated: 2026-10-31T11:40:02+01:00
---

## Current Test

[testing complete]

## Tests

### 1. Email link end-to-end on a real deployment
expected: Trigger a real notification email, click its task link in a mail client. Lands directly on the task drawer (not app root), URL is /w/:slug/task/:key.
result: issue
reported: "URL is linked to the task, it's good, but the email says 'Un membre mentioned you' instead of the author's username"
severity: minor

### 2. Logged-out click → sign-in → return
expected: In a private window, click an emailed task link, sign in. Address bar shows ?next=… at the sign-in view; after login you land on the exact task; a crafted //evil.com next is rejected.
result: pass

### 3. Back/forward feel across views with drawer open
expected: Navigate several views, open a task drawer, close it, then use browser Back/Forward repeatedly. Back re-opens the task after close; no dead Back presses; history doesn't accumulate duplicates on repeated same-view navigation.
result: pass

### 4. Team page survives refresh
expected: Loading https://projects.jeremymaillot.fr/w/prod/team directly (or hitting F5 on it) renders the team information view — no 404.
result: issue
reported: "Two teams 'Infra' & 'BDD'; on https://projects.jeremymaillot.fr/w/prod/team, F5 gives a 404 — the URL doesn't map into the team view but falls back to the root"
severity: major

## Summary

total: 4
passed: 2
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-23-1
  truth: "Email shows the acting user's name (e.g. 'Alice mentioned you'), not the fallback 'Un membre'"
  status: failed
  reason: "User reported: URL is linked to the task, it's good, but the email says 'Un membre mentioned you' instead of the author's username"
  severity: minor
  test: 1
  root_cause: "Stored workspace doc never persists account-backed member profiles (roster authority = memberships+users, rebuilt only on read via syncProfiles); queueNotifEmails resolves the byline from nextDoc.data.members (empty of account members at build time) so the name falls through to 'Un membre'. Sibling defect: recipient email resolution (server.js:707-708) uses the same empty map — account-backed recipients may be silently skipped."
  artifacts:
    - path: "server.js"
      issue: "queueNotifEmails (699,722) builds profiles only from nextDoc.data.members; docFromClient (763-801) drops account-backed members on write; syncProfiles (867-899) runs on reads only"
  missing:
    - "queueNotifEmails: resolve author name from authority tables (memberships⋈users) by n.by, keep profile.name for doc-only members, 'Un membre' as last resort"
    - "Same lines: recipient email resolution must fall back to authority rows so account-backed recipients are not silently skipped"
  debug_session: ".planning/debug/23-un-membre-byline.md"
- gap_id: G-23-4
  truth: "Refreshing (F5) or directly loading /w/:slug/team renders the team view — no 404"
  status: failed
  reason: "User reported: on https://projects.jeremymaillot.fr/w/prod/team, F5 gives a 404 — the URL doesn't map into the team view but falls back to the root"
  severity: major
  test: 4
  root_cause: "Team URL is lossy: urlForView() writes /w/:slug/team with no team id, so F5 resolves go('team', {id: undefined}) and pageTeam(undefined) renders page404(). Server SPA fallback is fine (200 locally)."
  artifacts:
    - path: "src/shell/render.js"
      issue: "urlForView() has no team branch — URL omits the team id (lines 109-127)"
    - path: "src/main.js"
      issue: "applyDeepLink() plain-route fallback calls go('team', {}) without resolving the id (line 177)"
    - path: "src/pages/members.js"
      issue: "pageTeam(undefined) → null → page404() (lines 113-115)"
  missing:
    - "urlForView(): emit /w/:slug/team/:id when params.id is set"
    - "applyDeepLink(): team branch mirroring member — resolve id, unknown id → workspace fallback (no leak)"
    - "Hardening: bare /w/:slug/team renders teams list/first team instead of 404 (covers old bookmarks)"
    - "e2e deep-link.spec.mjs: direct load, F5 persistence, unknown-id no-leak"
  debug_session: ".planning/debug/23-team-route-404.md"
  gap_id_still_open: false
