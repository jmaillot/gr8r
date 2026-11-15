# Stack Research

**Domain:** Self-hosted PM workspace — hierarchical subtasks, task/project templates, per-project outbound webhooks (Microsoft Teams format)
**Researched:** 2026-11-15
**Confidence:** HIGH (payload/transport) · MEDIUM (template storage choice)
**Hard constraint honored:** zero new runtime or dev dependencies — every recommendation below is Node 24 stdlib, browser platform APIs, or a pattern already proven in this repo.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js built-in `fetch` / undici | Node 24 global | Outbound webhook POST delivery | Native since Node 18; `AbortSignal.timeout(ms)` for the per-delivery deadline. This is the web-push precedent (server.js:1693 dynamically imports a dep only because VAPID crypto is nontrivial — Teams delivery has no such complexity: it is a plain JSON POST). Zero packages. |
| `node:crypto` | Node 24 built-in | Per-hook secret generation (`randomBytes`), HMAC signing if a non-Teams target is ever added, `timingSafeEqual` for any secret comparison | The repo already uses it for TOTP, OIDC RS256/JWKS, scrypt and HMAC digest tokens (v1.9 UNSUB). No new dependency needed for secrets. |
| Workspace-document JSON tree | existing doc-PUT funnel | Subtask hierarchy + templates storage | Subtasks are ALREADY `t.subtasks[]` in the doc (server.js:887 normalizes them; src/actions/subtasks.js mutates them through doc PUT). A multi-level tree is a schema evolution of existing JSON, not new infrastructure: `mergeClientDoc` normalization and revision-based optimistic concurrency work unchanged. Zero migration, works identically on SQLite and pg because both store the same JSON document. |
| Server-side authority table (`project_webhooks` + delivery log) | additive migration, both backends | Webhook definitions, per-hook secrets, delivery history | Follows the exact `push_subscriptions` precedent (v2.2: "SQLite+pg mirror") and the `saved_views` table precedent (v2.2 D). Secrets must NOT ride the client-visible doc — `redactDoc()` would need yet another sweep and the doc PUT merge funnel is hostile to secret-bearing fields. A table keeps secrets server-only, gives an auditable delivery log, and needs the standard additive-migration machinery already proven (`test/migration.test.mjs`, byte-identical second boot, pre-backup). |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Adaptive Card / MessageCard JSON (hand-built objects, no schema lib) | Adaptive Card schema 1.4–1.6; MessageCard legacy | Teams message payload | **Critical current-state finding:** Microsoft permanently retired Office 365 Connectors (the classic `webhook.office.com` incoming webhooks) in the May 18–22, 2026 rollout. As of Nov 2026 the only webhook transport for Teams is the **Power Automate "Workflows"** webhook (`*.logic.azure.com/workflows/...` URLs), which accepts BOTH legacy MessageCard payloads (renders, but no interactive buttons) and Adaptive Card payloads (`{"type":"message","attachments":[{"contentType":"application/vnd.microsoft.card.adaptive","content":{...}}]}`). Build payloads as plain JS objects — no library. Target MessageCard for the simple case (title, text, facts→sections, OpenUri link) since it is the literal "MS Teams incoming-webhook format" the requirement names and Workflows still accepts it; keep the payload builder one small pure module so an Adaptive Card builder can be added later without touching delivery code. |
| Plain-JSON tree traversal (client + server, hand-rolled DFS) | — | Multi-level subtask rendering, aggregated progress, cycle guards | A 3-line recursive walk over `subtasks[].subtasks`. No tree library: the data lives in the doc, the client already renders flat subtasks in the drawer (src/actions/subtasks.js), and aggregation is `progress = doneLeaves/totalLeaves` via memoized DFS. Server-side aggregation is only needed for the FTS5/pg `task_search_projection` sync — extend the existing projection updater (db-adapter.mjs:514–537) to fold child titles into the folded text. |
| Template instantiation as pure doc-mutation functions | — | Task & project creation from templates | The app ALREADY has i18n `project.template.*` seed templates (src/actions/actions.js:1693, 4389) creating a project with predefined tasks. v2.4 templates = the same instantiation path, but definitions stored as editable data instead of i18n literals. Store template definitions as normalized fields in the workspace doc (or a `templates` table — see Variants below); instantiation clones them through the existing `normalizeTaskAssignees`/normalize pipeline so new docs are automatically valid. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Node built-in `node:test` + existing harness | Unit tests for tree/normalize/payload/webhook-queue logic | 1524-test suite; webhook delivery tests mock `fetch` via a module seam exactly like `sendPushFor` has a documented test seam (server.js:1779 comment "real web-push sender" swap). |
| Playwright e2e (existing) | Tree render, template flows, webhook config UI | No new tooling; existing 115-spec baseline. |
| Additive-migration scripts (existing pattern) | `project_webhooks` + `webhook_deliveries` tables on both backends | Copy the `push_subscriptions` migration shape: guarded, pre-backup, byte-identical second boot, dual SQLite/pg schema. |

## Installation

```bash
# NOTHING to install. Zero new dependencies is achievable and is the plan.
# Everything ships in Node 24 stdlib + the existing Vite browser bundle.

# Verify the two existing runtime deps remain the only ones:
node -e "const p=require('./package.json'); console.log(Object.keys(p.dependencies))"
# → expect ['pg', 'web-push'] unchanged after this milestone.
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Subtask tree as nested JSON in the workspace doc | Adjacency in SQL tables (`tasks.parent_id`) + `WITH RECURSIVE` queries | Only if tasks ever move out of the doc into their own table. Not now: the doc-PUT funnel, redaction, revision concurrency, export (xlsx/MSPDI/CSV), FTS projection and MCP mirror all read the doc; splitting tasks into SQL would be a rewrite, not a feature. Nested JSON keeps SQLite/pg parity trivially (both store the same document). |
| Nested `subtasks[]` arrays | Flat `flatSubtasks[]` with `parentId` + client tree-builder | Flat+parentId is friendlier to doc-PUT merge (smaller diffs on reorder) but breaks the existing `t.subtasks` shape every renderer, normalizer and export module already consumes. Choose nested arrays; handle reorder inside one parent locally. |
| Webhooks in a server table | Webhook config in the workspace doc | Only if hooks must be visible/redactable through the client doc copy. Rejected: secrets in the doc are a redaction hazard and doc-PUT merge (client-can-delete-what-it-can't-see) risks accidental hook deletion by stale clients. |
| Hand-rolled rate limit (token bucket per hook in memory) | Dependency-based limiter / Redis | Never for this app — single-process server, self-hosted, zero-dep constraint. An in-memory bucket with a config cap (e.g. max N deliveries per hook per minute, burst absorbed by a bounded retry queue) matches the "rate-limit" requirement and the existing fire-and-forget discipline. |
| Adaptive Card payloads first | MessageCard payloads first | Use Adaptive Card only if interactive buttons become a requirement (they need bot-backed Action.Submit — out of scope). MessageCard is simpler, matches the named requirement format, and Workflows still renders it. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Any npm tree/nested-set library (nestedsets, tree-model, etc.) | The tree lives in a JSON document inside a JSON column; SQL tree libs are meaningless there and every one is a new dependency (hard constraint) | Hand-rolled recursive walk, ~20 lines |
| `webhook.office.com` URL support as the primary target | Retired May 18–22, 2026 — Microsoft's endpoints reject these requests now. Shipping "incoming webhook format" against the dead endpoint produces an integration that cannot work on current Teams | Accept any HTTPS POST URL (Workflows endpoints are `*.logic.azure.com/workflows/...`), validate it is https, keep the MessageCard body format |
| A Teams SDK / `teams-notification` package | The delivery is one `fetch` POST of a JSON object; an SDK adds a dependency and nothing else | ~60-line `sendTeamsCard()` module mirroring `sendPushFor()` structure |
| Cron/queue dependency for webhook retries | The scheduler precedent (zero-dependency `runReminderPass()` with transactional `reminders_sent` claim, v1.5) already exists in-repo | Extend the same pass pattern: delivery rows with `status`, `attempts`, `next_attempt_at`; the unref'd tick retries with capped backoff |
| Storing webhook secrets or delivery logs in the workspace doc | Redaction/merge funnel hazard + doc churn bumps revisions for every delivery write — a delivery log write must NOT charge a doc revision (the same reason reminders "never write off-hour or bump revisions") | Server-only tables; hook CRUD endpoints bump nothing; delivery writes are table-only |
| `Intl.MessageFormat` or any ICU template engine for Teams message text | Doesn't exist in Node 24, and the app's `t()` + JSON catalogues already cover EN/FR with an i18n-scan build gate | Existing `tFor()` server catalogue for message strings (Phase 36 precedent) |

## Stack Patterns by Variant

**Subtask tree (SUB):**
- Keep `t.subtasks` as nested arrays: `subtasks[i].subtasks[]` recursively.
- Extend `normalizeTaskAssignees`-style normalization (server.js:887) into a `normalizeSubtree()`: clamp depth (recommend max 5 levels), dedupe ids, guard cycles (a child id may not appear as an ancestor — fail the PUT with a stable error code per the ERR-01 pattern), filter assignees per the existing sweep (server.js:2585).
- Aggregated progress computed on read (client) and in the search-projection updater (server) — never stored on the parent, or doc-PUT merge will fight over it.
- Export modules (export-xlsx/MSPDI/CSV/gantt) need a shared `flattenTaskTree()` helper so all four flatten identically (the export-model precedent).

**Templates (TMPL):**
- Recommended storage: normalized workspace-doc fields (`templates[]` with `{id, kind: 'task'|'project', name, tasks[]}`), because template CRUD then rides the existing doc-PUT funnel + revision concurrency for free and needs no dual-backend migration. Validate with a `normalizeTemplate()` in `mergeClientDoc`.
- Variant: a `templates` server table (saved_views precedent) if the owner wants templates decoupled from doc revision churn or shared across workspaces later.
- Instantiation reuses the existing project-from-template code path (src/actions/actions.js:4389) generalized to data-driven definitions.

**Webhooks (WHK):**
- Tables: `project_webhooks(id, workspace_id, project_key, url, secret, events, enabled, created_at)` + `webhook_deliveries(id, hook_id, event_id, status, http_status, attempts, next_attempt_at, last_error, created_at)`. Dual schema in db-adapter.mjs (SQLite + pg), additive migration with pre-backup.
- Delivery module: `sendWebhookFor(wsRow, nextDoc, event)` called from the same notification sites that call `sendPushFor` (server.js:2121, 5882) — reuse the gate order (permission → prefs → send) and the fail-absent rule (hook rows fetched per project; missing/deleted hook = no-op).
- Payload: MessageCard JSON with `@type "MessageCard"`, `summary`, `title`, `text`, `sections[].facts`, `potentialAction[].OpenUri` deep-linking to `/w/:slug/task/:key` (the existing APP_URL deep-link builder). Content-type `application/json`.
- Security: URL must be https; secret used to sign an `Authorization`/`X-GR8R-Signature` HMAC-SHA256 header (Workflows ignores unknown headers; useful if the hook is later pointed at non-Teams receivers); `AbortSignal.timeout(5000)`; fire-and-forget with the delivery row as the audit trail; rate limit per hook in-memory token bucket; retry with capped exponential backoff through the existing unref'd tick, exactly-once via a delivery-claim like `reminders_sent`.
- Fail-absent semantics: a hook that fails N consecutive deliveries auto-disables with an owner-visible flag (prevents retry storms against dead endpoints).

**SMTP-down email retry (POL)** — already in scope of the same delivery-retry work: the capped-backoff delivery queue above is the natural place to give email sends a retry row too, without touching nodemailer itself.

## Version Compatibility

| Component | Compatible With | Notes |
|-----------|-----------------|-------|
| Node 24 `fetch` + `AbortSignal.timeout` | Node ≥ 18.17 / ≥ 17.3 | Both stable globals in Node 24. No polyfill needed. |
| Workflows webhook endpoints | MessageCard (renders, no buttons) + Adaptive Card ≤ 1.6 | ~28 KB message size limit — truncate task text server-side (the `truncate` helper from Phase 40 is exported already). |
| Existing doc schema | nested `subtasks` are backward-compatible | Old clients/tests reading `t.subtasks[i]` flat still work for level 1; seed data and old docs need no migration (a boot-normalization sweep like the Phase 33 "update-only boot sweep" is optional). |
| `pg` + `node:sqlite` dual backend | both get identical new tables | Follow `push_subscriptions` mirror + `POSTGRES_TEST_URL` matrix. |
| Vite chunk gate (500 kB) | unaffected | Tree recursion + payload builder are server-side and small client-side helpers; keep new client code out of the entry chunk per the D-02 lazy-chunk pattern. |

## Sources

- learn.microsoft.com — "Create & Send Actionable Messages" + "Retirement of Office 365 connectors within Microsoft Teams" (devblogs.microsoft.com, updated 2026-04-14): O365 connectors dead May 18–22, 2026; Workflows webhooks accept MessageCard + Adaptive Card payloads — **HIGH**
- learn.microsoft.com — Adaptive Card via incoming webhook payload shape (`type:"message"`, `attachments`, `contentType`) — **HIGH**
- epifive.com + github.com/nicholas-fedor/shoutrrr PR #887 (2026): real-world migrations confirm `*.logic.azure.com/workflows/` endpoints, 28 KB limit, Flow-bot identity limits — **MEDIUM**
- Repo evidence: server.js:887/2585 (subtask normalization), server.js:1693–1798 (sendPushFor + test seam), db-adapter.mjs:470–567 (FTS5 + pg projection parity), v1.5 reminder scheduler precedent (exactly-once claim, unref'd tick, no revision bumps), v1.9 UNSUB HMAC tokens, PROJECT.md standing zero-dependency constraint (owner-validated every milestone since v1.1) — **HIGH**
