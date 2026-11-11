---
phase: 55-multiple-assignees-per-task-full-parity
plan: 07
subsystem: ui-render
tags: [avatars, avStack, render-parity, css]
requires: [avStack helper (55-01), picker modal wiring (55-04), subtask assignees + drawer rows (55-06)]
provides: [avatar-stack rendering at every assignee display surface (D-55-8), overflow-chip tooltip with remaining member names]
affects: []
tech-stack:
  added: []
  patterns: [single-helper extension (avStack) instead of per-site copies]
key-files:
  created: []
  modified:
    - src/ui/helpers.js
    - src/components/task-list.js
    - src/views/table.js
    - src/views/board.js
    - src/views/timeline.js
    - src/views/calendar.js
    - src/pages/home.js
    - src/pages/search.js
    - src/overlays/popovers.js
    - src/styles/components.css
decisions:
  - avStack(ids, max=3, cls, tip) extended once — empty array falls back to the empty avatar so every site keeps its existing no-assignee rendering; overflow chip tooltip is always on (only place hidden members are discoverable), `tip` gates per-avatar tooltips for tight surfaces
  - assignee cells (cellAssignee, table cell, mobile card) show stack + first name `+N`, mirroring the 55-06 subtask pattern; picker button wiring from 55-04 untouched
metrics:
  duration: ~25 min
  completed: 2026-11-10
status: complete
actuals:
  tokens: 5300
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 44c8951
plan_head_after: 293b313
---

# Phase 55 Plan 07: Avatar stacks at every assignee render site Summary

**One-liner:** avStack(ids, 3) with an always-on overflow-chip tooltip replaces every scalar `av(t.assignee, …)` render across board/table/timeline/calendar/task-list/home/search/recents, with the 55-04 picker wiring and empty-assignee behavior preserved.

## What Was Done

### Task 1 — avStack(ids, 3) at all render sites (tracer, D-55-8) — `0196265`
- `src/ui/helpers.js` avStack extended (one helper, no per-site copies): default max 4 → **3** (D-55-8), `tip` parameter, empty array → `av(null)` (existing Unassigned rendering), overflow chip carries `data-tip` with the comma-joined names of the remaining members.
- Render sites converted (grep `avStack(` — 13 task-assignee call sites + the 55-06 subtask sites):
  - board card cell button (`src/views/board.js:27`) — button/picker wiring kept, inner markup swapped
  - table cell (`src/views/table.js:43`) and mobile card (`~:90`) — stack + first name `+N` label
  - timeline bar (`~:97`) and list row (`~:124`) — refs moved from planned 97/124, verified before edit
  - calendar day card (`~:33`) and week card (`~:75`)
  - `cellAssignee` (`src/components/task-list.js:29`) — feeds drawer field, inbox row AND table via CELL map; plus mobile row (`~:293`)
  - home task rows (`src/pages/home.js:93`) — was rendering only `assignees[0]`, now the full stack
  - search results (`src/pages/search.js:58`), recents popover (`src/overlays/popovers.js:~355`)
- Scalar-render sweep: `grep -rn "av(t\.assignee\|av(s\.assignee" src/` → **empty**.

**Tracer feedback gate:** re-ran the full `<verify>` end-to-end after all edits — node --check ×10, grep sweep empty, `npm test` 1382 pass / 0 fail. ⚡ Verified — expanded to Task 2.

### Task 2 — Stack CSS audit + narrow-card collapse (A1) — `293b313`
- Audited `.avs` overlap (`margin-left:-5px`), `.more` chip ring (`box-shadow` from `.av`), and the `[data-tip]` ::after tooltip system against all dense contexts — no z-index or clipping regressions (avatar boxes are not inside overflow-hidden ancestors; mobile calendar already hides `.cev .av`, which covers stack avatars).
- Narrow mobile card (`.only-m`): added `.only-m .avs .av + .av { margin-left:-4px }` — same 3+overflow shape, tighter overlap, no new component.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stale plan refs corrected by verification (no code deviation)**
- **Found during:** Task 1
- **Issue:** Plan cited drawer.js:79/105 (105 already converted by 55-06), popovers.js:382 (actual recents site ~:355), task-list.js:291 (actual ~:293). Also home.js:93 rendered `av(t.assignees?.[0])`, not the scalar the plan expected.
- **Fix:** Every ref re-verified before editing; the home.js first-assignee render was converted to the full stack (plan intent). No ref-driven edits made blind.
- **Files modified:** as listed above.

**2. [Rule 1 - Bug] Unused `av` import in home.js after conversion (lint)**
- **Fix:** removed from the import list.
- **Commit:** 0196265

## Verification

- `node --check` on all 9 touched JS files — pass
- `npm test` — **1382 pass, 0 fail** (11 skipped, pre-existing)
- `npm run lint` — **fails with 55 pre-existing errors, none in 55-07 files** (db-adapter.mjs, mailer.js, server.js, e2e/, export/xlsx.js, 15 test files; `no-undef` process/console + unused vars). ESLint over the ten touched source files is clean. Logged to deferred-items.md per scope boundary.
- `grep -rn "av(t\.assignee\|av(s\.assignee" src/` — empty

## Known Stubs

None — all render sites are wired to the live `assignees[]` array.

## Threat Flags

None — render-only plan; the overflow tooltip (T-55-08, accept) exposes member names already visible via project membership, same surface as per-avatar tooltips.
