---
gsd_state_version: "1.0"
milestone: v2.7
milestone_name: Installable App (PWA)
current_phase: 74
current_phase_name: Service Worker Verification & Milestone Acceptance
status: planning
stopped_at: Phase 74 context gathered
last_updated: "2026-11-18T22:17:29.331Z"
state_head: 5a695c58d149abb1f7b75614a163fffbdbeb507d
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 5
  completed_plans: 5
last_activity: 2026-11-18
---

# STATE.md

## Project Reference

**Project:** Projects Studio (gr8r) — self-hosted PM workspace
**Core value:** one workspace document pushed client→server through the `mergeClientDoc` funnel; every feature is an extension of that spine, zero new dependencies.
**Milestone:** v2.7 Installable App (PWA) — started 2026-11-18
**Current focus:** Phase 73 — Install Hint Banner

## Current Position

Phase: 74 — Service Worker Verification & Milestone Acceptance
Plan: Not started
Status: Ready to plan
Progress: [███████░░░] 67%

```
[..........] 0%  (0/3 phases)
```

## Performance Metrics

**Baseline at milestone start (post-v2.6):** unit 1737 pass / 1750 · e2e subtask-align 9/9 ·
lint 16 pre-existing baseline errors · chunk gate 499,995/500,000 bytes (~2 kB headroom —
the binding constraint for Phase 73)
**Per-Plan Metrics:**

_(none yet this milestone)_
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 73 P01 | 21min | 2 tasks | 8 files |
| Phase 73 P02 | 16min | 2 tasks | 3 files |
| Phase 73 P03 | 14min | 2 tasks | 3 files |

## Milestone Decisions (v2.7)

- Zero edits to `public/sw.js` — the existing root-scope push SW IS the install SW
  (no fetch handler needed since Chrome 108/112 removed the requirement); PWA-03 is
  verification-only, any sw.js diff is STOP-and-justify
- `start_url`/`scope`/`id` all frozen to `/` — root-domain deployments only, absolute
  manifest paths (multi-tenant `/w/:slug` must stay outside manifest scope)
- Manifest filename `.webmanifest` + `application/manifest+json` MIME (one server.js
  mime-map line), no-cache like sw.js
- Maskable icons = separate padded safe-zone redesign files, NOT blind padding and NOT
  combined `any maskable` purpose; keep the Phase 43 D-06 per-workspace favicon boundary
- Install banner is the ONLY JS surface: lazy chunk (D-48-1 pattern), entry delta < 200
  bytes, feature-based iOS detection (`'BeforeInstallPromptEvent' in window` + UA), never
  timeout-based; honest no-op on Firefox/iOS
- No offline caching, no second SW, no skipWaiting/clients.claim (structurally forbidden
  by pinned tests); zero new dependencies

## Accumulated Context

### Research ground truth (SUMMARY.md, HIGH confidence)

- Chromium install criteria: manifest + icons + SW registered — fetch-handler requirement
  removed (Chrome 108 mobile / 112 desktop); existing `public/sw.js` at root scope,
  served no-cache by `server.js:8097`, registered via `registerSw()` in
  `src/core/push.js:141-172` on boot + `enterApp`
- `test/browser-push.test.mjs:124` forbids `fetch|install|activate|import` tokens in
  sw.js (regex includes comments) and pins byte-identical substrings
- iOS never fires `beforeinstallprompt`; Firefox desktop neither (v143 Windows web apps
  exist but no event). Real-device install dialogs cannot be automated → human UAT
- Research flags: Phase 73 may warrant `--research-phase` (banner UX matrix, gates);
  Phases 72/74 follow standard patterns

### Standing constraints (every phase)

- Zero new runtime or dev deps; 500 kB chunk gate (entry headroom ~2 kB — Phase 73 banner
  MUST be lazy); EN+FR keys same commit; root-domain-only deploy stance; **zero edits to
  public/sw.js**; no offline caching anywhere

### Blockers

None.

## Deferred Items

| Milestone | Phase | Item | Status |
|---|---|---|---|
| v2.4 | 65 | UAT Test 11 — exports in MS Project (Phase 69 re-UAT passed in v2.6) | acknowledged |

## Session Continuity

**Last session:** 2026-11-18T22:17:29.282Z
**Stopped at:** Phase 74 context gathered
**Resume file:** .planning/phases/74-service-worker-verification-milestone-acceptance/74-CONTEXT.md

**Last action:** Derived 3 phases from PWA-01..04, wrote ROADMAP.md + STATE.md + REQUIREMENTS.md traceability.
**Next step:** owner reviews/approves roadmap → `/gsd-plan-phase 72`

## Decisions

_(v2.6 decisions preserved in git history and milestone archive; v2.7 decisions accumulate above under Milestone Decisions.)_
- [Phase 73]: Converted actions/keyboard.js to a pre-warmed lazy chunk (Rule 3): the 500 kB entry gate had 5 bytes of headroom, not ~2 kB; banner block rides the freed bytes. — Entry budget remedy: banner listeners cost ~390 minified bytes; keyboard.js (self-contained, one keydown listener) moved to import().catch with pre-warm comment — entry 495,560 bytes.
- [Phase 73]: D-03 guard signals (api.enabled/S.ui.auth/pathname) read through a setGuardSource() live seam so node tests can pin them; api.enabled is getter-bound in the harness. — push.js setPushWorkspace precedent; production default unchanged.
- [Phase 73]: checkIos() boot-hydration race fixed frame-based: rAF retry only while api.init() is pending (enabled false, no auth screen); final once guard signals are live
- [Phase 73]: e2e stub markers __bipPrompted/__bipDispatched live only in e2e/install-banner.spec.mjs (T-73-02 verified clean in src/ and public/)
- [Phase 73]: onBip retry mirrors checkIos exactly (synchronous first attempt, 300-frame budget, final auth decline, decide-once) — one pre-existing unit pin ("nothing renders before the rAF recheck") updated to match the mandated shape
- [Phase 73]: e2e pre-hydration stub dispatches on the first rAF AFTER listener registration (addEventListener patch) — measured: a bare document-start rAF fires before the deferred module script evaluates, so the event would be lost; /api/config hydration held at route level because localhost resolves faster than a frame (RED/GREEN measured distinguishable)

## Operator Next Steps

- Approve the v2.7 roadmap, then `/gsd-plan-phase 72`
