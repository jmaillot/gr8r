
## Plan 09-07 (2026-10-24)
- Pre-existing lint errors in unrelated test files, untouched per the scope boundary rule: test/locale-negotiate.test.mjs:76,79 (`document` no-undef — pre-existing since the file was created; test env missing a document global in eslint config) and test/server-boot.test.mjs:26 (no-regex-spaces). Both predate this plan; `npm run lint` reports 3 errors against them.
