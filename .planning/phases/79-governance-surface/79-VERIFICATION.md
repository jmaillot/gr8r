---
phase: 79-governance-surface
verified: 2026-11-20T00:00:00Z
status: human_needed
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
  - test/catalogue.test.mjs
covered_digest: "v2:459d65b4cf6eb443f731370be59d419404734bfec4487dad97e1d79b9dd1df70"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 79: Governance Surface Verification Report

**Phase Goal:** Instance owners see and manage every workspace on the instance from one owner-scoped governance page — listing, deletion/archival of empty or shadow workspaces, orphaned-member reassignment, and instance-owner promote/demote — with no existence leak to non-owners and no env edit needed to change who holds instance-owner rights.
**Verified:** 2026-11-20
**Status:** human_needed (one always-human UI walkthrough item; all automated checks pass)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Plan 01 (server):

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Operator GET /api/auth/operator/workspaces returns ALL workspaces with full payload | ✓ VERIFIED | server.js:6856-6886; test/governance.test.mjs (14/14 pass) |
| 2 | Non-operator gets EXACT 403 operatorOnly, no existence oracle | ✓ VERIFIED | isInstanceAdmin gate runs BEFORE target lookup (server.js:6894, 6922, 7020); no-oracle tests green |
| 3 | Archived: members listing hides, slug entry → keyed 403 workspaceArchived, unarchive restores | ✓ VERIFIED | requireWorkspace gate server.js:4884; membershipsOf filter :939; firstWorkspace :977; tests green |
| 4 | Delete refuses non-empty (workspaceNotEmpty) and unresolved dispositions (dispositionRequired); succeeds with full dispositions | ✓ VERIFIED | server.js:6915+ (raw-doc empty check BEFORE dispositions); tests green |
| 5 | Release drops membership; reassign upserts target with chosen role; release counts as resolved disposition | ✓ VERIFIED | server.js:7014+; tests green incl. memberAlreadyMember 409 |
| 6 | Archive/unarchive/delete/reassign/release write audit_log in the SAME db.tx as the mutation | ✓ VERIFIED | server.js:6903-6908 db.tx; audit-atomicity pinned in test/governance.test.mjs (Task 3 mechanism) |

Plan 02 (client):

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 7 | /governance Workspaces section: filter, seg control, .perm-t table with name/slug/count/creator/created/archived badge | ✓ VERIFIED | src/pages/governance.js (15.1KB, substantive); pinned in test/governance-client.test.mjs |
| 8 | Non-operator deep-link gets 403 fullstate (lock glyph, err.code403, err.operatorOnly, back-to-home) | ✓ VERIFIED | governance.js fullstate branch; client test (h) |
| 9 | Archive/delete type-to-confirm; unarchive one-click; release confirms by member email | ✓ VERIFIED | confirmModal typeName wiring; client tests (f) |
| 10 | Orphan modal per-member Reassign/Release, destination+role same-step, Delete disabled until resolved | ✓ VERIFIED | S.ui.govDispositions (actions.js:4696-4782); client tests (a)-(d) |
| 11 | Three refusal codes surface as three DISTINCT keyed err toasts | ✓ VERIFIED | client test (e); distinct locale keys |
| 12 | Listing render one fill loop, monotonic sequence + in-flight abort, no auto-polling | ✓ VERIFIED | refreshGovernanceWorkspaces in actions.js (dashboard.js pattern) |
| 13 | Zero-workspace and no-match empty() states; aria-busy loading | ✓ VERIFIED | governance.js source + client pins |

Plan 03 (operator relocation):

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 14 | Governance page carries Operators section (promote/demote/revoke, D-90 inline confirms) via unchanged Phase 78 endpoints | ✓ VERIFIED | governance.js:111,130 operatorCard; api.js 6 operator methods, endpoints untouched |
| 15 | settings.js has no operatorCard remnant — no duplicate paths | ✓ VERIFIED | `grep operatorCard\|refreshOperatorUsers src/pages/settings.js` → 0 hits |
| 16 | operatorUsers\|operatorRevoke\|operatorDemote\|operatorPromote hit only governance path | ✓ VERIFIED | grep across src/: only governance.js (9) + actions.js (21, governance wiring) + api.js |
| 17 | lastOperator 409 refusal surfaces as err toast from relocated UI (existing key reused) | ✓ VERIFIED | client test (c) in WSG-09 pins; no new key |
| 18 | settings.operator.* locale keys reused verbatim; catalogue parity green | ✓ VERIFIED | test/catalogue.test.mjs green; no key migration |

**Score:** 18/18 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `workspaces.archived` column + migration | SCHEMA + adapterEnsureColumn | ✓ VERIFIED | server.js:373, 634 |
| Operator route family (GET, archive/unarchive, delete, reassign, release) | 6 routes | ✓ VERIFIED | server.js:6856, 6887, 6915, 7014; no requireWorkspace on operator routes |
| Archived refusal in requireWorkspace funnel | keyed 403 | ✓ VERIFIED | server.js:4884-4885, fail() |
| test/governance.test.mjs | server suite | ✓ VERIFIED | 14/14 pass |
| test/governance-client.test.mjs | client-surface suite | ✓ VERIFIED | 14/14 pass incl. WSG-09 pins |
| src/pages/governance.js | lazy page module | ✓ VERIFIED | substantive, wired via layout.js:70 lazy import, render.js route id :43 + icon :66 |
| api.js 6 operator methods | operatorWorkspaces…operatorWsRelease | ✓ VERIFIED | 6 operatorWs* hits |
| Locale err keys (plan 01) + page.governance.* (plan 02) in 5 catalogues | parity | ✓ VERIFIED | test/catalogue.test.mjs green; en.json 40 governance hits |
| settings.js cleaned of operatorCard | zero remnants | ✓ VERIFIED | 0 grep hits |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| governance.js refreshGovernanceWorkspaces | GET /api/auth/operator/workspaces | api.operatorWorkspaces() | WIRED | real fetch; no static fallback |
| Orphan modal S.ui.govDispositions | POST :id/delete body dispositions | actions.js:4780-4782 | WIRED | server re-checks dispositions |
| layout.js nav gate | /api/me isInstanceAdmin | api.user?.isInstanceAdmin | WIRED | layout.js:191; server 403 is the control |
| governance.js Operators | /api/auth/operator/users* | api.js operator methods | WIRED | endpoints unchanged |
| membershipsOf archived filter | userPayload.workspaces + firstWorkspace | server.js:939, :977 | WIRED | both filtered |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| governance.js workspaces table | rows | GET /api/auth/operator/workspaces SQL (LEFT JOIN + count subquery) | Yes | ✓ FLOWING |
| governance.js Operators section | S.ui.operatorUsers | api.operatorUsers() → Phase 78 endpoint | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Server governance suite | `node --test test/governance.test.mjs` | 14 pass / 0 fail | ✓ PASS |
| Client governance suite | `node --test test/governance-client.test.mjs` | 14 pass / 0 fail | ✓ PASS |
| Catalogue parity | `node --test test/catalogue.test.mjs` | 0 fail | ✓ PASS |
| Full suite | `npm test` | 1954 pass / 0 fail / 13 skip (matches documented baseline) | ✓ PASS |
| Lint | `npm run lint` | exit 0 | ✓ PASS |
| Settings remnant grep | `grep -qE "operatorCard\|refreshOperatorUsers" src/pages/settings.js` | no match | ✓ PASS |
| Debt markers | grep TBD/FIXME/XXX on phase files | 0 hits | ✓ PASS |

### Probe Execution

None declared or conventional (not a migration/tooling phase; no probe-*.sh scripts).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| WSG-07 | 79-01, 79-02 | Owner-scoped page lists ALL workspaces | ✓ SATISFIED | Listing endpoint + governance page table, no-oracle 403 |
| WSG-08 | 79-01, 79-02 | Operators manage workspaces they aren't members of (archive/delete/reassign) | ✓ SATISFIED | Full route family + orphan modal + type-to-confirm |
| WSG-09 | 79-03 | Page includes instance-operator management — one governance surface | ✓ SATISFIED | operatorCard relocated; settings.js zero remnants |

No orphaned requirements: REQUIREMENTS.md maps WSG-07/08/09 to phase 79; all three appear in plan frontmatter.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | No TBD/FIXME/XXX, no stub returns, no hardcoded empty data in phase files |

### Human Verification Required

### 1. Browser walkthrough of the governance surface

**Test:** Log in as the instance operator, open /governance; exercise filter + All/Active/Archived seg; archive a workspace (type slug), unarchive it, delete an empty workspace, delete a workspace with a member through the orphan modal (reassign + release paths); deep-link /governance as a non-operator.
**Expected:** Table renders correctly with amber Archived badge and honest '—' creator; modals gate as pinned; distinct keyed toasts per refusal; non-operator sees the 403 fullstate; no layout breakage with long names/emails.
**Why human:** All client checks are source-level pins (test/governance-client.test.mjs asserts source structure); actual rendered DOM, visual tokens, and modal UX in a real browser can't be verified programmatically here.

---

Automated checks all pass: server routes, archived funnel, disposition contract, audit-in-tx, client wiring, operator relocation, locale parity, lint, and the full 1954-test suite. Only the standard end-of-phase human UI walkthrough remains.

_Verified: 2026-11-20_
_Verifier: the agent (gsd-verifier)_
