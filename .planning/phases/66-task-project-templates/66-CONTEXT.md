# Phase 66: Task & Project Templates - Context

**Gathered:** 2026-11-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can save recurring task/project setups as workspace-wide templates and instantiate them in one action, with dates derived from `dueOffsetDays` offsets. Templates are stored in the workspace document, managed from a Settings section, picked from inside the existing creation modals, and instantiated through the normal doc-PUT funnel — no fourth write path, no MCP route. Template bodies embed Phase 65 subtask trees (`id`/`parentId`/`position`). TMPL-01/02/03.

</domain>

<decisions>
## Implementation Decisions

### Template storage
- **D-01:** Templates live in the workspace document as `doc.templates[]` (funnel-whitelisted), NOT a server mirror table. The funnel's normalize/removal sweeps must whitelist every template field or it is silently stripped (D-53-1 precedent). — **Reversibility:** costly — moving to a server table later means a doc migration, a new CRUD API, and re-pointing every read site; chosen now because it reuses the existing funnel, revisions, and client mirror with zero new API.
- **D-02:** Template records carry: stable id, `kind` (`task` | `project`), name, icon/color, kind-specific body, `position`, createdBy, timestamps. — **Reversibility:** costly — stored doc shape mirrored across funnel whitelist and Settings UI.
- **D-03:** Picker ordering = explicit `position` integer per template (same ruling as Phase 65 D-03 subtasks): moves touch one node, array storage order irrelevant, ties/missing normalized by funnel.
- **D-04:** Body schema is kind-specific, not unified: task template body = title/notes/priority + ordered subtask list with `dueOffsetDays`; project template body = project fields + ordered task tree. The sanitizer whitelists per kind — unknown fields silently dropped (TMPL-01), no invalid template state can be stored.

### Offset date semantics
- **D-05:** `dueOffsetDays` anchor to the day of instantiation — due = instantiation day + offset. No user-picked start date in the instantiate flow, no template-declared anchor.
- **D-06:** Offsets are plain calendar days (matching existing ISO-day `p.due`/`t.due` handling). No business-day logic, no holiday calendars.
- **D-07:** Subtask offsets are absolute — each subtask's `dueOffsetDays` also anchors to the instantiation day, never chained off the parent's due date. A subtask's date never shifts when the parent moves.
- **D-08:** No clamping: negative/zero offsets allowed (due today or past); missing offset = no due date. Dates land as computed; the user adjusts afterwards.

### Template management UX
- **D-09:** Full CRUD (list, edit, delete, reorder) lives in a Settings section — same home as notif-prefs/saved views precedents. The creation-modal picker stays lean (pick + instantiate only).
- **D-10:** A "Save as template" action on existing tasks/projects (drawer context menu, Phase 65 popover pattern) pre-fills a new template from the current item — cheapest authoring path, no from-scratch-only rule.
- **D-11:** Instantiation surfaces as a "From template…" entry in the existing new-task/new-project modals, opening a template picker popover (name, icon, subtask-count preview); picking a template replaces the empty form defaults.
- **D-12:** The template editor is drawer-style, mirroring the task drawer: fields + live subtask tree using the Phase 65 promote/demote/re-parent actions, with an offset column instead of date pickers.
- **D-13:** Template UI (Settings section + picker + editor) is lazy-loaded per D-02 so the entry chunk stays under the 500 kB gate (498.11 kB at baseline — ~2 kB headroom).

### Project template content & instantiation
- **D-14:** A project template captures core fields (name/description/status/teams) + an ordered task tree, where each task carries a full task-template body including its subtask tree with offsets. No custom-field definitions, no member grants, no column/view presets.
- **D-15:** Instantiation writes the entire new project — all tasks, subtask trees, and computed dates — in a single doc-PUT funnel pass. No incremental per-task writes, no partial states. (TMPL-03 "no fourth write path".)
- **D-16:** At instantiation, ids are regenerated (no id sharing between template copies and live items, no cross-instantiation collisions); template ordering is preserved via the existing `position`/seq semantics.

### the agent's Discretion
- Exact sanitizer implementation and error-message keys (i18n EN+FR same commit, standing constraint).
- Internal naming of template helpers, instantiate function shape, Settings section layout details.
- Offset column presentation in the template editor and picker preview contents.
- Whether "Save as template" copies assignees into the template body (sanitizer decides via whitelist).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project spine & rulings
- `.planning/PROJECT.md` — one-workspace-doc spine; M-2.2 saved_views precedent; D-53-1 normalize-sink pattern
- `.planning/REQUIREMENTS.md` §Templates (TMPL) — TMPL-01..03 requirement text and owner rulings (workspace-wide, no fourth write path, no MCP route)
- `.planning/ROADMAP.md` §Phase 66 — goal + success criteria (sanitizer, single doc-PUT, picker in creation modals, lazy-load under 500 kB gate)
- `.planning/phases/65-subtask-tree/65-CONTEXT.md` — D-01/D-03 subtask storage shape (`id`/`parentId`/`position`) that template bodies embed; tree-action UX patterns reused by the template editor

No external specs/ADRs exist — requirements fully captured in decisions above plus the roadmap phase detail.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/overlays/modals.js` (`taskModal`, `projectModal`) — home of the "From template…" picker entry (D-11).
- `src/overlays/drawer.js`, `src/overlays/popovers.js` — drawer context-menu + popover patterns; "Save as template" action and the drawer-style template editor tree reuse Phase 65 restructure actions.
- `src/pages/settings.js` — Settings page hosting the template management section (D-09), same home as notif-prefs/saved views.
- `src/core/store.js` / `src/actions/actions.js` — client funnel mirror; template doc fields must mirror `mergeClientDoc` whitelist.

### Established Patterns
- `mergeClientDoc` funnel in `server.js`: every new doc field (templates array and its nested body fields) needs the normalize whitelist + removal sweep or it is silently stripped (D-53-1 precedent; Phase 65 removal sweep at `server.js:2579`).
- Phase 65 subtask helpers (`subtree.js`, D-01/D-03 shape) — template bodies embed the exact same subtask shape; tree-building/validation helpers are reusable in the sanitizer.
- Server mirror tables created with SQLite+pg parity in the same commit — NOT needed here (templates in doc), but the pattern applies to any server-side counter/ledger if research finds one.
- D-02 lazy-loading for new UI (chunk gate 498.11/500 kB, ~2 kB headroom).
- i18n EN+FR in the same commit (standing constraint).

### Integration Points
- Funnel diff point in `server.js` — template instantiation is just a doc-PUT; Phase 67's `diffWebhookEvents` will see the bulk-created tasks as ordinary task.created events (relevant downstream, not this phase).
- Ctrl-K palette (`src/pages/search.js`) — not required for this phase (D-11 keeps instantiation in modals).
- Settings page (`src/pages/settings.js`) for the management section.

</code_context>

<specifics>
## Specific Ideas

- Owner confirmed the offset model deliberately: absolute anchoring to instantiation day for ALL levels (task and subtask) — chosen over parent-relative chaining for predictability ("a subtask's date never shifts when the parent moves").
- Ordering follows the Phase 65 amendment spirit: `position` integer, one-node moves, funnel normalizes ties.
- Picker must stay lean — all management weight goes to Settings; this is a chunk-budget decision as much as a UX one.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Business-day offsets were offered and declined; holiday calendars are new scope and not wanted.)

</deferred>

---

*Phase: 66-Task & Project Templates*
*Context gathered: 2026-11-15*
