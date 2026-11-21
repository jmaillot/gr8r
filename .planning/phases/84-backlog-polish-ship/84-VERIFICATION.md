---
phase: 84-backlog-polish-ship
verified: 2026-11-21T11:30:00Z
status: passed
score: 12/12 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - .planning/phases/84-backlog-polish-ship/84-01-PLAN.md
  - .planning/phases/84-backlog-polish-ship/84-02-PLAN.md
  - .planning/phases/84-backlog-polish-ship/84-03-PLAN.md
  - .planning/phases/84-backlog-polish-ship/84-04-PLAN.md
  - .planning/phases/84-backlog-polish-ship/84-01-SUMMARY.md
  - .planning/phases/84-backlog-polish-ship/84-02-SUMMARY.md
  - .planning/phases/84-backlog-polish-ship/84-03-SUMMARY.md
  - .planning/phases/84-backlog-polish-ship/84-04-SUMMARY.md
  - e2e/invite.spec.mjs
  - e2e/locale-refusal.spec.mjs
  - e2e/await-access.spec.mjs
  - e2e/demo-locale.spec.mjs
  - src/features/team-pick.js
  - src/actions/actions.js
  - src/pages/governance.js
  - server.js
  - docs/DEPLOY.md
  - CHANGELOG.md
  - package.json
  - test/build-chunk-size.test.mjs
  - test/super-access.test.mjs
covered_digest: "v2:sha256:84verif-manual-goal-backward-20261121"
requirements:
  - { id: BP-01, source_plan: 84-02-PLAN.md, status: satisfied, evidence: "team-pick.js lazy chunk + both surfaces (actions.js teamPickOpen/Toggle/Add; invite POST shape verbatim at :2302/:2426); UAT tests 1-2 PASS (owner, 2026-11-21)" }
  - { id: BP-02, source_plan: 84-01-PLAN.md, status: satisfied, evidence: "ship-gate e2e 145 passed / 0 failed / 0 skipped (7.3m, /tmp/opencode/e2e-gate6.log); zero test.skip/fixme debt waivers in specs (demo-locale's skip is the documented env-gated demo-mode carve-out, D-04); 84-01 triple-green 155/155 x3 (D-06)" }
  - { id: BP-03, source_plan: 84-03-PLAN.md, status: satisfied, evidence: "hide-m columns fix (board.css sibling pattern), 390x844 sweep pinned green (zero overflow dashboard/members/governance), mobile e2e specs (262607e3); UAT tests 3-4 PASS" }
  - { id: IN-01, source_plan: 84-03-PLAN.md, status: satisfied, evidence: "server.js:7277 rename UPDATE carries updated_at = now(); GV-01 unit pin extended" }
  - { id: IN-02, source_plan: 84-02-PLAN.md, status: satisfied, evidence: "derived i18n parity test replaces the 2030 pin (e81a96e6); 40-key fr allow-list per D-12; i18n suite 37/37 green post-Super-Admin rename" }
  - { id: D-11, source_plan: 84-04-PLAN.md, status: satisfied, evidence: "package.json 3.2.0 (programmatic assert exit 0) committed as ship commit 4cf10d42 after the green gate" }
must_haves:
  - { truth: "All 4 failing e2e specs pass with original assertions intact (D-05)", status: verified, evidence: "84-01 commit 86df8df0 diff: 0 assertion deletions (security audit T-84-01); triple-green 155/155 x3" }
  - { truth: "Full e2e suite green with zero waiver debt (D-04)", status: verified, evidence: "ship gate 145 passed / 0 failed / 0 skipped (gate6); only conditional skip = demo-locale env gate (documented D-04 carve-out)" }
  - { truth: "Hardened flows 2FA spec passes 3 consecutive full runs (D-06/D-14)", status: verified, evidence: "84-01-SUMMARY: 155/155 x3 with TOTP-window classification documented" }
  - { truth: "Both picker surfaces are searchable modals, chips multi-add (D-01/02/03)", status: verified, evidence: "team-pick.js (clone of 55-04 assignee modal, esc() on all interpolations); UAT tests 1-2 PASS (owner session incl. keyboard flow)" }
  - { truth: "Invite POST body shape unchanged + inviteDraft binding intact", status: verified, evidence: "grep: [...new Set(S.ui.inviteTeams || [])] verbatim at actions.js:2302/:2426 (T-84-04 evidence)" }
  - { truth: "No chunk exceeds 500 kB", status: verified, evidence: "build-chunk-size.test.mjs 12/12 green; largest entry chunk 328.89 kB (build log)" }
  - { truth: "Columns button functional at phone viewport, label collapsed", status: verified, evidence: "84-03 hide-m fix + mobile e2e specs green; UAT test 3 PASS (owner, FR walkthrough)" }
  - { truth: "Dashboard/members/governance no horizontal overflow at 390x844 (D-07)", status: verified, evidence: "expect.poll sweep pinned zero overflow; UAT test 4 PASS" }
  - { truth: "Rename UPDATE stamps updated_at = now() (IN-01)", status: verified, evidence: "server.js:7277 parameterized UPDATE with now(); GV-01 pin" }
  - { truth: "i18n derived check green with picker keys included", status: verified, evidence: "i18n-core-features + build-locales 37/37 green at every commit touching locales (incl. Super-Admin rename 18b75806)" }
  - { truth: "DEPLOY.md documents all four Entra group-mapping topics (D-09)", status: verified, evidence: "grep counts: ApplicationGroup/overage/dead-mapping/old-slug = 14 hits; UAT test 5 PASS" }
  - { truth: "CHANGELOG backfilled 3.0.0/3.1.0 + 3.2.0 entry; package.json 3.2.0 (D-11/D-13)", status: verified, evidence: "three dated entries above 2.6.0 (checkpoint-ratified); version assert exit 0; ship commit 4cf10d42" }
behavior_unverified_items: []
overrides: []
notes:
  - "Ship gate (145/145) predates the post-phase quick-tasks (super-access 6ab89e63, me() crash fix 18b75806 + Super-Admin rename, SUPER_ACCESS gate 6b4aa830). Those carry their own green suites (super-access 8/8, full unit 2050/0, i18n 37/37) but the full e2e has NOT been re-run after them — flagged as a milestone-level consideration, not a phase-84 gap: the quick-tasks were owner-requested post-ship work, not phase-84 scope."
  - "Known pre-existing flake documented in 84-01/execution: admin-revoke-cycle fr honest-teardown miss (~1-in-5) — spec untouched, not a phase-84 regression."
  - "Owner UAT 84: 6/6 PASS (2026-11-21, commit 0f37e693) — includes the picker keyboard smoke item deferred from 84-02."
---

# Phase 84 — Verification

**Status: PASSED** — 12/12 must-haves verified against the live tree (2026-11-21).

## Method

Goal-backward: each plan's must-have truth was re-verified against the shipped code (commit diffs, programmatic asserts, suite logs, owner UAT results) — not taken from summary claims. Full evidence table in the frontmatter `must_haves` array.

## Requirements coverage

| Req | Status | Evidence anchor |
|-----|--------|-----------------|
| BP-01 | satisfied | pickers on both surfaces + UAT 1-2 |
| BP-02 | satisfied | ship gate 145/0/0, zero waivers |
| BP-03 | satisfied | hide-m + sweep + UAT 3-4 |
| IN-01 | satisfied | server.js:7277 + GV-01 pin |
| IN-02 | satisfied | derived parity test + 40-key allow-list |
| D-11 | satisfied | 3.2.0 ship commit after green gate |

## Post-ship quick-tasks (out of phase scope, flagged for the milestone audit)

1. **Operator super-access** (6ab89e63) + me() crash fix / Super-Admin rename (18b75806) + **SUPER_ACCESS env gate** (6b4aa830, 39d69094, c6514542). Own suites green (8/8 HTTP; 2050/0 unit; 87 pass client/i18n). Full e2e not re-run post-quick-tasks.
2. Pre-existing flake: admin-revoke-cycle fr (~1-in-5) — documented, untouched.
