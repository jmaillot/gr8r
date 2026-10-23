---
phase: 07-french-catalogue-french-typography
verified: 2026-10-23T15:10:00Z
status: passed
score: 9/9 must-haves verified
covered_files:
  - ".planning/phases/07-french-catalogue-french-typography/07-01-PLAN.md"
  - ".planning/phases/07-french-catalogue-french-typography/07-01-SUMMARY.md"
  - ".planning/phases/07-french-catalogue-french-typography/07-02-PLAN.md"
  - ".planning/phases/07-french-catalogue-french-typography/07-02-SUMMARY.md"
  - ".planning/phases/07-french-catalogue-french-typography/07-03-PLAN.md"
  - ".planning/phases/07-french-catalogue-french-typography/07-03-SUMMARY.md"
  - ".planning/phases/07-french-catalogue-french-typography/07-04-PLAN.md"
  - ".planning/phases/07-french-catalogue-french-typography/07-04-SUMMARY.md"
  - ".planning/phases/07-french-catalogue-french-typography/07-05-PLAN.md"
  - ".planning/phases/07-french-catalogue-french-typography/07-05-SUMMARY.md"
  - ".planning/phases/07-french-catalogue-french-typography/07-06-PLAN.md"
  - ".planning/phases/07-french-catalogue-french-typography/07-06-SUMMARY.md"
  - ".planning/phases/07-french-catalogue-french-typography/07-07-PLAN.md"
  - ".planning/phases/07-french-catalogue-french-typography/07-07-SUMMARY.md"
  - "src/locales/fr.json"
  - "src/locales/en.json"
  - "src/core/theme.js"
  - "src/core/i18n.js"
  - "src/main.js"
  - "server.js"
  - "src/pages/settings.js"
  - "src/actions/actions.js"
  - "src/pages/members.js"
  - "src/core/api.js"
  - "src/data/seed.js"
  - "src/overlays/modals.js"
  - "src/pages/inbox.js"
  - "src/overlays/drawer.js"
  - "src/overlays/popovers.js"
  - "src/views/table.js"
  - "e2e/french-overflow.spec.mjs"
  - "scripts/fr-parity.mjs"
  - "test/catalogue.test.mjs"
  - "test/french-typography.test.mjs"
  - "test/i18n-locale.test.mjs"
  - "test/i18n-vocab.test.mjs"
  - "docs/i18n-fr-glossary.md"
covered_digest: "v2:sha256:f3999b07bee784afa739d2bef21b15e7de34e9c687e43416196b7a2960d544fd"
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "toast.moved renders a raw English direction literal ('up'/'down') under fr (src/actions/actions.js:477)"
    addressed_in: "Phase 11"
    evidence: "Phase 11 goal: 'A sweep over the 21 product routes in French proves no untranslated English string is served' + the static-scan build gate on new user-visible literals; item logged in the phase's own deferred-items.md"
  - truth: "Delete-project confirm body splices a raw '<b>N tasks</b>' English fragment under fr (src/actions/actions.js:~1451)"
    addressed_in: "Phase 11"
    evidence: "Phase 11 goal: no-English-leak sweep + static-scan build gate; item logged in the phase's own deferred-items.md"
  - truth: "Remove-member confirm body carries a raw ' will become unassigned.' English tail under fr (src/actions/actions.js:~1837)"
    addressed_in: "Phase 11"
    evidence: "Phase 11 goal: no-English-leak sweep + static-scan build gate; item logged in the phase's own deferred-items.md"
  - truth: "modal.guestsHint splice grammar renders '<b>Invités</b> ne voient que…' without its article (cosmetic French quality)"
    addressed_in: "Phase 11"
    evidence: "Logged in deferred-items.md as requiring modal-copy restructuring beyond catalogue-only scope; accepted as explicitly deferred by the signed-off D-16 read-through ('wording fixes above (if any) are applied or explicitly deferred')"
---

# Phase 7: French Catalogue & French Typography — Verification Report

**Phase Goal:** French catalogue & French typography — the 1 449-key English catalogue is fully translated into typography-compliant French, the selector switches without a reload, and the phase gates prove it.
**Verified:** 2026-10-23T15:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every key of the English catalogue has a French value; every product surface renders French (SC1) | ✓ VERIFIED | 1 481 en keys = 1 481 fr keys, 0 missing, 0 empty, 0 fr-only (direct JSON count); D-07 completeness test 26/26 GREEN; e2e route render proof 14/14 |
| 2 | French typography throughout: NBSP before `:`, NNBSP before `; ! ?`, NBSP inside guillemets, curly apostrophe, ellipsis, NFC (SC2 / I18N-05) | ✓ VERIFIED | `node --test test/french-typography.test.mjs` fail 0 over every fr.json value; character-level spot check: 0 straight apostrophes, 0 `...`, 0 plain spaces before `: ; ! ?`, 0 NFD sequences, 0 markup chars in fr.json |
| 3 | Stored vocabulary shown translated, stored ids unchanged (SC3 / I18N-07) | ✓ VERIFIED | `test/i18n-vocab.test.mjs` 15/15; e2e test "a stored status id renders its French label while the data attribute keeps the English id (I18N-07)" PASSED |
| 4 | Longer French strings fit the fixed chrome at 1280 px and 390 px (SC4) | ✓ VERIFIED | `npm run e2e` 14/14: document-overflow + fixed-chrome (sidebar, top bar, modal footer, buttons) assertions at 1280×800 and 390×844 all pass |
| 5 | Selecting Français re-renders without a reload and settles (no render loop) (D-01) | ✓ VERIFIED | e2e `french-overflow.spec.mjs:119` drives the real selector path (prefs.lang → applyPrefs → setLocale → gr8r:locale → re-render), asserts `window.__survived === 'no-reload'` and 0 DOM mutations over 1.5 s — PASSED |
| 6 | `<html lang>` tracks the active locale (D-02) | ✓ VERIFIED | `src/core/i18n.js:71` sets `document.documentElement.lang`; `test/i18n-locale.test.mjs` 9/9 |
| 7 | The label→locale mapping is guarded (getLocale() !== target) and wired at boot | ✓ VERIFIED | `src/core/theme.js:10,20` LANG_TO_LOCALE + guard; `src/main.js:68` gr8r:locale listener → render() |
| 8 | Templates, notifications and estimates render translated via catalogue keys, storage untouched (plan 07-03, I18N-07) | ✓ VERIFIED | `fmtEstimate()` at i18n.js:419; `notifText()` structured branch at inbox.js:42; TEMPLATES render `t('project.template.<id>.name')` at modals.js:144; `test/i18n-format.test.mjs` 27/27 per 07-VALIDATION.md sampling |
| 9 | The D-16 French read-through performed, defects fixed, signed off (roadmap exit criterion) | ✓ VERIFIED | 07-READ-THROUGH.md signed off by Jérémy Maillot 2026-10-23; 3 defects found and fixed (commits 77c0d45 PTABS frozen const, ef9289d activity verbs/extras + two shadowed t() crashes); regression tests added: e2e tests #13 and #14 both green |

**Score:** 9/9 truths verified (0 present, behavior-unverified)

### Deferred Items

Items not yet met but explicitly addressed in later milestone phases (Step 9b).

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Raw English direction literal in `toast.moved` under fr (actions.js:477) | Phase 11 | Phase 11 goal: no-English-leak sweep over 21 routes + static-scan build gate |
| 2 | Raw `<b>N tasks</b>` splice in delete-project confirm under fr (actions.js) | Phase 11 | Same Phase 11 sweep + build gate |
| 3 | Raw " will become unassigned." tail in remove-member confirm under fr (actions.js) | Phase 11 | Same Phase 11 sweep + build gate |
| 4 | `modal.guestsHint` splice grammar (cosmetic) | Phase 11 | deferred-items.md routing + D-16 sign-off explicitly accepting deferrals |

Note: these 4 items were logged by the phase itself in `deferred-items.md` during plan 07-05 execution (en.json had to stay byte-identical, so new keys could not be added), and the D-16 read-through was signed off with them known. They are residual raw literals in source-composed strings — precisely the class Phase 11's sweep and static scan exist to catch. They do not undermine the phase goal: the catalogue itself is 100% translated and typographically compliant.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/locales/fr.json` | full French catalogue | ✓ VERIFIED | 1 481 keys, 0 empty, lint-clean |
| `src/core/theme.js` | LANG_TO_LOCALE mapping + guard in applyPrefs | ✓ VERIFIED | lines 10, 19–20 |
| `src/core/i18n.js` | documentElement.lang in setLocale; fmtEstimate | ✓ VERIFIED | lines 71–72, 419 |
| `src/main.js` | gr8r:locale re-render listener | ✓ VERIFIED | line 68 |
| `test/french-typography.test.mjs` | D-05 lint over every fr value | ✓ VERIFIED | fail 0 |
| `test/catalogue.test.mjs` | D-07 completeness gate | ✓ VERIFIED | 26/26 |
| `test/i18n-locale.test.mjs` | D-01/D-02 mapping + lang proof | ✓ VERIFIED | 9/9 |
| `test/i18n-vocab.test.mjs` | stored-vocabulary contract | ✓ VERIFIED | 15/15 |
| `scripts/fr-parity.mjs` | namespace-scoped parity gate | ✓ VERIFIED | runs, reports missing per namespace |
| `e2e/french-overflow.spec.mjs` | D-15 overflow + rendering + no-reload proof | ✓ VERIFIED | 6 tests, all pass within the 14/14 run |
| `docs/i18n-fr-glossary.md` | D-08 terminology glossary | ✓ VERIFIED | exists |
| `src/locales/en.json` | billing keys removed; otherwise untouched | ✓ VERIFIED | no /plan endpoint, no changePlan/setPlan anywhere; 07-02 tests green |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| theme.js applyPrefs | i18n.js setLocale | label→code mapping, guarded | ✓ WIRED | theme.js:19–20 |
| i18n.js setLocale | document + re-render | documentElement.lang + gr8r:locale dispatch | ✓ WIRED | i18n.js:71–72 |
| main.js | full re-render | gr8r:locale listener → render() | ✓ WIRED | main.js:68 |
| e2e spec | real selector path | settings → language row → Français option click | ✓ WIRED | spec line 139–154 drives the D-01 chain in a browser |
| modals.js TEMPLATES | catalogue keys | t(`project.template.${id}.name`) | ✓ WIRED | modals.js:144 |
| seed.js notif rows | notif.* keys | notifText() structured branch + legacy fallback | ✓ WIRED | inbox.js:42,71 |
| estimate storage | display formatter | fmtEstimate() display-only | ✓ WIRED | i18n.js:419 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| fr.json | every catalogue value | translation batches (07-04…07-06) | yes — 1 481 non-empty values | ✓ FLOWING |
| settings language row | prefs.lang | stored workspace prefs | yes — real selector drives e2e | ✓ FLOWING |
| notifText() | notification rows | seed/document data with structured fields | yes — structured kind + legacy fallback | ✓ FLOWING |

No static fallbacks, hardcoded literals or mock data feeding rendered French strings were found (the 4 deferred raw literals are source-composed fragments, not mock data — tracked above).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| D-07 completeness gate | `node --test test/catalogue.test.mjs` | 26 pass / 0 fail | ✓ PASS |
| D-05 typography lint | `node --test test/french-typography.test.mjs` | 0 fail | ✓ PASS |
| D-01/D-02 locale wiring | `node --test test/i18n-locale.test.mjs` | 9 pass / 0 fail | ✓ PASS |
| I18N-07 vocab contract | `node --test test/i18n-vocab.test.mjs` | 15 pass / 0 fail | ✓ PASS |
| Full unit suite | `npm test` | 362 pass / 0 fail | ✓ PASS |
| Build | `npm run build` | clean; fr chunk emitted (`dist/assets/fr-cePhQDnE.js`) | ✓ PASS |
| Full browser suite | `npm run e2e` | 14 passed (21.5 s), incl. no-reload switch, render-loop guard, I18N-07 label-vs-id, 2 read-through regression tests | ✓ PASS |
| fr.json character hygiene | direct JSON scan | 0 straight apostrophes / 0 `...` / 0 plain spaces before punct / 0 NFD / 0 markup | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or conventional for this phase; the phase's probe equivalents are the node:test gates and the Playwright spec above — all executed by this verifier in its own runs.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| I18N-02 | 07-01, 07-02, 07-04, 07-05, 06, 07-07 | French catalogue covers every English key; whole interface renders French | ✓ SATISFIED | 1 481/1 481 parity (0 missing, 0 empty); D-07 26/26; e2e renders French across routes; D-16 signed off. 4 residual raw literals deferred to Phase 11 (see Deferred Items) |
| I18N-05 | 07-01, 07-04, 07-05, 07-06, 07-07 | French typography: NBSP/NNBSP, guillemets, curly apostrophe, ellipsis, NFC | ✓ SATISFIED | D-05 lint green over every value; character-level scan clean; typography spot-check section of the signed-off read-through |
| I18N-07 | 07-03, 07-07 | Stored vocabulary translated at display; stored values unchanged | ✓ SATISFIED | i18n-vocab 15/15; e2e I18N-07 test (label French, data attribute English); templates/notifs/estimates rendered via t()/fmtEstimate/notifText |

All 3 requirement IDs from the PLAN frontmatter are accounted for. No orphaned Phase-7 requirements in REQUIREMENTS.md (I18N-02/05/07 are the only ones mapped to Phase 7; I18N-03/04 were satisfied by Phase 6, I18N-06/08 belong to Phase 11).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| src/core/i18n.js | 89 | `PLACEHOLDER` constant | ℹ️ Info | Named regex constant, not a debt marker |
| src/actions/actions.js | 477 / ~1451 / ~1837 | raw English literals on fr surfaces | 📋 Deferred | Logged by the phase; Phase 11 sweep owns the fix |

No TBD/FIXME/XXX/TODO/HACK debt markers in any phase-modified file. No stub returns, no empty handlers, no console.log-only implementations.

### Human Verification Required

**D-16 French read-through — SIGNED OFF.** Performed by Jérémy Maillot on 2026-10-23 across all routes (shell, workspace pages, project views, overlays, empty states, auth, 404), with register and typography spot-checks. Three defects were found and fixed during the read-through (commits 77c0d45, ef9289d), each covered by an added Chromium regression test (e2e 14/14 green). Sign-off recorded in 07-READ-THROUGH.md. **No further human verification is requested.** The real-screen overflow eyeball check listed in 07-VALIDATION.md was part of the same signed-off session; the programmatic 1280 px/390 px overflow proof is independently green.

### Gaps Summary

None. All 9 merged must-haves verified with direct codebase evidence and independently re-run gates: catalogue parity exact (1 481/1 481, 0 empty), typography lint green over every value, stored vocabulary translated at display while ids stay English, the selector switches without a reload (behaviorally proven in Chromium, including the render-loop guard), the chrome holds at both viewports, the billing surface is gone end-to-end, and the roadmap's exit criterion — the French read-through — is signed off with its three defects fixed and regression-tested. The 4 deferred raw-literal items are owned by Phase 11's no-English-leak sweep and build gate.

---

_Verified: 2026-10-23T15:10:00Z_
_Verifier: the agent (gsd-verifier)_
