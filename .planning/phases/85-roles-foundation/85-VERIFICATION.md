---
phase: 85-roles-foundation
verified: 2026-11-21T12:00:00Z
status: human_needed
score: 5/8 must-haves verified
covered_files:
  - roles.js
  - server.js
  - db-adapter.mjs
  - src/pages/backup.js
  - src/pages/governance.js
  - src/shell/render.js
  - src/shell/layout.js
  - src/core/api.js
  - src/actions/actions.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/locales/nl.json
  - src/locales/de.json
  - src/locales/es.json
  - test/roles-core.test.mjs
  - test/db-adapter.test.mjs
  - test/instance-roles-api.test.mjs
  - test/i18n-shell.test.mjs
  - .planning/phases/85-roles-foundation/85-01-PLAN.md
  - .planning/phases/85-roles-foundation/85-02-PLAN.md
  - .planning/phases/85-roles-foundation/85-01-SUMMARY.md
  - .planning/phases/85-roles-foundation/85-02-SUMMARY.md
covered_digest: "v2:sha256:d92b70d083f4cb4ed688b50c55639eb98cb008d81730e7d10163add2cb5a35bd"
behavior_unverified: 3
overrides_applied: 0
behavior_unverified_items:
  - truth: "SC1 (UI half): an operator grants via the Instance Roles tab modal and the grantee sees the Backup surface immediately; revoking removes the surfaces on next load"
    test: "As a Super Admin on /governance > Instance Roles, grant Backup Operator to a non-admin user; log in as that user (or reload) — Backup nav entry + Backup page appear; revoke the role; reload — the nav entry and page are gone"
    expected: "Surface appears for the grantee on next load and disappears after revoke (server flag-drop per load is e2e-tested; the browser flow is not)"
    why_human: "Interactive modal flow + rendered nav visibility in a real browser; presence checks and node:test cannot see rendered chrome"
  - truth: "Backup page renders for a grantee with the D-20 empty state, and a non-holder deep-linking /backup gets the keyed backupRoleRequired 403 fullstate with home way out"
    test: "Log in as a Restore/Backup Operator, open the Backup page (expect empty state); as a role-less user, deep-link the /backup route"
    expected: "Empty state for holders; keyed 403 fullstate (err.backupRoleRequired) + home button for non-holders"
    why_human: "Rendered visual states and client-side routing behavior — markup presence is verified, the rendered outcome is not"
  - truth: "The Instance Roles tab shows membership rows with resolved granted_by display names and the server-supplied recent-activity trail"
    test: "Grant and revoke a few roles, then view the Instance Roles tab"
    expected: "Rows show user, role badge, granter display name, relative time; the recent trail lists the audited actions newest-first"
    why_human: "Visual layout of the tab, modal and trail; server `recent` payload is e2e-tested but the rendered result is not"
---

# Phase 85: Roles Foundation Verification Report

**Phase Goal:** Instance operations can be delegated — operators grant Backup/Restore Operator roles and grantees see exactly the surfaces their role entitles them to, with Super Admins implicitly holding everything.
**Verified:** 2026-11-21
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Super Admin grants via POST /api/auth/operator/instance-roles; row lands in instance_roles with granted_by/granted_at + audit row, same tx | ✓ VERIFIED | server.js:7652-7700 (guard ladder D-16 verbatim, db.tx grant+audit); e2e test "grant writes the instance_roles row… audit_log row in the same commit" — 58/58 pass |
| 2 | SC1 UI half: grant via the Instance Roles tab; revoked user loses surfaces on next load (browser) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Server half fully tested (grant/revoke/flag-drop-on-next-payload, test at test/instance-roles-api.test.mjs:402); the browser grant-modal flow is code-verified (governance.js rolesCard + actions) but needs human testing |
| 3 | SC2: Restore Operator reaches GET /api/backup/tasks but POST refuses keyed backupManageRequired; Backup Operator cannot grant/revoke (403 operatorOnly) | ✓ VERIFIED | server.js:7752-7794; e2e tests at :216, :280, :306 |
| 4 | SC3: Super Admins hold everything implicitly with zero rows; never appear in / demotable from membership list | ✓ VERIFIED | roles.js D-12 short-circuit (before any row consideration); roles-core pin "short-circuit wins regardless of any row state"; e2e test :230; POST refuses admin targets with keyed instanceRoleAdminImplicit (server.js:7679) |
| 5 | SC4: every grant/revoke audit-logged through existing audit funnel | ✓ VERIFIED | same-tx audit inserts with actor/target snapshot columns on grant (server.js:7691) and revoke (`instance_role_revoked:<role>`); forced-audit-failure rollback pinned both directions (tests :328, :362) |
| 6 | SC5: hasInstanceRole funnel exists server-side, no caching; restore-authority ≠ archive-read-authority encoded now | ✓ VERIFIED | roles.js pure module (ARCHIVE_READ defined, mapped to NO role; INSTANCE_ROLES_MANAGE in no map) + D-35a/b pin tests in test/roles-core.test.mjs; server.js hasInstanceRole does a direct db.all per call (server.js:5014 vicinity) |
| 7 | Backup surface: flag-gated top-level nav, lazy route, page renders from payload flags; non-holder deep-link → keyed 403 fullstate | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | render.js:44,68; layout.js:74,183 (UX-gate on canBackup\|\|canRestore); api.js:164-168 getters; backup.js fullstate markup with err.backupRoleRequired; i18n-shell pins (18/18) cover route/nav/data-a counts; rendered browser outcome needs human |
| 8 | Instance Roles tab shows membership rows + granted_by display names + server-supplied recent trail | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | governance.js:87-117, 189-222 renders rows + recentHtml from the one GET; server GET returns rows+recent with granted_by join (server.js:7619, 7640-7649); visual result needs human |

**Score:** 5/8 truths verified (3 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `roles.js` | Pure capability funnel, CAP constants, ROLE_CAPS, capabilitiesFor, roleTokenRefusal | ✓ VERIFIED | Repo root, purity header verbatim, substantive (D-10/D-11/D-12 implemented) |
| `server.js` instance_roles DDL | dual-mirror, CHECK enum, unique (user_id, role), FK cascade | ✓ VERIFIED | server.js:669-676 + unique index; mirrored in db-adapter.mjs; DDL pin test (CHECK/UNIQUE/CASCADE) passes |
| `server.js` operator route family | GET/POST/DELETE /api/auth/operator/instance-roles | ✓ VERIFIED | server.js:7608/7652/7705; wired into the request router |
| `server.js` backup stubs | GET/POST /api/backup/tasks gated | ✓ VERIFIED | server.js:7752/7768; keyed refusals + flags |
| `src/pages/backup.js` | Lazy-loaded gated page | ✓ VERIFIED | Exists, lazy import wired at layout.js:74, route+icon in render.js |
| Instance Roles tab in governance.js | Membership table, grant modal, inline-confirm revoke, recent trail | ✓ VERIFIED | rolesCard (governance.js:189), gated on isInstanceAdmin (:117) |
| canBackup/canRestore getters | api.js | ✓ VERIFIED | api.js:164-168 reading payload state |
| i18n keys ×5 locales | All refusal + UI keys | ✓ VERIFIED | nav.route.backup, page.backup.*, page.governance.roles*, err.* (6 keys) present in en/fr/nl/de/es; error-codes + i18n-scan green |
| Test files | roles-core, db-adapter pin, instance-roles-api e2e | ✓ VERIFIED | All exist; 58 pass / 0 fail / 1 skip (pg matrix) in the combined run |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| server.js wiring | roles.js capabilitiesFor | hasInstanceRole passes DB rows, no caching | ✓ WIRED | server.js:5014 direct db.all per call |
| Grant/Revoke routes | audit_log | same db.tx | ✓ WIRED | Both insert audit_log inside one db.tx; rollback pinned e2e |
| governance.js tab | GET /api/auth/operator/instance-roles | one fetch {rows, recent} | ✓ WIRED | refreshInstanceRoles consumes rows + recent (D-32) |
| backup.js | GET /api/backup/tasks | in-render fetch, renders payload flags | ✓ WIRED | Renders canBackup/canRestore-aware slots + empty state |
| layout.js nav | api.user.canBackup \|\| canRestore | flag-gated top-level entry | ✓ WIRED | layout.js:183, UX-gate doctrine comment present |
| userPayload | hasInstanceRole | per-load canBackup/canRestore | ✓ WIRED | server.js:1084-1085; revoke-drop pinned e2e (:402) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| userPayload flags | canBackup/canRestore | instance_roles query per load | ✓ | ✓ FLOWING |
| Governance tab rows/recent | rows, recent | instance_roles join users + audit_log | ✓ | ✓ FLOWING |
| Backup page | tasks: [] | intentional D-19 stub (Phase 86/87 own the contract) | — | ⚠️ STATIC (documented intentional stub, not a gap) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Server roles substrate (58 tests: grant/refusals/audit rollback/flags/implicit admin) | `node --test test/roles-core.test.mjs test/db-adapter.test.mjs test/instance-roles-api.test.mjs` | 58 pass, 0 fail, 1 skip | ✓ PASS |
| Client surfaces + chunk size + locale discipline | `node --test test/client-surfaces.test.mjs test/build-chunk-size.test.mjs test/error-codes.test.mjs test/i18n-scan.test.mjs` | 86 pass, 0 fail | ✓ PASS |
| Shell/route/data-a pins covering Backup nav + Instance Roles tab | `node --test test/i18n-shell.test.mjs` | 18 pass, 0 fail | ✓ PASS |

### Probe Execution

No probe scripts declared or conventional for this phase — SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| BKROLE-01 | 85-01, 85-02 | Operator grants/revokes roles from Instance Roles tab; grantees see surfaces, revoked lose them; Super Admins implicit | ✓ SATISFIED (UI flow needs human check) | Server routes + tab + page all built and tested; SC1 browser flow routed to human verification |
| BKROLE-02 | 85-01, 85-02 | Backup Operator full task CRUD; Restore Operator browse/preview/restore, no edit | ✓ SATISFIED for Phase 85 scope / DEFERRED remainder | Phase 85 delivers the gates + stub surfaces (SC2 keyed refusals); task CRUD is Phase 86/87, restore surfaces Phase 89 — see Deferred |
| BKROLE-03 | 85-01 | Every grant/revoke (and later backup/restore/rotation) audit-logged | ✓ SATISFIED for Phase 85 scope | Grant/revoke audited same-tx, rollback pinned; backup/restore action auditing arrives with those engines (Phase 86/87/89) |

No orphaned requirements: REQUIREMENTS.md maps exactly BKROLE-01..03 to Phase 85, and both PLAN frontmatter `requirements` fields account for all three.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | No TBD/FIXME/XXX/PLACEHOLDER/stub-return patterns in phase files | — | — |

The `tasks: []` / `backupNotConfigured` stubs are documented known-stubs with explicit Phase 86/87 resolution — intentional per D-19, not anti-patterns.

### Human Verification Required

See `behavior_unverified_items` in frontmatter — 3 items:

1. **Grant/revoke surface visibility round-trip** — grant via the tab as Super Admin, verify grantee sees Backup surface, revoke, verify it disappears on reload.
2. **Backup page states** — empty state for holders; keyed 403 fullstate + home way out for non-holder deep-link.
3. **Instance Roles tab rendering** — rows with granted_by names, role badges, recent-activity trail.

### Gaps Summary

No gaps. All server-side truths are verified with passing behavioral tests (58 e2e/unit tests covering grant, refusals, audit same-tx with forced-rollback both directions, implicit Super-Admin membership, the D-35 encoding pins, and flag-drop-on-revoke). All artifacts exist, are substantive, and are wired; all i18n keys exist ×5 locales and the locale-discipline gates pass.

The phase goal is achieved at the codebase level; the remaining 3 truths are UI-observable behaviors (roadmap SC1's "surfaces removed on next load" render path, the 403 fullstate render, and the tab's visual result) that no test exercises in a browser — routed to human verification, not failed.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | BKROLE-02 remainder: Backup Operator task CRUD (create/edit/delete/run) | Phase 86/87 | Phase 86 goal "manual Run now" / Phase 87 "Scheduler, Tasks, Run History & Rotation — backup_tasks/runs tables, builder schedule UI" |
| 2 | BKROLE-02 remainder: Restore Operator browse/preview/restore surfaces | Phase 89 | Phase 89 goal "preview-from-manifest, import-as-new (-restored) default, guarded overwrite" |
| 3 | BKROLE-03 remainder: audit of backup/restore/rotation actions | Phase 86/87/89 | Same phases own those actions; the audit funnel + same-tx discipline is established here |

---

_Verified: 2026-11-21_
_Verifier: the agent (gsd-verifier)_
