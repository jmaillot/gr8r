---
phase: 78-creation-gate-instance-owner-identity
plan: 02
subsystem: client-authz
tags: [creation-gate, await-access, operator-console, polling, locales, e2e]
requires: [78-01 (WORKSPACE_CREATION gate, /api/config boolean, operator promote/demote endpoints)]
provides:
  - gate-aware canCreateWorkspace getter (gate boolean OR isInstanceAdmin — D-112) with popover button gating
  - await-access page (no-workspace view extension) with a 15 s visible-tab-only poll and soft-entry auto-entry
  - operator console promote/demote UI (D-90 inline-confirm) wired to the 78-01 endpoints with lastOperator 409 toast
  - e2e await-access proof spec (closed-gate throwaway server, poll auto-entry, role-gated create button)
affects: [future operator-management UX; no downstream plans in phase 78]
tech-stack:
  added: []
  patterns: [pollNotifs house-pattern poll with document.hidden guard-first tick, D-90 inline-confirm stage clone, events.js A[el.dataset.a] delegation, D-77-7 direct catalogue import in e2e]
key-files:
  created: [e2e/await-access.spec.mjs]
  modified: [src/core/api.js, src/pages/auth.js, src/main.js, src/actions/actions.js, src/overlays/popovers.js, src/pages/settings.js, src/locales/en.json, src/locales/fr.json, src/locales/nl.json, src/locales/de.json, src/locales/es.json, test/creation-gate-client.test.mjs, test/i18n-core-features.test.mjs, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs]
decisions:
  - canCreateWorkspace drops the legacy workspace owner/admin clause (D-112: the server refuses anyway; keeping it would show a button that 403s)
  - poll probe reuses GET /api/workspaces via api.me()/workspaces path — no new endpoint, zero-dep (planner decision)
  - poll soft-enters via hydrateFromServer(slug) + enterApp(); falls back to location.reload() when no membership can resolve a slug (case 2: promoted operator → onboarding)
  - demote offered on the signed-in self row too — the lastOperator guard is honest, the server's 409 is surfaced as a keyed toast
  - demote confirm button emits data-a="operatorDemote" (Rule 1 fix — see Deviations)
metrics:
  duration: ~2 sessions (resumed after transport failure)
  completed: 2026-11-20
status: complete
estimate:
  tokens: 58000
  raw_tokens: 42000
  tasks: 3
  confidence: low
commits: 5
plan_head_before: 2107e27c
plan_head_after: 763909c7
actuals:
  tokens: 25000
  tasks: 3
  commits: 5
---

# Phase 78 Plan 02: Client — Gate-Aware Surfaces, Await-Access Page, Operator Console Summary

**One-liner:** Gate-aware client — gated users lose every creation surface and get an honest await-access page with a 15 s visible-tab-only poll that soft-enters the app once membership or operator rights appear; operators manage multi-seat operator identity from the console (D-90 inline-confirm promote/demote on the 78-01 endpoints, lastOperator 409 as a keyed toast), proven end-to-end in the browser on a closed-gate throwaway server.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Gate-aware canCreateWorkspace + popover button gating | 1cdab4d6 | src/core/api.js, src/overlays/popovers.js, src/actions/actions.js, e2e/server.mjs, test/creation-gate-client.test.mjs |
| 2 | Await-access page — 15 s visible-tab-only poll with auto-entry | 9321f681 | src/pages/auth.js, src/main.js, src/actions/actions.js, 5 locales, test/creation-gate-client.test.mjs |
| 3a | Operator console promote/demote (D-90 inline-confirm) + 6 locale keys | ca1e2f32 | src/pages/settings.js, src/actions/actions.js, src/core/api.js, 5 locales, 4 test files |
| 3b | e2e await-access proof spec | 763909c7 | e2e/await-access.spec.mjs |

**Execution note (transport-error resume):** the first executor session died mid-Task 3 with an infra failure ("http read buffer full") after committing Tasks 1–2 (`1cdab4d6`, `9321f681`) and leaving the Task 3 diff uncommitted (unit suite 46/46 green). This session resumed from that state — reviewed the uncommitted diff against the plan's Task 3 acceptance criteria, fixed two red-gate issues (below), and committed the remaining work. No task was restarted from scratch.

## Verification

- `npx playwright test e2e/await-access.spec.mjs` — **3/3 pass** (34.1 s): await view (invite copy, poll hint, sign-out, no app shell, no creation surface) + poll auto-entry on real invite+accept; promoted-user reload fallback lands onboarding; popover create button member ✗ / operator ✓
- `npm test` full — **1925/1939 pass, 13 skipped, 1 fail = pre-existing** webhook-events "due.reminder claim" flake, reproduced on the clean HEAD tree (9321f681, throwaway worktree) — already deferred at 78-01, out of scope
- `npm run lint` — **exit 0**, zero eslint-disable introduced
- `grep -c "operatorPromote\|operatorDemote" src/actions/actions.js` — **10** (gate ≥ 3)
- Unit suite `test/creation-gate-client.test.mjs` — **46/46 pass** (operatorCard markup, actions wiring, api endpoints, 5-catalogue key parity)
- Plan verification: data-a machine-identifier counts updated 558 → 562 in both i18n shell/toast tests; catalogue 1958 (+6), verbs 49 → 51

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Dead demote confirm button — data-a/action id mismatch**
- **Found during:** Task 3 resume diff review
- **Issue:** the operatorCard demote-confirm stage emitted `data-a="operatorDemoteConfirm"` but actions.js defines `A.operatorDemote`; the events.js dispatcher resolves `A[el.dataset.a]`, so the confirm button was a no-op. The unit test had pinned the same wrong attribute (test passed, wiring broken).
- **Fix:** button now emits `data-a="operatorDemote"`; the unit-test regex asserts the corrected id.
- **Files modified:** src/pages/settings.js, test/creation-gate-client.test.mjs
- **Commit:** ca1e2f32

**2. [Rule 1 - Bug] FR catalogue D-05 typography breach**
- **Found during:** full-suite gate (test/french-typography.test.mjs)
- **Issue:** `settings.operator.demoteConfirmBody` used a plain space before "?" — D-05 requires the U+202F narrow no-break space (the rest of the FR catalogue complies).
- **Fix:** replaced with U+202F.
- **Files modified:** src/locales/fr.json
- **Commit:** ca1e2f32

**3. [Rule 3 - Blocking] Machine-identifier count pins**
- **Found during:** full-suite gate (test/i18n-shell.test.mjs, test/i18n-toast.test.mjs)
- **Issue:** the tree-wide data-a count assertions (558) predate the 4 new operator-console data-a sites (actual 562).
- **Fix:** 558 → 562 with the 78-02 provenance comment.
- **Files modified:** test/i18n-shell.test.mjs, test/i18n-toast.test.mjs
- **Commit:** ca1e2f32

### Out-of-scope discoveries (not fixed — deferred)

- webhook-events.test.mjs "exactly ONE due.reminder claim row" fails on the clean pre-78-02 tree too (verified on a throwaway worktree at 9321f681: 20/21). Already recorded in STATE.md's Deferred Items at 78-01. Left untouched.

## A2 Note (document.hidden)

Per the plan's Case 3 A2 fallback: Playwright cannot flip `document.hidden`, so the pause is pinned at unit level (test/creation-gate-client.test.mjs — the guard-first tick with the `document.hidden` early return) and noted here. The e2e spec proves the resume/entry paths only. No sleeps, no networkidle anywhere in the spec — expect-polling throughout, readiness via `/api/health` poll.

## Known Stubs

None — no placeholder values, no unwired data sources, no TODO/FIXME introduced.

## Threat Model Check

- T-78-05 (client gating cosmetic): canCreateWorkspace grants only gate-open OR isInstanceAdmin; A.newWorkspace keeps the err.askAdmin belt-and-braces toast; the 78-01 server gate remains the enforcement.
- T-78-06 (auto-entry tampering): entry only on server-verified membership/rights from the workspaces probe; timer cleared on exit/sign-out/entry.
- T-78-SC: zero package installs (zero new dependencies — standing constraint held).

No new trust-boundary surface beyond the plan's threat register.
