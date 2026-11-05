---
phase: 38-daily-digest-reminder-suppression
reviewed: 2026-11-04T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - server.js
  - mailer.js
  - src/core/notifPrefs.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/digest.test.mjs
findings:
  critical: 1
  warning: 2
  info: 2
  total: 5
status: issues_found
---

# Phase 38: Code Review Report

**Reviewed:** 2026-11-04
**Depth:** standard
**Files Reviewed:** 6 (server.js, mailer.js, src/core/notifPrefs.js, src/locales/en.json, src/locales/fr.json, test/digest.test.mjs — the source hunks of commits f35ca92, 7371399, eb24c37, b55325b)
**Status:** issues_found

## Summary

The digest send path, suppression gate, and default inversion are implemented broadly as planned: claim-then-send exactly-once ledger, post-commit fire-and-forget SMTP, escape-after-interpolation HTML, encodeWord subject, stored-prefs strict `=== true` opt-in, email-only suppression after row claim, and the 16-key whitelist preserved both sides (client `email_digest` re-added explicitly after the defaults spread lost it — a real bug that was caught and fixed in b55325b).

The one serious defect: **the digest's task filter never links tasks to the recipient.** The scope/visibility checks are keyed on the *task assignee's* membership, not the *recipient's*, and there is no assignee-equality filter — so an opted-in member receives a digest of every member's due/overdue tasks, including tasks they themselves cannot see. The whole test suite uses single-member workspaces, so nothing can catch this. I18n keys are complete and paired EN+FR; escaping order and header hygiene in `buildDigestMessage` are correct.

## Critical Issues

### CR-01: Digest recipients get tasks they don't own and may not be able to see — task filter keyed on the assignee, never the recipient

**File:** `server.js:1495-1511`
**Issue:** Inside the digest loop, for each recipient `r` the code iterates ALL workspace tasks and applies `remindable(t, project)` plus the SCOPE-04 checks resolved from `t.assignee`'s membership (`server.js:1501-1505`). There is no `t.assignee === r.member_id` (or user-equivalent) filter anywhere. Two consequences:

1. **Wrong content (correctness):** PLAN 38-01 specifies the digest lists "*their* due-today and overdue tasks" (must_haves truth 1). As shipped, any opted-in member gets everyone's due/overdue tasks in one email — e.g. a fresh member who once saved notification settings (deploy-day stored-true echo, the exact population named in the 38-02 checkpoint) is emailed a full inventory of every other member's workload, due dates included.
2. **Information disclosure (security, T-38-01 not actually mitigated):** the scope pipeline evaluates the *assignee's* scope, not the *recipient's*. A scoped-out recipient (e.g. a member with project-restricted scope who cannot read project P) will still receive titles and deep links for tasks in P when the assignee can see them. The plan's own threat register (T-38-01, "high", "a scoped member's out-of-scope task never appears in their digest") is therefore unmet — the code comment at `server.js:1498-1500` even documents the wrong invariant as intentional ("keyed on the TASK's assignee (the recipient sees exactly what the assignee sees)").

The 38-01 SUMMARY records this filter as "SCOPE-04 checks + remindable() verbatim" but the verbatim copy is only correct when recipient ≡ assignee — which was true for the reminder loop (emails go to `t.assignee`) and is false for the digest (emails go to `r`).

**Fix:**
```js
for (const t of tasks) {
  const project = projects.get(t?.project);
  if (!remindable(t, project)) continue;
  /* Digest lists the RECIPIENT's tasks: only tasks assigned to r, and the
     scope checks must run against r's membership, not the assignee's. */
  if (t.assignee !== r.member_id) continue; // or: resolve recipient's member_id(s) via user_id
  const recipientMembership = db
    .prepare('select user_id, role, scope from memberships where workspace_id = ? and member_id = ?')
    .get(ws.id, t.assignee); // === r.member_id after the filter above
  if (!inScopeProject(project, projectScope(recipientMembership))) continue;
  if (!projectScope(recipientMembership) && !memberCanReadProject(project, ws.id, t.assignee)) continue;
  ...
}
```
(If the digest is intended to be a whole-workspace digest instead, then at minimum the scope checks must switch to the recipient's membership and the plan copy/UI copy must be corrected — either way the current state is wrong against the shipped settings copy "tasks due today and overdue".)

## Warnings

### WR-01: T-38-01's promised scope test was never written — the suite cannot detect CR-01

**File:** `test/digest.test.mjs` (whole file)
**Issue:** Every fixture (`makeWorkspace`) creates exactly one member, and every task is assigned to that same member. The plan's threat model explicitly required "digest test asserts a scoped member's out-of-scope task never appears in their digest" (T-38-01 mitigation) and Task 1's action said to "fetch the membership row for the recipient". No test exercises a second member, a scoped recipient, or a task assigned to someone else — which is exactly why the defect in CR-01 shipped green (941/941).
**Fix:** Add a two-member fixture: member B with stored `email_digest: true`, a task due-today assigned to member A (and/or to B in a project B cannot read), then assert B's digest contains no such task and B's ledger key claims nothing when only A's tasks qualify.

### WR-02: Vacuous, always-passing assertions weaken the SC-2/D-12 pins

**File:** `test/digest.test.mjs:246-248`, `test/digest.test.mjs:279`, `test/digest.test.mjs:351`
**Issue:** Several assertions cannot fail, so they provide pin coverage in name only:
- line 246: `assert.equal(uidB ? 0 : 1, 0)` — a tautology (uidB is always truthy here, but either branch of `?:` was hardcoded to make it pass);
- line 248: `assert.ok(resB.digests >= 0)` — always true;
- line 279: `assert.ok(res.emitted.filter(n => n.task === 'K-F1').length === 0 || true)` — the `|| true` makes it always true;
- line 351: `assert.ok(res.emitted.some(...) || true)` — same pattern.
These are precisely the D-12 honesty and D-11 matrix pins the plan gates on, so a regression in either could pass this suite silently.
**Fix:** Delete the tautologies and assert real invariants: for D-12, `res.emitted` filtered to the fixture's task ids is empty; for D-11, each workspace's emitted reminder rows map to zero reminder-kind emails (already partially asserted at lines 356-360 — drop the vacuous line).

## Info

### IN-01: Suppression gate re-queries stored prefs per notification row

**File:** `server.js:1237-1247`
**Issue:** `queueNotifEmails` resolves `getUserNotifPrefs` (which itself calls `getStoredNotifPrefs`) at the prefs gate, then calls `getStoredNotifPrefs` again inside the new suppression branch for every emitted reminder notif — two identical SELECT+JSON.parse passes per row. Duplicated parse path and extra queries in the hot fan-out.
**Fix:** Read the stored object once (e.g. `const stored = getStoredNotifPrefs(...)`) and derive both the merged prefs and the digest opt-in from it, or memoize per-recipient within the `queueNotifEmails` call.

### IN-02: A failed digest send is lost for the day with only a console.warn trace

**File:** `server.js:1522-1535`
**Issue:** The ledger claim commits before `MAILER.sendDigest`; an SMTP failure (transient outage) consumes the `ws:{userId}:digest:{localDate}` key permanently — no retry, no notif row, no other durable trace beyond `console.warn`. This mirrors the accepted claim-then-send discipline (T-38-03 dispositioned "accept") and the reminder loop's behavior, but reminders keep a durable inbox row as the loss artifact while the digest has none. Documented trade-off, not a defect against the plan — flagging for the phase record.
**Fix (optional):** if loss-on-transient-SMTP-failure is unacceptable, move the claim inside the send success callback, or write a small `digest_failed` audit row in the `.catch` handler.

---

_Reviewed: 2026-11-04_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
