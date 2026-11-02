---
phase: 29-team-project-scoped-permissions
status: awaiting_human_verification
verification: 29-VERIFICATION.md
verification_result: human_needed
recorded: 2026-11-02
---

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
