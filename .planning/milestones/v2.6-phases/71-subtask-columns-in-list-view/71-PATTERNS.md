# Phase 71: Subtask columns in List view - Pattern Map

**Mapped:** 2026-11-17
**Files analyzed:** 4 (1 feature renderer, 1 component consumer, 1 stylesheet, 1 test-extended file) + reference surfaces
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/features/subtask-popovers.js` (modify — renderer gains `columns` opt) | renderer/component | transform (model → HTML string) | itself, non-compact branch at :56 + drawer's cell markup (`src/features/subtask-detail.js:26-28`) | exact |
| `src/components/task-list.js` (modify — forward opt + `tpl` to subrows) | component | request-response (state → row HTML) | itself, parent `taskRow`/`listHtml` (:55-88) | exact |
| `src/styles/views/list.css` (modify — `.subrows`/`.subrow` grid) | component-stylesheet | — | `.subrow` itself (:127-145) + `.thead`/`.trow` grid convention in list.css | exact |
| `test/i18n-core-features.test.mjs` (extend — renderer markup pins) | test | — | existing renderer pins in same file (subTreeChecklistHtml/treeChecklist refs) | exact |

No new files are created — all four are modifications of existing analogs.

## Pattern Assignments

### `src/features/subtask-popovers.js` (renderer, transform)

**Analog:** its own non-compact branch (lines 49-64) — the EXACT markup to reuse, do not rewrite.

**Imports pattern** (lines 25-32):
```javascript
import { TODAY, diffD, esc, parse, relDate } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { ic } from '../core/icons.js';
import { S, task } from '../core/store.js';
import { avStack } from '../ui/helpers.js';          // ← add prPill (and stPill if chip uses it) here
import { orderedSiblings } from '../core/subtree.js';
import { popList, subPop } from '../overlays/popovers.js';
import { treeChecklist } from './subtasks.js';
```

**Signature + indent pattern** (lines 34-45):
```javascript
export function subTreeChecklistHtml(task0, opt = {}) {   // task0 = PARENT → task0.priority available for D-71-4
  const fx = opt.fxc || (() => '');
  const cls = opt.rowClass || 'subt';                     // D-71-6: add e.g. const cols = opt.columns; here
  ...
  const indent = `--ind:${depth * 16}px;`;                // rides --ind; MUST survive any grid change
```

**Due/start/assignees markup to hoist verbatim** (line 56, non-compact branch):
```javascript
`${due ? `<span class="due ${!s.done && diffD(parse(due), TODAY) < 0 ? 'over' : ''}"${s.due ? '' : ` data-tip="${esc(t('page.subtask.inheritedDue'))}"`}>${ic('calendar', 12)}${relDate(due)}</span>` : ''}`
// + start twin with page.subtask.inheritedStart
// + `${(s.assignees || []).length ? avStack(s.assignees, 3, 'sm') : ''}`
```
with `const due = s.due || task0.due;` (:49) — this IS D-71-5's contract, byte-identical with drawer.

**Toggle contract to preserve** (line 53):
```javascript
`<input type="checkbox" class="check" ${s.done ? 'checked' : ''} data-a="toggleSub" data-id="${tid}" data-sid="${sid}" aria-label="${s.done ? t('a11y.subtaskReopen', { title: et }) : t('a11y.subtaskComplete', { title: et })}">`
```
A status chip may wrap/restyle this input but must keep `data-a/data-id/data-sid` firing (D-71-2).

**Row container** (line 58): `<div class="${cls} ${s.done ? 'done' : ''}…${fx}…" data-ctx="sub" data-id="${tid}" data-sid="${sid}" style="${indent}">${head}</div>` — meta cells append inside this container after `${head}` when `opt.columns`.

**Board consumer that must NOT regress** (lines 70-73):
```javascript
subPop.subs = p => {
  const st = task(p.id);
  return `<div class="mh">${t('popover.subtasksOf', { title: esc(st.title) })}</div>${subTreeChecklistHtml(st, { compact: true })}`;
};
```
It passes `compact` WITHOUT `rowClass` (default `.subt`, overlays.css:265-308). Never redefine `compact` semantics — add a NEW opt (`columns: true`) per D-71-6. Add a regression pin: `subPop.subs` output contains no `c-meta` markup.

**Skeleton for the columns branch** (illustrative; planner/executor finalizes):
```javascript
// after head composition inside walk(), task0 is in scope:
const meta = opt.columns
  ? `<div class="c-meta c-status">${/* done/todo chip, keeps data-a="toggleSub" contract */''}</div>` +
    `<div class="c-meta c-assignee">${(s.assignees || []).length ? avStack(s.assignees, 3, 'sm') : `<span class="faint">${t('common.unassigned')}</span>`}</div>` +
    `<div class="c-meta c-priority">${prPill(task0.priority)}</div>` +
    `<div class="c-meta c-due">${due ? `<span class="due ${!s.done && diffD(parse(due), TODAY) < 0 ? 'over' : ''}"${s.due ? '' : ` data-tip="${esc(t('page.subtask.inheritedDue'))}"`}>${ic('calendar', 12)}${relDate(due)}</span>` : ''}</div>`
  : '';
```
Cells use the parent's `c-meta c-{name}` class convention (task-list.js:80) so existing cell CSS applies; cells are NON-interactive (`<div>`, no `data-a="pop"` — D-71-7).

### `src/components/task-list.js` (component, request-response)

**Analog:** its own `taskRow`/`listHtml` (lines 55-88) — the grid template single source of truth.

**LCOLS verbatim** (lines 18-25):
```javascript
export const LCOLS = {
  status:   [() => tMsg('page.field.status'),   '126px'],
  assignee: [() => tMsg('page.field.assignee'), '150px'],
  priority: [() => tMsg('page.field.priority'), '108px'],
  due:      [() => tMsg('page.field.due'),      '104px'],
  labels:   [() => tMsg('page.field.labels'),   '168px'],
  project:  [() => tMsg('page.field.project'),  '160px'],
};
```

**Parent meta-cell convention to mirror** (line 80):
```javascript
${cols.map(c => `<div class="c-meta c-${c === 'labels' ? 'lbl' : c}">${CELL[c](t)}</div>`).join('')}
```
Parent cells are `<button class="pillbtn" data-a="pop" …>` (lines 26-47) — subrow cells must be `<div>` wrappers WITHOUT `data-a="pop"` (D-71-7); copying `CELL[c]` verbatim would wire popovers that don't support subtask ids.

**Parent-cell composition references for the subtask equivalents:**
- Assignee (line 30-33): `mem(as[0])?.name`, `+N` suffix, `tMsg('common.unassigned')` when empty — subtask version: `avStack(s.assignees, 3, 'sm')` + unassigned faint text on empty (NOT parent's assignees, D-71-3).
- Priority (line 36): `prPill(t.priority)` — subtask version: `prPill(task0.priority)` (inherited, D-71-4).
- Due (line 39): `${ic('calendar', 13)}<span class="num">${relDate(t.due)}</span>` — subtask version: reuse the renderer's existing due markup (inherited tooltip + `.over`).

**Grid template + the gap to close** (lines 83, 86-87, 103):
```javascript
const tpl = `18px 30px minmax(220px,1fr) ${cols.map(c => LCOLS[c][1]).join(' ')} 40px`;
```
```javascript
${open ? `<div class="subrows">${treeChecklist.fn ? treeChecklist.fn(t, { compact: true, rowClass: 'subrow' }) : ''}</div>` : ''}`;
```
`--cols` is set inline per-row on `.trow` (:65) and `.thead` (:103) only — the `.subrows` div receives nothing. **Fix (mechanism A, recommended):** `taskRow` forwards the template, e.g. `<div class="subrows" style="--cols:${tpl}">${treeChecklist.fn(t, { compact: true, rowClass: 'subrow', columns: true })}</div>` — a few bytes only (chunk-gate Pitfall 3 in RESEARCH.md; task-list is CORE, headroom ~60 bytes).

**Call-site constraint — custom cols exist (VERIFIED this session):**
- `src/pages/tasks.js:28` → `{ cols: ['status', 'assignee', 'priority', 'due', 'project'] }`
- `src/pages/my-tasks.js:59` → `{ cols: ['project', 'status', 'priority', 'due'], complete: true, drag: false, keepEmpty: true }`
- `src/pages/project.js:113` → default cols.

Hard-coding the default 5-col template would misalign on tasks/my-tasks → this is why mechanism A (forward the ACTUAL `tpl`) is the analog-safe pattern. Note `my-tasks.js` has no 'assignee' column: the renderer emits all 4 cells unconditionally; alignment via `var(--cols)` keeps them in whatever tracks the parent actually shows (planner should confirm acceptable behavior on surfaces lacking a given column).

### `src/styles/views/list.css` (component-stylesheet)

**Analog:** `.subrows`/`.subrow` itself (lines 127-145) — the flat layout being replaced.

```css
.subrows {            /* :127 — free to become the grid wrapper (receives --cols inline from taskRow) */
  background: var(--sunken);
}
.subrow {             /* :130-141 */
  display: flex;      /* → becomes display:grid; grid-template-columns: var(--cols) */
  align-items: center;
  gap: 8px;
  /* Tree indent rides --ind (set inline by the renderer) ON TOP of the base —
     an inline padding-left would REPLACE the 64px base and pull children left
     of their parent. */
  padding-left: calc(64px + var(--ind, 0px));
  border-bottom: 1px solid var(--divider);
  font-size: var(--fs-sm);
}
.subrow.done span {   /* :142 — line-through bleed risk: pill/label spans inside new meta cells */
  color: var(--text-3);
  text-decoration: line-through;
}
```

**Grid-convention analog:** `.thead`/`.trow` already place children on `var(--cols)` tracks (template set inline at task-list.js:65/:103). The `.subrow` change copies that mechanism. Keep the `--ind` comment and rule; with `display:grid` verify `padding-left` + `var(--ind)` still indents depth ≥ 2 subtasks (grid + padding-left behaves differently than flex — test nesting). If indent must live on content instead, wrap head content in an element spanning `grid-column: 1 / 4` that carries the indent.

**Board popover CSS (untouched reference):** `.subt` at `src/styles/overlays.css:265-308` — flex row, `padding-left: calc(6px + var(--ind, 0px))`, `.subt .due { flex-shrink: 0 }`, `.subt .x { opacity: 0; margin-left: auto }`. Board popover keeps `compact` without `columns` → this stylesheet needs no change.

### `test/i18n-core-features.test.mjs` (test, extend)

**Analog:** existing renderer pins in the same file. Research verified the i18n catalogue gate at :218 pins exactly 1944 keys with annotated count history — any new key (e.g. `page.subtask.inheritedPriority` if the discretion adds an inherited-priority tooltip) must bump the count AND add EN+FR in the same commit.

**i18n keys — reuse, do not add (VERIFIED):**
- `page.subtask.inheritedDue`: en.json:466 / fr.json:467 ✓
- `page.subtask.done` / `page.subtask.open`: en.json:536-537 / fr.json:537-538 ✓ (used by drawer at subtask-detail.js:24)
- `common.unassigned` (used by cellAssignee, task-list.js:32) ✓

## Shared Patterns

### Event-delegation contract (`data-a`/`data-id`/`data-sid`)
**Source:** `src/features/subtask-popovers.js:53` (toggleSub), :58 (data-ctx="sub")
**Apply to:** the status chip in the columns branch — the toggle must fire through the same delegated attributes; no new wiring, no direct listeners.

### Meta-cell class convention + grid alignment
**Source:** `src/components/task-list.js:80` (`c-meta c-{name}`) and :87 (template string)
**Apply to:** renderer's 4 new cells AND the `.subrow` CSS — cells carry `c-meta c-status|c-assignee|c-priority|c-due`; alignment comes from `var(--cols)` forwarded by taskRow onto `.subrows`.

### Inherited-value affordance (`data-tip` + inheritedDue)
**Source:** `src/features/subtask-popovers.js:56` (renderer) and `src/features/subtask-detail.js:27` (drawer `title=` variant)
**Apply to:** the subrow Due cell only when `!s.due && task0.due`; overdue = `diffD(parse(due), TODAY) < 0 && !s.done` → `.over` class.

### Inheritance-for-display (parent values, no model change)
**Source:** `src/features/subtask-detail.js:27-28` (drawer already inherits due/start from `task`); model contract: subtasks carry `done`, `assignees[]`, `due`, `start` — never own status/priority.
**Apply to:** Priority cell reads `task0.priority` via `prPill`; nothing stored, no store/core changes.

### Non-interactive display cells
**Source:** parent cells at task-list.js:26-47 are `data-a="pop"` buttons — the anti-pattern for subrows.
**Apply to:** Assignees/Priority/Due subrow cells are plain `<div>`s (D-71-7); editing stays in the drawer (subtask-detail.js:26-28 pops: `subassignee`, `subdue`).

## Resolved Open Questions (from RESEARCH.md)

| # | Question | Resolution |
|---|----------|-----------|
| A1 | Does `ST` have a `todo` id? | **YES** — `src/core/constants.js:17` defines `id: 'todo'`, :35 `id: 'done'`, :41 `ST = Object.fromEntries(...)`. So `stPill(s.done ? 'done' : 'todo')` is viable (stPill = `stIcon(st)<span>${ST[st].name}</span>`, helpers.js:57). Alternative: compose from `page.subtask.done/open` keys (also verified). Planner picks. |
| A2 | Do call sites use custom cols? | **YES** — tasks.js:28 and my-tasks.js:59 pass custom `cols`; project.js:113 uses default. Confirms mechanism A (forward actual `tpl`). |

## No Analog Found

None — all modified files are direct extensions of existing verified analogs. The status chip (done/todo pill from a boolean) is the only composition without a 1:1 precedent; closest building blocks are `stPill` (helpers.js:57, now confirmed usable via ST ids) and the drawer's `page.subtask.done/open` labels (subtask-detail.js:24).

## Metadata

**Analog search scope:** `src/features/`, `src/components/`, `src/pages/`, `src/ui/`, `src/core/`, `src/styles/views/`, `src/styles/overlays.css`, `src/locales/`
**Files scanned:** 12 (all analogs verified git-tracked via `git ls-files`)
**Key verifications beyond RESEARCH.md:** ST includes `todo`/`done` ids (constants.js:17,35,41); custom-cols call sites confirmed (tasks.js:28, my-tasks.js:59); `page.subtask.done/open` keys exist EN+FR (en.json:536-537, fr.json:537-538)
**Pattern extraction date:** 2026-11-17
