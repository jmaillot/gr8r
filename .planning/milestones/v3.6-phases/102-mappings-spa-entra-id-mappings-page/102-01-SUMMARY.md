---
phase: 102-mappings-spa-entra-id-mappings-page
plan: 01
subsystem: mappings-spa
tags: [entra-id, mappings, spa, lazy-route, i18n, dead-mappings]
requires: [phase-101 group-mapping routes, governance SPA patterns]
provides: [src/pages/mappings.js pageMappings, src/core/guid.js canonicalizeGuid, api groupMappings/groupMappingCreate/groupMappingDelete, refreshMappings fill loop, ROUTE_TEARDOWN.mappings stub, S.ui.mapRows/mapWs/mapErr/mapForm slots, test/mappings-client.test.mjs scaffold]
affects: [102-02 (CRUD wiring builds on this skeleton)]
tech-stack:
  added: []
  patterns: [governance lazy-route + fill-loop + fullstate analog]
key-files:
  created:
    - src/pages/mappings.js
    - src/core/guid.js
    - test/mappings-client.test.mjs
  modified:
    - src/shell/render.js
    - src/shell/layout.js
    - src/core/api.js
    - src/actions/actions.js
    - src/pages/governance.js
    - src/locales/en.json
    - src/locales/fr.json
    - src/locales/nl.json
    - src/locales/de.json
    - src/locales/es.json
    - test/build-chunk-size.test.mjs
    - test/governance-client.test.mjs
    - test/i18n-core-features.test.mjs
    - test/i18n-shell.test.mjs
    - test/i18n-toast.test.mjs
decisions:
  - "GUID port taken verbatim from 102-RESEARCH.md (groups.js:27-55 semantics); no src/ import of groups.js (pinned by test)"
  - "refreshMappings fetches mappings + operator workspaces (S.ui.mapWs, plan-02 picker pool) + dead-mappings (S.ui.govDead, moved fetch) — never gated on api.oidcEnabled (Pitfall 5)"
  - "Moved dead-card keys renamed page.governance.dead* → page.mappings.dead* (4 deleted + 4 added per locale, one commit)"
  - "Repo machine-identifier counters (data-a 624→626, data-r 63→64, call() 80→84, ROUTE_IDS 22→23) re-pinned in the same-change commits per the D-12 same-commit pin doctrine"
metrics:
  duration: ~100 min
  completed: 2026-11-27
status: complete
commits: 5
plan_head_before: b4981461
plan_head_after: a6aa1c3f
actuals:
  tokens: 68000
  tasks: 3
  commits: 5
---

# Phase 102 Plan 01: Mappings SPA Skeleton Summary

**Entra ID Mappings page skeleton: lazy route + cosmetic nav gate, GET list render with esc()d rows and quiet empty state, client GUID canonicalization port, and the strict dead-mappings card move out of Governance.**

## Completed Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (tracer) | End-to-end skeleton — nav gate → lazy route → loader → list → empty state | c4b7ddd6 | render.js, layout.js, mappings.js (new), api.js, actions.js, ×5 locales, test/mappings-client.test.mjs (new) |
| 2 (TDD) | guid.js canonicalization port + groupMapping API methods | 24c3552f | src/core/guid.js (new), api.js, test |
| 3 | Strict dead-card move + key rename + chunk gate | 71d27187 | governance.js, mappings.js, actions.js, ×5 locales, build-chunk-size.test.mjs, mappings-client.test.mjs |
| fix | Re-pin moved-card tests to their new home + machine-identifier counters + fr apostrophe | fc1daa22 | governance-client/i18n-core/i18n-shell/i18n-toast tests, fr.json |
| fix | i18n-shell tree-wide counter (second copy of the same walk) | a6aa1c3f | test/i18n-shell.test.mjs |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Governance-client test suite pinned the dead card in its OLD home**
- **Found during:** Task 3 (full-suite run)
- **Issue:** test/governance-client.test.mjs still asserted govDeadCard inside governance.js and the dead fetch inside refreshGovernanceWorkspaces — the strict move (D-06) necessarily broke 4 pins.
- **Fix:** Re-pointed the pins to src/pages/mappings.js and refreshMappings, preserving the exact invariants (esc coverage, display-only, null-payload hiding, normalized govDead staging); the D-12 key-parity list now carries page.mappings.dead*.
- **Files modified:** test/governance-client.test.mjs, commit fc1daa22

**2. [Rule 1 - Bug] Repo-wide byte-identical counter pins (data-a/data-r/call()/ROUTE_IDS)**
- **Found during:** Task 3 (full-suite run)
- **Issue:** i18n-toast (data-a 624, data-r 63), i18n-core (call() 80), i18n-shell (ROUTE_IDS twenty-two, data-a/data-r copy) pin tree-wide machine-identifier counts. The plan's key_links anticipated route/nav seams but not these counter pins.
- **Fix:** Re-pinned with per-change commentary per the D-12 same-commit pin doctrine: data-a 624→626 (mappings fullstate go + mapRetry), data-r 63→64 (mappings nav entry), call() 80→84 (the three groupMapping methods — note the pre-existing comment claimed 80 but the pinned count pre-plan was 80 with the UAT restore-upload CTA included; measured 84 after the +3), ROUTE_IDS 22→23 ids.
- **Files modified:** test/i18n-toast.test.mjs, test/i18n-core-features.test.mjs, test/i18n-shell.test.mjs (commits fc1daa22, a6aa1c3f)

**3. [Rule 1 - Bug] fr.json page.mappings.emptyBody straight apostrophe**
- **Found during:** Task 3 (full-suite run)
- **Issue:** The new French empty-body string carried a straight apostrophe — the only D-05 typography breach introduced by this plan (verified by diffing breach sets against the b4981461 baseline: the other 21 breaches pre-date it).
- **Fix:** l'accès → l’accès (U+2019), same commit as the test re-pins (fc1daa22).
- **Files modified:** src/locales/fr.json

**4. [Rule 3] Task-1 test regex alignment**
- **Found during:** Task 1 verify
- **Issue:** The in-render kick assertion expected the plan's verbatim `if (!S.ui.mapRows && !S.ui.mapErr)`; initial page code used a `loading` gate. Fixed the page to the plan's form (functionally identical, plan-verbatim is better for the plan-02 continuation).

## Verification Results

- `node --test test/mappings-client.test.mjs test/i18n-scan.test.mjs` — 50 pass / 0 fail (Task 1)
- `node --test test/mappings-client.test.mjs` — 13 pass incl. the guid contract + groups.js import ban (Task 2; RED→GREEN cycle honored)
- `node --test test/mappings-client.test.mjs test/build-locales.test.mjs` — 27 pass; `npx vite build` exit 0; chunk gate 13 pass incl. the new lazy `mappings` chunk test (Task 3)
- **Full `npm test`: 2701 tests, 2668 pass, exactly the 2 documented pre-existing failures** (french-typography, webhook-routes GET list) — baseline integrity held
- grep confirms governance.js carries zero govDeadCard / operatorDeadMappings code references (prose comments only)

## Auth Gates

None.

## Threat Model Compliance

- T-102-01 (stored XSS): esc() on label/workspaceName/groupGuid/kind/trail segments at every render; pinned by tests (T1f + the moved-card esc pins).
- T-102-02 (nav gate cosmetic): accepted per D-11 — server 403 fullstate on deep-link is the control (pinned full403 shape).
- T-102-SC (package legitimacy): zero npm installs occurred.

## Handoffs to Plan 02 (as declared)

- `ROUTE_TEARDOWN.mappings` stub registered (empty fn, mappings.js tail) — plan 02 fills with staged-state cleanup
- `S.ui.mapWs` (operator workspaces pool), `S.ui.mapRows/mapErr/mapForm` slots live
- `refreshMappings()` fill loop exported; `A.mapRetry` wired
- test/mappings-client.test.mjs scaffold carries the route/nav/guid/API pins; plan 02 appends form/delete assertions

## Known Stubs

| Stub | File | Reason |
| ---- | ---- | ------ |
| `ROUTE_TEARDOWN.mappings` = empty fn | src/pages/mappings.js (tail) | Intentional skeleton per plan Task 1 step 1 — plan 02 fills it with the staged inline-confirm/form teardown (declared handoff) |

## Self-Check: PASSED
