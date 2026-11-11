# Phase 55: Multiple assignees per task (full parity) - Context

**Gathered:** 2026-11-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Tasks carry multiple assignees with full parity across the whole stack: the task schema
grows `assignee` → `assignees[]` with a read-time doc migration; every UI surface renders
an avatar stack (board cards, list, table, timeline, calendar, home, members, overview);
a search-modal picker replaces the single-assignee pop; filters and My-Tasks/Home/Members
membership switch to "member of the array"; the server reminder pass fans out one reminder
per assignee with their own TZ and prefs; the assignee write-guard re-derives per member;
and all three export writers carry every assignee.

Folded in (owner decision 2026-11-10): subtask start dates — `start` joins the subtask
schema with parent-start inheritance overridable per subtask (mirrors the subtask due
pattern, `page.subtask.inheritedDue`); subtask drawer gains a Start row; exports write
`s.start || t.start`. Subtasks also gain `assignees[]` with the full data shape — but no
reminder fan-out for subtask assignees this phase.

This phase does not change the permission model (per-team perms from Phase 53 are
untouched), does not add a primary-assignee concept, and does not extend reminders to
subtasks.

</domain>

<decisions>
## Implementation Decisions

### Migration shape
- **D-55-1:** The migration is **read-time normalize** — `normalizeDoc`/`mergeClientDoc`
  coerce every task to `assignees[]` on every read/write; there is no boot migration
  script and no dual-shape code. Old docs self-heal on first touch. This mirrors how
  `notifPrefs` was stripped from the document (server.js:770) and keeps the standing
  zero-DB-migrations constraint.
- **D-55-2:** An old `t.assignee` becomes **`assignees: [old]`** — the sole member of the
  array. No data is lost; reminders, history and member counts keep working. —
  **Reversibility:** one-way — after migration consumers only read the array; reverting
  to the scalar field would require another read-time migration to re-derive `assignee`.
- **D-55-3:** **Array-only reads** — no consumer keeps reading `t.assignee`; there is no
  live mirror of `assignees[0]` alongside the array. Dual fields are the divergence bug
  class empirically validated by commit 09a9c41.
- **D-55-4:** The server **enforces invariants on `assignees[]`** in normalize: dedupe
  member ids, strip nulls/non-members/out-of-scope ids, cap at 5, remove the old field
  once read. One canonical shape enforced server-side; consumers never defend
  individually.
- **D-55-5:** **Subtasks gain `assignees[]`** with the full shape, same invariants and
  same picker predicate. No reminder fan-out for subtask assignees — the reminder pass
  stays task-level, like today. — **Reversibility:** reversible — the shape mirrors the
  task field; adding reminders later is an extra loop, not a schema change.

### Picker, cap and avatars
- **D-55-6:** The single-assignee pop (`data-pop="assignee"`) is replaced by a **search
  modal** — the invite modal's chip pattern (draft persistence, search, multi-select
  chips) rather than a lightweight multi-checkbox pop. Opened from the same placements:
  board cell button, table cell, drawer field.
- **D-55-7:** **Max 5 assignees per task.** The picker blocks further adds with a hint
  (EN+FR); the server cap in D-55-4 matches. Keeps avatar stacks, reminder fan-out and
  MSPDI assignment lists bounded. — **Reversibility:** costly — the cap is encoded in the
  picker guard, the server invariant, and their tests; raising it later means re-testing
  fan-out and export shapes at the new bound.
- **D-55-8:** Avatar stacks render **first 3 avatars overlapping, then a `+N` overflow
  chip** — on board cards, list rows, table cells, timeline bars, calendar cards, home
  rows.
- **D-55-9:** The "can this assignee read the project" guard is enforced at **both
  layers**: the picker predicate (TEAM-04, store.js:514) already excludes members who
  cannot read the project, and the server re-derives the check per added member
  (`assigneeOutOfScope` extends from one assignee to every member of the array). Belt
  and braces — the guest invariant is behavior-only and every new write path re-derives
  it server-side (STATE.md pitfall 5).

### Fan-out and membership
- **D-55-10:** The reminder pass fans out by **looping assignees inside the existing
  pass** — each assignee gets their own window (their TZ), their prefs resolution, their
  `memberCanReadProject` check and their own ledger row. The `reminders_sent` key already
  contains the assignee (`ws:task:assignee:offset:due`, server.js:369), so exactly-once
  holds per member with no ledger restructure.
- **D-55-11:** **Membership means `assignees.includes(me)`** — a task with 3 assignees
  appears in all three My-Tasks views and counts once in each member's Home stats and
  Members-page counts. There is no primary-assignee concept.
- **D-55-12:** Multi-member filters use **any-of semantics** — a task matches when ANY
  selected member is in `assignees[]`. The existing single-assignee filter becomes the
  one-element case of the same filter.
- **D-55-13:** Assignment change notifications are **diff-based**: newly-added members
  get the assignment notification (today's self-notify behavior) and newly-removed
  members get notified; untouched assignees are never pinged. One comparison of previous
  vs next array.

### Exports carrying all assignees
- **D-55-14:** The XLSX/CSV Tasks sheet carries **one joined Assignees column** — member
  names comma-joined in one cell (replacing the single Assignee column). One row per task
  everywhere: Tasks, Board, Timeline, charts and KPIs all keep the row-per-task shape and
  count a shared task once (extends D-54-10).
- **D-55-15:** MSPDI carries **one Resource per member and one Assignment row per
  task×assignee pair** — the MSPDI-native shape for multi-assignment. CR-01's UID rules
  (child rows never shadow the parent; task-major assignment order) extend directly to
  the pair loop. — **Reversibility:** reversible — additive rows; dropping to
  first-assignee-only later is deleting a loop.
- **D-55-16:** The Members sheet and per-member KPI counts use **counts per member** —
  every task the member is in (`assignees.includes`) counts in their Open/Done/Total, so
  a shared task counts once per member. Consistent with D-55-11 membership semantics.
- **D-55-17:** The Board sheet assignee cell carries the **full joined list** (not the
  3-avatar + overflow rendering); Unassigned stays the existing label when `assignees`
  is empty.

### Subtask start dates (folded in)
- **D-55-18:** Subtask start inheritance **mirrors the subtask due pattern exactly** —
  `s.start || t.start`, overridable per subtask, `page.subtask.inheritedDue` gets a
  start sibling key, the subtask drawer gains a Start row, and the export model writes
  `s.start || t.start` so subtasks stop falling through to the project start date in MS
  Project.

### Agent's Discretion
Search-modal internal layout and key bindings (mirror invite modal conventions), overflow
chip styling, the exact wording of the cap hint and picker empty state, notification copy
for the removed-assignee case (reuse existing assignment-event copy patterns), the export
model's internal field shape for the array, ordering of assignees inside the array
(recommend insertion order), and how the avatar stack collapses on the narrow mobile card
layout.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase contract
- `.planning/ROADMAP.md` §Phase 55 — goal and the folded-in subtask start-date decision (owner, 2026-11-10).
- `.planning/phases/55-multiple-assignees-per-task-full-parity/55-CONTEXT.md` — this file.

### Prior decisions this phase builds on
- `.planning/phases/53-member-project-experience/53-CONTEXT.md` — per-team perms shape (`p.perms['team:'+id]`), `canManageProject` reuse; the assignee guard sits inside the same funnel.
- `.planning/phases/54-project-export-excel-report-mspdi-xml-and-csv/54-CONTEXT.md` — D-54-10 (child rows excluded from KPIs, count-once rule this phase extends), CR-01 (MSPDI UID shadowing), the DOM-free export model contract.
- `.planning/STATE.md` §Known pitfalls — funnel/mirror divergence (09a9c41), guest invariant re-derivation, full re-render wiping input (`data-in` binding checklist).

### Access model
- `docs/ProjectPermissions.md` — shipped v2.0 access model; `memberCanReadProject` semantics.
- `.planning/phases/49-visibility-model-collapse-grant-materialization/49-CONTEXT.md` — the one funnel and 404-parity convention the per-member guard must respect.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server.js:369` `reminders_sent` — ledger already keyed per (workspace, task, **assignee**, offset, due); the fan-out loop needs no schema change.
- `server.js:1622-1633` per-assignee resolution block — TZ, prefs, membership, read-check already resolve per `t.assignee`; becomes the inner-loop body.
- `server.js:1362-1365` `assigneeOutOfScope` write-guard — currently one assignee; extends to every array member.
- `src/core/store.js:514` TEAM-04 assignment-picker predicate — who may appear in the picker; reused as the search modal's candidate filter.
- `src/overlays/modals.js` invite modal chip pattern — draft persistence, search, multi-select chips; the template for D-55-6.
- `av()` avatar helper (`src/views/*.js` everywhere) — the single-render primitive; gains the stack+overflow variant.
- `export/` writers + `src/export/model.js` — DOM-free model already carries `assigneeName`; grows the array field per D-55-14.
- `src/core/store.js` `taskProg`, `isOver` — count/KPI predicates that switch to `includes` membership.
- `scripts/i18n-scan.mjs` — the prebuild gate every new key must satisfy.

### Established Patterns
- Read-time normalization in `normalizeDoc`/`mergeClientDoc` (server.js:739, 766-770) — strips invalid fields on every read; D-55-1 joins this pattern.
- Server routes go through `requireWorkspace` → project funnel; the write-guard extension stays inside it.
- Modals render from `src/overlays/modals.js` and open through the action layer — the picker modal joins that flow.
- Every keystroke-able field needs a `data-in` binding (STATE.md pitfall 4) — the picker modal and subtask Start row included.
- Zero new runtime dependencies; zero DB migrations; EN+FR i18n gate; full suite green — standing constraints.

### Integration Points
- `src/views/board.js:27`, `src/views/table.js:42-43`, `src/views/timeline.js:97,124`, `src/views/calendar.js:33,75` — the avatar-stack render sites.
- `src/pages/home.js:14,45,93`, `src/pages/my-tasks.js:14`, `src/pages/members.js:66,172,191`, `src/pages/overview.js:21` — the membership filter sites (`t.assignee === me` → `assignees.includes(me)`).
- `server.js:1740` email-mirror loop and `server.js:2112` unassign sweep — both iterate `t.assignee`; become array loops.
- `server.js:1855` task-event log — assignment logging becomes diff-based (D-55-13).
- `src/overlays/modals.js` task drawer — assignee field becomes the picker entry; subtask drawer gains Start + assignees.
- `src/core/constants.js` — any filter/sort keys for assignee stay defined there.

</code_context>

<specifics>
## Specific Ideas

- The invite modal's chip multi-select on `S.ui.inviteScope` is the interaction template the task picker should feel like — search, chips, same keyboard rhythm.
- "Full parity" means no second-class assignee: the 2nd..5th assignee gets reminders, filters, My-Tasks, exports exactly like the first. No primary/secondary split anywhere.
- The reminder fan-out should read as if the task were N separate assignments — each member's window, prefs and ledger row are fully independent.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Reminder fan-out for subtask assignees was
explicitly ruled out this phase by D-55-5; it can be a candidate if owner demand appears.)

</deferred>

---

*Phase: 55-multiple-assignees-per-task-full-parity*
*Context gathered: 2026-11-10*
