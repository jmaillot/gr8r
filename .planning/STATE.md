---
gsd_state_version: "1.0"
milestone: v2.4
milestone_name: Automation & Productivity
current_phase: 65
current_phase_name: Subtask Tree
status: Roadmap created, awaiting planning
stopped_at: Phase 65 context gathered
last_updated: "2026-11-15T09:31:05.411Z"
state_head: f6eba3255827c16ccdc1e164c0f13f2ff404e88a
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# STATE.md

## Project Reference

**Project:** Projects Studio (gr8r) — self-hosted PM workspace
**Core value:** one workspace document pushed client→server through the `mergeClientDoc` funnel; every feature is an extension of that spine, zero new dependencies.
**Milestone:** v2.4 Automation & Productivity — hierarchical subtasks, task/project templates, per-project outbound webhooks (MS Teams), v2.3 backlog polish.

## Current Position

**Phase:** 65 — Subtask Tree (first phase of v2.4; phases 65–68)
**Plan:** none yet — run `/gsd-plan-phase 65`
**Status:** Roadmap created, awaiting planning
**Progress:** ▢▢▢▢ 0/4 phases complete

- [ ] Phase 65: Subtask Tree
- [ ] Phase 66: Task & Project Templates
- [ ] Phase 67: Project Webhooks
- [ ] Phase 68: Backlog Polish

## Performance Metrics

**Unit tests:** 1524 baseline (grow, never shrink) · **e2e:** 115/115 baseline (0 flaky) · **lint:** clean · **chunk gate:** 498.11 kB < 500 kB (~2 kB headroom — lazy-load all new UI) · **i18n:** EN+FR gate green

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

**Last session:** 2026-11-15T09:31:05.390Z
**Stopped at:** Phase 65 context gathered
**Resume file:** .planning/phases/65-subtask-tree/65-CONTEXT.md

**Last action:** v2.4 ROADMAP.md created (Phases 65–68), REQUIREMENTS.md traceability updated.
**Next step:** `/gsd-discuss-phase 65` or `/gsd-plan-phase 65` (with research).
