# Plan 55-05 — Deferred / out-of-scope discoveries

**2026-11-10 (executor, plan 55-05):** The workspace was dirty at spawn with a parallel
session's WIP (55-02..55-04 client work). The following failures exist in files this plan
never touched and were NOT fixed (scope boundary rule):

1. `src/views/table.js:93` — an uncommitted `export const probe = 'A literal that was never extracted';`
   left by the parallel session. It is the sole cause of the 4 failing `test/i18n-scan.test.mjs`
   cells and of `npm run i18n:scan` reporting `1 unlisted`. Proven: with the literal stashed,
   the scan reports `0 literals … 0 unlisted … 0 dead … 0 stale`. Owner of the dirty tree
   (55-02..55-04 sessions) must remove it before their commit.
2. `test/creator-watcher.test.mjs`, `test/scope.test.mjs`, `test/activity-verbs.test.mjs`
   show failures ONLY when the whole suite runs concurrently alongside the parallel
   session's in-flight client migration (`src/actions/`, `src/core/store.js` dirty);
   each passes standalone (`node --test` 77/77 across the three + i18n-scan minus the
   probe literal).
3. Pre-existing lint errors in files this plan touched but did not author those lines:
   `export/xlsx.js:174` `first` unused (predates this plan, from HEAD), and
   `test/export-xlsx.test.mjs:20` unused `makeMilestoneDoc` import (predates this plan).

**2026-11-10 (executor, plan 55-07):** `npm run lint` fails with 55 errors — ALL in files
this plan never touched: `db-adapter.mjs`, `mailer.js`, `server.js`, `e2e/teams.spec.mjs`,
`export/xlsx.js` and 15 `test/*.mjs` files (`no-undef` process/console, unused vars).
ESLint over the ten 55-07 source files is clean. Out of scope per the boundary rule;
`npm test` is fully green (1382 tests, 0 fail).

## 55-04 (2026-11-10)

- Pre-existing full-tree `npm run lint` failures: 54 errors across 19 files unrelated to 55-04's diff
  (db-adapter.mjs, server.js, mailer.js, export/xlsx.js, e2e/teams.spec.mjs, test/*.test.mjs). Verified
  pre-existing via stash-isolation; every file 55-04 touched lints clean individually. Owner: project-wide lint triage.
