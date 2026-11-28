---
phase: 111-backup-console-detailing-client-only
verified: 2026-11-29T00:00:00Z
status: passed
score: 4/4 success criteria verified
verdict: VERIFIED WITH NOTES
covered_files:
  - .planning/phases/111-backup-console-detailing-client-only/111-01-PLAN.md
  - .planning/phases/111-backup-console-detailing-client-only/111-01-SUMMARY.md
  - src/pages/backup.js
  - src/locales/en.json
  - src/locales/de.json
  - src/locales/es.json
  - src/locales/fr.json
  - src/locales/nl.json
  - test/backup-history-client.test.mjs
covered_digest: "v2:sha256:backup.js=f66fc291fc49265f,en=1fae0c7c4556884b,de=e61130ab0887de64,es=ca40d848832805f4,fr=1aab3da4fbfe229f,nl=7e6987a83e3289ff,test=1272b73f6753bdf0"
behavior_unverified: 0
overrides_applied: 0
coincidental_reliance_items: []
human_verification: []
---

# Phase 111: Backup Console Detailing — Client Only — Verification Report

**Phase Goal:** The Backup surface fully on the 11-point design checklist (min-width drift 860/820→880 BK-01, run-history superset headers per R-15 BK-02, residual checklist sweep net-zero BK-03).
**Verified:** 2026-11-29
**Status:** passed — verdict **VERIFIED WITH NOTES** (3 notes, none blocking)
**Re-verification:** No — initial

## Per-Criterion Verdict Table

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| SC-1 | Run-history = ONE table, 8-column superset, honest `—`, esc() everywhere, :826 fixed | ✓ VERIFIED | See below |
| SC-2 | min-width drift closed | ✓ VERIFIED | grep: exactly 2 × `min-width:880px` (backup.js:321 history, :430 task table); zero occurrences of `min-width:860px` or `min-width:820px` remain |
| SC-3 | 11-point checklist sweep + non-goals held | ✓ VERIFIED | See checklist table below; non-goals byte-intact |
| SC-4 | Zero server/API diff; pins net-zero; ×5 parity; i18n:scan clean | ✓ VERIFIED | See below |
| SC-5 | Full suite at baseline 2836, failing ∈ [2,3] documented | ✓ VERIFIED | 2836 tests, **fail 3** — see Note 1 |

## SC-1 — Run-History Superset Headers (BK-02, R-15)

Read directly from `src/pages/backup.js` at HEAD:

- **Header row (:321):** ONE thead — `Type / Run(colRun) / Trigger(filterTrigger) / Initiator(colInitiator) / Schedule(scheduleCol) / Status(filterStatus) / When(historyDateCol) / empty gutter th`, first th `padding-left:14px`, table `perm-t hist-t` in `panel overflow-x:auto`. Matches the R-15 superset exactly.
- **Backup rows (historyTr, :264–275):** 8 tds — type badge, runCell, trigger, `<td><span class="faint">—</span></td>` (honest Initiator — payload carries no operator field, never fabricated), scheduleCell, statusCell, `esc(when)`, actions. All payload strings through esc() (runTip, shortLabel, when, error toggle).
- **Restore rows (restoreRunTr, :830–839):** 8 tds — Restore badge, runCell (archive_name/final_name esc'd), `<td><span class="faint">—</span></td>` (honest Trigger), initiator cell `${run.created_by_name ? esc(String(run.created_by_name)) : '—'}` under the Initiator header, honest `—` Schedule, stage badge (esc'd fallback), `esc(when)`, empty gutter td.
- **Malformed :826 fixed:** diff confirms the two-tds-on-one-line (`...historyColType...` `</td>    <td>${runCell}</td>`) was reformatted one-td-per-line at 748b1918.
- **Wiring:** `merged` array interleaves historyTr + restoreRunTr rows sorted by `at` desc; both row builders emit 8 tds matching the 8-column thead. Key link verified: restore initiator cell ↔ `page.backup.colInitiator` header.

## SC-3 — 11-Point Checklist (§Q3) Sweep

| Point | Status | Evidence |
|---|---|---|
| 1. perm-t in overflow-x:auto panel | ✓ | both tables (:321, :430) |
| 2. named th row, padding-left:14px first, empty gutter last | ✓ | both header rows |
| 3. min-width 880 on wide tables | ✓ | exactly 2 × `min-width:880px` |
| 4. When column, faint, esc'd, `—` on null | ✓ | both builders (`esc(when)`, `'—'` fallback) |
| 5. keyed empty states | ✓ | `historyLoading`/`historyUnavailable`/`historyEmpty` keyed three-tier (:317–322) |
| 6. esc() on every payload string | ✓ | 77 esc( sites in backup.js; runCell/title/initiator/when all esc'd |
| 7. badge per-state vocabulary | ✓ | green/amber/red/accent used in statusCell; stage badge |
| 8. gutter controls, one data-a per occurrence | ✓ | backup.js data-a = 32 (unchanged); no new actions |
| 9. new keys ×5 same commit | ✓ | colRun/colInitiator added to all 5 locales in 748b1918 (same commit as emitting markup — confirmed via `git log -- src/locales/en.json`) |
| 10. pins annotated same-commit | ✓ (n/a) | no pin shift, no annotation needed |
| 11. teardown | ✓ (n/a) | no new S.ui slot introduced |

**Non-goals held (byte-intact):**
- `deletionsPanel` (:470) untouched — D-90-14 div projection, diff base→9ea74684 shows no change to that region.
- `restorePreviewBody` chip block (:621) untouched — 105-01/108-01 pins intact.
- Task filter keeps `colTask` label (:330).

## SC-4 — Zero Server Diff, Pins, Parity, i18n

- `git diff 8be568dc..9ea74684 --stat`: only backup.js, 5 locale files, backup-history-client.test.mjs, .planning docs, and 2 comment-only test files from the parallel 113-01 agent (74288dd3 — verified comment-only: backup-routes +17, locale-registry-fixture +8, no logic). **`git diff --quiet` on src/server.js + src/api.js: exit 0.**
- **Pins:** data-a = 635 asserted in i18n-shell.test.mjs:349, data-v = 94 (:350), data-r = 64 (:351), verbs = 86 — all pin suites pass (below). backup.js local data-a = 32 (unchanged). No annotation needed — net-zero held.
- **i18n:scan:** `0 literals, 0 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch, 0 dead`.
- **×5 parity:** colRun = Run/Ausführung/Ejecución/Exécution/Uitvoering; colInitiator = Initiator/Initiator/Iniciador/Initiateur/Initiator — all 5 locales present.
- **Suites:** backup-history-client 26/26 pass; i18n-shell + i18n-core-features pass (fail 0).

## SC-5 — Full Suite at Baseline

`node --test --test-concurrency=2 test/*.test.mjs`: **tests 2836, pass 2802, fail 3** — within the [2,3] gate:

1. `every French catalogue value passes the D-05 typography rules` — documented pre-existing failure ✓
2. `GET list: no secret field anywhere; health computed from deliveries (D-06)` — documented pre-existing failure ✓
3. `GET /api/auth/operator/workspaces/:id/members returns members and active reassign targets` — **not the documented scheduler-contention family**; see Note 1.

## Notes (Non-Blocking)

**Note 1 — third failure identity differs from the documented family.** The SUMMARY recorded run-B's third failure as `backup-scheduler skipped_overlap`; this verification run's third failure is the webhook-routes operator-workspaces-members test (assertion `actual: 'active'`, `expected: 'failing'` at webhook-routes.test.mjs:130). **Verified load-contention, not regression:** `node --test test/webhook-routes.test.mjs` in isolation passes 11/12 with only the documented D-06 GET-list failure — the members test passes alone and fails only under concurrency-2 contention. The failing count (3 ∈ [2,3]) and the two documented failures are stable. Phase 113 (HK-03) should broaden the known-flake documentation to name webhook-routes as a second contention-affected family.

**Note 2 — 17 pre-existing lint errors confirmed pre-existing, ruling: observation only.** Reproduced at base commit 8be568dc via direct lint of the base blob: backup.js carries the same 4 errors (`fsize`, `tzPreselect`, `flags` unused; `skipped` no-useless-assignment) — line-shifted (799:7 → 804:7) but identical identities. `export/*.js` carries 19 errors at HEAD with zero diff on export/ between base and HEAD, so all pre-existing (SUMMARY's "13" count is per-file-grouping; total is 19, all unused-var/useless-assignment/useless-escape classes). **Ruling: stay an observation** — none touch this phase's files' logic, none are debt markers (no TBD/FIXME/XXX), lint is not a gate in this project's baseline contract. Candidates for a future housekeeping item alongside HK-03; no gap plan required.

**Note 3 — R-15 prose discrepancy (research/REQUIREMENTS vs implementation).** REQUIREMENTS.md BK-02 describes the superset as "Task / Workspace / Project / Initiator / When" with the initiator "under the Task header"; the implementation uses the PLAN's 8-column superset (Type/Run/Trigger/Initiator/Schedule/Status/When/gutter), and the PLAN itself documents that the research prose was off (the initiator actually sat under the *Trigger* header pre-fix). The R-15 intent — initiator data under its own dedicated header, honest `—` elsewhere — is achieved. BK-02 marked `[x]` in REQUIREMENTS.md. No action.

## Human Verification Required

None — no behavior-dependent truths beyond test coverage; backup-history-client suite (26/26) exercises the merged render, esc pins, and ×5 parity programmatically.

## Gaps Summary

None. All 4 roadmap success criteria verified in the actual code; SUMMARY claims cross-checked against diff and live greps and found accurate (one count nit: 19 export/ lint errors, not 13 — Note 2).
