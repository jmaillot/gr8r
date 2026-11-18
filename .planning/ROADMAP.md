# Roadmap: Projects Studio

## Milestones

- ✅ **v2.6 Exports Verification (Test 11)** — Phase 69: real MS Project round-trip proof (A1 closed), Phase 70: subtasks in Timeline/Board XLSX, Phase 71: subtask columns in List view (shipped 2026-11-18) — [archive](milestones/v2.6-ROADMAP.md)
- ✅ **v2.5 Template Polish & Import** — 67-05/06/07 quick work: favourites, MD import with complete per-kind examples, starters toggle, 65-05 indent fix (shipped 2026-11-16) — [archive](milestones/v2.5-ROADMAP.md)
- ✅ **v2.4 Automation & Productivity** — Phases 65-68 (shipped 2026-11-16) — [archive](milestones/v2.4-ROADMAP.md)
- ✅ **v2.3** — shipped (see `.planning/milestones/`)
- 🚧 **Next** — not yet planned

## Phases

<details>
<summary>✅ v2.6 Exports Verification (Test 11) (Phases 69-71) — SHIPPED 2026-11-18</summary>

- [x] Phase 69: Exports Verification (Test 11) (3/3 plans) — MSPDI re-UAT PASS (18/18 rows exact), A1 closed
- [x] Phase 70: Subtasks in Timeline and Board XLSX (3/3 plans) — DFS child bars, Board lanes, due inheritance fixed
- [x] Phase 71: Subtask columns in List view (5/5 plans incl. gap closures) — status/assignee/priority/due aligned to parent grid

Full details: [milestones/v2.6-ROADMAP.md](milestones/v2.6-ROADMAP.md) · Audit: [v2.6-MILESTONE-AUDIT.md](milestones/v2.6-MILESTONE-AUDIT.md)

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
