# Phase 66: Task & Project Templates - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-15
**Phase:** 66-Task & Project Templates
**Areas discussed:** Template storage, Offset date semantics, Template management UX, Project template content

---

## Template storage

| Option | Description | Selected |
|--------|-------------|----------|
| Workspace doc | `doc.templates[]` via mergeClientDoc whitelist; reuses funnel, revisions, client mirror; no new API | ✓ |
| Server mirror table | saved_views-style table with own CRUD API; keeps churn out of doc sync; cost: new routes + SQLite+pg mirror | |

| Option | Description | Selected |
|--------|-------------|----------|
| position field | Explicit `position` integer per template, ties normalized by funnel (D-03 precedent) | ✓ |
| Array order | Picker order = array order; moves rewrite siblings — the Phase 65 amendment concern | |

| Option | Description | Selected |
|--------|-------------|----------|
| Kind-specific body | Separate task vs project body schemas; sanitizer whitelists per kind | ✓ |
| Unified body | One generic body schema; weaker guarantees | |

**User's choice:** Workspace doc; position field; kind-specific body
**Notes:** User selected "Shape + ordering" for the rules question; permissions on create/edit/delete and instance linkage were not asked (user moved on) — left to agent discretion/research.

---

## Offset date semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Instantiation day | due = instantiate day + offset; no extra input | ✓ |
| User-picked start | User picks a start date per instantiation | |
| Template-declared anchor | Template carries its own anchor field | |

| Option | Description | Selected |
|--------|-------------|----------|
| Calendar days | Plain calendar days, matches ISO-day date handling | ✓ |
| Business days | Skip weekends/holidays — new scope (holiday calendars) | |
| Calendar now, defer business | Calendar days with a future per-template business-day flag | |

| Option | Description | Selected |
|--------|-------------|----------|
| Anchor to instantiation | Subtask offsets absolute, anchored to instantiation day | ✓ |
| Chain off parent | Subtask offsets relative to parent due date | |

| Option | Description | Selected |
|--------|-------------|----------|
| As computed | Negative/zero allowed; missing offset = no due date; no clamping | ✓ |
| Clamp to today | Negative results clamped to anchor day | |

**User's choice:** Instantiation day; calendar days; absolute subtask anchors; no clamping
**Notes:** Deliberate predictability choice — a subtask's date never shifts when the parent moves.

---

## Template management UX

| Option | Description | Selected |
|--------|-------------|----------|
| Settings section | Full CRUD in Settings; picker stays lean (pick + instantiate) | ✓ |
| In-picker management | CRUD inside the picker; heavier lazy-loaded UI | |
| Hybrid | Picker lists templates with pencil opening Settings editor | |

| Option | Description | Selected |
|--------|-------------|----------|
| Save-as action | "Save as template" from drawer context menu pre-fills a new template | ✓ |
| Author from scratch only | Templates authored only in Settings | |

| Option | Description | Selected |
|--------|-------------|----------|
| Picker in modal | "From template…" entry in existing new-task/new-project modals; replaces form defaults | ✓ |
| Palette-first | Templates as Ctrl-K palette creation entries | |

| Option | Description | Selected |
|--------|-------------|----------|
| Drawer-style editor | Fields + live subtask tree with Phase 65 tree actions, offset column | ✓ |
| Flat form editor | Simple form with flat subtask rows | |

**User's choice:** Settings section; save-as action; picker in modal; drawer-style editor
**Notes:** Picker leanness is a chunk-budget decision (~2 kB headroom under the 500 kB gate).

---

## Project template content

| Option | Description | Selected |
|--------|-------------|----------|
| Core fields + tree | name/description/status/teams + ordered task tree (full task bodies incl. subtasks with offsets); no custom fields, no grants | ✓ |
| Full configuration | Also custom-field definitions and default views/columns | |
| Tree only | Project fields left to the instantiate form | |

| Option | Description | Selected |
|--------|-------------|----------|
| Single doc-PUT | Whole project + tasks + dates in one funnel pass | ✓ |
| Incremental writes | Project first, then per-task PUTs — partial-failure states | |

| Option | Description | Selected |
|--------|-------------|----------|
| Regen ids, keep order | Ids regenerated at instantiation; ordering via existing position semantics | ✓ |
| Keep template ids | Traceable but collision-prone across instantiations | |

**User's choice:** Core fields + tree; single doc-PUT; regenerate ids, preserve order
**Notes:** None.

---

## the agent's Discretion

- Sanitizer implementation details and i18n keys (EN+FR same commit)
- Template helper naming, instantiate function shape, Settings section layout
- Offset column presentation and picker preview contents
- Whether "Save as template" copies assignees (decided via sanitizer whitelist)
- Permissions on template create/edit/delete (not asked — research/planner may propose, flagged as unasked)
- Instance linkage (templates are copies; no back-link assumed unless research finds a need)

## Deferred Ideas

- Business-day offsets / holiday calendars — declined (new scope, not wanted)
