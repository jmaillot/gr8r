# Roadmap: Projects Studio

## Milestones

🚧 **v2.4 Automation & Productivity** — current milestone

## Phases

- [x] **Phase 65: Subtask Tree** - Multi-level hierarchical subtasks survive every surface (views, funnel, FTS, exports, MCP)
- [ ] **Phase 66: Task & Project Templates** - Reusable task/project templates with offset-based dates, instantiated through the normal doc-PUT
- [ ] **Phase 67: Project Webhooks** - Per-project outbound webhooks delivering MS Teams payloads with SSRF defense and bounded retry
- [ ] **Phase 68: Backlog Polish** - v2.3 deferred items: mobile hidden[] card fields, SMTP retry claim-state machine, WR-01 CSS scoping, Nyquist reconciliation

## Phase Details

### Phase 65: Subtask Tree

**Goal**: A task's subtasks form a real multi-level tree that users can navigate, restructure, and that every existing surface — views, exports, search, MCP — renders consistently.
**Depends on**: Nothing (first phase of v2.4)
**Requirements**: SUB-01, SUB-02, SUB-03, SUB-04
**Success Criteria** (what must be TRUE):
  1. A user sees subtasks indented under their parent with collapse carets in list/table views, and a child-count badge in board view — at any depth within the cap
  2. A user can promote, demote or re-parent a subtask one level at a time; a change that would create a cycle or exceed the depth cap is rejected by the server with a localized error, and deleting a parent removes its descendants per the owner cascade ruling
  3. Completing a parent task auto-completes all its open descendants; parent progress is a computed rollup that never double-counts nested progress
  4. The tree shape survives every surface: mergeClientDoc normalization/removal sweeps, FTS projection (optional subtask titles, symmetric SQLite+pg), MSPDI export OutlineLevel, xlsx/CSV rows — with MCP writeDoc round-trip parity proven by tests

**Plans**: 5/5 plans executed
Plans:
**Wave 1**
- [x] 65-01-PLAN.md — Tracer: parentId round-trip through mergeClientDoc + shared subtree.js helpers + Wave-0 test harness (with D-01 storage-shape decision checkpoint)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 65-02-PLAN.md — Funnel authority: cycle/depth/dangling wholesale rejection, parent-done cascade, delete cascade, shared rollup refactor

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 65-03-PLAN.md — View surfaces: drawer recursive tree, table indent + carets, board open-count badge, timeline indented bars

**Wave 4** *(blocked on Wave 3 completion)*
- [x] 65-04-PLAN.md — Restructure UX (promote/demote/re-parent one level, popover menus, pre-validation) + search subtask-hint + e2e spec
- [x] 65-05-PLAN.md — FTS subtask-title parity + backfill, nested export rows + MSPDI OutlineLevel, MCP parentId round-trip parity

### Phase 66: Task & Project Templates

**Goal**: Users can save recurring task/project setups as workspace-wide templates and instantiate them in one action, dates derived from offsets.
**Depends on**: Phase 65 (template bodies embed subtask trees)
**Requirements**: TMPL-01, TMPL-02, TMPL-03
**Success Criteria** (what must be TRUE):
  1. A user can create a task template with an ordered subtask checklist and `dueOffsetDays`; unknown fields are silently dropped by the template sanitizer (no invalid template state can be stored)
  2. A user can create a project template with a starter task tree and instantiate it — the new project contains the template's task tree with dates derived from the offsets, through the normal doc-PUT (no fourth write path)
  3. Templates are workspace-wide and available via the template picker in the existing creation modals, in both EN and FR, with the tree/webhook UI lazy-loaded so the entry chunk stays under the 500 kB gate

**Plans**: 3/3 plans executed
**UI hint**: yes

Plans:
**Wave 1**
- [x] 66-01-PLAN.md — Tracer: template funnel substrate — per-kind whitelist sink (normalizeTemplatesData) in mergeClientDoc + normalizeDoc + MCP writeDoc, Wave-0 test/templates.test.mjs

**Wave 2** *(blocked on Wave 1)*
- [x] 66-02-PLAN.md — Instantiation builder (fresh ids, parentId remap, D-05–08 offset dates) + single doc-PUT CRUD actions

**Wave 3** *(blocked on Wave 2)*
- [x] 66-03-PLAN.md — Lazy template UI: Settings CRUD, picker in creation modals, Save-as-template ctx menu, drawer editor + i18n EN/FR + e2e + chunk gate

### Phase 67: Project Webhooks

**Goal**: Project owners/admins/leaders can register per-project webhooks that deliver MS Teams payloads for the 8-event vocabulary — async, exactly-once, SSRF-hardened.
**Depends on**: Phase 65 (subtask.tree-changed event), Phase 66 (event vocabulary stable, template bulk-instantiation testable); delivery/claim design co-specced with POL-02 (Phase 68)
**Requirements**: WHK-01, WHK-02, WHK-03, WHK-04, WHK-05
**Success Criteria** (what must be TRUE):
  1. A project owner, admin, or leader can register, edit, and delete a webhook (URL, secret, event filter, format) in the UI; the secret is shown exactly once at creation and never again (never in the client-visible doc, never in logs)
  2. Hooks fire on the 8-event vocabulary, each hook honoring its own event filter; events derive from a pure `diffWebhookEvents(storedDoc, next)` at the funnel diff point and are delivered post-commit, fire-and-forget — a hanging delivery endpoint never delays the PUT
  3. Delivery is fail-absent with bounded retries honoring Retry-After, exactly-once via the claim table (shared design with SMTP retry), with whitelisted-field envelopes built through `memberCanReadProject` respecting the 28 KB Teams cap
  4. The Teams formatter produces valid payloads for all three formats (teams-adaptive, teams-messagecard, raw-json) targeting `*.logic.azure.com` Workflows URLs; task.assigned mentions the assignee (real AAD mention when the `oid` claim is persisted at OIDC login, bold-name fallback otherwise)
  5. SSRF is mitigated at delivery time: https-only URLs, resolved-IP deny-list (loopback/RFC1918/169.254) re-checked per delivery, hook config in server mirror tables (`webhook_hooks`/`webhook_deliveries`) with SQLite+pg parity in the same commit; threat model runs with `threats_open: 0`

**Plans**: TBD

### Phase 68: Backlog Polish

**Goal**: The four v2.3 deferred items are cleared — mobile card fields honor hidden[], SMTP retry is claim-based, the WR-01 CSS leak is scoped, and the Phase 64 validation draft is reconciled.
**Depends on**: Nothing for POL-01/03/04 (fully independent); POL-02 co-designed with Phase 67's claim-state machine (WHK before or same-design)
**Requirements**: POL-01, POL-02, POL-03, POL-04
**Success Criteria** (what must be TRUE):
  1. On mobile (390×844), card fields show/hide driven by the existing `hidden[]` column contract via the popover — minimum-identity fields always visible — proven by a dedicated e2e
  2. When SMTP is down, email notification retries run through a claim-state machine (never mark-then-send, never blanket re-drive) honoring the Phase 38 no-double-send invariant — the same claim design the webhook delivery uses
  3. The WR-01 CSS scoping (`.page.flush .toolbar` flex-shrink at ≤900px) is applied and board toolbar behavior is proven unchanged by the existing e2e suite
  4. The Phase 64 validation draft is reconciled or formally accepted per audit-milestone §5.5, with no open validation artifacts at milestone close

**Plans**: TBD

## Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| SUB-01 | Phase 65 | Pending |
| SUB-02 | Phase 65 | Pending |
| SUB-03 | Phase 65 | Pending |
| SUB-04 | Phase 65 | Pending |
| TMPL-01 | Phase 66 | Pending |
| TMPL-02 | Phase 66 | Pending |
| TMPL-03 | Phase 66 | Pending |
| WHK-01 | Phase 67 | Pending |
| WHK-02 | Phase 67 | Pending |
| WHK-03 | Phase 67 | Pending |
| WHK-04 | Phase 67 | Pending |
| WHK-05 | Phase 67 | Pending |
| POL-01 | Phase 68 | Pending |
| POL-02 | Phase 68 | Pending |
| POL-03 | Phase 68 | Pending |
| POL-04 | Phase 68 | Pending |

Coverage: 16/16 requirements mapped ✓

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 65. Subtask Tree | 5/5 | In Progress|  |
| 66. Task & Project Templates | 3/3 | In Progress | - |
| 67. Project Webhooks | 0/0 | Not started | - |
| 68. Backlog Polish | 0/0 | Not started | - |

## Backlog

### Phase 999.1: Follow-up — Phase 65 deferred UAT follow-up: Test 11 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 65 verification
**Source phase:** 65
**Deferred at:** 2026-11-15 during /gsd-verify-work 65 session completion
**Follow-ups:**
- [ ] Test 11: Vérifier les exports (xlsx/CSV en ordre d'arbre, MSPDI OutlineLevel/summary) — reporté à la fin du milestone, idéalement avec un import dans MS Project réel pour clore l'item A1 (deferred 2026-11-15)

## Standing Constraints (all phases)

- Zero new runtime or dev dependencies (fetch/node:crypto/stdlib only)
- 500 kB chunk gate (~2 kB headroom) — all new UI lazy-loaded via the D-02 pattern
- EN+FR i18n gate; every new doc shape registered as a mergeClientDoc sink; every new server validator shared across UI/API/MCP
- SQLite+pg parity in the same commit for every new server table
- MCP parity for every funnel sink; e2e suite stays green (115/115 baseline + new specs)
- MS Teams target is Workflows webhooks only (O365 connectors retired May 2026)
