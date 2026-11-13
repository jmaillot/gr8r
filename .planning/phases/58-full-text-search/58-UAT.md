---
status: complete
phase: 58-full-text-search
source: [58-VERIFICATION.md]
started: 2026-11-13T00:00:00Z
updated: 2026-11-13T08:58:24+00:00
---

## Current Test

[testing complete]

## Tests

### 1. pg parity rows (SEARCH-03/04) — opt-in Postgres run
expected: Set POSTGRES_TEST_URL to a live pg 17 instance and run test/db-adapter.test.mjs — all parity rows green on both backends (accent folding, prefix-AND, ranking, sweep healing).
result: pass

### 2. Hybrid palette live check
expected: With the server running, Ctrl-K shows instant local results plus merged server-only tasks (no duplicates, no flicker) within ~250 ms debounce; with the server down, the palette silently degrades to local-only results with no error toast.
result: issue
reported: "Ctrl-K palette (default cmd mode) never dispatches the server search — server-only tasks only appear after pressing Tab to switch to search mode (or on the /search page). Verified live: /search request fires and merge works in search mode; zero /search requests in cmd mode."
severity: major

### 3. e2e full run — flake confirmation
expected: Full e2e run passes except the 2 documented flaky specs (saved-views toast, 2fa-fr), each of which passes when re-run in isolation — confirming the phase 57 precedent still holds after phase 58 changes.
result: pass

## Summary

total: 3
passed: 1
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-58-2
  truth: "With the server running, Ctrl-K shows instant local results plus merged server-only tasks (no duplicates, no flicker) within ~250 ms debounce."
  status: failed
  reason: "User reported: Ctrl-K palette (default cmd mode) never dispatches the server search — server-only tasks only appear after pressing Tab to switch to search mode (or on the /search page)."
  severity: major
  test: 2
  artifacts: []
  missing: []
