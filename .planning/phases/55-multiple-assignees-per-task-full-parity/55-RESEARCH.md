# Phase 55: Multiple assignees per task (full parity) — Research

**Researched:** 2026-11-10
**Domain:** In-repo full-stack change (no new libraries) — task schema migration, UI parity, server fan-out, exports
**Confidence:** HIGH (all claims verified against HEAD this session; no external dependencies introduced)

## User Constraints (from 55-CONTEXT.md)

### Locked Decisions (researched, not re-decided)

- **D-55-1..4 Migration:** read-time normalize in `normalizeDoc`/`mergeClientDoc`; `t.assignee` → `assignees: [old]`; array-only reads (no dual fields, no mirror of `assignees[0]`); server enforces invariants in normalize (dedupe, strip nulls/non-members/out-of-scope, cap 5, delete old field on read).
- **D-55-5 Subtask assignees:** subtasks gain `assignees[]` with the full shape, same invariants, same picker predicate. No reminder fan-out for subtask assignees.
- **D-55-6 Picker:** single-assignee pop (`data-pop="assignee"`) replaced by a search modal modeled on the invite modal chip pattern (`S.ui.inviteScope`: draft persistence, search, multi-select chips). Opened from board cell, table cell, drawer field.
- **D-55-7 Cap 5** per task, picker hint EN+FR, server cap matches.
- **D-55-8 Avatars:** first 3 overlapping + `+N` overflow chip, on board/list/table/timeline/calendar/home.
- **D-55-9 Guard both layers:** picker predicate (`assignableInProject`) + server re-derivation per member (`assigneeOutOfScope` extends to every array member).
- **D-55-10 Fan-out:** loop assignees inside the existing reminder pass — own TZ window, own prefs, own `memberCanReadProject` check, own ledger row. Ledger key already contains the assignee; no ledger restructure.
- **D-55-11 Membership = `assignees.includes(me)`** — no primary assignee.
- **D-55-12 Filters: any-of** — task matches when ANY selected member ∈ `assignees[]`.
- **D-55-13 Notifications diff-based:** added members get the assign notification, removed members get notified, untouched members never pinged.
- **D-55-14..17 Exports:** Tasks sheet one joined Assignees column; MSPDI one Resource per member + one Assignment row per task×assignee pair (CR-01 extends); Members sheet / per-member KPIs count per member (`assignees.includes`); Board sheet cell carries the full joined list.
- **D-55-18 Subtask start:** mirrors the due pattern exactly — `s.start || t.start`, `page.subtask.inheritedDue` start sibling key, Start row in the subtask drawer, export model writes `s.start || t.start`.

### the agent's Discretion
Search-modal internals and key bindings (mirror invite modal), overflow chip styling, cap-hint wording, removed-assignee notification copy, export model's internal array field shape, array ordering (recommend insertion order), mobile avatar-stack collapse.

### Deferred (OUT OF SCOPE)
Reminder fan-out for subtask assignees. Permission model untouched (Phase 53). No primary-assignee concept.

## Standard Stack

None — **zero new runtime dependencies** (standing constraint). Everything is in-repo reassembly: `av()`/`avStack()` helpers, invite-modal chip pattern, existing export writers, `node --test` suite. [VERIFIED: package.json — deps are only `@office-kit/xlsx` and `pg`]

## Architecture Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Schema migration (scalar→array) | Server normalize (`normalizeDoc`/`mergeClientDoc`) | — | D-55-1: one canonical shape enforced server-side; consumers never defend |
| Assignee invariants (dedupe/cap/scope strip) | Server normalize | Client picker predicate | Belt-and-braces D-55-9; server is the authority |
| Avatar stacks | Client render (`src/ui/helpers.js`) | — | pure render primitive |
| Multi-assignee picker | Client modal (`src/overlays/modals.js`) | Server guard | same split as every picker today |
| Reminder fan-out | Server reminder pass | — | per-assignee resolution already exists in-loop |
| Membership (My-Tasks/Home/Members/KPIs) | Client predicates (`store.js`, pages) | Server digest/mirror loops | same predicate both sides |
| Exports | Server writers (`export/`) fed by DOM-free model (`src/export/model.js`) | — | writers never re-read the doc (Phase 54 contract) |

## Code Findings (all verified at HEAD, 2026-11-10)

### 1. Reusable assets that already exist

- **`avStack(ids, max = 4, cls = 'sm')` already exists** — `src/ui/helpers.js:18-21`: renders `av()` per id in a `.avs` span, plus `+N` overflow chip (`class="av sm more"`) when `ids.length > max`. D-55-8 wants first-3 + overflow → **call `avStack(ids, 3)`**; the CSS class `.avs`/`.more` should be checked for spacing/tip behavior on the 8 render sites. This is a rename-adjacent audit of existing stack CSS, not new rendering code.
- **Invite chip pattern** — `S.ui.inviteScope` draft state (`src/overlays/modals.js:433-440`, actions `src/actions/actions.js:2038, 2095, 2185, 2191, 2223`). The picker modal clones this: `S.ui.assigneePick = { id, draft: [...] }` style draft so a full re-render never wipes selection (STATE.md pitfall 4 — every keystroke-able field needs `data-in`; chip toggles need the same treatment).
- **Ledger already keyed per assignee** — `server.js:1669` dedup key `` `${ws.id}:${t.id}:${t.assignee}:${offset}:${due}` ``. Fan-out needs **zero schema change**; the key just gets one distinct value per member. [VERIFIED: server.js:1666-1671]
- **Per-assignee resolution block already in-loop** — `server.js:1619-1669`: tz from doc member row, `localParts`, membership lookup, `getUserNotifPrefs`, `memberCanReadProject`, offsets, claim+append tx. The fan-out is **wrapping this block in `for (const a of t.assignees)`** and replacing `t.assignee` with `a`. Nothing else moves.
- **`assignableInProject(m, p, currentAssigneeId)`** — `src/core/store.js:511-521`. The "currently assigned member is always offered" third parameter becomes "members already in `assignees[]` are always offered" (pass the array; predicate checks `array.includes(m.id)`). Subtask picker reuses the identical predicate (D-55-5).

### 2. Server touchpoints (complete inventory)

| Site | What it does today | Change |
|---|---|---|
| `normalizeDoc` (server.js:739-776) | strips `notifPrefs`, `sessions`, `tfa`, team members on every read | add task/subtask assignee normalization: `t.assignees = dedupe(cap5(valid))` from `t.assignees` ∪ `[t.assignee]` if present, then `delete t.assignee`. Same for each `t.subtasks[*]` |
| `mergeClientDoc` (server.js:1109+) | per-team perm gate, pin blocks | route incoming tasks through the same normalize; keep the guard (below) after it |
| Assignee write-guard (server.js:1351-1368) | loops tasks; skips `!t.assignee`; `memberCanReadProject` per assignee; throws `assigneeOutOfScope` | loop `t.assignees || []` **and** each subtask's array; same error code; error message at `server.js:4930` stays ('Assignee cannot read the task project') |
| Reminder pass (server.js:1560-1700) | one pass per task; `remindable()` reads `task.assignee` (server.js:1585) | `remindable(task, project, assignee)` gains the member param; inner `for (const a of t.assignees)` loop owns tz/window/prefs/read-check/ledger; subtask assignees excluded (D-55-5) |
| Email digest (server.js:1735-1748) | `if (t.assignee !== r.member_id) continue;` | `if (!t.assignees?.includes(r.member_id)) continue;` — digest membership is `includes` (consistent with D-55-11) |
| Task-event log (server.js:1855) | `if (prev.assignee !== t.assignee)` single line | diff prev vs next arrays (D-55-13): log added and removed members separately |
| Member-removal sweep (server.js:2100-2125, `stripMember`) | `hit(t.assignee) ? {...t, assignee: null}`; subtask variant below | filter the id out of each `assignees[]` (and subtasks'); empty array stays (renders Unassigned) |
| Error route (server.js:4930) | maps `assigneeOutOfScope` → 400 | unchanged |

**Normalize is the load-bearing task.** Every consumer below assumes the array shape post-normalize; the migration must land in the same commit as the first array-reading consumer to avoid a half-migrated doc shape in tests.

### 3. Client touchpoints (complete inventory)

**Membership predicates — `t.assignee === X` → `t.assignees?.includes(X)`:**
- `src/pages/my-tasks.js:14`, `src/pages/home.js:14,45`, `src/pages/overview.js:21`, `src/pages/members.js:66,172,191`, `src/shell/layout.js:94` (myOpen badge), `src/overlays/palette.js:100` (my-tasks palette filter), `src/actions/actions.js:2699` (member open-task count)

**Avatar render sites — `av(t.assignee, …)` → `avStack(t.assignees, 3)`:**
- `src/views/board.js:27` (card cell button), `src/views/table.js:42-43` (cell + mobile card line 90), `src/views/timeline.js:97,124`, `src/views/calendar.js:33,75`, `src/components/task-list.js:29` (+ mobile row 291), `src/pages/home.js:93`, `src/pages/search.js:58`, `src/overlays/popovers.js:382` (recents), `src/overlays/drawer.js:79` (drawer field via `cellAssignee`), `src/overlays/drawer.js:105` (subtask row avatar)
- Note `av(id, cls, tip)` has a tip; stack overflow chip should carry the remaining member names as a tip (discretion).

**Picker / pop replacement:**
- `src/overlays/popovers.js:155-162` — the `data-pop="assignee"` case (single-select list, `on: t?.assignee === m.id`) is **removed/replaced**; the modal opens from the same `data-a="pop"` button placements (board.js:27, table.js:43, task-list.js:29). `popovers.js:134-143` is the **subtask** `subassignee` pop — it also becomes multi-select (same modal, subtask mode), or keeps the pop shape if the search modal feels heavy for subtasks — D-55-5 says "same picker predicate", interaction shape is discretion; recommend the same modal for consistency.
- `src/overlays/popovers.js:408-413` bulk-assignee pop: sets `data-v` for `A.bulkSet data-f="assignee"` — decide: bulk applies one member **added** to the array (recommended: replace the array with `[v]`, matching single-assignee semantics of "bulk set assignee"). `src/actions/actions.js:509-513` `field === 'assignee' && !v → null` maps to clearing the array.
- `src/shell/view-engine.js:21, 108, 141, 159-162, 178` — filter match (`f.v.includes(t.assignee || 'none')` → any-of: `f.v.some(v => v === 'none' ? !(t.assignees?.length) : t.assignees?.includes(v))`), sort key (first member name or 'zzz' when empty), group-by-assignee groups (`t.assignees.includes(G.key)` membership; a task appears in **each** of its assignee groups — verify group-drag semantics: drag-drop.js:172 sets `patch.assignee`; becomes array set/replace).
- Filter chip pop (`popovers.js` `case 'filter'` assignee field): becomes multi-select (any-of, D-55-12). `'none'` pseudo-value = empty array.

**Assignment events / notifications:**
- `src/actions/actions.js:106-110` — new-task self-notify: `notifyMembers(tk.assignees filtered by memberScopeEligible)`.
- `src/actions/actions.js:233-237` — setField assignee path: becomes the diff (D-55-13): `added = next.filter(∉prev)`, `removed = prev.filter(∉next)`; added get `type:'assign'`, removed get a removed-assign notification (copy = discretion, reuse assign-event patterns). Watchers (actions.js:186) — `[...new Set([t.assignee, t.creator, …])]` → spread `t.assignees`.
- `src/actions/actions.js:748, 774, 834, 916, 1563` — task create/duplicate/newTask prefill (`data-assignee` from my-tasks.js:57 / members.js:205): seed `assignees: [id]`.

**Subtasks (D-55-5 + D-55-18):**
- Subtasks already carry scalar `assignee` [VERIFIED: src/features/subtasks.js:18, src/overlays/popovers.js:134-143, src/actions/actions.js:432-444, src/overlays/drawer.js:105, stripMember server.js:2113-2114, and creation inherit `assignee: s.assignee || t.assignee` at src/actions/subtasks.js:67]. Migration adds them to the same normalize sweep.
- **Start-date due-pattern mirror:** due lives at `subtasks.js:19` (date pop, `data-field="subdue"`, inherited title via `page.subtask.inheritedDue`); inherited chip in drawer.js:105 (`const due = s.due || t.due` + tip when inherited). Start clones this exactly: pop with `data-field="substart"`, drawer Start row, `page.subtask.inheritedStart` EN+FR key, and the export model writes `s.start || t.start`. The date pop handler is keyed by `p.field === 'subdue'` at actions.js:432 — a `substart` sibling branches beside it.
- Subtask creation inherit (subtasks.js:67) `assignee: s.assignee || t.assignee` → `assignees: s.assignees?.length ? s.assignees : [...(t.assignees || [])]` — or keep subtasks starting empty; discretion.

### 4. Export touchpoints

- **Model** `src/export/model.js` — DOM-free, zero imports (Phase 54 contract holds): row build at 134-142 reads `t.assignee` → carry `assignees` array + `assigneeNames` joined + `assigneeIds` array. Subtask rows (181-183) currently hardcode Unassigned/`assigneeId: ''` — now carry the subtask's array; also gain `start: s.start || t.start` (D-55-18).
- **Members sheet / chart 3** (model.js:277-308, 336-340): open-counts keyed by `r.assigneeId` → iterate `r.assigneeIds`, count per member (D-55-16). Header shape `BASE_COLUMNS` (line 37) 'assignee' column label may stay singular or become 'assignees' (joined cell, D-55-14).
- **CSV** writer: unchanged mechanically — it consumes the model's joined string.
- **XLSX** `export/xlsx.js`: Tasks sheet joined Assignees cell; Board sheet cell `card.assigneeName` (line 486) → full joined list (D-55-17); column width `assignee: 18` (line 60) may need widening for joined names.
- **MSPDI** `export/mspdi.js`: Resources block (247-256) collects **distinct `assigneeName`s** from rows → becomes distinct over all member ids in `assigneeIds`; Assignments block (266-280) is already "one per task×resource pair, task-major" — it currently emits one pair per row because rows carry one assignee; the pair loop now iterates the row's array (D-55-15, CR-01 task-major order preserved by construction).

### 5. i18n

New EN+FR keys needed (prebuild gate `npm run i18n:scan`): picker modal title/search placeholder/empty state, cap-5 hint (`page.field.assigneeCap` or similar), removed-assignee notification copy (`notif.assignRemoved` family), `page.subtask.inheritedStart` (sibling of `page.subtask.inheritedDue` at en.json:440 / fr.json:441), Start field label if not already present (`page.field.start` — verify it exists for tasks; the task drawer Start row uses it). Dead keys: `data-pop="assignee"` removal may orphan picker-related keys only if the modal reuses none — run the scan after the swap, delete dead keys in the same commit (UX-01).

## Common Pitfalls (phase-specific, from code reading + STATE.md)

1. **Dual-field divergence (09a9c41 bug class, D-55-3).** The normalize must `delete t.assignee` on read AND the client must never write it back. Every `patch { assignee: … }` in actions.js/drag-drop.js becomes `assignees`. A leftover writer resurrects the scalar on the next PUT.
2. **Guard loop must cover subtasks.** The current guard (server.js:1362) only loops tasks. Subtask `assignees[]` needs the same per-member check or a guest/private leak opens through the subtask path.
3. **Reminder fan-out claim placement.** The dedup claim + notif append are one tx per (task, assignee, offset). Loop the assignee loop *outside* the offset loop *inside* the tx boundary per member — do not batch all members into one tx (a member's failure must not roll back another member's claim).
4. **`remindable()` and digest membership.** `remindable(task, project)` reads `task.assignee` (server.js:1585) — missed param rename silently sends reminders to `undefined` (no crash, zero reminders). The full-suite `due-reminders.test.mjs` will catch it only if fixtures use arrays — new fixtures required.
5. **Full re-render wipes modal selection** (STATE.md pitfall 4). The picker modal's draft must live in `S.ui.*` with `data-in`-style bindings on the search input, like `S.ui.inviteScope`.
6. **`'none'` filter/group sentinel.** view-engine uses `t.assignee || 'none'`; the array shape needs an explicit empty-array → `'none'` mapping or Unassigned tasks vanish from filters/groups.
7. **cap-5 invariants must strip, not reject**, in normalize (D-55-4: strip out-of-scope/nulls/dedupe; cap). Over-cap arrays are truncated — but a client-side picker guard means truncation never fires in practice; test it synthetically.
8. **Drag-to-assignee-group** (drag-drop.js:172) sets the whole array — decide: dragging into member X's group **replaces** the array with `[X]` (matches "move to group" semantics) or **adds** X. Recommend replace; document in plan.
9. **Export row-shape tests** (`export-model.test.mjs`, `export-mspdi.test.mjs`, `export-xlsx.test.mjs`, `export-csv.test.mjs`) assert exact cells — fixtures must move to arrays in the same commit or the suite reds.
10. **Seed/demo data** (`src/data/seed.js:251` writes `assignee: a`) and test helpers/legacy fixture (`test/helpers/legacy-fixture.mjs`) still ship scalar assignees — intentional: they exercise the read-time migration. Keep at least one scalar fixture as the migration test cell.

## Don't Hand-Roll

| Problem | Use | Why |
|---|---|---|
| Avatar stack + overflow | `avStack(ids, 3)` (helpers.js:18) | already implements D-55-8's shape |
| Multi-select chip modal | invite modal pattern (`S.ui.inviteScope`, modals.js:433+) | established interaction, draft-survival solved |
| Per-member reminder resolution | existing per-assignee block (server.js:1619-1669) | tz/prefs/read-check/ledger all solved; wrap in loop |
| Exactly-once | existing `reminders_sent` ledger | key already contains assignee |
| Export model | extend `src/export/model.js` machine fields | DOM-free contract from Phase 54 |
| Array diff | one `filter(∉)` × 2 | trivial, no lib |

## Suggested Plan Decomposition (for the planner)

1. **Plan 55-01 — Schema + server core (Wave 1):** normalize invariants in `normalizeDoc`/`mergeClientDoc` (tasks + subtasks), write-guard extension, stripMember sweep, event-log diff, migration test with a scalar legacy fixture. All other plans hard-block on this.
2. **Plan 55-02 — Reminder fan-out + digest/mirror membership:** per-assignee loop in the reminder pass, digest `includes`, new due-reminder fixtures with multi-assignee + mixed-TZ tasks. Blocked on 55-01.
3. **Plan 55-03 — Picker modal + client membership:** search modal (chip pattern), pop replacement, bulk-assignee, drag-drop, filter any-of + group-by, all membership predicates (`includes`). Blocked on 55-01; independent of 55-02.
4. **Plan 55-04 — Avatar stacks across surfaces:** `avStack(ids, 3)` at the ~11 render sites + CSS checks. Blocked on 55-03 (picker moves the same cells) — can merge into 55-03 if the planner prefers one UI plan.
5. **Plan 55-05 — Exports + subtask start:** model array fields, joined columns, MSPDI resource/assignment loops, Members-sheet per-member counts, subtask `start` (schema + drawer row + inheritedStart key + `s.start || t.start` in model). Blocked on 55-01 (and benefits from 55-02's fixtures).

i18n keys should ride the plan that introduces the UI (UX-01: dead-key deletion in the same commit).

## Validation Architecture

| Property | Value |
|---|---|
| Framework | `node --test` (106 test files) |
| Config | none needed — glob `test/*.test.mjs` |
| Quick run | `node --test test/export-model.test.mjs test/due-reminders.test.mjs` |
| Full suite | `npm test` (per plan; currently ~1340 green) |
| i18n gate | `npm run i18n:scan` (prebuild, must be 0 dead / 0 stale) |

Wave-0 test gaps (new fixtures/files, per plan):
- migration test: scalar legacy doc → normalized array (plan 55-01)
- guard: multi-member array with one out-of-scope member → 400 `assigneeOutOfScope`, subtask variant
- reminders: 2 assignees, different TZs, prefs off for one → exactly 1 row each, per-member ledger keys
- model/writers: multi-assignee fixtures in export-model/csv/xlsx/mspdi tests
- client-surfaces / i18n suites for new keys

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | `.avs` / `.av.more` CSS already exists and stacks correctly at all 11 sites; only minor spacing checks needed | Reusable assets | small CSS fix-up tasks; low |
| A2 | `page.field.start` (or equivalent) already exists for tasks | i18n | one extra EN+FR key; trivial |
| A3 | Drag into an assignee group should replace the array (recommended, discretion) | Pitfalls 8 | interaction taste; owner can override at plan review |
| A4 | Subtask picker uses the same search modal as tasks (discretion leaning) | Client touchpoints | minor UX deviation from D-55-6 wording; owner can override |

All decision-shaped claims above are locked by 55-CONTEXT.md; the assumptions are only about interaction details within the stated discretion area.

## Sources

All findings verified directly against the working tree at HEAD this session (Read/grep of server.js, src/core/store.js, src/ui/helpers.js, src/export/model.js, export/{xlsx,mspdi}.js, src/views/*, src/pages/*, src/overlays/*, src/actions/*, test/ inventory, package.json, locales). No external documentation was needed — zero-dependency in-repo phase.
