---
phase: 12-real-file-uploads-and-previews
plan: 02
subsystem: server
tags: [file-serving, security-headers, content-disposition, deletion, error-codes, i18n, integration-tests]
requires: [FILES_DIR, requireWorkspace, uploadBinary (12-01), doc-PUT revision transaction]
provides: ["GET/HEAD /w/:slug/file/:id binary route", "serveFileBinary + D-06 fixed Content-Type map", "RFC 6266 filename sanitizer", "doc-PUT binary-delete diff (D-04)", "err.fileNotFound stable code"]
affects: [12-03 (client fetches published URLs), 12-04 (previews embed inline types)]
tech-stack:
  added: []   # zero-runtime-dependency guarantee held
  patterns: [route-local header set instead of securityHeaders(), fixed mime allow-list, post-commit unlink with swallow-and-log]
key-files:
  created: []
  modified: [server.js, src/locales/en.json, src/locales/fr.json, test/upload.test.mjs, test/i18n-core-features.test.mjs]
decisions:
  - "Route-local header set: inline types get CSP frame-ancestors 'self' and no X-Frame-Options; attachment types get nosniff only (Pitfall 2)"
  - "Filename sanitizer strips CR/LF/quotes/control chars but keeps spaces/colons (legal inside the quoted RFC 6266 value); test asserts the exact sanitized header"
  - "Binary unlink runs after the revision commit, guarded by an /^[A-Za-z0-9_-]+$/ id check; ENOENT is success, other errors are logged and swallowed"
metrics:
  duration: ~15 min
  completed: 2026-10-24
  commits: 2
plan_head_before: ccea4a0b56d571ce2be42128a6abc7b408e38621
plan_head_after: 5f247a2
actuals:
  tokens: 24000
  tasks: 2
  commits: 2
status: complete
---

# Phase 12 Plan 02: File serving route + binary delete diff Summary

**One-liner:** `GET /w/:slug/file/:id` serves stored bytes to workspace members behind the D-06 fixed-mime inline/attachment policy with Accept-header SPA negotiation (D-13), and the doc-PUT handler now unlinks dropped file binaries after commit (D-04) — no orphans, no existence oracle.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | File route — Accept negotiation, safe headers, 404-on-unauth (UPLOAD-03/04) | 874c5fa |
| 2 | Doc-PUT binary-delete diff (D-04, UPLOAD-05) | 5f247a2 |

## What Was Built

- `server.js` dispatcher: `GET/HEAD /w/:slug/file/:id` branch intercepted **before** serveStatic (Pitfall 1); `Accept: text/html` delegates to `serveStatic` so the SPA bootstraps and `applyDeepLink` opens the preview (D-13), everything else reaches `serveFileBinary`.
- `serveFileBinary`: `requireWorkspace('viewer')` (D-05) → record lookup in the stored doc's `data.files` (auth + existence in one check) → path-traversal guard (`path.dirname(path.join(FILES_DIR, id)) === FILES_DIR`, T-12-02) → missing record/binary both return 404 `fileNotFound` with no oracle (T-12-03).
- D-06 header policy (T-12-01): png/jpg/jpeg/gif/webp/pdf inline with real mimes + route-local CSP `frame-ancestors 'self'` (T-12-06, no `X-Frame-Options: DENY`); svg and everything else `application/octet-stream` + `Content-Disposition: attachment` (txt/md/csv → text/plain, still attachment); `X-Content-Type-Options: nosniff` always; bytes streamed via `fs.createReadStream`, HEAD honored.
- T-12-08: `fileDisposition()` RFC 6266 sanitizer — strips CR/LF/quotes/control chars, emits `filename="<ascii>"` + `filename*=UTF-8''<percent-encoded>`.
- Doc-PUT diff (D-04): stored vs committed `data.files` ids computed inside the revision transaction; after commit, disappeared ids are unlinked (id validated against `[A-Za-z0-9_-]+`, ENOENT = success, other errors logged and swallowed). Strict same-PUT diff — no orphan sweep.
- `err.fileNotFound` added to both catalogues (1531 keys, i18n pin updated).

## Verification

- `node --test test/upload.test.mjs test/error-codes.test.mjs -x` → 29 pass, 0 fail
- `node --test test/upload.test.mjs -x` → 6 pass, 0 fail
- `npm test` full suite → 441 pass, 0 fail
- `npm run build` → green (locales flow into the client bundle)
- `grep -c "fileNotFound" src/locales/en.json src/locales/fr.json` → 1 each
- No new dependency in package.json

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test bug] Over-strict header-injection assertion**
- **Found during:** Task 1
- **Issue:** The injection test first asserted colons and then quotes are absent from Content-Disposition — but the quoted `filename="…"` syntax itself contains quotes, and spaces/colons are legal inside a quoted-value, so the test failed against a *correct* sanitizer.
- **Fix:** Test now asserts the exact expected sanitized header string plus that no injected header exists — matching the T-12-08 spec (strip CR/LF/quotes/control chars from the value).
- **Files modified:** test/upload.test.mjs
- **Commit:** 874c5fa

## Known Stubs

None — no placeholder data paths introduced.

## Self-Check: PASSED

- test/upload.test.mjs (6 tests) and both commits 874c5fa / 5f247a2 verified present on HEAD.
