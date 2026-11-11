# Phase 54: Project export — Excel report, MSPDI XML and CSV - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-09
**Phase:** 54-project-export-excel-report-mspdi-xml-and-csv
**Areas discussed:** Who may export, Timeline granularity, Opt-in content shape, Artifact language & dates, Summary sheet content

---

## Who may export

| Option | Description | Selected |
|--------|-------------|----------|
| Anyone who can read it | Viewer, commenter, editor, lead, admin. Read funnel as the only gate. | |
| Editors and above | Editor/lead/admin only; treats export as data egress. | |
| Lead / admin / owner only | Reuses `canManageProject`; most members never see the control. | ✓ |

**User's choice:** Lead / admin / owner only
**Notes:** Follow-up pinned the two consequences — the control is hidden (not disabled) for non-managers, and a direct endpoint call by a reader without manage rights returns 403 + a localized toast rather than a misleading 404.

---

## Timeline granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Daily columns | Exact bar placement, matches the SPEC acceptance criterion; long projects get narrow columns. | |
| Weekly columns | 52/year, readable, but bars snap to weeks and the acceptance criterion needs amending. | |
| Adaptive (daily ≤ 90 days, weekly beyond) | Best readability at both ends; two geometry paths to build and test. | ✓ |

**User's choice:** Adaptive (daily ≤ 90 days, weekly beyond)
**Notes:** Accepted trade-off recorded in SPEC.md — on a long project bars snap to weeks. Weekly rule: a bar covers every week column containing any day of its range; a task inside one week is one column wide.

---

## Comments

| Option | Description | Selected |
|--------|-------------|----------|
| Columns on Tasks | Count + latest comment + wrapped full thread; one row per task. | ✓ |
| Comment rows under each task | Full fidelity, but breaks the one-row-per-task table shape. | |
| A separate Comments sheet | Cleanest threads, but a seventh sheet contradicts the locked workbook. | |

**User's choice:** Columns on Tasks
**Notes:** Six-sheet structure stays untouched.

---

## Subtasks

| Option | Description | Selected |
|--------|-------------|----------|
| Indented child rows | One row per subtask keyed to the parent, done state, no schedule bars. | ✓ |
| Checklist string in one cell | Compact, but not filterable or countable. | |
| Child rows with their own sub-table | Keeps the main table clean, but two tables complicate filters and frozen panes. | |

**User's choice:** Indented child rows
**Notes:** Child rows are excluded from KPI counts and charts so a parent with subtasks counts once.

---

## Artifact language & dates

| Option | Description | Selected |
|--------|-------------|----------|
| Localized headers, real dates | Headers/status/priority follow the UI language; real Excel dates in the reader's locale. | ✓ |
| All English | Maximum interop, smallest translation surface; French users get an English report. | |
| Localized headers, ISO text dates | No locale ambiguity, but loses real date cells and sorting. | |

**User's choice:** Localized headers, real dates
**Notes:** English sheet names are locked by the SPEC. User-authored text is never translated; only exporter-authored labels are localized.

---

## Summary sheet content

| Option | Description | Selected |
|--------|-------------|----------|
| Meta + counts + charts | Project meta, KPI counts, then the status and priority charts. | ✓ |
| Meta + counts + charts + attention list | Adds overdue/high-priority highlights; duplicates Tasks data. | |
| Minimal header + charts | Least noise; reader must open Tasks for any number. | |

**User's choice:** Meta + counts + charts
**Notes:** No attention block. Overdue reuses the app's `isOver` predicate against the export date.

---

## Agent's Discretion

- Filename pattern, modal layout and option ordering, endpoint method/shape and streaming, progress feedback, chart colours and axis titles, column widths and print setup, refusal/notice wording, export-model and writer module shape, weekly fixture choice.
- On Overview / Files / Activity, "current view" has no meaning — recommended default is to disable it and preselect "All tasks"; left to the planner to confirm in the plan.

## Deferred Ideas

None — discussion stayed within phase scope.