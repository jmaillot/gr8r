---
phase: 79-governance-surface
verified: 2026-11-20T12:00:00Z
status: passed
score: 18/18 must-haves verified
covered_files:
  - .planning/phases/79-governance-surface/79-01-PLAN.md
  - .planning/phases/79-governance-surface/79-02-PLAN.md
  - .planning/phases/79-governance-surface/79-03-PLAN.md
  - .planning/phases/79-governance-surface/79-01-SUMMARY.md
  - .planning/phases/79-governance-surface/79-02-SUMMARY.md
  - .planning/phases/79-governance-surface/79-03-SUMMARY.md
  - server.js
  - src/pages/governance.js
  - src/pages/settings.js
  - src/shell/render.js
  - src/shell/layout.js
  - src/core/api.js
  - src/actions/actions.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/locales/nl.json
  - src/locales/de.json
  - src/locales/es.json
  - test/governance.test.mjs
  - test/governance-client.test.mjs
covered_digest: "v2:sha256:ad7111f1d761c4ee9170ae5c4df3ee3804317d32493d98a46a908b2b3f45197a"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 18/18
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 79: Governance Surface Verification Report

**Phase Goal:** Governance Surface — operator-only /governance page listing ALL workspaces with archive/unarchive, empty-only delete with orphan dispositions, and the Operators section relocated from Settings (WSG-07, WSG-08, WSG-09).
**Verified:** 2026-11-20 (fresh verification, prior stale report overwritten)
**Status:** passed
**Re-verification:** Yes — stale prior report refreshed with current digest; no regressions.

## Goal Achievement

### Observable Truths

Plan 01 (server, WSG-07/WSG-08):

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GET /api/auth/operator/workspaces returns ALL workspaces (name, slug, memberCount, creator nullable, createdAt, archived) incl. non-member ones | ✓ VERIFIED | server.js:6856-6884 — LEFT JOIN on owner membership, scalar member_count subquery; creator null when owner membership gone |
| 2 | Non-operator gets EXACT 403 operatorOnly, no existence oracle | ✓ VERIFIED | gate runs BEFORE target lookup (server.js:6887, 6905, 7046); tests green |
| 3 | Archived workspaces: hidden from membershipsOf, slug entry → keyed 403 workspaceArchived, unarchive restores | ✓ VERIFIED | requireWorkspace gate server.js:4885; SCHEMA line 212 + migration adapterEnsureColumn server.js:634; firstWorkspace server.js:974 |
| 4 | Delete refuses non-empty (409 workspaceNotEmpty) and unresolved dispositions (409 dispositionRequired); succeeds with full dispositions | ✓ VERIFIED | server.js:6936, 6947, 6970, 6974; raw-doc empty check precedes dispositions |
| 5 | Release drops membership; reassign upserts target with chosen role; release counts as resolved disposition; memberAlreadyMember 409 | ✓ VERIFIED | server.js:7045-7089 (reassign|release match), duplicate check :7083; delete tx resolves planned dispositions :6980-7010 |
| 6 | Archive/unarchive/delete/reassign/release write audit_log in the SAME db.tx | ✓ VERIFIED | delete tx server.js:6982-7010 (mutation + audit in one db.tx); reassign/release audit :7065-7089 |

Plan 02 (client, WSG-07/WSG-08):

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 7 | /governance Workspaces section: filter, All/Active/Archived seg, table with name/slug/members/creator/created/amber Archived badge | ✓ VERIFIED | src/pages/governance.js:63-101 (seg, perm-t table, amber/green badges); actions.js govSeg:4638, govFilter |
| 8 | Non-operator deep-link gets 403 full state, never blank | ✓ VERIFIED | governance.js fullstate pattern; server 403 operatorOnly is the control (D-11); UAT walkthrough pass |
| 9 | Type-to-confirm archive/delete (slug) and release (member email); unarchive one click | ✓ VERIFIED | actions.js govArchiveAsk:4651, govDeleteAsk:4687, govUnarchive:4669 via confirmModal typeName |
| 10 | Orphan modal: per-member Reassign/Release, destination+role in same step, Delete disabled until all resolved; dispositionRequired surfaces as toast | ✓ VERIFIED | governance.js orphan modal + S.ui.govDispositions → POST :id/delete dispositions; govDeleteAsk wiring actions.js:4687-4736 |
| 11 | Keyed err toasts: workspaceNotEmpty, dispositionRequired, memberAlreadyMember | ✓ VERIFIED | flat locale keys `err.workspaceNotEmpty` etc. present in all 5 catalogues (verified programmatically); toasts wired in actions |
| 12 | One fill loop, monotonic sequence + in-flight abort, render-only, no auto-poll | ✓ VERIFIED | refreshGovernanceWorkspaces actions.js:4610-4632 |
| 13 | Zero-workspace / no-match empty() states; aria-busy faint loading | ✓ VERIFIED | governance.js:96-101 (empty('archive',…) / empty('search',…), aria-busy) |

Plan 03 (relocation, WSG-09):

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 14 | Operators section (operatorCard promote/demote/revoke, D-90 inline confirms) renders in governance.js via unchanged /api/auth/operator/users* | ✓ VERIFIED | governance.js:86,111 mounts operatorCard() under api.user?.isInstanceAdmin; api.js operator methods unchanged |
| 15 | Settings renders no operatorCard — no pointer remnant | ✓ VERIFIED | `grep -E "operatorCard\|refreshOperatorUsers" src/pages/settings.js` → zero matches (exit 1) |
| 16 | Dead-wiring guard: operatorUsers/operatorPromote/operatorDemote/operatorRevoke hit only governance path | ✓ VERIFIED | grep -rl across src/ → only api.js (definitions), governance.js, actions.js (governance wiring); settings.js clean |
| 17 | Promote/demote/revoke work end-to-end; lastOperator 409 → err toast via existing key | ✓ VERIFIED | endpoints untouched (no edits in api.js operator-users methods); client-surface suite green; UAT pass |
| 18 | settings.operator.* locale keys reused verbatim, catalogue parity green | ✓ VERIFIED | keys present; test/catalogue.test.mjs 0 failures |

**Score:** 18/18 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `server.js` operator route family | GET listing + archive/unarchive + delete + reassign/release | ✓ VERIFIED | server.js:6856, 6900+ (flag match), delete ~7411, member match :7045 |
| `workspaces.archived` column + migration | SCHEMA + adapterEnsureColumn | ✓ VERIFIED | SCHEMA server.js:212; migration server.js:634 |
| requireWorkspace archived refusal | keyed 403 workspaceArchived | ✓ VERIFIED | server.js:4885 |
| `src/pages/governance.js` | lazy-loaded governance page | ✓ VERIFIED | substantive; lazy import layout.js:70; route render.js:43,66 |
| `src/pages/settings.js` | operatorCard removed | ✓ VERIFIED | zero remnant matches |
| `src/core/api.js` methods | 6 operator endpoints | ✓ VERIFIED | operatorWorkspaces:363, Archive:372, Unarchive:375, Delete:378, Reassign/Release present |
| `src/actions/actions.js` | gov* actions + refreshGovernanceWorkspaces | ✓ VERIFIED | :4610-4736 |
| `src/shell/render.js` + `layout.js` | route id, icon 'scale', sItem gated on isInstanceAdmin | ✓ VERIFIED | render.js:43,66; layout.js:191 |
| Locale catalogues ×5 | err.* + page.governance.* keys | ✓ VERIFIED | workspaceNotEmpty keys in all 5 (programmatic check); catalogue test green |
| `test/governance.test.mjs` | server suite | ✓ VERIFIED | 17/17 pass |
| `test/governance-client.test.mjs` | client-surface suite | ✓ VERIFIED | 14/14 pass |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| governance.js refreshGovernanceWorkspaces | GET /api/auth/operator/workspaces | api.operatorWorkspaces | ✓ WIRED | api.js:363 → server.js:6856 |
| Orphan modal S.ui.govDispositions | POST :id/delete dispositions | api.operatorWsDelete | ✓ WIRED | api.js:378 → server.js delete tx |
| layout.js nav gate | api.user?.isInstanceAdmin | cosmetic client gate, server 403 control | ✓ WIRED | layout.js:191 (D-11) |
| governance.js Operators section | /api/auth/operator/users* | unchanged api methods | ✓ WIRED | endpoints untouched |
| requireWorkspace archived gate | every /api/workspaces/:slug route | single funnel | ✓ WIRED | server.js:4885 inside requireWorkspace |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| governance.js table rows | operator listing | SQL over workspaces+memberships LEFT JOIN users | Yes | ✓ FLOWING |
| governance.js Operators rows | operatorUsers | existing Phase 78 endpoint | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Server governance suite | `node --test test/governance.test.mjs` | 17 pass, 0 fail | ✓ PASS |
| Client-surface suite | `node --test test/governance-client.test.mjs` | 14 pass, 0 fail | ✓ PASS |
| Catalogue parity | `node --test test/catalogue.test.mjs` | 0 fail | ✓ PASS |
| Lint | `npm run lint` | exit 0 | ✓ PASS |
| Settings remnant grep | `grep -E "operatorCard\|refreshOperatorUsers" src/pages/settings.js` | zero matches | ✓ PASS |
| Dead-wiring grep | `grep -rl operator* src/` | only api.js, governance.js, actions.js | ✓ PASS |

### Probe Execution

None declared — no probe-*.sh for this phase; behavioral coverage provided by the two suites above.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| WSG-07 | 79-01, 79-02 | Owner-scoped page lists ALL workspaces; no existence leak to non-operators | ✓ SATISFIED | listing SQL :6856-6884; no-oracle 403 gates; REQUIREMENTS.md checked `[x]` |
| WSG-08 | 79-01, 79-02 | Archive/unarchive/delete + orphan reassign/release, confirmed + audit-logged | ✓ SATISFIED | delete tx with audit rows; type-to-confirm; orphan modal; tests green |
| WSG-09 | 79-03 | Operators section relocated into governance page; Settings clean | ✓ SATISFIED | operatorCard in governance.js:111; settings.js zero remnants; pinned in client suite |

No orphaned requirements — all three IDs mapped to plans and verified.

### Anti-Patterns Found

None blocking. No TBD/FIXME/XXX debt markers in phase-modified files; no placeholder returns.

### Human Verification Required

None outstanding. The single operator browser walkthrough (79-UAT.md) is recorded `complete` with result `pass` — covering nav visibility, listing completeness, filter/seg, typed confirms, amber badge, orphan modal gating, keyed toasts, and the non-operator 403 full state.

### Gaps Summary

None. All 18 must-haves verified against the live codebase (presence, substance, wiring, and behavioral suites all pass); all three requirement IDs accounted for. Prior stale report replaced with a fresh fingerprint digest.

---

_Verified: 2026-11-20T12:00:00Z_
_Verifier: the agent (gsd-verifier)_
