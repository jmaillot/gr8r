---
status: resolved
trigger: "rendering doesnt work either in chrome or firefox (firefox says Firefox ne peut pas ouvrir cette page / chrome says refused to connect.)"
created: 2026-10-25T00:00:00Z
updated: 2026-10-25T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — the preview modal iframe src /w/:slug/file/:id is routed to the SPA fallback (not serveFileBinary) because browsers send `Accept: text/html` on iframe navigation requests; the SPA index.html carries X-Frame-Options: DENY + CSP frame-ancestors 'none', so both browsers refuse to frame it.
test: code trace of server.js request routing + header sets; matched symptoms (Chrome "refused to connect" = XFO DENY; Firefox error page = frame-ancestors 'none').
expecting: n/a — root cause confirmed by direct code reading; mechanism fully explains both browsers' messages.
next_action: return ROOT CAUSE FOUND to plan-phase --gaps (diagnose-only mode).

## Symptoms

expected: multi-page PDF renders inside iframe embed in preview modal
actual: Chrome "refused to connect", Firefox « Firefox ne peut pas ouvrir cette page » in the preview modal
errors: browser framing-refusal error pages (no server error)
reproduction: UAT Test 1 — upload a PDF, open preview modal
started: discovered during UAT of Phase 12

## Eliminated

- hypothesis: serveFileBinary sends X-Frame-Options DENY on the PDF bytes
  evidence: serveFileBinary (server.js:1932-1973) uses its own header set, no XFO; inline types get CSP frame-ancestors 'self'. Header policy is correct.
- hypothesis: iframe src is wrong (absolute URL / APP_URL / wrong scheme-host-port)
  evidence: modals.js:304 builds a relative src `/w/${D().ws.url}/file/${f.id}`; id regex matches. Unreachable-host would give different errors consistently per environment, not framing refusals.
- hypothesis: Traefik injects framing-blocking headers
  evidence: the refusing response is index.html served by the app itself; header set traced in securityHeaders(). No need to implicate Traefik.

## Evidence

- checked: server.js:1990-2001 request routing for /w/:slug/file/:id
  found: `if (/text\/html/.test(req.headers.accept || '')) serveStatic(...) else serveFileBinary(...)`
  implication: any request whose Accept header contains text/html gets the SPA, never the bytes.
- checked: what Accept browsers send on iframe navigations
  found: iframe navigations are navigation requests; browsers send `Accept: text/html,application/xhtml+xml,...` exactly like top-level navigations.
  implication: the iframe request hits the SPA branch, so the PDF bytes are never served to the iframe.
- checked: serveStatic → sendFile → securityHeaders (server.js:1753-1764, 1772-1804)
  found: index.html response carries `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`.
  implication: the browser refuses to render that document inside the iframe — Chrome: "refused to connect"; Firefox: "ne peut pas ouvrir cette page". Matches symptoms exactly.
- checked: D-13 comment (server.js:1993-1995)
  found: the SPA-on-Accept:text/html branch was added so top-level deep-link navigation bootstraps the SPA (applyDeepLink opens the modal). The design conflates top-level navigation with iframe navigation, which share the same Accept header.
  implication: root cause is an under-discriminated routing heuristic, not a header policy or URL bug.

## Resolution

root_cause: The /w/:slug/file/:id route distinguishes "deep-link navigation" from "byte request" solely by whether the Accept header contains text/html. Iframe navigations also send Accept: text/html, so the preview modal's iframe request is served the SPA index.html (with X-Frame-Options: DENY and CSP frame-ancestors 'none') instead of the PDF bytes. Both browsers therefore refuse to frame the response — Chrome "refused to connect", Firefox « ne peut pas ouvrir cette page ». The PDF bytes are never sent to the iframe.
fix: (for planning) discriminate navigation vs byte request without relying on Accept alone — e.g. Sec-Fetch-Dest: iframe/frame ⇒ serve bytes; Sec-Fetch-Dest: document ⇒ SPA bootstrap; fallback for old browsers via a query param (e.g. ?raw=1) appended to the iframe src. The iframe src itself needs no change if Sec-Fetch-Dest routing is used.
verification: diagnosed — not yet fixed (find_root_cause_only)
files_changed: []
oracle_type: specified

## Close-out (2026-10-25)

FIXED — the route is byte-only since the 12-05 revision (plan 12-05, T-12-13 extension in
plan 12-07): `/w/:slug/file/:id` calls serveFileBinary unconditionally; the unauthenticated
Sec-Fetch-Dest: document / no-metadata case 302-redirects to `/login?next=<path>` instead of
serving the SPA. Verified in server.js request routing (2026-10-25, milestone close-out).
