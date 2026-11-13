---
status: testing
phase: 58-full-text-search
source: [58-VERIFICATION.md]
started: 2026-11-13T00:00:00Z
updated: 2026-11-13T00:00:00Z
---

## Current Test

number: 1
name: pg parity rows (SEARCH-03/04) — opt-in Postgres run
expected: |
  With POSTGRES_TEST_URL pointed at a live Postgres 17 (per the suite's pg-matrix runbook), test/db-adapter.test.mjs runs the parity rows green: "elodie" matches "Élodie" (unaccent-equivalent folding without pg extensions), prefix-AND matching, ranking determinism, update/delete sync, and sweep healing of an empty projection table — same behaviors as the SQLite backend.
awaiting: user response

## Tests

### 1. pg parity rows (SEARCH-03/04) — opt-in Postgres run
expected: Set POSTGRES_TEST_URL to a live pg 17 instance and run test/db-adapter.test.mjs — all parity rows green on both backends (accent folding, prefix-AND, ranking, sweep healing).
result: [pending]

### 2. Hybrid palette live check
expected: With the server running, Ctrl-K shows instant local results plus merged server-only tasks (no duplicates, no flicker) within ~250 ms debounce; with the server down, the palette silently degrades to local-only results with no error toast.
result: [pending]

### 3. e2e full run — flake confirmation
expected: Full e2e run passes except the 2 documented flaky specs (saved-views toast, 2fa-fr), each of which passes when re-run in isolation — confirming the phase 57 precedent still holds after phase 58 changes.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
