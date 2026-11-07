# Requirements: Projects Studio — v1.10

**Defined:** 2026-11-07
**Core Value:** real auth, real multitenancy, real localization, real notifications — no decorative state
**Source:** Kanzo tasks (#5, #14, #16 backfill), in-flight agent worktrees (feat/sql, feat/mcp, fix/commands), backlog 999.2.

## v1.10 Requirements

### TZ — Per-member timezones (retroactive bookkeeping — shipped in v1.9 Phase 44)

- [x] **TZ-01**: Each member's reminders and digest fire at their own 09:00 — multiple timezones
  supported with Paris default, replacing the single workspace-TZ model built on five hard-coded
  `TZ_BY_LABEL` labels. One canonicalizing `resolveTz` funnel (aliases accepted but stored
  canonical, hostile/unknown → Europe/Paris), static committed 418-zone list, searchable settings
  combobox, dedup keys byte-identical under tz change. *Shipped and verified 2026-11-07
  (Phase 44, 4/4 plans, UAT 3/3) — registered here retroactively for traceability (Kanzo task
  projectsstudio#14, done).*

### LOGO — Workspace logo (retroactive bookkeeping — shipped in v1.9 Phase 43)

- [x] **LOGO-01**: A workspace can carry its own logo — uploaded by an admin (magic-byte
  validated, size-capped, role-gated), stored server-side under `DATA_DIR/logos`, served via
  session-free `GET /w/:slug/logo`, rendered wherever the workspace identity appears with a
  clean fallback to `favicon.svg` when none is set (sidebar, topbar, favicon, settings, digest
  header). *Shipped and verified 2026-11-06 (Phase 43, 3/3 plans) — registered here
  retroactively for traceability (Kanzo task projectsstudio#16, done).*

### DBA — Database adapter (Kanzo #5 — complete, Phase 45)

- [x] **DBA-01**: Optional Postgres backend selected purely via environment configuration
  (`DB_*` env, Postgres-only scope confirmed by owner 2026-11-07); absence of the config keeps
  the current SQLite behavior byte-for-byte
- [x] **DBA-02**: No functional divergence between backends: every existing suite passes
  unmodified against both SQLite and Postgres (same ledger/claim semantics, same migration
  posture, same `node:sqlite` fallback when `node:postgres`-equivalent is used)
- [x] **DBA-03**: Zero-runtime-dependency constraint (D-12) revisited explicitly: the Postgres
  driver choice (bundled vs vendored vs `pg` dependency) must be decided and documented at plan
  time — a runtime dependency is acceptable only with an owner-validated constraint amendment
- [x] **DBA-04**: Deploy documentation (DEPLOY.md) covers the env matrix: SQLite-only default
  (no config), Postgres connection (host/creds/pool), and what happens on misconfiguration
  (fail fast at boot, never silently fall back)

### MCP — Model Context Protocol server (in-flight on feat/mcp)

- [x] **MCP-01**: Tasks Studio exposes an MCP server so external MCP clients (Claude Desktop,
  coding agents) can operate on real workspace data — tool surface mapped from the existing
  command layer: task CRUD, batch create, subtask edit, reorder, own-comment delete,
  recurrence, teams/labels, project refs by key prefix, assignee by email/name
- [x] **MCP-02**: The MCP server is authenticated and workspace-scoped: no anonymous access,
  every tool call resolves to a member identity with the same permission funnel as the UI/API
  (admin paths stay server-validated, D-10 discipline)
- [x] **MCP-03**: Transport and lifecycle are documented and pinned by tests (stdio and/or
  HTTP), including graceful behavior when MCP is not configured (feature absent, zero overhead)
- [x] **MCP-04**: Zero-runtime-dependency constraint applies as for DBA-03: SDK choice
  (dependency vs hand-rolled protocol) decided and documented at plan time with owner validation

### PUSH — Real browser push & toasts (from backlog 999.2; Phase 48)

- [x] **PUSH-01**: The three inert push toggles (`push_mention`/`push_assign`/`push_comment`)
  gain real behavior: a minimal service worker + Notification API triggered from the existing
  poll cycle (D-48-1 — NOT the Web Push protocol; email covers closed-tab delivery). "Coming
  soon" badge removed
- [x] **PUSH-02**: Foreground tab → in-app toast; background tab → browser notification via the
  service worker; never both for one event, never for already-seen events, gated by each
  push_* pref key (D-48-2)
- [x] **PUSH-03**: Denied browser permission: toggle still persists (intent), a "browser
  blocked" badge + explanatory toast inform the user, badge clears when permission returns
  (D-48-4); settings keep the 3 granular toggles with zero schema migration (D-48-3)

### FIX — Command/UI hardening (in-flight on fix/commands)

- [x] **FIX-01**: Command/UI hardening landed from the fix/commands worktree — two-letter G
  shortcuts in the command palette (keyboard.js shared `gPending` G-nav map, palette.js
  query-typing guard), each fix carried with a regression test
  (test/i18n-actions-modules.test.mjs 13/13 counted; palette filter behaviorally pinned by
  test/palette-filter.test.mjs 7/7, added at v1.10 gap closure; G-combo path UAT-verified,
  commit 5fe7f67) and full suite green; merged at 62b1826,
  UAT passed 2026-11-07

### Cross-cutting invariants (standing constraints, pinned per phase)

- Zero runtime dependencies **unless an owner-validated constraint amendment exists for that
  phase** (DBA-03/MCP-04 carve-outs must be explicit, documented in DEPLOY.md, and pinned by a
  D-12 test update)
- Full suite green on the default (SQLite) path at every phase boundary
- All new user-facing strings catalogued EN+FR (i18n-scan gate green, server keys included)
- Phase 38 suppression + no-double-send invariants and exactly-once ledger semantics pass
  unmodified

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real browser push + toasts (backlog 999.2) | *(consumed into v1.10 Phase 48, 2026-11-07 — owner decision; see PUSH-01..03)* |
| MySQL/MSSQL adapters | Owner confirmed Postgres-only scope (2026-11-07) |
| Other MCP transports beyond what feat/mcp ships | Scope follows the in-flight branch; extras are follow-ups |
| Per-task reminder offsets, digest content growth | Phase 39 audit recommendations stay `proposed` pending D-05 owner rulings |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TZ-01 | Phase 44 (v1.9, retroactive) | Complete |
| LOGO-01 | Phase 43 (v1.9, retroactive) | Complete |
| DBA-01 | Phase 45 | Complete |
| DBA-02 | Phase 45 | Complete |
| DBA-03 | Phase 45 | Complete |
| DBA-04 | Phase 45 | Complete |
| MCP-01 | Phase 46 (branch feat/mcp) | Complete |
| MCP-02 | Phase 46 (branch feat/mcp) | Complete |
| MCP-03 | Phase 46 (branch feat/mcp) | Complete |
| MCP-04 | Phase 46 (branch feat/mcp) | Complete |
| FIX-01 | Phase 47 | Complete |
| PUSH-01 | Phase 48 | Complete |
| PUSH-02 | Phase 48 | Complete |
| PUSH-03 | Phase 48 | Complete |

**Coverage:**
- v1.10 requirements: 14 total — 14/14 complete (2 retroactive v1.9, DBA×4, MCP×4, FIX-01, PUSH×3)
- Mapped to phases: 14 ✓
- Unmapped: 0

---
*Requirements defined: 2026-11-07*
*Note: TZ-01/LOGO-01 shipped in v1.9 (Phases 44/43) — registered here per the verifiers'
milestone-boundary instruction; new work is DBA/MCP/FIX only.*
