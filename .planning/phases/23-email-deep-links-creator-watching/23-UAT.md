---
status: testing
phase: 23-email-deep-links-creator-watching
source: [23-VERIFICATION.md]
started: 2026-10-30T16:57:37+01:00
updated: 2026-10-30T16:57:37+01:00
---

## Current Test

number: 3
name: Back/forward feel across views with drawer open
expected: |
  Navigate several views, open a task drawer, close it, then use browser
  Back/Forward repeatedly. Back re-opens the task after close; no dead
  Back presses; history doesn't accumulate duplicates on repeated
  same-view navigation.
awaiting: user response

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
result: [pending]

### 4. Team page survives refresh
expected: Loading https://projects.jeremymaillot.fr/w/prod/team directly (or hitting F5 on it) renders the team information view — no 404.
result: issue
reported: "Two teams 'Infra' & 'BDD'; on https://projects.jeremymaillot.fr/w/prod/team, F5 gives a 404 — the URL doesn't map into the team view but falls back to the root"
severity: major

## Summary

total: 4
passed: 1
issues: 2
pending: 1
skipped: 0
blocked: 0

## Gaps

- gap_id: G-23-1
  truth: "Email shows the acting user's name (e.g. 'Alice mentioned you'), not the fallback 'Un membre'"
  status: failed
  reason: "User reported: URL is linked to the task, it's good, but the email says 'Un membre mentioned you' instead of the author's username"
  severity: minor
  test: 1
  artifacts: []
  missing: []
- gap_id: G-23-4
  truth: "Refreshing (F5) or directly loading /w/:slug/team renders the team view — no 404"
  status: failed
  reason: "User reported: on https://projects.jeremymaillot.fr/w/prod/team, F5 gives a 404 — the URL doesn't map into the team view but falls back to the root"
  severity: major
  test: 4
  artifacts: []
  missing: []
