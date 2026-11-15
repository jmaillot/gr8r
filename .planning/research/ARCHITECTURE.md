# Architecture Patterns — Subtask Tree, Templates, Per-Project Webhooks

**Domain:** v2.4 Automation & Productivity additions to gr8r (Projects Studio)
**Researched:** 2026-11-15
**Confidence:** HIGH for system-specific claims (verified against live code, file:line cited); MEDIUM for the Teams-delivery target (external service, evolving)

> Grounding note: every "current behavior" claim below was read directly from `server.js`, `mcp.js`, `db-adapter.mjs`, `src/core/store.js`, `src/actions/actions.js` and `src/export/model.js` on this working tree. This document assumes the documented architecture (doc-PUT funnel, revision, FTS sync, notification fan-out) is as shipped in v2.3.

## Recommended Architecture (summary)

Three features, three different integration depths:

| Feature | Lives in | New write path? | New table? |
|---------|----------|-----------------|------------|
| SUB subtask tree | `t.subtasks[]` in the doc, with a `parentId` field | **No** — rides the existing doc-PUT funnel untouched | No |
| TMPL templates | `data.templates[]` in the doc | **No** — instantiation is a normal client edit through the funnel | No |
| WHK webhooks | Server-side registry, **not** the doc | **No new write path** — a post-commit observer over the existing diff | Yes (2) |

The central architectural decision: **do not add a fourth write path.** The codebase already has three document-writing seams — the whole-PUT funnel (`server.js:5804-5892`), MCP `writeDoc` (`mcp.js:183-190`), and server-side doc-editing routes — and v2.2's FTS work (58-02, D-07) already established the right pattern for extending them: a pure diff function over `storedDoc` vs `next`, run in-tx for things that must roll back, post-commit for things that must not (email/push precedent at `server.js:5876-5882`). Webhooks reuse that exact shape.

---

## 1. SUB — Hierarchical subtasks

### Where the tree lives

Today a subtask is a flat, single-level object inside the task's `subtasks[]` array: `{id: uid('s'), title, done, assignees[], start?}` (`src/actions/actions.js:910,1103`). There is **no parent field on subtasks** — "parent" exists only as a UI notion (the subtask page links back to its owning task, `src/features/subtasks.js:21`) and as an export row key (`PARENT.n`, `src/export/model.js:178-222`). The milestone brief's "id/parent links exist" is half-true: `id` exists; the parent *link* is what this feature adds.

**Recommendation: keep subtasks flat in `t.subtasks[]` and add a `parentId` field.** Do not nest arrays.

- `parentId: null | string` — either the parent task's own subtask id (a subtask's parent is always a subtask; the owning task is the implicit root), or absent for level-1 subtasks.
- Every existing sweep already iterates `t.subtasks` flat: `normalizeTaskAssignees` (`server.js:887-888`), the member-removal assignee sweep (`server.js:2585-2586`), the assignee write-guard scope check (`server.js:1541-1551`), `mergeClientDoc` normalization (`server.js:1280-1285`), and the export model (`src/export/model.js:185`). A flat array with a link field means **zero changes to any of these** — they keep working on all depths for free.
- Nested arrays (`sub.subtasks`) would force every one of those sites to recurse, and the redaction/merge funnel's restore-what-you-cannot-see contract becomes recursive too. That is the rewrite-shaped mistake.

Tree-ness is a **view**: one shared pure helper (`subtreeOf(task, parentId)` / `depthOf(task, subtaskId)`) built client-side, and mirrored server-side only where the server needs it (see aggregation below).

### Aggregation points (each must become depth-aware)

| Point | File | Current | Change |
|-------|------|---------|--------|
| Task progress chip | `src/core/store.js:496-500` `taskProg` | counts direct `subtasks[]` | bottom-up rollup: leaf `done` counts bubble to ancestors; parent auto-done when all descendants done (owner ruling needed on auto-cascade) |
| Project progress | `src/core/store.js:491-495` `progressOf` | counts tasks `status==='done'` | unchanged — but define whether a parent with incomplete children can be `done` (see pitfalls) |
| Export model rows | `src/export/model.js:178-222` | one level, `PARENT.n` keys, D-54-9/10 | extend to `PARENT.n.m…`; keep "never outlive a filtered-out parent" (D-54-10) as a subtree rule |
| Gantt | `src/export/gantt.js:120` | filters `!r.parent` | unchanged — top rows only |
| FTS fold | `db-adapter.mjs:506-531` `syncTaskFts` | folds `t.title` + `t.desc` only | **decision point:** if subtask titles should be searchable, extend the folded text to include descendant subtask titles — and change it identically on both backends (the byte-identical parity suite at `test/db-adapter.test.mjs` pins this) and update the change-detector (`nt.title === t.title && nt.desc === t.desc`, line ~544) to watch a derived `fold` value instead. Otherwise no FTS change at all. |
| Delete-task confirmation | `src/actions/actions.js:837` | "its N subtasks" | subtree count |

Write-path invariants that survive unchanged: subtask edits ride the same whole-PUT doc funnel, same revision, same 409 handling; `parentId` must be part of the mergeClientDoc/normalize field whitelist (a one-line addition) or it will be stripped silently — this is the classic schema-drift failure mode for doc-embedded fields (D-53-1 precedent: adding `p.perms['team:…']` keys needed no new sink because it reused existing fields; a *new* subtask field does need an explicit whitelist entry).

## 2. TMPL — Task & project templates

### Where templates live

**Recommendation: `data.templates[]` in the workspace document**, not a server table.

- Templates are workspace-shared, low-volume, and need the same redaction/visibility contract as everything else in the doc (private-project tasks in a template must be invisible to non-members — the funnel gives this for free).
- A server table would need a new route family, dual-backend DDL, and — critically — a **second write path** for instantiation that the MCP mirror would also have to replicate. Doc-embedded templates inherit the funnel, revision, MCP and redaction with no new machinery.

### Avoiding schema drift — the key constraint

A template that stores "task-shaped" JSON will rot as task fields evolve (e.g. the v2.1 `assignees[]` migration, the v2.4 `parentId` addition). Prevention, in order of importance:

1. **Templates store only existing task/project vocabulary.** `{id, name, scope: 'task'|'project', body: {…task fields…, subtasks: [...]}}`. No new field names are invented for the template system itself.
2. **One sanitizer, one whitelist.** `sanitizeTemplateBody()` applied on every read (`normalizeDoc`) and every write (`mergeClientDoc`), mirroring the existing pattern for notifPrefs (dual strip, `server.js:1508`) and perms. Unknown fields are dropped, not preserved — old templates degrade gracefully when a field dies.
3. **Instantiation is a client-side copy, then a normal PUT.** "Create task from template" = build the task object in the client (same code path as manual task creation, `actions.js:90-98` shape), apply defaults, send one doc PUT. The funnel validates the result exactly as if a human typed it. No `POST /apply-template` route, no MCP duplication, no revision special-casing. Template instantiation of a task with 15 subtasks is simply one PUT whose diff shows 16 new ids.
4. **Instantiation is never bulk-server-side.** A "project from template" is the client creating the project and its tasks in one or a few PUTs — identical to today's project-creation flow (`projectCreateForbidden` refusals already ride the 200 `refused[]` array, `server.js:5820-5823`).
5. Template `subtasks` bodies are validated through the same subtask field whitelist as SUB, so `parentId` inside a template is depth-validated at save time (dangling `parentId` → dropped, fail-closed) — templates cannot smuggle an invalid tree.

MCP mirror: templates need **read tools only** (`list_templates`, optional `get_template`); agents instantiate by calling the existing task/project creation tools with the template body. Zero write-path duplication.

## 3. WHK — Per-project outbound webhooks

### The registry does NOT live in the doc

Webhook configs are config data, not collaboration data: they must not bump the doc revision (an admin adding a hook would 409 every other editor), must not ride `mergeClientDoc` (redaction/merge semantics are about *workspace content*), and must be readable by the server even for members who can't see the doc. Precedents: `saved_views`, `notif_prefs`, `push_subscriptions` — all server tables for exactly these reasons (v2.2 decisions).

**Two new tables, added to the existing dual-backend schema discipline** (the SCHEMA block at `server.js:299-421` + pg branch in the adapter's `runSchema`, per 58-02 / db-adapter.mjs:358-362 — statement-splitting, idempotent `if not exists`, one source pair so they can't drift):

```sql
webhook_hooks (
  id text primary key,           -- uid('wh')
  workspace_id text not null,
  project_id text,               -- null = all projects in the workspace? (scope ruling)
  name text not null,
  url text not null,             -- https only, validated at save
  secret text not null,          -- random hex, used for HMAC signature
  events text not null,          -- JSON array: ["task.created","task.completed",...]
  disabled integer not null default 0,
  created_by text, created_at integer
)

webhook_deliveries (
  id text primary key,
  hook_id text not null,
  event_key text not null,       -- <event>:<entity-id>:<seq> — dedup claim
  status text not null,          -- 'ok' | 'fail' | 'retry'
  http_status integer, error text,
  at integer not null
)
```

Parity rules for the new tables (mirroring `push_subscriptions`, `server.js:401-421`): text ids both backends, `integer` timestamps both backends (never `timestamp`), JSON arrays as text (the codebase stores JSON columns as text everywhere — teams, events, saved views), no dialect-only types (no `tsvector`, no `jsonb`), CRUD through the existing async facade `db.get/run/all` with `?` placeholders. Add DBA parity-suite rows to `test/db-adapter.test.mjs` (POSTGRES_TEST_URL matrix) proving identical CRUD + dedup behavior on both backends.

Registry CRUD routes: `GET/POST/PATCH/DELETE /api/w/:slug/webhooks` gated to owner/admin/project-lead (same gate shape as the audit/teams admin routes; `requireWorkspace` minRole + lead check like `p.lead`/`p.perms` logic). These routes are **revision-free** — they must answer without a `revision` field and never touch `workspaces.revision` (the invite-accept 55-08 precedent: doc-scoped writes skip the bump; table writes like notif-prefs have never carried one).

### Where delivery hooks into the write path

**The emission seam is the storedDoc-vs-next diff**, not any specific route:

1. Extract a pure function `diffWebhookEvents(storedDoc, next, meta)` → event list. The funnel already computes this diff for `logDocChanges` (`server.js:5875`) — the webhook collector is a sibling. Event derivation is id-based Set/Map diffing, exactly the `syncTaskFts` shape (`db-adapter.mjs:506-531`): new task ids → `task.created`, `done`-transition → `task.completed`, new comment ids in `data.comments` → `comment.created`, new project ids → `project.created`.
2. **Call sites** (all existing seams emit for free):
   - Doc-PUT funnel (`server.js:5862`): collect inside the tx (pure, no I/O), deliver **after commit** — the exact collected-in-tx / sent-after-commit shape of `queueNotifEmails` + `sendPushFor` (`server.js:5843-5882`). This is the standing template; copy it, don't invent.
   - MCP `writeDoc` (`mcp.js:183-190`): add the same post-commit emit inside `writeDoc` — one line, so all ~20 agent tools get webhook parity automatically.
   - Comment routes and any server-side doc-editing route: comments live in the doc, so comment-created events surface through the funnel diff naturally; any route that edits the doc through a dedicated transaction gets the same one-line emit.
   - **Excluded:** the reminder scheduler and digest pass deliberately write with no revision bump (`server.js:1989,2042`) — their doc diffs must NOT emit webhooks (a reminder is not a task change; and bulk boot-time catch-up would stampede hooks). Gate emission on "this transaction bumped the revision."
3. **Delivery** (`webhooks.mjs`, new module): post-commit, fire-and-forget, per-hook, never blocks the response, errors logged and recorded in `webhook_deliveries`. Coalescing mirrors the v2.2 inbox burst coalescing precedent (D-11/61): per hook, a short window (e.g. 2s) batching events into one Teams message per task. Rate-limit: client-side token bucket per hook (Teams workflows tolerate roughly ~4 msgs/10s per channel; be conservative), overflow → `status:'retry'` rows, not dropped silently.
4. **Exactly-once-ish claim:** insert-claim on `(hook_id, event_key)` uniqueness in the same tx as the doc write — mirrors `reminders_sent` transactional claim (`server.js` reminder pass, REM-01..05 pattern) and `newNotifs` id-diff dedup (`server.js:5847-5848`). Deliveries are at-least-once with the claim preventing duplicates across concurrent PUTs.
5. **Fail-absent contract:** a dead hook never fails a write, never fails the 200 response, never retries into the revision path. After N consecutive failures (e.g. 20), mark `disabled:1` and emit an owner notification row (reuse `notifyMembers` shape with a system actor) — same spirit as push's "Browser blocked" badge. No automatic re-enable.

### Teams payload specifics (MEDIUM confidence — external service)

Office 365 connector-based incoming webhooks **were retired (May 2026 rollout)**; the supported target is a Power Automate **Workflows** URL ("When a Teams webhook request is received" trigger). Consequences for the implementation:

- Payload: the Workflows trigger accepts the raw JSON body; the de-facto standard is `{"text": "…"}` (or `{"attachments":[{...adaptive card}]}`) — the same shape connector webhooks used, so one formatter serves both generations of URL. Format as `**<workspace>/<project>** <verb> [task title](APP_URL/w/:slug/task/:key)` — deep links reuse the v1.5 email-link machinery (`APP_URL + /w/:slug/task/:key`).
- **Don't hardcode the URL shape.** Store whatever URL the admin pastes; send plain JSON; offer a "Test delivery" button (the `sendPushFor(ws, doc, [testNotif], true)` test pattern, `server.js:4679`).
- **Signature header:** `X-Gr8r-Signature: sha256=<HMAC-SHA256(body, secret)>` via `node:crypto` (zero deps, D-12). Teams ignores it; it future-proofs non-Teams consumers and makes the per-hook secret meaningful.
- **SSRF is the real threat model:** the server fetches admin-supplied URLs. Validate https-only at save, and use a custom DNS resolve to reject private/loopback/link-local ranges before connect (node:http/undici — no new deps). This belongs in the phase threat model (Phase 30/31 security-contract precedent).

### What webhooks must NOT touch

- **Revision semantics:** zero interaction. Registry writes are table writes; emissions are post-commit; deliveries never write the doc.
- **FTS sync:** zero interaction. Templates don't enter FTS (a template is not a task); subtask-tree FTS is an opt-in extension of `syncTaskFts`'s fold inputs only (§1).
- **Redaction:** webhook events derived from a PUT that a member authored may contain private-project task data. Deliver to the hook regardless (the hook owner configured it at project scope — visibility ruling: hooks see what the project lead sees), but note it in the threat model: **never** ship the whole task body to a hook URL; ship title + key + link only.
- **MCP:** writeDoc gains the emit line; registry gains optional read-only tools. No new authenticated surface beyond that this milestone.

---

## Component Boundaries (new vs modified)

| Component | Status | Responsibility |
|-----------|--------|----------------|
| `t.subtasks[].parentId` (doc field) | **new field** | tree links; whitelist entry in normalize/mergeClientDoc |
| `subtreeOf`/`depthOf` helpers (client) | **new** | tree views; single source of tree math |
| `taskProg` rollup | **modified** | depth-aware aggregation |
| `src/export/model.js` | **modified** | multi-level `PARENT.n.m` rows |
| `data.templates[]` + `sanitizeTemplateBody` | **new** | doc-embedded templates, whitelist sanitizer |
| Template instantiation (client) | **new** | copy-through-PUT; no new route |
| MCP `list_templates` | **new (tool)** | read-only mirror |
| `webhook_hooks` / `webhook_deliveries` | **new** | dual-backend tables, SCHEMA + pg branch |
| `/api/w/:slug/webhooks` CRUD + test-deliver | **new routes** | lead/admin-gated, revision-free |
| `webhooks.mjs` (`diffWebhookEvents`, `deliverWebhooks`, coalescer, HMAC) | **new module** | pure diff + fire-and-forget delivery |
| Doc-PUT funnel tail | **modified** (one collect + one post-commit call) | emission hook |
| `mcp.js` `writeDoc` | **modified** (one line) | emission parity |
| FTS `syncTaskFts` | **modified only if** subtask titles become searchable | fold-input extension, both backends + parity tests |
| Notification fan-out (email/push) | **unmodified** | webhooks are a third sibling channel, same gate order shape |

## Data Flow (webhook event lifecycle)

```
client PUT (or MCP writeDoc)
  → db.tx: revision check → docFromClient → update workspaces
      ├─ syncTaskFts(scope, …)            [in-tx, rolls back]
      └─ collect = diffWebhookEvents(storedDoc, next)   [pure]
  → commit (revision+1)
  → post-commit tail (never blocks response):
      ├─ queueNotifEmails / sendPushFor   [existing]
      ├─ for each event: claim (hook_id, event_key) into webhook_deliveries
      └─ per-hook coalescing window → format Teams payload
           → HMAC sign → fetch → record status
           → fail-absent (log + row; N strikes → disable + owner notif)
```

## Suggested Build Order

1. **Phase A — SUB (subtask tree).** First: it changes the task shape (`parentId`) that both later features touch (templates embed subtask trees; webhook events should carry subtree-aware titles). Touches the most surfaces (store, actions, views, export, i18n, possibly FTS fold).
2. **Phase B — TMPL (templates).** Depends on A (template bodies embed trees; tree validation exists). Pure client + doc work; no tables; verifies schema-drift sanitizer.
3. **Phase C — WHK (webhooks).** Independent of A/B in mechanism but sequenced last so the event vocabulary is stable and template-driven bulk instantiation (`task.created` × N in one PUT) is testable end-to-end. New tables + routes + module; this is the phase that needs a threat model (SSRF).
4. **Phase D — POL (v2.3 backlog).** Independent, can interleave or close the milestone.

Dependency one-liners: tree before templates (templates embed trees); registry before Teams formatting is a non-issue (same phase, registry first inside it); webhooks last so events cover template-driven creates.

## Anti-Patterns to Avoid

- **Nested `subtasks` arrays** — forces recursion into every existing sweep, redaction, and export; flat + `parentId` is the D-53-1-style zero-sink answer.
- **Webhook config in the doc** — revision churn for admins, mergeClientDoc complications, no table-backed delivery log. Use the saved_views/push_subscriptions precedent.
- **A dedicated `POST /apply-template` server route** — a fourth write path the MCP mirror would duplicate, with its own revision semantics to debug. Client-side copy through the funnel is free and safe.
- **Emitting webhooks from inside the transaction** — a hung Teams endpoint would hold the doc write. Deliveries are post-commit fire-and-forget, like SMTP (`server.js:5876`).
- **Reminder/digest-pass emissions** — they write without revision bumps on purpose; emitting there stampedes hooks at boot catch-up.
- **`jsonb`/`tsvector` in the new pg tables** — breaks the byte-identical parity suite discipline; stay with text + `?` placeholders.

## Scalability / Volume Considerations

| Concern | Small workspace (today) | Larger (10k tasks) |
|---------|------------------------|--------------------|
| Whole-doc PUT cost of a deep tree | flat array, no change | same — tree math is O(subtasks), diff already O(doc) |
| Webhook fan-out per PUT | 1–3 events | per-PUT events bounded by the diff; coalescer keeps deliveries ≤ ~1/msg per hook per window |
| Delivery log growth | negligible | prune `webhook_deliveries` older than N days in the existing boot-sweep habit (ftsSweep precedent) |

## Open Questions (owner rulings needed)

- Does completing a parent auto-complete descendants, or is parent-done just an aggregate display? (affects `taskProg`, export, webhook `task.completed` semantics)
- Are templates workspace-global or per-project-visible (private-project fields inside a template body must redact — simplest rule: a template saved with a private-project task ref is only readable where the project is)?
- Can one webhook be workspace-wide (project_id null) or strictly per-project? (brief says per-project — recommend strict this milestone, matching the "per-team webhooks out of scope" line)
- Subtask titles in FTS: in or out for v2.4? (in = both-backend fold change + parity tests; out = zero FTS work)

## Sources

- `server.js` — doc-PUT funnel tx + post-commit tail (5804–5892), subtask sweeps (849–888, 2579–2586, 1541–1551), SCHEMA/push_subscriptions/saved_views DDL (299–421), reminder no-bump writes (1989, 2042), push test pattern (4679)
- `db-adapter.mjs` — `syncTaskFts` diff shape + fold inputs (506–560), `runSchema` dialect ownership (358–362), task_search_projection DDL (470–496)
- `mcp.js` — `writeDoc` single revision-bump seam (176–190)
- `src/core/store.js` — `notifyMembers` dedup/coalescing (437–489), `taskProg`/`progressOf` (491–500)
- `src/actions/actions.js` — subtask create shape (90, 910, 1103), delete copy (837)
- `src/export/model.js` — D-54-9/10 subtask export rows (178–222); `src/export/gantt.js:120`
- Microsoft Learn / M365 dev blog — O365 connector retirement; Workflows "When a Teams webhook request is received" trigger (MEDIUM confidence, service evolving)
