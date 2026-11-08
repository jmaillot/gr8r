---
phase: 50-invite-hierarchy-per-project-toggles-server
verified: 2026-11-08T14:30:00Z
status: passed
score: 17/17 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - .planning/phases/50-invite-hierarchy-per-project-toggles-server/50-01-PLAN.md
  - .planning/phases/50-invite-hierarchy-per-project-toggles-server/50-02-PLAN.md
  - .planning/phases/50-invite-hierarchy-per-project-toggles-server/50-03-PLAN.md
  - .planning/phases/50-invite-hierarchy-per-project-toggles-server/50-04-PLAN.md
  - .planning/phases/50-invite-hierarchy-per-project-toggles-server/50-05-PLAN.md
  - .planning/phases/50-invite-hierarchy-per-project-toggles-server/50-01-SUMMARY.md
  - .planning/phases/50-invite-hierarchy-per-project-toggles-server/50-02-SUMMARY.md
  - .planning/phases/50-invite-hierarchy-per-project-toggles-server/50-03-SUMMARY.md
  - .planning/phases/50-invite-hierarchy-per-project-toggles-server/50-04-SUMMARY.md
  - .planning/phases/50-invite-hierarchy-per-project-toggles-server/50-05-SUMMARY.md
  - server.js
  - mcp.js
  - docs/ProjectPermissions.md
  - docs/WorkspacePermissions.md
  - test/visibility-team.test.mjs
  - test/visibility-migration.test.mjs
  - test/invite-hierarchy.test.mjs
  - test/membership.test.mjs
  - test/helpers/visibility-fixture.mjs
covered_digest: "v2:sha256:4c06962250d8e35bb6af294b4404f3b595aab3d1cc6ddfda30895c1223056df6"
re_verification:
  previous_status: gaps_found
  previous_score: 15/17
  gaps_closed:
    - "CR-01 — restoreTeamLinks now removes only positively team-derived entries (member_id → memberships.user_id → team_members row in a restored pre.teams team); between-boots genuine invites survive (server.js:2763-2783, commit 786018e; fixture cell p_betweenboots, commit c1d1871)"
    - "WR-01 — invite.project p.members grant hoisted out of the addMembership-only branch; existing workspace members accepting a project-scoped invite land on p.members without role clobber (server.js:5363-5394, commit e779ac1; test m_scoped, commit 5ab62bd)"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "WR-02 (50-REVIEW.md): admin invite path accepts then silently discards a `project` parameter (server.js ~5186)"
    category: other
    reason: "Silent param discard; no roadmap SC or must-have truth fails on it. Tracked for closure per 50-05-PLAN; not blocking."
    evidence_status: "unchanged since prior verification; worktree clean"
  - finding: "WR-03 (50-REVIEW.md): reminder pass still uses the retired two-term visibility predicate — team-granted assignees get no reminders"
    category: other
    reason: "Parity claim contradicted but outside the phase's must-have truths; tracked as an open warning since the prior verification."
    evidence_status: "unchanged since prior verification; worktree clean"
---

# Phase 50: Invite hierarchy & per-project toggles (server) — Verification Report

**Phase Goal:** Invitations and their rules live at the project level — only an owner names another owner, everything about a membership is editable after the invite, teams are linked to projects as live team links (D-50-5 — join/leave the team grants/revokes access on the very next request), and the right to invite guests is a per-project toggle
**Verified:** 2026-11-08T14:30:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (50-05, commits c1d1871 / 786018e / 5ab62bd / e779ac1)

## Goal Achievement

### Observable Truths

Passed truths 1–8, 10–17 received quick regression (existence + suite pass at HEAD, worktree clean — no regression evidence). The two previously failed/unverified truths 9 and 16 received full re-verification below.

| # | Truth (roadmap SC / plan must-have) | Status | Evidence |
|---|---|---|---|
| 1 | SC1 — Only an owner can grant the owner role at invite creation, role edit and invite acceptance | ✓ VERIFIED | Regression: three-point matrix tests pass in this run's 31-test green run |
| 2 | SC2 — Role/scope/status edits enforced on the very next request | ✓ VERIFIED | Regression: `test/membership.test.mjs` 26/26 pass this run |
| 3 | SC3 — Live team links: join grants, leave revokes on the very next request unless individually invited | ✓ VERIFIED | Regression: visibility-team tests pass; funnel reads p.teams + team_members per evaluation (server.js:775-838); MCP parity green |
| 4 | SC4 — Toggle OFF semantics: member guest invite refused, admin/owner succeeds, migrate OFF fail-closed, stale invite re-derives fail-closed | ✓ VERIFIED | Regression: toggle twins + stale-accept tests pass this run |
| 5 | SC5 — Same viewer account in multiple projects; "Invité externe" gone server-side | ✓ VERIFIED | Regression: multi-project test green; normalizeGuestRoles at server.js:2853+ (shifted by CR-01 fix, code intact) |
| 6 | 50-01 — Stale client doc PUT cannot delete p.teams or flip p.allowInviteGuests | ✓ VERIFIED | Regression: mergeClientDoc pins (server.js:1044-1047); test passes |
| 7 | 50-01 — Phase 49 sweep retired | ✓ VERIFIED | Regression: boot calls restoreTeamLinks + normalizeGuestRoles only; byte-identical second-boot test passes |
| 8 | 50-01 — MCP mirror agrees with funnel on the team term | ✓ VERIFIED | Regression: mcp.js:183-198 unchanged; parity suite green this run |
| 9 | 50-02 — Reverse sweep converts materialized grants back to p.teams, **preserving genuine individual invites (D-50-6)** | ✓ VERIFIED (was ✗ FAILED — CR-01) | **Fix verified in code at HEAD** (server.js:2763-2783, commit 786018e): removal now requires the member_id to resolve via `memberships.user_id` to a live `team_members` row whose team_id is in the restored pre.teams; unresolvable or non-team entries STAY (fail-open per D-50-6). Worktree clean. **New RED-then-GREEN test** "between-boots genuine invite survives the sweep; only positively team-derived entries are removed (CR-01, 50-05)" (test/visibility-migration.test.mjs:379) with the p_betweenboots cell planted before the snapshot (m_plain, a member of NO restored team, survives; commit c1d1871). Passes this run. The fixture-only objection from the prior verification is resolved — the between-boots indistinguishable case is now pinned. |
| 10 | 50-02 — Second boot byte-identical (both migrations) | ✓ VERIFIED | Regression: byte-identical tests pass |
| 11 | 50-02 — Legacy 'guest' rows normalize to 'viewer'; second boot no-op | ✓ VERIFIED | Regression: normalizeGuestRoles tests pass |
| 12 | 50-03 — Admin can only edit non-admins; owner edits anyone | ✓ VERIFIED | Regression: matrix test passes |
| 13 | 50-03 — Toggle flip is admin/owner-only, stored on the doc | ✓ VERIFIED | Regression: route + test pass |
| 14 | 50-04 — docs/ProjectPermissions.md states the three-term live predicate | ✓ VERIFIED | Regression: wording intact, matches funnel |
| 15 | 50-04 — docs/WorkspacePermissions.md documents guest→viewer collapse + authoritative toggle | ✓ VERIFIED | Regression: wording intact |
| 16 | 50-04 — Planning docs carry D-50-5 live-link wording (REQUIREMENTS M-03/INV-03, ROADMAP SC3, PROJECT.md) | ✓ VERIFIED (re-checked in full this round) | grep at HEAD: ROADMAP.md:88 criterion 3 reads "live team link, D-50-5 — supersedes the original snapshot wording"; REQUIREMENTS.md:30 INV-03 "live team link —" wording; REQUIREMENTS.md maps VIS-04/INV-01..04 → Phase 50, all five claimed in plan frontmatter (50-05-PLAN claims all five) |
| 17 | 50-04 — Full suite green | ✓ VERIFIED | This run: 31 + 26 pass across the four phase test files (+ mcp.test.mjs, 0 fail) = 57+ pass, 0 fail |

**Score:** 17/17 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| server.js | Funnel + migrations + invite routes + toggle | ✓ VERIFIED | restoreTeamLinks fix at 2763-2783; hoisted accept grant at 5363-5394; `memberIdFor` exists (server.js:2907); worktree clean |
| mcp.js | Mirror canReadProject | ✓ VERIFIED | Unchanged; parity green |
| test/visibility-migration.test.mjs | Reverse-sweep fixtures incl. between-boots cell | ✓ VERIFIED | p_betweenboots cell + CR-01 test present and passing |
| test/invite-hierarchy.test.mjs | INV-01 matrix + WR-01 existing-member test | ✓ VERIFIED | m_scoped accept test present and passing |
| test/visibility-team.test.mjs, test/membership.test.mjs, test/helpers/visibility-fixture.mjs, docs/*.md | unchanged | ✓ VERIFIED | Regression pass |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| Removed p.members entry | team_members of a restored team | memberships.user_id join inside restoreTeamLinks | ✓ WIRED (new, CR-01) | server.js:2772-2781, per-entry awaited lookup; fail-open `continue` on unresolvable |
| Accept route | p.members grant for existing members | Hoisted out of addMembership-only branch | ✓ WIRED (new, WR-01) | server.js:5383-5394; ensureMember skipped for existing membership — no role clobber |
| All prior key links | — | — | ✓ WIRED | Regressed clean (funnel join, MCP parity, mergeClientDoc pinning, fail-closed re-derivation at accept, backup-before-mutation) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| CR-01 between-boots preservation + full migration suite | `node --test test/visibility-team.test.mjs test/visibility-migration.test.mjs test/invite-hierarchy.test.mjs` | 31 pass / 0 fail (2,379 ms) | ✓ PASS |
| Post-invite immediate-effect edits + hierarchy | `node --test test/membership.test.mjs` | 26 pass / 0 fail (4,804 ms) | ✓ PASS |
| MCP parity | `node --test test/mcp.test.mjs` | 0 fail (1,206 ms) | ✓ PASS |

### Probe Execution

None declared (no scripts/*/tests/probe-*.sh). SKIPPED — phase tests are the runnable checks and were run above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| INV-01 | 50-03, 50-04, 50-05 | Only an owner names another owner — create/edit/accept | ✓ SATISFIED | Three-point matrix green |
| INV-02 | 50-03, 50-04, 50-05 | Post-invite role/scope/status edits, immediate effect | ✓ SATISFIED | membership.test.mjs green |
| INV-03 | 50-01, 50-02, 50-04, 50-05 | Live team links (D-50-5), migration preserves genuine invites (D-50-6) | ✓ SATISFIED | Live grant/revoke + CR-01 between-boots test green — the D-50-6 sub-clause is now proven, not fixture-only |
| INV-04 | 50-02, 50-03, 50-04, 50-05 | One guest concept; multi-project membership | ✓ SATISFIED | Multi-project test green; normalization proven |
| VIS-04 | 50-03, 50-04, 50-05 | Per-project toggle, fail-closed accept, grant lands for every valid acceptor | ✓ SATISFIED | Toggle twins + stale-accept + m_scoped hoisted-grant test green |

No orphaned requirements: all five REQUIREMENTS.md Phase-50 mappings appear in plan frontmatter (50-05-PLAN claims all five).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| server.js | ~5186 | Admin invite path silently discards `project` param (WR-02) | ⚠️ Warning | Open, tracked (advisory); no must-have fails |
| reminder pass | n/a | Retired two-term predicate (WR-03) | ⚠️ Warning | Open, tracked (advisory); no must-have fails |

The two 🛑/⚠️ blockers from the prior verification (CR-01, WR-01) are closed. No TBD/FIXME/XXX debt markers found in server.js.

### Human Verification Required

None — all truths are server-side and behaviorally exercised by the passing test suites, including the two re-verified truths (9 via the new between-boots fixture, 16 via direct grep of the planning docs).

### Gaps Summary

Both prior gaps are closed with fix + RED-then-GREEN test pairs:

- **CR-01 CLOSED** — restoreTeamLinks now removes only entries positively proven team-derived (membership → user → team_members row in a restored team); the between-boots genuine-invite case is pinned by a new fixture cell (p_betweenboots) that survives the sweep, eliminating the fixture-only objection.
- **WR-01 CLOSED** — the invite.project p.members grant is hoisted so every successful acceptance writes access; the existing-member path uses the membership row's member_id and skips ensureMember (no role clobber); the fail-closed toggle re-derivation was untouched.

All 17 must-haves verified, 57+ tests green, worktree clean at eb8dcda. Phase goal achieved. WR-02/WR-03 remain open as advisory warnings tracked outside the must-have set.

---

_Verified: 2026-11-08T14:30:00Z_
_Verifier: the agent (gsd-verifier)_
