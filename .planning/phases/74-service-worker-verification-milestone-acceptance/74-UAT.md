---
status: human_needed
phase: 74-service-worker-verification-milestone-acceptance
source: [74-02-PLAN.md]
started: 2026-11-19T00:00:00Z
updated: 2026-11-19T00:00:00Z
---

## Current Test

4 real-device tests pending — owner must execute on real hardware (real-device
install dialogs cannot be automated).

## Tests

### 1. Desktop Chrome install + standalone launch
expected: Install prompt appears on an install-eligible Chromium desktop profile; app installs and launches in a standalone window (no browser chrome).
result: human_needed

### 2. Android Chrome install + standalone launch
expected: Install prompt / add-to-home-screen flow completes on Android Chrome; app launches standalone from the home screen icon.
result: human_needed

### 3. iOS Safari honest manual-install path
expected: No automatic install prompt (Safari never fires beforeinstallprompt); manual Share → Add to Home Screen works; app opens standalone; no back button (documented stance, not a bug).
result: human_needed

### 4. Push notifications still fire after all changes
expected: An existing push subscription receives a notification (regression check across Phases 72–74 changes).
result: human_needed

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

None recorded yet — any failing test is a Gap; a failing install test means the
"zero code changes" premise must be revisited (STOP-and-justify, no silent patch).
