---
phase: 32-team-derived-project-visibility
plan: 01
subsystem: visibility
tags: [visibility, teams, scope, 404-no-oracle, send-time-guards]
requires: [phase-29-scope-funnel, team_members-authority-rows]
provides: [teamIntersects, memberCanReadProject, team-derived hiddenFor null-scope branch]
affects: [redactDoc, mergeClientDoc, serveFileBinary, reminder-pass, email-mirror]
tech-stack:
  added: []
  patterns: [shared-visibility-helper, live-authority-row-read, additive-union-hidden-set]
key-files:
  created: []
  modified:
    - server.js
    - test/scope.test.mjs
decisions:
  - "One shared predicate pair (teamIntersects + memberCanReadProject) consumed by hiddenFor, the email mirror and the reminder pass — no second visibility pipeline (D-04)."
  - "hiddenFor's null-scope branch resolves the live team set ONCE per document (not per project) and passes it into memberCanReadProject — same helper, avoids N+1 team_members queries per read (D-05 semantics unchanged)."
  - "Send-time skips apply only to null-scope recipients/assignees; scoped recipients keep the exact Phase-29 inScopeProject semantics so the D-03 grant short-circuit is not re-tightened."
  - "Team cells reuse the existing fixture members where possible (plain@test.local as the on-team probe, scoped as the zero-team probe) plus one dedicated zero-team member (zeroteam@test.local, 4th invite accept) to keep the off-team reminder probe clear of the untouched Phase-29 assignee write-guard."
metrics:
  duration: ~50 min
  completed: 2026-11-02
status: complete
actuals:
  tokens: 61000
  tasks: 3
  commits: 3
plan_head_before: 8b81f6b46c02e1fc9ea2a1cd96b60f60c7a26966
plan_head_after: 36dfe96
commits: 3
---

# Phase 32 Plan 01: Team-Derived Project Visibility Summary

**One-liner:** Team intersection (`project.teams ∩ member.teams ≠ ∅`) now opens projects through the single `hiddenFor()` funnel via one shared `memberCanReadProject` helper also adopted by the reminder pass and email mirror — purely additive reach, byte-identical 404s preserved, MATRIX extended with team cells across doc-get/file/reminder/fanout/doc-put families.

## What Was Built

- **server.js** — `teamIntersects(p, teamSet)` and `memberCanReadProject(p, wsId, memberId, liveTeams?)` next to the Phase-29 predicate block; `hiddenFor`'s null-scope branch extended so non-admin null-scope memberships hide only projects neither the access list nor a live `team_members` intersection reaches (admin/owner keep the plain `hiddenProjectIds` path — D-06 exemption on top; the Phase-29 scoped branch is byte-identical — D-03). Email mirror and reminder pass gained a null-scope-only skip through the same helper (VIS-04, D-04), with ids passed explicitly in member_id space and resolved to user_id via the memberships row (Pitfall 2).
- **test/scope.test.mjs** — second probe member fixture (on-team via the authority route vs zero-team), dedicated zero-team reminder member, projects `p_teamX` (private, team_a), `p_pubA` (public, team_a), `p_priv3` (private, no teams), `p_teamL` (private, team_a, listed assignee), and team cells: doc-get, file (byte-identical `fileNotFound` cross-checks), reminder, fanout, doc-put, A1 widening, D-03 inversion, admin exemption, D-08 legacy scalar-team crafted-doc file cell, D-05 live-read flip (roster edit → immediate reach change, both directions), and the SC 2 JIT zero-team empty-teams-ordering cell.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Shared helper + null-scope branch + first MATRIX team cells (tracer) | 3005a1e |
| 2 | Send-time adoption — reminder pass + email mirror ride the shared helper | 6181f25 |
| 3 | Full MATRIX extension — D-06/D-08/A1/D-03/admin/doc-put/live-read cells | 36dfe96 |

## Verification

- `node --test test/scope.test.mjs` green after every task (81 tests, 78 pass, 3 pre-existing skips).
- `npm test` full suite green: **817 tests, 814 pass, 0 fail, 3 skipped** (803-test baseline + 14 new team cells).
- `git diff` confirms the Phase-29 scoped branch of `hiddenFor`, `canSeeProject`, `hiddenProjectIds`, `inScopeProject`, `scopeGrants`, `remindable`, the assignee write-guard and the guest gate are all untouched.
- Exactly one shared team-intersect helper exists (`grep` shows 3 consumer sites: hiddenFor :781, email mirror :1177, reminder pass :1308).

## Deviations from Plan

**1. [Decision — efficiency] hiddenFor resolves the live team set once per document** instead of calling `memberCanReadProject` per project. Same helper, same D-05 live-read semantics; avoids two SQL queries per project per doc read. The helper accepts an optional pre-resolved `liveTeams` for this.

**2. [Decision — semantics containment] Send-time skips are null-scope-only.** The plan's "add one conjunct" read literally would also have tightened scoped recipients: `memberCanReadProject` does not encode the D-03 grant inversion (a scope grant on a private project), so applying it to scoped recipients would have regressed Phase-29 SCOPE-04 pins. The added skips fire only when `projectScope` is null — the exact population the plan names ("null-scope recipients must no longer pass unconditionally").

**3. [Decision — test fixture] Reminder on-team probe uses `p_teamL` (team-linked AND access-listed).** `remindable()`'s pre-existing `canSeeProject` gate (untouched per Pitfall 4) blocks reminders for private off-list projects regardless of team reach, so an on-team off-list assignee can never be observed as 'reminded'. The on-team reminder probe therefore rides a project whose access list includes the on-team assignee; the team term itself is pinned by the doc-get/file/doc-put cells.

**4. [Rule 3 — blocking] Assignee write-guard interaction routed around.** The untouched Phase-29 write-guard runs over the MERGED task list, so any stored task assigned to a scoped caller on a project outside their scope 400s every later doc PUT by that caller. The off-team reminder probe got a dedicated zero-team member (null scope passes the guard) and the doc-put cell's caller scope covers `p_out` so the planted `t_m_rem_out` self-assignment cannot trip it. The underlying guard sharpness is pre-existing Phase-29 behavior, out of this phase's letter (RESEARCH Open Question 2) — noted for the verifier, not fixed here.

## Known Stubs

None — no stub patterns introduced; every surface is wired to the shared helper.

## Threat Flags

None — no new network endpoints, auth paths, file-access patterns or schema changes beyond the plan's threat model (T-32-01..T-32-05 mitigations are the shipped code + MATRIX cells; T-32-SC: zero package installs).
