# Requirements — Milestone v2.3 Consolidation & Hardening

**Status:** Proposed
**Milestone:** v2.3 Consolidation & Hardening
**Goal:** bring the whole verification suite back to 100% green and fix the mobile
experience of the tasks table — no new features.
**Constraints:** zero new runtime dependencies (dev-side too); standing gates intact
(500 kB chunk gate — only ~220 B headroom, EN+FR i18n gate incl. server keys, lint
clean, Phase 38 suppression + no-double-send invariants); 1524-test unit suite green
throughout; no weakened assertions or global retry/timeouts masking regressions.

## v2.3 Requirements

### E2E Repair (CONS-01)

- [x] **E2E-01**: The e2e webServer readiness contract is race-free — no spec hits
  ECONNREFUSED 127.0.0.1:4317 from a shared helper-level readiness poll
  (fail-closed design preserved: no `reuseExistingServer` default change, global
  `retries` untouched, gracefulShutdown intact)
- [x] **E2E-02**: The 9 drifted specs pass against HEAD (`french-overflow.spec.mjs`
  ×7 + `locale.spec.mjs:122`) via role-based queries and auto-retrying waits on the
  lazy Settings chunk — assertions are strengthened waiting, never weakened; the
  native `<select>` language control is asserted by its real combobox role
- [ ] **E2E-03**: The full e2e suite is 111/111 green at milestone close (0 known
  failures, VIEW-02 stabilized per FLAKY-01/02)

### Flaky Stabilization (CONS-03)

- [x] **FLAKY-01**: The VIEW-02 flake root cause is diagnosed with evidence
  (repeated-run trace with retries=0, pre-warmed server, `--workers=1`) — leading
  hypotheses: debounced `persistLiveView` write-through race, coordinate-click
  popover dismissal, shared OWNER/acme live-state coupling
- [x] **FLAKY-02**: VIEW-02 passes deterministically (repeat-each N × locally green
  with retries=0) — no added sleeps, no `networkidle`, no raised global retries;
  app async-contract bug fixed if the triage proves it is one

### Mobile Tasks Table (CONS-02)

- [ ] **MOB-01**: Under the mobile breakpoint the tasks-table Columns button is
  hidden (owner ruling 2026-11-14: hide-the-button contract) — no desktop behavior
  change, column show/hide and saved views untouched in desktop; saved-view blobs
  stay byte-compatible
- [ ] **MOB-02**: The tasks table is honestly usable on a mobile viewport — card
  stack renders without truncation from the toolbar affordances; verified by a
  mobile-viewport e2e (`setViewportSize`, web-first assertions), not screenshots

## Future Requirements (deferred)

- Card fields driven by `hidden[]` on mobile (popover hides/shows card fields) —
  richer contract, deferred as a small feature for a later milestone
- SMTP-down email retry semantics (accepted Phase 27, revisit if operational pain)
- MS Project/xlsx human visual check 54-05 (owner-accepted, no Project machine)

## Out of Scope (explicit exclusions)

- Any new feature — this milestone is repair-only by owner decision (2026-11-14)
- Weakening assertions, global `retries` increases, or timeout inflation to make
  specs pass (anti-feature per research PITFALLS.md)
- 500 kB chunk-gate threshold edits (gate holds at 500,000 B)
- New runtime or dev dependencies

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| E2E-01 | Phase 62 | Complete |
| E2E-02 | Phase 62 | Complete |
| E2E-03 | Phase 64 | Pending |
| FLAKY-01 | Phase 63 | Complete |
| FLAKY-02 | Phase 63 | Complete |
| MOB-01 | Phase 64 | Pending |
| MOB-02 | Phase 64 | Pending |

Coverage: 7/7 mapped. E2E-03 (111/111 at milestone close) maps to Phase 64, the final
phase, since it requires Phases 62–63 complete plus the mobile change landed.
