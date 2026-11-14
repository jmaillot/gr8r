---
phase: 60-admin-dashboard-member-self-view
plan: 01
subsystem: server-api
tags: [dashboard, visibility, aggregates, trn, admin-gate]
requires: [Phase 52 transparency funnel (memberCanReadProject/projectAccessReason/teamsOfMember), requireWorkspace gate, tz.js date funnel, visibility fixture]
provides: [GET /api/workspaces/:slug/dashboard (admin aggregate), GET /api/workspaces/:slug/me/visibility (member self-view), err.badActivityWindow catalogue key]
affects: [60-02 (client dashboard page + settings self-view section consume these endpoints)]
tech-stack:
  added: []
  patterns: [Phase 52 route gate order (requireWorkspace → sameOrigin → fail before parse), raw-doc read inversion (power-admin ruling), tz.js localParts server date anchor]
key-files:
  created: [test/dashboard.test.mjs, test/self-visibility.test.mjs]
  modified: [server.js, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs]
decisions:
  - "Self-view minRole 'viewer' (plan text said 'member' but its own acceptance criterion + D-11 'any member' require viewer→200; internal contradiction resolved toward acceptance)"
  - "Server date anchor = tz.js localParts('') (resolveTz default zone) — the due-reminder funnel's own helper, string 'YYYY-MM-DD' compares as the reminder pass uses"
  - "Load counts every OPEN task's assignees[] (overdue included), doc members only, count desc"
  - "activityWindow whitelisted {24h,7d,30d} default 7d, keyed 400 badActivityWindow before any doc work"
metrics:
  duration: ~15 min
  completed: 2026-11-13
  tasks: 3
actuals:
  tokens: 134000
  tasks: 3
  commits: 5
commits: 5
plan_head_before: 0fee0ff69546cf2fee463ed9b2065e798956a99b
plan_head_after: 3e0d91b0a6be11f4565636d05bd317320ee74310
status: complete
---

# Phase 60 Plan 01: Dashboard + Self-Visibility Server Routes Summary

**One-liner:** Two read-only routes in server.js — the admin-gated four-panel aggregate dashboard computed over the RAW stored doc (power-admin ruling, exact-403 matrix) and the member self-view of the Phase 52 visibility funnel (byte-level TRN-02 redaction) — locked by 34 new tests with hand-derived fixture expectations.

## What Was Built

- **`GET /api/workspaces/:slug/dashboard`** (admin): Phase 52 gate order verbatim (requireWorkspace 'admin' → sameOrigin → fail() before any doc parse). Parses the RAW `ctx.ws.doc` — the deliberate docForClient inversion per the power-admin ruling, documented in a route comment. Four aggregates in one payload:
  - `overdue`: groups per project (`projectId/projectName/tasks[{key,name,due}]`), groups sorted oldest-dueDate first, tasks ascending (D-10); mirrors store.js isOver semantics via tz.js `localParts` server anchor.
  - `load`: open tasks × `assignees[]` (array only), doc members only, `{memberId,name,count}` count-desc (D-07/DASH-02).
  - `upcoming`: today..+7d, flat, due-ascending, due-today boundary lands in upcoming not overdue (D-06).
  - `activity`: `?activityWindow=` whitelisted `24h|7d|30d` (default 7d), other values → keyed `400 badActivityWindow` before any doc work (T-60-03); rows filtered by `at`, sorted desc, machine verbs on the wire.
- **`GET /api/workspaces/:slug/me/visibility`** (any member incl. viewer): the Phase 52 funnel loop verbatim (memberCanReadProject → projectAccessReason ?? 'member' → single-teamName block), scoped to `ctx.membership.member_id`; teamsOfMember resolved once per request from the membership row. Response `{ projects }` — no member echo, no granter field (TRN-01/02, D-11/D-13).
- **Tests** (anti-tautology — zero imports from server.js): `test/dashboard.test.mjs` (13 tests: 403/200 gate matrix incl. unauthenticated 401, private-project power-admin proof with real private name on the wire, group/sort assertions, shared-task counting, done-task exclusion per panel, due-today boundary, activity window matrix + keyed 400); `test/self-visibility.test.mjs` (8 tests: per-actor VISIBILITY_MODEL/SELF_MODEL_ADMIN2 parity, exact entry shapes, byte-level needle scans of other actors' ids/names/emails, viewer 200, doconly 404, no-granter proof).

## Verification

- `node --test test/dashboard.test.mjs test/self-visibility.test.mjs` — 21 pass, 0 fail
- `npm test` — 1522 tests, **1510 pass / 0 fail** (full suite)
- `npm run lint` — clean; `node scripts/i18n-scan.mjs` — 0 dead / 0 stale
- `grep -n docForClient server.js` — zero occurrences in the dashboard route block

## Deviations from Plan

**1. [Rule 1 — internal contradiction] Self-view minRole 'viewer', not 'member'.**
- **Found during:** Task 3
- **Issue:** Plan Task 3 action says minRole 'member', but its own acceptance criterion requires "viewer actor receives 200 (self-view is any-member)", and D-11/CONTEXT say "reachable by any member" — ROLE_RANK would 403 a viewer under minRole 'member'.
- **Fix:** `requireWorkspace(..., 'viewer')` (everyone with a membership passes).
- **Files:** server.js · **Commit:** b6d9828

**2. [Rule 1 — gate] `err.badActivityWindow` catalogue entries + catalogue-size pin bump.**
- **Found during:** overall verification (`npm test` — error-codes gate caught the missing EN/FR entry; i18n-core-features pins the exact catalogue size).
- **Fix:** EN+FR strings added; pin 1866→1867 with Phase 60 changelog annotation.
- **Files:** src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs · **Commits:** aaf393b, 3e0d91b

**3. [Assumption] "Empty-reachability actor gets {projects:[]}" not directly testable** — every fixture actor with a membership reaches the publics (p_legacy is public per the un-honored access model); the closest cell, m_doconly (no memberships row), 404s at the gate and is tested as such.

## Known Stubs

None — both routes return fully computed payloads; the three scaffolding empty arrays from Task 1 were filled in Task 2 and the scaffold test upgraded to assert all four panels non-empty.

## Threat Flags

None — no security surface beyond the plan's threat model was introduced. T-60-01/02/03 mitigations are all in place and test-pinned; T-60-SC honored (zero new packages).

## Self-Check: PASSED

- server.js dashboard + self-view route blocks: FOUND
- test/dashboard.test.mjs, test/self-visibility.test.mjs: FOUND
- Commits e02190f, 6f02f4f, b6d9828, aaf393b, 3e0d91b: FOUND in git log
