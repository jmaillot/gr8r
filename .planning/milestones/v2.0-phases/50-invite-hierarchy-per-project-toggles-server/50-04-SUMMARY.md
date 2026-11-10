---
phase: 50-invite-hierarchy-per-project-toggles-server
plan: 04
subsystem: documentation
tags: [docs, planning-lockstep, phase-close, d-50-5, success-criteria]
requires: [50-01 live team-link funnel, 50-02 reverse-sweep + guest normalization, 50-03 invite routes, D-50-5 wording source (50-CONTEXT.md)]
provides: [domain docs describing the shipped three-term predicate + guest collapse + per-project toggle, planning docs in D-50-5 lockstep, per-criterion Phase 50 evidence]
affects: [51 client surfaces (docs as the contract), /gsd-verify-work 50]
tech-stack:
  added: []
  patterns: [scoped-edit-only planning docs, grep-gated wording, per-criterion command evidence]
key-files:
  created: [.planning/phases/50-invite-hierarchy-per-project-toggles-server/50-04-SUMMARY.md]
  modified: [docs/ProjectPermissions.md, docs/WorkspacePermissions.md, .planning/REQUIREMENTS.md, .planning/ROADMAP.md, .planning/STATE.md]
key-decisions:
  - "Docs present the three-term live predicate (public ∨ membre ∈ p.members ∨ équipe du membre ∈ p.teams) with join⇒grant / leave⇒revoke and the unless-individually-invited clause — no snapshot wording remains except inside D-50-5 supersession citations"
  - "WorkspacePermissions.md §permGuests documented as superseded by the per-project p.allowInviteGuests toggle (default OFF, admin/owner flip, team invites bypass, fail-closed accept) — new §6 carries the full toggle semantics"
  - "REQUIREMENTS.md residual contradictions removed: TEAM-RESYNC (v3) and the 'live-list team grants' out-of-scope row marked superseded by D-50-5 (live link removes the need for both)"
requirements-completed: [INV-01, INV-02, INV-03, INV-04, VIS-04]
estimate: { tokens: 50000, raw_tokens: 35000, tasks: 3, confidence: med }
actuals:
  tokens: 13000
  tasks: 3
  commits: 2
plan_head_before: f000cd38cf561b57844c1e66727d364e0e6ec68a
plan_head_after: f4d9796
commits: 2
duration: ~55 min
completed: 2026-11-08
status: complete
---

# Phase 50 Plan 04: Phase close — docs, planning lockstep & evidence sweep Summary

Domain and planning documentation locked to the D-50-5 live team link (three-term predicate, guest→viewer collapse, authoritative per-project `p.allowInviteGuests` toggle), with all five Phase 50 success criteria evidenced green and the full suite passing as the phase gate.

## Accomplishments

- **Task 1 (934c455) — domain docs.** ProjectPermissions.md: header updated to Phase 50; the visibility rule restated everywhere as the three-term live predicate; new §5 documents the live team link (no-cache next-request join⇒grant / leave⇒revoke, unless-individually-invited clause, admin/owner team-link routes with UI in Phase 51) plus a history block (pre-49 intersection/scope → Phase 49 collapse with the sweep now deleted → Phase 50 D-50-5 restoration via `restoreTeamLinks()`). WorkspacePermissions.md: guest→viewer collapse documented (D-50-10/11 — "guest" is a display label of `viewer`, restrictions via existing role checks, no separate data model); §permGuests struck as superseded; new §6 documents the per-project toggle semantics (default OFF everywhere, project-required + viewer-ceiling member invites, admin bypass, team invites bypass per D-50-9, admin/owner rank-gated flip, fail-closed accept re-derivation, mergeClientDoc pinning, UI in Phase 51); §3 retitled "supprimé côté serveur — Phase 50" (the "Invité externe" toggle dies now; UI removal Phase 51).
- **Task 2 (f4d9796) — planning lockstep.** ROADMAP.md Phase 50 one-liner and goal rewritten from "team-share snapshot expansion"/"snapshot bulk grant" to live team links (criterion 3 already carried D-50-5 — untouched). REQUIREMENTS.md M-03/INV-03 already carried D-50-5; the two residual contradictions were rewritten: TEAM-RESYNC (v3 deferred) and the out-of-scope "Live-list team grants" row are both marked superseded by D-50-5. PROJECT.md verified already in lockstep (lines 17, 33-35) — no edit needed.
- **Task 3 — evidence sweep + phase gate** (below). All five success criteria evidenced; residual greps clean; full suite green (1115 tests, 1104 pass, 0 fail, 11 pre-existing skips; one flaky `unsubscribe-route` ECONNRESET on the first run — known environmental flake already in Deferred Items, clean on re-run).

## Success-criteria evidence (Phase 50, criteria 1-5)

1. **Strict owner-only-owner hierarchy at create/edit/accept** — `node --test test/invite-hierarchy.test.mjs` (50-03 commit 22e98dd): `ownerInviteForbidden` refused at every rank on the RAW body (create), `ownerManagedRoles`/`ownerTransferOnly` (edit), raw-INSERT CHECK refusal + accept grants exactly the invite role (accept).
2. **Post-invite edits enforced on the very next request** — `node --test test/membership.test.mjs` (50-03 commits 22e98dd/451a314): D-50-3 role-demotion pin (doc PUT → `readOnlyAccess` next request, roster shows Guest, no re-login) + p.members add/remove flipping private-project readability next request via `POST/DELETE /api/workspaces/:ws/projects/:pid/members[/:uid]`.
3. **Live team link grant/revoke** — `node --test test/visibility-team.test.mjs` (50-01 commit 4be4f6b: team join grants on the next request; team-leave revokes with byte-identical 404 unless individually listed; second boot byte-identical with links intact) + reverse-sweep fixture in `test/visibility-migration.test.mjs` (50-02 commit f84fcee: only backup-diff-identified sweep entries converted; genuine invites preserved; restored links grant through the LIVE funnel).
4. **Per-project guest toggle OFF/refusals/fail-closed accept** — `node --test test/invite-hierarchy.test.mjs` VIS-04 describe (50-03 commit 0e9a258): default OFF (absent field = OFF), member refusals per cause (`inviteMemberRoleCeiling`/`inviteMemberProjectRequired`/`inviteGuestToggleOff`/`inviteTeamsAdminOnly`), admin bypass (D-50-9), admin/owner-only flip, stale invite accepted after the flip re-derives fail-closed with zero side effects (D-50-8), existing guests untouched.
5. **Multi-project guest membership / one guest concept** — INV-04 pin in `test/invite-hierarchy.test.mjs` (one viewer account in `p.members` of two private projects, both served) + D-50-10 normalization in `test/visibility-migration.test.mjs` (legacy `'guest'` rows rewritten to `'viewer'` in memberships AND invites); repo-wide grep: zero `'guest'` role writers in server.js/mcp.js (only the normalization migration + a defensive coercion), `guestSingleProject`/`invGuest` absent server-side (0 hits).

**Residual greps:** `grep -rnE "materializeVisibilityGrants|sweepNeeded" server.js mcp.js | wc -l` → **0** (retired sweep did not resurface). `npm test` → **1115 tests / 1104 pass / 0 fail / 11 pre-existing skips** — phase gate green.

## Coverage

- verification: { kind: command, ref: "grep -nE 'p\\.teams|équipe|team' docs/ProjectPermissions.md → three-term predicate present", status: pass, human_judgment: false }
- verification: { kind: command, ref: "grep -nE 'allowInviteGuests' docs/WorkspacePermissions.md → toggle semantics documented", status: pass, human_judgment: false }
- verification: { kind: command, ref: "grep -niE 'snapshot' .planning/REQUIREMENTS.md .planning/PROJECT.md → only D-50-5 supersession wording + unrelated digest note", status: pass, human_judgment: false }
- verification: { kind: command, ref: "grep -n 'D-50-5' .planning/{REQUIREMENTS,ROADMAP,PROJECT}.md → present in all 3 files", status: pass, human_judgment: false }
- verification: { kind: command, ref: "grep -rnE 'materializeVisibilityGrants|sweepNeeded' server.js mcp.js | wc -l → 0", status: pass, human_judgment: false }
- verification: { kind: tests, ref: "npm test → 1115 tests, 1104 pass, 0 fail, 11 pre-existing skips", status: pass, human_judgment: false }
- verification: { kind: tests, ref: "test/invite-hierarchy.test.mjs + test/membership.test.mjs + test/visibility-team.test.mjs + test/visibility-migration.test.mjs — criteria 1-5 evidence files, individually green in 50-01..50-03 and within the full suite", status: pass, human_judgment: false }

## Deviations from Plan

**1. [Task 2 note] PROJECT.md needed no edit**
- **Found during:** Task 2
- **Issue:** plan anticipated v2.0 decision lines with snapshot semantics to rewrite.
- **Fix:** PROJECT.md was already updated to D-50-5 live-link wording (lines 17, 33-35) before this plan ran; verified instead of edited.
- **Verification:** grep D-50-5 hits all three planning files.

**Total deviations:** 1 (verification-only). **Impact:** none.

## Authentication Gates

None.

## Known Stubs

None. (Line-number references in the docs were deliberately left un-renumbered where they still resolve; where code moved, refs were de-line-numbered to file-level precision.)

## Self-Check: PASSED

- docs/ProjectPermissions.md and docs/WorkspacePermissions.md modified on disk (934c455).
- .planning/REQUIREMENTS.md + .planning/ROADMAP.md modified on disk (f4d9796); D-50-5 present in all three planning files.
- Residual greps green (0 retired-sweep symbols; snapshot wording only in supersession citations).
- Full suite green: 1104 pass / 0 fail / 11 pre-existing skips.
- Commits 934c455 and f4d9796 present in git log.

## Next

Phase 50 complete — ready for `/gsd-verify-work 50`, then Phase 51 (client surfaces, Permissions-page removal & project creation).
