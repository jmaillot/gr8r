---
status: resolved (fix shipped in 23-05 / 23-06, verified 2026-10-31)
trigger: "G-23-4: On production, F5 on /w/prod/team gives a 404; the URL doesn't map into the team view. Task deep links /w/:slug/task/:key reportedly work."
created: 2026-10-31T10:45:00Z
updated: 2026-10-31T11:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — the SPA-side 404 is a client route gap: the team URL is written without the team id, so on reload the team view cannot be restored and `pageTeam()` renders `page404()`.
test: Code trace + local run (node server.js; curl /w/:slug/team → 200 index.html, so the HTTP SPA fallback is NOT the gap).
expecting: —
next_action: Fix direction below; implement + verify with e2e reload test.

## Symptoms

expected: F5 or direct load of /w/:slug/team renders the team view
actual: page404 rendered (SPA-rendered 404 glyph, not an HTTP 404 — server returns 200 + index.html)
errors: none (client-side)
reproduction: sign in, open a team (URL becomes /w/:slug/team), press F5
started: production (deployed build); task deep links work

## Eliminated

- hypothesis: server.js SPA fallback doesn't cover /w/:slug/team
  evidence: server.js:2661-2667 serves index.html for any extensionless path (`!path.extname(rel)`); verified live — `curl http://127.0.0.1:8099/w/test/team` → 200 with index.html. Fallback present since 48d00ad and in all tags v1.1.0…v1.4.
- hypothesis: client router doesn't recognize 'team' segment
  evidence: applyDeepLink (src/main.js:177) falls through to `ROUTE_IDS.includes(seg)` → go('team'); 'team' is in ROUTE_IDS (src/shell/render.js:36). Router DOES resolve the route — but with no params.
- hypothesis: HTTP-layer (vercel.json / Dockerfile / docker-entrypoint.sh) differs from server.js
  evidence: vercel.json has no rewrites (irrelevant — prod is Docker+Traefik per DEPLOY.md); Docker runs `node server.js` verbatim; entrypoint has no routing.
- hypothesis: proxy layer (Cloudflare/Authentik) returns the 404
  evidence: unauthenticated curl to prod /w/prod/team returns 302→authentik (same as /w/prod/), no 404 at proxy for this path; and the user's report ("falls back to the root"-style 404 glyph) matches the SPA's page404.

## Evidence

- checked: server.js serveStatic (2633-2668); found extensionless SPA fallback covering /w/:slug/team; implication: HTTP 200, gap is client-side.
- checked: src/main.js applyDeepLink (127-177); found `go(seg, {})` for plain routes — no params resolved for 'team'; implication: boot lands on team route with id=undefined.
- checked: src/pages/members.js pageTeam (113-115); found `const tm = team(S.ui.params.id); if (!tm) return page404();` — team(undefined) is null → **page404 rendered**. This is the user-visible 404.
- checked: src/shell/render.js urlForView (109-127); found team branch missing: project uses /project/:key, member uses /member/:id, but team falls to the generic `/w/:slug/team` with **no id**; implication: the app itself pushes an un-restorable address.
- checked: local run `PORT=8099 node server.js`; curl /w/test/team → 200 index.html; /w/test/task/foo → 200.

## Resolution

root_cause: The team view's URL is lossy — `urlForView()` (src/shell/render.js:109-127) writes `/w/:slug/team` with no team id, and `applyDeepLink()` (src/main.js:177) calls `go('team', {})` without params. On reload `pageTeam()` (src/pages/members.js:113-115) does `team(S.ui.params.id)` → undefined → renders `page404()`. Task/member/project deep links work because their URLs carry the key/id; the team URL is the only parameterized view written without it.
fix: (1) in `urlForView()`, when route==='team' && params.id, write `/w/:slug/team/:id`; (2) in `applyDeepLink()` (and the popstate path, which already shares it), resolve seg==='team' with key via the members list (`members.find(m => m.id === key)` → `go('team', { id: key })`, else workspace fallback like the member branch); optionally keep `/w/:slug/team` (no id) rendering the first team or the teams list instead of page404 for older bookmarks. Mirror the member-branch pattern exactly.
verification: not yet — needs e2e: load /w/:slug/team/:id directly → team view; F5 after in-app team nav → same view; unknown id → no-leak fallback.
files_changed: []
