---
phase: 07-french-catalogue-french-typography
plan: 04
subsystem: i18n-catalogue
tags: [i18n, french, catalogue, typography, a11y, translation]
requires:
  - "07-01: the glossary and the two phase gates (fr-parity.mjs, french-typography lint)"
  - "07-03: the frozen catalogue shape (1 449 en keys; no stored English prose left to translate)"
provides:
  - "French values for every page.* key (512) in src/locales/fr.json"
  - "French values for every a11y.* key (132) in src/locales/fr.json"
  - "Glossary rows for the terms batch A introduced (docs/i18n-fr-glossary.md)"
affects:
  - "07-05: next translation batches build on the same fr.json"
  - "07-06: the D-07 completeness gate turns green when the last batch lands"
tech-stack:
  added: []
  patterns:
    - "namespace-scoped parity gate: scripts/fr-parity.mjs <ns> per batch task"
    - "D-04 typography enforced on write: U+00A0 before ':', U+202F before '; ! ?', padded guillemets, U+2019, U+2026, NFC"
    - "en.json untouched — the English output stays the regression oracle"
key-files:
  created: []
  modified:
    - src/locales/fr.json
    - docs/i18n-fr-glossary.md
decisions:
  - "Terminology for batch A fixed in the glossary add-only: système de design, token, vue enregistrée, échéance, en retard, jalon, boîte de réception, barre latérale, panneau latéral, fil d'Ariane, sous-tâche, équipe, wireframe, passation, grille, e-mail"
  - "a11y strings stay terse and noun-first; keyboard labels localized (Esc → Échap, Enter → Entrée); no trailing punctuation added where the English has none"
  - "Identical-value keys kept present, never omitted (Projects, Projects Studio, 2-10/11-50/51-200/200+, s)"
  - "English fragments with dangling punctuation preserved positionally (page.deniedPrivate, page.auth.resetExpires, page.auth.verifyClick, the two tip strings with bare key hints)"
metrics:
  duration: ~34 min
  completed: 2026-10-23
  tasks: 3
status: complete
actuals:
  tokens: 9751
  tasks: 3
  commits: 2
plan_head_before: 20047b83ebd7843feba948e5fcd18897c0f99e7e
plan_head_after: c4390056a79f2b17b16e60a587abbb257d22c10b
---

# Phase 7 Plan 4: Batch A — page + a11y namespaces Summary

All 644 page.* and a11y.* English keys now carry typography-compliant French values in
`src/locales/fr.json` (707 keys total), gated by the phase-7 parity script and the D-04
typography lint; English output untouched.

## Completed Tasks

1. **Task 1 — Translate the page namespace (512 keys).** Every `page.*` key received a French
   value under the glossary register (vous, sentence case, lowercase months, decimal comma).
   Placeholders kept name-for-name including the one plural object (`page.auth.invitesSent`:
   one/other). Identical-value keys written verbatim (`Projects Studio`, `2-10`, `s`). The glossary
   gained a lot-A section (add-only). Gates: `fr-parity.mjs page` exit 0 (512/512), typography
   lint 9/9, `i18n-pages` 13/13. Commit **7e9108c**.

2. **Task 2 — Translate the a11y namespace (132 keys).** Every `a11y.*` key received a terse,
   noun-first French value; keyboard hints localized (Échap, Entrée) with the English spacing
   structure preserved (double-space key hints, the dangling `[` in `collapseSidebarTip`).
   Gates: `fr-parity.mjs a11y` exit 0 (132/132), typography lint 9/9, and the five regression
   files that actually assert a11y strings — `i18n-shell` 18/18, `i18n-overlays` 15/15,
   `i18n-ui-helpers` 15/15, `i18n-pages` 13/13, `i18n-core-features` 14/14. Commit **c439005**.

3. **Task 3 — Batch-A regression sweep.** `fr-parity.mjs page a11y` exit 0; 84/84 tests green
   across the six i18n regression files plus the typography lint; `git diff` on
   `src/locales/en.json` empty both in the working tree and across both commits. The catalogue
   contract test now reports 25/26 with the single failure being the D-07 completeness gate,
   RED by design until plan 07-06 finishes the remaining namespaces — exactly the state the
   plan's verification section declares.

## Verification

- `node scripts/fr-parity.mjs page a11y` — exit 0, no output (both namespaces complete).
- `node --test test/french-typography.test.mjs` — 9/9 green over the whole fr.json.
- `node --test test/i18n-pages.test.mjs test/i18n-shell.test.mjs test/i18n-overlays.test.mjs test/i18n-ui-helpers.test.mjs test/i18n-core-features.test.mjs` — 75/75 green.
- `git diff --stat -- src/locales/en.json | wc -l` — 0 (English untouched; T-07-10 mitigated).
- `node --test test/catalogue.test.mjs` — 25/26; the one failure is the by-design D-07 gate.
- fr.json: 707 keys, valid JSON, 2-space indent, shared-key order mirrors en.json (the writer
  asserts order, placeholder parity and typography before writing).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking reference] `test/i18n-a11y.test.mjs` does not exist**
- **Found during:** Task 2 (read-first step)
- **Issue:** The plan's verify command names a dedicated a11y regression file that is not in the
  repo; a11y assertions live inside other i18n suites.
- **Fix:** Located the assertion files with the same grep the plan prescribes and ran the five
  real suites (shell, overlays, ui-helpers, pages, core-features) — all green.
- **Files modified:** none (test-selection only)

**2. [Process note] Commits on `main`**
- The orchestrator dispatched this executor as SEQUENTIAL on the main working tree with
  `use_worktrees: false`, and plans 07-01…07-03 committed to `main` the same way. The executor's
  generic protected-branch guard was consciously overridden by that instruction; recorded here
  for the audit trail.

**3. [Sequencing note]** The Task 2 glossary section (a11y terms, Esc/Entrée rows) was written in
the single glossary edit that landed with the Task 1 commit; Task 2 needed no further glossary
change.

## English-value notes (no en.json edits made)

- `a11y.collapseSidebarTip` = `"Collapse sidebar  ["` — a dangling `[` with no closing bracket;
  preserved verbatim in French (likely a truncated keyboard-hint string).
- `a11y.newProjectTip` = `"New project  P"`, `a11y.closeTip` = `"Close  Esc"` — bare key hints;
  French keeps the same shape (double space + key).
- `page.states.noResultsBody` quotes `“brand guidlines”` (sic) — the typo is demo search data;
  kept as-is inside French guillemets.
- `page.deniedPrivate` (`"is a private project. "`), `page.auth.resetExpires`,
  `page.auth.verifyClick` — concatenation fragments with leading/trailing spaces and periods;
  French preserves the positional splice.

## Threat surface

No new surface: this plan writes catalogue data only. T-07-09 (markup in a French value) is
mitigated by the catalogue contract lint (no `<`, `>`, `"`) plus the typography lint, both green;
T-07-10 (silent English regression) is mitigated by the untouched-en.json diff check, green.

## Known Stubs

None — no stubs, placeholders or TODOs were introduced; every value is a complete translation.

## Self-Check: PASSED

- `src/locales/fr.json` — 707 keys, valid JSON, order verified. FOUND.
- `docs/i18n-fr-glossary.md` — lot-A sections present. FOUND.
- Commit 7e9108c (Task 1) — FOUND. Commit c439005 (Task 2) — FOUND.
- Commits measured from the plan ledger (`20047b8..c439005`): 2 code commits; the plan's docs
  commit (this SUMMARY + STATE.md) follows immediately and is the third.
