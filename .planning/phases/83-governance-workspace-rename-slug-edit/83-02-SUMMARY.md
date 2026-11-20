---
phase: 83-governance-workspace-rename-slug-edit
plan: 02
subsystem: client-governance
tags: [rename-modal, confirm-fork, slug-suggestion, dead-mapping-card, i18n-5-locale]
requires:
  - 83-01 routes (operatorWsRename / operatorDeadMappings) + api.js client methods
  - Phase 79 governance surface (wsRow, govOrphanBody, govRefusalToast, confirmDlg)
  - Phase 82 encoded guard trail format (group_<delta>:group:<guid>:<reason>)
provides:
  - A.govEditAsk / A.govEditSave / A.govEditAdopt / A.govEditCancel + IN.govEditName/govEditSlug
  - governance.js govEditBody modal + govDeadCard warning card (exported body, card internal)
  - 14 new page.governance.*/toast.* keys across en/fr/nl/de/es
  - 8 new client-source regression assertions in test/governance-client.test.mjs
affects:
  - /gsd-verify-work UAT for GV-01/02/03
tech-stack:
  added: []
  patterns:
    - S.ui.govEditWs staging with origSlug ground truth (mirrors S.ui.govOrphan)
    - chunk-backed openModal custom host (79-02 precedent)
    - FIRST-colon-only split for encoded trail rendering (D-08/Pitfall 7)
key-files:
  created: []
  modified:
    - src/pages/governance.js
    - src/actions/actions.js
    - src/locales/en.json
    - src/locales/fr.json
    - src/locales/nl.json
    - src/locales/de.json
    - src/locales/es.json
    - test/i18n-toast.test.mjs
    - test/i18n-shell.test.mjs
    - test/i18n-core-features.test.mjs
    - test/governance-client.test.mjs
decisions:
  - Dead-mappings payload rides the existing refreshGovernanceWorkspaces fill (one render kick, seq-guarded) rather than a separate fetch loop
  - Staged edit state carries origSlug alongside the live edit so the D-03 fork compares against ground truth, not the mutated field
  - govRefusalToast keyed list left untouched — rename refusals surface via the tErr pipeline over the existing err.* keys (D-04 zero new vocabulary)
  - Field edits ride data-in handlers mutating staged state (no re-render per keystroke); only suggestion adopt / save / cancel re-render
metrics:
  duration: ~55 min
  completed: 2026-11-20
  commits: 5
  plan_head_before: b1dcae5a
  plan_head_after: 07ae450a
status: complete
actuals:
  tokens: 68000
  tasks: 2
  commits: 5
---

# Phase 83 Plan 02: Workspace Rename & Slug Edit — Client Half Summary

**One-liner:** Governance Edit modal (name-only direct save, slug-change danger confirm with the old slug bold via esc() and type-to-confirm), one-click slugTaken-suggestion adopt, display-only dead-mapping warning card (hidden entirely at zero items, first-colon trail split), and 14 five-locale keys — pinned by 8 new source assertions.

## What Was Built

1. **Rename modal** (commit `3ab0f4c3`): `data-a="govEditAsk"` Edit button on every wsRow (D-02), `govEditBody` modal through the chunk-backed custom host, staged `S.ui.govEditWs {id, name, slug, origSlug}` + `S.ui.govEditSuggest`. `A.govEditSave` computes `slugChanged = slug !== ws.origSlug`: name-only → direct `api.operatorWsRename` + `refreshGovernanceWorkspaces()` + `toast.governanceRenamed`; slug change → the same `run` wrapped in `confirmDlg` with `danger: true`, `typeName: ws.origSlug`, body interpolating `<b>${esc(ws.origSlug)}</b>` (T-83-08, 4660 precedent). D-07: a 409 slugTaken keeps the modal open, stages `res.data.suggestion`, and renders a one-click `govEditAdopt` control.
2. **Dead-mapping warning card** (same commit): `govDeadCard` between the page header and the workspaces sblock, mounted operator-gated; rendered ONLY when the payload carries ≥1 item (D-10, no off-line markup); orphan rows show kind/label/group_guid→workspace_id with `esc()` on EVERY value at first render (T-83-07, Phase 80 watch-item); trail rows split the action string on the FIRST colon only (two chained `split(/:(.*)/s)` peels delta/namespace/guid/reason); zero `data-a` in the card (D-11). Payload fetched inside `refreshGovernanceWorkspaces` via `api.operatorDeadMappings()`, seq-guarded, refusal → `S.ui.govDead = null` (advisory, never an error state).
3. **i18n** (same commit, D-12): 13 `page.governance.*` keys + `toast.governanceRenamed` added to en/fr/nl/de/es; zero new `err.*` (D-04 — rename refusals surface through the existing `tErr` pipeline). data-a pin 572→576.
4. **Client-source assertions** (commit `887bac9e`): 8 new tests in `test/governance-client.test.mjs` — Edit row convention, D-03 fork regex, esc()-bold old slug in the confirm body, suggestion adopt, card escaping + no-mutation-controls, zero-rows hiding, payload-fill wiring, 14-key 5-locale parity + err.* count parity.
5. **Pin maintenance** (commits `e7112dad`, `39bec475`): the tree carries DUPLICATE machine-identifier pins in `test/i18n-shell.test.mjs` and a catalogue-size pin (2016→2030) in `test/i18n-core-features.test.mjs` — both bumped with annotated deltas.
6. **French typography contract** (commit `07ae450a`): U+2019 apostrophes, U+202F before `?`, U+00A0-padded guillemets on the new fr keys per `test/french-typography.test.mjs`.

## Verification (all commands run, all outcomes confirmed)

- `node --test test/i18n-toast.test.mjs test/build-locales.test.mjs test/error-codes.test.mjs`: **pass 43 / fail 0** ✅ (Task 1 gate, incl. data-a/data-v/data-r pins)
- `node --test test/governance-client.test.mjs`: **pass 22 / fail 0** ✅ (14 prior + 8 new)
- `node --test test/french-typography.test.mjs`: **pass 9 / fail 0** ✅
- `npm test` (full suite gate): first run failed at the stale i18n-shell 572 pin → fixed `e7112dad`; second run failed at the stale 2016 catalogue pin → fixed `39bec475`; third run failed at the fr typography lint → fixed `07ae450a`; final run: **tests 2047, pass 2034, fail 0, skipped 13** ✅
- Acceptance greps: `govEditAsk` in governance.js = 2 ✅; `govEditSave` in actions.js = 1 ✅; `confirmRenameTitle` = 1 in each of the 5 locales ✅; `esc(o.label` = 1 in the card ✅; `typeName: ws.origSlug` = 1 ✅; `git diff src/locales/ | grep -c '"err\.'` = 0 ✅

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking pin] Duplicate data-a pin in test/i18n-shell.test.mjs**
- **Found during:** Task 2 full-suite gate
- **Issue:** The plan listed only test/i18n-toast.test.mjs, but the tree carries a second identical machine-identifier count pin in i18n-shell (572) — the full suite is the Task 2 gate.
- **Fix:** bumped to 576 with the same annotated delta.
- **Commit:** e7112dad

**2. [Rule 3 - Blocking pin] En catalogue-size pin 2016→2030 in test/i18n-core-features.test.mjs**
- **Found during:** Task 2 full-suite gate
- **Fix:** +14 annotated delta (D-12 same-commit convention).
- **Commit:** 39bec475

**3. [Rule 1 - Lint contract] French typography on the new fr keys**
- **Found during:** Task 2 full-suite gate (french-typography lint)
- **Issue:** Straight apostrophes / plain space before `?` / unpadded guillemets breach the D-04/D-05 fr.json lint.
- **Fix:** U+2019 / U+202F / U+00A0-padded guillemets.
- **Commit:** 07ae450a

**4. [Sequencing note] Sequential execution on `main`** — per orchestrator instruction (no worktree isolation; Wave 1 committed to main the same way). Branch-safety scaffold assertions were satisfied by the project's direct-to-main convention.

## Auth Gates

None.

## Known Stubs

None — the modal, card, suggestion adopt and all refusals are fully wired against the 83-01 routes.

## Threat Model Compliance

- T-83-07 ✅ esc() at first render on every card value (label/kind/group_guid/workspace_id/guid/reason/delta/ago output) and modal field values; pinned by source assertion
- T-83-08 ✅ old slug bold via esc() in the confirm body; pinned by source assertion
- T-83-09 ✅ no client audit surface added; 83-01 logInfo covers D-06

## Self-Check: PASSED

- Commits 3ab0f4c3, 887bac9e, e7112dad, 39bec475, 07ae450a — all FOUND in git log (b1dcae5a..HEAD)
- src/pages/governance.js, src/actions/actions.js, 5 locale files, 4 test files — all FOUND modified in the commits above
