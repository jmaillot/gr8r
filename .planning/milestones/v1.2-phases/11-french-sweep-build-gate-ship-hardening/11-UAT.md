---
status: complete
phase: 11-french-sweep-build-gate-ship-hardening
source: [11-VERIFICATION.md]
started: 2026-10-24T16:38:11Z
updated: 2026-10-24T17:05:00Z
---

## Current Test

[testing complete]

## Tests

### 1. 21-route French sweep run
expected: All 21 routes prove a French marker, then zero English-catalogue leaks (text, aria-label, data-tip, title, hidden nodes included).
result: pass

### 2. Demo-mode French proof
expected: npm run build && npx playwright test --config e2e/demo.playwright.config.mjs — the built demo (vite preview of dist/, no API) boots in French for a fr-FR context, and the EN↔FR switch persists across a reload via localStorage.
result: pass

### 3. docker-build CI job green
expected: On the next push, open the GitHub Actions run: docker build → throwaway run → /api/health wait → served fr-*.js chunk contains 'Projets' → docker stop. Job green, no push, no registry credentials.
result: pass

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
