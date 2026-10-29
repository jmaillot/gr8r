---
status: complete
phase: 04-hardening-and-ship
source: [04-VERIFICATION.md]
started: 2026-10-21T20:10:00Z
updated: 2026-10-21T21:00:00Z
---

## Current Test

number: 1
name: First CI run passes both jobs
expected: |
  The `build` job (lint, format check, build, `npm test`) and the `e2e` job (build, Chromium with
  system dependencies, `npm run e2e`) both pass on Node 24, and Playwright artifacts upload only on
  failure.
awaiting: none

## Tests

### 1. First CI run passes both jobs
expected: Both `build` and `e2e` GitHub Actions jobs pass on Node 24; Chromium is installed with system dependencies; traces/screenshots are uploaded only on failure.
result: pass — GitHub Actions run [39674830039](https://github.com/jmaillot/projects/actions/runs/39674830039) on `main`: `build` passed in 15s (npm ci, lint, format check, build, `npm test`), `e2e` passed in 30s (build, `npx playwright install --with-deps chromium`, `npm run e2e`); the upload-artifact step was skipped because the run was green.

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
