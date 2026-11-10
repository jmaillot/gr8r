
## 54-02 — deferred (out of scope, pre-existing on main before this plan)

- `npm run lint` fails on HEAD (50 errors across unrelated files: db-adapter.mjs no-undef process/console ×10, test/browser-push.test.mjs no-undef document/localStorage/Notification, mailer.js no-control-regex, e2e/teams.spec.mjs + several test files no-unused-vars, server.js TZ_BY_LABEL/empty block, context-menu.js canManageProject no-undef). Verified pre-existing by running eslint on db-adapter.mjs with the HEAD config (same 10 errors). Not caused by 54-02; the touched files (eslint.config.js, test/dependencies.test.mjs, test/export-prohibition.test.mjs, test/helpers/*.mjs) lint clean and export/**/*.js node globals are recognised.

## Wave-2 gate observations (2026-11-10, orchestrator)

- Post-merge gate findings resolved, none outstanding: the wave-1 failures were the six
  stale pins (fixed 2562071) and the wave-2 failures were the two runtime-dependency pins
  (fixed 8b80ec9). The D-05 typography test passes standalone and in the full suite after
  the fr.json NBSP fixes (export.title guillemets, export.notice.staticMode colon).
- The pre-existing server.js lint errors (TZ_BY_LABEL, empty block) recorded by the 54-02
  executor remain — out of phase scope, untouched.
