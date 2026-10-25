# Phase 10: Browser coverage in both locales - Context

**Gathered:** 2026-10-24
**Status:** Ready for planning

<domain>
## Phase Boundary

The eight untested flows become Chromium tests — onboarding wizard, invite modal, `/join` page,
project share modal, member removal, workspace switcher, plan change, project creation. Each flow
asserts a visible label or toast, not only a click, and passes in both English and French. The
existing Chromium tests stay pinned to English (UAT-09), and the criterion-4 scenario — two
members of one workspace, one English one French, each seeing their own language across a reload,
a workspace switch and a second browser context — is completed in the phase-8 locale proof.
Deliverable: the eight unproven flows are proven by a real browser, in English and in French.

</domain>

<decisions>
## Implementation Decisions

### Test organization
- **D-01:** The eight flows live in one new spec file, `e2e/flows.spec.mjs`, grouped into
  `test.describe` blocks per flow — matching the suite's one-file-per-proof-family shape
  (`tenancy`, `locale`, `french-overflow`), with shared fixtures in `test.beforeAll`.

### Locale handling
- **D-02:** Language is an account property, switched through the UI on throwaway accounts
  (per-suite, `clientIp`-unique) — the phase-8 pattern. Playwright's browser-level
  `locale` config is NOT used to drive the app's localization logic.

### Assertion depth
- **D-03:** Each flow runs its full happy path and asserts at each step with the suite
  convention: role/label/text selectors for every visibility claim plus toasts for outcomes —
  the `aria-label` / `data-tip` / toast surfaces where leaks live (roadmap constraint).

### Criterion 4 completion
- **D-04:** The missing criterion-4 assertions (reload + workspace switch + second browser
  context, per-account language) extend `e2e/locale.spec.mjs`, which already owns the
  alice(fr)/bob(en) shared-workspace fixtures. The second workspace for the switch is created
  via the API in the fixture step — not through the UI, which is what the switcher test itself
  proves.

### UAT-09 English pin
- **D-05:** The pin becomes explicit: `use: { locale: 'en-US' }` in `e2e/playwright.config.mjs`
  with a comment naming UAT-09. The existing tenancy/flows specs then cannot silently drift
  into French via a config change.

### Fixture helpers
- **D-06:** `e2e/helpers/setup.mjs` grows a shared locale-aware account/workspace creation
  helper (the `createAccount` pattern from `locale.spec.mjs` promoted into the helper file).
  Tenancy's bare fixtures stay untouched; every fixture still goes through the real API with
  explicit status checks.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone contracts
- `.planning/ROADMAP.md` — section « Phase 10: Browser coverage in both locales » (goal,
  success criteria 1–4)
- `.planning/REQUIREMENTS.md` — UAT-01 … UAT-09 and the phase-10 coverage table
- `.planning/phases/08-per-user-locale-the-honest-selector/08-CONTEXT.md` — the per-user locale
  contract (users.locale, PATCH /api/auth/me, primeLocale vs setLocale) that D-02 and D-04 build on
- `.planning/phases/07-french-catalogue-french-typography/07-CONTEXT.md` — French catalogue and
  overflow-proof conventions the French variants of the eight flows follow

### Existing proof files (the patterns to follow)
- `e2e/playwright.config.mjs` — single chromium project, gracefulShutdown, trace-on-failure
- `e2e/helpers/setup.mjs` — `apiClient`, `clientIp(run, tag)`, `newRunId`, throttle notes
- `e2e/locale.spec.mjs` — two-account cross-language proof to extend for criterion 4
- `e2e/french-overflow.spec.mjs` — French UI proof; its comment says phase 10 widens coverage

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apiClient` / `clientIp` / `newRunId` (e2e/helpers/setup.mjs) — fixture plumbing for every
  new account and workspace
- The `LOGIN` selector dictionary pattern in `locale.spec.mjs` (en/fr label sets) — reusable
  for the eight flows' French assertions
- `httpError()`-driven toasts and `aria-label`/`data-tip` chrome — the assertion surfaces

### Established Patterns
- Fixtures only through the real API; visibility claims only in the browser (role/label/text)
- Run-unique `X-Forwarded-For` per fixture account so per-IP throttles never fail a second run
- One throwaway account/workspace per proof file; the French proof owns a dedicated workspace
  so the language switch never leaks into the English-pinned tenancy suite
- `test.beforeAll` fixtures, `fullyParallel: false`, per-test isolation by unique emails

### Integration Points
- The onboarding wizard, invite modal, `/join`, share modal, member removal, workspace
  switcher, plan change and project creation UI in `src/` — each needs its selectors inventoried
  during research
- `PATCH /api/auth/me` (phase 8) — how throwaway accounts get their locale before the browser opens
- `e2e/server.mjs` + `webServer` — unchanged; new specs ride the same boot path

</code_context>

<specifics>
## Specific Ideas

- The second workspace in the criterion-4 extension is a plain API fixture: the switcher test
  must prove the UI switch, not the creation.
- The `en-US` pin is a config-level decision with a comment referencing UAT-09 — visible to
  whoever edits the config later.
- French variants of the eight flows use the same spec structure as the English ones — same
  describe blocks, French selector dictionaries — so a flow that fails fails identically in
  both languages.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-browser-coverage-in-both-locales*
*Context gathered: 2026-10-24*
