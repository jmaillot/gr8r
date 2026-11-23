---
phase: 85-roles-foundation
verified: 2026-11-23T19:22:48Z
status: passed
score: 8/8 must-haves verified
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
covered_digest: "v2:sha256:9e80f9fccc023f4c3266c5477948cd710a46fc78e719d9d2d66339cc4e72aa64"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 5/8
  gaps_closed:
    - "SC1 UI half: grant/revoke surface visibility round-trip — human-verified 2026-11-21 (85-UAT.md test 1, pass)"
    - "Backup page renders / keyed 403 fullstate for non-holder deep-link — human-verified 2026-11-21 (85-UAT.md test 2, pass; G-85-2 was a stale-deployment artifact, resolved_by redeploy)"
    - "Instance Roles tab rendering (rows, granted_by names, recent trail) — human-verified 2026-11-21 (85-UAT.md test 3, pass)"
  gaps_remaining: []
  regressions: []
---

# Phase 85: Roles Foundation Verification Report

**Phase Goal:** Instance operations can be delegated — operators grant Backup/Restore Operator roles and grantees see exactly the surfaces their role entitles them to, with Super Admins implicitly holding everything.
**Verified:** 2026-11-23 (stale-digest re-verification over the live tree at HEAD `b18462be`, after phases 86–90 touched every shared surface)
**Status:** passed
**Re-verification:** Yes — prior VERIFICATION.md (2026-11-21) went stale: all 18 covered source/test files were modified by later phases (server.js ×35 commits, backup.js ×23, locales ×~27). This pass re-verifies the role substrate at HEAD for regressions; later-phase extensions must not have regressed the foundation.

## Goal Achievement

### Regression sweep scope (what later phases could have broken)

| Surface | Where at HEAD | Regression check | Status |
| --- | --- | --- | --- |
| `instance_roles` DDL | server.js:725–732 (dual-mirrored db-adapter.mjs:406–413) | CHECK enum `'backup_operator','restore_operator'`, unique `instance_roles_pair(user_id, role)`, FK cascade + `granted_by` set-null all intact | ✓ INTACT |
| `hasInstanceRole` funnel | server.js:5808–5816 | `userCapabilities` → direct `db.all` on instance_roles per call → pure `capabilitiesFor`; still NO caching | ✓ INTACT |
| Pure capability module | roles.js | CAP constants, ROLE_CAPS (backup_operator→BACKUP_MANAGE, restore_operator→RESTORE_USE), D-12 Super-Admin short-circuit, INSTANCE_ROLES_MANAGE deliberately unmapped | ✓ INTACT |
| CAP gating on backup/restore routes | server.js:8697–9917 | Route family GREW from 2 stubs to ~18 real endpoints (phases 86/87/89: tasks/runs/run-current/s3-probe/rotation-preview/download/verify-checksum/restore×7) — EVERY one opens with a `hasInstanceRole(user.id, CAP.…)` guard (BACKUP_MANAGE / RESTORE_USE / INSTANCE_ROLES_MANAGE) | ✓ INTACT, correctly extended |
| Instance Roles governance tab | src/pages/governance.js:90,128,142,231 | `rolesCard()` gated on `api.user?.isInstanceAdmin`; single GET `{rows, recent}` | ✓ INTACT |
| Role-scoped surface visibility | src/shell/layout.js:197, src/shell/render.js:44,68, src/core/api.js:171–175 | Nav entry flag-gated on `canBackup \|\| canRestore`; `backup` in ROUTE_IDS; payload-driven getters unchanged | ✓ INTACT |
| Keyed refusals | server.js:8546 (`instanceRoleAdminImplicit`), :7988+ (`operatorOnly` ×13), backup/restore routes (`backupManageRequired`/`backupRoleRequired`) | All present, keys exist ×5 locales | ✓ INTACT |
| i18n keys ×5 locales | src/locales/*.json | Locales were FLATTENED to dotted keys by a later phase — all phase-85 keys (`nav.route.backup`, `err.backupRoleRequired`, `err.backupManageRequired`, `err.operatorOnly`, `err.instanceRoleAdminImplicit`, `page.backup.*`, `common.role.*`) resolve in en/fr/nl/de/es | ✓ INTACT (format refactor, no key loss) |
| Same-tx audit | server.js:8562–8574 (grant), :8615 (revoke, role-suffixed) | grant+audit in one `db.tx`; forced-rollback pins still in test file | ✓ INTACT |

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Super Admin grants via POST /api/auth/operator/instance-roles; row lands in instance_roles with granted_by/granted_at + audit row, same tx | ✓ VERIFIED | server.js:8536 (POST), :8562–8574 (db.tx grant+audit); e2e test "grant writes the instance_roles row… audit_log row in the same commit" — 58/58 pass at HEAD |
| 2 | SC1 UI half: grant via the Instance Roles tab; revoked user loses surfaces on next load (browser) | ✓ VERIFIED (human) | Server half e2e-tested at HEAD (flag-drop test in test/instance-roles-api.test.mjs); browser round-trip human-verified 2026-11-21 — 85-UAT.md test 1 **pass** |
| 3 | SC2: Restore Operator reaches GET /api/backup/tasks but POST refuses keyed backupManageRequired; Backup Operator cannot grant/revoke (403 operatorOnly) | ✓ VERIFIED | server.js:8697/:8714 guards; operatorOnly ladder :7988+; e2e tests green at HEAD |
| 4 | SC3: Super Admins hold everything implicitly with zero rows; never appear in / demotable from membership list | ✓ VERIFIED | roles.js D-12 short-circuit intact; POST refuses admin targets with keyed instanceRoleAdminImplicit (server.js:8546); implicit-admin pin test passes at HEAD |
| 5 | SC4: every grant/revoke audit-logged through existing audit funnel | ✓ VERIFIED | same-tx audit inserts both directions (:8562, :8615), role-suffixed actions; forced-audit-failure rollback pinned both directions — tests pass at HEAD |
| 6 | SC5: hasInstanceRole funnel exists server-side, no caching; restore-authority ≠ archive-read-authority encoded now | ✓ VERIFIED | roles.js pure module + D-35 pins pass at HEAD; server.js:5808–5816 direct db.all per call, no cache |
| 7 | Backup surface: flag-gated top-level nav, lazy route, page renders from payload flags; non-holder deep-link → keyed 403 fullstate | ✓ VERIFIED (human) | render.js:44,68; layout.js:197; api.js:171–175; backup.js:46 fullstate with err.backupRoleRequired; i18n-shell pins (18/18) pass at HEAD; rendered states human-verified 2026-11-21 — 85-UAT.md test 2 **pass** (G-85-2 was a stale Docker image, resolved by redeploy) |
| 8 | Instance Roles tab shows membership rows + granted_by display names + server-supplied recent trail | ✓ VERIFIED (human) | governance.js:90,231 gated on isInstanceAdmin; server GET returns rows+recent; human-verified 2026-11-21 — 85-UAT.md test 3 **pass** |

**Score:** 8/8 truths verified (0 present, behavior-unverified — the 3 browser-rendered truths were human-verified via 85-UAT.md, 3/3 pass)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `roles.js` | Pure capability funnel, CAP constants, ROLE_CAPS, capabilitiesFor | ✓ VERIFIED | Repo root, purity header intact, substantive at HEAD |
| `server.js` instance_roles DDL | dual-mirror, CHECK enum, unique (user_id, role), FK cascade | ✓ VERIFIED | server.js:725–732 + unique index; mirrored db-adapter.mjs:406–413; DDL pin test passes at HEAD |
| `server.js` operator route family | GET/POST/DELETE /api/auth/operator/instance-roles | ✓ VERIFIED | server.js:8492/8536/8589; wired into the request router |
| `server.js` backup/restore route CAP gating | every route guarded by hasInstanceRole | ✓ VERIFIED | Route family grew to ~18 endpoints (86/87/89); every entry point guarded at HEAD |
| `src/pages/backup.js` | Gated page, 403 fullstate | ✓ VERIFIED | Fullstate markup :46 with err.backupRoleRequired; later phases filled the real task/run surfaces around it |
| Instance Roles tab in governance.js | Membership table, grant modal, revoke, recent trail | ✓ VERIFIED | rolesCard (governance.js:231), gated on isInstanceAdmin |
| canBackup/canRestore getters | api.js | ✓ VERIFIED | api.js:171–175 reading payload state |
| i18n keys ×5 locales | All refusal + UI keys | ✓ VERIFIED | Flat-key format (later-phase refactor); all phase-85 keys present en/fr/nl/de/es |
| Test files | roles-core, db-adapter pin, instance-roles-api e2e | ✓ VERIFIED | Exist and pass at HEAD: 58 pass / 0 fail / 1 skip (pg matrix) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| server.js wiring | roles.js capabilitiesFor | hasInstanceRole passes DB rows, no caching | ✓ WIRED | server.js:5808–5816 direct db.all per call |
| Grant/Revoke routes | audit_log | same db.tx | ✓ WIRED | :8562/:8615; rollback pinned e2e |
| governance.js tab | GET /api/auth/operator/instance-roles | one fetch {rows, recent} | ✓ WIRED | refreshInstanceRoles consumes both |
| backup.js | GET /api/backup/tasks | render over payload flags | ✓ WIRED | Renders canBackup/canRestore-aware slots |
| layout.js nav | api.user.canBackup \|\| canRestore | flag-gated top-level entry | ✓ WIRED | layout.js:197 |
| userPayload | hasInstanceRole | per-load canBackup/canRestore | ✓ WIRED | server.js:8703–8709; revoke-drop pinned e2e |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| userPayload flags | canBackup/canRestore | instance_roles query per load | ✓ | ✓ FLOWING |
| Governance tab rows/recent | rows, recent | instance_roles join users + audit_log | ✓ | ✓ FLOWING |
| Backup page | tasks | REAL since Phase 86/87 — GET /api/backup/tasks returns live backup_tasks rows (the phase-85 documented `tasks: []` stub was resolved by later phases, as planned) | ✓ | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Server roles substrate (grant/refusals/audit rollback/flags/implicit admin) | `node --test test/roles-core.test.mjs test/db-adapter.test.mjs test/instance-roles-api.test.mjs` | 58 pass, 0 fail, 1 skip (pg matrix) | ✓ PASS |
| Shell/route pins covering Backup nav + route discipline | `node --test test/i18n-shell.test.mjs test/client-surfaces.test.mjs` | 31 pass, 0 fail | ✓ PASS |
| Debt markers in covered files | `grep -E "TBD\|FIXME\|XXX\|PLACEHOLDER"` over 13 source/test files | no matches | ✓ PASS |

### Probe Execution

No probe scripts declared or conventional for this phase — SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| BKROLE-01 | 85-01, 85-02 | Operator grants/revokes roles from Instance Roles tab; grantees see surfaces, revoked lose them; Super Admins implicit | ✓ SATISFIED | Server routes + tab + page built, tested, and human-verified (85-UAT.md 3/3 pass) |
| BKROLE-02 | 85-01, 85-02 | Backup Operator full task CRUD; Restore Operator browse/preview/restore, no edit | ✓ SATISFIED | Phase-85 gates + keyed refusals verified; the deferred CRUD/restore surfaces were DELIVERED by Phases 86/87/89 (live gated route family at server.js:8697–9917) |
| BKROLE-03 | 85-01 | Every grant/revoke (and backup/restore/rotation) audit-logged | ✓ SATISFIED | Grant/revoke same-tx audited with rollback pins; backup/restore action auditing arrived with the phase 86/87/89 engines on the same funnel |

No orphaned requirements: REQUIREMENTS.md maps exactly BKROLE-01..03 to Phase 85, and both PLAN frontmatter `requirements` fields account for all three.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | No TBD/FIXME/XXX/PLACEHOLDER/stub-return patterns in covered files at HEAD | — | — |

### Advisory (New Scope, Unevidenced)

None — re-verification ran; no new-scope Step-7 findings.

### Human Verification Required

None outstanding — the 3 browser-rendered truths were human-verified on 2026-11-21 (85-UAT.md, 3/3 pass; the one issue raised, G-85-2, was diagnosed as a stale Docker deployment, resolved by redeploy and re-tested pass). Since then no covered file's role-gating behavior changed in a way the behavioral suites don't pin: all 58 substrate tests + 31 shell/surface pins pass at HEAD.

### Gaps Summary

No gaps. The stale-digest hypothesis (phases 86–90 regressed the roles foundation) is FALSIFIED: every foundation surface is intact at HEAD and correctly extended — the route family grew ~9× under the same hasInstanceRole CAP guards, the locales were refactored to flat keys with zero phase-85 key loss, and the phase-85 `tasks: []` stub was resolved into the real Phase 86/87 task store as planned. All server truths re-verified behaviorally at HEAD (58 pass / 0 fail / 1 skip pg-matrix) and the 3 browser truths carry their 2026-11-21 human verification.

### Deferred Items

Historical deferrals from the initial verification — all subsequently delivered:

| # | Item | Addressed In | Outcome |
|---|------|-------------|---------|
| 1 | BKROLE-02 remainder: Backup Operator task CRUD | Phase 86/87 | Delivered — gated task/runs routes live at HEAD |
| 2 | BKROLE-02 remainder: Restore Operator browse/preview/restore surfaces | Phase 89 | Delivered — gated restore route family live at HEAD |
| 3 | BKROLE-03 remainder: audit of backup/restore/rotation actions | Phase 86/87/89 | Delivered on the same audit funnel |

---

_Verified: 2026-11-23T19:22:48Z_
_Verifier: the agent (gsd-verifier)_
