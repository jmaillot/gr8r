---
phase: 29-team-project-scoped-permissions
fixed_at: 2026-11-02T00:00:00Z
review_path: .planning/phases/29-team-project-scoped-permissions/29-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 29: Code Review Fix Report

**Fixed at:** 2026-11-02
**Source review:** .planning/phases/29-team-project-scoped-permissions/29-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (CR-01, WR-01..04; IN-01..03 excluded per `fix_scope: critical_warning`)
- Fixed: 5
- Skipped: 0

**Verification:** full gate `node --test --test-concurrency=2 test/*.test.mjs` → **746 pass / 0 fail / 3 intentional skips** (baseline preserved; net +1 test from the new CR-01 regression case). Ran in the **main checkout** (`workflow.use_worktrees: false` — the fixer edited and committed directly on `main`, no worktree). Per-finding verification: `node --check` on every touched JS file plus targeted suites (`scope`, `due-reminders`, `error-codes`, `i18n-*`) after each fix.

## Fixed Issues

### CR-01: Resending a scoped invite silently strips its scope (access broadening)

**Files modified:** `server.js`, `test/scope.test.mjs`
**Commit:** bc3afc4
**Status:** fixed: requires human verification (logic-level access change)
**Applied fix:** `invitesOf()` now selects the `scope` column and projects it (JSON-parsed, same defensive shape check as `teams`) in the invites payload, so `A.resendPendingInvite`'s `row.scope || null` echo works and the replacement invite keeps the original scope. Added a regression test: create a scoped invite → `GET /invites` payload carries `scope` → resend (fresh POST replaces the live invite) → the fresh row still carries the scope.

### WR-01: `runReminderPass` reads `t.projectId` but tasks store `project` — scheduler and SCOPE-04 guard never ran

**Files modified:** `server.js`, `test/due-reminders.test.mjs`, `test/scope.test.mjs`
**Commit:** 50e8e2b
**Status:** fixed: requires human verification (logic error — semantic change makes previously-vacuous guards live)
**Applied fix:** `projects.get(t?.projectId)` → `projects.get(t?.project)` in `runReminderPass`; dropped the dead `task?.projectId` fallback in `queueNotifEmails` (tasks carry `project`, per the client's `createTask`). Updated all test seeds that used the retired synthetic `projectId` key to the real `project` shape (`due-reminders.test.mjs` fixture + REM-04 rows; `scope.test.mjs` matrix reminder probes and mail-server reminder tasks).

**Test-structure note:** the fixture reminder tasks carry out-of-scope *assignments* (that is what they probe); with the scheduler live, the SCOPE-04 assignee write-guard now correctly refuses any doc PUT that round-trips them. The fixtures were therefore re-planted after the write-guard probes run: the matrix reminder probes plant lazily on first use (`plantReminderProbes()`), and the mail-server section runs its two PUT-guard subtests before planting `t_s_*`. Server behavior is unchanged — this is fixture ordering only.

### WR-02: File-serve scope check ran on the un-normalized stored document

**Files modified:** `server.js`
**Commit:** b3ee7c5
**Status:** fixed
**Applied fix:** `serveFileBinary` calls `normalizeProjects({ data })` on the freshly parsed document before `hiddenFor(...)`/`inScopeProject` read `p.teams` — a legacy scalar-`team` project now gets the same reach on the file path as on the normalized doc read. The parse is fresh per request, so the in-place mutation touches no shared state.

### WR-03: `copyInviteLink` compared a UI label against an API role

**Files modified:** `src/actions/actions.js`
**Commit:** e95a244
**Status:** fixed
**Applied fix:** the scope guard now compares `role === ROLE_ADMIN_UI` (the `'Member' | 'Admin' | 'Guest'` picker label), mirroring `submitInvite`. An admin who toggles scope picks then switches to Admin no longer sends a stale scope on the copied link. (The role value itself is unchanged: the server's `inviteRole()` coerces either casing.)

### WR-04: Unparseable stored scope failed open silently

**Files modified:** `server.js`
**Commit:** d45de56
**Status:** fixed
**Applied fix:** kept the D-01/D-04 fail-open semantics, but `projectScope` now `console.warn`s once per distinct corrupt payload (module-level `CORRUPT_SCOPE_WARNED` Set keyed on the raw string) naming the member id — an admin can tell "scope column corrupt" from "scope cleared" without log spam.

## Skipped Issues

Per the orchestrator's `fix_scope: critical_warning`, the three Info findings were not attempted:

- **IN-01** (re-accept coalesces scope) — documented behavior, no fix required this phase.
- **IN-02** (`resendInvite` rides the coalesce) — comment-only suggestion.
- **IN-03** (scope-builder triplication) — refactor; note WR-03's fix stayed local to `copyInviteLink` per the narrow-fix rule, so the triplication remains for a future cleanup.

---

_Fixed: 2026-11-02_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
