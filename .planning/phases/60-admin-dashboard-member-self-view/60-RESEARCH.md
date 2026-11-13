# Phase 60: Admin Dashboard & Member Self-View - Research

**Researched:** 2026-11-13
**Domain:** Read-only aggregate endpoints (admin dashboard) + self-scoped access view, on the existing `memberCanReadProject`/`projectAccessReason` funnel, doc `data.activity` rows, and `assignees[]` task model
**Confidence:** HIGH (all claims verified by reading repo source this session unless tagged otherwise)

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Dashboard is a **dedicated admin-only page at its own route** (e.g. `/w/:slug/dashboard` or equivalent SPA route), separate sidebar nav entry visible to admins only. Client nav gating is UX only; the server gate is the control (D-52-4 convention).
- **D-02:** Layout = **four panels on a single screen, no tabs**: Overdue per project, Load per member, Upcoming (7 days), Recent activity.
- **D-03:** Loading = **skeleton panels then fill** as the aggregate payload arrives — no full-page blank spinner, no stale-while-revalidate machinery.
- **D-04:** **One admin-gated aggregate endpoint** (e.g. `GET /api/workspaces/:slug/dashboard` shape or equivalent) returns overdue + load + upcoming + activity in a single payload, computed **server-side over full private-project data** (the redacted client doc cannot see private projects; the 403 gate lives in one place). Reversible — new read-only route, no data model change.
- **D-05:** Freshness = **fetch on load + interval poll while the tab is open**, aligned with the existing 30 s notification poll rhythm.
- **D-06:** Windows: Overdue fixed by definition (dueDate < today and not done); Upcoming fixed at today..+7 days; Activity panel has an adjustable preset window — **24 h / 7 d / 30 d, default 7 d** (preset selector sent to the server endpoint on refetch).
- **D-07:** **Load = open (incomplete) tasks only**, each member counted once per task they appear in `assignees[]` (shared task = +1 per member). Done tasks never inflate load.
- **D-08:** **Overdue panel shows clickable task rows grouped by project; Load panel stays pure numbers** (small overdue badge per member permitted if cheap). No expandable member rows.
- **D-09:** **Deep-link everything**: overdue/upcoming task rows use the existing `/w/:slug/task/:key` drawer path; project group headers link to the project; activity entries link to their task/project.
- **D-10:** Sorting = most-urgent first: overdue groups by oldest dueDate (tasks within by dueDate); load by count descending; upcoming by dueDate ascending.
- **D-11:** Self-view lives as a **section in Settings** (e.g. Settings › My access) — reachable by any member including admins; no separate member route or nav entry.
- **D-12:** Reason codes **reuse the Phase 52 vocabulary verbatim** ('everyone' | 'lead' | 'member' | 'team') with existing i18n labels.
- **D-13:** A per-person grant from another member shows the grant type without the granter's name. Team links show the team name. Byte-level shape tests assert no other member's identity appears.
- **D-14:** Presentation = flat list of reachable projects, each row project name/icon + one reason label — same visual language as Phase 52 admin transparency output.

### the agent's Discretion
- Exact route paths and payload shapes (dashboard and self-view endpoints), within the dedicated-admin-route / Phase 52 route style
- Where the self-view endpoint lives (new `/api/me/...` vs workspace-scoped self variant) — constraint: same funnel (`memberCanReadProject` + `projectAccessReason`), admin 403 on dashboard route, self-view allowed for any workspace member
- Skeleton/panel markup and CSS (reuse existing panel/empty-state patterns)
- Poll mechanics (timer lifecycle, cleanup on route exit) within D-05
- i18n keys for new UI strings (en + fr catalogues; gate stays green)
- How activity entries render verbs/dates (reuse Phase 9 activity rendering rules)
- Whether the load panel's overdue badge is worth the payload

### Deferred Ideas (OUT OF SCOPE)
- None — TRN-03 (named cross-member grant explanations for owners) stays a future requirement; NOTIF-TRIM is Phase 61.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-01 | Admin sees overdue tasks grouped per project | Server aggregate over full doc: filter `due && status !== 'done' && diffD(parse(due), TODAY) < 0`, group by `t.project`, sort oldest-first; template mirrors `pageOverview` stat panels + `task-list` mini rows |
| DASH-02 | Workload per member honoring `assignees[]` | Server-side count over open tasks × `assignees[]` (shared task +1 per member); members resolved from doc `data.members`/profiles |
| DASH-03 | Due within 7 days + recent activity | Upcoming window `today..+7d` (server date math — not client-local); activity from doc `data.activity` rows with `verb` machine codes, window preset param (24h/7d/30d, default 7d) |
| DASH-04 | Admin/owner-only server-side (403 for members), full private-project content | `requireWorkspace(req, res, slug, 'admin')` — ROLE_RANK gate; compute over `JSON.parse(ctx.ws.doc)` (raw stored doc), NOT `docForClient`; Phase 52 route is the exact gate template |
| TRN-01 | Member self-view: reachable projects + why | New endpoint calling `memberCanReadProject` + `projectAccessReason` for the **calling** member (`ctx.membership.member_id`), 'member' fallback; Phase 52 route is the computation template |
| TRN-02 | Never exposes other members' access rows; byte-level shape tests | Response carries only `{id, name, reason[, teamName]}` per project — the Phase 52 entry shape already passes exactly this shape assertion; byte-level tests modeled on `test/transparency.test.mjs` + `test/privacy.test.mjs` |
</phase_requirements>

## Summary

This phase is almost entirely **re-composition of proven in-repo primitives**, not new technology. The dashboard endpoint is a Phase 52-style admin-gated REST route that parses the **raw stored doc** (`ctx.ws.doc` — deliberately NOT `docForClient`, since DASH-04's power-admin ruling makes full private-project visibility the point), runs four pure reductions over it (overdue, load, upcoming, activity), and returns one JSON payload. The self-view endpoint is the Phase 52 transparency route with `targetMemberId` replaced by `ctx.membership.member_id` — same funnel, same reason codes, same entry shape, minus the target-member parameter and any identity exposure.

On the client, the dashboard page is a new lazy route (DELIV-02 chunk discipline: `lazy(() => import(...), 'pageX')` in `src/shell/layout.js`, exactly the members/settings pattern), a sidebar entry gated by `isMemberAdmin()` (UX only), skeleton-then-fill via the existing `skeleton()`/`fillPage()` async contract, and a 30 s interval poll mirroring the notification poll. The self-view is a new section in `src/pages/settings.js` reusing the `members.js` transparency expander row markup. Zero new runtime dependencies; no migrations; no new tables.

The controlling risk is **shape leakage**, not computation: the dashboard payload must contain exactly what the panels render (no private-project metadata beyond what aggregates display, since every consumer is an admin — but the endpoint must still fail closed for non-admins via the 403, and the self-view must never carry another member's id/name/email). Both are proven by byte-level shape tests against the existing `test/helpers/visibility-fixture.mjs` matrix, the established anti-tautology pattern.

**Primary recommendation:** Add two read-only routes in `server.js` beside the Phase 52 transparency route (`/api/workspaces/:slug/dashboard` gated 'admin', and a self-scoped visibility variant gated 'member' — recommend `/api/workspaces/:slug/me/visibility` for funnel symmetry), plus one lazy `dashboard.js` page and one Settings section. Everything computes through `memberCanReadProject`/`projectAccessReason` or, for the admin aggregate, directly over the raw doc per DASH-04.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dashboard aggregate computation (overdue/load/upcoming/activity) | API/Backend (`server.js`) | — | D-04 locks server-side computation over the raw doc; the redacted client doc cannot see private projects |
| Dashboard 403 gate | API/Backend (`requireWorkspace 'admin'`) | Frontend (nav hiding, UX only) | D-52-4: server gate is the control |
| Dashboard rendering, skeletons, polling | Frontend (lazy page module) | — | D-01/D-03/D-05; DELIV-02 lazy route |
| Activity window preset (24h/7d/30d) | API/Backend (param) | Frontend (selector) | D-06: selector sends param, server filters |
| Self-view access computation | API/Backend (`memberCanReadProject` + `projectAccessReason`) | — | One funnel rule; caller-scoped |
| Self-view redaction (no other-member identity) | API/Backend (payload shape) | Tests (byte-level shape assertions) | TRN-02 |
| Reason-code i18n labels | Frontend (`t()` over catalogue) | Server (machine codes only) | Phase 52 pattern: coarse codes on the wire, labels at render |
| Deep links (task drawer, project, activity) | Frontend (`go()` / `urlForView`) | — | Existing `/w/:slug/task/:key` drawer path |

## Standard Stack

### Core (all in-repo — no new packages)
| Library/Module | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:test` + `node:assert/strict` | Node ≥24 engines | Route/shape/unit tests | Entire 120-file test suite; harness `test/helpers/server.mjs` spawns real server.js |
| `test/helpers/server.mjs` | in-repo | Isolated spawned-server harness (ephemeral port, temp DATA_DIR) | Every server-route suite uses it |
| `test/helpers/visibility-fixture.mjs` | in-repo | Actor × project visibility matrix + hand-derived `VISIBILITY_MODEL` oracle (anti-tautology) | TRN tests must reuse this — never derive expectations from `memberCanReadProject` |
| `@playwright/test` | ^1.64.1 (devDep) | e2e dashboard route specs | `e2e/playwright.config.mjs`, port 4317 |
| lucide icons (via `src/core/icons.js`) | in-repo wrapper | Panel/nav icons (`layout-dashboard` already mapped for 'overview') | Existing icon system |
| `src/locales/en.json` / `fr.json` + `scripts/i18n-scan.mjs` | in-repo | EN+FR catalogues; dead/stale gate | i18n gate must stay 0 dead / 0 stale |

### Supporting
| Module | Purpose | When to Use |
|---------|---------|-------------|
| `server.js` `requireWorkspace(req, res, slug, minRole)` (~line 4010) | Role gate; `ROLE_RANK = { viewer: 1, member: 2, admin: 3, owner: 4 }` (~line 219) | Dashboard route: `'admin'`; self-view route: `'member'` |
| `server.js` `sameOrigin(req)` check | Cross-origin rejection | Copy the Phase 52 route order: requireWorkspace → if(!ctx) return → sameOrigin → … |
| `server.js` `memberCanReadProject(p, wsId, memberId)` (lines 949-954) | The ONE readable predicate | Self-view per-project filter |
| `server.js` `projectAccessReason(p, memberId, memberTeams)` (lines 984-991) | Reason codes `'everyone' \| 'lead' \| 'member' \| 'team'`, `null` when unreachable | Self-view labels; `?? 'member'` fallback exactly as Phase 52 does |
| `server.js` `teamsOfMember(wsId, memberId, row)` | Live team ids (resolve ONCE per request, never memoized — D-50-3) | Before the reason loop |
| `server.js` `normalizeProjects(doc)` (in-place on a READ COPY) | lead ∈ members invariant | Copy Phase 52 posture: parse `ctx.ws.doc`, normalize, never write |
| `server.js` `fail(res, status, code, msg)` / `json(res, status, body)` | Error/success JSON | All exits through `fail()` before any data |
| `src/shell/layout.js` `lazy(imp, mk)` loader map `P` | Dynamic-import route registration | New `dashboard` route entry |
| `src/shell/skeletons.js` `skeleton()` | D-03 skeleton-then-fill | First-visit paint via the existing `fillPage()` contract |
| `src/pages/members.js` transparency expander (lines ~67-94) | Project+reason row markup | D-14 self-view rows; `KNOWN` codes list + `t('page.members.visReason.*')` labels |
| `src/pages/settings.js` section pattern | Settings tab/section hosting | D-11 self-view placement |
| `src/core/store.js` `isOver` (line 424): `t.due && t.status !== 'done' && diffD(parse(t.due), TODAY) < 0` | Overdue definition (client mirror) | Server must match this semantic exactly |
| Doc `data.activity` rows: `{ id, by, verb, task, project, at, extra }` (`store.js` pushActivity, line ~492) | Activity panel input | Server aggregates + filters by `at` window |

**Installation:** None — zero new dependencies (standing zero-dependency discipline; `web-push` is dep #2 by owner ruling, do not add a third).

**Version verification:** No new packages ⇒ no registry checks required this phase. (Existing deps pinned in `package.json`: `pg ^8.23.1`, `web-push 4.0.0`, `@office-kit/xlsx 0.26.1`.)

## Package Legitimacy Audit

No external packages are installed in this phase — the audit table is empty by construction. All work reuses in-repo modules and the existing devDependency set.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 Admin browser                          Member browser
      │                                       │
      │ GET /api/workspaces/:slug/dashboard   │ GET /api/workspaces/:slug/me/visibility
      │     (?activityWindow=7d)              │      (poll every 30 s while tab open)
      ▼                                       ▼
 ┌──────────────────────────── server.js ────────────────────────────┐
 │  requireWorkspace(slug, 'admin')          requireWorkspace(slug,  │
 │        │ 403 for member/viewer             'member')              │
 │        ▼                                        │                 │
 │  sameOrigin check                          sameOrigin check       │
 │        ▼                                        ▼                 │
 │  doc = JSON.parse(ctx.ws.doc)  ◄── RAW doc (power-admin:      │
 │  normalizeProjects(doc)          full private content)          │
 │        │                                        │                 │
 │  ┌─ pure reductions over doc.data ──┐   for p of doc.data.projects:│
 │  │ overdue: due<today && !done      │     memberCanReadProject   │
 │  │ load: open × assignees[] per mem │       (p, ws, MY member_id)│
 │  │ upcoming: today..+7d             │     projectAccessReason    │
 │  │ activity: data.activity by at    │       (p, my, teams)??     │
 │  └──────────────┬───────────────────┘       'member'              │
 │                 ▼                                   │             │
 │  { overdue, load, upcoming, activity }   [{id,name,reason[,teamName]}]
 └─────────┬───────────────────────────────────────────┬────────────┘
           ▼                                           ▼
   Dashboard lazy page                     Settings › My access section
   skeleton → fill → poll 30 s            flat project+reason rows
   (4 panels, deep links via              (reuses members.js expander
    /w/:slug/task/:key, /project/:key)     visual language)
```

### Recommended Project Structure
```
server.js                                  # +2 routes beside Phase 52 transparency route (~line 6139)
src/pages/dashboard.js                     # NEW lazy page: 4-panel aggregate view, poll lifecycle
src/pages/settings.js                      # +My access section (self-view)
src/shell/layout.js                        # +P.dashboard lazy loader entry
src/shell/render.js                        # +ROUTE_IDS 'dashboard', +ROUTE_ICONS entry, sidebar gate
src/core/api.js                            # +api.dashboard(slug, window) / api.myVisibility(slug) seams
src/locales/en.json, fr.json               # +dashboard.*, +settings.myAccess.* keys
test/dashboard.test.mjs                    # NEW: gates, aggregates, byte-shape
test/self-visibility.test.mjs             # NEW: TRN-01/02 shape + funnel parity on visibility fixture
e2e/dashboard.spec.mjs                     # NEW: route 403/200 + render smoke
```

### Pattern 1: The Phase 52 admin-gated route (the exact template)
**What:** requireWorkspace with minRole → sameOrigin → parse doc copy → normalizeProjects → funnel loop → json().
**When to use:** Both new endpoints copy this order; failure exits through `fail()` before any data is read.
**Example (verbatim shape from server.js lines 6105-6138):**
```js
// Source: server.js — Phase 52 transparency route
const wsMemberVisibilityMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/members\/([A-Za-z0-9_-]{1,64})\/visibility$/);
if (wsMemberVisibilityMatch && method === 'GET') {
  const ctx = await requireWorkspace(req, res, wsMemberVisibilityMatch[1], 'admin');
  if (!ctx) return;
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  // ...
  const doc = JSON.parse(ctx.ws.doc);
  normalizeProjects(doc);
  const memberTeams = await teamsOfMember(ctx.ws.id, targetMemberId, row);
  const projects = [];
  for (const p of doc?.data?.projects || []) {
    if (!p?.id) continue;
    if (!(await memberCanReadProject(p, ctx.ws.id, targetMemberId))) continue;
    const reason = projectAccessReason(p, targetMemberId, memberTeams) ?? 'member';
    const entry = { id: p.id, name: p.name || p.id, reason };
    if (reason === 'team') {
      const tid = memberTeams.find(t => Array.isArray(p.teams) && p.teams.includes(t));
      const tName = (Array.isArray(doc?.data?.teams) ? doc.data.teams : []).find(tm => tm?.id === tid)?.name;
      if (tName) entry.teamName = String(tName);
    }
    projects.push(entry);
  }
  return json(res, 200, { member: targetMemberId, projects });
}
```

### Pattern 2: Lazy page route (DELIV-02 chunk discipline)
**What:** new route = entry in `P` map via `lazy()`; first visit paints `skeleton()`, `fillPage()` swaps HTML; later renders synchronous from `f.mod`.
**When to use:** the dashboard page MUST NOT enter the entry chunk (500 kB gate, ~6.6 kB headroom as of Phase 57).
**Example (verbatim from src/shell/layout.js):**
```js
// Source: src/shell/layout.js
const lazy = (imp, mk) => {
  const f = () => imp().then(m => (f.mod = m[mk].bind(m))());
  f.lazy = true;
  return f;
};
const P = {
  // ...
  settings: lazy(() => import('../pages/settings.js'), 'pageSettings'),
  // + dashboard: lazy(() => import('../pages/dashboard.js'), 'pageDashboard'),
};
```

### Pattern 3: Client-side visibility expander rows (D-14 self-view markup)
**What:** flat rows of `pIcon + name + badge(label)`, labels via `KNOWN` codes list.
**Example (verbatim from src/pages/members.js lines 75-91, condensed):**
```js
// Source: src/pages/members.js
const KNOWN = ['everyone', 'lead', 'member', 'team'];
// per project entry:
const label = KNOWN.includes(p.reason)
  ? p.reason === 'team' && p.teamName
    ? t('page.members.visReasonTeam', { name: esc(p.teamName) })
    : t(`page.members.visReason.${p.reason}`)
  : esc(String(p.reason));
// row: pIcon(p,'',14) + esc(p.name || p.id) + <span class="badge">label</span>
```

### Anti-Patterns to Avoid
- **Deriving dashboard aggregates from the client redacted doc:** private projects vanish; the honest overview becomes a lie. Compute server-side over `ctx.ws.doc` (D-04).
- **Using `docForClient` in the dashboard route:** that is the redaction path; the export route's rule ("the ONLY document read this route may make — never ctx.ws.doc") is export-specific and is deliberately INVERTED here by the power-admin ruling. Do not copy export's doc source.
- **Second visibility predicate anywhere:** every read/label goes through `memberCanReadProject`/`projectAccessReason`; a bypass is a security regression (research SUMMARY convergent rule).
- **Memoizing `teamsOfMember` across members/requests** (D-50-3): resolve once per request per member.
- **Count-only leak thinking:** the power-admin ruling makes full content legal for admins on THIS endpoint only; the self-view still must not carry other members' ids/names/emails — and the dashboard endpoint must still 403 non-admins.
- **Client-side date windows:** dueDate comparisons and the 7-day window must be server-side (server TZ posture, one definition); the client's `isOver` stays the mirror for display only.
- **Entry-chunk imports in dashboard.js:** breaks the DELIV-02 gate (only ~6.6 kB headroom).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Visibility/reason logic | New predicate or per-endpoint visibility rules | `memberCanReadProject` + `projectAccessReason` + `teamsOfMember` | ONE funnel is the pinned security property (Phase 49/50 pins) |
| Test visibility matrix | Ad-hoc fixtures | `test/helpers/visibility-fixture.mjs` VISIBILITY_MODEL + actors/projects | Anti-tautology contract; hand-derived oracle already extends to team-perm cells |
| Server harness | Custom spawn logic | `test/helpers/server.mjs` startServer/login | Every route suite rides it |
| Route registration/skeleton/fill | Custom fetch-then-render | `lazy()` + `skeleton()` + `fillPage()` contract | Handles stale-fill seq guard, retry, focus restore |
| Overdue definition | New date math | Mirror `isOver` semantics: `due && status !== 'done' && diffD(parse(due), TODAY) < 0` | Consistency with every other overdue surface |
| Activity verbs rendering | New verb taxonomy | Existing `actCategory(a.verb)` classifier + Phase 9 render rules (`src/pages/activity.js`) | Machine verbs are already classified/localized at render |
| i18n keys audit | Manual grep | `scripts/i18n-scan.mjs` gate (prebuild) | Gate must stay 0 dead / 0 stale |

**Key insight:** this phase's difficulty is *shape discipline under test*, not algorithmic novelty — every hard part (funnel, reason codes, gates, harness, skeletons, i18n gate) already exists and is pinned by tests.

## Runtime State Inventory

Not a rename/refactor/migration phase — no stored-name changes. Inventoried anyway for the read-only additions:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None changed — both endpoints are read-only over the existing doc; no new tables/columns (Phase 34 guarded recipe not needed) | none |
| Live service config | None — no external services | none |
| OS-registered state | None | none |
| Secrets/env vars | None — no new keys (power-admin visibility is role-gated, not env-gated) | none |
| Build artifacts | New lazy chunk `dashboard.js` appears in dist/ — covered by existing `build-chunk-size.test.mjs` gate | verify chunk gate stays green |

## Common Pitfalls

### Pitfall 1: Leaking the self-view through other members' identity
**What goes wrong:** a naive "my grants" endpoint echoes per-person granter ids or team rosters.
**Why it happens:** the admin transparency route targets a member by id and returns `{member: targetMemberId, …}`; copying it verbatim without re-scoping leaks the *target* parameter surface and invites "who granted me this" features.
**How to avoid:** self-view response shape = `{ projects: [{id, name, reason[, teamName]}] }` — no member ids at all, no `members`/`access` arrays. TRN-02 byte-level tests assert `JSON.stringify(payload)` contains no other actor's id/name/email (use the visibility-fixture actors' known ids/emails as needles).
**Warning signs:** any `p.members`, `p.perms`, granter id, or user id in the response bytes.

### Pitfall 2: Dashboard aggregates derived from the redacted doc
**What goes wrong:** overdue/load computed client-side over `docForClient` output — private projects silently vanish; the "honest overview" undercounts.
**How to avoid:** single endpoint computes over the raw doc inside the admin gate (D-04); payload carries exactly what the four panels render plus their deep-link keys.
**Warning signs:** any `docForClient` call in the dashboard route.

### Pitfall 3: Admin 403 gate on the wrong path or wrong order
**What goes wrong:** gate after body read, or role check in the client only; a member fetches `/dashboard` and gets 200/404 instead of 403.
**How to avoid:** copy the Phase 52 route header verbatim: regex match on pathname → `requireWorkspace(req, res, slug, 'admin')` → `if (!ctx) return` → `sameOrigin`. requireWorkspace already fails with the ROLE_RANK ladder (line 219; admin ≥ 3 passes 'admin').
**Warning signs:** tests assert exact 403 status for member/viewer roles (not 404, not redirect).

### Pitfall 4: Poll lifecycle leaks
**What goes wrong:** `setInterval` on mount without cleanup — polling continues after leaving the route (wasted 30 s fetches, stale-payload clobbering other views).
**How to avoid:** start timer after first fill, `clearInterval` on route change; the SPA route change path (`go()` in render.js) is where cleanup hooks; follow Phase 58's signal-passthrough lesson (`api.call()` gained a `signal` param — abort the in-flight dashboard fetch on re-poll).
**Warning signs:** network tab shows dashboard fetches after navigating away.

### Pitfall 5: Chunk gate regression
**What goes wrong:** importing dashboard helpers (or re-exporting store/i18n transitively) from an entry-resident module pushes index over 500 kB.
**How to avoid:** dashboard page is a `lazy()` route; any new shared helper goes into an already-lazy module or the page module itself; run `npm run build` + `node --test test/build-chunk-size.test.mjs` in the wave.
**Warning signs:** index chunk within a few hundred bytes of 500 000 B.

### Pitfall 6: Timezone drift in the overdue/upcoming windows
**What goes wrong:** server "today" vs the workspace's displayed dates disagree at midnight boundaries; tasks flicker between overdue/upcoming.
**How to avoid:** compute windows server-side with the same date semantics the rest of the server uses (TODAY/diffD mirror on the server; check how due-reminders pick "today" — `test/due-reminders.test.mjs` pins that behavior); the client renders dates verbatim from the payload.
**Warning signs:** dashboard and My Tasks disagree on the same task.

### Pitfall 7: Anti-tautology tests
**What goes wrong:** self-view tests derive expectations by calling `memberCanReadProject` — proving the code agrees with itself.
**How to avoid:** follow `test/transparency.test.mjs`: expectations from the hand-derived `VISIBILITY_MODEL` oracle in `test/helpers/visibility-fixture.mjs`, plus the complement of the redacted doc-GET hidden set.
**Warning signs:** test file imports from `server.js`.

## Code Examples

### Overdue + load + upcoming reduction (server-side, over the raw doc)
```js
// Source: semantics mirror src/core/store.js isOver (line 424) — server side has its own date helpers
// overdue: t.due && t.status !== 'done' && dueDate(t.due) < today
// load (D-07): for each open task, for each id in t.assignees[] → counts[id] += 1
// upcoming (D-06): today <= dueDate <= today+7 && status !== 'done'
// assignees[] is the v2.1 normalized array (scalar assignee migrated away;
// see test/assignees-migration.test.mjs — read ONLY the array, never the scalar)
```

### Activity window filter (D-06)
```js
// Source: doc data.activity row shape — src/core/store.js pushActivity (line ~492):
// { id, by, verb, task, project, at, extra }
// server: rows.filter(a => a.at >= sinceMs) with sinceMs from ?activityWindow= (24h|7d|30d, default 7d)
// whitelist the param — reject other values (fail 400) or coerce to default, never pass through raw
// render verbs/dates client-side with actCategory + Phase 9 rules; deep-link via a.task/a.project ids
```

### Self-view endpoint sketch (caller-scoped Phase 52 clone)
```js
// Source: composed from server.js 6105-6138 — the ONLY changes: minRole 'member',
// targetMemberId = ctx.membership.member_id, response omits the member echo entirely
const ctx = await requireWorkspace(req, res, slug, 'member');
if (!ctx) return;
if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
const doc = JSON.parse(ctx.ws.doc);
normalizeProjects(doc);
const myId = ctx.membership.member_id;
const memberTeams = await teamsOfMember(ctx.ws.id, myId, ctx.membership);
const projects = [];
for (const p of doc?.data?.projects || []) {
  if (!p?.id) continue;
  if (!(await memberCanReadProject(p, ctx.ws.id, myId))) continue;
  const reason = projectAccessReason(p, myId, memberTeams) ?? 'member';
  const entry = { id: p.id, name: p.name || p.id, reason };
  if (reason === 'team') { /* same single-teamName block as Phase 52 */ }
  projects.push(entry);
}
return json(res, 200, { projects }); // TRN-02: nothing else in the payload
```

### Poll skeleton (D-05, client)
```js
// Source: api.call() gained a signal passthrough in Phase 58 (58-03) — use it
let timer, inflight;
async function refresh() {
  inflight?.abort();
  inflight = new AbortController();
  const data = await api.dashboard(slug, { activityWindow, signal: inflight.signal });
  /* swap panel HTML */
}
refresh();
timer = setInterval(refresh, 30000); // align with the 30 s notification poll rhythm (D-05)
// cleanup on route change: clearInterval(timer); inflight?.abort();
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-surface visibility predicates | ONE funnel `memberCanReadProject` + label helper `projectAccessReason` | Phase 49/50/52 (2026-11-07..08) | Both endpoints compose existing helpers; any new predicate is a pin violation |
| Scalar `task.assignee` | `assignees[]` array invariant (dedupe, cap 5) | v2.1 | D-07 counts read the array only; test/assignees-guard pins writes |
| Entry-chunk monolith pages | `lazy()` dynamic-import routes + chunk gate | Phase 56/57 | Dashboard page must be lazy; ~6.6 kB entry headroom |
| `api.call` fixed signature | `signal` passthrough supported | Phase 58 (58-03) | Poll abort mechanics free |

**Deprecated/outdated:** Phase 29 scope terms and grant materialization (retired D-49) — do not reference `p.access` legacy strings; `projectIsPrivate` reads the boolean only.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Route names `/api/workspaces/:slug/dashboard` and `/api/workspaces/:slug/me/visibility` — explicitly discretionary (D-04/D-11); planner may adjust within the locked route styles | Architecture Patterns | Cosmetic — rename cost only |
| A2 | Server has TODAY/dueDate helpers equivalent to client `diffD/parse/TODAY` — pinned by due-reminders tests, but exact server function names not read this session; executor greps server.js for the existing date helpers | Code Examples | Task needs a grep step; low risk |
| A3 | `pushActivity` row shape `{ id, by, verb, task, project, at, extra }` read from store.js ~492 — assumed stable across the server-written activity rows too (server may write rows in the same shape); executor verifies one server-side activity write site before filtering | Code Examples | Activity panel filter key mismatch — caught by first test run |
| A4 | `api.call()` accepts `{ signal }` via the Phase 58 passthrough — recorded in STATE.md/58-03 decisions; exact parameter position (options object) to be confirmed at implementation | Code Examples | Poll abort no-op; harmless |

## Open Questions

1. **Server-side "today" definition for overdue/upcoming** — due-reminders already made this decision somewhere in server.js; the executor should reuse that exact helper/anchor (midnight UTC vs server-local). Recommendation: mirror the reminder pass; if ambiguous, plan a 5-min probe task reading the reminder site before writing the reducer.

## Environment Availability

Step 2.6 audit — phase is code/config-only on an existing stack; probes performed:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | server + tests | ✓ | engines `>=24` (package.json); Phase 58 noted ≥22.16 needed for FTS5 — irrelevant here | — |
| npm test runner (`node --test`) | Unit/shape tests | ✓ | script `test` (concurrency 2) | — |
| Playwright | e2e spec | ✓ | ^1.64.1 devDep | — |
| ESLint / Prettier | lint gate | ✓ | ^9.39.5 / ^3.9.9 | — |
| i18n scan gate | New catalogue keys | ✓ | `scripts/i18n-scan.mjs` (prebuild hook) | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** none

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in, Node ≥24) + `@playwright/test` ^1.64.1 for e2e |
| Config file | none for node:test (`test/*.test.mjs` glob, concurrency 2); `e2e/playwright.config.mjs` |
| Quick run command | `node --test test/dashboard.test.mjs test/self-visibility.test.mjs` |
| Full suite command | `npm test` (1489 tests baseline, Phase 59 close) then `npm run e2e` (111 specs baseline) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | Overdue grouped per project, oldest-first | unit (spawned server, seeded doc) | `node --test test/dashboard.test.mjs` | ❌ Wave 0 |
| DASH-02 | Load counts assignees[] per member; done excluded | unit | `node --test test/dashboard.test.mjs` | ❌ Wave 0 |
| DASH-03 | Upcoming 7d window + activity window presets (24h/7d/30d) | unit | `node --test test/dashboard.test.mjs` | ❌ Wave 0 |
| DASH-04 | member/viewer → exact 403; owner/admin → 200; payload carries private-project titles (power-admin proof) | unit + byte-level assertions | `node --test test/dashboard.test.mjs` | ❌ Wave 0 |
| TRN-01 | Self-view = funnel list for the caller, reason codes + teamName | unit on visibility fixture (VISIBILITY_MODEL oracle parity) | `node --test test/self-visibility.test.mjs` | ❌ Wave 0 |
| TRN-02 | Byte-level: no other actor id/name/email in response bytes; entry shape exactly `{id,name,reason[,teamName]}` | unit (stringified-payload needle scan over all fixture actors) | `node --test test/self-visibility.test.mjs` | ❌ Wave 0 |
| (cross) | Dashboard route lazy (chunk gate), i18n keys EN+FR | unit (existing gates) | `npm run build && node --test test/build-chunk-size.test.mjs test/i18n-pages.test.mjs` | ✅ existing |
| (cross) | e2e: admin sees dashboard, member blocked; deep links open drawer | e2e | `npx playwright test --config e2e/playwright.config.mjs e2e/dashboard.spec.mjs` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** quick run of the new suites touched (`node --test test/dashboard.test.mjs test/self-visibility.test.mjs`)
- **Per wave merge:** `npm test` + `npm run lint` + `npm run i18n:scan`
- **Phase gate:** full `npm test` green (0 fail), lint clean, i18n 0 dead/0 stale, `npm run e2e` 111+ green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/dashboard.test.mjs` — covers DASH-01..04 (gate order first: 403 matrix before aggregates)
- [ ] `test/self-visibility.test.mjs` — covers TRN-01/02 (reuse `test/helpers/visibility-fixture.mjs` + `test/helpers/server.mjs`)
- [ ] `e2e/dashboard.spec.mjs` — route render + 403 UX + deep-link smoke
- [ ] Framework install: none needed

## Security Domain

### Applicable ASVS Categories (L1, block on high)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (session auth already enforced by requireWorkspace) | existing session middleware |
| V3 Session Management | no | existing |
| V4 Access Control | **yes — the core of this phase** | `requireWorkspace(slug, 'admin')` for dashboard (403 members/viewers); `requireWorkspace(slug, 'member')` for self-view; ROLE_RANK ladder (server.js:219) |
| V5 Input Validation | yes | `activityWindow` param whitelisted to `24h|7d|30d` server-side (default 7d); slug/pathname via the existing regex shapes `([a-z0-9-]{2,40})` |
| V6 Cryptography | no | n/a |
| V14 Information Disclosure | **yes** | TRN-02 byte-level shape tests; Phase 52 entry-shape assertion pattern (`Object.keys(p)` deepEqual); `fail()` keyed bodies, no existence oracles (T-52-01 style) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Private-project content leak via aggregate | Information Disclosure | Dashboard computes server-side inside the 'admin' gate only; non-admin requests die at requireWorkspace before any doc parse; self-view restricted to caller's own funnel results |
| Cross-member identity leak in self-view | Information Disclosure | Response = `{projects:[{id,name,reason[,teamName]}]}` — no member echo, no granter ids; byte-level needle tests with fixture actors' ids/emails |
| Existence oracle on unknown ids | Information Disclosure | Follow T-52-01: unknown/absent share one keyed neutral 404 (self-view has no target param — the risk lands on the dashboard route only, which has no ids either) |
| Cross-origin fetch abuse | Elevation/Tampering | `sameOrigin(req)` check copied in route order (Phase 52 pattern) |
| Client-side gating trusted as security | Elevation of Privilege | D-52-4: nav hiding is UX; the 403 test is the acceptance proof |
| Tautological permission tests | (test-level) Information Disclosure | Anti-tautology contract: expectations from hand-derived VISIBILITY_MODEL, never from the production predicate |

### Threat-model note for the planner
The power-admin ruling is a deliberate, scoped exception: full private content is legal **only** inside the admin-gated dashboard endpoint. Everything else this phase (self-view) tightens rather than loosens. The security review for this phase is: (1) 403 matrix exact per role, (2) dashboard route never calls `docForClient`, (3) self-view byte-shape, (4) param whitelist on `activityWindow`.

## Sources

### Primary (HIGH confidence — read this session)
- `server.js` lines 936-996 — `canSeeProject`, `memberCanReadProject`, `projectAccessReason` (verbatim codes quoted above)
- `server.js` lines 6095-6139 — Phase 52 transparency route (gate order, funnel loop, teamName block, response shape)
- `server.js` line 219 — `ROLE_RANK = { viewer: 1, member: 2, admin: 3, owner: 4 }`; line 4010 — `requireWorkspace`
- `server.js` lines 6151-6190 — export route's `docForClient`-only rule (the deliberate inversion target for DASH-04)
- `src/shell/layout.js` lines 1-120 — `lazy()` loader, `P` map, `fillPage()` async contract
- `src/shell/render.js` lines 21-63, 116-136 — `ROUTE_IDS`, `ROUTE_ICONS` ('overview': 'layout-dashboard'), `urlForView` task drawer path `/w/:slug/task/:key`
- `src/pages/members.js` lines 67-94 — transparency expander row markup + KNOWN codes + i18n label keys
- `src/core/store.js` line 424 — `isOver` overdue definition; line ~492 — activity row shape
- `test/transparency.test.mjs` + `test/helpers/visibility-fixture.mjs` — anti-tautology oracle, entry-shape assertion, gate tests
- `test/helpers/server.mjs` — spawned-server harness
- `package.json` — scripts (`test`, `e2e`, `i18n:scan`, `lint`), engines ≥24, dependency pins

### Secondary (MEDIUM confidence)
- `.planning/phases/60-admin-dashboard-member-self-view/60-CONTEXT.md` — all locked decisions (D-01..D-14)
- `.planning/STATE.md` — chunk headroom figures, poll rhythm, Phase 58 signal passthrough
- `.planning/research/{SUMMARY,PITFALLS,FEATURES}.md` — convergent funnel rules, dashboard pitfall framing

### Tertiary (LOW confidence)
- None — no web sources needed; everything is in-repo.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every module read in-repo this session; zero new packages
- Architecture: HIGH — both endpoints are literal clones/adaptations of pinned Phase 52 patterns with tests to copy
- Pitfalls: HIGH — sourced from project PITFALLS.md plus source-verified gate/shape facts; A2-A4 flagged for executor grep-verification

**Research date:** 2026-11-13
**Valid until:** 2026-12-13 (in-repo patterns; re-check chunk headroom number at planning time)
