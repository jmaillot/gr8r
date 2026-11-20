---
phase: 78-creation-gate-instance-owner-identity
plan: 01
subsystem: server-authz
tags: [creation-gate, env-contract, operator-identity, audit-log, locales]
requires: [75-domain-admission-core (boot-log/D-121 route precedents)]
provides:
  - WORKSPACE_CREATION strict-token boot contract (unset=false fail-closed, boot-refuse on invalid)
  - POST /api/workspaces isInstanceAdmin-only gate when closed (keyed 403 workspaceCreationClosed)
  - /api/config boolean workspaceCreation field
  - operator promote/demote endpoints (multi-seat is_instance_admin, lastOperator 409, tx audit rows)
affects: [78-02 (client await page consumes /api/config boolean + promote/demote console UI)]
tech-stack:
  added: []
  patterns: [boot-frozen env const + boot-refuse, D-121 operator route clone, needOwner count-guard analog, audit-in-tx]
key-files:
  created: [test/creation-gate.test.mjs]
  modified: [server.js, test/helpers/server.mjs, test/membership.test.mjs, test/error-codes.test.mjs, test/i18n-core-features.test.mjs, src/locales/en.json, src/locales/fr.json, src/locales/nl.json, src/locales/de.json, src/locales/es.json, docs/DEPLOY.md]
decisions:
  - unset vs '' are distinct: unset=false boots, ''=boot-refuse (Pitfall 4)
  - audit_log.session_count=0 for promote/demote (schema NOT NULL — plan's "null" corrected)
  - throttle omitted on promote/demote (low-frequency console writes, read-route precedent)
  - demote-self legal when other operators exist; lastOperator count guard is the safety net
metrics:
  duration: ~55 min
  completed: 2026-11-20
status: complete
estimate:
  tokens: 66000
  tasks: 4
commits: 6
plan_head_before: 5b4aae51
plan_head_after: 66b5d1e5
actuals:
  tokens: 62000
  tasks: 4
  commits: 6
---

# Phase 78 Plan 01: Server — Creation Gate, Boot Contract, Operator Identity Summary

**One-liner:** `WORKSPACE_CREATION` strict-token boot gate (unset=false fail-closed, boot-refuse on any other token) decoupled from `ALLOW_SIGNUP`, with operator-only closed-gate enforcement, `/api/config` boolean, and console-managed multi-seat operator promote/demote endpoints backed by transactional audit rows.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | BASE_ENV shield (Pitfall 5) + scaffold | 49d2eb81 | test/helpers/server.mjs, test/creation-gate.test.mjs |
| 2 | Tracer: env parse → boot-refuse/log → gate swap → /api/config (TDD) | 6aa0da27 | server.js, test/creation-gate.test.mjs, 5 locales, test/membership.test.mjs, test/error-codes.test.mjs |
| 3 | Operator promote/demote endpoints (TDD) | 35f20661 | server.js, test/creation-gate.test.mjs, 5 locales |
| 4 | DEPLOY.md contract + upgrade note + break-glass | 5f31c516 | docs/DEPLOY.md |
| — | Catalogue-size pin 1951 | 66b5d1e5 | test/i18n-core-features.test.mjs |

## Verification

- `node --test test/creation-gate.test.mjs` — **26/26 pass** (token matrix ×8, boot-log ×3, gate matrix ×4 incl. D-112 workspace-owner refusal, decouple ×2, config ×2, promote/audit-row, operatorOnly, keyed 404, idempotency, lastOperator 409, demote-self, audit-tx rollback, reboot persistence, stamp seeding, --add-user flag 0)
- `npm test` full — **1879/1893 pass, 1 fail = pre-existing** webhook-events "due.reminder claim" flake, reproduced on the pre-phase tree (git checkout 5b4aae51 -- server.js test/helpers/server.mjs → same 20/21) — out of scope
- `npm run lint` — **exit 0**, zero eslint-disable introduced (removed dead hasAdminRole instead)
- `grep -c "workspaceCreationClosed\|lastOperator" src/locales/*.json` — **2 in all 5 catalogues**
- DEPLOY.md — 8 WORKSPACE_CREATION mentions, is_instance_admin break-glass present

## Must-Haves Verification

- ✅ WORKSPACE_CREATION accepts only exact 'true'/'false'; anything else boot-refuses (logError + exit 1, error names the variable and both valid values); unset boots with gate=false — tested for 'TRUE', '', ' ', 'yes', '1'
- ✅ Gate readable at boot next to the door-matrix log (`workspace creation: open (any authenticated user)` / `closed (instance operators only)`) and via /api/config as a boolean in both modes
- ✅ POST /api/workspaces: open = any authenticated user; closed = isInstanceAdmin only; workspace-owner non-operator → 403 (D-112); ALLOW_SIGNUP fully decoupled both ways; creator role 'owner' in both modes (WSG-04)
- ✅ Promote/demote: D-121 route order (sameOrigin FIRST, Pitfall 22), operatorOnly before target lookup (keyed 404 no-oracle), lastOperator keyed 409, audit-in-tx (dropped audit_log table → 5xx, flag unchanged)
- ✅ stampInstanceAdmin seeds the first operator; flag persists across reboot on shared dataDir; --add-user leaves is_instance_admin=0
- ✅ err.workspaceCreationClosed + err.lastOperator present in all 5 catalogues in the same commits as the emitting gate/routes (WSG-11); err.askAdminForWorkspace removed everywhere; error-codes + catalogue tests green

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] audit_log.session_count is NOT NULL — plan said "null"**
- **Found during:** Task 3 (RED phase, 500 ERR_SQLITE_ERROR on first promote)
- **Fix:** pass 0 ("no sessions touched by a flag flip"); test asserts 0
- **Commit:** 35f20661

**2. [Rule 3 - Blocking] test/membership.test.mjs asserted the old ALLOW_SIGNUP↔creation coupling**
- **Found during:** Task 2 verify
- **Fix:** test rewritten to the decoupled semantics (signup closed + gate open; plain member can create)
- **Commit:** 6aa0da27

**3. [Rule 3 - Blocking] test/error-codes.test.mjs reverse-parity flagged err.askAdmin (still emitted client-side)**
- **Found during:** Task 2 verify
- **Fix:** allowlisted as client-side composed toast (A.newWorkspace belt-and-braces path)
- **Commit:** 6aa0da27

**4. [Rule 3 - Blocking] test/i18n-core-features.test.mjs pinned catalogue size 1950**
- **Found during:** full-suite verify
- **Fix:** pin → 1951 with the phase 78 changelog annotation (house pattern)
- **Commit:** 66b5d1e5

**5. [Rule 3 - Blocking] hasAdminRole became unused after the gate swap (lint error)**
- **Fix:** dead function deleted (D-112: the workspace-role gate primitive has no remaining server caller)
- **Commit:** 6aa0da27

**Documented decisions within plan discretion:** audit throttle omitted (plan explicitly allowed); idempotent promote/demote = 200 no-op (research Q3 resolved).

## Known Stubs

None.

## Threat Flags

None — all mitigations from the threat register (T-78-01..04) landed as specified; no new surface outside the plan.

## Notes for 78-02 (client plan)

- /api/config now sends `workspaceCreation: <boolean>` — api.js:175 (`state.creation = r.data?.workspaceCreation === 'open' ? 'open' : 'admins'`) MUST be updated in the same commit (Pitfall 3).
- Client create-refusal toast still maps `err.askAdmin`; the server now returns `err.workspaceCreationClosed` — tErr falls back to the English server message until the client consumes the new key.
- Promote/demote endpoints: `POST /api/auth/operator/users/:id/promote|demote` → 200 `{ user: { id, is_instance_admin } }`; idempotent no-ops are 200s; refusal keys operatorOnly / notFound / lastOperator all catalogued.

## Self-Check: PASSED

- All 4 tasks' commits exist (49d2eb81, 6aa0da27, 35f20661, 5f31c516 + test pin 66b5d1e5) — verified via git log
- test/creation-gate.test.mjs, server.js gate/endpoint code, 5 locales, DEPLOY.md sections — all present on disk
- 26/26 new-suite green, lint exit 0 — verified this session
