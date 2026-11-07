---
phase: 43-workspace-logo
plan: 01
subsystem: server
tags: [logo, upload, routes, security, i18n]
requires: [LOGO-01]
provides:
  - POST/DELETE/GET /w/:slug/logo routes (public session-free GET)
  - workspacePayload.logo versioned URL field
  - LOGOS_DIR storage (DATA_DIR/logos)
  - err.invalidLogo / err.logoNotFound codes EN+FR
affects:
  - 43-02 (all render surfaces consume payload.logo + the public URL)
  - digest email builder (43-02)
tech-stack:
  added: []
  patterns:
    - intercept-chain byte route (before serveStatic, Pitfall 1)
    - route-private mime map (FILE_INLINE_MIME untouched)
    - magic-byte sniffing (~15 lines, D-13 no deps)
    - updateDoc + wsRevision revision-return contract
key-files:
  created:
    - test/workspace-logo.test.mjs
  modified:
    - server.js
    - src/locales/en.json
    - src/locales/fr.json
    - test/i18n-core-features.test.mjs
decisions:
  - svg magic-byte sniff tightened to `<?xml`/`<svg` prefixes (plan said bare leading `<` — that would admit <!DOCTYPE html> bodies; needed to satisfy test (d))
  - logo filenames are bare uid() under LOGOS_DIR (ext lives in the doc; containment via path.dirname check)
  - old logo file unlinked AFTER updateDoc success on replace (D-09 no-orphan on both paths)
metrics:
  duration: 24m
  completed: 2026-11-06
status: complete
commits: 2
plan_head_before: 3c6cdedbc84780e70787b2a4def41486f1324c92
plan_head_after: 0cfa89f
actuals:
  tokens: 64000
  tasks: 2
  commits: 2
---

# Phase 43 Plan 01: Workspace Logo — Server Storage & Serving Summary

**One-liner:** Owner/Admin-gated POST + DELETE `/w/:slug/logo` with a public session-free GET serving png/jpg/svg at fixed mime with immutable cache and svg sandbox CSP, logo reference riding the workspace doc with versioned payload URLs — zero new dependencies.

## What Was Built

1. **Storage** — `LOGOS_DIR = DATA_DIR/logos` (mkdir in openDb), bare-uid filenames, ext + uploaded_at + file id on `doc.data.logo` (D-01/D-08).
2. **POST /w/:slug/logo** — sameOrigin → `requireWorkspace(slug,'admin')` → `uploadBinary` (MAX_UPLOAD cap, mid-stream 413, WR-05 drain) → server-side magic-byte sniff (png `89 50 4E 47 0D 0A 1A 0A`, jpg `FF D8 FF`, svg `<?xml`/`<svg`) → 400 `invalidLogo` on mismatch → `updateDoc` → `{ logo, revision }` (Pitfall 2). Replace unlinks the previous file after the doc write succeeds (D-09).
3. **GET /w/:slug/logo** — public, session-free (D-02): fixed mime from the server-verified stored ext, `nosniff`, `Cache-Control: public, max-age=31536000, immutable`, sandbox CSP on svg, identical 404 `logoNotFound` for unknown slug and unset logo (never a 302, D-10), `?v=` ignored for lookup (D-11), path.dirname containment (T-43-06). Intercepted BEFORE serveStatic / `/api/` (Pitfall 1).
4. **DELETE /w/:slug/logo** — same gate; unlinks file + clears doc, revision in response; 404 when unset. Workspace DELETE handler unlinks the doc's logo alongside the row purge (D-09/A4).
5. **workspacePayload.logo** — `{ url: '/w/:slug/logo?v=<uploaded_at>', ext, uploaded_at }` via the single `logoShape` builder; null when unset (D-10/D-11).
6. **i18n** — `err.invalidLogo` + `err.logoNotFound` catalogued EN+FR; `npm run i18n:scan` green.
7. **Tests** — `test/workspace-logo.test.mjs`: 11 tests pinning the whole contract (public no-cookie GET fixed mime + SPA-fallback regression, member 403 adminOnly, cross-origin 403, html→400 invalidLogo, 404-not-302, svg sandbox CSP, restart survival SC-1, replace leaves one file, DELETE removes bytes + 404, workspace delete leaves zero orphans, revision in POST/DELETE).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SVG magic-byte sniff tightened to `<?xml`/`<svg` prefixes**
- **Found during:** Task 1
- **Issue:** The plan's sniff spec ("svg leading `<`") would accept `<!DOCTYPE html>` bodies as svg, making test (d) (html→400 invalidLogo) unsatisfiable and admitting HTML masquerading as images (Pitfall 7 / T-43-01).
- **Fix:** `sniffLogoExt` accepts only `<?xml` or `<svg` prefixes for svg.
- **Files modified:** server.js
- **Commit:** 2df1f60

**2. [Rule 1 - Bug] i18n catalogue count 1676 → 1678**
- **Found during:** Task 2 (full-suite verification)
- **Issue:** The two new catalogued keys broke the hard-coded catalogue-size assertion in `test/i18n-core-features.test.mjs` (file outside the plan's `<files>` list).
- **Fix:** Assertion updated to 1678 with a 43-01 comment; documented here as the one deviation from the "only the four files" acceptance criterion.
- **Files modified:** test/i18n-core-features.test.mjs
- **Commit:** 0cfa89f

### Tracer Feedback Gate
Task 1 is `type="tracer"`; the automated verify chain (`node --test test/workspace-logo.test.mjs && node --test test/error-codes.test.mjs && npm run i18n:scan`) was re-run end-to-end green before expansion (⚡ Tracer verified end-to-end — expanding).

## Out-of-Scope Discoveries (documented, not fixed)

See `deferred-items.md` in this directory: (1) `test/totp-rewrap.test.mjs` D-74 test fails at HEAD before any phase-43 change (EACCES on its read-only DATA_DIR strategy — verified by reverting server.js); (2) 10 pre-existing lint errors in mailer.js / digest / subject-encode / unsubscribe-route tests. Both pre-existing at `plan_head_before`.

## Verification

- `node --test test/workspace-logo.test.mjs` — 11/11 pass
- `node --test test/error-codes.test.mjs` — 24/24 pass (new codes catalogued EN+FR)
- `node --test test/file-route-ordering.test.mjs` — 3/3 pass (intercepts did not disturb the byte-route chain)
- `npm run i18n:scan` — green (0 pending/unlisted/stale)
- `npm test` — 997 pass / 2 fail / 3 skips; the 2 failures are the pre-existing totp-rewrap D-74 (reproduced at HEAD) and nothing phase-43 related
- `grep -c FILE_INLINE_MIME server.js` — map untouched (4th occurrence is the prohibition comment only)
- Zero new runtime dependencies (package.json untouched)

## Threat Model Compliance

| Threat | Mitigation | Status |
|--------|-----------|--------|
| T-43-01 | magic-byte validation; stored ext decides mime; client Content-Type never read | ✅ pinned by tests (c)(d) |
| T-43-02 | route-private LOGO_MIME + sandbox CSP on svg; FILE_INLINE_MIME untouched | ✅ pinned by test (f) |
| T-43-03 | sameOrigin before body read + admin gate → 403 | ✅ pinned by tests (b)(c) |
| T-43-04 | identical 404 unknown-slug / unset-logo | ✅ pinned by test (e) |
| T-43-05 | uploadBinary mid-stream 413 + drain unchanged | ✅ reused verbatim |
| T-43-06 | slug regex + uid filenames + path.dirname containment | ✅ mirrored from 5186 |

## Self-Check: PASSED

- server.js, test/workspace-logo.test.mjs, src/locales/{en,fr}.json changes present in commits 2df1f60, 0cfa89f
- test/workspace-logo.test.mjs exists on disk, 11/11 green
- commits measured from ledger `gsd-plan-head-before-43-01`: 2 (3c6cded..0cfa89f)
