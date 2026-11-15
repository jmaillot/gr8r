---
phase: 66-task-project-templates
plan: 01
subsystem: templates-storage
tags: [templates, funnel, whitelist, sanitizer, mcp-parity]
requires: [phase-65-subtree (validateSubtree/normalizeTaskSubtasks/subtask shape)]
provides: [src/core/templates.js (sanitizeTemplate, sanitizeTaskBody, sanitizeProjectBody, sanitizeTemplateSubtask, normalizeTemplatesData), server.js normalizeTemplatesData hooks (write+read), mcp.js writeDoc second call site]
affects: [66-02 (instantiateTemplate builder consumes sanitizeTemplate/sanitizeProjectBody), 66-03 (UI reads doc.templates[])]
tech-stack:
  added: []
  patterns: [one-validator-two-call-sites (T-65-11), funnel whitelist sink (normalizeSubtasksData mirror), wholesale gate before lazy heal (65-02 lesson), machine-code-only errors out of src/ (i18n scan gate)]
key-files:
  created: [src/core/templates.js, test/templates.test.mjs]
  modified: [server.js, mcp.js, test/mcp.test.mjs]
decisions:
  - templates.js takes exactly ONE import — the zero-import sibling subtree.js — so the embedded-tree gate and heal reuse validateSubtree/normalizeTaskSubtasks (one validator, never a second one); the tracer commit itself stayed zero-import and the import landed with the task-2 gate
  - normalizeDoc read path calls the sink with gate:false — heal-only, a stored doc that slipped past the write gate must never become a read failure (Phase 65 read-path asymmetry)
  - the gate throws Error(verdict.code) with status 400 — English prose stays out of src/ (i18n scan gate); the client translates subtaskCycle/subtaskDepth via the EN+FR catalogues (ERR-01) and mcp.js composes the human wording at its call site
  - missing template positions take the array-index fallback at sanitize time, then participate in the rank renumber (storage order) — distinct safe integers, rank-preserving, idempotent on repeat PUTs
  - project-kind bodies whitelist exactly {name, description, status, teams} in 66-01 — the embedded project task tree whitelist + builder is 66-02's handoff (the gate already runs on whatever embedded arrays exist)
metrics:
  duration: 13min
  completed: 2026-11-15
status: complete
actuals:
  tokens: 19525   # chars/4 over the 5 changed files (781 insertions / 1 minor line)
  tasks: 3
  commits: 6
plan_head_before: abaad4b1666640d362838c19f26041d5beccde29
plan_head_after: c05531eb26f3894c6e3ace2e095dd082f6e4062e
---

# Phase 66 Plan 01: Template Storage Substrate Summary

Per-kind whitelist sanitizer + funnel sink: `doc.templates[]` round-trips byte-identically through mergeClientDoc (write), normalizeDoc (read) and MCP writeDoc, with unknown fields dropped by construction, cyclic embedded trees rejected wholesale, and D-03 position renumbering.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Tracer: one task template round-trips the funnel | 83bf2f4 | src/core/templates.js, server.js, test/templates.test.mjs |
| 2a | TDD RED — gate/whitelist/position pins | bdf64e0 | test/templates.test.mjs |
| 2b | TDD GREEN — gate + heal + D-03 renumber | f905120 | src/core/templates.js, server.js, test/templates.test.mjs |
| 2c | lint style fix | 0c77a08 | test/templates.test.mjs |
| 3 | MCP writeDoc second call site | 0ff5916 | mcp.js, test/mcp.test.mjs |
| — | Auto-fix: machine-code-only errors out of src/ | c05531e | src/core/templates.js |

## What Was Built

- **src/core/templates.js** — pure, DOM-free module (subtree.js discipline; its only import is the zero-import subtree.js). `sanitizeTemplate` rebuilds exactly the D-02 key set (id/kind/name/icon/color/body/position/createdBy/createdAt/updatedAt); `sanitizeTaskBody` whitelists title/notes/priority/subtasks; `sanitizeProjectBody` whitelists name/description/status/teams (D-14 — no assignees/lead/members/milestones anywhere); embedded subtask entries are whitelisted IN PLACE (id/parentId/position/title/done/note + dueOffsetDays only when numeric) — never mapped to fresh objects (the Phase 65 trap). `normalizeTemplatesData` is the funnel sink: array guard, per-record rebuild, wholesale `validateSubtree` gate BEFORE the in-place `normalizeTaskSubtasks` heal, rank-preserving position renumber (D-03, idempotent).
- **server.js** — sink imported beside the subtree.js import; hooked in `mergeClientDoc` after `normalizeSubtasksData(next.data, uid)` and before the perm gates (gate on — throws 400 inside the funnel tx), and in `normalizeDoc` after the read-side subtask pass (gate:false — heal-only).
- **mcp.js** — `writeDoc` calls the identical sink before the JSON.stringify write (T-66-02); funnel errors surface as `toolError` with the stable code, matching the Phase 65 gate shape.
- **test/templates.test.mjs** (19 tests) — pure D-02/D-04/D-14 pins, dispatch pins, position idempotency, cycle/depth rejects, junk heal, funnel round-trip + 400-subtaskCycle pins through ./helpers/server.mjs.
- **test/mcp.test.mjs** (+2 tests) — seeded-template writeDoc round-trip (junk drops, D-02 survives) and seeded-cycle wholesale reject with revision pin.

## Verification

- `node --test test/templates.test.mjs` — 19/19 green
- `node --test test/mcp.test.mjs test/templates.test.mjs test/subtask-tree.test.mjs` — 92/92 green
- Full unit suite — 1601 tests, 0 fail (baseline 1524 grown, never shrunk)
- `scripts/i18n-scan.mjs` — 0 literals, exit 0
- `npx eslint` on all touched files — clean
- `normalizeTemplatesData` called at exactly 3 sites: server.js:874 (read), server.js:1361 (write), mcp.js:222 (MCP); no duplicated whitelist in mcp.js

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] i18n scan gate failure — English prose in src/**
- **Found during:** full-suite run after Task 3
- **Issue:** the embedded-tree gate copied the Phase 65 human messages ("That change would create a subtask cycle") into src/core/templates.js; scripts/i18n-scan.mjs flagged 2 unlisted literals and 4 suite tests went red (the allow-list must stay empty).
- **Fix:** the gate now throws `Error(verdict.code)` with `status: 400`; the client code-translates subtaskCycle/subtaskDepth (EN+FR catalogued since Phase 65) and mcp.js composes the human wording at its call site (outside src/).
- **Files modified:** src/core/templates.js
- **Commit:** c05531e

### Decisions (within plan discretion)

- templates.js imports subtree.js from Task 2 onward — the tracer's zero-import acceptance held at its own commit; the plan's "one validator" rule outranks the grep once the gate exists.
- Read-path hook passes `gate:false` — the plan mandated the normalizeDoc hook but a throwing read path would break every workspace GET; heal-only mirrors the Phase 65 read asymmetry.
- Project-body `tasks` (embedded project task tree) is NOT whitelisted in 66-01 per the plan's exact-key-set acceptance — 66-02's builder must extend sanitizeProjectBody; the sink's gate already processes any embedded `body.tasks[].subtasks` arrays that ever exist.

## Known Stubs

None — no placeholder values, no unwired data paths. (Project-kind embedded task-tree storage is deliberately deferred to 66-02 per plan wording, not a stub.)

## Self-Check: PASSED

- Files exist: src/core/templates.js, test/templates.test.mjs ✓
- Commits verified: 83bf2f4, bdf64e0, f905120, 0c77a08, 0ff5916, c05531e ✓ (git log)
- All must_haves truths satisfied (round-trip, whitelist drop, D-03 normalization, subtaskCycle wholesale reject, MCP sink) ✓
