---
phase: 32-team-derived-project-visibility
verified: 2026-11-02T12:00:00Z
status: passed
score: 7/7 must-haves verified
covered_files:
  - ".planning/phases/32-team-derived-project-visibility/32-01-PLAN.md"
  - ".planning/phases/32-team-derived-project-visibility/32-01-SUMMARY.md"
  - "server.js"
  - "test/scope.test.mjs"
covered_digest: "v2:sha256:eeedbe7f6e41756b1b8afae3436bf908ab951b41a59dc7ee92266a177400e846"
behavior_unverified: 0
overrides_applied: 0
coincidental_reliance_items:
  - truth: "A member whose teams do not reach a project is never reminded about it (VIS-04, reminder family)"
    reason: fixture-only
    harden: "The positive on-team reminder cell only fires because remindable()'s access-list gate (p_teamL lists the assignee) passes first — the team term alone can never positively produce a reminder (WR-02). If remindable()'s gate is ever widened, the cell should be re-based on a team-only-reach project."
---

# Phase 32: Team-Derived Project Visibility — Verification Report

**Phase Goal:** For every non-guest member, project visibility derives from team membership (`project.teams ∩ member.teams ≠ ∅` opens a project); teams:[] projects stay workspace-wide; the Phase-29 explicit scope remains an optional admin restriction on top (D-03 grant inversion survives). One `hiddenFor()` funnel, one shared team-intersect helper, consumed also by reminder pass and email mirror.
**Verified:** 2026-11-02
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | On-team member reads team-linked project through the single hiddenFor funnel; off-team member gets byte-identical 404 across MATRIX families (VIS-01, VIS-05) | ✓ VERIFIED | `teamIntersects` server.js:664, `memberCanReadProject` :677, null-scope branch :765-784; cells: doc-get on/off-team (:732-741), file family with byte-identical `fileNotFound` cross-check (:744-763, :1256-1263) |
| 2 | teams:[] projects stay visible per public/access-list state, incl. JIT zero-team accounts; private teams:[] NOT leaked workspace-wide (D-06) | ✓ VERIFIED | SC-2 JIT cell (:1276-1288): `p_pubA` present, `p_priv3` access-list-gated, `p_teamX` 404 for zero-team account |
| 3 | Phase-29 scope grant still opens a team-hidden private project (D-03 inversion); admin/owner exemption survives additively (VIS-02) | ✓ VERIFIED | D-03 inversion cell (:1165-1171), admin exemption cell (:1173-1177); scoped branch of hiddenFor (:787-791) untouched — structural pins stayed green |
| 4 | Guest collaborators stay locked to their single granted project (VIS-03) | ✓ VERIFIED | Guest gate untouched (structural pin); all Phase-29 guest tests green in full run |
| 5 | Off-team member never reminded/emailed — reminder pass (:1308) and email mirror (:1177) ride the SAME shared helper (VIS-04, D-04) | ✓ VERIFIED (coincidental-reliance) | Reminder cell :762-772 (on-team reminded, zero-team skipped), fanout cell (on-team present, off-team absent); exactly 3 consumer sites of the one helper — no second pipeline. Positive reminder path rides an access-listed project (see coincidental_reliance_items) |
| 6 | Legacy private access-list projects behave identically — access-list disjunct untouched, additive-only (D-02) | ✓ VERIFIED | `canSeeProject` short-circuits first in `memberCanReadProject` (:678); 981-line Phase-29 scope pins stayed green across all runs |
| 7 | File side door agrees with doc read under the new predicate (D-08) | ✓ VERIFIED | File-family team cells incl. legacy scalar-`team` crafted fixture (:1244-1263): on-team 200, off-team byte-identical unknown≡out-of-scope deepEqual |

**Score:** 7/7 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `teamIntersects(p, teamSet)` in server.js | Shared team-intersect helper | ✓ VERIFIED | server.js:664-666 — substantive, non-empty-teams + some/includes |
| member-level readable helper | composes canSeeProject ∨ teamIntersects with live teamsOfUser reads | ✓ VERIFIED | server.js:677-685 `memberCanReadProject`, resolves member_id→user_id via memberships (Pitfall 2), optional pre-resolved liveTeams |
| hiddenFor null-scope branch extension | hidden = !memberCanReadProject for non-admin; admin keeps hiddenProjectIds; scoped branch byte-identical | ✓ VERIFIED | server.js:765-786 — ROLE_RANK admin check :773, live set resolved once per doc, admin path :785 intact; scoped branch :787-791 unchanged |
| Email mirror guard adoption | skip via shared helper | ✓ VERIFIED | server.js:1171-1178 — null-scope-only conjunct (summary deviation 2, justified: applying it to scoped callers would regress D-03) |
| Reminder pass guard adoption | skip via shared helper with explicit member_id | ✓ VERIFIED | server.js:1308 — `!projectScope(assigneeMembership) && !memberCanReadProject(project, ws.id, t.assignee)` |
| MATRIX team cells + fixtures in test/scope.test.mjs | second probe member, JIT zero-team fixture, cells across doc-get/file/reminder/fanout/doc-put | ✓ VERIFIED | Fixtures :672-724 (p_teamX, p_pubA, p_priv3, p_teamL, zeroteam@test.local); cells at :732-772 and :1154-1288 |
| No new files | only server.js + test/scope.test.mjs | ✓ VERIFIED | `git log` shows 3 commits touching exactly these two files |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| hiddenFor null-scope branch | teamIntersects/memberCanReadProject | helper call :781 | ✓ WIRED | live teamsOfUser read :778, no caching (D-05) |
| Email mirror guard | same helper instance | call :1177 | ✓ WIRED | no inline team logic at the site |
| Reminder pass guard | same helper instance | call :1308 | ✓ WIRED | member_id passed explicitly, resolved to user_id inside helper |
| member_id ↔ user_id join | memberships row user_id | query in helper :681 | ✓ WIRED | matches :1095 join discipline |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Scope suite green (81 tests incl. all team cells) | `node --test test/scope.test.mjs` | 81 tests, 78 pass, 0 fail, 3 pre-existing skips | ✓ PASS |
| Full suite green | `npm test` | 817 tests, 814 pass, 0 fail, 3 skipped | ✓ PASS |

### Probe Execution

No probe scripts declared or conventional for this phase — SKIPPED. The 9 flagged assumptions from PLAN frontmatter were verified as surfaced: each is pinned by a named MATRIX cell (A1 :1157, VIS-01/empty JIT :1276, D-06 ordering :1276-1288, VIS-02 adjacency D-03 :1165, VIS-02/empty via untouched SCOPE pins, VIS-02/ordering admin cell :1173, VIS-03 via green guest pins, VIS-04 assignee write-guard left untouched :1028-1034 confirmed unmodified, VIS-05 concurrency live-read flip cell :1265-1274).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| VIS-01 | 32-01 | Team-intersection readability through hiddenFor | ✓ SATISFIED | Truths 1-2, doc-get/file cells |
| VIS-02 | 32-01 | Additive composition; D-03 grant inversion + admin exemption survive | ✓ SATISFIED | Truth 3, :1165-1177 cells |
| VIS-03 | 32-01 | Guest lock unchanged | ✓ SATISFIED | Truth 4, guest pins green |
| VIS-04 | 32-01 | Send-time surfaces honor team-derived visibility via shared helper | ✓ SATISFIED | Truth 5, reminder/fanout cells |
| VIS-05 | 32-01 | 404-matrix extended with team-derivation cells | ✓ SATISFIED | Truths 1, 7 — byte-identical cross-checks on every new 404 cell |

No orphaned requirements — REQUIREMENTS.md maps exactly VIS-01..VIS-05 to Phase 32, all claimed by 32-01-PLAN.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None — no TBD/FIXME/XXX/stub patterns in modified regions | ℹ️ | — |

### Warnings Carried from Code Review (open, do not block must_haves)

1. **WR-01 (warning, open)** — Admin/owner send-time exemption missing: an admin rides the null-scope branch at the email mirror/reminder pass, so `memberCanReadProject` (no admin short-circuit) can skip reminders/emails for private projects the admin doesn't personally reach. Read-path exemption is pinned (:1173), send-time is not. This is outside the letter of VIS-01..VIS-05 (which specify non-guest member reach, not admin send-time exemption) but is a real behavioral consequence worth a follow-up.
2. **WR-02 (warning, open)** — The reminder pass team term can never positively fire: `remindable()`'s access-list gate blocks team-only reach first. The skip-side behavior is fully pinned; the positive side is structurally untestable as reviewed (IN-02). Recorded as coincidental-reliance above.
3. **IN-01 / IN-02 (info, open)** — `memberCanReadProject` "keep flowing" semantics ride a `canSeeProject` quirk; no admin-recipient send-time cell. Advisory.

## Gaps Summary

None. All 7 must-have truths verified against actual code (not SUMMARY claims): the helper pair exists and is substantive; hiddenFor's null-scope branch, email mirror, and reminder pass each call the single shared helper (3 consumer sites, no inline team logic); the Phase-29 scoped branch and guest gate are untouched; every new 404 cell uses the byte-identical no-oracle cross-check. `node --test test/scope.test.mjs` (81/81, 3 skips) and `npm test` (817 tests, 814 pass, 0 fail) both re-run green by this verifier. The open review warnings WR-01/WR-02 do not fail any must-have but should be triaged in a future phase.

---

_Verified: 2026-11-02T12:00:00Z_
_Verifier: the agent (gsd-verifier)_
