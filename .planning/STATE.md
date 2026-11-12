---
gsd_state_version: "1.0"
milestone: v2.2
milestone_name: Notifications, Search & Delivery
current_phase: 57
current_phase_name: Views, Columns & General Access
status: executing
stopped_at: Phase 57 context gathered
last_updated: "2026-11-12T15:36:39.420Z"
state_head: 076e8f3f44cd882fcb176a2f84dc0f6507e10d88
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 7
  completed_plans: 4
---

# STATE.md

## Project Reference

**Project:** Projects Studio (gr8r) — self-hosted PM workspace
**Core Value:** simple, predictable access + a workspace that reaches you (push, search,
dashboards) without breaking the zero-dependency discipline
**Current Focus:** Phase 57 — Views, Columns & General Access

## Current Position

**Phase:** 57 (Views, Columns & General Access) — EXECUTING
**Plan:** 1 of 3
**Status:** Executing Phase 57

**Progress:**[██░░░░░░░░] 17%

```
[##########]----------  0/6 phases
```

| Phase | Name | Status |
|-------|------|--------|
| 56 | Delivery Infrastructure | Not started |
| 57 | Views, Columns & General Access | Not started |
| 58 | Full-Text Search | Not started |
| 59 | Browser Push | Not started |
| 60 | Admin Dashboard & Member Self-View | Not started |
| 61 | Notification Trim | Not started |

## Performance Metrics

- v2.1 close: 1385 unit tests, e2e 109/109, lint clean, i18n gate 0 dead/0 stale
- Runtime dependencies: `{ pg }` + web-push@4.0.0 landing in Phase 59 (dep #2, owner-approved)
- Requirement coverage: 24/24 mapped across Phases 56–61

## Accumulated Context

### Locked decisions (do not re-open)

- **D-12 amended ×2 (2026-11-12):** `web-push@4.0.0` is runtime dep #2 (pg precedent)
- Saved views/columns live in a server `saved_views` table (Phase 34 notif_prefs precedent)
- Admin dashboard is power-admin: private projects fully visible to admins in aggregates (DASH-04)
- v2.1 decisions M-09..M-13 and phase decisions D-53-1..4 remain in force

### Sequencing rationale (from research SUMMARY.md)

- Phase 56 first: every later phase's e2e runs on the dist guard + split build
- Phase 58 (FTS) before Phase 59 (push): the doc-PUT funnel `newNotifs` diff site is
  edited once per concern, never concurrently
- Phase 61 last: gated on D-05 owner rulings arriving during execution

### Known flags for planning

- Phase 58: FTS5 needs Node ≥ 22.16 in `node:sqlite` — probe at boot, LIKE fallback if
  absent; tokenizer decision locks at table creation (needs `--research-phase`)
- Phase 59: needs `--research-phase` (RFC 8291/VAPID, real-device Safari/iOS UAT)
- Phase 56: verify Vite major (8.x → `advancedChunks` vs ≤7 → `manualChunks`)
- Phase 57: General-Access precise granularity locked at discuss-phase (VIEW-03)
- Phase 60: dashboard aggregates still route `memberCanReadProject` per item (power-admin
  means admins see private content — members never see the dashboard at all, 403)

### Standing constraints (every phase)

- Full suite green; EN+FR i18n gate (server keys included); lint clean
- Phase 38 suppression + no-double-send invariants pass unmodified
- Zero migrations where feasible; additive rows use the Phase 34 guarded recipe
- Push payloads ≤4096 octets, tickers never task bodies
- All search/dashboard/self-view results route `memberCanReadProject` or dedicated
  redaction funnels, byte-level leak tests

## Session Continuity

**Last session:** 2026-11-12T14:40:13.949Z
**Stopped at:** Phase 57 context gathered
**Resume file:** .planning/phases/57-views-columns-general-access/57-CONTEXT.md

**Last action:** created v2.2 roadmap (Phases 56–61) + traceability in REQUIREMENTS.md
**Next action:** orchestrator presents roadmap → owner approval → `/gsd-plan-phase 56`

### Blockers

- 56-01 Task 2 blocked: 500 kB chunk gate unreachable without page-level splitting (measured entry ~606 kB); user decision B = replan DELIV-02 with honest chunk accounting. Task 1 (lazy QR + D-03 UX) committed: 7e45d82, 7d6da16. Task 2 uncommitted changes reverted.
