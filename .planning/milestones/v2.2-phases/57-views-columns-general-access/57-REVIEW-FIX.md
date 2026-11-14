---
phase: 57-views-columns-general-access
fixed_at: 2026-11-12
review_path: .planning/phases/57-views-columns-general-access/57-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 57: Code Review Fix Report

**Fixed at:** 2026-11-12
**Source review:** 57-REVIEW.md
**Scope:** warnings (WR-01..WR-04) + all four info findings (fixed opportunistically — all were small, mechanical and verified)
**Verification:** full unit suite `npm test` → 1439 pass / 0 fail (was 1437; +1 IN-02 drift pin, +1 IN-05 entry-chunk pin), and `node --test test/build-chunk-size.test.mjs` → 11 pass / 0 fail. Gates ran in the MAIN checkout (`workflow.use_worktrees=false`), so the numbers are reproducible from the working tree. No i18n keys were added, so `scripts/i18n-scan.mjs` was not needed.

## Fixed Issues

### WR-01: View name interpolated through `t()` without HTML escaping

**Files modified:** `src/views/savedViewsUi.js`
**Commit:** 41f6c3d
**Applied fix:** escaped the name at all three HTML-producing call sites, matching the module's own discipline (i18n.js documents "never escapes HTML; the caller interpolates through escHtml"): the `aria-label` in `popHtml` (line 35), the `updateTableViewConfirm` body (line 86) and the `saveTableViewReplace` body (line 100). `esc` was already imported. Toast messages needed no change — `toast()` escapes `msg` itself (toast.js:15), and `esc()` in confirm bodies matches the established pattern (actions.js:2805).

### WR-02: `hydrateViews` can install an empty view state object

**Files modified:** `src/core/viewSync.js`
**Commit:** 25e3979
**Applied fix:** the adoption line now sanitizes first and only adopts a NON-empty blob, merged over `viewOf(key)` so the hardcoded defaults survive any field the blob omits:
`const live = r.ok ? sanitizeViewBlob(r.data?.views?.live) : null; if (live && Object.keys(live).length) S.views[key] = { ...viewOf(key), ...live };`
This restores the D-13 "absent key → defaults" contract for a lenient-normalized `live: {}` blob and un-breaks downstream `v.hidden` / `v.group` dereferences.

### WR-03: Live view row has no blob size cap

**Files modified:** `server.js`
**Commit:** acf00af
**Applied fix:** the live-row merge branch (`PUT /api/me/views` without a name) now applies the same 2 kB byte cap as a named row — `Buffer.byteLength(JSON.stringify(clean))` over the MERGED, whitelisted blob returns `413 viewBlobTooLarge`. Same constant (`NAMED_VIEW_BLOB_MAX_BYTES`), same keyed error so the client's `t('err.viewBlobTooLarge')` path just works.

### WR-04: `migrateUserViews` can never run on pg

**Files modified:** `server.js`
**Commit:** bd59d9a
**Applied fix:** on `backendKind === 'pg'` (already imported at server.js:82) the migration skips the sqlite-only backup (`wal_checkpoint` + `vacuum into` can never run there) and proceeds with the row-insert + doc-strip as ONE transaction, logging that it runs without a file backup. On sqlite the existing no-backup-no-mutation gate is unchanged. This completes the D-06 migration on both backends instead of silently degrading to "strip doc.views and lose every workspace's view state". The function's doc comment now states the pg exception.

### IN-01: Unhandled promise rejection on lazy chunk imports

**Files modified:** `src/actions/actions.js`
**Commit:** e2012a2
**Applied fix:** added `.catch(() => {})` to the views-popover import (`refreshViewsPop`), the four savedViewsUi handler delegations, and the `hydrateViews` export — a failed chunk load (offline flake, deploy invalidating the chunk hash) now degrades silently instead of rejecting unhandled, consistent with the app's other lazy seams.

### IN-02: View whitelist constants duplicated client/server with no drift pin

**Files modified:** `test/saved-views.test.mjs`
**Commit:** 5b6de88
**Applied fix:** added a drift test in the existing saved-views suite (the NO-IMPORTS client/server split forbids a shared module): it string-scans `server.js` and asserts `VIEW_BLOB_KEYS`, `NAMED_VIEW_MAX`, `NAMED_VIEW_BLOB_MAX_BYTES` and `NAMED_VIEW_KEYS` equal the client exports from `src/core/savedViews.js`, in the DEFAULT_OPTIONS drift-pin style of export-client.test.mjs. A one-sided guardrail edit now fails a test instead of shipping silently.

### IN-03: GET /api/me/views mutates storage

**Files modified:** `server.js`
**Commit:** 523663c
**Applied fix:** comment-only (as the review itself recommends): the `viewsBody` doc comment now carries an explicit INVARIANT note — the read path is also the migration write-back path, so GET is non-idempotent by design, and a read-replica/caching layer must not be introduced without moving that write-back off GET.

### IN-04: Mis-indented `await hydrateViews()` lines

**Files modified:** `src/actions/actions.js`
**Commit:** b31c0da
**Applied fix:** re-indented the three mis-indented call sites (join flow, password change, sign-in/sign-up flow) to match their surrounding block indentation. Cosmetic; behavior unchanged (`node --check` passes).

### Bonus: entry-chunk build gate pin (user-requested scope extension)

**Files modified:** `test/build-chunk-size.test.mjs`
**Commit:** 18f085b
**Applied fix:** the DELIV-02 gate capped every chunk but never asserted the ENTRY chunk exists; added "the build emits an entry index chunk within the 500 kB gate" (existence + ≤500 kB bytes-on-disk), the requested "pin the index chunk size" fix.

## Skipped Issues

None — all 8 findings were fixed.

---

_Fixed: 2026-11-12_
_Fixer: gsd-code-fixer (worktrees disabled per `workflow.use_worktrees=false` — edits and commits on `main` directly)_
_Iteration: 1_
