---
phase: 24-operator-audit-workspace-admin-tier
plan: 03
subsystem: server/audit + settings UI
tags: [audit-log, keyset-pagination, tier-scoping, snapshot-columns, settings-surface, i18n]
requires: [audit_log table + (created_at,id) indexes (24-01), admin-tier rows with workspace_id (24-02), isInstanceAdmin/membershipsOf, operator card precedent]
provides: [GET /api/audit-log (tier-scoped keyset read), api.auditLog, refreshAuditLog/auditVerbFilter/auditLoadMore, auditTrailCard, settings.audit.* keys EN+FR, AUD-03 test group]
affects: []
key-files:
  created: []
  modified: [server.js, test/audit-log.test.mjs, src/pages/settings.js, src/actions/actions.js, src/core/api.js, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs]
key-decisions:
  - "Verb filter compares only against the two fixed D-T1 verbs; any other value pushes a literal 0 predicate → 200 with zero rows, never a 400 (flagged assumption honored)"
  - "Admin visibility resolves the caller's admin-or-owner memberships directly (membershipsOf + ROLE_RANK ≥ admin) — the requireWorkspace pattern minus the route-nested slug; workspace_id IN (...) inherently excludes null rows"
  - "Pagination cursor is the 101st row: limit 101, serve 100, nextBefore = {created_at, id} of row 101, null when exhausted"
  - "The audit-trail card renders only when S.ui.auditTrail is non-null — a workspace-admin's 403 leaves the state null, which is the honest answer (D-V1: owner-facing section)"
  - "Unit tests re-seed operator-tier audit rows via withDb because the AUD-01 rollback-atomicity test recreates an empty audit_log mid-suite"
requirements-completed: [AUD-03]
duration: ~35 min (started ~16:05Z)
completed: 2026-10-31
commits: 4
plan_head_before: abcb21c8f66d05b13d1b1e39486998405f66d999
plan_head_after: 59f6e90
status: complete
estimate:
  tokens: 70000
actuals:
  tokens: 76000
  tasks: 2
  commits: 4
coverage:
  - deliverable: "Owner sees the operator/admin action trail beside the operator card, verb-filtered, with load-more (criterion 4)"
    kind: human_judgment
    rationale: "auditTrailCard() mounted at the sessions tab beside operatorCard(); chips call A.auditVerbFilter (page-1 reset), load-more appends via nextBefore (D-V2/D-V3). Visual behavior verified by code reading + full e2e suite green; no dedicated e2e spec was required by the plan."
  - deliverable: "Rows render purely from snapshot columns — deleted-user rows stay fully readable, no joins"
    kind: verification
    ref: "test/audit-log.test.mjs — 'AUD-03: deleted-user survival — trail rows render from snapshot columns after target deletion'"
    status: pass
  - deliverable: "Server-side tier scoping: operator all rows, admin own-workspace only, member 403 adminOnly; workspace_id null rows never served to non-operators (D-T3)"
    kind: verification
    ref: "test/audit-log.test.mjs — 'AUD-03: instance operator reads the whole trail…', 'AUD-03: workspace admin reads only their workspace rows…', 'AUD-03: plain member is refused — 403 adminOnly'"
    status: pass
  - deliverable: "Verb filter — one verb per query; unknown verb values return 200 with zero rows (flagged assumption)"
    kind: verification
    ref: "test/audit-log.test.mjs — 'AUD-03: verb filter — exactly one verb per query, unknown verbs match nothing (not a 400)'"
    status: pass
  - deliverable: "Keyset pagination — 100/page latest-first, non-null nextBefore until exhausted, no duplicates across pages"
    kind: verification
    ref: "test/audit-log.test.mjs — 'AUD-03: keyset pagination — 100 per page, no duplicates, terminates with null nextBefore' (105 seeded rows walked)"
    status: pass
  - deliverable: "Read-only endpoint — no UPDATE/DELETE against audit_log introduced (T-24-02, D-A4)"
    kind: verification
    ref: "test/audit-log.test.mjs — 'D-A4: server.js contains no UPDATE or DELETE against audit_log' (static scan, re-runs every suite pass); handler contains only select statements"
    status: pass
  - deliverable: "api client method + actions + i18n parity (both catalogues carry every settings.audit.* key)"
    kind: verification
    ref: "npm run i18n:scan (0 literals/0 pending) && node --test test/catalogue.test.mjs test/error-codes.test.mjs test/audit-log.test.mjs (76/76)"
    status: pass
  - deliverable: "Wave gate npm test green"
    kind: verification
    ref: "npm test — 610/610 pass (after refreshing the surface snapshots: 34 api verbs, 1610 keys, 452 data-a, 77 data-v)"
    status: pass
  - deliverable: "Phase gate: full e2e suite green"
    kind: verification
    ref: "npx playwright test --config e2e/playwright.config.mjs — 87 passed (5.6m), incl. operator-revoke-cycle and admin-revoke-cycle EN+FR"
    status: pass
---

# Phase 24 Plan 03: Audit Trail Read (tier-scoped endpoint + owner Settings section) Summary

`GET /api/audit-log` now serves the append-only trail with server-side D-T3 tier scoping and stable keyset pagination, and the Settings sessions tab renders it beside the operator card — snapshot columns only, so rows against deleted users stay fully readable. Duration ~35 min, 2 tasks (RED→GREEN + UI/i18n), 10 files.

## Accomplishments

- `GET /api/audit-log` in server.js's API dispatch: sameOrigin → requireUser → server-side tier gate (operator: all rows via the D-112 flag; workspace admin/owner: `workspace_id IN (own admin-or-owner memberships)`; member: 403 `adminOnly`) → keyset `(created_at, id) < (before, beforeId)` desc limit 101 → `{ rows: [100], nextBefore }`. No throttle (D-121 read precedent), select-only (T-24-02/T-24-05)
- Verb filter compares against the two fixed D-T1 verbs only; unknown values yield a 200 with zero rows (flagged assumption — not a 400)
- AUD-03 test group (6 tests) in test/audit-log.test.mjs: tier visibility (incl. null-workspace exclusion), member 403, verb filter + unknown-verb, 105-row pagination walk (no duplicates, terminates with null nextBefore), deleted-user survival via snapshots, plus the D-A4 append-only scan still gating
- Settings: `auditTrailCard()` beside `operatorCard()` — rows render actor name/email, verb badge (machine verb + human label), target snapshot, session count, IP, workspace id or em-dash, `ago()` timestamp; All/Operator/Admin filter chips (D-V2); load-more button only when `nextBefore` is non-null (D-V3)
- `api.auditLog(params)`, `refreshAuditLog()` (operator-flag gated, non-401 failures leave state null, 401 defers to D-28), `A.auditVerbFilter` (page-1 reset), `A.auditLoadMore` (APPENDS via the stored cursor — never replaces)
- `settings.audit.*` keys (11) in EN+FR; `npm run i18n:scan` clean

## Files Created/Modified

- Modified: `server.js` (read endpoint), `test/audit-log.test.mjs` (AUD-03 group), `src/pages/settings.js`, `src/actions/actions.js`, `src/core/api.js`, `src/locales/en.json`, `src/locales/fr.json`
- Wave-gate snapshot refreshes: `test/i18n-core-features.test.mjs` (34 api verbs, 1610 keys), `test/i18n-shell.test.mjs` + `test/i18n-toast.test.mjs` (452 data-a, 77 data-v)

## Key Decisions

- Admin scoping resolves memberships directly (`membershipsOf` + `ROLE_RANK ≥ admin`) rather than requireWorkspace — no route-nested slug exists on this auth-scoped read; the `workspace_id IN (...)` clause inherently excludes null rows
- Cursor is the 101st row (`limit 101`, serve 100), matching RESEARCH Pattern 2 exactly
- The card renders only when the fetch succeeded — a workspace admin's 403 leaves `S.ui.auditTrail` null (honest absence, D-V1)
- Unit tests re-seed operator-tier rows via `withDb` because the AUD-01 rollback test recreates an empty audit_log mid-suite

## Deviations from Plan

- **[Rule 3 - Blocker] Surface-snapshot tests refreshed (3 files):** `npm test` failed on the API verb count (33→34 — the new `auditLog` call site), catalogue key count (1599→1610 — 10 new `settings.audit.*` keys) and tree-wide data-a/data-v counts (450→452, 76→77 — two chips + load-more). Updated expected counts with per-wave comments — directly caused by this plan's additions, per the plan-02 precedent.
- **[Rule 1 - Bug, self-fix] French typography:** the new fr values initially used straight apostrophes and a plain space before `:`; corrected to typographic apostrophes (D-05) and `Cible :` with U+00A0. The french-typography test caught both.
- **[Rule 1 - Bug, self-fix] Test fixture ordering:** the first AUD-03 run failed because the rollback-atomicity test wipes audit_log mid-suite — operator-tier rows had to be re-seeded (see Key Decisions). RED was confirmed before any implementation (all six AUD-03 tests failing on 404).

## Issues Encountered

None beyond the self-fixes above. All verify commands green: quick suites 76/76, `npm test` 610/610, full e2e 87 passed.

## Next: Phase complete, ready for /gsd-verify-work 24

AUD-01 (backbone), AUD-02 (admin tier) and AUD-03 (visible trail) are all in — the phase's requirement set is complete and the full unit + e2e gates are green.

## Self-Check: PASSED
