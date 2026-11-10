# Phase 55: Multiple assignees per task (full parity) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-10
**Phase:** 55-multiple-assignees-per-task-full-parity
**Areas discussed:** Migration shape, Picker & avatar caps, Fan-out & membership, Exports carrying all assignees

---

## Migration shape

| Option | Description | Selected |
|--------|-------------|----------|
| Read-time normalize | normalizeDoc strips/coerces on every read — no boot script, no dual-shape code; mirrors notifPrefs stripping (server.js:770) | ✓ |
| Boot migration | One-time boot pass rewriting every doc; cleaner data but dual-shape risk and more migration code | |

**User's choice:** Read-time normalize
**Notes:** —

### Old assignee value

| Option | Description | Selected |
|--------|-------------|----------|
| assignees:[old] | Old assignee becomes sole member of the array — no data lost, reminders/history keep working | ✓ |
| Drop to [] | Treat single-assignee as legacy and clear it — members lose historical assignments | |

**User's choice:** assignees:[old]

### Read path

| Option | Description | Selected |
|--------|-------------|----------|
| Array-only reads | normalizeDoc/mergeClientDoc coerce everywhere; every consumer reads only the array (53-01 lockstep field-parity approach) | ✓ |
| Keep assignee mirror | Keep t.assignee as live mirror of assignees[0] — dual fields risk divergence (09a9c41 bug class) | |

**User's choice:** Array-only reads

### Server invariants

| Option | Description | Selected |
|--------|-------------|----------|
| Enforced invariants | Dedupe on write, strip nulls/non-members, cap at max, one canonical shape in normalize | ✓ |
| No server canonicalization | Accept whatever array the client sends; consumers defend individually | |

**User's choice:** Enforced invariants

### Subtask assignees

| Option | Description | Selected |
|--------|-------------|----------|
| Subtasks unaffected | Only the folded-in start field touches subtasks this phase | |
| Subtask assignees too | Subtasks gain assignees[] — UI on subtask drawer + parity everywhere | ✓ |

**User's choice:** Subtask assignees too
**Notes:** Scope of subtask parity settled next: full shape (same shape, invariants, picker predicate) but NO reminder fan-out for subtask assignees — reminders stay task-level. Schema-now-UI-later rejected.

---

## Picker & avatar caps

### Picker form

| Option | Description | Selected |
|--------|-------------|----------|
| Multi-select pop | Same assignee-pop placements, panel becomes multi-select checkboxes; lighter | |
| Search modal | Full modal with search — invite modal chip pattern | ✓ |

**User's choice:** Search modal

### Assignee cap

| Option | Description | Selected |
|--------|-------------|----------|
| Max 5 | Soft cap; picker blocks further adds with hint; bounded fan-out/exports | ✓ |
| Unlimited | Any member count; avatar stacks always +N | |
| Max 3 | Tighter visual constraint | |

**User's choice:** Max 5

### Avatar stack

| Option | Description | Selected |
|--------|-------------|----------|
| 3 + overflow chip | First 3 avatars overlap, then +N chip; fits card densities | ✓ |
| All avatars | Show all 5 with tighter overlap | |

**User's choice:** 3 + overflow chip

### Scope guard layering

| Option | Description | Selected |
|--------|-------------|----------|
| Both layers | Picker predicate (TEAM-04) excludes unreadable members; server re-derives per added member (STATE.md pitfall 5) | ✓ |
| Client predicate only | Server keeps existing per-task check — crafted doc could slip a blind assignee past | |

**User's choice:** Both layers

---

## Fan-out & membership

### Reminder fan-out

| Option | Description | Selected |
|--------|-------------|----------|
| Inner loop, existing ledger | Loop assignees inside the existing pass: per-assignee window (TZ), prefs, ledger row — key already contains assignee (server.js:369) | ✓ |
| Restructure ledger | One ledger row per task with assignee list — breaks exactly-once key shape | |

**User's choice:** Inner loop, existing ledger

### Membership semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Member of array | assignees.includes(me) — task appears in all assignees' My-Tasks, counts once each | ✓ |
| First-assignee only | Only assignees[0] is "primary" for My-Tasks/Home | |

**User's choice:** Member of array

### Filter semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Any-of | Task matches when ANY selected member is in assignees[] | ✓ |
| All-of | Task matches only when ALL selected members assigned | |

**User's choice:** Any-of

### Assignment notifications

| Option | Description | Selected |
|--------|-------------|----------|
| Diff-based notify | Added members get assignment notification, removed members notified, untouched never pinged | ✓ |
| No assignment notifications | Quieter but inconsistent with today's single-assignee behavior | |

**User's choice:** Diff-based notify

---

## Exports carrying all assignees

### Tasks sheet cell

| Option | Description | Selected |
|--------|-------------|----------|
| Joined column | Names comma-joined in one Assignees column — sorts/filters cleanly, one row per task | ✓ |
| Truncated + tooltip | 3 short names + '+2', full list in tooltip — filtering breaks | |

**User's choice:** Joined column

### MSPDI shape

| Option | Description | Selected |
|--------|-------------|----------|
| Assignment per pair | One Resource per member + one Assignment row per task×assignee (MSPDI-native; CR-01 extends) | ✓ |
| First assignee only | Others lost in Project — fails full parity | |

**User's choice:** Assignment per pair

### Members sheet / KPI counting

| Option | Description | Selected |
|--------|-------------|----------|
| Counts per member | Every task the member is in counts in their Open/Done/Total; shared task counts once per member | ✓ |
| First-only counts | Inconsistent with rest of phase | |

**User's choice:** Counts per member

### Row shape

| Option | Description | Selected |
|--------|-------------|----------|
| One row per task | Tasks/Board/Timeline/charts/KPIs keep row-per-task, count once (extends D-54-10) | ✓ |
| Row per pair | Breaks count-once rule, inflates rows | |

**User's choice:** One row per task

### Board sheet cell

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror on-screen | 3-avatar + '+N' text like cards | |
| Full list in Board | Full joined list in the Board assignee cell | ✓ |

**User's choice:** Full list in Board

---

## Agent's Discretion

Search-modal layout/keybindings, overflow chip styling, cap-hint and empty-state wording, removed-assignee notification copy, export model's internal array field shape, assignee array ordering (recommend insertion order), mobile avatar collapse.

## Deferred Ideas

None — discussion stayed within phase scope. Subtask-assignee reminder fan-out explicitly ruled out this phase (D-55-5).
