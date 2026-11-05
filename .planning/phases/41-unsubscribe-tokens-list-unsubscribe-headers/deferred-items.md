# Plan 41-01 — Deferred Items

| Item | Type | Status | Notes |
|------|------|--------|-------|
| Concurrent-session working-tree contamination | out-of-scope discovery | open (belongs to the other session) | While this plan executed, a second session created/checked out `feat/landing-signup-redesign` (based exactly on plan HEAD 5c8bac4) and left uncommitted WIP: `src/pages/auth.js`, `src/views/table.js` (adds `export const probe = 'A literal that was never extracted'` at :88), `src/styles/pages/auth.css`, `public/logo-*.svg`, and uncommitted `page.auth.panelLine` keys in en/fr.json. This breaks `npm run i18n:scan` (1 unlisted literal in table.js:87) and `test/i18n-vocab.test.mjs` at SUMMARY time. NOT caused by 41-01: the full suite (963 tests, 960 pass / 0 fail / 3 skips) and i18n:scan were verified green at Task 1 commit a371e24 before the foreign WIP landed. Not fixed here per the scope boundary — the owning session must commit or clean its WIP. |

- 2026-11-05 (41-02): same concurrent-session contamination persisted during 41-02 execution — `test/i18n-scan.test.mjs` fails under `npm test` only while the foreign uncommitted `src/` WIP is present (proven green 36/36 with the WIP absent via a stash round-trip). Both 41-02 commits landed on `feat/landing-signup-redesign` (branch switched mid-execution, as in 41-01). Not fixed — out of scope; this plan's slice fully green.
