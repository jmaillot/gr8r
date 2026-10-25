---
phase: 05-i18n-foundation-catalogue-contract
plan: 02
subsystem: i18n
tags: [i18n, catalogue, contract, lint, plural-rules, node-test, zero-dependency]

requires:
  - phase: none
    provides: the v1.1 app the i18n layer is added to (hand-written template strings, no framework, zero runtime dependency)
  - plan: 05-01
    provides: "src/core/i18n.js (the leaf layer and the locale registry), src/locales/{en,fr}.json (the seed catalogues), test/i18n.test.mjs (the layer contract)"
provides:
  - "test/catalogue.test.mjs — the catalogue contract suite: 23 named tests over the markup-injection lint, the key shape, the plural shape, the English base, the placeholder parity, the no-ICU-argument rule, the registry agreement, the catalogue location, the bare-Node import and the zero-dependency guard"
  - "the catalogue contract is enforced, not assumed: a value carrying <, > or a double quote can no longer reach a rendered page, and the lint names the file, the key and the offending character"
  - "the zero-runtime-dependency identity and the registry/file agreement are invariants, each with a test that fails when it is broken"
affects: [06-english-extraction, 07-french-catalogue, 08-per-user-locale, 11-build-gate]

actuals:
  tokens: 4980
  tasks: 2
  commits: 2

plan_head_before: 0905e995956683c7e97bdda636396ea36625ace5
plan_head_after: e02dec377acf7f424f95a0141929569341cd64de

tech-stack:
  added: []
  patterns:
    - "the contract is a lint that READS and REPORTS: it never rewrites, translates or softens a value"
    - "a rule is proven on a synthetic fixture, never by editing a real catalogue"
    - "the seed catalogues are the green case of the lint: a lint with no green case proves nothing"

key-files:
  created:
    - test/catalogue.test.mjs
  modified: []

key-decisions:
  - "the lint is a pure function of a catalogue object (lintCatalogue / lintAgainstBase): the same code path lints the real files and the synthetic fixtures, so a rule cannot be proven on a fixture and left broken on the disk"
  - "the placeholder parity compares the UNION of a plural value's members, because the call site passes one shape of variables"
  - "the base rule exempts the whole contract. namespace, the documented fixture namespace that proves both directions of the lookup"

patterns-established:
  - "a violation is an object (file, key, rule, where, detail) and every assertion message renders it, so a breach names itself without opening the file"

requirements-completed: [I18N-06]

coverage:
  - id: C1
    description: "The markup-injection lint rejects a value carrying <, > or a double quote, in a string value and in a plural member alike, and names the file, the key and the character"
    requirement: I18N-06
    verification:
      - kind: unit
        ref: "test/catalogue.test.mjs#the lint rejects a value carrying a left angle bracket"
        status: pass
      - kind: unit
        ref: "test/catalogue.test.mjs#the lint rejects a value carrying a right angle bracket"
        status: pass
      - kind: unit
        ref: "test/catalogue.test.mjs#the lint rejects a value carrying a double quote"
        status: pass
      - kind: unit
        ref: "test/catalogue.test.mjs#the lint walks the members of a plural object, not only the top-level values"
        status: pass
    human_judgment: false
  - id: C2
    description: "A key must be flat, dotted and namespaced, and a plural value must be an object keyed by CLDR categories carrying an other member"
    requirement: I18N-06
    verification:
      - kind: unit
        ref: "test/catalogue.test.mjs#the lint rejects a key that is not flat, dotted and namespaced"
        status: pass
      - kind: unit
        ref: "test/catalogue.test.mjs#the lint rejects a plural value whose members are not CLDR categories"
        status: pass
      - kind: unit
        ref: "test/catalogue.test.mjs#the lint rejects a plural value with no other member"
        status: pass
      - kind: unit
        ref: "test/catalogue.test.mjs#the lint rejects a value that is neither a string nor a plural object"
        status: pass
    human_judgment: false
  - id: C3
    description: "The English catalogue is the base — a French key the English catalogue does not carry is rejected, apart from the documented contract fixture namespace — and a shared key carries the same placeholders in both languages"
    requirement: I18N-06
    verification:
      - kind: unit
        ref: "test/catalogue.test.mjs#the lint rejects a key the English catalogue does not carry"
        status: pass
      - kind: unit
        ref: "test/catalogue.test.mjs#the contract fixture namespace is the documented exception to the English-base rule"
        status: pass
      - kind: unit
        ref: "test/catalogue.test.mjs#the lint rejects a value whose placeholders drift from the English one"
        status: pass
    human_judgment: false
  - id: C4
    description: "The ICU check is structural: an ICU argument is rejected while a plain English keyword (Select, Select…) and a bare hash (C#) are legitimate plain text"
    requirement: I18N-06
    verification:
      - kind: unit
        ref: "test/catalogue.test.mjs#the lint rejects a value carrying an ICU argument"
        status: pass
      - kind: unit
        ref: "test/catalogue.test.mjs#the lint accepts a plain English word that reads like an ICU keyword"
        status: pass
      - kind: unit
        ref: "test/catalogue.test.mjs#the lint accepts a bare hash"
        status: pass
    human_judgment: false
  - id: C5
    description: "The locale registry and the catalogue files agree in both directions, the base locale is en, and src/locales/ holds JSON files only"
    requirement: I18N-06
    verification:
      - kind: unit
        ref: "test/catalogue.test.mjs#the locale registry and the catalogue files agree, in both directions"
        status: pass
      - kind: unit
        ref: "test/catalogue.test.mjs#src/locales holds JSON files only, so the icon scan can never read a catalogue"
        status: pass
    human_judgment: false
  - id: C6
    description: "Both catalogues are importable by bare Node with the json import attribute, and the project still declares no runtime dependency"
    requirement: I18N-06
    verification:
      - kind: unit
        ref: "test/catalogue.test.mjs#both catalogues are importable by bare Node with the json import attribute"
        status: pass
      - kind: unit
        ref: "test/catalogue.test.mjs#the project declares no runtime dependency"
        status: pass
    human_judgment: false
  - id: C7
    description: "The interface renders exactly as it renders today: no source file was touched, the whole suite stays green and the shipped bundle is unchanged"
    verification:
      - kind: unit
        ref: "npm test — 89 tests passed (66 pre-existing + 23 new)"
        status: pass
      - kind: e2e
        ref: "npm run build && npm run e2e — 6 Chromium tests passed"
        status: pass
      - kind: other
        ref: "the lucideSubset() scan reproduces the frozen baseline — icons 174 baseline 174, identical"
        status: pass
    human_judgment: false

duration: 14min
completed: 2026-10-22
status: complete
---

# Phase 5 Plan 02: i18n foundation & catalogue contract Summary

**The catalogue contract as 23 named tests: the markup-injection lint, the key and plural shapes, the placeholder parity, the registry agreement and the zero-dependency guard.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-10-22T10:28:00Z
- **Completed:** 2026-10-22T10:42:00Z
- **Tasks:** 2
- **Files modified:** 1 (1 created)
- **Commits:** 2 (`plan_head_before` `0905e99` → `plan_head_after` `e02dec3`)

## Accomplishments

- **The lint is real and it is not vacuous.** Injecting `<b>` into a seed value turns the suite
  red with a message that names the file, the key and the character:
  `en.json → common.cancel (the value): the value carries a left angle bracket ("<")`. The value
  was restored immediately afterwards; the committed catalogue never carried it.
- **The lint walks the plural members, not only the top-level values** — a `<` inside
  `task.count.one` is reported as `the plural member one`.
- **The ICU check is structural.** `{count, plural, one {# task} other {# tasks}}` is rejected as an
  ICU argument, while `Select`, `Select…` (the literal at `src/overlays/popovers.js:414`, a
  phase-6 value) and `C#` pass. A keyword blacklist would have blocked phase 6 before it started.
- **The English base rule has a documented exception and a documented non-breach.** The
  `contract.` namespace is exempt (the fixtures prove both directions of the lookup), and the
  reverse direction — an English key a non-base catalogue does not carry — is explicitly asserted
  not to be a breach.
- **The placeholder parity compares the union of a plural's members**, so a French value that
  renames `{n}` to `{count}` is rejected.
- **Every guard was proven non-vacuous with a deliberate break**, each restored immediately: an
  unregistered `probe.json` in `src/locales/`, a `probe.js` in the same directory, and a
  `dependencies` block in `package.json` each turned the matching test red with the expected
  message.
- **No source file was touched.** The catalogue contract is proved against the files plan 05-01
  created; the interface renders exactly as it does today.

## Task Commits

1. **Task 1: the markup-injection lint and the catalogue shape rules** — `8a73697` (test)
2. **Task 2: the catalogue location, the registry agreement and the zero-dependency guard** —
   `e02dec3` (test)

## Files Created/Modified

- `test/catalogue.test.mjs` — the 23-case catalogue contract suite (390 lines): the lint
  (`lintCatalogue`, `lintAgainstBase`, `lintValue`, `lintAll`), the violation shape, and the named
  tests. No other file was created or modified.

## Verification

| Check | Command | Result |
|-------|---------|--------|
| The suite | `node --test test/catalogue.test.mjs` | 23/23 pass |
| The lint is not vacuous | `<b>` injected into `common.cancel`, then restored | the seed test goes red, naming file, key and character |
| The markup rule (seed) | the plan's `JSON.parse` scan, corrected (see the deviations) | `offending values: 0` |
| The registry guard | an unregistered `probe.json` in `src/locales/`, then removed | `the catalogue file probe.json is registered (en, fr)` |
| The location guard | a `probe.js` in `src/locales/`, then removed | `no non-JSON entry may live in src/locales (found probe.js)` |
| The dependency guard | a `dependencies` block in `package.json`, then restored | `package.json must carry no runtime dependency (found probe)` |
| The manifest (plan command) | `node -e "const p = require('./package.json'); …"` | `runtime deps: 0` |
| Whole suite | `npm test` | 89/89 pass (66 pre-existing + 23 new) |
| Lint / format | `npm run lint && npm run format:check` | clean |
| Shipped bundle | `npm run build && npm run e2e` | 6/6 Chromium tests pass |
| Icon baseline | `lucideIconNames('src')` vs the frozen baseline | `icons 174 baseline 174`, identical |

## Decisions Made

- **The lint is a pure function of a catalogue object.** `lintCatalogue(name, data)` and
  `lintAgainstBase(name, data, base)` take the catalogue as an argument, so the real files and the
  synthetic fixtures go through the same code path. A rule proven on a fixture cannot be broken on
  the disk by a different code path.
- **The "expected key counts" of the bare-Node import test are the file's own counts.** The test
  asserts that the imported object is the file, key for key, and that the imported key count
  equals the count parsed from disk. A hardcoded `9` and `6` would have broken the moment phase 6
  adds the first English string and phase 7 the first French one — the assertion would have failed
  for the wrong reason, on a correct catalogue.
- **The base rule exempts the whole `contract.` namespace, not the two fixture keys by name.** The
  namespace is the documented exception; a future fixture under it inherits the exemption instead
  of needing a new allow-list entry.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's second verify command flags every value**
- **Found during:** Task 1 (the `<automated>` verification pair)
- **Issue:** the command filters with `JSON.stringify(v).includes(String.fromCharCode(34))` — the
  double quote. `JSON.stringify` wraps every string value in quotes of its own, so the check
  matches the *serialization* and reports `offending values: 9` for a catalogue that carries no
  forbidden character at all. The command could only ever fail.
- **Fix:** the check was run against the raw value instead — a string value is tested as it is, a
  plural value member by member. The corrected command prints `offending values: 0` and exits 0.
  The contract itself is unchanged: the committed lint rejects the raw characters, which is what
  the plan's rule 1 describes.
- **Files modified:** none — the fix is in the verification command, not in the code.
- **Verification:** the corrected command prints `offending values: 0`; the plan's original command
  prints `offending values: 9` on the very same file, which is the proof that the defect is in the
  command.
- **Committed in:** n/a (the command is not part of the repository).

### Formatting

- The catalogue seed files and the source were not touched at all, so there is nothing to format
  beyond the new suite, which `prettier --write` settled before the commits.

## Issues Encountered

- The first draft of the suite asserted that a value carrying `<` produced *exactly one* breach,
  but `<b>` carries both `<` and `>` — the lint was right and the assertion was wrong. The
  fixtures were narrowed to a value carrying one forbidden character at a time.
- One placeholder-parity fixture (`task.count` with the same `{n}` in both catalogues) was not a
  drift at all; it was rewritten to carry `{count}` in one member, which is a real drift.

## Known Stubs

None. The suite has no skipped test, no `todo`, no empty assertion and no disconnected fixture:
every rule is asserted against a synthetic catalogue and against the real seed catalogues.

## Notes for the next phases

- **The lint is the gate for phase 6.** Every English string that moves into `src/locales/en.json`
  must be plain text: no `<`, no `>`, no `"`. A value that legitimately needs one of them must be
  written without it, because the lint does not soften and the plan forbids it.
- **The `contract.` namespace is a fixture, not a production namespace.** It exists to prove both
  directions of the lookup; phase 6 and phase 7 do not use it.
- **The base rule is a subset rule**: phase 7 must cover every English key in French, apart from
  the `contract.` namespace. A French key missing from English is a breach, and the English
  fallback is the only sanctioned direction of a gap.
- **The placeholder subset is `{name}` plus the count placeholder `{n}`** — the parity test compares
  the union of the plural members' placeholders, so a French value that renames `{n}` breaks the
  build.
- **Plan 05-03 rewrites `package.json`** (it adds the `build:en` script). The zero-dependency
  guard in this file must be re-asserted right after that write — the two plans touch the manifest
  in different waves, never in the same one.

## Self-Check: PASSED

- `test/catalogue.test.mjs` — FOUND (390 lines, 23 named tests)
- commit `8a73697` — FOUND (Task 1, the markup-injection lint and the shape rules)
- commit `e02dec3` — FOUND (Task 2, the location, the registry and the manifest guard)
- `node --test test/catalogue.test.mjs` — 23 pass, 0 fail
- `npm test` — 89 pass, 0 fail
- `npm run lint && npm run format:check` — clean
- `npm run build && npm run e2e` — 6/6 Chromium tests pass
- the lucideSubset() scan — `icons 174 baseline 174`, identical to the frozen baseline

---
*Phase: 05-i18n-foundation-catalogue-contract*
*Completed: 2026-10-22*
