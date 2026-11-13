# Deferred Items — Phase 61

## 61-01 (2026-11-13)

- **[out-of-scope, pre-existing] Lint: 2 errors in Phase 60 files.**
  `npm run lint` reports 2 `no-unused-vars` errors introduced by Phase 60 commit
  `290bb36` (60-03 gap closure), NOT by this plan:
  - `src/pages/dashboard.js:36` — `lastRequestedWindow` assigned but never used
  - `test/dashboard-client.test.mjs:17` — `fileURLToPath` imported but never used
  Not fixed here (scope boundary: pre-existing failures in files outside the
  plan's `files_modified`). Fix belongs to a Phase 60 follow-up / next quick task.
