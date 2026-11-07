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

### Phase 46: MCP server — expose workspace operations to external MCP clients *(in-flight: feat/mcp)*

**Goal**: External MCP clients (Claude Desktop, coding agents) can safely operate on real workspace data through an authenticated, workspace-scoped MCP server built from the in-flight feat/mcp branch
**Depends on**: Nothing structurally (parallel-safe with Phase 45)
**Requirements**: MCP-01..04
**Success Criteria** (what must be TRUE):
  1. Tool surface covers the shipped commands (task CRUD, batch, subtasks, reorder, own-comment delete, recurrence, teams/labels, project refs by key prefix, assignee by email/name)
  2. Every tool call resolves to a member identity through the same permission funnel as UI/API — no anonymous access
  3. Transport + lifecycle documented and test-pinned; MCP unconfigured = feature absent, zero overhead
  4. D-12 constraint amendment (SDK vs hand-rolled) decided at plan time with owner validation

**Plans**: 0 plans *(agent worktree feat/mcp holds 4 commits / +2 866 lines on feat/mcp — reconcile before planning)*

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
| 46. MCP server | 0/0 | Not started (in-flight feat/mcp) | - |
| 47. Command/UI hardening | 0/0 | Not started (in-flight fix/commands) | - |

## Backlog

*(Empty — Phase 999.1 (Phase 37 deferred UAT Test 2: workspace name in digest subject +
project name on task lines) is consumed by v1.9 SUBJ-01/02, mapped to Phase 40. Remaining
Phase 39 audit recommendations stay `proposed` pending D-05 owner rulings and join only
when validated.)*

### Phase 999.2: Follow-up — Phase 41 email-notification audit decision: real browser push + toasts (BACKLOG)

**Goal:** Implement real browser push notifications and toast notifications, replacing the inert `push_mention`/`push_assign`/`push_comment` toggles (currently visible with a "coming soon" badge) and adding toast feedback for mentions/assignments.
**Source phase:** 41 (email-notification audit, Kanzo task projectsstudio#6)
**Deferred at:** 2026-11-05 during /gsd-verify-work 41 session (audit decisions)
**Follow-ups:**
- [ ] Test 1: Real web push (service worker + browser Notification) wired to the existing push_* pref keys, with a "coming soon" badge added to the Push section in Settings in the meantime (deferred 2026-11-05)
- [ ] Test 3: Toast notifications for mention/assign events (deferred 2026-11-05)
