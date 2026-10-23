# Deferred items — phase 07 (found during plan 07-05 execution)

Raw English literals that render on French surfaces. Fixing any of them requires either a
new English catalogue key (forbidden in this plan: en.json must stay byte-identical) or a
source restructuring beyond plan 07-05's catalogue-only scope. Logged here for the phase's
read-through (D-16) and for the batch-C / phase-11 i18n-scan work.

1. `src/actions/actions.js:477` — `toast.moved` receives `direction: d < 0 ? 'up' : 'down'`
   as a raw literal. Under `fr` the toast renders "«name» déplacé (up)". A proper fix needs
   locale-aware direction words (catalogue keys), which this plan cannot add.

2. `src/actions/actions.js:1451` — the delete-project confirm body splices a raw
   `<b>${n} task${n === 1 ? '' : 's'}</b>` between `act.deleteProjectBodyHead` and
   `act.deleteProjectBodyTail`. Under `fr` the bold count renders "3 tasks" inside an
   otherwise French sentence.

3. `src/actions/actions.js:1837` — after `act.removeAccess.their` + the bold
   `act.removeAccess.openTasks` count, the template carries a raw ` will become unassigned.`
   literal. Under `fr` the sentence ends in English.

4. `modal.guestsHint` splice grammar: the hint renders after a bold `Invités` label
   (`<b>Invités</b> ne voient que…`), so the French sentence lacks its article. Cosmetic;
   a fix belongs to a restructuring of the modal copy, not to the catalogue value alone.

None of these block plan 07-05's gates: the batch-B namespaces are complete, typography and
the English regressions are green, and the D-07 completeness gate remains RED by design for
batch C only.
