---
phase: 47-command-ui-hardening-g-shortcuts
verified: 2026-11-07T19:35:00Z
status: passed
score: 2/2 success criteria verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - .planning/phases/47-command-ui-hardening-g-shortcuts/47-SUMMARY.md
  - src/actions/keyboard.js
  - src/overlays/palette.js
  - src/core/utils.js
  - test/palette-filter.test.mjs
  - test/i18n-actions-modules.test.mjs
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
covered_digest: "v2:sha256:296fed29bd88b1e9148fc4784ce37f89392c1e480dfe504583adbbba07624cea"
re_verification:
  previous_status: gaps_found
  previous_score: 1/2
  gaps_closed:
    - "Each landed fix carries a regression test — palette filter now behaviorally pinned by test/palette-filter.test.mjs (7/7 pass, run by me); helpers extracted to src/core/utils.js (compactQuery, isSubseq) and imported by src/overlays/palette.js; gPending combo path covered by documented UAT evidence at commit 5fe7f67 (the previous verifier's sanctioned alternative)"
    - "31/31 evidence claim corrected to 13/13 in 47-SUMMARY.md and the FIX-01 bullet in REQUIREMENTS.md (grep for '31/31' → no matches)"
  gaps_remaining: []
  regressions: []
---

# Phase 47: Command/UI hardening — fix/commands intake Verification Report

**Phase Goal:** Land and pin the fixes produced by the fix/commands worktree.
**Verified:** 2026-11-07 (re-verification)
**Status:** passed
**Re-verification:** Yes — after gap closure (commits 3d542ed, 66639f3)

## Original Gap Record

The initial verification (same date) found criterion 1 partially met: the palette-side fixes
(query-typing guard, initials-across-words filter, gPending combo path) had no regression
tests — only a source-literal anchor — and the SUMMARY/REQUIREMENTS cited a factually wrong
"31/31" test count (actual: 9 top-level / 13 counted). Resolution:

1. **3d542ed** — `compactQuery()` and `isSubseq()` extracted to `src/core/utils.js` as exported
   pure helpers; `src/overlays/palette.js` imports and uses them (import verified at
   palette.js:2; call sites at lines 91, 94–95: `n.includes(qn) || isSubseq(qn, n)`). New
   behavioral test file `test/palette-filter.test.mjs` — 7 tests: 'gh' → 'Go to Home'
   initials-across-words, spaced initials 'g t', plain substring, false-positive rejections
   ('zx', 'hh', 'taak'), accent folding, empty-needle semantics, order-strictness.
2. **66639f3** — "31/31" corrected to "13/13" in 47-SUMMARY.md:24 and REQUIREMENTS.md FIX-01
   bullet; the gPending combo path now documents the UAT evidence at commit 5fe7f67 as its
   behavioral verification (the sanctioned alternative from the initial verification).

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Each landed fix carries a regression test and a REQUIREMENTS traceability bullet | ✓ VERIFIED | Palette filter: `test/palette-filter.test.mjs` — 7/7 pass on my own run (`node --test test/palette-filter.test.mjs` → pass 7, fail 0). Helpers live in `src/core/utils.js` (compactQuery line 39, isSubseq lines 40–47) and are wired into palette.js:2, 91, 94–95. Keyboard GO_MAP literal anchor retained in test/i18n-actions-modules.test.mjs; the gPending combo path (timing-dependent keydown state machine, no headless harness) carries documented UAT evidence at 5fe7f67 — the previous verifier's explicitly sanctioned alternative ("behavioral test or documented manual/UAT evidence"). Traceability: REQUIREMENTS.md:74–77 (FIX-01, Complete) now cites both files with accurate counts (13/13 and 7/7). |
| 2 | Full suite green; no new runtime dependencies | ✓ VERIFIED | Ran the full suite myself (`npm test`): 1133 tests, **1119 pass, 0 fail, 14 skipped** (68s) — 7 new tests over the prior 1126, all passing. Dependencies: `package.json` last touched at 52506c0 (Phase 45, pg); `git diff` across 62b1826, 3d542ed, 66639f3 → no change to `dependencies` (only `pg@^8.23.1`, as before). |

**Score:** 2/2 success criteria verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/actions/keyboard.js` | Shared gPending G-nav map, GO_MAP extracted | ✓ VERIFIED | Unchanged since initial verification (clean): `export let gPending`, `GO_MAP` with 9 route keys, combo handling in palette and global paths. |
| `src/overlays/palette.js` | Query-typing guard + initials-across-words filter | ✓ VERIFIED | Now imports `compactQuery`, `isSubseq` from core/utils.js (line 2); filter at lines 91–95: `n.includes(qn) \|\| isSubseq(qn, n)` — behavior identical to the inlined version, now testable. |
| `src/core/utils.js` | Pure filter helpers, exported for testability | ✓ VERIFIED | `compactQuery` (line 39, whitespace compaction) and `isSubseq` (lines 40–47, order-strict in-order subsequence). Substantive with contract comments; consumed by palette.js. |
| `test/palette-filter.test.mjs` | Behavioral regression tests for the palette filter | ✓ VERIFIED | 7 tests covering the full contract (initials-across-words, spaced initials, substring, false-positive rejections, accent folding, empty needle, order-strictness). 7/7 pass on my run. Wired to the exact helpers palette.js uses. |
| `test/i18n-actions-modules.test.mjs` | GO_MAP literal anchor | ✓ VERIFIED | Unchanged; 13/13 counted, matching the corrected evidence claims. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| src/overlays/palette.js | src/core/utils.js | compactQuery / isSubseq imports | ✓ WIRED | Named imports at palette.js:2; used at lines 91 (query compaction) and 94–95 (fold + compact + subsequence filter). |
| src/overlays/palette.js | src/actions/keyboard.js | shared GO_MAP / gPending combo contract | ✓ WIRED | Unchanged from initial verification. |
| 62b1826, 3d542ed, 66639f3 | main | commits at HEAD ancestry | ✓ WIRED | All three present in `git log`. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Palette filter regression tests | `node --test test/palette-filter.test.mjs` | pass 7, fail 0 | ✓ PASS |
| Full suite green | `npm test` | 1119 pass, 0 fail, 14 skipped (1133 tests) | ✓ PASS |
| Evidence-figure accuracy | `grep -rn "31/31" REQUIREMENTS.md 47-SUMMARY.md` | no matches; corrected to 13/13 | ✓ PASS |
| gPending combo while palette open | — | covered by documented UAT at 5fe7f67 (sanctioned alternative; timing-dependent, no headless harness) | ✓ VERIFIED (documented evidence) |

### Requirements Coverage

| Requirement | Source | Description | Status | Evidence |
|-------------|--------|-------------|--------|----------|
| FIX-01 | Phase 47 | Command/UI hardening landed from fix/commands — two-letter G shortcuts, each fix with a regression test | ✓ SATISFIED | REQUIREMENTS.md:74–77 now accurate: i18n-actions 13/13, palette-filter 7/7 (added at v1.10 gap closure), G-combo path UAT-verified at 5fe7f67, suite green, merged at 62b1826. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TBD/FIXME/XXX/placeholder debt markers in the phase's changed files (re-scanned) | ℹ️ Info | Clean. The prior "31/31" documentation inaccuracy is resolved. |

### Human Verification Required

None. The gPending combo path's behavioral evidence is the documented UAT at commit
5fe7f67 ("UAT passed for Phases 46 (MCP 5/5) and 47 (G shortcuts)"), explicitly sanctioned by
the initial verification as the valid alternative for this timing-dependent keydown state
machine (no headless harness exists for the overlay). The original human-verification item is
thereby resolved.

## Gaps Summary

No gaps remain. Both closure commits deliver exactly what the gap plan recommended: the
palette filter logic was extracted into exported pure helpers in core/utils.js (wired into
palette.js unchanged in behavior) and pinned by 7 behavioral tests, all passing on my own
run; the gPending combo path carries documented UAT evidence; and the evidence figures in
47-SUMMARY.md and REQUIREMENTS.md are now accurate (13/13, not 31/31). The full suite is
green on my own run (1119 pass / 0 fail / 14 skipped) and no runtime dependency was added
(`package.json` untouched since Phase 45's pg addition).

**Verdict:** Phase goal achieved. Both success criteria verified. Phase 47 is complete.

---

_Verified: 2026-11-07 (re-verification after gap closure)_
_Verifier: the agent (gsd-verifier)_
