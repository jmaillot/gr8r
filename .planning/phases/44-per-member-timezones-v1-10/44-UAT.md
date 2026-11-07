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
reported: "Second issue found in local repro: Settings > Date & time rendered the load-failed state — TypeError 're(...).includes is not a function'. tzFilter (44-03) used foldForSearch()'s object return ({text,map}) as a string. Fixed in 8a231de following the palette.js .text discipline; verified in local browser repro (filter 'tokyo' -> Asia/Tokyo, keyboard select -> toast, persistence after reload)."

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
- gap_id: G-44-2
  truth: "Combobox renders with live offset labels, filters as you type, keyboard selection saves via toast, and the choice survives reload from members[me].tz"
  status: resolved
  resolved_by: "8a231de — tzFilter: foldForSearch(...).text (the palette.js discipline); local browser repro verified end-to-end"
  resolved_at: 2026-11-07
  reason: "User reported: 'cette page n'as pu être chargée' on the timezone section — TypeError at render, foldForSearch object misused as string in tzFilter."
  severity: blocker
  test: 1
  artifacts:
    - path: src/pages/settings.js
      issue: "tzFilter passed foldForSearch()'s {text,map} object to .includes"
  missing: []
