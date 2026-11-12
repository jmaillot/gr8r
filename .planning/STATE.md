---
gsd_state_version: "1.0"
milestone: v2.2
milestone_name: Notifications, Search & Delivery
current_phase: 57
current_phase_name: Views, Columns & General Access
status: executing
stopped_at: Completed 57-03-PLAN.md
last_updated: "2026-11-12T18:29:02.526Z"
state_head: d552aeac6df6be47e217e04d2bc9fe0b3d5df445
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 7
  completed_plans: 7
---

# STATE.md

## Project Reference

**Project:** Projects Studio (gr8r) — self-hosted PM workspace
**Core Value:** simple, predictable access + a workspace that reaches you (push, search,
dashboards) without breaking the zero-dependency discipline
**Current Focus:** Phase 57 — Views, Columns & General Access

## Current Position

**Phase:** 57 (Views, Columns & General Access) — COMPLETE (all 3 plans executed)
**Plan:** 3 of 3
**Status:** 57-01, 57-02, 57-03 complete — ready for `/gsd-verify-work 57`

**Progress:**[███░░░░░░░] 24%

```
[##########]----------  0/6 phases
```

| Phase | Name | Status |
|-------|------|--------|
| 56 | Delivery Infrastructure | Not started |
| 57 | Views, Columns & General Access | Complete (3/3 plans) |
| 58 | Full-Text Search | Not started |
| 59 | Browser Push | Not started |
| 60 | Admin Dashboard & Member Self-View | Not started |
| 61 | Notification Trim | Not started |

## Performance Metrics

- v2.1 close: 1385 unit tests, e2e 109/109, lint clean, i18n gate 0 dead/0 stale
- Runtime dependencies: `{ pg }` + web-push@4.0.0 landing in Phase 59 (dep #2, owner-approved)
- Requirement coverage: 24/24 mapped across Phases 56–61

**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 57 P03 | 65 min | 2 tasks | 12 files |

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

**Last session:** 2026-11-12T18:29:02.483Z
**Stopped at:** Completed 57-03-PLAN.md
**Resume file:** None

**Last action:** executed 57-03 — defaultPrivate workspace default (owner toggle, Access-tab hint, createProject seed + server seeding parity, funnel untouched); full chain green (1426 unit, e2e green modulo 2 isolation-verified flakes); [Rule 3] export/model went lazy (index 493.4 kB)
**Next action:** `/gsd-verify-work 57`, then `/gsd-plan-phase 58` (FTS needs `--research-phase`)

### Blockers

- 56-01 Task 2 blocked: 500 kB chunk gate unreachable without page-level splitting (measured entry ~606 kB); user decision B = replan DELIV-02 with honest chunk accounting. Task 1 (lazy QR + D-03 UX) committed: 7e45d82, 7d6da16. Task 2 uncommitted changes reverted.

### Execution decisions (Phase 57)

- 57-01: index chunk had 80 B headroom under the DELIV-02 500 kB gate — view-sync code and push.js split into lazy chunks (the 56-02 remedy); chunk gate green again
- 57-01: memberships.role is lowercase in the DB — migration owner attribution queries `role = 'owner'` with a user_id tiebreaker (rowid is pg-unsafe, static-db-audit pinned)
- 57-02: index chunk had ~900 B headroom — all views UI went into a NEW lazy savedViewsUi chunk; download.js + export/csv.js made lazy (async-only call sites); api.deleteView seam dropped for viewSync deleteViewRow (index 499,885 B)
- 57-02: live-row PUTs merge, named-row PUTs replace — a snapshot is the whole view; overwrite only after explicit confirm (D-12)
- 57-02: applyNamedView preserves `q` AND the render `mode` beside the whitelist — both are session state the snapshot never carries (found by the new e2e)

## Decisions

- [Phase 57]: 57-03: seeding evidence captured BEFORE normalizeProjects — stored pref seeds private:true only on new (!prev) rows, explicit private always wins (D-04); funnel untouched
- [Phase 57]: 57-03: [Rule 3] export/model.js went lazy (DELIV-02 gate, third application) — S.ui.expMod seam + constants.js DEFAULT_OPTIONS drift pin; index 493.4 kB (~6.6 kB headroom)
