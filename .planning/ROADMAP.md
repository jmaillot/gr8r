# Roadmap: gr8r

## Milestones

- ✅ **v1.0 MVP** — Phases 1-9 (shipped 2025-11-27)
- ✅ **v1.1 Security** — Phases 10-15 (shipped 2026-01)
- ✅ **v1.2 Authentication (SSO/OIDC)** — Phases 16-20 (shipped 2026-03)
- ✅ **v1.3 Invitations & Onboarding** — Phases 21-24 (shipped 2026-05)
- ✅ **v1.4 Admin Experience** — Phases 25-27 (shipped 2026-06)
- ✅ **v1.5 Integrations & Email** — Phases 28-30 (shipped 2026-09)
- ✅ **v1.6 Membership Refinement** — Phase 31 (shipped 2026-11-02)
- ✅ **v1.7 Team Visibility & Hardening** — Phases 32-35 (shipped 2026-11-04)
- ✅ **v1.8 Notification Sanity** — Phases 36-39 (shipped 2026-11-05)
- ✅ **v1.9 Digest Context & One-Click Unsubscribe** — Phases 40-44 (shipped 2026-11-07)
- 🚧 **v1.10 Extensions & Adapters** — Phases 45-47 (in-flight: feat/sql, feat/mcp, fix/commands)

<details>
<summary>✅ v1.9 Digest Context & One-Click Unsubscribe (Phases 40-44) — SHIPPED 2026-11-07</summary>

- [x] Phase 40: Digest Subject & Task Lines (2/2 plans) — completed 2026-11-05
- [x] Phase 41: Unsubscribe Tokens & List-Unsubscribe Headers (2/2 plans) — completed 2026-11-06
- [x] Phase 42: One-Click Unsubscribe Endpoint (2/2 plans) — completed 2026-11-06
- [x] Phase 43: Workspace Logo (3/3 plans) — completed 2026-11-06
- [x] Phase 44: Per-Member Timezones (4/4 plans incl. gap closure 44-04) — completed 2026-11-07

Details: [.planning/milestones/v1.9-ROADMAP.md](milestones/v1.9-ROADMAP.md)

</details>

### Phase 45: Database adapter — optional Postgres backend via env, SQLite default *(in-flight: feat/sql)*

**Goal**: A deployer can point Projects Studio at Postgres purely through environment configuration; without that config the app keeps its current embedded-SQLite behavior unchanged
**Depends on**: Phase 44 (v1.9)
**Requirements**: DBA-01..04 (Kanzo #5 — Postgres-only scope confirmed by owner 2026-11-07)
**Success Criteria** (what must be TRUE):
  1. `DB_*` env selects Postgres; absent config = SQLite default, byte-for-byte behavior
  2. Every existing suite passes unmodified against both backends (same ledger/claim semantics)
  3. D-12 constraint amendment (if a driver dependency is needed) explicitly decided + documented + D-12 test updated
  4. DEPLOY.md documents the env matrix and fail-fast on misconfiguration

**Plans**: 0 plans *(agent worktree feat/sql holds the phase-seed commit 0b8e0a2 — reconcile before planning)*

Plans:
- [ ] TBD (run /gsd-plan-phase 45 to break down)

### Phase 46: MCP server — expose workspace operations to external MCP clients *(complete 2026-11-07: feat/mcp merged)*

**Goal**: External MCP clients (Claude Desktop, coding agents) can safely operate on real workspace data through an authenticated, workspace-scoped MCP server built from the in-flight feat/mcp branch
**Depends on**: Nothing structurally (parallel-safe with Phase 45)
**Requirements**: MCP-01..04
**Success Criteria** (what must be TRUE):
  1. Tool surface covers the shipped commands (task CRUD, batch, subtasks, reorder, own-comment delete, recurrence, teams/labels, project refs by key prefix, assignee by email/name)
  2. Every tool call resolves to a member identity through the same permission funnel as UI/API — no anonymous access
  3. Transport + lifecycle documented and test-pinned; MCP unconfigured = feature absent, zero overhead
  4. D-12 constraint amendment (SDK vs hand-rolled) decided at plan time with owner validation

**Plans**: 0 plans *(DELIVERED VIA BRANCH 2026-11-07: feat/mcp merged to main at e541e45 — /mcp streamable-HTTP endpoint, hand-rolled JSON-RPC 2.0 on Node built-ins (D-12 respected, zero deps), personal API keys psk_live_ with hash storage/revocation/expiry, 35-tool surface, 25-test suite mcp.test.mjs 25/25, usage manual MCP.md, DEPLOY.md §15, parked ideas MCP-IDEAS.md. Owner accepted the branch as the phase deliverable — phase closed without new plans; UAT 5/5 in commit 5fe7f67.)*

Plans:
- [ ] TBD (run /gsd-plan-phase 46 to break down)

### Phase 47: Command/UI hardening — fix/commands intake *(in-flight: fix/commands)*

**Goal**: Land and pin the fixes produced by the fix/commands worktree (scope finalized from that branch's content; branch currently at main HEAD with no commits — reserve only)
**Depends on**: Nothing (intake phase)
**Requirements**: FIX-01
**Success Criteria** (what must be TRUE):
  1. Each landed fix carries a regression test and a REQUIREMENTS traceability bullet
  2. Full suite green; no new runtime dependencies

**Plans**: 0 plans *(agent worktree fix/commands — no commits yet; plan when content exists)*

Plans:
- [ ] TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 45. Database adapter | 0/0 | Not started (in-flight feat/sql) | - |
| 46. MCP server | merged (e541e45) | UAT passed 2026-11-07 (5/5) — 3 fixes landed during UAT | 2026-11-07 |
| 47. Command/UI hardening | merged (62b1826) | UAT passed 2026-11-07 (G shortcuts) | 2026-11-07 |
| 48. Browser push & toasts | 2/2 | Complete    | 2026-11-07 |

### Phase 48: Real browser push & toasts (from backlog 999.2)

**Goal**: Real browser notifications replace the inert push_* toggles, and toast feedback lands for mention/assign events
**Depends on**: Nothing (parallel-safe; pulled from backlog 999.2 at owner request)
**Requirements**: PUSH-01, PUSH-02, PUSH-03
**Success Criteria** (what must be TRUE):
  1. Real web push (service worker + browser Notification) wired to the existing push_mention/push_assign/push_comment pref keys — "coming soon" badge removed
  2. Toast notifications for mention/assign events
  3. Zero new runtime dependencies (D-12) — service worker + Notification API are browser built-ins
  4. Full suite green; i18n EN+FR for all new strings

**Plans**: 2/2 plans complete

Plans:
**Wave 1**
- [x] 48-01-PLAN.md — Tracer + core: sw.js, src/core/push.js (seen-set, toast-vs-notification), poll hook, i18n keys, test harness

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 48-02-PLAN.md — Settings permission UX: blocked badge swap, requestPermission pre-step, pushComingSoon removal, catalogue at 1710 (EN-counted)

## Backlog

*(Empty — Phase 999.1 (Phase 37 deferred UAT Test 2: workspace name in digest subject +
project name on task lines) is consumed by v1.9 SUBJ-01/02, mapped to Phase 40. Remaining
Phase 39 audit recommendations stay `proposed` pending D-05 owner rulings and join only
when validated.)*

*(Phase 999.2 consumed into Phase 48, 2026-11-07 — owner decision.)*
