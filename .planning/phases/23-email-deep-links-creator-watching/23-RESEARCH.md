# Phase 23: Email Deep Links & Creator Watching - Research

**Researched:** 2026-10-30
**Domain:** SPA deep-link routing (hand-rolled, zero-dependency), notification email URL building, watcher fan-out semantics
**Confidence:** HIGH (every claim below was verified by reading the source files this session — no external docs needed; this is a zero-dependency codebase and the phase touches only in-repo code)

## Project Constraints (from AGENTS.md)

No project-level `AGENTS.md` or `.opencode/AGENTS.md` exists at the repo root (verified this session). Governing constraints come from `.planning/REQUIREMENTS.md` and prior phase decisions:

- **Zero runtime dependencies** — no npm installs, no router library. Routing stays hand-rolled ES modules. Any package addition violates the project constraint.
- **node:test** suites (`npm test` → `node --test --test-concurrency=2 test/*.test.mjs`) plus Playwright e2e in `e2e/` (EN+FR). New UI strings must pass the i18n catalogue gates (`test/catalogue.test.mjs`, `test/i18n-*.test.mjs`).
- Established in-repo patterns take precedence: `securityHeaders()`, `fail()` JSON errors, no-oracle 404s, path-only `?next=` validation (see Security Domain).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (Implementation Decisions D-01…D-05, verbatim intent)

- **D-01: Boot then open task** — the SPA boots fully, resolves the task by key via the existing API, and opens it in the existing task view. One code path for deep links and internal clicks; no minimal-render side channel.
- **D-02: Unknown/deleted task** → land on the workspace view with a visible "task not found" notice/toast — the user can navigate on from there.
- **D-03: URL persistence** — after landing on a task, the URL keeps showing `/w/:slug/task/:key` (never rewrites back to the workspace URL), so refresh and sharing keep working.
- **D-04: Path carry via `?next=`** query param on the sign-in page; after successful sign-in the app redirects to that exact path (e.g. `/w/:slug/task/:key`).
- **D-05: Never self-notify** — no one (creator, assignee, commenter) receives a notification caused by their own action. Matches existing assignee/commenter behavior.

### the agent's Discretion (lean guidance recorded in CONTEXT.md)

- **Permission-hidden task handling** — lean: same "task not found" notice as D-02, no information leak that the task exists.
- **Open-redirect guard for `?next=`** — lean: local-path-only validation (path must start with a single `/`; reject scheme-relative `//`, absolute URLs, and `\`). Invalid → fall back to workspace root. **NOTE: this exact validator already exists twice in the codebase (see Architecture Patterns) — reuse it.**
- **Logged-out deep-link landing** — lean: follow the existing logged-out flow, carrying the path through.
- **Sign-up return rule** — lean: same `?next=` rule after sign-in; sign-up destination follows existing post-signup behavior.
- **Creator-watcher modeling** — lean: add the creator to the watcher set at creation (deduped with assignee), reusing the existing P4-d/e watcher model; a separate creator-field union only if storage makes it clearly cheaper.
- **Legacy tasks** — no backfill: only tasks created after this phase ships get creator-watching.
- **SPA routing architecture** — agent decides between a central route table vs a popstate handler over existing navigation, based on how tangled the ~12 `history.replaceState` call sites are (verified count this session: 12, see Runtime Inventory below).
- **View URL scope** — task detail is routable now; the routing mechanism should be extensible to other views.
- **History strategy** — agent decides pushState vs replaceState balance (LINK-04 requires back/forward to work across views).

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LINK-01 | Every notification email links to `/w/:slug/task/:key`, not app root; scheduler-built URLs use APP_URL with a boot-time guard matching the invite-email guard | `queueNotifEmails` currently builds `const url = `${base}/`` (server.js:712) — single line to change; APP_URL guard already exists at server.js:2995-3006 and already covers the SMTP-enabled case |
| LINK-02 | Logged-out click lands on sign-in and returns to the exact task after sign-in | `finishLogin` already implements the full `?next=` return flow (actions.js:2790-2803) including path-only validation — the gap is only that the logged-out boot branch (main.js:210-218) never writes `?next=` into the URL |
| LINK-03 | Task creator added to watcher set at creation (dedup with assignee), receives comment/update notifications like any watcher | `taskWatchers()` (actions.js:152-156) computes watchers on the fly as assignee + commenters; `createTask` (actions.js:61+) stores no creator field today — add one, extend the computed set |
| LINK-04 | Browser back/forward works across SPA views (popstate); deep-link and manual navigation consistent | `go()` (render.js:64-83) maintains its own in-memory `S.ui.history` stack but **never touches the URL**; all 12 `history.replaceState` sites are auth/workspace transitions, not view navigation — a popstate handler synced with `go()` is the natural seam |
</phase_requirements>

## Summary

This phase is almost entirely wiring existing mechanisms together. Three of the four requirements have their hardest part already shipped: the `?next=` sign-in return flow is fully implemented in `finishLogin` (including the exact path-only open-redirect validator D-04 needs), the APP_URL boot guard already fails the process at boot when SMTP is on and APP_URL is empty, and the SPA already parses `/w/:slug/task/:key` at boot via `applyDeepLink`. The remaining work is: (1) point the notification email URL at the task instead of `${base}/`, (2) carry the path into the login URL when a logged-out user hits a deep link, (3) store a creator on tasks and include it in the computed watcher set, and (4) add URL sync + popstate to the SPA's `go()` navigation.

**One critical verified finding the planner must design around:** the "existing task view" (D-01) is **a drawer overlay, not a route page**. Task detail opens via `A.openTask` which sets `S.ui.drawer = <taskId>` (actions.js:521-539) and renders from `src/overlays/drawer.js` (`if (u.drawer && task(u.drawer)) … drawerHtml(task(u.drawer))`, drawer.js:22-23). Meanwhile `applyDeepLink` calls `go('task', { id })` (main.js:136), but `renderPage()`'s page map (src/shell/layout.js:44-67) has **no `task` entry** — `go('task')` renders `page404` as the underlying page and never opens the drawer. Task deep links are currently broken end-to-end at the last hop; D-01's "open it in the existing task view" means: resolve the key, then drive the existing `S.ui.drawer` mechanism (the same path an internal click takes), over a sensible underlying page.

**Primary recommendation:** Route the deep link through the existing open path (resolve key → `A.openTask`-equivalent over the project board or home page), centralize URL↔view sync in/around `go()` (pushState on open, popstate re-applies from URL), reuse the existing path-only `?next=` validator verbatim, and change one line in `queueNotifEmails` to build `/w/:slug/task/:key` from APP_URL.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Notification email task URL (LINK-01) | API/Backend (server.js `queueNotifEmails`) | Boot guard (server.js main()) | URLs are built server-side where the doc diff and workspace row are in hand |
| Logged-out deep-link → sign-in carry (LINK-02) | Frontend SPA boot (src/main.js) | API/Backend (SPA fallback route, optional 302) | The SPA fallback serves index.html for unknown `/w/...` paths today; the client boot branch decides what a logged-out visitor sees |
| Sign-in return (LINK-02) | Frontend (`finishLogin`, already built) | — | `?next=` read, validate, `location.assign` all exist |
| Creator watcher (LINK-03) | Frontend data layer (`src/actions/actions.js`) | — (rides the existing PUT) | Notifications are client-computed rows synced via the workspace-doc PUT; no server change needed |
| URL persistence + popstate (LINK-04) | Frontend (`go()` in src/shell/render.js + a popstate handler) | — | All view state lives in `S.ui`; browser history must mirror it |

## Standard Stack

### Core

No new packages. **Zero runtime dependencies is a project constraint** — everything is hand-rolled ES modules + `node:test` + Playwright.

| Thing | Version | Purpose | Why |
|-------|---------|---------|-----|
| Native `history` API (pushState/replaceState/popstate) | browser built-in | LINK-04 | Already used at 12 call sites; no router library permitted |
| `URLSearchParams` | browser built-in | `?next=` carry | Already used in `finishLogin` |
| `MAILER.sendNotif` / `buildNotifMessage` | in-repo (mailer.js:393, 593) | Email URL injection | `msg.url` is already plumbed through text + HTML bodies verbatim |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Popstate handler over `go()` | Central route table rewrite | CONTEXT.md explicitly delegates: "based on how tangled the ~10 `history.replaceState` call sites are". Verified: the 12 sites are all **auth/workspace transitions** (login, signup, join, workspace switch) — none are view navigation. They can stay as-is. A popstate handler + URL sync inside `go()` is the low-tangle choice. |
| Server 302 for logged-out deep links (like the file route does) | Client-side `?next=` write at boot | The file route precedent (server.js:2901-2905) does the 302 server-side; but the SPA fallback route intentionally serves index.html for `/w/:slug/...`. Client-side carry at boot is smaller and keeps the SPA fallback untouched. Both are viable; client-side is recommended (server fallback stays byte-identical → route-ordering test unaffected). |

## Package Legitimacy Audit

**Not applicable** — this phase installs zero external packages (zero-runtime-dependency constraint). No npm registry lookups required.

## Architecture Patterns

### System Architecture Diagram

```
Email recipient clicks link
        │
        ▼
 GET /w/:slug/task/:key  (notification email: APP_URL + /w/:slug/task/:key)
        │
        ▼
Server router (server.js ~2860+)
        │  1. /w/:slug/file/:id byte route — MATCHED FIRST (must stay before SPA fallback)
        │  2. everything else under /w/: → SPA fallback → index.html
        ▼
SPA boot (src/main.js init())
        │
        ├─ logged out? ──► S.ui.auth='login' + write ?next=<pathname> into URL
        │                        │
        │                        ▼
        │                  user signs in → finishLogin()
        │                  reads ?next= → validates path-only → location.assign(next)
        │                        │  (full reload; boot re-runs, now authenticated)
        ▼                        ▼
applyDeepLink(rest) ── resolves key against hydrated doc
        │
        ├─ task found ──► open task drawer (existing A.openTask mechanism)
        │                  underlying page = project board / home
        │                  URL stays /w/:slug/task/:key  (D-03)
        ├─ task unknown/hidden ──► workspace view + "task not found" toast (D-02)
        ▼
go() pushes history entry (pushState) ──► browser back ◄── popstate handler
                                            re-applies view from URL (LINK-04)
```

### Recommended project structure (touch points only — no new files strictly required)

```
server.js                      # queueNotifEmails URL line; boot guard message widened
src/main.js                    # applyDeepLink → drawer open; logged-out ?next= carry
src/shell/render.js            # go(): URL sync (pushState) — single choke point
src/shell/layout.js (or main)  # popstate handler registering once at boot
src/actions/actions.js         # createTask: creator field; taskWatchers: include creator
mailer.js                      # no change needed (msg.url already templated)
test/…, e2e/…                  # new node:test + Playwright cases
```

### Pattern 1: The `?next=` path-only validator — REUSE, don't reinvent

**What:** Identical validation logic already exists twice. D-04's guard must be the third use of the same rule (consider extracting a tiny shared helper).

**Example (verbatim from src/actions/actions.js:2795-2803):**
```javascript
// Source: src/actions/actions.js finishLogin (verified this session)
const next = new URLSearchParams(location.search).get('next');
if (next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') && !next.includes('://')) {
  location.assign(next);
  return;
}
```
Server-side twin (server.js:2901-2905, file route): builds `next` only from `url.pathname`, then validates `startsWith('/') && !startsWith('//') && !includes('\\') && !includes('://')`.

### Pattern 2: Watcher computation (P4-d/e) — where LINK-03 lands

**Verbatim (src/actions/actions.js:152-156):**
```javascript
// Source: src/actions/actions.js (verified this session)
export function taskWatchers(t) {
  return [...new Set([t.assignee, ...commentsOf(t.id).map(c => c.by)].filter(Boolean).filter(x => x !== D().me))];
}
```
- Add the creator: `[...new Set([t.assignee, t.creator, ...commentsOf(t.id).map(c => c.by)]…)]` — the `Set` already dedups creator-with-assignee.
- The `x !== D().me` filter implements D-05 (never self-notify) at the source; `notifyMembers` also excludes `n.by === n.to` server-side (server.js:708).
- `createTask` (actions.js:61+) builds the task object from a defaults literal — add `creator: D().me` there (or set `tk.creator = …` after). **Verified:** no creator field exists today; legacy tasks have none → `filter(Boolean)` already guards undefined.
- Notification fan-out already calls `taskWatchers` for `update` (status change) and comment flows ride `notifyMembers` directly — no new call sites needed.

### Pattern 3: Task detail is a DRAWER, not a page (critical for D-01/D-03)

**Verified chain:**
- `A.openTask` (actions.js:521-539): sets `S.ui.drawer = id`, `drawerTab`, clears popovers, `render()`, focuses `.drawer`.
- Drawer render (src/overlays/drawer.js:22-23): `if (u.drawer && task(u.drawer)) h += … drawerHtml(task(u.drawer))`.
- `renderPage()` page map (src/shell/layout.js:44-67): has `home, inbox, mytasks, favorites, notifications, search, overview, projects, project, tasks, calendar, timeline, members, member, teams, team, activity, settings, system, states, archive` — **no `task` entry**. `go('task', {id})` from `applyDeepLink` therefore renders `page404` underneath and never opens the drawer.

**Implication for the plan:** the deep-link handler must (a) resolve key→task, (b) select an underlying page (the task's project board via `go('project', {id})`, or home), (c) open the drawer with the same state mutations `A.openTask` performs, and (d) leave the URL at `/w/:slug/task/:key`. Closing the drawer should then either restore the underlying URL or keep the task URL — decide against D-03 (URL keeps showing the task while the task is open; on close, push back to the underlying view's URL as a new history entry so back re-opens the task).

### Pattern 4: `go()` is the single navigation choke point for LINK-04

**Verbatim (src/shell/render.js:64-83):**
```javascript
// Source: src/shell/render.js (verified this session)
export function go(route, params = {}, opt = {}) {
  if (route === 'project' && !params.tab) params.tab = 'board';
  if (!opt.back) S.ui.history.push({ route: S.ui.route, params: S.ui.params });
  const same = S.ui.route === route && JSON.stringify(S.ui.params) === JSON.stringify(params);
  S.ui.route = route;
  S.ui.params = params;
  …
  render();
  …
}
```
- `go()` maintains its own `S.ui.history` stack and an `opt.back` flag — an internal back mechanism already exists; it just isn't connected to browser history.
- Recommended shape: inside `go()`, after state mutation, `history.pushState(null, '', urlForView(route, params, slug))`; register one `popstate` listener at boot that maps the URL back through `applyDeepLink`-style resolution (or a small `viewForUrl()`) and calls `go(target, {…}, { back: true })` so the internal stack stays coherent. `urlForView` starts with only the task case (D-03) and the existing workspace root; extensible per CONTEXT.md's "View URL scope" discretion.
- The 12 verified `history.replaceState` call sites (actions.js:2252, 2448, 2763, 2822, 2843, 2968, 3022, 3034, 3094; main.js:197, 230 — actions.js:2252/2968/3022 go to `/`, the rest to `/w/:slug`) are auth/workspace transitions that *should* reset history context; they can remain untouched unless the popstate handler encounters their URLs, where mapping them to the workspace home view is the correct behavior.

### Anti-Patterns to Avoid

- **Opening the task by inventing a second render path** (e.g., a minimal task-only page for deep links): D-01 explicitly forbids side channels; one code path = set `S.ui.drawer` the same way `A.openTask` does.
- **Building the email URL from the request Host header for scheduler-built emails:** the existing invite guard exists precisely because `appBase()` falls back to `publicBase(req)` (Host header) — a hostile Host would poison emailed links. Scheduler-built URLs (phase 27 consumer) must use `APP_URL`; the boot guard (server.js:2995-3006) already enforces APP_URL presence whenever `MAILER.enabled`.
- **Letting the SPA fallback route's ordering drift:** the `/w/:slug/file/:id` GET/HEAD interception must stay before the SPA fallback (server.js:2874-2908 comment block documents this at length). A new `/w/:slug/task/:key` branch must NOT be added server-side as a byte route — it needs no server route at all (SPA fallback already serves index.html for it). Success criterion 5 is a regression test, not new routing.
- **Discriminating "task exists but you lack permission" in the deep-link response:** lean decision says same "task not found" treatment — no oracle.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Open-redirect validation | A new validator with different rules | The exact path-only check from `finishLogin` (actions.js:2800) / file route (server.js:2903) — extract to a shared helper if a third copy appears | Twice-verified, review-hardened rule: single leading `/`, no `//`, no `\`, no `://` |
| Email HTML/text templating | New mail template | `buildNotifMessage` (mailer.js:393) already interpolates `msg.url` into both bodies | Already escaped (`escapeHtml(url)`), prefs-gated, fire-and-forget |
| Watcher dedup/self-exclusion | Custom fan-out filter | `taskWatchers` Set + `notifyMembers`' `n.by === n.to` skip | D-05 semantics already exist in both layers |
| Router library | Anything from npm | Native history API via `go()` | Zero-dependency constraint; `go()` is already the choke point |

**Key insight:** this phase is a wiring phase. Nearly every mechanism (deep-link parse, sign-in return, email URL slot, watcher model, APP_URL guard) exists and is tested; the risk is integration-order and the drawer-vs-page surprise, not novelty.

## Common Pitfalls

### Pitfall 1: `go('task')` renders page404 — the drawer is the task view
**What goes wrong:** Planning assumes a task route page exists because `'task'` is in `ROUTE_IDS` and `applyDeepLink` calls `go('task', {id})`.
**Why it happens:** `ROUTE_IDS` is used for nav highlighting and top-level boot (`main.js:249`), not for `renderPage()` dispatch; the drawer is overlay state.
**How to avoid:** The deep-link task branch must drive `S.ui.drawer` (via the `A.openTask` mutations) over an underlying page.
**Warning signs:** e2e deep-link test showing the 404 glyph under an absent drawer.

### Pitfall 2: Email URL built per-notification but task keys are project-relative and mutable
**What goes wrong:** A task's `key` changes when it moves projects (`applyPatch`, `k === 'project'` → `t.key = nextKey(p)`); an email built earlier is fine, but the URL must be built from the key **at email-build time** and `n.task` is a task **id**, not a key.
**Why it happens:** `queueNotifEmails` receives `nextDoc` and the workspace row — the id→key lookup must happen there (`nextDoc.data.tasks.find(x => x?.id === n.task)?.key`).
**How to avoid:** Build `${APP_URL}/w/${wsRow.slug}/task/${encodeURIComponent(key)}` in `queueNotifEmails`; fall back to `${APP_URL}/w/${wsRow.slug}/` when the task/key is gone (deleted between doc write and email build).
**Warning signs:** emails linking to `/task/undefined`.

### Pitfall 3: `?next=` written but lost on the sign-in render
**What goes wrong:** The logged-out boot branch (main.js:210-218) renders the login card without touching the URL; a later `history.replaceState` (e.g., wantedSlug flow at actions.js:2843) can clobber a query param if ordering is wrong.
**Why it happens:** `finishLogin` reads `location.search` at submit time — the param must still be in the address bar then.
**How to avoid:** Write `?next=` via `history.replaceState` once in the logged-out boot branch (only when the path is a deep link, i.e. `restFromPath` is non-empty), before any render. Note the existing server-side file-route 302 already produces `/login?next=…` — the client branch should mirror that shape so both paths converge in `finishLogin`.
**Warning signs:** after sign-in you land at `/w/:slug` root instead of the task.

### Pitfall 4: popstate handler fighting the internal back stack
**What goes wrong:** Double-back behavior, or `go()` pushing a history entry for its own popstate-driven navigation (infinite history growth).
**Why it happens:** `go()` already pushes to `S.ui.history` and accepts `opt.back`; a naive popstate→`go()` without `{back:true}` double-records.
**How to avoid:** popstate handler calls `go(route, params, { back: true })`; URL-writing in `go()` must be skipped (replaceState, not pushState) when `opt.back` is set.
**Warning signs:** one browser-back click clears two views; history length grows while pressing back.

### Pitfall 5: New i18n strings failing the catalogue gates
**What goes wrong:** "task not found" toast/notice strings missing from EN or FR catalogue → `test/catalogue.test.mjs` / `test/i18n-scan.test.mjs` fail.
**How to avoid:** Add every new string to both locale files in the same commit; run `npm test` locally before pushing.
**Warning signs:** CI catalogue failures on an otherwise-green suite.

### Pitfall 6: Creator watcher leaking into self-notification on the creator's own comment
**What goes wrong:** Creator comments on their own task → in-app row or email about their own action.
**Why it happens:** `taskWatchers` filters `x !== D().me` at computation, but comment notifications go through `notifyMembers` directly with commenter-built target lists; `notifyMembers` excludes `n.by === n.to` server-side.
**How to avoid:** Rely on the existing double exclusion (client `taskWatchers` filter + server `n.by === n.to` skip at server.js:708); add a node:test asserting creator-as-commenter generates zero self-rows.
**Warning signs:** inbox rows authored "by you" about your own comment.

## Runtime State Inventory

Not a rename/migration phase — but two data-shape facts matter:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Task docs gain a `creator` field on **new** tasks only; legacy tasks have none (no backfill per CONTEXT.md) | Code edit only — `taskWatchers` must tolerate `creator === undefined` (`filter(Boolean)` already does) |
| Live service config | `APP_URL` env var — already required at boot when `MAILER.enabled` | None new; widen the guard's error message to cover notification emails (LINK-01 wording) |
| OS-registered state | None — verified: no scheduler/process registrations exist yet (phase 27 introduces the scheduler) | None |
| Secrets/env vars | None affected | None |
| Build artifacts | None — plain ES modules, no build step for src | None |

## Code Examples

### Email URL change (LINK-01) — the exact site
```javascript
// Source: server.js:705-716 (verified this session) — current code:
function queueNotifEmails(wsRow, nextDoc, newNotifs, req) {
  const base = appBase(req);
  …
  for (const n of newNotifs) {
    if (n.by === n.to) continue; // never email the author about their own action
    …
    const url = `${base}/`;          // ← THE line LINK-01 changes
    MAILER.sendNotif({ to, workspace: wsName, by: …, task: taskTitle, snippet: …, kind: n.type, url, … });
```
Planned shape (per PIT-2): build per-notification from APP_URL + `wsRow.slug` + task key resolved from `nextDoc.data.tasks`; scheduler-built emails (phase 27) reuse the same pure helper with no `req`.

### Boot-time APP_URL guard (existing — LINK-01 extends its *message*, not its condition)
```javascript
// Source: server.js:2995-3006 (verified this session)
if (MAILER.enabled && !APP_URL) {
  console.error('invite email: refusing to start — SMTP_HOST is set but APP_URL is empty.');
  console.error(
    "Invitation links are built from APP_URL; without it a request host header could point invite emails at an attacker's domain. Set APP_URL (e.g. https://projects.example.com) or unset SMTP_HOST to disable email invitations.",
  );
  process.exit(1);
}
```
This condition already covers notification emails (same `MAILER.enabled` gate). The phase work: update the message to say notification links too, and make `queueNotifEmails` actually source absolute URLs from APP_URL (not `appBase(req)`) so the guarantee is real.

### Deep-link entry (existing — the boot seam)
```javascript
// Source: src/main.js:183-185, 210-218, 246-248 (verified this session)
const slugFromPath = (location.pathname.match(/^\/w\/([a-z0-9-]{2,40})(?:\/|$)/) || [])[1];
const restFromPath = (location.pathname.match(/^\/w\/[a-z0-9-]{2,40}\/(.+?)\/?$/) || [])[1] || '';
…
if (!user) {
  S.ui.wantedSlug = slugFromPath || null;
  S.ui.auth = authRoutes.includes(h) ? h : 'login';
  render();                                  // ← LINK-02: write ?next=<pathname> before this
  return;
}
…
if (deepLink) applyDeepLink(deepLink);
```

### Task resolution by key (existing, reused for D-01/D-02)
```javascript
// Source: src/main.js:135-140 (verified this session)
if (seg === 'task') {
  const t = find(data.tasks || [], 'key');
  if (t) return go('task', { id: t.id });   // ← replace with drawer-open path (Pitfall 1)
}
```
Note the case-insensitive key match (`find` lowercases both sides) and that unknown tasks currently fall through silently — D-02 adds the explicit notice.

## State of the Art

Not applicable in the library sense (zero-dependency, no framework churn). The relevant "old vs current" is internal:

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| In-app task detail = drawer only, no URL | Task drawer becomes URL-addressable (`/w/:slug/task/:key`) | This phase | Refresh/share/back-forward now include task detail |
| Watchers = assignee + commenters | + creator, recorded at creation | This phase | Legacy tasks: creator unknown → not watched (accepted, no backfill) |
| Emails link to app root | Emails link to the task | This phase | Phase 27's reminder emails inherit the helper for free |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The notification email fan-out is the ONLY email surface needing task links this phase (invite emails already have their own URL path; reminder emails arrive in phase 27) | Summary / LINK-01 | Low — if another surface exists it inherits the same helper |
| A2 | Underlying page for a drawer deep link = the task's project board (or home if project hidden) is an acceptable product choice under D-01/D-02 discretion | Pattern 3 | Low — cosmetic; user can navigate on |
| A3 | Server-side SPA fallback needs NO new route for `/w/:slug/task/:key` (index.html already served) | Architecture | Low — verified fallback serves unknown `/w/` paths; e2e will prove it |
| A4 | Closing the task drawer after a deep link should push a new history entry back to the underlying view (so back re-opens the task) | Pattern 3 / Pitfall 4 | Low — UX detail within D-03/discretion |

## Open Questions (RESOLVED)

1. **Should `queueNotifEmails` switch entirely to APP_URL (dropping `appBase(req)`) or keep request-based base for in-request emails?** — **(RESOLVED)** Use APP_URL unconditionally for notification emails (drop `appBase(req)` for this surface); the boot guard (server.js:2995-3006) guarantees APP_URL presence whenever SMTP is on. Encoded in plan 23-01.
2. **Does closing the drawer rewrite or push the URL?** — **(RESOLVED)** Closing the task drawer **pushes** a new history entry back to the underlying view's URL (never rewrites while the task is open, per D-03), so the browser Back button re-opens the task. Consistent with research recommendation (A4) and D-03. Encoded in plan 23-04 (Task 1 action + Task 2 e2e assertion).

## Environment Availability

Step 2.6 audit — phase needs no external tools beyond what the project already uses:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | server + node:test | ✓ | (project-standard) | — |
| Playwright + Chromium | e2e deep-link/back-forward tests | ✓ (e2e/ configured, 62 passing per STATE.md) | repo-pinned | — |
| SMTP server | Live email delivery test | ✗ locally expected | — | node:test can unit-test URL building + `buildNotifMessage` output without SMTP (message builder is pure); full delivery is not required to prove LINK-01 |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in) + Playwright e2e |
| Config file | `package.json` `test` script; `e2e/playwright.config.mjs` |
| Quick run command | `node --test test/<file>.test.mjs` |
| Full suite command | `npm test` (566 tests) then `npx playwright test --config e2e/playwright.config.mjs` (62 tests) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| LINK-01 | `buildNotifMessage` embeds `/w/:slug/task/:key`; URL builder falls back to workspace root when task gone | unit | `node --test test/notif-email-link.test.mjs` | ❌ Wave 0 |
| LINK-01 | Boot fails with widened message when SMTP on + APP_URL empty | unit | `node --test test/notif-email-link.test.mjs` (boot-guard assertion = Test 4 in this file) | ❌ Wave 0 |
| LINK-02 | Logged-out deep link → login carries `?next=`; `finishLogin` returns to task path | unit + e2e | `node --test test/next-carry.test.mjs`; Playwright flow | ❌ Wave 0 |
| LINK-03 | Creator in watcher set; dedup with assignee; no self-notify on own comment/update | unit | `node --test test/creator-watcher.test.mjs` | ❌ Wave 0 |
| LINK-04 | pushState on `go()`; popstate restores view; back/forward across views | e2e | Playwright spec (back/forward) | ❌ Wave 0 |
| SC-5 | `/w/:slug/file/:id` still serves bytes; route ordering intact (incl. logged-out 302 → `/login?next=`) | unit + e2e | extend existing file-route tests + Playwright | ❌ Wave 0 (existing file tests to extend) |
| D-02 | Unknown/hidden task deep link → workspace view + notice, no existence oracle | unit + e2e | new | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** relevant `node --test` file(s)
- **Per wave merge:** `npm test`
- **Phase gate:** full `npm test` + Playwright e2e green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/notif-email-link.test.mjs` — LINK-01 URL builder + message embedding
- [ ] `test/creator-watcher.test.mjs` — LINK-03 semantics incl. self-notify exclusion
- [ ] `test/next-carry.test.mjs` — LINK-02 validator + carry (reuse rules from `finishLogin`)
- [ ] e2e deep-link + back-forward Playwright spec (EN+FR per project convention)
- [ ] Route-ordering regression test for the file byte route (extends existing coverage)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | Drawer open path must respect `canSee(proj(task.project))` exactly as `A.openTask` does (actions.js:523-527) — same "task not found" for hidden tasks (no oracle) |
| V5 Input Validation | yes | `?next=` path-only validator (single `/`, no `//`, `\`, `://`); key matching stays case-insensitive-but-strict against doc data |
| V7 Error Handling | yes | No existence oracle: unknown vs permission-hidden task → identical notice (D-02 + discretion) |
| V9 Communications | yes | Email URLs from APP_URL only (Host-header poisoning defense, existing boot guard) |
| V3 Session Management | no change | Sign-in flow untouched; `finishLogin` reuse only |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Open redirect via `?next=` | Tampering/Spoofing | Path-only validation (existing rule, reuse verbatim); server never echoes client-supplied next (file route builds it from `url.pathname` only) |
| Host-header poisoning of emailed links | Spoofing | APP_URL boot guard (server.js:2995-3006); scheduler URLs use APP_URL, never request Host |
| Task-existence oracle via deep link | Information Disclosure | Identical "not found" handling for unknown and permission-hidden (discretion lean) |
| Self-notification spoofing | Spoofing | Existing double exclusion: client `taskWatchers` `x !== D().me` + server `n.by === n.to` skip |

## Sources

### Primary (HIGH confidence — all read this session)
- `server.js:2995-3006` — APP_URL boot guard (verbatim quote in Code Examples)
- `server.js:705-716` — `queueNotifEmails`, current `url = `${base}/``
- `server.js:2860-2908` — router ordering, file byte route, logged-out 302 with `?next`
- `server.js:1370-1372` — `appBase()` = APP_URL || request-host fallback
- `src/actions/actions.js:152-156` — `taskWatchers` (verbatim quote)
- `src/actions/actions.js:61+` — `createTask` (no creator field)
- `src/actions/actions.js:521-539` — `A.openTask` drawer mechanics
- `src/actions/actions.js:2784-2803` — `finishLogin` `?next=` flow (verbatim quote)
- `src/main.js:123-157, 183-248` — `applyDeepLink`, boot, logged-out branch
- `src/shell/render.js:20-40, 64-83` — `ROUTE_IDS`, `go()`
- `src/shell/layout.js:42-67` — `renderPage()` page map (no `task` entry)
- `src/overlays/drawer.js:22-23` — drawer render condition
- `mailer.js:393-445, 593-599` — `buildNotifMessage` (`msg.url` templating), `sendNotif`
- `package.json:18-19` — test scripts

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — test counts (566 node:test, 62 e2e) taken from project records

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack / no-new-packages: HIGH — zero-dependency constraint, no registry lookups needed
- Architecture (drawer-vs-page, go() seam, watcher model, email URL site): HIGH — every claim read from source this session with line cites
- Pitfalls: HIGH — each traced to a specific verified code location
- Product micro-decisions (underlying page, drawer-close URL behavior): MEDIUM — flagged as A2/A4 for planner

**Research date:** 2026-10-30
**Valid until:** 2026-11-29 (stable; in-repo only)
