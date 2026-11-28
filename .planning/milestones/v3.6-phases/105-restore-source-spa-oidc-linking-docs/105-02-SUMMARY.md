---
phase: 105-restore-source-spa-oidc-linking-docs
plan: 02
subsystem: docs
tags: [oidc, docs, deploy, env-example, fidelity-pins]
requires: []
provides:
  - "DEPLOY.md linking-policy truth (OIDC_TRUST_TENANT_EMAIL lead + guest carve-out + symptom table)"
  - "Azure GUID copy-path in group-claim prerequisites"
  - ".env.example expanded TRUST_TENANT_EMAIL comment"
  - "test/oidc-docs.test.mjs docs-fidelity pins"
affects: []
tech-stack:
  added: []
  patterns:
    - "fs-read docs-pinning test (restore-client.test.mjs style)"
key-files:
  created:
    - test/oidc-docs.test.mjs
  modified:
    - docs/DEPLOY.md
    - .env.example
decisions:
  - "Extended the existing ApplicationGroup prerequisites bullet list with ONE GUID copy-path bullet instead of a new heading (per research planner decision)"
  - "Symptom→cause table has 3 rows including the still-failing/issuer-mismatch row per plan action spec"
metrics:
  duration: ~35 min
  completed: 2026-11-28
status: complete
actuals:
  tokens: 11000
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 9a60849d
plan_head_after: 2df1f5ff
---

# Phase 105 Plan 02: OIDC Linking Docs Summary

**DEPLOY.md OIDC linking-policy rewritten to match server.js:6673-6727 (flag lead, guest carve-out, symptom table), Azure GUID copy-path added, .env.example comment expanded — all fidelity-pinned by a new docs test.**

## What Was Done

### Task 1: DEPLOY.md linking-policy rewrite + GUID copy-path (commit 2e43985d)
- Replaced DEPLOY.md :330-339 (the two paragraphs) with: (1) linking-policy paragraph (literal-claim rule, fail-closed, already-linked immunity), (2) **Azure AD work/school tenants** block leading with `OIDC_TRUST_TENANT_EMAIL=true`, scoped to pinned-tenant members only, covering linking AND JIT provisioning, (3) **Guest carve-out** block (acct=1 / external-IdP identities always need literal `email_verified: true`; flag never applies; fix guests at the IdP), (4) 3-row symptom→cause table replacing the stale "check tenant email verification" operator note.
- Added ONE bullet to the existing **ApplicationGroup claim prerequisites** list: Entra admin center → Identity → Groups → your group → Overview → copy **Object ID** — the GUID pasted into the /governance mappings form.
- Neighbors (:328-329 smoke paragraph, **Smoke-test checklist**) untouched; no reflow, no new heading.
- Every claim verified verbatim against server.js:6673-6727 (isPinnedTenant :6713, guestShape :6714, canLink :6715, token list :6723, substitution :6724).

### Task 2: .env.example expansion + docs-fidelity test (commit 2df1f5ff, TDD RED→GREEN)
- RED first: wrote `test/oidc-docs.test.mjs` (5 tests, fs-read, restore-client style) — the .env.example assertion failed pre-edit, the 4 DEPLOY.md pins passed against the already-committed Task 1 rewrite.
- GREEN: expanded the `.env.example` OIDC_TRUST_TENANT_EMAIL comment with the why (work/school tokens omit the claim), explicit guest carve-out (acct=1 / external idp — flag never applies), accepted token list (true/1/yes/on), and the "See docs/DEPLOY.md → Linking policy" pointer.
- `node --test test/oidc-docs.test.mjs`: 5/5 pass.

## Deviations from Plan

None — plan executed exactly as written. (One test-internal fix during RED: the initial comment-block regex in the new test required the var name inside the comment, which it never contains; rewritten to match the comment block directly above the assignment line. No doc or behavior change.)

## Verification

- `node --test test/oidc-docs.test.mjs` → 5 pass, 0 fail
- `grep` confirms the "check tenant email verification" operator note is gone from DEPLOY.md
- Full suite after 105-01's concurrent commits settled: 2767 tests, 2733 pass, 3 fail — all documented pre-existing baseline failures (89-05 overwrite outbox gate, D-05 French typography, webhook-routes D-06); none in this plan's files. (A transient 4th failure — i18n-shell tree-wide data-a counts — was 105-01's mid-commit window over src/; resolved by its own commits, outside my scope.)

## Requirements Satisfied

- OIDCDOC-01: flag lead + guest carve-out + symptom table ✓
- OIDCDOC-02: manifest edit + assignment + GUID copy-path ✓
- OIDCDOC-03: .env.example why + carve-out + token list + pointer ✓

## Self-Check: PASSED

- Files exist: docs/DEPLOY.md, .env.example, test/oidc-docs.test.mjs ✓
- Commits exist: 2e43985d, 2df1f5ff ✓
- Known Stubs: none. Threat Flags: none (docs-only, zero new deps — T-105-SC untouched; T-105-04 mitigated by the fidelity pins).
