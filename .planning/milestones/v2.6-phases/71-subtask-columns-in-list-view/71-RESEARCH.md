# Phase 71 — Research: Subtask columns in List view

**Date:** 2026-11-17
**Confidence:** HIGH — every file/line below was read directly in the repo this session (fresh verification, not transcribed from phase docs).
**Mode:** UI-only display change. No model, storage, route, export, or dependency changes.

---

## 1. User constraints (locked, from 71-CONTEXT.md)

| ID | Decision |
|----|----------|
| D-71-1 | Subtask rows show 4 meta columns (Status, Assignees, Priority, Due) aligned under the parent grid columns of the SAME row group. Subrow container must join the parent grid template `18px 30px minmax(220px,1fr) ${cols…} 40px`, not the flat flow. |
| D-71-2 | Status cell = chip/pill from `s.done`; stays EDITABLE inline via the existing `data-a="toggleSub" data-id data-sid` checkbox contract. No status popover. |
| D-71-3 | Assignees cell = subtask's OWN `s.assignees` via `avStack`, read-only; empty shows unassigned state (NOT the parent's). |
| D-71-4 | Priority cell = PARENT's priority, inherited display-only: `prPill(task0.priority)`. |
| D-71-5 | Due cell = `s.due || task0.due` with the existing inherited tooltip (`page.subtask.inheritedDue` when `!s.due && task0.due`) and overdue styling (`diffD(parse(due), TODAY) < 0 && !s.done` → `.over`). Read-only. |
| D-71-6 | Change lives in the SHARED renderer `subTreeChecklistHtml` as an opt-in opt (`columns: true`); `compact` semantics stay untouched so the board card popover (subPop.subs) cannot regress. Each consumer decides grid alignment. |
| D-71-7 | Only Status is interactive (toggleSub); Assignees/Priority/Due cells are non-clickable display `<div>`s — no popovers inline; open affordance (openSub via title click) unchanged. |

**Out of scope:** board subtask cards (beyond not regressing), Timeline, export channels, subtask-detail drawer, any status/priority data model change. Zero new dependencies (standing constraint).

**Agent discretion exercised (documented here):**
- **Grid alignment mechanism: A (forward the actual `tpl`)** — `taskRow` sets `--cols` on the `.subrows` div it renders, and `.subrow` becomes `display:grid; grid-template-columns: var(--cols)`. Mechanism B (hard-code LCOLS widths in CSS) is ruled out: call sites pass custom `cols` (verified below), so a hard-coded template would misalign on tasks.js and my-tasks.js.
- **Status chip visual: `stPill(s.done ? 'done' : 'todo')`** — verified viable (see §4). The chip wraps/replaces the checkbox while preserving the toggle contract.
- **Inherited priority: rendered dimmed (`class="empty"`-style faint treatment via a new `.inh` modifier class in list.css)** to signal inheritance per the D-71-4 discretion; no new i18n key needed — the dimming IS the signal. (If a tooltip is later wanted, `page.subtask.inheritedPriority` would be a new key — NOT added in this phase to keep the 1944-key catalogue gate untouched.)
- **Board popover: keeps `{ compact: true }` with no `columns` opt** — no layout hint needed; the renderer only changes behavior when `columns` is truthy.

---

## 2. Verified contracts (fresh, this session)

### 2.1 The shared renderer — `src/features/subtask-popovers.js` [src/features/subtask-popovers.js:25-64]

- Signature (:34): `export function subTreeChecklistHtml(task0, opt = {})` — `task0` is the PARENT, so `task0.priority` / `task0.due` / `task0.start` are in scope inside `walk`. **No signature change needed for inheritance.**
- Imports (:25-32): `avStack` is the only helper pulled from `../ui/helpers.js` (:29). The columns opt needs `stPill` + `prPill` added to that same import line.
- Toggle contract (:53, verbatim): `<input type="checkbox" class="check" ${s.done ? 'checked' : ''} data-a="toggleSub" data-id="${tid}" data-sid="${sid}" aria-label="${s.done ? t('a11y.subtaskReopen', …) : t('a11y.subtaskComplete', …)}">`. **The status chip must keep this input (or an equivalent that fires the same delegated attrs).**
- Compact stripping (:54-56): the non-compact branch already contains the exact due/start/assignees markup to reuse — due span with `.over` + inherited `data-tip`, start span, `avStack(s.assignees, 3, 'sm')`, and the open-details `x` button. The columns branch REUSES the due markup expression verbatim; assignees cell reuses `avStack`.
- `const due = s.due || task0.due;` (:49) — already computed; D-71-5 falls out for free.
- Row container (:58): `<div class="${cls} ${s.done ? 'done' : ''}…" data-ctx="sub" … style="${indent}">${head}</div>` — meta cells append inside this container after `${head}` when `opt.columns`.
- Indent (:45): `const indent = \`--ind:${depth * 16}px;\`` rides `--ind` on top of the CSS base padding (list.css:140 `padding-left: calc(64px + var(--ind, 0px))`). **Any grid change must preserve this.**
- Board consumer (:70-73): `subPop.subs` calls `subTreeChecklistHtml(st, { compact: true })` — no `columns`. It must stay byte-identical in output shape (regression pin).

### 2.2 The List consumer — `src/components/task-list.js` [src/components/task-list.js:12-48, 55-88]

- `LCOLS` (:18-25): status 126px, assignee 150px, priority 108px, due 104px, labels 168px, project 160px.
- `CELL` map (:48) with per-column renderers (:26-47) — all are `<button class="pillbtn" data-a="pop" …>`. **Subrow cells must NOT copy these** (popovers would receive a sid they don't support, violating D-71-7). They are `<div class="c-meta c-{name}>` wrappers with display-only content.
- Parent meta cells (:80): `${cols.map(c => `<div class="c-meta c-${c === 'labels' ? 'lbl' : c}">${CELL[c](t)}</div>`).join('')}` — the subrow cells mirror this class convention so existing `.c-meta` CSS applies.
- Grid template (:87): `` const tpl = `18px 30px minmax(220px,1fr) ${cols.map(c => LCOLS[c][1]).join(' ')} 40px` `` — set inline on `.trow` (:65) and `.thead` (:103). **The `.subrows` div at :83 receives nothing today — the gap taskRow must close.**
- Subrows call (:83): `${open ? `<div class="subrows">${treeChecklist.fn ? treeChecklist.fn(t, { compact: true, rowClass: 'subrow' }) : ''}</div>` : ''}` — the fix adds `style="--cols:${tpl}"` on the `.subrows` div and `columns: true` in the opt. `taskRow(t, cols, tpl, opt)` (:55) has `tpl` in scope — a ~40-byte change to the CORE chunk.

### 2.3 Helpers — `src/ui/helpers.js` [src/ui/helpers.js:23, 57-58]

- `export function avStack(ids, max = 3, cls = 'sm', tip = true)` (:23).
- `export const stPill = st => `${stIcon(st)}<span>${ST[st].name}</span>`;` (:57).
- `export const prPill = p => `${prIcon(p)}<span>${PR[p || 'none'].name}</span>`;` (:58) — directly usable with `task0.priority`.

### 2.4 Status ids — `src/core/constants.js` [src/core/constants.js:17, 35, 41]

`ST` contains `id: 'todo'` (:17) and `id: 'done'` (:35). So `stPill(s.done ? 'done' : 'todo')` is a valid composition for the D-71-2 chip (task statuses, reused as done/todo vocabulary). `page.subtask.done` / `page.subtask.open` labels (en.json:536-537) are a fallback, not needed.

### 2.5 Custom-cols call sites (mechanism A is mandatory) [VERIFIED via grep]

- `src/pages/tasks.js:28` → `{ cols: ['status', 'assignee', 'priority', 'due', 'project'] }`
- `src/pages/my-tasks.js:59` → `{ cols: ['project', 'status', 'priority', 'due'], complete: true, … }`
- `src/pages/project.js:113` → default cols.

Renderer emits all 4 cells unconditionally; alignment via `var(--cols)` keeps them on whatever tracks the parent actually shows. On `my-tasks.js` (no assignee column) cells flow into adjacent tracks — acceptable per D-71-6 ("each consumer decides grid alignment"); the observable contract is alignment under the parent's template, which mechanism A satisfies on every call site by construction.

### 2.6 CSS — `src/styles/views/list.css` [src/styles/views/list.css:127-145]

- `.subrows` (:127-129): `background: var(--sunken)` — free to gain the grid wrapper role.
- `.subrow` (:130-141): `display:flex; gap:8px; height:32px; padding-left: calc(64px + var(--ind, 0px)); border-bottom; font-size` — becomes `display:grid; grid-template-columns: var(--cols); align-items:center; height:auto; min-height:32px`. The `--ind` comment (:134-139) must be kept and the indent preserved: grid + `padding-left` still shifts the whole row; the head content gets `grid-column: 1 / 4` so it spans the first three tracks (handle/check/title), and the 4 meta cells land on tracks 4-7. Nested-depth testing required (grid ignores some flex assumptions).
- `.subrow.done span` (:142-145): line-throughs EVERY span — new pill text spans included. Scoped fix: exempt `.c-meta` contents (`pill` text/avatars) from the strike-through so done state reads through the status chip, not garbled pills. Decision: meta cells keep the dim color but drop `text-decoration` (`.subrow.done .c-meta span { text-decoration: none; }`) — status is already expressed by the chip.

### 2.7 i18n — reuse only [src/locales/en.json:466, 536-537]

`page.subtask.inheritedDue` (en.json:466 / fr.json:467), `page.subtask.done/open` (:536-537), `common.unassigned` all exist. **No new keys** → the 1944-key catalogue gate (test/i18n-core-features.test.mjs:218) is untouched.

### 2.8 Gates

- `npm test` grow-only from 1726 pass / 1739 total.
- `npm run lint` baseline exactly 15 pre-existing warnings (do not add).
- Chunk gate: `test/build-chunk-size.test.mjs` (runs inside `npm test`) asserts every emitted `.js` chunk ≤ 500000 bytes [test/build-chunk-size.test.mjs:20, 53]. task-list.js is CORE (entry) — the only permitted change there is the opt forwarding + `--cols` style (~40 bytes). All new markup lives in the lazy subtask-popovers chunk.
- Zero new dependencies.

---

## 3. Recommended architecture

```
taskRow(t, cols, tpl)                                   [task-list.js:55]
  └─ open ? <div class="subrows" style="--cols:${tpl}">
        └─ treeChecklist.fn(t, { compact:true, rowClass:'subrow', columns:true })
              └─ subTreeChecklistHtml(task0, opt)       [subtask-popovers.js:34]
                    └─ walk() row:
                        head (caret + toggleSub chip + openSub title)   [grid-column: 1 / 4]
                        + opt.columns && <div class="c-meta c-status">chip</div>
                        + <div class="c-meta c-assignee">avStack | unassigned</div>
                        + <div class="c-meta c-priority">prPill(task0.priority) dimmed</div>
                        + <div class="c-meta c-due">existing due markup verbatim</div>
```

- Renderer: one new opt branch; due markup hoisted verbatim from the existing non-compact expression; `stPill`/`prPill` imports added to the existing helpers import line.
- Consumer (task-list.js): 2-token-level edit on line 83 (`style="--cols:${tpl}"` + `columns: true`).
- CSS: `.subrow` flex→grid with `var(--cols)`; `.c-meta` head/column spanning rules; done-state strike-through scoped. No overlays.css change (board popover untouched).

---

## 4. ADRs

### ADR-1: Opt-in `columns` opt rather than redefining `compact` (D-71-6)
`subPop.subs` (subtask-popovers.js:70-73) passes `{ compact: true }` and its `.subt` flat layout (overlays.css) is correct as-is. Adding a separate truthy `columns` opt leaves every existing call site byte-identical. Backward-compatible by construction; regression pinned by a test asserting `subPop.subs` output contains no `c-meta`.

### ADR-2: Mechanism A — forward the ACTUAL `tpl` onto `.subrows`
Verified custom-cols call sites (§2.5) make any hard-coded template wrong on tasks.js/my-tasks.js. Forwarding `tpl` (already a parameter of `taskRow`) aligns subrow cells under whatever tracks the parent shows, on every call site, with a ~40-byte core-chunk delta — inside the gate headroom.

### ADR-3: Status chip = `stPill(s.done ? 'done' : 'todo')` wrapping the checkbox
Verified `ST` carries `todo`/`done` ids (§2.4). The chip must keep the exact `data-a="toggleSub" data-id data-sid` input (D-71-2/PATTERNS:53) — implementation: keep the `<input>` as-is (visually hidden or restyled) and render the pill so a click on the pill region toggles; simplest contract-safe form is the checkbox carrying a new `stchip` class + the pill label adjacent inside the same `.c-meta c-status` cell, with CSS making the checkbox+pill a single clickable chip. No new wiring, no new actions.

### ADR-4: Inherited priority rendered dimmed, no new i18n key
Discretion (D-71-4) resolved: `prPill(task0.priority)` inside the cell, cell carries a faint/dim modifier (`.inh` class in list.css). The dimming signals inheritance; `page.subtask.inheritedPriority` is deliberately NOT added (keeps the 1944-key gate untouched).

### ADR-5: Head content spans `grid-column: 1 / 4`
`.subrow` head (caret, toggle, title) must occupy the handle+check+title tracks so meta cells land on the status..due tracks. The row container itself stays the grid; `padding-left: calc(64px + var(--ind, 0px))` stays on the container and keeps working under grid (it shifts all tracks; verify depth ≥ 2 nesting visually — flagged for the manual check in 71-VALIDATION.md).

---

## 5. Pitfalls

1. **Do not redefine `compact`** — board popover regression (§2.1). Add `columns` as a separate opt.
2. **Do not copy `CELL[c]` into subrows** — those are `data-a="pop"` buttons bound to task-id popovers (§2.2); they'd be broken interactive cells and violate D-71-7.
3. **Chunk gate headroom** — task-list.js is CORE; entry headroom is ~60 bytes (STATE.md). Keep the task-list change to the line-83 edit only. New markup belongs in the lazy renderer chunk.
4. **`--ind` indent under grid** — grid + `padding-left` behaves differently than flex; verify nested subtasks still indent (PATTERNS/RESEARCH pitfall; manual check).
5. **`.subrow.done span` bleed** — new pill spans will be struck through; scope the selector (§2.6).
6. **i18n gate** — 1944 keys pinned (test/i18n-core-features.test.mjs:218); adding any key requires EN+FR + count bump. This phase adds none.
7. **Lint gate** — exactly 15 baseline; no new eslint findings.

---

## 6. Structure tree

```
src/
  features/subtask-popovers.js      [MODIFY :29, :52-58]  columns opt: 4 meta cells, stPill/prPill imports, due markup reuse; board consumer (:70-73) untouched
  components/task-list.js           [MODIFY :83]           forward --cols:${tpl} + columns:true (CORE chunk — minimal delta)
  styles/views/list.css             [MODIFY :127-145]      .subrow flex→grid(var(--cols)), head span 1/4, .inh dim, done-strike scope
test/
  i18n-core-features.test.mjs       [EXTEND]               pins: columns markup, toggleSub contract, priority inheritance, inherited-due tooltip + .over, board-popover regression (no c-meta)
```

No new files. All paths verified git-tracked (`git ls-files` this session).

---

## 7. Sources

- src/features/subtask-popovers.js :1-82 (read)
- src/components/task-list.js :1-119 (read)
- src/ui/helpers.js :23, :57-58 (grep-verified)
- src/core/constants.js :17, :35 (grep-verified)
- src/styles/views/list.css :120-150 (read)
- src/locales/en.json :466, :536-537 (grep-verified)
- test/i18n-core-features.test.mjs :218 (verified)
- test/build-chunk-size.test.mjs :20, :53 (grep-verified)
- .planning/phases/71-*/CONTEXT.md, RESEARCH.md, PATTERNS.md, VALIDATION.md
