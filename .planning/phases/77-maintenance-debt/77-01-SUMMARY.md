---
phase: 77-maintenance-debt
plan: 01
subsystem: lint
tags: [lint, dead-code, eslint-config, maintenance]
requires: []
provides: ["lint-clean repo (npm run lint exit 0)", "MAINT-01 satisfied"]
affects: ["77-02 (advisory fixes)", "77-03 (locale e2e)"]
tech-stack:
  added: []
  patterns: ["file-grouped lint commits (D-77-1)", "delete-outright with hazard-site restructuring (D-77-2)"]
key-files:
  created: []
  modified:
    - eslint.config.js
    - server.js
    - src/components/task-list.js
    - src/features/subtask-detail.js
    - src/overlays/drawer.js
    - e2e/mobile-card-hidden.spec.mjs
    - e2e/subtask-align.spec.mjs
    - test/email-outbox.test.mjs
    - test/mcp.test.mjs
    - test/pwa-banner.test.mjs
    - test/subtask-tree.test.mjs
    - test/visibility-team.test.mjs
decisions:
  - "orderedSiblings at task-list.js:10 was an unused import binding (not a function param as the plan wording suggested) — removed from the import; call sites elsewhere use subtree.js's export directly"
  - "no-useless-assignment sites (mcp.test.mjs ×2, visibility-team) fixed by dropping the dead null initial (`let data;`) rather than removing the binding — try/catch reassignment structure preserved verbatim"
metrics:
  duration: ~20 min
  completed: 2026-11-19
status: complete
commits: 3
plan_head_before: ba1a0dec
plan_head_after: dc360606
actuals:
  tokens: 18000
  tasks: 3
  commits: 3
---

# Phase 77 Plan 01: Lint Cleanup Summary

All 17 live eslint errors fixed: 2 no-undef files resolved config-only via the eslint.config.js Node-globals block (D-77-3), 15 unused-var/useless-assignment sites deleted or restructured in code across 11 files (D-77-2), zero eslint-disable comments introduced — `npm run lint` exits 0 and the full suite (1846 pass / 0 fail / 13 skipped) is green after every commit-group.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | no-undef pair via eslint.config.js Node-globals block (D-77-3) | a39dd41e | eslint.config.js |
| 2 | Delete unused code in live source (D-77-2) | d509f39c | server.js, src/components/task-list.js, src/features/subtask-detail.js, src/overlays/drawer.js |
| 3 | Test/e2e lint sites — restructure, never blind-delete | dc360606 | e2e/mobile-card-hidden.spec.mjs, e2e/subtask-align.spec.mjs, test/email-outbox.test.mjs, test/mcp.test.mjs, test/pwa-banner.test.mjs, test/subtask-tree.test.mjs, test/visibility-team.test.mjs |

## Must-Haves Verification

| Truth | Result |
| ----- | ------ |
| `npm run lint` exits 0 with zero errors (SC1) | ✅ PASS — `npx eslint .` silent, exit 0 |
| Zero eslint-disable introduced; count stays at baseline 5 (SC1/D-77-3) | ✅ PASS — `git grep "eslint-disable" -- '*.js' '*.mjs'` = 5 (mailer.js:57, server.js:8438, test/subject-encode.test.mjs:125/142/187), all untouched; plan diff adds none |
| Full `npm test` green after every commit-group (SC4) | ✅ PASS — 1846 pass / 0 fail / 13 skipped, run after each of the 3 commit-groups |
| Every deletion removed genuinely dead code (typescript-eslint #3456 hazard) | ✅ PASS — hazard site email-outbox:284 restructured to bare `await makeDigestFixture(...)` (fixture call still runs); no-useless-assignment sites restructured (`let data;` / `let parsed;`), never statement-deleted |

| Artifact | Result |
| -------- | ------ |
| eslint.config.js Node-globals block extended with webhook-formats.js + webhook-ssrf.js | ✅ PASS — both in the `files:` array with a comment noting standalone root-level scripts; zero code changes to either script (`node webhook-formats.js --help` exit 0) |
| All 15 unused-var/useless-assignment sites fixed in code across 11 files | ✅ PASS — WEBHOOK_MAX_ATTEMPTS deleted (sibling WEBHOOK_RETENTION_MS intact at server.js:2629, still used at :2905/:3016/:3113), orderedSiblings/TODAY/diffD/parse/relDate/avStack imports dropped, 'plain' locator deleted, 'c' param removed, dead initials dropped |

## Deviations from Plan

1. **[Clarification, not a deviation] task-list.js:10 site type** — the plan said "remove the unused `orderedSiblings` parameter from the function signature"; the site is actually an unused **import binding** (`import { leafEntries, orderedSiblings } from '../core/subtree.js'`). Same fix intent: removed the binding from the import. The subtree.js export and its other consumers (context-menu.js) are untouched.
2. **[Clarification, not a deviation] server.js disable line number** — the pre-existing disable sits at server.js:8438 (plan said 8439; trivial drift from the WEBHOOK_MAX_ATTEMPTS deletion). Same line, untouched.
3. **[Clarification, not a deviation] no-useless-assignment fix shape** — plan allowed "remove the dead initial assignment or restructure"; used `let x;` (keep declaration, drop the initializer) so the try/catch reassignment structure stays byte-identical otherwise.

No auto-fixed bugs, no auth gates, no architectural deviations.

## Commits

- a39dd41e: chore(77-01): add webhook-formats.js and webhook-ssrf.js to eslint Node-globals block
- d509f39c: refactor(77-01): delete dead code in live source (D-77-2)
- dc360606: refactor(77-01): fix remaining test/e2e lint sites, restructuring hazard sites (D-77-2)

## Requirements

- MAINT-01: ✅ satisfied (SC1: lint exit 0, zero suppressions introduced; SC4: suite green per commit-group)

## Self-Check: PASSED

- All 3 commits present on main (a39dd41e, d509f39c, dc360606)
- All 12 modified files committed; working tree clean except untracked .planning phase artifact (77-PATTERNS.md, planning-owned)
