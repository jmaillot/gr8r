---
phase: 29-team-project-scoped-permissions
verified: 2026-11-02T10:18:53Z
status: human_needed
score: 17/18 must-haves verified
covered_files: [server.js, src/core/store.js, src/actions/actions.js, src/overlays/modals.js, src/locales/en.json, src/locales/fr.json, test/scope.test.mjs, test/migration.test.mjs]
covered_digest: "v2:sha256:05456291c1a2a9d81c230cd703a8f922e0f1a538eaed12dfc1676cd0a2932de9"
behavior_unverified: 1
behavior_unverified_items:
  - truth: "runReminderPass skips assignees whose scope excludes the task's project"
    test: "Plant a real doc task (field `project`, not a synthetic `projectId` field) on an out-of-scope project, run the reminder pass with SMTP capture, and confirm no reminder email/notification reaches the scoped assignee"
    expected: "The reminder pass resolves the task's project via the field real tasks carry (`t.project`) and the SCOPE-04 guard skips the out-of-scope assignee"
    why_human: "The guard reads `t?.projectId` (server.js:1178) but real doc tasks store `project` (server.js:742/822/977 all read `t.project`); the passing test plants a synthetic `projectId` field the production doc path never carries (fixture-only reliance, matches open review finding WR-01). Presence checks and the existing test cannot prove the guard fires on real data."
overrides_applied: 0
---

# Phase 29: Team/Project-Scoped Permissions — Verification Report

**Phase Goal:** "A membership can be limited in reach to specific teams or projects while its role stays the permission level — scoped members see only what their scope grants, server-side, with no existence oracle. The hardest phase: a named route sweep over every project-touching endpoint, not a feature bolt-on."
**Verified:** 2026-11-02T10:18:53Z
**Status:** human_needed (1 behavior-unverified truth; known open review findings noted, not re-litigated)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Merged from roadmap success criteria (SC-1..5) + PLAN frontmatter must_haves (29-01..29-04). Roadmap wording is canonical; plan truths that restate an SC keep roadmap wording.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin can set a membership scope (teams/projects); reads filter out-of-scope server-side; out-of-scope by-id writes rejected; by-id out-of-scope answers 404, never 403 or data (SC-1) | ✓ VERIFIED | `server.js:629 projectScope()`, `:648 inScopeProject()`, `:680 hiddenFor()`; scope-edit route `:3708` (admin-gated, 400 `scopeNotAllowed` on admin+ targets); `hiddenFor` consumed by both `redactDoc` (`:814`) and `mergeClientDoc` (`:881`) — one funnel, prohibition "no second pipeline" holds (grep: exactly 2 hiddenFor call sites in doc pipeline + 1 file-serve side door at `:4307`). Tests: scope.test.mjs #84, #104, #119, #132, #139 |
| 2 | By-id request to ANY project-touching endpoint with known-id-but-out-of-scope returns 404 — 404-matrix per endpoint family from the named sweep (SC-2) | ✓ VERIFIED | Table-driven MATRIX in test/scope.test.mjs (:495–745): families 1 (doc GET omission), 2 (doc PUT reserved), 4 (file serve, byte-identical `fileNotFound` 404 vs unknown id — status+code+message asserted identical), 5 (reminder + notification fan-out), 6 (invites), D-06 rows (activity/recent-search). Families 3/7/8 documented "checked, not affected" with reasons. Cross-probe at matrix line 163 asserts out-of-scope ≡ unknown byte-identically |
| 3 | Scoped member never assigned/mentioned/notified for out-of-scope content; notification resolution runs the same scope predicate (SC-3, SCOPE-04) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED (partial) | Server guards present: email mirror `server.js:1060–1063` (queueNotifEmails scope filter), assignee write-guard `:977–985` (mergeClientDoc, `assigneeOutOfScope`), reminder pass `:1187` — all use the same `projectScope/inScopeProject` predicate. Client emit pre-filter `memberScopeEligible` (store.js:442) wired into assign/mention/watcher fan-outs (actions.js:103,159,181,228). **BUT** the reminder-pass guard reads `t?.projectId` (server.js:1178) while real tasks store `project` — see behavior_unverified_items. Email-mirror and write-guard paths ARE tested on real fields and pass |
| 4 | Admin can invite with team/project scope; invited user lands with that scope (SC-4, SCOPE-05) | ✓ VERIFIED | Invite POST scope validation `server.js:3849–3873` (shape codes, cap 25, whitelist vs doc, admin invites never carry scope); acceptance passes invite scope into `addMembership` 5th param `:4027`; `addMembership(ws,user,role,teams,scope=null)` `:2182`. Tests: #329, #354, #362, #381, #398, #411 |
| 5 | External collaborator with project-level guest scope sees exactly that one project and nothing else (SC-5, SCOPE-06) | ✓ VERIFIED | `guestSingleProject` rule `server.js:3872` (viewer + >1 project refused); D-03 grant inversion in `hiddenFor`/`scopeGrants` composition (disjunctive, not conjunctive); tests #319 (multi-project guest refused), #385 ("guest sees exactly their one PRIVATE project and nothing else"), #463 (byte-identical unknown-id 404) |
| 6 | D-03 truth table: private+in-scope-OFF-list is VISIBLE (grant short-circuits private check) | ✓ VERIFIED | Truth-table test #295 (5 cells, fixture member joins private project access list); composition in `hiddenFor` explicitly disjunctive with comment (server.js:673–678) |
| 7 | Null scope and empty {teams:[],projects:[]} behave identically workspace-wide | ✓ VERIFIED | `projectScope()` returns null for empty arrays (server.js:645); tests #172 (explicit null restores workspace-wide), #415 (null-scope regression) |
| 8 | Admin/owner always workspace-wide; stored scope can never blind a higher role; promotion clears scope | ✓ VERIFIED | `projectScope` role check precedes scope read (server.js:632); 400 `scopeNotAllowed` on admin+ targets (:3717) and invites (:3865); promotion clears scope in same transaction (test #236) |
| 9 | Second boot byte-identical with scope columns present (additive-only invariant) | ✓ VERIFIED | test/migration.test.mjs:457 "the scope columns land on memberships and invites and survive the reboot unchanged" (first-boot/second-boot column comparison) |
| 10 | File-serve side door rides the same funnel — out-of-scope file = byte-identical unknown-id 404 | ✓ VERIFIED | `server.js:4307` uses `hiddenFor({data}, ctx.membership)` before streaming; tests #453/#463/#475/#487 |
| 11 | Scope writes + concurrent doc PUTs cannot interleave partially; out-of-scope redaction preserves list order | ✓ VERIFIED | mergeClientDoc filters subtractively over ordered lists (:822); doc byte-unchanged by scope writes (tests #92, #411) |
| 12 | Invite form scope section + member modal scope editor, name-based multi-selects stored as ids (D-09/D-10) | ✓ VERIFIED | src/overlays/modals.js:68–98 (member modal scope block, admin-target hint variant), :262–291 (invite modal scope section, role-gated); actions actions.js:1917–2005 (invScope/mScope toggles); EN+FR keys present and parity-checked (`modal.scopeSection` etc., key sets match) |
| 13 | No self-indicator badge (D-11); no new ROLE_RANK entry, no guest landing page (D-13/D-15) | ✓ VERIFIED | Grep: no scope badge/notice rendering; guest is viewer+scope storage-level only (plan A3); ROLE_RANK untouched |
| 14 | Activity feed + recent-search terms + cross-project search carry zero out-of-scope references for scoped members (D-06) | ✓ VERIFIED | redactDoc filters activity (:825) and recentSearches (:832); mergeClientDoc reserves them (:922–937); matrix tests #967/#974 |
| 15 | Scope-edit route: admin-gated → sameOrigin → readJson → whitelist → transaction (mirrors Phase 28 pattern) | ✓ VERIFIED | server.js:3708–3760; explicit 400 on absent scope field (scope-explicit route, test #230); 404 `notAMember` for unknown target (no-oracle preserved on the route itself) |
| 16 | Send-time ONLY notification enforcement; notifications list never server-filtered (D-07) | ✓ VERIFIED | No filtering in notifications-list read path (grep confirms D-07 comment in emitMentions; notifs list untouched); pre-scope notifications stay visible |
| 17 | Zero new runtime deps; no scope in workspace doc/revision (D-12) | ✓ VERIFIED | package.json unchanged in phase commits; scope rides memberships/invites authority rows only; doc byte-unchanged tests (#92, #411) |
| 18 | runReminderPass skips assignees whose scope excludes the task's project | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Guard present at server.js:1187 but keyed on `t?.projectId` (1178) which real tasks never carry — the passing test plants a synthetic `projectId` field (fixture-only). Matches open review finding WR-01. See behavior_unverified_items |

**Score:** 17/18 truths verified (1 present, behavior-unverified)

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| SCOPE-01 | ✓ SATISFIED | scope columns + predicate + hiddenFor funnel + scope-edit route (truths 1,7,8,9,11,15) |
| SCOPE-02 | ✓ SATISFIED | 404-never-403 contract enforced via hiddenFor across doc GET/PUT, file serve, D-06 rows (truths 1,2,10,14) |
| SCOPE-03 | ✓ SATISFIED | Named route sweep with table-driven 404-matrix per endpoint family (truth 2) |
| SCOPE-04 | ⚠️ PARTIAL (human verify) | Email mirror + write-guard + client emit filters verified; reminder-pass guard's test is fixture-only (truth 3/18, WR-01) |
| SCOPE-05 | ✓ SATISFIED | Invite-carried scope end-to-end (truth 4) |
| SCOPE-06 | ✓ SATISFIED | Guest = viewer + exactly-one-project, D-03 private grant (truth 5) |

No orphaned requirements: all six SCOPE IDs appear in plan frontmatter (requirements-completed across 29-01..29-04).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| server.js | scope columns, projectScope/inScopeProject/hiddenFor, scope route, invite scope, 3 send-time guards | ✓ VERIFIED | All present, substantive, wired (line refs above) |
| src/core/store.js | memberScopeEligible() | ✓ VERIFIED | :442, wired into actions.js emit filters |
| src/actions/actions.js | emit pre-filters | ✓ VERIFIED | :103, :159, :181, :228 |
| src/overlays/modals.js | invite scope section + member scope editor | ✓ VERIFIED | :68–98, :262–291 |
| src/locales/en.json, fr.json | EN+FR catalogue at write time | ✓ VERIFIED | Scope key sets match across locales (scope-prefixed keys + err.* codes) |
| test/scope.test.mjs | tracer, truth table, 404-matrix, SCOPE-04 rows, invite rows | ✓ VERIFIED | 981 lines, 40+ named tests |
| test/migration.test.mjs | scope column pin | ✓ VERIFIED | :457 |
| src/actions/teams.js | listed in orchestrator context as a scoped UI surface | ⚠️ ORPHANED (n/a) | Zero scope references — scope UI lives in actions.js/modals.js instead. Not a gap: no plan artifact claims teams.js; noting for context accuracy |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| projectScope() → hiddenFor() → redactDoc + mergeClientDoc | one funnel | direct call | ✓ WIRED | :814, :881 — no second redaction pipeline exists |
| scope-edit route → requireWorkspace('admin') → sameOrigin → whitelist → transaction | pattern mirror | :3708–3760 | ✓ WIRED | |
| invite POST → whitelist → invites.scope → acceptance → addMembership(...,scope) | plumbing | :3849–3873, :4027, :2182 | ✓ WIRED | Test #381 proves scope lands on membership |
| client Set-based target builders → memberScopeEligible() | pre-filter | actions.js | ✓ WIRED | |
| server guards → same predicate as read/write funnels | single source of truth | projectScope/inScopeProject everywhere | ✓ WIRED | |
| serveFileBinary → hiddenFor visible set → same 404 code path as unknown id | side door | :4307 | ✓ WIRED | byte-identity asserted in test #463 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| redactDoc | memberships.scope | authority row (sqlite) | yes | ✓ FLOWING |
| invite acceptance | invites.scope | admin-validated invite POST | yes | ✓ FLOWING (client-supplied scope at acceptance explicitly refused — comment :4033) |
| memberScopeEligible | projected profile | scope marker defaults to allow | yes (advisory by design, A4) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full suite | `node --test --test-concurrency=2 test/*.test.mjs` | 749 tests: 746 pass, 0 fail, 3 skipped (intentional) — matches baseline | ✓ PASS |
| Scope predicate export shape | grep projectScope/inScopeProject/hiddenFor signatures | all defined and consumed | ✓ PASS |
| i18n key parity (scope keys) | diff of scope-prefixed key sets en vs fr | identical | ✓ PASS |
| Reminder guard on real task field | test plants `projectId` synthetic field | production path reads `t.project` | ⚠️ SKIP → human (WR-01) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or conventional for this repo — SKIPPED (none exist).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| server.js | 1178 | `t?.projectId` vs real `t.project` (WR-01, fixture-only test) | ⚠️ Warning | Reminder-pass scope guard is dead on real data — human verification item |
| test/scope.test.mjs | 635/787 | fixture plants synthetic `projectId` field the doc schema doesn't carry | ⚠️ Warning | Self-fulfilling test for the reminder family (same root cause) |
| test/scope.test.mjs | — | no TODO/FIXME/TBD/PLACEHOLDER debt markers in phase files | ℹ️ Info | Clean |

No unreferenced debt markers in any phase-modified file.

### Known Open Review Findings (noted, not re-litigated)

29-REVIEW-DISPOSITION.md records 8 open dispositions (1 critical CR-01 resendPendingInvite strips scope; warnings WR-01..04; info IN-01..03). These are post-review items the orchestrator explicitly excluded from verification blocking. Corroborated during this verification: WR-01 (above, routes to human verification as the only behavior-unverified truth).

### Human Verification Required

### 1. Reminder-pass scope guard on real task data (WR-01)

**Test:** Create a scoped member (scope excludes project B), assign them a real task on project B with a due date inside the reminder window (field `project`, created through the UI or doc API — not a hand-planted `projectId` field), force a reminder pass, capture SMTP.
**Expected:** No reminder email/notification reaches the scoped member; an in-scope control assignee still receives theirs.
**Why human / why now:** The guard at server.js:1178 keys on `t?.projectId` while every other task reader (server.js:742/822/977) uses `t.project`; the existing green test only passes because its fixture plants a synthetic `projectId` field. Presence checks and the current suite cannot prove the guard fires on production-shaped data.

### 2. Scoped/guest member UX walkthrough (D-05/D-08/D-11)

**Test:** Sign in as a guest (viewer + one private project) in a browser.
**Expected:** Exactly their one project in navigation; no badge or "limited to" notice; out-of-scope by-id URLs 404; roster full (D-05).
**Why human:** Visual appearance and user-flow completion are human-only checks; the server side is test-verified but the rendered experience is not.

## Gaps Summary

No structural gaps. The scope substrate, D-03 grant inversion, 404-matrix, invite-carried scope, guest model, UI surfaces, i18n, and additive migrations are all present, wired, and test-proven (746/746 pass, baseline matched). One truth — the reminder-pass SCOPE-04 guard — is present and wired but its only behavioral test relies on a fixture field production data never carries (open review finding WR-01), so it routes to human verification rather than counting as verified. Status: human_needed, not gaps_found.

---

_Verified: 2026-11-02T10:18:53Z_
_Verifier: the agent (gsd-verifier)_
