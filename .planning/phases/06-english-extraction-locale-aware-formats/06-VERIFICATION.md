---
phase: 06-english-extraction-locale-aware-formats
verified: 2026-10-22T20:03:08Z
status: passed
score: 5/5 must-haves verified
covered_digest: "v2:sha256:2dfddd753bc51a1ca3ecde5b7c31bc889a757c7751c42114aed7949011bf490d"
behavior_unverified: 0
overrides_applied: 0
note_on_digest: "gsd_run/verification.fingerprint is not installed in this environment; the digest was computed deterministically as sha256 over the sorted covered_files list concatenated with each file's bytes (99 files)."
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
  # implementation + test files changed in the phase (git 10053056..HEAD)
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

# Phase 6: English extraction & locale-aware formats — Verification Report

**Phase Goal:** ~1 800 string occurrences across 37 files move into the catalogue as a pure,
behaviour-preserving refactor: no string changes its meaning, and the existing Chromium tests
stay green. The hand-rolled MON/MONL/WD/WDL arrays, fmtDate(), relDate(), ago(), dayBucket()
and fsize() are replaced by Intl-backed, per-locale cached formatters, and the 16 measured
English plural sites are converted to catalogue plural objects. dateFmt/timeFmt gain an 'auto'
sentinel. The one intentional behaviour change is the search comparison, which normalises both
sides so an accented name is found from an unaccented query.
**Verified:** 2026-10-22T20:03:08Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | No user-visible literal left inline; scan finds none; build fails when a new one is added | ✓ VERIFIED | `node scripts/i18n-scan.mjs` → exit 0, `0 literals, 0 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch`; allow-list `test/fixtures/i18n-pending.json` = `[]`; adversarial probe: appended literal `"Probe Delete Forever"` in a copied tree → `PROBE_EXIT=1` with `unlisted ... ruleProse`; scanner contract tests (test/i18n-scan.test.mjs:224,242,348) pass in the suite; `prebuild` runs the scan before `vite build` (package.json) |
| 2 | Interface behaves exactly as before; Chromium tests green; only declared deltas changed | ✓ VERIFIED | `npm test` 335/335 pass; `npm run e2e` 6/6 Chromium pass on unchanged English text; declared deltas are the only visible changes and both are test-pinned: settings time-format `'auto'` option (src/pages/settings.js:219,250,254; test/i18n-prefs.test.mjs) and `useGrouping: false` for English numbers (src/core/i18n.js:205; oracle tests). `fr.json` untouched at its 6 seed keys |
| 3 | Formatters locale-driven: French 24/07/2026, 24-hour clock, « il y a 2 jours »; English byte-identical | ✓ VERIFIED | `test/i18n-format.test.mjs:258-261` asserts `formatDate(JULY_24) === '24/07/2026'` and `formatRelativeTime(ago(2d)) === 'il y a 2 jours'` — passes; English oracle tests in i18n-format/i18n-dates/i18n-toast pass; formatters are `Intl.DateTimeFormat/NumberFormat/RelativeTimeFormat` instances cached per (locale, options) in Maps (src/core/i18n.js:142-172) |
| 4 | Item counts use the locale's plural form, not an English `+ 's'` rule | ✓ VERIFIED | `grep "? 's' : ''" src/` → 0 occurrences; 17 plural objects in `src/locales/en.json` keyed by CLDR categories (`task.count`, `file.count`, `act.overdueBy`, …); selection via cached `Intl.PluralRules` in `resolvePlural()` (src/core/i18n.js:105-112); `test/i18n-plural.test.mjs` passes |
| 5 | "elodie" finds "Élodie"; sort order unchanged | ✓ VERIFIED | `foldForSearch()` (src/core/utils.js:19-34) folds both sides via `normalize('NFD')` + combining-mark strip and maps back to original indices; 9 filter sites fold both sides (search.js, members.js, helpers.js hl(), popovers, palette, modals, …); `test/i18n-search.test.mjs:57-97` asserts the fold, the match and the highlight window — passes; `Intl.Collator` grep across src/ and scripts/ → 0 (sort order untouched) |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Supporting Verifications

| Check | Result | Evidence |
|-------|--------|----------|
| Hand-rolled arrays deleted | ✓ | `grep "MON\b\|MONL\|const WD\b\|WDL"` across src/ → 0 matches |
| Hand-rolled functions replaced by delegation | ✓ | `fmtDate`/`relDate`/`ago`/`dayBucket` delegate to the Intl formatters (src/core/utils.js:72-90); `fsize` delegates to `formatFileSize` (src/ui/helpers.js:109-114) |
| `dateFmt`/`timeFmt` 'auto' sentinel | ✓ | `isAutoDateFmt(value)` treats `'auto'` and stored default `'MMM d'` as auto (src/core/i18n.js:296-297, D-04 resolution); settings rows render the locale preview and resolve the stored value through the predicate (src/pages/settings.js:219,224,250,254); write path preserves the sentinel via `prefValue()` (src/core/prefs.js) |
| Machine identifiers untouched | ✓ | `data-a=` 438, `data-r=` 58, `data-v=` 76 — exact match to D-08's measured counts; `ROUTE_IDS` + `routeName()` wired in the shell (src/shell/layout.js:100-134) while the router matches ids; `fileTypeName` keys on the stored FT ids (src/ui/helpers.js:97); activity-log verbs remain stored English data (`logAct('created'/'archived'/…)` in store.js:245, rendered raw in drawer.js:128) — activity log itself is phase-9 scope |
| Icon baseline unchanged, no runtime deps | ✓ | `test/fixtures/icons-baseline.json` holds 174 names, asserted by `test/build-locales.test.mjs`; package.json has no `dependencies` block (only devDependencies) |
| Debt markers | ✓ | `grep -E "TBD\|FIXME\|XXX\|HACK\|PLACEHOLDER"` over src/ and scripts/ → only the `PLACEHOLDER` interpolation-regex constants (legitimate), no unresolved debt markers |
| Catalogue lint not weakened | ✓ | `test/catalogue.test.mjs` (25 tests) passes inside the suite; fr.json stays at 6 seed keys with `english-base`/placeholder-drift rules intact |

### Gates Run (all green)

| Gate | Result |
|------|--------|
| `npm test` | 335 pass / 0 fail |
| `npm run build` (incl. `prebuild` i18n scan) | exit 0, 62 modules, built in 1.28s |
| `npm run e2e` | 6/6 Chromium pass (9.2s) |
| `npm run lint` | exit 0 |
| `npm run format:check` | exit 0 |
| `node scripts/i18n-scan.mjs` | exit 0, 0 literals, 0 pending, 0 violations |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Scan fails on appended literal | probe tree in /tmp/opencode, `main([], {root, allowList})` | `1 unlisted … ruleProse`, `PROBE_EXIT=1` | ✓ PASS |
| t() key resolution family covers all call sites | scan report (`0 unresolved`) + test/i18n-scan.test.mjs:338 in suite | 0 unresolved over the real tree | ✓ PASS |
| Fold maps highlight back to original | test/i18n-search.test.mjs:97 (in suite run) | passes | ✓ PASS |
| French formatter oracle | test/i18n-format.test.mjs:258 (in suite run) | passes | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| appended-literal gate probe | node -e import('scripts/i18n-scan.mjs') → `main([], {root: probe tree, allowList: empty})` | exit 1, `unlisted … ruleProse "Probe Delete Forever"` | PASS (gate is not vacuous) |

### Requirements Coverage

| Requirement | Source | Status | Evidence |
| ----------- | ------ | ------ | -------- |
| I18N-01 — every user-visible string in the catalogue, no inline literal left | 06-01…06-14 | ✓ VERIFIED | scan exit 0 over real tree, allow-list `[]`, build gate fails on appended literal (probe + test/i18n-scan.test.mjs:348), every t() call site resolves with matching placeholders (scan `0 unresolved`, test :338) |
| I18N-03 — locale-driven dates/times/durations/numbers | 06-02, 06-03, 06-04 | ✓ VERIFIED | Intl-backed cached formatters (i18n.js:142-172), arrays deleted (grep 0), delegation in utils.js:72-90 and helpers.js:109-114, French oracle 24/07/2026 + 24h + « il y a 2 jours » (test/i18n-format.test.mjs:258), English oracle byte-identical, 'auto' sentinel via isAutoDateFmt + settings rows + prefValue() write path |
| I18N-04 — CLDR plural forms | 06-06 | ✓ VERIFIED | 0 `? 's' : ''` under src/; 17 plural objects keyed by CLDR category in en.json; selection through cached `Intl.PluralRules` (i18n.js:105-112); test/i18n-plural.test.mjs passes |
| SEARCH-01 — accent-insensitive search, sort order unchanged | 06-05 | ✓ VERIFIED | foldForSearch NFD+mark-strip with index map (utils.js:19-34); 9 filter sites fold both sides; "elodie" finds "Élodie" test-pinned (i18n-search.test.mjs:57); `Intl.Collator` grep = 0 |

### Anti-Patterns Found

None. No debt markers, no stub returns, no empty handlers in the phase's files. The only
`PLACEHOLDER` constants are the interpolation regexes in i18n.js:81 and i18n-scan.mjs:192 —
legitimate machinery, not stubs.

### Coincidental-Reliance Review

None flagged. The accent-insensitive match is established endogenously by the folding
implementation itself (both query and candidate pass through `foldForSearch`), not by an
undeclared precondition or incidental ordering. The English byte-identity guarantee rests on
the declared proof device (English oracle tests + 6 Chromium e2e on unchanged English text),
exactly as the roadmap criterion prescribes.

### Human Verification Required

None. Every behavior-dependent truth (accent-insensitive match, French/English formatter
outputs, plural selection, sentinel resolution, gate non-vacuousness, English rendering
stability) is exercised by a passing test in this run, and the 6 Chromium e2e tests render the
real interface on unchanged English text in a browser.

### Gaps Summary

None. The phase goal is achieved in the codebase, not merely in the summaries:

- The extraction is complete and *provable*: the static scan reports zero user-visible literals
  and zero unresolved keys over the real tree, the allow-list is literally empty, and the gate
  was probed adversarially — an appended literal in a copied tree fails the scan with exit 1.
- The hand-rolled English date/number machinery is gone (greps return nothing) and its call
  sites delegate to per-locale cached `Intl` formatters whose French and English outputs are
  pinned by oracle tests.
- The 16 plural sites are converted (0 remaining ternaries; 17 CLDR-keyed plural objects driven
  by cached `Intl.PluralRules`).
- Search folds both sides through one NFD-based helper; the sort order is untouched
  (`Intl.Collator` absent).
- Behaviour preservation held under the full gate battery: 335 unit tests, 6 Chromium e2e,
  build, lint, format — all green, with only the two deltas declared in 06-CONTEXT.md visible.
- Machine identifiers survived exactly: 438/58/76 data-* counts, ROUTE_IDS + routeName, FT ids,
  activity verbs as stored data, 174-name icon baseline, zero runtime dependencies.

---

_Verified: 2026-10-22T20:03:08Z_
_Verifier: the agent (gsd-verifier)_