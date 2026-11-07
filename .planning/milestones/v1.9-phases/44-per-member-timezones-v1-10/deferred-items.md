
## Deferred during 44-01 execution (2026-11-06)

- [pre-existing, out of scope] test/totp-rewrap.test.mjs "D-74: a failed pre-migration backup…" fails at plan 44-01 start
  (verified identical failure at pre-plan commit c5e7669). Phase 43 (D-01) added `fs.mkdirSync(LOGOS_DIR)` to openDb
  (server.js ~363); the D-74 fixture pre-creates only `files/` in the 0o555 DATA_DIR, so boot now dies on
  `mkdir .../logos` EACCES before the backup-failure path is reached. Fix: the D-74 fixture must also pre-create
  `logos/` next to `files/`. Not touched by 44-01 (scope boundary).
  status: acknowledged
