---
gsd_state_version: "1.0"
milestone: v2.4
milestone_name: Automation & Productivity
current_phase: 66
current_phase_name: Task & Project Templates
status: executing
stopped_at: Phase 66 context gathered
last_updated: "2026-11-15T16:27:11.875Z"
state_head: f36dac7107a329ec2ac1d628ddbb4d48be13c714
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 8
  completed_plans: 5
---

# STATE.md

## Project Reference

**Project:** Projects Studio (gr8r) — self-hosted PM workspace
**Core value:** one workspace document pushed client→server through the `mergeClientDoc` funnel; every feature is an extension of that spine, zero new dependencies.
**Milestone:** v2.4 Automation & Productivity — hierarchical subtasks, task/project templates, per-project outbound webhooks (MS Teams), v2.3 backlog polish.

## Current Position

**Phase:** 66 (Task & Project Templates) — READY TO EXECUTE
**Plan:** 5 of 5
**Status:** Ready to execute
**Progress:** ▢▢▢▢ 0/4 phases complete

- [ ] Phase 65: Subtask Tree
- [ ] Phase 66: Task & Project Templates
- [ ] Phase 67: Project Webhooks
- [ ] Phase 68: Backlog Polish

## Performance Metrics

**Unit tests:** 1524 baseline (grow, never shrink) · **e2e:** 115/115 baseline (0 flaky) · **lint:** clean · **chunk gate:** 498.11 kB < 500 kB (~2 kB headroom — lazy-load all new UI) · **i18n:** EN+FR gate green
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 65 P65-01 | 302 | 3 tasks | 4 files |
| Phase 65 P65-02 | 14min | 3 tasks | 10 files |
| Phase 65 P65-03 | 33 | 3 tasks | 14 files |
| Phase 65 P65-04 | 47 | 3 tasks | 18 files |
| Phase 65 P65-05 | 21m | 3 tasks | 11 files |

## Accumulated Context

### Decisions carried into v2.4

- SUB storage shape: flat `t.subtasks[]` + `parentId` (ARCHITECTURE/PITFALLS over STACK) — owner ruling to confirm in the Phase 65 spec before UI code; `parentId` must join the mergeClientDoc normalize whitelist or it is silently stripped
- Parent-done semantics: completing a parent auto-completes descendants (SUB-03); parent progress is computed rollup, never stored
- FTS: subtask titles optional (owner ruling pending) — decides whether Phase 65 touches the dual-backend parity suite
- Templates: doc-embedded `data.templates[]` + `sanitizeTemplateBody()` on read AND write; instantiation through the normal doc-PUT (no fourth write path, no MCP route)
- Webhooks: `webhook_hooks`/`webhook_deliveries` server tables (SQLite+pg same commit), events via pure `diffWebhookEvents(storedDoc, next)` in-tx, delivery post-commit fire-and-forget; emission gated on revision bump; MCP webhook management explicitly out of scope
- POL-02 (SMTP retry) and WHK-03 (delivery retry) share one claim-state-machine design — spec together, Phase 67 before/with 68
- WHK phase carries a threat model (`threats_open: 0`, Phase 30 pattern): SSRF deny-list re-validated per delivery, secrets show-once, never in client-visible doc or logs

### Standing constraints (every phase)

- Zero new runtime or dev deps; 500 kB chunk gate ~2 kB headroom (D-02 lazy-load pattern); EN+FR keys same commit; SQLite+pg parity same commit; MCP parity for every funnel sink; e2e 115/115 green, no weakened assertions or gate edits

### Research flags

- Phase 65 needs `/gsd-plan-phase --research-phase` (storage-shape conflict ruling)
- Phase 67 needs `--research-phase` (SSRF threat model + delivery/claim design)
- Phases 66/68: skip research (fully grounded in repo precedent)

### Blockers

None.

## Session Continuity

**Last session:** 2026-11-15T15:37:23.535Z
**Stopped at:** Phase 66 context gathered
**Resume file:** .planning/phases/66-task-project-templates/66-CONTEXT.md

**Last action:** v2.4 ROADMAP.md created (Phases 65–68), REQUIREMENTS.md traceability updated.
**Next step:** `/gsd-discuss-phase 65` or `/gsd-plan-phase 65` (with research).

## Decisions

- [Phase 65]: server.js imports src/core/subtree.js directly (ESM); read-side heal hooked in normalizeDoc alone since docForClient delegates
- [Phase 65]: normalizeTaskSubtasks: self-referencing parentId cannot self-satisfy (x !== s check) and position requires Number.isSafeInteger
- [Phase 65]: 65-02: funnel tree gate runs BEFORE the lazy heal (heal re-roots self-parents — pre-heal validation is the only gate that can reject them wholesale); whole-array validateSubtree beside validateMove
- [Phase 65]: 65-02: task-level completion cascade wired in applyPatch status:'done' — one site covers every completion surface; reopen cascades nothing (D-13)
- [Phase 65]: 65-03: one shared recursive tree renderer (subTreeChecklistHtml) for drawer/list/board-popover; collapse state in session-only S.ui.subOpenNodes
- [Phase 65]: 65-03: subtask detail view split to a lazy chunk (61-02 remedy) to restore chunk-gate headroom; subtree.leafEntries is the shared leaf-count definition
- [Phase 65]: 65-04: re-parent targets are the moved subtask's siblings only (deterministic one-level set, cannot cycle); subtaskMatch attribution = folded substring scan in the search handler; chunk-gate remedy moved restructure actions + tree renderer + subtask popovers into pre-warmed lazy chunks behind treeChecklist/subPop registries
- [Phase 65]: 65-05: FTS folded subtask-title suffix computed once per task, fed to both dialects; ftsSweep rebuild uses the identical expression (byte-parity)
- [Phase 65]: 65-05: MSPDI OutlineLevel = row.depth + 1 per the EXISTING pinned contract (first-level rows = 1, task rows emit nothing); A1 discrepancy recorded in the summary
- [Phase 65]: 65-05: writeDoc did not ride mergeClientDoc — the shared validateSubtree gate + normalizeTaskSubtasks heal were added inside writeDoc (T-65-11); mcpStripMember fixed to the D-55-4 assignees arrays (T-65-13)
