# Phase 35: Honest Undo & Deploy Gap - Context

**Gathered:** 2026-11-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Two closing fixes, no new capability. (1) Undoing a team deletion becomes honest
(UNDO-01/02): the purged `team_members` authority rows are restored through the existing
membership PUT route, reconciled so newer independent changes to other teams survive.
(2) The Phase-30 compose gap closes (DEPLOY-01): `docker-compose.yml` forwards
`MASTER_KEY_PREVIOUS` in the optional `${VAR:-}` form and DEPLOY.md §14 notes compose
users need no extra rotation step. Undo tests are written after the Phase-32 VIS
semantics (final) and exercised as admin — workspace-wide, no VIS interference.
</domain>

<decisions>
## Implementation Decisions

### Undo promise & failure behavior (Test window)
- **D-01:** Undo is **toast-only** — the promise lives in the ephemeral toast (~5s),
  exactly like every other undo in the codebase (tasks, projects: same
  `action: t('toast.undo')` pattern). No persistent "Restore" button, no journal. The
  before-map of each affected member's team set is captured in the closure at deletion
  time (same pattern as the team-edit modal's `before.get(x.id)`, src/actions/teams.js:100)
  — no cold reads, no divergence possible within the window.
- **D-02:** On a mid-course PUT failure (network, expired session): **error toast, no
  compensating rollback**. The doc is already restored client-side (restore(snap) runs
  first), the admin sees honest rosters rendered from doc + the failing authority rows
  stay as-is; admin can re-invite/re-PUT manually. Same compromise as `delTeam` today
  (which returns early on PUT failure without restoring the doc). No compensation layer
  — it would double the failure surface (and what if the compensation also fails?).

### Reconciliation semantics (UNDO-02)
- **D-03:** **Additive union** — for each affected member, the undo PUT sends the union
  of (a) the member's CURRENT team set and (b) the deleted team's id if the member had it
  in the captured before-map. Whatever the member gained or changed between deletion and
  undo is kept by construction; the deleted team's rows are restored on top. One
  semantics, no clobber path exists.
- **D-04:** The stale-client corner (a member added to the deleted team between purge and
  undo via another admin client replaying a stale before-map) is **covered by the union
  semantics naturally** (kept line + restored line = union) and **pinned by the UNDO-02
  regression test** — no server-side guard. A server guard (rejecting PUTs for
  nonexistent teams) is over-engineering for a 5-second window and the team exists again
  post-undo anyway.

### Where the restore logic lives
- **D-05:** **Client-side, in the toast's onAction** — the closure captures the before-map
  before the purge, restores the doc via the existing `restore(snap)` (src/actions/actions.js:271),
  then replays `api.setMemberTeams(userId, unionSet)` per affected member — exactly the
  `delTeam` mechanism run in reverse. Zero new routes, zero new server surface, exactly
  what the roadmap states ("through the existing membership PUT route").
  — **Reversibility:** reversible — pure client orchestration around an existing route; no
  contract change.
- **D-06:** **Local mode = restore(snap) as-is** — with no API there are no authority rows;
  the doc JSON snapshot already contains every member's teams, so the existing undo is
  already honest locally. The `api.enabled` branch only ADDS the authority PUTs beside it.
  Test pin: local undo remains a plain restore(snap), unchanged.

### Compose forwarding (DEPLOY-01)
- **D-07:** `MASTER_KEY_PREVIOUS: ${MASTER_KEY_PREVIOUS:-}` goes on the line immediately
  after the `MASTER_KEY` line in the `environment:` block of `docker-compose.yml:39`,
  with a short comment pointing at DEPLOY.md §14. Optional `:-` form only — never `:?`
  (fresh installs must keep booting; already locked by the requirement wording).
- **D-08:** DEPLOY.md §14 gets a **compose rotation walkthrough** (not just a one-liner):
  a short `.env`-based procedure showing compose users the full
  add-old-key → reboot → verify stamped ids → remove-old-key cycle in their idiom, plus
  the note that no extra step beyond setting the env var is needed. §14 already targets
  `.env` injection; the walkthrough adapts it rather than duplicating it.
- **D-09:** The compose-config test does **parse + config, two cases**: (1) parse
  `docker-compose.yml` and assert the `MASTER_KEY_PREVIOUS` line uses the `:-` form;
  (2) run `docker compose config` passing BOTH with the variable set and unset (fresh
  install boots) — the roadmap Success Criterion 3 verbatim. Requires the docker binary
  in the test environment; if unavailable, the config invocation skips with an explicit
  skip reason (never silently passes).

### the agent's Discretion
- Exact toast copy / i18n keys for the undo action if new keys are needed (EN+FR per project rule).
- Test file placement (extend `test/membership.test.mjs` vs a focused new file) — planner's call.
- Whether the before-map capture should reuse the team-edit modal's Map helper or an inline Map — same shape either way.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — UNDO-01, UNDO-02, DEPLOY-01 definitions (§ UNDO, § DEPLOY)
- `.planning/ROADMAP.md` § Phase 35 — Success Criteria 1–3 (the compose-config test and the no-clobber regression are verbatim criteria)

### Prior-phase decisions that constrain this phase
- `.planning/phases/32-team-derived-project-visibility/32-CONTEXT.md` — team-derived visibility reads `team_members` rows live (its D-05): restored rows immediately restore visibility/mentions; undo tests are admin-exercised, workspace-wide
- `.planning/phases/34-per-user-settings-isolation-search-leak-closure/34-CONTEXT.md` — one-funnel invariants, migration recipe conventions

### Deployment docs
- `DEPLOY.md` §14 (Key custody & rotation, ~line 802) — the runbook the walkthrough extends; compose users note goes here
- `docker-compose.yml` (environment block, line 39 `MASTER_KEY`) — the insertion point

### Project invariants
- `AGENTS.md` (project root) — zero runtime dependencies, additive-only migrations, EN+FR i18n, full `npm test` green gate

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `restore(snap)` (src/actions/actions.js:271) — generic JSON round-trip undo, shared by ~10 call sites; the undo doc path, unchanged
- `api.setMemberTeams(userId, teams)` — the existing membership PUT route client-side wrapper; the ONLY authority-write path to use
- `snapshot()` (src/actions/actions.js:267) — captures `S.data` as JSON; already used by delTeam
- before-map pattern (src/actions/teams.js:100, `before.get(x.id)`) — the capture idiom to mirror in the delTeam closure
- Toast undo affordance (`action: t('toast.undo'), onAction: () => restore(snap)`) — the exact shape used across the app

### Established Patterns
- delTeam purge flow (src/actions/teams.js:119): capture affected members → `Promise.all(api.setMemberTeams(...))` → doc mutate → toast. The undo is this flow mirrored; PUT failure = early return + error toast (D-02)
- Compose env convention: every variable uses the `${VAR:-default}` optional form except MASTER_KEY's deliberate `:?` — the new line follows the majority form
- Admin-exercised tests: authority-row tests run as admin, workspace-wide (Phase-32 test conventions)

### Integration Points
- `team_members` authority rows: deleted transactionally by delTeam's PUTs; restored by the undo's PUTs; read live by visibility (Phase 32), mention autocomplete, rosters
- `docker-compose.yml` environment block → server process env; `MASTER_KEY_PREVIOUS` is already consumed by server.js boot keyring (Phase 30) — compose merely forwards it
- `test/membership.test.mjs` — existing authority-row test suite; natural home (or sibling) for the undo pins

</code_context>

<specifics>
## Specific Ideas

- The undo must feel like every other undo in the app: same toast, same window, zero new UI. The honesty fix is invisible to the user — deleted-team rosters simply come back when they tap undo.
- Union semantics phrasing from the user: "restores only the deleted team's rows without erasing newer changes to other teams" — additive, never subtractive.

</specifics>

<deferred>
## Deferred Ideas

- Persistent admin "restore deleted team" surface (beyond the toast window) — new capability, own phase if ever needed.
- Server-side dedicated restore-memberships route with transactional reconciliation — rejected for this phase (D-05); revisit only if client-side orchestration proves brittle in practice.

</deferred>

---

*Phase: 35-Honest Undo & Deploy Gap*
*Context gathered: 2026-11-03*
