# MCP — Project Creation Prompt Template

Copy this template, fill in the bracketed fields, and paste it to the agent
connected to Projects Studio (OpenCode & co). Every field maps to a real MCP
tool parameter — anything left blank gets the default noted inline.

The agent will: create the project, set milestones, create all tasks in one
batch (dates, subtasks, assignees, labels included), then wire dependencies.

---

## The template

```text
Hello, I want to create a project in Projects Studio named "[PROJECT NAME]"

### Workspace
Workspace: [name or slug — optional; the API key is scoped to one workspace,
so this is only a reminder/check, not a switch]

### Project Details
- Description: [1–2 lines — optional]
- Icon: [globe | smartphone | megaphone | rocket | component | building-2 |
  layout-grid | palette | code | briefcase | target | layers | zap | heart |
  folder | sparkles — default: folder]
- Color: [indigo | blue | violet | teal | rose | amber | green | slate —
  default: none]
- Status: [planning | active | risk | hold | complete — default: active]
- Lead: [member email or exact name — default: me (the API key owner)]
- Private: [yes | no — default: no]
- Start date: [DD/MM/YYYY]
- Due date: [DD/MM/YYYY]
- Teams: [team names, comma-separated — default: none]
- Milestones: [one per line: "Name — DD/MM/YYYY" — optional]

### Tasks
Format per task — the order number matters. Everything indented under a task
becomes a subtask. Any bracketed attribute is optional.

[order]. [Task title] (Start DD/MM - Due date DD/MM) [Priority: urgent|high|
medium|low] [Labels: label1, label2] [Assignee: email] [Status: backlog|todo|
progress|review|done]

   - [Subtask 1]
   - [Subtask 2]

Example:

1. Prerequisites (Start 15/11 - Due date 16/11) Priority: high Labels: preparation, vendor
   - Tenant Access
   - Registrar Access
2. Prepare the CSV Export (Start 17/11 - Due date 19/11) Labels: migration, email
   - Import Users
   - Export User Mailbox
   - Export Shared Mailbox
   - Export Resource Mailbox
   - Export Contacts
   - Export Distribution Groups
3. Migrate to Exchange Online (Start 19/11 - Due date 25/11) Labels: migration, licensing
   - Import Users
   - Import Shared Mailbox
   - Import Resource Mailbox
   - Import Contacts
   - Import Distribution Groups
   - Assign Licences
4. Uninstall the old server (Start 26/11) Labels: validation
   - Validate mailboxes migration
   - Uninstall Server

### Global task defaults (optional — applies to every task unless overridden)
- Assignee: [email]
- Priority: [value]
- Labels: [values]
- Position: [top | bottom — default: bottom]

### Dependencies (optional — free text)
[e.g. "Task 2 blocked by Task 1; Task 3 blocked by Task 2"]

### Notes for the agent
- Normalize every date to YYYY-MM-DD.
- Create the project with `create_project`, then milestones with
  `add_milestone`, then the whole task list with ONE `create_tasks` call.
- After creation, report the project key and the task keys.
```

---

## Field reference

### Project — `create_project`

| Field | Parameter | Values / format | Default |
|---|---|---|---|
| Name | `name` | 1–60 chars, required | — |
| Key prefix | `key` | 2–8 chars `A-Z0-9`, derived from name if omitted | derived |
| Description | `description` | ≤ 2000 chars | empty |
| Icon | `icon` | PICONS ids (see list above) | `folder` |
| Color | `color` | indigo, blue, violet, teal, rose, amber, green, slate | none |
| Status | `status` | planning, active, risk, hold, complete | `active` |
| Lead | `lead` | member id, email or exact name | key owner |
| Private | `private` | boolean | `false` |
| Start | `start` | YYYY-MM-DD | null |
| Due | `due` | YYYY-MM-DD | null |
| Teams | `teams` | array of team ids (or names — agent resolves via `list_teams`) | [] |

### Tasks — `create_tasks` (max 20 per call) / `create_task`

| Field | Parameter | Values / format | Default |
|---|---|---|---|
| Title | `title` | ≤ 200 chars, required | — |
| Description | `description` | ≤ 20000 chars | empty |
| Status | `status` | backlog, todo, progress, review, done | `todo` |
| Assignee | `assignee` | member id, email or exact name | null |
| Priority | `priority` | urgent, high, medium, low, none | `none` |
| Due | `due` | YYYY-MM-DD | null |
| Start | `start` | YYYY-MM-DD | null |
| Labels | `labels` | array of label ids (max 10) — see catalog below | [] |
| Recurrence | `recur` | Daily, Weekly, Every 2 weeks, Monthly | null |
| Subtasks | `subtasks` | array of strings (max 20) | [] |
| Position | `position` | top, bottom | `bottom` |
| Estimate | `estimate` | free text ≤ 20 chars | null |

### After creation — optional agent follow-ups

| Action | Tool |
|---|---|
| Milestones | `add_milestone` (one per milestone) |
| Dependencies | `set_dependencies` (array of task ids) |
| Subtask checks/renames later | `toggle_subtask`, `rename_subtask` |
| Board position fine-tuning | `reorder_task` (before/after a task) |
| Batch edits later | `update_task`, `move_task` |

---

## Label catalog (fixed, 20 ids)

Original: `design`, `frontend`, `backend`, `research`, `content`, `bug`, `qa`, `growth`

Infrastructure/migration: `assessment`, `preparation`, `migration`,
`validation`, `identity`, `email`, `licensing`, `network`, `security`,
`backup`, `documentation`, `vendor`

Unknown ids are refused — run `list_labels` for the live list with counts.

---

## Date normalization

The template accepts human dates (`15/11`, `Nov 15`, `15 novembre 2026`);
the agent converts to `YYYY-MM-DD` before any tool call. Ambiguous formats
(`05/06`) are resolved as **DD/MM** unless the context says otherwise — the
agent should flag the assumption once.

## Workspace note

A Projects Studio API key is **bound to exactly one workspace** (generated in
Settings → API keys). `whoami` reports which one. Creating a project in
another workspace is not a parameter — it needs a key generated from that
workspace's UI session.
