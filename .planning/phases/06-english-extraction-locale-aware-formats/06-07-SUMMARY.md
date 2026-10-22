---
phase: 06-english-extraction-locale-aware-formats
plan: 07
subsystem: ui
tags: [i18n, catalogue, toast, extraction, intl-pluralrules, tdd]

# Dependency graph
requires:
  - phase: 05-i18n-foundation-catalogue-contract
    provides: the t() leaf layer — non-escaping lookup, {name}/{n} interpolation, the catalogue lint
  - phase: 06-05
    provides: the shrinking allow-list device (test/fixtures/i18n-pending.json) and the static scanner (scripts/i18n-scan.mjs)
  - phase: 06-06
    provides: the plural engine's consumer side, the shadowing discipline (rename the local or alias the import), the green scan baseline (1950 literals, 1689 allow-list entries)
provides:
  - 107 new toast.* / err.* values in src/locales/en.json — the toast messages and the toast action-button labels of the action surface
  - the whole toast surface of src/actions/actions.js reads the catalogue: every toast() message, the messages copy() and enterApp() carry, applyPatch's recurring-task message, and the 18 `action:` labels — the scanner reports no ruleToast finding for the file
  - test/i18n-toast.test.mjs — the toast contract: the English oracle (byte-identical rendering), the absence of the extracted literals, the uniqueness of the wave's values, the machine-identifier pins and the allow-list hygiene
  - an allow-list shrunk by 97 entries (1689 → 1592), still sorted; scan green at 1818 literals, 0 violations
affects: [06-11 modal-and-a11y-half of actions.js, 06-12+ remaining sweeps, phase-7 french translation]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 7200    # 28796 chars / 4 over the realized diff (4 files)
  tasks: 3
  commits: 5

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sink-side escaping discipline: an interpolated toast value travels RAW because toast() escapes the whole message with esc(msg) at its own boundary (D-07) — escaping at the call site too would render &amp; in the toast"
    - "shadowing discipline extended: eight more locals named t renamed tk, plus one TDZ case (a toast referenced t before the const declaration in the same block) and applyPatch's parameter t handled by importing the lookup a second time as tMsg — every t() call verified import-resolved at AST level (acorn scope walk)"
    - "hard-coded plural spelling stays: count toasts that always wrote 'tasks' become plain {n} values, not plural objects — a plural object would change the English at n = 1 and the wave is behaviour-preserving"

key-files:
  created:
    - test/i18n-toast.test.mjs
  modified:
    - src/actions/actions.js
    - src/locales/en.json
    - test/fixtures/i18n-pending.json

key-decisions:
  - "The toast surface is the toast() call sites PLUS the shared helpers the messages flow through: copy()'s message parameter (its default and six call sites) and enterApp()'s argument (six call sites) are toast messages, and applyPatch's recurring-task message reaches toast() via updateTask's msgs — all swept"
  - "Count toasts stay plain {n} values ('Marked {n} tasks as done'): the source hard-coded the plural form, so converting to a CLDR plural object would render 'Marked 1 task as done' where today renders 'Marked 1 tasks as done' — byte-identical English is the hard gate"
  - "The role-changed message carries the article as a var ({name} is now {article} {role}) because the two call sites compute an/a differently ('Admin'||'Owner' vs 'Admin' only) and byte-identical rendering must preserve each site's own grammar"
  - "The 'the owner' fallback name is hoisted to a lowercase const before the t() call: a literal inside a display-named var property ({name: … || 'the owner'}) is a scanner finding; the same literal on a plain const is not"
  - "A literal that belongs to the modal half stays in the source AND in the allow-list even when the identical text left the toast surface ('Could not create the workspace' feeds both a toast and a form error) — removal was driven mechanically by the scanner, never by the wave's own list"

patterns-established:
  - "Extraction ledger pattern: the RED test carries the wave's full text list (GONE), so a missed call site fails the suite before the GREEN commit — two missed pairs were caught exactly this way"
  - "Verification recipe for a swept file: node scripts/i18n-scan.mjs (0 unlisted / 0 stale), the scanSource-based absence test, the acorn scope walk proving no t() call resolves to a shadowed binding, and the tree-wide data-a/data-r/data-v counts pinned at 438/58/76"

requirements-completed: []  # I18N-01 stays Pending until phase close (orchestrator instruction) — this plan delivers its toast-surface slice

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "The toast messages of src/actions/actions.js read the catalogue: 100+ message sites (toast(), copy(), enterApp(), applyPatch's msgs) with 104 message values"
    requirement: I18N-01
    verification:
      - kind: unit
        ref: "test/i18n-toast.test.mjs#every toast message of the action surface renders its previous English exactly"
        status: pass
      - kind: unit
        ref: "test/i18n-toast.test.mjs#no extracted toast literal survives as a finding in src/actions/actions.js"
        status: pass
      - kind: other
        ref: "node scripts/i18n-scan.mjs → 1818 literals, 1818 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch"
        status: pass
    human_judgment: false
  - id: D2
    description: "The toast options' action-button labels read the catalogue (toast.undo / toast.open / toast.tryAgain, 18 sites); kind: and ms: machine values untouched"
    requirement: I18N-01
    verification:
      - kind: unit
        ref: "test/i18n-toast.test.mjs#every toast message of the action surface renders its previous English exactly (label rows)"
        status: pass
      - kind: other
        ref: "grep 'action: t(' src/actions/actions.js | wc -l → 18; grep \"action: '\" → 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "The machine identifiers survived: tree-wide 438 data-a / 58 data-r / 76 data-v, the module's own data-a sites byte-identical"
    requirement: I18N-01
    verification:
      - kind: unit
        ref: "test/i18n-toast.test.mjs#the machine identifiers survived the wave — tree-wide data-a / data-r / data-v counts"
        status: pass
    human_judgment: false
  - id: D4
    description: "The English interface renders byte-identically after the sweep, proven end to end by the six Chromium tenancy tests"
    requirement: I18N-01
    verification:
      - kind: e2e
        ref: "npm run build && npm run e2e → 6 passed (selectors on unchanged English text)"
        status: pass
      - kind: unit
        ref: "npm test → 221/221 (was 213; +8 toast-contract tests)"
        status: pass
    human_judgment: false

# Metrics
duration: 11min
completed: 2026-10-22
status: complete
---

# Phase 6 Plan 7: English Toast Surface of the Action Module Summary

**The toast surface of `src/actions/actions.js` — 100+ messages and the 18 `action:` labels — now reads the catalogue through 107 new `toast.*`/`err.*` values, the rendered English is byte-identical, and the allow-list shrank by exactly the 97 literals the wave extracted (1689 → 1592), scan green at 0 violations**

## Performance

- **Duration:** 11 min
- **Started:** 2026-10-22T16:20Z
- **Completed:** 2026-10-22T16:33Z
- **Tasks:** 3 (tasks 1–2 TDD: RED + GREEN commits; task 3 proof-only, green-first pins)
- **Files modified:** 4

## Accomplishments

- 107 new values in `src/locales/en.json`: 89 `toast.*` messages, 15 `err.*` messages (the `{ kind: 'err' }` failures), 3 label values — `fr.json` untouched (still its 6 seed keys, D-02)
- The whole toast surface of `src/actions/actions.js` converted: every `toast()` message (including ternaries and `res.error ||` fallbacks), the messages `copy()` and `enterApp()` carry, `applyPatch`'s recurring-task message (via a `tMsg` import alias), and the 18 `action:` button labels
- `test/i18n-toast.test.mjs` (8 tests): the byte-identical English oracle over all 107 keys, the absence of the 97 extracted literal texts, the uniqueness of the wave's values, the swept-surface pin (no `ruleToast`/`unresolved` finding), the machine-identifier pins (438/58/76 tree-wide) and the allow-list hygiene
- Allow-list 1689 → 1592 entries (−97), still sorted by `file` then `text`; the scan reports **1818 literals, 1818 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch**
- `npm test` 221/221, `npm run lint` and `npm run format:check` clean, `npm run build && npm run e2e` 6/6 Chromium — the icon baseline of 174 names held (asserted inside the suite)

## Task Commits

1. **Task 1: the toast messages** — `1c655c2` (test, RED), `df9b90c` (feat, GREEN)
2. **Task 2: the toast options' action-button labels** — `1c9aa1d` (test, RED), `95099f1` (feat, GREEN)
3. **Task 3: the wave's proof** — `fa56858` (test — green-first pins; the task has no implementation step)

## Files Created/Modified

- `src/actions/actions.js` — 120 message/label sites to catalogue lookups; 8 locals renamed `tk`; one `tMsg` alias import
- `src/locales/en.json` — +107 keys (toast.*, err.*), inserted before the reserved `contract.*` block
- `test/fixtures/i18n-pending.json` — 1689 → 1592 entries, still sorted; the modal-half entries stay
- `test/i18n-toast.test.mjs` — new: the toast contract (oracle, absence, uniqueness, proof pins)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The plan's `data-a` verify threshold was measured against the tree, not the file**
- **Found during:** Task 3
- **Issue:** the task's inline verify fails `keys.length < 100` for `src/actions/actions.js` — but the file holds only **2** `data-a` sites (both the `[data-a="confirmOk"]` query selector); the 438 sites the must-haves cite are tree-wide. The check as written fails on any correct implementation.
- **Fix:** the pin asserts the tree-wide counts (438/58/76, D-08's own numbers) AND the module's two sites byte-identical — a strictly stronger check than the plan's threshold
- **Files modified:** test/i18n-toast.test.mjs
- **Committed in:** fa56858

**2. [Rule 1 - Bug] Ten locals named `t` shadowed the catalogue lookup**
- **Found during:** Task 1
- **Issue:** `const t = task(…)` in eight action handlers, `let t` in submitTask, the edit-branch `const t`, and one toast that referenced `t` BEFORE its `const` declaration in the same block (TDZ ReferenceError at runtime) would make `t('toast.…')` call a data object as a function
- **Fix:** the contained locals renamed `tk` (wave-6 precedent); `applyPatch`'s parameter `t` (~26 refs, renaming risked silent `t.due` reads of the lookup function) handled by importing the lookup a second time: `import { t, t as tMsg }`
- **Verification:** an acorn scope walk proves every `t()` call in the file resolves to the import binding
- **Files modified:** src/actions/actions.js
- **Committed in:** df9b90c

**3. [Rule 3 - Blocking] A fallback literal inside a display-named var property is a scanner finding**
- **Found during:** Task 1 (scan run)
- **Issue:** `t('toast.accessRequested', { name: mem(p?.lead)?.name || 'the owner' })` reports `ruleDisplayName: the owner` — the scan flags any literal under a display-named property, and the wave's text would have gone `unlisted`
- **Fix:** the fallback hoisted to a lowercase const before the call (`const lead = … || 'the owner'`) — same rendering, no finding
- **Committed in:** df9b90c

### Scope Notes (not deviations — the plan's own surface, read precisely)

- The plan's Task 1 reads "the ~97 `toast(...)` calls, the `mutate()` calls **and the shared helpers they use**": `copy()`'s message parameter (default `'Link copied'` + 6 call-site messages) and `enterApp()`'s argument (6 call sites) are toast messages, so they were swept; likewise `applyPatch`'s recurring-task message, which reaches `toast()` through `updateTask`'s `msgs`. None of these leave the file.
- **Task 3's tests are green-first pins, not RED→GREEN**: the task's `<action>` is "Close the wave" — pure proof with no implementation step to drive a RED. Its assertions (swept surface, machine identifiers, allow-list hygiene) are regression pins in the shape the plan's `<verify>` prescribes.

## Issues Encountered

- Two codemod pairs were missed on the first pass (`Changes saved`, `Upload failed — you're offline.`); the RED test's absence list caught both before the GREEN commit — the ledger pattern paid for itself.
- The count toasts (`Marked {n} tasks as done`, `Deleted {n} tasks`, `Archived {n} completed tasks`) were deliberately NOT made plural objects: the source hard-codes the plural form, and a plural object would change the English at n = 1, breaking the byte-identical gate. Phase 7 can still translate them (a French value may be a CLDR plural object — the lint compares placeholder sets, and both carry `{n}`).

## Known Stubs

None — no stub, placeholder, or unwired data source was introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The modal, confirmation and accessible-name half of `src/actions/actions.js` remains exactly as it was — its allow-list entries are intact and are plan 06-11's to remove
- The `err.*` namespace is now established for failure messages; later sweeps reuse it instead of inventing parallel namespaces
- The 107 new keys are English-only: phase 7 translates them by adding values (plural-shaped where the value is an object) without touching a single call site

## Self-Check: PASSED

- All 4 created/modified files exist on disk; all 5 task commits found in git log (`1c655c2`, `df9b90c`, `1c9aa1d`, `95099f1`, `fa56858`)
- Scan re-run at summary time: 1818 literals, 1818 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch
- Allow-list re-measured: 1592 entries, sorted
- npm test re-run at summary time: 221/221; e2e 6/6; lint and format:check clean

---
*Phase: 06-english-extraction-locale-aware-formats*
*Completed: 2026-10-22*
