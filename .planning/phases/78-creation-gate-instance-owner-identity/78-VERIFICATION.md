---
phase: 78-creation-gate-instance-owner-identity
verified: 2026-11-20T03:15:00Z
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
covered_digest: "v2:sha256:ab0c5a6cdfc6b2fa635b10897597c8aa9a0a8a9f711407023e7b91daba4e131b"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 78: Creation Gate & Instance-Owner Identity — Verification Report

**Phase Goal:** One explicit, boot-logged, operator-readable `WORKSPACE_CREATION=true|false` gate (decoupled from `ALLOW_SIGNUP`), backed by a persistent multi-operator identity, and an honest "await access" experience for users without creation rights.
**Verified:** 2026-11-20T03:15:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement — Success Criteria 1–6 (goal-backward)

| # | Success Criterion | Status | Evidence (codebase, not SUMMARY) |
|---|-------------------|--------|----------------------------------|
| 1 | Strict-token boolean parse, boot-refuse on invalid, unset=false fail-closed, boot log, /api/config boolean | ✓ VERIFIED | `server.js:141-149` — exact 3-way token match, `null` sentinel; `server.js:190-196` — `logError` naming the variable + both valid values, `process.exit(1)` before listen; `server.js:9034` — boot log `workspace creation: open (any authenticated user)` / `closed (instance operators only)`; `server.js:5040` — `workspaceCreation: WORKSPACE_CREATION` (raw boolean, no ALLOW_SIGNUP derivation). Behavior proven: `test/creation-gate.test.mjs` 26/26 (token matrix 'TRUE'/' '/'yes'/'1'/'' all exit 1; unset boots closed). |
| 2 | Closed gate = isInstanceAdmin only; workspace roles never pass (D-112); keyed localized 403; ALLOW_SIGNUP decoupled both ways | ✓ VERIFIED | `server.js:6890-6892` — `if (!WORKSPACE_CREATION && !isInstanceAdmin(user)) return fail(res, 403, 'workspaceCreationClosed', ...)`; `hasAdminRole` deleted entirely (dead code removed, lint-clean). ALLOW_SIGNUP signup gate untouched. Tests: gate matrix incl. workspace-owner non-operator → 403, ALLOW_SIGNUP=true + closed gate → signup OK + create 403. |
| 3 | Creator becomes workspace `owner` in both modes | ✓ VERIFIED | `createWorkspace(name, slug, user)` on the open path (server.js:6897) — unchanged; test asserts operator-created workspace gives creator role 'owner'. |
| 4 | Multi-seat operator identity: seed, promote/demote endpoints, lastOperator 409, audit-in-tx, persistence, --add-user no flag | ✓ VERIFIED | `server.js:6779-6828` — route order sameOrigin → requireUser → isInstanceAdmin (403 `operatorOnly`) → target lookup (404 no-oracle) → count guard (`count <= 1` → 409 `lastOperator`) → `db.tx` with flag UPDATE + 12-column audit literal (`operator_promoted`/`operator_demoted`); idempotent no-op 200. Tests: lastOperator 409, audit-tx rollback (forced audit failure leaves flag unchanged), reboot persistence, stampInstanceAdmin seeding, --add-user leaves flag 0. |
| 5 | Gated users: hidden create button, standalone await page (no shell/form/redirect, sign-out), 15 s visible-only poll with auto-entry; operator console UI | ✓ VERIFIED | Client: `src/core/api.js:162-163` `canCreateWorkspace = state.creation || state.user?.isInstanceAdmin` (owner/admin clause dropped, D-112); `popovers.js:262` create button gated on the getter; `main.js:403` + `actions.js:4014` both route through the same getter. Await page `auth.js:128-135` — authShell only, invite copy, signed-in-as, `page.auth.awaitPollHint`, `data-a="signOut"`. Poll `actions.js:4030-4084` — `setInterval(awaitTick, 15000)`, `document.hidden` early return, visibilitychange re-tick, timer+listener torn down on entry/sign-out/view change, entry via hydrateFromServer+enterApp (location.reload fallback). Operator console `settings.js:259-274` promote + D-90 inline-confirm demote (`data-a="operatorDemote"` — the Rule 1 wiring fix is in the committed code) → `actions.js:2776-2798` → `api.js:351/354` → 78-01 endpoints. Behavioral proof: `npx playwright test e2e/await-access.spec.mjs` **3/3 pass (34.0 s)** — await view asserts + real invite-accept auto-entry + popover role gating member ✗ / operator ✓; `test/creation-gate-client.test.mjs` 46/46 pins the document.hidden guard-first tick (documented A2 fallback — Playwright cannot flip document.hidden). |
| 6 | Every new refusal key in all 5 catalogues in the same commit as the emitting gate; parity gate green | ✓ VERIFIED | `err.workspaceCreationClosed` + `err.lastOperator` present in en/fr/nl/de/es (grep = 1 each); `err.askAdminForWorkspace` removed from all 5 (=0). Commit log: locales landed in 6aa0da27 (gate) and 35f20661 (endpoints); client keys (awaitPollHint + 6 settings.operator.*) landed in 9321f681/ca1e2f32 with the surfaces. All 16 `settings.operator.*` keys used by settings.js/actions.js present in all 5 catalogues (programmatic check: 0 missing). Full parity tests green inside `npm test`. |

**Score:** 6/6 success criteria verified (0 behavior-unverified)

## Verification Commands Run (this session)

| Check | Command | Result |
|-------|---------|--------|
| Lint | `npm run lint` | exit 0 |
| Server suite | `node --test test/creation-gate.test.mjs` | 26/26 pass |
| Client suite | `node --test test/creation-gate-client.test.mjs` | 46/46 pass |
| Full suite | `npm test` | 1 fail = the documented pre-existing webhook-events "exactly ONE due.reminder claim" flake (test/webhook-events.test.mjs:262) — matches STATE.md Deferred Items exactly; no other failure |
| E2E | `npx playwright test e2e/await-access.spec.mjs` | **3/3 passed (34.0 s)** |
| Locales | grep + JSON key checks ×5 catalogues | err.workspaceCreationClosed/err.lastOperator present ×5; askAdminForWorkspace removed ×5; all operator/await keys present ×5 |
| Anti-patterns | grep TBD/FIXME/XXX/PLACEHOLDER on all 11 modified source files | no matches |

## Artifacts (3 levels: exists / substantive / wired)

| Artifact | Status | Details |
|----------|--------|---------|
| `server.js` gate + boot contract | ✓ VERIFIED | exists, real logic, wired into POST /api/workspaces + /api/config + boot log |
| `server.js` promote/demote endpoints | ✓ VERIFIED | D-121 clone, tx discipline, wired at `/api/auth/operator/users/:id/(promote\|demote)` |
| `src/core/api.js` canCreateWorkspace + state.creation | ✓ VERIFIED | boolean adoption at :183, getter at :162, consumed by main.js/popovers.js/actions.js |
| `src/overlays/popovers.js` button gating | ✓ VERIFIED | conditional fragment on `api.canCreateWorkspace` |
| `src/pages/auth.js` await view | ✓ VERIFIED | authShell, no app shell, sign-out wired |
| `src/actions/actions.js` poll + operator actions | ✓ VERIFIED | 15 s interval, guards-first, teardown; A.operatorPromote/Demote wired to api methods |
| `src/pages/settings.js` operatorCard | ✓ VERIFIED | promote + D-90 inline-confirm demote with corrected `data-a="operatorDemote"` |
| `e2e/await-access.spec.mjs` | ✓ VERIFIED | 3 cases, all pass live |
| `test/creation-gate.test.mjs` / `test/creation-gate-client.test.mjs` | ✓ VERIFIED | 26/26 and 46/46 |
| `test/helpers/server.mjs` BASE_ENV | ✓ VERIFIED | `WORKSPACE_CREATION: 'true'` at :24 (regression shield) |
| `docs/DEPLOY.md` | ✓ VERIFIED | WORKSPACE_CREATION contract + unset=false upgrade note + is_instance_admin break-glass |

## Key Links

| From | To | Via | Status |
|------|----|----|--------|
| /api/config boolean | api.js state.creation | `r.data?.workspaceCreation` | WIRED |
| canCreateWorkspace | popover button + boot routing + enterNoWorkspace | same getter, all three consumers | WIRED |
| operatorCard buttons | A.operatorPromote/operatorDemote | `data-a` → events dispatcher → api methods → 78-01 endpoints | WIRED (Rule-1 id mismatch fixed in ca1e2f32) |
| await poll | GET /api/auth/me → membership/rights | hydrateFromServer + enterApp | WIRED, e2e-proven |
| demote 409 lastOperator | tErr keyed toast | settings.operator toast keys ×5 locales | WIRED |

## Requirements Coverage

WSG-01 ✓, WSG-02 ✓, WSG-03 ✓, WSG-04 ✓, WSG-05 ✓ (bootstrap-stamp only, per D-78-1), WSG-06 ✓, WSG-10 ✓, WSG-11 ✓. WSG-07/08/09 are Phase 79 scope (not yet claimed — correctly untouched). D-78-1 (boolean collapse) and D-78-2 (D-114 amendment + break-glass in DEPLOY.md) both honored.

## Anti-Patterns Found

None. No debt markers, no stubs, no console.log-only implementations in any file modified by this phase.

## Deviations Audited (all legitimate)

- `audit_log.session_count = 0` (schema NOT NULL; plan's "null" was unimplementable) — tested.
- Demote offered on self row (server lastOperator guard is the enforcement; 409 surfaced as keyed toast) — honest and tested.
- document.hidden pause pinned at unit level instead of e2e (Playwright cannot flip document.hidden) — documented A2 fallback per plan Task 3 Case 3; the guard code is real (`actions.js:4050`) and e2e proves resume/entry paths.
- Throttle omitted on promote/demote — plan-sanctioned (low-frequency console writes).

## Human Verification Required

None — every success criterion has behavioral evidence (unit suites + live e2e). Visual polish beyond asserted content (copy wording, layout feel) is subjectively user-judgeable but the outcomes are programmatically proven.

## Gaps Summary

No gaps. Phase goal achieved in the codebase, proven by 26+46 unit tests and 3/3 live e2e cases; the only full-suite failure is the STATE.md-documented pre-existing webhook-events flake, reproduced on the pre-phase tree at 78-01 time.

---

_Verified: 2026-11-20T03:15:00Z_
_Verifier: the agent (gsd-verifier)_
