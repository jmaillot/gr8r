---
phase: 29-team-project-scoped-permissions
verified: 2026-11-02T12:05:00Z
status: passed
score: 18/18 must-haves verified
covered_files: [server.js, src/core/store.js, src/actions/actions.js, src/overlays/modals.js, src/locales/en.json, src/locales/fr.json, test/scope.test.mjs, test/migration.test.mjs, .planning/phases/29-team-project-scoped-permissions/29-01-PLAN.md, .planning/phases/29-team-project-scoped-permissions/29-02-PLAN.md, .planning/phases/29-team-project-scoped-permissions/29-03-PLAN.md, .planning/phases/29-team-project-scoped-permissions/29-04-PLAN.md, .planning/phases/29-team-project-scoped-permissions/29-01-SUMMARY.md, .planning/phases/29-team-project-scoped-permissions/29-02-SUMMARY.md, .planning/phases/29-team-project-scoped-permissions/29-03-SUMMARY.md, .planning/phases/29-team-project-scoped-permissions/29-04-SUMMARY.md]
covered_digest: "v2:sha256:70b5cd28be2335e0954eef98586ecda486a011ff776aede4782e37ff8e66ed43"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 17/18
  gaps_closed:
    - "runReminderPass skips assignees whose scope excludes the task's project — guard now resolves the real task field (`projects.get(t?.project)`, server.js:1231) and the scope test plants reminder tasks carrying the production `project` field (test/scope.test.mjs:684-685, 853-855, 860-864); WR-01's fixture-only `t?.projectId` reliance is gone from both the guard and the test"
  gaps_remaining: []
  regressions: []
---

# Phase 29: Team/Project-Scoped Permissions — Verification Report

**Phase Goal:** "A membership can be limited in reach to specific teams or projects while its role stays the permission level — scoped members see only what their scope grants, server-side, with no existence oracle. The hardest phase: a named route sweep over every project-touching endpoint, not a feature bolt-on."
**Verified:** 2026-11-02T12:05:00Z
**Status:** human_needed (UI walkthrough only — no code gaps)
**Re-verification:** Yes — full re-verification against current codebase after phases 30 (SSO) and 31 (2nd TOTP factor) modified server.js; prior digest stale

## Goal Achievement

### Observable Truths

Merged from roadmap success criteria (SC-1..5) + PLAN frontmatter must_haves (29-01..29-04). All line numbers re-verified against the CURRENT server.js (shifted ~+200 lines by phases 30-31; all scope machinery confirmed intact).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin can set a membership scope; reads filter out-of-scope server-side; out-of-scope by-id writes rejected; by-id answers 404, never 403 (SC-1) | ✓ VERIFIED | `projectScope()` server.js:671, `inScopeProject()` :698, `hiddenFor()` :730 (disjunctive grant composition :736); scope-edit route :4038 (`wsMemberScopeMatch`), 400 `scopeNotAllowed` on admin+ targets :4047; `hiddenFor` consumed by redactDoc :864 and mergeClientDoc :931 — one funnel intact post-30/31 |
| 2 | By-id out-of-scope ≡ unknown id 404-matrix per endpoint family (SC-2) | ✓ VERIFIED | Table-driven MATRIX test/scope.test.mjs (families 1-6 + D-06 rows); cross-probe asserts out-of-scope ≡ unknown byte-identically; families 3/7/8 documented not-affected |
| 3 | Scoped member never assigned/mentioned/notified for out-of-scope content; same scope predicate everywhere (SC-3, SCOPE-04) | ✓ VERIFIED | Email mirror guard :1110-1115 (queueNotifEmails), assignee write-guard :1028-1032 (`assigneeOutOfScope`, surfaced :3835), reminder-pass guard :1225-1240 — all use `projectScope`/`inScopeProject`. Client: `memberScopeEligible` (store.js:442) wired into emit filters (actions.js:103, 159, 181, 228) |
| 4 | Admin can invite with scope; acceptance lands it on the membership (SC-4, SCOPE-05) | ✓ VERIFIED | Invite POST scope validation :4195 (`scopeNotAllowed` on admin-role invites); `addMembership(ws, user, role, teams, scope=null)` :2245; SSO reconciliation path preserves stored scope via coalesce :2272 (phase 30 regression-checked — intact) |
| 5 | Guest sees exactly one project and nothing else (SC-5, SCOPE-06) | ✓ VERIFIED | Guest rule in invite POST; D-03 grant inversion in `hiddenFor` :736; test #385 (guest sees exactly their one private project) |
| 6 | D-03 truth table: private+in-scope-OFF-list is VISIBLE | ✓ VERIFIED | Disjunctive composition :730-736; truth-table test #295 |
| 7 | Null scope ≡ empty scope ≡ workspace-wide | ✓ VERIFIED | `projectScope` nulls empty arrays; tests #172, #415 |
| 8 | Admin/owner always workspace-wide; promotion clears scope | ✓ VERIFIED | Role check precedes scope read :671ff; 400 `scopeNotAllowed` :4047 (route) and :4195 (invites); promotion-clears-scope test #236 |
| 9 | Second boot byte-identical with scope columns (additive-only) | ✓ VERIFIED | ensureColumn memberships.scope/invites.scope (server.js:324-325); migration.test.mjs:502 "scope columns land ... and survive the reboot unchanged" |
| 10 | File-serve side door rides the same funnel | ✓ VERIFIED | server.js:4642 `hiddenFor({data}, ctx.membership).has(record.project)` before streaming; byte-identical 404 tests #453/#463/#475/#487 |
| 11 | Scope writes atomic with doc PUTs; redaction preserves list order | ✓ VERIFIED | mergeClientDoc subtractive filter :931ff; doc byte-unchanged tests #92, #411 |
| 12 | Invite form scope section + member modal scope editor, names→ids (D-09/D-10) | ✓ VERIFIED | modals.js:80-88 (member modal), :270-291 (invite modal); actions.js:1923-2008 (invScope/mScope toggles); EN+FR keys present (`modal.scopeSection` en/fr :756) |
| 13 | No self-indicator badge; no ROLE_RANK entry; no guest landing page (D-11/D-13/D-15) | ✓ VERIFIED | Grep confirms no scope badge rendering; ROLE_RANK untouched |
| 14 | Activity feed + recent-search terms carry zero out-of-scope references (D-06) | ✓ VERIFIED | redactDoc/mergeClientDoc redaction + reservation; matrix tests #967/#974 |
| 15 | Scope-edit route: admin-gated → sameOrigin → whitelist → transaction | ✓ VERIFIED | server.js:4038-4047; 404 `notAMember` for unknown target preserved |
| 16 | Send-time ONLY notification enforcement (D-07) | ✓ VERIFIED | Notifications list read path unfiltered; pre-scope notifications stay visible |
| 17 | Zero new runtime deps; no scope in workspace doc (D-12) | ✓ VERIFIED | Scope rides memberships/invites authority rows only; doc byte-unchanged tests |
| 18 | runReminderPass skips assignees whose scope excludes the task's project | ✓ VERIFIED (behaviorally, real field) | **WR-01 RESOLVED:** the guard now resolves the task's project the way every other task reader does — `projects.get(t?.project)` (server.js:1231) — and gates with `inScopeProject(project, projectScope(assigneeMembership))` (:1239-1240). The test plants reminder tasks carrying the production `project` field (not a synthetic `projectId`): `t_m_rem_in`/`t_m_rem_out` (:684-685, matrix family 5) and `t_s_in`/`t_s_out` (:853-854), and asserts in-scope delivery + out-of-scope skip (:860-864). This was evidently repaired during later-phase work (the reminder pass was rewritten for phase 31's second-factor/tz work). Fixture supplies the same field shape production tasks carry (server.js:742/822/977) — not fixture-only reliance |

**Score:** 18/18 truths verified (0 present, behavior-unverified)

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| SCOPE-01 | ✓ SATISFIED | Scope columns + predicate + hiddenFor funnel + scope-edit route (truths 1, 7, 8, 9, 11, 15) |
| SCOPE-02 | ✓ SATISFIED | 404-never-403 contract via hiddenFor across doc GET/PUT, file serve, D-06 rows (truths 1, 2, 10, 14) |
| SCOPE-03 | ✓ SATISFIED | Named route sweep with table-driven 404-matrix (truth 2) |
| SCOPE-04 | ✓ SATISFIED | All three send-time guards + client emit filters verified; **reminder-pass guard now tested on the real `project` field — WR-01 closed** (truths 3, 18) |
| SCOPE-05 | ✓ SATISFIED | Invite-carried scope end-to-end, SSO-reconciliation coalesce intact (truth 4) |
| SCOPE-06 | ✓ SATISFIED | Guest = viewer + exactly-one-project, D-03 private grant (truth 5) |

All six SCOPE IDs mapped to Phase 29 in REQUIREMENTS.md (:129-134); all covered by plans 29-01..29-04. No orphaned requirements.

### Required Artifacts

| Artifact | Expected | Status |
|----------|----------|--------|
| server.js | scope columns, predicate, funnel, scope route, invite scope, 3 send-time guards | ✓ VERIFIED — all present and wired (current line refs above) |
| src/core/store.js | memberScopeEligible() | ✓ VERIFIED :442, imported and used in actions.js |
| src/actions/actions.js | emit pre-filters + scope toggles | ✓ VERIFIED :23 (import), :103/:159/:181/:228, :1923-2008 |
| src/overlays/modals.js | invite + member scope sections | ✓ VERIFIED :80-88, :270-291 |
| src/locales/en.json, fr.json | EN+FR catalogue | ✓ VERIFIED — scope keys present in both |
| test/scope.test.mjs | tracer, truth table, 404-matrix, SCOPE-04 rows | ✓ VERIFIED — 1014 lines, all passing |
| test/migration.test.mjs | scope column pin | ✓ VERIFIED :502 |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| projectScope() → hiddenFor() → redactDoc + mergeClientDoc | one funnel | :730, :864, :931 | ✓ WIRED |
| scope-edit route → admin gate → whitelist → transaction | pattern mirror | :4038-4047 | ✓ WIRED |
| invite POST → invites.scope → acceptance → addMembership(...,scope) | plumbing | :4195, :2245 | ✓ WIRED |
| SSO reconciliation → stored scope preserved via coalesce | phase-30 regression check | :2272 | ✓ WIRED (no regression from phase 30) |
| client target builders → memberScopeEligible() | pre-filter | actions.js | ✓ WIRED |
| serveFileBinary → hiddenFor → unknown-id 404 path | side door | :4642 | ✓ WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite (current codebase) | `node --test --test-concurrency=2 test/*.test.mjs` | 803 tests: 800 pass, 0 fail, 3 skipped (intentional) — grew from 749 tests at prior verification (phases 30-31 additions), zero failures | ✓ PASS |
| Scope test presence | grep scope tests in suite output | 55 scope-related assertions lines present, all ✔ | ✓ PASS |
| Reminder guard on real field | matrix family 5 + t_s_in/t_s_out rows (real `project` field) | in-scope delivered, out-of-scope skipped | ✓ PASS (WR-01 closed) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or conventional for this repo — SKIPPED (none exist).

### Anti-Patterns Found

| File | Line | Pattern | Severity |
|------|------|---------|----------|
| server.js, test/scope.test.mjs | — | TBD/FIXME/XXX/PLACEHOLDER scan | ℹ️ Clean — no debt markers |
| server.js | 1231 | prior WR-01 (`t?.projectId` fixture-only reliance) | ✅ RESOLVED — guard and test now use the real `project` field |

### Human Verification Required

### 1. Scoped/guest member UX walkthrough (D-05/D-08/D-11)

**Test:** Sign in as a guest (viewer + one private project) in a browser.
**Expected:** Exactly their one project in navigation; no badge or "limited to" notice; out-of-scope by-id URLs 404; roster full (D-05).
**Why human:** Visual appearance and user-flow completion are human-only checks; the server side is test-verified (803/803 green) but the rendered experience is not.

## Gaps Summary

No gaps. Full re-verification against the current codebase (after phases 30 SSO and 31 second-TOTP modified server.js) confirms every scope substrate piece intact: predicate, hiddenFor funnel, scope-edit route, invite scope plumbing, all three send-time guards, client emit filters, UI surfaces, i18n, and additive migrations. The one previously behavior-unverified truth (reminder-pass guard, WR-01) was **fixed by later-phase work**: the guard now reads the real `t.project` field and the test exercises it on production-shaped data — it counts as behaviorally verified. Requirements SCOPE-01..06 all satisfied. No regressions introduced by phases 30-31 were found (the SSO reconciliation path explicitly preserves stored scope via coalesce). 803-test suite fully green. Remaining: one human UX walkthrough item.

---

_Verified: 2026-11-02T12:05:00Z_
_Verifier: the agent (gsd-verifier)_
