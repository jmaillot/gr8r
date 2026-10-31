---
phase: 24-operator-audit-workspace-admin-tier
plan: 02
subsystem: server/audit + members UI
tags: [audit-log, sqlite, transactions, admin-revoke, members-surface, e2e]
requires: [audit_log table, transaction() helper, requireWorkspace, operator revoke route shape (24-01)]
provides: [POST /api/w/:slug/members/:id/revoke-sessions, api.revokeMemberSessions, members-surface revoke stage, e2e/admin-revoke-cycle.spec.mjs, AUD-02 test group]
affects: [24-03 (trail view reads the admin-tier rows with workspace_id set)]
key-files:
  created: [e2e/admin-revoke-cycle.spec.mjs]
  modified: [server.js, test/audit-log.test.mjs, src/core/api.js, src/actions/actions.js, src/pages/members.js, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs]
key-decisions:
  - "ownerImmune is checked BEFORE the strictly-below-admin rank rule (D-119 order): the bootstrap operator is the fixture workspace's owner, so rank-first ordering would answer adminOnly and hide the honest copy"
  - "Self-target is exempt from the rank rule (D-118 revoke-my-others); the keep-current DELETE (P-H) still protects the acting session"
  - "api.revokeMemberSessions resolves the slug from state.workspace like every sibling workspace method, instead of taking an explicit slug param"
  - "Confirm-stage copy reused from settings.operator.* (revokeShort/confirmBody/confirm); only members.toastRevoked was invented (EN+FR)"
  - "Unit-test fixture budget: refusals split across two admin-tier callers (boss/boss2) and member/outsider reuse AUD-01 victim accounts to respect the 5/15min caller throttle and 5/hour signup throttle"
requirements-completed: [AUD-02]
duration: ~25 min (15:11Z–15:36Z)
completed: 2026-10-31
commits: 6
plan_head_before: 2af271e8f0ce4debbd4d7aa7f2c4c241fde656cc
plan_head_after: bf69272
status: complete
estimate:
  tokens: 80000
actuals:
  tokens: 44600
  tasks: 3
  commits: 6
coverage:
  - deliverable: "Workspace admin revokes a member of their own workspace; audited row with workspace_id + admin verb + full snapshots + security dual-write (criterion 1)"
    kind: verification
    ref: "test/audit-log.test.mjs — 'AUD-02: workspace admin revokes a member — one audited row with workspace_id and the admin verb'"
    status: pass
  - deliverable: "Peer admins / operators refused (adminOnly / ownerImmune), refusals write nothing (criterion 2)"
    kind: verification
    ref: "test/audit-log.test.mjs — 'AUD-02: admin targets a PEER ADMIN…' and 'AUD-02: admin targets an instance operator…' (+ non-member 404 notAMember, member-caller gate test)"
    status: pass
  - deliverable: "Self-target revokes others only, current session survives; zero-row delete writes nothing (criterion 3, D-117/D-118/P-H)"
    kind: verification
    ref: "test/audit-log.test.mjs — 'AUD-02: admin self-target — 200…' and 'AUD-02: zero active sessions — 200 {revoked: 0}…'"
    status: pass
  - deliverable: "Lifecycle proven end-to-end in Chromium, EN and FR (criterion 4)"
    kind: verification
    ref: "e2e/admin-revoke-cycle.spec.mjs — 2 passed (en, fr): two-stage confirm → D-106 honest teardown for the member → admin survives → peer-admin adminOnly toast; npm run build + npx playwright green"
    status: pass
  - deliverable: "Admin revoke UI (two-stage D-90 staging) + api client method + i18n parity"
    kind: verification
    ref: "npm run i18n:scan (0 literals/0 pending) && node --test test/catalogue.test.mjs test/error-codes.test.mjs (50/50)"
    status: pass
  - deliverable: "All refusals stay before the transaction() call (RESEARCH anti-pattern avoidance)"
    kind: human_judgment
    rationale: "Verified by code reading: sameOrigin → requireUser → tooMany → requireWorkspace → notAMember → ownerImmune → rank rule all return before transaction(); no fail() inside the callback"
  - deliverable: "Wave gate npm test green"
    kind: verification
    ref: "npm test — 604/604 pass (after refreshing the three surface-snapshot tests: 33 api verbs, 1599 catalogue keys, 450 data-a sites)"
    status: pass
---

# Phase 24 Plan 02: Workspace-Admin Revoke Tier Summary

A workspace admin now revokes a member's sessions from the members surface through `POST /api/w/:slug/members/:id/revoke-sessions` — the same audited transaction shape as the operator route, with `workspace_id` set and the `sessions_revoked_by_workspace_admin` verb — proven by seven AUD-02 unit tests on a real server and a full EN+FR Chromium lifecycle. Duration ~25 min (15:11Z–15:36Z), 3 tasks, 10 files.

## Accomplishments

- Admin revoke route in server.js's API dispatch: sameOrigin → requireUser → `tooMany('admin-revoke|'+caller, 5/15min)` → `requireWorkspace(slug,'admin')` → 404 notAMember → ownerImmune (D-119 order) → strictly-below-admin rank rule (self-target exempt, D-118) → `transaction(keep-current DELETE + logSecurity + audit INSERT with workspace_id)`, all writes gated on `del.changes > 0` (D-117)
- AUD-02 test group (7 tests) in test/audit-log.test.mjs: success row fields, peer-admin adminOnly, operator ownerImmune, notAMember, self-target keep-current, member-caller gate refusal, zero-row no-op — no mocks, real SQLite
- Members surface: per-member two-stage revoke action (D-90 staging via `S.ui.memberRevoke`), admin+ visibility client-side only; `api.revokeMemberSessions`; `A.memberRevokeAsk/Cancel/Confirm` with tErr toasts, 401 deferred to the D-28 central intercept; `members.toastRevoked` in EN+FR
- `e2e/admin-revoke-cycle.spec.mjs`: parametric EN+FR — member with two sessions, revoke via UI staging, member's browser dies with `err.signedOutElsewhere`, admin survives, peer-admin refusal toasts `err.adminOnly`; run-unique X-Forwarded-For per account

## Files Created/Modified

- Created: `e2e/admin-revoke-cycle.spec.mjs`
- Modified: `server.js` (route), `test/audit-log.test.mjs` (AUD-02 group + fixture budget), `src/core/api.js`, `src/actions/actions.js`, `src/pages/members.js`, `src/locales/en.json`, `src/locales/fr.json`
- Wave-gate snapshot refreshes: `test/i18n-core-features.test.mjs` (33 api verbs, 1599 keys), `test/i18n-shell.test.mjs` + `test/i18n-toast.test.mjs` (450 data-a sites)

## Key Decisions

- ownerImmune precedes the rank rule (mirrors the operator route's D-119 path) — the bootstrap operator holds workspace-owner rank, so rank-first ordering would mask the honest copy
- Slug resolved inside `api.revokeMemberSessions` from `state.workspace` (sibling pattern) instead of the plan's `(slug, id)` signature
- Confirm-stage copy reused from `settings.operator.*`; one new key (`members.toastRevoked`) in both catalogues
- Unit fixtures split admin-caller throttle budgets across boss/boss2 and reuse AUD-01 victim accounts (signup throttle is 5/hour/IP)

## Deviations from Plan

- **[Rule 3 - Blocker] Wave-gate snapshot tests refreshed (3 files):** `npm test` failed on the surface-snapshot pins that enumerate the API client call sites (32→33), catalogue key count (1598→1599) and tree-wide data-a sites (447→450). Updated the expected counts with per-wave comments — directly caused by this plan's additions, no behavior changed.
- **[Rule 1 - Bug, self-fix] Unit fixture budget:** three refusal tests initially shared one admin caller and tripped the 5-per-15min throttle (429s); split across boss/boss2. The outsider role also had to become a signup-only non-member to respect the 5/hour signup throttle (member/outsider reuse the AUD-01 victim accounts).
- **Gate order:** plan text placed the rank rule before ownerImmune; implemented ownerImmune first (D-119 mirror) so the operator target answers ownerImmune as the tests demand.

## Issues Encountered

None beyond the self-fixes above. RED confirmed before implementation (all seven AUD-02 tests failing on 404; AUD-01 untouched and green throughout).

## Next: Ready for 24-03

The trail view (plan 03) reads audit_log — the admin-tier rows now carry `workspace_id`, enabling workspace-scoped filtering; the composite keyset cursor `(created_at, id)` groundwork from plan 01 stands.

## Self-Check: PASSED
