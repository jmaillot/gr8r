# Phase 14 — Deferred Items (out-of-scope discoveries)

## 2026-10-26 — 14-01 execution

### Pre-existing test failure (unrelated to 14-01's file set)

- **Test:** `test/i18n-prefs.test.mjs:243` — "the declared English delta is recorded where the
  phase verification reads it" — fails with `the roadmap carries the phase 6 section`.
- **Root cause:** the test asserts `.planning/ROADMAP.md` contains a `## Phase 6` section from the
  v1.2 milestone. The v1.3 ROADMAP rewrite (phases 13–18 now follow `## Phase Details`, `### Phase 13`)
  removed that section, so the test regressed at milestone setup — not during 14-01.
- **Evidence:** the same failure reproduces on a clean worktree of the plan's base commit
  `cea746e` (17 pass / 1 fail). Full-suite status at 14-01 start: 450/451 pass.
- **Disposition:** out of scope for 14-01 (scope boundary — pre-existing failures in files the
  plan does not touch). The plan's own verify commands pass: `node --test test/migration.test.mjs`
  is 14/14, lint and prettier are clean on all three touched files.
- **Suggested fix for a later plan (not 14-01):** re-point the test at the v1.2 milestone archive
  (`.planning/milestones/v1.2-ROADMAP.md`) or gate the check on milestone detection.
