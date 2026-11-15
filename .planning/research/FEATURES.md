# Feature Research — v2.4: Subtask Tree, Templates, Per-Project Webhooks (MS Teams)

**Domain:** self-hosted PM workspace (gr8r / Projects Studio) — hierarchical subtasks, task/project templates, per-project outbound webhooks delivering MS Teams cards
**Researched:** 2026-11-15
**Confidence:** HIGH (Teams card format & connector retirement verified against Microsoft Learn + developer-blog sources; tool conventions verified against Vikunja/OpenProject docs)

## Feature Landscape

### Table Stakes (Users Expect These)

**SUB — Subtask tree**

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Multi-level nesting (unlimited or capped depth) | Every reference tool ships it; Jira's 1-level cap is a well-known complaint | MEDIUM | gr8r subtasks are flat today. Model: `parentId` + `order` (sibling sort key) on each task; one recursive render, no adjacency-list SQL gymnastics needed at expected scale. Cap display depth is not a substitute for real parentId chains. |
| Aggregated progress rollup (parent % done = f(children)) | OpenProject, Vikunja, Asana, Azure DevOps all roll up; a parent that says 0% with all children done feels broken | MEDIUM | Convention: parent progress = weighted mean of children (Vikunja: percent-done or completed/total when unset). Recompute on completion toggle, walking up the chain. Store nothing derived or compute on read — gr8r's `progressOf` already computes progress from tasks, so extend that funnel. |
| Indented tree rendering in list/table views | OpenProject & Atlassian render child rows indented with disclosure carets | LOW-MEDIUM | Row indent via padding-left(depth×step), expand/collapse caret per parent. gr8r board/table/list views need a consistent indent contract. |
| Drag to reorder siblings | Standard in every tool | LOW-MEDIUM | Reorder within same parent only for v1 is acceptable; keep the `order` fractional/LexoRank-style key so inserts don't renumber siblings. |
| Drag to reparent (move under another parent) | OpenProject & Jira Cloud support drag-reparent; users expect it once hierarchy exists | HIGH | Needs cycle detection (can't drop a node into its own subtree), permission check on target parent, and updated rollup on both old and new ancestor chains. Deferrable to a later plan within the phase. |
| Promote/demote (indent/outdent) via keyboard or context menu | Cheap alternative to free drag-reparent; Taiga/Vikunja offer "move" affordances | LOW | Add-sibling/add-subtask buttons on hover are the minimal convention. |
| Tree-aware notifications & permissions | A subtask is a task: assignees, reminders, notifs, redaction must keep working | LOW | gr8r multi-assignee subtasks already exist (v2.1); `parentId` must ride the same redaction/permission funnel (`memberCanReadProject`); deleting a parent must cascade or re-parent children explicitly (decide and pin). |

**TMPL — Task & project templates**

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Task template with a predefined subtask checklist | The killer use of templates in PM tools: "onboarding a client" spawns 8 named subtasks. With a subtask tree shipping in the same milestone, checklists are natural | LOW-MEDIUM | Template = saved task shape: title, description, assignee hints, due-offset days, ordered subtask list (title + offsets). Apply → instantiate real tasks. |
| Project template (structure + starter tasks) | OpenProject/Taiga/Leantime all offer project-from-template; gr8r has repeatable project shapes (client onboarding, sprints) | MEDIUM | Template carries project name pattern, columns/labels if gr8r has them, and a task tree. Apply creates the project (respecting lead-on-create + permCreate rules from v2.0/v2.1). |
| Template gallery / picker at creation time | Convention: templates offered in the "New task"/"New project" flow, not buried in settings | LOW | A section in the creation modal listing templates (name, task count). No separate admin page needed at v1. |
| Template storage & CRUD | Templates are data, not document hacks | LOW | Server table (v2.2 `saved_views` precedent) or a document section behind the existing merge/normalize machinery. Create/edit/duplicate/delete; scope: workspace-wide list, creator-tagged. |
| Placeholders / due-date offsets | Users expect `{+N days}` or "due = creation date + N" semantics | MEDIUM | Minimal convention: per-task/subtask `dueOffsetDays`; absolute dates in a template are a known trap (stale dates when applied months later). |

**WHK — Per-project outbound webhooks**

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Per-project webhook targets (URL + event filter) | Vikunja: webhook targets attached to a project with per-target event selection; Taiga similar. gr8r requirement already scopes this way (project-scoped, not team) | MEDIUM | New server table `webhooks(project_id, url, secret, events[], enabled)`; CRUD routes gated to owner/admin/project-leader (gr8r's `projectPermFor` funnel). |
| Event catalog: task.created / task.updated / task.deleted / task.assignee / comment.created | These exact names are the Vikunja convention; Taiga uses `task.created`-style slugs too. Users wiring n8n/Power Automate recognize them | LOW | Map onto gr8r's existing server-side notification event points (assign/mention/comment/update paths already emit rows) — hook the same moments, don't invent a second event bus. |
| HMAC signature header + per-hook secret | Standard (Vikunja signs with the target secret; GitHub-style `X-Signature` conventions are the ecosystem default) | LOW | `X-Gr8r-Signature: sha256=<hmac(secret, body)>`; secret shown once at creation, hash-stored like gr8r's `psk_live_` API keys. |
| Payload envelope: event name, timestamp, project, task snapshot | Consumers (Power Automate parse-JSON) need a stable shape | LOW | `{ event, workspace, project: {id,key,name}, data: {task fields}, occurredAt }`. Deterministic field whitelist — see the Vikunja CVE pitfall in PITFALLS: never serialize with the triggering user's view. |
| Send with retry/backoff + failure visibility | Fire-and-forget silently losing deliveries is the #1 webhook complaint | MEDIUM | gr8r already owns an SMTP retry semantics backlog item (v2.3 POL) — mirror the same fail-absent + logged-failure pattern; a per-hook "last delivery / last error" readback beats a dead-letter queue at this scale. |
| Rate limiting per hook | Requirement already pinned (fail-absent + per-hook secret + rate-limit) | LOW | Simple token bucket or min-interval per target; skip-and-log on excess, never queue-bound. |

**MS Teams specifics (verified HIGH confidence):**

- The legacy Office 365 **incoming-webhook connector format (`MessageCard`, `@type: "MessageCard"` / `MessageOffice365`) is retired** — creation blocked Aug 2024, connectors disabled May 18–22 2026. Any "Teams webhook" feature built on MessageCard today is DOA for new setups.
- The current path is a **Teams Workflows webhook** (Power Automate "Post to a channel when a webhook request is received"), which expects an **Adaptive Card**: `{"type":"message","attachments":[{"contentType":"application/vnd.microsoft.card.adaptive","contentUrl":null,"content":{...adaptive card...}}]}`. All native Adaptive Card schema elements are supported **except `Action.Submit`**.
- However, per Microsoft message-center update **MC1181996**, Workflows webhooks also accept legacy **MessageCard payloads** for migration compatibility — so supporting BOTH envelopes is cheap and maximally compatible: detect target type per hook (a `format: teams-adaptive | teams-messagecard | raw-json` field on the webhook row) rather than hardcoding one.
- Card content conventions: `TextBlock` heading + `FactSet` (Assignee, Due, Priority) + `Action.OpenUrl` deep link to `/w/:slug/task/:key` (gr8r already has deep links from emails — reuse the same URL builder). No HTML in Adaptive Cards — use markdown subset (`**bold**`, links). Keep cards ≤ ~28 KB (Teams card size limit).
- Because payloads are raw JSON and any URL is user-supplied, gr8r's SSRF posture matters: the hand-rolled outbound fetch must be scheme-validated (https), and per the deployment profile the instance is self-hosted so internal-network policy is the operator's — document it in DEPLOY.md (Vikunja documents exactly this in its security-hardening page).

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Tree + templates + webhooks all zero-dependency | No self-hosted PM tool offers this trio without a plugin/queue service; gr8r's hard constraint (no new runtime deps) is itself a differentiator | — | Pure `node:crypto` HMAC + `fetch` (undici) with AbortController timeout. |
| Raw-JSON hook format alongside Teams formats | Lets gr8r webhooks feed n8n/Home Assistant/scripts, not just Teams — Vikunja users' top automation ask | LOW | The `format` field above costs one switch statement. |
| Template apply preserves subtask tree structure | Templates instantiating nested hierarchies (not just flat checklists) are rare outside Jira/Asana | LOW | Falls out free once templates store `parentId` references among their subtask list. |
| Per-hook delivery log + "send test event" button | Best-in-class webhook UX (Stripe-style); trivially buildable on the delivery log | LOW | One `POST …/test` route + a small read-only log panel in project settings. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|--------------|-----------------|-------------|
| Per-team webhooks | Teams already scope many things in gr8r | Explicitly out of scope this milestone (PROJECT.md); team→project is many-to-many so event scoping gets ambiguous | Project-scoped only; revisit when a real request exists. |
| Bi-directional Teams (approve tasks from a card) | Looks magical | Requires bot framework, OAuth, and Interactive `Action.Submit` — which Teams incoming webhooks explicitly do NOT support | `Action.OpenUrl` deep links only. |
| Nested-subtask progress edited by hand on parents | Users want to override rollup | Two sources of truth conflict constantly (OpenProject has the same fight with manual vs computed progress) | Computed-only rollup in v1; manual-override flag only if requested post-launch. |
| Unlimited-depth drag-and-drop tree in board view | Kanban cards with subtrees | Board cards are compact; dragging nested trees across columns breaks the swimlane model in every tool that tried it (Trello only does flat checklists on cards) | Tree lives in list/table views; board cards show a child-count badge + progress bar, click-through to the tree. |
| Template versioning/audit | Enterprise instinct | Overkill for a single-tenant-ish self-hosted workspace | Duplicate-then-edit is the convention (OpenProject does the same). |
| Generic webhook plugin/transform system (arbitrary templating of payloads) | Power-user appeal | Template injection = XSS-adjacent payload bugs; Vikunja's CVE-2026-123524 class of webhook information disclosure comes from exactly this complexity | Fixed envelope + fixed card renderers (adaptive/messagecard/raw). |

## Feature Dependencies

```
[SUB parentId + order model]
    └──requires──> [tree render + indent]
    └──requires──> [cycle-safe reparent]  (can ship after v1 render)
    └──enables──> [progress rollup]  (extend existing progressOf)
    └──enables──> [TMPL subtask-checklist templates]

[TMPL templates storage]
    └──requires──> [server-side template CRUD]  (saved_views table precedent)
    └──requires──> SUB model  (checklist templates instantiate subtasks)

[WHK webhooks]
    └──requires──> [existing server event points]  (notification emit sites: assign/mention/comment/update)
    └──requires──> [memberCanReadProject permission funnel]  (payload whitelisting)
    └──independent of──> SUB and TMPL  (except: does deleting a task emit task.deleted? decide once)
```

### Dependency Notes

- **SUB is the foundation:** templates that include subtask checklists only make sense once `parentId` exists; do SUB first.
- **WHK is independent** and the lowest-risk feature — it hooks gr8r's existing server-side emit moments. Good candidate for a parallel phase.
- **SUB conflicts with board-view UX** unless the board shows only flat cards + child badges (see anti-feature above).
- **POL backlog items are fully independent** — schedule them anywhere.

## MVP Definition

### Launch With (v2.4)

- [ ] SUB: `parentId`+`order`, indented tree in list/table, add-subtask/sibling, aggregated progress, tree-aware delete policy — the core hierarchy
- [ ] SUB: sibling drag-reorder; **reparent via drag OR promote/demote** (promote/demote is the cheaper honest v1)
- [ ] TMPL: task templates with ordered subtask checklists + due offsets; project templates with starter task tree; picker in the creation flows
- [ ] WHK: project-scoped CRUD (owner/admin/leader), event filter, HMAC-signed delivery, **Teams Adaptive Card + MessageCard + raw JSON formats**, rate limit, delivery-log readback, test-send
- [ ] POL: the four v2.3 backlog items (mobile hidden[] fields, SMTP retry semantics — which the webhook retry design should mirror, WR-01 CSS, Nyquist reconciliation)

### Add After Validation (v2.5+)

- [ ] Full drag-reparent with cycle detection UI polish — trigger: reparent demand from real usage
- [ ] Manual progress override on parents — trigger: user complaint that computed-only feels rigid
- [ ] Per-team webhooks — trigger: explicit owner request
- [ ] Template marketplace/import-export (JSON copy) — trigger: multi-workspace users

### Future Consideration

- [ ] Bi-directional Teams bot interactions — blocked on Adaptive Cards' Action.Submit being unsupported for incoming webhooks
- [ ] Webhook dead-letter queue with replay — trigger: delivery volume that makes the log insufficient

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| SUB parentId + tree render + rollup | HIGH | MEDIUM | P1 |
| SUB reparent (promote/demote first, drag second) | MEDIUM-HIGH | LOW→HIGH | P1 (demote) / P2 (drag) |
| TMPL task + project templates w/ checklists | HIGH | MEDIUM | P1 |
| WHK Teams webhooks (adaptive + messagecard) | HIGH | MEDIUM | P1 |
| WHK raw-JSON format | MEDIUM | LOW | P2 |
| WHK delivery log + test send | MEDIUM | LOW | P2 |
| Board-view child badges | MEDIUM | LOW | P2 |
| Drag-reparent full UX | MEDIUM | HIGH | P2/P3 |

## Competitor Feature Analysis

| Feature | Vikunja | OpenProject | Taiga | gr8r approach |
|---------|---------|-------------|-------|----------------|
| Subtask hierarchy | Unlimited nesting, aggregated percent-done | Work-package parent/child, drag-reparent, rollup, roadmap-level | Tree list, reorder | `parentId`+`order`, computed rollup via `progressOf` |
| Templates | Saved filter views only (weak) | Work-package templates (Enterprise), project templates | Issue templates via plugins | Native task + project templates with subtask checklists — a real differentiator vs Vikunja |
| Webhooks | Project-level targets, event filter, HMAC-signed, raw JSON | Enterprise webhooks (paid tier) | Webhooks on most objects (paid in some tiers) | Free in core, three payload formats incl. Teams cards |
| Teams format | Raw JSON only (user wires their own flow) | MessageCard-era (legacy) | Legacy MessageCard | **Adaptive Card first** (connectors retired May 2026), MessageCard + raw JSON as alternates |

## Sources

- Microsoft Learn — *Types of Cards & their Usage* (Teams): Adaptive Cards via incoming webhooks; Action.Submit unsupported — learn.microsoft.com/en-us/microsoftteams/platform/task-modules-and-cards/what-are-cards (HIGH)
- Microsoft 365 dev blog — *Retirement of Office 365 connectors within Microsoft Teams* (Aug 2024) + message-center MC1181996 (connectors disabled May 18–22, 2026; Workflows webhooks accept MessageCard payloads) (HIGH)
- Microsoft Support — *Send messages in Teams using incoming webhooks* (Workflows webhook, Adaptive Card envelope) (HIGH)
- Vikunja docs — Webhooks API & help pages: project-level targets, per-target events, HMAC signing, raw payloads; security-hardening page on outbound requests (HIGH)
- Rapid7 CVE-2026-123524 — Vikunja webhook payload built with the triggering user's permission context (information disclosure) (HIGH — pitfall evidence)
- OpenProject community roadmap — child work-package progress rollup, drag & drop ordering/reparenting features (MEDIUM)
- Atlassian Cloud changelogs — drag-reparent convention for hierarchical work items (MEDIUM)
- gr8r `.planning/PROJECT.md` — v2.4 scope, constraints (zero deps), existing systems (progressOf, memberCanReadProject, notification emit sites, saved_views precedent)

---
*Feature research for: gr8r v2.4 Automation & Productivity*
*Researched: 2026-11-15*
