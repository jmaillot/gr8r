---
phase: 78-creation-gate-instance-owner-identity
verified: 2026-11-20T09:45:00Z
status: passed
score: 6/6 must-haves verified
covered_files:
  - ".planning/phases/78-creation-gate-instance-owner-identity/78-01-PLAN.md"
  - ".planning/phases/78-creation-gate-instance-owner-identity/78-02-PLAN.md"
  - ".planning/phases/78-creation-gate-instance-owner-identity/78-01-SUMMARY.md"
  - ".planning/phases/78-creation-gate-instance-owner-identity/78-02-SUMMARY.md"
  - "server.js"
  - "src/core/api.js"
  - "src/pages/auth.js"
  - "src/pages/settings.js"
  - "src/pages/governance.js"
  - "src/actions/actions.js"
  - "src/main.js"
  - "src/overlays/popovers.js"
  - "src/locales/en.json"
  - "src/locales/fr.json"
  - "src/locales/nl.json"
  - "src/locales/de.json"
  - "src/locales/es.json"
  - "e2e/await-access.spec.mjs"
  - "test/creation-gate.test.mjs"
  - "test/creation-gate-client.test.mjs"
  - "test/helpers/server.mjs"
  - "docs/DEPLOY.md"
covered_digest: "v2:sha256:14411b1c70227f4cd4f84af1b47ad9e8c2cfbbb846aeccf19f43edbd8046f764"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 6/6
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 78: Creation Gate & Instance-Owner Identity — Verification Report

**Phase Goal:** One explicit, boot-logged, operator-readable `WORKSPACE_CREATION=true|false` gate (decoupled from `ALLOW_SIGNUP`), backed by a persistent multi-operator identity, and an honest "await access" experience for users without creation rights.
**Verified:** 2026-11-20T09:45:00Z
**Status:** PASSED
**Re-verification:** Yes — stale digest refresh (#4682): covered files (locale catalogues, actions.js) changed after the previous verification ran, as part of phase 79 work. This re-verification confirms the phase 78 feature surface still holds at current HEAD/working tree.

## Goal Achievement — Success Criteria 1–6 (goal-backward)

| # | Success Criterion | Status | Evidence (codebase, not SUMMARY) |
|---|-------------------|--------|----------------------------------|
| 1 | Strict-token boolean parse, boot-refuse on invalid, unset=false fail-closed, boot log, /api/config boolean | ✓ VERIFIED | `server.js:141-149` — exact 3-way token match; `server.js:187+` — boot-refuse block naming the variable, `process.exit(1)` before listen; `server.js:20` env contract documented in the boot banner. Grep confirms all `WORKSPACE_CREATION` references intact. Behavior proven this session: `test/creation-gate.test.mjs` 26/26 pass. |
| 2 | Closed gate = isInstanceAdmin only; workspace roles never pass (D-112); keyed localized 403; ALLOW_SIGNUP decoupled both ways | ✓ VERIFIED | `server.js:7159` — `fail(res, 403, 'workspaceCreationClosed', ...)` on the closed path. The keyed refusal is intact and present in all 5 catalogues (grep = 2 hits each: `workspaceCreationClosed` + `lastOperator`). ALLOW_SIGNUP untouched (`server.js:19` documents the decoupling). Unit suite green. |
| 3 | Creator becomes workspace `owner` in both modes | ✓ VERIFIED | `createWorkspace(name, slug, user)` on the open path unchanged; unit test asserts operator-created workspace gives creator role 'owner' (26/26 pass). |
| 4 | Multi-seat operator identity: seed, promote/demote endpoints, lastOperator 409, audit-in-tx, persistence, --add-user no flag | ✓ VERIFIED | `server.js:6816` — `count <= 1 → 409 'lastOperator'`; promote/demote endpoints present with tx + audit discipline. Tests: lastOperator 409, audit-tx rollback, reboot persistence, bootstrap seeding — all within the 26/26 pass. |
| 5 | Gated users: hidden create button, standalone await page (no shell/form/redirect, sign-out), 15 s visible-only poll with auto-entry; operator console UI | ✓ VERIFIED | `src/core/api.js:162` `canCreateWorkspace` getter consumed by `main.js:403` (boot routing), `popovers.js:262` (button gating), `actions.js:3243/4017/4057` (await poll + routing). Await page `auth.js:128-135` with `page.auth.awaitPollHint` + sign-out. **Operator console UI note (files moved):** the operatorCard (promote + D-90 inline-confirm demote, `data-a="operatorPromote"/"operatorDemote"`) now lives in `src/pages/governance.js:130-156` — phase 79 consolidated the governance page and the card moved out of settings.js (settings.js retains only audit-filter labels). All `A.operatorPromote/A.operatorDemote*/` handlers intact in `actions.js:2776-2801`. Behavioral proof this session: `npx playwright test e2e/await-access.spec.mjs` **3/3 passed (34.1 s)** including real invite-accept auto-entry and popover role gating member ✗ / operator ✓; `test/creation-gate-client.test.mjs` 46/46 pass. |
| 6 | Every new refusal key in all 5 catalogues in the same commit as the emitting gate; parity gate green | ✓ VERIFIED | `err.workspaceCreationClosed` + `err.lastOperator` present in en/fr/nl/de/es (grep = 2 each — the second hit is from phase 79 usage of the same keys, phase 78 additions intact); `err.askAdminForWorkspace` removed from all 5 (=0). Phase 79 locale edits (fr curly apostrophes, new phase-79 keys) did not remove or alter any phase 78 key. Parity tests green inside the unit suites. |

**Score:** 6/6 success criteria verified (0 behavior-unverified)

## Verification Commands Run (this session)

| Check | Command | Result |
|-------|---------|--------|
| Server suite | `node --test test/creation-gate.test.mjs` | 26/26 pass, 0 fail |
| Client suite | `node --test test/creation-gate-client.test.mjs` | 46/46 pass, 0 fail |
| E2E | `npx playwright test e2e/await-access.spec.mjs` | **3/3 passed (34.1 s)** |
| Locales | grep ×5 catalogues | workspaceCreationClosed+lastOperator present ×5; askAdminForWorkspace removed ×5 |
| Wiring greps | `WORKSPACE_CREATION`, `canCreateWorkspace`, `operatorPromote/Demote`, gate 403/409 keys | all present and consumed at expected call sites |
| Fingerprint | `gsd-tools verification fingerprint …` (22 covered files) | `v2:sha256:14411b1c70227f4cd4f84af1b47ad9e8c2cfbbb846aeccf19f43edbd8046f764` |

Note: `npm run lint` and full `npm test` were not re-run in this re-verification (working tree carries uncommitted phase 79 edits in actions.js/locales/governance.js that are not this phase's surface); the two phase 78 unit suites + live e2e were re-run as the behavioral evidence gate.

## Artifacts (3 levels: exists / substantive / wired)

| Artifact | Status | Details |
|----------|--------|---------|
| `server.js` gate + boot contract | ✓ VERIFIED | strict parse + boot-refuse + /api/config boolean + gate 403, all wired |
| `server.js` promote/demote endpoints | ✓ VERIFIED | lastOperator 409 at :6816, tx discipline intact |
| `src/core/api.js` canCreateWorkspace + state.creation | ✓ VERIFIED | getter at :162, consumed by 4 client call sites |
| `src/overlays/popovers.js` button gating | ✓ VERIFIED | conditional on `api.canCreateWorkspace` at :262 |
| `src/pages/auth.js` await view | ✓ VERIFIED | await copy + poll hint + sign-out intact |
| `src/actions/actions.js` poll + operator actions | ✓ VERIFIED | 15 s poll, D-90 demote handlers at :2776-2801, all wired |
| `src/pages/governance.js` operatorCard *(moved from settings.js in phase 79)* | ✓ VERIFIED | promote + inline-confirm demote buttons with correct `data-a` ids at :130-156 |
| `e2e/await-access.spec.mjs` | ✓ VERIFIED | 3 cases, all pass live |
| `test/creation-gate.test.mjs` / `test/creation-gate-client.test.mjs` | ✓ VERIFIED | 26/26 and 46/46 re-run this session |
| `test/helpers/server.mjs` BASE_ENV | ✓ VERIFIED | `WORKSPACE_CREATION: 'true'` regression shield |
| `docs/DEPLOY.md` | ✓ VERIFIED | WORKSPACE_CREATION contract + unset=false note intact |

## Key Links

| From | To | Via | Status |
|------|----|----|--------|
| /api/config boolean | api.js state.creation | `r.data?.workspaceCreation` | WIRED |
| canCreateWorkspace | popover button + boot routing + await poll | same getter, all consumers (api.js:162 → main.js:403, popovers.js:262, actions.js:3243/4017/4057) | WIRED |
| governance operatorCard buttons | A.operatorPromote / A.operatorDemote | `data-a` → events dispatcher → api methods → endpoints | WIRED (card relocated to governance.js, handlers unchanged) |
| await poll | GET /api/auth/me → membership/rights | hydrateFromServer + enterApp | WIRED, e2e-proven this session |
| demote 409 lastOperator | tErr keyed toast | `lastOperator` key ×5 locales | WIRED |

## Requirements Coverage

WSG-01 ✓, WSG-02 ✓, WSG-03 ✓, WSG-04 ✓, WSG-05 ✓ (bootstrap-stamp only, per D-78-1), WSG-06 ✓, WSG-10 ✓, WSG-11 ✓. All eight IDs confirmed mapped to Phase 78 (done) in `.planning/REQUIREMENTS.md`; WSG-07/08/09 are Phase 79 scope. D-78-1 (boolean collapse) and D-78-2 honored.

## Anti-Patterns Found

None in the phase 78 surface. No debt markers, no stubs in any covered file.

## Deviations Audited (carried from initial verification, all legitimate)

- `audit_log.session_count = 0` (schema NOT NULL; plan's "null" was unimplementable) — tested.
- Demote offered on self row (server lastOperator guard is the enforcement; 409 surfaced as keyed toast) — tested.
- document.hidden pause pinned at unit level instead of e2e (Playwright cannot flip document.hidden) — documented A2 fallback; the guard code is real and e2e proves resume/entry paths.
- Throttle omitted on promote/demote — plan-sanctioned (low-frequency console writes).

## Human Verification Required

None — every success criterion has behavioral evidence re-run this session (26+46 unit tests, 3/3 live e2e cases).

## Gaps Summary

No gaps. The stale-digest concern (#4682) is resolved: phase 79's locale and actions.js edits did not disturb any phase 78 deliverable — the only structural change is the operator card's relocation from settings.js to governance.js, verified fully wired. covered_files updated to include `src/pages/governance.js` (file moved) and the digest recomputed with the fingerprint tool.

---

_Verified: 2026-11-20T09:45:00Z_
_Verifier: the agent (gsd-verifier)_
