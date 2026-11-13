---
status: diagnosed
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
  root_cause: "Implementation gap: dispatchServerSearch in src/overlays/palette.js:78 early-returns on pl.mode !== 'search', silently discarding every cmd-mode dispatch before any fetch. No plan/commit/context doc justifies cmd-mode exclusion (58-03-PLAN wires the merge through IN.palQ with no mode restriction; D-01 claims merge into the same palette results). Render path already cmd-ready (tasks group renders with sc='all'; merge hook at line 185 is mode-independent; stale-discard handles Tab mid-flight)."
  artifacts:
    - path: "src/overlays/palette.js"
      issue: "line 78 mode guard contradicts D-01/58-03-PLAN/SUMMARY"
  missing:
    - "Dispatch the debounced server search in cmd mode too (e.g. early-return only on mode 'ws'); keep 250ms debounce, AbortController, stale-discard, demo gate untouched"
  debug_session: ".planning/debug/ctrlk-palette-server-merge.md"
