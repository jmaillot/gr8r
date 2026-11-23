---
phase: 89-restore
fixed_at: 2026-11-23T09:45:00Z
review_path: .planning/phases/89-restore/89-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 89: Code Review Fix Report

**Fixed at:** 2026-11-23T09:45:00Z
**Source review:** .planning/phases/89-restore/89-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (CR-01, WR-01..WR-04 — Info items IN-01..IN-09 out of scope, dispositioned separately)
- Fixed: 5
- Skipped: 0

**Worktree note:** `workflow.use_worktrees` is `false` in `.planning/config.json` — fixes were applied and committed directly in the main checkout on `main` (no worktree isolation), per the documented opt-out.

**Verification note (#2825):** all gates ran in the **main checkout** (no worktree). Per-fix: `node --check` on every modified file (package `type: module`, ESM parse); suite-level: `node --test` over the restore battery (restore-import/overwrite/instance/preview/security/routes/client/s3-e2e — 103 tests, 102 pass, 1 skipped pg-conditional, 0 fail) and the phase companions (backup-scheduler, client-surfaces, email-outbox, i18n-toast/shell/core-features — 92 tests, 92 pass, 0 fail, including the known-flaky `backup-scheduler` green solo). The known pre-existing failures (french-typography D-05, webhook-routes D-06, webhook-events time-window) were not chased and are outside the touched surface. Full `npm test` was NOT run (per-fix verification strategy; full suite belongs to the verifier phase).

## Fixed Issues

### CR-01: restoreInstanceUnit leaks the global restore_lock on early failure paths — instance wedged until reboot

**Files modified:** `export/restore.js`, `test/restore-instance.test.mjs`
**Commit:** 5852fa6b
**Status:** fixed: requires human verification (bad state handling — but covered by a regression cell proven to fail on the pre-fix engine)
**Applied fix:** mirrored the overwrite unit's funnel in `restoreInstanceUnit`: `release` hoisted above `failWith` (was defined after the early paths) and `await release()` added inside `failWith`, so all four reachable early exits (operator identity missing, `restoreArchiveMissing`, `restoreSnapshotFailed`, snapshot-block catch) release the claimed lock. Inner explicit `cleanup(); await release()` calls are now harmless no-ops (release is CAS-idempotent on `claimed_by`).
**Regression cell added:** route-level — trigger DR against a rotated-away archive (local file deleted before the trigger), assert the run row flips to `failed` keyed `restoreArchiveMissing`, `restore_lock.claimed_by` is null, and a follow-up trigger does NOT 409. Negative-checked: the cell fails on the pre-fix engine (verified via `git stash` round-trip) and passes with the fix.

### WR-01: DR team_members rows skip the team_id validation the overwrite path enforces

**Files modified:** `export/restore.js`
**Commit:** f86de580
**Status:** fixed: requires human verification (validation-condition change)
**Applied fix:** `restoreInstanceUnit` now mirrors the overwrite gate: `teamIds` built as the union of the archive docs' `teams[].id` (from `parsedDocs`), and any roster row failing `!r.user_id || !liveUserIds.has(r.user_id) || !r.team_id || !teamIds.has(r.team_id)` skips + reports (`teamMembersSkipped`) instead of crashing the whole DR tx on the `team_members.team_id` NOT NULL constraint or silently inserting dangling team refs.

### WR-02: DR member_id dedupe is global across workspaces, but member_id is per-workspace scoped

**Files modified:** `export/restore.js`
**Commit:** b567fb68
**Status:** fixed: requires human verification (dedupe-algorithm change)
**Applied fix:** the DR unit's `usedMemberIds` Set is now a `Map<workspace_id, Set<memberId>>` — base-then-fallback collision resolution happens only within the row's own workspace, so two workspaces legitimately reusing the same member_id string no longer force the `m_<full-id>` fallback or silently drop valid roster rows. The overwrite unit (single-workspace by construction) keeps its Set.

### WR-03: DR `delete from workspaces` silently cascade-deletes api_keys

**Files modified:** `export/restore.js`
**Commit:** 17508393
**Status:** fixed: requires human verification (disclosure option chosen: revoke-and-report of the three options the review offered)
**Applied fix:** the DR tx now reads `select count(*) from api_keys` and deletes them explicitly BEFORE the `workspaces` delete (so the cascade has nothing to silently destroy), and the run summary carries `apiKeys: { revoked: N }` — matching the D-89-25 session-revocation disclosure discipline. The overwrite unit is untouched (it never deletes workspaces rows). No new refusal codes; no locale changes needed.

### WR-04: all three restore units buffer staged ndjson whole into memory

**Files modified:** `export/restore.js`
**Commit:** 0b1b0a8a
**Status:** fixed (structural/perf refactor; read-back semantics preserved and pinned by the existing count-vs-manifest tests — 103-test restore battery green)
**Applied fix:** new shared `readStagedTables(manifest, stagingDir)` streams each staged table with `fs.createReadStream` + `node:readline` (builtin — zero new dependencies, D-33-11). Rows are retained only for the tables the units actually consume (`workspaces`, `memberships`, `team_members`, `invites`, `instance_roles`); every other table (the unbounded operational append logs: `audit_log`, `security_log`, `webhook_deliveries`, `email_outbox`, …) is streamed line-by-line and counted only. `archiveCounts` feeds the import unit's per-table count-vs-manifest verification (line-for-line the same parsed-row count as before), so D-89-30 verification semantics are unchanged while those bytes never accumulate in RAM. All three call sites (import/overwrite/DR) now use the helper.

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-11-23T09:45:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
