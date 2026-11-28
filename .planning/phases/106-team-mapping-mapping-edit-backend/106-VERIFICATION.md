---
phase: 106-team-mapping-mapping-edit-backend
verified: 2026-11-28T12:00:00Z
status: passed
score: 4/4 success criteria verified
covered_files:
  - server.js
  - db-adapter.mjs
  - test/groups-sso.test.mjs
  - test/group-mappings-api.test.mjs
  - src/locales/en.json
  - src/locales/de.json
  - src/locales/es.json
  - src/locales/fr.json
  - src/locales/nl.json
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "SC4 dual-engine DDL verified via live Postgres matrix"
    reason: "House interpretation since the pg-matrix phases (confirmed in 106-01-SUMMARY checker-W2 note): the db-adapter pg-parity static pin + SQLITE_SCHEMA mirror stand in for a live-PG harness. Both new columns (team_members.provenance, group_mappings.team_id) are present in the SCHEMA twin and the sync-cell upsert uses engine-proven `on conflict ... do update ... where` (no insert-or-ignore). Verified in test/db-adapter.test.mjs (green)."
    accepted_by: "developer (documented in 106-01-SUMMARY)"
    accepted_at: "2026-11-28"
---

# Phase 106: Team Mapping & Mapping Edit — Backend Verification Report

**Phase Goal:** The mapping row optionally targets a team; group-driven team memberships reconcile at SSO sign-in; mappings are editable.
**Verified:** 2026-11-28
**Status:** passed (VERIFIED, one documented override)
**Re-verification:** No — initial

## Per-Criterion Evidence

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| SC-1 | Mapping with team grants team membership AND workspace role at next sign-in; deletion removes group team rows, provenance-keyed, manual rows immune | ✓ VERIFIED | Sync cell `server.js:6891-6990` runs on EVERY 6841-loop iteration (inserted before the `if (!mapped)` branch chain; all branches `continue`). Grant arm: `on conflict ... do update ... where team_members.provenance is not excluded.provenance` (changes-only, :6973) with `wrote.changes > 0` gating the same-tx `group_team_granted` audit (:6975-6979). Removal sweep keys the guid from the ROW's own provenance (`slice('group:'.length)`, :6941-6949) — never from claims. Option A held: `addMembership` untouched (grep: only manual/invite callers), grant arm performs zero team-role writes, `team_members` grants ride only the sync cell. TEAM-05: cell iterates RAW `mappings`, not `resolve()` output (:6929-6931) — non-winner grants pinned by test :504. Zero-write pins green: byte-identical :387, no-op re-login :408, same-role re-login :692, changes-only team re-login :478. Team-only sweep :949, team_id-edited-away :989, manual-row immunity :1053, GS-01 lost-claim team purge :1108. |
| SC-2 | Manual teams PUT never purges group-stamped rows (regression-pinned) | ✓ VERIFIED | Narrowing verbatim at server.js:12124: `delete from team_members where workspace_id = ? and user_id = ? and (provenance is null or provenance not like 'group:%')`. (Line moved from the research's 11843 anchor — the anchor held semantically; confirmed in the tx with the reinsert loop below.) Regression-pinned: test/groups-sso.test.mjs:1134 "manual teams PUT preserves group-stamped rows and reinserts only the manual set (TEAM-04)". |
| SC-3 | PATCH ladder, keyed refusals, dup guard, same-tx audit, POST team validation, ×5 locales | ✓ VERIFIED | PATCH route server.js:9299-9394. Ladder EXACT order: sameOrigin → requireUser → `tooMany('group-mapping-edit\|<operator.id>', 5, 15min)` BEFORE isInstanceAdmin (:9309, throttle-before-gate pinned :425) → uniform generic 404, no oracle (:9311, pinned :443). GUID immutable keyed refusal `groupMappingImmutable` (:9314, R-8, pinned :458). Dead-row refusal `groupMappingDead` with sanctioned live-retarget repair (:9334-9337, pinned :616). Dup pre-check + `isUniqueViolation` backstop (POST idiom verbatim, pinned pre-check :521). `group_mapping_updated` same-tx with the UPDATE (:9378-9390, AUD-01; exactly-one-audit pinned :360, memberships/team_members byte-identical). POST team validation: doc.teams whitelist via shared `docTeamIds`, nullable, archived refused (:9151-9158, matrix :645). PATCH team validated against EFFECTIVE workspace (:588). Locale parity: 3 keys ×5 catalogues pinned (catalogue.test.mjs 27/27 + explicit pin test :710); `npm run i18n:scan` → 0 pending/0 stale. |
| SC-4 | Deleted team → team-deleted orphan; role still granted; dual-engine DDL | ✓ VERIFIED | Boot warn: server.js:13965 `group mapping dead: group X → missing team Y in workspace Z` (mirrors the sibling workspace-dead warn; pinned :1164 incl. zero-rows boot byte-identical). Dead-mappings route: `deadReason: 'team-deleted'` for vanished-team rows (:9422, pinned test/group-mappings-api.test.mjs:328). Reconcile dead-team skip: sync cell skips the grant + emits `group_team_skipped:...:dead-team` + one PII-free logWarn (:6935-6946; no-GUID/no-email asserted :1046) while the ROLE grant below is untouched (doc-deleted-team test :1015 sweeps the row, keeps the role). DDL: `adapterEnsureColumn('group_mappings','team_id')` + `('team_members','provenance')` (server.js:1051-1052); SCHEMA twins in db-adapter.mjs (team_members.provenance :251, group_mappings.team_id :419). Live-PG harness absence accepted via documented override (see frontmatter). |

## Requirements Coverage

TEAM-01..08 and EDIT-01/02 are all `[x]` in REQUIREMENTS.md and each maps to verified evidence above (TEAM-06 audit verbs: `group_team_granted`/`group_team_removed`/`group_team_skipped` at :6925/:6951/:6977, emitted changes-only). TEAM-08's delete-confirm copy clause is client-side, explicitly deferred to Phase 107 per the 106-02-SUMMARY handoff note — server DELETE contract unchanged and pinned (R-3, byte-identical :253).

## Standing Gates

- Zero new deps: package.json/package-lock.json untouched in 5e7026b2..HEAD ✓
- No schema rebuild: no epoch/variant/index changes in db-adapter diff; `group_mappings_pair` untouched ✓
- Audit funnel shapes unchanged: encoded rows use the existing 12-col audit insert; team audits only in the same tx as their write, gated on `wrote.changes > 0` ✓
- Full suite at baseline: **2794 tests, 2761 pass, 2 fail, 31 skipped** — the 2 failures are the documented pre-existing ones (french-typography, webhook-routes GET list). One run also surfaced the known webhook-events flake (89-05 outbox gate) — pre-existing, not phase scope. ✓

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| SSO sync cell scenarios | `node --test test/groups-sso.test.mjs` | 33/33 pass | ✓ PASS |
| PATCH/POST/GET route matrix | `node --test test/group-mappings-api.test.mjs` | 27/27 pass | ✓ PASS |
| DDL lockstep twins | `node --test test/db-adapter.test.mjs` | pass | ✓ PASS |
| Locale parity | `node --test test/catalogue.test.mjs` + `npm run i18n:scan` | 27/27; 0 pending | ✓ PASS |
| Full baseline | `npm test` | 2761/2794, 2 pre-existing fails | ✓ PASS |

## Real-Test Check (instruction §7)

All requested scenarios exist as real, named tests and pass: team-only sweep (:949), team_id edited away (:989), doc-deleted team with role retained + PII-free warn (:1015), manual-row immunity (:1053), manual-PUT narrowing regression (:1134), boot dead-team warn + zero-rows byte-identical (:1164). The PATCH matrix exercises the real HTTP route ladder end-to-end (ladder 401/403/429, uniform 404, GUID tamper, dup, archived retarget, team valid/unknown/null-clear, effective-workspace whitelist, dead refusal + repair, GET payload, ×5 parity). The `isUniqueViolation` backstop is not exercised via HTTP — documented, correct: single-threaded tests cannot race past the dup pre-check; the classifier stays pinned by the existing T7 unit test.

## Notes (non-blocking)

1. **SC4 override** (frontmatter): live-PG matrix replaced by the house static-pin interpretation, documented in 106-01-SUMMARY before verification — accepted, not a gap.
2. **Locale-key commit timing** deviates from plan Task-3 bundling (GD-7 same-commit rule won) — net ×5 parity verified.
3. **ROADMAP plan checkbox**: ROADMAP.md still shows 106-02-PLAN.md unchecked while 106-02-SUMMARY.md reports complete with commits through 124d0925. Bookkeeping only; no code impact.
4. TEAM-08 delete-copy clause deferred to Phase 107 (client-side), properly handed off.

## Gaps Summary

None. All four success criteria are verified in code with real passing tests; standing gates hold; requirements are ticked truthfully.

---

_Verified: 2026-11-28_
_Verifier: the agent (gsd-verifier)_
