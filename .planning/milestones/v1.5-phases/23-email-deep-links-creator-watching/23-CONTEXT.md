# Phase 23: Email Deep Links & Creator Watching - Context

**Gathered:** 2026-10-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Notification emails become a door to the task, not the app root: every notification
email links to `/w/:slug/task/:key`; the SPA can land directly on that task (logged-in
or after sign-in); the task creator joins the watcher set at creation; and browser
back/forward works across SPA views. Includes the APP_URL boot-time guard for URLs
built outside a request (scheduler ticks), matching the existing invite-email guard.
Delivers LINK-01…LINK-04.

</domain>

<decisions>
## Implementation Decisions

### Deep-link landing behavior
- **D-01:** Boot then open task — the SPA boots fully, resolves the task by key via the
  existing API, and opens it in the existing task view. One code path for deep links and
  internal clicks; no minimal-render side channel.
- **D-02:** Unknown/deleted task → land on the workspace view with a visible
  "task not found" notice/toast — the user can navigate on from there.
- **D-03:** URL persistence — after landing on a task, the URL keeps showing
  `/w/:slug/task/:key` (never rewrites back to the workspace URL), so refresh and
  sharing keep working.

### Sign-in return flow
- **D-04:** Path carry via `?next=` query param on the sign-in page; after successful
  sign-in the app redirects to that exact path (e.g. `/w/:slug/task/:key`).

### Creator watcher semantics
- **D-05:** Never self-notify — no one (creator, assignee, commenter) receives a
  notification caused by their own action. Matches existing assignee/commenter behavior.

### Reversibility notes
- D-01/D-03: reversible (SPA-side behavior; local to routing/boot code).
- D-04: reversible (adds a param read; guard is small and local).
- D-05: reversible (notification fan-out filter).

### the agent's Discretion
The user delegated these to the researcher/planner (lean guidance recorded):
- **Permission-hidden task handling** — lean: same "task not found" notice as D-02, no
  information leak that the task exists.
- **Open-redirect guard for `?next=`** — lean: local-path-only validation (path must
  start with a single `/`; reject scheme-relative `//`, absolute URLs, and `\`). Invalid
  → fall back to workspace root.
- **Logged-out deep-link landing** — lean: follow the existing logged-out flow, carrying
  the path through; direct-to-signin with `?next=` if the existing flow permits it.
- **Sign-up return rule** — lean: same `?next=` rule after sign-in; sign-up destination
  follows existing post-signup behavior.
- **Creator-watcher modeling** — lean: add the creator to the watcher set at creation
  (deduped with assignee), reusing the existing P4-d/e watcher model; a separate
  creator-field union only if storage makes it clearly cheaper.
- **Legacy tasks** — no backfill: only tasks created after this phase ships get
  creator-watching.
- **SPA routing architecture** — agent decides between a central route table vs a
  popstate handler over existing navigation, based on how tangled the ~10
  `history.replaceState` call sites are.
- **View URL scope** — task detail is routable now; the routing mechanism should be
  extensible to other views as they're touched.
- **History strategy** — agent decides pushState vs replaceState balance (LINK-04
  requires back/forward to work across views).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §Email Deep Links & Creator Watching (LINK-01…LINK-04) — full requirement wording, including the APP_URL boot-guard clause
- `.planning/ROADMAP.md` §Phase 23 — goal and success criteria (5 criteria, including the `/w/:slug/file/:id` route-ordering test)
- `.planning/PROJECT.md` §Milestone v1.5 — milestone context; notification system P4-a…f shipped in the v1.4 window

### Code (established contracts to build on)
- `server.js:2999` — invite-email APP_URL boot-time guard (the pattern LINK-01 extends to scheduler-built URLs)
- `server.js:2747` + `server.js:2874` — `/w/:slug/file/:id` byte route and its SPA-fallback ordering constraint (must not regress; proven by test)
- `src/actions/actions.js:153` — P4-d/e watcher model (assignee + prior commenters) and notification fan-out

No external specs/ADRs — requirements fully captured in REQUIREMENTS.md and decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Existing task view/open mechanism in `src/actions/actions.js` — D-01 reuses it as the single open path
- Notification email builder (P4-f, `server.js` ~line 689 and ~2184) — links are added to its per-type templates
- Invite-email APP_URL guard (`server.js:2999`) — template for the scheduler-tick guard

### Established Patterns
- Watcher model P4-d/e (`src/actions/actions.js:153`) — watchers = assignee + prior commenters; D-05 extends the exclusion rule
- Zero runtime dependencies — routing stays hand-rolled ES modules; no router library
- node:test suites, Chromium e2e EN+FR, i18n catalogue gates — tests and any new UI strings follow these

### Integration Points
- SPA boot in `src/main.js` — where URL parsing on load hooks in
- `history.replaceState` call sites (~10 in `src/actions/actions.js`) — migration surface for popstate consistency (LINK-04)
- Server SPA fallback route ordering vs `/w/:slug/file/:id` (`server.js:2874`) — new `/w/:slug/task/:key` handling must not disturb it

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 23-Email Deep Links & Creator Watching*
*Context gathered: 2026-10-30*
