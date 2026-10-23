# Plan 07-03: Stored Vocabulary Families → Catalogue (D-10/D-11/D-12)

The three stored-vocabulary families the app renders in English — project templates,
notification fragments, task estimates — became catalogue-backed display. The French
batches now translate a stable catalogue: no French value will ever be written for
stored English prose.

## Completed Tasks

1. **Project templates become catalogue data (D-10).** `TEMPLATES` in
   `src/overlays/modals.js` now carries only `{ id, icon, tasks: <count> }` — ids stay the
   stored wire value, all English text moved to `project.template.<id>.name` /
   `.desc` / `.task.<n>` (47 keys). The template picker renders through `t()`; the
   variable-shadowing locals (`t` inside the map, the two team `<option>` maps) were renamed
   so the catalogue `t()` stays reachable. `createProject()` stores the locale-rendered
   title at creation (`project.template.<id>.task.<i>`); hand-created tasks untouched, no
   migration. Onboarding (`A.onbSet`, the ready summary) renders the translated name with
   the deliberate 'Website Launch' exception preserved. `src/pages/auth.js` renders the
   translated template names with `common.starterTasks` plurals. The `TEMPLATE_ORACLE` in
   `test/i18n-vocab.test.mjs` pins every name, desc and title against the en value and
   asserts the array carries no English text; a French presence check enforces the curly
   apostrophe.

2. **Notifications become structured data (D-12).** The ten seed notif rows carry
   `{ type, by, task/project, snippet, at, read }` — the stored English fragments
   (`text:`) are gone; `n5`/`n9`/`n10` gained a `status` field where the fragment
   interpolated one. `notifText()` in `src/pages/inbox.js` composes the sentence through
   `notif.mention / .assign / .comment / .update ({status})` plus the actor-less
   `notif.projectAtRisk` / `notif.taskDueToday` keys, keeping the existing bold/muted
   markup; a legacy row still carrying `text` renders verbatim (the branch is preserved
   and pinned). Snippets stay English demo content (D15). The vocab test pins the
   structured kinds and the legacy-verbatim branch against live store fixtures.

3. **Display-only estimate formatter (D-11).** `fmtEstimate()` in `src/core/i18n.js`
   parses the stored ASCII form (`30m`/`2h`/`2d`), returns it unchanged in English, and
   renders `30 min` / `2 h` / `2 j` in French (`estimate.minutes/hours/days` keys);
   empty or unparseable input returns unchanged. The three display sites wrap it — the
   drawer estimate pill, the popover estimate option names, and the table estimate cell
   (desktop + mobile panels). The table editing input and form inputs keep the raw
   ASCII value. No storage change; pinned in `test/i18n-format.test.mjs`.

## Supporting work

- `test/virtual-icons-loader.mjs` — a Node module loader stubbing the Vite-generated
  `virtual:icons` module so the plain-Node test runner can import overlay/page modules;
  the DOM-touching core modules run their setup at import time, so `document`/`window`
  globals are stubbed before the dynamic imports in `test/i18n-vocab.test.mjs`.
- `test/catalogue.test.mjs` — the D-05 key-shape rule now accepts purely numeric key
  segments (ordered lists, `project.template.*.task.1`); `nav.1projects` is still rejected.
- `test/i18n-core-features.test.mjs` — the catalogue count updated to 1 449 keys.
- `test/i18n-dates.test.mjs` — the pinned `popovers.js` import line updated for
  `fmtEstimate`.

## Verification

- `node --test test/i18n-vocab.test.mjs` — 15/15 green (the oracle pins the template
  family, the French typography, the structured/legacy notification rendering).
- `node --test test/i18n-format.test.mjs` — 27/27 green (the fmtEstimate branches,
  including the French render and the raw-ASCII round-trip).
- `npm test` — **361 pass / 1 fail**; the single failure is the D-07 completeness gate,
  RED by design until 07-06 finishes the batches.
- `npm run lint` — clean. `npm run format:check` — clean. `npm run build` — compiles clean.

## Deviations

None in substance. Two notes: the plan estimated 42 starter task titles; the real
`TEMPLATES` array carries 33 (counted from the source — the plan's 42 included the
template descriptions in its arithmetic). The numeric key-segment extension of the D-05
key-shape rule was needed because the plan's own `project.template.<id>.task.<n>` naming
breaches the letter-first-segment regex the lint enforced.
