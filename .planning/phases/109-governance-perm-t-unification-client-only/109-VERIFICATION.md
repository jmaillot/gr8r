---
phase: 109-governance-perm-t-unification-client-only
verified: 2026-11-28T19:10:00Z
status: passed
score: 4/4 success criteria verified
verdict: VERIFIED
covered_files:
  - .planning/phases/109-governance-perm-t-unification-client-only/109-01-PLAN.md
  - .planning/phases/109-governance-perm-t-unification-client-only/109-01-SUMMARY.md
  - src/pages/governance.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/locales/de.json
  - src/locales/es.json
  - src/locales/nl.json
  - test/governance-console.test.mjs
  - test/governance-tabs-client.test.mjs
  - test/i18n-shell.test.mjs
  - test/i18n-core-features.test.mjs
covered_digest: "v2:sha256:109-governance-permt-unification-client-only"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 109: Governance perm-t Unification — Client Only — Verification Report

**Phase Goal:** Every Governance tab renders perm-t tables in the v3.7 design language (client-only; zero server/API diff).
**Verified:** 2026-11-28T19:10:00Z
**Status:** passed — VERIFIED
**Re-verification:** No — initial verification

## Goal Achievement

### Per-Criterion Table

| SC | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| 1 | All three tabs render perm-t tables, v3.7-consistent; esc() on every cell | ✓ VERIFIED | Read the markup builders directly, not just tests. SA roster `:190`, SA candidates `:218`, Backup/Restore `roleTabView` `:293`, activity trail `recentHtml` `:312` — all `class="perm-t"` inside `<div class="panel" style="overflow-x:auto">` (mappings.js:86 recipe), min-width:880 on roster/candidates/role tabs, named `<th>` headers (When headers: `superColWhen`, `rolesRecent*`, `rolesColGranted`). Every payload cell passes esc(): name/email/id in rosterRow `:174` & candRow `:207`, user cells + When `:278–280`, trail cells `:314` (`esc(roleVerb)`, `esc(a.targetName \|\| '—')`, `esc(a.actorName \|\| '—')`, `esc(ago(...))`). Keyed empty states on roster-empty `:191`, no-matches `:219`, plus D-34 honest-null trail early-return `:310`. Esc() backstop tests green (governance-console 10/10). |
| 2 | D-90-3/4 semantics untouched; pins green | ✓ VERIFIED | In-code: roster-first default seg `'admins'` `:134` + D-90-3 lead `:152`; 2-char floor `q.length >= 2` `:203` with always-visible threshold hint `:188`; promote-only candidates (candRow carries ONLY `operatorPromote` `:209`, pinned "no revoke-sessions on a candidate row"); cap-10 + show-more (`shown = S.ui.govSuperShown \|\| 10` `:213`, `govSuperMore` `:218`); cap-note ALWAYS visible `:218`; D-90-5 promote reconcile comment intact. Test diffs (`git diff 0b2f7ab8..8ef11e9e -- test/governance-console.test.mjs test/governance-tabs-client.test.mjs`) show ONLY source-shape regex edits (candRow/rosterRow matchers `\n );` → `\n </tr>\`;`; thead regex +Granted column) — zero semantic assertion edits; all semantic assertions pass. |
| 3 | ×5 locale parity + i18n:scan clean; pins unchanged | ✓ VERIFIED | 5 new keys (`superColWhen`, `rolesRecentAction/Target/By/When`) present exactly once in all of en/fr/de/es/nl. `npm run i18n:scan`: 0 literals / 0 pending / 0 stale / 0 unresolved / 0 placeholder-mismatch. Pins measured on the real source: data-a **637** ✓ (i18n-shell:349), data-r **64** ✓, verbs **87** ✓ (i18n-core-features.test.mjs:171 — file untouched by the phase). data-a/data-r pins NOT bumped → consistent with zero markup-occurrence moves. |
| 4 | Zero server.js/api.js/src/actions diff | ✓ VERIFIED | `git diff 0b2f7ab8..8ef11e9e --stat`: 15 files — governance.js, locales ×5, 3 test files, planning docs/seeds. No src/server.js, no src/api.js, no src/actions. |

**Score:** 4/4 success criteria verified.

### Suite Baseline (SC-6 / instruction 6)

Three full-suite runs: `2836 tests, pass 2802–2803, fail 3, skipped 31`.
- 2 documented stable failures, reproduced every run: `french-typography` D-05 rules, `webhook-routes` GET list D-06 (and the webhook-routes 404 sibling in run 1) — the documented baseline.
- 3rd failure varies per run (observed: restore-overwrite EPIPE-class, webhook-routes 404, backup-scheduler sweep skipped_overlap) — `backup-scheduler` sweep passed 3/3 in isolation afterwards; matches SUMMARY's transient-flake characterization, within the ≤3-tolerance B1 gate.
- Governance + i18n suites run directly: 93/93 pass (governance-client, governance-console, governance-tabs-client, i18n-shell, i18n-core-features, i18n-toast).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Governance/i18n suites | `node --test test/governance-{client,console,tabs-client}.test.mjs test/i18n-{shell,core-features,toast}.test.mjs` | 93 pass / 0 fail | ✓ PASS |
| i18n key scan | `npm run i18n:scan` | all-zero | ✓ PASS |
| Pin counts | grep src/ | data-a 637, data-r 64; verbs pin assertion untouched | ✓ PASS |
| Full suite | `npm test` ×3 | 2836 tests, 3 fails (2 documented + 1 rotating transient) | ✓ PASS (baseline) |

### Deviation Review — W4 key-budget exceedance (instruction 5)

**Ruling: defensible.** The plan budgeted ≤4 new keys assuming existing `page.governance.*` labels were truthful for the trail headers. Verified: the only existing Action/Target/By labels are `page.mappings.usageCol*` (wrong page namespace — cross-page reuse would break key locality) and `rolesRecentTitle` is a section label, not a column header. No truthful reuse existed, so 4 keys were genuinely required for 4 columns; Task 1's reuses (User → `rolesColUser`, Backup/Restore When → `rolesColGranted`) kept the phase at 5 total, 1 over a soft research-derived cap. Stop-and-record discipline was followed: declared in SUMMARY `decisions` + `Deviations from plan` with the wrong-namespace rationale, committed in the same commit as the consuming markup (df23322c), ×5 parity confirmed. **Accept.**

### Notes

1. **Pre-existing Phase 110 commit in the diff range:** `36ae3245 test(110-01)` (webhook-events fixed-now injection, HK-02) sits inside `0b2f7ab8..8ef11e9e`, but SUMMARY frontmatter `plan_head_before: 36ae3245e939` confirms it was already HEAD before the phase started — not a 109 deviation, no server file touched.
2. candRow's When cell renders `ago(u.last_login_at)` without esc() (`:210`) while the roster row wraps it — cosmetic inconsistency only; `ago()` output is a computed relative-time string, not user payload, so no T-79-10 breach. No action needed.
3. Trail table intentionally skips min-width (8 capped narrow display-only rows) — per-plan honest sizing, consistent with the overflow panel wrapper.

### Human Verification Required

None — visual consistency (spacing/typography) is the only residual human judgment; the structural recipe (perm-t + overflow panel + named headers + empty states) is verified in code and pinned by tests.

### Gaps Summary

None. All four success criteria verified against the actual markup-building code, test diffs, locale files, pin counts, and three full-suite runs. Phase goal achieved; ready to proceed to Phase 110.

---

_Verified: 2026-11-28T19:10:00Z_
_Verifier: the agent (gsd-verifier)_
