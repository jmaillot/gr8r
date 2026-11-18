# Roadmap: Projects Studio

## Milestones

- ✅ **v2.5 Template Polish & Import** — 67-05/06/07 quick work: favourites, MD import with complete per-kind examples, starters toggle, 65-05 indent fix (shipped 2026-11-16) — [archive](milestones/v2.5-ROADMAP.md)
- ✅ **v2.4 Automation & Productivity** — Phases 65-68 (shipped 2026-11-16) — [archive](milestones/v2.4-ROADMAP.md)
- ✅ **v2.3** — shipped (see `.planning/milestones/`)
- 🚧 **v2.6 Exports Verification (Test 11)** — Phase 69: automated 3-level structural pre-screen, owner UAT with real MS Project, verdict + A1 closure — [requirements](REQUIREMENTS.md)
- 🚧 **Next** — not yet planned

## Phases

### Phase 69: Exports Verification (Test 11)

**Goal**: Prove the multi-level subtask tree survives a REAL round-trip with MS Project — close Phase 65 item A1 (REQ-EXP-01/02/03).
**Depends on**: Nothing (verification-only; Phase 65 shipped in v2.4)
**Requirements**: REQ-EXP-01, REQ-EXP-02, REQ-EXP-03; NFR-01, NFR-02, NFR-03
**Success Criteria** (what must be TRUE):
  1. Automated pre-screen: the existing `node:test` suites assert a 3-level fixture (task → subtask → sub-subtask) for each format — MSPDI `OutlineLevel = depth + 1` at every level with Summary re-derived from the serialized XML, no upward level skip, DFS row order; xlsx/CSV rows in DFS order with dotted-key hierarchy; all assertions use existing tooling, zero new dependencies, all standing gates stay green (1705+ unit grow-only, chunk ≤500 kB, EN+FR i18n, e2e 132/132).
  2. Owner UAT per `.planning/research/VERIFICATION.md`: the owner imports each export of the 3-level fixture into real MS Project — MSPDI via XML Import Wizard "as new project" (primary verdict), xlsx via Excel paste (flat expected, recorded as such), CSV via import wizard (flat expected, recorded as such) — with evidence captured (wizard/repair dialogs verbatim, 3-level Gantt screenshot).
  3. Verdict (pass/fail per format) recorded in the phase verification doc; item A1 checked off and Phase 999.1 backlog entry closed.
  4. **Conditional (in-phase, only if UAT fails):** any MSPDI import defect (or repair dialog) is fixed within this milestone and re-verified through criteria 1+2 before closure — while staying in scope (no new export formats, no CSV/xlsx hierarchy enrichment, no incoming-import feature, no round-trip automation; NFR-03: existing 2-level export behavior unchanged).

**Plans**: 3 — 69-01 (automated 3-level pre-screen), 69-02 (owner UAT evidence), 69-03 (verdict/A1 closure; conditional fix wave per D-69-9)

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

_(empty — Phase 999.1 (Test 11) promoted to Phase 69, the v2.6 milestone core.)_

## Standing Constraints (all phases)

- Zero new runtime or dev dependencies (fetch/node:crypto/stdlib only)
- 500 kB chunk gate (~2 kB headroom) — all new UI lazy-loaded via the D-02 pattern
- EN+FR i18n gate; every new doc shape registered as a mergeClientDoc sink; every new server validator shared across UI/API/MCP
- SQLite+pg parity in the same commit for every new server table
- MCP parity for every funnel sink; e2e suite stays green (115/115 baseline + new specs)
- MS Teams target is Workflows webhooks only (O365 connectors retired May 2026)

### Phase 70: Subtasks in Timeline and Board XLSX

**Goal:** Subtask rows appear in the XLSX Timeline (indented, parent-grouped DFS bars) and Board (flat cards in status lanes) per D-70-1..D-70-7
**Requirements**: REQ-EXP-01, NFR-01, NFR-02, NFR-03
**Depends on:** Phase 69
**Plans:** 1 plan

Plans:
- [x] 70-01-PLAN.md — model/gantt/writer subtask lift + test pins

### Phase 71: Subtask columns in List view

**Goal:** Subtask rows in the List view display Status (done/todo chip), Assignees, Priority (inherited from parent) and Due (s.due || parent due, inherited tooltip) aligned to the parent column grid
**Requirements**: TBD (coverage derived from D-71-1…D-71-7)
**Depends on:** Phase 70
**Plans:** 4/4 plans executed (71-01 executed; 71-02/71-04 gap closures)

Plans:
- [x] 71-04-PLAN.md — gap closure: G-71-3 subrow status chip pill-contract alignment + inner-chip-content e2e metric
- [x] 71-03-PLAN.md
- [x] 71-01-PLAN.md — subtask meta columns in List view: opt-in `columns` opt, tpl forwarding, status chip, test pins
- [x] 71-02-PLAN.md — gap closure: subrow grid alignment (CR-01 gap:0 + WR-02 indent-on-item), WR-01 focus indicator, IN-01 drift note
