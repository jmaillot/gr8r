# Deferred items — Phase 12 (plan 12-05 out-of-scope discoveries)

These were found while running plan 12-05's verification but are NOT caused by
this plan's changes. Per the scope boundary they are logged here, not fixed.

## Pre-existing repo-wide lint failures (`npm run lint` exits 1)

`npm run lint` currently fails with 8 pre-existing errors, none introduced by
plan 12-05 (verified: all present at pre-plan commit 8b93d88):

- `e2e/locale.spec.mjs` — 3 unused imports + 1 unused variable (phase 09/10 era)
- `test/locale-negotiate.test.mjs` — 2 `no-undef` (`document`)
- `test/server-boot.test.mjs` — `no-regex-spaces`
- `server.js:1924` — `no-control-regex` on the T-12-08 fileDisposition regex
  (introduced by plan 12-02, before 12-05; the regex is intentional — it MUST
  match control characters to strip them, so an inline eslint-disable is the
  likely fix, not a rewrite)

Plan 12-05's own changed files are otherwise eslint-clean.

- **Status:** resolved
  Fixed at the v1.2 milestone close-out (commit be0fdf6): unused imports/variable removed,
  `globalThis.document` referenced explicitly, the double space replaced with `{2}`, and the
  intentional T-12-08 control-regex carries an inline eslint-disable. `npm run lint` is clean.

## Pre-existing repo-wide format drift (`npm run format:check` exits 1)

Prettier reports 19 unformatted files, all failing at pre-plan commit 8b93d88
too (e.g. `test/upload.test.mjs`, `e2e/flows.spec.mjs`, `test/migration.test.mjs`,
`test/server-boot.test.mjs`, `test/locale-*.test.mjs`). Likely cause: a prettier
config/version drift after a prior phase — not phase-12 content. Plan 12-05 kept
its added lines prettier-conformant (verified `src/main.js` clean after fix)
but did not reformat whole files.

## Recommended follow-up

A small dedicated cleanup (bot or fast task): fix the 8 lint errors (one
eslint-disable comment for server.js:1924) and run `prettier --write` over the
19 drifted files in one chore commit. Then the phase verification line
`npm run lint && npm run format:check` becomes honest again.

- **Status:** resolved
  Both halves done at the v1.2 milestone close-out: lint fixes in commit be0fdf6, `prettier
  --write` over the drifted files (19 code files + 2 docs) in commit 21725f1.
  `npm run lint && npm run format:check` is green.
