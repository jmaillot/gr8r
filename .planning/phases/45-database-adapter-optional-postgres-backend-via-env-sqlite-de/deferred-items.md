# Phase 45 — Deferred / Out-of-Scope Items (discovered during execution)

## From 45-05 execution

1. **[RESOLVED 2026-11-07, milestone v1.10 debt pass] Full-suite i18n-catalogue + SPA deep-link flake.**
   Originally: `npm test` failed 4–5 tests in the full parallel run (catalogue hold at
   1552 keys + deep-link route ordering), pass standalone, pre-existing at baseline 64760a8.
   Resolution: two consecutive clean full-suite runs on main (1126 tests, 1112 pass,
   0 fail, 14 skipped — catalogue hold now pinned at 1710 keys after Phase 48's
   catalogue update; targeted run of catalogue.test.mjs + file-route-ordering.test.mjs
   29/29). The failure mode was the intermediate catalogue state during 45-05 execution,
   not a latent harness bug. No code change needed.

2. **[Fixed in 45-05, noted for pattern] totp-rewrap backup-failure fixture missed the
   Phase-43 logos dir** (commit 266cbdc). Other boot-minted fixtures may silently
   assume only `DATA_DIR/files`; any future boot-minted directory must be pre-created
   in unwritable-DATA_DIR fixtures.

3. **ensureColumn defs stay `integer` on pg.** The additive ensureColumn defs in
   server.js (e.g. `sessions.last_seen_at integer`) are not epoch-widened to bigint.
   Harmless today: a fresh pg boot creates all columns via pgSchemaVariant (bigint),
   so ensureColumn no-ops; no legacy pg databases exist. If a pg DB is ever restored
   from a partial schema, epoch defs would need the same name→bigint mapping.
  status: acknowledged
