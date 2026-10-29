---
phase: 07-french-catalogue-french-typography
plan: 06
subsystem: i18n-catalogue
tags: [i18n, french, catalogue, translation, batch-c, completeness]
requires:
  - "07-01: the glossary and the two phase gates (fr-parity.mjs, french-typography lint, D-07 completeness test)"
  - "07-02/07-03: the post-billing catalogue shape (the surviving keys of the shared namespaces)"
  - "07-04/07-05: batch-A/B conventions in fr.json (en.json key order, glossary register)"
provides:
  - "French values for every remaining catalogue key — fr.json carries 1,449 keys, 100% en→fr parity"
  - "the first GREEN run of the D-07 completeness test (test/catalogue.test.mjs 26/26)"
  - "Glossary rows for the terms batch C introduced (lot C, add-only)"
  - "A sounder build-marker heuristic in test/build-locales.test.mjs (substring exclusion)"
affects:
  - "D-16 read-through: the French app is now fully translatable for the user's review"
  - "future locale catalogues: the completeness contract now proves the fr.json pattern"
tech-stack:
  added: []
  patterns:
    - "merge-in-en-order: new batch values written by walking en.json's key order, so the fr shared-key order invariant holds mechanically"
    - "marker soundness: a marker must not be a substring of the other catalogue's text"
key-files:
  created: []
  modified:
    - src/locales/fr.json
    - docs/i18n-fr-glossary.md
    - test/build-locales.test.mjs
decisions:
  - "Actual batch size 229 keys, not the plan's ~180: the plan's counts predate the billing removal (settings/act already pruned); read-first said translate what remains"
  - "No many member added to file.count: test/i18n.test.mjs pins 'the French catalogue has no many member for this key' (a million falls back to other) — the plan's flagged assumption resolves to 'leave it'; task.count already carries its many member"
  - "unit.* renders the French unit symbols o/Ko/Mo (octet convention), not B/KB/MB"
  - "Role descriptions (popover.roleDesc*) render in the third person (« Gère… », « Ne voit que… ») — recorded as a glossary row"
metrics:
  duration: ~35 min
  completed: 2026-10-23
  tasks: 3
status: complete
actuals:
  tokens: 39000
  tasks: 3
  commits: 3
plan_head_before: 79e8cceae40a2f9f668d22e4dbb3886503f1c4b5
plan_head_after: ef2fb70ba5b80cec4eac07c097217ce3c04cb6a3
---

# Phase 7 Plan 6: Batch C — the shared namespaces reach 100% parity Summary

The last 230 catalogue keys now carry French values in `src/locales/fr.json`
(1,449 keys total) — the D-07 en→fr completeness gate in `test/catalogue.test.mjs`
is GREEN for the first time, the whole catalogue passes the D-04 typography lint,
and the full npm test suite (362 tests) passes with `en.json` byte-identical.

## Completed Tasks

1. **Task 1 — Translate the shared UI namespaces (229 keys).** palette (42),
   popover (39), common (41), nav (40), task (19), sort (14), perm (8), file (8),
   filter (4), bucket (4), member (2), unit (3), project (5). The stored-vocabulary
   keys follow the glossary oracles exactly (À faire / En cours / À valider /
   Terminé; Urgente…Basse; Propriétaire/Admin/Membre/Invité; Peut voir / Peut
   commenter / Peut modifier / Accès complet). New values were merged by walking
   `en.json`'s key order, so the fr shared-key order invariant holds mechanically
   (git diff: 229 pure insertions, zero reordered lines). The glossary gained the
   lot-C rows (add-only). Gates: `fr-parity.mjs` on the 13 namespaces exit 0,
   typography lint 9/9, vocabulary oracles 15/15, i18n sweep 215/215. Commit
   **6ac00ac**.

2. **Task 2 — The straggler: app.name — parity reaches 100%.** `app.name` carries
   the identical value `Projects Studio` (D-07: identical values are present, never
   omitted). `fr-parity.mjs` over every namespace of the catalogue exits 0, and
   the D-07 completeness test passes for the first time (catalogue.test.mjs
   26/26, including the key-order and fr-only-key guards). Commit **7e9da13**.

3. **Task 3 — The full-suite green proof.** Completeness 26/26 and typography
   9/9 as their own commands; full `npm test` 362/362 after one Rule-1 fix to
   the build-marker heuristic (see deviations); `git diff` over `en.json` across
   the whole plan is empty (T-07-15 mitigated). Recorded for the SUMMARY: 1,449
   French keys, 18 plural objects (every one carrying one+other; `task.count`
   also its `many` member for the French million), and 73 keys whose values are
   deliberately identical in both languages (Projects Studio, Ctrl, PDF, Figma,
   Frontend, QA, size names, token names…). Commit **ef2fb70**.

## Verification

- `node scripts/fr-parity.mjs <all 26 namespaces>` — exit 0 (zero missing across
  the whole catalogue; the script requires at least one namespace argument, so the
  plan's no-filter form was realised by passing every namespace en.json carries).
- `node --test test/catalogue.test.mjs` — 26/26 GREEN, first time (the D-07 block).
- `node --test test/french-typography.test.mjs` — 9/9 over all 1,449 values.
- `node --test test/i18n-vocab.test.mjs` — 15/15 (stored ids unchanged, display
  via the catalogue).
- `npm test` — 362/362.
- `git diff --stat -- src/locales/en.json` — 0 across all three commits.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] build-locales marker heuristic accepted a marker that rides
an English sentence**
- **Found during:** Task 3 (full npm suite)
- **Issue:** `markersOf()` excluded the other catalogue's values only by exact
  equality. The new French value `Acquisition` (`task.label.growth`, glossary-
  pinned) is a substring of the English string `a11y.teamDescExample`
  (« e.g. Acquisition experiments and lifecycle email »), so the en-only build
  legitimately carried it and the "an English-only build carries no French byte
  at all" assertion failed.
- **Fix:** A marker embedded in the other catalogue's text rides the bundle
  whatever the catalogue does, so `markersOf` now rejects values that are
  substrings of the other catalogue's joined text — symmetrically for the French
  and English marker sets. This strengthens the marker contract ("a marker must
  be able to prove something") rather than weakening the assertion.
- **Files modified:** test/build-locales.test.mjs
- **Commit:** ef2fb70

### Count reconciliation

The plan estimated ~180 keys for Task 1 and ~236 total; the actual catalogue
carries 229 + 1 = 230 remaining keys after the billing removal and batches A/B.
The read-first instructions anticipated this ("translate what remains"); all
namespaces are complete against the live en.json.

### Flagged assumption resolved

`task.count`/`file.count` many-member question: `task.count` already carries its
`many` member (« de {n} tâches ») from an earlier batch. `file.count` deliberately
has none — `test/i18n.test.mjs` pins `t('file.count', {n: 1000000})` →
« 1000000 fichiers » ("the French catalogue has no many member for this key");
adding one would break that pinned behaviour. No plural object was touched.

## English-value notes (no en.json edits made)

- `common.youSuffix` keeps its leading space (« (vous) »), `common.plusEnter`
  keeps its leading `+` (« +Entrée »).
- `unit.*` renders the French symbols o / Ko / Mo.
- `common.justNow`, `common.later`, `common.earlier` stay lowercase (they splice
  into sentences), honouring the glossary pin of plus tard / plus tôt.
- `palette.viewAllResults` renders French guillemets with U+00A0 padding around
  `{q}` where English uses curly quotes.

## Threat surface

No new surface: catalogue data only, plus a test-heuristic fix. T-07-13 (markup
in a shared-namespace value) mitigated by the catalogue contract lint, the
typography lint and the merge validator, all green; T-07-14 (plural objects)
mitigated by the D-07 one+other assertion, green (18/18 objects carry other);
T-07-15 (silent English change) mitigated by the empty en.json diff, green.

## Known Stubs

None — no stubs, placeholders or TODOs were introduced; every value is a
complete translation. The four raw-English splices deferred in
`deferred-items.md` by plan 07-05 remain open there (they need new en keys, out
of this plan's scope).

## Self-Check: PASSED

- `src/locales/fr.json` — 1,449 keys, valid JSON, valid French, order verified. FOUND.
- `docs/i18n-fr-glossary.md` — lot-C section present. FOUND.
- Commit 6ac00ac (Task 1) — FOUND. Commit 7e9da13 (Task 2) — FOUND. Commit
  ef2fb70 (Task 3) — FOUND.
- Commits measured from the plan ledger (`79e8cce..ef2fb70`): 3 code commits;
  the plan's docs commit (this SUMMARY + STATE.md) follows immediately and is
  the fourth.
