---
phase: 07-french-catalogue-french-typography
verified: 2026-10-25T19:29:16Z
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
covered_digest: "v2:sha256:06a789d754e6a8156dc52ba084a19863c1dcbbe2e2ea4bd938051d18866b5a9b"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: "9/9"
  gaps_closed: []
  gaps_remaining: []
  regressions: []
deferred: []
---

# Phase 7: French Catalogue & French Typography — Verification Report (Re-verification, round 3)

**Phase Goal:** The French catalogue reaches full parity with English (every key translated, fr-parity gate green), French typography (apostrophes, spacing, quotes) is correct, and the interface renders French when the locale is fr.
**Verified:** 2026-10-25T19:29:16Z
**Status:** passed
**Re-verification:** Yes — round 3, triggered by covered-file drift: commit 54cead4 (CR-01) modified `server.js` (in the covered set) and added a test to `test/upload.test.mjs` (outside the covered set). Full gate battery re-run at HEAD `a2c79c4`.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every key of the English catalogue has a French value; every product surface renders French (SC1 / I18N-02) | ✓ VERIFIED | direct JSON count re-run at HEAD: 1 538 en keys = 1 538 fr keys, 0 missing, 0 empty, exactly 1 fr-only key — the declared intentional `contract.frenchOnly` marker (mirror: `contract.englishOnly`); D-07 ledger test green; fr-parity namespaces toast/act/page/modal all exit 0; i18n-scan at HEAD: 0 literals, exit 0 |
| 2 | French typography throughout: NBSP before `:`, NNBSP before `; ! ?`, NBSP inside guillemets, curly apostrophe, ellipsis, NFC (SC2 / I18N-05) | ✓ VERIFIED | `node --test test/french-typography.test.mjs` re-run at HEAD: 9 tests / 0 fail; independent character-level scan of all 1 538 fr values: 0 straight apostrophes, 0 `...`, 0 plain spaces before `: ; ! ?`, 0 non-NFC, 0 markup chars |
| 3 | Stored vocabulary shown translated, stored ids unchanged (SC3 / I18N-07) | ✓ VERIFIED | `test/i18n-vocab.test.mjs` 15/15 within the 446-test run; prior-round e2e "stored status id renders its French label while the data attribute keeps the English id (I18N-07)" passed in the 45-test Chromium run (spec and its target files unchanged since) |
| 4 | Longer French strings fit the fixed chrome at 1280 px and 390 px (SC4) | ✓ VERIFIED | prior-round `npm run e2e` 45/45 (document-overflow + fixed-chrome assertions at 1280×800 and 390×844); no covered i18n/UI file changed since (`e2e/french-overflow.spec.mjs`, catalogues, renderers all digest-stable) |
| 5 | Selecting Français re-renders without a reload and settles (no render loop) (D-01) | ✓ VERIFIED | e2e `french-overflow.spec.mjs:124` drives the real selector path and asserts `window.__survived === 'no-reload'` (prior round); wiring unchanged and re-confirmed at HEAD: `IN.langSel` (actions.js:2229) → `setLocale` (i18n.js:74) → `gr8r:locale` (i18n.js:77) → `render()` (main.js:68) |
| 6 | `<html lang>` tracks the active locale (D-02) | ✓ VERIFIED | `src/core/i18n.js:63` sets `document.documentElement.lang`; `test/i18n-locale.test.mjs` 13/13 within the 446-test run |
| 7 | The label→locale mapping is guarded and wired at boot | ✓ VERIFIED | locale is an account property (phase-8 LOC-04; store.js:24–27 deletes legacy `prefs.lang` from old blobs); current chain `IN.langSel` (actions.js:2229) → `setLocale` (i18n.js:74; documentElement.lang:63; gr8r:locale:77) → `render()` (main.js:68); re-proven by i18n-locale 13/13 and the Chromium no-reload test |
| 8 | Templates, notifications and estimates render translated via catalogue keys, storage untouched (plan 07-03, I18N-07) | ✓ VERIFIED | `test/i18n-vocab.test.mjs` 15/15 within the 446-test run: templates pinned per-key, `notifText()` structured branch + verbatim legacy branch, storage ids never rewritten |
| 9 | The D-16 French read-through performed, defects fixed, signed off (roadmap exit criterion) | ✓ VERIFIED | 07-READ-THROUGH.md signed off 2026-10-23; its 3 defects fixed and regression-tested (prior rounds); all 4 knowingly-accepted deferral sites verified applied in code (commit 2a75275, re-confirmed this round — see Splice Sites below) |

**Score:** 9/9 truths verified (0 present, behavior-unverified)

### Re-verification Delta (round 3 — what changed since the round-2 report)

Exactly one covered-file change since round 2, at HEAD `a2c79c4`:

- **54cead4** — CR-01 fix (phase-12 review disposition): `server.js` `serveFileBinary` now ignores the Range header on **zero-byte** files (`stat.size > 0` guard on `rawRange`, RFC 9110 §14.2 — range handling is optional), eliminating a malformed `Content-Range: bytes 0--1/0` + synchronous `ERR_OUT_OF_RANGE`; a new named test in `test/upload.test.mjs` (outside the covered set) pins the behavior. This is transport-layer range math on the file route — no catalogue, locale, or typography surface is touched. Unit suite grew 445 → 446 with the new test and stays fully green.

No phase-7 truth depends on `serveFileBinary`'s range logic. Full gate battery re-run by this verifier at HEAD, solo, all green — see Behavioral Spot-Checks.

### Splice Sites (regression re-check of the round-2 close-out)

All four `deferred-items.md` sites + the dropzone literal remain translated at HEAD:

| Site | Code evidence | Status |
|---|---|---|
| toast.moved direction | actions.js:484 `t(d < 0 ? 'toast.dirUp' : 'toast.dirDown')` | ✓ still translated |
| `<b>N tasks</b>` splice | actions.js:1479 `t('act.deleteProjectTaskCount', { n })` (one/other plural) | ✓ still translated |
| " will become unassigned." tail | actions.js:1865–1866 `act.removeAccess.losesAccess` + `act.removeAccess.unassigns` | ✓ still translated |
| guests-hint + dropzone 'browse' | modals.js:219 `t('modal.guests')` + `t('modal.guestsHint')`; `page.files.browse` | ✓ still translated |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/locales/fr.json` | full French catalogue | ✓ VERIFIED | 1 538 keys, 0 empty, 0 non-NFC; matches HEAD digest |
| `src/locales/en.json` | catalogue source of truth, 1 538 keys | ✓ VERIFIED | exact fr parity; ledger test pins the size |
| `src/actions/actions.js` | deferred splice sites gone | ✓ VERIFIED | all 4 sites interpolate `t()` keys (lines 484, 1479, 1865–1866) |
| `src/core/i18n.js` | documentElement.lang in setLocale | ✓ VERIFIED | lines 63, 74–77 |
| `src/main.js` | gr8r:locale re-render listener | ✓ VERIFIED | line 68 |
| `server.js` | drift-only change this round | ✓ VERIFIED | 54cead4 adds `stat.size > 0` guard in serveFileBinary; orthogonal to i18n; new CR-01 test passes |
| `test/french-typography.test.mjs` | typography lint over every fr value | ✓ VERIFIED | 9 tests / 0 fail (re-run at HEAD) |
| `test/catalogue.test.mjs` | D-07 completeness gate | ✓ VERIFIED | 26 tests / 0 fail (re-run at HEAD) |
| `test/i18n-vocab.test.mjs` | stored-vocabulary contract | ✓ VERIFIED | 15/15 within the 446-test run |
| `test/i18n-locale.test.mjs` | lang/mapping proof | ✓ VERIFIED | 13/13 within the 446-test run |
| `scripts/fr-parity.mjs` | namespace parity gate | ✓ VERIFIED | toast, act, page, modal namespaces each exit 0 (re-run) |
| `e2e/french-overflow.spec.mjs` | overflow + French-rendering + no-reload proof | ✓ VERIFIED | 45/45 Chromium in the prior round; spec and every file it exercises are digest-stable since |
| `docs/i18n-fr-glossary.md` | D-08 glossary | ✓ VERIFIED | exists |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| settings langSel (settings.js:93) | IN.langSel (actions.js:2229) | data-in binding | ✓ WIRED | real selector path |
| IN.langSel | i18n.js setLocale | await setLocale(code) | ✓ WIRED | then background PATCH /api/auth/me (phase-8 LOC-04) |
| i18n.js setLocale | document + re-render | documentElement.lang (63) + gr8r:locale dispatch (77) → render() (main.js:68) | ✓ WIRED | proven in Chromium no-reload test |
| actions.js splice sites | catalogue keys | t('toast.dirUp'…), t('act.deleteProjectTaskCount'), t('act.removeAccess.*') | ✓ WIRED | keys exist in BOTH catalogues with French values |
| modals.js TEMPLATES | catalogue keys | t(`project.template.*`) + modal.guests keys | ✓ WIRED | pinned by i18n-vocab 15/15 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| fr.json catalogue values | every key | translation batches + close-out commit 2a75275 | yes — 1 538 non-empty values | ✓ FLOWING |
| IN.langSel | el.value → setLocale | real `<select>` in settings language row | yes — driven by e2e | ✓ FLOWING |
| toast/confirm strings | t() interpolations | catalogue keys, no raw literals at the 4 sites | yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| ESLint | `npm run lint` | exit 0 | ✓ PASS |
| Prettier | `npm run format:check` | "All matched files use Prettier code style!", exit 0 | ✓ PASS |
| i18n scan at HEAD | `node scripts/i18n-scan.mjs` | "0 literals, 0 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch", exit 0 | ✓ PASS |
| fr-parity namespaces | `node scripts/fr-parity.mjs toast\|act\|page\|modal` | all 4 exit 0 | ✓ PASS |
| Catalogue parity count | direct JSON comparison | 1 538 en = 1 538 fr; 0 missing, 0 empty; asymmetry limited to the declared `contract.englishOnly`/`contract.frenchOnly` markers | ✓ PASS |
| Full unit suite at HEAD | `npm test` (single run, solo) | **446 pass / 0 fail** (incl. the new CR-01 zero-byte Range test and i18n-scan/typography/catalogue/vocab/locale suites); exit 0 | ✓ PASS |
| Catalogue lint (named) | `node --test test/catalogue.test.mjs` | 26 pass / 0 fail | ✓ PASS |
| Typography lint (named) | `node --test test/french-typography.test.mjs` | 9 pass / 0 fail | ✓ PASS |
| Character hygiene of fr.json | direct JSON scan | 0 straight apostrophes / 0 `...` / 0 plain spaces before punct / 0 non-NFC / 0 markup chars | ✓ PASS |
| Full browser suite | `npm run e2e` (prior round) | 45 passed — incl. no-reload switch, I18N-07 label-vs-id, overflow at both viewports; no covered file touched since | ✓ PASS (carried) |

Probe debris: none this round. `src/views/table.js` was clean before and after the full suite (the round-2 scanner-probe literal is gone from the tree — the prior Advisory is resolved). The full suite was run once, solo, per the #25/#753 single-run constraint; no state mutation persisted (`git status` clean on all src/test paths afterwards).

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or conventional for this phase; the phase's probe equivalents are the node:test gates and the Playwright spec — all executed by this verifier in its own runs at HEAD.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| I18N-02 | 07-01, 07-02, 07-04, 07-05, 07-06, 07-07 | French catalogue covers every English key; whole interface renders French | ✓ SATISFIED | 1 538/1 538 parity (0 missing, 0 empty); D-07 ledger green; fr-parity namespaces exit 0; i18n-scan 0 literals at HEAD; the phase's 4 former residual raw literals remain translated (2a75275), scan-dependent gates green with an empty allow-list |
| I18N-05 | 07-01, 07-04, 07-05, 07-06, 07-07 | French typography: NBSP/NNBSP, guillemets, curly apostrophe, ellipsis, NFC | ✓ SATISFIED | typography lint green (re-run); character-level scan of all 1 538 values clean |
| I18N-07 | 07-03, 07-07 | Stored vocabulary translated at display; stored values unchanged | ✓ SATISFIED | i18n-vocab 15/15 in the 446-test run; e2e I18N-07 test passed in the 45/45 run (unchanged since) |

All 3 requirement IDs from the PLAN frontmatter are accounted for. REQUIREMENTS.md maps exactly I18N-02/05/07 to Phase 7 (all marked Complete); no orphaned phase-7 requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| src/core/i18n.js | 89 | `PLACEHOLDER` constant | ℹ️ Info | Named regex constant, not a debt marker |
| src/views/table.js | — | round-2 uncommitted probe export | ✅ Resolved | Absent from the working tree this round; suite clean |
| server.js | 1976–1986 (54cead4) | new zero-byte Range guard | ℹ️ Info | Comment-documented RFC 9110 §14.2 disposition with a pinned test; no debt marker |

No TBD/FIXME/XXX/TODO/HACK debt markers in any phase-modified file. No stub returns, no empty handlers, no console.log-only implementations.

### Human Verification Required

None. Carried forward from round 2: the D-16 French read-through was signed off (07-READ-THROUGH.md, 2026-10-23) and all four of its deferrals are verified applied in code and by behavior. The round-3 drift (54cead4) is transport-layer logic with a deterministic unit test — no human verification item arises.

### Gaps Summary

None. The round-3 drift check confirms: the only covered-file change since round 2 (54cead4's `server.js` zero-byte Range guard) is orthogonal to every phase-7 truth, catalogue parity is exact at 1 538 keys on both sides with only the declared reserved-namespace markers asymmetric, i18n-scan exits 0 at HEAD, fr-parity gates exit 0, the full unit suite is 446/446, and lint/format/typography/catalogue gates are all green. The round-2 working-tree debris (probe literal in table.js) is gone. `covered_digest` this round is computed with the official `verification.fingerprint` CLI verb, verbatim — fixing the hand-rolled digest that staled round 2.

---

_Verified: 2026-10-25T19:29:16Z_
_Verifier: the agent (gsd-verifier)_
