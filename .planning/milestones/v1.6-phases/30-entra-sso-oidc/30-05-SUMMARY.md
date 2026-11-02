---
phase: 30-entra-sso-oidc
plan: 05
subsystem: auth-sso
tags: [oidc, sso, env-surface, gap-closure]
requires: ["30-01", "30-02", "30-03", "30-04"]
provides: ["clean OIDC env surface (no OIDC_DEFAULT_ROLE)", "recorded override on plan-02 SSO-04 must-have"]
affects: []
tech-stack:
  added: []
  patterns: ["decision-driven removal (D-05 route 2) with recorded override instead of silent drop"]
key-files:
  created: []
  modified:
    - oidc.js
    - server.js
    - DEPLOY.md
    - test/oidc-sso.test.mjs
    - .planning/phases/30-entra-sso-oidc/30-02-PLAN.md
decisions:
  - "SSO-04 closed by REMOVAL (route 2) per D-05: a JIT bare account has no workspace, so a clamped member|viewer default has no provisioning point — invite.role (SSO-07) and onboarding owner grant are the only role-bearing paths"
  - "Plan-02 SSO-04 must-have truth carries an explicit OVERRIDE annotation citing D-05 (traceability, not a silent drop)"
metrics:
  duration: ~12 min
  completed: 2026-11-02
  tasks: 2
  commits: 2
actuals:
  tokens: 22000
  tasks: 2
  commits: 2
status: complete
plan_head_before: fecc0d0
plan_head_after: fc80b60
---

# Phase 30 Plan 05: Remove OIDC_DEFAULT_ROLE (SSO-04 Gap Closure) Summary

**One-liner:** Removed the parsed-but-never-consumed `OIDC_DEFAULT_ROLE` env var end-to-end (oidc.js config + factories, server.js env doc, DEPLOY.md contract, 8 clamp unit tests) per D-05's locked bare-account model, and recorded the required override on plan-02's SSO-04 must-have truth.

## What Was Built

### Task 1 — End-to-end removal (tracer slice: config → docs → tests, one commit)
- **oidc.js**: deleted `OIDC_DEFAULT_ROLE` from the header env table, `defaultRoleRaw` + `defaultRole` (+ D-04 comment) from `readConfig`, and `defaultRole` from both factory objects. `readConfig` now returns exactly: tenantId, clientId, clientSecret, issuer, scopes, ssoOnly. Activation logic (D-02) untouched.
- **server.js**: deleted the single env-doc line (~40). The callback provisioning path (2690-2810) is byte-identical — bare-account JIT (D-05) and invite reconciliation via `invite.role` (SSO-07) unchanged.
- **DEPLOY.md**: deleted the dotenv sample line and the clamp sentence; activation-rule paragraph otherwise intact.
- **test/oidc-sso.test.mjs**: deleted the 8-row clamp loop plus the now-unused `oidcFactoryEnv` helper and `createOidc` import. Remaining tests untouched.

### Task 2 — Recorded override + full regression sweep
- **30-02-PLAN.md**: appended the `OVERRIDE (gap closure 30-05)` annotation directly under the SSO-04 must-have truth, citing D-05's locked bare-account model (JIT account has no workspace; role-bearing paths are invite reconciliation with `invite.role` and onboarding workspace creation with owner). Also annotated the `OIDC_DEFAULT_ROLE parsing in oidc.js readConfig` artifact entry as removed in 30-05. The flagged-unverified "JIT role never owner/admin" backstop line left intact (trivially true — no JIT role exists anymore).

## Verification Performed

- `grep -rn 'OIDC_DEFAULT_ROLE\|defaultRole' oidc.js server.js DEPLOY.md test/ src/` → **zero matches** (grep-exit:1)
- `node --test test/oidc-sso.test.mjs` → **43 pass, 0 fail, 0 skipped** (the 8 clamp rows gone)
- `node --test --test-concurrency=2 test/*.test.mjs` → **800 tests, 797 pass, 0 fail, 3 skipped**
- Threat T-30-15 mitigated: docs, both source env-doc blocks, and code removed in the SAME commit (73dd793), enforced by the grep gate.

## Deviations from Plan

None — plan executed exactly as written.

Note: the plan's Task 1 `<fails_when>` reads "any failing or skipped test". The full-suite sweep reports 3 skips, all pre-existing intentional placeholder rows in `test/scope.test.mjs` (404-matrix unknown-probe rows: "no unknown probe exists" / "dangling-project writes are pre-phase semantics") — that file is unchanged by this plan (out of scope per the scope boundary rule), and `test/oidc-sso.test.mjs` itself reports 0 skipped. Not a deviation; recorded for the verifier.

## Auth Gates

None.

## Known Stubs

None.

## Threat Flags

None — no new surface introduced (pure removal).

## Commits

- 73dd793: fix(30-5): remove unconsumed OIDC_DEFAULT_ROLE env var end-to-end (SSO-04 gap, D-05 route 2)
- fc80b60: docs(30-5): record D-05 override on plan-02 SSO-04 must-have truth
