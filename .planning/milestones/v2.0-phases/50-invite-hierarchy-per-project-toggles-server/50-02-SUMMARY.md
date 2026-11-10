---
phase: 50-invite-hierarchy-per-project-toggles-server
plan: 02
subsystem: visibility-migrations
tags: [migration, teams, guest-model, boot, sqlite-backup, authz]
requires: [Phase 49 guarded-migration template, Plan 01 live team-link funnel, Phase 49 sweep retirement]
provides: [D-50-6 restoreTeamLinks boot migration (backup-provenance + fail-open fallback), D-50-10 normalizeGuestRoles boot migration, projects-pre-team-link- and projects-pre-guest-normalize- backup prefixes, doc.data.teamLinksRestored idempotence marker]
affects: [50-03 route changes, 51 client surfaces]
tech-stack:
  added: []
  patterns: [guarded-boot-migration backup-tx-marker-second-boot-noop, no-backup-no-mutation sqliteOnly gate, in-tx re-read, raw JSON.stringify doc writes]
key-files:
  created: []
  modified: [server.js, test/visibility-migration.test.mjs]
key-decisions:
  - "Provenance (owner-confirmed checkpoint, 2026-11-08): (a) pre-sweep backup DBs (projects-pre-visibility-*.db) when present — newest snapshot read read-only via a narrow DatabaseSync import; (b) documented fail-open fallback otherwise: zero writes, every stored p.members entry treated as genuine, boot warning names workspaces needing owner relinking"
  - "Removal basis is the backup diff ONLY (current members − pre-sweep members): no heuristic ever converts a genuine individual invite (T-50-04); a project already relinked by the owner (teams key present) is skipped entirely"
  - "Idempotence via doc marker data.teamLinksRestored (not scan-only) so an owner-deleted link is never resurrected by a lingering backup"
  - "D-50-10 is a pure table transform (memberships + invites) — doc-embedded role copies need no transform (p.members is a plain id array; doc profile role is the presentation label)"
requirements-completed: [INV-04]
estimate: { tokens: 80000, raw_tokens: 55000, tasks: 3, confidence: med }
actuals:
  tokens: 42000
  tasks: 3
  commits: 1
plan_head_before: 9e784c9979627e620f98074e3375741149d279b4
plan_head_after: f84fceed4f7ea80e4159cd9ae3dde4ba6851da69
commits: 1
duration: ~45 min
completed: 2026-11-08
status: complete
---

# Phase 50 Plan 02: Reverse-sweep & guest-normalization boot migrations Summary

Two guarded boot migrations ship: `restoreTeamLinks()` (D-50-6) converts Phase 49's materialized team grants back into live `p.teams[]` links using the owner-confirmed provenance source (pre-sweep backup DBs, fail-open fallback otherwise) while preserving genuine individual invites, and `normalizeGuestRoles()` (D-50-10) defensively rewrites legacy `role='guest'` rows to `'viewer'` — both backup-gated, transactional, raw-write, byte-identical no-ops on the second boot.

## Accomplishments

- **Task 1 — decision checkpoint (blocking-human):** the owner selected posture (a)+(b): read pre-sweep backups (`projects-pre-visibility-*.db`) when present; otherwise fail open (all `p.members` entries treated as genuine individual invites, no links restored, boot warning naming the workspaces that need owner relinking). Recorded before any migration code was written.
- **Task 2 — `restoreTeamLinks()` (server.js):** Phase 49 template mechanics copied verbatim — marker-guard candidate scan (a workspace is a candidate iff the marker is absent AND a project lost a non-empty `teams` key to the sweep), `sqliteOnly` + `wal_checkpoint(truncate)` + `vacuum into` backup under the NEW `projects-pre-team-link-<stamp>.db` prefix (no backup = no mutation), per-workspace `db.tx` with in-tx re-read, raw `JSON.stringify` doc writes (no `normalizeProjects`, no revision churn, sealed private-empty projects untouched), `doc.data.teamLinksRestored` marker makes the second boot a byte-identical no-op and prevents resurrection of owner-deleted links. The snapshot reader opens the backup `readOnly` via the file's only direct `node:sqlite` import, wrapped in `sqliteOnly` (pg boots take the fail-open path — their DATA_DIR carries no snapshots). Wired into bootstrap after `migrateTotpReWrap()`; the Phase 49 sweep stays retired (this pass only ever ADDS links, never deletes).
- **Task 3 — `normalizeGuestRoles()` (server.js):** scan-based guard (zero `'guest'` rows on memberships+invites → zero writes, no backup — the common case on current-schema DBs whose CHECK constraints admit no `'guest'`); when candidates exist: `projects-pre-guest-normalize-<stamp>.db` backup first, then one `db.tx` of per-table re-checked `guest→viewer` updates (count-before counting, no `changes()` — portable across backends).
- **Fixtures (test/visibility-migration.test.mjs):** new `restoreTeamLinks` describe — a planted full-db pre-sweep snapshot plus a hand-rewritten post-sweep live doc with hand-labeled cells (`p_teamshare` sweep-materialized m_team → link restored + entry removed; `p_teamboth` genuine individual m_team → link restored + entry preserved; `p_membershare` genuine invite → untouched), restored-link access proven through the live Plan-01 funnel, exactly-one backup per prefix, second-boot byte-identity. New `normalizeGuestRoles` describe — legacy constraint-less table rebuild planting raw `'guest'` rows in memberships AND invites, post-boot both read `'viewer'`, funnel treats the member as viewer (D-50-11 behavior-not-data-model), one backup, second-boot no-op. The main harness's second-boot pin extended: zero `projects-pre-team-link-` / `projects-pre-guest-normalize-` backups in the fail-open posture.

## Coverage

- verification: { kind: tests, ref: "test/visibility-migration.test.mjs#boot 1 restores the swept links and removes ONLY the sweep-materialized entries", status: pass, human_judgment: false }
- verification: { kind: tests, ref: "test/visibility-migration.test.mjs#restored links grant access through the LIVE funnel (Plan-01 predicate)", status: pass, human_judgment: false }
- verification: { kind: tests, ref: "test/visibility-migration.test.mjs#second boot is byte-identical: no marker churn, no new backups", status: pass, human_judgment: false }
- verification: { kind: tests, ref: "test/visibility-migration.test.mjs#boot 1 rewrites every legacy guest row to viewer", status: pass, human_judgment: false }
- verification: { kind: tests, ref: "test/visibility-migration.test.mjs#second boot is a no-op: no drift, no additional backups (guest suite)", status: pass, human_judgment: false }
- verification: { kind: tests, ref: "test/visibility-migration.test.mjs (main harness): fail-open posture writes nothing, zero new-prefix backups after two boots", status: pass, human_judgment: false }
- verification: { kind: command, ref: "node --test --test-concurrency=2 test/visibility-migration.test.mjs → 14 pass / 0 fail / 0 skip", status: pass, human_judgment: false }
- verification: { kind: command, ref: "npm test → 1103 tests, 1092 pass, 0 fail (11 pre-existing skips)", status: pass, human_judgment: false }
- verification: { kind: command, ref: "grep projects-pre-team-link- / projects-pre-guest-normalize- server.js → backup paths present; projects-pre-visibility- appears only as the provenance READER (creation path retired in 50-01)", status: pass, human_judgment: false }

## Deviations from Plan

**1. [Task-boundary] Tasks 2 and 3 co-landed in one commit**
- **Found during:** implementation
- **Issue:** both migrations live in the same two files with shared hunks (the `node:sqlite` import, the bootstrap wiring, the extended second-boot pin in the main harness), so per-task atomic commits would have required fragile partial staging.
- **Fix:** single commit f84fcee carrying both migrations; each migration is independently fixture-pinned and independently verifiable (its describe block passes in isolation).
- **Commit:** f84fcee

**2. [Test-shape] "no teams key" assertion adjusted to the fixture's actual shape**
- **Found during:** Task 2 fixtures
- **Issue:** the plan's artifact wording implied untouched projects lack a `teams` key, but the visibility fixture gives every project `teams: []` — the sweep-deleted shape only applies to the two hand-rewritten cells.
- **Fix:** the preservation cell asserts `teams` deep-equals `[]` (nothing restored) instead of key absence.
- **Files modified:** test/visibility-migration.test.mjs
- **Commit:** f84fcee

**Total deviations:** 2 (task-boundary, test-shape). **Impact:** none on the plan's truths — all four must_haves verified.

## Authentication Gates

None.

## Known Stubs

None.

## Owner Action Item (from the Task-1 decision)

Workspaces that boot WITHOUT a pre-sweep backup (`projects-pre-visibility-*.db`) take the fail-open posture: stale team-derived access persists until an owner relinks teams per project. Check the boot warning lines ("Workspaces that may need an owner to relink teams: …") after the first post-upgrade boot.

## Self-Check: PASSED

- server.js and test/visibility-migration.test.mjs modified on disk and committed.
- Commit f84fcee present in git log (single commit, 2 files, +457/−6).
- All plan `<verification>` commands re-run green (see Coverage).

## Next

Ready for 50-03 (route changes: scope/status surface, `p.allowInviteGuests` toggle, member guest-invite path).
