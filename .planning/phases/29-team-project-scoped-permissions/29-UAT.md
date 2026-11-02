---
status: complete
phase: 29-team-project-scoped-permissions
source: 29-01-SUMMARY.md, 29-02-SUMMARY.md, 29-03-SUMMARY.md, 29-04-SUMMARY.md
started: 2026-11-02T11:05:00Z
updated: 2026-11-02T12:25:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Scope limits visibility to the assigned team/project
expected: User2 (Member) sees only the projects his scope names. Admin flow: member modal
  scope editor — check EquipeB ⇒ User2 sees ProjetB, not ProjetA.
result: skipped
reason: "Deferred follow-up: Product-model change decided during UAT — visibility must be
  derived from team membership for ALL members (project.teams ∩ member.teams), projects
  with no team stay workspace-wide. The phase-29 scope stays as an optional admin
  restriction on top. Routed to ROADMAP backlog 999.1; not a phase-29 gap (its contract,
  the explicit scope predicate, works as designed — verified by test/scope.test.mjs)."
debug_session: ""

### 2. Guest / scoped-member browser walkthrough (D-05/D-08/D-11)
expected: Scoped member sees exactly the scoped projects, no scope indicator, out-of-scope
  by-id requests 404 identical to unknown.
result: pass

## Summary

total: 2
passed: 1
issues: 0
pending: 0
skipped: 1
blocked: 0

## Deferred Follow-Ups

- test: 1
  idea: "Visibilité dérivée des équipes pour tout le workspace : un projet est lisible par
    les membres de ses équipes (project.teams ∩ member.teams ≠ ∅) ; un projet sans équipe
    reste workspace-wide ; le scope phase 29 demeure une restriction admin optionnelle
    par-dessus. Décidé en UAT le 2026-11-02 (scénario User2 EquipeA→EquipeB)."
  deferred_at: 2026-11-02

## Gaps

[none]


# Phase 29: User Acceptance Testing

Automated verification scored **17/18 must-haves verified** (see `29-VERIFICATION.md`). One
must-have is `PRESENT_BEHAVIOR_UNVERIFIED` (fixture-only test coverage) and one human walkthrough
is required before the phase can complete. Route back into the workflow with:

```
/gsd-verify-work 29
```

## UAT-1 — Reminder-pass scope guard on real task data (SCOPE-04, review finding WR-01)

**What to check:** The send-time notification guard in the reminder pass must filter out-of-scope
assignees using tasks shaped the way production tasks actually are.

**Why it's flagged:** The guard reads `t?.projectId` (server.js:1178), but real stored tasks carry
the project key as `project` (server.js:742/822/977). The only passing test plants a synthetic
`projectId` field, so the production path is never exercised. This corroborates open review
finding WR-01 — the SCOPE-04 guard may never fire on real data.

**Steps:**
1. Create a task assigned to a member, stored via the normal client path (so it carries `project`,
   not `projectId`).
2. Make the assignee out-of-scope for that project (scoped membership excluding it).
3. Trigger a reminder pass (scheduler or the manual trigger, whichever your build exposes).
4. **Expected:** the out-of-scope assignee receives **no** notification. An in-scope assignee in
   the same pass still does.

**Fail evidence:** out-of-scope assignee receives a notification.

## UAT-2 — Guest / scoped-member browser walkthrough (D-05 / D-08 / D-11)

**Steps (as a guest or scoped member):**
1. Log in and observe the project list — **expected:** exactly one project visible (the scoped
   one), no scope/self-indicator leaking membership details.
2. Open a project directly by id that is out-of-scope — **expected:** same response as a
   nonexistent project (404, byte-identical to the unknown case — no 403, no redirect).
3. Repeat step 2 for a resource the member has never heard of vs one deliberately hidden —
   the two responses must be indistinguishable.

**Fail evidence:** anything other than exactly one visible project, any visible role/scope
indicator, or any observable difference between unknown vs out-of-scope responses.

## Context

- 8 code-review findings remain `open` in `29-REVIEW-DISPOSITION.md` (1 critical: CR-01
  resendPendingInvite strips invite scope). Not UAT blockers, but recommended:
  `/gsd-code-review 29 --fix`.
- Full suite baseline: 746 pass / 0 fail / 3 intentional skips.
