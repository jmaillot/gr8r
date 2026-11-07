---
phase: 46-mcp-server-workspace-operations
verified: 2026-11-07T18:08:03Z
status: passed
score: 4/4 must-haves verified
covered_files:
  - .planning/phases/46-mcp-server-workspace-operations/46-SUMMARY.md
  - mcp.js
  - server.js
  - test/mcp.test.mjs
  - test/dependencies.test.mjs
  - MCP.md
  - DEPLOY.md
  - MCP-IDEAS.md
covered_digest: "v2:c9786188bad1c722631fd7dbe47f38f7f21195db3b6e5f8efb5cb257a7cf2110"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 46: MCP server — expose workspace operations to external MCP clients — Verification Report

**Phase Goal:** External MCP clients (Claude Desktop, coding agents) can safely operate on real workspace data through an authenticated, workspace-scoped MCP server.
**Verified:** 2026-11-07T18:08:03Z (codebase at e541e45+, HEAD 4bf2c2a+)
**Status:** passed
**Re-verification:** No — initial verification (retrospective artifact; no PLAN.md, must-haves derived from ROADMAP Success Criteria + REQUIREMENTS.md MCP-01..04)

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP SC) | Status | Evidence |
|---|--------------------|--------|----------|
| 1 | Tool surface covers the shipped commands (task CRUD, batch, subtasks, reorder, own-comment delete, recurrence, teams/labels, project refs by key prefix, assignee by email/name) | ✓ VERIFIED | `mcp.js` frozen `TOOLS` registry — exactly 35 tools enumerated programmatically (`list_projects` … `list_comments`), covering every required command class. Pinned by `test/mcp.test.mjs` "handshake, tools/list exposes the full surface" (asserts the exact 35-name list). Command coverage exercised by tests: task CRUD round-trip (L209), comments/search (L245), subtask suite (L431), reorder (L450), own-comment delete (L470), recurrence (L487), batch `create_tasks` (L503), teams/labels (L526), key-prefix project refs + assignee by email/name (L372, "projects: create by key ref…"), notifications/milestones/members/handoff (L539), prompts (L586). |
| 2 | Every tool call resolves to a member identity through the same permission funnel as UI/API — no anonymous access | ✓ VERIFIED | `mcp.js authenticate()` (L86–101): Bearer key → sha256 lookup in `api_keys` → user + workspace + **membership** row must all exist, else 401; revoked/expired rejected. Write tools gate on `canWrite(ctx)` (18 call sites); admin bypass via `ROLE_RANK[ctx.membership.role] >= admin` (L182) using the **same `ROLE_RANK` passed in from `server.js`** (L5762) — one funnel for UI/API/MCP. No anonymous access: bearer missing/garbage/revoked → 401 JSON before protocol work (tests L147, L154). Workspace scoping test-pinned: invisible projects stay invisible (L275), read-scoped key cannot write (L282), session bound to issuing key, expired key 401 (L312), revocation takes effect immediately (L340). All tool calls audited with `mcp.` prefix (test L354). |
| 3 | Transport + lifecycle documented and test-pinned; MCP unconfigured = feature absent, zero overhead | ✓ VERIFIED | Transport/lifecycle hand-rolled JSON-RPC 2.0 over streamable HTTP in `mcp.js` (`initialize` echoes protocol version 2025-06-18 L1403, `notifications/initialized` → 202 L1416, `tools/list` L1418, `tools/call` L1440, session-key binding, GET → 405). Documented: `MCP.md` (744 lines, full per-command manual), `DEPLOY.md` §15 (image ships `mcp.js` — pinned by `test/dependencies.test.mjs` L66–70 COPY-target allowlist including `mcp.js`; forward-auth `/mcp` exclusion with curl smoke test). "Unconfigured = feature absent": `DEPLOY.md` documents the off switch — no env flag, **not issuing keys is the off switch**; unauthenticated requests answer 401 before any protocol work (test L147), rate limit 60 req/min (test L320). Deviation note: the endpoint module itself is always mounted (no env gate); the team's documented interpretation ("no keys = feature inert") satisfies the criterion's intent — no anonymous surface, zero data exposure without configuration. |
| 4 | D-12 constraint amendment (SDK vs hand-rolled) decided and documented with owner validation | ✓ VERIFIED | `mcp.js` header L9–13: "D-12: ZERO runtime dependencies — the protocol … is implemented by hand on Node built-ins." Zero SDK deps confirmed: `package.json` runtime dependencies are exactly `{ pg }` (the pre-existing Phase 45 carve-out), pinned by `test/dependencies.test.mjs` L26–38. D-12 amendment (mcp.js joins runtime COPY targets) encoded in the same test L66–70. Owner validation recorded: `.planning/ROADMAP.md` Phase 46 block — "Owner accepted the branch as the phase deliverable — phase closed without new plans; UAT 5/5 in commit 5fe7f67." |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `mcp.js` | MCP protocol server + tool registry + API-key auth | ✓ VERIFIED | 1526 lines; substantive (35-tool registry, auth, sessions, audit, rate limit); wired via `server.js` L60 import + `/mcp` dispatch L5836 |
| `server.js` `/mcp` mount | Endpoint live before `/api/` chain, bearer auth, never login redirect | ✓ VERIFIED | L5741–5762 (mcpDb forwarding stub, createMcp with live primitives) + L5836 dispatch |
| `test/mcp.test.mjs` | Protocol, auth, scoping, permission-parity coverage | ✓ VERIFIED | 25 tests; **ran: 25/25 pass, 0 fail (this verification, 814 ms)** |
| `test/dependencies.test.mjs` | D-12 pin incl. `mcp.js` in runtime COPY targets | ✓ VERIFIED | L66–70 |
| `MCP.md` | Per-command usage manual | ✓ VERIFIED | 744 lines |
| `DEPLOY.md` §15 | Deployment: image, reverse-proxy, off switch | ✓ VERIFIED | L1256–1302 |
| `api_keys` handling | `psk_live_` keys, hash-only storage, revocation, mandatory expiry | ✓ VERIFIED | `mcp.js` L52–70 (`generateApiKey` one-shot, `API_KEY_DAYS [30,90,365]` no permanent keys, sha256 hash storage); key lifecycle tests L117–147, L340 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `server.js` | `mcp.js` | `import { createMcp, generateApiKey, … } from './mcp.js'` (L60) | WIRED | Boot-time wiring with live `db/now/uid/tooMany/ROLE_RANK` primitives |
| HTTP dispatch | `/mcp` | `url.pathname === '/mcp'` → `MCP.handle(req, res)` (L5836) | WIRED | Intercepted before `/api/` and static fallback; sameOrigin CSRF gate structurally N/A (bearer, not cookie) |
| MCP auth | `api_keys` table | `db.get('select * from api_keys where key_hash = ?')` | WIRED | Real query, real data flow; hash lookup, not mock |
| MCP tools | workspace document | `loadDoc`/`tx` same stored-document discipline as UI/API | WIRED | begin-immediate transaction, revision+1 commit (header contract); round-trip test L209 lands in the document |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full MCP test suite (protocol, auth, scoping, permissions) | `node --test test/mcp.test.mjs` | tests 25, pass 25, fail 0 (814 ms) | ✓ PASS |
| Tool surface frozen | programmatic TOOLS key extraction | 35 tools; matches test's expected 35-name deepEqual list | ✓ PASS |
| D-12 dependency contract | `test/dependencies.test.mjs` (pinned by green full suite 2026-11-07: 1126 tests, 0 fail) | runtime deps exactly `{pg}`; COPY targets include `mcp.js` | ✓ PASS |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| MCP-01 | MCP server with tool surface mapped from command layer | ✓ SATISFIED | Truth 1 |
| MCP-02 | Authenticated, workspace-scoped, permission-funnel parity, no anonymous access | ✓ SATISFIED | Truth 2 |
| MCP-03 | Transport + lifecycle documented and test-pinned; graceful unconfigured behavior | ✓ SATISFIED | Truth 3 |
| MCP-04 | Zero-dependency D-12 amendment decided + documented with owner validation | ✓ SATISFIED | Truth 4 |

No orphaned requirements — all four MCP IDs map to this phase in REQUIREMENTS.md (L109–112) and are covered.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TBD/FIXME/XXX/stub markers in `mcp.js`, `server.js` MCP section, or `MCP.md` | — | — |

Note: `MCP-IDEAS.md` holds explicitly parked future ideas (SSE, resources, webhooks) — documented scope deferral, not debt.

### Human Verification Required

None outstanding — UAT was performed and recorded (5/5 scenarios, commit 5fe7f67: "UAT passed for Phases 46 (MCP 5/5) and 47 (G shortcuts)"), covering the real-client integration behavior that grep cannot reach.

### Gaps Summary

No gaps. One interpretation note (non-blocking, already documented in DEPLOY.md): "MCP unconfigured = feature absent" is implemented as "no API keys issued = endpoint inert (401 before any protocol work)" rather than an env-gated absent endpoint; the off switch is key non-issuance, and this is explicitly documented and test-pinned.

---

_Verified: 2026-11-07T18:08:03Z_
_Verifier: the agent (gsd-verifier)_
