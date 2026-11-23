# Phase 90 — Deferred Items (executor log)

Items discovered during execution that are OUT of the executing plan's scope
(pre-existing failures, unrelated files). Per the scope-boundary rule these
were verified pre-existing, NOT fixed, and logged here.

## 90-01 — pre-existing test failure: french-typography

- `test/french-typography.test.mjs` — 6 fr.json values breach D-05 (straight apostrophes / wrong colon space): page.backup.statusUploadFailed, err.s3NotConfigured, err.s3ClockSkew, err.badCreds, err.unreachable, toast.s3ProbeDeleteFailed — all Phase 88 (S3) keys. Verified pre-existing: values byte-identical at the phase-start tree (a7e59e51, checked via `git show a7e59e51:src/locales/fr.json`); executor touched none of them.
  status: acknowledged

## 90-01 — pre-existing test failure: webhook-routes health

- `test/webhook-routes.test.mjs` — "GET list: no secret field anywhere; health computed from deliveries (D-06)" (health 'active' vs 'failing'); same family as the webhook-events debt carried in STATE.md; fails even harder on the base tree (env-dependent). Verified pre-existing: fails at a7e59e51 in a detached worktree run (5 more failures there); server.js untouched by 90-01.
  status: acknowledged

<!-- both acknowledged at v3.3 milestone close: pre-existing family, carried forward -->
