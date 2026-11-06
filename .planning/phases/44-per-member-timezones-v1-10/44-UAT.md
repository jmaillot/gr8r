---
status: testing
phase: 44-per-member-timezones-v1-10
source: [44-VERIFICATION.md]
started: 2026-11-06T18:00:00Z
updated: 2026-11-06T18:00:00Z
---

## Current Test

number: 1
name: Browser UAT of the timezone combobox (Settings > Date & time)
expected: |
  Combobox renders with live offset labels, filters as you type, keyboard
  selection saves via toast, and the choice survives reload from
  members[me].tz. Paris is preselected when no tz is stored; a stored legacy
  label like '(GMT+08:00) Singapore' displays Singapore, not Paris.
awaiting: user response

## Tests

### 1. Browser UAT of the tz combobox
expected: Open Settings > Date & time as a member, type to filter (e.g. 'tokyo'), select with mouse and again with arrow/enter, reload the page. Options show IANA id + city + live GMT offset; selection persists in the member profile after reload; Paris is preselected when no tz stored; a stored legacy label like '(GMT+08:00) Singapore' displays Singapore, not Paris.
result: [pending]

### 2. Accept or defer review warnings WR-01 / WR-02
expected: Human decision to accept admin-path raw tz storage (WR-01, defense-in-depth — downstream reads funnel through resolveTz) and alias/case preselect degradation (WR-02) as deferred hardening, or schedule a fix phase.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
