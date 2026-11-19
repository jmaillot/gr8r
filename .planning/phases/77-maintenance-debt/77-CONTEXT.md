# Phase 77: Maintenance Debt - Context

**Gathered:** 2026-11-19
**Status:** Ready for planning

<domain>
## Phase Boundary

The repo's standing gates are honestly clean: `npx eslint .` exits 0 with no
suppressions, switching the real app to nl/de/es renders real refusal paths
(including the Phase 75/76 DOM refusal keys) with placeholder parity, and every
carried review advisory from the 73/74 reviews (WR-01, WR-02, IN-01..05,
74-IN-01, 74-IN-02) carries a recorded disposition. Requirements MAINT-01,
MAINT-02, MAINT-03. New capabilities, refactorings beyond the pinned sites, and
new dependencies are out of scope.

</domain>

<decisions>
## Implementation Decisions

Scope was verified live on 2026-11-19: `npx eslint .` reports exactly 17 errors
(15 unused-var/useless-assignment sites + 2 no-undef files), matching the
ROADMAP scope. No re-enumeration needed at planning.

### Lint-fix strategy (MAINT-01)
- **D-77-1:** **File-grouped commits** — fix each site in code grouped by file,
  not one commit per site (the ROADMAP's per-site wording was chosen when the
  count was unknown; 15 sites across 10 files × 2-min suite runs is the cost
  being avoided). One commit per file (or tight file group) + full suite after
  each group. The `no-undef` pair (webhook-formats.js, webhook-ssrf.js) rides
  in its own commit via config.
- **D-77-2:** **Delete unused code outright** — no underscore-prefix. Executor
  reads each site's surroundings to confirm zero side effects before deleting
  (the typescript-eslint #3456 hazard: a "useless assignment" that is actually
  a side-effectful initializer must NOT be deleted — its suite run after each
  group is the safety net).
- **D-77-3:** webhook-formats.js and webhook-ssrf.js get the **eslint.config.js
  Node-globals block** addition only. No code changes, no module conversion —
  these standalone root-level scripts stay as-is beyond lint. Zero
  `eslint-disable` comments introduced (SC1).

### Locale spot-check depth (MAINT-02)
- **D-77-4:** **Refusal-path e2e ×3** — one Playwright spec; for each of
  nl/de/es: switch language (existing `selectLanguage` helper), trigger a real
  refusal, assert the localized toast. Covers the Phase 75/76 DOM refusal
  keys. Not navigation-label checks; catalogue key-completeness tests alone do
  not satisfy SC2.
- **D-77-5:** **Signup DP-1 refusal only** per locale — the canonical DOM
  refusal path with the new keys. One flow × 3 locales; no invite-create /
  invite-accept / SSO flows in this phase.
- **D-77-6:** **Placeholder parity = assert the substituted value** — the
  rendered text must contain the interpolated value (e.g. rejected domain /
  list name), not merely lack raw `{placeholder}` tokens.
- **D-77-7:** **Import the catalogues** — the e2e imports
  `src/locales/{nl,de,es}.json` and asserts rendered text == catalogue entry +
  placeholder. A true catalogue↔render cross-check; no duplicate string table
  in the spec.

### Review-advisory dispositions (MAINT-03)
All advisories are **FIX** this phase — none waived. Each fix carries a
regression pin (test asserting the fixed behavior) in the same commit; all
dispositions recorded in the phase's `77-REVIEW-DISPOSITION.md` carryover
ledger. SC3 wording "fixed (with regression pin) or explicitly waived with a
reason" — everything here is the fixed branch.

- **D-77-8 (WR-01):** duplicate CTA string — add dedicated `pwa.install.hint`
  key (EN+FR, same commit, D-08 discipline: refusal/UI copy lands with the
  code that emits it), render in the grow-span; keep the button. Regression
  pin: hint key rendered, not `t('pwa.install.cta')` duplicated.
- **D-77-9 (WR-02):** renderStrip/hide module-state races — track stripFlavour
  alongside stripEl, keep the reference until `el.remove()` fires inside the
  160 ms timeout, clear `deferred` in the give-up-retry path. ~30 lines in
  `src/features/install-banner.js` + regression pin per behavior.
- **D-77-10 (73-IN-01):** double `hide(el)` on the unexpected-outcome path —
  remove the duplicate call; pin.
- **D-77-11 (73-IN-02):** 160 ms exit constant duplicated CSS↔JS — single
  source of truth; pin.
- **D-77-12 (73-IN-03):** silent chunk-load failure — surface the failure
  instead of swallowing; pin. Note: deliberate exception to the house
  `.catch(() => {})` convention — recorded as such in the ledger.
- **D-77-13 (73-IN-04):** retry budget frame-count-based → wall-clock; pin.
- **D-77-14 (73-IN-05):** stale unit-test header comment (pre-73-03 shape) —
  update the comment; comment-only.
- **D-77-15 (74-IN-01):** gateIdx anchored to the exact quoted gate line
  already asserted verbatim at `test/sw-contract.test.mjs:142`, instead of
  first-substring `indexOf`; pin.
- **D-77-16 (74-IN-02):** defensive `import.meta.dirname` fallback
  (`path.dirname(fileURLToPath(import.meta.url))`) so older Node doesn't crash
  the suite before any assertion; pin = suite boots on the fallback path.

### Plan shape and test gates (MAINT-04 / SC4)
- **D-77-17:** **3 plans in sequence: lint → advisories → locale e2e.** Each
  independently verifiable; locale e2e last so its spec isn't churned by the
  banner fixes (WR-01/02 touch `install-banner.js` which the locale spec does
  not exercise — but ordering keeps review clean).
- **D-77-18:** **Full suite after each commit-group** (each file-group lint
  commit and each advisory-fix commit); locale e2e runs at the end of plan 3.
  Satisfies SC4's "full suite green after every lint-fix commit" without
  per-site runs.

### the agent's Discretion
- e2e locale spec file name and placement (follow existing `e2e/*.spec.mjs`
  conventions; helper reuse from `e2e/helpers/setup.mjs`)
- Exact regression-pin test placement per fix (nearest existing suite)
- IN-02's single-source-of-truth mechanism (JS-driven value vs shared token —
  whichever matches how the codebase handles CSS↔JS constants elsewhere)
- Ledger format for `77-REVIEW-DISPOSITION.md` (follow existing
  REVIEW-DISPOSITION.md shapes in the repo)
- Exact commit grouping within a file (multiple lint sites in one file may be
  one commit)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — MAINT-01/02/03 definitions (Phase 77 section)
- `.planning/ROADMAP.md` § Phase 77 — SC1..SC4, the authoritative success criteria

### Review advisories being dispositioned (the source findings)
- `.planning/milestones/v2.7-phases/73-install-hint-banner/73-REVIEW.md` — WR-01,
  WR-02, IN-01..05 full findings with file/line anchors
- `.planning/milestones/v2.7-phases/74-service-worker-verification-milestone-acceptance/74-REVIEW.md` —
  74-IN-01 (gateIdx anchor), 74-IN-02 (import.meta.dirname Node floor)
- `.planning/milestones/v2.7-phases/73-install-hint-banner/73-03-PLAN.md` — the
  original deferral record (why these were left open; context for the fixes)

### Phase 75/76 surface the locale e2e exercises
- `.planning/phases/75-domain-admission-core/75-CONTEXT.md` — D-01/D-02 tri-state
  env parse, DP-1 refusal shape (the signup refusal path the e2e drives)
- `.planning/phases/76-oidc-sso-doors-immunity-hardening/76-CONTEXT.md` — DOM
  refusal keys, D-09/D-10 semantics
- `.planning/research/ARCHITECTURE.md` — DP-1/DP-3 gate line anchors

### Lint
- `eslint.config.js` — existing Node-globals block to extend (webhook-formats.js,
  webhook-ssrf.js)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `e2e/helpers/setup.mjs` `selectLanguage(page, lang)` — existing language-switch
  helper for the locale e2e (selects option in `select[data-in="langSel"]`)
- `e2e/locale.spec.mjs`, `e2e/french-overflow.spec.mjs` — existing per-locale e2e
  patterns to follow for structure/assertions
- `src/locales/{en,fr,nl,de,es}.json` — catalogues; nl/de/es already carry the
  Phase 75 DOM refusal keys (committed with the first emitting gate)
- `test/sw-contract.test.mjs:142` — the verbatim gate-line assertion to anchor
  gateIdx to (74-IN-01 fix target)

### Established Patterns
- node:test integration suites booting real servers (`startServer({dataDir})`,
  reboot-same-DB idiom) — regression pins follow this
- File-grouped commit discipline from Phase 75/76 execution
- REVIEW-DISPOSITION.md per-phase ledgers (75, 76 exist) — MAINT-03 ledger joins
  the same convention
- D-08 discipline: locale copy lands in the same commit as the emitting code

### Integration Points
- `src/features/install-banner.js` — WR-01/WR-02/73-IN-01/02/03/04 fix target;
  `src/overlays/...` CSS 160 ms constant pairing (73-IN-02)
- `eslint.config.js` Node-globals block — the 2 no-undef files
- `server.js:2628`, `src/components/task-list.js`, `src/features/subtask-detail.js`,
  `src/overlays/drawer.js` — unused-code deletions in live source
- Signup DP-1 gate (`server.js` ~:6737) — the refusal the locale e2e triggers

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The one explicit user
framing: ROADMAP's "one commit per site" was a guess at cost, and with the real
count verified (15 sites / 10 files) the user chose file-grouped commits with a
full suite per group as the honest trade between bisectability and wall-clock.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 77-Maintenance Debt*
*Context gathered: 2026-11-19*
