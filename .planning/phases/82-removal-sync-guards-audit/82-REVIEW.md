---
phase: 82-removal-sync-guards-audit
reviewed: 2026-11-20T00:00:00Z
depth: deep
files_reviewed: 2
files_reviewed_list:
  - server.js
  - test/groups-sso.test.mjs
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 82: Code Review Report

**Reviewed:** 2026-11-20
**Depth:** deep
**Files Reviewed:** 2 (`server.js`, `test/groups-sso.test.mjs`; commits c9cc398b..062c210f)
**Status:** issues_found

## Summary

The Phase 82 reconcile pass was reviewed line-by-line against its stated guarantees (GS-01 lost-claim deletion, GS-02 owner guard funnel, GS-03 downgrade immunity, D-82-7 conditional provenance SET, D-82-11 encoded delta trail) and cross-checked against the called functions (`addMembership` :4659, `ownerCount` :3409, `stripMember` :3458, the member-DELETE/PATCH route guards :7744–:7789). The core logic is sound: the delete path is correctly provenance-gated, the guard is count-before-write with the correct `ownerCount(wsId, row.id)` exclusion semantics, the D-82-7 conditional clause correctly avoids the literal-clobber bug it warns about, and the union target set (mapped ∪ group-derived) covers both grant and removal reconcile. `ownerCount`'s `user_id is not ?` predicate handles the exclusion correctly. No critical defects found.

Two warnings concern traceability guarantees that fall short of the phase's own stated semantics (AUD-01 atomicity and skip-audit symmetry), plus three informational items.

## Critical Issues

None.

## Warnings

### WR-01: AUD-01 atomicity guarantee holds only for the delete path — downgrade/grant/skip delta rows are committed separately from their membership writes

**File:** `server.js:5397-5406` (downgrade audit), `server.js:5424-5433` (grant/upgrade audit), `server.js:5373-5382` (skip audit)
**Issue:** The delete cell writes the membership removal + team purge + doc strip + audit row in ONE `db.tx` (AUD-01: "a forced audit failure rolls back the removal"). The downgrade, grant/upgrade and skip paths deliberately do NOT: `addMembership` owns its internal tx, and the audit insert runs in a *separate* tx immediately after. If the audit insert fails (disk full, constraint, crash between the two txs), the role change / grant / skip-reason is already committed and persists with NO audit row — a silent audit-trail gap. The throw then funnels to the fail-closed catch, so the user sees an error for a change that actually happened, and re-login later reconciles to a no-op with no delta trail of the original change. The summary documents "db.tx does not nest" as the reason, but non-nesting does not force this shape: the audit row could be written inside `addMembership`'s own tx (via an optional audit callback parameter), matching the delete path's guarantee.
**Fix:** Either (a) thread an `onApplied(action)` callback into `addMembership` so the delta row joins the same tx as the membership write, or (b) wrap the downgrade arm's write + audit in one explicit tx by inlining the conflict-update SQL (as the delete cell inlines its deletes) instead of calling `addMembership`. Keep the current shape only if a documented decision explicitly accepts the gap for grant/upgrade/skip — currently AUD-01 is presented in code comments as a uniform phase guarantee.

### WR-02: Removal-side archived-workspace skip is silent — asymmetric with the audited grant-side skip

**File:** `server.js:5331-5335`
**Issue:** On the grant side, a dead/archived workspace produces a `group_membership_skipped:group:<guid>:dead-workspace|archived-workspace` audit row. On the removal side (delete cell), an archived workspace hits `if (!wsState || wsState.archived === 1) continue;` with zero writes and zero audit rows. The 82-01 summary says the removal-side vocabulary was deferred to 82-02, but 82-02 shipped only the grant-side skip rows (its deviation 3 explicitly drops the removal-side `dead-workspace` branch) — the removal-side `archived-workspace` skip was dropped with it. Net result: a lost-claim removal against an archived workspace is permanently untraced, even though D-82-9's vocabulary includes the reason. When the workspace is unarchived, the removal silently executes on the next login with no record of why the row sat in limbo.
**Fix:** Add the same encoded skip row on the removal side:
```js
if (!wsState || wsState.archived === 1) {
  await db.tx(async () => {
    await db.run('insert into audit_log (...) values (...)', [
      uid(), row.id, row.id,
      `group_membership_skipped:group:${guid}:${wsState ? 'archived-workspace' : 'dead-workspace'}`,
      0, clientIp(req), wsId, row.name, row.email, row.name, row.email, now(),
    ]);
  });
  continue;
}
```
(or record an explicit decision that removal-side skips are intentionally unaudited and update the D-82-9 vocabulary comment).

## Info

### IN-01: D-82-7 upgrade path converts manual/invite-origin rows into removal-sync-eligible rows

**File:** `server.js:4668-4673`, `server.js:5414-5418`
**Issue:** The conditional provenance SET flips ANY existing row's provenance to `group:<guid>` when a group writer upgrades it — including rows created via `invite` or `manual` provenance. Consequence: a manually-invited member who is later group-upgraded becomes fully group-owned and will be auto-REMOVED on a lost claim, even though their membership originally predates the group mapping. This is the documented D-82-7 "role-source" decision (and the viewer-upgrade test pins it), but the downstream blast radius — manual origin becoming deletion-eligible — is only visible by reading two files. Worth an explicit note in the D-82-7 comment so Phase 83/84 reviewers don't mistake it for a bug.
**Fix:** Documentation-only: extend the :4660 comment with one sentence stating the deliberate consequence ("an invite/manual row upgraded by a group becomes removal-sync eligible").

### IN-02: Skip audit row references the mapping's guid, not the existing row's provenance guid — audit/provenance skew under multi-group mappings

**File:** `server.js:5376-5381`
**Issue:** The dead/archived grant-side skip row encodes `mapped.groupGuid` (the highest-rank surviving mapping after D-82-10 dedup). If the user already holds a group-derived row in that workspace whose provenance guid differs (written by a now-lower-ranked or since-reordered mapping), the skip row's guid does not match the row the user actually holds — a later correlate-by-guid audit query will miss it.
**Fix:** When an existing group-derived row exists in the skipped workspace, prefer `existing.provenance.slice('group:'.length)` as the guid (falling back to `mapped.groupGuid` otherwise).

### IN-03: Per-login accumulation of duplicate skip/guard audit rows

**File:** `server.js:5305-5313` (guardRefuse), `server.js:5373-5382` (skip)
**Issue:** Every login that hits a dead/archived mapping, or a refused sole-owner guard, writes a fresh audit row — a user whose IdP keeps emitting a mapping to an archived workspace (or who stays the sole owner with a lowered mapping) generates one new row per login indefinitely, with no dedup or suppression. Not a correctness bug, but an unbounded audit_log growth path tied to a single user's login cadence.
**Fix:** Acceptable as-is if audit-per-attempt is the intended semantic (each refusal IS an event); otherwise suppress consecutive identical skip rows per (user, workspace, reason).

## Verification of stated guarantees

- **GS-01 selection key:** delete cell requires `provenance` to start with `group:` (:5326) — manual/invite/NULL rows immune; GUID parsed server-side from stored provenance, never from claims. Confirmed.
- **GS-02 guard:** count-before-write, `ownerCount(wsId, row.id)` excludes the user (:3409-3411, `user_id is not ?`); refusal is `continue`, never a throw; login proceeds. Confirmed by e2e (row intact, session minted, PII-free warn pinned).
- **GS-03 immunity:** downgrade requires group provenance (:5388); manual row with identical shape asserted untouched side-by-side in e2e.
- **D-82-7 conditional clause:** `case when excluded.provenance like 'group:%' ...` (:4671) — the literal-clobber hazard called out in the comment is genuinely avoided; Pin C (invite-over-group) green.
- **D-82-11:** grep confirms zero `sso_group%` `logSecurity` calls remain in server.js (only comment text at :5419); delta trail is audit_log-only, heartbeats intact.
- **Overage (SC5/D-82-4):** whole reconcile inside the mapped else-branch; overage login provably writes nothing (e2e).
- **Tests:** 22 SSO tests reviewed; assertions are behavioral (DB state + audit rows + session cookies), no vacuous passes found. The GS-02 `groups: []` deviation is correctly reasoned (a missing `groups` key skips the reconcile entirely).

---

_Reviewed: 2026-11-20_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
