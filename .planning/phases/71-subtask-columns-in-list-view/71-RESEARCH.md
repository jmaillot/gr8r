# Phase 71: Subtask columns in List view - Research

**Researched:** 2026-11-17
**Domain:** Frontend UI — shared subtask tree renderer + List view grid alignment (vanilla JS/ESM, no framework)
**Confidence:** HIGH (every claim verified against in-repo source this session; no external packages)

## User Constraints (from 71-CONTEXT.md)

### Locked Decisions
- **D-71-1:** Subtask rows show 4 metadata columns matching the parent grid: Status, Assignees, Priority, Due — aligned under the parent columns of the SAME row group (subrow `.c-meta` cells must land in the same grid columns as the parent's `${cols.map(c => c-meta)}` cells; subrow container must join the parent's grid template `18px 30px minmax(220px,1fr) ${cols…} 40px`, not the current flat flow).
- **D-71-2:** Status cell = chip/pill derived from `s.done` (subtasks carry `done`, never a real status). Stays EDITABLE inline via existing `data-a="toggleSub" data-id data-sid` interaction. No status popover.
- **D-71-3:** Assignees cell = subtask's OWN assignees (`s.assignees`, avStack like parent's cellAssignee), read-only. Empty shows unassigned/empty state, not parent's.
- **D-71-4:** Priority cell = PARENT task's priority pill, inherited for display only (`prPill(t.priority)` style).
- **D-71-5:** Due cell = `s.due || task.due` with the EXISTING inherited-value affordance: when `!s.due && task.due` show `page.subtask.inheritedDue` tooltip; overdue styling `diffD(parse(due), TODAY) < 0 && !s.done` → `.over`. Read-only.
- **D-71-6:** Change lives in the SHARED renderer `subTreeChecklistHtml` (features/subtask-popovers.js) — compact flag must stop stripping metadata; renderer signature stays backward-compatible (opt-in opt, e.g. `columns: true`) so the board popover cannot regress. Both compact consumers get the treatment; each consumer decides grid alignment.
- **D-71-7:** Status toggle stays live (toggleSub); Assignees/Priority/Due cells NOT clickable for editing — full edit remains the subtask-detail drawer. `openSub` via title click unchanged.

### the agent's Discretion
- Exact chip/pill visual for done/todo status (reuse `stPill` conventions or lighter chip — must read as a status, not bare checkbox).
- Grid alignment mechanism (subrow joins parent grid template vs own matching template — planner picks; observable contract is column alignment).
- Whether inherited Priority renders dimmed/faint or identically — document in plan.
- How the renderer handles the board-popover layout hint (separate opt vs shared markup).

### Out of Scope
- Board subtask cards' internal layout beyond not-regressing, Timeline, export channels (xlsx/MSPDI/CSV), subtask DETAIL drawer, status/priority data model (nothing new stored).

## Summary

The phase is a pure display change across two files plus one stylesheet. Today the List view's subrows (`task-list.js:83` → `treeChecklist.fn(t, { compact: true, rowClass: 'subrow' })`) render through the shared recursive renderer `subTreeChecklistHtml` (features/subtask-popovers.js:34-64), whose compact branch at :54-56 strips ALL metadata: `(opt.compact ? '' : \`…due…start…assignees…x-button…\`)`. The `.subrow` container is a plain `display:flex` row (list.css:130-141) that does NOT join the parent `.trow` grid template — so columns cannot align without changing the subrow container's layout.

The fix decomposes cleanly: (1) the renderer gains an opt (D-71-6 suggests `columns: true`) that emits 4 metadata cells — status chip from `s.done`, `avStack(s.assignees)`, `prPill(task0.priority)` inherited, and the due cell reusing the EXISTING non-compact markup (`s.due || task0.due`, inherited tooltip, `.over` class); (2) the List consumer passes the opt and its `.subrows`/`.subrow` containers switch to `display: grid; grid-template-columns: var(--cols)`-style alignment so the subrow's meta cells land in the same tracks as the parent's `${cols.map(c => ...)}` cells (task-list.js:80, template at :87); (3) the board popover (`subPop.subs`, subtask-popovers.js:70-73) either keeps flat compact or opts in with its own wrapping layout — it must not regress.

**Primary recommendation:** Add a `columns: true` opt to `subTreeChecklistHtml` that appends `<div class="c-meta c-{status|assignee|priority|due}">…</div>` cells after the head content; in List, make `.subrow` (and an inner row element if needed) use the parent's `--cols` grid template so cells align; board popover keeps compact without `columns`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Subrow metadata cell markup | Shared renderer (features/subtask-popovers.js) | — | D-71-6: one renderer, both compact consumers; registry-loaded lazy chunk |
| Column alignment in List | List view CSS + consumer (task-list.js) | — | Consumer decides grid alignment per D-71-6 |
| Board popover layout | Board consumer (subPop.subs) | — | Own layout, must not regress |
| Status toggle interaction | Existing event delegation (`data-a="toggleSub"`) | — | No new wiring; contract already live on the checkbox |
| Data (assignees/due/priority) | Existing model | — | Nothing stored; display-only inheritance |

## In-Repo Verified Contracts (read this session)

### The renderer — `src/features/subtask-popovers.js:34-64` [VERIFIED: src/features/subtask-popovers.js:34-64]
Key verbatim facts:
- Signature: `export function subTreeChecklistHtml(task0, opt = {})` — `task0` is the PARENT task, so `task0.priority` and `task0.due` are directly available for inheritance (no signature change needed for the parent).
- Compact stripping at :54-56: `+(opt.compact ? '' : \`${due ? …inheritedDue tooltip… : ''}${st ? …inheritedStart… : ''}${(s.assignees || []).length ? avStack(s.assignees, 3, 'sm') : ''}<button class="ibtn ibtn-xs x" data-a="openSub" …>\`)` — the non-compact branch already contains the EXACT due/start/assignees markup to reuse (do not rewrite; copy or hoist into the columns branch).
- Overdue logic verbatim: `class="due ${!s.done && diffD(parse(due), TODAY) < 0 ? 'over' : ''}"${s.due ? '' : ` data-tip="${esc(t('page.subtask.inheritedDue'))}"`}>${ic('calendar', 12)}${relDate(due)}` where `const due = s.due || task0.due;` (:49).
- Status toggle contract verbatim (:53): `<input type="checkbox" class="check" ${s.done ? 'checked' : ''} data-a="toggleSub" data-id="${tid}" data-sid="${sid}" …>` — the checkbox IS the inline status control; D-71-2's "chip/pill" must preserve this exact `data-a/data-id/data-sid` contract (a pill wrapping/replacing the checkbox is fine only if the toggle action still fires).
- Row container (:58): `<div class="${cls} …" data-ctx="sub" data-id="${tid}" data-sid="${sid}" style="${indent}">${head}</div>` with `indent = \`--ind:${depth * 16}px;\`` (:45) — the indent rides `--ind` on top of the CSS base padding (list.css:138: `padding-left: calc(64px + var(--ind, 0px))`). **Pitfall: any grid change to `.subrow` must preserve `--ind` indenting, or nested subtasks lose tree alignment.**
- Board popover consumer (:70-73): `subPop.subs = p => { const st = task(p.id); return \`…${subTreeChecklistHtml(st, { compact: true })}\`; }` — passes `compact` WITHOUT `rowClass`; it uses the default `.subt` class (overlays.css:265-308). Changing `compact` behavior in place WOULD regress this surface → this is why D-71-6 demands an opt-in opt rather than redefining compact.

### The List consumer — `src/components/task-list.js` [VERIFIED: src/components/task-list.js:18-88]
- LCOLS verbatim (:18-25): `status: 126px, assignee: 150px, priority: 108px, due: 104px, labels: 168px, project: 160px` (as `[getter, width]` pairs).
- Parent row cells (:80): `${cols.map(c => \`<div class="c-meta c-${c === 'labels' ? 'lbl' : c}">\${CELL[c](t)}</div>\`).join('')}` — the subrow meta cells should mirror this `c-meta c-{name}` class convention so existing cell CSS applies.
- Grid template (:87): `` const tpl = `18px 30px minmax(220px,1fr) ${cols.map(c => LCOLS[c][1]).join(' ')} 40px`; `` — set on the `.trow` and `.thead` via `style="--cols:${tpl}"` (:65, :103). Default visible cols (:86): `['status', 'assignee', 'priority', 'due', 'labels']` — but the SUBROWS container receives only the subtask tree, not `cols`/`tpl`. **Gap the planner must address: taskRow (:83) does not forward `cols`/`tpl` into the subrows render — the renderer/consumer needs the column list (or the subrow inherits alignment purely via CSS `var(--cols)` from the `.tlist` ancestor, since `--cols` is only set per-row inline today).**
- Parent cell patterns to mirror (`CELL` map :26-48): status/assignee/priority/due are all `<button class="pillbtn …">` with popovers — for subtasks D-71-7 forbids the popover buttons; the subrow cells should be NON-interactive wrappers (e.g. `<div class="c-meta c-x">` containing the pill markup without `data-a="pop"`).
- `cellAssignee` label pattern (:30-33) is the model for the subtask assignee cell: `mem(as[0])?.name`, `+N` suffix, `common.unassigned` when empty.

### Helper primitives — `src/ui/helpers.js` [VERIFIED: src/ui/helpers.js:23,57-58]
- `export function avStack(ids, max = 3, cls = 'sm', tip = true)` (:23)
- `export const stPill = st => \`${stIcon(st)}<span>${ST[st].name}</span>\`;` (:57) — takes a STATUS id; subtasks have none, so a done/todo chip must be composed differently (e.g. `stPill(s.done ? 'done' : 'todo')` only if `ST` has a `todo` key — verify `ST` in `src/core/constants.js` before pinning; else compose `stIcon('done')` + label via `page.subtask.done`/`page.subtask.open` keys, which already exist in subtask-detail.js:24's vocabulary).
- `export const prPill = p => \`${prIcon(p)}<span>${PR[p || 'none'].name}</span>\`;` (:58) — directly usable with `task0.priority` for D-71-4.
- Also available: `relDate`, `diffD`, `parse` (imported by the renderer already from `../core/utils.js`, :25) — no new imports needed for the due cell.

### Drawer reference — `src/features/subtask-detail.js:19-31` [VERIFIED: src/features/subtask-detail.js:19-31]
The canonical EDITING surface (unchanged). Its inherited-due affordance: `${!s.due && task.due ? \`title="${esc(t('page.subtask.inheritedDue'))}"\` : ''}` (:27) and `s.due ? relDate(s.due) : task.due ? relDate(task.due) : t('common.setDate')` — same contract the renderer's non-compact branch already implements with `data-tip`.

### CSS surfaces [VERIFIED: src/styles/views/list.css:127-145, src/styles/overlays.css:265-308]
- `.subrows` (:127): just `background: var(--sunken)` — free to become the grid wrapper.
- `.subrow` (:130-141): `display:flex; gap:8px; height:32px; padding-left: calc(64px + var(--ind, 0px)); border-bottom; font-size` — the flat layout to replace/adjust. Note the comment at :135-138 documenting the `--ind` ON TOP OF base rule — keep it.
- `.subrow.done span` (:142): line-through/dim treatment for the whole row when done.
- `.subt` (overlays.css, board popover + drawer): separate flex row, `padding-left: calc(6px + var(--ind, 0px))`, `.subt .due { flex-shrink: 0 }`, `.subt .x { opacity: 0; margin-left: auto }` — untouched if the board popover keeps compact.

## Architecture Patterns

### Data flow (List subrow render)
```
taskRow(t, cols, tpl)                     [task-list.js:55]
  └─ open ? <div class="subrows">
        └─ treeChecklist.fn(t, {compact:true, rowClass:'subrow'})   [registry → lazy chunk]
              └─ subTreeChecklistHtml(task0, opt)                  [subtask-popovers.js:34]
                    └─ walk(parentId, depth) over orderedSiblings(task0.subtasks, parentId)
                          ├─ head: caret + toggleSub checkbox + openSub title button
                          └─ NEW: 4 metadata cells (status chip | avStack | prPill(parent) | due-inherited)
```
Alignment: parent `.trow` sets `--cols` inline on itself only. Two viable mechanisms (planner picks per D-71-1 discretion):
- **A (recommended):** pass the resolved template/columns into the subrows render (e.g. `taskRow` forwards `tpl` via `style="--cols:${tpl}"` on the `.subrows` div, and `.subrow` becomes `display:grid; grid-template-columns: var(--cols)` with the head content spanning the first 3 tracks via `grid-column: 1 / 4` and each meta cell in its track; trailing `40px` more-column empty). Preserves `--ind` by keeping the indent on an inner head wrapper or via `padding-left` on the grid container.
- **B:** give `.subrow` its own matching template from LCOLS widths. Fragile if the parent's visible `cols` list differs from the default (sortable/hidden-column surfaces) — verify all `listHtml` call sites for custom `opt.cols` before choosing B.

### Anti-Patterns to Avoid
- **Redefining `compact` semantics in place:** the board popover (`subPop.subs`) passes `{ compact: true }` with the default `.subt` class; stripping metadata there is currently correct per D-71-6's backward-compat clause. Add a NEW opt (`columns: true`) instead.
- **Interactive meta cells in subrows:** D-71-7 — no `data-a="pop"` buttons in subrow meta cells; copying `CELL[c]` verbatim would wire popovers that don't support subtask ids.
- **Using `stPill(ST[t.status])` with a fake status id:** subtasks carry `done` boolean only; verify what `ST`/`ST['todo']` contain in `src/core/constants.js` before composing the chip, or reuse the drawer's `page.subtask.done`/`page.subtask.open` labels.
- **Breaking the `--ind` indent:** grid containers ignore `padding-left: calc(64px + var(--ind))` differently than flex rows — test depth ≥ 2 subtasks.
- **Forgetting `.subrow.done span` styling** for the new cell contents (spans inside meta cells will be struck-through when done — check whether that is desired for pills/avatars).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Due cell + inherited tooltip + overdue | New markup | Renderer's existing non-compact branch markup (subtask-popovers.js:56) | Byte-identical contract with drawer + compact renderer already exists |
| Priority pill | Custom chip | `prPill(task0.priority)` (helpers.js:58) | Parent priority needs no derivation |
| Assignee stack | Custom avatar row | `avStack(s.assignees, 3, 'sm')` (helpers.js:23) | Same visual language as parent cell |
| Column widths | Hard-coded px | LCOLS + the `tpl` string already computed in taskRow (:87) | Single source of truth for alignment |

## Common Pitfalls

### Pitfall 1: Board popover regression
**What goes wrong:** changing `compact: true` behavior globally re-flows the board card subtasks popover.
**Avoid:** opt-in `columns` opt (D-71-6); board popover keeps `{ compact: true }` only. Add/keep a test pinning `subPop.subs` output shape.

### Pitfall 2: Grid template mismatch across `listHtml` call sites
**What goes wrong:** some surfaces may pass custom `opt.cols` (e.g. project-scoped lists with different visible columns); hard-coding the default 5-column template misaligns there.
**Avoid:** forward the ACTUAL `cols`/`tpl` from `taskRow` into the subrows render; grep all `taskRow(` / `listHtml(` call sites during planning and pin alignment against each.

### Pitfall 3: Chunk-gate headroom
**What goes wrong:** subtask-popovers is a LAZY chunk but task-list is CORE (entry); the entry gate sits at ~60 bytes headroom (499940/500000 per STATE.md).
**Avoid:** all new markup lives in the renderer (lazy chunk) and CSS files — task-list.js should only forward the opt + template string (a few bytes). No new imports in task-list.js.

### Pitfall 4: i18n catalogue-size gate
**What goes wrong:** test/i18n-core-features.test.mjs:218 pins the catalogue at exactly 1944 keys with an annotated count history — any new key (e.g. `page.subtask.inheritedPriority` if the discretion chooses an inherited-priority tooltip) must bump the count AND add EN+FR in the same commit.
**Avoid:** prefer reusing `page.subtask.inheritedDue` (exists both locales, en.json:466 / fr.json:467 [VERIFIED]) and the existing `page.subtask.done`/`page.subtask.open` labels; only add a key if the plan genuinely needs one, and update the pinned count comment.

### Pitfall 5: Done-row styling bleed
**What goes wrong:** `.subrow.done span` (list.css:142) line-throughs every span in the row — new pill text spans included, possibly avatars too.
**Avoid:** decide explicitly whether meta-cell contents get the done treatment; scope the selector if not.

## Code Examples

### Skeleton — renderer columns branch (illustrative; planner/executor finalizes)
```js
// Source: pattern from src/features/subtask-popovers.js:52-56 (existing markup reused verbatim)
// inside walk(), after head composition:
const meta = opt.columns
  ? `<div class="c-meta c-status">${/* done/todo chip, keeps data-a="toggleSub" contract */''}</div>` +
    `<div class="c-meta c-assignee">${(s.assignees || []).length ? avStack(s.assignees, 3, 'sm') : /* unassigned state */''}</div>` +
    `<div class="c-meta c-priority">${prPill(task0.priority)}</div>` +
    `<div class="c-meta c-due">${due ? `<span class="due ${!s.done && diffD(parse(due), TODAY) < 0 ? 'over' : ''}"${s.due ? '' : ` data-tip="${esc(t('page.subtask.inheritedDue'))}"`}>${ic('calendar', 12)}${relDate(due)}</span>` : ''}</div>`
  : '';
```
(Imports `prPill` must be added to subtask-popovers.js's existing `../ui/helpers.js` import line (:29).)

### Subrow alignment (List consumer)
```css
/* Source: pattern from src/styles/views/list.css:127-141 + task-list.js:87 template */
.subrows { /* receives style="--cols:${tpl}" from taskRow */ }
.subrow { display: grid; grid-template-columns: var(--cols); align-items: center;
  /* keep tree indent: either on the container as today, or move the head
     content into a wrapper spanning grid-column: 1 / 4 that carries the indent */ }
```

## State of the Art

N/A — in-repo vanilla stack, no library decisions. Renderer pattern (one recursive renderer, registry `treeChecklist.fn`, lazy chunk) established in Phase 65 and stable; this phase extends it per D-71-6.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ST` (core/constants.js) has usable `done`/`todo` keys, or the chip composes from `page.subtask.done/open` labels — NOT yet read | Code Examples / D-71-2 chip | Chip label lookup fails or renders wrong status name; executor must verify before composing |
| A2 | All `listHtml`/`taskRow` call sites use the default `cols` list or forward it — full call-site grep NOT run | Pitfall 2 | Misalignment on a surface with custom columns; run the grep in planning |
| A3 | Chunk-gate impact is negligible because task-list.js changes stay minimal — current exact headroom from STATE.md (~60 bytes) may have moved since last measure | Pitfall 3 | Gate failure at build; measure with `npm run build` gate at execution |

## Open Questions

1. **Does `ST` include a 'todo' status id?** — What we know: subtasks carry only `done` boolean (Phase 65/69 contract); `stPill` indexes `ST[st].name`. What's unclear: whether a `todo` status key exists to drive a pill, or the chip needs bespoke label composition. Recommendation: read `src/core/constants.js` in planning; prefer reusing existing keys (`page.subtask.done/open`).
2. **Which grid mechanism (A vs B)?** — What we know: parent sets `--cols` per-row inline only; `.subrows` is an unstyled sibling. Recommendation: mechanism A (forward `tpl` onto `.subrows`), because it inherits whatever columns the parent group actually shows.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — pure in-repo code/CSS change; zero new deps per standing constraint).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test suite (`test/*.test.mjs`), e2e Playwright suite |
| Config file | package.json scripts (`npm test`) |
| Quick run command | `npm test` (grow-only gate) |
| Full suite command | `npm test` + e2e suite + `npm run build` chunk gate |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| (TBD) | Subrow shows 4 meta cells aligned to parent grid | unit (renderer + markup assertions) | `npm test` | Extend `test/i18n-core-features.test.mjs` (existing subrow/renderer pins at the subTreeChecklistHtml/treeChecklist references) — planner enumerates exact new pins |
| (TBD) | Status chip toggles via toggleSub contract (`data-a/data-id/data-sid` preserved) | unit (markup contract assertion) | `npm test` | ❌ Wave: extend existing file |
| (TBD) | Priority cell renders `prPill(parent.priority)` | unit | `npm test` | ❌ Wave |
| (TBD) | Due shows `page.subtask.inheritedDue` tooltip when `!s.due && task.due`; `.over` when overdue & !done | unit | `npm test` | ❌ Wave |
| (TBD) | Board popover `subPop.subs` unchanged (no columns markup) | unit | `npm test` | ❌ Wave (regression pin) |
| (TBD) | Visual column alignment in List | e2e/manual | e2e suite | Planner decides |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** full suite + `npm run build` (chunk ≤500000) + lint (exactly 15 baseline)

### Wave 0 Gaps
- [ ] New unit pins listed above (extend existing renderer test file; grow-only from 1726 pass / 1739 total)
- None else — framework infrastructure exists.

## Security Domain

Display-only UI phase; no new inputs, routes, storage, or auth surfaces. No new dependency surface (standing zero-deps constraint). Applicable ASVS V5 (Input Validation): the new cells render model data (`s.assignees` names via `avStack`, `task0.priority` enum, `s.due`/`task0.due` dates) through existing escaping helpers (`esc`, `avStack`) — reuse them verbatim; never interpolate raw member names or dates into HTML. No ASVS V2/V3/V4/V6 surface touched.

## Sources

### Primary (HIGH confidence)
- `src/features/subtask-popovers.js` (read :1-82) — renderer, compact branch, board consumer
- `src/components/task-list.js` (read :1-312) — LCOLS, CELL, taskRow, listHtml, grid template
- `src/features/subtask-detail.js` (read :1-41) — drawer editing surface + inherited tooltips
- `src/ui/helpers.js` (:23, :57-58) — avStack, stPill, prPill
- `src/styles/views/list.css` (:127-145) — .subrows/.subrow
- `src/styles/overlays.css` (:265-308) — .subt
- `src/locales/en.json:466` / `fr.json:467` — `page.subtask.inheritedDue`
- `test/i18n-core-features.test.mjs:218` — i18n catalogue count gate
- `.planning/phases/71-…/71-CONTEXT.md`, `.planning/STATE.md` — decisions, gates

### Secondary / Tertiary
- None needed (fully in-repo research; no external docs or packages).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new stack; all primitives verified in-repo
- Architecture: HIGH — renderer/consumer split pinned by D-71-6; alignment mechanism documented with a recommendation
- Pitfalls: HIGH — all grounded in read source (board consumer, i18n gate, chunk gate, --ind rule)

**Research date:** 2026-11-17
**Valid until:** 2026-12-17 (stable in-repo domain)
