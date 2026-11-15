# Roadmap: Projects Studio (gr8r)

## Shipped Milestones

- **v2.3 Consolidation & Hardening** (shipped 2026-11-15) — 3 phases (62–64), e2e suite back to 115/115 green, VIEW-02 de-flaked deterministically, mobile tasks-table card stack. Full record: `milestones/v2.3-ROADMAP.md`, `milestones/v2.3-REQUIREMENTS.md`, `milestones/v2.3-phases/`. Audit: `v2.3-MILESTONE-AUDIT.md` (passed, 7/7 requirements).

Previous milestones: see `milestones/` archive (v1.0 → v2.2).

## Backlog

_Requirements for the next milestone are defined by `/gsd-new-milestone`._

Deferred items carried forward:
- Card fields driven by `hidden[]` on mobile (popover hides/shows card fields) — small feature
- SMTP-down email retry semantics (accepted Phase 27, revisit if operational pain)
- MS Project/xlsx human visual check 54-05 (owner-accepted, no Project machine)
- WR-01 CSS scoping follow-up: `.toolbar { flex-shrink: 0 }` app-wide at ≤900px → scope to `.page.flush .toolbar`
- Nyquist validation reconciliation for phase 64 (`64-VALIDATION.md` still `status: draft`)
