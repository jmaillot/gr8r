---
phase: 52-transparency-view-milestone-verification-sweep
plan: 01
subsystem: server-visibility
tags: [transparency, visibility-funnel, parity-tests, admin-endpoint]
requires: [memberCanReadProject (server.js), VISIBILITY_MODEL oracle (test/helpers/visibility-fixture.mjs), requireWorkspace 'admin' gate convention (51-02)]
provides: [GET /api/workspaces/:slug/members/:memberId/visibility, projectAccessReason label helper, extended D-52-9 fixture matrix (m_admin2, p_adminteam, p_leadonly, p_lostvis), test/transparency.test.mjs permanent parity suite]
affects: [test/mcp.test.mjs (harness email map), test/visibility-migration.test.mjs (extended-matrix expectations)]
tech-stack:
  added: []
  patterns: [reason-helper-mirrors-funnel-order, keyed-neutral-404, hand-derived-oracle-parity]
key-files:
  created: [test/transparency.test.mjs]
  modified: [server.js, test/helpers/visibility-fixture.mjs, test/mcp.test.mjs, test/visibility-migration.test.mjs]
decisions:
  - "Reason codes are coarse machine codes (everyone/lead/member/team); lead tested before plain member inside the membership tier — a label refinement, never a funnel edit (D-52-5/D-52-6)"
  - "RESEARCH OQ1 resolved as option (a): the funnel is the authority — the admin × team-only divergence (m_admin2) is pinned hand-derived on both doors, mirroring the Phase 49/50 mirror-drift precedent"
  - "Endpoint echoes the target's member-space id and computes over a normalizeProjects read-copy (lead ∈ members push, owner injection), never writing stored bytes"
metrics:
  duration: ~35 min
  completed: 2026-11-08
status: complete
actuals:
  tokens: 86000
  tasks: 3
  commits: 2
commits: 2
plan_head_before: 3521252
plan_head_after: 4da8449
---

# Phase 52 Plan 01: Transparency endpoint (server half of TRN-01) Summary

Admin/owner-only GET `/api/workspaces/:slug/members/:memberId/visibility` computing a target member's readable projects + first-match access reason entirely through the ONE visibility funnel (`memberCanReadProject`), with permanent parity tests over the extended D-52-9 matrix.

## What Was Built

**Task 1 — fixture extension + RED suite (commit e67b7d7)**
- `test/helpers/visibility-fixture.mjs`: new actor `m_admin2` (admin whose ONLY private-project grant is a live engA link) and three D-52-9 cells — `p_adminteam` (admin × team-only divergence), `p_leadonly` (lead not in the literal members array; normalization push is part of the cell), `p_lostvis` (D-51-4 lost-visibility). `VISIBILITY_MODEL`/`MIRROR_MODEL` updated BY HAND (anti-tautology contract).
- `test/transparency.test.mjs`: gate rows (403 per non-admin role, keyed neutral 404 for unknown AND absent ids, bad slug, admin-expands-own-row), parity rows (oracle equality + redacted-doc complement, D-52-8), reason rows (first-match codes incl. `lead` before `member`), D-51-4 shrink-on-removal mutation test. Committed RED (10 failures, all 404-missing-route).

**Task 2 — endpoint + reason helper (commit 4da8449)**
- `server.js`: `projectAccessReason()` beside the funnel — mirrors `canSeeProject`'s short-circuit order without editing it; coarse codes only (T-52-03).
- Route in the wsMatch chain beside the member-teams route: `requireWorkspace(..., 'admin')` (T-52-02) + `sameOrigin`; `notAMember` keyed 404 shared by unknown/absent targets (T-52-01); list computed per project via `memberCanReadProject(p, wsId, targetMemberId)` on a normalized read-copy of the stored doc; member teams resolved once per request (`hiddenFor` pattern, D-50-3).

**Task 3 — regression proof**: `npm test` 1141 pass / 0 fail (11 pre-existing skips), `node --test test/mcp.test.mjs` 32/32, `node --check server.js` clean. Grep-diff confirms zero edits inside `canSeeProject`/`memberCanReadProject`/`hiddenFor`/`normalizeProjects` — only the helper, call site, and comments.

## Deviations from Plan

### Auto-fixed Issues (Rule 3 — blocking harness sync from the extended matrix)

1. **`test/mcp.test.mjs` parEmailOf learned m_admin2** — the Phase 49/50 harness logs in every VIS_ACTORS member; without the mapping the `before` hook crashed. Also `test/visibility-migration.test.mjs` `emailOf` (same fix).
2. **`test/visibility-migration.test.mjs` hand-derived expectations updated** — m_corrupt (plain member, engA live) now gains `p_adminteam` through the live team term; restoreTeamLinks index-based JSON surgery re-pointed from `$.data.projects[12]` (now p_adminteam) to `[15]` (p_betweenboots, appended after the three new cells); m_team's hand-derived set there extended accordingly. No production behavior changed — expectations stay hand-derived.
3. **m_admin2's doc-GET oracle row** (`publics only`) is the doc-GET door; its endpoint funnel set (`+ p_adminteam, p_teamboth, p_teamshare` via engA) is pinned hand-derived in the named divergence test — m_admin2 is excluded from the parity loops per the plan's divergence-cell instruction (OQ1 option (a)).
4. **Response `member` echoes the member-space id** (`m_admin`, the id used in `p.members`), not the route's user-id path parameter — test expectation aligned to the implemented, more useful shape.

Task 3 produced no code change (full suite green on the Task 2 tree) → no third commit.

## Threat Model Compliance

- T-52-01: unknown and absent target ids return byte-identical `notAMember` bodies (pinned by `deepEqual`).
- T-52-02: 403 pinned for m_plain/m_team/m_scoped/m_guest requesters; server gate is the control.
- T-52-03: payload entries asserted to carry exactly `{id, name, reason}` with coarse string codes — no rosters or access lists.
- T-52-SC: zero package installs; `test/dependencies.test.mjs` green.

## Known Stubs

None.

## Carried Items

None — no red failures outside this plan's scope (the two Phase 51 advisory items did not surface).
