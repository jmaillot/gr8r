---
gsd_state_version: "1.0"
milestone: v2.6
milestone_name: Exports Verification (Test 11)
current_phase: 69
current_phase_name: Exports Verification (Test 11)
status: phase_complete
stopped_at: Phase 70 context gathered
last_updated: "2026-11-17T11:37:34.092Z"
last_activity: 2026-11-17
last_activity_desc: Phase 69 complete — Test 11 verdict PASS, A1 closed
state_head: 705f7f09ac3652ba21a8258641a0333008eb2e87
progress:
  total_phases: 2
  completed_phases: 1
  total_plans: 3
  completed_plans: 3
---

# STATE.md

## Project Reference

**Project:** Projects Studio (gr8r) — self-hosted PM workspace
**Core value:** one workspace document pushed client→server through the `mergeClientDoc` funnel; every feature is an extension of that spine, zero new dependencies.
**Milestone:** v2.5 Template Polish & Import — SHIPPED 2026-11-16 (see `.planning/milestones/v2.5-ROADMAP.md`).
**Current focus:** Phase 69 — Exports Verification (Test 11)

## Current Position

Phase: 69 (Exports Verification (Test 11)) — COMPLETE
Plan: 3 of 3 — complete
Status: Phase complete — ready for ship/complete-milestone
Last activity: 2026-11-17 — Test 11 verdict PASS (owner re-UAT 18/18 rows exact), Phase 65 item A1 + Phase 999.1 backlog closed

## Performance Metrics

**Unit tests:** 1713 pass / 1726 (grow, never shrink) · **e2e:** 132/132 (0 flaky) · **lint:** 15 pre-existing baseline errors · **chunk gate:** 499940/500000 bytes (~60 bytes headroom — the gate is tight; lazy-load all new UI, no bare quoted Lucide-name label keys) · **i18n:** EN+FR gate green
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 65 P65-01 | 302 | 3 tasks | 4 files |
| Phase 65 P65-02 | 14min | 3 tasks | 10 files |
| Phase 65 P65-03 | 33 | 3 tasks | 14 files |
| Phase 65 P65-04 | 47 | 3 tasks | 18 files |
| Phase 65 P65-05 | 21m | 3 tasks | 11 files |
| Phase 66 P01 | 13min | 3 tasks | 5 files |
| Phase 66 P02 | 34min | 2 tasks | 9 files |
| Phase 66 P03 | 75min | 3 tasks | 18 files |
| Phase 68 P01 | 10min | 2 tasks | 3 files |
| Phase 68 P02 | ~55min | 3 tasks | 5 files |
| Phase 68 P03 | ~35min | 3 tasks | 4 files |
| Phase 68 P04 | 45 | 2 tasks | 0 files |
| Phase 67 P05 | 3min | 1 tasks | 1 files |
| Phase 69 P01 | 25m | 3 tasks | 5 files |
| Phase 69 P02 | ~7min | 2 tasks | 3 files |

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

## Deferred Items

| Milestone | Phase | Item | Status |
|---|---|---|---|
| v2.4 | 66 | Chunk-size gate overage at 66-02 start (pre-existing) — resolved in 66-03; acknowledged at milestone close | acknowledged (resolved) |

## Session Continuity

**Last session:** 2026-11-17T11:37:34.058Z
**Stopped at:** Phase 70 context gathered
**Resume file:** .planning/phases/70-subtasks-in-timeline-and-board-xlsx/70-CONTEXT.md

**Last action:** v2.4 ROADMAP.md created (Phases 65–68), REQUIREMENTS.md traceability updated.
**Next step:** `/gsd-execute-phase 68` (remaining: 68-04 phase gate) or `/gsd-verify-work`

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
- [Phase 66]: 66-01: src/core/templates.js is the one template validator (sanitizeTemplate D-02 whitelist, per-kind bodies D-04/D-14, in-place subtask entries); its only import is the zero-import subtree.js so the embedded-tree gate reuses validateSubtree/normalizeTaskSubtasks
- [Phase 66]: 66-01: normalizeTemplatesData hooked at 3 sites — mergeClientDoc (gate on, 400 inside tx), normalizeDoc (gate:false, heal-only read path), mcp.js writeDoc (toolError with stable code); D-03 rank renumber is idempotent
- [Phase 66]: 66-02: instantiation = pure builder (instantiateTemplate) + pure landing (landInstantiation) + thin lazy-chunk actions — exactly one pushNow per mutation, push discipline pinned structurally + one real revision-bump funnel pin
- [Phase 66]: 66-02: template actions ride a lazy prewarm chunk (main.js dynamic import) after a static import blew the 500 kB entry gate; templateUi.openEditor registry is stub-safe until 66-03
- [Phase 66]: 66-03: template surfaces are chunk-backed modals (templatePick/templateEdit) cached in S.ui.tplUi; editor edits a DRAFT via Phase 65 subtree validators; entry-gate remedy = assigneePick/filePreview moved to lazy chunks loaded before openModal
- [Phase 68]: POL-02: email_outbox claims ride the semantic-claim txs (doc-PUT + reminders_sent); MAILER-disabled producers skip claiming; retry math shared from webhook-retry.js
- [Phase 68]: POL-01: .mcard hideable fields are a pure render-time read of v.hidden keyed on TCOLS ids (priority/due/estimate/progress verified verbatim); D-01 exemption is structural (.mch row + assignees sit outside every gate); A3 confirmed — the 899px popover-hidden assertion was inverted deliberately per D-02
- [Phase 68]: 68-04 phase gate: unit 1701/1688 green (13 skips all pre-existing env gates), e2e 129/129 green after clearing lingering server.js processes — e2e 'server not ready' failures are contention flakes, not regressions
- [Phase 67]: G-67-2 gap closure: test webhook payload body rebranded to Projects Studio; x-gr8r-signature protocol header intentionally unchanged
- [Phase 69]: 69-01: 3-level export pre-screen pinned to ACTUAL model/writer contracts (CR-01 row ids, writer-depth Summary walk); indent/flat shapes pinned as-is, no enrichment
- [Phase 69]: 69-02: generator opts.subtasks:true is load-bearing (DEFAULT_OPTIONS false) and the inline self-check pins the 3-level signals; model progress pins follow the fixture growth 2/12

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
