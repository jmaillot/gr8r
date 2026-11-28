---
phase: 107-mappings-spa-sections-tables-edit-usage-log
verified: 2026-11-28T13:05:00Z
status: passed
score: 5/5 success criteria verified
verdict: VERIFIED WITH NOTES
covered_files:
  - .planning/phases/107-mappings-spa-sections-tables-edit-usage-log/107-01-PLAN.md
  - .planning/phases/107-mappings-spa-sections-tables-edit-usage-log/107-01-SUMMARY.md
  - server.js
  - src/core/api.js
  - src/pages/mappings.js
  - src/actions/actions.js
  - src/locales/en.json
  - src/locales/de.json
  - src/locales/es.json
  - src/locales/fr.json
  - src/locales/nl.json
  - test/mappings-client.test.mjs
  - test/group-mappings-api.test.mjs
  - test/governance-client.test.mjs
  - test/governance-rename.test.mjs
  - test/i18n-toast.test.mjs
  - test/i18n-core-features.test.mjs
  - test/i18n-shell.test.mjs
covered_digest: "v2:3ed2a4b6f40d90789c751fe579507f8d1ffb241505221e5ebc5ff2dd6a09bb60"
notes:
  - TEAM-08 deleteCopyRole EN wording ships as planner-drafted; owner sign-off flagged in 107-01-SUMMARY (typographic apostrophe in en.json — owner to confirm before milestone ship)
---

# Phase 107: Mappings SPA — Sections, Tables, Edit UI, Usage Log — Verification Report

**Phase Goal:** The Mappings page becomes three sections with proper tables; mappings get an edit UI.
**Verified:** 2026-11-28T13:05:00Z (initial verification, no prior VERIFICATION.md)
**Verdict:** VERIFIED WITH NOTES (one owner-sign-off note, zero gaps)

## Per-Criterion Evidence

| # | Criterion | Status | Evidence (read in code, not from SUMMARY) |
|---|-----------|--------|-------------------------------------------|
| SC-1 | Three sections render as tables from extended GETs; esc() on every cell | ✓ VERIFIED | `src/pages/mappings.js`: §1 `mapTr` (:49–68, perm-t `<tr>`, 7 SPA-01 columns) rendered inside the sblock `<table class="perm-t">` (:86); §2 `govDeadCard` (:181–189, dead table fed by `S.ui.govDead.orphans`, Group ID/Workspace/Team/Last seen); §3 `usageSection` (:212–234, 5-column usage table). Every interpolated cell/attribute passes `esc()` — audited literally: mapTr (label, guid, workspaceName, teamName, liveMembers, ago, id attrs), orphanTr, usageTr, mapCreateForm/mapEditBody (all `value=` attributes and `<option>`s). Markers: `107-01 DEAD-MAPPINGS TABLE + USAGE LOG` at mappings.js:161; old v3.6 card gone. Staged delete untouched (D-90 trio) |
| SC-2 | Edit flow round-trips through PATCH; GUID immutability client-side | ✓ VERIFIED | `src/core/api.js:480–482` — `groupMappingUpdate(id, body)` → PATCH `/api/governance/group-mappings/:id` (106 route). Chain: `data-a="mapEditAsk"` on every row (mappings.js:66, incl. dead rows) → `A.mapEditAsk` stages `S.ui.mapEdit = {id, guid, wsId, teamId, role, label}` (actions.js:4906–4912) → `mapEditBody` renders GUID read-only esc'd mono + `editGuidHint`, **no `data-in="mapEditGuid"` anywhere** (grep-confirmed) → `IN.mapEditWs/Team/Role/Label` mutate the draft (actions.js:4920–4936) → `A.mapEditSave` PATCHes all four camelCase fields `{workspaceId, teamId, role, label}` — **groupGuid absent from the body** (actions.js:4951) → success toast + `closeModal()` + `await refreshMappings()` (:4956–4959). 401 silent bail and tErr funnel present. `mapTeardown` clears `S.ui.mapEdit` (mappings.js:297) |
| SC-3 | Usage Log: 5 lifecycle actions + 106-01 team verbs; honest Group Name; cap-note at exactly 100 | ✓ VERIFIED | `USAGE_ACTION_KEYS` (mappings.js:194–203) covers granted/upgraded/downgraded/removed/teamGranted/teamRemoved + both skipped variants (included per A4); reason tails `guardRefused/lostClaim/deadTeam/mappedLower` (USAGE_REASON_KEYS, :205–210 — guard-refused is the 5th lifecycle state, rendered as faint tail). FIRST-colon split client-side (D-08). Honest Group Name: `S.ui.mapRows.find(r => r.groupGuid === guid)?.label` with `esc(groupName || guid)` raw-GUID fallback (:227–228). Cap-note `usageCapNote {shown}/{total}` rendered ONLY when `usage.length === 100` (:231). Server slice (server.js dead-trail GET): third query with the byte-exact escaped LIKE `action like 'group\\_%:group:%' escape '\\'` + `target_name, target_email` columns, camelCased rows, no server action transformation; `{orphans, trail, usage}` payload. Admin-only gate (`api.user?.isInstanceAdmin`, mappings.js:97–98) matches the server's isInstanceAdmin gate |
| SC-4 | Team picker scoped to selected workspace (doc.teams); ws-change resets teamId; ×5 parity; pins 86/636 | ✓ VERIFIED | Server: `GET /api/auth/operator/workspaces` rows now carry `teams: [...docTeamNames(r.doc)].map(([id,name]) => ({id,name}))` (server.js:8868) — plain-JS doc parse, pg-parity. Client: create-form team `<select>` renders ONLY when `f.wsId` set, options from `wsPool.find(w => w.id === f.wsId)?.teams` (mappings.js:133–138); edit-modal team options re-derive from the select's CURRENT `d.wsId` (:268–271). `IN.mapWs` resets `S.ui.mapForm.teamId = ''` (:4821) and `IN.mapEditWs` resets `S.ui.mapEdit.teamId = null` (:4920–4926). `A.mapCreate` sends `teamId` (wiring-completeness auto-fix, test-pinned). `npm run i18n:scan` → 0 pending / 0 stale / 0 dead (run this session). Pins: verbs=86 (test/i18n-core-features.test.mjs:171, annotated +1 = groupMappingUpdate); data-a=636 in BOTH i18n-shell (:349) and i18n-toast (:301) with the second mapEditCancel occurrence annotated (summary said 635; landed at 636 — pin comment explains why; both mirror pins bumped) |
| SC-5 | TEAM-08: deleteCopyRole when row is the group's only mapping for its workspace | ✓ VERIFIED | Staged-delete branch (mappings.js:64–65): `S.ui.mapRows.filter(r => r.groupGuid === m.groupGuid && r.workspaceId === m.workspaceId).length === 1` → appends `<span class="hint">deleteCopyRole</span>` to the staged row beside the lazy-revocation `deleteCopy`. `page.mappings.deleteCopyRole` present in all 5 locales (en/de/es/fr/nl, same key line ~2207 each). Verbatim EN recorded in 107-01-SUMMARY ("Because this is the group's only mapping…") with the owner-review flag carried. Client tests: mappings-client.test.mjs 45/45 pass (TEAM-08 + verbatim-EN + ×5 parity pins) |

## Goal Achievement — Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Three table sections from extended GETs, esc() everywhere | ✓ VERIFIED | mappings.js mapTr/govDeadCard/usageSection (SC-1 row above) |
| 2 | Edit round-trips through PATCH; GUID read-only client-side | ✓ VERIFIED | api.js:480 / actions.js:4906–4959 / mappings.js mapEditBody (SC-2) |
| 3 | Team picker offers only selected workspace's teams; absent until ws chosen | ✓ VERIFIED | mappings.js:133–138, server.js:8868 feed, IN.mapWs/IN.mapEditWs resets (SC-4) |
| 4 | Usage Log labels all lifecycle + team verbs, honest Group Name, cap-note at cap | ✓ VERIFIED | mappings.js:194–231, server.js usage slice (SC-3) |
| 5 | TEAM-08 role-loss clause conditional derivation | ✓ VERIFIED | mappings.js:65, ×5 locales, tests green (SC-5) |

**Score:** 5/5 truths verified (0 behavior-unverified beyond what the test suite already exercises)

## Standing Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Zero new deps | ✓ PASS | `git diff 0e0b74e7..59cd3471 -- package.json package-lock.json` = empty |
| Audit funnel untouched | ✓ PASS | logSecurity call count 19→19, audit_log write sites 35→35 vs base 0e0b74e7 (line shifts only) |
| D-89-14 untouched | ✓ PASS | `git log -S "D-89" 0e0b74e7..59cd3471 -- server.js src/` = no commits |
| Full suite at baseline+new | ✓ PASS | `npm test` (run this session): **2814 tests, 2781 pass, 2 fail** = exactly the documented pre-existing failures (french-typography D-05 rules; webhook-routes GET list secret-scan) — matches SUMMARY claim verbatim |
| i18n:scan | ✓ PASS | 0 literals / 0 pending / 0 stale / 0 dead / 0 placeholder-mismatch (run this session) |

## Item 6 — Dead-Card Migration Cleanliness

- Old `govDeadCard` card markup fully replaced by the table implementation (the function name survives but renders the perm-t table — no zombie card markup; grep for `83-02 DEAD` finds only the historical governance.js comment "MOVED (102-01)").
- Marker renamed to `107-01 DEAD-MAPPINGS TABLE + USAGE LOG` (mappings.js:161).
- `deadOrphans`/`deadTrail` retired: `test/mappings-client.test.mjs:351` asserts absence in all 5 catalogues; i18n:scan 0 stale confirms no zombie keys in `src/` either.
- Marker-discipline test re-scoped in the same commit (59cd3471) per Rule 3, alongside governance-client (3 pins), governance-rename (payload shape), i18n-toast (data-a mirror) — drift documented as deviations 2–3 in SUMMARY.
- No zombie references: grep `deadOrphans|deadTrail` in src/ + test/ returns only the retirement assertion and the historical annotation.

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Mappings client pins (esc, parity, trio, GUID read-only, TEAM-08, marker) | `node --test test/mappings-client.test.mjs` | 45 pass / 0 fail | ✓ PASS |
| Server contract (usage slice incl. team-verb row + group_mapping_saved exclusion; workspaces teams feed) | `node --test test/group-mappings-api.test.mjs` | 29 pass / 0 fail | ✓ PASS |
| i18n catalogue discipline | `npm run i18n:scan` | 0 pending / 0 stale / 0 dead | ✓ PASS |
| Full suite | `npm test` | 2814 / 2781 pass / 2 pre-existing fails | ✓ PASS |

Step 7b: remaining SPA behaviors (visual rendering, modal UX) route to human UAT — see below. No runnable-entry behavioral gaps found.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | none | — | — |

Debt-marker gate: no TBD/FIXME/XXX in any modified file. No stub patterns: no `return null`/empty-handler/`Response.json([])` in the diff scope.

## Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| SPA-01 | ✓ SATISFIED | mapTr 7-column perm-t table |
| SPA-02 | ✓ SATISFIED | mapEditBody modal + PATCH round-trip |
| SPA-03 | ✓ SATISFIED | dead table fed by orphans |
| SPA-04 | ✓ SATISFIED | usage table + cap-note + empty state |
| SPA-05 | ✓ SATISFIED | doc.teams feed + scoped picker |
| TEAM-08 | ✓ SATISFIED | deleteCopyRole conditional, EN wording in SUMMARY |

No orphaned requirements (REQUIREMENTS maps SPA-01..05/TEAM-08 to Phase 107; all claimed by 107-01-PLAN frontmatter).

## Notes Requiring Owner Attention

1. **TEAM-08 wording sign-off** — `page.mappings.deleteCopyRole` EN ships as planner-drafted ("Because this is the group’s only mapping for this workspace, members will also lose their workspace role at that same next sign-in." — typographic apostrophe in en.json). Flagged in 107-01-SUMMARY per the 106-02 W1 handoff; owner should sign off before milestone ship. ×5 translations landed but were not independently reviewed against the EN.
2. **data-a pin landed at 636, not the plan's 635** — mapEditCancel carries a second markup occurrence (staged-draft guard footer). Annotated in both i18n-shell and i18n-toast pins; harmless, self-documented.

## Gaps Summary

None. All four ROADMAP success criteria plus TEAM-08 verified in code, with this session's own test runs reproducing the SUMMARY's claimed numbers exactly.

---

_Verified: 2026-11-28T13:05:00Z_
_Verifier: gsd-verifier (goal-backward)_
