# Phase 84 Plan 01: e2e Red-Set Repair (BP-02) Summary

**One-liner:** Repaired all 4 failing e2e specs root-cause-first (operator nav swap to /governance, STOP_LIST cognate 'Instance', flows 2FA nextWindow/retry hardening) — full suite 155/155 green ×3 consecutive, zero debt waivers.

## What Was Done

### Task 1: operator-revoke-cycle (en+fr) — nav-step swap to /governance
- **Gate check:** read the retained error context (`Operator console` heading not visible after Settings→Sessions) + `src/shell/layout.js:191` (governance sidebar item exists, rendered for instance admins — the operator here is the bootstrap admin/owner) + `src/pages/governance.js:162` (heading lives there). fr value of `settings.operator.title` = `"Console opérateur"` confirmed in `src/locales/fr.json:1483` — locale value NOT the issue; pure spec drift (Phase 79 moved the operator console off Settings→Sessions).
- **Edit:** replaced ONLY the two `openSettingsSec(opPage, 'sessions')` navigation steps (lines ~211 and ~237) with `page.locator([data-a='go'][data-r='governance']).first().click()`. Comments updated to describe the new location. All assertions kept verbatim (D-05). The helper `openSettingsSec` itself and the victim's call site (line 231, still valid) untouched; flows.spec.mjs's copy untouched.
- **Verify:** `npx playwright test e2e/operator-revoke-cycle.spec.mjs` → **2 passed** (en + fr).

### Task 2: french-overflow — STOP_LIST += 'Instance'
- **Assumption A2 gate:** verified `src/locales/fr.json` `common.instance` is literally `"Instance"` (en identical) — matches the cognate pattern; proceeded.
- **Edit:** added `'Instance'` to STOP_LIST with a cognate comment in the established 'Admin'-entry style, citing `common.instance`. No app change, no other scanner edits.
- **Verify:** `npx playwright test e2e/french-overflow.spec.mjs` → **12 passed**; leak scanner no longer flags "Instance".

### Task 3: flows 2FA — trace-first gate, hardening, D-06 triple-green
- **D-14 HARD GATE outcome — classified: TOTP window race, NOT an app regression.** Evidence chain: the retained failure was the `'retry with the next step code'` assertion at flows.spec.mjs:1112. Reaching that line requires (a) the pending2fa landing DID render (`tfaTitle` heading asserted visible at :1100), (b) the first code was rejected (retry branch entered), and (c) the honest `err.invalidTfaCode` toast WAS visible (:1111 passed). "Landing never rendered" is excluded by the control flow itself. Caveat/deviation (below): the trace.zip artifacts were wiped before I could open them — the classification above rests on the retained error text + control flow, not the trace file itself.
- **Hardening (operator-revoke-cycle precedent, IN-03):**
  - Added a local `nextWindow(lastStepSec)` helper (same shape as the operator spec's).
  - Retry branch: record the first attempt's minted epoch (`firstAttemptSec`), assert the honest error, `await nextWindow(firstAttemptSec)`, then retry with a fresh `Date.now()+1` step code — the old retry minted at a fixed +31 that could cross another boundary or be replay-refused under load.
  - Widened `submitTfaCode`'s landing `toHaveURL` timeout 4000→8000 ms (worker-load latency read as flake).
  - All assertions kept (D-05).
- **Verify:** `npx playwright test e2e/flows.spec.mjs` → **34 passed**.
- **D-06 triple-green (full `npm run e2e`):** 155/155, 155/155, 155/155 — see run log below.
- **D-04 zero-waiver check:** `grep -rn "test\.skip\|test\.fixme" e2e/*.spec.mjs` → only `e2e/demo-locale.spec.mjs:60` (environment-gated conditional skip, explicitly allowed by D-04).

## D-06 Green-Run Evidence

| Run | Result | Notes |
|-----|--------|-------|
| 1 (discarded) | 154 passed / 1 failed | failure in `admin-revoke-cycle.spec.mjs:83` (fr) — NOT this plan's diagnosed set, spec untouched by this plan; passed run 1 and all subsequent runs. Count restarted per D-06. |
| 2 (=run 1 of 3) | **155/155 passed** (6.9m) | |
| 3 (=run 2 of 3) | **155/155 passed** (6.9m) | |
| 4 (=run 3 of 3) | **155/155 passed** (6.9m) | gate satisfied |

(Plus: flows spec solo run 34/34 before the triple-green.)

## Deviations from Plan

1. **[Deviation] Trace-first gate satisfied by control-flow classification, not the trace file.** The retained `test-results/flows-…pending2fa…/trace.zip` and `error-context.md` were deleted when the Task 1/2 verify runs cleaned Playwright's `test-results/` output dir (before I read them). Classification instead rests on: the research's retained error text (`retry with the next step code` at :1112) + the spec's control flow (landing render and honest-toast assertions provably passed before the failing line) — which excludes the "app regression / landing never rendered" branch the gate guards against. The two now-passing verify runs plus 3 consecutive full-suite greens corroborate the flake diagnosis. No app-code change was made, honoring the gate's intent.
2. **[Deviation — out-of-scope flake observed] `admin-revoke-cycle.spec.mjs:83` (fr) failed once** (run 1 of the first count): the revoked member's page was still fully signed-in 5s after the admin's revoke (aria snapshot shows signed-in settings UI; the honest-teardown text never appeared). Same spec passed in 4 of 5 full-suite runs including all 3 counted ones. Spec is outside this plan's file set; per the scope-boundary rule it was NOT fixed. Recorded as a candidate pre-existing flake for the phase verifier to watch. Should be logged to `.planning/WINDOWS.md` as `unmet-truth`/`deviation` if the ledger exists.
3. **[Note] Direct `npx playwright test` needs `--config e2e/playwright.config.mjs`** (the config declares the webServer; running without it fails with ECONNREFUSED on the e2e port). Plan's verify commands omit the flag; `npm run e2e` includes it. Used the config flag everywhere.

## Threat-Model Compliance (T-84 rows assigned to this plan)

- **T-84-01 (Tampering — spec edits masking regressions): MITIGATED.** Every existing assertion kept verbatim (D-05) — the only behavioral edits are the navigation steps (operator spec), one STOP_LIST scanner entry (french-overflow), and retry timing (flows). The D-14 trace-first gate was honored (classification documented above, no app code touched). D-06 satisfied with 3 consecutive full-suite greens.
- **T-84-SC (dependency installs): N/A.** Zero packages installed; all changes are edits to three spec files.

## Known Stubs

None. All three spec files are fully wired; no placeholders, no skipped tests (D-04 verified above).

## Verification (plan-level)

- ✅ All 4 previously failing specs pass with original assertions intact (D-05)
- ✅ Full `npm run e2e` green 155/155, zero debt waivers (D-04)
- ✅ flows hardening proven by 3 consecutive full-suite runs (D-06)
- ✅ `git diff` per commit shows only nav steps / one STOP_LIST entry / retry hardening

## Commits

| Task | Commit | Files |
|------|--------|-------|
| 1 | 86df8df0 | e2e/operator-revoke-cycle.spec.mjs |
| 2 | be1299fa | e2e/french-overflow.spec.mjs |
| 3 | 7b47ebab | e2e/flows.spec.mjs |

## Metrics

- **Duration:** ~1h10m (17:12–18:22 UTC, incl. 6 full-suite e2e runs)
- **Tasks:** 3/3
- **Commits:** 3 (+1 docs commit for this summary)
- **Status:** complete
