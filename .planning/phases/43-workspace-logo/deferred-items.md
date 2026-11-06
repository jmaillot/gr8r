# Phase 43 — Deferred Items (out-of-scope discoveries)

Logged per the executor scope boundary (pre-existing issues, not caused by this plan's changes).

| # | Item | Where | Evidence | Disposition |
|---|------|-------|----------|-------------|
| 1 | `test/totp-rewrap.test.mjs` "D-74: a failed pre-migration backup leaves every stale row byte-identical" fails at HEAD **before** any phase-43 change (verified: reverted server.js to HEAD, test still fails — boot dies on `EACCES mkdir <tmpdir>/files` because the test chmods its DATA_DIR to 0o555, which now also defeats `openDb`'s `FILES_DIR` mkdir). Environment-dependent failure. | test/totp-rewrap.test.mjs:200-236 | full-suite run 2026-11-06: 997 pass / 2 fail / 3 skips — both failures reproduced at HEAD | Pre-existing red; needs its DATA_DIR strategy reworked (e.g. point DATA_DIR at a read-only *file* or catch mkdir). Not a phase-43 concern. |
| 2 | Pre-existing lint errors (10 total) in `mailer.js` (no-control-regex), `test/digest.test.mjs` (unused vars), `test/subject-encode.test.mjs` (no-control-regex + unused var), `test/unsubscribe-route.test.mjs` (no-regex-spaces) — all in files untouched by this plan. | `npm run lint` 2026-11-06 | Out of scope; the two errors in phase-43 files (unused `ROOT` import) were fixed. |
