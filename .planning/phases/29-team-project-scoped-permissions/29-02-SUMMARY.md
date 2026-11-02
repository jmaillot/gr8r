---
phase: 29-team-project-scoped-permissions
plan: 02
subsystem: server
tags: [scope, permissions, 404-matrix, no-oracle, tdd, side-door]
status: complete
requires: [hiddenFor()/inScopeProject() substrate (29-01), serveFileBinary, redactDoc/mergeClientDoc funnel]
provides:
  - D-03 grant inversion — scopeGrants(): scope OPENS private projects inside its reach (visible ⟺ in scope for scoped members)
  - A1 union read — team reach opens private team-linked projects (one predicate term + one matrix cell to flip if revisited)
  - serveFileBinary record.project visibility check — the last by-id side door closed (T-29-05)
  - test/scope.test.mjs MATRIX — the named SCOPE-03 404-matrix artifact (table-driven, family × probe)
affects: [29-03 notifications, 29-04 invites, /gsd-verify-work UAT]
tech-stack:
  added: []
  patterns: [single-funnel authz composition, byte-identical 404 no-oracle, table-driven 404-matrix, RED→GREEN TDD]
key-files:
  created: []
  modified: [server.js, test/scope.test.mjs]
key-decisions:
  - "D-03 implemented as inScopeProject(p) && scopeGrants(p) — for scoped members visibility reduces to 'in scope', since inScope implies the explicit-projects and team-reach grant terms; private+out-of-scope stays hidden even when the member is on the access list"
  - "Project-less file records (workspace-level uploads — real uploads outside a project context serialize without the key) stay member-visible; only project-bound records are scope-checked (deviation from the plan's 'absent → 404' wording)"
  - "Doc-PUT matrix 'unknown project' cell skip-marked: dangling-project write semantics pre-date this phase and are not a scope hole (the id references no hidden data)"
  - "Matrix placeholder rows for families 3/5/6/7 skip-marked with their covering plans (29-02 family 2 / 29-03 / 29-04), making the matrix the complete named artifact future families must extend"
requirements-completed: [SCOPE-02, SCOPE-03]
duration: 27 min
completed: 2026-11-02T09:30:00Z
estimate:
  tokens: 100000
actuals:
  tokens: 3908
  tasks: 3
  commits: 5
plan_head_before: 772cf5ba705c05f28654bae2d33b26a19eb9b234
plan_head_after: e4b828eb71f81f782f21eecf985b230f05a32fb7
commits: 5
coverage:
  - deliverable: "D-03 grant truth table holds in tests (public in/out, private in-scope on/off-list, private out-of-scope, A1 team reach, null-scope regression)"
    verification: [{ kind: tests, ref: "test/scope.test.mjs#D-03 truth table: *", status: pass }, { kind: tests, ref: "test/scope.test.mjs#null-scope membership keeps the pre-phase workspace-wide view (regression)", status: pass }]
    human_judgment: false
  - deliverable: "File-serve side door closed — out-of-scope/foreign/unknown ids byte-identical 404 fileNotFound; private-project outsider gap closed"
    verification: [{ kind: tests, ref: "test/scope.test.mjs#an out-of-scope file answers the byte-identical unknown-id 404 (no oracle)", status: pass }, { kind: tests, ref: "test/scope.test.mjs#a workspace-wide outsider hits the closed gap: private-project file now 404s", status: pass }]
    human_judgment: false
  - deliverable: "The named 404-matrix (SCOPE-03) — table-driven sweep with unknown ≡ out-of-scope byte-identical assertion"
    verification: [{ kind: tests, ref: "test/scope.test.mjs#404-matrix [family 4] file serve — *", status: pass }, { kind: tests, ref: "full suite: node --test --test-concurrency=2 test/*.test.mjs — 719 pass, 0 fail", status: pass }]
    human_judgment: false
---

# Phase 29 Plan 02: Route Sweep & 404-Matrix Summary

**One-liner:** The D-03 grant inversion (scope OPENS private projects — visible ⟺ in scope for scoped members) riding the single `hiddenFor` funnel, the file-serve by-id side door closed with byte-identical 404 `fileNotFound`, and the named table-driven 404-matrix per endpoint family.

## Accomplishments

- **D-03 grant inversion (Task 1):** `hiddenFor()`'s scoped branch now composes `inScopeProject(p, scope) && scopeGrants(p, scope, memberId)` — the grant terms (explicit projects, team reach (A1 union read), public, access-list membership) short-circuit the private check. Effective semantics: a scoped member sees everything in scope, including private projects they were never added to (the guest-critical cell); private+out-of-scope stays hidden even when on the access list. Null-scope members keep the untouched pre-phase `canSeeProject` path. All six truth-table cells pinned through the real doc GET.
- **File-serve side door (Task 2):** `serveFileBinary` derives the caller's hidden set via the same `hiddenFor()` funnel and 404s `fileNotFound` — byte-identical to the unknown-id branch — when `record.project` is hidden, before any filesystem work (T-29-05). This closes a pre-existing gap: private-project files previously served to any member holding the id.
- **The named 404-matrix (Task 3, SCOPE-03):** `MATRIX` table in `test/scope.test.mjs` — families {doc GET omission, doc PUT rejection/rollback, file serve} × probes {in-scope id, out-of-scope known id, unknown id}, one helper, one fixture member, with the unknown ≡ out-of-scope byte-identical (status + code + message) assertion on the file family. Placeholder rows for families 3/5/6/7 skip-marked with covering plans; "checked, not affected" comment block for families 3/7/8.
- **Tests:** suite grew 23 → 42 tests (37 pass, 5 intentional skips).

## TDD Gate Compliance

- **Task 1 (tdd=true):** RED commit `98438bc` — 6 truth-table cells + null-scope regression; exactly the 2 grant cells failing (intentional RED, exit non-zero). GREEN commit `69dcad9` — 23/23. REFACTOR: none needed.
- **Task 2 (tdd=true):** RED commit `3975486` — 4 probes; exactly the 2 gap cells failing. GREEN commit `dfa1cce` — 28/28. REFACTOR: none needed.
- **Task 3** is not behavior-adding under the RED gate (test-only artifact).

## Deviations from Plan

**1. [Rule 1 - Bug] Project-less file records stay member-visible (not 404)**
- **Found during:** Task 2 GREEN run — 6 tests in `test/upload.test.mjs` failed against the plan's literal "record.project hidden **or absent** → 404" wording.
- **Issue:** real uploads outside a project context serialize their doc record WITHOUT the `project` key (`project: undefined` is dropped in JSON), and the upload suite's fixtures plant such records. Absent → 404 would break legitimate workspace-level attachments.
- **Fix:** the visibility check applies only when `record.project` is present; project-less records keep the pre-phase member-visible contract. No scope hole: out-of-scope file records are reserved by `mergeClientDoc` (Plan 01), so a scoped member cannot strip the project key to evade the check.
- **Files modified:** server.js (dfa1cce comment + condition)

**2. [Rule 1 - Test bug] Wrong null-scope regression baseline in the RED tests**
- **Found during:** Task 1 RED run
- **Issue:** the regression cell expected the scoped member to see both private projects at null scope, but pre-phase semantics hide off-list private projects (the fixture only put them on `p_priv1`'s list).
- **Fix:** corrected the expected set to `['p_in', 'p_out', 'p_priv1']`.
- **Files modified:** test/scope.test.mjs (98438bc, pre-commit)

**Total deviations:** 2 auto-fixed (2 Rule 1). **Impact:** none on plan scope.

## Verification Results

- `node --test test/scope.test.mjs` — 42 tests: 37 pass, 5 intentional skips, 0 fail
- `node --test test/upload.test.mjs` — 11/11 pass (side-door change regression-checked)
- `node --test --test-concurrency=2 test/*.test.mjs` — **719/719 pass, 0 fail, 5 intentional skips**

## Issues Encountered

None beyond the documented deviations.

## Next Phase Readiness

Ready for 29-03 (notifications): `hiddenFor()` is the authoritative visible-set predicate for server-side send-time filters (`runReminderPass` skip), and the matrix's family-5 placeholder row names Plan 29-03 as its cover — the new family work must visibly extend `MATRIX`.

## Self-Check: PASSED

- `server.js`, `test/scope.test.mjs` modified on disk and committed ✓
- All 5 commits found in `git log` (98438bc, 69dcad9, 3975486, dfa1cce, e4b828e) ✓
- Plan-level `<verification>` commands re-run green (719/719, 5 intentional skips) ✓
