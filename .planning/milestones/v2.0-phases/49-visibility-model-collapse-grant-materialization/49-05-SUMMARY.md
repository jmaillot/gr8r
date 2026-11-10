---
phase: 49-visibility-model-collapse-grant-materialization
plan: 05
subsystem: visibility-migration
tags: [migration, gap-closure, grants, sweep, phase-49]
requires: [49-01, 49-02, 49-03, 49-04]
provides: [scalar-p.team sweep coverage, WR-01/WR-02 closures]
affects: [server.js visibility sweep, visibility fixture matrix]
tech-stack:
  added: []
  patterns: [sweep-side legacy-shape detection, 2eec642 scalar→teams[] semantics reproduced in the one-boot tx]
key-files:
  created: []
  modified:
    - server.js
    - test/helpers/visibility-fixture.mjs
    - test/visibility-migration.test.mjs
    - .planning/phases/49-visibility-model-collapse-grant-materialization/49-REVIEW-DISPOSITION.md
decisions:
  - "Sweep-side scalar conversion (not normalizeProjects re-add) — preserves the D-49-6 byte-identity marker"
  - "Scalar→teams[] merge dedupes and string-filters, so scalar+array coexistence loses nothing"
  - "Corrupt-doc workspaces clear scope columns on the unreadable-doc path inside the same tx (WR-02)"
metrics:
  duration: ~25 min
  completed: 2026-11-08
status: complete
actuals:
  tokens: 17800
  tasks: 3
  commits: 4
plan_head_before: ae99ee0
plan_head_after: ab22527
commits: 4
---

# Phase 49 Plan 05: Gap Closure — Scalar p.team Sweep Coverage (CR-01) Summary

**One-liner:** The one-boot visibility sweep now detects the pre-Phase-32 scalar `p.team` marker, converts it with the retired 2eec642 semantics before the grants loop, and pins the materialized grant end-to-end with a new `p_legacyteam` fixture cell — closing verification gap CR-01 plus review warnings WR-01/WR-02.

## What Was Done

### Task 1 — server.js (commit 39c9d3f)
- `sweepNeeded`: added the scalar marker `if (p.team !== undefined) return true;` after the `p.access` check, with a CR-01 comment explaining why the sweep (not normalizeProjects) is the converter.
- `sweepNeeded` WR-02: the unparseable-doc catch now returns `scopeRowCount > 0` instead of `false`.
- Sweep tx: reproduces the retired 2eec642 scalar→teams[] semantics (Array → string-filtered; non-empty string → `[string]`; else `[]`), merged with any existing `teams` array (dedup, string-filtered), placed BEFORE the `pTeams` read and grants loop; `delete p.team` alongside the existing `delete p.teams`.
- Sweep tx WR-02: the unreadable-doc path now clears memberships/invites scope columns inside the same transaction before returning (doc write still skipped) — D-49-6 no-churn preserved because later boots see NULL scope rows.
- WR-01: corrected the assignee-guard comment — memberCanReadProject is a pure funnel with NO ROLE_RANK bypass of the private access list.

### Task 2 — fixture matrix (commit 96adf9e)
- Added the `p_legacyteam` cell: `{ private: true, members: ['m_admin'], lead: 'm_admin', team: 'engA' }` — scalar `team`, NO `teams` key — added to VIS_PROJECTS and `projOrder`.
- Extended VISIBILITY_MODEL and MIRROR_MODEL for m_admin and m_team (m_admin/m_owner mirror entries use `ALL` and pick the cell up automatically).
- Legacy-shape comments name the scalar cell.

### Task 3 — migration pins + full suite (commit b70225e)
- Pre-boot pin: `p_legacyteam.team === 'engA'` and no `teams` key on disk.
- Post-sweep pin: stored members set-equal `['m_admin', 'm_corrupt', 'm_team']`, no `team`/`teams` keys, stays private. (m_corrupt — the planted T-49-04 fail-open cell with an engA row — materializes here exactly as on p_teamshare.)
- Fail-open doc-GET set extended: the corrupt workspace-wide member gains `p_legacyteam` via the engA intersection.
- Second-boot pin: the formerly-scalar cell carries neither `team` nor `teams` (D-49-6 for formerly-scalar docs).

### Review disposition (commit ab22527)
- CR-01, WR-01, WR-02 → `fixed` with source notes; WR-03, IN-01, IN-02 remain open as recorded.

## Verification

- `node --check server.js` — pass; `grep -c "p.team !== undefined" server.js` → exactly 2 (baseline 0 at HEAD pre-plan; normalizeProjects untouched).
- `node --test test/visibility-migration.test.mjs` — 6 pass / 0 fail.
- `npm test` — 1079 pass / 0 fail / 11 env-gated skips.

## Deviations from Plan

**[Rule 1 - Bug] Fail-open cell ripple handled as set extension, not assertion weakening**
- **Found during:** Task 3
- **Issue:** The planted m_corrupt cell (T-49-04, engA team row, fail-open workspace-wide scope) also receives the p_legacyteam grant — the plan's oracle listed only `[m_admin, m_team]` for stored members.
- **Fix:** Extended the expected set to `[m_admin, m_corrupt, m_team]` with a comment tying it to the p_teamshare precedent; per the plan's own instruction, ripples are fixed by extending expected sets per the oracle rules.
- **Commit:** b70225e

**Note:** The plan referenced a "13-project" fixture; the matrix at HEAD carries 10 explicit VIS_PROJECTS ids (the 11th cell was added here). Cell semantics implemented as specified.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or file access patterns; the change hardens an existing trust boundary (stored doc → sweep tx, T-49-10/T-49-11 mitigated as planned).

## Self-Check: PASSED

- server.js, test/helpers/visibility-fixture.mjs, test/visibility-migration.test.mjs — exist and committed.
- Commits 39c9d3f, 96adf9e, b70225e, ab22527 — present in `git log`.
