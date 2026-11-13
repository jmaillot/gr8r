---
gsd_state_version: "1.0"
milestone: v2.2
milestone_name: Notifications, Search & Delivery
current_phase: 60
current_phase_name: Admin Dashboard & Member Self-View
status: executing
stopped_at: Completed 60-02-PLAN.md
last_updated: "2026-11-13T18:27:04.661Z"
state_head: 5bee14c5eb18539af367969e52b66a591282c739
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 16
  completed_plans: 16
---

# STATE.md

## Project Reference

**Project:** Projects Studio (gr8r) — self-hosted PM workspace
**Core Value:** simple, predictable access + a workspace that reaches you (push, search,
dashboards) without breaking the zero-dependency discipline
**Current Focus:** Phase 60 — Admin Dashboard & Member Self-View

## Current Position

**Phase:** 60 (Admin Dashboard & Member Self-View) — EXECUTING
**Plan:** 2 of 2

**Progress:**[███████░░░] 67%

```
[##########]----------  0/6 phases
```

| Phase | Name | Status |
|-------|------|--------|
| 56 | Delivery Infrastructure | Complete |
| 57 | Views, Columns & General Access | Complete (3/3 plans) |
| 58 | Full-Text Search | Complete (4/4 plans incl. gap closure) |
| 59 | Browser Push | Complete (3/3 plans) |
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
| Phase 58 P01 | 18 min | 3 tasks | 6 files |
| Phase 58 P02 | 9 min | 2 tasks | 2 files |
| Phase 58 P03 | 41 min | 3 tasks | 8 files |
| Phase 59 P01 | 75 min | 3 tasks | 16 files |
| Phase 59 P02 | 50 min | 3 tasks | 5 files |
| Phase 60 P01 | 15m | 3 tasks | 6 files |
| Phase 60 P02 | ~75 min | 3 tasks | 14 files |
| Phase 60 P02 | ~75 min | 3 tasks | 14 files |

## Accumulated Context

### Locked decisions (do not re-open)

- **D-12 amended ×2 (2026-11-12):** `web-push@4.0.0` is runtime dep #2 (pg precedent)
- Saved views/columns live in a server `saved_views` table (Phase 34 notif_prefs precedent)
- Admin dashboard is power-admin: private projects fully visible to admins in aggregates (DASH-04)
- v2.1 decisions M-09..M-13 and phase decisions D-53-1..4 remain in force
- Phase 59: SW-only best-effort open-tab suppression via clients.matchAll — no page↔SW handshake (D-12/D-13); payload stays ticker-only (D-16/D-17)
- Phase 59 wiring lessons: IN.* handlers dispatch only on input/change, A.* on click — data-a buttons must register on A.push*; the service worker must register AFTER api.init() or the module-eval enabled gate keeps api.enabled=false forever on server deployments

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

**Last session:** 2026-11-13T18:27:04.593Z
**Stopped at:** Completed 60-02-PLAN.md
**Resume file:** None

**Last action:** executed 59-03 — SW push handler (D-12 open-client suppression, zero-strings contract intact, deep-link via unchanged notificationclick router), client subscribe helpers + Settings Push tab (gesture-only master toggle, push_due row, device list with per-device test push, EN+FR i18n), phase gate green (1489 tests / 0 fail, lint clean, i18n 0 dead/0 stale, e2e 111/111), owner UAT passed 6/6 on production. Post-checkpoint orchestrator fixups: Dockerfile search-terms.mjs (36bf788), VAPID fixture (a2bca20), SW registration after api.init() (687bbe3), A.push* click-dispatch wiring (040f57d + 94774e4), err.pushSubscribeFailed toast (26a7644).
**Next action:** `/gsd-discuss-phase 60` — Phase 60: Admin Dashboard & Member Self-View (phase 59 complete 3/3)

### Blockers

- 56-01 Task 2 blocked: 500 kB chunk gate unreachable without page-level splitting (measured entry ~606 kB); user decision B = replan DELIV-02 with honest chunk accounting. Task 1 (lazy QR + D-03 UX) committed: 7e45d82, 7d6da16. Task 2 uncommitted changes reverted.

### Execution decisions (Phase 57)

- 57-01: index chunk had 80 B headroom under the DELIV-02 500 kB gate — view-sync code and push.js split into lazy chunks (the 56-02 remedy); chunk gate green again
- 57-01: memberships.role is lowercase in the DB — migration owner attribution queries `role = 'owner'` with a user_id tiebreaker (rowid is pg-unsafe, static-db-audit pinned)
- 57-02: index chunk had ~900 B headroom — all views UI went into a NEW lazy savedViewsUi chunk; download.js + export/csv.js made lazy (async-only call sites); api.deleteView seam dropped for viewSync deleteViewRow (index 499,885 B)
- 57-02: live-row PUTs merge, named-row PUTs replace — a snapshot is the whole view; overwrite only after explicit confirm (D-12)
- 57-02: applyNamedView preserves `q` AND the render `mode` beside the whitelist — both are session state the snapshot never carries (found by the new e2e)

## Decisions

- [Phase 59]: 59-02: PUSH_SINK_MODULE boot seam — the spawned-server harness records sends / simulates failures via endpoint markers; load failure degrades to the real sender
- [Phase 59]: 59-02: test-send route builds the notif SERVER-side (task:null, test-tagged) — no body-carried content (T-59-08); isTest bypasses only the pref gate + self-skip
- [Phase 59]: 59-02: reminder site fans out from ONE post-write doc parse (two consumers); push gated on PUSH.enabled beside — never inside — the MAILER gate

- [Phase 59]: 59-01: client whitelist parity — push_due joined src/core/notifPrefs.js defaults (D-09 plumbing); foreground PUSH_TYPE_PREF untouched
- [Phase 59]: 59-01: push routes read workspace from ?workspace= so the client POSTs the canonical subscription.toJSON() body verbatim; re-POST replaces the endpoint row and preserves created_at (D-03)
- [Phase 57]: 57-03: seeding evidence captured BEFORE normalizeProjects — stored pref seeds private:true only on new (!prev) rows, explicit private always wins (D-04); funnel untouched
- [Phase 57]: 57-03: [Rule 3] export/model.js went lazy (DELIV-02 gate, third application) — S.ui.expMod seam + constants.js DEFAULT_OPTIONS drift pin; index 493.4 kB (~6.6 kB headroom)
- [Phase 58]: fts_meta is the shared sweep marker on both backends; one ftsSweep logic — keeps the sweep dialect-neutral (D-08/D-09); pg creates it in ensureSearchIndex
- [Phase 58]: toPgSql ?→$n counter fixed to span quoted literals (Rule 1, pre-existing facade bug) — a ? after a single-quoted literal renumbered to $1 causing pg bind-count mismatch (08P01)
- [Phase 58]: 58-03: the debounced dispatcher lives in core (node-testable abort/dedupe semantics), palette only wires it; api.js call() gained a signal passthrough rather than a raw fetch fork
- [Phase 58]: 58-03: page-fetch orchestration sits in A.searchPageServer (actions layer owns render(); page modules never import render.js); zero new i18n keys — server hits join the existing Tasks section
- [Phase 58]: 58-03: frozen pins maintained without new names — neutral fallback is inline-SVG stIcon('backlog'); data-a pin annotated 491→492 (server row reuses data-a="openTask")
- [Phase 60]: Self-view endpoint gated 'viewer' (any-member per D-11/acceptance); dashboard raw-doc read is the sanctioned power-admin inversion; server date anchor = tz.js localParts default zone
- [Phase 60]: Dashboard poll teardown rides a ROUTE_TEARDOWN registry in render.js; page renders only from the 60-01 payload; Task 2 poll co-implemented in the tracer slice
