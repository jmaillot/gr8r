---
phase: 10-browser-coverage-in-both-locales
source: 10-REVIEW.md
written: 2026-10-24
---

# Phase 10 Review Disposition

Review verdict: 0 critical / 4 warnings / 4 info — advisory, non-blocking. Every finding defaults to `open` for triage during UAT/ship.

| Finding | Severity | File | Summary | Disposition |
|---------|----------|------|---------|-------------|
| WR-01 | warning | e2e/locale.spec.mjs | Asserts raw transcribed strings instead of the catalogue `fmt()` pattern; drift-risk (currently matches en.json/fr.json) | open |
| WR-02 | warning | e2e/locale.spec.mjs | Duplicates invite-token slicing inline; missing `/join/` gives garbage token + opaque 404 instead of `inviteToken()`'s explicit error | open |
| WR-03 | warning | e2e/playwright.config.mjs | Local workers unbounded; correctness silently depends on run-unique-IP fixture invariant | open |
| WR-04 | warning | e2e/flows.spec.mjs | Re-derives workspace names that `createAccount` constructs internally — two copies of one naming convention | open |
| IN-01 | info | fmt() helper | Plural fallback crashes with opaque TypeError instead of clear message | open |
| IN-02 | info | e2e/flows.spec.mjs | Machine-value literal `'Can view'` hardcoded in share assertion | open |
| IN-03 | info | e2e/server.mjs | Signal handler exits 0 even when child failed | open |
| IN-04 | info | fmt() helper | Redundant locale ternary in plural selection | open |