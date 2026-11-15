---
phase: "67"
slug: "project-webhooks"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-15"
---

# Phase 67 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| browser → /api/workspaces/:slug/projects/:pid/webhooks… | slug, project id, hook id, method and body are all untrusted inputs; canManageProject gates every route | role + project id + body in; hook-view projections + coarse `webhookError` codes out |
| server → hook URL | the hook URL is a user-supplied https endpoint the server calls outbound — a classic SSRF door | webhook envelope (D-01 whitelist fields only) out; HTTP status/Retry-After in |
| Entra ID → users.oid | the oid claim rides the OIDC token; persisted server-side for D-14 mention resolution | oid claim in; never serialized to any client response |
| envelope builders → Teams payload | the envelope is the last gate before a payload leaves the server | whitelisted fields only; no enriched project/account data |
| server responses → webhooks-settings.js renderer | hook-view fields (url host, event counts, health) are rendered as HTML in the modal | `esc()` before interpolation; secret only in the create-success dialog |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-67-01 | Information Disclosure / Elevation | webhook-ssrf.js + delivery engine — hook URL as SSRF door | high | mitigate | `ssrfOk()` enforces https-only (webhook-ssrf.js:42) and resolves every address via `dns.lookup(hostname, {all:true})` (:46) deny-listing loopback/RFC1918/169.254/0 + IPv6 ::1/fe80::/10/fc00::/7 (:27-33, one denied IP blocks the URL :64-66); lookup errors and empty resolution fail closed (:48-51, :57-59); re-checked EVERY attempt before fetch (server.js:2726), fetch carries `redirect: 'error'` (server.js:2748) so a redirect can never point inward | closed |
| T-67-02 | Repudiation | delivery engine — duplicate/lost deliveries | high | mitigate | exactly-once claim: the UNIQUE `dedup_key` IS the claim, `insert or ignore into webhook_deliveries` commits INSIDE the tx that produced the event (server.js:493-500, :2536); the attempt is claimed with a GUARDED update before the fetch — `update … set attempt = attempt + 1 where attempt = ? and status in ('pending','failed')` (server.js:2715) — and 'delivered' is written only after a 2xx (server.js:2756); never mark-then-send | closed |
| T-67-03 | Information Disclosure | logging paths — bearer/signing secret leakage | medium | mitigate | log sites carry hook id + delivery id + status code + host only (server.js:6220 `… host ${new URL(f.url).host}`, :6247, :2768-2780 warn lines); no log site ever prints the URL query or the secret column; the secret is never interpolated into a log string (grep-verified across the 67 log sites) | closed |
| T-67-04 | DoS | doc-PUT path — outbound deliveries blocking the request | high | mitigate | enqueue is strictly post-commit fire-and-forget (server.js:2499-2504 — the enqueue tx commits inside the producing tx, the engine drains asynchronously); every outbound fetch carries `AbortSignal.timeout(10_000)` (server.js:2749) | closed |
| T-67-05 | Information Disclosure | envelope builders — over-broad payloads | medium | mitigate | D-01 code-defined per-event field whitelist `EVENT_FIELDS` (src/core/webhook-events.js:51-62); `buildEnvelope` is the single field gate copying ONLY whitelisted fields (src/core/webhook-events.js:66-83) — no enriched project/account data can enter a payload; unknown events build nothing | closed |
| T-67-06 | Information Disclosure | users.oid — Entra object id reaching clients | medium | mitigate | server-only column (server.js:254, :615), single write site from the verified oidc callback claim (server.js:4996-4997); read only by the server-side mention resolver feeding the Teams formatter (server.js:2604 → :2615) — no /api route serializes users.oid to a client | closed |
| T-67-07 | Elevation of Privilege | CRUD routes — non-manager mutation | high | mitigate | `requireWorkspace(req, res, slug, 'viewer')` authenticates, then `canManageProject(project, member_id, role)` gates EVERY route before any logic — list/create (server.js:6189-6191), patch/delete (:6236-6238), test (:6271-6273) — returning 403 `webhookError`; pinned by e2e (`e2e/webhooks.spec.mjs:295` member blocked, direct POST 403); client gating is UX only | closed |
| T-67-08 | Information Disclosure | create response / list / logs — the signing secret | high | mitigate | the projection IS the secret gate: `webhookHookView` builds from named columns explicitly, never spreads the row (server.js:2862-2878); the raw secret rides ONLY the POST create response (server.js:6221-6223 `{ hook, secret }`); GET list, PATCH and DELETE responses carry no secret field; no route reads the secret column back | closed |
| T-67-09 | Tampering | request body → hook row (mass assignment) | medium | mitigate | `webhookValidateBody` reads ONLY url/format/events/status (server.js:2903-2927); workspace_id, project_id and created_by come from the authenticated ctx (server.js:6206-6215), never the body; status flips only through the validated `active`/`disabled` enum | closed |
| T-67-10 | DoS | send-test endpoint — bypass pipeline / abuse | medium | mitigate | same canManageProject gate as every mutating route (server.js:6271-6273); the test rides the IDENTICAL guarded pipeline as real events — `deliverWebhook` re-checks ssrfOk per attempt and the fetch carries the same 10 s timeout (server.js:6308-6317, comment at :6305-6307: "No bypass path exists"); non-active hooks are refused 409 before enqueue (:6278) | closed |
| T-67-11 | Elevation of Privilege | Webhooks tab render — client-side gating as false control | medium | mitigate | render-time `canManageProject(p)` re-check in the lazy module returns a dead body for non-managers (src/overlays/webhooks-settings.js:136, whSave re-check :192); the tab itself is spread only for managers (src/overlays/modals.js:364, `canManageProject` at src/core/store.js:424); the server-first 67-03 gates (T-67-07) remain the actual control — proven by e2e (`e2e/webhooks.spec.mjs:272`: no tab rendered + direct POST still 403) | closed |
| T-67-12 | Information Disclosure | secret dialog / DOM — the shown-once secret persisting | high | mitigate | the dialog renders ONLY in the create-success path (src/overlays/webhooks-settings.js:141-142, secret set from the POST response :204); dismissal nulls the state so no re-render can bring it back (:250-253) and NO fetch path re-reads a secret (T-67-08: no route returns one); e2e asserts absence from the DOM after dismissal AND after a full page reload (`e2e/webhooks.spec.mjs:124`) | closed |
| T-67-13 | Tampering | i18n/UI labels — user-controlled HTML in the section | low | accept | labels are static catalogue/label-table keys under the EN↔FR parity gate (test/build-locales.test.mjs); the only dynamic strings (`hostOf(h.url)`, the secret, event counts) pass `esc()` before interpolation (src/overlays/webhooks-settings.js:116, :130); t() output is catalogue-controlled — no user-controlled HTML exists (documented risk, disposition accept) | closed |
| T-67-SC | Tampering | npm/pip/cargo installs | high | mitigate | stdlib-only phase: zero new runtime dependencies (package.json still `pg`, `@office-kit/xlsx`, `web-push` at their exact pins); `test/dependencies.test.mjs` stays green in the full `npm test` run executed for 67-04 (1687 tests, 1674 pass, 0 fail) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk | Threat | Rationale |
|------|--------|-----------|
| Static label keys in the settings section carry no additional escaping layer | T-67-13 | All label text is code-controlled (catalogue + label table, parity-gated); every dynamic value is esc()d; the residual risk is nil at ASVS L1 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-15 | 14 | 13 closed + 1 accepted | 0 | gsd executor (67-04 Task 3 — register consolidated from the 67-01/02/03/04 threat models, every mitigation site re-verified against the live tree) |

**Unregistered flags:** none — no `## Threat Flags` section in any 67 SUMMARY (no attack surface beyond the registered routes/UI).

**Audit notes (informational, non-blocking):**
- The T-67-01 deny-list is the coarse internal-range guard the house rule requires at ASVS L1; the delivery engine re-resolves DNS every attempt, so rebinding between resolution and fetch is covered by the same re-check.
- The test-send route's `x-webhook-token` gate (server.js:6303) is an operator-only e2e seam (fetch/lookup/now injection) — it does not bypass the SSRF guard; the injection replaces the fetch/lookup implementations, and without the env token set the route always runs the real pipeline.
- Cross-origin protection rides the shared `sameOrigin(req)` check on every webhook route (server.js:6185, :6232, :6268).

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-15
