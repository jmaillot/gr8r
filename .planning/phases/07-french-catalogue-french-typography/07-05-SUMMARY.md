---
phase: 07-french-catalogue-french-typography
plan: 05
subsystem: i18n-catalogue
tags: [i18n, french, catalogue, typography, translation, batch-b]
requires:
  - "07-01: the glossary and the two phase gates (fr-parity.mjs, french-typography lint)"
  - "07-02: the post-billing-removal catalogue shape (settings/act key families already pruned)"
  - "07-04: batch-A conventions in fr.json (en.json key order, fr-only keys kept)"
provides:
  - "French values for every settings.* key (152) in src/locales/fr.json"
  - "French values for every act.* key (137, incl. 11 plural objects) in src/locales/fr.json"
  - "French values for every toast.* (94), modal.* (67) and err.* (63) key in src/locales/fr.json"
  - "Glossary rows for the terms batch B introduced (docs/i18n-fr-glossary.md)"
  - "Locale-aware toast.roleChanged article + role label in src/actions/actions.js"
affects:
  - "07-06: batch C (~231 remaining keys) turns the D-07 completeness gate green"
  - "D-16 read-through: the four deferred English-leak literals listed in deferred-items.md"
tech-stack:
  added: []
  patterns:
    - "namespace-scoped parity gate: scripts/fr-parity.mjs <ns> per batch task"
    - "D-04 typography enforced on write and re-asserted by the merge validator before every write"
    - "positional fragment splicing preserved (deleteProjectBodyHead/Tail, deleteFileBody, purgeTaskBody, removeAccess.their, confirmTypeLead/Tail, duePrefix/startsPrefix)"
key-files:
  created:
    - .planning/phases/07-french-catalogue-french-typography/deferred-items.md
  modified:
    - src/locales/fr.json
    - docs/i18n-fr-glossary.md
    - src/actions/actions.js
decisions:
  - "Post-billing key counts govern, not the plan's estimates: settings 152 (not 196), act 137 (not 144), toast 94 (not 95), err 63 (not 64) — the plan's read-first already said 'translate what remains'"
  - "toast.roleChanged article made locale-aware ('un' under fr — every French role label is masculine) and the role renders via roleLabel(v); en path byte-identical (Rule 2, mitigates an English leak on a French surface)"
  - "Glossary pinned common.later/common.earlier renderings (plus tard / plus tôt) for act.movedByDays's {direction}, which batch C must honour"
  - "toast.moved direction and the delete-project '<b>N task(s)</b>' splice stay English — deferred to deferred-items.md because a fix requires new en keys, forbidden while en.json is the byte-identical regression oracle"
metrics:
  duration: ~50 min
  completed: 2026-10-23
  tasks: 3
status: complete
actuals:
  tokens: 32192
  tasks: 3
  commits: 3
plan_head_before: 0acd32df73095f27bdb27c67d39518a03da5dbef
plan_head_after: 249aa56
---

# Phase 7 Plan 5: Batch B — settings/act/toast/modal/err namespaces Summary

All 513 post-billing batch-B keys now carry typography-compliant French values in
`src/locales/fr.json` (1,219 keys total) — the settings page, the action module's confirm
dialogs, the toasts, the modals and the error copy render French under the D-04 rules;
English output untouched.

## Completed Tasks

1. **Task 1 — Translate the settings namespace (152 keys).** Every surviving `settings.*` key
   received a French value under the glossary register (vous, sentence case, terse button
   labels, no trailing punctuation the English lacks). Placeholders kept name-for-name;
   identical-value keys present (`1/10`, `10/1`, `2026-10-01`, `Compact`, `Indigo`, `Rose`,
   `Graphite`); `settings.datetime.preview` carries U+00A0 before its colon; the 8:00 digest
   time and ISO dates ride the lint's exemptions. The glossary gained the lot-B settings rows
   (add-only). Gates: `fr-parity.mjs settings` exit 0 (152/152), typography lint 9/9, the five
   suites that actually assert settings strings 77/77. Commit **5d11aaa**.

2. **Task 2 — Translate the act namespace (137 keys).** Every surviving `act.*` key received
   a French value: 11 plural objects (one/other), confirm titles with U+202F before `?`
   («Supprimer la tâche ?»), imperative buttons, and the positional fragments spliced around
   interpolated HTML preserved (`deleteProjectBodyHead/Tail`, `deleteFileBody`,
   `deleteFileBodyTask`, `purgeTaskBody`, `removeAccess.their`, `confirmTypeLead/Tail` via
   modal keys). `act.movedByDays`'s `{direction}` resolves through `common.later`/`common.earlier`
   (already `t()`-aware at the call site); the glossary pins their French renderings for batch C.
   Gates: `fr-parity.mjs act` exit 0 (137/137), typography 9/9, `i18n-actions-modules` 13/13.
   Commit **961cbfd**.

3. **Task 3 — Translate the toast, modal and err namespaces (224 keys).** Toasts are one-line
   French sentences (guillemets padded with U+00A0 around interpolated titles, `…` ellipsis,
   `{name}\u00A0: {perm}`), modal titles sentence-case, error copy states what went wrong
   without blaming the user. One Rule-2 code fix: `toast.roleChanged` previously interpolated
   a hardcoded English article (`'an'`/`'a'`) and the raw stored role id, so the French toast
   would have rendered "est maintenant an Admin" — the article is now locale-aware (`'un'`,
   every French role label being masculine) and the role renders through `roleLabel(v)`; the
   English path is byte-identical. Gates: `fr-parity.mjs toast modal err` exit 0, full
   batch-B parity `settings act toast modal err` exit 0 (513/513), typography 9/9,
   `i18n-toast` + `i18n-modal` + `i18n-actions-modules` 27/27. Commit **249aa56**.

## Verification

- `node scripts/fr-parity.mjs settings act toast modal err` — exit 0 (all five namespaces complete).
- `node --test test/french-typography.test.mjs` — 9/9 green over the whole fr.json.
- English regression: `i18n-prefs` + `i18n-dates` + `i18n-locale` + `i18n-core-features` +
  `i18n-overlays` 77/77; `i18n-actions-modules` 13/13; `i18n-toast` + `i18n-modal` 27/27; the
  full 13-suite i18n sweep 225/225.
- `git diff --stat -- src/locales/en.json` — 0 across all three commits (T-07-12 mitigated).
- `node --test test/catalogue.test.mjs` — 25/26; the single failure is the by-design D-07
  completeness gate, RED for batch C's remaining 231 keys — exactly the state the plan's
  verification section declares.
- fr.json: 1,219 keys, valid JSON, 2-space indent, shared-key order mirrors en.json, the
  fr-only `contract.frenchOnly` key preserved.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking reference] `test/i18n-settings.test.mjs` does not exist**
- **Found during:** Task 1 (verify step)
- **Issue:** The plan's verify command names a dedicated settings regression file that is not
  in the repo; settings assertions live inside other i18n suites.
- **Fix:** Ran the five real suites carrying `settings.*` assertions (i18n-prefs, i18n-dates,
  i18n-locale, i18n-core-features, i18n-overlays) — 77/77 green.
- **Files modified:** none (test-selection only)

**2. [Rule 2 - Missing critical functionality] Locale-aware `toast.roleChanged` article/role**
- **Found during:** Task 3 (call-site check)
- **Issue:** `src/actions/actions.js` interpolated a hardcoded English article
  (`v === 'Admin' … ? 'an' : 'a'`) and the raw stored role id into `toast.roleChanged`; with
  French values the toast would render "Bob est maintenant an Owner" — an English string on a
  product surface under `fr`, violating the plan's own prohibition.
- **Fix:** Article computed locale-aware via `getLocale()` (`'un'` — all French role labels
  are masculine), role rendered through the existing `roleLabel()` display helper (D-06
  pattern; English labels equal stored ids, so the en path is byte-identical).
- **Files modified:** src/actions/actions.js
- **Commit:** 249aa56

**3. [Process note] Commits on `main`**
- The orchestrator dispatched this executor as SEQUENTIAL on the main working tree, and plans
  07-01…07-04 committed to `main` the same way; recorded for the audit trail, as in 07-04.

### Count reconciliation

The plan's key counts (196/144/95/67/64 = 566) predate plan 07-02's billing removal; the
post-removal catalogue carries 152/137/94/67/63 = 513. The plan's read-first instructions
already anticipated this ("translate what remains"); all five namespaces are complete against
the live en.json.

## English-value notes (no en.json edits made)

- `modal.duePrefix`/`modal.startsPrefix` keep their trailing spaces (prefix fragments).
- `modal.projectLead`/`modal.uploadedBy` keep their leading `· ` marker.
- `toast.demoMoved` keeps the English demo task title inside French guillemets (D15: seed
  content stays English) and uses the French status label.
- `err.code404`/`err.code403` translate to `ERREUR 404`/`ERREUR 403`.
- Four raw-English splices on French surfaces could not be fixed without new en keys — logged
  to `deferred-items.md` in the phase directory (toast.moved 'up'/'down', the delete-project
  `<b>N task(s)</b>` literal, the remove-access "will become unassigned." tail, and the
  `modal.guestsHint` article-less splice).

## Threat surface

No new surface: this plan writes catalogue data plus one display-path fix in actions.js (no
new endpoint, no trust-boundary change). T-07-11 (markup in a French value) is mitigated by
the catalogue contract lint plus the typography lint and the merge validator, all green;
T-07-12 (silent English regression) is mitigated by the untouched-en.json diff check, green.

## Known Stubs

None — no stubs, placeholders or TODOs were introduced; every value is a complete translation.

## Self-Check: PASSED

- `src/locales/fr.json` — 1,219 keys, valid JSON, order verified. FOUND.
- `docs/i18n-fr-glossary.md` — lot-B sections present. FOUND.
- `.planning/phases/07-french-catalogue-french-typography/deferred-items.md` — FOUND.
- Commit 5d11aaa (Task 1) — FOUND. Commit 961cbfd (Task 2) — FOUND. Commit 249aa56 (Task 3) — FOUND.
- Commits measured from the plan ledger (`0acd32d..249aa56`): 3 code commits; the plan's docs
  commit (this SUMMARY + STATE.md) follows immediately and is the fourth.
