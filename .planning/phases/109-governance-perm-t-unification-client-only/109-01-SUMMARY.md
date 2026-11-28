---
phase: 109-governance-perm-t-unification-client-only
plan: 01
subsystem: governance-client
tags: [perm-t, design-language, i18n, client-only]
requires: [mappings.js v3.7 perm-t idiom, D-90 semantic pins, GOVERNANCE-REFRESH drift pins]
provides: [unified perm-t Governance tabs (SA roster/candidates/trail + Backup/Restore), page.governance.superColWhen, page.governance.rolesRecent{Action,Target,By,When}]
affects: [test/governance-console.test.mjs source pins, test/governance-tabs-client.test.mjs (d) thead pin]
tech-stack:
  added: []
  patterns: [perm-t table + overflow-x panel wrapper (mappings.js:86 recipe), esc() on every rendered cell]
key-files:
  created: []
  modified:
    - src/pages/governance.js
    - src/locales/en.json
    - src/locales/fr.json
    - src/locales/de.json
    - src/locales/es.json
    - src/locales/nl.json
    - test/governance-console.test.mjs
    - test/governance-tabs-client.test.mjs
decisions:
  - "SA tables reuse rolesColUser ('User') for the User header — no new key (budget save)"
  - "Trail headers got 4 new keys (rolesRecentAction/Target/By/When): no existing page.governance.* label was truthful for Action/Target/By (usageCol* are page.mappings.*) — 1 key over the ≤4 hard cap, recorded per W4"
  - "Backup/Restore When header reuses rolesColGranted ('Granted'/'Attribué le') — no new key"
  - "Trail table skips min-width (8 capped narrow display-only rows — honest sizing per plan)"
metrics:
  duration: ~50 min
  completed: 2026-11-28
status: complete
actuals:
  tokens: 62000
  tasks: 3
  commits: 3
plan_head_before: 36ae3245e939
plan_head_after: 0c70a376
---

# Phase 109 Plan 01: Governance perm-t Unification (Client Only) Summary

One-liner: All three Governance tabs unified onto the v3.7 perm-t table idiom — SA srow cards → User/When/gutter tables, trail → Action/Target/By/When compact table, Backup/Restore gain a Granted When column at min-width:880 — zero server/API diff.

## What Was Done

- **Task 1 (tracer, 9442f800):** `superRosterView` roster + candidates srow cards → perm-t tables (mappings.js:86 recipe verbatim): named headers, `overflow-x:auto` panel wrapper, `min-width:880px`, staged inline-confirms moved one-for-one into a flex-end gutter `<td>`. Roster-first / promote-only / 2-char floor / cap-10+show-more semantics untouched. New key `superColWhen` ×5.
- **Task 2 (df23322c):** `recentHtml` srow list → compact 4-column perm-t (Action/Target/By/When) inside an overflow-x panel, no min-width. Honest-null early return verbatim (D-34); stays in the admins branch (placement pin green); zero new data-a. 4 new keys ×5.
- **Task 3 (0c70a376):** `roleTabView` gains the When column between Grants and the gutter (header `rolesColGranted` reused; cell `esc(ago(first.grantedAt))` — earliest grant per GOV-03), `min-width:760→880`. grantMeta per-grant hints unchanged inside the Grants cell. (d) thead pin re-aligned to the 4-column header.

## Verification (measured)

- **data-a: 637 unchanged, data-r: 64 unchanged, instance-roles paths: 3 (verbs 87 untouched)** — grep-verified after each task and at final; **no i18n-shell pin bump needed** (no annotation written).
- `npm run i18n:scan` clean (0 stale / 0 missing / 0 placeholder-mismatch) after every task.
- Governance suites + i18n-shell green: governance-client 22/22, governance-console 10/10, governance-tabs 9/9, i18n-shell pass; ×5 locale parity for all new keys.
- Zero diff to src/server.js / src/api.js / src/actions at every commit and at final.
- **Full suite final:** 2836 tests, 3 fails — the 2 documented pre-existing (french-typography content, webhook-routes GET list) + 1 transient (restore-overwrite.test.mjs 89-05 "the lock released" EPIPE-class flake: passes in isolation 3/3 and the sibling backup-routes suite is green; same class as the documented webhook-events flake the B1 gate tolerates ≤3).
- D-90-3/4 semantic pins passed unchanged in all suites (fixed markup, never pins).

## Deviations from Plan

**[Rule 2 — W4 key budget +1] Trail headers needed 4 new keys, not ≤2.**
- **Found during:** Task 2
- **Issue:** The plan said reuse existing `page.governance.*` keys for verb/target/actor headers; the only truthful candidates live under `page.mappings.usageCol*` (wrong page namespace — cross-page key reuse would break i18n key locality), and `rolesRecentTitle` is a section label, not a column header.
- **Fix:** Added `rolesRecentAction/Target/By/When` ×5 (Task 1 kept its savings: User + Granted headers reused existing keys). Phase total: 5 new keys vs the ≤4 hard cap — 1 over.
- **Files modified:** locales ×5 (df23322c)
- **Commit:** df23322c

**[Rule 1 — pin realignment, sanctioned by plan]** governance-console srow-shape regexes (rosterRow/candRow block matchers) and governance-tabs (d) thead regex updated same-commit as the markup they pin; semantic assertions inside those tests untouched and passing.

## Known Stubs

None — no placeholder data, no unwired components, no skipped tests.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary surface; the conversion is display markup only, every payload cell through esc() (T-79-10 discipline verified by the existing esc() backstop pins, all green).
