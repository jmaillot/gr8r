# Roadmap: Projects Studio

## Milestones

- ✅ **v2.5 Template Polish & Import** — 67-05/06/07 quick work: favourites, MD import with complete per-kind examples, starters toggle, 65-05 indent fix (shipped 2026-11-16) — [archive](milestones/v2.5-ROADMAP.md)
- ✅ **v2.4 Automation & Productivity** — Phases 65-68 (shipped 2026-11-16) — [archive](milestones/v2.4-ROADMAP.md)
- ✅ **v2.3** — shipped (see `.planning/milestones/`)
- 🚧 **Next** — not yet planned

## Phases

<details>
<summary>✅ v2.5 Template Polish & Import (quick work 67-05/06/07) — SHIPPED 2026-11-16</summary>

- [x] 67-05: Template favourites — persistent star, favourites-first pickers, create-modal block
- [x] 67-06: Template import from Markdown — pure parser, editor-review flow, lazy label split
- [x] 67-07: Complete per-kind MD examples, nested task parsing, hideStarters toggle

Full details: [milestones/v2.5-ROADMAP.md](milestones/v2.5-ROADMAP.md) · Audit: [v2.5-MILESTONE-AUDIT.md](v2.5-MILESTONE-AUDIT.md)

</details>

<details>
<summary>✅ v2.4 Automation & Productivity (Phases 65-68) — SHIPPED 2026-11-16</summary>

- [x] Phase 65: Subtask Tree (5/5 plans) — multi-level hierarchical subtasks survive every surface (views, funnel, FTS, exports, MCP)
- [x] Phase 66: Task & Project Templates (3/3 plans) — reusable templates with offset-based dates, instantiated through the normal doc-PUT
- [x] Phase 67: Project Webhooks (5/5 plans) — per-project outbound webhooks delivering MS Teams payloads with SSRF defense and bounded retry
- [x] Phase 68: Backlog Polish (4/4 plans) — v2.3 deferred items: mobile hidden[] card fields, SMTP retry claim-state machine, WR-01 CSS scoping, Nyquist reconciliation

Full phase details: [milestones/v2.4-ROADMAP.md](milestones/v2.4-ROADMAP.md) · Requirements outcomes: [milestones/v2.4-REQUIREMENTS.md](milestones/v2.4-REQUIREMENTS.md)

</details>

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
