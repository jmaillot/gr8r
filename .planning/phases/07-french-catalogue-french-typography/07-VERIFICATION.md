---
phase: 07-french-catalogue-french-typography
verified: 2026-10-25T20:05:00Z
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
covered_digest: "v2:sha256:b62080f6e31a8fb205c5f2217a34e7c37760d9631999e42a09cee73fa4df7046"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: "9/9"
  gaps_closed:
    - "toast.moved renders a raw English direction literal under fr — now locale-aware via toast.dirUp/toast.dirDown (commit 2a75275)"
    - "Delete-project confirm body spliced a raw '<b>N tasks</b>' English fragment — now the plural catalogue key act.deleteProjectTaskCount (commit 2a75275)"
    - "Remove-member confirm body carried a raw ' will become unassigned.' English tail — now act.removeAccess.losesAccess/unassigns keys (commit 2a75275)"
    - "modal.guestsHint splice grammar lacked its article — fr modal.guests is now « Les invités »; the dropzone 'browse' literal moved to page.files.browse (« parcourir ») (commit 2a75275)"
  gaps_remaining: []
  regressions: []
deferred: []  # all four items previously deferred to Phase 11 were resolved at close-out (commit 2a75275), ahead of the sweep
---

# Phase 7: French Catalogue & French Typography — Verification Report (Re-verification)

**Phase Goal:** The French catalogue reaches full parity with English (every key translated, fr-parity gate green), French typography (apostrophes, spacing, quotes) is correct, and the interface renders French when the locale is fr.
**Verified:** 2026-10-25T20:05:00Z
**Status:** passed
**Re-verification:** Yes — stale covered digest after post-phase close-out commits (#4682)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every key of the English catalogue has a French value; every product surface renders French (SC1 / I18N-02) | ✓ VERIFIED | direct JSON count: 1 538 en keys = 1 538 fr keys, 0 missing, 0 empty, 0 fr-only (aside from the declared intentional `contract.englishOnly` / `contract.frenchOnly` reserved-namespace markers); the D-07 completeness test asserts the 1 538 ledger and is green; fr-parity namespaces toast/act/page/modal all exit 0; i18n scan exits 0 at HEAD (0 literals) |
| 2 | French typography throughout: NBSP before `:`, NNBSP before `; ! ?`, NBSP inside guillemets, curly apostrophe, ellipsis, NFC (SC2 / I18N-05) | ✓ VERIFIED | `node --test test/french-typography.test.mjs` 35/35 pass over every fr.json value (re-run by this verifier); character-level scan: 0 straight apostrophes, 0 `...`, 0 plain spaces before `: ; ! ?`, 0 NFD, 0 markup chars in fr.json |
| 3 | Stored vocabulary shown translated, stored ids unchanged (SC3 / I18N-07) | ✓ VERIFIED | `test/i18n-vocab.test.mjs` 15/15; e2e "a stored status id renders its French label while the data attribute keeps the English id (I18N-07)" passes in the 45-test Chromium run |
| 4 | Longer French strings fit the fixed chrome at 1280 px and 390 px (SC4) | ✓ VERIFIED | `npm run e2e` 45/45 pass incl. document-overflow + fixed-chrome assertions at 1280×800 and 390×844 |
| 5 | Selecting Français re-renders without a reload and settles (no render loop) (D-01) | ✓ VERIFIED | e2e `french-overflow.spec.mjs:124` drives the real selector path and asserts `window.__survived === 'no-reload'`; `IN.langSel` (actions.js:2229) → `setLocale` → `gr8r:locale` → `render()` (main.js:68) — present and behaviorally proven in Chromium |
| 6 | `<html lang>` tracks the active locale (D-02) | ✓ VERIFIED | `src/core/i18n.js:63` sets `document.documentElement.lang`; `test/i18n-locale.test.mjs` 13/13 |
| 7 | The label→locale mapping is guarded and wired at boot | ✓ VERIFIED | The mapping has evolved with phase 8 (locale became an account property; `prefs.lang` removed from prefs per LOC-04 — store.js:24–27 explicitly deletes it from old blobs). The current D-01 chain is `IN.langSel` (actions.js:2229) → `setLocale` (i18n.js:74, sets documentElement.lang:63, dispatches gr8r:locale:77) → `render()` (main.js:68). Re-proven by `test/i18n-locale.test.mjs` 13/13 and the Chromium no-reload test |
| 8 | Templates, notifications and estimates render translated via catalogue keys, storage untouched (plan 07-03, I18N-07) | ✓ VERIFIED | `test/i18n-vocab.test.mjs` 15/15: templates pinned per-key, `notifText()` structured branch + verbatim legacy branch, storage ids never rewritten |
| 9 | The D-16 French read-through performed, defects fixed, signed off (roadmap exit criterion) | ✓ VERIFIED | 07-READ-THROUGH.md signed off 2026-10-23; its 3 defects fixed and regression-tested (prior verification); the read-through's 4 knowingly-accepted deferral sites are now all fixed (see Re-verification) |

**Score:** 9/9 truths verified (0 present, behavior-unverified)

### Re-verification Delta (what changed since 2026-10-23)

The stale digest came from close-out commits after the phase closed. Diff vs HEAD `d1807be`:

- **2a75275** — deferred-07 close-out: the 4 raw-English splice sites from the phase's own `deferred-items.md` plus the dropzone `browse` literal were all fixed with new catalogue keys; both catalogues grew to 1 538 keys with parity intact.
- **21725f1 / d1807be** — formatting and audit-item chores; no effect on phase truths.

Every `**Status:** resolved` claim in `deferred-items.md` was checked against the actual code:

| Deferred item | Code evidence (working tree = HEAD) | Status |
|---|---|---|
| toast.moved raw 'up'/'down' | actions.js:484 `t(d < 0 ? 'toast.dirUp' : 'toast.dirDown')`; fr « vers le haut / vers le bas » | ✓ resolved |
| `<b>N tasks</b>` splice | actions.js:1479 `t('act.deleteProjectTaskCount', { n })` (plural one/other: « {n} tâche / {n} tâches ») | ✓ resolved |
| " will become unassigned." tail | actions.js:1865–1866 `act.removeAccess.losesAccess` + `act.removeAccess.unassigns`; fr values typographically correct | ✓ resolved |
| guests-hint article + dropzone 'browse' | modals.js:219 renders `t('modal.guests')` (fr « Les invités ») + `t('modal.guestsHint')`; `page.files.browse` = « parcourir » replaces the raw literal | ✓ resolved |

### Advisory (New Scope, Unevidenced — repo hygiene, not a phase truth)

| # | Finding | Category | Detail |
|---|---------|----------|--------|
| 1 | Uncommitted probe artifact in the working tree | other | `src/views/table.js` carries an **uncommitted** 2-line addition (`export const probe = 'A literal that never got extracted'`), and two untracked phase-10/12 planning files exist. This line is excluded from this verification's covered digest (table.js is digested at HEAD, where the line does not exist). Effect: in the dirty working tree, the live-tree i18n-scan assertions fail (416/422) because the scanner rightly flags the probe literal; at HEAD the full 445-test suite passes 445/445 and the scan exits 0. The dirty line is conspicuous leftover tooling — drop or commit/revert it before the next build. |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/locales/fr.json` | full French catalogue | ✓ VERIFIED | 1 538 keys, 0 empty, 0 non-NFC; on-disk file matches HEAD digest |
| `src/locales/en.json` | catalogue source of truth, 1 538 keys | ✓ VERIFIED | matches fr parity; ledger test pins the size and the deliberate additions |
| `src/actions/actions.js` | deferred splice sites gone | ✓ VERIFIED | all 4 sites now interpolate `t()` keys (lines 484, 1479, 1865–1866) |
| `src/core/i18n.js` | documentElement.lang in setLocale | ✓ VERIFIED | lines 63, 74–77 |
| `src/main.js` | gr8r:locale re-render listener | ✓ VERIFIED | line 68 |
| `test/french-typography.test.mjs` | typography lint over every fr value | ✓ VERIFIED | 35/35 pass (re-run) |
| `test/catalogue.test.mjs` | D-07 completeness gate | ✓ VERIFIED | green within the 445/445 run |
| `test/i18n-vocab.test.mjs` | stored-vocabulary contract | ✓ VERIFIED | 15/15 (re-run) |
| `test/i18n-locale.test.mjs` | lang/mapping proof | ✓ VERIFIED | 13/13 (re-run) |
| `scripts/fr-parity.mjs` | namespace parity gate | ✓ VERIFIED | toast, act, page, modal namespaces each exit 0 |
| `e2e/french-overflow.spec.mjs` | overflow + French-rendering + no-reload proof | ✓ VERIFIED | passes in the 45/45 Chromium run (spec last touched by phase 11's sweep, still asserting phase-7's D-01/D-15/SC4 contracts) |
| `docs/i18n-fr-glossary.md` | D-08 glossary | ✓ VERIFIED | exists |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| settings langSel (settings.js:93) | IN.langSel (actions.js:2229) | data-in binding | ✓ WIRED | real selector path |
| IN.langSel | i18n.js setLocale | await setLocale(code) | ✓ WIRED | then background PATCH /api/auth/me (phase-8 LOC-04) |
| i18n.js setLocale | document + re-render | documentElement.lang (63) + gr8r:locale dispatch (77) → render() (main.js:68) | ✓ WIRED | proven in Chromium no-reload test |
| actions.js splice sites | catalogue keys | t('toast.dirUp'…), t('act.deleteProjectTaskCount'), t('act.removeAccess.*'), t('page.files.browse') | ✓ WIRED | keys exist in BOTH catalogues with French values |
| modals.js TEMPLATES | catalogue keys | t(`project.template.*`) | ✓ WIRED | pinned by i18n-vocab 15/15 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| fr.json catalogue values | every key | translation batches + close-out commit 2a75275 | yes — 1 538 non-empty values | ✓ FLOWING |
| IN.langSel | el.value → setLocale | real `<select>` in settings language row | yes — driven by e2e | ✓ FLOWING |
| toast/confirm strings | t() interpolations | catalogue keys, no raw literals left at the 4 sites | yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Typography lint (every fr value) | `node --test test/french-typography.test.mjs` | 35 pass / 0 fail | ✓ PASS |
| Completeness + parity ledger | `node --test test/catalogue.test.mjs` | pass (within 445/445) | ✓ PASS |
| Locale wiring D-01/D-02 | `node --test test/i18n-locale.test.mjs` | 13 pass / 0 fail | ✓ PASS |
| I18N-07 vocab contract | `node --test test/i18n-vocab.test.mjs` | 15 pass / 0 fail | ✓ PASS |
| fr-parity namespaces | `node scripts/fr-parity.mjs toast\|act\|page\|modal` | all exit 0 | ✓ PASS |
| i18n scan at HEAD | `node scripts/i18n-scan.mjs` (in clean HEAD worktree) | 0 literals, exit 0 | ✓ PASS |
| Full unit suite at HEAD | `npm test` (clean HEAD worktree) | 445 pass / 0 fail | ✓ PASS |
| Character hygiene of fr.json | direct JSON scan | 0 straight apostrophes / 0 `...` / 0 plain spaces before punct / 0 NFD / 0 markup | ✓ PASS |
| Full browser suite | `npm run e2e` | 45 passed (incl. no-reload switch, I18N-07 label-vs-id, overflow at both viewports) | ✓ PASS |

Note on the main working tree: the same suite scores 416/422 there solely because of the uncommitted `probe` literal in `src/views/table.js` (see Advisory); the i18n-scan-dependent tests fail against the dirty tree and pass at HEAD. This is working-tree hygiene, not a regression of phase-7 code.

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or conventional for this phase; the phase's probe equivalents are the node:test gates and the Playwright spec — all executed by this verifier in its own runs (including a clean HEAD worktree run for the scan-dependent gates).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| I18N-02 | 07-01, 07-02, 07-04, 07-05, 07-06, 07-07 | French catalogue covers every English key; whole interface renders French | ✓ SATISFIED | 1 538/1 538 parity (0 missing, 0 empty); D-07 ledger green; fr-parity namespaces exit 0; i18n scan 0 literals at HEAD; the phase's 4 known residual raw literals are now translated (commit 2a75275), so the scan-dependent gates are green with an empty allow-list |
| I18N-05 | 07-01, 07-04, 07-05, 07-06, 07-07 | French typography: NBSP/NNBSP, guillemets, curly apostrophe, ellipsis, NFC | ✓ SATISFIED | typography lint 35/35; character-level scan clean incl. the 6 close-out keys (verified NBSP U+00A0 before `:` in `toast.completed` etc.) |
| I18N-07 | 07-03, 07-07 | Stored vocabulary translated at display; stored values unchanged | ✓ SATISFIED | i18n-vocab 15/15; e2e I18N-07 test passes in the 45/45 run |

All 3 requirement IDs from the PLAN frontmatter are accounted for. REQUIREMENTS.md maps exactly I18N-02/05/07 to Phase 7, and the roadmap phase table marks all three Complete. No orphaned phase-7 requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| src/core/i18n.js | 89 | `PLACEHOLDER` constant | ℹ️ Info | Named regex constant, not a debt marker |
| src/views/table.js | 85 (working tree only) | uncommitted probe export with a raw English literal | ⚠️ Warning (hygiene) | Dirty-tree only; absent at HEAD. Breaks live-tree scan tests until reverted/committed |
| src/actions/actions.js | — | former raw English literals (477/1451/1837) | ✅ Resolved | All fixed in 2a75275; character-level scan of the replacements is clean |

No TBD/FIXME/XXX/TODO/HACK debt markers in any phase-modified file. No stub returns, no empty handlers, no console.log-only implementations.

### Human Verification Required

None carried forward. The D-16 French read-through was signed off (07-READ-THROUGH.md, 2026-10-23) with its wording fixes "applied or explicitly deferred"; the four deferrals have since been applied and are verified in code and by behavior (445/445 unit + 45/45 Chromium). No further human verification is requested.

### Gaps Summary

None. The re-verification confirms the close-out: catalogue parity is exact at 1 538 keys on both sides with only the declared reserved-namespace markers asymmetric, the four deferred raw-English splice sites (and the dropzone 'browse' literal) are translated via typed catalogue keys with typographically correct French values, i18n-scan exits 0 at HEAD, fr-parity gates exit 0, and the full 445-test suite plus the 45-test Chromium suite pass. The only new finding is a piece of uncommitted working-tree debris (a scanner-probe literal in table.js) that lives outside this phase's scope and outside HEAD; it is flagged in the Advisory section.

---

_Verified: 2026-10-25T20:05:00Z_
_Verifier: the agent (gsd-verifier)_
