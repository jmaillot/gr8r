---
phase: 32-team-derived-project-visibility
verified: 2026-11-04T00:00:00Z
status: passed
score: 7/7 must-haves verified
covered_files:
  - ".planning/phases/32-team-derived-project-visibility/32-01-PLAN.md"
  - ".planning/phases/32-team-derived-project-visibility/32-01-SUMMARY.md"
  - "server.js"
  - "test/scope.test.mjs"
covered_digest: "v2:sha256:548e16d71a5eb04b1cd392648874b7ef990f89daf4f58c5c876a2020feb8132f"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 7/7
  gaps_closed: []
  gaps_remaining: []
  regressions: []
  scope: "STALE-verification refresh — server.js and test/scope.test.mjs changed after the 2026-11-02 pass (phases 33 HARD-* hardening, 34 notif-prefs, 34-03 redaction). All must-haves re-checked against current code."
advisory:
  - finding: "Phase 34 refactored the email mirror null-scope guard to `!memberCanReadProject(projectById.get(projectId), wsRow.id, n.to)` (project resolved via a prebuilt map instead of the notification row); semantics identical, same shared helper, D-03 scoped branch preserved."
    category: other
    reason: "Informational — confirms no second visibility pipeline emerged; no action needed."
    evidence_status: "verified in code (server.js:1247)"
coincidental_reliance_items:
  - truth: "A member whose teams do not reach a project is never reminded about it (VIS-04, reminder family)"
    reason: fixture-only
    harden: "The positive on-team reminder cell only fires because remindable()'s access-list gate (p_teamL lists the assignee) passes first — the team term alone can never positively produce a reminder (WR-02). If remindable()'s gate is ever widened, the cell should be re-based on a team-only-reach project."
---

# Phase 32: Team-Derived Project Visibility — Verification Report

**Phase Goal:** For every non-guest member, project visibility derives from team membership (`project.teams ∩ member.teams ≠ ∅` opens a project); teams:[] projects stay workspace-wide; the Phase-29 explicit scope remains an optional admin restriction on top (D-03 grant inversion survives). One `hiddenFor()` funnel, one shared team-intersect helper, consumed also by reminder pass and email mirror.
**Verified:** 2026-11-04 (re-verification — stale refresh after phases 33/34 modified server.js)
**Status:** passed
**Re-verification:** Yes — prior pass 2026-11-02, 7/7; covered files changed since

## What Changed Since the Prior Pass

`git log --since=2026-11-02 -- server.js test/scope.test.mjs` shows phases 33 (HARD-01..05 security hardening, invite/SSO surface) and 34 (per-user notif prefs: table, accessor, GET/PUT routes, reminder-gate and email-dispatch reroute via the accessor; redaction module) touched server.js; test/scope.test.mjs also grew (81 → 82 tests, same 3 skips). Critically:

- **Shared helper untouched in substance:** `teamIntersects` (server.js:672-674) and `memberCanReadProject` (:685-694) are byte-equivalent to the verified implementation (canSeeProject short-circuit, memberships user_id resolution, optional liveTeams).
- **hiddenFor intact:** null-scope non-admin branch (:771-800) still hides exactly what neither access list nor live team intersection reaches; admin keeps `hiddenProjectIds`; the Phase-29 scoped branch is unchanged — D-03 survives.
- **Send-time surfaces still ride the same predicate:** reminder pass :1381 `!projectScope(assigneeMembership) && !memberCanReadProject(project, ws.id, t.assignee)` — unchanged except a Phase-34 prefs accessor now runs alongside (not instead of) it; email mirror :1247 re-pointed to `projectById.get(projectId)` but still the same `memberCanReadProject` call under the null-scope conjunct. No second visibility pipeline.
- **Phase 33/34 changes are additive on different surfaces** (invite accept, SSO, notif prefs, redaction) and do not touch team-derivation logic.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | On-team member reads team-linked project through the single hiddenFor funnel; off-team member gets byte-identical 404 across MATRIX families (VIS-01, VIS-05) | ✓ VERIFIED | `teamIntersects` server.js:672, `memberCanReadProject` :685, null-scope branch :771-800; MATRIX cells green in current `node --test test/scope.test.mjs` run |
| 2 | teams:[] projects stay visible per public/access-list state, incl. JIT zero-team accounts; private teams:[] NOT leaked workspace-wide (D-06) | ✓ VERIFIED | JIT zero-team cell passes in current scope-suite run; `teamIntersects` still requires non-empty p.teams AND non-empty teamSet (:672-674) |
| 3 | Phase-29 scope grant still opens a team-hidden private project (D-03 inversion); admin/owner exemption survives additively (VIS-02) | ✓ VERIFIED | Scoped branch :795-800 untouched; D-03 inversion and admin-exemption cells green in current run |
| 4 | Guest collaborators stay locked to their single granted project (VIS-03) | ✓ VERIFIED | Guest gate untouched by phases 33/34; all guest pins green in full-suite run |
| 5 | Off-team member never reminded/emailed — reminder pass (:1381) and email mirror (:1247) ride the SAME shared helper (VIS-04, D-04) | ✓ VERIFIED (coincidental-reliance) | Both sites re-inspected post-Phase-34: reminder cell and fanout cell green; still exactly the one helper — Phase 34 rerouted dispatch mechanics (prefs/accessor) but kept the visibility guard on `memberCanReadProject` |
| 6 | Legacy private access-list projects behave identically — access-list disjunct untouched, additive-only (D-02) | ✓ VERIFIED | `canSeeProject` still short-circuits first in `memberCanReadProject` (:686); Phase-29 pins green across full-suite run |
| 7 | File side door agrees with doc read under the new predicate (D-08) | ✓ VERIFIED | File-family team cells green in current scope-suite run |

**Score:** 7/7 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `teamIntersects(p, teamSet)` in server.js | Shared team-intersect helper | ✓ VERIFIED | server.js:672-674 — unchanged, substantive |
| member-level readable helper | composes canSeeProject ∨ teamIntersects with live teamsOfUser reads | ✓ VERIFIED | server.js:685-694, liveTeams optional param preserved |
| hiddenFor null-scope branch extension | hidden = !memberCanReadProject for non-admin; admin keeps hiddenProjectIds; scoped branch byte-identical | ✓ VERIFIED | server.js:771-800; scoped branch :795-800 unchanged |
| Email mirror guard adoption | skip via shared helper | ✓ VERIFIED | server.js:1247 — null-scope-only conjunct; Phase 34 refactored project lookup to projectById map, predicate call unchanged |
| Reminder pass guard adoption | skip via shared helper with explicit member_id | ✓ VERIFIED | server.js:1381 — unchanged; Phase 34 added prefs accessor alongside |
| MATRIX team cells + fixtures in test/scope.test.mjs | cells across doc-get/file/reminder/fanout/doc-put | ✓ VERIFIED | Suite grew 81→82 tests; all team cells green in current run |
| No new files | only server.js + test/scope.test.mjs | ✓ VERIFIED | Phases 33/34 added src/lib/redaction.js etc. outside this phase's surface — not a Phase 32 regression |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| hiddenFor null-scope branch | teamIntersects/memberCanReadProject | helper call :789 | ✓ WIRED | live teamsOfUser read, no caching (D-05) |
| Email mirror guard | same helper instance | call :1247 | ✓ WIRED | Phase 34 refactor kept the same predicate; no inline team logic |
| Reminder pass guard | same helper instance | call :1381 | ✓ WIRED | member_id passed explicitly, resolved inside helper |
| member_id ↔ user_id join | memberships row user_id | query in helper :689 | ✓ WIRED | unchanged |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Scope suite green (82 tests incl. all team cells) | `node --test test/scope.test.mjs` | 82 tests, 79 pass, 0 fail, 3 pre-existing skips | ✓ PASS |
| Full suite green | `npm test` | 899 tests, 896 pass, 0 fail, 3 skipped — matches stated baseline | ✓ PASS |

The known test/notif-prefs.test.mjs concern did not manifest: full run is 0 fail.

### Probe Execution

No probe scripts declared or conventional for this phase — SKIPPED. MATRIX cells serve as the behavioral probes and were re-run green.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| VIS-01 | 32-01 | Team-intersection readability through hiddenFor | ✓ SATISFIED | Truths 1-2; helper + branch re-inspected post-33/34 |
| VIS-02 | 32-01 | Additive composition; D-03 grant inversion + admin exemption survive | ✓ SATISFIED | Truth 3; scoped branch byte-identical |
| VIS-03 | 32-01 | Guest lock unchanged | ✓ SATISFIED | Truth 4, guest pins green |
| VIS-04 | 32-01 | Send-time surfaces honor team-derived visibility via shared helper | ✓ SATISFIED | Truth 5; both send-time sites re-verified post-Phase-34 reroute |
| VIS-05 | 32-01 | 404-matrix extended with team-derivation cells | ✓ SATISFIED | Truths 1, 7; cells green in current run |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None in the Phase-32-modified regions | ℹ️ | — |

### Warnings Carried Forward (open, do not block must_haves)

1. **WR-01 (warning, open)** — Admin/owner send-time exemption missing at email mirror/reminder pass (read-path exemption pinned; send-time is not). Unchanged by phases 33/34; still a follow-up candidate.
2. **WR-02 (warning, open)** — Reminder pass team term can never positively fire (remindable() access-list gate blocks team-only reach first); skip-side fully pinned. Recorded as coincidental-reliance.

## Gaps Summary

None. The stale-refresh confirms the Phase-32 surface (helper pair, hiddenFor null-scope branch, both send-time guards, MATRIX cells) survived phases 33 and 34 intact: Phase 33 touched invite/SSO code, and Phase 34's reminder-gate/email-dispatch reroute kept the visibility guard on the same `memberCanReadProject` predicate — no second pipeline and no semantic drift. Both test suites re-run green by this verifier (scope suite 82/82, 3 pre-existing skips; full suite 899 tests, 896 pass, 0 fail, 3 skips — exactly the stated baseline). Open review warnings WR-01/WR-02 are unchanged and remain follow-up candidates.

---

_Verified: 2026-11-04T00:00:00Z_
_Verifier: the agent (gsd-verifier)_
