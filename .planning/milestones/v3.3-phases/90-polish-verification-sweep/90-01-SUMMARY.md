---
phase: 90-polish-verification-sweep
plan: 01
subsystem: governance-console
tags: [governance, super-admins, seg-control, i18n, promote-search]
requires:
  - GET /api/auth/operator/users payload (S.ui.operatorUsers, seed Option B — zero API change)
  - A.operatorPromote refetch reconcile (actions.js)
  - govOrphanTeardown / ROUTE_TEARDOWN.governance
provides:
  - superAdminsView seg-staged section (roster-first + promote-search + roles relocation)
  - S.ui.govSuperSeg / S.ui.govSuperShown staged state + A.govSuperSeg / A.govSuperMore handlers
  - 12 page.governance.super.* keys ×5 locales
affects:
  - 90-02..90-06 (no dependency — client-only section; locale files append-only)
tech-stack:
  added: []
  patterns:
    - seg-control over the govSeg idiom (no tab component — research Pitfall 7)
    - staged-slice cap (S.ui counter + show-more) — new presentation idiom, no server pagination
    - refetch-reconcile reuse (candidate leaves results / joins roster, no reload)
key-files:
  created:
    - test/governance-console.test.mjs
  modified:
    - src/pages/governance.js
    - src/actions/actions.js
    - src/locales/en.json
    - src/locales/fr.json
    - src/locales/de.json
    - src/locales/es.json
    - src/locales/nl.json
    - test/governance-client.test.mjs
    - test/i18n-core-features.test.mjs
    - test/i18n-shell.test.mjs
    - test/i18n-toast.test.mjs
decisions:
  - Roster-empty keys (superRosterEmptyTitle/Body) landed in the task-1 commit (the empty branch renders there); the remaining 7 keys landed in task 2 — keys never precede or lag their markup across commits (plan granted executor's call)
  - 3 orphaned keys removed (settings.operator.title/lead, page.governance.noMatchesOpBody) — i18n-scan's dead-key gate fails on unreferenced catalogue entries; removed ×5 locales in the same commit as the markup that orphaned them (D-12)
  - Tree-wide data-a/data-v count pins (i18n-shell/i18n-toast) bumped 610→613 / 93→94 with D-12 same-commit pin comments — established procedure for every markup addition; files were not in the plan's files_modified
metrics:
  duration: ~35 min
  completed: 2026-11-23
status: complete
actuals:
  tokens: 24775
  tasks: 2
  commits: 2
commits: 2
plan_head_before: a7e59e51a701f42747feb025f5cdfedcb0c62121
plan_head_after: 49b06b126cfe81f64d3c56391c25618bd6dc7b3e
estimate:
  tokens: 58000
  tasks: 2
---

# Phase 90 Plan 01: Super Admins Console (roster-first) Summary

Seg-staged Super Admins console in Instance > Governance: roster-first default (is_instance_admin rows only, D-118/D-119 inline stages verbatim) behind a govSeg-idiom control, with a ≥2-char promote-search over ALL users (name AND email, lowercase substring), cap 10 + show-more + visible cap note, promote-only candidate rows reconciling without reload — 12 keyed copy entries ×5 locales, zero API change.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Seg-control section + roster-first default (tracer) | e36f6cc9 | governance.js, actions.js, 5 locales, governance-client.test.mjs, governance-console.test.mjs (new), i18n-core-features.test.mjs |
| 2 | Promote-search — ≥2-char floor, cap 10 + show-more, no-reload reconcile | 49b06b12 | governance.js, actions.js, 5 locales, governance-console.test.mjs, i18n-core-features.test.mjs, i18n-shell.test.mjs, i18n-toast.test.mjs |

## What Was Built

- **superAdminsView** (src/pages/governance.js) replaces the stacked operatorCard+rolesCard mount: `.sblock` shell (h2 `superTitle`) + `.seg` control (`role="group"`, `aria-pressed`, `data-a="govSuperSeg"`, state `S.ui.govSuperSeg` default `'admins'`) switching between the Super Admins roster and the Instance Roles card relocated **verbatim** (rolesCard() called unchanged inside the roles branch — zero visual change, no refetch on switch).
- **Roster view** (`superRosterView`): renders `is_instance_admin` truthy rows ONLY from the existing `S.ui.operatorUsers` payload (seed Option B); the full row ternary (revoke/demote inline-confirm stages, owner-immune/self hints) carried verbatim from operatorCard — D-118/D-119 semantics untouched; names/emails truncate via `.trunc`.
- **Promote-search** (task 2): query < 2 trimmed chars → roster ONLY (D-90-3). At ≥ 2: the pinned lowercase-substring expression on `(u.name||'')` OR `(u.email||'')` filters ALL users; non-admin matches render as **promote-only** `candRow`s (`data-a="operatorPromote"`, `btn-secondary btn-sm`, NO revoke control); `superMatchCount` line + `superCapNote` ("Showing {shown} of {total}") always visible above the list; `candidates.slice(0, shown)` with `S.ui.govSuperShown` default 10; `A.govSuperMore` reveals +10 per click; `IN.govOpQ` resets the slice counter on query change (D-90-4). Post-promote rides the **unchanged** `A.operatorPromote` refetch reconcile → keyed toast + candidate leaves results / joins roster with no page reload (D-90-5).
- **Empty states** (D-90-6): zero matches → `empty('search')` with superNoMatchesTitle/Body; roster empty → defensive `empty('users')` with superRosterEmptyTitle/Body.
- **Teardown**: `S.ui.govSuperSeg` + `S.ui.govSuperShown` reset in `govOrphanTeardown`; `ROUTE_TEARDOWN.governance` still resolves to it — stale seg state never survives route exit.
- **Mount gate unchanged**: the whole section renders only for `api.user?.isInstanceAdmin` (server payload, D-112).
- **i18n**: 12 `page.governance.super.*` keys ×5 locales (de/en/es/fr/nl), each batch in the same commit as its emitting markup; FR values carry the D-05 typography (U+00A0 before `:`, U+202F before `;`, padded « »); ledger comments +5/−3/+7 in test/i18n-core-features.test.mjs.
- **Tests**: test/governance-console.test.mjs (new, 9 source-assertion tests — seg idiom, roster filter, D-118/D-119 stages, floor/filter/promote-only/cap/show-more/reset, both empty states, esc() backstops, 12-key ×5 parity + placeholder parity); governance-client pins rewritten to the seg structure; tree-wide data-a/data-v count pins bumped with ledger comments.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] i18n ledger "pinned count assertion" no longer exists**
- **Found during:** Task 1
- **Issue:** The plan said "append to the running ledger comment in test/i18n-core-features.test.mjs and bump the pinned count assertion (+3)". The numeric pin was removed by IN-02 (84-02) — the tally is prose history now.
- **Fix:** Appended to the running ledger comment (+5/−3 task 1, +7 task 2) — the documented-tally intent preserved.
- **Files modified:** test/i18n-core-features.test.mjs
- **Commit:** e36f6cc9, 49b06b12

**2. [Rule 3 - Blocking] i18n-scan dead-key gate orphaned 3 keys**
- **Found during:** Task 1 (scan FAILED: 3 dead keys)
- **Issue:** The rewrite stopped referencing `settings.operator.title`, `settings.operator.lead`, `page.governance.noMatchesOpBody` (each had exactly one call site, inside operatorCard). `scripts/i18n-scan.mjs` treats unreferenced catalogue keys as violations.
- **Fix:** Removed the 3 keys ×5 locales in the same commit as the markup that orphaned them (D-12 discipline); ledger −3.
- **Files modified:** src/locales/{en,fr,de,es,nl}.json
- **Commit:** e36f6cc9

**3. [Rule 2 - Missing critical pin maintenance] Tree-wide data-a/data-v count pins**
- **Found during:** Task 2 (npm test: i18n-shell + i18n-toast "machine identifiers survived the wave" failed: 613≠610, 94≠93)
- **Issue:** The console adds markup occurrences: govSuperSeg (1), govSuperMore (1), operatorPromote's second occurrence (candidate row), and the seg map's data-v — the tree-wide pins were not in the plan's files_modified.
- **Fix:** Bumped `assert.equal(a, 613)` / `assert.equal(v, 94)` in test/i18n-shell.test.mjs and test/i18n-toast.test.mjs with the D-12 same-commit pin comments (the established procedure visible in each pin's history).
- **Files modified:** test/i18n-shell.test.mjs, test/i18n-toast.test.mjs
- **Commit:** 49b06b12

**4. [Rule 1 - Bug] candRow source-assertion regex matched the wrong indent**
- **Found during:** Task 2
- **Issue:** The new test's candRow terminator regex assumed 4-space closing; the builder closes at 6 spaces.
- **Fix:** Corrected the regex in both tests using it.
- **Files modified:** test/governance-console.test.mjs
- **Commit:** 49b06b12

### Out-of-scope discoveries (logged, NOT fixed)

`npm test` carries 2 failures, both verified pre-existing at the phase-start tree (a7e59e51, checked via `git show` + a detached-worktree test run) and untouched by this plan (server.js/db-adapter/api.js have zero diff):

- test/french-typography.test.mjs — 6 Phase-88 S3 fr.json values breach D-05 (straight apostrophes, wrong colon space).
- test/webhook-routes.test.mjs — "GET list … health computed from deliveries (D-06)" ('active' vs 'failing'); env-dependent, same family as the webhook debt already carried in STATE.md.

Logged in `.planning/phases/90-polish-verification-sweep/deferred-items.md` and appended to the broken-windows ledger.

## Verification

- `node --test test/governance-console.test.mjs test/governance-client.test.mjs` — 27/27 pass (task 1 gate, re-run at the tracer gate)
- `node --test test/governance-console.test.mjs` — 9/9 pass; plus governance-client + creation-gate-client 77/77
- `npm test` — 2313 pass / 2 fail; both failures pre-existing (french-typography S3 keys, webhook-routes health) and proven identical at a7e59e51; **catalogue / i18n-scan / build-locales / build-chunk-size / dependencies all pass** (the plan's named gates)
- `node scripts/i18n-scan.mjs` — 0 literals, 0 pending, 0 unresolved, 0 placeholder-mismatch, 0 dead
- `git diff a7e59e51..HEAD -- server.js db-adapter.mjs src/core/api.js` — empty; the promote/demote/revoke server family (server.js:7927-8050) untouched
- Threat model held: zero client-derived capability math (candidates come from the payload split; authority stays server-side), every payload string + the query echo render through esc() (pinned by source assertions), zero new npm dependencies

## Known Stubs

None — every rendered element is wired to the real payload; no placeholder copy, no mock data paths.

## Authentication Gates

None.

## Self-Check: PASSED
