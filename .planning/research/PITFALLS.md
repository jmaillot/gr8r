# Pitfalls Research — v2.4 Automation & Productivity

**Domain:** Adding hierarchical subtasks, templates, and per-project outbound webhooks to an existing single-tenant-via-workspace PM system (Projects Studio / gr8r)
**Researched:** 2026-11-15
**Confidence:** HIGH for system-specific pitfalls (derived from PROJECT.md shipped ground truth: doc funnel, dual backend, MCP mirror, export engine, FTS projection, notification fan-out, standing gates); MEDIUM for external facts (Microsoft Learn, OWASP, webhook practitioner literature)

This milestone is *additive to an existing system*, so the most dangerous pitfalls are integration failures with structures that already exist — not greenfield design errors. Each pitfall names the phase (SUB / TMPL / WHK / POL) that must address it.

---

## Critical Pitfalls

### Pitfall 1: Subtask tree breaks the `mergeClientDoc` / redaction funnel (SUB)

**What goes wrong:**
The whole project doc travels client→server on every write through `mergeClientDoc()`, which restores hidden rows (private projects, access fields) that a redacted client cannot see. A subtask tree introduces a *second* hierarchy inside tasks: if `mergeClientDoc` normalization and the removal sweeps only know the flat `t.subtasks[]` shape, a redacted writer can (a) silently delete sibling-tree branches it can't see on a shared task, (b) write a `parentId` pointing at a task in a private project it can't read, or (c) mutate fields on subtasks it never received.

**Why it happens:**
The funnel was built for one flat level. Every new nested shape is a new "sink" that must be explicitly registered in the merge/normalize/removal-sweep trio — exactly the lesson of D-53-1 (per-team perms deliberately avoided a new top-level field "so mergeClientDoc/normalize/removal sweeps needed no new sink").

**How to avoid:**
- Decide the shape in the SUB spec before any UI code: keep nesting *inside* the existing task object (a `children[]` array on the subtask record) rather than adding cross-task `parentId` references. Parent-by-containment needs no merge repair; parent-by-id needs the sweep.
- If `parentId`/cross-task references are unavoidable, the merge step must re-attach orphaned ids from storage the same way it restores hidden rows, and the removal sweep must drop dangling references in one transaction.
- Add a funnel test pair: (1) redacted client writes a task with a visible tree and the hidden sibling branches survive byte-identical; (2) server-side normalization rejects or repairs trees with unknown/foreign ids.

**Warning signs:** tests that pass only when the caller is admin/owner; merge diff tests that only cover one nesting level; "orphan subtask" rows appearing after a guest edits a project.

**Phase to address:** SUB (spec + first plan; funnel tests before UI).

---

### Pitfall 2: Cycle creation via re-parenting (SUB)

**What goes wrong:**
Re-parenting a subtask under one of its own descendants (A → B → A) produces an infinite loop in every tree walker: progress rollup, render, export, depth counters. If the server trusts client tree structure, the client *is* the validation — but MCP tools and the doc funnel write server-side too, so client-only guardrails are bypassable.

**Why it happens:** containment trees make cycles impossible by construction, but drag-drop re-parenting or id-based re-parenting with "remove from old parent, append to new parent" logic has a window where the validator sees the wrong intermediate state, and MCP writes go straight to the server.

**How to avoid:**
- Server-side cycle check on every tree write: walk up from the proposed parent; reject if it reaches the moving node. This is O(depth), trivially cheap, and must live in the shared validator the MCP mirror also calls (the D-53-2 "one shared validator" pattern — validate in one place used by UI/API *and* MCP, not in the UI).
- Also enforce a max depth (3–4 levels) — depth guards are what break accidental cycles and keep rollup/export sane.
- If containment-tree is chosen, cycles are structurally impossible; the residual risk is only duplicate ids, so add an id-uniqueness assertion in normalization.

**Warning signs:** a `RangeError: Maximum call stack` or hung request in any traversal; export of one project never finishing; unit test suite hanging rather than failing.

**Phase to address:** SUB (server validator in the first plan; MCP parity in the same plan).

---

### Pitfall 3: Progress aggregation double-counts (SUB)

**What goes wrong:**
`progressOf` exists (v2.1 decision M-10) and export, dashboards, and project progress all read it. Once subtasks have progress, every aggregator is tempted to count both parent progress and its children's rollup — or to recompute rollup inside a loop that also recomputes it for the grandparent. Classic symptoms: project progress > 100%, a parent stuck at partial progress even though every leaf is done, or numbers changing depending on traversal order.

**Why it happens:** progress was previously a single scalar per task; the tree adds a "computed vs stored" ambiguity. Every consumer (board, table, timeline, export rows, PSTAT, admin dashboard aggregates) will invent its own rule unless one function owns it.

**How to avoid:**
- ONE rule, one function: parent progress = derived, never stored; leaves only. Do not persist rollup values into the doc — persisted rollup goes stale on every concurrent edit and corrupts under the optimistic-concurrency merge model.
- Double-count guard as a unit test table: leaf-only, nested 3 levels, mixed stored/derived, and "parent with manual progress + children" (decide explicitly: children override, or ignore children when set manually — pick one, document it, test it).
- Audit every existing `progressOf` call site (export engine, dashboard aggregates, timeline) and make them all call the same function — the export model already builds rows from task data and must not duplicate rollup logic.

**Warning signs:** two modules with locally-defined progress math; project totals drifting after subtask edits; e2e asserting exact percentages in more than one place.

**Phase to address:** SUB (mid-phase, before export/dashboard integration).

---

### Pitfall 4: Delete cascade semantics for trees — moving, not deleting (SUB)

**What goes wrong:**
Deleting a parent subtask: delete whole subtree? Orphan the children? Promote them? And the *project-delete* path: existing deletion already removes referencing rows; subtask trees inside task objects get deleted "for free," but any **cross-references introduced for the tree** (watchers, reminders fan-out per subtask assignee, FTS projection entries, export links) will dangle. The v2.1 multi-assignee work already fans reminders out per subtask assignee — nested subtasks with assignees multiply those fan-outs, and a delete must not leave `reminders_sent` claims or notification rows pointing at dead subtask ids.

**Why it happens:** cascades were designed for the flat list; each new consumer of subtask identity (FTS, reminders, export, webhooks in WHK) adds one more thing that must be swept on delete.

**How to avoid:**
- Pick one rule in the spec (simplest: deleting a parent deletes the subtree; no promote), enforce it server-side in the shared validator, and unit-test the sweep across every consumer table (`reminders_sent`, notification rows, FTS shadow index, export temp data).
- The FTS projection pitfall is real here: `syncTaskFts` is in-transaction — if subtask text joins the FTS index, the sync must be updated in the same transaction as the delete, or a boot sweep must be able to heal it (the existing boot-sweep healing is the recovery path; verify it covers subtask text).
- Template-created tasks (TMPL) inherit this: deleting a template never deletes instantiated tasks; deleting a *task created from a template* must never touch the template.

**Warning signs:** search returning deleted subtasks until reboot; reminder emails for deleted subtasks; export crashing on a dangling parent link.

**Phase to address:** SUB (cascade matrix as an explicit requirement; verified in SUB verification plan).

---

### Pitfall 5: Template stores live object references (stale ids) instead of a shape (TMPL)

**What goes wrong:**
A template is authored by serializing an existing task/project. If the serialization captures live ids — assignee user ids, file ids, saved-view ids, project ids, watcher lists, notification rows, existing subtask ids, webhook config — then instantiating the template in another project (or another workspace, or after members leave) creates tasks referencing objects that don't exist, or worse, *grants access* by copying assignees/perms into a context where they shouldn't exist.

**Why it happens:** the doc is a plain JSON document; "JSON.stringify the task" is the obvious one-liner, and none of the ids break in the happy path (same project, same members, right after creation).

**How to avoid:**
- Templates store a *shape*, not a snapshot: fields explicitly allow-listed (title, description, PSTAT, dates-as-offsets, subtask tree structure, labels), with an explicit transform list for everything id-bearing: assignees → cleared or role-named placeholders; file ids → dropped (names only, per the system's file model); dates → offsets from instantiation date; subtask ids → regenerated.
- Serialize through the same normalization the write funnel uses, so the template can never contain fields the funnel would strip anyway.
- Instantiation is a normal doc write: it goes through `mergeClientDoc`, bumps revision once (not once per subtask), and fires the notification fan-out *once*, not per created row (the v2.2 duplicate-unread refresh ruling shows how noisy fan-out already is).

**Warning signs:** a template JSON containing any `user`-id-shaped field; an instantiated task whose assignee chips render as unknown users; 409 revision storms right after a big template instantiation.

**Phase to address:** TMPL (schema decision in spec; allow-list test in first plan).

---

### Pitfall 6: Template schema drift — template and live task shapes diverge silently (TMPL)

**What goes wrong:**
Task shape keeps evolving (multi-assignee v2.1, subtask tree SUB, hidden[] card fields POL). A template saved in milestone X is instantiated in milestone X+2 where the task shape gained fields. If instantiation is `Object.assign(baseShape, templateData)`, stale templates inject shapes missing new required fields — or the serializer over-captures new fields (like the whole new subtask tree, or webhook config) that templates were never designed to carry.

**Why it happens:** nothing validates templates against the *current* task schema at instantiation; the i18n dead-key gate exists for catalogues but there is no equivalent shape gate for templates.

**How to avoid:**
- One `instantiateTemplate(tpl, ctx)` function is the only constructor path; it builds from an explicit base shape, never spreads template data wholesale.
- Add a schema-version field to stored templates and a boot/first-use migration that drops unknown fields (the migration machinery — pre-backup, byte-identical second boot — is the established pattern, e.g. Phase 34 dual-strip + boot sweep).
- Test: a template fixture saved with an *older* shape instantiates without crashing and without injecting stripped fields; a template carrying a future/unknown field is dropped loudly in tests, not silently in production.
- Strip secrets from templates by construction: a template must never capture webhook URLs, per-hook secrets, or TOTP-adjacent fields (see Security Mistakes).

**Warning signs:** template serialization tests that re-serialize a live doc instead of a fixture; instantiating a v2.1-era template after SUB lands throws or renders broken chips.

**Phase to address:** TMPL (first plan; regression fixture pinned in the SUB-then-TMPL ordering — build templates *after* the subtask tree settles, or explicitly version across it).

---

### Pitfall 7: SSRF via user-supplied webhook URLs (WHK) — the highest-severity new risk

**What goes wrong:**
Per-project webhooks mean any project leader/admin/owner submits a URL the *server* will POST to. A malicious or careless URL (`http://169.254.169.254/...`, `http://localhost:8443/api/...`, `file://`, internal Traefik/admin endpoints) turns outbound delivery into a server-side request forgery foothold into the Docker network, the pg database behind `DB_URL`, or cloud metadata. DNS rebinding bypasses a naive hostname check: the URL validates as `teams.microsoft.com`, then re-resolves to `10.x.x.x` at connect time (OWASP: domain allowlisting alone does not prevent rebinding — validate the resolved destination IP).

**Why it happens:** the endpoint is admin/leader-gated, which feels like enough trust; and Node's `fetch` happily connects anywhere.

**How to avoid:**
- Scheme allow-list: `https://` only (Teams endpoints are always https).
- Resolve DNS *then* connect to the resolved IP, validating the resolved IP against a deny-list (loopback, RFC1918 private ranges, link-local 169.254.0.0/16 including the metadata address, ULA, 0.0.0.0) at connect time — with zero deps this is `dns.promises.lookup` + manual range checks + a custom `Agent`/dispatcher pinning the resolved address, or `net.Socket` level control; `node:https` request with `lookup` option pinned pre-validation is the dependency-free pattern.
- Re-validate on every delivery (not just at save-time) — rebinding and operator-side infra changes happen after save.
- Deny-by-default beats allow-listing here: blocking internal ranges (SSRF) is the correct default for a self-hosted app; an optional operator allow-list env (`WEBHOOK_ALLOWED_HOSTS`) is a hardening knob, not the primary defense (Langfuse's `outbound URLs` knob is the precedent for self-hosted products).
- Config: the milestone's "per-hook secret + rate-limit + fail-absent" decisions come with the URL policy as a first-class threat-model item — Phase 30's 17-threat security contract pattern applies (run the WHK phase with `threats_open: 0`).

**Warning signs:** webhook save accepts `http://`, IP-literal URLs, or `localhost` in tests you wrote to "see what happens"; any code path that fetches before validating; the secret appearing in logs (see Pitfall 8).

**Phase to address:** WHK (threat model + IP validation in the first plan; this is the phase's security core).

---

### Pitfall 8: Webhook secret handling — storage, display, and signature (WHK)

**What goes wrong:**
Teams incoming-webhook URLs are themselves secrets (anyone with the URL can post to the channel). Mistakes: storing the URL/plaintext secret in the *workspace document* (which is sent to every project member on every read — the doc is client-visible by design!), echoing the full URL back in GET responses or UI, logging payloads/URLs on delivery failure, and skipping an HMAC signature on the outbound POST when a custom receiver is ever added.

**How to avoid:**
- Webhook config lives in a server table (the `push_subscriptions`/`saved_views` mirror-table precedent — v2.2 decisions), never in the workspace doc. Dual-backend parity (SQLite + pg schema variant) comes with the table, like every prior mirror table.
- Response/UI shows a redacted URL (last 6 chars) after creation; the full URL is returned exactly once at create, like API-key `psk_live_` handling (Phase 46 precedent — hash storage, show-once).
- Never log request bodies or URLs; failure logs carry hook id + status code only. The admin dashboard reads the "raw stored doc" (DASH-04) — confirm webhook rows are not in it.
- Rate-limit per hook *server-side* (Teams enforces ~4 requests/second per incoming webhook; bursts → 429), and treat `429` with the `Retry-After` header as a backoff signal, not an error to retry immediately (see Pitfall 9).

**Warning signs:** webhook URL present in a `GET /api/workspaces/:slug` payload or any client-bundled code; secrets in `console.error` paths; the admin dashboard rendering a hook URL.

**Phase to address:** WHK (data-location decision in spec; show-once + redaction tested in first plan).

---

### Pitfall 9: Retry storms — async delivery done wrong, or sync delivery blocking the funnel (WHK)

**What goes wrong:** two opposite failure modes.
- **Sync:** awaiting Teams delivery inside the doc-write transaction/request path couples the whole `mergeClientDoc` → revision bump → response pipeline to a third-party endpoint. A slow/429ing Teams tenant stalls every project write, and 409 revision storms follow as other writers pile up. This directly contradicts the established fire-and-forget email/push pattern (`sendPushFor`, SMTP fire-and-forget).
- **Async-naive:** unbounded retries on failure ( Teams 429s, network partitions) — a fan-out over N webhook × N events with retry-on-any-error reproduces the retry-storm pattern: every failed delivery multiplies load exactly when the target is unhealthy, and retries without a delivery record re-deliver duplicates (Teams cards look "spammy" — the classic webhook complaint).

**How to avoid:**
- Deliveries are async, fire-and-forget with a small in-process queue (the reminder-scheduler pattern: clock-injectable, `unref`'d, never writes revisions, exactly-once via a transactional claim — mirror `reminders_sent` with a `webhook_deliveries` claim table).
- Retry policy: bounded attempts (2–3) with exponential backoff *only* on retryable statuses (429 honoring `Retry-After`, 5xx, network error); 4xx (400, 401, 413) = permanent failure, no retry, recorded as failed. Cap the queue; drop-with-log under pressure (fail-absent is the milestone's stated decision — honor it).
- Payload budget: Teams rejects > ~28 KB ("Request Entity too large") — clamp/ truncate the card server-side and unit-test the boundary, exactly like the 4096-octet push payload budget in Phase 59.
- Never block: the doc funnel returns before the first delivery attempt; a test must prove a hanging webhook endpoint doesn't delay the PUT response.

**Warning signs:** PUT latency correlates with a dead webhook URL; duplicate Teams messages after a transient 500; unbounded memory growth in the delivery queue under load.

**Phase to address:** WHK (delivery model decision in spec; latency-isolation test in first plan).

---

### Pitfall 10: PII and private-project data leaking through webhook payloads (WHK)

**What goes wrong:**
Webhook payloads naturally copy task fields — but the system's core invariant is *redaction*: private projects, scoped members, guest visibility. A webhook configured on a public project can still receive payloads describing members, assignee emails, private notes; worse, if the payload builder reads from the raw stored doc, it bypasses `memberCanReadProject`/`redactDoc` entirely. Teams channels have guests. Also: notification content already carries deep links — payloads containing `APP_URL + /w/:slug/task/:key` links leak the slug and task key to a channel audience that may include non-members.

**Why it happens:** the webhook fires on events (assignment, comment, status change) computed from contexts that are already permission-filtered for a *user* — but webhooks have no user. There is no identity to inherit scope from; the hook's project is the only scope.

**How to avoid:**
- Payload builder renders only the project-scoped, minimal field set (task title, key, status, project name, deep link) — never emails, member lists, comments bodies unless explicitly configured, and never cross-project data.
- Run the payload through the same redaction lens as a project-member read (the funnel, not the raw doc — the admin dashboard's raw-doc access is an *admin-only* exception, not a payload precedent).
- Config: mention usernames not emails in cards; the "fail-absent" stance extends to data — absent fields are better than leaked fields.
- Unit-test the payload with a guest-scoped viewer and a private project and assert field-by-field.

**Warning signs:** a payload test snapshot containing `@email` or `assignees[].email`; payload built from `doc` directly instead of a projected event object.

**Phase to address:** WHK (payload schema fixed in spec; redaction tests in first plan).

---

### Pitfall 11: MCP mirror blind spots — new features invisible or bypassable to MCP agents (SUB/TMPL/WHK)

**What goes wrong:**
The 35-tool MCP surface exposes "real workspace operations" through the same permission funnel — but each new feature adds a *second implementation obligation*: if MCP tools create/edit tasks, they must accept the new subtask-tree shape, enforce cycle/depth/orphan rules, instantiate templates, and *never* configure webhooks unless the permission tier matches (owner/admin/project-leader only per WHK's decision). The recurring project pattern is that MCP parity was handled by shared validators (D-53-2), and each milestone where it was forgotten produced bypassable rules.

**Why it happens:** MCP tools deserialize arguments separately from the UI path; shape drift between UI writes and MCP writes is invisible until an agent writes a malformed tree.

**How to avoid:**
- Rule: every SUB/TMPL/WHK server validator is written once and called by all three write paths (UI API, doc funnel merge, MCP). Webhook *creation* via MCP: either explicitly out of scope this milestone (document it) or gated to the same tier — never silently allowed because "MCP has full access."
- Add MCP-shaped round-trip tests to each feature phase: create tree via MCP tool → same validation errors as UI; instantiate template via MCP → identical shape gate.
- The FTS projection is shared: MCP-created subtasks must sync `syncTaskFts` in-transaction like every other write path.

**Warning signs:** a validator function only imported by `server.js`, not `mcp.js`; MCP docs (`MCP.md`) not updated in the feature phase; an agent able to set a webhook on a project it's only a viewer of.

**Phase to address:** every feature phase (SUB/TMPL/WHK) as a standing parity requirement — named in each phase's verification.

---

### Pitfall 12: Dual-backend divergence on new tables and JSON shapes (SUB/TMPL/WHK)

**What goes wrong:**
Every new server table (webhook config, deliveries claim, template storage) must exist in both SQLite (`node:sqlite`) and the pg schema variant with the same semantics — the pg schema uses bigint epoch columns where SQLite uses ms-number conventions. The known deferred issue ("ensureColumn defs stay `integer` on pg") shows drift already tolerated once; webhook delivery-claim tables are exactly where timestamp semantics bite (claim expiry math in seconds vs ms). Additionally, if the subtask tree is stored inside the doc, both backends are fine — but any *SQL-side* aggregation over tree data (e.g. recursive CTE for FTS or export) must exist in both dialects, and SQLite FTS5 vs pg `task_search_projection` must index subtask text identically (the byte-identical parity suite is the established proof standard).

**Why it happens:** development defaults to SQLite; pg only differs in CI/`POSTGRES_TEST_URL` matrix runs, which are easy to skip locally.

**How to avoid:**
- Every new table lands in the same commit as its pg schema variant + the copy-script awareness (`scripts/copy-sqlite-to-pg.mjs`); every phase runs the pg test matrix, not just the SQLite suite.
- Prefer storing tree data in the doc (no SQL recursion needed); if SQL must traverse, write the query twice and pin both with the parity suite.
- Timestamp columns: define once in the adapter with explicit unit, test the claim-expiry boundary (a delivery claim that expires instantly or never on one backend).

**Warning signs:** a new table present in `server.js` `ensureColumn` calls but absent in the pg migration file; the pg matrix skipped in a plan's verification; webhook retries firing at 1s intervals on pg and instantly on SQLite.

**Phase to address:** WHK primarily (tables), SUB if FTS extends (parity suite), TMPL if server-stored.

---

### Pitfall 13: FTS projection desync from subtask text (SUB)

**What goes wrong:**
The FTS ground truth is "one in-transaction `syncTaskFts` path + boot-sweep healing." When subtask titles/descriptions become searchable (the natural expectation once they exist), each write path must update the projection with the *aggregated* subtask text in the same transaction — partial updates from one write path (e.g. drag-drop re-parent) leave the index stale until a reboot heals it, and the membership-gated `/search` route then returns results whose snippet no longer matches the task.

**How to avoid:**
- Extend `syncTaskFts` to fold the full tree text; re-parent/delete must call it too (same transaction). Test: re-parent then search → correct snippet, no boot needed.
- Keep the accent-insensitive matching behavior identical for subtask text (the tokenized NFC+lowercase matcher closure, SEARCH-01, is the standard).
- The pg parity suite (byte-identical projections) must cover tree text.

**Warning signs:** search hits for a subtask after a fresh boot only; parity suite failures after any tree edit; the `/search` route returning a task whose subtask was deleted.

**Phase to address:** SUB (in the same plan that introduces tree storage, before the search UI catches up).

---

### Pitfall 14: Mobile `hidden[]` card-fields contract — the desktop field set and mobile card drift (POL)

**What goes wrong:**
Phase 64 shipped the mobile card stack "byte-untouched desktop." The deferred backlog item is mobile card fields driven by a `hidden[]` contract: users hide columns and expect the card stack to honor the same visibility. Pitfalls: (a) `hidden[]` currently drives the *table* columns; reusing it for cards couples two surfaces with different field sets (cards need fields the table doesn't show, e.g. assignee chips vs date), so a naive pass-through hides fields cards can't afford to lose (assignees on a card with no other identity); (b) the Phase 64 "no second Playwright project, no chunk-gate edits, zero waivers" contract makes it tempting to ship mobile changes *without* dedicated e2e — the exact "weakened assertions" discipline the project guards against; (c) CSS scoping: the sibling WR-01 item (`.page.flush .toolbar` over-scoping) is the cautionary precedent — a mobile-field CSS rule scoped too broadly re-breaks desktop, violating "desktop byte-untouched."

**How to avoid:**
- Treat `hidden[]` as *column* visibility for the table, and define the card field list as a projection of it with explicit minimum-field rules (title + status + at least one identity field always visible, never hideable).
- Mobile e2e stays in the existing project at 390×844 (the Phase 64 proven viewport), asserting the *card* renders hidden-field absence — not just that the table hides columns.
- The 641–900px Option-B band must be re-tested when card fields change — it renders the same card stack.

**Warning signs:** a card with no assignee/date because everything was hidden; an e2e that only checks `display:none` on table cells; a CSS rule outside a mobile-only media query.

**Phase to address:** POL (dedicated backlog-clearing phase; verification at 390×844 + the band).

---

### Pitfall 15: SMTP retry semantics — the v2.3 backlog item has a specific trap (POL)

**What goes wrong:**
"SMTP-down email retry semantics" sounds like "add retries," but the system's invariants make naive retries harmful: notifications fan out per-recipient with prefs gating and the exactly-once `reminders_sent` claim; the digest has a transactional send claim; the post-UAT ruling mandates that duplicate unread rows *refresh in place, never re-email*. Wrong retry designs: (a) retrying on send failure *without* a persisted "sent/unsent" marker re-sends everything queued before the outage when the queue drains (duplicate emails — violates the no-double-send invariant from the standing constraints); (b) retrying *with* a claim marked too early (mark-then-send) loses the email permanently when the process dies between mark and send; (c) blocking the notification fan-out on SMTP timeouts makes inbox rendering and push delivery stall behind a dead relay.

**How to avoid:**
- Model on the established exactly-once pattern: a persistent claim row with an explicit state transition — attempt → (send success | failed, attempts+1) — claimed rows only retried up to N times with backoff, and a failed-forever row surfaced somewhere auditable (the operator audit trail pattern).
- Send in the background (fire-and-forget precedent); the notification row is the record of "what should have been emailed," so recovery can be a re-drive of failed rows, not a blanket re-send.
- Distinguish event types: reminder/digest claims (already exactly-once, do not touch) vs per-event notification emails (the ones needing retry). Retrying digests risks double-digest; the 09:00 claim window makes that visibly wrong.
- Budget: SMTP timeouts must be short and non-blocking — same latency-isolation test as WHK deliveries.

**Warning signs:** duplicate emails after an SMTP outage ends; reminder claims consumed by failed sends (emails permanently lost); inbox page load latency correlating with SMTP health.

**Phase to address:** POL (spec the claim-state machine before touching any send path; regression tests with a mock SMTP that fails then recovers).

---

### Pitfall 16: Standing-gate erosion while adding features (SUB/TMPL/WHK/POL)

**What goes wrong:**
The standing constraints (zero new runtime dependencies, 500 kB chunk gate at 498 kB with only ~2 kB headroom on the *entry*, EN+FR i18n gate, 1524+ unit tests, e2e 115/115, lint) are easy to erode one "small" addition at a time: a drag-drop tree library to avoid writing one; a webhook-delivery library ("just a small retry helper"); a tree-rendering component pushing the entry over 500 kB; EN-only new strings sneaking in. The 2 kB entry headroom means *any* un-lazy-loaded tree UI code is likely to breach the gate — the Vite code-splitting pattern (shared lazy Settings chunk) is the established mitigation and must be used for template pickers and tree UI, not fought with gate edits.

**Why it happens:** each feature alone seems under the threshold; the gate is breached in the last phase, forcing a rushed refactor.

**How to avoid:**
- Every feature plan carries its own gate checklist item (entry chunk delta measured per phase; i18n keys added EN+FR in the same commit; lint clean; unit count grows, never shrinks).
- Any dependency temptation goes to the owner as an explicit D-12-style amendment decision (the web-push and pg amendments are the only two precedents — both owner-approved, exact-pinned).
- Lazy-load tree/template/webhook UI into shared chunks like `openSettings`; the D-02 splitting pattern exists for exactly this.
- Zero weakened assertions: no `retry`-masking of new flaky tests (VIEW-02 de-flake proof standard: passes deterministically at retries=0).

**Warning signs:** "we can tweak the chunk gate to 510 kB just for this phase"; a test count that decreased; new keys in one catalogue only; an e2e flake absorbed with `retries: 2`.

**Phase to address:** all phases; enforced per-plan, audited at milestone close.

---

### Pitfall 17: Export engine blind to the tree (SUB)

**What goes wrong:**
The export engine (six-sheet xlsx with Gantt, ordered MSPDI XML, flat CSV) builds rows from task data. Subtask trees must map onto formats that don't have real hierarchy support: CSV is flat (loses tree unless a depth/indent or "parent title" column is added), MSPDI has an `OutlineLevel`/outline structure that must be *ordered correctly* (parents before children — v2.1 already fixed "ordered MSPDI with real task links," and a tree re-orders everything), and the Gantt chart bars need rolled-up dates/progress (a parent whose dates are derived from children, or absent). Naive "export each task object" exports parents with empty dates and children in insertion order.

**How to avoid:**
- One flattening pass (ordered DFS with depth) feeding all three formats; MSPDI `OutlineLevel` from depth; CSV gains explicit parent columns; Gantt rolls up leaf dates to parents.
- The v2.1 standing override ("no MS Project machine — mechanical suite is the verification of record") applies: keep the mechanical suite exhaustive over ordering/outline numbers since visual verification remains deferred.
- Round-trip test: export → parse MSPDI → outline depth matches tree depth for every node.

**Warning signs:** MSPDI opens in MS Project with children as siblings; CSV column count changes breaks downstream consumers silently; Gantt bars for parents at zero length.

**Phase to address:** SUB (export integration in SUB's later plans, after tree shape settles).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Client-side-only tree validation | Fast UI | MCP/funnel writes bypass cycles/depth | Never — server validator mandatory |
| Storing rollup progress in the doc | Cheap rendering | Stale under concurrent merges; 409 storms | Never (derive on read) |
| Webhook config in the workspace doc | No new table | Doc goes to every member; secrets leak | Never — mirror table |
| `JSON.stringify` a task as a template | 5-minute feature | Stale ids, schema drift, secret capture | Never — allow-list serializer |
| Sync webhook delivery | Simpler code path | Funnel latency coupled to Teams health | Never — the funnel is the system's spine |
| Skipping pg variant for new tables | Faster WHK phase | Silent prod divergence under `DB_URL` | Never — matrix in same plan |
| Max-depth 10+ for subtasks | "Flexibility" | Rollup cost, export ambiguity, cycle guard erosion | ≤4 levels; revisit with evidence |
| Retrying all webhook failures | "Reliability" | Retry storm; duplicate Teams cards | Bounded, retryable-status-only |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| MS Teams incoming webhook | Using the retired Office 365 Connector format assumptions; ignoring 429 | Workflows-based URL accepting Adaptive/MessageCard JSON; honor `Retry-After` on 429; ~4 req/s per hook budget |
| Teams payload size | Sending full task descriptions + comments | Clamp to < 28 KB server-side; truncate with a deep link ("open task for details") |
| SMTP (existing relay) | Marking sent before the relay accepts | Claim → attempt → outcome state machine; never blanket re-drive |
| Doc funnel (`mergeClientDoc`) | Forgetting the new tree shape is a merge "sink" | Register in normalize/removal sweeps; redacted-writer tests |
| MCP mirror | New validators only wired into `server.js` | One shared validator, three call sites, round-trip tests |
| FTS projection | Extending search text outside the transaction | Fold tree text into `syncTaskFts` in-transaction; boot sweep as backstop only |
| Export engine | Three formats, three flattenings | One ordered DFS flattening feeding xlsx/MSPDI/CSV |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Per-frame tree re-render (no memo) | Board/table lag on large projects | Compute flattening once per doc revision | ~hundreds of subtasks |
| Recursive progress rollup without memo on deep trees | Slow save echoes | Rollup once, cached per revision | Depth × breadth growth |
| Unbounded delivery queue | Memory growth during an outage | Cap + drop-with-log (fail-absent decision) | Any sustained Teams outage |
| N+1 template instantiation writes (revision bump per row) | 409 storms, slow creation | One transactional doc write, one revision | Templates with many subtasks |
| Webhook fan-out per event × per hook inside the write path | PUT latency spikes | Queue behind the response | First hook on a busy project |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Accepting `http://` or IP-literal webhook URLs | SSRF into Docker network / pg / metadata endpoints | https-only + resolved-IP deny-list (loopback, RFC1918, 169.254.0.0/16) at connect time (OWASP SSRF sheet) |
| Domain allow-list only | DNS rebinding bypass | Validate the resolved IP, not the hostname (OWASP) |
| Webhook URL stored in the doc | Channel-posting capability to every project member | Server table, hash/redact, show-once (`psk_live_` pattern) |
| Logging delivery failures with URLs/bodies | Secret leakage into logs / admin surfaces | Log hook id + status only |
| Payload built from raw stored doc | Private-project data / member emails to Teams guests | Project-scoped minimal projection through the redaction lens |
| Templates capturing webhook/secret fields | Secrets duplicated into exports/copies | Template serializer strips by allow-list, not deny-list |
| MCP tools allowed to create webhooks for any role | Privilege escalation via agent surface | Same tier gate as UI, or explicitly absent from MCP this milestone |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Tree UI without depth affordance | Users can't tell what nests under what | Indentation + collapse at depth ≥ 2; cap depth in UI mirroring server cap |
| Template picker shows stale fields after schema changes | Confusing instantiated tasks | Validate/instantiate through the current shape gate, drop unknown fields loudly in dev |
| Webhook failure invisible to configurators | "It's broken" with no signal | Last-delivery status surfaced in hook settings (id + status, never URL) |
| Hidden[] hides too much on cards | Cards lose assignee/date context | Minimum-field rule: identity fields never hideable on cards |
| Silent template drift | Instantiated task missing new capabilities | Versioned templates + first-use normalization |

## "Looks Done But Isn't" Checklist

- [ ] **Subtask tree:** often missing redacted-writer merge tests — verify a guest edit preserves hidden sibling branches byte-identically
- [ ] **Subtask tree:** often missing server-side cycle/depth rejection for MCP writes — verify an MCP tool gets the same 4xx as the UI
- [ ] **Progress rollup:** often missing "parent with manual progress + children" rule — verify one documented rule and one unit table
- [ ] **Templates:** often missing secret/id stripping proof — verify a fixture template contains zero id-shaped or URL-shaped fields
- [ ] **Templates:** often missing older-shape instantiation test — verify a v-current-1 fixture instantiates cleanly
- [ ] **Webhooks:** often missing SSRF matrix — verify https-only, loopback/private/link-local/metadata all rejected *at delivery*, not only at save
- [ ] **Webhooks:** often missing latency isolation — verify PUT returns while the delivery endpoint hangs
- [ ] **Webhooks:** often missing 429 + `Retry-After` honoring and 4xx-no-retry distinction
- [ ] **Webhooks:** often missing payload redaction tests (guest scope, private project, no emails)
- [ ] **MCP parity:** often missing `MCP.md` updates and round-trip validation tests per feature
- [ ] **Dual backend:** often missing pg schema for new tables in the same commit + pg matrix run
- [ ] **FTS:** often missing in-transaction tree-text sync on re-parent/delete (not just create)
- [ ] **Export:** often missing MSPDI `OutlineLevel` ordering round-trip test
- [ ] **POL hidden[]:** often missing card-surface (not table) e2e at 390×844 and the 641–900px band
- [ ] **POL SMTP:** often missing "SMTP fails then recovers → zero duplicates, zero permanent loss" regression test
- [ ] **Standing gates:** often missing per-phase entry-chunk delta check given only ~2 kB headroom

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Cycles written into stored docs | MEDIUM | Boot sweep detecting unreachable roots; repair to root-level; add validator after |
| Stale subtask text in FTS | LOW | Existing boot-sweep healing; then fix the write path |
| Leaked webhook URL in doc history | HIGH | Rotate the Teams URL, migrate config to a table, sweep old doc revisions/audit rows |
| Bad template shapes in the wild | LOW | First-use normalization + version migration (established boot-migration pattern) |
| Duplicate emails after SMTP incident | LOW | Failed-row re-drive only; dedupe by notification row id |
| Entry chunk over 500 kB | MEDIUM | Lazy chunk extraction (D-02 pattern); never a gate edit |
| pg/SQLite divergence discovered late | MEDIUM | Add missing schema + copy-script coverage, run full matrix, reconcile epoch units |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 Funnel sinks for the tree | SUB | Redacted-writer byte-identical merge tests |
| 2 Cycles / depth | SUB + MCP parity | Server 4xx matrix incl. MCP tool path |
| 3 Rollup double-count | SUB | Unit rule table + all consumers call one function |
| 4 Delete cascades | SUB | Consumer-table sweep matrix (reminders, FTS, notifications) |
| 13 FTS tree text | SUB | In-transaction sync + pg parity suite |
| 17 Export tree mapping | SUB | MSPDI outline round-trip + CSV columns |
| 5 Template stale ids | TMPL | Allow-list serializer fixture (zero ids/urls) |
| 6 Template schema drift | TMPL | Older-shape + unknown-field instantiation tests |
| 7 SSRF | WHK | Rejection matrix at save *and* delivery |
| 8 Secret handling | WHK | Show-once + redaction + log-scrub tests |
| 9 Retry storms / sync blocking | WHK | Bounded-retry table + PUT-latency isolation test |
| 10 PII in payloads | WHK | Guest/private payload field assertions |
| 11 MCP blind spots | SUB/TMPL/WHK each | Round-trip validation + MCP.md parity |
| 12 Dual-backend drift | WHK (+SUB FTS) | pg schema in same commit + matrix run |
| 14 hidden[] card contract | POL | Card e2e at 390×844 + 641–900px band |
| 15 SMTP retry semantics | POL | Fail-then-recover regression (0 dupes, 0 loss) |
| 16 Standing gates | All | Per-plan gate checklist; milestone audit |

## Sources

- System ground truth (HIGH): `.planning/PROJECT.md` — doc funnel/redaction/merge, revision+409 concurrency, mirror-table precedents (`push_subscriptions`, `saved_views`, `notif_prefs`), `sendPushFor` gate order and 4096-octet budget, exactly-once `reminders_sent`, FTS in-transaction sync + boot sweep, MCP shared-validator pattern (D-53-2), export engine (v2.1), Phase 64 mobile contract, standing gates and 2 kB entry headroom, D-12 zero-dep amendment precedent
- OWASP Cheat Sheet Series — Server-Side Request Forgery Prevention (MEDIUM): https-only, IP validation over domain allow-lists, DNS-rebinding caveat
- Microsoft Learn — Teams incoming webhooks (MEDIUM): Workflows-based creation, card-format payloads, per-request rate limiting (~4 req/s per webhook), 28 KB request-size cap ("Request Entity too large")
- Webhook practitioner literature (retry storms, delivery records, payload discipline) — MEDIUM
- Personal-experience patterns from prior GSD phases in this repo (error-handling and fail-closed precedents) — HIGH
