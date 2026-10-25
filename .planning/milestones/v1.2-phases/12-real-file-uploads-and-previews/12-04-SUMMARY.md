---
phase: 12-real-file-uploads-and-previews
plan: 04
subsystem: docs/i18n
tags: [i18n, error-codes, operator-docs, phase-gate, e2e]
requires: ["Phase 12 plans 01–03 shipped (upload endpoint, file serving, client XHR/preview/deep-link)", "err.uploadTooLarge / err.fileNotFound catalogued", "MAX_BODY_BYTES documentation shape (phase 11)"]
provides: ["Verified I18N-01 contract over the whole phase", "Green phase gate: npm run build + npm test + npm run e2e", "MAX_UPLOAD_MB documented in .env.example + DEPLOY.md", "DATA_DIR/files/ backup guidance in DEPLOY.md", "Retired metadata-only limitation retracted from README"]
affects: [/gsd-verify-work (UAT for I18N-01), /gsd-ship]
tech-stack:
  added: []
  patterns: [negative-grep doc verification, allowlisted client-only error codes]
key-files:
  created: []
  modified: [.env.example, DEPLOY.md, README.md]
decisions:
  - "Task 1 needed no code change: the 12-01/12-03 commits had already added every new literal and both new error codes to both catalogues — the task ran as a verification-only sweep and the phase gate confirmed it"
  - "README rewording avoids the literal phrase 'metadata only' so the plan's negative-grep verify stays honest while still explaining the demo's metadata-only storage"
  - "Pre-existing lint/format failures in unrelated files (e2e/locale.spec.mjs, server.js, docs) left untouched — out of scope per the plan's conditional lint check"
metrics:
  duration: ~2 min
  completed: 2026-10-24
  commits: 1
plan_head_before: 553331037c7e7af1a6228d9d416ae39a39b147ab
plan_head_after: 1cc665d
actuals:
  tokens: 1000
  tasks: 2
  commits: 1
status: complete
---

# Phase 12 Plan 04: Catalogue completeness, operator docs and phase gate Summary

**One-liner:** the i18n/error-code contract verified green over the whole phase, `MAX_UPLOAD_MB` documented for operators with `DATA_DIR/files/` backup guidance, the retired "file contents are metadata only" limitation retracted, and the full phase gate (build + 442 tests + 43 e2e) passing.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Catalogue completeness + phase gate (I18N-01) | — (verification-only; no diff to commit) |
| 2 | Operator docs — MAX_UPLOAD_MB + limitation retraction | 1cc665d |

## What Was Built

- **Task 1 — I18N-01 sweep:** extracted every `fail(res, …, '<code>')` / `httpError(…, '<code>')` literal from server.js and confirmed each has a non-empty `err.<code>` entry in both `src/locales/en.json` and `src/locales/fr.json` — `err.uploadTooLarge` ("File too large" / "Fichier trop volumineux") and `err.fileNotFound` ("File not found" / "Fichier introuvable") both present (lines 1483–1484 of each catalogue). The reverse-parity allowlist in `test/error-codes.test.mjs` already covers the client-composed `err.serverUnreachable` used for network failure — no allowlist change needed. The i18n scan (run inside `npm run build`) found zero uncatalogued literals from plans 01–03's upload toasts, preview-modal text and download tiles. No gaps → no fill commit.
- **Task 2 — Operator docs:** `.env.example` gains `MAX_UPLOAD_MB=25` next to `MAX_BODY_BYTES` with a units/default/independence comment (uploads stream the raw body, not JSON). DEPLOY.md documents the knob after the `MAX_BODY_BYTES` paragraph (megabytes, applies to `POST /w/:slug/files` only, independent of the JSON cap) and adds it to the dotenv block; § Backups now states `--backup` covers the SQLite database only and that uploaded binaries under `DATA_DIR/files/` must be included in the backup set (the `docker cp`-based script does not cover them). README.md replaces the retired limitation with a positive "File uploads are real" paragraph (real binaries under `DATA_DIR/files/`, 25 MB default cap, image/PDF previews, `/w/:slug/file/:id` links) and clarifies the browser-only demo stores records without binaries. All other limitations untouched (T-12-11 mitigated).

## Verification

- `npm run build` → exit 0, i18n scan clean
- `npm test` → 442 pass, 0 fail (error-code parity + PREVIEW-01 static guard included)
- `npm run e2e` → 43 pass, 0 fail (phase gate re-run at the end: 39 pre-existing + Phase 12 cases in en/fr)
- `grep -q MAX_UPLOAD_MB .env.example && grep -q MAX_UPLOAD_MB DEPLOY.md && ! grep -qi "metadata only" README.md` → OK
- `grep -c "uploadTooLarge\|fileNotFound"` ≥ 2 in each catalogue → OK
- `npm run lint` / `npm run format:check`: failures are pre-existing in unrelated files (`e2e/locale.spec.mjs`, `server.js`, `docs/*.md`); none in this plan's modified files

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written.

**Note:** Task 1 produced no diff: the catalogue entries it was written to guarantee were already added by plans 12-01 and 12-03, so the task completed as a verification-only pass with the phase gate as its deliverable.

## Self-Check: PASSED

- `.planning/phases/12-real-file-uploads-and-previews/12-04-SUMMARY.md` — FOUND
- Commit `1cc665d` (docs 12-04) — FOUND
- All verification commands ran green as recorded above
