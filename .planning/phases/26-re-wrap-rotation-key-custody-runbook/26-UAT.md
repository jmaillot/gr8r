---
status: diagnosed
phase: 26-re-wrap-rotation-key-custody-runbook
source: [26-VERIFICATION.md]
started: 2026-11-01T09:07:31Z
updated: 2026-11-01T10:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Live runbook walkthrough on staging
expected: Follow DEPLOY.md §14 end-to-end (env config, reboot, D-K13 query returns 0, no re-enrollment, second boot no-op)
result: issue
reported: "unable to login after rotation"
severity: blocker

## Summary

total: 1
passed: 0
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-26-1
  truth: "One-boot rotation: 2FA users log in without re-enrolling after rotation boot"
  status: failed
  reason: "User reported: unable to login after rotation"
  severity: blocker
  test: 1
  root_cause: "Rotation boot ran without MASTER_KEY_PREVIOUS in the container's actual env and/or on a pre-Phase-26 image (re-wrap pass from 5956807 missing). The v2 envelope stayed sealed under the OLD key whose id was absent from the server KEYRING: no re-wrap ran (no `TOTP re-wrap:` / `pre-migration backup:` lines), D-K7 flagged the row as unrecognized version, and 2FA verify fails closed 503 masterKeyMissing (D-78a, by design). Code in server.js verified correct; fault locus is deployment env/image."
  artifacts:
    - path: "server.js"
      issue: "not a code defect — D-K7 scan (1291-1310), D-K14 gate (1426), re-wrap pass (1424-1521), fail-closed 2FA (2191-2193) all behave per design; pass never ran because PREVIOUS was missing from container env"
    - path: "DEPLOY.md"
      issue: "§14 runbook lacks two preconditions: verify the deployed image contains the Phase 26 re-wrap pass, and verify the envelope's key id resolves under MASTER_KEY_PREVIOUS before rotating"
  missing:
    - "DEPLOY.md §14 precondition step: check image contains migrateTotpReWrap (grep in container) before rotating"
    - "DEPLOY.md §14 precondition step: read key ids from the running container env and confirm id(MASTER_KEY_PREVIOUS) matches the envelope key id stamped in the DB"
    - "Recovery runbook note: if rotation boot logged D-K7 without a re-wrap line, restore the OLD key as MASTER_KEY to recover login (row is byte-identical, no data loss)"
  debug_session: ".planning/debug/login-broken-after-rotation.md"
