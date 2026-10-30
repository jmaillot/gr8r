---
status: testing
phase: 23-email-deep-links-creator-watching
source: [23-VERIFICATION.md]
started: 2026-10-30T16:57:37+01:00
updated: 2026-10-30T16:57:37+01:00
---

## Current Test

number: 1
name: Email link end-to-end on a real deployment
expected: |
  Trigger a real notification email, click its task link in a mail client.
  Lands directly on the task drawer (not app root), URL is /w/:slug/task/:key.
awaiting: user response

## Tests

### 1. Email link end-to-end on a real deployment
expected: Trigger a real notification email, click its task link in a mail client. Lands directly on the task drawer (not app root), URL is /w/:slug/task/:key.
result: [pending]

### 2. Logged-out click → sign-in → return
expected: In a private window, click an emailed task link, sign in. Address bar shows ?next=… at the sign-in view; after login you land on the exact task; a crafted //evil.com next is rejected.
result: [pending]

### 3. Back/forward feel across views with drawer open
expected: Navigate several views, open a task drawer, close it, then use browser Back/Forward repeatedly. Back re-opens the task after close; no dead Back presses; history doesn't accumulate duplicates on repeated same-view navigation.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
