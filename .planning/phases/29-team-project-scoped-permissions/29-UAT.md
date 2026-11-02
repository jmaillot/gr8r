---
status: testing
phase: 29-team-project-scoped-permissions
source: 29-01-SUMMARY.md, 29-02-SUMMARY.md, 29-03-SUMMARY.md, 29-04-SUMMARY.md
started: 2026-11-02T11:05:00Z
updated: 2026-11-02T12:10:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Scope limits visibility to the assigned team/project
expected: |
  Member scoped to EquipeB sees ProjetB (team-linked) and not ProjetA. Team moves alone
  do not change visibility — the admin sets the scope in the member modal.
awaiting: user response (retest after redeploying the server build)

## Tests

### 1. Scope limits visibility to the assigned team/project
expected: User2 (Member) sees only the projects his scope names. Admin flow: member modal
  → scope editor → check EquipeB ⇒ User2 sees ProjetB (EquipeB) and not ProjetA (EquipeA).
result: issue
reported: "User2 basculé de EquipeA vers EquipeB voit toujours ProjetA et pas ProjetB"
severity: major
root_cause: "Tested against a stale deployment, not the phase-29 build. The running server
  (PID 4037, root, dist/start/server.js) started 07:29 today — before phase 29 finished
  (11:06) and before the review fixes (11:30+). This repo's dist/ has no start/ entry, so the
  process serves an older deployed copy. Additionally, team membership alone never drives
  visibility (by design): visibility is governed by the membership SCOPE (member modal scope
  editor), not by the teams picker. Phase 28 moved memberships to the DB; the scope column
  (D-02) is independent of membership.team."
missing:
  - "Redeploy/restart the server from the pushed main (0e88542) and retest"
  - "Set User2's scope via the member modal scope editor (teams: EquipeB) — moving teams
     between EquipeA/EquipeB does not update scope"
test: 1
artifacts: []
debug_session: ""

### 2. Guest / scoped-member browser walkthrough (D-05/D-08/D-11)
expected: Scoped member sees exactly the scoped projects, no scope indicator, out-of-scope
  by-id requests 404 identical to unknown.
result: pending

## Summary

total: 2
passed: 0
issues: 1
pending: 1
skipped: 0
blocked: 0

## Gaps

- gap_id: G-29-1
  truth: "Member scoped to EquipeB sees ProjetB and not ProjetA; team moves alone do not
    change visibility — scope does."
  status: failed
  reason: "User reported: User2 basculé de EquipeA vers EquipeB voit toujours ProjetA et pas
    ProjetB. Diagnosed: server under test predates phase 29 (deployed dist/start/server.js
    started 07:29, phase finished 11:06); plus design clarification — scope (member modal),
    not team membership, drives visibility."
  severity: major
  test: 1
  artifacts: []
  missing:
    - "Redeploy from main (0e88542) and restart the server"
    - "Set scope via member modal scope editor, then retest"


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
