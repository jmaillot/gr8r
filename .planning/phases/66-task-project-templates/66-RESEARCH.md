# Phase 66: Task & Project Templates - Research

**Researched:** 2026-11-15
**Domain:** doc-embedded templates over the gr8r one-workspace-doc spine (mergeClientDoc funnel + Phase 65 subtree helpers + lazy-loaded UI)
**Confidence:** HIGH (fully grounded in repo precedent — verified in-repo this session; no external stack research needed)

## Summary

Phase 66 is an *extension of the existing spine*, not new infrastructure. Every mechanism it needs already exists and was proven in Phase 65: a doc-embedded array field with a funnel whitelist sink (`normalizeSubtasksData` at `server.js:919`, hooked in `mergeClientDoc` at server.js:1343 and the read path `normalizeDoc` at server.js:815–865), pure DOM-free helpers in `src/core/subtree.js` (zero imports — reusable verbatim by a template sanitizer), the client doc-PUT with revision concurrency (`pushNow` → `api.putWorkspace` in `src/core/store.js:183–239`), a lazy-chunk registry pattern (`treeChecklist = { fn: null }`, `src/features/subtasks.js:15`), and an existing "From template…" UI ancestor (the hardcoded `TEMPLATES` picker in `projectCreateModal`, `src/overlays/modals.js:141–199`, instantiated by `createProject` at `src/actions/actions.js:1699–1741`).

The three genuinely new pieces are: (1) a **per-kind sanitizer** `normalizeTemplates` sink that whitelists template records and their kind-specific bodies, silently dropping unknown fields (D-04) and normalizing `position` ties (D-03); (2) a **client-side instantiation builder** that regenerates ids (`uid('t')`/`uid('s')`), computes dates as `iso(addD(TODAY, offset))` from the instantiation day (D-05–D-08 — the exact expression `dOff(n)` already lives at `src/core/utils.js:129`), and lands the whole new project + task tree in ONE `pushNow()` doc-PUT (D-15); (3) **lazy-loaded UI** — Settings management section (the settings page chunk is already lazy), a "From template…" picker entry in the existing modals following the `S.ui.expMod` dynamic-import precedent (`modals.js:373–378`), and a "Save as template" drawer action following the Phase 65 popover/context-menu pattern.

The dominant pitfall is the D-53-1/Phase 65 whitelist trap: any doc field not carried by the normalize sink is **silently stripped** on write AND read. `data.templates[]` needs a sink in `mergeClientDoc`, the read path, and — critically — a decision about `mcp.js` `writeDoc`, which does **not** ride `mergeClientDoc` (Phase 65 deviation, T-65-11).

**Primary recommendation:** One `normalizeTemplatesData(data, uidFactory)` sink (per-kind whitelist, position normalization, subtree reuse of `validateSubtree`/`normalizeTaskSubtasks`) hooked in the same call blocks as the Phase 65 passes; one pure client `instantiateTemplate(tmpl)` module that builds the doc rows with fresh ids and `dOff`-computed dates; all new UI behind lazy chunks/registries so the entry chunk gains ~0 bytes.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Templates live in the workspace document as `doc.templates[]` (funnel-whitelisted), NOT a server mirror table. The funnel's normalize/removal sweeps must whitelist every template field or it is silently stripped (D-53-1 precedent).
- **D-02:** Template records carry: stable id, `kind` (`task` | `project`), name, icon/color, kind-specific body, `position`, createdBy, timestamps.
- **D-03:** Picker ordering = explicit `position` integer per template (same ruling as Phase 65 D-03 subtasks): moves touch one node, array storage order irrelevant, ties/missing normalized by funnel.
- **D-04:** Body schema is kind-specific, not unified: task template body = title/notes/priority + ordered subtask list with `dueOffsetDays`; project template body = project fields + ordered task tree. The sanitizer whitelists per kind — unknown fields silently dropped (TMPL-01), no invalid template state can be stored.
- **D-05:** `dueOffsetDays` anchor to the day of instantiation — due = instantiation day + offset. No user-picked start date in the instantiate flow, no template-declared anchor.
- **D-06:** Offsets are plain calendar days (matching existing ISO-day `p.due`/`t.due` handling). No business-day logic, no holiday calendars.
- **D-07:** Subtask offsets are absolute — each subtask's `dueOffsetDays` also anchors to the instantiation day, never chained off the parent's due date.
- **D-08:** No clamping: negative/zero offsets allowed; missing offset = no due date. Dates land as computed; the user adjusts afterwards.
- **D-09:** Full CRUD (list, edit, delete, reorder) lives in a Settings section. The creation-modal picker stays lean (pick + instantiate only).
- **D-10:** A "Save as template" action on existing tasks/projects (drawer context menu, Phase 65 popover pattern) pre-fills a new template from the current item.
- **D-11:** Instantiation surfaces as a "From template…" entry in the existing new-task/new-project modals, opening a template picker popover; picking a template replaces the empty form defaults.
- **D-12:** The template editor is drawer-style, mirroring the task drawer: fields + live subtask tree using the Phase 65 promote/demote/re-parent actions, with an offset column instead of date pickers.
- **D-13:** Template UI (Settings section + picker + editor) is lazy-loaded per D-02 so the entry chunk stays under the 500 kB gate (498.11 kB at baseline — ~2 kB headroom).
- **D-14:** A project template captures core fields (name/description/status/teams) + an ordered task tree, where each task carries a full task-template body including its subtask tree with offsets. No custom-field definitions, no member grants, no column/view presets.
- **D-15:** Instantiation writes the entire new project — all tasks, subtask trees, and computed dates — in a single doc-PUT funnel pass. No incremental per-task writes, no partial states. (TMPL-03 "no fourth write path".)
- **D-16:** At instantiation, ids are regenerated (no id sharing between template copies and live items, no cross-instantiation collisions); template ordering is preserved via the existing `position`/seq semantics.

### the agent's Discretion
- Exact sanitizer implementation and error-message keys (i18n EN+FR same commit, standing constraint).
- Internal naming of template helpers, instantiate function shape, Settings section layout details.
- Offset column presentation in the template editor and picker preview contents.
- Whether "Save as template" copies assignees into the template body (sanitizer decides via whitelist).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. (Business-day offsets were offered and declined; holiday calendars are new scope and not wanted.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TMPL-01 | Task templates with ordered subtask checklists and `dueOffsetDays`; unknown fields dropped by sanitizer | Per-kind whitelist sink `normalizeTemplatesData` in `mergeClientDoc` + `normalizeDoc`, mirroring `normalizeSubtasksData` (server.js:919); template subtask trees validated with the existing `validateSubtree` gate (`src/core/subtree.js:209–240`) |
| TMPL-02 | Project templates with starter task trees, instantiation with offset-derived dates | Client builder reusing `dOff` (`src/core/utils.js:129`), `uid()` id regeneration, and the `createProject`/`createTask` row shapes (`actions.js:1699–1741`) — one `pushNow()` (D-15) |
| TMPL-03 | Workspace-wide, picker in creation modals, normal doc-PUT (no fourth write path, no MCP route) | Storage in `data.templates[]` rides the only funnel; picker entry in `taskModal`/`projectCreateModal` (`modals.js`); lazy chunk gate per `test/build-chunk-size.test.mjs` |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Template storage + sanitization | Server funnel (`mergeClientDoc` + `normalizeDoc`) | — | The funnel is the only write path; sanitization must run server-side on every read AND write or a stale/crafted client resurrects junk (notifPrefs dual-strip precedent, server.js:846 / 2470) |
| Template CRUD actions | Client (`src/actions/actions.js` + doc-PUT) | Server funnel re-validates | Optimistic mutate → `pushNow()`; server normalize/whitelist is authority |
| Date derivation from offsets | Client at instantiation | — | D-05 anchors to instantiation day; the client owns `TODAY`/`dOff`; server never computes dates (plain doc-PUT of already-computed ISO days) |
| Instantiation of project + task tree | Client builder → single doc-PUT | Server funnel (subtree gate, perm gates) | D-15/D-16: one funnel pass; server still validates the resulting trees wholesale |
| Picker / editor / Settings UI | Client (lazy chunks) | — | D-13 chunk gate; settings page chunk already lazy (`src/shell/layout.js:67`) |
| Template ordering (`position`) | Server normalize (tie fill) | Client moves touch one node | Same contract as Phase 65 subtask positions (D-03) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `mergeClientDoc` funnel (in-repo) | server.js:1258 | The only write path; templates ride it as a new data field | Project spine — zero new API |
| `src/core/subtree.js` (in-repo) | current | `validateSubtree`, `normalizeTaskSubtasks`, `orderedSiblings`, `nextPosition` — reused on template task trees | One shared definition; zero imports, byte-identical across hosts |
| `dOff` / `addD` / `iso` / `TODAY` (in-repo, `src/core/utils.js:129`) | current | Offset→ISO-day date computation at instantiation | Exact D-05/D-06 semantics already implemented |
| Lazy registry pattern (`treeChecklist = { fn: null }`, `src/features/subtasks.js:15`) | current | Template UI behind lazy chunks without entry-chunk bytes | Proven 65-04 chunk-gate remedy |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `S.ui.expMod` dynamic-import precedent (modals.js:373–378) | — | Loading the picker/editor chunk before a modal/popover opens | "From template…" picker and template editor |
| `node:test` + existing `test/*.test.mjs` harness | — | Funnel round-trip, sanitizer whitelist, instantiation builder pins | `npm test` (package.json:19: `node --test --test-concurrency=2 test/*.test.mjs`) |

### Alternatives Considered
None — D-01 locked storage; no external packages exist in this phase's scope (zero new runtime deps standing constraint).

**Installation:** none. No new packages.

## Package Legitimacy Audit

Not required — this phase installs no external packages (standing constraint: zero new runtime or dev deps; all mechanisms are in-repo).

## Architecture Patterns

### System Architecture Diagram

```
Authoring                                Instantiation
─────────                                ─────────────
Settings section (lazy chunk)            "From template…" in taskModal /
  └─ template editor (drawer-style)      projectCreateModal → picker popover (lazy)
       │ edit/save                            │ pick template
       ▼                                      ▼
  A.* action → mutate(D())            instantiateTemplate(tmpl)  ← pure builder
       │                                ├─ fresh uid('p'/'t'/'s') ids (D-16)
       │                                ├─ due = dOff(dueOffsetDays) (D-05–08)
       │                                └─ builds projects[]+tasks[] rows
       ▼                                      ▼
  pushNow() → doc-PUT  ────────────►  pushNow() → doc-PUT   (ONE pass, D-15)
                                              │
                     mergeClientDoc (server.js:1258, inside db.tx)
                       ├─ normalizeProjects
                       ├─ normalizeAssigneesData
                       ├─ Phase 65 subtask gate (validateSubtree)
                       ├─ normalizeSubtasksData
                       ├─ NEW: normalizeTemplatesData  ← per-kind whitelist sink
                       ├─ perm gates (tasks/projects unchanged)
                       └─ merge → revision bump → FTS projection
                                              │
                            normalizeDoc (read) also runs the
                            template sink (notifPrefs dual-strip precedent)
```

Entry points: Settings section (CRUD), creation modals (instantiate), drawer context menu ("Save as template"). Decision point: the funnel's per-kind whitelist decides what survives; anything else is dropped, never rejected (D-04 silent-drop; contrast the Phase 65 tree gate which rejects wholesale).

### Recommended Project Structure
```
src/core/templates.js        # pure, DOM-free: sanitizeTemplate + instantiateTemplate (subtree.js discipline: zero imports)
server.js                    # normalizeTemplatesData sink in mergeClientDoc + normalizeDoc
src/features/template-ui.js  # lazy chunk: picker popover, editor, Settings section (behind a registry like treeChecklist)
src/actions/templates.js     # thin actions: saveTemplate, instantiate, saveAsTemplate (rides existing doc-PUT)
src/pages/settings.js        # nav entry + section stub that lazy-loads the chunk
test/templates.test.mjs      # funnel round-trip + sanitizer + builder pins
```

### Pattern 1: The funnel whitelist sink (D-53-1 / Phase 65 precedent)
**What:** a normalize pass that mutates the incoming doc data in the same call block as the Phase 65 passes, plus the read path.
**Verified hook sites:** `mergeClientDoc` runs `normalizeProjects(next)` → `normalizeAssigneesData(next.data, …)` → Phase 65 tree gate → `normalizeSubtasksData(next.data, uid)` (server.js:1280–1343) → perm gates. `normalizeDoc` ends with the same two passes (server.js:860–865).
**Example (shape):**
```js
// server.js — hook beside the Phase 65 passes, before perm gates
normalizeTemplatesData(next.data, uid);
```
**Critical discipline:** the Phase 65 research proved a pass that *rebuilds* objects silently strips unknown fields. For the **subtask entries inside template bodies** you must preserve `{ id, parentId, position }` — reuse `normalizeTaskSubtasks`-style in-place mutation. For the **template record and body itself** the whitelist-drop is intentional (D-04): build a fresh whitelisted object there.

### Pattern 2: Offset → date at instantiation (D-05–D-08)
```js
// Verified source: src/core/utils.js:129
export const dOff = n => iso(addD(TODAY, n));
// Instantiation: due = typeof s.dueOffsetDays === 'number' ? dOff(s.dueOffsetDays) : undefined
```
Missing offset → no `due` field; negative/zero pass straight through (D-08). All levels (task + subtask) anchor to the same `TODAY` captured once per instantiation run (D-07 — never chain off the parent's computed due).

### Pattern 3: Lazy chunk + registry (65-04 remedy)
```js
// Verified source: src/features/subtasks.js:15
export const treeChecklist = { fn: null };
// consumer (drawer.js:122): treeChecklist.fn ? treeChecklist.fn(t, { fxc }) : ''
```
Template UI follows the same shape: a `templateUi` registry populated by a pre-warmed dynamic import; the Settings section and the picker popover render a stub until the chunk lands. Precedent for load-before-open: `A.exportOpen` loads the model chunk into `S.ui.expMod` before `exportModal` renders (modals.js:373–378).

### Pattern 4: Single-pass instantiation (D-15/D-16)
The existing `createProject` template loop (actions.js:1733–1740) calls `createTask` per task — the debounced push usually coalesces, but D-15 demands a *guaranteed* single pass. The builder must push the project row, all task rows (with regenerated ids and computed dates), and activity rows into `D()` synchronously, then settle exactly one `pushNow()` (the `submitProject` snapshot/restore pattern at actions.js:1742–1800 handles 409/perm refusals honestly).

### Anti-Patterns to Avoid
- **Rebuilding subtask entries with `map` to fresh objects** inside the sanitizer — silently strips `{ id, parentId, position }` (65-PATTERNS.md Pitfall 1). Mutate in place.
- **Sanitizing only on write (or only on read)** — a stale client copy resurrects dropped fields; notifPrefs strips on BOTH paths (server.js:846 read, 2470 write).
- **Per-task `pushNow()` during instantiation** — violates D-15; a failure mid-loop leaves a partial project.
- **Putting picker/editor code in the entry chunk** — 498.11 kB baseline, ~2 kB headroom; the gate test (`test/build-chunk-size.test.mjs`) measures real bytes per emitted chunk against 500000.
- **Chaining subtask dates off the parent's computed due** — D-07 forbids; every offset anchors to the captured instantiation day.
- **Trusting template ids at instantiation** — D-16: regenerate every `p`/`t`/`s` id with `uid()`; also regenerate any subtask `parentId` references against the new id map (a stale parentId pointing at a template id would be healed to `null` by the funnel — silent tree flattening).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tree validation for template task trees | custom cycle/depth checker | `validateSubtree` + `normalizeTaskSubtasks` (`src/core/subtree.js`) | Already battle-tested, funnel-proven, byte-identical host discipline |
| Date math | custom day arithmetic | `dOff`/`addD`/`iso`/`TODAY` (`src/core/utils.js:129`) | Existing ISO-day contract used by every `due`/`start` field |
| Sibling ordering | custom sort | `orderedSiblings`/`nextPosition` (`subtree.js:21–44`) | D-03 same comparator everywhere |
| Chunk-size assurance | manual byte watching | `test/build-chunk-size.test.mjs` gate | Runs the real vite build, asserts per-chunk bytes |
| Write/refresh/409 handling | bespoke sync | `snapshot()`/`mutate()`/`pushNow()`/`restore()` store cycle | Every existing action rides it (submitProject precedent) |

**Key insight:** this phase is almost entirely recomposition. The only new *algorithm* is the per-kind whitelist sanitizer; everything else is an existing pattern applied to a new doc field.

## Common Pitfalls

### Pitfall 1: The silent-strip whitelist trap (D-53-1 / Phase 65)
**What goes wrong:** `data.templates[]` or any nested body field missing from the normalize sink is silently dropped on write AND read — templates save "successfully" but vanish or lose fields.
**Why it happens:** the funnel deep-clones the incoming doc and runs whitelisting passes; unregistered fields simply never survive.
**How to avoid:** one `normalizeTemplatesData` covering: the template record fields (id/kind/name/icon/color/body/position/createdBy/timestamps — D-02), the per-kind body whitelist (D-04), and the embedded subtask shape (in-place, preserving id/parentId/position). Hook it in `mergeClientDoc` (before perm gates, beside the Phase 65 passes) and in `normalizeDoc`. Pin with a round-trip test like `test/subtask-tree.test.mjs`.
**Warning signs:** a template saves, survives reload, but an edited field is gone after the next doc sync.

### Pitfall 2: MCP writeDoc does NOT ride mergeClientDoc
**What goes wrong:** `writeDoc` is a direct tx write with its own gate (Phase 65 deviation, STATE.md decision + 65-05 SUMMARY). An MCP `writeDoc` carrying a doc with templates would bypass the template sink entirely.
**How to avoid:** the standing constraint is "every new server validator shared across UI/API/MCP". Since TMPL-03 rules out MCP *routes* for templates, the minimal correct treatment is: add the same `normalizeTemplatesData` call inside `writeDoc` (the exact pattern Phase 65 used — "the ONE validator, a second call site, not a second validator") so MCP-authored docs can't smuggle un-sanitized template shapes. Decide explicitly in the plan whether MCP can read templates (doc reads already carry them).
**Warning signs:** `test/mcp.test.mjs` round-trip templates missing fields.

### Pitfall 3: Instantiation partial-state on failure
**What goes wrong:** per-row creation with settled pushes leaves a half-built project if a push fails or a perm refusal arrives.
**How to avoid:** build everything client-side first (rows + activity), single `mutate` + `pushNow()`; snapshot/restore on failure like `A.submitProject` (actions.js:1742–1800). The server sees one ordinary doc-PUT; Phase 67's `diffWebhookEvents` will read the bulk tasks as ordinary task.created events (downstream, not this phase).
**Warning signs:** two revisions bumped for one instantiation; e2e flakiness around create-then-assert.

### Pitfall 4: parentId mapping at instantiation
**What goes wrong:** template task trees carry `parentId` refs to template-era subtask ids; if you regenerate subtask ids without remapping parentId refs, the funnel's lazy heal re-roots them to `null` — the tree silently flattens.
**How to avoid:** build an old-id → new-id map per task body during id regeneration; remap every `parentId` through it before pushing.
**Warning signs:** instantiated projects show flat subtask lists.

### Pitfall 5: Entry-chunk regressions from "small" additions
**What goes wrong:** picker markup, i18n strings, or action wiring added to entry-chunk modules (`modals.js`, `actions.js`) eat the ~2 kB headroom and fail the 500 kB gate.
**How to avoid:** entry chunk gets only: nav/stub entries, the "From template…" button, and registry references. All picker/editor/Settings markup + logic in a lazy feature chunk; new i18n keys are catalogue strings (check how the catalogue chunks split — the FR chunk is separate per vite.config.js:75).
**Warning signs:** `test/build-chunk-size.test.mjs` red.

### Pitfall 6: Stored template XSS / junk state
**What goes wrong:** template name/body fields are client-controlled doc data shared workspace-wide; an `innerHTML` sink without `esc()` is the Phase 36 stored-XSS precedent (MILESTONES.md 36-REVIEW).
**How to avoid:** every rendered template field passes `esc()`; the sanitizer whitelist guarantees no unknown field can smuggle markup-bearing values; never interpolate template names into `data-*` attributes unescaped.
**Warning signs:** review finding on any template-rendered string without esc.

### Pitfall 7: Assignee ids inside template bodies
**What goes wrong:** if the sanitizer whitelists assignees into task-template bodies, the member-removal sweep (`stripMember`, server.js ~2579–2589) must learn the new location, and instantiation would create tasks assigned to possibly-inactive members.
**How to avoid:** recommend NOT whitelisting `assignees` in template bodies (the discretion item resolves to "don't copy assignees") — this removes the stripMember extension and the out-of-scope id problem in one move. The sanitizer's silence is the decision.
**Warning signs:** `stripMember` tests failing on template bodies.

## Runtime State Inventory

Not a rename/refactor/migration phase — omitted per protocol. (No stored-data migration: new `data.templates[]` starts empty on all existing docs; no OS/service/artifact state affected.)

## Code Examples

### Existing "template instantiation" ancestor (verified, actions.js:1699–1741)
```js
const tm = TEMPLATES.find(x => x.id === tmplId);
for (let i = 0; i < (tm?.tasks || 0); i++)
  createTask({ project: p.id, title: t(`project.template.${tmplId}.task.${i + 1}`),
    status: i === 0 ? 'todo' : 'backlog', ... due: dOff(5 + i * 5), start: dOff(i * 5) });
```
Phase 66 generalizes this: hardcoded catalogue templates → user-defined `doc.templates[]`, and the per-task loop → one builder + one `pushNow()`.

### Per-kind whitelist sanitizer sketch
```js
// src/core/templates.js — zero imports discipline like subtree.js
const TASK_BODY = ['title', 'notes', 'priority', 'subtasks']; // D-04
function sanitizeTaskBody(body) {
  const out = {};
  for (const k of TASK_BODY) if (body?.[k] !== undefined) out[k] = body[k];
  // out.subtasks: in-place normalize entries to {id,parentId,position,title,done?,note?,dueOffsetDays?}
  return out;
}
```

### Hook site (verified, server.js:1338–1343)
```js
  normalizeSubtasksData(next.data, uid);
  // NEW (66): templates sink — before perm gates, beside the Phase 65 passes
  normalizeTemplatesData(next.data, uid);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded `TEMPLATES` catalogue picker (modals.js:141–199) | User-defined `doc.templates[]` | Phase 66 | Picker must dedupe/renamespaces: existing `project.template.*` i18n keys stay; new keys under a `templates.*` namespace |
| Static date offsets in createProject (`dOff(5 + i*5)`) | Per-item `dueOffsetDays` from template body | Phase 66 | Offset model matches D-05–08 semantics exactly |
| Flat one-level subtasks | Phase 65 tree (`id`/`parentId`/`position`) | 65-01/02 | Template bodies embed the tree shape verbatim; validation reusable |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Template CRUD permission is agent-discretion; recommendation below assumes any member who can write the doc can create/edit templates (no extra gate), since templates carry no hidden-project data | Architecture / Pitfalls | If the user wants manager-only template CRUD, add a stored-prefs toggle or role check — cheap, but a plan revision |
| A2 | MCP `writeDoc` handling of templates (recommend: run `normalizeTemplatesData` inside writeDoc, no new MCP tools) | Pitfall 2 | If the user prefers templates stripped entirely from MCP writes, the sink call is replaced by a `delete next.data.templates` — equally small |
| A3 | Sanitizer never rejects — it silently drops junk (D-04) rather than throwing, so no new error codes are strictly needed; i18n additions are labels/hints only | Standard Stack | If a "template too large" style guard is wanted (doc-size safety), one error code + EN/FR keys must land the same commit |
| A4 | Template bodies do not need FTS projection (templates are workspace-wide config-like doc data, not task content) | Architecture | If search should find templates, FTS sweep extension grows — new scope |

## Open Questions

1. **Should the sanitizer cap template count / body size?**
   - What we know: the doc is one JSON blob; templates are unbounded arrays like tasks. No precedent caps exist for doc arrays.
   - What's unclear: whether a cap (e.g., 100 templates) is wanted as doc-size hygiene.
   - Recommendation: skip the cap (matches existing unbounded arrays); revisit only if the doc grows pathologically. [ASSUMED A3]

2. **Does "Save as template" on a project copy its milestone rows / lead / members?**
   - What we know: D-14 fixes the captured set (name/description/status/teams + task tree); lead/members/milestones are NOT in the whitelist.
   - Recommendation: strict D-14 whitelist; the form lets the author pick icon/color/name at save time.

## Environment Availability

Step 2.6: SKIPPED — no external dependencies; all mechanisms are in-repo (`node`, `vite`, existing test harness verified present: package.json test script, `test/build-chunk-size.test.mjs`).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (unit, `npm test` = `node --test --test-concurrency=2 test/*.test.mjs`) + Playwright e2e (115/115 baseline) |
| Config file | none needed — follow `test/subtask-tree.test.mjs` + `test/notif-prefs.test.mjs` patterns |
| Quick run command | `node --test test/templates.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TMPL-01 | Round-trip: template record + per-kind body survives funnel byte-identical; unknown fields dropped; position ties normalized | unit (funnel) | `node --test test/templates.test.mjs -x` | ❌ Wave 0 |
| TMPL-01 | Embedded tree: self-parent in template body rejected as `subtaskCycle` via the existing gate; junk subtasks healed | unit (funnel) | `node --test test/templates.test.mjs` | ❌ Wave 0 |
| TMPL-02 | Builder: fresh ids, parentId remap, `dOff` dates incl. negative/zero/missing offsets (D-05–08, D-16) | unit (pure) | `node --test test/templates.test.mjs` | ❌ Wave 0 |
| TMPL-03 | Single doc-PUT: one revision bump per instantiation; e2e picker-in-modal flow EN+FR; entry chunk under gate | e2e + gate | `npm test` (chunk gate test runs vite build) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test test/templates.test.mjs` (+ lint)
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green + chunk gate + i18n EN+FR scan before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/templates.test.mjs` — covers TMPL-01/02 funnel + builder pins
- [ ] Extend `test/mcp.test.mjs` — writeDoc templates treatment (Pitfall 2 decision)
- [ ] Chunk-gate + i18n gates are existing infrastructure — no new setup

## Security Domain

Standing constraint (REQUIREMENTS.md): "every new server validator shared across UI/API/MCP". Applicable categories:

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Per-kind whitelist sanitizer in the funnel (D-04) — unknown fields dropped server-side, never trusted from client |
| V4 Access Control | yes | Existing perm gates apply to instantiated tasks/projects automatically (funnel runs after the sink); template CRUD gating is discretion (A1) |
| V6 Cryptography | no | No crypto surface |
| V2/V3 Auth/Session | no | Rides existing routes unchanged |

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stored XSS via template name/body rendered workspace-wide | Tampering | `esc()` at every render sink (Phase 36 precedent); whitelist prevents unknown-field smuggling |
| Cross-user junk injection via doc-PUT | Tampering | Server-side sanitize on read AND write (notifPrefs dual-strip) |
| MCP bypass of the template sink | Elevation of Privilege | Same validator in `writeDoc` (65-05 pattern — one validator, second call site) |

## Sources

### Primary (HIGH confidence — read in-repo this session)
- `server.js`:815–965 (`normalizeDoc` strip passes, `normalizeSubtasksData`), :1258–1343 (`mergeClientDoc` hook block + Phase 65 gate), :2460–2470 (write-side notifPrefs strip)
- `src/core/subtree.js` (full read — validateSubtree, normalizeTaskSubtasks, ordering helpers)
- `src/core/utils.js`:129 (`dOff`), `src/core/store.js`:183–239 (doc-PUT/revision cycle)
- `src/actions/actions.js`:1699–1800 (`createProject` + `A.submitProject` snapshot/restore)
- `src/overlays/modals.js`:108–199 (`taskModal`, `TEMPLATES`, `projectCreateModal`), :373–378 (`S.ui.expMod` lazy-load precedent)
- `src/features/subtasks.js`:1–20 (`treeChecklist` registry), `src/shell/layout.js` lazy pages
- `test/build-chunk-size.test.mjs` (500000-byte per-chunk gate), `package.json`:19 (test command)
- `.planning/phases/65-subtask-tree/*` (PATTERNS/RESEARCH/SUMMARY/VERIFICATION — whitelist trap, writeDoc deviation, chunk remedies)
- `.planning/research/ARCHITECTURE.md` §Templates (sanitizer-on-read-and-write, D-53-1 sink discipline)

### Secondary / Tertiary
None needed — no external stack claims.

## Metadata

**Confidence breakdown:**
- Storage/funnel architecture: HIGH — every hook site read this session
- Instantiation/date semantics: HIGH — D-05–08 map 1:1 onto verified `dOff`/row shapes
- Pitfalls: HIGH — all sourced from Phase 65 VERIFICATION/SUMMARY and in-repo review docs
- Permission posture for template CRUD: MEDIUM — discretion item, assumption A1

**Research date:** 2026-11-15
**Valid until:** 2026-12-15 (in-repo precedent, stable)
