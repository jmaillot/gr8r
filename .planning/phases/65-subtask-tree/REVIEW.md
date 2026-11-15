# Phase 65: Subtask Tree — Code Review Report

**Reviewed:** 2026-11-15T00:00:00Z
**Depth:** deep (cross-file: subtree.js ↔ server.js ↔ mcp.js ↔ db-adapter.mjs ↔ views/features)
**Base:** 69d51a0 → HEAD
**Files reviewed:** 18 production files in scope (+ 12 test files spot-checked)
**Status:** issues_found — no critical, no high

## Summary

The phase implements a flat `{ id, parentId, position }` subtask tree honoring D-01..D-14. The core security posture is sound: the funnel gate (`server.js:1327-1340`) runs `validateSubtree` wholesale **before** the lazy heal, tx-atomic, mapped to 400s at `server.js:5945-5946`; the heal (`normalizeSubtasksData` → `normalizeTaskSubtasks`) re-roots every parentId that does not resolve **inside the same task's array**, killing crafted cross-task references; MCP `writeDoc` runs the identical shared gate+heal (`mcp.js:194-211`) and `mcpStripMember` now strips `assignees` arrays with spread-preserved tree fields (`mcp.js:339-355`). i18n keys exist in both catalogues (verified EN+FR: `err.subtaskCycle`, `err.subtaskDepth`, act.verb.*, popover.*, a11y.*). The removed `a11y.completeSubtask` key has zero remaining references. `hl()` escapes all three slices — no XSS via `subtaskMatch`. Depth arithmetic in `validateSubtree` correctly counts chains that terminate at a dangling parent (verified: a 6-chain ending in a dangling root is rejected at level 6, matching post-heal depth).

Findings below are correctness/robustness gaps, none ship-blocking.

## Security Mitigation Verification (claimed vs. code)

| Threat | Claimed mitigation | Verdict |
|---|---|---|
| T-65-01 (client-supplied tree shape) | Wholesale `validateSubtree` in funnel before lazy heal, tx-rollback → 400 | **VERIFIED** — `server.js:1327-1340` (gate before `normalizeSubtasksData` at 1341), `subtree.js:209-240`; self/mutual/long cycles and depth>5 all reject; junk entries and dangling parents correctly delegated to the heal |
| T-65-02 (crafted cross-task parentId) | Per-task-array normalize re-roots unresolvable parentId → null | **VERIFIED** — `subtree.js:305-306` (`resolvable` scoped to same task array), pinned by test "dangling parentId normalizes to null" |
| T-65-03 (junk positions / huge arrays DoS) | Position normalized to `Number.isSafeInteger` gate → array index; wholesale reject bounds depth | **VERIFIED** — `subtree.js:307`; array size bounded by the pre-existing `MAX_BODY` 8 MB cap (`server.js:196`); no unbounded recursion (all walks have visited-sets) |
| T-65-13 (MCP strip parity) | `mcpStripMember` strips `assignees` arrays, spread-preserves `id/parentId/position` | **VERIFIED** — `mcp.js:339-355`; the legacy dead scalar `s.assignee` check is replaced; pinned by mcp.test.mjs |

Also verified: writeDoc has its own gate (does **not** ride mergeClientDoc) — documented deviation, correctly implemented; FTS reindex on subtask retitle/delete rides the `subtaskTitleSignature` unchanged-check (`db-adapter.mjs:511-515, 604`) — D-08 honored without a sweep; FTS5 contentless remove+insert per changed row (`db-adapter.mjs:575-600`).

## Medium Issues

### M-01: Timeline nested subtask levels are unreachable — no expand affordance below level 1 (D-12)

**File:** `src/views/timeline.js:41-48, 108-118, 153-154`
**Issue:** `pushSubs` gates nested rows on `S.ui.subOpenNodes[s.id]` (`walk(s.id, depth + 1)` only fires when the map entry is truthy), but the rendered sub row (`r.type === 's'`) contains only title + assignees — no `data-a="toggleSubNode"` caret. `S.ui.subOpenNodes` is never populated from the timeline, so depth-2+ subtask bars can never be displayed. D-12 says subtask bars are "collapsible"; collapse works at the top level only (via `expandRow`), expand does not exist below it. The control exists (`A.toggleSubNode`, `subTreeChecklistHtml` renders one) — the timeline row simply omits it.
**Fix:**
```js
// in the r.type === 's' label row, before the title span:
const kids = orderedSiblings(r.t.subtasks, r.s.id);
`${kids.length ? `<span class="ibtn ibtn-xs" data-a="toggleSubNode" data-id="${r.t.id}" data-sid="${r.s.id}" aria-expanded="${!!S.ui.subOpenNodes[r.s.id]}">${ic(S.ui.subOpenNodes[r.s.id] ? 'chevron-down' : 'chevron-right', 12)}</span>` : ''}`
```

### M-02: Silent empty render on lazy-chunk load failure — user can add subtasks they cannot see

**Files:** `src/overlays/drawer.js:20-24, 87-89`; `src/overlays/popovers.js:32, 205, 214`; `src/components/task-list.js:85`; `src/features/subtasks.js:16`
**Issue:** Every tree surface renders through the `treeChecklist.fn` / `subPop.*` / `subDetailMod` registries populated by dynamic imports that end in `.catch(() => {})`. If the chunk fetch fails (offline flake, deploy race, blocked asset), the drawer checklist, list subrows, board checklist popover, re-parent picker and subtask detail view all render as empty strings — permanently for the session, with no retry and no error surfaced. The `addSub` input still works, so the user creates subtasks that render nowhere. A registry miss is indistinguishable from "no subtasks" in the drawer header (`${lsd}/${leaves.length}` still renders).
**Fix:** on `.catch`, set a flag (e.g. `treeChecklist.failed = true`) and have consumers render a minimal flat fallback (the pre-65 flat row renderer) plus a retry; at minimum, retry the import on next `render()` instead of caching the failure.

## Low Issues

### L-01: `orderedSiblingsOf` duplicates `orderedSiblings` with drift-prone coercion differences

**File:** `src/features/subtask-move.js:83-85`
**Issue:** Reimplements the shared comparator with `x.parentId ?? null` and `a.position ?? 0` fallbacks — the module already imports `nextPosition`/`validateMove` from `subtree.js`, so there is no import-cost reason. Violates the module's own "one definition of ordering (D-03)" rule; the `?? 0` fallback silently treats junk positions as 0 where the shared code would rely on the heal.
**Fix:** delete `orderedSiblingsOf` and call `orderedSiblings(t.subtasks, s.parentId ?? null)` (post-heal parentId is always null or a string, so the coercion is safe).

### L-02: Duplicate subtask ids are neither rejected nor normalized

**File:** `src/core/subtree.js:209-240, 292-310`
**Issue:** A crafted doc with two entries sharing an `id` passes `validateSubtree` (the `byId` map is last-wins) and survives the heal. Consequences: `descendantsOf` can emit both, cascade marks both, `buildTree` merges them under one map key — render/cascade ambiguity. Not a security boundary (same-task, permission-gated), but a cheap invariant to enforce given the tx-atomic reject contract.
**Fix:** in `validateSubtree`, `if (byId.size !== entries.length) return { code: 'subtaskCycle' }` (or a dedicated `subtaskShape` code with catalogue entries).

### L-03: Strict-vs-loose `parentId` comparison inconsistency across helpers

**File:** `src/core/subtree.js:26` vs `:103`
**Issue:** `orderedSiblings` matches roots with strict `s.parentId === parentId` (so a `parentId: undefined` entry from a pre-65 localStorage cache matches nothing and vanishes from tree rendering), while `buildTree` uses loose `n.parentId != null` (undefined counts as root). Post-heal the shapes are canonical, so this only bites offline/legacy local state before the first server sync heals it.
**Fix:** normalize the read side once — `const pid = s.parentId ?? null` in `orderedSiblings` (or match `cur` with `?? null` at the call site).

### L-04: Unbounded `subtaskMatch` string in the search API response

**File:** `server.js:5844-5859`
**Issue:** The first matching subtask title is echoed at full length. Titles are user-controlled and untruncated here (unlike task title's 120-char rule). Rendered through `hl()` → escaped client-side, so no XSS — just an unnecessary payload/spot-consumption vector for an 8 MB-doc owner.
**Fix:** `subtaskMatch = title.slice(0, 120)`.

### L-05: Timeline sub bar degenerates when neither the subtask nor the task has dates

**File:** `src/views/timeline.js:109-113`
**Issue:** `sdue = s.due || t.due` can be `undefined`; `s0` then becomes `undefined`, `X(undefined)`/`diffD(parse(undefined), …)` produce `NaN` left/width (renders a stray bar at NaN position). This mirrors the pre-existing task-bar pattern (same NaN behavior for dateless tasks), so it is consistency, not a regression — but subtasks inherit `null` dates far more often than tasks, since D-12 inheritance only applies when the parent has dates.
**Fix:** skip the bar (emit only the row background) when `!sdue`, matching how milestone/dep paths guard.

## Info

- `IN-01` — `src/core/store.js:499-507` / `src/export/model.js:46-56`: the deliberate duplicate `rollupProgress` copy in model.js is equivalence-pinned by tests — accepted deviation, no action.
- `IN-02` — `src/actions/actions.js:215-222, 1104-1117`: D-14 cascade and D-13 non-cascade are correctly implemented on the shared `applyPatch` path (all completion routes — `toggleDone`, `updateTask`, drag-drop, bulk — funnel through it). Verified no second completion path bypasses the cascade.
- `IN-03` — `src/features/subtask-move.js:12-13`: `import('../features/subtask-move.js').catch(() => {})` pre-warm silently swallows failure; handlers assigned on a lazy chunk may be undefined at first click if the fetch is slow — event delegation resolves `A[act]` at click time, so the pre-warm race is benign unless the chunk *fails* (covered by M-02).

## Verdict

**PASS** — no critical or high findings. 2 medium (M-01 timeline nested-expand gap, M-02 silent chunk-failure degradation), 5 low, 3 info. All four claimed security mitigations (T-65-01/02/03/13) verified present and correct in code, with test coverage.

---

_Reviewed: 2026-11-15_
_Reviewer: gsd-code-reviewer subagent_
_Depth: deep_
