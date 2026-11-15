# Phase 62: E2E Baseline Repair - Context

**Gathered:** 2026-11-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Repair-only phase: (1) make the e2e webServer readiness contract race-free — zero ECONNREFUSED 127.0.0.1:4317 from the shared readiness poll, fail-closed design preserved; (2) repair the 9 drifted specs (`french-overflow.spec.mjs` ×7 + `locale.spec.mjs:122`) against the post-Phase-56 lazy-chunk Settings contract with role-based queries and auto-retrying waits. No features, no app behavior changes unless triage proves a real app bug (then flagged, not masked).

</domain>

<decisions>
## Implementation Decisions

### Readiness fix placement (E2E-01)
- **D-01:** `webServer.url` (`/api/health` in `e2e/playwright.config.mjs`) becomes the single owner of readiness — the helper-level readiness poll in `e2e/helpers/setup.mjs` is removed as a *poll*, race gone by construction.
- **D-02:** Helpers that need the server up get an assert-once, fail-fast fetch with a clear "server not ready" error — no retries, no wait loop. Keeps the fail-closed spirit with zero race surface. `reuseExistingServer` defaults, global `retries`, and `gracefulShutdown` stay untouched (locked anti-features).

### openSettings() helper API shape (E2E-02)
- **D-03:** Two composable helpers in `e2e/helpers/setup.mjs`: `openSettings(page, { tab? })` (navigates, waits the lazy Settings chunk via role-based expect, optionally lands on a tab) and `selectLanguage(page, lang)` (native `<select>` driven by its real combobox role). Not one mega-helper, not a fixture object.
- **D-04:** Helpers own navigation and waits only — every assertion stays inline in each spec via role-based `expect()` calls, keeping the "assertions strengthened, never weakened" diff reviewable spec-side.
- **D-05:** The two waits live in the helpers: lazy-chunk wait inside `openSettings()`, `waitForResponse` on the locale PATCH inside `selectLanguage()`. Specs never hand-roll either wait.

### Drift sweep breadth
- **D-06:** Fix exactly the 9 failing specs — no sibling-spec migration onto the new helpers this phase. Other specs that duplicate settings-wait logic keep working; smallest diff, fastest to green baseline.
- **D-07:** If the rewrite reveals a real app bug behind a "drifted" assertion, flag it and stop — owner decides fix-now vs deferred. Never mask an app bug in the spec.

### Sleep replacement signal
- **D-08:** `waitForTimeout(300/500/1000)` sleeps are replaced by: `selectLanguage` awaiting the real network completion (`waitForResponse` on the locale PATCH `/api/auth/me`), then spec-side web-first `expect()` assertions on re-rendered French text. No sleeps, no `networkidle`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone & requirement context
- `.planning/ROADMAP.md` §Phase 62 — goal, success criteria, sequencing (readiness fix as its own small plan BEFORE the 9-spec rewrite)
- `.planning/REQUIREMENTS.md` §E2E Repair (CONS-01) — E2E-01, E2E-02 requirement text and constraints
- `.planning/STATE.md` §Milestone decisions — anti-feature list (no weakened assertions, no retries increase, no timeout inflation, no `reuseExistingServer` change, no chunk-gate edits)

### Prior milestone record (relevant history)
- `.planning/MILESTONES.md` and `.planning/v2.2-MILESTONE-AUDIT.md` — provenance of the 9 pre-existing spec failures acknowledged as deferred debt at v2.2 close

No external specs/ADRs — requirements fully captured in ROADMAP/REQUIREMENTS plus decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `e2e/helpers/setup.mjs` — existing shared helpers (account fixtures, fetch util); the new `openSettings()`/`selectLanguage()` land here
- `e2e/playwright.config.mjs` — `webServer.url: ${BASE_URL}/api/health` already polls readiness with backoff; it is the single readiness owner per D-01

### Established Patterns
- Role-based queries + web-first `expect()` already used in the newer parts of `french-overflow.spec.mjs` (e.g., `getByRole('tab', ...)`) — extend, don't invent
- Comment contract: config comments pin UAT/D-decision provenance — new helpers should carry the same style

### Integration Points
- `e2e/french-overflow.spec.mjs` lines ~170–181: the `waitForTimeout(300/500/1000)` cluster around the language switch is the exact drift D-08 replaces
- `locale.spec.mjs:122` — same lazy-chunk contract, repaired with the same helpers
- Port 4317 / `E2E_PORT` env: readiness ECONNREFUSED source is the helper poll fetching before the server binds

</code_context>

<specifics>
## Specific Ideas

- Exactly one place knows the lazy-chunk contract: `e2e/helpers/setup.mjs` (roadmap success criterion 3) — enforced via D-03/D-05.
- Sequencing locked: readiness fix lands as its own small plan before the 9-spec rewrite.

</specifics>

<deferred>
## Deferred Ideas

- Migrating sibling specs (`saved-views`, `project-settings`, `demo-locale`, …) onto `openSettings()`/`selectLanguage()` — candidate for a later hardening phase; not this phase (D-06).

</deferred>

---

*Phase: 62-E2E Baseline Repair*
*Context gathered: 2026-11-14*
