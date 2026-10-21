---
phase: 04-hardening-and-ship
plan: 02
subsystem: testing
tags: [node:test, node:sqlite, migration, tenancy, backup, idempotency, legacy-fixture]

# Dependency graph
requires:
  - phase: 01-tenancy-foundation
    provides: slug-scoped workspaces, migrateTenancy(), pre-migration vacuum backup, memberships.member_id, invites.workspace_id
  - phase: 04-hardening-and-ship
    provides: test/helpers/server.mjs harness with caller-supplied dataDir and reboot support
provides:
  - test/helpers/legacy-fixture.mjs — exact pre-tenancy schema/rows plus a server-compatible scrypt hash
  - test/migration.test.mjs — 8 tests proving backup-first, migration correctness and second-boot idempotency
  - server.js — legacy invites are now scoped by migrateTenancy() (backfillInvites)
affects: [04-03 CI wiring, 04-04 release docs]

actuals:
  tokens: 3800
  tasks: 2
  commits: 3
plan_head_before: 84cc407905fe2e8cb36e5dab02db72dca2e3a38c
plan_head_after: af41b7c3451181d7d0c32ef8fbfa2457e5f52822

tech-stack:
  added: [] # node:sqlite and node:crypto are built into Node 24
  patterns:
    - "Legacy fixtures are real files on disk; the server migrates them with no mocks"
    - "Migration assertions read the backup first, then the migrated database, using withDb()"
    - "Idempotency is a byte-for-byte snapshot comparison across a reboot on the same DATA_DIR"

key-files:
  created:
    - test/helpers/legacy-fixture.mjs
    - test/migration.test.mjs
  modified:
    - server.js

key-decisions:
  - "The fixture is asserted to lack slug/color/member_id/workspace_id before the server opens it, so a passing test cannot come from an already-migrated schema"
  - "The backup is inspected before any rewritten row, proving the rollback artefact holds empty tenancy columns and the original document"
  - "Idempotency compares the backup list, workspace row, doc string, revision, updated_at, member ids and invite scope across a real reboot"
  - "The invite scope gap was fixed in migrateTenancy() rather than asserted as null, because SPEC step 6 and DEPLOY promise scoped legacy invites"

patterns-established:
  - "A caller-supplied dataDir survives server.stop(), so the suite can assert the harness did not own cleanup"
  - "Fixture helpers live in test/helpers/ and export only the builder plus the password constant"

requirements-completed: [R6, R8]

coverage:
  - id: D1
    description: "A real pre-tenancy database boots into a migrated workspace: one timestamped backup first, derived slug/name/colour, linked memberships, scoped invite, demo array removed, data.me retired, p_keep/t_keep preserved, owner can sign in"
    requirement: R6
    verification:
      - kind: integration
        ref: "node --test test/migration.test.mjs (7 first-boot tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A second boot against the migrated database creates no backup and changes no value; both accounts keep access and an unknown slug answers 404"
    requirement: R6
    verification:
      - kind: integration
        ref: "test/migration.test.mjs#a second boot is a no-op and both accounts keep access"
        status: pass
    human_judgment: false
  - id: D3
    description: "The migration suite joins the shared npm test run without breaking the existing 32 tests"
    requirement: R8
    verification:
      - kind: integration
        ref: "npm test (40 tests, 8 migration)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-10-21
status: complete
---

# Phase 4 Plan 2: Legacy migration and idempotency proof Summary

**A hand-built pre-tenancy SQLite file now proves the real server writes one pre-migration backup, derives the workspace from the old document, links members and invites, preserves every project/task, and changes nothing on the next boot.**

## Performance

- **Duration:** ≈25 min
- **Completed:** 2026-10-21T19:23Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- `test/helpers/legacy-fixture.mjs` creates the exact old column sets — `workspaces` without
  `slug`/`color`, `memberships` without `member_id`, `invites` without `workspace_id` — and seeds
  `ws_legacy` (revision 7), Alice/Bob accounts with a `scrypt$16384$8$1$…` hash for
  `legacy-password-1`, two memberships, one pending invite, the demo `data.workspaces` array,
  `data.me = 'm_alice'`, and a preserved project `p_keep` / task `t_keep`. The helper closes the
  database before returning.
- `test/migration.test.mjs` captures the fixture's columns *before* boot, then asserts in order:
  exactly one `gr8r-premultitenant-*.db` and the logged path; the backup holds null tenancy
  columns, the demo array and `data.me`; the migrated row has `legacy-studio` / `Legacy Studio` /
  `#3D8E5F`; the document has no `data.workspaces`, `data.me === null`, `data.ws.url` intact and
  both preserved rows; member profiles carry `userId` and memberships carry `member_id`; the
  invite is scoped to `ws_legacy`; Alice signs in and reads the project off the HTTP API.
- The second boot test snapshots the backup list, workspace row, raw doc string, revision,
  `updated_at`, membership ids and invite scope, stops the server, reboots on the same `DATA_DIR`,
  and asserts the snapshot is byte-identical. Bob still reads `legacy-studio` as `member` and an
  unknown slug answers `404`.
- The `after()` hook proves the harness left the caller-supplied directory in place, then removes
  it itself and asserts it is gone.

## Task Commits

1. **Task 1: Pre-tenancy fixture and first-boot migration assertions** — `e7029d5` (feat)
2. **Task 2: Second-boot idempotency and access proof** — `af41b7c` (test)

**Plan metadata:** this SUMMARY + STATE/ROADMAP (`docs(04-02)` commit).

## Files Created/Modified

- `test/helpers/legacy-fixture.mjs` — legacy schema, document, rows, `legacyScryptHash()`,
  `createLegacyDb()`, `LEGACY_PASSWORD`.
- `test/migration.test.mjs` — 8 tests: first boot, backup snapshot, row, document, links, invite,
  authenticated read, second-boot no-op.
- `server.js` — `backfillInvites()` called from `migrateTenancy()` (see deviation).

## Decisions Made

- The fixture's pre-boot schema is captured through `pragma table_info` and asserted in the first
  test, so a fixture that accidentally matched the new schema could not pass.
- The backup is a first-class assertion target, not an implementation detail: the test reads it
  with `withDb()` and proves the tenancy columns are present but empty (they are added by
  `openDb()` before `migrateTenancy()` writes the backup).
- Idempotency includes `updated_at` and the raw `doc` string, which is stricter than the plan's
  slug/doc/revision list and catches a silent rewrite that leaves values equal.
- `legacyScryptHash()` uses a fixed 16-byte salt so the fixture is deterministic; the password is
  a documented test-only constant (T-04-05 accepted).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] `migrateTenancy()` never scoped legacy invites**
- **Found during:** Task 1, when the invite assertion failed with `workspace_id = null`.
- **Issue:** The phase 1 SPEC ("Backfill `invites.workspace_id`") and DEPLOY's upgrade section
  promise that pre-tenancy invites move onto the migrated workspace, and the phase 1 SUMMARY
  claimed it. `openDb()` only added the column; no backfill existed, so an old pending invite
  became invisible to the scoped pending-invite query and would never be accepted.
- **Fix:** added `backfillInvites()` — `update invites set workspace_id = ? where workspace_id is
  null`, using `firstWorkspace()` — and call it from `migrateTenancy()` before
  `backfillMemberships()`. Scoped invites always carry an id, so later boots are no-ops.
- **Files modified:** `server.js`
- **Verification:** the invite test passes; the second-boot snapshot confirms no drift.
- **Committed in:** `e7029d5`

**Total deviations:** 1 auto-fixed (1 Rule 2)
**Impact on plan:** no scope creep — a three-line migration fix required by the plan's own
assertion and by documented upgrade behaviour.

## Threat Surface

- `createLegacyDb()` writes fixed ids to a directory the test owns (`mkdtemp`), and the suite
  asserts the legacy columns are absent before boot (`T-04-04` mitigated).
- The backup file is read-only in the assertions and lives beside the fixture database; the
  suite removes the whole directory in `after()`.
- The fixture password hash is deterministic and test-only (`T-04-05` accepted).
- No package was installed or upgraded (`T-04-SC`): only Node built-ins are used.

No new threat flags.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `npm test` now runs 40 tests including the migration file; plan 04-03 can wire it into CI.
- The `invites.workspace_id` backfill closes the last documented migration promise; release docs
  in 04-04 can describe the upgrade path as implemented.
- `npm run lint` and `npm run format:check` are green.

## Self-Check: PASSED

`test/helpers/legacy-fixture.mjs`, `test/migration.test.mjs` and this SUMMARY exist; `e7029d5`
and `af41b7c` are in history; `node --test test/migration.test.mjs` passed twice in a row and
`npm test` is 40/40.

---
*Phase: 04-hardening-and-ship*
*Completed: 2026-10-21*
