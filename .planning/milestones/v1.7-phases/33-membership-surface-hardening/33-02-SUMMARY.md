---
phase: 33-membership-surface-hardening
plan: 02
subsystem: server-api
tags: [hardening, security, invites, sso, i18n, fail-closed]
requires: [invite creation route, accept route, SSO-07 reconcile twin, main() boot cleanup, firstWorkspace()]
provides: [fail-closed workspace resolution on both invite twins, inviteAdminEmailRequired 400/403 refusals at creation+accept, D-02 boot-time sweep of link-only admin/owner invites, HARD-02a/b/c + HARD-03a/b pins]
affects: [server.js invite routes + SSO callback + main(), src/locales/en.json, src/locales/fr.json, test/hardening.test.mjs, test/oidc-sso.test.mjs]
tech-stack:
  added: []
  patterns: [D-05 both-twins-one-commit, D-03 consume-on-dead-workspace, D-04 one-generic ssoError surface, D-01 defense-in-depth role gate, D-02 update-only boot sweep]
key-files:
  created: []
  modified: [server.js, src/locales/en.json, src/locales/fr.json, test/hardening.test.mjs, test/oidc-sso.test.mjs, test/i18n-core-features.test.mjs]
decisions:
  - "Both twins lost || firstWorkspace() in ONE commit (D-05, roadmap-locked): accept 410s workspaceGone verbatim, SSO twin consumes + lands /login?sso=error"
  - "SSO dead-workspace branch reuses the :2868-shaped single-invite consume write; the address-wide clearing write is skipped (no ws.id to scope it to) and no sso_invite_accepted verb fires"
  - "Accept-side refusal reuses inviteAdminEmailRequired for symmetry (plan-sanctioned), status 403 — an escalation refusal, not a validation error"
  - "Test seeding opens DatabaseSync with enableForeignKeyConstraints:false — node:sqlite defaults FKs ON, so a dangling workspace_id must be inserted on a raw connection (cascade would eat the row otherwise)"
metrics:
  duration: ~22 min
  completed: 2026-11-03
status: complete
actuals:
  tokens: 52000
  tasks: 2
  commits: 2
plan_head_before: 73138017917f01d920fba9bfe31aabd792b3e3a3
plan_head_after: 155e33175158b15969671c35cc108c4547f9e9bb
commits: 2
---

# Phase 33 Plan 02: Fail-Closed Twins + Admin Link-Only Invite Closure Summary

**One-liner:** both `firstWorkspace()` invite twins fail closed in one commit (accept 410 `workspaceGone`, SSO twin consumes the dead invite and lands the generic `/login?sso=error`), and link-only admin/owner invites are now impossible at creation (400 `inviteAdminEmailRequired`), harmless at accept (403 refusal), and extinct in stored data (update-only boot sweep) — with the code catalogued EN+FR and 5 new pins.

## What Was Built

### Task 1 — both twins fail closed in ONE commit (HARD-03, D-03/D-04/D-05)
- **Accept twin:** `|| firstWorkspace()` deleted from the workspace resolve — the existing `410 workspaceGone` line now actually fires; byte-identical message and no-oracle `{code, error}` body pinned (HARD-03a).
- **SSO twin:** fallback removed; when the workspace row is gone the ONE pending invite is consumed with the same `update invites set used_at = ?, used_by = ? where token_hash = ?` write as the happy path, `ssoRedirect = '/login?sso=error'` (D-04's one-generic surface), no membership write, no address-wide clearing write, and NO `sso_invite_accepted` success verb (the locked prohibition — the log must not lie). Pinned by HARD-03b in test/oidc-sso.test.mjs: consumed invite (used_at/used_by set), zero membership rows, another address's pending invite untouched, empty security_log for the verb, landing on `/login?sso=error`.
- **Protected sites untouched:** `firstWorkspace()` definition (:594), seed-boot (:1716), read path (:2235), slug route (:4920) — grep-verified unchanged.

### Task 2 — admin link-only invites blocked at both ends + boot sweep (HARD-02, D-01/D-02)
- **Creation side:** after email normalization and before the insert loop, `ROLE_RANK[role] >= ROLE_RANK.admin && emails.length === 0` (covers owner; a `[null]` body normalizes to length 0) → 400 `inviteAdminEmailRequired` before any insert. Member link-only invites still succeed (no over-blocking, pinned).
- **Accept side:** after lookup/expiry checks, before the grant — an email-less row with admin/owner role refuses with 403 `inviteAdminEmailRequired`; pinned via a direct-DatabaseSync seeded row (creation can no longer mint the shape).
- **Boot sweep (D-02):** one-shot `update invites set used_at = ? where email is null and role in (?, ?) and used_at is null` in main()'s boot-cleanup region (NOT the route-scoped cleanup). Update only — HARD-02c reboots against the same dataDir and asserts the row still EXISTS with used_at set, and the swept link 410s `inviteAlreadyUsed`.
- **i18n:** `err.inviteAdminEmailRequired` added to en.json and fr.json (the phase's only new string); the catalogue-size pin moved 1656 → 1657 with its ledger comment updated; `scripts/i18n-scan.mjs` green.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 4243600 | feat(33-02): fail-closed workspace resolution on both invite twins (HARD-03) |
| 2 | 155e331 | feat(33-02): link-only admin invites blocked at creation, accept, and in stored data (HARD-02) |

## Deviations from Plan

**1. [Rule 3 - Blocking] Test seeding opens a raw DatabaseSync with FKs disabled**
- **Found during:** Task 1
- **Issue:** `node:sqlite`'s `DatabaseSync` defaults `enableForeignKeyConstraints: true`, so seeding an invite whose `workspace_id` dangles (the dead-workspace fixture) failed with `FOREIGN KEY constraint failed` through the shared `withDb()` helper.
- **Fix:** the two dead-workspace seeds (HARD-03a/b) open `new DatabaseSync(dbPath, { enableForeignKeyConstraints: false })` — the invite must dangle, not cascade away. Production code untouched.
- **Files modified:** test/hardening.test.mjs, test/oidc-sso.test.mjs
- **Commit:** 4243600

**2. [Rule 3 - Blocking] i18n catalogue-size pin updated**
- **Found during:** Task 2
- **Issue:** `test/i18n-core-features.test.mjs` asserts the exact catalogue size (1656); the phase's one new string turned it red.
- **Fix:** moved to 1657 with the ledger comment `+1: err.inviteAdminEmailRequired (33-02)`.
- **Files modified:** test/i18n-core-features.test.mjs
- **Commit:** 155e331

Otherwise the plan executed exactly as written. No architectural deviations, no auth gates, no package installs (T-33-SC held).

## Verification

- `node --test test/oidc-sso.test.mjs` — 47/47; `node --test test/hardening.test.mjs` — 11/11; `node --test test/error-codes.test.mjs` — 24/24; `node --test test/i18n-core-features.test.mjs` — 14/14.
- `npm test` full suite — 829 tests, 826 pass, 3 skipped (pre-existing env-gated skips), 0 fail. Baseline not regressed (was 824).
- i18n gate: `scripts/i18n-scan.mjs` green; `err.inviteAdminEmailRequired` present in en.json AND fr.json.
- Protected `firstWorkspace()` sites grep-verified untouched; only the two twins lost the fallback.

## Known Stubs

None.

## Threat Surface Scan

No new network endpoints, auth paths, file-access or schema surfaces beyond the plan's threat model. T-33-04/05/06/07 mitigations all landed and pinned (creation 400, accept 403, boot sweep update-only, both twins fail closed); T-33-SC: zero package installs.
