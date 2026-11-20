# Phase 84: Backlog Polish & Ship - Context

**Gathered:** 2026-11-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Clear the deferred backlog to ship milestone v3.2: searchable member/team pickers (BP-01), fix the 56-02 e2e spec failures (BP-02), Phase 57 mobile layout follow-ups (BP-03), DEPLOY.md operator documentation, and the 3.2.0 version bump. No new capabilities — this phase polishes and ships what phases 80–83 built.

</domain>

<decisions>
## Implementation Decisions

### Picker pattern (BP-01)
- **D-01:** Pickers follow the assignee-picker modal pattern (55-04): searchable modal with multi-select list, applied on confirm — NOT the lightweight tz-combobox inline pattern (44-03). Consistent UX with the picker already shipped.
- **D-02:** Both selection surfaces become searchable pickers: the invite-form teams field (`S.ui.inviteTeams`, actions.js:2247/2394) and the member-edit teams picker (`mteamToggle`). No other surfaces.
- **D-03:** Chips stay multi-add: search + Enter selects and keeps the input open (chip accumulates), Backspace removes the last chip, same keyboard contract as the tz combobox (aria combobox/listbox roles carried over).

### e2e debt policy (BP-02)
- **D-04:** No waivers. Per ROADMAP success criterion 2: every spec fixed, full suite green with zero `test.skip`/`test.fixme` waivers. The one existing conditional skip (demo-locale.spec.mjs, environment-gated, not a debt waiver) stays.
- **D-05:** Repair in place. Keep every existing assertion unless it pins behavior that genuinely changed in v3.2; no wholesale rewrites.
- **D-06:** Flake policy: a flaky spec is not fixed until it passes 3 consecutive full-suite runs after hardening (waits, selectors). One green run is not evidence.

### Mobile follow-ups (BP-03)
- **D-07:** Scope = the documented 57-UAT deferred item (tasks-table columns button truncated on phone) PLUS a phone-viewport sweep of the main screens (dashboard, members, governance) fixing obvious overflow found.
- **D-08:** Regression assertions extend the existing specs (`e2e/mobile-tasks-table.spec.mjs`, `e2e/mobile-card-hidden.spec.mjs`) — no new spec files.

### Docs, version & strays
- **D-09:** DEPLOY.md gains an "Entra group mapping" section covering all four: ApplicationGroup claim prerequisites, overage fallback recipe pointer (STACK), dead-mapping runbook, old-slug 404 policy (D-82-5).
- **D-10:** Both Phase-83 advisory findings are fixed in this phase: IN-01 (workspace rename touches `updated_at`), IN-02 (unpin the hard-coded i18n catalogue size — derived check instead of `assert.equal(keys.length, 2030)`).
- **D-11:** Version bump is the phase's final task: package.json → 3.2.0 + CHANGELOG entry, as the ship gate inside GSD.

### the agent's Discretion
- Exact visual treatment of the picker modal (mirrors assignee picker chrome)
- How the viewport sweep findings are triaged (fix now vs note, per item)
- DEPLOY.md section ordering and cross-link placement

</decisions>

<specifics>
## Specific Ideas

- Picker should feel identical to the assignee picker (55-04) — same modal chrome, same draft-in-`S.ui` state pattern, own lazy chunk if size demands (66-03 chunk-gate precedent).
- The e2e suite closed v2.2 at 109/109; it is 155 tests / 26 specs today. The red set from the 56-02 drift must be established at planning time by running `npm run e2e` and triaged per D-05.
- Old-slug policy documentation must state: renamed slug 404s permanently, no redirect (D-82-5), and dead mappings surface in the governance card.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Picker precedent (BP-01)
- `src/actions/actions.js` §55-04 assignee picker (~lines 602–680) — open/toggle/apply trio, `S.ui.assigneePick` draft state
- `src/features/assignee-pick.js` — lazy chunk precedent (66-03 chunk gate)
- `src/pages/settings.js` §timezone combobox (~lines 220–245) — keyboard/aria contract to carry over

### e2e debt (BP-02)
- `.planning/ROADMAP.md` Phase 84 success criteria — criterion 2 is the no-waivers gate
- `.planning/milestones/v2.2-phases/56-delivery-infrastructure/56-VERIFICATION.md` — e2e infrastructure state at hand-off
- `e2e/playwright.config.mjs` — suite config (pinned en-US locale, workers, retries)

### Mobile (BP-03)
- `.planning/milestones/v2.2-phases/57-views-columns-general-access/57-UAT.md` — the deferred truncation note (lines 18, 36)
- `e2e/mobile-tasks-table.spec.mjs`, `e2e/mobile-card-hidden.spec.mjs` — specs to extend per D-08

### Docs & ship (BP-04)
- `docs/DEPLOY.md` §"Optional: single sign-on with Microsoft Entra" (~line 271) — the section to extend
- `.planning/REQUIREMENTS.md` D-82-1..6 — owner-ratified decisions binding the group-mapping docs (old-slug policy is D-82-5)
- `.planning/phases/83-governance-workspace-rename-slug-edit/83-CONTEXT.md` — rename/dead-mapping behavior to document
- `test/i18n-core-features.test.mjs` (catalogue-size assertion) and `server.js` rename route — IN-01/IN-02 fix sites

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Assignee picker modal (55-04): searchable multi-select with confirm — direct template for the member/team pickers.
- TZ combobox (44-03): the aria combobox/listbox + keyboard contract (Enter/Backspace/Escape) to reuse inside the picker.
- `S.ui.inviteTeams` / `mteamToggle` (actions.js:2247–2472): current chip-toggle state model the pickers replace.

### Established Patterns
- Lazy chunks per feature (features/*.js, 66-03 chunk-size gate ≤500 kB).
- i18n: every new string gets keys in all 5 locales; catalogue-size test must become derived (IN-02).
- Server refusals are keyed + localized (83 precedent) for any new picker error states.

### Integration Points
- Invite form POST body reads `[...new Set(S.ui.inviteTasks || [])]` shape (actions.js:2302/2426) — picker must keep the same stored state shape.
- Member-edit teams picker ties into the Access tab (drawer) — placement per 1787 comment (team chips live in Access, not General).
- Rename route `server.js` (~7153): IN-01 adds `updated_at` to the UPDATE statement.

</code_context>

<deferred>
## Deferred Ideas

- Graph overage fallback implementation (getMemberObjects via client-credentials) — documented recipe only, per REQUIREMENTS deferred list.
- Any new capabilities beyond the four backlog items — other phases/milestones.

</deferred>

---

*Phase: 84-backlog-polish-ship*
*Context gathered: 2026-11-20*
