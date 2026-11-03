---
phase: 34-per-user-settings-isolation-search-leak-closure
plan: 03
subsystem: search-redaction
tags: [search, redaction, tokenization, unicode, nfc, security, leak-closure]

requires:
  - phase: 34-per-user-settings-isolation-search-leak-closure
    provides: hiddenFor() single redaction funnel and 404-matrix fixture (Phases 29/32), the scope suite this plan pins into
provides:
  - src/lib/redaction.js — tokenize + referencesHidden, the pure importable tokenized matcher (D-13/D-14)
  - server.js call sites re-pointed: mergeRecentSearches + redactDoc use the imported matcher; server.js stays export-free
  - test/redaction.test.mjs — 22-test table-driven SEARCH-01 suite + D-15 workspace-wide pin
  - CHANGELOG.md SEARCH-01 note with the residual full-token/free-text limitation
affects: [phase-35, verifier, future per-user search migration]

actuals:
  tokens: 16800
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - token-set intersection matcher (NFC + toLowerCase + Unicode word split) replacing substring includes
    - pure-module extraction pattern — server behavior testable only through src/lib (server.js export-free)

key-files:
  created:
    - src/lib/redaction.js
    - test/redaction.test.mjs
  modified:
    - server.js
    - test/scope.test.mjs
    - CHANGELOG.md

key-decisions:
  - "Tokenizer: Unicode-aware split on non-letter/number runs (\\p{L}\\p{N}) after NFC + toLowerCase — apostrophes, dots and parens are boundaries, so \"sarah's\" and \"sarah.inc\" share a full 'sarah' token (pinned as DROP)"
  - "Non-array hiddenTerms treated as empty (never string-indexed); non-string terms always kept — the flagged SEARCH-01 backstop probes are table rows and a dedicated test"
  - "The pre-existing D-06 pin was updated to the tokenized semantics: 'In Scope planning' is now dropped because it shares the full token 'scope' with hidden 'Out of Scope' — the accepted T-34-08 residual, documented in CHANGELOG and pinned as a table row"

patterns-established:
  - "Table-driven {term, hiddenTerms, expected} suites with per-row notes over a pure matcher module"
  - "Storage-model pins via source assertions: D-15 pins the workspace-wide list by asserting the redactDoc filter shape and the absence of any recent-searches side table"

requirements-completed: [SEARCH-01]

coverage:
  - id: S1
    description: "A recent-search term sharing a full token with a hidden name is dropped; a substring-only collision ('Sara Corp' vs hidden 'Sarah') is kept — end-to-end over HTTP"
    requirement: SEARCH-01
    verification:
      - kind: integration
        ref: "test/scope.test.mjs#404-matrix [SEARCH-01 D-13] recent-search redaction matches on full tokens, not substrings"
        status: pass
      - kind: unit
        ref: "test/redaction.test.mjs#table rows (a) 'sarah smith' DROP / 'Sara Corp' keep"
        status: pass
    human_judgment: false
  - id: S2
    description: "D-14 normalization: NFC + toLowerCase both sides; NFC vs NFD encodings match identically; Café does not match cafe (no diacritic stripping); no Intl casefold"
    requirement: SEARCH-01
    verification:
      - kind: unit
        ref: "test/redaction.test.mjs#tokenize normalizes NFC + lowercase and splits on non-word boundaries"
        status: pass
      - kind: unit
        ref: "test/redaction.test.mjs#table rows (c) NFC/NFD both directions + (d) Café/cafe keep"
        status: pass
    human_judgment: false
  - id: S3
    description: "Punctuation, case and inverse-collision behavior pinned: '(Sarah)' drops, \"Sarah's\" drops (full token), hidden 'Sara' vs 'Sarah Inc' keeps"
    requirement: SEARCH-01
    verification:
      - kind: unit
        ref: "test/redaction.test.mjs#table rows (b)(e)(f)"
        status: pass
    human_judgment: false
  - id: S4
    description: "Backstops: non-string terms and empty/hostile hidden lists never throw and never drop a term"
    requirement: SEARCH-01
    verification:
      - kind: unit
        ref: "test/redaction.test.mjs#backstop: non-string terms are kept and never throw"
        status: pass
      - kind: unit
        ref: "test/redaction.test.mjs#backstop: empty hiddenTerms never drops a term"
        status: pass
    human_judgment: false
  - id: S5
    description: "D-15: recent searches remain one workspace-wide list — no per-user storage (pinned by source assertions on server.js)"
    requirement: SEARCH-01
    verification:
      - kind: unit
        ref: "test/redaction.test.mjs#D-15: recent searches stay a single workspace-wide list — the storage model is unchanged"
        status: pass
    human_judgment: false
  - id: S6
    description: "The residual free-text redaction limitation (full-token over-redaction; per-user free-text search out of scope) is documented in CHANGELOG.md"
    requirement: SEARCH-01
    verification:
      - kind: static
        ref: "CHANGELOG.md §Unreleased/Changed — 'Recent-search redaction is token-boundary exact (SEARCH-01)'"
        status: pass
    human_judgment: false
  - id: S7
    description: "Zero-regression switch-over: full suite green with the new matcher"
    verification:
      - kind: integration
        ref: "npm test (874 tests, 871 pass, 3 pre-existing skips, 0 fail)"
        status: pass
    human_judgment: false

duration: 14min
completed: 2026-11-03
status: complete
---

# Phase 34 Plan 03: Tokenized Search-Leak Closure Summary

**Recent-search redaction rebuilt on a tokenized matcher (src/lib/redaction.js): full-token NFC+lowercase intersection replaces substring includes, pinned by a 22-test table suite, the D-13 end-to-end scope pin, the D-15 workspace-wide pin, and the CHANGELOG SEARCH-01 limitation note.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-11-03T10:58:59Z
- **Completed:** 2026-11-03T11:13:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- `src/lib/redaction.js`: pure `tokenize` (NFC + toLowerCase, Unicode `\p{L}\p{N}` word split) and `referencesHidden` (token-set intersection, no substring includes, no diacritic folding, no Intl casefold) — the only importable server behavior; server.js stays export-free
- server.js: inline substring `referencesHidden` deleted; import re-points all three call sites (both `mergeRecentSearches` paths and the `redactDoc` filter); `hiddenProjectTerms` NFC-normalizes so both matcher sides share D-14
- `test/redaction.test.mjs`: 22 tests — the full D-16 `{term, hiddenTerms, expected}` table (Sarah/Sara both directions, NFC/NFD both sides, Café≠cafe, punctuation, case variants, empty-hidden + non-string backstops) and the D-15 workspace-wide-list pin via source assertions (no per-user recent-searches storage)
- `test/scope.test.mjs`: new D-13 end-to-end pin over HTTP — hidden "Sarah" with `["sarah smith", "Sara Corp"]` redacts to `["Sara Corp"]`
- CHANGELOG.md §Unreleased/Changed: the SEARCH-01 tokenized-redaction entry with the residual limitation

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): Extract tokenized matcher and re-point all call sites — one end-to-end proof** - `0d845f6` (feat)
2. **Task 2: Table-driven SEARCH-01 suite + D-15 workspace-wide pin + CHANGELOG note** - `0f07160` (test)

Tracer feedback gate: `<verify>` re-run end-to-end after Task 1 — scope 79 pass / 3 pre-existing skips, privacy 10/10 — before Task 2 expanded the surface.

## Files Created/Modified
- `src/lib/redaction.js` - tokenize + referencesHidden, the pure tokenized matcher (created)
- `test/redaction.test.mjs` - 22-test SEARCH-01 table suite + D-15 pin (created)
- `server.js` - import, inline matcher deleted, hiddenProjectTerms NFC normalize
- `test/scope.test.mjs` - D-13 end-to-end redaction pin; D-06 pin updated to tokenized semantics
- `CHANGELOG.md` - SEARCH-01 fix + residual limitation note

## Decisions Made
- Tokenizer splits on any run of non-letter/non-number characters (Unicode-aware): apostrophes, dots and parentheses are boundaries, so "sarah's" / "sarah.inc" share a full "sarah" token and drop — the actual behavior is pinned rather than special-cased
- Non-array hiddenTerms are treated as empty and non-string terms always keep the term — the flagged backstop probes are enforced in code and as table rows
- The pre-existing D-06 pin was updated to the tokenized output (see deviation below) — the plan's own fixture makes the two expectations mutually exclusive under D-13

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pre-existing D-06 pin expected substring-matcher output that D-13 provably changes**
- **Found during:** Task 1 (scope suite run)
- **Issue:** The plan's `fails_when` forbade any pre-existing scope test failure, but hidden "Out of Scope" shares the full token "scope" with "In Scope planning" — under D-13 token matching that term is now (correctly) dropped, so the old expected array `['In Scope planning', 'generic term']` can never pass alongside the new D-13 pin on the same fixture
- **Fix:** Updated the pin to `['generic term']` with an in-test comment naming the shared token and the accepted T-34-08 residual; the residual over-redaction is documented in CHANGELOG and pinned as a table row in test/redaction.test.mjs
- **Files modified:** test/scope.test.mjs
- **Verification:** scope suite 79 pass / 0 fail; full suite green
- **Committed in:** 0d845f6 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 × Rule 1 — pre-existing pin carried the retired matcher's exact output).
**Impact on plan:** none on the fix itself; the over-redaction of "In Scope planning" is the T-34-08-accepted residual surface the plan's threat model already priced in, now visible and documented.

## Issues Encountered
None beyond the deviation above. Pre-existing: 3 suite skips (unchanged).

## Known Stubs
None.

## Threat Surface Scan
No new surface: this plan *closes* T-34-07 (substring leak) with the tokenized matcher and its proving pins; T-34-08 (residual full-token sharing, free-text search out of scope) is accepted and documented in CHANGELOG. The new module is pure — no network, no storage, no trust-boundary change.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- SEARCH-01 closed: matcher-level fix, pinned in both directions (no leak, no false positive beyond the documented full-token residual), limitation in CHANGELOG
- Phase 34 plans 01–04 all complete — ready for `/gsd-verify-work 34` and the Phase 35 (UNDO/DEPLOY) light closer

---
*Phase: 34-per-user-settings-isolation-search-leak-closure*
*Completed: 2026-11-03*
