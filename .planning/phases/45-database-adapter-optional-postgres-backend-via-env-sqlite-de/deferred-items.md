# Phase 45 — Deferred / Out-of-Scope Items (discovered during execution)

## From 45-05 execution

1. **[Pre-existing, not fixed] Full-suite i18n-catalogue + SPA deep-link flake.**
   `npm test` fails 4–5 tests in the full parallel run: three `test/catalogue.test.mjs`
   assertions ("no catalogue key added an icon", the 1552-key catalogue hold) and
   `test/file-route-ordering.test.mjs` ("/w/:slug/task/:key deep-link path rides the
   SPA fallback"). Verified failing at baseline 64760a8 (before any 45-05 change);
   they pass standalone and only fail under full-suite parallelism. Unrelated to the
   DB layer — out of scope per the plan boundary; owner: i18n/test-harness follow-up.

2. **[Fixed in 45-05, noted for pattern] totp-rewrap backup-failure fixture missed the
   Phase-43 logos dir** (commit 266cbdc). Other boot-minted fixtures may silently
   assume only `DATA_DIR/files`; any future boot-minted directory must be pre-created
   in unwritable-DATA_DIR fixtures.

3. **ensureColumn defs stay `integer` on pg.** The additive ensureColumn defs in
   server.js (e.g. `sessions.last_seen_at integer`) are not epoch-widened to bigint.
   Harmless today: a fresh pg boot creates all columns via pgSchemaVariant (bigint),
   so ensureColumn no-ops; no legacy pg databases exist. If a pg DB is ever restored
   from a partial schema, epoch defs would need the same name→bigint mapping.
