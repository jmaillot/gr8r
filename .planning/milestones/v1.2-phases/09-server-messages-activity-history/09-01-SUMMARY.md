# Plan 09-01 Summary

## Status: DONE

**Date:** 2026-10-24
**Commits:**
- `4f7cc34` feat(09-01): fail() helper, httpError code param, auth family conversion + parity test
- `36fe4d7` feat(09-01): convert remaining error sites to codes + full err.* catalogue
- `1dfab9b` test(09-01): no-survivor scan + catch-site shape assertions (ERR-01)

## What was built

The server error path (ERR-01) is instrumented end to end. Every HTTP error response built in
`server.js` now carries a stable camelCase machine `code` beside its unchanged English `error`
message, through a single `fail(res, status, code, message, extra)` helper and a third argument
on `httpError()`. All ~58 inline `json(res, <status>, { error: … })` sites were converted; the
three catch sites transfer `err.code`, the catch-all 500 emits no `code` when the error has none,
and the invitation row error carries `code: 'emailSendFailed'`. The English messages are
byte-for-byte unchanged (prohibition respected).

## Catalogue

43 new `err.<code>` keys were added to both `src/locales/en.json` and `src/locales/fr.json`
(1525 total catalogue keys, verified by the pinned count test). Existing keys were reused where
the English matched (`err.workspaceChanged`, `err.inviteInvalid`, `err.invalidEmail`,
`err.readOnlyAccess`); no key duplicates were created for the same message. French values use
proper typography (U+2019 apostrophes, U+00A0 inside guillemets) and sit at mirror positions of
the English order.

## Tests

`test/error-codes.test.mjs` (new, 5 tests):
1. Static parity — every code extracted from `server.js` (regex over `fail()` and `httpError()`
   3rd arguments) has a non-empty `err.<code>` entry in BOTH catalogues.
2. Integration on a real server — failed login → 401 with byte-identical English message and
   `code: 'invalidCredentials'`; weak signup → 400 with `code: 'passwordTooWeak'`.
3. No-survivor scan — no inline `json(res, <status>, { error:` survives in `server.js`.
4. Catch-site shape — exactly 3 `code: err.code` occurrences and 1 `row.code = 'emailSendFailed'`.

Full suite: **396 tests, 0 failures** (up from 391). `npm run build` passes (i18n-scan prebuild
green, no new client display literals).

## Verification status

- ✅ `node --test test/error-codes.test.mjs` — 5/5 pass
- ✅ `npm test` — 396/396 pass (real servers)
- ✅ `npm run build` — passes (prebuild i18n-scan clean)
- ⚠️ `npm run lint` — 3 pre-existing errors in `test/locale-negotiate.test.mjs` (no-undef
  `document`) and `test/server-boot.test.mjs` (no-regex-spaces) — files untouched by this plan.
- ⚠️ `npm run format:check` — 10 pre-existing unformatted files, none touched by this plan.

## Deviations

- The catalogue count test (`test/i18n-core-features.test.mjs`) was updated from 1482 to 1525
  keys to reflect the 43 new `err.*` additions (test name updated to match).
- The Task 1 keys block was briefly duplicated in both locale files during execution; the
  duplicate block was removed and the file re-verified (key count and parity test green).
- Pre-existing lint/format failures in unrelated test files were left untouched (out of scope).

## Next steps

Plan 09-02 (client translation of error codes via `src/core/api.js`) and 09-03 (machine activity
verbs) can now consume the codes emitted here.
