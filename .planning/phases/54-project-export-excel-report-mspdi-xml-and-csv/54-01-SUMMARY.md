---
phase: 54-project-export-excel-report-mspdi-xml-and-csv
plan: 01
subsystem: project-export
tags: [export, csv, permissions, i18n, download]
requires: [canManageProject, docForClient, visibility fixture, i18n catalogue]
provides: [src/export/model.js, src/export/csv.js, src/core/download.js, POST …/projects/:id/export, export modal, two export entry points]
affects: [plans 02-05 writers, future xlsx/MSPDI formats]
tech-stack:
  added: []
  patterns: [DOM-free shared model, server-side format map, funnel-ordered route, source-contract client tests]
key-files:
  created: [src/export/model.js, src/export/csv.js, src/core/download.js, test/fixtures/export-fixtures.mjs, test/export-model.test.mjs, test/export-csv.test.mjs, test/export-route.test.mjs, test/export-client.test.mjs]
  modified: [server.js, src/overlays/modals.js, src/actions/actions.js, src/pages/project.js, src/overlays/context-menu.js, src/locales/en.json, src/locales/fr.json]
decisions:
  - model.js has ZERO imports (DOM-free) — all context via deps {translate, labelName, now}; writers never re-read the document (machine fields on every row)
  - export route reads ONLY docForClient (redacted doc); hidden-private and nonexistent ids return byte-identical 404s
  - scope counts in the modal are derived from buildExportModel itself — what you count is what you get
  - normalizeOptions: explicit true/false win, otherwise DEFAULT_OPTIONS stands (completed defaults ON)
  - thread lines run newest-first, matching latestComment
metrics:
  duration: 29 min
  completed: 2026-11-10
status: complete
actuals:
  tokens: 23000
  tasks: 3
  commits: 3
commits: 3
plan_head_before: a4af89167d502b18340f18928432d6360272a0d0
plan_head_after: 9f3ec70
---

# Phase 54 Plan 01: CSV Export Vertical Slice Summary

CSV export end-to-end: DOM-free export model + RFC-4180 CSV writer shared by all writers, permission-gated server route over the redacted document (403 without manage, byte-identical 404 parity), client modal with scope/toggle controls, static (no-server) mode, both entry points, EN+FR keys — 57 tests green, build + i18n gate clean.

## Coverage

- **T-54-01 (route)** — 9 integration tests on a real server seeded with the visibility fixture: lead 200 with full CSV headers; owner+admin 200; reader-without-manage 403 exportForbidden (no Content-Disposition); hidden-private and nonexistent id byte-identical 404; unknown/missing format 400 exportInvalidRequest; view-scope foreign ids filtered; 6000-id array clamped; unauthenticated denied.
- **T-54-02 (model)** — 22 unit tests: scoping, view-id ordering, manual order, five-toggle matrix (each toggle adds exactly its content), child composition invariant, kpis exclude children, overdue via injected now, plainText strips script WITH content, taskProgress parity with store.js, STATUS/PRIORITY drift gate, machine fields, injected translator.
- **T-54-03 (CSV/escaping)** — 12 writer tests: BOM, CRLF, RFC-4180 quoting of comma/quote/newline, `= + - @` neutralisation, `A & <B>` literal, toggle header widths, UTF-8 round-trip, static Blob-equivalent.
- **T-54-04/05 (client)** — 14 source-contract tests: exactly one exportOpen per surface, canManageProject guard at open/modal/submit, filename* parsed before filename, no xlsx/.mpp anywhere under src/, EN↔FR placeholder parity, static branch never calls the network.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] normalizeOptions coerced the `completed: true` default to false**
- **Found during:** Task 1 verify
- **Issue:** every option key was set via `options?.[k] === true`, losing the frozen default
- **Fix:** explicit true/false win, otherwise `DEFAULT_OPTIONS[k]` stands
- **Commit:** d79614f

**2. [Rule 1 - Bug] plainText kept script tag inner content**
- **Found during:** Task 1 verify
- **Issue:** `<script>alert(1)</script>` stripped tags but leaked the payload text (R12 violation)
- **Fix:** script blocks removed WITH their content before generic tag stripping
- **Commit:** d79614f

**3. [Rule 1 - Test] thread order + progress-base test expectations disagreed with the plan**
- **Found during:** Task 1 verify
- **Issue:** thread built oldest-first (plan: newest-first); progress averaged 2/12 including the archived row (plan: over exported top rows)
- **Fix:** thread reversed newest-first; progress expectation corrected to exported-row base
- **Commit:** d79614f

**4. [Rule 3 - Drift] header entry point placement**
- **Issue:** plan referenced a "Share button" that no longer exists (53-03 unified settings modal)
- **Fix:** export icon button inserted immediately before the settings gear, per orchestrator drift note
- **Commit:** b8aee75

## Auth Gates

None.

## Known Stubs

None — every export surface is wired; no placeholders, no TODOs.

## Threat Flags

None — the route surface matches the plan's threat model (format map server-side, filename allow-list, docForClient-only read, no-store + nosniff headers).

## Self-Check: PASSED

- All 8 created/modified key files exist on disk and are committed.
- Commits d79614f, b8aee75, 9f3ec70 present in git log on main.
- Final verification: 57/57 tests (4 suites), `node --check` on all touched JS, `npm run i18n:scan` clean, `npm run build` green.
