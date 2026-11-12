# Phase 57: Views, Columns & General Access - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-12
**Phase:** 57-views-columns-general-access
**Areas discussed:** VIEW-03 granularity, Storage & migration ruling, Saved views shape & sharing, Default columns & first-run experience

---

## VIEW-03 — General Access granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Workspace default + existing binary | One workspace default for new projects; private/public toggle stays | ✓ |
| Three-state access | Private / Workspace-read / Workspace-full | |
| Three-state + per-project defaults | Third state plus owner-configurable per-type defaults | |

**User's choice:** Workspace default + existing binary
**Notes:** Follow-up Q1: behavior scope → "Single global default" (owner-only setting; existing projects untouched; no retro-apply; no permission-model change) over retro-apply and owner-locked toggle. Q2: storage → "Workspace settings UI + doc prefs" (prefs.defaultPrivate normalized in mergeClientDoc) over a new workspace-settings server row. Q3: Access-tab surfacing → "Hint only" (informational line showing the default; no 'use default' action) over hint+action and no change.

## Storage & migration ruling (conflict)

| Option | Description | Selected |
|--------|-------------|----------|
| Server rows for views+columns | saved_views table per Phase 34 precedent; both features | ✓ |
| Rows for views, doc for columns | Two mechanisms | |
| Doc, keyed per member | No new table; contradicts Phase 34 precedent | |

**User's choice:** Server rows for views+columns — resolves the roadmap-vs-research conflict; research ARCHITECTURE.md §5 superseded.
**Notes:** Q1 migration → "Boot sweep, rows→owner, strip doc" over no-migration and first-boot client migration. Q2 sync → "Dedicated routes" (not coupled to doc revisions) over riding the doc-PUT funnel. Q3 demo/offline → "localStorage like notifPrefs" over simulated doc.

## Saved views shape & sharing

| Option | Description | Selected |
|--------|-------------|----------|
| Personal only | Views belong to creator; nobody else sees them | ✓ |
| Personal + shareable | Optional workspace-share flag, read-only Team views | |
| Workspace-visible | All views visible to everyone | |

**User's choice:** Personal only
**Notes:** Q1 table scope → "tasks + my-tasks" (the two viewOf() consumers) over tasks-only and all-tables. Q2 snapshot → "Full viewOf snapshot" (filters+columns+sort+group+showDone, minus transient q) over filters+sort-only and delta. Q3 constraints → "Unique names + 20/2 kB caps" with explicit overwrite confirm and schema_version on every blob.

## Default columns & first-run experience

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded defaults preserved | Current viewOf() fallback unchanged; no owner-set columns | ✓ |
| Owner-set default columns | Workspace-wide default hidden columns | |

**User's choice:** Hardcoded defaults preserved
**Notes:** Q1 reset semantics → "Reset = delete row" (no bulk delete-views action). Q2 apply UX → "Toolbar dropdown, explicit save" (no autosave of live state) over autosave-live and Linear-style sidebar.

## the agent's Discretion

- Route paths/payload shapes; saved_views DDL + adapter seam (both DB backends)
- Saved-views popover placement/visual design
- Lenient-load intersection mechanics per schema_version
- Boot-sweep placement in the migration sequence
- i18n keys (en + fr; gate stays green)

## Deferred Ideas

- Sharing saved views / team views
- Third General Access state ("workspace-read")
- Owner-locked visibility toggle
- Saved views for search pages/dashboard (already in REQUIREMENTS.md Future Requirements)
- Owner-set default hidden columns
- Bulk "delete all my views" action
