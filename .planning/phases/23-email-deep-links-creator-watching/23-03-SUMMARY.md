---
phase: 23-email-deep-links-creator-watching
plan: 03
subsystem: notifications
tags: [watchers, notifications, creator, LINK-03]
requires: [P4-d/e watcher model, notifyMembers double exclusion]
provides: [task.creator field, creator in taskWatchers]
affects: [notification fan-out for status updates and comments]
tech-stack:
  added: []
  patterns: [computed watcher Set (add-alongside, no stored union), doc-level node:test with global stubs]
key-files:
  created: [test/creator-watcher.test.mjs]
  modified: [src/actions/actions.js]
decisions:
  - Creator added to the computed watcher set (add-alongside P4-d/e model), not stored as a separate union — per 23-CONTEXT.md discretion
  - No backfill for legacy tasks — filter(Boolean) tolerates undefined creator
metrics:
  duration: 2 min
  completed: 2026-10-30
status: complete
actuals:
  tokens: 29000
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 39395057e8cf4423dfe49991469a5faa256e59de
plan_head_after: bf9806600c8f5619d3c73686f6f226feba7eef72
---

# Phase 23 Plan 03: Creator Watching Summary

Task creator stored at creation (`creator: D().me`) and joined into the computed watcher set (assignee + creator + commenters), deduped, legacy-safe, self-excluded — LINK-03/D-05.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (RED) | Failing creator-watcher tests | 4320ffd | test/creator-watcher.test.mjs |
| 1 (GREEN) | Creator at creation + in taskWatchers | bf98066 | src/actions/actions.js |
| 2 | Full-suite regression check | (verification only — no code change) | — |

## TDD Cycle

- **RED:** `test/creator-watcher.test.mjs` — 5 behavior cases; ran `node --test --test-reporter=tap` → 5 tests, 2 fail (creator field absent, watchers omit creator), 3 pass (regression pins for dedup/legacy/self-exclusion, green pre-implementation). RED evidence verified: `gsd_run check tdd-red-evidence` → `RED_EVIDENCE_OK`.
- **GREEN:** Minimal change — `creator: D().me` in the createTask defaults literal; `t.creator` added to the taskWatchers Set input between assignee and the commenters spread; both filters (`filter(Boolean)`, `x !== D().me`) untouched.
- **REFACTOR:** None needed — implementation landed minimal.

## Verification

- `node --test test/creator-watcher.test.mjs` — 5/5 pass (all five behavior cases: creator recorded, creator in watchers, creator===assignee dedup to one entry, legacy task without creator tolerates, actor never in own watcher output)
- `npm test` — 580/580 pass, 0 failures (no regression in watcher/notification suites; no existing test asserted the exact watcher list, so no expectation updates were needed)

## Deviations from Plan

None — plan executed exactly as written. (gsd_run CLI located at `/home/jmaillot/.config/opencode/gsd-core/bin/gsd_run` rather than on PATH; command executed with full path.)

## Threat Model Notes

- T-23-04 (self-notification): mitigated — double exclusion retained verbatim; test 5 asserts zero self-rows client-side, server-side `n.by === n.to` layer untouched.
- T-23-SC: not applicable — zero runtime dependencies added.

## Self-Check: PASSED

- test/creator-watcher.test.mjs exists ✓
- src/actions/actions.js carries creator field + watcher inclusion ✓
- Commits 4320ffd, bf98066 present in git log ✓
