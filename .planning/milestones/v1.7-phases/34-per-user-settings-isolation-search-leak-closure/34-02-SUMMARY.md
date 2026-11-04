---
phase: 34-per-user-settings-isolation-search-leak-closure
plan: 02
subsystem: notifications
tags: [sqlite, migration, backfill, backup-gate, idempotency, i18n]

requires:
  - phase: 34-01
    provides: user_notif_prefs table + getUserNotifPrefs accessor the backfill writes into
provides:
  - migrateUserNotifPrefs(conn) — one-time guarded doc→rows notifPrefs backfill registered in the boot sequence
  - the D-09/D-11 migration guarantee: every member backfilled, doc field deleted, same transaction, pre-backup gate
  - 5 new migration pins incl. the SETTINGS-03 invoices write-path pin
affects: [34-03 search-leak closure, verifier]

actuals:
  tokens: 5200
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - guarded-backfill recipe (JS guard on doc-blob content → backup gate → begin immediate + rollback/rethrow)
    - catalogue-size i18n pin discipline for new err.<code> keys

key-files:
  created: []
  modified:
    - server.js
    - test/migration.test.mjs
    - src/locales/en.json
    - src/locales/fr.json
    - test/i18n-core-features.test.mjs

key-decisions:
  - "Guard evaluated in JS over stored doc blobs (SQL cannot see inside the JSON): eligible = doc carries data.notifPrefs AND ≥1 member lacks a row; guard false forever after the first migrating boot"
  - "insert or ignore per (workspace_id, user_id) with D-09 scope — EVERY member of an eligible workspace gets the workspace-level prefs, preserving any row a user already set via the accessor"
  - "err.unknownPrefKey catalogued in en/fr during this plan: 34-01 emitted the code without catalogue entries — closed here as the npm-test-green blocker"

patterns-established:
  - "corrupt-doc boot safety: per-row JSON.parse try/catch fallback (migrateTenancy precedent) proven by the T-34-05 pin"
  - "byte-identity proof extended: snapshot() now carries user_notif_prefs rows + columns + table DDL across the reboot"

requirements-completed: [SETTINGS-01, SETTINGS-03]

coverage:
  - id: M1
    description: "Guarded backfill: every member of every workspace whose doc carries notifPrefs gets a row; field deleted from the stored doc in the same transaction, after a successful pre-migration backup"
    requirement: SETTINGS-01
    verification:
      - kind: integration
        ref: "test/migration.test.mjs#the first boot backfills doc-carried notifPrefs into one row per member and strips the field"
        status: pass
      - kind: integration
        ref: "test/migration.test.mjs#PREFS: a two-member workspace backfills per member and a corrupt doc is skipped without crashing the boot (T-34-05)"
        status: pass
    human_judgment: false
  - id: M2
    description: "Second boot is a byte-identical no-op: no slug/doc/member_id/revision drift, no second backup, identical user_notif_prefs DDL"
    requirement: SETTINGS-01
    verification:
      - kind: integration
        ref: "test/migration.test.mjs#a second boot is a no-op and both accounts keep access (snapshot extended with user_notif_prefs rows/columns/DDL)"
        status: pass
      - kind: integration
        ref: "test/migration.test.mjs#the second boot leaves user_notif_prefs byte-identical — no duplicates, no second backup"
        status: pass
    human_judgment: false
  - id: M3
    description: "Later-joiner defaults: a member added after migration reads accessor defaults, never stale workspace prefs (D-11)"
    requirement: SETTINGS-01
    verification:
      - kind: integration
        ref: "test/migration.test.mjs#a later workspace joiner reads the all-default prefs, never the stale workspace object (D-11)"
        status: pass
    human_judgment: false
  - id: M4
    description: "Corrupt doc blob never crashes the boot; sibling workspaces still migrate (T-34-05)"
    requirement: SETTINGS-01
    verification:
      - kind: integration
        ref: "test/migration.test.mjs#PREFS: a two-member workspace backfills per member and a corrupt doc is skipped without crashing the boot (T-34-05)"
        status: pass
    human_judgment: false
  - id: M5
    description: "SETTINGS-03 invoices pin: a doc carrying invoices hydrates and the field is gone after a write — write-path delete at mergeClientDoc holds with no migration"
    requirement: SETTINGS-03
    verification:
      - kind: integration
        ref: "test/migration.test.mjs#SETTINGS-03: a doc carrying invoices hydrates and the field is gone after a write — the write-path delete holds with no migration"
        status: pass
    human_judgment: false
  - id: M6
    description: "Zero-change switch-over: full suite green (841 pass, 3 pre-existing skips, 0 fail)"
    verification:
      - kind: integration
        ref: "npm test (844 tests, 841 pass / 0 fail)"
      - kind: integration
        ref: "node --test test/migration.test.mjs (37/37)"
    human_judgment: false

duration: 24min
completed: 2026-11-03
status: complete
---

# Phase 34 Plan 02: Guarded NotifPrefs Backfill Migration Summary

**One-time guarded backfill `migrateUserNotifPrefs` — a structural clone of the migrateTeamMembership recipe that copies workspace-doc `notifPrefs` into a user_notif_prefs row for EVERY member (D-09) and deletes the doc field in the same `begin immediate` transaction (D-11), gated on a pre-migration backup — plus byte-identical-second-boot, later-joiner, corrupt-doc and SETTINGS-03 invoices pins.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-11-03T10:31:00Z
- **Completed:** 2026-11-03T10:55:00Z
- **Tasks:** 2 (plus the resolved Task 0 checkpoint)
- **Files modified:** 5

## Accomplishments
- `migrateUserNotifPrefs(conn)` registered in `bootstrap()` after `migrateTeamMembership`: JS guard over stored doc blobs (per-row JSON.parse try/catch — a corrupt blob can never crash the boot, T-34-05), `wal_checkpoint(truncate)` + `vacuum into projects-pre-notif-prefs-<stamp>.db` backup gate (no backup = no mutation), one `begin immediate` that inserts-or-ignores a prefs row for every member and strips `data.notifPrefs` from the stored doc, rollback/rethrow on error
- Guard is false forever after the first migrating boot — later boots are byte-identical no-ops and later joiners read accessor defaults (D-11)
- 5 new pins in `test/migration.test.mjs` (suite 32 → 37): per-member backfill + doc strip, snapshot extension to user_notif_prefs rows/columns/DDL byte-identity with backups.length === 1 across reboot, later-joiner all-defaults via GET /api/me/notif-prefs, corrupt-doc boot survival, SETTINGS-03 invoices-gone-after-write
- Migration suite green 37/37; full `npm test` green (841 pass, 0 fail)

## Task Commits

Each task was committed atomically:

1. **Task 1: migrateUserNotifPrefs — guard, backup, single-transaction backfill + doc strip** - `4340e4a` (feat)
2. **Task 2: Migration pins + invoices pin (byte-identical second boot, later joiners, corrupt doc)** - `7e341c0` (test)

## Files Created/Modified
- `server.js` - migrateUserNotifPrefs + boot registration
- `test/migration.test.mjs` - snapshot extension + 5 new pins
- `src/locales/en.json`, `src/locales/fr.json` - err.unknownPrefKey catalogue rows
- `test/i18n-core-features.test.mjs` - catalogue size pin 1657 → 1658

## Decisions Made
- Guard evaluated in JS, not SQL — the eligibility field lives inside the doc JSON blob (research Pitfall 5)
- `insert or ignore` per (workspace_id, user_id): D-09 scope is EVERY member of an eligible workspace, while a row a user already personalized via the accessor is never overwritten
- The Task 0 `checkpoint:decision` (one-way migration, D-09) was resolved by explicit user confirmation ("proceed") before any mutation code was written

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] err.unknownPrefKey was missing from both locale catalogues — full suite red**
- **Found during:** Task 2 (`npm test` verification)
- **Issue:** 34-01's prefs routes emit `fail(res, 400, 'unknownPrefKey', …)` but never added `err.unknownPrefKey` to src/locales/en.json / fr.json; the error-codes parity test failed ("en missing err.unknownPrefKey"), blocking this plan's `npm test` success criterion
- **Fix:** Catalogued the row in both catalogues (+ French translation) and bumped the i18n catalogue-size pin 1657 → 1658 with the phase annotation
- **Files modified:** src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs
- **Verification:** `npm test` exit 0, 841 pass / 0 fail
- **Committed in:** 7e341c0 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 × Rule 3 blocker). **Impact:** catalogues-only; no behavior change. The failure pre-dated this plan (introduced by 34-01) and blocked the plan's own verification gate.

## Issues Encountered
- First run of the new PREFS fresh-dir test hung the suite: an assertion JSON.parsed the intentionally corrupt doc blob, threw, and left the test server running. Fixed by dropping that self-inflicted assertion (the byte-identical-on-disk check already covers it); re-run green.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- SETTINGS-01's migration guarantee is shipped and pinned: rows are the sole authority, the doc field is retired one-way (D-09 acknowledged at the Task 0 checkpoint), second boot byte-identical
- SETTINGS-03's invoices pin is formalized in test/migration.test.mjs
- Note for the verifier: first boot on a legacy DB now produces TWO backups on the migrating boot (premultitenant + pre-notif-prefs), each counted by its own prefix pin

---
*Phase: 34-per-user-settings-isolation-search-leak-closure*
*Completed: 2026-11-03*
