---
phase: 46-mcp-server-workspace-operations
status: complete
retrospective: true
branch_delivery: feat/mcp merged to main
merge_commit: e541e45
uat_commit: 5fe7f67
completed: 2026-11-07
---

# Phase 46 SUMMARY — MCP server: expose workspace operations to external MCP clients

> **Retrospective artifact.** Phase 46 was planned and delivered on branch `feat/mcp` and merged to main (e541e45) without the standard plan→execute artifact chain (no PLAN.md files were created). This SUMMARY was written after the fact for the v1.10 milestone close, from git history, tests, and docs. Scope and success criteria are recorded in `.planning/ROADMAP.md` (archived at `milestones/v1.10-ROADMAP.md`).

## One-Liner

External MCP clients (Claude Desktop, coding agents) can safely operate on real workspace data through an authenticated, workspace-scoped MCP server — hand-rolled JSON-RPC 2.0 on Node built-ins, zero protocol dependencies.

## What Was Built

- **`/mcp` streamable-HTTP endpoint** — MCP protocol server exposing 35 tools mapped from the shipped command layer: task CRUD, batch create, subtask edit, reorder, own-comment delete, recurrence, teams/labels, project refs by key prefix, assignee by email/name, notifications inbox, milestones, project members, atomic handoff_task, MCP prompts
- **Personal API keys** — `psk_live_`-prefixed keys with hash-only storage, revocation and expiry; new `api_keys` table (carried into the Phase 45 pg schema and copy-sqlite-to-pg script — commit 67edc7b reconciled the drift)
- **Permission funnel parity** — every tool call resolves to a member identity through the same permission funnel as UI/API; no anonymous access; admin paths stay server-validated (D-10)
- **Hand-rolled JSON-RPC 2.0** (MCP-04 / D-12 decision: no SDK, zero runtime dependencies beyond the Phase 45 `pg` carve-out)
- **Feature-absent posture** — MCP unconfigured = endpoint absent, zero overhead
- **Docs & deployment** — `MCP.md` full per-command manual; `DEPLOY.md` §15 (image ships `mcp.js` in runtime stage — b5fb128 fixed the same ERR_MODULE_NOT_FOUND gap class as G-44-1; forward-auth exclusion for `/mcp`, G-43-4 shape — 9d384b9); parked ideas in `MCP-IDEAS.md` (SSE, resources, webhooks, attachments)

## Test Evidence

- `test/mcp.test.mjs` — 25/25 pass (protocol surface, auth, workspace scoping, permission parity)
- Post-merge reconciliations: 16c6bf4 (async db facade across merged MCP + API-key code), 8ad91b4 (MCP-created tasks carry UI-canonical priority `'none'`, never null), 094faa8 (INFO log line per MCP tool call to docker logs)
- Full suite green on main at milestone close: 1126 tests, 1112 pass, 0 fail, 14 skipped (verified 2026-11-07)

## UAT

5/5 scenarios passed (commit 5fe7f67, "UAT passed for Phases 46 (MCP 5/5) and 47 (G shortcuts) — Kanzo #13 done").

## Requirements

- MCP-01 ✓ — tool surface covers shipped commands (35 tools)
- MCP-02 ✓ — authenticated, workspace-scoped, permission-funnel parity, no anonymous access
- MCP-03 ✓ — transport + lifecycle documented (MCP.md, DEPLOY.md §15) and test-pinned; unconfigured = absent
- MCP-04 ✓ — D-12 amendment decided with owner validation: hand-rolled protocol, zero SDK dependencies

## Commits (selection)

- e541e45 — feat/mcp merged to main
- 9837989, 9ff475b — tool surface waves (notifications/milestones/members/handoff; batch/subtask/reorder/own-comment-delete/recur/teams/labels/prompts)
- d3f6169 — MCP.md usage manual
- 35bf109 — parked deferred ideas
- b5fb128, 9d384b9 — Docker runtime + DEPLOY.md §15
- 8ad91b4, 094faa8, 16c6bf4, 67edc7b — post-merge fixes/reconciliations
- 5fe7f67 — UAT recorded

## Technical Debt / Notes

- None known at close; MCP-IDEAS.md holds explicitly parked feature ideas (not debt)
