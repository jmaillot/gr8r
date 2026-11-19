---
phase: 75-domain-admission-core
recorded: 2026-11-19
severity: critical
source: 75-REVIEW.md
open: 4
fixed: 2
skipped: 0
deferred: 0
---

# Code Review Disposition — Phase 75

One row per finding from `75-REVIEW.md` (deep review, 2026-11-19). Dispositions:
`open` (needs a decision) / `fixed` / `skipped` / `deferred`. Edit by hand to triage;
`/gsd-code-review 75 --fix` will reconcile `fixed` rows from its fix report.

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | DP-3 invite door is bypassed when a logged-in user accepts a link-only invite — fixed: session-accept path for link-only invites now re-derives the SESSION email against the live list (`server.js`, gated `else if` after user resolution); regression test in `test/domain-admission.test.mjs` |
| WR-01 | warning | fixed | Malformed non-empty list entries are silently admitted to the allowlist (silent dead doors) — fixed: `DOMAIN_SHAPE` validation in `domains.js` routes `@example.com` / `.example.com` / `example .com` into the D-05 warn-and-clean path; regression test added |
| WR-02 | warning | open | Email identity normalization is inconsistent between storage paths (duplicate accounts / string-mismatch refusals) |
| IN-01 | info | open | DP-1 runs before any email-shape validation, so door-on signups of malformed emails report the wrong error key |
| IN-02 | info | open | Boot warning path bypasses the structured log pipeline and uses odd bracket notation |
| IN-03 | info | open | Boot log "source" tag re-derives the tri-state instead of the module exposing the resolved source |
