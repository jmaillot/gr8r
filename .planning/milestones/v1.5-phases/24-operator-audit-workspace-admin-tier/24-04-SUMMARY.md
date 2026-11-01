---
phase: 24-operator-audit-workspace-admin-tier
plan: 04
gap_closure: true
gap_ids: [G-24-5]
subsystem: client-settings + audit
tags: [audit-trail, client-gates, tier-scoping, uat-gap-closure]
requires: ["24-03 (audit trail card + D-T3 server tier scoping)"]
provides: ["audit-trail card visible to workspace admins (client gates follow server ground truth)", "cross-membership server-contract regression test"]
affects: ["UAT tests 6-8 (now exercisable)"]
tech-stack:
  added: []
  patterns: ["server-ground-truth gating (fetch unconditional, card self-guards via null state — D-V1)"]
key-files:
  created: []
  modified:
    - src/actions/actions.js
    - src/pages/settings.js
    - test/audit-log.test.mjs
key-decisions:
  - "Unconditional client fetch (no api.workspace?.role gate): only the server knows the caller's full admin/owner membership set — a client-side role gate would wrongly hide the card for a user browsing workspace B while admin of workspace A"
  - "No server.js change: D-T3 tier scoping (server.js:2394-2403) was already correct per the debug session — this was a client-gate defect only"
requirements-completed: [AUD-03]
commits: 2
plan_head_before: 8e08911c77728e91fec63688ca0c76defae561db
plan_head_after: 9d79038e0f62e33e18e2f57adfd39e87a75be10f
status: complete
---

# Phase 24 Plan 04: Gap closure — workspace-admin audit trail visibility (G-24-5) Summary

**One-liner:** Relaxed the audit-trail client gates (fetch + card mount) so workspace admins see their workspace-scoped revoke rows on Settings → sessions, with the server-contract pinned by a cross-membership test — closing UAT gap G-24-5.

## What was done

### Task 1 — Relax the client gates (`e098cab`)

- `src/actions/actions.js` `refreshAuditLog()`: dropped the `!api.user?.isInstanceAdmin` condition — the gate is now only `if (!api.enabled) return null;`. The fetch fires for every authenticated user on the sessions tab; the server answers 200 with tier-scoped rows (operator: all / admin: own workspaces, D-T3) or 403 for plain members. The existing `fetchAuditPage` failure path turns the 403 into `S.ui.auditTrail = null` — the D-V1 honest absence.
- `src/pages/settings.js` sessions tab: mount changed to `operatorCard() + auditTrailCard()` unconditionally. Both cards are self-guarding: `operatorCard()` bails on null `S.ui.operatorUsers` (its fetch `refreshOperatorUsers()` keeps its own instance-admin gate — untouched), `auditTrailCard()` bails on null `S.ui.auditTrail`.
- Corrected the stale "Workspace admins get 403 here" comment to the post-fix D-T3 truth; updated the `auditTrailCard()` header comment to the tier-scoped audience. No changes to `A.auditVerbFilter` / `A.auditLoadMore` semantics, no new i18n keys, no server.js edit.

### Task 2 — Cross-membership contract test (`9d79038`)

- New AUD-03 test in `test/audit-log.test.mjs`: the tier boss (admin of workspace A) joins a second workspace B as a plain member; seeded B-row and null-workspace operator-row are both absent from the response, every served row belongs to workspace A. The test passes against the shipped server — pinning the contract the relaxed client now depends on (the executable reason the client fetch must be unconditional).

## Verification

- `node --test test/audit-log.test.mjs test/catalogue.test.mjs test/error-codes.test.mjs` → 67/67 pass after Task 1
- Pre-change baseline: `npm test` → 632/632 pass
- Post-change full suite: `npm test` → **633/633 pass** (baseline + 1 new test, zero new failures)
- `npm run e2e` → **87/87 passed (5.5m)**, including `admin-revoke-cycle.spec.mjs`
- `git diff 8e08911..HEAD --name-only | grep server.js` → empty (no server.js changes)
- Only surviving `isInstanceAdmin` uses belong to the operator lane (`refreshOperatorUsers` + `operatorCard`) and a doc comment — verified by the plan's grep gate

## Must-haves truth check

- ✅ Workspace admin sees the trail card and its own workspace-scoped rows (server D-T3 scoping + unconditional fetch; UI-level proof from the UAT re-run of tests 6-8, exercisable now)
- ✅ Plain member sees no trail card, no error toast — 403 → null → honest absence (D-V1 preserved)
- ✅ Instance operator view unchanged — operator lane untouched; e2e operator-revoke-cycle green (en + fr)
- ✅ Fetch gated by SERVER ground truth, not a client-side flag (D-T3 honored end-to-end, pinned by the cross-membership test)

## Deviations from Plan

None — plan executed exactly as written. server.js untouched, operator-card gating untouched, no new i18n keys.

## Threat Model Compliance

- T-24-07 (Information Disclosure): mitigated — server scoping unchanged and pinned by the existing AUD-03 tests + the new cross-membership test; member 403 yields zero rows.
- T-24-08 (DoS): accepted per plan — one capped 101-row read per sessions-tab mount; members get a 403 on first request.
- T-24-SC: not triggered — zero package installs.

## Self-Check: PASSED

- FOUND: src/actions/actions.js, src/pages/settings.js, test/audit-log.test.mjs (modified, committed)
- FOUND: commit e098cab (Task 1), commit 9d79038 (Task 2)
