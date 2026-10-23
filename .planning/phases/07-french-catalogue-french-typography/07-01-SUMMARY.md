# Plan 07-01 — The selector reaches French, the two translation gates, and the glossary

**Phase:** 7 — French catalogue & French typography
**Status:** COMPLETE
**Commits:** feat(07-01): the selector switches to French; test(07-01): the typography lint, the RED completeness test and the parity device; docs(07-01): the glossary and the corrected I18N-05 wording

## What this plan built

1. **The selector path end to end (Task 1).** `src/core/theme.js` resolves the stored
   `prefs.lang` display label through the throwaway `LANG_TO_LOCALE` map (`Français → fr`,
   anything else → `en`) and calls `setLocale()` only when the code differs — the loop guard,
   because `setLocale` dispatches `gr8r:locale` unconditionally and `applyPrefs` runs at the top
   of every render. `src/core/i18n.js`'s `setLocale()` now assigns
   `document.documentElement.lang` inside the existing document guard (D-02), and `src/main.js`
   dropped its hardcoded `lang="en"` and registers one boot listener that re-renders on
   `gr8r:locale`. The six seed values in `src/locales/fr.json` are typography-compliant:
   `greeting.hello` carries U+202F before `!`, `task.count.many` is `de {n} tâches`, and every
   value is NFC.

2. **The two translation gates (Task 2).** `test/french-typography.test.mjs` lints every value
   of `src/locales/fr.json` — strings and every plural member — against the D-04 rules: no plain
   space before `; ! ?` (U+202F required), no plain or narrow space before `:` (U+00A0 required),
   no straight apostrophe (U+2019), no three-dot ellipsis (U+2026), no unpadded guillemet
   (U+00A0 on both sides), and no decomposed accents (NFC). The exemptions — a time `14:30`, an
   ISO date, a URL — are stripped from the value before the punctuation rules run, never skipped
   wholesale. It is GREEN on the seed values. The D-07 completeness block in
   `test/catalogue.test.mjs` requires a non-empty French value (or a `one`+`other` plural) for
   every English key outside `contract.*`, forbids fr-only keys outside that namespace, and
   pins the fr key order to en's — and it is RED BY DESIGN, naming exactly the 1 440 untranslated
   keys, with a comment forbidding any weakening of the assertion. `scripts/fr-parity.mjs` gates
   the same contract per namespace (dotted prefixes allowed) for the batch plans: exit 0 and no
   output when the listed namespaces are complete, a named key list and exit 1 otherwise.

3. **The glossary and the corrected requirement (Task 3).** `docs/i18n-fr-glossary.md` fixes the
   register (vous, sentence case, no middle-dot forms, French-France conventions), the D-04
   codepoints, a French term for every stored vocabulary oracle of `test/i18n-vocab.test.mjs`
   (task statuses, priorities, roles, permissions, recurrence), the recurring product nouns and
   verbs, and the note that identical-in-both-languages values stay present, never omitted.
   `.planning/REQUIREMENTS.md` I18N-05 now states the authoritative D-04 wording — U+00A0 before
   `:`, U+202F before `; ! ?`, U+00A0 inside guillemets, the curly apostrophe, the ellipsis and
   NFC — the same correction the plan mandates.

## Verification

- `node --test test/i18n-locale.test.mjs` — 9/9 green: the mapping, the loop guard, the html
  `lang` attribute, the single listener, French catalogue resolution, the many plural, and the
  switch back to English.
- `node --test test/french-typography.test.mjs` — 9/9 green: every rule fires on a synthetic
  breach and stays silent on its compliant form, and the live seed catalogue is clean.
- `node --test test/catalogue.test.mjs` — 25/26 green; the single failure is the D-07
  completeness test, RED by design with exactly **1 440** named `missing French value` keys.
- `node scripts/fr-parity.mjs nav.projects greeting.hello settings.language.title task.count
  file.count` — exit 0, silent; the same script over a full namespace reports its gaps and
  exits 1, ready for the batch plans.
- `npm test` — **355 pass / 1 fail**, the only failure being the intentionally-RED completeness
  gate. 356 total tests across the suites, no regressions from the selector wiring.
- `npm run lint` and `npm run format:check` — clean after prettier on the touched test files.

## Deviations

None in substance. One execution note: the executor's Task 3 commit landed without the two
Task 3 files (the glossary and the REQUIREMENTS.md correction) — the orchestrator closed the
gap inline before advancing: `docs/i18n-fr-glossary.md` was written (prettier-formatted) and
`.planning/REQUIREMENTS.md` I18N-05 was corrected to the authoritative D-04 wording, in the
`fix(07-01)` commit that follows this summary. The plan's done criteria are met exactly; the
only deliberate RED is the one the plan itself prescribes (the completeness test until 07-06
finishes the batches).
