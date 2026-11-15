# Research Summary — gr8r v2.4 "Automation & Productivity"

**Milestone:** v2.4 — hierarchical subtasks (SUB), task/project templates (TMPL), per-project outbound webhooks in MS Teams format (WHK), plus v2.3 backlog polish (POL)
**Synthesized:** 2026-11-15
**Sources:** STACK.md · FEATURES.md · ARCHITECTURE.md · PITFALLS.md

---

## Executive Summary

gr8r is a self-hosted PM workspace whose spine is a single workspace document pushed client→server through a `mergeClientDoc` funnel with revision-based optimistic concurrency, redaction, FTS projection sync, MCP mirror, and a fire-and-forget notification tail. Every v2.4 feature must be built as an *extension of that spine*, not a new write path — that is the unanimous architectural conclusion of all four research files, and it is what makes the hard constraint (zero new runtime dependencies, currently `pg` + `web-push` only) achievable.

The recommended approach: (1) **SUB** adds a `parentId` field to the existing flat `t.subtasks[]` array — tree-ness becomes a view built by shared helpers, so every existing sweep (normalization, assignee guards, redaction, export) keeps working on all depths without recursion. (2) **TMPL** stores template definitions as `data.templates[]` in the workspace doc behind a strict allow-list sanitizer; instantiation is a client-side copy through the existing doc-PUT funnel — no new route, no MCP duplication, no revision special-casing. (3) **WHK** keeps webhook configuration in two new server tables (`webhook_hooks` + `webhook_deliveries`, following the `push_subscriptions`/`saved_views` dual-backend mirror precedent) and derives events from a pure `storedDoc`-vs-`next` diff collected in-transaction but delivered post-commit, fire-and-forget, exactly like email/push today. (4) **POL** clears the four v2.3 backlog items; the SMTP retry work and the webhook delivery-retry work should share one claim-state-machine design.

Key risks, in severity order: **SSRF via admin-supplied webhook URLs** (Pitfall 7 — https-only + resolved-IP deny-list re-validated at every delivery, threat model with `threats_open: 0`), **tree shape breaking the merge/redaction funnel** (Pitfall 1 — redacted-writer byte-identical merge tests before any UI), **webhook secrets leaking through the client-visible doc** (Pitfall 8 — tables only, show-once, no URLs in logs), **template stale-id capture and schema drift** (Pitfalls 5/6 — allow-list serializer, never stringify a live task), and **standing-gate erosion** (Pitfall 16 — only ~2 kB entry-chunk headroom remains; all new UI must lazy-load via the D-02 pattern).

A verified external fact shapes WHK: Microsoft permanently retired Office 365 Connector webhooks (May 18–22, 2026). The only supported target is Power Automate **Workflows** URLs, which accept both legacy MessageCard and Adaptive Card payloads. Build all three payload formats (teams-adaptive, teams-messagecard, raw JSON) behind a per-hook `format` field — the cost is one switch statement and it maximizes compatibility. Do not hardcode `webhook.office.com`; accept any https URL the admin pastes.

---

## Key Findings

### Stack (STACK.md)

- **Zero new dependencies is achievable and is the plan.** Delivery = Node 24 global `fetch` + `AbortSignal.timeout`; secrets/signatures = `node:crypto` (`randomBytes`, HMAC-SHA256); storage = existing JSON doc + two additive mirror tables. Verify `package.json` dependencies stay `['pg','web-push']`.
- **Teams transport, verified HIGH:** O365 Connectors retired May 2026 → Workflows endpoints (`*.logic.azure.com/workflows/...`) accept MessageCard + Adaptive Card (≤ 1.6, no `Action.Submit`); ~28 KB payload cap → clamp/truncate server-side.
- **Webhook tables (one clear recommendation):** `webhook_hooks(id, workspace_id, project_id, name, url, secret, events, disabled, …)` + `webhook_deliveries(id, hook_id, event_key, status, http_status, error, at)` — dual SQLite/pg schema, text ids, integer timestamps, JSON-as-text, `?` placeholders, parity-suite rows in the same commit.
- **Retry machinery already exists in-repo:** the v1.5 reminder scheduler pattern (transactional claim, unref'd tick, no revision bumps) extends directly to webhook deliveries and SMTP retry.
- ⚠️ **STACK vs ARCHITECTURE conflict — resolved in favor of ARCHITECTURE:** STACK recommends nested `subtasks[i].subtasks[]` arrays; ARCHITECTURE (file:line grounded in all five sweeps that iterate `t.subtasks` flat) and PITFALLS (anti-pattern list) recommend **flat array + `parentId`** so zero existing sweeps need recursion. **Ruling needed in the SUB spec before UI code.** Consensus points both agree on: max depth cap (3–5 levels), cycle rejection server-side, `parentId` added to the `mergeClientDoc` normalize whitelist or it is silently stripped.
- TMPL storage: doc-embedded `templates[]` (STACK + ARCHITECTURE agree); the server-table variant is only justified if the owner wants templates decoupled from doc revision churn.

### Features (FEATURES.md)

- **Table stakes SUB:** multi-level nesting, aggregated progress rollup (extend existing `progressOf` — computed, never stored), indented tree in list/table views, sibling drag-reorder with fractional `order` keys, tree-aware notifications/redaction/delete.
- **Table stakes TMPL:** task templates with ordered subtask checklists + `dueOffsetDays` (absolute dates in templates are a known trap), project templates with starter task tree, template picker in the creation flows.
- **Table stakes WHK:** per-project CRUD gated to owner/admin/leader, event filter (`task.created/updated/deleted/assignee`, `comment.created` — Vikunja naming convention), HMAC `X-Gr8r-Signature`, stable minimal payload envelope, retry/backoff + delivery-log readback, per-hook rate limit.
- **P1 differentiators:** raw-JSON hook format (feeds n8n/Home Assistant — Vikunja users' top ask), templates instantiating nested trees (rare outside Jira/Asana), delivery log + "send test event" button (Stripe-style UX, trivial on the log).
- **Anti-features (explicitly out of scope):** per-team webhooks, bi-directional Teams bots (Action.Submit unsupported), manual progress override on parents, drag-nested-trees in board view (use child-count badge + progress bar), template versioning/marketplace, arbitrary payload templating (the Vikunja CVE-2026-123524 information-disclosure class comes from exactly that).
- **Dependencies:** SUB enables TMPL (checklists embed trees); WHK is mechanism-independent of SUB/TMPL but sequenced last so event vocabulary covers template-driven bulk creates; POL is fully independent.
- MVP adds **promote/demote** as the honest v1 reparent; full drag-reparent defers to v2.5.

### Architecture (ARCHITECTURE.md)

- **Do not add a fourth write path.** Three write seams exist (doc-PUT funnel server.js:5804–5892, MCP `writeDoc` mcp.js:183–190, server-side doc-editing routes); the v2.2 FTS pattern (pure diff, in-tx collect / post-commit deliver) is the standing template for webhooks. MCP `writeDoc` gains one emit line → all ~20 agent tools get webhook parity for free.
- **SUB:** flat + `parentId`; shared `subtreeOf`/`depthOf` helpers; depth-aware changes at exactly six aggregation points (taskProg rollup, progressOf, export model rows, Gantt unchanged, optional FTS fold, delete-confirmation count). Rollup is derived-on-read only.
- **TMPL:** `data.templates[]` + one `sanitizeTemplateBody()` applied on read (normalizeDoc) *and* write (mergeClientDoc) — unknown fields dropped, old templates degrade gracefully. Templates store only existing task vocabulary; template `subtasks` validated through the same SUB whitelist so templates can't smuggle invalid trees. MCP gets read-only tools only.
- **WHK:** emission gated on "this transaction bumped the revision" — reminder/digest passes deliberately excluded (no-bump writes; boot catch-up would stampede hooks). Exactly-once via `(hook_id, event_key)` claim in-tx; per-hook 2s coalescing window; N-strike auto-disable with owner notification; registry routes are revision-free.
- **Boundary rule:** webhook events derived from member-authored PUTs may include private-project task data — ship title + key + deep link only, never the task body; document the visibility ruling in the threat model.

### Pitfalls (PITFALLS.md)

Top five with prevention:

1. **SSRF via webhook URLs (WHK, critical):** https-only at save *and* re-validated at every delivery; resolve DNS then pin the resolved IP, rejecting loopback/RFC1918/169.254.0.0/16; deny-by-default. WHK phase runs with `threats_open: 0` (Phase 30 pattern).
2. **Tree breaks merge/redaction funnel (SUB, critical):** `parentId` is a new merge "sink" — whitelist entry + redacted-writer byte-identical merge test pair before any UI code.
3. **Secret handling (WHK):** tables only, show-once at create (`psk_live_` precedent), redacted URL in UI, log hook id + status only, never bodies/URLs. Admin dashboard raw-doc view (DASH-04) must not surface hooks.
4. **Retry storms / sync blocking (WHK + POL):** never await delivery in the funnel; bounded attempts (2–3), backoff only on 429-with-`Retry-After`/5xx/network; 4xx = permanent fail; 28 KB clamp; latency-isolation test (hanging endpoint must not delay the PUT). SMTP retry = same claim-state machine; never blanket re-drive (duplicate-email invariant).
5. **Standing-gate erosion (all phases):** ~2 kB entry headroom — tree/template/webhook UI lazy-loaded (D-02), EN+FR keys same commit, no gate edits, no test-count decrease, no `retries` masking.

Also load-bearing: MCP parity as a standing requirement in every phase (one shared validator, three call sites, round-trip tests, MCP.md updated); dual-backend pg schema in the same commit + matrix run; export engine gets ONE ordered-DFS flattening feeding xlsx/MSPDI/CSV with `OutlineLevel` round-trip test.

---

## Implications for Roadmap

### Suggested phases (build order consensus: SUB → TMPL → WHK → POL)

1. **Phase: SUB — Hierarchical subtask tree** — *first because it changes the task shape both later features embed and consume; touches the most surfaces (store, actions, views, export, i18n, possibly FTS).* Delivers: `parentId`+`order` model, tree render in list/table, add-subtask/sibling, promote/demote, computed rollup via extended `progressOf`, tree-aware delete policy, export flattening. Must avoid pitfalls 1, 2, 3, 4, 11, 13, 17; carry the merge-sink funnel tests in the first plan.
2. **Phase: TMPL — Task & project templates** — *depends on SUB (template bodies embed trees); pure client + doc work, no tables; verifies the sanitizer.* Delivers: allow-list serializer, `sanitizeTemplateBody`, picker in creation flows, instantiation through the normal PUT (one revision per instantiation), MCP read-only tools. Must avoid pitfalls 5, 6, 11; pin the older-shape regression fixture.
3. **Phase: WHK — Per-project outbound webhooks** — *mechanism-independent but sequenced last so event vocabulary is stable and template-driven bulk instantiation is testable end-to-end; also the phase requiring a threat model.* Delivers: two mirror tables (pg variant same commit), registry CRUD routes (revision-free), `diffWebhookEvents` + post-commit delivery module, three payload formats, HMAC, SSRF defense, bounded retry + auto-disable, delivery log + test-send. Must avoid pitfalls 7, 8, 9, 10, 12, 11; run with `threats_open: 0`.
4. **Phase: POL — v2.3 backlog polish** — *fully independent; can interleave anywhere or close the milestone.* Delivers: mobile `hidden[]` card fields (minimum-field rule, e2e at 390×844 + 641–900px band), SMTP retry claim-state machine (share the WHK delivery-retry design — spec them together or extract a common helper), WR-01 CSS scoping, Nyquist reconciliation. Must avoid pitfalls 14, 15, 16.

### Research flags for planning

- **Needs `/gsd-plan-phase --research-phase`:** SUB (the STACK↔ARCHITECTURE storage-shape conflict must be resolved as an owner ruling in the spec before plans are written), WHK (SSRF threat model + delivery/claim design; only MEDIUM-confidence external source).
- **Well-documented patterns, skip research:** TMPL (fully grounded in repo precedent — i18n seed templates, saved_views, merge funnel), POL (all four items have shipped-context precedents; SMTP retry reuses the reminders_sent claim pattern).

### Owner rulings to surface during requirements/spec

1. SUB storage shape: flat `parentId` (recommended) vs nested arrays — resolve STACK↔ARCHITECTURE conflict.
2. Parent-done semantics: auto-cascade to descendants, or aggregate display only?
3. Subtask titles in FTS: in (both-backend fold change + parity tests) or out (zero FTS work) for v2.4?
4. Template visibility scoping for private-project references (recommend: readable only where the project is).
5. Webhook scope: strictly per-project this milestone (recommend yes, matching the out-of-scope per-team ruling).
6. Webhook creation via MCP: explicitly out of scope, or gated to the same owner/admin/leader tier.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Node 24 stdlib capabilities and repo precedents verified with file:line evidence; only the Teams-delivery target is MEDIUM (external service) |
| Features | HIGH | Teams card format & connector retirement verified against Microsoft Learn + dev blog; tool conventions cross-checked against Vikunja/OpenProject/Taiga docs |
| Architecture | HIGH | Every current-behavior claim read from live code with citations; WHK payload/target specifics MEDIUM (service evolving) |
| Pitfalls | HIGH | Derived from PROJECT.md shipped ground truth; OWASP SSRF and Microsoft rate-limit facts MEDIUM |

**Gaps to address during planning:**
- The SUB storage-shape conflict (flat vs nested) — blocking ruling for the SUB spec.
- Teams Workflows behavior is service-side and can evolve (rate limits, MessageCard compat) — mitigate with per-hook `format` field, don't hardcode URL shapes, and keep the payload builder a small pure module.
- Whether subtask text joins FTS — decides whether SUB includes a dual-backend parity-suite change or none at all.
- SMTP retry design should be co-specced with WHK delivery retry to avoid two divergent retry machines.

---

## Sources

Aggregated from the four research files (full citations inline there):

- **Repo ground truth (HIGH):** `.planning/PROJECT.md`, `server.js` (funnel 5804–5892, subtask sweeps, SCHEMA/DDL 299–421, `sendPushFor` + test seam, reminder scheduler), `db-adapter.mjs` (`syncTaskFts`, `runSchema`, projection DDL), `mcp.js` (`writeDoc`), `src/core/store.js` (`taskProg`/`progressOf`), `src/actions/actions.js`, `src/export/model.js` + `gantt.js`, migration/parity test suites
- **Microsoft (HIGH):** Learn — Teams cards & incoming webhooks; M365 dev blog — O365 connector retirement + message-center MC1181996
- **Competitor docs (HIGH/MEDIUM):** Vikunja webhooks + security hardening; OpenProject roadmap; Atlassian changelogs
- **Security (MEDIUM):** OWASP SSRF Prevention Cheat Sheet; Rapid7 CVE-2026-123524 (Vikunja webhook information disclosure)
- **Practitioner (MEDIUM):** epifive.com + shoutrrr PR #887 (Workflows migrations, 28 KB limit); webhook retry-storm literature
