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
result: issue
reported: "Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/tz.js' imported from /app/server.js — the Dockerfile did not copy the new tz.js module into the runtime image; deploy crashed at boot."
severity: blocker

### 2. Accept or defer review warnings WR-01 / WR-02
expected: Human decision to accept admin-path raw tz storage (WR-01, defense-in-depth — downstream reads funnel through resolveTz) and alias/case preselect degradation (WR-02) as deferred hardening, or schedule a fix phase.
result: [pending]

## Summary

total: 2
passed: 0
issues: 1
pending: 1
skipped: 0
blocked: 0

## Gaps

- gap_id: G-44-1
  truth: "Combobox renders with live offset labels, filters as you type, keyboard selection saves via toast, and the choice survives reload from members[me].tz"
  status: resolved
  resolved_by: "828b476 — Dockerfile: COPY --from=build /app/tz.js ./tz.js"
  resolved_at: 2026-11-07
  reason: "User reported: deploy crash ERR_MODULE_NOT_FOUND /app/tz.js — Dockerfile runtime stage did not copy the new module created by plan 44-01."
  severity: blocker
  test: 1
  artifacts:
    - path: Dockerfile
      issue: "tz.js missing from the runtime image COPY list"
  missing: []
