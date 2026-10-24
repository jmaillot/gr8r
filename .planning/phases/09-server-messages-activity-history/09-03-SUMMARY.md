---
phase: 09-server-messages-activity-history
plan: 03
subsystem: api, ui, i18n
tags: [activity-log, i18n, machine-verbs, localization, french-typography]

requires:
  - phase: 09-server-messages-activity-history
    provides: server error codes + client boundary translation (09-01, 09-02)
provides:
  - Activity journal stores machine verbs + structured extras (no locale-prose freeze)
  - actCategory classifier covering legacy English fragments + machine verbs (D-06)
  - actExtraHtml structured-extra rendering with per-kind var resolvers
  - drawer.js unified verbLabel rendering (no divergent fallback)
  - 4 new act.* catalogue keys in en+fr (projectStatusChanged, value, quoted, into)
affects: [activity, notifications, server-messages, audit]

actuals:
  tokens: 52000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "EXTRA_VARS kind table: structured extras resolved at render via catalogue keys"
    - "ACT_CATEGORIES: filter classification from stored verb (no includes/regex parsing)"

key-files:
  created:
    - test/activity-verbs.test.mjs
  modified:
    - src/actions/actions.js
    - src/actions/archive.js
    - src/actions/subtasks.js
    - src/components/task-list.js
    - src/locales/en.json
    - src/locales/fr.json
    - src/overlays/drawer.js
    - test/i18n-core-features.test.mjs

key-decisions:
  - "Machine verbs are camelCase suffixes of their act.verb.* keys (created, createdProject, commentedOn, etc.)"
  - "ACT_CATEGORIES covers both vocabularies (legacy + machine) for D-06 compatibility"
  - "actCategory is an exported lookup table, not a regex/includes parser"
  - "EXTRA_VARS resolves ids (task.priority.<id>, project.status.<id>, member names, project names, format dates) at render time"
  - "Catalogue lint required U+00A0 padding inside French guillemets"

patterns-established:
  - "EXTRA_VARS: kind -> { key, vars } resolver, dynamic key support (estimateSet, repeatSet)"
  - "actCategory: explicit Set-based classifier over stored verbs"

requirements-completed: [ACT-01, ACT-02, ACT-03, ACT-04, ACT-05]

coverage:
  - id: D1
    description: "Activity writers store machine verbs (camelCase) + structured extras"
    requirement: ACT-01
    verification:
      - kind: unit
        ref: "test/activity-verbs.test.mjs#the writers store machine verbs"
        status: pass
    human_judgment: false
  - id: D2
    description: "actCategory classifier reproduces old English parsing (D-06 quirks included)"
    requirement: ACT-02
    verification:
      - kind: unit
        ref: "test/activity-verbs.test.mjs#actCategory exists and reproduces the old English parsing"
        status: pass
    human_judgment: false
  - id: D3
    description: "Structured extras render translated values (prioritySet → act.extra.to + task.priority.<id>)"
    requirement: ACT-03
    verification:
      - kind: unit
        ref: "test/activity-verbs.test.mjs#the priority extra renders the translated priority value"
        status: pass
    human_judgment: false
  - id: D4
    description: "Hostile values escaped; unknown extra kinds suppressed (never echoed)"
    requirement: ACT-04
    verification:
      - kind: unit
        ref: "test/activity-verbs.test.mjs#a hostile extra value is escaped at the interpolation point"
        status: pass
    human_judgment: false
  - id: D5
    description: "Catalogue parity en+fr with French typography for new act.* keys"
    requirement: ACT-05
    verification:
      - kind: unit
        ref: "test/i18n-core-features.test.mjs#catalogue holds"
        status: pass
      - kind: unit
        ref: "test/french-typography.test.mjs"
        status: pass
    human_judgment: false

duration: 42min
completed: 2026-10-24
status: complete
---

# Plan 09-03 Summary

**Activity journal stores machine verbs + structured extras end-to-end: priority as tracer slice, full 25-writer expansion, and unified drawer rendering — with D-06-equivalent filter classification over legacy + machine vocabularies.**

## Performance

- **Duration:** 42 min
- **Started:** 2026-10-24
- **Completed:** 2026-10-24
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Every activity writer now stores a machine verb (camelCase suffix of its act.verb.* key) instead of an English prose fragment.
- Every structured extra is a machine value — an id, a date, a member name, a project id — never a `t()`-derived prose string.
- actCategory classifier replaces the English includes/regex parsing in activity.js; it covers legacy + machine vocabulary and pins the D-06 quirks (project moves as status entries, `removed` matching `moved`).
- actExtraHtml renders structured extras via the EXTRA_VARS table with per-kind resolvers; hostile values are escaped at the interpolation point and unknown kinds render as empty string.
- drawer.js now uses verbLabel alone (no divergent fallback, no replace(/ of$/)).
- Four new act.* catalogue keys (`act.verb.projectStatusChanged`, `act.extra.value`, `act.extra.quoted`, `act.extra.into`) added in en+fr with French typography (U+00A0 padding inside guillemets).

## Task Commits

1. **Task 1: Tracer — priority machine verb + classifier + filters** — `feat(09-03): tracer machine-verb path (priority) + actCategory filters (ACT-01)`
2. **Task 2: Expansion — all writers to machine verbs + structured extras** — `feat(09-03): all activity writers store machine verbs + structured extras`
3. **Task 3: Suppression + legacy extras removed + gate of phase** — `feat(09-03): legacy string extras suppressed + full parity gate (D-12)`

## Files Created/Modified
- `src/actions/actions.js` — all logAct sites store machine verbs + structured extras (no ST/PR/PSTAT prose freeze)
- `src/actions/archive.js`, `src/actions/subtasks.js` — restored/convertedASubtaskOf with structured extras
- `src/components/task-list.js` — VERB_KEYS (legacy + machine), EXTRA_VARS table, ACT_CATEGORIES, actExtraHtml unknown-kind suppression
- `src/locales/en.json`, `src/locales/fr.json` — 4 new act.* keys in mirror positions, French typography fixed
- `src/overlays/drawer.js` — verbLabel alone (no divergent fallback)
- `test/activity-verbs.test.mjs` — RED→GREEN contract test for the full activity vocabulary
- `test/i18n-core-features.test.mjs` — catalogue count updated 1525 → 1529

## Decisions Made
- Machine verbs are camelCase suffixes of their act.verb.* keys (e.g. changedPriorityOf → act.verb.changedPriorityOf), no separate naming scheme.
- D-06 quirks frozen exactly: 'moved' still classifies as status (a project move is a status entry), and the old regex `/moved|completed|reopened/` caught 'removed a file from' too — the classifier reproduces this selection.
- 'createdProject' is NOT in the projects filter (the old `includes('project')` was case-sensitive) — only 'projectStatusChanged' and the legacy fragments match.
- Legacy string extras are suppressed at render (never divulged); a legacy row's extra renders as empty string.
- French typography: `«`/`»` use U+00A0 inside (not plain U+0020).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] French typography gate failure (guillemet padding)**
- **Found during:** Task 2 catalogue additions
- **Issue:** U+0020 (regular space) was used inside `«…»` in `act.extra.renamedTo` and `act.extra.quoted` in fr.json — the French typography test requires U+00A0 (non-breaking space) inside guillemets.
- **Fix:** Replaced regular spaces inside the guillemets with U+00A0 for both keys.
- **Files modified:** src/locales/fr.json
- **Verification:** test/french-typography.test.mjs and test/i18n-core-features.test.mjs pass
- **Committed in:** Task 2 commit

**2. [Rule 2 - Missing Critical] ST import orphaned in actions.js**
- **Found during:** Task 2 lint
- **Issue:** The status-name prose (`ST[old].name`) was removed by the machine-verb conversion, leaving `ST` as an unused import — eslint flagged `no-unused-vars`.
- **Fix:** Removed `ST` from the constants.js import (PR and PSTAT are still used elsewhere).
- **Files modified:** src/actions/actions.js
- **Verification:** eslint clean on actions.js (only the 3 pre-existing errors in unrelated test files remain)
- **Committed in:** Task 2 commit

---

**Total deviations:** 2 auto-fixed (2× Rule 2 — missing critical)
**Impact on plan:** Both fixes were necessary for correctness (typography gate, lint hygiene). No scope creep.

## Issues Encountered
- The equivalence test (actCategory === oldClassify for every verb) exposed that the plan's illustrative status set was incomplete — the old regex also caught 'removed a file from' via the 'moved' substring quirk. The test won, so the classifier reproduces the quirk exactly.

## Next Phase Readiness
- Machine verbs and structured extras are now stored at every writer and rendered through one table.
- The catalogues are in parity (en+fr) with 1529 keys and correct French typography.
- drawer.js and task-list.js share the same verbLabel path — no divergent fallback.
- The next phase can extend the EXTRA_VARS table or the ACT_CATEGORIES sets without touching the writers.

---
*Phase: 09-server-messages-activity-history*
*Completed: 2026-10-24*
