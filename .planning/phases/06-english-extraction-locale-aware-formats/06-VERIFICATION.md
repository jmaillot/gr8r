---
phase: 06-english-extraction-locale-aware-formats
verified: 2026-10-25T19:05:00Z
status: passed
score: 5/5 must-haves verified
covered_digest: "v2:sha256:53d2537fcd54b922682b281ba54a95c400f26cebcd30098b5d08945585a17f8b"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 5/5
  gaps_closed: []
  gaps_remaining: []
  regressions: []
note_on_digest: "gsd_run/verification.fingerprint is not installed in this environment; the digest was recomputed deterministically as sha256 over the sorted covered_files list concatenated with each file's bytes (99 files), against the committed HEAD (d1807be) in an isolated worktree."
note_on_method: "The primary working tree was under continuous concurrent mutation during verification — 4+ external `node --test` runner processes (not started by this verifier) raced the suite's own adversarial real-tree probe (test/i18n-scan.test.mjs:353 appends a literal to the live tree and restores it), intermittently leaving `export const probe` in src/views/table.js, failing the live scan (exit 1 — the gate WORKS) and breaking concurrent vite builds. All gates below were therefore re-run against a clean git worktree at HEAD d1807be, which includes every close-out commit (d1807be, 21725f1, 2a75275, be0fdf6). The live-fire probe observation doubles as proof the build gate is not vacuous."
covered_files:
  # phase planning artifacts
  - .planning/phases/06-english-extraction-locale-aware-formats/06-CONTEXT.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-01-PLAN.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-01-SUMMARY.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-02-PLAN.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-02-SUMMARY.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-03-PLAN.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-03-SUMMARY.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-04-PLAN.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-04-SUMMARY.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-05-PLAN.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-05-SUMMARY.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-06-PLAN.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-06-SUMMARY.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-07-PLAN.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-07-SUMMARY.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-08-PLAN.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-08-SUMMARY.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-09-PLAN.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-09-SUMMARY.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-10-PLAN.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-10-SUMMARY.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-11-PLAN.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-11-SUMMARY.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-12-PLAN.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-12-SUMMARY.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-13-PLAN.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-13-SUMMARY.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-14-PLAN.md
  - .planning/phases/06-english-extraction-locale-aware-formats/06-14-SUMMARY.md
  # implementation + test files changed in the phase
  - scripts/i18n-scan.mjs
  - src/actions/actions.js
  - src/actions/archive.js
  - src/actions/drag-drop.js
  - src/actions/subtasks.js
  - src/actions/teams.js
  - src/components/task-list.js
  - src/core/api.js
  - src/core/constants.js
  - src/core/i18n.js
  - src/core/icons.js
  - src/core/prefs.js
  - src/core/store.js
  - src/core/utils.js
  - src/features/archive.js
  - src/features/subtasks.js
  - src/features/teams.js
  - src/locales/en.json
  - src/main.js
  - src/overlays/context-menu.js
  - src/overlays/drawer.js
  - src/overlays/modals.js
  - src/overlays/palette.js
  - src/overlays/popovers.js
  - src/pages/activity.js
  - src/pages/auth.js
  - src/pages/design-system.js
  - src/pages/errors.js
  - src/pages/favorites.js
  - src/pages/home.js
  - src/pages/inbox.js
  - src/pages/members.js
  - src/pages/my-tasks.js
  - src/pages/notifications.js
  - src/pages/overview.js
  - src/pages/project.js
  - src/pages/projects.js
  - src/pages/search.js
  - src/pages/settings.js
  - src/pages/tasks.js
  - src/shell/layout.js
  - src/shell/render.js
  - src/shell/skeletons.js
  - src/shell/view-engine.js
  - src/ui/helpers.js
  - src/ui/select.js
  - src/ui/toast.js
  - src/views/board.js
  - src/views/calendar.js
  - src/views/files.js
  - src/views/project-overview.js
  - src/views/table.js
  - src/views/timeline.js
  - test/fixtures/i18n-pending.json
  - test/helpers/virtual-icons-loader.mjs
  - test/i18n-actions-modules.test.mjs
  - test/i18n-core-features.test.mjs
  - test/i18n-dates.test.mjs
  - test/i18n-format.test.mjs
  - test/i18n-modal.test.mjs
  - test/i18n-overlays.test.mjs
  - test/i18n-pages.test.mjs
  - test/i18n-plural.test.mjs
  - test/i18n-prefs.test.mjs
  - test/i18n-scan.test.mjs
  - test/i18n-search.test.mjs
  - test/i18n-shell.test.mjs
  - test/i18n-toast.test.mjs
  - test/i18n-ui-helpers.test.mjs
  - test/i18n-vocab.test.mjs
---

# Phase 6: English extraction & locale-aware formats — Verification Report (Re-verification #4682)

**Phase Goal:** ~1 800 string occurrences across 37 files move into the catalogue as a pure,
behaviour-preserving refactor: no string changes its meaning, and the existing Chromium tests
stay green. The hand-rolled MON/MONL/WD/WDL arrays, fmtDate(), relDate(), ago(), dayBucket()
and fsize() are replaced by Intl-backed, per-locale cached formatters, and the 16 measured
English plural sites are converted to catalogue plural objects. dateFmt/timeFmt gain an 'auto'
sentinel. The one intentional behaviour change is the search comparison, which normalises both
sides so an accented name is found from an unaccented query.
**Verified:** 2026-10-25T19:05:00Z
**Status:** PASSED
**Re-verification:** Yes — stale digest after post-phase close-out commits (d1807be, 21725f1,
2a75275, be0fdf6) touched phase-covered files (src/actions/actions.js, src/views/files.js,
src/locales/{en,fr}.json — 6 new plain-text keys, both locales, 1538 keys each — plus prettier
formatting of test files)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence (re-checked against HEAD 2026-10-25) |
|---|-------|--------|--------|
| 1 | No user-visible literal left inline; scan finds none; build fails when a new one is added | ✓ VERIFIED | `node scripts/i18n-scan.mjs` on the HEAD worktree → exit 0, `0 literals, 0 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch`; allow-list `test/fixtures/i18n-pending.json` = `[]`; `prebuild` runs the scan before `vite build` (package.json:9-11). Gate non-vacuousness proven live: while an external test runner had probe-literal `export const probe = 'A literal that was never extracted'` in src/views/table.js, the same scan exited 1 with `unlisted src/views/table.js:87 ruleProse`; the adversarial test (test/i18n-scan.test.mjs:348-360, append→scan→restore on the real tree) passes inside the suite |
| 2 | Interface behaves exactly as before; tests green; only declared deltas changed | ✓ VERIFIED | Full suite on the HEAD worktree: **445/445 pass, 0 fail** (was 335 at initial verification — later phases added tests); `npm run build` (incl. prebuild scan) exit 0; `npm run lint` exit 0; `npm run format:check` exit 0. Declared deltas (time-format `'auto'` option, `useGrouping: false` English) remain test-pinned (test/i18n-prefs.test.mjs in suite; src/core/i18n.js) |
| 3 | Formatters locale-driven: French 24/07/2026, 24-hour clock, « il y a 2 jours »; English byte-identical | ✓ VERIFIED | French + English oracle tests in test/i18n-format.test.mjs / i18n-dates / i18n-toast all pass in the 445-run; formatters are cached per-(locale, options) `Intl.DateTimeFormat/NumberFormat/RelativeTimeFormat` instances (src/core/i18n.js); formatters still cached, delegation in src/core/utils.js (fmtDate/relDate/ago/dayBucket) and src/ui/helpers.js (fsize) re-read — intact |
| 4 | Item counts use the locale's plural form, not an English `+ 's'` rule | ✓ VERIFIED | `grep "? 's' : ''" src/` → 0; **19** CLDR-keyed plural objects in en.json (was 17 — +2 from close-out keys, both new objects well-formed); selection via cached `Intl.PluralRules.resolvePlural()` (src/core/i18n.js); test/i18n-plural.test.mjs passes in suite |
| 5 | "elodie" finds "Élodie"; sort order unchanged | ✓ VERIFIED | `foldForSearch()` (src/core/utils.js) NFD + combining-mark strip with index map; 9 fold sites re-grepped intact; test/i18n-search.test.mjs passes (fold, match, highlight window); `Intl.Collator` grep across src/ + scripts/ → 0 |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Supporting Verifications

| Check | Result | Evidence |
|-------|--------|----------|
| Hand-rolled arrays deleted | ✓ | `grep -E "MON\b\|MONL\|const WD\b\|\bWDL\b"` across src/ → 0 matches |
| data-* and machine identifiers never reported | ✓ | scan unresolved = 0 over real tree; current live counts data-a 434 / data-r 57 / data-v 75 (initial verification measured 438/58/76 pre-close-out — slight drift from later phases' legitimate edits, D-08's exclusion rule, not the counts, is the contract; scanner contract test "no data-a, data-r or data-v site of the live tree is ever reported" passes in the suite) |
| Catalogue lint not weakened | ✓ | test/catalogue.test.mjs passes in suite; en.json and fr.json both at **1538 keys** — the close-out commits added the 6 new keys symmetrically to both locales, so the phase-5 subset rule and placeholder-drift rule stay green |
| fr.json state | ✓ | fr.json is now fully populated (phases 7+ work) — the phase-6 prohibition "no French is added / six seed keys" was phase-scoped and remains historically satisfied; nothing in phase 6's contract is violated by the later, committed fill |
| Container/catalogue invariants | ✓ | JSON under src/locales/ (no .js fragments); t() leaf-layer test ("the layer imports the catalogues and nothing else") passes; test/i18n-vocab.test.mjs now green (the transient failure during live-tree racing was process contention, not a defect) |
| Debt markers | ✓ | no unresolved TBD/FIXME/XXX/HACK/PLACEHOLDER in phase files; only the legitimate interpolation-regex PLACEHOLDER constants |
| Icon baseline / no runtime deps | ✓ | test/build-locales.test.mjs marker-set + baseline tests pass in suite (the suite-internal races noted in the method note were the only failures observed, all attributable to cross-process interference, not code) |

### Gates Run (all green, isolated HEAD worktree d1807be)

| Gate | Result |
|------|--------|
| `npm test` | **445 pass / 0 fail** (20.0s) |
| `npm run build` (incl. `prebuild` i18n scan) | exit 0, built in 1.19s, fr chunk emitted (phase-7 catalogue chunk) |
| `node scripts/i18n-scan.mjs` | exit 0 — 0 literals, 0 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch |
| `npm run lint` | exit 0 |
| `npm run format:check` | exit 0 |
| `npm run e2e` | not re-run this round (Chromium 6/6 evidence from initial verification 2026-10-22; no source files changed since that run affected rendering — close-out commits are catalogue keys + formatting; structure checks confirm extraction intact) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Scan fails on appended literal | observed live during verification: probe literal present in src/views/table.js while external runner held it | exit 1, `unlisted … ruleProse "A literal that was never extracted"` | ✓ PASS (live-fire, stronger than a copied-tree probe) |
| Scan green on committed state | same scan on HEAD worktree | exit 0, 0 literals | ✓ PASS |
| French formatter oracle | test/i18n-format.test.mjs (in 445 suite run on HEAD) | passes | ✓ PASS |
| Fold + highlight mapping | test/i18n-search.test.mjs (in suite) | passes | ✓ PASS |
| Plural selection via CLDR categories | test/i18n-plural.test.mjs (in suite) | passes | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| appended-literal gate probe | test/i18n-scan.test.mjs:348 adversarial test (`npm test` on HEAD), plus the live-fire observation above | gate tripped with exit 1 when literal present; restored to green after | PASS (gate is not vacuous) |

### Requirements Coverage

| Requirement | Source | Status | Evidence |
| ----------- | ------ | ------ | -------- |
| I18N-01 — every user-visible string in the catalogue, no inline literal left | 06-01…06-14 | ✓ VERIFIED | scan exit 0 over HEAD tree, allow-list `[]`, gate fails on appended literal (live-fire + suite test :348), scan reports `0 unresolved` / `0 placeholder-mismatch` (test :338 passes in suite) |
| I18N-03 — locale-driven dates/times/durations/numbers | 06-02, 06-03, 06-04 | ✓ VERIFIED | Intl-backed cached formatters, arrays deleted (grep 0), delegation intact in utils.js + helpers.js, French oracle + English oracle tests pass in the 445-run, 'auto' sentinel tested (test/i18n-prefs.test.mjs in suite) |
| I18N-04 — CLDR plural forms | 06-06 | ✓ VERIFIED | 0 `? 's' : ''`; 19 CLDR-keyed plural objects in en.json; cached `Intl.PluralRules` selection; test/i18n-plural.test.mjs passes |
| SEARCH-01 — accent-insensitive search, sort order unchanged | 06-05 | ✓ VERIFIED | foldForSearch NFD+mark-strip with index map; 9 fold sites; "elodie" finds "Élodie" test-pinned and passing; `Intl.Collator` grep = 0 |

All requirement IDs declared in the phase's PLANs (I18N-01, I18N-03, I18N-04, SEARCH-01) map to
Phase 6 in .planning/REQUIREMENTS.md (lines 135-149). No orphaned Phase-6 requirements found.

### Anti-Patterns Found

None in the committed state. No debt markers, no stub returns, no empty handlers in the phase's
files. The transient `export const probe` literal observed in the working tree was external
test-runner churn (appended by the suite's own adversarial test and restored by it), not a
committed regression — verified absent at HEAD.

### Coincidental-Reliance Review

None flagged. Accent-insensitive matching is established endogenously by the folding
implementation (both sides pass through `foldForSearch`); English byte-identity rests on the
declared proof device (English oracle tests inside the 445-run), as the roadmap prescribes.

### Human Verification Required

None. Every behavior-dependent truth (accent-insensitive match, French/English formatter
outputs, plural selection, sentinel resolution, gate non-vacuousness — tripped live during this
verification — and English rendering stability) is exercised by a passing test on the committed
state.

### Gaps Summary

None. The re-verification confirms the phase goal still holds on the current committed codebase:

- Static scan: 0 literals, 0 unresolved, 0 placeholder-mismatch; allow-list empty; gate
  demonstrated non-vacuous by live-fire observation AND by the suite's adversarial test.
- 445/445 tests, build, lint, format: all green on HEAD d1807be including all close-out commits.
- The close-out changes (6 new keys in both locales, 1538 symmetric; prettier formatting) stayed
  inside the catalogue contract phase 6 pinned — scan and catalogue lint untouched.
- Hand-rolled date machinery still gone; 19 plural objects now CLDR-driven; search folding
  intact with sort order untouched.

**Operational note for the orchestrator (not a gap):** during verification, 4+ concurrent
external `node --test` processes were racing in the primary working tree; the suite's real-tree
probe (test/i18n-scan.test.mjs:353) is unsafe under concurrent suite runs — it corrupts parallel
vite-build tests and the live scan. Consider gating that test with a file lock or moving it to a
copied tree.

---

_Verified: 2026-10-25T19:05:00Z_
_Verifier: the agent (gsd-verifier)_
